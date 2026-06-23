// src/pages/admin/StudentRegistration.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// STUDENT REGISTRATION — Unified Admin Control Centre
// Replaces scattered Student Pipeline / TasjeelAdmin / RegistrationSettings
// Tabs: Overview · New Registrations · Enrolled · Virtual Eval · Flow Settings
// ═══════════════════════════════════════════════════════════════════════════════

import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { storageSupabase } from "../../integrations/supabase/storageClient";
import { useToast } from "@/hooks/use-toast";
import { useRegistrationSettings } from "@/hooks/useRegistrationSettings";
import { useAcademicLevels } from "@/hooks/useAcademicLevels";
import {
  Users, UserPlus, UserCheck, Search, RefreshCw, Video,
  Play, Pause, ChevronDown, ChevronUp, Eye, CheckCircle,
  XCircle, Clock, Star, Settings, Bell, Shield, BarChart2,
  Phone, Globe, CreditCard, BookOpen, Mic, Award, Calendar,
  AlertTriangle, Filter, MoreVertical, Send, Zap, TrendingUp,
  GraduationCap, FileText, Copy, ExternalLink, Loader2,
  ToggleLeft, ToggleRight, ChevronRight, MessageSquare, Link,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";

// ── Brand tokens ──────────────────────────────────────────────────────────────
const G      = "#064E3B";   // deep forest green
const GM     = "#065F46";
const GOLD   = "#C9A84C";
const CREAM  = "#FDFCF8";
const BORDER = "#E8E4DC";

// ── Step definitions ──────────────────────────────────────────────────────────
const STEPS: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  enrollment:       { label: "Enrollment",       icon: "📝", color: "#6366f1", bg: "#EEF2FF" },
  payment:          { label: "Payment",           icon: "💳", color: "#0ea5e9", bg: "#F0F9FF" },
  onboarding:       { label: "Onboarding",        icon: "📋", color: "#8b5cf6", bg: "#F5F3FF" },
  exam:             { label: "Entrance Exam",     icon: "📖", color: "#f59e0b", bg: "#FFFBEB" },
  review:           { label: "Under Review",      icon: "🔍", color: "#ef4444", bg: "#FEF2F2" },
  level_assignment: { label: "Awaiting Session",  icon: "📅", color: "#f97316", bg: "#FFF7ED" },
  completed:        { label: "Enrolled",          icon: "✅", color: "#22c55e", bg: "#F0FDF4" },
};
const STEP_ORDER = ["enrollment","payment","onboarding","exam","review","level_assignment","completed"];

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt  = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) : "—";
const fmtT = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

const sessionActive = (date?: string, time?: string) => {
  if (!date || !time) return false;
  try {
    const dt   = new Date(`${date}T${time}:00`);
    const diff = (dt.getTime() - Date.now()) / 60000;
    return diff <= 15 && diff >= -120;
  } catch { return false; }
};

const scoreColor = (s: number) => s >= 75 ? "#16A34A" : s >= 50 ? "#D97706" : "#DC2626";
const levelFromPct = (p: number) =>
  p >= 85 ? "Level 4" : p >= 70 ? "Level 3" : p >= 50 ? "Level 2" : "Level 1";

const avatar = (prof: any, size = 44) => (
  prof?.avatar_url
    ? <img src={prof.avatar_url} style={{ width: size, height: size, borderRadius: size * .3, objectFit: "cover", flexShrink: 0 }} />
    : <div style={{ width: size, height: size, borderRadius: size * .3, background: `${G}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: size * .4, fontWeight: 800, color: G }}>
        {(prof?.full_name || prof?.email || "?")[0]?.toUpperCase()}
      </div>
);

// ── Shared sub-components ─────────────────────────────────────────────────────
const Pill = ({ label, value, color = "#374151" }: { label: string; value: any; color?: string }) => (
  <div style={{ padding: "5px 10px", borderRadius: 8, background: "#fff", border: `1px solid ${BORDER}`, fontSize: 11 }}>
    <span style={{ color: "#9CA3AF" }}>{label}: </span>
    <strong style={{ color }}>{value ?? "—"}</strong>
  </div>
);

const InfoCard = ({ icon: Icon, label, value, accent }: any) => (
  <div style={{ background: "#fff", borderRadius: 14, border: `1.5px solid ${BORDER}`, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
    <div style={{ width: 40, height: 40, borderRadius: 12, background: accent + "18", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <Icon size={18} color={accent} />
    </div>
    <div>
      <p style={{ fontSize: 10, color: "#9CA3AF", margin: 0, fontWeight: 600, textTransform: "uppercase", letterSpacing: .5 }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 800, color: "#111", margin: 0 }}>{value}</p>
    </div>
  </div>
);

const SectionBlock = ({ icon, title, children, accent = "#F9FAFB", border = BORDER }: any) => (
  <div style={{ background: accent, borderRadius: 14, border: `1px solid ${border}`, padding: "13px 15px", marginBottom: 10 }}>
    <p style={{ fontSize: 11, fontWeight: 800, color: "#374151", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: .5 }}>
      <span style={{ marginRight: 6 }}>{icon}</span>{title}
    </p>
    {children}
  </div>
);

const SettingRow = ({ label, sub, checked, onChange }: any) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 0", borderBottom: `1px solid ${BORDER}` }}>
    <div>
      <p style={{ fontWeight: 600, fontSize: 13, color: "#374151", margin: 0 }}>{label}</p>
      {sub && <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>{sub}</p>}
    </div>
    <Switch checked={checked} onCheckedChange={onChange} />
  </div>
);

// ── Mini audio player ─────────────────────────────────────────────────────────
const AudioPlayer = ({ path }: { path: string }) => {
  const [url, setUrl]       = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const ref = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!path) return;
    if (path.startsWith("data:") || path.startsWith("http")) { setUrl(path); return; }
    storageSupabase.storage.from("recitation-audio").createSignedUrl(path, 3600)
      .then(({ data }) => { if (data?.signedUrl) setUrl(data.signedUrl); });
  }, [path]);

  if (!url) return <span style={{ fontSize: 11, color: "#9CA3AF" }}>Loading…</span>;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button onClick={() => { if (!ref.current) return; if (playing) { ref.current.pause(); setPlaying(false); } else { ref.current.play().catch(()=>{}); setPlaying(true); } }}
        style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: G, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {playing ? <Pause size={13} /> : <Play size={13} />}
      </button>
      <audio ref={ref} src={url} onEnded={() => setPlaying(false)} style={{ flex: 1, height: 30, borderRadius: 8 }} controls preload="metadata" />
    </div>
  );
};

// ── Step timeline ─────────────────────────────────────────────────────────────
const StepTimeline = ({ current }: { current: string }) => {
  const stepIdx = STEP_ORDER.indexOf(current);
  const shown   = ["enrollment","payment","onboarding","exam","level_assignment","completed"];
  return (
    <div style={{ display: "flex", alignItems: "center", overflowX: "auto", padding: "14px 0 10px", gap: 0 }}>
      {shown.map((sid, i, arr) => {
        const thisIdx = STEP_ORDER.indexOf(sid);
        const done    = thisIdx < stepIdx || current === "completed";
        const active  = current === sid;
        const cfg     = STEPS[sid];
        return (
          <div key={sid} style={{ display: "flex", alignItems: "center", flex: i < arr.length - 1 ? 1 : undefined }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, minWidth: 52 }}>
              <div style={{ width: 26, height: 26, borderRadius: "50%", background: done ? G : active ? cfg.color : "#F3F4F6", border: `2px solid ${done ? G : active ? cfg.color : "#E5E7EB"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, transition: "all .2s" }}>
                {done ? <span style={{ color: "#fff", fontSize: 12 }}>✓</span> : <span>{cfg.icon}</span>}
              </div>
              <span style={{ fontSize: 8, fontWeight: 700, color: done ? G : active ? cfg.color : "#D1D5DB", textAlign: "center", lineHeight: 1.2 }}>{cfg.label}</span>
            </div>
            {i < arr.length - 1 && (
              <div style={{ flex: 1, height: 2, background: done ? G : "#E5E7EB", marginBottom: 14, minWidth: 8, transition: "background .2s" }} />
            )}
          </div>
        );
      })}
    </div>
  );
};

// ── Virtual Session Panel ─────────────────────────────────────────────────────
const VirtualSessionPanel = ({ s, onRefresh }: { s: any; onRefresh: () => void }) => {
  const { toast }     = useToast();
  const navigate      = useNavigate();
  const [score, setScore]       = useState<number | "">(s.recitation?.eval_score ?? "");
  const [notes, setNotes]       = useState(s.recitation?.eval_notes ?? "");
  const [selLevel, setSelLevel] = useState(s.profiles?.level ?? "");
  const [saving, setSaving]     = useState(false);
  const [accepting, setAccepting] = useState(false);
  const { levels } = useAcademicLevels();

  const rec       = s.recitation || {};
  const prof      = s.profiles   || {};
  const approved  = !!rec.admin_approved;
  const canJoin   = approved && sessionActive(rec.virtual_session_date, rec.virtual_session_time);
  const roomName  = `recitation-eval-${s.user_id}`;

  const acceptSession = async () => {
    setAccepting(true);
    try {
      await (supabase as any).from("recitation_tests").update({
        admin_approved: true,
        admin_approved_at: new Date().toISOString(),
        status: "session_confirmed",
      }).eq("user_id", s.user_id);

      await (supabase as any).from("notifications").insert({
        user_id: s.user_id,
        title: "✅ Virtual Session Confirmed!",
        message: `Your virtual recitation session on ${rec.virtual_session_date} at ${rec.virtual_session_time || "—"} has been confirmed.`,
        type: "session_confirmed",
        is_read: false,
        created_at: new Date().toISOString(),
      });

      toast({ title: "✅ Session confirmed — student notified" });
      onRefresh();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setAccepting(false); }
  };

  const saveEval = async () => {
    if (!selLevel) { toast({ title: "Select a level", variant: "destructive" }); return; }
    setSaving(true);
    try {
      await (supabase as any).from("recitation_tests").update({
        eval_score: score,
        eval_notes: notes,
        eval_completed_at: new Date().toISOString(),
        status: "evaluated",
      }).eq("user_id", s.user_id);

      await supabase.from("profiles").update({ level: selLevel, course_level: selLevel }).eq("user_id", s.user_id);
      await (supabase as any).from("tasjeel_progress").update({
        current_step: "completed",
        level_assigned: selLevel,
        level_assigned_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("user_id", s.user_id);

      await (supabase as any).from("notifications").insert({
        user_id: s.user_id,
        title: "🎉 Level Assigned — Welcome to Tahleem Academy!",
        message: `You have been placed in ${selLevel}. Your full dashboard is now active. Ahlan wa Sahlan!`,
        type: "level_assigned",
        is_read: false,
        created_at: new Date().toISOString(),
      });

      toast({ title: `✅ Evaluation saved — level "${selLevel}" assigned!` });
      onRefresh();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const inp: React.CSSProperties = {
    width: "100%", padding: "9px 12px", borderRadius: 10,
    border: `1.5px solid ${BORDER}`, fontSize: 13, outline: "none",
    background: "#FAFAFA", boxSizing: "border-box",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

      {/* Session timing card */}
      <div style={{ background: rec.virtual_session_date ? (approved ? "#F0FDF4" : "#FFF7ED") : "#F9FAFB", borderRadius: 14, border: `1.5px solid ${approved ? "#86EFAC" : rec.virtual_session_date ? "#FED7AA" : BORDER}`, padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <p style={{ margin: 0, fontWeight: 800, fontSize: 13, color: "#374151" }}>
            <Calendar size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
            Virtual Session
          </p>
          {approved ? (
            <span style={{ padding: "3px 10px", borderRadius: 20, background: "#DCFCE7", color: "#16A34A", fontSize: 10, fontWeight: 700 }}>✓ Confirmed</span>
          ) : rec.virtual_session_date ? (
            <span style={{ padding: "3px 10px", borderRadius: 20, background: "#FEF3C7", color: "#D97706", fontSize: 10, fontWeight: 700 }}>⚠️ Awaiting Confirmation</span>
          ) : (
            <span style={{ padding: "3px 10px", borderRadius: 20, background: "#F3F4F6", color: "#9CA3AF", fontSize: 10, fontWeight: 700 }}>Not Scheduled</span>
          )}
        </div>

        {rec.virtual_session_date ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <Pill label="Date" value={rec.virtual_session_date} />
            <Pill label="Time" value={rec.virtual_session_time || "—"} />
            <Pill label="Platform" value={rec.virtual_platform || "Zoom / Meet"} />
          </div>
        ) : (
          <p style={{ fontSize: 12, color: "#9CA3AF", margin: "0 0 12px" }}>Student has not yet requested a session.</p>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {rec.virtual_session_date && !approved && (
            <button onClick={acceptSession} disabled={accepting}
              style={{ flex: 1, padding: "10px 14px", borderRadius: 10, border: "none", background: G, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              {accepting ? <Loader2 size={14} style={{ animation: "spin .8s linear infinite" }} /> : <CheckCircle size={14} />}
              Confirm Session
            </button>
          )}
          {canJoin && (
            <button onClick={() => navigate(`/admin/classroom?room=${roomName}`)}
              style={{ flex: 1, padding: "10px 14px", borderRadius: 10, border: "none", background: "#3B82F6", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <Video size={14} /> Join Live Now
            </button>
          )}
          {approved && !canJoin && rec.virtual_session_date && (
            <div style={{ flex: 1, padding: "10px 14px", borderRadius: 10, background: "#F0FDF4", border: "1px solid #86EFAC", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 12, color: "#15803D", fontWeight: 600 }}>
              <Clock size={13} /> Join button appears 15 min before session
            </div>
          )}
        </div>
      </div>

      {/* Recitation audio */}
      {rec.audio_path && (
        <SectionBlock icon="🎙️" title="Submitted Recitation Audio" accent="#F5F3FF" border="#C4B5FD">
          <AudioPlayer path={rec.audio_path} />
          {rec.surah_name && (
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <Pill label="Surah" value={rec.surah_name} />
              {rec.from_verse && <Pill label="From" value={`v.${rec.from_verse}`} />}
              {rec.to_verse   && <Pill label="To"   value={`v.${rec.to_verse}`}   />}
            </div>
          )}
        </SectionBlock>
      )}

      {/* Evaluation scoring */}
      <SectionBlock icon="🏆" title="Evaluation & Level Assignment" accent="#FFFBEB" border="#FDE68A">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>SCORE (0 – 100)</label>
            <input type="number" min={0} max={100} value={score} onChange={e => setScore(e.target.value ? +e.target.value : "")}
              style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: `1.5px solid ${BORDER}`, fontSize: 13, outline: "none", background: "#FAFAFA", boxSizing: "border-box" }} />
            {score !== "" && (
              <p style={{ fontSize: 11, marginTop: 4, color: scoreColor(+score), fontWeight: 700 }}>
                {+score >= 75 ? "🌟 Excellent" : +score >= 50 ? "👍 Good" : "⚠️ Needs Work"}
              </p>
            )}
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>ASSIGN LEVEL</label>
            <select value={selLevel} onChange={e => setSelLevel(e.target.value)}
              style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: `1.5px solid ${BORDER}`, fontSize: 13, outline: "none", background: "#FAFAFA", boxSizing: "border-box" }}>
              <option value="">— Select level —</option>
              {(levels || []).map((l: any) => (
                <option key={l.id} value={l.code || l.name}>{l.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>EVALUATOR NOTES</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Observations, Tajweed issues, recommendations…"
            style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: `1.5px solid ${BORDER}`, fontSize: 13, outline: "none", background: "#FAFAFA", resize: "none", boxSizing: "border-box" }} />
        </div>
        {score !== "" && selLevel && (
          <div style={{ padding: "10px 12px", borderRadius: 10, background: G + "10", border: `1px solid ${G}30`, marginBottom: 10, fontSize: 12, color: G, fontWeight: 600 }}>
            Ready to place <strong>{prof.full_name || "student"}</strong> in <strong>{selLevel}</strong> with a score of <strong>{score}/100</strong>
          </div>
        )}
        <button onClick={saveEval} disabled={saving}
          style={{ width: "100%", padding: "12px", borderRadius: 12, border: "none", background: G, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {saving ? <Loader2 size={16} style={{ animation: "spin .8s linear infinite" }} /> : <Award size={16} />}
          Save Evaluation & Assign Level
        </button>
      </SectionBlock>
    </div>
  );
};

// ── Per-student registration card ─────────────────────────────────────────────
const RegCard = ({ s, onRefresh, viewEval }: { s: any; onRefresh: () => void; viewEval?: boolean }) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(viewEval ?? false);

  const prof    = s.profiles   || {};
  const rec     = s.recitation || null;
  const exam    = s.exam       || null;
  const stepCfg = STEPS[s.current_step] || { label: s.current_step, icon: "?", color: "#9CA3AF", bg: "#F9FAFB" };
  const stepIdx = STEP_ORDER.indexOf(s.current_step);
  const hasSession   = !!rec?.virtual_session_date;
  const needsAction  = hasSession && !rec?.admin_approved;

  return (
    <div style={{ background: "#fff", borderRadius: 18, border: `1.5px solid ${needsAction ? "#FCA5A5" : BORDER}`, overflow: "hidden", boxShadow: needsAction ? "0 0 0 3px #FEE2E2" : "0 2px 8px rgba(0,0,0,.04)", transition: "box-shadow .2s" }}>

      {needsAction && (
        <div style={{ background: "#FEF2F2", borderBottom: "1px solid #FCA5A5", padding: "6px 16px", fontSize: 11, fontWeight: 700, color: "#DC2626", display: "flex", alignItems: "center", gap: 6 }}>
          <Bell size={11} /> Action required: confirm virtual session
        </div>
      )}

      {/* Card header */}
      <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        {avatar(prof)}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 800, fontSize: 15, color: "#111" }}>{prof.full_name || "New Student"}</span>
            {prof.full_name_ar && <span style={{ fontSize: 13, fontFamily: "'Amiri',serif", color: GOLD }}>{prof.full_name_ar}</span>}
          </div>
          <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {prof.email}{prof.student_id ? ` · #${prof.student_id}` : ""}{prof.country ? ` · ${prof.country}` : ""}
          </p>
          <p style={{ fontSize: 10, color: "#D1D5DB", margin: "2px 0 0" }}>Registered {fmt(s.created_at)}</p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
          <span style={{ padding: "4px 11px", borderRadius: 20, background: stepCfg.bg, color: stepCfg.color, fontSize: 11, fontWeight: 700, border: `1px solid ${stepCfg.color}33` }}>
            {stepCfg.icon} {stepCfg.label}
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setOpen(o => !o)}
              style={{ padding: "6px 8px", borderRadius: 8, border: `1.5px solid ${BORDER}`, background: "#F9FAFB", cursor: "pointer" }}>
              {open ? <ChevronUp size={13} color="#6B7280" /> : <ChevronDown size={13} color="#6B7280" />}
            </button>
            <button onClick={() => navigate(`/admin/view-as-student/${s.user_id}`)} title="View as Student"
              style={{ padding: "6px 8px", borderRadius: 8, border: `1.5px solid ${BORDER}`, background: "#fff", cursor: "pointer" }}>
              <Eye size={13} color="#6B7280" />
            </button>
          </div>
        </div>
      </div>

      {/* Expanded body */}
      {open && (
        <div style={{ padding: "0 16px 16px", borderTop: `1px solid ${BORDER}` }}>
          <StepTimeline current={s.current_step} />

          {/* Payment */}
          <SectionBlock icon="💳" title="Payment" accent="#F0F9FF" border="#BAE6FD">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Pill label="Status" value={
                s.payment_status === "paid"   ? "✅ Paid" :
                s.payment_status === "exempt" ? "🔵 Exempt" :
                s.payment_status             || "Pending"
              } color={s.payment_status === "paid" ? "#15803D" : s.payment_status === "exempt" ? "#1D4ED8" : "#DC2626"} />
              {s.payment?.payment_ref && <Pill label="Ref"    value={s.payment.payment_ref} />}
              {s.payment?.amount      && <Pill label="Amount" value={`₦${Number(s.payment.amount).toLocaleString()}`} />}
              {s.payment?.paid_at     && <Pill label="Date"   value={fmt(s.payment.paid_at)} />}
            </div>
          </SectionBlock>

          {/* Entrance exam */}
          <SectionBlock icon="📖" title="Entrance Exam" accent="#FFFBEB" border="#FDE68A">
            {exam ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Pill label="Score"     value={`${exam.score ?? 0} / ${exam.max_score ?? 0}`} />
                <Pill label="%" value={exam.percentage !== undefined ? `${Math.round(exam.percentage)}%` : undefined}
                      color={exam.percentage >= 70 ? "#15803D" : exam.percentage >= 40 ? "#D97706" : "#DC2626"} />
                <Pill label="Suggested" value={exam.percentage !== undefined ? levelFromPct(exam.percentage) : undefined} color={G} />
                <Pill label="Submitted" value={fmt(exam.submitted_at)} />
              </div>
            ) : (
              <p style={{ fontSize: 12, color: "#9CA3AF", margin: 0 }}>
                {stepIdx <= STEP_ORDER.indexOf("exam") ? "Exam not yet taken" : "Not required"}
              </p>
            )}
          </SectionBlock>

          {/* Virtual session + evaluation */}
          <VirtualSessionPanel s={s} onRefresh={onRefresh} />
        </div>
      )}
    </div>
  );
};

// ── Enrolled student card (compact) ──────────────────────────────────────────
const EnrolledCard = ({ s }: { s: any }) => {
  const prof = s.profiles || s;
  return (
    <div style={{ background: "#fff", borderRadius: 14, border: `1.5px solid ${BORDER}`, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
      {avatar(prof, 40)}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontWeight: 700, fontSize: 14, color: "#111", margin: 0 }}>{prof.full_name || "—"}</p>
        <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{prof.email}</p>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <span style={{ display: "block", padding: "3px 9px", borderRadius: 20, background: "#F0FDF4", color: "#15803D", fontSize: 10, fontWeight: 700, border: "1px solid #86EFAC" }}>
          {prof.level || prof.course_level || "Enrolled"}
        </span>
        <p style={{ fontSize: 10, color: "#D1D5DB", margin: "4px 0 0" }}>{fmt(prof.level_assigned_at || prof.created_at)}</p>
      </div>
    </div>
  );
};

// ── Flow Settings tab ─────────────────────────────────────────────────────────
const FlowSettings = () => {
  const { config, loading, saveAll, currencySymbol } = useRegistrationSettings();
  const { user } = { user: null } as any; // pulled from context in real app
  const { toast } = useToast();
  const [draft, setDraft]   = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!loading && config) setDraft({ ...config }); }, [loading, config]);

  if (loading || !draft) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
      <Loader2 size={24} style={{ animation: "spin .8s linear infinite", color: G }} />
    </div>
  );

  const set = (patch: any) => setDraft((p: any) => ({ ...p, ...patch }));
  const sym = currencySymbol(draft.entrance_fee_currency);

  const handleSave = async () => {
    setSaving(true);
    await saveAll(draft, user?.id);
    setSaving(false);
    toast({ title: "✅ Registration flow settings saved" });
  };

  const inp: React.CSSProperties = { width: "100%", padding: "9px 12px", borderRadius: 10, border: `1.5px solid ${BORDER}`, fontSize: 13, outline: "none", background: "#FAFAFA", boxSizing: "border-box" };
  const Grp = ({ children }: any) => <div style={{ background: "#fff", borderRadius: 16, border: `1.5px solid ${BORDER}`, overflow: "hidden", marginBottom: 14 }}>{children}</div>;
  const GrpHead = ({ icon: Icon, title }: any) => (
    <div style={{ padding: "11px 16px", background: "#F9FAFB", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 8 }}>
      <Icon size={15} color={G} />
      <p style={{ fontWeight: 800, fontSize: 11, color: "#374151", margin: 0, textTransform: "uppercase", letterSpacing: .5 }}>{title}</p>
    </div>
  );
  const GrpBody = ({ children }: any) => <div style={{ padding: "12px 16px" }}>{children}</div>;

  return (
    <div>
      {/* Registration gate */}
      <Grp>
        <GrpHead icon={Shield} title="Registration Gate" />
        <GrpBody>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${BORDER}` }}>
            <div>
              <p style={{ fontWeight: 700, fontSize: 14, margin: 0, color: draft.registration_open ? "#15803D" : "#DC2626" }}>
                Registration is currently <strong>{draft.registration_open ? "OPEN" : "CLOSED"}</strong>
              </p>
              <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>Controls whether new students can access the signup page</p>
            </div>
            <Switch checked={draft.registration_open} onCheckedChange={v => set({ registration_open: v })} />
          </div>
          <div style={{ marginTop: 10 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>CLOSED MESSAGE</label>
            <textarea rows={2} value={draft.closed_message || ""} onChange={e => set({ closed_message: e.target.value })}
              style={{ ...inp, resize: "none" }} placeholder="Message shown when registration is closed…" />
          </div>
        </GrpBody>
      </Grp>

      {/* Registration steps */}
      <Grp>
        <GrpHead icon={FileText} title="Registration Steps" />
        <GrpBody>
          <SettingRow label="Require Payment" sub="Students must pay before proceeding to onboarding" checked={draft.require_payment ?? false} onChange={(v: boolean) => set({ require_payment: v })} />
          <SettingRow label="Require Entrance Exam" sub="Written exam before virtual evaluation" checked={draft.require_entrance_exam ?? false} onChange={(v: boolean) => set({ require_entrance_exam: v })} />
          <SettingRow label="Require Virtual Evaluation" sub="Live recitation session via video call" checked={draft.require_recitation_eval ?? false} onChange={(v: boolean) => set({ require_recitation_eval: v })} />
          <SettingRow label="Auto-advance on Payment" sub="Skip manual review if payment is verified" checked={draft.auto_advance_payment ?? false} onChange={(v: boolean) => set({ auto_advance_payment: v })} />
        </GrpBody>
      </Grp>

      {/* Entrance fee */}
      <Grp>
        <GrpHead icon={CreditCard} title="Entrance Fee" />
        <GrpBody>
          <SettingRow label="Enable Entrance Fee" sub="Charge a registration fee" checked={draft.enable_entrance_fee ?? false} onChange={(v: boolean) => set({ enable_entrance_fee: v })} />
          {draft.enable_entrance_fee && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>AMOUNT</label>
                <input type="number" value={draft.entrance_fee_amount || ""} onChange={e => set({ entrance_fee_amount: +e.target.value })} style={inp} placeholder="0" />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>CURRENCY</label>
                <select value={draft.entrance_fee_currency || "NGN"} onChange={e => set({ entrance_fee_currency: e.target.value })} style={inp}>
                  <option value="NGN">NGN — ₦</option>
                  <option value="USD">USD — $</option>
                  <option value="GBP">GBP — £</option>
                  <option value="EUR">EUR — €</option>
                </select>
              </div>
            </div>
          )}
          <SettingRow label="Allow Fee Exemptions" sub="Admin can mark individual students as exempt" checked={draft.allow_exemptions ?? false} onChange={(v: boolean) => set({ allow_exemptions: v })} />
        </GrpBody>
      </Grp>

      {/* Exam settings */}
      <Grp>
        <GrpHead icon={BookOpen} title="Entrance Exam Settings" />
        <GrpBody>
          <SettingRow label="Enable Exam Timer" sub="Students must complete within time limit" checked={draft.exam_timer_enabled ?? false} onChange={(v: boolean) => set({ exam_timer_enabled: v })} />
          {draft.exam_timer_enabled && (
            <div style={{ marginTop: 10 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>TIME LIMIT (MINUTES)</label>
              <input type="number" value={draft.exam_duration_minutes || ""} onChange={e => set({ exam_duration_minutes: +e.target.value })} style={inp} placeholder="60" />
            </div>
          )}
          <SettingRow label="Randomise Questions" sub="Shuffle question order per student" checked={draft.randomise_questions ?? false} onChange={(v: boolean) => set({ randomise_questions: v })} />
          <SettingRow label="Proctoring Enabled" sub="Screen capture during exam" checked={draft.proctoring_enabled ?? false} onChange={(v: boolean) => set({ proctoring_enabled: v })} />
          <div style={{ marginTop: 10 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>PASS PERCENTAGE (%)</label>
            <input type="number" min={0} max={100} value={draft.exam_pass_percentage || ""} onChange={e => set({ exam_pass_percentage: +e.target.value })} style={inp} placeholder="50" />
          </div>
        </GrpBody>
      </Grp>

      {/* Virtual session defaults */}
      <Grp>
        <GrpHead icon={Video} title="Virtual Evaluation Defaults" />
        <GrpBody>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>DEFAULT PLATFORM</label>
            <select value={draft.default_virtual_platform || "zoom"} onChange={e => set({ default_virtual_platform: e.target.value })} style={inp}>
              <option value="zoom">Zoom</option>
              <option value="meet">Google Meet</option>
              <option value="teams">Microsoft Teams</option>
              <option value="other">Other / In-app</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>INSTRUCTIONS FOR STUDENT</label>
            <textarea rows={3} value={draft.virtual_session_instructions || ""} onChange={e => set({ virtual_session_instructions: e.target.value })}
              style={{ ...inp, resize: "none" }} placeholder="What should the student prepare before their virtual session…" />
          </div>
          <SettingRow label="Auto-notify on Session Confirm" sub="Send push notification when admin approves" checked={draft.notify_on_session_confirm ?? true} onChange={(v: boolean) => set({ notify_on_session_confirm: v })} />
        </GrpBody>
      </Grp>

      {/* Notifications */}
      <Grp>
        <GrpHead icon={Bell} title="Notification Triggers" />
        <GrpBody>
          <SettingRow label="New Registration Alert" sub="Notify admin when a new student signs up" checked={draft.notify_admin_new_reg ?? true} onChange={(v: boolean) => set({ notify_admin_new_reg: v })} />
          <SettingRow label="Payment Received Alert" sub="Notify admin when payment is confirmed" checked={draft.notify_admin_payment ?? true} onChange={(v: boolean) => set({ notify_admin_payment: v })} />
          <SettingRow label="Exam Submitted Alert" sub="Notify admin when student completes entrance exam" checked={draft.notify_admin_exam ?? true} onChange={(v: boolean) => set({ notify_admin_exam: v })} />
          <SettingRow label="Level Assigned Notification" sub="Notify student when placed in a level" checked={draft.notify_student_level ?? true} onChange={(v: boolean) => set({ notify_student_level: v })} />
        </GrpBody>
      </Grp>

      <button onClick={handleSave} disabled={saving}
        style={{ width: "100%", padding: "14px", borderRadius: 14, border: "none", background: G, color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: `0 4px 16px ${G}40` }}>
        {saving ? <Loader2 size={18} style={{ animation: "spin .8s linear infinite" }} /> : <CheckCircle size={18} />}
        Save All Flow Settings
      </button>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
type Tab = "overview" | "new" | "enrolled" | "eval" | "settings";

export default function StudentRegistration() {
  const { toast } = useToast();
  const [tab, setTab]         = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Data
  const [pipeline, setPipeline]   = useState<any[]>([]);
  const [enrolled, setEnrolled]   = useState<any[]>([]);
  const [stats, setStats]         = useState({ today: 0, week: 0, pending: 0, enrolled: 0, awaiting: 0 });

  // Filters
  const [query, setQuery]       = useState("");
  const [filterStep, setFilterStep] = useState("all");

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [pipeRes, enrolledRes] = await Promise.all([
        (supabase as any).from("tasjeel_progress")
          .select(`*, profiles(*), recitation:recitation_tests(*), exam:exam_submissions(*), payment:registration_payments(*)`)
          .neq("current_step", "completed")
          .order("created_at", { ascending: false }),
        supabase.from("profiles")
          .select("*")
          .not("level", "is", null)
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

      const p = pipeRes.data || [];
      const e = enrolledRes.data || [];
      setPipeline(p);
      setEnrolled(e);

      const today   = new Date().toISOString().slice(0, 10);
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const [todayRes, weekRes] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", `${today}T00:00:00`),
        supabase.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", weekAgo),
      ]);

      setStats({
        today:    todayRes.count || 0,
        week:     weekRes.count  || 0,
        pending:  p.filter((x: any) => ["enrollment","payment","onboarding","exam","review"].includes(x.current_step)).length,
        enrolled: e.length,
        awaiting: p.filter((x: any) => x.current_step === "level_assignment").length,
      });
    } catch (e: any) {
      toast({ title: "Failed to load", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Filtered pipeline
  const filtered = pipeline.filter(s => {
    const prof = s.profiles || {};
    const q    = query.toLowerCase();
    const matchQ = !q || (prof.full_name || "").toLowerCase().includes(q) || (prof.email || "").toLowerCase().includes(q) || (prof.student_id || "").toLowerCase().includes(q);
    const matchS = filterStep === "all" || s.current_step === filterStep;
    return matchQ && matchS;
  });

  // Students awaiting virtual evaluation
  const evalStudents = pipeline.filter(s => s.current_step === "level_assignment" || (s.recitation?.virtual_session_date && !s.recitation?.admin_approved));

  // ── Tab config ──────────────────────────────────────────────────────────────
  const TABS: { id: Tab; label: string; icon: any; badge?: number }[] = [
    { id: "overview",  label: "Overview",    icon: BarChart2 },
    { id: "new",       label: "Pipeline",    icon: UserPlus, badge: stats.pending },
    { id: "enrolled",  label: "Enrolled",    icon: UserCheck, badge: stats.enrolled },
    { id: "eval",      label: "Evaluations", icon: Video, badge: stats.awaiting },
    { id: "settings",  label: "Flow",        icon: Settings },
  ];

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", flexDirection: "column", gap: 12 }}>
      <div style={{ width: 48, height: 48, borderRadius: 16, background: `${G}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 size={24} style={{ animation: "spin .8s linear infinite", color: G }} />
      </div>
      <p style={{ fontSize: 13, color: "#9CA3AF", margin: 0 }}>Loading Student Registration…</p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const inp: React.CSSProperties = { width: "100%", padding: "9px 12px", borderRadius: 10, border: `1.5px solid ${BORDER}`, fontSize: 13, outline: "none", background: "#FAFAFA", boxSizing: "border-box" };

  return (
    <div style={{ minHeight: "100vh", background: CREAM }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}`}</style>

      {/* ── Page header ── */}
      <div style={{ background: "#fff", borderBottom: `1px solid ${BORDER}`, padding: "0 16px" }}>
        <div style={{ paddingTop: 16, paddingBottom: 10, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: `${G}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <GraduationCap size={18} color={G} />
              </div>
              <div>
                <h1 style={{ fontSize: 18, fontWeight: 900, color: "#111", margin: 0, letterSpacing: -.3 }}>Student Registration</h1>
                <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>Full enrollment & evaluation control centre</p>
              </div>
            </div>
          </div>
          <button onClick={load} disabled={refreshing}
            style={{ padding: "8px 12px", borderRadius: 10, border: `1.5px solid ${BORDER}`, background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#6B7280" }}>
            <RefreshCw size={13} style={refreshing ? { animation: "spin .8s linear infinite" } : undefined} />
            Refresh
          </button>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 2, overflowX: "auto", paddingBottom: 0 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 12px", borderRadius: 0, border: "none", background: "none", cursor: "pointer", fontSize: 12, fontWeight: tab === t.id ? 800 : 500, color: tab === t.id ? G : "#6B7280", borderBottom: `2.5px solid ${tab === t.id ? G : "transparent"}`, whiteSpace: "nowrap", transition: "all .15s", flexShrink: 0, position: "relative" }}>
              <t.icon size={13} />
              {t.label}
              {t.badge !== undefined && t.badge > 0 && (
                <span style={{ position: "absolute", top: 4, right: 4, minWidth: 14, height: 14, borderRadius: 7, background: t.id === "eval" ? "#DC2626" : GOLD, color: "#fff", fontSize: 8, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ── */}
      <div style={{ padding: 16, maxWidth: 680, margin: "0 auto", animation: "fadeIn .2s ease" }}>

        {/* ──────────── OVERVIEW ──────────── */}
        {tab === "overview" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Stats grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <InfoCard icon={TrendingUp}  label="Today"     value={stats.today}    accent="#6366f1" />
              <InfoCard icon={BarChart2}   label="This Week" value={stats.week}     accent="#0ea5e9" />
              <InfoCard icon={Clock}       label="In Pipeline" value={stats.pending} accent="#f59e0b" />
              <InfoCard icon={UserCheck}   label="Enrolled"  value={stats.enrolled} accent="#22c55e" />
            </div>

            {/* Alert: awaiting evaluation */}
            {stats.awaiting > 0 && (
              <div style={{ background: "#FFF7ED", borderRadius: 14, border: "1.5px solid #FED7AA", padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: "#FEF3C7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Video size={18} color="#D97706" />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 800, fontSize: 13, margin: 0, color: "#92400E" }}>{stats.awaiting} student{stats.awaiting > 1 ? "s" : ""} awaiting virtual evaluation</p>
                  <p style={{ fontSize: 11, color: "#B45309", margin: "2px 0 0" }}>Tap "Evaluations" tab to review and confirm sessions</p>
                </div>
                <button onClick={() => setTab("eval")} style={{ padding: "7px 12px", borderRadius: 8, border: "none", background: "#D97706", color: "#fff", fontWeight: 700, fontSize: 11, cursor: "pointer", flexShrink: 0 }}>
                  View
                </button>
              </div>
            )}

            {/* Pipeline step breakdown */}
            <div style={{ background: "#fff", borderRadius: 16, border: `1.5px solid ${BORDER}`, overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 8 }}>
                <Filter size={14} color={G} />
                <p style={{ fontWeight: 800, fontSize: 12, margin: 0, textTransform: "uppercase", letterSpacing: .5, color: "#374151" }}>Pipeline Breakdown</p>
              </div>
              <div style={{ padding: "8px 16px 14px" }}>
                {STEP_ORDER.filter(s => s !== "completed").map(step => {
                  const count = pipeline.filter(p => p.current_step === step).length;
                  const cfg   = STEPS[step];
                  const pct   = pipeline.length ? (count / pipeline.length) * 100 : 0;
                  return (
                    <div key={step} style={{ padding: "8px 0", borderBottom: `1px solid ${BORDER}` }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{cfg.icon} {cfg.label}</span>
                        <span style={{ fontSize: 12, fontWeight: 800, color: cfg.color }}>{count}</span>
                      </div>
                      <div style={{ height: 4, borderRadius: 4, background: "#F3F4F6", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: cfg.color, borderRadius: 4, transition: "width .4s" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quick actions */}
            <div style={{ background: "#fff", borderRadius: 16, border: `1.5px solid ${BORDER}`, overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: `1px solid ${BORDER}` }}>
                <p style={{ fontWeight: 800, fontSize: 12, margin: 0, textTransform: "uppercase", letterSpacing: .5, color: "#374151" }}>Quick Actions</p>
              </div>
              {[
                { label: "Review New Registrations", sub: `${stats.pending} students in pipeline`, icon: UserPlus, color: "#6366f1", action: () => setTab("new") },
                { label: "Confirm Virtual Sessions", sub: `${evalStudents.filter(s => s.recitation?.virtual_session_date && !s.recitation?.admin_approved).length} sessions need confirmation`, icon: Video, color: "#DC2626", action: () => setTab("eval") },
                { label: "Registration Flow Settings", sub: "Edit steps, fees, exam, notifications", icon: Settings, color: G, action: () => setTab("settings") },
              ].map((a, i) => (
                <button key={i} onClick={a.action}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", background: "none", border: "none", borderBottom: i < 2 ? `1px solid ${BORDER}` : "none", cursor: "pointer", textAlign: "left" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: a.color + "18", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <a.icon size={16} color={a.color} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 700, fontSize: 13, margin: 0, color: "#111" }}>{a.label}</p>
                    <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>{a.sub}</p>
                  </div>
                  <ChevronRight size={14} color="#D1D5DB" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ──────────── NEW / PIPELINE ──────────── */}
        {tab === "new" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Search + filter bar */}
            <div style={{ background: "#fff", borderRadius: 14, border: `1.5px solid ${BORDER}`, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ position: "relative" }}>
                <Search size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by name, email, or student ID…"
                  style={{ ...inp, paddingLeft: 32 }} />
              </div>
              <div style={{ display: "flex", gap: 8, overflowX: "auto" }}>
                {["all", ...STEP_ORDER].filter(s => s !== "completed").map(step => (
                  <button key={step} onClick={() => setFilterStep(step)}
                    style={{ padding: "5px 12px", borderRadius: 20, border: `1.5px solid ${filterStep === step ? G : BORDER}`, background: filterStep === step ? `${G}12` : "#fff", color: filterStep === step ? G : "#6B7280", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
                    {step === "all" ? "All" : STEPS[step]?.icon + " " + STEPS[step]?.label}
                  </button>
                ))}
              </div>
            </div>

            <p style={{ fontSize: 12, color: "#9CA3AF", margin: 0 }}>
              {filtered.length} student{filtered.length !== 1 ? "s" : ""} {filterStep !== "all" ? `in ${STEPS[filterStep]?.label}` : "in pipeline"}
            </p>

            {filtered.length === 0 ? (
              <div style={{ background: "#fff", borderRadius: 16, border: `1.5px solid ${BORDER}`, padding: 32, textAlign: "center" }}>
                <p style={{ fontSize: 32, margin: "0 0 8px" }}>🕌</p>
                <p style={{ fontWeight: 700, color: "#374151", margin: 0 }}>No students found</p>
                <p style={{ fontSize: 12, color: "#9CA3AF", margin: "4px 0 0" }}>{query ? "Try a different search" : "All registrations are complete"}</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {filtered.map(s => <RegCard key={s.user_id} s={s} onRefresh={load} />)}
              </div>
            )}
          </div>
        )}

        {/* ──────────── ENROLLED ──────────── */}
        {tab === "enrolled" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ background: "#F0FDF4", borderRadius: 14, border: "1.5px solid #86EFAC", padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
              <UserCheck size={18} color="#16A34A" />
              <div>
                <p style={{ fontWeight: 800, fontSize: 13, color: "#15803D", margin: 0 }}>{enrolled.length} Enrolled Students</p>
                <p style={{ fontSize: 11, color: "#16A34A", margin: 0 }}>Fully registered and placed in levels</p>
              </div>
            </div>
            <div style={{ position: "relative" }}>
              <Search size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search enrolled students…"
                style={{ ...inp, paddingLeft: 32 }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {enrolled
                .filter(s => {
                  const q = query.toLowerCase();
                  return !q || (s.full_name || "").toLowerCase().includes(q) || (s.email || "").toLowerCase().includes(q);
                })
                .map(s => <EnrolledCard key={s.user_id || s.id} s={s} />)
              }
            </div>
          </div>
        )}

        {/* ──────────── EVALUATIONS ──────────── */}
        {tab === "eval" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ background: "#fff", borderRadius: 14, border: `1.5px solid ${BORDER}`, padding: "12px 14px" }}>
              <p style={{ fontWeight: 800, fontSize: 13, color: "#374151", margin: "0 0 4px" }}>Virtual Evaluations</p>
              <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>Confirm sessions, join live calls, score recitation, and assign levels.</p>
            </div>

            {/* Needs action first */}
            {evalStudents.filter(s => s.recitation?.virtual_session_date && !s.recitation?.admin_approved).length > 0 && (
              <div>
                <p style={{ fontSize: 11, fontWeight: 800, color: "#DC2626", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: .5 }}>⚠️ Action Required</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {evalStudents
                    .filter(s => s.recitation?.virtual_session_date && !s.recitation?.admin_approved)
                    .map(s => <RegCard key={s.user_id} s={s} onRefresh={load} viewEval />)
                  }
                </div>
              </div>
            )}

            {/* Awaiting session (no date yet) */}
            {evalStudents.filter(s => !s.recitation?.virtual_session_date).length > 0 && (
              <div>
                <p style={{ fontSize: 11, fontWeight: 800, color: "#9CA3AF", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: .5 }}>Awaiting Student to Schedule</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {evalStudents
                    .filter(s => !s.recitation?.virtual_session_date)
                    .map(s => <RegCard key={s.user_id} s={s} onRefresh={load} />)
                  }
                </div>
              </div>
            )}

            {evalStudents.length === 0 && (
              <div style={{ background: "#fff", borderRadius: 16, border: `1.5px solid ${BORDER}`, padding: 32, textAlign: "center" }}>
                <p style={{ fontSize: 36, margin: "0 0 8px" }}>✅</p>
                <p style={{ fontWeight: 700, color: "#374151", margin: 0 }}>All clear!</p>
                <p style={{ fontSize: 12, color: "#9CA3AF", margin: "4px 0 0" }}>No evaluations pending right now</p>
              </div>
            )}
          </div>
        )}

        {/* ──────────── FLOW SETTINGS ──────────── */}
        {tab === "settings" && <FlowSettings />}
      </div>
    </div>
  );
}
