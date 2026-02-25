import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { TranslationSettings } from "~/types/translator.types";
import { NavBar } from "./NavBar";

interface SettingsPageProps {
  session: any;
}

export function SettingsPage({ session }: SettingsPageProps) {
  const navigate = useNavigate();

  const [draftSettings, setDraftSettings] = useState<TranslationSettings>({
    autoDetectLanguage: true,
    showOriginalText: false,
    targetLanguage: "en",
  });
  const [apiKey, setApiKey] = useState("");
  const [draftApiKey, setDraftApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saveFlash, setSaveFlash] = useState(false);

  useEffect(() => {
    chrome.storage.local.get(["translationSettings", "gemini_api_key"], (result) => {
      if (result.translationSettings) {
        setDraftSettings(result.translationSettings);
      }
      if (result.gemini_api_key) {
        const storedKey = result.gemini_api_key.trim();
        setApiKey(storedKey);
        setDraftApiKey(storedKey);
      }
    });
  }, []);

  const handleSaveSettings = () => {
    chrome.storage.local.set({ translationSettings: draftSettings });
    const trimmedKey = draftApiKey.trim();
    if (trimmedKey !== apiKey) {
      setApiKey(trimmedKey);
      chrome.storage.local.set({ gemini_api_key: trimmedKey });
      chrome.runtime.sendMessage({ action: "UPDATE_API_KEY", apiKey: trimmedKey });
    }
    setSaveFlash(true);
    setTimeout(() => {
      setSaveFlash(false);
      navigate("/");
    }, 1200);
  };

  return (
    <div
      style={{
        width: "400px",
        minHeight: "500px",
        background: "#FAFAFA",
        fontFamily: "'Inter', sans-serif",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes fadeInUp {
          0% { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
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
      `}</style>

      <NavBar session={session} showBack={true} />

      <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px", flex: 1 }}>
        <div className="panora-settings-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "14px", fontWeight: 600, color: "#C15F3C", display: "flex", alignItems: "center", gap: "8px" }}>
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="#C15F3C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="10" cy="10" r="3" />
              <path d="M10 2v2m0 12v2M2 10h2m12 0h2m-2.93-5.07l-1.41 1.41M7.34 12.66l-1.41 1.41m9.14 0l-1.41-1.41M7.34 7.34 5.93 5.93" />
            </svg>
            Settings
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px", flex: 1 }}>
          <label
            className="panora-settings-item"
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 14px", borderRadius: "12px", background: "#fff", border: "1.5px solid #E89878", cursor: "pointer", transition: "border-color 0.2s, box-shadow 0.2s" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLLabelElement).style.borderColor = "#C15F3C"; (e.currentTarget as HTMLLabelElement).style.boxShadow = "0 3px 10px rgba(193,95,60,0.14)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLLabelElement).style.borderColor = "#E89878"; (e.currentTarget as HTMLLabelElement).style.boxShadow = "none"; }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#C15F3C" }}>Auto-detect language</span>
              <span style={{ fontSize: "11px", color: "#D4775A" }}>Automatically identify the source language</span>
            </div>
            <div className="panora-toggle">
              <input
                type="checkbox"
                checked={draftSettings.autoDetectLanguage}
                onChange={(e) => setDraftSettings({ ...draftSettings, autoDetectLanguage: e.target.checked })}
              />
              <span className="panora-toggle-track" />
            </div>
          </label>

          <div
            className="panora-settings-item"
            style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "16px 14px", borderRadius: "12px", background: "#fff", border: `1.5px solid ${draftApiKey.trim() ? "#E89878" : "#F5C5B0"}` }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#C15F3C" }}>Gemini API Key</span>
              <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" style={{ fontSize: "11px", color: "#D4775A", textDecoration: "none", display: "flex", alignItems: "center", gap: "3px" }}>
                Get a key
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="#D4775A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 10L10 2M10 2H5M10 2V7" />
                </svg>
              </a>
            </div>
            <span style={{ fontSize: "11px", color: "#D4775A" }}>Required for AI translation. Never shared.</span>
            <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
              <div style={{ flex: 1, padding: "9px 12px", borderRadius: "8px", border: "1.5px solid #E89878", fontSize: "12px", fontFamily: "monospace", color: draftApiKey ? "#333" : "#bbb", background: "#FAFAFA", userSelect: "none", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", letterSpacing: draftApiKey && !showApiKey ? "2px" : "normal" }}>
                {draftApiKey ? (showApiKey ? draftApiKey : "•".repeat(Math.min(draftApiKey.length, 24))) : "No key set"}
              </div>
              <div style={{ display: "flex", gap: "0", flexShrink: 0, border: "1.5px solid #E89878", borderRadius: "8px", overflow: "hidden" }}>
                {draftApiKey ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowApiKey((v) => !v)}
                      title={showApiKey ? "Hide key" : "Show key"}
                      style={{ background: showApiKey ? "rgba(193,95,60,0.12)" : "#fff", borderTop: "none", borderBottom: "none", borderLeft: "none", borderRight: "1px solid #E89878", cursor: "pointer", padding: "0 10px", color: "#C15F3C", display: "flex", alignItems: "center", transition: "background 0.15s" }}
                    >
                      {showApiKey ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                          <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(draftApiKey);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 1500);
                        } catch {}
                      }}
                      title="Copy key"
                      style={{ background: copied ? "rgba(76,175,80,0.1)" : "#fff", borderTop: "none", borderBottom: "none", borderLeft: "none", borderRight: "1px solid #E89878", cursor: "pointer", padding: "0 10px", color: copied ? "#4CAF50" : "#C15F3C", display: "flex", alignItems: "center", transition: "background 0.15s, color 0.15s" }}
                    >
                      {copied ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                        </svg>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setDraftApiKey(""); setShowApiKey(false); }}
                      title="Remove key"
                      style={{ background: "#fff", border: "none", cursor: "pointer", padding: "0 10px", color: "#C15F3C", display: "flex", alignItems: "center", transition: "background 0.15s" }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const text = await navigator.clipboard.readText();
                        if (text.trim()) setDraftApiKey(text.trim());
                      } catch {}
                    }}
                    title="Paste key"
                    style={{ background: "#C15F3C", border: "none", cursor: "pointer", padding: "0 14px", color: "#fff", fontSize: "11px", fontWeight: 600, fontFamily: "'Inter', sans-serif", display: "flex", alignItems: "center", gap: "5px" }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" />
                      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                    </svg>
                    Paste
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={handleSaveSettings}
          style={{ padding: "14px", background: saveFlash ? "#4CAF50" : "#C15F3C", color: "#FAFAFA", border: "none", borderRadius: "12px", fontSize: "14px", fontWeight: 600, cursor: "pointer", fontFamily: "'Inter', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", boxShadow: "0 3px 12px rgba(193, 95, 60, 0.3)", transition: "background 0.3s ease" }}
        >
          {saveFlash ? "Saved!" : "Save Settings"}
        </button>
      </div>
    </div>
  );
}
