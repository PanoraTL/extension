import type { PlasmoCSConfig } from "plasmo";
import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import "~/style.css";
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
  wrapper: HTMLElement;
}

const sendMessageSafely = async (message: any): Promise<any> => {
  if (!chrome.runtime?.id) {
    throw new Error("Extension context invalidated - please refresh the page");
  }

  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
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
      reject(error);
    }
  });
};

const MangaTranslator = () => {
  const [overlays, setOverlays] = useState<Map<string, OverlayData>>(new Map());
  const processingRef = useRef(false);

  const createWrapper = useCallback(
    (img: HTMLImageElement, imageId: string): HTMLElement => {
      // Check if wrapper already exists for this image
      const existing = img.parentElement;
      if (
        existing?.classList.contains("manga-translator-wrapper") &&
        existing.getAttribute("data-image-id") === imageId
      ) {
        return existing;
      }

      const wrapper = document.createElement("div");
      wrapper.className = "manga-translator-wrapper";
      wrapper.setAttribute("data-image-id", imageId);

      // The wrapper must be position:relative so the overlay (position:absolute)
      // is positioned relative to it. It must NOT set a fixed width/height —
      // instead it wraps the image tightly so its size always equals the image's
      // current rendered size.
      wrapper.style.position = "relative";
      wrapper.style.display = "inline-block";
      wrapper.style.verticalAlign = "top";
      wrapper.style.lineHeight = "0";
      // Do NOT set explicit width/height — let the image dictate the wrapper size.

      // Make the image fill the wrapper exactly (preserve any site CSS sizing)
      img.style.display = "block";
      img.style.width = "100%";
      img.style.height = "auto";

      const parent = img.parentNode;
      if (parent) {
        parent.insertBefore(wrapper, img);
        wrapper.appendChild(img);
      }

      return wrapper;
    },
    [],
  );

  const processSingleImage = useCallback(
    async (
      image: {
        id: string;
        element: HTMLImageElement;
        dataUrl: string;
        bounds: DOMRect;
      },
      index: number,
      total: number,
    ) => {
      try {
        await sendMessageSafely({
          action: "PROGRESS_UPDATE",
          current: index,
          total,
          status: "processing",
        }).catch(() => {});

        const response = await sendMessageSafely({
          action: "PROCESS_IMAGES",
          images: [
            {
              id: image.id,
              dataUrl: image.dataUrl,
              bounds: {
                x: image.bounds.x,
                y: image.bounds.y,
                width: image.bounds.width,
                height: image.bounds.height,
              },
            },
          ],
          settings: {
            targetLanguage: "en",
            showOriginal: false,
            autoDetectLanguage: true,
          },
        });

        if (response?.success && response.results?.length > 0) {
          const result = response.results[0];
          if (result.textRegions && result.textRegions.length > 0) {
            const wrapper = createWrapper(image.element, image.id);

            setOverlays((prev) => {
              const newMap = new Map(prev);
              newMap.set(image.id, {
                element: image.element,
                textRegions: result.textRegions,
                wrapper,
              });
              return newMap;
            });

            console.log(
              `[TRANSLATOR] Applied overlay for image ${index + 1}/${total}: ${result.textRegions.length} regions`,
            );
          } else {
            console.log(`[TRANSLATOR] No text in image ${index + 1}/${total}`);
          }
        }
      } catch (error) {
        console.error(
          `[TRANSLATOR] Failed to process image ${index + 1}:`,
          error,
        );
      }
    },
    [createWrapper],
  );

  const handleAutoTranslation = useCallback(async () => {
    if (processingRef.current) {
      console.log("[TRANSLATOR] Already processing, ignoring");
      return;
    }
    processingRef.current = true;

    setOverlays(new Map());

    try {
      const images = await ImageDetector.detectImages();
      console.log(
        `[TRANSLATOR] Found ${images.length} manga panels to translate`,
      );

      if (images.length === 0) {
        await sendMessageSafely({
          action: "ERROR",
          error: "No manga panel images found on this page",
        }).catch(() => {});
        return;
      }

      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        await processSingleImage(
          {
            id: img.id,
            element: img.element,
            dataUrl: img.dataUrl,
            bounds: img.bounds,
          },
          i,
          images.length,
        );
      }

      await sendMessageSafely({
        action: "PROGRESS_UPDATE",
        current: images.length,
        total: images.length,
        status: "complete",
      }).catch(() => {});

      console.log("[TRANSLATOR] All images processed");
    } catch (error: any) {
      console.error("[TRANSLATOR] Auto translation error:", error);
      await sendMessageSafely({
        action: "ERROR",
        error: error.message || "Translation failed",
      }).catch(() => {});
    } finally {
      processingRef.current = false;
    }
  }, [processSingleImage]);

  useEffect(() => {
    const handleMessage = (
      message: any,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: any) => void,
    ) => {
      if (message.action === "START_TRANSLATION") {
        handleAutoTranslation();
        sendResponse({ success: true });
        return true;
      }

      if (message.action === "STOP_TRANSLATION") {
        processingRef.current = false;
        setOverlays(new Map());
        sendResponse({ success: true });
        return true;
      }

      return false;
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, [handleAutoTranslation]);

  return (
    <>
      {Array.from(overlays.entries()).map(([imageId, data]) => {
        if (!data.wrapper) return null;

        return createPortal(
          <TranslationOverlay
            key={imageId}
            imageElement={data.element}
            textRegions={data.textRegions}
            onClose={() => {
              setOverlays((prev) => {
                const newMap = new Map(prev);
                newMap.delete(imageId);
                return newMap;
              });
            }}
          />,
          data.wrapper as Element,
        );
      })}
    </>
  );
};

export default MangaTranslator;
