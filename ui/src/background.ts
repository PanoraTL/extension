import { geminiService } from "~/api/services";
import type { TextRegion, YoloBubble } from "~/types/translator.types";

export {};

const PYTHON_SERVER_URL = "http://localhost:5001";
let pythonServerAvailable: boolean | null = null;
let lastHealthCheck = 0;
const HEALTH_CHECK_INTERVAL = 30000;
let yoloConsecutiveFailures = 0;
const YOLO_MAX_FAILURES = 3;

chrome.runtime.onInstalled.addListener(() => {
  console.log("[BACKGROUND] Manga Translator extension installed");
});

class RequestQueue {
  private queue: Array<() => Promise<any>> = [];
  private processing = false;
  private concurrent = 3;
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
  private readonly TTL_MS = 60 * 60 * 1000;

  async get(imageHash: string, targetLang: string): Promise<any | null> {
    const key = `${this.CACHE_KEY_PREFIX}${imageHash}_${targetLang}`;
    const result = await chrome.storage.local.get(key);
    const entry = result[key];
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.TTL_MS) {
      await chrome.storage.local.remove(key);
      return null;
    }
    return entry.data || null;
  }

  async set(imageHash: string, targetLang: string, data: any): Promise<void> {
    const key = `${this.CACHE_KEY_PREFIX}${imageHash}_${targetLang}`;
    await chrome.storage.local.set({
      [key]: { data, timestamp: Date.now() },
    });
  }

  static async hashImage(dataUrl: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(dataUrl);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
}

const cache = new TranslationCache();

let initPromise: Promise<void>;

async function initializeServices() {
  console.log("[BACKGROUND] Initializing services...");

  const result = await chrome.storage.local.get("gemini_api_key");
  const apiKey = result.gemini_api_key;

  if (!apiKey) {
    console.log("[BACKGROUND] No Gemini API key found. Add one in extension Settings.");
    return;
  }

  geminiService.initialize(apiKey);
  console.log("[BACKGROUND] Gemini service initialized");
}

initPromise = initializeServices();

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

  if (request.action === "UPDATE_API_KEY") {
    const newKey = request.apiKey?.trim();
    if (newKey) {
      geminiService.initialize(newKey);
      console.log("[BACKGROUND] Gemini service reinitialized with new API key");
    } else {
      geminiService.clear();
      console.log("[BACKGROUND] Gemini service cleared — API key removed");
    }
    sendResponse({ success: true });
    return false;
  }

  if (request.action === "CLEAR_CACHE") {
    chrome.storage.local.get(null, (items) => {
      const keys = Object.keys(items).filter((k) => k.startsWith("manga_translation_"));
      if (keys.length > 0) {
        chrome.storage.local.remove(keys, () => {
          console.log(`[BACKGROUND] Cleared ${keys.length} cache entries`);
          sendResponse({ success: true, cleared: keys.length });
        });
      } else {
        sendResponse({ success: true, cleared: 0 });
      }
    });
    return true;
  }

  if (request.action === "PROGRESS_UPDATE" || request.action === "ERROR") {
    if (sender.tab?.id) {
      chrome.tabs.sendMessage(sender.tab.id, request).catch(() => {});
    }
    sendResponse({ forwarded: true });
    return false;
  }

  return false;
});

async function checkPythonServer(): Promise<boolean> {
  const now = Date.now();
  if (pythonServerAvailable !== null && now - lastHealthCheck < HEALTH_CHECK_INTERVAL) {
    return pythonServerAvailable;
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const resp = await fetch(`${PYTHON_SERVER_URL}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    if (resp.ok) {
      const data = await resp.json();
      pythonServerAvailable = data.model_loaded === true;
      if (pythonServerAvailable) yoloConsecutiveFailures = 0;
    } else {
      pythonServerAvailable = false;
    }
  } catch {
    pythonServerAvailable = false;
  }
  lastHealthCheck = Date.now();
  console.log(`[BACKGROUND] Python server available: ${pythonServerAvailable}`);
  return pythonServerAvailable;
}

async function detectBubblesViaPython(
  imageDataUrl: string,
  targetLang: string,
): Promise<TextRegion[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  let bubbles: YoloBubble[];

  try {
    const response = await fetch(`${PYTHON_SERVER_URL}/detect-bubbles`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_data: imageDataUrl }),
    });

    if (!response.ok) {
      throw new Error(`Python server returned ${response.status}`);
    }

    const data = await response.json();
    bubbles = Array.isArray(data) ? data : [];
  } finally {
    clearTimeout(timeout);
  }

  const textRegions: TextRegion[] = [];

  for (const bubble of bubbles) {
    if (!bubble.cropDataUrl) continue;

    const { originalText, translatedText } =
      await geminiService.extractAndTranslateFromCrop(bubble.cropDataUrl, targetLang);

    if (!originalText.trim() || !translatedText.trim()) continue;

    textRegions.push({
      originalText,
      translatedText,
      bounds: bubble.bounds,
      background: bubble.background,
      detectedFontSizePct: bubble.detectedFontSizePct,
      detectedFontStyle: "normal",
      confidence: bubble.confidence,
      bubbleType: bubble.bubbleType,
    });
  }

  console.log(`[BACKGROUND] YOLO returned ${textRegions.length} text bubbles`);
  return textRegions;
}

async function handleFetchImage(url: string): Promise<string> {
  await initPromise;
  console.log("[BACKGROUND] Fetching image:", url.substring(0, 80));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
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
  await initPromise;

  const results = [];
  const { images, settings } = request;

  console.log(
    `[BACKGROUND] Processing ${images.length} image(s) with target lang: ${settings.targetLanguage}`,
  );

  for (let i = 0; i < images.length; i++) {
    const image = images[i];

    try {
      const imageHash = await TranslationCache.hashImage(image.dataUrl);

      let textRegions = await cache.get(imageHash, settings.targetLanguage);

      if (!textRegions) {
        console.log(`[BACKGROUND] Cache miss for ${image.id}, calling API`);

        textRegions = await requestQueue.add(async () => {
          if (!geminiService.isInitialized()) {
            throw new Error(
              "No API key set. Please add your Gemini API key in the extension Settings.",
            );
          }

          const useYolo = await checkPythonServer();

          if (useYolo) {
            try {
              const regions = await detectBubblesViaPython(
                image.dataUrl,
                settings.targetLanguage,
              );
              yoloConsecutiveFailures = 0;
              return regions;
            } catch (yoloError: any) {
              yoloConsecutiveFailures++;
              console.warn(`[BACKGROUND] YOLO failed (${yoloConsecutiveFailures}/${YOLO_MAX_FAILURES}), falling back to Gemini:`, yoloError.message);
              if (yoloConsecutiveFailures >= YOLO_MAX_FAILURES) {
                pythonServerAvailable = false;
                console.warn(`[BACKGROUND] YOLO disabled after ${YOLO_MAX_FAILURES} consecutive failures`);
              }
            }
          }

          const regions = await geminiService.detectTextRegionsWithOCR(
            image.dataUrl,
            settings.targetLanguage,
          );

          console.log(
            `[BACKGROUND] Gemini returned ${regions.length} text regions for ${image.id}`,
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
              resolve();
            },
          );
        });
      } catch (err) {
        console.warn("[BACKGROUND] Failed to send progress update to tab:", tabId, err);
      }
    }
  }

  console.log(`[BACKGROUND] Completed processing ${results.length} image(s)`);

  if (results.every((r) => r.error)) {
    throw new Error(
      results[results.length - 1]?.error || "All images failed to process",
    );
  }

  return { success: true, results };
}
