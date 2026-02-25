import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import type { TranslationSettings, TranslationStatus } from "~/types/translator.types";
import { NavBar } from "./NavBar";

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
    title: "Bubble Detect",
    desc: "Reads text from speech bubbles",
    paths: ["M4 4h12v12H4zm2 2v8h8V6H6zm1 1h2v1H7zm0 2h4v1H7zm0 2h3v1H7z"],
  },
  {
    step: "03",
    title: "AI Translate",
    desc: "Translates using Gemini",
    paths: [
      "M3 8h4l2 3h3l-1 2h2v2H6l-1-2H3V8zm5 6l2 2m0 0l2-2m-2 2v3",
      "M14 3l3 3m-3-3l-1.5 1.5M14 3l1.5 1.5",
    ],
  },
];

interface MainPageProps {
  session: any;
}

export function MainPage({ session }: MainPageProps) {
  const showStoppedToast = () => {
    toast.dismiss();
    toast.custom((t) => (
      <div style={{ position: "relative", background: "#FAFAFA", border: "1.5px solid #888", borderRadius: "10px", padding: "12px 36px 12px 14px", boxShadow: "0 4px 16px rgba(0,0,0,0.10)", fontFamily: "'Inter', sans-serif", minWidth: "260px" }}>
        <button type="button" aria-label="Dismiss notification" onClick={() => toast.dismiss(t)} style={{ position: "absolute", top: "8px", right: "8px", background: "none", border: "none", cursor: "pointer", color: "#888", fontSize: "13px", lineHeight: 1, padding: "2px" }}>✕</button>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "#555" }}>Translation stopped</div>
      </div>
    ), { duration: 3000 });
  };

  const showErrorToast = (title: string, description?: string) => {
    toast.custom((t) => (
      <div style={{ position: "relative", background: "#FAFAFA", border: "1.5px solid #C15F3C", borderRadius: "10px", padding: "12px 36px 12px 14px", boxShadow: "0 4px 16px rgba(193,95,60,0.15)", fontFamily: "'Inter', sans-serif", minWidth: "260px" }}>
        <button type="button" aria-label="Dismiss notification" onClick={() => toast.dismiss(t)} style={{ position: "absolute", top: "8px", right: "8px", background: "none", border: "none", cursor: "pointer", color: "#C15F3C", fontSize: "13px", lineHeight: 1, padding: "2px" }}>✕</button>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "#C15F3C" }}>{title}</div>
        {description && <div style={{ fontSize: "11px", color: "#D4775A", marginTop: "2px" }}>{description}</div>}
      </div>
    ), { duration: 6000 });
  };

  const [status, setStatus] = useState<TranslationStatus>("idle");
  const statusRef = useRef<TranslationStatus>("idle");
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [savedSettings, setSavedSettings] = useState<TranslationSettings>({
    autoDetectLanguage: true,
    showOriginalText: false,
    targetLanguage: "en",
  });
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    chrome.storage.local.get(["translationSettings", "gemini_api_key"], (result) => {
      if (result.translationSettings) {
        setSavedSettings(result.translationSettings);
      }
      if (result.gemini_api_key) {
        setApiKey(result.gemini_api_key.trim());
      }
    });

    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab?.id) return;
      chrome.runtime.sendMessage({ action: "GET_TRANSLATION_STATUS", tabId: tab.id }, (resp) => {
        if (chrome.runtime.lastError || !resp) return;
        if (resp.isProcessing) {
          statusRef.current = "processing";
          setStatus("processing");
          setProgress({ current: resp.completedPanels, total: resp.totalPanels });
        }
      });
    });
  }, []);

  useEffect(() => {
    const handleMessage = (message: any) => {
      if (message.action === "PROGRESS_UPDATE") {
        setProgress({ current: message.current, total: message.total });
        const newStatus = message.status || "processing";
        const prevStatus = statusRef.current;
        statusRef.current = newStatus;
        setStatus(newStatus);
        if (newStatus === "complete" && prevStatus !== "complete") {
          toast.custom((t) => (
            <div style={{ position: "relative", background: "#FAFAFA", border: "1.5px solid #4CAF50", borderRadius: "10px", padding: "12px 36px 12px 14px", boxShadow: "0 4px 16px rgba(193,95,60,0.15)", fontFamily: "'Inter', sans-serif", minWidth: "260px" }}>
              <button type="button" aria-label="Dismiss notification" onClick={() => toast.dismiss(t)} style={{ position: "absolute", top: "8px", right: "8px", background: "none", border: "none", cursor: "pointer", color: "#4CAF50", fontSize: "13px", lineHeight: 1, padding: "2px" }}>✕</button>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "#4CAF50" }}>Translation complete!</div>
              <div style={{ fontSize: "11px", color: "#D4775A", marginTop: "2px" }}>{message.total} panel{message.total !== 1 ? "s" : ""} translated</div>
            </div>
          ), { duration: 4000 });
          statusRef.current = "idle";
          setStatus("idle");
          setProgress({ current: 0, total: 0 });
        }
      } else if (message.action === "ERROR") {
        if (statusRef.current !== "idle") {
          const title = message.isRateLimit ? "Rate limit hit" : "Translation failed";
          showErrorToast(title, message.error || undefined);
        }
        statusRef.current = "idle";
        setStatus("idle");
        setProgress({ current: 0, total: 0 });
      } else if (message.action === "TRANSLATION_STOPPED") {
        statusRef.current = "idle";
        setStatus("idle");
        setProgress({ current: 0, total: 0 });
        showStoppedToast();
      }
    };
    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, []);

  const handleStartTranslation = async () => {
    if (!apiKey.trim()) {
      showErrorToast("No API key set", "Add your Gemini API key in Settings.");
      return;
    }
    setProgress({ current: 0, total: 0 });
    statusRef.current = "processing";
    setStatus("processing");
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) {
        showErrorToast("No active tab found");
        statusRef.current = "idle";
        setStatus("idle");
        return;
      }
      chrome.tabs.sendMessage(
        tab.id,
        { action: "START_TRANSLATION", mode: "auto", settings: savedSettings },
        () => {
          if (chrome.runtime.lastError) {
            showErrorToast("Unexpected error", chrome.runtime.lastError.message);
            statusRef.current = "idle";
            setStatus("idle");
          }
        },
      );
    } catch (err: any) {
      showErrorToast("Failed to start translation", err.message);
      statusRef.current = "idle";
      setStatus("idle");
    }
  };

  const handleStopTranslation = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) return;
      chrome.tabs.sendMessage(tab.id, { action: "STOP_TRANSLATION" }, () => {
        void chrome.runtime.lastError;
      });
      chrome.runtime.sendMessage({ action: "STOP_TRANSLATION", tabId: tab.id }, () => {
        void chrome.runtime.lastError;
      });
      statusRef.current = "idle";
      setStatus("idle");
      setProgress({ current: 0, total: 0 });
      showStoppedToast();
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
  const progressPercent = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;

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
        @keyframes chipSlideIn {
          0% { opacity: 0; transform: translateX(-6px); }
          100% { opacity: 1; transform: translateX(0); }
        }
        @keyframes floatBubble {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-6px) rotate(2deg); }
        }
        @keyframes arrowPulse {
          0%, 100% { opacity: 0.5; transform: translateX(0); }
          50% { opacity: 1; transform: translateX(4px); }
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
          animation: arrowPulse 1.8s ease-in-out infinite;
        }
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
      `}</style>

      <NavBar session={session} showBack={false} />

      <div
        style={{
          padding: "20px 20px 24px",
          display: "flex",
          flexDirection: "column",
          gap: "18px",
        }}
      >
        {/* Hero */}
        <div
          style={{
            borderRadius: "14px",
            padding: "20px 16px 18px",
            background: "linear-gradient(135deg, #C15F3C 0%, #D4775A 50%, #E89878 100%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "14px",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div style={{ position: "absolute", top: "-24px", right: "-24px", width: "90px", height: "90px", borderRadius: "50%", background: "rgba(250,250,250,0.07)" }} />
          <div style={{ position: "absolute", bottom: "-18px", left: "20px", width: "60px", height: "60px", borderRadius: "50%", background: "rgba(250,250,250,0.05)" }} />
          <div style={{ position: "absolute", top: "30%", left: "-10px", width: "40px", height: "40px", borderRadius: "50%", background: "rgba(250,250,250,0.04)" }} />

          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0", width: "100%", position: "relative", zIndex: 1 }}>
            <div className="hero-bubble" style={{ width: "72px", height: "52px", background: "rgba(250,250,250,0.15)", borderRadius: "16px 16px 16px 4px", border: "1.5px solid rgba(250,250,250,0.3)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "3px", position: "relative" }}>
              <div style={{ display: "flex", gap: "3px" }}>
                <span className="hero-glyph" style={{ fontSize: "14px", color: "#FAFAFA", animationDuration: "2.8s" }}>漢</span>
                <span className="hero-glyph" style={{ fontSize: "14px", color: "#FAFAFA", animationDelay: "0.7s" }}>字</span>
              </div>
              <span style={{ fontSize: "8px", color: "rgba(250,250,250,0.6)", fontWeight: 500 }}>SOURCE</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "40px", height: "52px" }}>
              <svg className="hero-arrow" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FAFAFA" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </div>

            <div className="hero-bubble" style={{ width: "72px", height: "52px", background: "rgba(250,250,250,0.12)", borderRadius: "12px", border: "1.5px solid rgba(250,250,250,0.25)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "2px", position: "relative", animationDelay: "0.8s" }}>
              <div style={{ position: "relative", width: "28px", height: "24px" }}>
                <div style={{ width: "28px", height: "24px", borderRadius: "4px", border: "1.5px dashed rgba(250,250,250,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="#FAFAFA" strokeWidth="2" strokeLinecap="round">
                    <rect x="3" y="3" width="14" height="14" rx="2" />
                    <line x1="7" y1="8" x2="13" y2="8" />
                    <line x1="7" y1="11" x2="11" y2="11" />
                  </svg>
                </div>
                <div className="hero-scan-line" style={{ left: "0", right: "0" }} />
              </div>
              <span style={{ fontSize: "8px", color: "rgba(250,250,250,0.6)", fontWeight: 500 }}>DETECTING</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "40px", height: "52px" }}>
              <svg className="hero-arrow" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FAFAFA" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animationDelay: "0.4s" }}>
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </div>

            <div className="hero-bubble" style={{ width: "72px", height: "52px", background: "rgba(250,250,250,0.18)", borderRadius: "16px 16px 4px 16px", border: "1.5px solid rgba(250,250,250,0.35)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "3px", animationDelay: "1.6s" }}>
              <span style={{ fontSize: "11px", color: "#FAFAFA", fontWeight: 600, letterSpacing: "-0.3px" }}>Hello!</span>
              <span style={{ fontSize: "8px", color: "rgba(250,250,250,0.6)", fontWeight: 500 }}>TRANSLATED</span>
            </div>
          </div>

          <p style={{ fontSize: "12px", color: "rgba(250,250,250,0.85)", textAlign: "center", lineHeight: 1.5, margin: 0, fontWeight: 400, position: "relative", zIndex: 1 }}>
            Manga panels detected &rarr; speech bubbles identified &rarr; translated
          </p>
        </div>

        {/* Feature cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
          {FEATURES.map((feat) => (
            <div
              key={feat.title}
              className="feature-card"
              style={{ background: "#fff", border: "1.5px solid #E89878", borderRadius: "12px", padding: "14px 10px 12px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", position: "relative", overflow: "hidden", transition: "border-color 0.2s, box-shadow 0.2s", cursor: "default" }}
            >
              <span style={{ position: "absolute", top: "6px", left: "8px", fontSize: "8px", fontWeight: 700, color: "#E89878", letterSpacing: "0.5px" }}>{feat.step}</span>
              <div className="feature-glow" style={{ position: "absolute", width: "42px", height: "42px", borderRadius: "50%", background: "radial-gradient(circle, rgba(193,95,60,0.18) 0%, transparent 70%)", top: "16px", left: "50%", transform: "translateX(-50%)" }} />
              <svg className="feature-icon-svg" width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="#C15F3C" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ position: "relative", zIndex: 1 }}>
                {feat.paths.map((d, pi) => <path key={pi} d={d} />)}
              </svg>
              <span style={{ fontSize: "11px", fontWeight: 600, color: "#C15F3C", position: "relative", zIndex: 1 }}>{feat.title}</span>
              <span style={{ fontSize: "9px", color: "#D4775A", lineHeight: 1.35, textAlign: "center", position: "relative", zIndex: 1 }}>{feat.desc}</span>
            </div>
          ))}
        </div>

        {/* Language chips */}
        <div style={{ background: "#fff", border: "1.5px solid #E89878", borderRadius: "12px", padding: "12px 10px 10px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <span style={{ fontSize: "11px", fontWeight: 600, color: "#C15F3C", letterSpacing: "0.4px", textTransform: "uppercase" }}>Target Language</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                className={`lang-chip ${savedSettings.targetLanguage === lang.code ? "lang-chip-active" : ""}`}
                onClick={() => handleLangChange(lang.code)}
                style={{ padding: "5px 11px", borderRadius: "20px", background: savedSettings.targetLanguage === lang.code ? "#C15F3C" : "rgba(193,95,60,0.07)", color: savedSettings.targetLanguage === lang.code ? "#FAFAFA" : "#C15F3C", fontSize: "11px", fontWeight: 600, fontFamily: "'Inter', sans-serif", boxShadow: savedSettings.targetLanguage === lang.code ? "0 2px 8px rgba(193,95,60,0.35)" : "none" }}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </div>

        {/* Translate / Stop button */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {!isTranslating ? (
            <button
              className="panora-btn"
              onClick={handleStartTranslation}
              style={{ padding: "14px 16px", background: "#C15F3C", color: "#FAFAFA", border: "none", borderRadius: "12px", fontSize: "15px", fontWeight: 600, cursor: "pointer", fontFamily: "'Inter', sans-serif", transition: "opacity 0.15s", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", boxShadow: "0 3px 12px rgba(193, 95, 60, 0.35)" }}
            >
              <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: "#FAFAFA", boxShadow: "0 0 6px rgba(250,250,250,0.6)" }} />{" "}
              Translate Manga
            </button>
          ) : (
            <button
              className="panora-btn"
              onClick={handleStopTranslation}
              style={{ padding: "14px 16px", background: "#a84e30", color: "#FAFAFA", border: "none", borderRadius: "12px", fontSize: "15px", fontWeight: 600, cursor: "pointer", fontFamily: "'Inter', sans-serif", transition: "opacity 0.15s", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", boxShadow: "0 3px 12px rgba(168, 78, 48, 0.35)" }}
            >
              <span style={{ display: "inline-block", width: "10px", height: "10px", background: "#FAFAFA", borderRadius: "2px" }} />{" "}
              Stop
            </button>
          )}
        </div>

        {/* Progress */}
        {progress.total > 0 && (
          <div style={{ background: "#fff", border: "1.5px solid #E89878", borderRadius: "10px", padding: "12px 14px", display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", color: "#D4775A" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: "#D4775A", animation: "pulse 1.2s ease infinite" }} />
                Processing panels
              </span>
              <span style={{ fontWeight: 600, color: "#C15F3C" }}>{progress.current} / {progress.total}</span>
            </div>
            <div style={{ width: "100%", height: "6px", background: "#E89878", borderRadius: "9999px", overflow: "hidden" }}>
              <div style={{ height: "100%", background: "linear-gradient(90deg, #D4775A, #C15F3C)", borderRadius: "9999px", width: `${progressPercent}%`, transition: "width 0.3s ease" }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
