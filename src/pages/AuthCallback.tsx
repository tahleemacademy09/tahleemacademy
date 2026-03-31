// src/pages/AuthCallback.tsx
// ═══════════════════════════════════════════════════════════════════════════
// OAUTH CALLBACK PAGE
// Route: /auth/callback  ← registered in App.tsx (C-1 fix)
//
// C-3 FIX APPLIED:
//   Teacher redirect was: navigate("/teacher/dashboard")  ← 404, route doesn't exist
//   Teacher redirect now: navigate("/teacher")            ← correct route
//
// How this page works:
//   1. Supabase SDK auto-exchanges the OAuth code from the URL for a session.
//   2. onAuthStateChange in AuthContext fires SIGNED_IN → onUserAuthenticated
//      → initializeTasjeel runs in the background.
//   3. This page polls for the Tasjeel record (up to 5 seconds), then
//      redirects the user to the correct route for their role / pipeline step.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { BookOpen } from "lucide-react";

const G    = "#064E3B";
const GOLD = "#C9973A";

// ── Tasjeel step → route mapping (kept in sync with useTasjeel.ts) ────────
const STEP_ROUTES: Record<string, string> = {
  enrollment:       "/register",
  payment:          "/register",
  onboarding:       "/onboarding",
  exam:             "/student/entrance-exam",
  review:           "/student/entrance-results",
  level_assignment: "/student/awaiting-level",
  completed:        "/student",
};

const AuthCallback = () => {
  const navigate = useNavigate();
  const [status, setStatus]   = useState<"loading" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const processCallback = async () => {
      // Yield briefly so Supabase SDK can finish processing the URL hash/code
      await new Promise((resolve) => setTimeout(resolve, 500));

      const { data: { session }, error } = await supabase.auth.getSession();

      if (error || !session) {
        setStatus("error");
        setErrorMsg(error?.message || "Authentication failed. Please try again.");
        return;
      }

      const userId = session.user.id;

      // ── Check role first — admins and teachers bypass Tasjeel entirely ──
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
        // C-3 FIX: was "/teacher/dashboard" which does not exist as a route.
        // The teacher dashboard is registered at "/teacher" in App.tsx.
        navigate("/teacher", { replace: true });
        return;
      }

      // ── Student: wait for Tasjeel to be initialized then redirect ────────
      // onUserAuthenticated → initializeTasjeel runs async in AuthContext.
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

      // If Tasjeel never initialised (edge case), fall back to student home
      const step = (tasjeel as any)?.current_step ?? "completed";
      const route = STEP_ROUTES[step] ?? "/student";

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
