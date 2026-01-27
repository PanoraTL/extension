import type { PlasmoCSConfig } from "plasmo";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import "~/style.css";
import type {
  StartTranslationMessage,
  StopTranslationMessage,
  TextRegion,
} from "~/types/translator.types";
import { ImageDetector } from "./services/ImageDetector";
import { TranslationOverlay } from "./components/TranslationOverlay";

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  all_frames: false,
};

const sendMessageSafely = async (message: any): Promise<any> => {
  if (!chrome.runtime?.id) {
    const error = new Error(
      "Extension context invalidated - please refresh the page",
    );
    console.error("[TRANSLATOR]", error.message);
    throw error;
  }

  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          console.error(
            "[TRANSLATOR] Message error:",
            chrome.runtime.lastError,
          );
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    } catch (error) {
      console.error("[TRANSLATOR] Send message exception:", error);
      reject(error);
    }
  });
};

const MangaTranslator = () => {
  const [_isActive, setIsActive] = useState(false);
  const [overlays, setOverlays] = useState<
    Map<
      string,
      {
        element: HTMLImageElement;
        textRegions: TextRegion[];
        wrapper: HTMLElement;
      }
    >
  >(new Map());

  useEffect(() => {
    const handleMessage = (
      message: any,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: any) => void,
    ) => {
      console.log(
        "[TRANSLATOR] Content script received message:",
        message.action,
      );

      if (message.action === "START_TRANSLATION") {
        setIsActive(true);

        if (message.mode === "auto") {
          handleAutoTranslation();
        } else {
          console.log("[TRANSLATOR] Manual mode not yet implemented");
        }

        sendResponse({ success: true });
        return true;
      }

      if (message.action === "STOP_TRANSLATION") {
        setIsActive(false);
        sendResponse({ success: true });
        return true;
      }

      if (message.action === "ERROR" || message.action === "PROGRESS_UPDATE") {
        chrome.runtime
          .sendMessage(message)
          .catch((err) =>
            console.warn(
              "[TRANSLATOR] Failed to forward message to popup:",
              err,
            ),
          );
        return true;
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

  const handleAutoTranslation = async () => {
    console.log("[TRANSLATOR] Starting auto translation...");

    try {
      const images = await ImageDetector.detectImages();
      console.log(`[TRANSLATOR] Found ${images.length} images to translate`);

      if (images.length === 0) {
        console.warn("[TRANSLATOR] No images found on page");
        return;
      }

      try {
        await sendMessageSafely({
          action: "PROGRESS_UPDATE",
          current: 0,
          total: images.length,
          status: "processing",
        });
      } catch (error) {
        console.warn(
          "[TRANSLATOR] Failed to send progress update (non-critical):",
          error,
        );
      }

      const settings = {
        targetLanguage: "en",
        showOriginal: false,
        autoDetectLanguage: true,
      };

      console.log("[TRANSLATOR] Sending PROCESS_IMAGES to background");
      const response = await sendMessageSafely({
        action: "PROCESS_IMAGES",
        images: images.map((img) => ({
          id: img.id,
          dataUrl: img.dataUrl,
          bounds: {
            x: img.bounds.x,
            y: img.bounds.y,
            width: img.bounds.width,
            height: img.bounds.height,
          },
        })),
        settings,
      });

      if (response && response.success) {
        console.log(
          `[TRANSLATOR] Received ${response.results.length} translation results`,
        );

        const newOverlays = new Map();
        response.results.forEach((result: any) => {
          if (result.textRegions && result.textRegions.length > 0) {
            console.log(
              `[TRANSLATOR] Image ${result.imageId}: ${result.textRegions.length} text regions`,
            );

            const image = images.find((img) => img.id === result.imageId);
            if (image) {
              let wrapper = image.element.parentElement;
              if (!wrapper?.classList.contains("manga-translator-wrapper")) {
                wrapper = document.createElement("div");
                wrapper.className = "manga-translator-wrapper";
                wrapper.style.position = "relative";
                wrapper.style.display = "inline-block";
                image.element.parentNode?.insertBefore(wrapper, image.element);
                wrapper.appendChild(image.element);
              }

              newOverlays.set(result.imageId, {
                element: image.element,
                textRegions: result.textRegions,
                wrapper: wrapper,
              });

              console.log(
                `[TRANSLATOR] Created overlay data for ${result.imageId}`,
              );
            }
          } else {
            console.log(
              `[TRANSLATOR] Image ${result.imageId}: no text detected`,
            );
          }
        });

        setOverlays(newOverlays);
        console.log(`[TRANSLATOR] Created ${newOverlays.size} overlays`);

        try {
          await sendMessageSafely({
            action: "PROGRESS_UPDATE",
            current: images.length,
            total: images.length,
            status: "complete",
          });
        } catch (error) {
          console.warn(
            "[TRANSLATOR] Failed to send completion (non-critical):",
            error,
          );
        }
      } else {
        throw new Error(response?.error || "Processing failed");
      }
    } catch (error: any) {
      console.error("[TRANSLATOR] Auto translation error:", error);
    }
  };

  return (
    <>
      {Array.from(overlays.entries()).map(([imageId, data]) => {
        if (!data.wrapper) return null;

        return createPortal(
          <TranslationOverlay
            key={imageId}
            imageElement={data.element}
            textRegions={data.textRegions}
            showOriginal={false}
            onClose={() => {
              console.log(`[TRANSLATOR] Closing overlay for ${imageId}`);
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
