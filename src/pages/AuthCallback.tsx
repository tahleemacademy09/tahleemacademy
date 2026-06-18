// src/pages/AuthCallback.tsx
// ═══════════════════════════════════════════════════════════════════════════
// OAUTH CALLBACK PAGE
// Route: /auth/callback  ← registered in App.tsx (C-1 fix)
//
// C-3 FIX APPLIED:
//   Teacher redirect was: navigate("/teacher/dashboard")  ← 404, route doesn't exist
//   Teacher redirect now: navigate("/teacher")            ← correct route
//
// PKCE FIX APPLIED:
//   Supabase v2 PKCE flow delivers a ?code= query param that must be manually
//   exchanged for a session via exchangeCodeForSession(). The old code only
//   waited 500 ms then called getSession(), which always returned null for
//   PKCE logins, causing the "Verification Error" screen on every login.
//
// How this page works:
//   1. If ?code= is present (PKCE / Google OAuth), exchange it for a session.
//   2. Otherwise fall back to the legacy hash-based implicit flow (500 ms wait).
//   3. onAuthStateChange in AuthContext fires SIGNED_IN → onUserAuthenticated
//      → initializeTasjeel runs in the background.
//   4. This page polls for the Tasjeel record (up to 5 seconds), then
//      redirects the user to the correct route for their role / pipeline step.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { TASJEEL_ROUTES } from "@/hooks/useTasjeel";
import { BookOpen } from "lucide-react";

const G    = "#064E3B";
const GOLD = "#C9973A";

const AuthCallback = () => {
  const navigate = useNavigate();
  const [status, setStatus]     = useState<"loading" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const processCallback = async () => {
      // ── Step 1: exchange the PKCE code if present ────────────────────────
      // Supabase v2 PKCE flow: the auth code arrives as ?code= in the URL.
      // We MUST call exchangeCodeForSession() — getSession() alone returns
      // null until the exchange has happened, causing the Verification Error.
      const params = new URLSearchParams(window.location.search);
      const code   = params.get("code");

      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          setStatus("error");
          setErrorMsg(exchangeError.message || "Authentication failed. Please try again.");
          return;
        }
      } else {
        // Legacy implicit flow: give the SDK a moment to process the hash
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      // ── Step 2: confirm session exists ───────────────────────────────────
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error || !session) {
        setStatus("error");
        setErrorMsg(error?.message || "Authentication failed. Please try again.");
        return;
      }

      const userId = session.user.id;

      // ── Step 3: check role — admins and teachers bypass Tasjeel ─────────
      const { data: rolesData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      const roles = (rolesData ?? []).map((r: any) => r.role);

      if (roles.includes("admin")) {
        navigate("/admin", { replace: true });
        return;
      }

      if (roles.includes("teacher")) {
        navigate("/teacher", { replace: true });
        return;
      }

      // ── Step 4: student — wait for Tasjeel to initialise ────────────────
      // Poll up to 5 seconds (10 × 500 ms) for the record to appear.
      let tasjeel = null;
      for (let attempt = 0; attempt < 10; attempt++) {
        const { data } = await supabase
          .from("tasjeel_progress" as any)
          .select("current_step")
          .eq("user_id", userId)
          .maybeSingle();

        if (data) {
          tasjeel = data;
          break;
        }
        await new Promise((r) => setTimeout(r, 500));
      }

      // If Tasjeel never initialised (edge case), fall back to student home.
      // NOTE: we don't reuse resolveTasjeelStep()'s "no row + confirmed email
      // = existing user, back-fill completed" rule here — Google/OAuth users
      // have email_confirmed_at set immediately even on a brand-new signup,
      // so that rule would incorrectly skip registration for new Google
      // sign-ups. The polling loop above already gives initializeTasjeel a
      // few seconds to create the real row; "completed" is only the fallback
      // once that window has passed.
      const step  = (tasjeel as any)?.current_step ?? "completed";
      const route = TASJEEL_ROUTES[step] ?? "/student";

      navigate(route, { replace: true });
    };

    processCallback().catch((err) => {
      console.error("[AuthCallback] error:", err);
      setStatus("error");
      setErrorMsg("An unexpected error occurred. Please try signing in again.");
    });
  }, [navigate]);

  // ── Error screen ──────────────────────────────────────────────────────────
  if (status === "error") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#FDFCF9",
          fontFamily: "'DM Sans', sans-serif",
          padding: 24,
          gap: 16,
        }}
      >
        <div
          style={{
            width: 60,
            height: 60,
            borderRadius: "50%",
            background: "#FEF2F2",
            border: "2px solid #FCA5A5",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 28,
          }}
        >
          ✗
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "#111", margin: 0 }}>
          Authentication Failed
        </h2>
        <p
          style={{
            fontSize: 14,
            color: "#6b7280",
            textAlign: "center",
            maxWidth: 320,
            lineHeight: 1.6,
          }}
        >
          {errorMsg}
        </p>
        <button
          onClick={() => navigate("/login", { replace: true })}
          style={{
            padding: "12px 28px",
            background: G,
            color: "#fff",
            border: "none",
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Back to Login
        </button>
      </div>
    );
  }

  // ── Loading screen ────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=DM+Sans:wght@400;500;600&display=swap');
        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:.5} }
        @keyframes fadeUp  { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:none} }
      `}</style>

      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: `linear-gradient(160deg, #042E22 0%, ${G} 60%, #075E54 100%)`,
          fontFamily: "'DM Sans', sans-serif",
          animation: "fadeUp .5s ease",
        }}
      >
        {/* Logo */}
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 22,
            background: "rgba(255,255,255,.1)",
            border: `1.5px solid rgba(201,151,58,.4)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 28,
            backdropFilter: "blur(8px)",
          }}
        >
          <BookOpen style={{ width: 38, height: 38, color: GOLD }} />
        </div>

        {/* Spinner */}
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            border: `3px solid rgba(201,151,58,.3)`,
            borderTopColor: GOLD,
            animation: "spin .8s linear infinite",
            marginBottom: 24,
          }}
        />

        <h2
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: "#fff",
            margin: "0 0 8px",
            letterSpacing: 0.3,
          }}
        >
          Signing you in…
        </h2>

        <p
          style={{
            fontSize: 13,
            color: "rgba(255,255,255,.55)",
            margin: "0 0 16px",
          }}
        >
          Setting up your account, please wait
        </p>

        <p
          style={{
            fontFamily: "'Amiri', serif",
            fontSize: 16,
            color: `rgba(201,151,58,.8)`,
            direction: "rtl",
            animation: "pulse 2s ease infinite",
          }}
        >
          بِسْمِ اللَّهِ
        </p>
      </div>
    </>
  );
};

export default AuthCallback;
