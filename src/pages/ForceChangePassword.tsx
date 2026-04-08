// src/pages/ForceChangePassword.tsx
// Shown automatically after first login when admin created the account.
// User MUST set a new password before accessing the platform.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { BookOpen, Lock, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";

const G = "#064E3B";

export default function ForceChangePassword() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [password, setPassword]     = useState("");
  const [confirm, setConfirm]       = useState("");
  const [showPw, setShowPw]         = useState(false);
  const [showCf, setShowCf]         = useState(false);
  const [loading, setLoading]       = useState(false);

  const strength = (() => {
    if (password.length === 0) return 0;
    let s = 0;
    if (password.length >= 8)               s++;
    if (/[A-Z]/.test(password))             s++;
    if (/[0-9]/.test(password))             s++;
    if (/[^A-Za-z0-9]/.test(password))     s++;
    return s;
  })();
  const strengthLabel = ["", "Weak", "Fair", "Good", "Strong"][strength];
  const strengthColor = ["", "#DC2626", "#D97706", "#2563EB", "#16A34A"][strength];

  const handleSubmit = async () => {
    if (password.length < 8) {
      toast({ title: "Password too short", description: "Must be at least 8 characters.", variant: "destructive" });
      return;
    }
    if (password !== confirm) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      // Update password
      const { error: pwErr } = await supabase.auth.updateUser({ password });
      if (pwErr) throw pwErr;

      // Clear the must_change_password flag
      const { error: metaErr } = await supabase.auth.updateUser({
        data: { must_change_password: false },
      });
      if (metaErr) throw metaErr;

      toast({ title: "✅ Password set successfully", description: "Welcome to Tahleem Academy!" });

      // Small delay then redirect — auth state will resolve role/redirect
      setTimeout(() => navigate("/", { replace: true }), 800);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#F3F4F6", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 24, width: "100%", maxWidth: 420, overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,.12)" }}>

        {/* Header */}
        <div style={{ background: `linear-gradient(135deg, ${G}, #075E54)`, padding: "28px 24px", textAlign: "center" }}>
          <div style={{ width: 60, height: 60, borderRadius: 16, background: "rgba(255,255,255,.15)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
            <ShieldCheck size={30} color="#fff" />
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 900, color: "#fff", margin: "0 0 6px" }}>Set Your Password</h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,.75)", margin: 0, lineHeight: 1.5 }}>
            Your account was created by an admin.<br />Please set a personal password to continue.
          </p>
        </div>

        {/* Form */}
        <div style={{ padding: "24px 24px 32px", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Info banner */}
          <div style={{ padding: "12px 14px", borderRadius: 12, background: "#FFF8EC", border: "1.5px solid #FDE68A", fontSize: 12, color: "#92400E", lineHeight: 1.5 }}>
            🔐 You must set a new password before accessing your account. Your temporary passcode will no longer work after this.
          </div>

          {/* New password */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".06em" }}>
              New Password
            </label>
            <div style={{ position: "relative" }}>
              <Lock size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
                style={{ width: "100%", padding: "11px 40px 11px 36px", borderRadius: 10, border: "1.5px solid #E5E7EB", fontSize: 14, outline: "none", background: "#FAFAFA", boxSizing: "border-box", fontFamily: "inherit" }}
              />
              <button type="button" onClick={() => setShowPw(v => !v)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", display: "flex" }}>
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {/* Strength bar */}
            {password.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} style={{ flex: 1, height: 4, borderRadius: 99, background: i <= strength ? strengthColor : "#E5E7EB", transition: "background .2s" }} />
                  ))}
                </div>
                <p style={{ fontSize: 11, color: strengthColor, fontWeight: 700, margin: 0 }}>{strengthLabel}</p>
              </div>
            )}
          </div>

          {/* Confirm password */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".06em" }}>
              Confirm Password
            </label>
            <div style={{ position: "relative" }}>
              <Lock size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
              <input
                type={showCf ? "text" : "password"}
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Repeat your password"
                style={{
                  width: "100%", padding: "11px 40px 11px 36px", borderRadius: 10, fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit",
                  border: `1.5px solid ${confirm.length > 0 && confirm !== password ? "#FCA5A5" : "#E5E7EB"}`,
                  background: confirm.length > 0 && confirm !== password ? "#FFF5F5" : "#FAFAFA",
                }}
              />
              <button type="button" onClick={() => setShowCf(v => !v)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", display: "flex" }}>
                {showCf ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {confirm.length > 0 && confirm !== password && (
              <p style={{ fontSize: 11, color: "#DC2626", margin: "4px 0 0", fontWeight: 600 }}>Passwords don't match</p>
            )}
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={loading || !password || !confirm}
            style={{
              width: "100%", padding: "13px", borderRadius: 12, border: "none",
              background: loading || !password || !confirm ? "#E5E7EB" : `linear-gradient(135deg, ${G}, #075E54)`,
              color: loading || !password || !confirm ? "#9CA3AF" : "#fff",
              fontWeight: 800, fontSize: 15, cursor: loading || !password || !confirm ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              boxShadow: loading || !password || !confirm ? "none" : "0 6px 20px rgba(6,78,59,.3)",
              transition: "all .2s",
            }}
          >
            {loading ? <><Loader2 size={16} style={{ animation: "spin .8s linear infinite" }} /> Setting password…</> : "🔒 Set My Password"}
          </button>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
