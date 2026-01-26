import type { PlasmoCSConfig } from "plasmo";
import { useState, useEffect } from "react";
import "~/style.css";
import type {
  StartTranslationMessage,
  StopTranslationMessage,
} from "~/types/translator.types";
import { ImageDetector } from "./services/ImageDetector";

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  all_frames: false,
};

const MangaTranslator = () => {
  const [isActive, setIsActive] = useState(false);
  const [mode, setMode] = useState<"manual" | "auto">("auto");

  useEffect(() => {
    const handleMessage = (
      message: StartTranslationMessage | StopTranslationMessage,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response?: any) => void,
    ) => {
      console.log("Content script received message:", message);

      if (message.action === "START_TRANSLATION") {
        setIsActive(true);
        setMode(message.mode);

        if (message.mode === "auto") {
          handleAutoTranslation();
        } else {
        }

        sendResponse({ success: true });
        return true;
      }

      if (message.action === "STOP_TRANSLATION") {
        setIsActive(false);
        sendResponse({ success: true });
        return true;
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

  const handleAutoTranslation = async () => {
    console.log("Starting auto translation...");

    try {
      const images = await ImageDetector.detectImages();
      console.log(`Found ${images.length} images to translate`);

      chrome.runtime.sendMessage({
        action: "PROGRESS_UPDATE",
        current: 0,
        total: images.length,
        status: "processing",
      });
    } catch (error) {
      console.error("Auto translation error:", error);
      chrome.runtime.sendMessage({
        action: "ERROR",
        error: error.message || "Failed to detect images",
      });
    }
  };

  return null;
};

export default MangaTranslator;
