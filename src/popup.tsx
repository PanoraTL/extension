import { useState, useEffect } from "react";
import "~/style.css";
import type {
  TranslationSettings,
  TranslationStatus,
} from "~/types/translator.types";

function IndexPopup() {
  const [status, setStatus] = useState<TranslationStatus>("idle");
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<TranslationSettings>({
    autoDetectLanguage: true,
    showOriginalText: false,
    targetLanguage: "en",
    useGPTTranslation: true,
  });

  useEffect(() => {
    chrome.storage.local.get(["translationSettings"], (result) => {
      if (result.translationSettings) {
        setSettings(result.translationSettings);
      }
    });
  }, []);

  useEffect(() => {
    chrome.storage.local.set({ translationSettings: settings });
  }, [settings]);

  useEffect(() => {
    const handleMessage = (message: any) => {
      if (message.action === "PROGRESS_UPDATE") {
        setProgress({ current: message.current, total: message.total });
        setStatus(message.status || "processing");
      } else if (message.action === "ERROR") {
        setError(message.error);
        setStatus("error");
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, []);

  const handleStartTranslation = async () => {
    setError(null);
    setProgress({ current: 0, total: 0 });
    setStatus("processing");

    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab.id) {
        setError("No active tab found");
        setStatus("error");
        return;
      }

      chrome.tabs.sendMessage(
        tab.id,
        {
          action: "START_TRANSLATION",
          mode: "auto",
          settings,
        },
        () => {
          if (chrome.runtime.lastError) {
            setError(chrome.runtime.lastError.message || "Unexpected error");
            setStatus("error");
          }
        },
      );
    } catch (err: any) {
      setError(err.message || "Failed to start translation");
      setStatus("error");
    }
  };

  const handleStopTranslation = async () => {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab.id) return;

      chrome.tabs.sendMessage(
        tab.id,
        {
          action: "STOP_TRANSLATION",
        },
        () => {
          if (chrome.runtime.lastError) {
            console.error("Stop translation error:", chrome.runtime.lastError);
          }
        },
      );

      setStatus("idle");
      setProgress({ current: 0, total: 0 });
    } catch (err) {
      console.error("Failed to stop translation:", err);
    }
  };

  const isTranslating = status === "processing";
  const progressPercent =
    progress.total > 0 ? (progress.current / progress.total) * 100 : 0;

  return (
    <div className="w-[400px] min-h-[500px] p-6 bg-background">
      <div className="flex flex-col gap-6">
        {}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">
            Manga Translator
          </h1>
        </div>

        {}
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            Automatically detects manga panels and translates speech bubbles one
            at a time
          </p>
        </div>

        {}
        <div className="flex flex-col gap-2">
          {!isTranslating ? (
            <button
              onClick={handleStartTranslation}
              className="px-4 py-3 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors font-medium"
            >
              Translate Manga
            </button>
          ) : (
            <button
              onClick={handleStopTranslation}
              className="px-4 py-3 bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 transition-colors font-medium"
            >
              Stop Translation
            </button>
          )}
        </div>

        {}
        {progress.total > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Progress</span>
              <span className="text-foreground font-medium">
                {progress.current} / {progress.total}
              </span>
            </div>
            <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {}
        {status !== "idle" && (
          <div className="text-sm text-center text-muted-foreground">
            {status === "processing" && "Translating manga panels..."}
            {status === "complete" && "Translation complete!"}
            {status === "error" && error && (
              <span className="text-destructive">{error}</span>
            )}
          </div>
        )}

        {}
        <div className="mt-2 p-4 border border-border rounded-md">
          <h3 className="text-sm font-semibold mb-3">Settings</h3>
          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                className="rounded"
                checked={settings.autoDetectLanguage}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    autoDetectLanguage: e.target.checked,
                  })
                }
              />
              <span>Auto-detect source language</span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                className="rounded"
                checked={settings.showOriginalText}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    showOriginalText: e.target.checked,
                  })
                }
              />
              <span>Show original text</span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                className="rounded"
                checked={settings.useGPTTranslation}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    useGPTTranslation: e.target.checked,
                  })
                }
              />
              <span>Use GPT-4o Mini for translation</span>
            </label>
          </div>
        </div>

        {}
        <div className="text-xs text-muted-foreground text-center">
          Powered by Gemini 2.5 Flash & GPT-4o Mini
        </div>
      </div>
    </div>
  );
}

export default IndexPopup;
