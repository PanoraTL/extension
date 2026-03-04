/**
 * processor.ts — Single-panel and batch translation processing.
 */

import { geminiService } from "~/api/services";
import type { DetectedBubble, TextRegion } from "~/types/translator.types";
import { cache, requestQueue, TranslationCache } from "./cache";
import { detectBubbles, buildTextRegions } from "./detector";

export interface SessionStats {
  startTime: number;
  inputTokens: number;
  outputTokens: number;
  totalPanels: number;
  completedPanels: number;
  cachedPanels: number;
  chunksDone: number;
  totalChunks: number;
}

export const batchAbortedByTab = new Map<number, boolean>();
export const sessionStatsByTab = new Map<number, SessionStats>();

export async function handleFetchImage(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "image/webp,image/apng,image/*,*/*;q=0.8" },
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

export async function handleProcessImages(request: any, tabId?: number) {
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
          return {
            textRegions: buildTextRegions(bubbles, result.translations),
            wasRateLimited: result.wasRateLimited,
          };
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
      console.error(`[PROCESSOR] Failed to process ${image.id}:`, error.message);

      if (error.isRateLimit || geminiService.isRateLimit(error)) {
        const rateLimitMsg =
          error.message || "Gemini API rate limit reached. Please wait and try again.";
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
      await new Promise<void>((resolve) => {
        chrome.tabs.sendMessage(
          tabId,
          { action: "PROGRESS_UPDATE", current: i + 1, total: images.length, status: "processing" },
          () => resolve(),
        );
      });
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
  _settings: any,
  isAborted: () => boolean = () => false,
): Promise<{
  bubbles: DetectedBubble[];
  isRateLimit?: boolean;
  imageHash: string;
  error: string | null;
}> {
  if (isAborted()) return { bubbles: [], imageHash: "", error: null };
  const imageHash = await TranslationCache.hashImage(image.dataUrl);

  try {
    const bubbles = await requestQueue.add(async () => {
      if (isAborted()) return [];
      if (!geminiService.isInitialized()) {
        throw new Error(
          "No API key set. Please add your Gemini API key in the extension Settings.",
        );
      }
      return detectBubbles(image.dataUrl);
    });
    return { bubbles: bubbles || [], imageHash, error: null };
  } catch (error: any) {
    const isRateLimit = !!(error.isRateLimit || geminiService.isRateLimit(error));
    return { bubbles: [], imageHash, isRateLimit, error: error.message || "Processing failed" };
  }
}

export async function handleProcessImagesBatch(request: any, tabId?: number) {
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

  const isAborted = () =>
    tabId !== undefined && batchAbortedByTab.get(tabId) === true;

  // Phase 1: detect bubbles for all panels (parallel, with cache checks)
  const detectionResults = await Promise.all(
    images.map(async (image: { id: string; dataUrl: string }) => {
      if (isAborted())
        return {
          image,
          bubbles: [],
          fromCache: false,
          imageHash: "",
          cached: null as TextRegion[] | null,
          isRateLimit: false,
          error: null as string | null,
        };
      const imageHash = await TranslationCache.hashImage(image.dataUrl);
      const cached = await cache.get(imageHash, settings.targetLanguage);
      if (cached)
        return {
          image,
          bubbles: [] as DetectedBubble[],
          fromCache: true,
          imageHash,
          cached,
          isRateLimit: false,
          error: null as string | null,
        };
      const det = await processSinglePanel(image, settings, isAborted);
      return {
        image,
        bubbles: det.bubbles,
        fromCache: false,
        imageHash,
        cached: null as TextRegion[] | null,
        isRateLimit: det.isRateLimit ?? false,
        error: det.error,
      };
    }),
  );

  if (isAborted()) {
    sendToTab({
      action: "BATCH_COMPLETE",
      success: true,
      wasRateLimited: false,
      total: completed,
      stopped: true,
      isFinal: true,
    });
    sendToPopup({ action: "TRANSLATION_STOPPED" });
    return;
  }

  // Phase 2: pool all crops across panels and call Gemini once
  const panelCropOffsets: {
    image: { id: string; dataUrl: string };
    start: number;
    count: number;
    imageHash: string;
  }[] = [];
  const allCrops: string[] = [];
  const allTypes: string[] = [];

  for (const det of detectionResults) {
    if (det.fromCache || det.isRateLimit || det.bubbles.length === 0) continue;
    const start = allCrops.length;
    allCrops.push(...det.bubbles.map((b: DetectedBubble) => b.cropDataUrl));
    allTypes.push(...det.bubbles.map((b: DetectedBubble) => b.bubbleType ?? "speech"));
    panelCropOffsets.push({
      image: det.image,
      start,
      count: det.bubbles.length,
      imageHash: det.imageHash,
    });
  }

  let allTranslations: string[] = [];
  let wasRateLimited = false;
  if (allCrops.length > 0) {
    try {
      const result = await geminiService.extractAndTranslateFromCrops(
        allCrops,
        allTypes,
        settings.targetLanguage,
      );
      allTranslations = result.translations;
      wasRateLimited = result.wasRateLimited;
    } catch (error: any) {
      const isRateLimit = !!(error.isRateLimit || geminiService.isRateLimit(error));
      if (isRateLimit) {
        rateLimitHit = true;
        if (tabId !== undefined) batchAbortedByTab.set(tabId, true);
      } else {
        console.error("[PROCESSOR] Gemini translation failed:", error.message);
        sendToTab({
          action: "BATCH_COMPLETE",
          success: false,
          error: error.message || "Translation failed",
          isFinal: true,
        });
        return;
      }
    }
  }

  // Phase 3: distribute translations back to each panel and stream results
  const offsetMap = new Map(panelCropOffsets.map((p) => [p.image.id, p]));
  const bubblesMap = new Map(detectionResults.map((d) => [d.image.id, d.bubbles ?? []]));

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
      sendToTab({
        action: "PANEL_RESULT",
        imageId: det.image.id,
        textRegions: det.cached,
        wasRateLimited: false,
      });
    } else {
      const offset = offsetMap.get(det.image.id);
      const translations = offset
        ? allTranslations.slice(offset.start, offset.start + offset.count)
        : [];
      const bubbles = bubblesMap.get(det.image.id) ?? [];
      const textRegions = buildTextRegions(bubbles, translations);
      if (textRegions.length > 0) {
        await cache.set(det.imageHash, settings.targetLanguage, textRegions);
        anySuccess = true;
      }
      if (wasRateLimited) anyRateLimited = true;
      sendToTab({ action: "PANEL_RESULT", imageId: det.image.id, textRegions, wasRateLimited });
    }

    const session = tabId !== undefined ? sessionStatsByTab.get(tabId) : undefined;
    const globalCompleted = session ? session.completedPanels + completed : completed;
    const globalTotal = session ? session.totalPanels : total;
    sendToPopup({
      action: "PROGRESS_UPDATE",
      current: globalCompleted,
      total: globalTotal,
      status: "processing",
    });
  }

  const wasStopped = isAborted();

  // Update session stats and log on final chunk
  if (tabId !== undefined && sessionStatsByTab.has(tabId)) {
    const session = sessionStatsByTab.get(tabId)!;
    session.completedPanels += completed;
    session.chunksDone++;
    session.inputTokens += geminiService.totalInputTokens;
    session.outputTokens += geminiService.totalOutputTokens;
    geminiService.resetTokenCount();

    const isLastChunk =
      wasStopped || rateLimitHit || session.completedPanels >= session.totalPanels;
    if (isLastChunk) {
      const elapsedSec = ((Date.now() - session.startTime) / 1000).toFixed(1);
      const freshPanels = session.completedPanels - session.cachedPanels;
      console.log(
        `[PROCESSOR] Translation complete: ${session.completedPanels}/${session.totalPanels} panels` +
          ` (${freshPanels} translated, ${session.cachedPanels} cached) | ${elapsedSec}s |` +
          ` tokens — in: ${session.inputTokens}, out: ${session.outputTokens},` +
          ` total: ${session.inputTokens + session.outputTokens}`,
      );
      sessionStatsByTab.delete(tabId);
    }
  } else {
    geminiService.resetTokenCount();
  }

  if (tabId !== undefined) batchAbortedByTab.delete(tabId);

  const isLastChunk =
    wasStopped || rateLimitHit || (tabId !== undefined ? !sessionStatsByTab.has(tabId) : true);

  if (wasStopped && !rateLimitHit) {
    sendToTab({
      action: "BATCH_COMPLETE",
      success: true,
      wasRateLimited: anyRateLimited,
      total: completed,
      stopped: true,
      isFinal: true,
    });
    sendToPopup({ action: "TRANSLATION_STOPPED" });
  } else if (rateLimitHit) {
    sendToTab({
      action: "BATCH_COMPLETE",
      success: false,
      isRateLimit: true,
      error: "Gemini API rate limit reached. Please wait and try again.",
      isFinal: true,
    });
  } else if (!anySuccess) {
    sendToTab({
      action: "BATCH_COMPLETE",
      success: false,
      error: "Could not translate any panels. Check your API key and try again.",
      isFinal: isLastChunk,
    });
  } else {
    sendToTab({
      action: "BATCH_COMPLETE",
      success: true,
      wasRateLimited: anyRateLimited,
      total: completed,
      isFinal: isLastChunk,
    });
  }
}
