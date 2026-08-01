// src/pages/admin/TasjeelAdmin.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// TASJEEL ADMIN — Complete New Registration Control Center
// Tabs: New Registrations | Settings | Proctoring
// ═══════════════════════════════════════════════════════════════════════════════

import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAcademicLevels, getLevelConfig, getLevelDisplay } from "@/hooks/useAcademicLevels";
import { storageSupabase } from "../../integrations/supabase/storageClient";
import { useToast } from "@/hooks/use-toast";
import { useRegistrationSettings } from "@/hooks/useRegistrationSettings";
import {
  Loader2, ChevronRight, CheckCircle, Search, Eye,
  RefreshCw, Video, Play, Pause, ChevronDown, ChevronUp,
  ToggleLeft, ToggleRight, Bell, Award,
} from "lucide-react";

const G    = "#064E3B";
const GM   = "#075E54";
const GOLD = "#C9A84C";

type Tab = "registrations" | "settings" | "proctoring";

const STEP_CFG: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  enrollment:       { label: "Enrollment",       icon: "📝", color: "#6366f1", bg: "#EEF2FF" },
  payment:          { label: "Payment",           icon: "💳", color: "#0ea5e9", bg: "#F0F9FF" },
  onboarding:       { label: "Onboarding",        icon: "📋", color: "#8b5cf6", bg: "#F5F3FF" },
  exam:             { label: "Entrance Exam",     icon: "📖", color: "#f59e0b", bg: "#FFFBEB" },
  review:           { label: "Under Review",      icon: "🔍", color: "#ef4444", bg: "#FEF2F2" },
  level_assignment: { label: "Awaiting Session",  icon: "📅", color: "#f97316", bg: "#FFF7ED" },
  completed:        { label: "Completed",         icon: "✅", color: "#22c55e", bg: "#F0FDF4" },
};

const STEP_ORDER = ["enrollment","payment","onboarding","exam","review","level_assignment","completed"];

const inp: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 10,
  border: "1.5px solid #E5E7EB", fontSize: 13, outline: "none",
  background: "#FAFAFA", boxSizing: "border-box" as const,
};

const fmt = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) : "—";

const sessionActive = (date?: string, time?: string) => {
  if (!date || !time) return false;
  try {
    const dt   = new Date(`${date}T${time}:00`);
    const diff = (dt.getTime() - Date.now()) / 60000;
    return diff <= 15 && diff >= -120;
  } catch { return false; }
};

const scoreColor = (s: number) => s >= 75 ? "#16A34A" : s >= 50 ? "#D97706" : "#DC2626";
const scoreLabel = (s: number) => s >= 75 ? "Excellent" : s >= 50 ? "Good" : "Needs Work";

// ── Mini audio player ────────────────────────────────────────────────────────
const AudioPlayer = ({ path }: { path: string }) => {
  const [url, setUrl]         = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const audioRef              = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!path) return;
    if (path.startsWith("data:") || path.startsWith("http")) { setUrl(path); return; }
    storageSupabase.storage.from("recitation-audio").createSignedUrl(path, 3600)
      .then(({ data }) => { if (data?.signedUrl) setUrl(data.signedUrl); });
  }, [path]);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { audioRef.current.play().catch(() => {}); setPlaying(true); }
  };

  if (!url) return <span style={{ fontSize: 11, color: "#9CA3AF" }}>Loading audio…</span>;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button onClick={toggle} style={{ width: 34, height: 34, borderRadius: "50%", border: "none", background: G, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {playing ? <Pause size={14} /> : <Play size={14} />}
      </button>
      <audio ref={audioRef} src={url} onEnded={() => setPlaying(false)} style={{ flex: 1, height: 32, borderRadius: 8 }} controls preload="metadata" />
    </div>
  );
};

// ── Labelled info pill ───────────────────────────────────────────────────────
const Pill = ({ label, value, color = "#374151" }: { label: string; value: any; color?: string }) => (
  <div style={{ padding: "5px 10px", borderRadius: 8, background: "#fff", border: "1px solid #E5E7EB", fontSize: 11 }}>
    <span style={{ color: "#9CA3AF" }}>{label}: </span>
    <strong style={{ color }}>{value ?? "—"}</strong>
  </div>
);

// ── Collapsible section block ─────────────────────────────────────────────────
const Sec = ({ icon, title, children, accent = "#F9FAFB", border = "#F3F4F6" }: any) => (
  <div style={{ background: accent, borderRadius: 12, border: `1px solid ${border}`, padding: "13px 15px", marginBottom: 10 }}>
    <div style={{ fontSize: 12, fontWeight: 800, color: "#374151", marginBottom: 10 }}>
      <span style={{ marginRight: 6 }}>{icon}</span>{title}
    </div>
    {children}
  </div>
);

// ── Toggle (settings) ─────────────────────────────────────────────────────────
const Toggle = ({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid #F3F4F6" }}>
    <span style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>{label}</span>
    <button onClick={onToggle} style={{ background: "none", border: "none", cursor: "pointer" }}>
      {on ? <ToggleRight size={30} color={G} /> : <ToggleLeft size={30} color="#D1D5DB" />}
    </button>
  </div>
);

// ── Per-student expandable card ───────────────────────────────────────────────
const StudentCard = ({ s, onRefresh }: { s: any; onRefresh: () => void }) => {
  const { toast } = useToast();
  const navigate  = useNavigate();
  const { data: academicLevels = [] } = useAcademicLevels();
  const levelFromPct = (pct: number): string => {
    if (!academicLevels.length) return pct >= 70 ? "advanced" : pct >= 40 ? "intermediate" : "beginner";
    if (pct >= 70) return academicLevels[academicLevels.length - 1]?.slug || "advanced";
    if (pct >= 40) return academicLevels[Math.floor(academicLevels.length / 2)]?.slug || "intermediate";
    return academicLevels[0]?.slug || "beginner";
  };
  const [open, setOpen]           = useState(false);
  const [selLevel, setSelLevel]   = useState("");
  const [assigning, setAssigning] = useState(false);
  const [accepting, setAccepting] = useState(false);

  const prof = s.profiles   || {};
  const rec  = s.recitation || null;
  const exam = s.exam       || null;
  const pay  = s.payment    || null;

  const stepCfg       = STEP_CFG[s.current_step] || { label: s.current_step, icon: "?", color: "#9CA3AF", bg: "#F9FAFB" };
  const hasSession    = !!rec?.virtual_session_date;
  const adminApproved = !!rec?.admin_approved;
  const canJoin       = adminApproved && sessionActive(rec?.virtual_session_date, rec?.virtual_session_time);
  const roomName      = `recitation-eval-${s.user_id}`;
  const stepIdx       = STEP_ORDER.indexOf(s.current_step);

  const acceptSession = async () => {
    if (!rec) return;
    setAccepting(true);
    try {
      await (supabase as any).from("recitation_tests").update({
        admin_approved:    true,
        admin_approved_at: new Date().toISOString(),
        status:            "session_confirmed",
      }).eq("user_id", s.user_id);

      await (supabase as any).from("notifications").insert({
        user_id:    s.user_id,
        title:      "✅ Virtual Session Confirmed!",
        message:    `Your virtual recitation session on ${rec.virtual_session_date} at ${rec.virtual_session_time || "—"} has been confirmed. A "Join" button will appear on your screen at session time.`,
        type:       "session_confirmed",
        is_read:    false,
        created_at: new Date().toISOString(),
      });

      toast({ title: "✅ Session accepted! Student notified." });
      onRefresh();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setAccepting(false); }
  };

  const assignLevel = async () => {
    if (!selLevel) { toast({ title: "Select a level first", variant: "destructive" }); return; }
    setAssigning(true);
    try {
      await supabase.from("profiles").update({ level: selLevel, course_level: selLevel }).eq("user_id", s.user_id);
      await (supabase as any).from("tasjeel_progress").update({
        current_step:      "completed",
        level_assigned:    selLevel,
        level_assigned_at: new Date().toISOString(),
        completed_at:      new Date().toISOString(),
        updated_at:        new Date().toISOString(),
      }).eq("user_id", s.user_id);

      await (supabase as any).from("notifications").insert({
        user_id:    s.user_id,
        title:      "🎉 Level Assigned — Welcome to Tahleem Academy!",
        message:    `Congratulations! You have been placed in the ${selLevel} level. Your full dashboard is now active. Ahlan wa Sahlan!`,
        type:       "level_assigned",
        is_read:    false,
        created_at: new Date().toISOString(),
      });

      toast({ title: `✅ Level "${selLevel}" assigned — dashboard unlocked!` });
      onRefresh();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setAssigning(false); }
  };

  return (
    <div style={{ background: "#fff", borderRadius: 18, border: "1.5px solid #E5E7EB", overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,.04)" }}>

      {/* Header */}
      <div style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 14 }}>
        {prof.avatar_url ? (
          <img src={prof.avatar_url} style={{ width: 48, height: 48, borderRadius: 14, objectFit: "cover", flexShrink: 0 }} />
        ) : (
          <div style={{ width: 48, height: 48, borderRadius: 14, background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 20, fontWeight: 800, color: "#1D4ED8" }}>
            {(prof.full_name || prof.email || "?")[0]?.toUpperCase()}
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 800, fontSize: 15, color: "#111" }}>{prof.full_name || "New Student"}</span>
            {prof.full_name_ar && <span style={{ fontSize: 13, fontFamily: "'Amiri',serif", color: GOLD }}>{prof.full_name_ar}</span>}
          </div>
          <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {prof.email}{prof.student_id ? ` · ID: ${prof.student_id}` : ""}{prof.country ? ` · ${prof.country}` : ""}
          </p>
          <p style={{ fontSize: 10, color: "#D1D5DB", margin: "2px 0 0" }}>Registered: {fmt(s.created_at)}</p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
          <span style={{ padding: "4px 11px", borderRadius: 20, background: stepCfg.bg, color: stepCfg.color, fontSize: 11, fontWeight: 700, border: `1px solid ${stepCfg.color}33` }}>
            {stepCfg.icon} {stepCfg.label}
          </span>
          {hasSession && !adminApproved && (
            <span style={{ padding: "3px 9px", borderRadius: 20, background: "#FEF2F2", color: "#DC2626", fontSize: 10, fontWeight: 700, border: "1px solid #FECACA" }}>
              ⚠️ Accept Needed
            </span>
          )}
          {adminApproved && (
            <span style={{ padding: "3px 9px", borderRadius: 20, background: "#F0FDF4", color: "#15803D", fontSize: 10, fontWeight: 700, border: "1px solid #86EFAC" }}>
              ✓ Confirmed
            </span>
          )}
          <button onClick={() => setOpen(o => !o)} style={{ padding: "7px 9px", borderRadius: 8, border: "1.5px solid #E5E7EB", background: "#F9FAFB", cursor: "pointer" }}>
            {open ? <ChevronUp size={14} color="#6B7280" /> : <ChevronDown size={14} color="#6B7280" />}
          </button>
          <button onClick={() => navigate(`/admin/view-as-student/${s.user_id}`)} title="View as Student" style={{ padding: "7px 9px", borderRadius: 8, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer" }}>
            <Eye size={13} color="#6B7280" />
          </button>
        </div>
      </div>

      {/* Expandable body */}
      {open && (
        <div style={{ padding: "0 18px 18px", borderTop: "1px solid #F3F4F6" }}>

          {/* Step timeline */}
          <div style={{ padding: "16px 0 12px", display: "flex", alignItems: "center", overflowX: "auto" }}>
            {["enrollment","payment","onboarding","exam","level_assignment","completed"].map((sid, i, arr) => {
              const thisIdx = STEP_ORDER.indexOf(sid);
              const done    = thisIdx < stepIdx || s.current_step === "completed";
              const current = s.current_step === sid;
              const cfg     = STEP_CFG[sid];
              return (
                <div key={sid} style={{ display: "flex", alignItems: "center", flex: i < arr.length - 1 ? 1 : undefined }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 58 }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: done ? G : current ? cfg.color : "#F3F4F6", border: `2px solid ${done ? G : current ? cfg.color : "#E5E7EB"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>
                      {done ? <span style={{ color: "#fff", fontSize: 13 }}>✓</span> : <span>{cfg.icon}</span>}
                    </div>
                    <span style={{ fontSize: 9, fontWeight: 700, color: done ? G : current ? cfg.color : "#D1D5DB", textAlign: "center" as const, lineHeight: 1.2 }}>{cfg.label}</span>
                  </div>
                  {i < arr.length - 1 && <div style={{ flex: 1, height: 2, background: done ? G : "#E5E7EB", marginBottom: 14, minWidth: 12 }} />}
                </div>
              );
            })}
          </div>

          {/* ── PAYMENT ── */}
          <Sec icon="💳" title="Payment" accent="#F0F9FF" border="#BAE6FD">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Pill label="Status" value={
                s.payment_status === "paid"   ? "✅ Paid" :
                s.payment_status === "exempt" ? "🔵 Exempt" :
                s.payment_status             || "Pending"
              } color={s.payment_status === "paid" ? "#15803D" : s.payment_status === "exempt" ? "#1D4ED8" : "#DC2626"} />
              {pay && <>
                <Pill label="Reference" value={pay.payment_ref} />
                <Pill label="Amount"    value={pay.amount ? `₦${Number(pay.amount).toLocaleString()}` : undefined} />
                <Pill label="Paid At"   value={fmt(pay.paid_at)} />
              </>}
              {!pay && s.payment_status !== "paid" && <Pill label="Note" value="No payment record" color="#DC2626" />}
            </div>
          </Sec>

          {/* ── ONBOARDING ── */}
          <Sec icon="📋" title="Onboarding Form" accent="#F5F3FF" border="#C4B5FD">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Pill label="Completed" value={s.onboarding_completed_at ? "✅ Yes" : "⏳ Pending"} color={s.onboarding_completed_at ? "#15803D" : "#D97706"} />
              {s.onboarding_completed_at && <Pill label="Date" value={fmt(s.onboarding_completed_at)} />}
              {prof.phone   && <Pill label="Phone"   value={prof.phone} />}
              {prof.country && <Pill label="Country" value={prof.country} />}
            </div>
          </Sec>

          {/* ── ENTRANCE EXAM ── */}
          <Sec icon="📖" title="Entrance Exam Results" accent="#FFFBEB" border="#FDE68A">
            {exam ? (<>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                <Pill label="Score"           value={`${exam.score ?? 0} / ${exam.max_score ?? 0}`} />
                <Pill label="Percentage"      value={exam.percentage !== undefined ? `${Math.round(exam.percentage)}%` : undefined}
                      color={exam.percentage >= 70 ? "#15803D" : exam.percentage >= 40 ? "#D97706" : "#DC2626"} />
                <Pill label="Suggested Level" value={exam.percentage !== undefined ? levelFromPct(exam.percentage) : undefined} color={G} />
                <Pill label="Status"          value={exam.status === "submitted" ? "✅ Submitted" : exam.status} />
                <Pill label="Submitted"       value={fmt(exam.submitted_at || exam.updated_at)} />
              </div>
              {(exam.integrity_score !== undefined || exam.suspicion_level) && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Pill label="Integrity"  value={exam.integrity_score !== undefined ? `${exam.integrity_score}%` : undefined}
                        color={exam.integrity_score >= 80 ? "#15803D" : "#D97706"} />
                  <Pill label="Suspicion"  value={exam.suspicion_level || undefined}
                        color={exam.suspicion_level === "high" ? "#DC2626" : "#374151"} />
                </div>
              )}
            </>) : (
              <p style={{ fontSize: 12, color: "#9CA3AF", margin: 0 }}>
                {s.exam_completed_at ? `Completed on ${fmt(s.exam_completed_at)} — no attempt record found` : "Exam not yet taken"}
              </p>
            )}
          </Sec>

          {/* ── RECITATION ── */}
          <Sec icon="🎙️" title="Recitation Test" accent="#F0FDF4" border="#86EFAC">
            {rec ? (<>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                <Pill label="Stage"    value={`${rec.stage ?? 0} / 3`} />
                <Pill label="Status"   value={rec.status} />
                {rec.ai_score !== null && rec.ai_score !== undefined && (
                  <Pill label="AI Score" value={`${rec.ai_score}% — ${scoreLabel(rec.ai_score)}`} color={scoreColor(rec.ai_score)} />
                )}
                <Pill label="Recorded" value={fmt(rec.stage1_submitted_at)} />
              </div>
              {rec.ai_transcript && rec.ai_transcript !== "Admin will review manually" && (
                <div style={{ background: "#fff", borderRadius: 10, padding: "10px 12px", border: "1px solid #BBF7D0", marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#166534", marginBottom: 5, textTransform: "uppercase" as const }}>AI Transcript:</div>
                  <div style={{ fontSize: 15, fontFamily: "'Amiri',serif", direction: "rtl" as const, color: "#065F46", lineHeight: 1.9 }}>{rec.ai_transcript}</div>
                </div>
              )}
              {rec.audio_path && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#166534", marginBottom: 6 }}>🔊 Student Recording:</div>
                  <AudioPlayer path={rec.audio_path} />
                </div>
              )}
            </>) : (
              <p style={{ fontSize: 12, color: "#9CA3AF", margin: 0 }}>Recitation test not yet submitted</p>
            )}
          </Sec>

          {/* ── VIRTUAL SESSION ── */}
          <Sec icon="📅" title="Virtual Recitation Session"
            accent={hasSession ? (adminApproved ? "#ECFDF5" : "#FFFBEB") : "#F9FAFB"}
            border={hasSession ? (adminApproved ? "#6EE7B7" : "#FDE68A") : "#E5E7EB"}>
            {hasSession ? (<>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                <Pill label="Date"         value={rec.virtual_session_date} />
                <Pill label="Time"         value={rec.virtual_session_time} />
                <Pill label="Booked"       value={fmt(rec.virtual_session_booked_at || rec.stage3_requested_at)} />
                <Pill label="Confirmation" value={adminApproved ? "✅ Confirmed" : "⏳ Pending admin"}
                      color={adminApproved ? "#15803D" : "#D97706"} />
              </div>

              {/* Accept button (only if not yet accepted) */}
              {!adminApproved && (
                <button onClick={acceptSession} disabled={accepting}
                  style={{ width: "100%", padding: "11px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#D97706,#B45309)", color: "#fff", cursor: accepting ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 8 }}>
                  {accepting ? <Loader2 size={14} style={{ animation: "spin .8s linear infinite" }} /> : <CheckCircle size={14} />}
                  {accepting ? "Confirming…" : "Accept & Confirm Session — Student Will Be Notified"}
                </button>
              )}

              {/* Join button */}
              {adminApproved && (
                <>
                  <button
                    onClick={() => canJoin && navigate(`/admin/recitation-session?room=${roomName}&studentId=${s.user_id}&type=recitation`)}
                    style={{ width: "100%", padding: "11px", borderRadius: 12, border: "none", background: canJoin ? `linear-gradient(135deg,${G},${GM})` : "#E5E7EB", color: canJoin ? "#fff" : "#9CA3AF", cursor: canJoin ? "pointer" : "not-allowed", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 8, transition: "all .2s" }}>
                    <Video size={14} />
                    {canJoin
                      ? `🟢 Join Live Session — ${prof.full_name || "Student"}`
                      : `Session: ${rec.virtual_session_date} at ${rec.virtual_session_time} (activates 15 min before)`}
                  </button>
                  {!canJoin && (
                    <div style={{ padding: "8px 12px", borderRadius: 10, background: "#F0FDF4", border: "1px solid #86EFAC", fontSize: 11, color: "#166534", textAlign: "center" as const }}>
                      ✅ Session confirmed. The Join button activates automatically 15 minutes before the scheduled time on both your screen and the student's screen.
                    </div>
                  )}
                </>
              )}
            </>) : (
              <p style={{ fontSize: 12, color: "#9CA3AF", margin: 0 }}>Student has not yet booked a virtual session.</p>
            )}
          </Sec>

          {/* ── LEVEL ASSIGNMENT ── */}
          <Sec icon="🎓" title="Level Assignment"
            accent={s.current_step === "completed" ? "#F0FDF4" : "#FFF7ED"}
            border={s.current_step === "completed" ? "#86EFAC" : "#FDE68A"}>
            {s.current_step === "completed" ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 24 }}>🎉</span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14, color: G }}>
                    Level: {s.level_assigned ? s.level_assigned.charAt(0).toUpperCase() + s.level_assigned.slice(1) : "—"}
                  </div>
                  <div style={{ fontSize: 11, color: "#6B7280" }}>Assigned on {fmt(s.level_assigned_at)}</div>
                </div>
              </div>
            ) : (<>
              {hasSession && !adminApproved && (
                <div style={{ padding: "8px 12px", background: "#FFF7ED", borderRadius: 8, border: "1px solid #FDE68A", fontSize: 11, color: "#92400E", marginBottom: 10 }}>
                  ⚠️ Confirm the virtual session first and conduct the live evaluation before assigning a level.
                </div>
              )}
              {exam?.percentage !== undefined && (
                <div style={{ padding: "8px 12px", background: "#EFF6FF", borderRadius: 8, border: "1px solid #BAE6FD", fontSize: 11, color: "#1E40AF", marginBottom: 10 }}>
                  💡 Exam suggests: <strong>{levelFromPct(exam.percentage)}</strong> ({Math.round(exam.percentage)}% score)
                  {rec?.ai_score !== null && rec?.ai_score !== undefined && ` · Recitation AI: ${rec.ai_score}%`}
                </div>
              )}
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <select value={selLevel} onChange={e => setSelLevel(e.target.value)}
                  style={{ flex: 1, padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E5E7EB", fontSize: 13, outline: "none" }}>
                  <option value="">Select level to assign…</option>
                  {academicLevels.map(l => {
                    const cfg = getLevelConfig(l.slug, academicLevels);
                    return <option key={l.slug} value={l.slug}>{cfg.dot} {l.name_en} / {l.name_ar}</option>;
                  })}
                </select>
                <button onClick={assignLevel} disabled={!selLevel || assigning}
                  style={{ padding: "9px 18px", borderRadius: 10, border: "none", background: selLevel ? G : "#9CA3AF", color: "#fff", cursor: selLevel ? "pointer" : "not-allowed", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  {assigning ? <Loader2 size={13} style={{ animation: "spin .8s linear infinite" }} /> : <Award size={13} />}
                  Assign Level
                </button>
              </div>
            </>)}
          </Sec>
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function TasjeelAdmin() {
  const { toast }   = useToast();
  const navigate    = useNavigate();
  const { config, loading: configLoading, saveAll } = useRegistrationSettings();
  const { data: academicLevels = [] } = useAcademicLevels();
  const levelFromPct = (pct: number): string => {
    if (!academicLevels.length) return pct >= 70 ? "advanced" : pct >= 40 ? "intermediate" : "beginner";
    if (pct >= 70) return academicLevels[academicLevels.length - 1]?.slug || "advanced";
    if (pct >= 40) return academicLevels[Math.floor(academicLevels.length / 2)]?.slug || "intermediate";
    return academicLevels[0]?.slug || "beginner";
  };
  const [tab, setTab]           = useState<Tab>("registrations");
  const [draft, setDraft]       = useState<any>(null);
  const [saving, setSaving]     = useState(false);
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading]   = useState(false);
  const [search, setSearch]     = useState("");
  const [filter, setFilter]     = useState("all");
  const [procStats, setProcStats] = useState<any>({});

  useEffect(() => { if (!configLoading && config) setDraft({ ...config }); }, [configLoading, config]);
  useEffect(() => { if (tab === "registrations") loadAll(); }, [tab]); // eslint-disable-line
  useEffect(() => { if (tab === "proctoring") loadProcStats(); }, [tab]); // eslint-disable-line

  const loadAll = async () => {
    setLoading(true);
    try {
      const { data: progress } = await (supabase as any)
        .from("tasjeel_progress")
        .select("*")
        .order("updated_at", { ascending: false });

      if (!progress?.length) { setStudents([]); setLoading(false); return; }

      const ids = [...new Set(progress.map((p: any) => p.user_id))];

      const [profRes, recRes, examRes, payRes] = await Promise.all([
        supabase.from("profiles")
          .select("user_id, full_name, full_name_ar, email, level, avatar_url, student_id, phone, country")
          .in("user_id", ids as any),
        (supabase as any).from("recitation_tests").select("*").in("user_id", ids),
        supabase.from("exam_attempts")
          .select("user_id, score, max_score, percentage, status, submitted_at, updated_at, integrity_score, suspicion_level")
          .in("user_id", ids as any)
          .order("submitted_at", { ascending: false }),
        (supabase as any).from("payment_history")
          .select("user_id, amount, paid_at, status, payment_ref, payment_type")
          .in("user_id", ids)
          .eq("payment_type", "registration"),
      ]);

      const profMap: Record<string, any> = {};
      (profRes.data || []).forEach((p: any) => { profMap[p.user_id] = p; });
      const recMap: Record<string, any> = {};
      (recRes.data || []).forEach((r: any) => { recMap[r.user_id] = r; });
      const examMap: Record<string, any> = {};
      (examRes.data || []).forEach((e: any) => { if (!examMap[e.user_id]) examMap[e.user_id] = e; });
      const payMap: Record<string, any> = {};
      (payRes.data || []).forEach((p: any) => { if (!payMap[p.user_id]) payMap[p.user_id] = p; });

      setStudents(progress.map((p: any) => ({
        ...p,
        profiles:   profMap[p.user_id]  || null,
        recitation: recMap[p.user_id]   || null,
        exam:       examMap[p.user_id]  || null,
        payment:    payMap[p.user_id]   || null,
      })));
    } catch (e) {
      console.error("[TasjeelAdmin] loadAll:", e);
    } finally { setLoading(false); }
  };

  const loadProcStats = async () => {
    const [vsRes, sessRes] = await Promise.all([
      (supabase as any).from("violations").select("violation_type").limit(1000),
      (supabase as any).from("proctoring_sessions").select("integrity_score, suspicion_level").limit(200),
    ]);
    const typeCounts: Record<string, number> = {};
    (vsRes.data || []).forEach((v: any) => { typeCounts[v.violation_type] = (typeCounts[v.violation_type] || 0) + 1; });
    const sessions = sessRes.data || [];
    const avgInteg = sessions.length ? Math.round(sessions.reduce((s: number, v: any) => s + (v.integrity_score || 100), 0) / sessions.length) : 100;
    setProcStats({ typeCounts, total: Object.values(typeCounts).reduce((a: any, b: any) => a + b, 0), avgIntegrity: avgInteg, sessions: sessions.length });
  };

  const saveDraft = async () => {
    if (!draft) return;
    setSaving(true);
    await saveAll(draft);
    toast({ title: "✅ Settings saved!" });
    setSaving(false);
  };

  const FILTER_OPTIONS = [
    { id: "all",             label: "All",              icon: "👥" },
    { id: "level_assignment",label: "Awaiting Session", icon: "📅" },
    { id: "exam",            label: "Exam Stage",       icon: "📖" },
    { id: "completed",       label: "Completed",        icon: "✅" },
  ];

  const filtered = students.filter(s => {
    const prof = s.profiles || {};
    const q    = search.toLowerCase();
    const matchSearch = !search ||
      (prof.full_name  || "").toLowerCase().includes(q) ||
      (prof.email      || "").toLowerCase().includes(q) ||
      (prof.student_id || "").toLowerCase().includes(q);
    const matchFilter = filter === "all" || s.current_step === filter;
    return matchSearch && matchFilter;
  });

  const needsAccept = students.filter(s => s.recitation?.virtual_session_date && !s.recitation?.admin_approved).length;

  if (configLoading || !draft) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
      <Loader2 size={28} style={{ animation: "spin .8s linear infinite", color: G }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#F8F9FA", fontFamily: "'Cairo',system-ui,sans-serif" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", padding: "18px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 46, height: 46, borderRadius: 14, background: "#F0FDF4", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 24 }}>🎓</span>
            </div>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 900, color: "#111", margin: 0 }}>Tasjeel Control Center</h1>
              <p style={{ fontSize: 12, color: "#6B7280", margin: 0, fontFamily: "'Amiri',serif" }}>لوحة التسجيل — New Student Registration Hub</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {tab === "registrations" && (
              <button onClick={loadAll} style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 18px", borderRadius: 12, border: "1.5px solid #E5E7EB", background: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", color: "#374151" }}>
                <RefreshCw size={13} /> Refresh
              </button>
            )}
            {tab === "settings" && (
              <button onClick={saveDraft} disabled={saving} style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 18px", borderRadius: 12, border: "none", background: G, color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
                {saving ? <Loader2 size={13} style={{ animation: "spin .8s linear infinite" }} /> : <CheckCircle size={13} />}
                {saving ? "Saving…" : "Save Settings"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", padding: "0 24px", display: "flex", gap: 0, overflowX: "auto" }}>
        {([
          { id: "registrations", label: "🆕 New Registrations" },
          { id: "settings",      label: "⚙️ Settings" },
          { id: "proctoring",    label: "🛡️ Proctoring" },
        ] as { id: Tab; label: string }[]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: "14px 22px", border: "none", borderBottom: `3px solid ${tab === t.id ? G : "transparent"}`, background: "transparent", cursor: "pointer", fontWeight: tab === t.id ? 800 : 600, fontSize: 13, color: tab === t.id ? G : "#6B7280", whiteSpace: "nowrap" as const, position: "relative" as const }}>
            {t.label}
            {t.id === "registrations" && needsAccept > 0 && (
              <span style={{ marginLeft: 7, background: "#EF4444", color: "#fff", borderRadius: 20, padding: "1px 7px", fontSize: 10, fontWeight: 800 }}>{needsAccept}</span>
            )}
          </button>
        ))}
      </div>

      <div style={{ padding: "20px 24px", maxWidth: 1100, margin: "0 auto" }}>

        {/* ── TAB: NEW REGISTRATIONS ─────────────────────────────────────────── */}
        {tab === "registrations" && (<>

          {/* Stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12, marginBottom: 20 }}>
            {[
              { v: students.length,                                                              l: "Total Registered",    bg: "#EFF6FF", c: "#1D4ED8" },
              { v: students.filter(s => s.current_step === "level_assignment").length,           l: "Awaiting Session",    bg: "#FFF7ED", c: "#EA580C" },
              { v: needsAccept,                                                                  l: "Sessions to Accept",  bg: "#FEF2F2", c: "#DC2626" },
              { v: students.filter(s => s.current_step === "completed").length,                  l: "Completed",           bg: "#F0FDF4", c: "#15803D" },
            ].map((s, i) => (
              <div key={i} style={{ background: s.bg, borderRadius: 14, padding: "14px 16px" }}>
                <p style={{ fontSize: 26, fontWeight: 900, color: s.c, margin: 0 }}>{s.v}</p>
                <p style={{ fontSize: 11, color: s.c, opacity: .75, margin: 0, fontWeight: 700 }}>{s.l}</p>
              </div>
            ))}
          </div>

          {/* Alert banner */}
          {needsAccept > 0 && (
            <div style={{ background: "#FEF2F2", borderRadius: 14, border: "1.5px solid #FECACA", padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
              <Bell size={18} color="#DC2626" style={{ flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 800, fontSize: 13, color: "#DC2626" }}>
                  {needsAccept} virtual session{needsAccept > 1 ? "s" : ""} waiting for your confirmation
                </div>
                <div style={{ fontSize: 11, color: "#9CA3AF" }}>
                  Expand each student card below → scroll to "Virtual Session" → click Accept.
                </div>
              </div>
            </div>
          )}

          {/* Filters */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {FILTER_OPTIONS.map(f => (
              <button key={f.id} onClick={() => setFilter(f.id)}
                style={{ padding: "7px 14px", borderRadius: 20, border: `1.5px solid ${filter === f.id ? G : "#E5E7EB"}`, background: filter === f.id ? G : "#fff", color: filter === f.id ? "#fff" : "#374151", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                {f.icon} {f.label} ({f.id === "all" ? students.length : students.filter(s => s.current_step === f.id).length})
              </button>
            ))}
          </div>

          {/* Search */}
          <div style={{ position: "relative", marginBottom: 16 }}>
            <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, email or student ID…"
              style={{ ...inp, paddingLeft: 36 }} />
          </div>

          {/* List */}
          {loading ? (
            <div style={{ textAlign: "center", padding: "60px 0" }}>
              <Loader2 size={32} style={{ animation: "spin .8s linear infinite", color: G }} />
              <p style={{ fontSize: 13, color: "#9CA3AF", marginTop: 12 }}>Loading registration data…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 40px", background: "#fff", borderRadius: 18, border: "2px dashed #E5E7EB" }}>
              <p style={{ fontSize: 42, marginBottom: 10 }}>📋</p>
              <p style={{ fontWeight: 700, color: "#374151", fontSize: 16 }}>No registrations found</p>
              <p style={{ fontSize: 13, color: "#9CA3AF" }}>Try changing the filter or search term</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {filtered.map(s => <StudentCard key={s.user_id} s={s} onRefresh={loadAll} />)}
            </div>
          )}
        </>)}

        {/* ── TAB: SETTINGS ─────────────────────────────────────────────────── */}
        {tab === "settings" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB", padding: 20 }}>
              <h3 style={{ fontWeight: 800, fontSize: 14, color: G, margin: "0 0 4px" }}>📝 Registration</h3>
              <p style={{ fontSize: 12, color: "#9CA3AF", margin: "0 0 16px" }}>Control who can register</p>
              <Toggle on={draft.registration_open ?? true}        onToggle={() => setDraft((d: any) => ({ ...d, registration_open: !d.registration_open }))}        label="Registration Open" />
              <Toggle on={draft.entrance_exam_required ?? true}   onToggle={() => setDraft((d: any) => ({ ...d, entrance_exam_required: !d.entrance_exam_required }))}  label="Entrance Exam Required" />
              <Toggle on={draft.recitation_test_required ?? true} onToggle={() => setDraft((d: any) => ({ ...d, recitation_test_required: !d.recitation_test_required }))} label="Recitation Test Required" />
              <Toggle on={draft.onboarding_required ?? true}      onToggle={() => setDraft((d: any) => ({ ...d, onboarding_required: !d.onboarding_required }))}      label="Onboarding Form Required" />
              <div style={{ marginTop: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 6 }}>Max Daily Registrations (0 = unlimited)</label>
                <input type="number" min={0} value={draft.max_daily_registrations || 0}
                  onChange={e => setDraft((d: any) => ({ ...d, max_daily_registrations: +e.target.value }))} style={{ ...inp, width: "auto" }} />
              </div>
            </div>

            <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB", padding: 20 }}>
              <h3 style={{ fontWeight: 800, fontSize: 14, color: G, margin: "0 0 4px" }}>💳 Payment (Paystack)</h3>
              <p style={{ fontSize: 12, color: "#9CA3AF", margin: "0 0 16px" }}>If OFF — payment step is skipped</p>
              <Toggle on={draft.entrance_fee_enabled ?? false} onToggle={() => setDraft((d: any) => ({ ...d, entrance_fee_enabled: !d.entrance_fee_enabled }))} label="Payment Required" />
              {draft.entrance_fee_enabled && (
                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 5 }}>Amount</label>
                    <input type="number" value={draft.entrance_fee_amount || 0} onChange={e => setDraft((d: any) => ({ ...d, entrance_fee_amount: +e.target.value }))} style={inp} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 5 }}>Currency</label>
                    <select value={draft.entrance_fee_currency || "NGN"} onChange={e => setDraft((d: any) => ({ ...d, entrance_fee_currency: e.target.value }))} style={inp}>
                      {["NGN","USD","GBP","EUR","KES","GHS","ZAR"].map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
              )}
            </div>

            <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB", padding: 20 }}>
              <h3 style={{ fontWeight: 800, fontSize: 14, color: G, margin: "0 0 4px" }}>🛡️ Proctoring Settings</h3>
              <p style={{ fontSize: 12, color: "#9CA3AF", margin: "0 0 16px" }}>Applied to entrance exam</p>
              <Toggle on={draft.proctoring_enabled ?? false}       onToggle={() => setDraft((d: any) => ({ ...d, proctoring_enabled: !d.proctoring_enabled }))}       label="Enable Proctoring" />
              <Toggle on={draft.prevent_tab_switch ?? false}       onToggle={() => setDraft((d: any) => ({ ...d, prevent_tab_switch: !d.prevent_tab_switch }))}       label="Detect Tab Switching" />
              <Toggle on={draft.prevent_copy_paste ?? false}       onToggle={() => setDraft((d: any) => ({ ...d, prevent_copy_paste: !d.prevent_copy_paste }))}       label="Block Copy/Paste" />
              <Toggle on={draft.fullscreen_required ?? false}      onToggle={() => setDraft((d: any) => ({ ...d, fullscreen_required: !d.fullscreen_required }))}      label="Fullscreen Required" />
              <Toggle on={draft.camera_monitoring ?? false}        onToggle={() => setDraft((d: any) => ({ ...d, camera_monitoring: !d.camera_monitoring }))}        label="Camera Monitoring" />
              <Toggle on={draft.auto_submit_on_violation ?? false} onToggle={() => setDraft((d: any) => ({ ...d, auto_submit_on_violation: !d.auto_submit_on_violation }))} label="Auto-Submit on Violations" />
              <div style={{ marginTop: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 5 }}>Max Warnings Before Auto-Submit</label>
                <input type="number" min={1} max={20} value={draft.max_warnings || 3} onChange={e => setDraft((d: any) => ({ ...d, max_warnings: +e.target.value }))} style={{ ...inp, width: "auto" }} />
              </div>
            </div>

            <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB", padding: 20 }}>
              <h3 style={{ fontWeight: 800, fontSize: 14, color: G, margin: "0 0 16px" }}>📢 Messaging</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 5 }}>Closed Message (EN)</label>
                  <textarea value={draft.closed_message || ""} rows={3} onChange={e => setDraft((d: any) => ({ ...d, closed_message: e.target.value }))} style={{ ...inp, resize: "none" as const }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 5 }}>Closed Message (AR)</label>
                  <textarea value={draft.closed_message_ar || ""} rows={3} dir="rtl" onChange={e => setDraft((d: any) => ({ ...d, closed_message_ar: e.target.value }))} style={{ ...inp, resize: "none" as const, fontFamily: "'Amiri',serif" }} />
                </div>
              </div>
            </div>

            <div style={{ gridColumn: "span 2", background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB", padding: 20 }}>
              <h3 style={{ fontWeight: 800, fontSize: 14, color: G, margin: "0 0 16px" }}>🔗 Quick Links</h3>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {[
                  { label: "Exam Manager",        path: "/admin/exams" },
                  { label: "Entrance Exam Admin", path: "/admin/entrance-exam" },
                  { label: "Grading",             path: "/admin/grading" },
                  { label: "Proctoring Dashboard",path: "/admin/proctoring" },
                  { label: "Level Assignment",    path: "/admin/level-assignment" },
                  { label: "Recitation Review",   path: "/admin/recitation-review" },
                  { label: "Student Management",  path: "/admin/students" },
                  { label: "Live Classes",        path: "/admin/live-classes" },
                ].map(l => (
                  <button key={l.label} onClick={() => navigate(l.path)}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, border: "1.5px solid #E5E7EB", background: "#F9FAFB", cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#374151" }}>
                    <ChevronRight size={12} color={G} /> {l.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── TAB: PROCTORING ───────────────────────────────────────────────── */}
        {tab === "proctoring" && (<>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 20 }}>
            {[
              { v: procStats.sessions || 0,        l: "Total Sessions",   bg: "#EFF6FF", c: "#1D4ED8" },
              { v: procStats.total    || 0,        l: "Total Violations", bg: "#FEF2F2", c: "#DC2626" },
              { v: `${procStats.avgIntegrity || 100}%`, l: "Avg Integrity",   bg: "#F0FDF4", c: "#166534" },
            ].map((s, i) => (
              <div key={i} style={{ background: s.bg, borderRadius: 14, padding: "16px" }}>
                <p style={{ fontSize: 28, fontWeight: 900, color: s.c, margin: 0 }}>{s.v}</p>
                <p style={{ fontSize: 12, color: s.c, opacity: .7, margin: 0, fontWeight: 700 }}>{s.l}</p>
              </div>
            ))}
          </div>
          <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB", padding: 20 }}>
            <h3 style={{ fontWeight: 800, fontSize: 14, color: G, margin: "0 0 16px" }}>📋 Violation Breakdown</h3>
            {Object.entries(procStats.typeCounts || {}).sort(([,a]: any,[,b]: any) => b - a).map(([type, count]: any) => (
              <div key={type} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #F9FAFB" }}>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#374151" }}>{type.replace(/_/g," ")}</span>
                <div style={{ width: 120, height: 6, background: "#F3F4F6", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.min(100,(count/Math.max(1,procStats.total))*100)}%`, background: "#DC2626", borderRadius: 3 }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#DC2626", minWidth: 30, textAlign: "right" as const }}>{count}</span>
              </div>
            ))}
            {Object.keys(procStats.typeCounts || {}).length === 0 && (
              <p style={{ fontSize: 13, color: "#9CA3AF", textAlign: "center", padding: "20px 0" }}>No violations recorded yet</p>
            )}
          </div>
          <div style={{ marginTop: 14 }}>
            <button onClick={() => navigate("/admin/proctoring")} style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: G, color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
              Full Proctoring Dashboard →
            </button>
          </div>
        </>)}
      </div>
    </div>
  );
}