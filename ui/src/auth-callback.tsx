import { useEffect, useState } from "react";
import { authClient } from "~/auth/auth-client";

function AuthCallback() {
  const [status, setStatus] = useState("Processing authentication...");

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Get the session after OAuth callback
        const session = await authClient.getSession();

        if (session?.data) {
          setStatus("Authentication successful!");
          chrome.runtime.sendMessage({ action: "GOOGLE_AUTH_SUCCESS" });
          window.close();
        } else {
          setStatus("Authentication failed. Please try again.");
        }
      } catch (error) {
        console.error("Auth callback error:", error);
        setStatus("Authentication error. Please try again.");
      }
    };

    handleCallback();
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
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          textAlign: "center",
          maxWidth: "400px",
        }}
      >
        <h2 style={{ marginBottom: "16px", color: "#333" }}>Panora Auth</h2>
        <p style={{ color: "#666" }}>{status}</p>
      </div>
    </div>
  );
}

export default AuthCallback;
