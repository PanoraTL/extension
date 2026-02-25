import { useState } from "react";
import { useNavigate } from "react-router-dom";
import logoSrc from "~/assets/orangesquare.png";
import { authClient } from "./auth-client";

type AuthMode = "login" | "signup";

export function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === "signup") {
        if (password.length < 8) {
          setError("Password must be at least 8 characters");
          setLoading(false);
          return;
        }
        const { error: signUpError } = await authClient.signUp.email({
          name: name || email.split("@")[0],
          email,
          password,
        });
        if (signUpError) {
          setError(signUpError.message || "Sign up failed");
          setLoading(false);
          return;
        }
      } else {
        const { error: signInError } = await authClient.signIn.email({
          email,
          password,
        });
        if (signInError) {
          setError(signInError.message || "Invalid email or password");
          setLoading(false);
          return;
        }
      }
      navigate("/");
    } catch (err: any) {
      setError(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setError(null);
    setLoading(true);
    try {
      const response = await authClient.signIn.social({ provider: "google" });

      if (response.data?.url) {
        const win = await chrome.windows.create({
          url: response.data.url,
          type: "popup",
          width: 500,
          height: 650,
          focused: true,
        });

        const poll = setInterval(async () => {
          try {
            const session = await authClient.getSession();
            if (session?.data) {
              clearInterval(poll);
              chrome.windows.onRemoved.removeListener(onWinRemoved);
              if (win.id) chrome.windows.remove(win.id).catch(() => {});
              navigate("/");
            }
          } catch {
          }
        }, 1500);

        const onWinRemoved = (windowId: number) => {
          if (windowId === win.id) {
            clearInterval(poll);
            chrome.windows.onRemoved.removeListener(onWinRemoved);
            setLoading(false);
          }
        };
        chrome.windows.onRemoved.addListener(onWinRemoved);
      } else if (response.error) {
        setError(response.error.message || "Failed to initiate Google sign-in");
        setLoading(false);
      }
    } catch (err: any) {
      setError(err.message || "Google sign in failed");
      setLoading(false);
    }
  };

  const switchMode = () => {
    setMode(mode === "login" ? "signup" : "login");
    setError(null);
  };

  return (
    <div
      style={{
        width: "400px",
        minHeight: "500px",
        background: "#FAFAFA",
        fontFamily: "'Inter', sans-serif",
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <style>{`
        @keyframes fadeInUp {
          0% { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes popIn {
          0% { opacity: 0; transform: scale(0.82) translateY(8px); }
          60% { transform: scale(1.04) translateY(-1px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .auth-form-field {
          animation: fadeInUp 0.35s ease both;
        }
        .auth-form-field:nth-child(1) { animation-delay: 0.05s; }
        .auth-form-field:nth-child(2) { animation-delay: 0.1s; }
        .auth-form-field:nth-child(3) { animation-delay: 0.15s; }
        .auth-form-field:nth-child(4) { animation-delay: 0.2s; }
        .auth-input:focus {
          outline: none;
          border-color: #C15F3C !important;
          box-shadow: 0 0 0 3px rgba(193, 95, 60, 0.12) !important;
        }
        .auth-input::placeholder {
          color: #D4775A;
          opacity: 0.5;
        }
        .auth-btn:hover { opacity: 0.88; }
        .auth-switch:hover { color: #C15F3C !important; }
        .auth-google-btn:hover {
          border-color: #C15F3C !important;
          box-shadow: 0 4px 14px rgba(193, 95, 60, 0.18) !important;
        }
      `}</style>

      <div
        style={{
          background:
            "linear-gradient(135deg, #C15F3C 0%, #D4775A 50%, #E89878 100%)",
          padding: "32px 20px 28px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "12px",
          position: "relative",
          overflow: "hidden",
          borderRadius: "0 0 16px 16px",
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

        <img
          src={logoSrc}
          alt="Panora"
          style={{
            width: "48px",
            height: "48px",
            borderRadius: "12px",
            animation: "popIn 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both",
            position: "relative",
            zIndex: 1,
          }}
        />
        <div
          style={{
            textAlign: "center",
            position: "relative",
            zIndex: 1,
            animation: "fadeInUp 0.35s ease both",
            animationDelay: "0.1s",
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: "22px",
              fontWeight: 700,
              color: "#FAFAFA",
              letterSpacing: "-0.3px",
            }}
          >
            Panora
          </h1>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: "12px",
              color: "rgba(250,250,250,0.75)",
              fontWeight: 400,
            }}
          >
            {mode === "login" ? "Welcome back" : "Create your account"}
          </p>
        </div>
      </div>

      <div
        style={{
          padding: "24px 24px 20px",
          display: "flex",
          flexDirection: "column",
          gap: "14px",
          flex: 1,
        }}
      >
        <button
          className="auth-google-btn"
          onClick={handleGoogleAuth}
          disabled={loading}
          style={{
            padding: "12px 16px",
            background: "#fff",
            border: "1.5px solid #ddd",
            borderRadius: "12px",
            fontSize: "13px",
            fontWeight: 600,
            color: "#333",
            cursor: loading ? "not-allowed" : "pointer",
            fontFamily: "'Inter', sans-serif",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "10px",
            opacity: loading ? 0.5 : 1,
            animation: "fadeInUp 0.35s ease both",
            transition: "all 0.2s ease",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Continue with Google
        </button>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            animation: "fadeInUp 0.35s ease both",
            animationDelay: "0.05s",
          }}
        >
          <div
            style={{
              flex: 1,
              height: "1px",
              background: "#E89878",
              opacity: 0.4,
            }}
          />
          <span style={{ fontSize: "11px", color: "#D4775A", fontWeight: 500 }}>
            Use Email & Password
          </span>
          <div
            style={{
              flex: 1,
              height: "1px",
              background: "#E89878",
              opacity: 0.4,
            }}
          />
        </div>

        <form
          onSubmit={handleEmailAuth}
          style={{ display: "flex", flexDirection: "column", gap: "10px" }}
        >
          {mode === "signup" && (
            <div className="auth-form-field">
              <label
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "#C15F3C",
                  letterSpacing: "0.4px",
                  textTransform: "uppercase",
                  marginBottom: "4px",
                  display: "block",
                }}
              >
                Name
              </label>
              <input
                className="auth-input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                style={{
                  width: "100%",
                  padding: "11px 14px",
                  background: "#fff",
                  border: "1.5px solid #E89878",
                  borderRadius: "10px",
                  fontSize: "13px",
                  color: "#C15F3C",
                  fontFamily: "'Inter', sans-serif",
                  transition: "border-color 0.2s, box-shadow 0.2s",
                  boxSizing: "border-box",
                }}
              />
            </div>
          )}

          <div className="auth-form-field">
            <label
              style={{
                fontSize: "11px",
                fontWeight: 600,
                color: "#C15F3C",
                letterSpacing: "0.4px",
                textTransform: "uppercase",
                marginBottom: "4px",
                display: "block",
              }}
            >
              Email
            </label>
            <input
              className="auth-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              style={{
                width: "100%",
                padding: "11px 14px",
                background: "#fff",
                border: "1.5px solid #E89878",
                borderRadius: "10px",
                fontSize: "13px",
                color: "#C15F3C",
                fontFamily: "'Inter', sans-serif",
                transition: "border-color 0.2s, box-shadow 0.2s",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div className="auth-form-field">
            <label
              style={{
                fontSize: "11px",
                fontWeight: 600,
                color: "#C15F3C",
                letterSpacing: "0.4px",
                textTransform: "uppercase",
                marginBottom: "4px",
                display: "block",
              }}
            >
              Password
            </label>
            <input
              className="auth-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={
                mode === "signup" ? "Min 8 characters" : "Your password"
              }
              required
              minLength={mode === "signup" ? 8 : undefined}
              style={{
                width: "100%",
                padding: "11px 14px",
                background: "#fff",
                border: "1.5px solid #E89878",
                borderRadius: "10px",
                fontSize: "13px",
                color: "#C15F3C",
                fontFamily: "'Inter', sans-serif",
                transition: "border-color 0.2s, box-shadow 0.2s",
                boxSizing: "border-box",
              }}
            />
          </div>

          {error && (
            <div
              style={{
                padding: "10px 14px",
                background: "rgba(193, 95, 60, 0.08)",
                borderRadius: "10px",
                fontSize: "12px",
                color: "#C15F3C",
                fontWeight: 500,
                animation: "fadeInUp 0.25s ease both",
              }}
            >
              {error}
            </div>
          )}

          <button
            className="auth-btn"
            type="submit"
            disabled={loading}
            style={{
              padding: "13px 16px",
              background: "#C15F3C",
              color: "#FAFAFA",
              border: "none",
              borderRadius: "12px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              fontFamily: "'Inter', sans-serif",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              boxShadow: "0 3px 12px rgba(193, 95, 60, 0.35)",
              transition: "opacity 0.15s",
              opacity: loading ? 0.7 : 1,
              marginTop: "4px",
            }}
          >
            {loading ? (
              <>
                <span
                  style={{
                    display: "inline-block",
                    animation: "spin 1s linear infinite",
                  }}
                >
                  ⟳
                </span>
                {mode === "signup" ? "Creating account..." : "Signing in..."}
              </>
            ) : (
              <>
                <span
                  style={{
                    display: "inline-block",
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: "#FAFAFA",
                    boxShadow: "0 0 6px rgba(250,250,250,0.6)",
                  }}
                />
                {mode === "signup" ? "Create Account" : "Sign In"}
              </>
            )}
          </button>
        </form>

        <div
          style={{
            textAlign: "center",
            paddingTop: "4px",
            animation: "fadeInUp 0.35s ease both",
            animationDelay: "0.25s",
          }}
        >
          <span style={{ fontSize: "12px", color: "#D4775A" }}>
            {mode === "login"
              ? "Don't have an account? "
              : "Already have an account? "}
          </span>
          <button
            className="auth-switch"
            onClick={switchMode}
            style={{
              background: "none",
              border: "none",
              fontSize: "12px",
              fontWeight: 600,
              color: "#D4775A",
              cursor: "pointer",
              fontFamily: "'Inter', sans-serif",
              padding: 0,
              textDecoration: "underline",
              textUnderlineOffset: "2px",
              transition: "color 0.15s",
            }}
          >
            {mode === "login" ? "Sign up" : "Log in"}
          </button>
        </div>
      </div>
    </div>
  );
}
