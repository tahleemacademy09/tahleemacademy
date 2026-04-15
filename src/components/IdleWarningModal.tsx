import { useIdleLogout } from "@/hooks/useIdleLogout";
import { useLocation } from "react-router-dom";
import { useLiveClass } from "@/contexts/LiveClassContext";

// Never show idle warning on exam or public pages
const EXEMPT_PATHS = ["/exam-taking", "/entrance-exam", "/login", "/register", "/"];

export default function IdleWarningModal() {
  const location  = useLocation();
  const isExempt  = EXEMPT_PATHS.some(p => location.pathname.startsWith(p));

  // Suspend idle logout while user is in a live class
  const { inCall }  = useLiveClass();
  const { showWarn, countdown, stayLoggedIn } = useIdleLogout(inCall);

  if (isExempt || !showWarn) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 99999,
      background: "rgba(0,0,0,.6)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16,
    }}>
      <div style={{
        background: "#fff", borderRadius: 20, padding: "32px 28px",
        maxWidth: 400, width: "100%", textAlign: "center",
        boxShadow: "0 24px 64px rgba(0,0,0,.3)",
      }}>
        <div style={{ fontSize: 52, marginBottom: 12 }}>⏰</div>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: "#111", margin: "0 0 8px" }}>
          Still there?
        </h2>
        <p style={{ fontSize: 14, color: "#6B7280", margin: "0 0 20px", lineHeight: 1.6 }}>
          You've been inactive for a while. You'll be logged out in:
        </p>
        <div style={{
          fontSize: 56, fontWeight: 900,
          color: countdown <= 10 ? "#DC2626" : "#064E3B",
          lineHeight: 1, marginBottom: 24,
        }}>
          {countdown}s
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={stayLoggedIn}
            style={{
              flex: 1, padding: "13px", borderRadius: 12, border: "none",
              background: "#064E3B", color: "#fff", cursor: "pointer",
              fontWeight: 700, fontSize: 15,
            }}>
            ✅ Keep me logged in
          </button>
        </div>
        <p style={{ fontSize: 11, color: "#D1D5DB", marginTop: 12 }}>
          For your security, inactive sessions are logged out after {IDLE_MINUTES} minutes.
        </p>
      </div>
    </div>
  );
}

const IDLE_MINUTES = 30;
