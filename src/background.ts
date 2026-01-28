import { geminiService } from "~/api/services";

export {};

console.log("[BACKGROUND] Background service worker loaded");

chrome.runtime.onInstalled.addListener(() => {
  console.log("[BACKGROUND] Manga Translator extension installed");
});

class RequestQueue {
  private queue: Array<() => Promise<any>> = [];
  private processing = false;
  private concurrent = 1; // Process one at a time for sequential flow
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

// Fallback key used when env injection doesn't reach the service worker
const FALLBACK_API_KEY = "AIzaSyAX2rZm4I5BuXk6FCsMXA7od5godAm1TJQ";

async function initializeServices() {
  console.log("[BACKGROUND] Initializing services...");

  const result = await chrome.storage.local.get("gemini_api_key");
  let apiKey = result.gemini_api_key;

  if (!apiKey) {
    // Try env var (may be undefined if Plasmo didn't inline it for service workers)
    apiKey = process.env.PLASMO_PUBLIC_GEMINI_API_KEY;
  }

  if (!apiKey) {
    // Use fallback key
    apiKey = FALLBACK_API_KEY;
    console.log("[BACKGROUND] Using fallback API key");
  }

  // Persist to storage so subsequent activations skip env lookup
  await chrome.storage.local.set({ gemini_api_key: apiKey });

  geminiService.initialize(apiKey);
  console.log("[BACKGROUND] Gemini service initialized");
}

initializeServices();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("[BACKGROUND] Message received:", request.action);

  if (request.action === "FETCH_IMAGE") {
    handleFetchImage(request.url)
      .then((dataUrl) => sendResponse({ dataUrl }))
      .catch((error) => sendResponse({ error: error.message }));
    return true;
  }

  if (request.action === "PROCESS_IMAGES") {
    handleProcessImages(request, sender.tab?.id)
      .then(sendResponse)
      .catch((error) => {
        console.error("[BACKGROUND] Process images error:", error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  return false;
});

async function handleFetchImage(url: string): Promise<string> {
  console.log("[BACKGROUND] Fetching image:", url.substring(0, 80));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        // Mimic a browser image request
        Accept: "image/webp,image/apng,image/*,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const blob = await response.blob();

    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (reader.result) {
          console.log("[BACKGROUND] FETCH_IMAGE successful");
          resolve(reader.result as string);
        } else {
          reject(new Error("FileReader returned empty result"));
        }
      };
      reader.onerror = () => reject(new Error("Failed to read image blob"));
      reader.readAsDataURL(blob);
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function handleProcessImages(request: any, tabId?: number) {
  const results = [];
  const { images, settings } = request;

  console.log(
    `[BACKGROUND] Processing ${images.length} image(s) with target lang: ${settings.targetLanguage}`,
  );

  for (let i = 0; i < images.length; i++) {
    const image = images[i];

    try {
      const imageHash = TranslationCache.hashImage(image.dataUrl);

      // Check cache first
      let textRegions = await cache.get(imageHash, settings.targetLanguage);

      if (!textRegions) {
        console.log(`[BACKGROUND] Cache miss for ${image.id}, calling API`);

        textRegions = await requestQueue.add(async () => {
          if (!geminiService.isInitialized()) {
            throw new Error(
              "Gemini service not initialized - check API key in .env",
            );
          }

          const regions = await geminiService.detectTextRegionsWithOCR(
            image.dataUrl,
            settings.targetLanguage,
          );

          console.log(
            `[BACKGROUND] API returned ${regions.length} text regions for ${image.id}`,
          );
          return regions;
        });

        await cache.set(imageHash, settings.targetLanguage, textRegions);
      } else {
        console.log(`[BACKGROUND] Cache hit for ${image.id}`);
      }

      results.push({
        imageId: image.id,
        textRegions: textRegions || [],
        cached: false,
        error: null,
      });
    } catch (error: any) {
      console.error(
        `[BACKGROUND] Failed to process ${image.id}:`,
        error.message,
      );

      results.push({
        imageId: image.id,
        textRegions: [],
        cached: false,
        error: error.message || "Processing failed",
      });
    }

    // Send per-image progress to content script
    if (tabId) {
      try {
        await new Promise<void>((resolve) => {
          chrome.tabs.sendMessage(
            tabId,
            {
              action: "PROGRESS_UPDATE",
              current: i + 1,
              total: images.length,
              status: "processing",
            },
            () => {
              // Ignore lastError for progress updates - tab may have closed
              resolve();
            },
          );
        });
      } catch {
        // Non-critical, continue processing
      }
    }
  }

  console.log(`[BACKGROUND] Completed processing ${results.length} image(s)`);

  // Only throw if ALL images failed
  if (results.every((r) => r.error)) {
    throw new Error(
      results[results.length - 1]?.error || "All images failed to process",
    );
  }

  return { success: true, results };
}
