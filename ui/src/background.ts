import { geminiService } from "~/api/services";
import type { TextRegion, DetectedBubble } from "~/types/translator.types";

const MODEL_SERVER_URL = "http://localhost:5001";
let modelAvailable: boolean | null = null;
let lastHealthCheck = 0;
const HEALTH_CHECK_INTERVAL = 30000;
let detectorConsecutiveFailures = 0;
const DETECTOR_MAX_FAILURES = 3;
let batchAborted = false;

chrome.runtime.onInstalled.addListener(() => {
  console.log("[BACKGROUND] Manga Translator extension installed");
});

class RequestQueue {
  private queue: Array<() => Promise<any>> = [];
  private processing = false;
  private concurrent = 5;
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

  if (request.action === "PROCESS_IMAGES_BATCH") {
    batchAborted = false;
    const tabId = sender.tab?.id;
    sendResponse({ success: true });
    handleProcessImagesBatch(request, tabId);
    return false;
  }

  if (request.action === "STOP_TRANSLATION") {
    batchAborted = true;
    sendResponse({ success: true });
    return false;
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


async function checkModel(): Promise<boolean> {
  const now = Date.now();
  if (modelAvailable !== null && now - lastHealthCheck < HEALTH_CHECK_INTERVAL) {
    return modelAvailable;
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const resp = await fetch(`${MODEL_SERVER_URL}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    if (resp.ok) {
      const data = await resp.json();
      modelAvailable = data.model_loaded === true;
      if (modelAvailable) detectorConsecutiveFailures = 0;
    } else {
      modelAvailable = false;
    }
  } catch {
    modelAvailable = false;
  }
  lastHealthCheck = Date.now();
  console.log(`[BACKGROUND] Model available: ${modelAvailable}`);
  return modelAvailable;
}

async function detectBubblesViaModel(
  imageDataUrl: string,
  targetLang: string,
): Promise<TextRegion[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  let bubbles: DetectedBubble[];

  try {
    const response = await fetch(`${MODEL_SERVER_URL}/detect-bubbles`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_data: imageDataUrl }),
    });

    if (!response.ok) {
      throw new Error(`Model server returned ${response.status}`);
    }

    const data = await response.json();
    bubbles = Array.isArray(data) ? data : [];
  } finally {
    clearTimeout(timeout);
  }

  const validBubbles = bubbles.filter((b) => !!b.cropDataUrl);

  const translations = validBubbles.length > 0
    ? await geminiService.extractAndTranslateFromCrops(
        validBubbles.map((b) => b.cropDataUrl),
        validBubbles.map((b) => b.bubbleType ?? "speech"),
        targetLang,
      )
    : [];

  const textRegions: TextRegion[] = [];
  for (let i = 0; i < validBubbles.length; i++) {
    const bubble = validBubbles[i];
    const { originalText, translatedText } = translations[i] ?? { originalText: "", translatedText: "" };
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

  console.log(`[BACKGROUND] RT-DETR returned ${textRegions.length} text bubbles`);
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
        textRegions = await requestQueue.add(async () => {
          if (!geminiService.isInitialized()) {
            throw new Error(
              "No API key set. Please add your Gemini API key in the extension Settings.",
            );
          }

          const useDetector = await checkModel();

          if (useDetector) {
            try {
              const regions = await detectBubblesViaModel(
                image.dataUrl,
                settings.targetLanguage,
              );
              detectorConsecutiveFailures = 0;
              return regions;
            } catch (detectorError: any) {
              detectorConsecutiveFailures++;
              console.warn(`[BACKGROUND] Detector failed (${detectorConsecutiveFailures}/${DETECTOR_MAX_FAILURES}), falling back to Gemini:`, detectorError.message);
              if (detectorConsecutiveFailures >= DETECTOR_MAX_FAILURES) {
                modelAvailable = false;
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
        wasRateLimited: geminiService.lastCallWasRateLimited,
      });
    } catch (error: any) {
      console.error(
        `[BACKGROUND] Failed to process ${image.id}:`,
        error.message,
      );

      if (error.isRateLimit || geminiService.isRateLimit(error)) {
        const rateLimitMsg = error.message || "Gemini API rate limit reached. Please wait and try again.";
        return { success: false, isRateLimit: true, error: rateLimitMsg };
      }

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

  const wasRateLimited = results.some((r) => r.wasRateLimited);
  return { success: true, results, wasRateLimited };
}

async function processSinglePanel(
  image: { id: string; dataUrl: string },
  settings: any,
): Promise<{ textRegions: TextRegion[]; wasRateLimited: boolean; error: string | null }> {
  await initPromise;
  const imageHash = await TranslationCache.hashImage(image.dataUrl);
  const cached = await cache.get(imageHash, settings.targetLanguage);
  if (cached) {
    console.log(`[BACKGROUND] Cache hit for ${image.id}`);
    return { textRegions: cached, wasRateLimited: false, error: null };
  }

  try {
    const textRegions = await requestQueue.add(async () => {
      if (!geminiService.isInitialized()) {
        throw new Error("No API key set. Please add your Gemini API key in the extension Settings.");
      }
      const useDetector = await checkModel();
      if (useDetector) {
        try {
          const regions = await detectBubblesViaModel(image.dataUrl, settings.targetLanguage);
          detectorConsecutiveFailures = 0;
          return regions;
        } catch (detectorError: any) {
          detectorConsecutiveFailures++;
          console.warn(`[BACKGROUND] Detector failed (${detectorConsecutiveFailures}/${DETECTOR_MAX_FAILURES}), falling back to Gemini:`, detectorError.message);
          if (detectorConsecutiveFailures >= DETECTOR_MAX_FAILURES) {
            modelAvailable = false;
          }
        }
      }
      return await geminiService.detectTextRegionsWithOCR(image.dataUrl, settings.targetLanguage);
    });
    await cache.set(imageHash, settings.targetLanguage, textRegions);
    return { textRegions: textRegions || [], wasRateLimited: geminiService.lastCallWasRateLimited, error: null };
  } catch (error: any) {
    if (error.isRateLimit || geminiService.isRateLimit(error)) {
      return { textRegions: [], wasRateLimited: false, error: error.message, };
    }
    return { textRegions: [], wasRateLimited: false, error: error.message || "Processing failed" };
  }
}

async function handleProcessImagesBatch(request: any, tabId?: number) {
  const { images, settings } = request;
  const total = images.length;
  let completed = 0;
  let anyRateLimited = false;
  let anySuccess = false;
  let rateLimitHit = false;
  const startTime = Date.now();

  console.log(`[BACKGROUND] Batch processing ${total} panel(s) concurrently`);

  const sendToTab = (msg: any) => {
    if (tabId) chrome.tabs.sendMessage(tabId, msg).catch(() => {});
  };
  const sendToPopup = (msg: any) => {
    chrome.runtime.sendMessage(msg).catch(() => {});
  };

  await Promise.allSettled(
    images.map(async (image: { id: string; dataUrl: string }) => {
      if (batchAborted) return;

      const result = await processSinglePanel(image, settings);

      if (batchAborted) return;

      completed++;

      if (result.error && (result.error.toLowerCase().includes("rate limit") || result.error.toLowerCase().includes("quota"))) {
        rateLimitHit = true;
        batchAborted = true;
        sendToTab({ action: "PANEL_ERROR", imageId: image.id, isRateLimit: true, error: result.error });
      } else {
        if (result.textRegions.length > 0) anySuccess = true;
        if (result.wasRateLimited) anyRateLimited = true;
        sendToTab({ action: "PANEL_RESULT", imageId: image.id, textRegions: result.textRegions, wasRateLimited: result.wasRateLimited });
      }

      sendToPopup({ action: "PROGRESS_UPDATE", current: completed, total, status: "processing" });
    })
  );

  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
  const totalTokens = geminiService.totalTokensUsed;
  console.log(`[BACKGROUND] Batch complete: ${completed}/${total} panels | ${elapsedSec}s | ~${totalTokens} tokens used`);
  geminiService.resetTokenCount();

  if (batchAborted && !rateLimitHit) {
    sendToTab({ action: "BATCH_COMPLETE", success: true, wasRateLimited: anyRateLimited, total: completed, stopped: true });
  } else if (rateLimitHit) {
    sendToTab({ action: "BATCH_COMPLETE", success: false, isRateLimit: true, error: "Gemini API rate limit reached. Please wait and try again." });
  } else if (!anySuccess) {
    sendToTab({ action: "BATCH_COMPLETE", success: false, error: "Could not translate any panels. Check your API key and try again." });
  } else {
    sendToTab({ action: "BATCH_COMPLETE", success: true, wasRateLimited: anyRateLimited, total: completed });
  }
}
