import { ReactNode, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";

/**
 * Wraps a registration / onboarding step and adds a small floating "Sign out"
 * button, so a student who is stuck (payment, onboarding, exam, awaiting level…)
 * can always log out and switch account. The button only shows when someone is
 * actually signed in.
 */
const WithSignOut = ({ children }: { children: ReactNode }) => {
  const { user, signOut } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const handleSignOut = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await signOut();
    } finally {
      setBusy(false);
      navigate("/login", { replace: true });
    }
  };

  return (
    <>
      {children}
      {user && (
        <button
          onClick={handleSignOut}
          disabled={busy}
          aria-label={t("Sign out", "تسجيل الخروج")}
          style={{
            position: "fixed",
            top: "calc(env(safe-area-inset-top, 0px) + 10px)",
            insetInlineEnd: 10,
            zIndex: 40,
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "7px 12px",
            borderRadius: 999,
            border: "1px solid rgba(15,45,31,0.18)",
            background: "rgba(255,255,255,0.92)",
            backdropFilter: "blur(6px)",
            color: "#0f2d1f",
            fontSize: 12,
            fontWeight: 700,
            fontFamily: "'Cairo', sans-serif",
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.6 : 1,
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          }}
        >
          <LogOut size={14} />
          {busy ? t("Signing out…", "جارٍ الخروج…") : t("Sign out", "تسجيل الخروج")}
        </button>
      )}
    </>
  );
};

export default WithSignOut;
