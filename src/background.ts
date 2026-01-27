import { geminiService } from "~/api/services";

export {};

console.log("[BACKGROUND] Background service worker loaded");

chrome.runtime.onInstalled.addListener(() => {
  console.log("[BACKGROUND] Manga Translator extension installed");
});

class RequestQueue {
  private queue: Array<() => Promise<any>> = [];
  private processing = false;
  private concurrent = 2;
  private active = 0;

  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.process();
    });
  }

  private async process() {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0 && this.active < this.concurrent) {
      const task = this.queue.shift();
      if (task) {
        this.active++;
        task().finally(() => {
          this.active--;
          this.process();
        });
      }
    }

    this.processing = false;
  }
}

const requestQueue = new RequestQueue();

class TranslationCache {
  private readonly CACHE_KEY_PREFIX = "manga_translation_";

  async get(imageHash: string, targetLang: string): Promise<any | null> {
    const key = `${this.CACHE_KEY_PREFIX}${imageHash}_${targetLang}`;
    const result = await chrome.storage.local.get(key);
    return result[key]?.data || null;
  }

  async set(imageHash: string, targetLang: string, data: any): Promise<void> {
    const key = `${this.CACHE_KEY_PREFIX}${imageHash}_${targetLang}`;
    await chrome.storage.local.set({
      [key]: { data, timestamp: Date.now() },
    });
  }

  static hashImage(dataUrl: string): string {
    const start = dataUrl.substring(0, 100);
    const end = dataUrl.substring(dataUrl.length - 100);
    return btoa(start + dataUrl.length + end).substring(0, 32);
  }
}

const cache = new TranslationCache();

async function initializeServices() {
  console.log("[BACKGROUND] Initializing services...");

  const result = await chrome.storage.local.get("gemini_api_key");
  let apiKey = result.gemini_api_key;

  console.log(
    "[BACKGROUND] API key from storage:",
    apiKey ? "Found" : "Not found",
  );
  console.log(
    "[BACKGROUND] API key from env:",
    process.env.PLASMO_PUBLIC_GEMINI_API_KEY ? "Found" : "Not found",
  );

  if (!apiKey) {
    apiKey = process.env.PLASMO_PUBLIC_GEMINI_API_KEY;
    if (apiKey) {
      await chrome.storage.local.set({ gemini_api_key: apiKey });
      console.log("[BACKGROUND] Saved API key to storage");
    } else {
      apiKey = "AIzaSyAX2rZm4I5BuXk6FCsMXA7od5godAm1TJQ";
      await chrome.storage.local.set({ gemini_api_key: apiKey });
      console.log("[BACKGROUND] Using hardcoded API key as fallback");
    }
  }

  if (apiKey) {
    geminiService.initialize(apiKey);
    console.log("[BACKGROUND] Gemini service initialized successfully");
  } else {
    console.error("[BACKGROUND] CRITICAL: No Gemini API key available");
  }
}

initializeServices();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("[BACKGROUND] Message received:", request.action);

  if (request.action === "FETCH_IMAGE") {
    console.log("[BACKGROUND] Fetching CORS image:", request.url);

    fetch(request.url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.blob();
      })
      .then((blob) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          console.log("[BACKGROUND] FETCH_IMAGE successful");
          sendResponse({ dataUrl: reader.result });
        };
        reader.onerror = (error) => {
          console.error("[BACKGROUND] FileReader error:", error);
          sendResponse({ error: "Failed to read image blob" });
        };
        reader.readAsDataURL(blob);
      })
      .catch((error) => {
        console.error("[BACKGROUND] Fetch error:", error);
        sendResponse({ error: error.message });
      });

    return true;
  }

  if (request.action === "PROCESS_IMAGES") {
    console.log("[BACKGROUND] Processing images:", request.images.length);

    handleProcessImages(request, sender.tab?.id)
      .then(sendResponse)
      .catch((error) => {
        console.error("[BACKGROUND] Process images error:", error);

        if (sender.tab?.id) {
          chrome.tabs
            .sendMessage(sender.tab.id, {
              action: "ERROR",
              error: error.message || "Translation failed",
            })
            .catch((err) =>
              console.error("[BACKGROUND] Failed to send error to tab:", err),
            );
        }

        sendResponse({ success: false, error: error.message });
      });

    return true;
  }

  if (request.action === "translate") {
    handleTranslation(request.text, request.targetLang)
      .then((result) => sendResponse({ success: true, translation: result }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

async function handleTranslation(
  text: string,
  _targetLang: string = "en",
): Promise<string> {
  return `Translated: ${text}`;
}

async function handleProcessImages(request: any, tabId?: number) {
  const results = [];
  const { images, settings } = request;

  console.log(
    `[BACKGROUND] Processing ${images.length} images with settings:`,
    settings,
  );

  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    const imageHash = TranslationCache.hashImage(image.dataUrl);

    console.log(
      `[BACKGROUND] Processing image ${i + 1}/${images.length}: ${image.id}`,
    );

    let textRegions = await cache.get(imageHash, settings.targetLanguage);

    if (!textRegions) {
      console.log(`[BACKGROUND] Cache miss for ${image.id}, calling API`);

      textRegions = await requestQueue.add(async () => {
        try {
          console.log("[BACKGROUND] Calling Gemini API...");

          if (!geminiService.isInitialized()) {
            throw new Error(
              "Gemini service not initialized - API key may be missing",
            );
          }

          const regions = await geminiService.detectTextRegionsWithOCR(
            image.dataUrl,
            settings.targetLanguage,
          );

          console.log(
            `[BACKGROUND] API returned ${regions.length} text regions`,
          );
          return regions;
        } catch (error: any) {
          console.error("[BACKGROUND] API call failed:", error);
          throw error;
        }
      });

      await cache.set(imageHash, settings.targetLanguage, textRegions);
    } else {
      console.log(`[BACKGROUND] Cache hit for ${image.id}`);
    }

    results.push({
      imageId: image.id,
      textRegions: textRegions || [],
      cached: !!textRegions,
      error: null,
    });

    if (tabId) {
      try {
        await chrome.tabs.sendMessage(tabId, {
          action: "PROGRESS_UPDATE",
          current: i + 1,
          total: images.length,
          status: "processing",
        });
      } catch (err) {
        console.error("[BACKGROUND] Failed to send progress update:", err);
      }
    }
  }

  console.log(`[BACKGROUND] Completed processing ${results.length} images`);
  return { success: true, results };
}
