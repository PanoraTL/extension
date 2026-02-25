import { MemoryRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
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

function IndexPopup() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) return <LoadingSpinner />;

  return (
    <MemoryRouter initialEntries={["/"]}>
      <Toaster position="top-center" />
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
    </MemoryRouter>
  );
}

export default IndexPopup;
