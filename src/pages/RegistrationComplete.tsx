// src/pages/RegistrationComplete.tsx
// ═══════════════════════════════════════════════════════════════════════════
// REGISTRATION COMPLETE — ISLAMIC WELCOME SCREEN
// Route: /registration-complete
//
// Reached after: Recitation test booking confirmed.
// This page:
//  1. Marks tasjeel step as "level_assignment"
//  2. Notifies all admins via notifications table
//  3. Shows an Islamic welcome message
//  4. Signs the user out
//  5. Tells them to log in to access the dashboard
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { BookOpen, CheckCircle2, GraduationCap, Mic, FileText, LogIn } from "lucide-react";

const G    = "#0f2d1f";
const GM   = "#1a4731";
const GOLD = "#c9a84c";

const RegistrationComplete = () => {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [done,  setDone]  = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!user) { setReady(true); return; }
    (async () => {
      try {
        // 1. Advance tasjeel to level_assignment
        await supabase
          .from("tasjeel_progress" as any)
          .update({
            current_step: "level_assignment",
            updated_at:   new Date().toISOString(),
          } as any)
          .eq("user_id", user.id);

        // 2. Fetch all admin user IDs to notify them
        const { data: adminRoles } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin");

        const studentName = profile?.full_name || "A new student";
        const studentEmail = user.email || "";

        // 3. Insert a notification for each admin
        if (adminRoles && adminRoles.length > 0) {
          const notifs = adminRoles.map((r: any) => ({
            user_id:    r.user_id,
            title:      "New Student Ready for Review",
            message:    `${studentName} (${studentEmail}) has completed all registration stages (onboarding, entrance exam, recitation test) and is awaiting level assignment.`,
            type:       "registration_complete",
            is_read:    false,
            created_at: new Date().toISOString(),
            metadata: JSON.stringify({
              student_id:    user.id,
              student_name:  studentName,
              student_email: studentEmail,
              action_url:    "/admin/level-assignment",
            }),
          }));

          await supabase.from("notifications" as any).insert(notifs as any);
        }

        // 4. Also insert a general admin notification if notifications table has a different schema
        //    This is a fallback — write to admin_notifications if it exists
        try {
          await supabase.from("admin_notifications" as any).insert({
            title:   "New Student Ready for Level Assignment",
            message: `${studentName} (${studentEmail}) has completed all registration requirements.`,
            type:    "level_review",
            student_id: user.id,
            created_at: new Date().toISOString(),
            is_read: false,
          } as any);
        } catch (_) { /* table may not exist — ignore */ }

      } catch (err) {
        console.error("[RegistrationComplete] error:", err);
      } finally {
        setDone(true);
        setReady(true);
      }
    })();
  }, [user]); // eslint-disable-line

  const handleFinish = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  if (!ready) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafb" }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", border: `3px solid rgba(15,45,31,.15)`, borderTopColor: G, animation: "spin .8s linear infinite" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Cairo', sans-serif", padding: "24px 16px",
      background: `linear-gradient(160deg, ${G} 0%, ${GM} 50%, #0a1f12 100%)`,
      position: "relative", overflow: "hidden",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Amiri:wght@400;700&display=swap');
        @keyframes fadeUp  { from{opacity:0;transform:translateY(30px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin    { to{transform:rotate(360deg)} }
        @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:.5} }
        @keyframes float   { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        @keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
        .finish-btn:hover  { transform:translateY(-2px); box-shadow:0 12px 32px rgba(201,168,76,.5)!important; }
      `}</style>

      {/* Decorative rings */}
      {[180, 300, 440, 580].map((sz, i) => (
        <div key={i} style={{
          position: "absolute", width: sz, height: sz, borderRadius: "50%",
          border: `1px solid rgba(201,168,76,${.15 - i * .03})`,
          top: "50%", left: "50%", transform: "translate(-50%,-50%)",
          pointerEvents: "none",
        }} />
      ))}

      {/* Islamic pattern overlay */}
      <div style={{
        position: "absolute", inset: 0, opacity: .04, pointerEvents: "none",
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpolygon points='30,2 58,16 58,44 30,58 2,44 2,16' fill='none' stroke='%23c9a84c' stroke-width='1'/%3E%3C/svg%3E")`,
      }} />

      <div style={{ position: "relative", zIndex: 2, width: "100%", maxWidth: 560, animation: "fadeUp .7s ease" }}>

        {/* Bismillah */}
        <p style={{ fontFamily: "'Amiri',serif", fontSize: 22, color: `rgba(201,168,76,.9)`, textAlign: "center", margin: "0 0 20px", direction: "rtl", letterSpacing: 2 }}>
          بِسْمِ اللهِ الرَّحْمَنِ الرَّحِيمِ
        </p>

        {/* Logo */}
        <div style={{ animation: "float 3s ease-in-out infinite", display: "flex", justifyContent: "center", marginBottom: 24 }}>
          <div style={{ width: 80, height: 80, borderRadius: 24, background: "rgba(201,168,76,.15)", border: "2px solid rgba(201,168,76,.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <BookOpen style={{ width: 38, height: 38, color: GOLD }} />
          </div>
        </div>

        {/* Success tick */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
          <div style={{ width: 80, height: 80, borderRadius: "50%", background: "rgba(34,197,94,.15)", border: "3px solid rgba(34,197,94,.4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <CheckCircle2 size={40} color="#22c55e" />
          </div>
        </div>

        {/* Title */}
        <h1 style={{ fontSize: 30, fontWeight: 900, color: "#fff", textAlign: "center", margin: "0 0 6px", lineHeight: 1.2 }}>
          بَارَكَ اللَّهُ فِيكَ
        </h1>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: GOLD, textAlign: "center", margin: "0 0 8px", fontFamily: "'Amiri',serif" }}>
          May Allah bless you
        </h2>
        <p style={{ fontSize: 15, color: "rgba(255,255,255,.8)", textAlign: "center", margin: "0 0 28px", lineHeight: 1.7, maxWidth: 480, marginLeft: "auto", marginRight: "auto" }}>
          Alhamdulillah! You have successfully completed your registration with Tahleem Academy.
          Your journey of seeking sacred knowledge has begun.
        </p>

        {/* Hadith card */}
        <div style={{
          background: "rgba(255,255,255,.06)", border: "1px solid rgba(201,168,76,.2)",
          borderRadius: 18, padding: "20px 24px", marginBottom: 24, textAlign: "center",
        }}>
          <p style={{ fontFamily: "'Amiri',serif", fontSize: 20, color: GOLD, direction: "rtl", lineHeight: 1.9, margin: "0 0 10px" }}>
            "مَنْ سَلَكَ طَرِيقًا يَلْتَمِسُ فِيهِ عِلْمًا سَهَّلَ اللَّهُ لَهُ طَرِيقًا إِلَى الْجَنَّةِ"
          </p>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,.6)", fontStyle: "italic", margin: 0 }}>
            "Whoever treads a path seeking knowledge, Allah will make easy for him a path to Jannah." — Muslim
          </p>
        </div>

        {/* Completed steps */}
        <div style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 16, padding: "16px 20px", marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: GOLD, marginBottom: 14, textTransform: "uppercase", letterSpacing: .5 }}>
            ✅ Registration Stages Completed
          </div>
          {[
            { icon: <FileText size={14} color={GOLD} />, label: "Onboarding questionnaire", done: true },
            { icon: <GraduationCap size={14} color={GOLD} />, label: "Written entrance exam", done: true },
            { icon: <Mic size={14} color={GOLD} />, label: "Recitation audio evaluation", done: true },
          ].map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: i < 2 ? 10 : 0 }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(34,197,94,.2)", border: "1.5px solid rgba(34,197,94,.4)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <CheckCircle2 size={14} color="#22c55e" />
              </div>
              <span style={{ fontSize: 13, color: "rgba(255,255,255,.85)" }}>{s.label}</span>
            </div>
          ))}
        </div>

        {/* What happens next */}
        <div style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 16, padding: "16px 20px", marginBottom: 28 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,.7)", marginBottom: 12, textTransform: "uppercase", letterSpacing: .5 }}>
            What happens next
          </div>
          {[
            { n: 1, text: "Our teachers will review your entrance exam and recitation recording", color: "#60A5FA" },
            { n: 2, text: "The admin will assign you to the appropriate learning level (within 48 hours)", color: GOLD },
            { n: 3, text: "You'll receive an email notification when your level is assigned", color: "#34D399" },
            { n: 4, text: "Log in to your dashboard to begin your learning journey!", color: "#F472B6" },
          ].map((s) => (
            <div key={s.n} style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: s.n < 4 ? 10 : 0 }}>
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: `${s.color}25`, border: `1.5px solid ${s.color}50`, color: s.color, fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>{s.n}</div>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,.7)", lineHeight: 1.6 }}>{s.text}</span>
            </div>
          ))}
        </div>

        {/* Important note */}
        <div style={{ background: "rgba(201,168,76,.1)", border: "1px solid rgba(201,168,76,.3)", borderRadius: 12, padding: "12px 16px", marginBottom: 28, fontSize: 12, color: "rgba(255,255,255,.75)", lineHeight: 1.6 }}>
          <strong style={{ color: GOLD }}>📧 Check your inbox</strong> — You will receive email updates about your application status. Please check your spam folder if you don't see our emails.
        </div>

        {/* CTA */}
        <button
          onClick={handleFinish}
          className="finish-btn"
          style={{
            width: "100%", padding: "16px 0", borderRadius: 16, border: "none",
            background: `linear-gradient(135deg, ${GOLD}, #b8902a)`,
            color: "#fff", fontSize: 16, fontWeight: 800, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
            boxShadow: "0 8px 32px rgba(201,168,76,.4)", transition: "all .2s",
          }}
        >
          <LogIn size={20} /> Sign In to Access Dashboard
        </button>

        <p style={{ textAlign: "center", fontSize: 12, color: "rgba(255,255,255,.35)", marginTop: 16 }}>
          جَزَاكَ اللَّهُ خَيْرًا — May Allah reward you with good
        </p>
      </div>
    </div>
  );
};

export default RegistrationComplete;
