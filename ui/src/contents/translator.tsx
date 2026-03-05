import type { PlasmoCSConfig } from "plasmo";
import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import "./content.css";
import type { TextRegion, TranslationSettings } from "~/types/translator.types";
import { ImageDetector } from "./services/ImageDetector";
import { TranslationOverlay } from "./components/TranslationOverlay";

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  all_frames: false,
};

interface OverlayData {
  element: HTMLImageElement;
  textRegions: TextRegion[];
  container: HTMLElement;
  targetLanguage: string;
}

const sendToBackground = async (message: any, timeoutMs = 60000): Promise<any> => {
  if (!chrome.runtime?.id) throw new Error("Extension context invalidated");

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Message timeout: ${message.action}`)), timeoutMs);
    try {
      chrome.runtime.sendMessage(message, (response) => {
        clearTimeout(timer);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || "Message send failed"));
        } else {
          resolve(response);
        }
      });
    } catch (error) {
      clearTimeout(timer);
      reject(error);
    }
  });
};

const notifyPopup = (message: any) => {
  try { chrome.runtime.sendMessage(message, () => { void chrome.runtime.lastError; }); } catch { }
};

function getImageContentRect(img: HTMLImageElement): { left: number; top: number; width: number; height: number } {
  const elRect = img.getBoundingClientRect();
  const elW = elRect.width;
  const elH = elRect.height;
  const natW = img.naturalWidth || elW;
  const natH = img.naturalHeight || elH;
  const objectFit = window.getComputedStyle(img).objectFit;

  if (objectFit === "contain") {
    const scale = Math.min(elW / natW, elH / natH);
    const contentW = natW * scale;
    const contentH = natH * scale;
    return {
      left: elRect.left + (elW - contentW) / 2,
      top: elRect.top + (elH - contentH) / 2,
      width: contentW,
      height: contentH,
    };
  }

  if (objectFit === "cover") {
    const scale = Math.max(elW / natW, elH / natH);
    const contentW = natW * scale;
    const contentH = natH * scale;
    return {
      left: elRect.left + (elW - contentW) / 2,
      top: elRect.top + (elH - contentH) / 2,
      width: contentW,
      height: contentH,
    };
  }

  return { left: elRect.left, top: elRect.top, width: elW, height: elH };
}

function positionContainerOverImage(container: HTMLElement, img: HTMLImageElement) {
  const content = getImageContentRect(img);
  const parentRect = (container.parentElement as HTMLElement).getBoundingClientRect();
  container.style.left = `${content.left - parentRect.left}px`;
  container.style.top = `${content.top - parentRect.top}px`;
  container.style.width = `${content.width}px`;
  container.style.height = `${content.height}px`;
}

const MangaTranslator = () => {
  const [overlays, setOverlays] = useState<Map<string, OverlayData>>(new Map());
  const processingRef = useRef(false);
  const translationHandlerRef = useRef<(() => Promise<void>) | null>(null);
  const settingsRef = useRef<TranslationSettings>({ targetLanguage: "en", showOriginalText: false, autoDetectLanguage: true });

  const createOverlayContainer = useCallback(
    (img: HTMLImageElement, imageId: string): HTMLElement => {
      document.querySelectorAll(`[data-overlay-image-id="${imageId}"]`).forEach((el) => el.remove());

      const imgParent = img.parentElement || document.body;
      if (window.getComputedStyle(imgParent).position === "static") {
        imgParent.style.position = "relative";
      }

      const container = document.createElement("div");
      container.className = "manga-translator-overlay-container";
      container.setAttribute("data-overlay-image-id", imageId);
      container.style.position = "absolute";
      container.style.pointerEvents = "none";
      container.style.zIndex = "100";
      container.style.overflow = "hidden";

      imgParent.appendChild(container);
      positionContainerOverImage(container, img);
      return container;
    },
    [],
  );

  const pendingPanelsRef = useRef<Map<string, HTMLImageElement>>(new Map());

  const handleAutoTranslation = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;

    try { await sendToBackground({ action: "CLEAR_CACHE" }); } catch (err) { console.warn("[TRANSLATOR] Failed to clear cache:", err); }

    try {
      const allPanels = ImageDetector.findImages().filter((el) => ImageDetector.isMangaPanel(el));
      const imageElements = allPanels.filter((el) => !el.getAttribute("data-panora-translated"));

      if (imageElements.length === 0) {
        notifyPopup({ action: "ERROR", error: allPanels.length > 0 ? "All panels on this page are already translated" : "No manga panel images found on this page" });
        processingRef.current = false;
        return;
      }

      const panelData = await Promise.allSettled(
        imageElements.map(async (el) => {
          const id = ImageDetector.generateImageId(el);
          const dataUrl = await ImageDetector.toDataUrl(el);
          return { id, dataUrl, element: el };
        })
      );

      const validPanels = panelData
        .filter((r): r is PromiseFulfilledResult<{ id: string; dataUrl: string; element: HTMLImageElement }> => r.status === "fulfilled")
        .map((r) => r.value);

      if (validPanels.length === 0) {
        notifyPopup({ action: "ERROR", error: "Failed to load any panel images." });
        processingRef.current = false;
        return;
      }

      pendingPanelsRef.current = new Map(validPanels.map((p) => [p.id, p.element]));

      const total = validPanels.length;
      notifyPopup({ action: "PROGRESS_UPDATE", current: 0, total, status: "processing" });

      const CHUNK_SIZE = 10;
      const sendChunk = (startIndex: number) => {
        if (startIndex >= validPanels.length) return;
        const chunk = validPanels.slice(startIndex, startIndex + CHUNK_SIZE);
        chrome.runtime.sendMessage({
          action: "PROCESS_IMAGES_BATCH",
          images: chunk.map((p) => ({ id: p.id, dataUrl: p.dataUrl })),
          settings: settingsRef.current,
          total,
        }, (response) => {
          if (chrome.runtime.lastError || !response?.success) {
            console.error("[TRANSLATOR] Batch send failed:", chrome.runtime.lastError?.message);
            notifyPopup({ action: "ERROR", error: "Failed to start translation — extension context unavailable." });
            processingRef.current = false;
            return;
          }
          sendChunk(startIndex + CHUNK_SIZE);
        });
      };

      try {
        sendChunk(0);
      } catch (err) {
        console.error("[TRANSLATOR] Failed to send batch message:", err);
        notifyPopup({ action: "ERROR", error: "Failed to start translation." });
        processingRef.current = false;
      }
    } catch (error: any) {
      notifyPopup({ action: "ERROR", error: error.message || "Translation failed" });
      processingRef.current = false;
    }
  }, [createOverlayContainer]);

  useEffect(() => { translationHandlerRef.current = handleAutoTranslation; }, [handleAutoTranslation]);
  useEffect(() => { processingRef.current = false; }, []);

  useEffect(() => {
    const tryTranslateImage = async (img: HTMLImageElement) => {
      if (!processingRef.current) return;
      if (!ImageDetector.isMangaPanel(img)) return;
      if (!ImageDetector.isInDocument(img)) return;
      if (img.getAttribute("data-panora-translated")) return;

      const id = ImageDetector.generateImageId(img);
      if (pendingPanelsRef.current.has(id)) return;

      try {
        const dataUrl = await ImageDetector.toDataUrl(img);
        pendingPanelsRef.current.set(id, img);
        chrome.runtime.sendMessage({
          action: "PROCESS_IMAGES_BATCH",
          images: [{ id, dataUrl }],
          settings: settingsRef.current,
          total: 1,
        });
      } catch {
      }
    };

    const handleNewImage = (img: HTMLImageElement) => {
      if (img.complete && img.naturalWidth > 0) {
        tryTranslateImage(img);
      } else {
        img.addEventListener("load", () => tryTranslateImage(img), { once: true });
      }
    };

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLImageElement) {
            handleNewImage(node);
          } else if (node instanceof Element) {
            node.querySelectorAll("img").forEach((img) =>
              handleNewImage(img as HTMLImageElement)
            );
          }
        });
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleMessage = (message: any, _: chrome.runtime.MessageSender, sendResponse: (r?: any) => void) => {
      if (message.action === "PANEL_RESULT") {
        const el = pendingPanelsRef.current.get(message.imageId);
        if (el) {
          el.setAttribute("data-panora-translated", "1");
          if (message.textRegions?.length > 0) {
            const container = createOverlayContainer(el, message.imageId);
            setOverlays((prev) => {
              const m = new Map(prev);
              m.set(message.imageId, {
                element: el,
                textRegions: message.textRegions,
                container,
                targetLanguage: settingsRef.current.targetLanguage,
              });
              return m;
            });
          }
        }
        return false;
      }
      if (message.action === "BATCH_COMPLETE") {
        if (message.isFinal) {
          processingRef.current = false;
          if (message.stopped) {
          } else if (!message.success) {
            notifyPopup({ action: "ERROR", error: message.error, isRateLimit: message.isRateLimit });
          } else if (message.wasRateLimited) {
            notifyPopup({ action: "ERROR", error: "Rate limit hit — translation completed via fallback model.", isRateLimit: true });
          } else {
            notifyPopup({ action: "PROGRESS_UPDATE", current: message.total, total: message.total, status: "complete" });
          }
        }
        return false;
      }
      if (message.action === "START_TRANSLATION") {
        if (message.settings) {
          settingsRef.current = message.settings;
        }
        sendResponse({ success: true });
        translationHandlerRef.current?.();
        return false;
      }
      if (message.action === "STOP_TRANSLATION") {
        processingRef.current = false;
        sendResponse({ success: true });
        return false;
      }
    };
    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, []);

  useEffect(() => {
    return () => {
      processingRef.current = false;
      document.querySelectorAll(".manga-translator-overlay-container").forEach((el) => el.remove());
    };
  }, []);

  return (
    <>
      {Array.from(overlays.entries()).map(([imageId, data]) => {
        if (!data.container) return null;
        return createPortal(
          <TranslationOverlay
            key={imageId}
            imageElement={data.element}
            textRegions={data.textRegions}
            container={data.container}
            targetLanguage={data.targetLanguage}
            onClose={() => {
              data.container.remove();
              setOverlays((prev) => { const m = new Map(prev); m.delete(imageId); return m; });
            }}
          />,
          data.container as Element,
        );
      })}
    </>
  );
};

export default MangaTranslator;
