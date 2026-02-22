import { useEffect, useState } from "react";
import { authClient } from "~/auth/auth-client";

type Status = "pending" | "success" | "error";

function AuthCallback() {
  const [status, setStatus] = useState<Status>("pending");

  useEffect(() => {
    authClient.getSession().then((session) => {
      if (session?.data) {
        setStatus("success");
      } else {
        setStatus("error");
      }
    }).catch(() => {
      setStatus("error");
    });
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
            <p style={{ color: "#888", fontSize: "14px", margin: "0 0 20px" }}>
              Click the Panora extension icon in your toolbar to continue.
            </p>
            <button
              onClick={() => window.close()}
              style={{
                padding: "10px 24px",
                background: "#C15F3C",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "'Inter', sans-serif",
              }}
            >
              Close tab
            </button>
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
