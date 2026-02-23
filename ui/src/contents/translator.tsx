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

  const processSingleImage = useCallback(
    async (image: { id: string; element: HTMLImageElement; dataUrl: string }): Promise<{ isRateLimit: boolean; success: boolean }> => {
      try {
        const response = await sendToBackground({
          action: "PROCESS_IMAGES",
          images: [{ id: image.id, dataUrl: image.dataUrl, bounds: { x: 0, y: 0, width: 0, height: 0 } }],
          settings: settingsRef.current,
        });

        if (response?.isRateLimit) {
          console.error("[TRANSLATOR] Rate limit hit:", response.error);
          return { isRateLimit: true, success: false };
        }

        if (response?.success && response.results?.length > 0) {
          const result = response.results[0];
          if (result.textRegions && result.textRegions.length > 0) {
            const container = createOverlayContainer(image.element, image.id);
            setOverlays((prev) => {
              const m = new Map(prev);
              m.set(image.id, { element: image.element, textRegions: result.textRegions, container });
              return m;
            });
            console.log(`[TRANSLATOR] Overlay applied: ${result.textRegions.length} regions`);
          }
          return { isRateLimit: false, success: true };
        } else if (!response?.success && response?.error) {
          console.error("[TRANSLATOR] Failed to process image:", response.error);
        }
      } catch (error: any) {
        console.error("[TRANSLATOR] Failed to process image:", error);
      }
      return { isRateLimit: false, success: false };
    },
    [createOverlayContainer],
  );

  const handleAutoTranslation = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;

    try { await sendToBackground({ action: "CLEAR_CACHE" }); } catch (err) { console.warn("[TRANSLATOR] Failed to clear cache:", err); }

    try {
      const visiblePanels = ImageDetector.findImages().filter((el) => {
        if (!ImageDetector.isMangaPanel(el)) return false;
        const rect = el.getBoundingClientRect();
        return rect.top < window.innerHeight && rect.bottom > 0 && rect.left < window.innerWidth && rect.right > 0;
      });

      const unprocessed = visiblePanels.filter((el) => !el.getAttribute("data-panora-translated"));

      const best = unprocessed.reduce<HTMLImageElement | null>((top, el) => {
        const r = el.getBoundingClientRect();
        const visW = Math.min(r.right, window.innerWidth) - Math.max(r.left, 0);
        const visH = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
        const area = visW * visH;
        if (!top) return el;
        const tr = top.getBoundingClientRect();
        const tvW = Math.min(tr.right, window.innerWidth) - Math.max(tr.left, 0);
        const tvH = Math.min(tr.bottom, window.innerHeight) - Math.max(tr.top, 0);
        return area > tvW * tvH ? el : top;
      }, null);

      const imageElements = best ? [best] : [];

      if (imageElements.length === 0) {
        notifyPopup({ action: "ERROR", error: visiblePanels.length > 0 ? "Current panel already translated" : "No manga panel images found on this page" });
        return;
      }

      const total = imageElements.length;
      notifyPopup({ action: "PROGRESS_UPDATE", current: 0, total, status: "processing" });

      let processed = 0;
      for (let i = 0; i < imageElements.length; i++) {
        if (!processingRef.current) break;
        const el = imageElements[i];
        let dataUrl: string;
        try {
          dataUrl = await ImageDetector.toDataUrl(el);
        } catch (error) {
          console.warn("[TRANSLATOR] Failed to load image:", el.src.substring(0, 80), error);
          notifyPopup({ action: "ERROR", error: "Failed to load image — it may be blocked by CORS or unavailable" });
          continue;
        }
        const id = ImageDetector.generateImageId(el);
        const { isRateLimit, success } = await processSingleImage({ id, element: el, dataUrl });
        if (isRateLimit) {
          notifyPopup({ action: "ERROR", error: "Gemini API rate limit reached. Please wait and try again.", isRateLimit: true });
          return;
        }
        if (success) {
          el.setAttribute("data-panora-translated", "1");
          processed++;
        }
        if (i < imageElements.length - 1) {
          notifyPopup({ action: "PROGRESS_UPDATE", current: i + 1, total, status: "processing" });
        }
      }

      if (processed === 0) notifyPopup({ action: "ERROR", error: "Could not translate any panels. Check your API key and try again." });
      else notifyPopup({ action: "PROGRESS_UPDATE", current: total, total, status: "complete" });
    } catch (error: any) {
      notifyPopup({ action: "ERROR", error: error.message || "Translation failed" });
    } finally {
      processingRef.current = false;
    }
  }, [processSingleImage]);

  useEffect(() => { translationHandlerRef.current = handleAutoTranslation; }, [handleAutoTranslation]);
  useEffect(() => { processingRef.current = false; }, []);

  useEffect(() => {
    const handleMessage = (message: any, _: chrome.runtime.MessageSender, sendResponse: (r?: any) => void) => {
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
        document.querySelectorAll(".manga-translator-overlay-container").forEach((el) => el.remove());
        document.querySelectorAll("[data-panora-translated]").forEach((el) => el.removeAttribute("data-panora-translated"));
        setOverlays(new Map());
        ImageDetector.resetCounter();
        sendResponse({ success: true });
        return false;
      }
      return false;
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
