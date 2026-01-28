import { useState, useEffect } from "react";
import "~/style.css";
import logoSrc from "~/assets/orangesquare.png";
import type {
  TranslationSettings,
  TranslationStatus,
} from "~/types/translator.types";

const LANGUAGES = [
  { code: "en", label: "EN" },
  { code: "ja", label: "JP" },
  { code: "ko", label: "KR" },
  { code: "zh", label: "CN" },
  { code: "es", label: "ES" },
  { code: "fr", label: "FR" },
  { code: "de", label: "DE" },
  { code: "pt", label: "PT" },
  { code: "it", label: "IT" },
  { code: "ar", label: "AR" },
  { code: "th", label: "TH" },
  { code: "vi", label: "VI" },
];

const FEATURES = [
  {
    step: "01",
    title: "Auto Detect",
    desc: "Finds manga panels across the page",
    paths: [
      "M11 3a8 8 0 100 16 8 8 0 000-16zm0 2a6 6 0 110 12 6 6 0 010-12zm4.5 9.5l3 3",
    ],
  },
  {
    step: "02",
    title: "OCR Extract",
    desc: "Reads text from speech bubbles",
    paths: ["M4 4h12v12H4zm2 2v8h8V6H6zm1 1h2v1H7zm0 2h4v1H7zm0 2h3v1H7z"],
  },
  {
    step: "03",
    title: "AI Translate",
    desc: "Translates using Gemini & GPT",
    paths: [
      "M3 8h4l2 3h3l-1 2h2v2H6l-1-2H3V8zm5 6l2 2m0 0l2-2m-2 2v3",
      "M14 3l3 3m-3-3l-1.5 1.5M14 3l1.5 1.5",
    ],
  },
];

function IndexPopup() {
  const [status, setStatus] = useState<TranslationStatus>("idle");
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [savedSettings, setSavedSettings] = useState<TranslationSettings>({
    autoDetectLanguage: true,
    showOriginalText: false,
    targetLanguage: "en",
    useGPTTranslation: true,
  });
  const [draftSettings, setDraftSettings] = useState<TranslationSettings>({
    autoDetectLanguage: true,
    showOriginalText: false,
    targetLanguage: "en",
    useGPTTranslation: true,
  });
  const [saveFlash, setSaveFlash] = useState(false);

  useEffect(() => {
    chrome.storage.local.get(["translationSettings"], (result) => {
      if (result.translationSettings) {
        setSavedSettings(result.translationSettings);
        setDraftSettings(result.translationSettings);
      }
    });
  }, []);

  useEffect(() => {
    if (showSettings) {
      setDraftSettings(savedSettings);
    }
  }, [showSettings, savedSettings]);

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

  const handleSaveSettings = () => {
    setSavedSettings(draftSettings);
    chrome.storage.local.set({ translationSettings: draftSettings });
    setSaveFlash(true);
    setTimeout(() => setSaveFlash(false), 1200);
  };

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
        { action: "START_TRANSLATION", mode: "auto", settings: savedSettings },
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
      chrome.tabs.sendMessage(tab.id, { action: "STOP_TRANSLATION" }, () => {
        if (chrome.runtime.lastError) {
          console.error("Stop translation error:", chrome.runtime.lastError);
        }
      });
      setStatus("idle");
      setProgress({ current: 0, total: 0 });
    } catch (err) {
      console.error("Failed to stop translation:", err);
    }
  };

  const handleLangChange = (lang: string) => {
    const updated = { ...savedSettings, targetLanguage: lang };
    setSavedSettings(updated);
    chrome.storage.local.set({ translationSettings: updated });
  };

  const isTranslating = status === "processing";
  const progressPercent =
    progress.total > 0 ? (progress.current / progress.total) * 100 : 0;
  const logoUrl = logoSrc;

  return (
    <div
      style={{
        width: "400px",
        minHeight: "500px",
        background: "#FAFAFA",
        fontFamily: "'Inter', sans-serif",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes slideDown {
          0% { opacity: 0; transform: translateY(-12px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeInUp {
          0% { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes popIn {
          0% { opacity: 0; transform: scale(0.82) translateY(8px); }
          60% { transform: scale(1.04) translateY(-1px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes iconBounce {
          0%, 100% { transform: translateY(0); }
          40% { transform: translateY(-4px); }
          60% { transform: translateY(-2px); }
        }
        @keyframes glowPulse {
          0%, 100% { opacity: 0.35; transform: scale(1); }
          50% { opacity: 0.55; transform: scale(1.12); }
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes saveFlash {
          0% { background: #C15F3C; }
          50% { background: #4CAF50; }
          100% { background: #C15F3C; }
        }
        @keyframes floatBubble {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-6px) rotate(2deg); }
        }
        @keyframes arrowPulse {
          0%, 100% { opacity: 0.4; transform: translateX(0); }
          50% { opacity: 1; transform: translateX(3px); }
        }
        @keyframes scanLine {
          0% { top: 8px; opacity: 0; }
          20% { opacity: 1; }
          80% { opacity: 1; }
          100% { top: calc(100% - 8px); opacity: 0; }
        }
        @keyframes glyphSwap {
          0%, 40% { opacity: 1; transform: scale(1); }
          50% { opacity: 0; transform: scale(0.6); }
          60% { opacity: 0; }
          70%, 100% { opacity: 1; transform: scale(1); }
        }
        @keyframes dotTrail {
          0% { left: 0%; opacity: 1; }
          100% { left: 100%; opacity: 0; }
        }
        @keyframes chipSlideIn {
          0% { opacity: 0; transform: translateX(-6px); }
          100% { opacity: 1; transform: translateX(0); }
        }
        .panora-settings-overlay {
          animation: slideDown 0.32s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        .panora-settings-item {
          animation: fadeInUp 0.35s ease both;
        }
        .panora-settings-item:nth-child(1) { animation-delay: 0.08s; }
        .panora-settings-item:nth-child(2) { animation-delay: 0.16s; }
        .panora-settings-header {
          background: linear-gradient(90deg, transparent, rgba(193,95,60,0.06) 50%, transparent);
          background-size: 200% 100%;
          animation: shimmer 2.4s linear infinite;
          border-radius: 10px;
          padding: 10px 14px;
        }
        .panora-toggle {
          position: relative;
          width: 40px;
          height: 22px;
          flex-shrink: 0;
        }
        .panora-toggle input {
          opacity: 0;
          width: 0;
          height: 0;
        }
        .panora-toggle-track {
          position: absolute;
          inset: 0;
          background: #E89878;
          border-radius: 22px;
          cursor: pointer;
          transition: background 0.25s ease;
        }
        .panora-toggle input:checked + .panora-toggle-track {
          background: #C15F3C;
        }
        .panora-toggle-track::before {
          content: '';
          position: absolute;
          height: 16px;
          width: 16px;
          left: 3px;
          bottom: 3px;
          background: #FAFAFA;
          border-radius: 50%;
          transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
          box-shadow: 0 1px 4px rgba(0,0,0,0.18);
        }
        .panora-toggle input:checked + .panora-toggle-track::before {
          transform: translateX(18px);
        }
        .panora-btn:hover { opacity: 0.88; }
        .feature-card {
          animation: popIn 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        .feature-card:nth-child(1) { animation-delay: 0.1s; }
        .feature-card:nth-child(2) { animation-delay: 0.2s; }
        .feature-card:nth-child(3) { animation-delay: 0.3s; }
        .feature-card:hover .feature-icon-svg {
          animation: iconBounce 0.5s ease;
        }
        .feature-card:hover {
          border-color: #C15F3C !important;
          box-shadow: 0 4px 14px rgba(193,95,60,0.18) !important;
        }
        .feature-glow {
          animation: glowPulse 2.5s ease-in-out infinite;
        }
        .feature-card:nth-child(1) .feature-glow { animation-delay: 0s; }
        .feature-card:nth-child(2) .feature-glow { animation-delay: 0.8s; }
        .feature-card:nth-child(3) .feature-glow { animation-delay: 1.6s; }
        .lang-chip {
          animation: chipSlideIn 0.3s ease both;
          transition: background 0.2s, color 0.2s, box-shadow 0.2s;
          cursor: pointer;
          border: none;
          outline: none;
        }
        .lang-chip:nth-child(1) { animation-delay: 0.05s; }
        .lang-chip:nth-child(2) { animation-delay: 0.08s; }
        .lang-chip:nth-child(3) { animation-delay: 0.11s; }
        .lang-chip:nth-child(4) { animation-delay: 0.14s; }
        .lang-chip:nth-child(5) { animation-delay: 0.17s; }
        .lang-chip:nth-child(6) { animation-delay: 0.20s; }
        .lang-chip:nth-child(7) { animation-delay: 0.23s; }
        .lang-chip:nth-child(8) { animation-delay: 0.26s; }
        .lang-chip:nth-child(9) { animation-delay: 0.29s; }
        .lang-chip:nth-child(10) { animation-delay: 0.32s; }
        .lang-chip:nth-child(11) { animation-delay: 0.35s; }
        .lang-chip:nth-child(12) { animation-delay: 0.38s; }
        .lang-chip-active {
          background: #C15F3C !important;
          color: #FAFAFA !important;
          box-shadow: 0 2px 8px rgba(193,95,60,0.35) !important;
        }
        .lang-chip:not(.lang-chip-active):hover {
          background: #E89878 !important;
          color: #fff !important;
        }
        .hero-bubble {
          animation: floatBubble 3s ease-in-out infinite;
        }
        .hero-bubble:nth-child(2) { animation-delay: 0.8s; }
        .hero-bubble:nth-child(3) { animation-delay: 1.6s; }
        .hero-arrow {
          animation: arrowPulse 1.2s ease-in-out infinite;
        }
        .hero-arrow:nth-child(2) { animation-delay: 0.3s; }
        .hero-arrow:nth-child(3) { animation-delay: 0.6s; }
        .hero-scan-line {
          position: absolute;
          left: 0;
          right: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent, #FAFAFA, transparent);
          animation: scanLine 2.4s ease-in-out infinite;
          pointer-events: none;
        }
        .hero-glyph {
          animation: glyphSwap 2.8s ease-in-out infinite;
          display: inline-block;
        }
        .hero-glyph:nth-child(2) { animation-delay: 0.7s; }
        .hero-dot {
          position: absolute;
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: rgba(250,250,250,0.5);
          top: 50%;
          animation: dotTrail 1.8s linear infinite;
        }
        .hero-dot:nth-child(2) { animation-delay: 0.6s; }
        .hero-dot:nth-child(3) { animation-delay: 1.2s; }
      `}</style>

      {/* Navbar */}
      <div
        style={{
          position: "sticky",
          top: 0,
          background: "#C15F3C",
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderRadius: "0 0 12px 12px",
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <img
            src={logoUrl}
            alt="Panora"
            style={{ width: "28px", height: "28px", borderRadius: "6px" }}
          />
          <span
            style={{
              color: "#FAFAFA",
              fontSize: "18px",
              fontWeight: 600,
              letterSpacing: "-0.3px",
            }}
          >
            Panora
          </span>
        </div>
        <button
          onClick={() => setShowSettings(!showSettings)}
          style={{
            background: "none",
            border: "none",
            color: "#FAFAFA",
            fontSize: "20px",
            cursor: "pointer",
            padding: "4px 6px",
            borderRadius: "6px",
            lineHeight: 1,
          }}
        >
          ☰
        </button>
      </div>

      {/* Settings Full Overlay */}
      {showSettings && (
        <div
          className="panora-settings-overlay"
          style={{
            position: "absolute",
            top: "52px",
            left: 0,
            right: 0,
            bottom: 0,
            background: "#FAFAFA",
            zIndex: 20,
            display: "flex",
            flexDirection: "column",
            padding: "16px",
            gap: "12px",
          }}
        >
          <div
            className="panora-settings-header"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontSize: "14px",
                fontWeight: 600,
                color: "#C15F3C",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 20 20"
                fill="none"
                stroke="#C15F3C"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="10" cy="10" r="3" />
                <path d="M10 2v2m0 12v2M2 10h2m12 0h2m-2.93-5.07l-1.41 1.41M7.34 12.66l-1.41 1.41m9.14 0l-1.41-1.41M7.34 7.34 5.93 5.93" />
              </svg>
              Settings
            </span>
            <button
              onClick={() => setShowSettings(false)}
              style={{
                background: "rgba(193,95,60,0.08)",
                border: "none",
                color: "#C15F3C",
                fontSize: "14px",
                cursor: "pointer",
                width: "28px",
                height: "28px",
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "background 0.15s",
              }}
            >
              ✕
            </button>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              flex: 1,
            }}
          >
            <label
              className="panora-settings-item"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 14px",
                borderRadius: "12px",
                background: "#fff",
                border: "1.5px solid #E89878",
                cursor: "pointer",
                transition: "border-color 0.2s, box-shadow 0.2s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLLabelElement).style.borderColor =
                  "#C15F3C";
                (e.currentTarget as HTMLLabelElement).style.boxShadow =
                  "0 3px 10px rgba(193,95,60,0.14)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLLabelElement).style.borderColor =
                  "#E89878";
                (e.currentTarget as HTMLLabelElement).style.boxShadow = "none";
              }}
            >
              <div
                style={{ display: "flex", flexDirection: "column", gap: "3px" }}
              >
                <span
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "#C15F3C",
                  }}
                >
                  Auto-detect language
                </span>
                <span style={{ fontSize: "11px", color: "#D4775A" }}>
                  Automatically identify the source language
                </span>
              </div>
              <div className="panora-toggle">
                <input
                  type="checkbox"
                  checked={draftSettings.autoDetectLanguage}
                  onChange={(e) =>
                    setDraftSettings({
                      ...draftSettings,
                      autoDetectLanguage: e.target.checked,
                    })
                  }
                />
                <span className="panora-toggle-track" />
              </div>
            </label>

            <label
              className="panora-settings-item"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 14px",
                borderRadius: "12px",
                background: "#fff",
                border: "1.5px solid #E89878",
                cursor: "pointer",
                transition: "border-color 0.2s, box-shadow 0.2s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLLabelElement).style.borderColor =
                  "#C15F3C";
                (e.currentTarget as HTMLLabelElement).style.boxShadow =
                  "0 3px 10px rgba(193,95,60,0.14)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLLabelElement).style.borderColor =
                  "#E89878";
                (e.currentTarget as HTMLLabelElement).style.boxShadow = "none";
              }}
            >
              <div
                style={{ display: "flex", flexDirection: "column", gap: "3px" }}
              >
                <span
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "#C15F3C",
                  }}
                >
                  Use GPT-4o Mini
                </span>
                <span style={{ fontSize: "11px", color: "#D4775A" }}>
                  Switch between Gemini and GPT models
                </span>
              </div>
              <div className="panora-toggle">
                <input
                  type="checkbox"
                  checked={draftSettings.useGPTTranslation}
                  onChange={(e) =>
                    setDraftSettings({
                      ...draftSettings,
                      useGPTTranslation: e.target.checked,
                    })
                  }
                />
                <span className="panora-toggle-track" />
              </div>
            </label>
          </div>

          <button
            onClick={handleSaveSettings}
            style={{
              padding: "14px",
              background: saveFlash ? "#4CAF50" : "#C15F3C",
              color: "#FAFAFA",
              border: "none",
              borderRadius: "12px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "'Inter', sans-serif",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              boxShadow: "0 3px 12px rgba(193, 95, 60, 0.3)",
              transition: "background 0.3s ease",
              animation: saveFlash ? "saveFlash 1.2s ease" : "none",
            }}
          >
            {saveFlash ? "Saved!" : "Save Settings"}
          </button>
        </div>
      )}

      {/* Body */}
      <div
        style={{
          padding: "20px 20px 24px",
          display: "flex",
          flexDirection: "column",
          gap: "18px",
        }}
      >
        {/* Animated Hero */}
        <div
          style={{
            borderRadius: "14px",
            padding: "20px 16px 18px",
            background:
              "linear-gradient(135deg, #C15F3C 0%, #D4775A 50%, #E89878 100%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "14px",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: "-24px",
              right: "-24px",
              width: "90px",
              height: "90px",
              borderRadius: "50%",
              background: "rgba(250,250,250,0.07)",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: "-18px",
              left: "20px",
              width: "60px",
              height: "60px",
              borderRadius: "50%",
              background: "rgba(250,250,250,0.05)",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: "30%",
              left: "-10px",
              width: "40px",
              height: "40px",
              borderRadius: "50%",
              background: "rgba(250,250,250,0.04)",
            }}
          />

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0",
              width: "100%",
              position: "relative",
              zIndex: 1,
            }}
          >
            {/* Panel 1: Source */}
            <div
              className="hero-bubble"
              style={{
                width: "72px",
                height: "52px",
                background: "rgba(250,250,250,0.15)",
                borderRadius: "16px 16px 16px 4px",
                border: "1.5px solid rgba(250,250,250,0.3)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "3px",
                position: "relative",
              }}
            >
              <div style={{ display: "flex", gap: "3px" }}>
                <span
                  className="hero-glyph"
                  style={{
                    fontSize: "14px",
                    color: "#FAFAFA",
                    animationDuration: "2.8s",
                  }}
                >
                  漢
                </span>
                <span
                  className="hero-glyph"
                  style={{
                    fontSize: "14px",
                    color: "#FAFAFA",
                    animationDelay: "0.7s",
                  }}
                >
                  字
                </span>
              </div>
              <span
                style={{
                  fontSize: "8px",
                  color: "rgba(250,250,250,0.6)",
                  fontWeight: 500,
                }}
              >
                SOURCE
              </span>
            </div>

            {/* Arrow 1 */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "2px",
                padding: "0 4px",
                position: "relative",
                width: "40px",
                height: "52px",
              }}
            >
              <span
                className="hero-arrow"
                style={{
                  fontSize: "14px",
                  color: "#FAFAFA",
                  marginTop: "14px",
                }}
              >
                ›
              </span>
              <span
                className="hero-arrow"
                style={{
                  fontSize: "14px",
                  color: "#FAFAFA",
                  animationDelay: "0.3s",
                }}
              >
                ›
              </span>
              <span
                className="hero-arrow"
                style={{
                  fontSize: "14px",
                  color: "#FAFAFA",
                  animationDelay: "0.6s",
                }}
              >
                ›
              </span>
              <div className="hero-dot" style={{ animationDelay: "0s" }} />
              <div className="hero-dot" style={{ animationDelay: "0.6s" }} />
              <div className="hero-dot" style={{ animationDelay: "1.2s" }} />
            </div>

            {/* Panel 2: OCR */}
            <div
              className="hero-bubble"
              style={{
                width: "72px",
                height: "52px",
                background: "rgba(250,250,250,0.12)",
                borderRadius: "12px",
                border: "1.5px solid rgba(250,250,250,0.25)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "2px",
                position: "relative",
                animationDelay: "0.8s",
              }}
            >
              <div
                style={{ position: "relative", width: "28px", height: "24px" }}
              >
                <div
                  style={{
                    width: "28px",
                    height: "24px",
                    borderRadius: "4px",
                    border: "1.5px dashed rgba(250,250,250,0.5)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="#FAFAFA"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <rect x="3" y="3" width="14" height="14" rx="2" />
                    <line x1="7" y1="8" x2="13" y2="8" />
                    <line x1="7" y1="11" x2="11" y2="11" />
                  </svg>
                </div>
                <div
                  className="hero-scan-line"
                  style={{ left: "0", right: "0" }}
                />
              </div>
              <span
                style={{
                  fontSize: "8px",
                  color: "rgba(250,250,250,0.6)",
                  fontWeight: 500,
                }}
              >
                OCR SCAN
              </span>
            </div>

            {/* Arrow 2 */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "2px",
                padding: "0 4px",
                position: "relative",
                width: "40px",
                height: "52px",
              }}
            >
              <span
                className="hero-arrow"
                style={{
                  fontSize: "14px",
                  color: "#FAFAFA",
                  marginTop: "14px",
                  animationDelay: "0.15s",
                }}
              >
                ›
              </span>
              <span
                className="hero-arrow"
                style={{
                  fontSize: "14px",
                  color: "#FAFAFA",
                  animationDelay: "0.45s",
                }}
              >
                ›
              </span>
              <span
                className="hero-arrow"
                style={{
                  fontSize: "14px",
                  color: "#FAFAFA",
                  animationDelay: "0.75s",
                }}
              >
                ›
              </span>
              <div className="hero-dot" style={{ animationDelay: "0.3s" }} />
              <div className="hero-dot" style={{ animationDelay: "0.9s" }} />
              <div className="hero-dot" style={{ animationDelay: "1.5s" }} />
            </div>

            {/* Panel 3: Translated */}
            <div
              className="hero-bubble"
              style={{
                width: "72px",
                height: "52px",
                background: "rgba(250,250,250,0.18)",
                borderRadius: "16px 16px 4px 16px",
                border: "1.5px solid rgba(250,250,250,0.35)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "3px",
                animationDelay: "1.6s",
              }}
            >
              <span
                style={{
                  fontSize: "11px",
                  color: "#FAFAFA",
                  fontWeight: 600,
                  letterSpacing: "-0.3px",
                }}
              >
                Hello!
              </span>
              <span
                style={{
                  fontSize: "8px",
                  color: "rgba(250,250,250,0.6)",
                  fontWeight: 500,
                }}
              >
                TRANSLATED
              </span>
            </div>
          </div>

          <p
            style={{
              fontSize: "12px",
              color: "rgba(250,250,250,0.85)",
              textAlign: "center",
              lineHeight: 1.5,
              margin: 0,
              fontWeight: 400,
              position: "relative",
              zIndex: 1,
            }}
          >
            Manga panels detected &rarr; OCR scanned &rarr; speech bubbles
            translated
          </p>
        </div>

        {/* Feature cards with animations */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "8px",
          }}
        >
          {FEATURES.map((feat) => (
            <div
              key={feat.title}
              className="feature-card"
              style={{
                background: "#fff",
                border: "1.5px solid #E89878",
                borderRadius: "12px",
                padding: "14px 10px 12px",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "6px",
                position: "relative",
                overflow: "hidden",
                transition: "border-color 0.2s, box-shadow 0.2s",
                cursor: "default",
              }}
            >
              {/* Step badge */}
              <span
                style={{
                  position: "absolute",
                  top: "6px",
                  left: "8px",
                  fontSize: "8px",
                  fontWeight: 700,
                  color: "#E89878",
                  letterSpacing: "0.5px",
                }}
              >
                {feat.step}
              </span>
              {/* Glow circle behind icon */}
              <div
                className="feature-glow"
                style={{
                  position: "absolute",
                  width: "42px",
                  height: "42px",
                  borderRadius: "50%",
                  background: `radial-gradient(circle, rgba(193,95,60,0.18) 0%, transparent 70%)`,
                  top: "16px",
                  left: "50%",
                  transform: "translateX(-50%)",
                }}
              />
              {/* SVG Icon */}
              <svg
                className="feature-icon-svg"
                width="22"
                height="22"
                viewBox="0 0 20 20"
                fill="none"
                stroke="#C15F3C"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ position: "relative", zIndex: 1 }}
              >
                {feat.paths.map((d, pi) => (
                  <path key={pi} d={d} />
                ))}
              </svg>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "#C15F3C",
                  position: "relative",
                  zIndex: 1,
                }}
              >
                {feat.title}
              </span>
              <span
                style={{
                  fontSize: "9px",
                  color: "#D4775A",
                  lineHeight: 1.35,
                  textAlign: "center",
                  position: "relative",
                  zIndex: 1,
                }}
              >
                {feat.desc}
              </span>
            </div>
          ))}
        </div>

        {/* Language chip picker */}
        <div
          style={{
            background: "#fff",
            border: "1.5px solid #E89878",
            borderRadius: "12px",
            padding: "12px 10px 10px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <span
            style={{
              fontSize: "11px",
              fontWeight: 600,
              color: "#C15F3C",
              letterSpacing: "0.4px",
              textTransform: "uppercase",
            }}
          >
            Target Language
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                className={`lang-chip ${savedSettings.targetLanguage === lang.code ? "lang-chip-active" : ""}`}
                onClick={() => handleLangChange(lang.code)}
                style={{
                  padding: "5px 11px",
                  borderRadius: "20px",
                  background:
                    savedSettings.targetLanguage === lang.code
                      ? "#C15F3C"
                      : "rgba(193,95,60,0.07)",
                  color:
                    savedSettings.targetLanguage === lang.code
                      ? "#FAFAFA"
                      : "#C15F3C",
                  fontSize: "11px",
                  fontWeight: 600,
                  fontFamily: "'Inter', sans-serif",
                  boxShadow:
                    savedSettings.targetLanguage === lang.code
                      ? "0 2px 8px rgba(193,95,60,0.35)"
                      : "none",
                }}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </div>

        {/* Action button */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {!isTranslating ? (
            <button
              className="panora-btn"
              onClick={handleStartTranslation}
              style={{
                padding: "14px 16px",
                background: "#C15F3C",
                color: "#FAFAFA",
                border: "none",
                borderRadius: "12px",
                fontSize: "15px",
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "'Inter', sans-serif",
                transition: "opacity 0.15s",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                boxShadow: "0 3px 12px rgba(193, 95, 60, 0.35)",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: "#FAFAFA",
                  boxShadow: "0 0 6px rgba(250,250,250,0.6)",
                }}
              />{" "}
              Translate Manga
            </button>
          ) : (
            <button
              className="panora-btn"
              onClick={handleStopTranslation}
              style={{
                padding: "14px 16px",
                background: "#a84e30",
                color: "#FAFAFA",
                border: "none",
                borderRadius: "12px",
                fontSize: "15px",
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "'Inter', sans-serif",
                transition: "opacity 0.15s",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                boxShadow: "0 3px 12px rgba(168, 78, 48, 0.35)",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: "10px",
                  height: "10px",
                  background: "#FAFAFA",
                  borderRadius: "2px",
                }}
              />{" "}
              Stop
            </button>
          )}
        </div>

        {/* Progress */}
        {progress.total > 0 && (
          <div
            style={{
              background: "#fff",
              border: "1.5px solid #E89878",
              borderRadius: "10px",
              padding: "12px 14px",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: "12px",
                color: "#D4775A",
              }}
            >
              <span
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: "#D4775A",
                    animation: "pulse 1.2s ease infinite",
                  }}
                />
                Processing panels
              </span>
              <span style={{ fontWeight: 600, color: "#C15F3C" }}>
                {progress.current} / {progress.total}
              </span>
            </div>
            <div
              style={{
                width: "100%",
                height: "6px",
                background: "#E89878",
                borderRadius: "9999px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  background: "linear-gradient(90deg, #D4775A, #C15F3C)",
                  borderRadius: "9999px",
                  width: `${progressPercent}%`,
                  transition: "width 0.3s ease",
                }}
              />
            </div>
          </div>
        )}

        {/* Status */}
        {status !== "idle" && (
          <div
            style={{
              textAlign: "center",
              padding: "8px 12px",
              borderRadius: "8px",
              background:
                status === "error"
                  ? "rgba(193, 95, 60, 0.08)"
                  : status === "complete"
                    ? "rgba(76, 175, 80, 0.08)"
                    : "transparent",
            }}
          >
            {status === "processing" && (
              <span style={{ fontSize: "12px", color: "#D4775A" }}>
                <span
                  style={{
                    display: "inline-block",
                    animation: "spin 1s linear infinite",
                    marginRight: "6px",
                  }}
                >
                  ⟳
                </span>
                Translating manga panels...
              </span>
            )}
            {status === "complete" && (
              <span
                style={{ fontSize: "12px", color: "#4CAF50", fontWeight: 500 }}
              >
                Translation complete!
              </span>
            )}
            {status === "error" && error && (
              <span
                style={{ fontSize: "12px", color: "#C15F3C", fontWeight: 500 }}
              >
                {error}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default IndexPopup;
