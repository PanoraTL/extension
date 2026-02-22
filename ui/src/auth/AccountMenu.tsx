import { useState, useRef, useEffect } from "react";
import { authClient } from "./auth-client";

function stringToColor(str: string): string {
  const colors = [
    "#C15F3C",
    "#E89878",
    "#D4775A",
    "#a84e30",
    "#e06030",
    "#c97858",
    "#b56848",
    "#d08060",
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function getInitials(
  name: string | undefined,
  email: string | undefined,
): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return "?";
}

interface AccountMenuProps {
  user: {
    name?: string;
    email?: string;
    image?: string | null;
  };
}

export function AccountMenu({ user }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await authClient.signOut();
    } catch (err) {
      console.error("Logout failed:", err);
    } finally {
      setLoggingOut(false);
      setOpen(false);
    }
  };

  const avatarColor = stringToColor(user.email || user.name || "user");
  const initials = getInitials(user.name, user.email);
  const hasImage = !!user.image;

  return (
    <div ref={menuRef} style={{ position: "relative" }}>
      <style>{`
        @keyframes menuSlideDown {
          0% { opacity: 0; transform: translateY(-8px) scale(0.96); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        .account-avatar:hover {
          box-shadow: 0 0 0 2px rgba(250, 250, 250, 0.5) !important;
        }
        .account-logout-btn:hover {
          background: #C15F3C !important;
          color: #FAFAFA !important;
        }
      `}</style>

      <button
        className="account-avatar"
        onClick={() => setOpen(!open)}
        style={{
          width: "28px",
          height: "28px",
          borderRadius: "50%",
          border: "2px solid rgba(250, 250, 250, 0.35)",
          background: hasImage ? "transparent" : avatarColor,
          cursor: "pointer",
          padding: 0,
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "box-shadow 0.2s",
          flexShrink: 0,
        }}
      >
        {hasImage ? (
          <img
            src={user.image!}
            alt="Avatar"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              borderRadius: "50%",
            }}
          />
        ) : (
          <span
            style={{
              fontSize: "11px",
              fontWeight: 700,
              color: "#FAFAFA",
              lineHeight: 1,
              letterSpacing: "-0.3px",
            }}
          >
            {initials}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "36px",
            right: 0,
            width: "220px",
            background: "#fff",
            borderRadius: "12px",
            border: "1.5px solid #E89878",
            boxShadow: "0 8px 24px rgba(193, 95, 60, 0.18)",
            zIndex: 100,
            overflow: "hidden",
            animation:
              "menuSlideDown 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) both",
            fontFamily: "'Inter', sans-serif",
          }}
        >
          <div
            style={{
              padding: "14px 16px",
              borderBottom: "1px solid rgba(232, 152, 120, 0.3)",
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "50%",
                background: hasImage ? "transparent" : avatarColor,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                overflow: "hidden",
              }}
            >
              {hasImage ? (
                <img
                  src={user.image!}
                  alt="Avatar"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    borderRadius: "50%",
                  }}
                />
              ) : (
                <span
                  style={{
                    fontSize: "14px",
                    fontWeight: 700,
                    color: "#FAFAFA",
                  }}
                >
                  {initials}
                </span>
              )}
            </div>
            <div style={{ overflow: "hidden", flex: 1 }}>
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "#C15F3C",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {user.name || "User"}
              </div>
              <div
                style={{
                  fontSize: "11px",
                  color: "#D4775A",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {user.email || ""}
              </div>
            </div>
          </div>

          <div style={{ padding: "8px" }}>
            <button
              className="account-logout-btn"
              onClick={handleLogout}
              disabled={loggingOut}
              style={{
                width: "100%",
                padding: "10px 12px",
                background: "rgba(193, 95, 60, 0.08)",
                border: "none",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 600,
                color: "#C15F3C",
                cursor: loggingOut ? "not-allowed" : "pointer",
                fontFamily: "'Inter', sans-serif",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                transition: "background 0.15s, color 0.15s",
                opacity: loggingOut ? 0.6 : 1,
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M7 17H4a2 2 0 01-2-2V5a2 2 0 012-2h3" />
                <polyline points="11 15 15 10 11 5" />
                <line x1="15" y1="10" x2="5" y2="10" />
              </svg>
              {loggingOut ? "Logging out..." : "Log out"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
