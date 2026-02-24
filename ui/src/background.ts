import { geminiService } from "~/api/services";
import type { TextRegion, DetectedBubble } from "~/types/translator.types";

const MODEL_SERVER_URL = "http://localhost:5001";
const batchAbortedByTab = new Map<number, boolean>();

interface SessionStats {
  startTime: number;
  inputTokens: number;
  outputTokens: number;
  totalPanels: number;
  completedPanels: number;
  cachedPanels: number;
  chunksDone: number;
  totalChunks: number;
}
const sessionStatsByTab = new Map<number, SessionStats>();

chrome.runtime.onInstalled.addListener(() => {});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    batchAbortedByTab.set(tabId, true);
    sessionStatsByTab.delete(tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  batchAbortedByTab.set(tabId, true);
  sessionStatsByTab.delete(tabId);
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
  const result = await chrome.storage.local.get("gemini_api_key");
  const apiKey = result.gemini_api_key;
  if (!apiKey) return;
  geminiService.initialize(apiKey);
}

initPromise = initializeServices();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

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
    const tabId = sender.tab?.id;
    if (tabId !== undefined) {
      batchAbortedByTab.set(tabId, false);
      if (!sessionStatsByTab.has(tabId)) {
        geminiService.resetTokenCount();
        console.log(`[BACKGROUND] Starting translation: ${request.total} panel(s)`);
        sessionStatsByTab.set(tabId, {
          startTime: Date.now(),
          inputTokens: 0,
          outputTokens: 0,
          totalPanels: request.total,
          completedPanels: 0,
          cachedPanels: 0,
          chunksDone: 0,
          totalChunks: Math.ceil(request.total / 10),
        });
      }
    }
    sendResponse({ success: true });
    handleProcessImagesBatch(request, tabId);
    return false;
  }

  if (request.action === "STOP_TRANSLATION") {
    const tabId = sender.tab?.id ?? request.tabId;
    if (tabId !== undefined) batchAbortedByTab.set(tabId, true);
    sendResponse({ success: true });
    return false;
  }

  if (request.action === "GET_TRANSLATION_STATUS") {
    const tabId = request.tabId;
    const session = tabId !== undefined ? sessionStatsByTab.get(tabId) : undefined;
    sendResponse({
      isProcessing: session !== undefined,
      completedPanels: session?.completedPanels ?? 0,
      totalPanels: session?.totalPanels ?? 0,
    });
    return false;
  }

  if (request.action === "UPDATE_API_KEY") {
    const newKey = request.apiKey?.trim();
    if (newKey) {
      geminiService.initialize(newKey);
    } else {
      geminiService.clear();
    }
    sendResponse({ success: true });
    return false;
  }

  if (request.action === "CLEAR_CACHE") {
    chrome.storage.local.get(null, (items) => {
      const keys = Object.keys(items).filter((k) => k.startsWith("manga_translation_"));
      if (keys.length > 0) {
        chrome.storage.local.remove(keys, () => {
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


async function detectBubbles(imageDataUrl: string): Promise<DetectedBubble[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(`${MODEL_SERVER_URL}/detect-bubbles`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_data: imageDataUrl }),
    });
    if (!response.ok) throw new Error(`Detection server returned ${response.status}`);
    const data = await response.json();
    return (Array.isArray(data) ? data : []).filter((b: DetectedBubble) => !!b.cropDataUrl);
  } finally {
    clearTimeout(timeout);
  }
}

function buildTextRegions(bubbles: DetectedBubble[], translations: string[]): TextRegion[] {
  const regions: TextRegion[] = [];
  for (let i = 0; i < bubbles.length; i++) {
    const translatedText = translations[i] ?? "";
    if (!translatedText.trim()) continue;
    regions.push({
      translatedText,
      bounds: bubbles[i].bounds,
      background: bubbles[i].background,
      detectedFontSizePct: bubbles[i].detectedFontSizePct,
      detectedFontStyle: "normal",
      confidence: bubbles[i].confidence,
      bubbleType: bubbles[i].bubbleType,
    });
  }
  return regions;
}

async function handleFetchImage(url: string): Promise<string> {
  await initPromise;

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

          const bubbles = await detectBubbles(image.dataUrl);
          const result = await geminiService.extractAndTranslateFromCrops(
            bubbles.map((b) => b.cropDataUrl),
            bubbles.map((b) => b.bubbleType ?? "speech"),
            settings.targetLanguage,
          );
          return { textRegions: buildTextRegions(bubbles, result.translations), wasRateLimited: result.wasRateLimited };
        });

        await cache.set(imageHash, settings.targetLanguage, textRegions.textRegions);
      }

      results.push({
        imageId: image.id,
        textRegions: (textRegions as any)?.textRegions || textRegions || [],
        cached: false,
        error: null,
        wasRateLimited: (textRegions as any)?.wasRateLimited ?? false,
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
  isAborted: () => boolean = () => false,
): Promise<{ bubbles: DetectedBubble[]; isRateLimit?: boolean; imageHash: string; error: string | null }> {
  await initPromise;
  if (isAborted()) return { bubbles: [], imageHash: "", error: null };
  const imageHash = await TranslationCache.hashImage(image.dataUrl);

  try {
    const bubbles = await requestQueue.add(async () => {
      if (isAborted()) return [];
      if (!geminiService.isInitialized()) {
        throw new Error("No API key set. Please add your Gemini API key in the extension Settings.");
      }
      return detectBubbles(image.dataUrl);
    });
    return { bubbles: bubbles || [], imageHash, error: null };
  } catch (error: any) {
    const isRateLimit = !!(error.isRateLimit || geminiService.isRateLimit(error));
    const isOverloaded = !!(error.isOverloaded || geminiService.isOverloaded(error));
    return { bubbles: [], imageHash, isRateLimit: isRateLimit || isOverloaded, error: error.message || "Processing failed" };
  }
}

async function handleProcessImagesBatch(request: any, tabId?: number) {
  const { images, settings } = request;
  const total = images.length;
  let completed = 0;
  let anyRateLimited = false;
  let anySuccess = false;
  let rateLimitHit = false;

  const sendToTab = (msg: any) => {
    if (tabId) chrome.tabs.sendMessage(tabId, msg).catch(() => {});
  };
  const sendToPopup = (msg: any) => {
    chrome.runtime.sendMessage(msg).catch(() => {});
  };

  const isAborted = () => tabId !== undefined && batchAbortedByTab.get(tabId) === true;

  const detectionResults = await Promise.all(
    images.map(async (image: { id: string; dataUrl: string }) => {
      if (isAborted()) return { image, bubbles: [], fromCache: false, imageHash: "", cached: null as TextRegion[] | null, isRateLimit: false, error: null as string | null };
      const imageHash = await TranslationCache.hashImage(image.dataUrl);
      const cached = await cache.get(imageHash, settings.targetLanguage);
      if (cached) return { image, bubbles: [] as DetectedBubble[], fromCache: true, imageHash, cached, isRateLimit: false, error: null as string | null };
      const det = await processSinglePanel(image, settings, isAborted);
      return { image, bubbles: det.bubbles, fromCache: false, imageHash, cached: null as TextRegion[] | null, isRateLimit: det.isRateLimit ?? false, error: det.error };
    })
  );

  if (isAborted()) {
    sendToTab({ action: "BATCH_COMPLETE", success: true, wasRateLimited: false, total: completed, stopped: true, isFinal: true });
    sendToPopup({ action: "TRANSLATION_STOPPED" });
    return;
  }

  const panelCropOffsets: { image: { id: string; dataUrl: string }; start: number; count: number; imageHash: string }[] = [];
  const allCrops: string[] = [];
  const allTypes: string[] = [];

  for (const det of detectionResults) {
    if (det.fromCache || det.isRateLimit || det.bubbles.length === 0) continue;
    const start = allCrops.length;
    allCrops.push(...det.bubbles.map((b) => b.cropDataUrl));
    allTypes.push(...det.bubbles.map((b) => b.bubbleType ?? "speech"));
    panelCropOffsets.push({ image: det.image, start, count: det.bubbles.length, imageHash: det.imageHash });
  }

  let allTranslations: string[] = [];
  let wasRateLimited = false;
  if (allCrops.length > 0) {
    try {
      const result = await geminiService.extractAndTranslateFromCrops(allCrops, allTypes, settings.targetLanguage);
      allTranslations = result.translations;
      wasRateLimited = result.wasRateLimited;
      const translated = allTranslations.filter(t => !!t).length;
      console.log(`[API] Gemini translation complete: ${translated}/${allTranslations.length} bubbles translated`);
    } catch (error: any) {
      const isRateLimit = !!(error.isRateLimit || geminiService.isRateLimit(error));
      if (isRateLimit) {
        rateLimitHit = true;
        if (tabId !== undefined) batchAbortedByTab.set(tabId, true);
      }
    }
  }

  for (const det of detectionResults) {
    if (isAborted()) break;
    completed++;

    if (det.isRateLimit) {
      rateLimitHit = true;
      if (tabId !== undefined) batchAbortedByTab.set(tabId, true);
      sendToTab({ action: "PANEL_ERROR", imageId: det.image.id, isRateLimit: true, error: det.error });
    } else if (det.fromCache && det.cached) {
      anySuccess = true;
      if (tabId !== undefined && sessionStatsByTab.has(tabId)) {
        sessionStatsByTab.get(tabId)!.cachedPanels++;
      }
      sendToTab({ action: "PANEL_RESULT", imageId: det.image.id, textRegions: det.cached, wasRateLimited: false });
    } else {
      const offset = panelCropOffsets.find(p => p.image.id === det.image.id);
      const translations = offset ? allTranslations.slice(offset.start, offset.start + offset.count) : [];
      const bubbles = detectionResults.find(d => d.image.id === det.image.id)?.bubbles ?? [];
      const textRegions = buildTextRegions(bubbles, translations);
      await cache.set(det.imageHash, settings.targetLanguage, textRegions);
      if (textRegions.length > 0) anySuccess = true;
      if (wasRateLimited) anyRateLimited = true;
      sendToTab({ action: "PANEL_RESULT", imageId: det.image.id, textRegions, wasRateLimited });
    }

    const session = tabId !== undefined ? sessionStatsByTab.get(tabId) : undefined;
    const globalCompleted = session ? session.completedPanels + completed : completed;
    const globalTotal = session ? session.totalPanels : total;
    sendToPopup({ action: "PROGRESS_UPDATE", current: globalCompleted, total: globalTotal, status: "processing" });
  }

  const wasStopped = isAborted();

  if (tabId !== undefined && sessionStatsByTab.has(tabId)) {
    const session = sessionStatsByTab.get(tabId)!;
    session.completedPanels += completed;
    session.chunksDone++;
    session.inputTokens += geminiService.totalInputTokens;
    session.outputTokens += geminiService.totalOutputTokens;
    geminiService.resetTokenCount();

    const isLastChunk = wasStopped || rateLimitHit || session.completedPanels >= session.totalPanels;
    if (isLastChunk) {
      const elapsedSec = ((Date.now() - session.startTime) / 1000).toFixed(1);
      const freshPanels = session.completedPanels - session.cachedPanels;
      console.log(`[BACKGROUND] Translation complete: ${session.completedPanels}/${session.totalPanels} panels (${freshPanels} translated, ${session.cachedPanels} cached) | ${elapsedSec}s | tokens — in: ${session.inputTokens}, out: ${session.outputTokens}, total: ${session.inputTokens + session.outputTokens}`);
      sessionStatsByTab.delete(tabId);
    }
  } else {
    geminiService.resetTokenCount();
  }
  if (tabId !== undefined) batchAbortedByTab.delete(tabId);

  const isLastChunk = wasStopped || rateLimitHit ||
    (tabId !== undefined ? !sessionStatsByTab.has(tabId) : true);

  if (wasStopped && !rateLimitHit) {
    sendToTab({ action: "BATCH_COMPLETE", success: true, wasRateLimited: anyRateLimited, total: completed, stopped: true, isFinal: true });
    sendToPopup({ action: "TRANSLATION_STOPPED" });
  } else if (rateLimitHit) {
    sendToTab({ action: "BATCH_COMPLETE", success: false, isRateLimit: true, error: "Gemini API rate limit reached. Please wait and try again.", isFinal: true });
  } else if (!anySuccess) {
    sendToTab({ action: "BATCH_COMPLETE", success: false, error: "Could not translate any panels. Check your API key and try again.", isFinal: isLastChunk });
  } else {
    sendToTab({ action: "BATCH_COMPLETE", success: true, wasRateLimited: anyRateLimited, total: completed, isFinal: isLastChunk });
  }
}
