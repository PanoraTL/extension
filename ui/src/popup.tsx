import { MemoryRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { useEffect } from "react";
import "~/style.css";
import logoSrc from "~/assets/orangesquare.png";
import { authClient } from "~/auth/auth-client";
import { AuthPage } from "~/auth/AuthPage";
import { MainPage } from "~/popup/MainPage";
import { SettingsPage } from "~/popup/SettingsPage";

function LoadingSpinner() {
  return (
    <div
      style={{
        width: "400px",
        minHeight: "500px",
        background: "#FAFAFA",
        fontFamily: "'Inter', sans-serif",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: "12px",
      }}
    >
      <img
        src={logoSrc}
        alt="Panora"
        style={{ width: "48px", height: "48px", borderRadius: "12px" }}
      />
      <span
        style={{
          display: "inline-block",
          animation: "spin 1s linear infinite",
          fontSize: "18px",
          color: "#C15F3C",
        }}
      >
        ⟳
      </span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function AppRoutes() {
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    const storageHandler = (e: StorageEvent) => {
      if (e.key === "better-auth_cookie") {
        authClient.updateSession();
      }
    };
    window.addEventListener("storage", storageHandler);

    const messageHandler = (msg: any) => {
      if (msg.action === "AUTH_SESSION_UPDATED") {
        authClient.updateSession();
      }
    };
    chrome.runtime.onMessage.addListener(messageHandler);

    return () => {
      window.removeEventListener("storage", storageHandler);
      chrome.runtime.onMessage.removeListener(messageHandler);
    };
  }, []);

  if (isPending) return <LoadingSpinner />;

  return (
    <Routes>
      <Route
        path="/auth"
        element={!session ? <AuthPage /> : <Navigate to="/" replace />}
      />
      <Route
        path="/"
        element={session ? <MainPage session={session} /> : <Navigate to="/auth" replace />}
      />
      <Route
        path="/settings"
        element={session ? <SettingsPage session={session} /> : <Navigate to="/auth" replace />}
      />
    </Routes>
  );
}

function IndexPopup() {
  return (
    <MemoryRouter initialEntries={["/"]}>
      <Toaster position="top-center" />
      <AppRoutes />
    </MemoryRouter>
  );
}

export default IndexPopup;
