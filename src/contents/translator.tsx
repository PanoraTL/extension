import type { PlasmoCSConfig } from "plasmo";
import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import "./content.css";
import type { TextRegion } from "~/types/translator.types";
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

const sendToBackground = async (
  message: any,
  timeoutMs = 10000,
): Promise<any> => {
  if (!chrome.runtime?.id) {
    throw new Error("Extension context invalidated - please refresh the page");
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Message timeout: ${message.action}`));
    }, timeoutMs);

    try {
      chrome.runtime.sendMessage(message, (response) => {
        clearTimeout(timer);
        if (chrome.runtime.lastError) {
          reject(
            new Error(
              chrome.runtime.lastError.message || "Message send failed",
            ),
          );
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
  try {
    chrome.runtime.sendMessage(message, () => {
      void chrome.runtime.lastError;
    });
  } catch {
    // Extension context invalidated
  }
};

const MangaTranslator = () => {
  const [overlays, setOverlays] = useState<Map<string, OverlayData>>(new Map());
  const processingRef = useRef(false);
  const translationHandlerRef = useRef<(() => Promise<void>) | null>(null);

  const createOverlayContainer = useCallback(
    (img: HTMLImageElement, imageId: string): HTMLElement => {
      const existingContainer = document.querySelector(
        `[data-overlay-image-id="${imageId}"]`,
      );
      if (existingContainer) {
        existingContainer.remove();
      }

      const container = document.createElement("div");
      container.className = "manga-translator-overlay-container";
      container.setAttribute("data-overlay-image-id", imageId);

      container.style.position = "absolute";
      container.style.pointerEvents = "none";
      container.style.zIndex = "9999";
      container.style.top = "0px";
      container.style.left = "0px";
      container.style.width = "0px";
      container.style.height = "0px";

      let positionedParent: HTMLElement | null = img.parentElement;
      while (positionedParent) {
        const style = window.getComputedStyle(positionedParent);
        if (style.position !== "static") break;
        positionedParent = positionedParent.parentElement;
      }

      if (!positionedParent) {
        const directParent = img.parentElement || document.body;
        directParent.style.position = "relative";
        positionedParent = directParent;
      }

      positionedParent.appendChild(container);
      return container;
    },
    [],
  );

  const processSingleImage = useCallback(
    async (
      image: { id: string; element: HTMLImageElement; dataUrl: string },
      index: number,
      total: number,
    ) => {
      try {
        console.log(
          `[TRANSLATOR] Sending image ${index + 1}/${total} to API: ${image.id}`,
        );

        const response = await sendToBackground({
          action: "PROCESS_IMAGES",
          images: [
            {
              id: image.id,
              dataUrl: image.dataUrl,
              bounds: { x: 0, y: 0, width: 0, height: 0 },
            },
          ],
          settings: {
            targetLanguage: "en",
            showOriginal: false,
            autoDetectLanguage: true,
          },
        });

        console.log(
          `[TRANSLATOR] Response for image ${index + 1}/${total}:`,
          response?.success,
          response?.results?.length,
        );

        if (response?.success && response.results?.length > 0) {
          const result = response.results[0];
          if (result.textRegions && result.textRegions.length > 0) {
            const container = createOverlayContainer(image.element, image.id);

            setOverlays((prev) => {
              const newMap = new Map(prev);
              newMap.set(image.id, {
                element: image.element,
                textRegions: result.textRegions,
                container,
              });
              return newMap;
            });

            console.log(
              `[TRANSLATOR] Overlay applied for image ${index + 1}/${total}: ${result.textRegions.length} regions`,
            );
          } else {
            console.log(`[TRANSLATOR] No text in image ${index + 1}/${total}`);
          }
        } else {
          console.log(
            `[TRANSLATOR] Empty/failed response for image ${index + 1}/${total}`,
            response,
          );
        }
      } catch (error) {
        console.error(
          `[TRANSLATOR] Failed to process image ${index + 1}:`,
          error,
        );
      }
    },
    [createOverlayContainer],
  );

  const handleAutoTranslation = useCallback(async () => {
    if (processingRef.current) {
      console.log("[TRANSLATOR] Already processing, ignoring");
      return;
    }
    processingRef.current = true;

    document
      .querySelectorAll(".manga-translator-overlay-container")
      .forEach((el) => el.remove());
    setOverlays(new Map());

    try {
      const images = await ImageDetector.detectImages();
      console.log(
        `[TRANSLATOR] Found ${images.length} manga panels to translate`,
      );

      if (images.length === 0) {
        notifyPopup({
          action: "ERROR",
          error: "No manga panel images found on this page",
        });
        return;
      }

      notifyPopup({
        action: "PROGRESS_UPDATE",
        current: 0,
        total: images.length,
        status: "processing",
      });

      const promises = images.map((img, i) => {
        if (!processingRef.current) return Promise.resolve();

        return processSingleImage(
          { id: img.id, element: img.element, dataUrl: img.dataUrl },
          i,
          images.length,
        ).then(() => {
          notifyPopup({
            action: "PROGRESS_UPDATE",
            current: i + 1,
            total: images.length,
            status: i === images.length - 1 ? "complete" : "processing",
          });
        });
      });

      await Promise.all(promises);

      console.log("[TRANSLATOR] All images processed");
    } catch (error: any) {
      console.error("[TRANSLATOR] Auto translation error:", error);
      notifyPopup({
        action: "ERROR",
        error: error.message || "Translation failed",
      });
    } finally {
      processingRef.current = false;
    }
  }, [processSingleImage]);

  useEffect(() => {
    translationHandlerRef.current = handleAutoTranslation;
  }, [handleAutoTranslation]);

  useEffect(() => {
    processingRef.current = false;
  }, []);

  useEffect(() => {
    const handleMessage = (
      message: any,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: any) => void,
    ) => {
      if (message.action === "START_TRANSLATION") {
        sendResponse({ success: true });
        if (translationHandlerRef.current) {
          translationHandlerRef.current();
        }
        return false;
      }

      if (message.action === "STOP_TRANSLATION") {
        processingRef.current = false;
        document
          .querySelectorAll(".manga-translator-overlay-container")
          .forEach((el) => el.remove());
        setOverlays(new Map());
        sendResponse({ success: true });
        return false;
      }

      return false;
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

  useEffect(() => {
    return () => {
      processingRef.current = false;
      document
        .querySelectorAll(".manga-translator-overlay-container")
        .forEach((el) => el.remove());
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
              setOverlays((prev) => {
                const newMap = new Map(prev);
                newMap.delete(imageId);
                return newMap;
              });
            }}
          />,
          data.container as Element,
        );
      })}
    </>
  );
};

export default MangaTranslator;
