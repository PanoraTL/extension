import { useNavigate } from "react-router-dom";
import logoSrc from "~/assets/orangesquare.png";
import { AccountMenu } from "~/auth/AccountMenu";

interface NavBarProps {
  session: any;
  showBack?: boolean;
}

export function NavBar({ session, showBack = false }: NavBarProps) {
  const navigate = useNavigate();

  return (
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
        zIndex: 30,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <img
          src={logoSrc}
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
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <AccountMenu
          user={{
            name: session.user?.name,
            email: session.user?.email,
            image: session.user?.image,
          }}
        />
        {showBack ? (
          <button
            type="button"
            onClick={() => navigate("/")}
            style={{
              background: "none",
              border: "none",
              color: "#FAFAFA",
              fontSize: "20px",
              cursor: "pointer",
              padding: "4px 6px",
              borderRadius: "6px",
              lineHeight: 1,
              display: "flex",
              alignItems: "center",
            }}
          >
            ←
          </button>
        ) : (
          <button
            type="button"
            onClick={() => navigate("/settings")}
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
        )}
      </div>
    </div>
  );
}
