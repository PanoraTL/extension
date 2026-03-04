import { getSetCookie } from "@convex-dev/better-auth/client/plugins";
import { useEffect, useState } from "react";

type Status = "pending" | "success" | "error";

function AuthCallback() {
  const [status, setStatus] = useState<Status>("pending");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const winId = params.get("winId") ? Number(params.get("winId")) : undefined;

    (async () => {
      try {
        const result = await chrome.storage.local.get("better_auth_session_cookie");
        const setCookie = result["better_auth_session_cookie"] as string | undefined;
        if (!setCookie) {
          setStatus("error");
          return;
        }
        await chrome.storage.local.remove("better_auth_session_cookie");
        const prev = localStorage.getItem("better-auth_cookie") ?? undefined;
        localStorage.setItem("better-auth_cookie", getSetCookie(setCookie, prev));
        setStatus("success");
        chrome.runtime.sendMessage({ action: "GOOGLE_AUTH_SUCCESS", winId });
        setTimeout(() => {
          chrome.tabs.getCurrent((tab) => {
            if (tab?.id) chrome.tabs.remove(tab.id);
          });
        }, 1000);
      } catch {
        setStatus("error");
      }
    })();
  }, []);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "#FAFAFA",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <div
        style={{
          padding: "40px",
          background: "#fff",
          borderRadius: "12px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
          textAlign: "center",
          maxWidth: "360px",
          width: "100%",
        }}
      >
        <div
          style={{
            width: "48px",
            height: "48px",
            borderRadius: "12px",
            background: "#C15F3C",
            margin: "0 auto 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span style={{ color: "#fff", fontSize: "22px", fontWeight: 700 }}>P</span>
        </div>
        {status === "pending" && (
          <>
            <h2 style={{ margin: "0 0 8px", color: "#C15F3C", fontSize: "18px" }}>Signing you in...</h2>
            <p style={{ color: "#888", fontSize: "14px", margin: 0 }}>Please wait</p>
          </>
        )}
        {status === "success" && (
          <>
            <h2 style={{ margin: "0 0 8px", color: "#C15F3C", fontSize: "18px" }}>You're signed in!</h2>
            <p style={{ color: "#888", fontSize: "14px", margin: 0 }}>Opening Panora...</p>
          </>
        )}
        {status === "error" && (
          <>
            <h2 style={{ margin: "0 0 8px", color: "#C15F3C", fontSize: "18px" }}>Authentication failed</h2>
            <p style={{ color: "#888", fontSize: "14px", margin: 0 }}>Please close this tab and try again.</p>
          </>
        )}
      </div>
    </div>
  );
}

export default AuthCallback;
