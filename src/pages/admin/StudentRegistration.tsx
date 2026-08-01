// src/pages/admin/StudentRegistration.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// STUDENT REGISTRATION — Unified Admin Control Centre
// ─ Overview · Pipeline · Enrolled · Evaluations · Flow Settings
// ─ Virtual Evaluation uses LiveKit (Tasjeel class room)
// ─ Flow Settings syncs live from Supabase Realtime
// ═══════════════════════════════════════════════════════════════════════════════

import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { storageSupabase } from "../../integrations/supabase/storageClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useLiveClass } from "@/contexts/LiveClassContext";
import { useRegistrationSettings } from "@/hooks/useRegistrationSettings";
import { useAcademicLevels } from "@/hooks/useAcademicLevels";
import {
  Users, UserPlus, UserCheck, Search, RefreshCw, Video,
  Play, Pause, ChevronDown, ChevronUp, Eye, CheckCircle,
  XCircle, Clock, Star, Settings, Bell, Shield, BarChart2,
  CreditCard, BookOpen, Mic, Award, Calendar,
  AlertTriangle, Filter, Send, TrendingUp,
  GraduationCap, FileText, Loader2,
  ChevronRight, Link, Copy, ExternalLink,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";

// ── Brand tokens ──────────────────────────────────────────────────────────────
const G      = "#064E3B";
const GOLD   = "#C9A84C";
const CREAM  = "#FDFCF8";
const BORDER = "#E8E4DC";

// ── Step definitions ──────────────────────────────────────────────────────────
const STEPS: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  enrollment:       { label: "Enrollment",      icon: "📝", color: "#6366f1", bg: "#EEF2FF" },
  payment:          { label: "Payment",          icon: "💳", color: "#0ea5e9", bg: "#F0F9FF" },
  onboarding:       { label: "Onboarding",       icon: "📋", color: "#8b5cf6", bg: "#F5F3FF" },
  exam:             { label: "Entrance Exam",    icon: "📖", color: "#f59e0b", bg: "#FFFBEB" },
  review:           { label: "Under Review",     icon: "🔍", color: "#ef4444", bg: "#FEF2F2" },
  level_assignment: { label: "Awaiting Session", icon: "📅", color: "#f97316", bg: "#FFF7ED" },
  completed:        { label: "Enrolled",         icon: "✅", color: "#22c55e", bg: "#F0FDF4" },
};
const STEP_ORDER = ["enrollment","payment","onboarding","exam","review","level_assignment","completed"];

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt  = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) : "—";
const fmtT = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

/** Returns true if the session is within 15 min before or 2 hrs after start */
const sessionActive = (date?: string, time?: string) => {
  if (!date || !time) return false;
  try {
    const dt   = new Date(`${date}T${time}:00`);
    const diff = (dt.getTime() - Date.now()) / 60000;
    return diff <= 15 && diff >= -120;
  } catch { return false; }
};

/** Returns true if session is within 15 minutes (to show the countdown/notify) */
const sessionSoon = (date?: string, time?: string) => {
  if (!date || !time) return false;
  try {
    const dt   = new Date(`${date}T${time}:00`);
    const diff = (dt.getTime() - Date.now()) / 60000;
    return diff > 0 && diff <= 15;
  } catch { return false; }
};

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
      <p style={{ fontSize: 10, color: "#9CA3AF", margin: 0, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: .5 }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 800, color: "#111", margin: 0 }}>{value}</p>
    </div>
  </div>
);

const SectionBlock = ({ icon, title, children, accent = "#F9FAFB", border = BORDER }: any) => (
  <div style={{ background: accent, borderRadius: 14, border: `1px solid ${border}`, padding: "13px 15px", marginBottom: 10 }}>
    <p style={{ fontSize: 11, fontWeight: 800, color: "#374151", margin: "0 0 10px", textTransform: "uppercase" as const, letterSpacing: .5 }}>
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
  const [url, setUrl]         = useState<string | null>(null);
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
            <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 3, minWidth: 52 }}>
              <div style={{ width: 26, height: 26, borderRadius: "50%", background: done ? G : active ? cfg.color : "#F3F4F6", border: `2px solid ${done ? G : active ? cfg.color : "#E5E7EB"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, transition: "all .2s" }}>
                {done ? <span style={{ color: "#fff", fontSize: 12 }}>✓</span> : <span>{cfg.icon}</span>}
              </div>
              <span style={{ fontSize: 8, fontWeight: 700, color: done ? G : active ? cfg.color : "#D1D5DB", textAlign: "center" as const, lineHeight: 1.2 }}>{cfg.label}</span>
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

// ── Virtual Session Panel (LiveKit-based) ─────────────────────────────────────
const VirtualSessionPanel = ({ s, onRefresh }: { s: any; onRefresh: () => void }) => {
  const { toast }     = useToast();
  const { user }      = useAuth();
  const { joinClass } = useLiveClass();

  // Map DB fields: teacher_score → eval score, teacher_notes → eval notes
  const [score, setScore]       = useState<number | "">(s.recitation?.teacher_score ?? "");
  const [notes, setNotes]       = useState(s.recitation?.teacher_notes ?? "");
  const [selLevel, setSelLevel] = useState(s.profiles?.level ?? "");
  const [saving, setSaving]     = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [tasjeelSubject, setTasjeelSubject] = useState<any>(null);
  const { data: levels = [] } = useAcademicLevels();

  const rec      = s.recitation || {};
  const prof     = s.profiles   || {};
  const approved = !!rec.admin_approved;

  // Derive the room name for this student's Tasjeel evaluation
  const roomName    = `tasjeel-eval-${s.user_id?.slice(0, 8)}`;
  const isActive    = approved && sessionActive(rec.virtual_session_date, rec.virtual_session_time);
  const isSoon      = approved && sessionSoon(rec.virtual_session_date, rec.virtual_session_time);
  const studentLink = `${window.location.origin}/student/tasjeel-room?room=${roomName}`;

  // Load or create the Tasjeel LiveKit subject for this student
  const ensureTasjeelSubject = useCallback(async () => {
    // Check if a tasjeel subject already exists for this student
    const { data } = await (supabase as any)
      .from("subjects")
      .select("*")
      .eq("livekit_room_name", roomName)
      .maybeSingle();
    if (data) { setTasjeelSubject(data); return data; }
    return null;
  }, [roomName]);

  useEffect(() => { ensureTasjeelSubject(); }, [ensureTasjeelSubject]);

  const createTasjeelRoom = async () => {
    setCreatingRoom(true);
    try {
      // Upsert a dedicated subject row for this student's eval session
      const { data, error } = await (supabase as any)
        .from("subjects")
        .insert({
          title:            `Tasjeel Eval — ${prof.full_name || s.user_id}`,
          title_ar:         `جلسة التسجيل — ${prof.full_name_ar || prof.full_name || ""}`,
          description:      "Virtual recitation evaluation session for registration",
          livekit_room_name: roomName,
          is_active:        true,
          visibility:       "private",
          host_id:          user?.id,
          teacher_id:       user?.id,
          created_by:       user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      setTasjeelSubject(data);

      // Notify student
      await (supabase as any).from("notifications").insert({
        user_id:    s.user_id,
        title:      "📅 Your Tasjeel Room is Ready",
        message:    `Your virtual evaluation session on ${rec.virtual_session_date} at ${rec.virtual_session_time} is now set up. You will receive a link when it's time to join.`,
        type:       "session_confirmed",
        is_read:    false,
        created_at: new Date().toISOString(),
      });

      toast({ title: "✅ Tasjeel room created — student notified" });
      onRefresh();
    } catch (e: any) {
      toast({ title: "Error creating room", description: e.message, variant: "destructive" });
    } finally { setCreatingRoom(false); }
  };

  const acceptSession = async () => {
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
        message:    `Your virtual recitation session on ${rec.virtual_session_date} at ${rec.virtual_session_time || "—"} has been confirmed. You will be notified 15 minutes before it's time to join.`,
        type:       "session_confirmed",
        is_read:    false,
        created_at: new Date().toISOString(),
      });

      toast({ title: "✅ Session confirmed — student notified" });
      onRefresh();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setAccepting(false); }
  };

  // Notify student 15 min before (called by admin manually or auto via pg_cron)
  const notifyStudent15Min = async () => {
    try {
      await (supabase as any).from("notifications").insert({
        user_id:    s.user_id,
        title:      "⏰ Your Session Starts in 15 Minutes!",
        message:    `Your virtual recitation evaluation is starting soon. Tap the button in your dashboard to join the live session now.`,
        type:       "session_reminder",
        is_read:    false,
        created_at: new Date().toISOString(),
        metadata:   JSON.stringify({ room: roomName, action: "join_tasjeel" }),
      });
      toast({ title: "🔔 15-min reminder sent to student" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const joinLiveSession = () => {
    if (!tasjeelSubject) {
      toast({ title: "Room not set up yet", description: "Create the Tasjeel room first", variant: "destructive" });
      return;
    }
    joinClass({
      id:                tasjeelSubject.id,
      title:             tasjeelSubject.title,
      title_ar:          tasjeelSubject.title_ar || "",
      livekit_room_name: roomName,
    }, { autoJoin: true });
  };

  const saveEval = async () => {
    if (!selLevel) { toast({ title: "Select a level", variant: "destructive" }); return; }
    setSaving(true);
    try {
      // Use teacher_score / teacher_notes as the eval fields (these exist in the DB schema)
      await (supabase as any).from("recitation_tests").update({
        teacher_score:        score,
        teacher_notes:        notes,
        stage3_completed_at:  new Date().toISOString(),
        final_level:          selLevel,
        status:               "evaluated",
      }).eq("user_id", s.user_id);

      await supabase.from("profiles")
        .update({ level: selLevel, course_level: selLevel })
        .eq("user_id", s.user_id);

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
        message:    `You have been placed in ${selLevel}. Your full dashboard is now active. Ahlan wa Sahlan!`,
        type:       "level_assigned",
        is_read:    false,
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
    background: "#FAFAFA", boxSizing: "border-box" as const,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>

      {/* ── Session timing card ── */}
      <SectionBlock icon="📅" title="Virtual Session (LiveKit)"
        accent={rec.virtual_session_date ? (approved ? "#F0FDF4" : "#FFF7ED") : "#F9FAFB"}
        border={approved ? "#86EFAC" : rec.virtual_session_date ? "#FED7AA" : BORDER}>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          {approved ? (
            <span style={{ padding: "3px 10px", borderRadius: 20, background: "#DCFCE7", color: "#16A34A", fontSize: 10, fontWeight: 700 }}>✓ Confirmed</span>
          ) : rec.virtual_session_date ? (
            <span style={{ padding: "3px 10px", borderRadius: 20, background: "#FEF3C7", color: "#D97706", fontSize: 10, fontWeight: 700 }}>⚠️ Awaiting Confirmation</span>
          ) : (
            <span style={{ padding: "3px 10px", borderRadius: 20, background: "#F3F4F6", color: "#9CA3AF", fontSize: 10, fontWeight: 700 }}>Not Scheduled</span>
          )}
          {isSoon && (
            <span style={{ padding: "3px 10px", borderRadius: 20, background: "#FEF3C7", color: "#D97706", fontSize: 10, fontWeight: 700, animation: "pulse 1.5s infinite" }}>
              ⏰ Starting Soon!
            </span>
          )}
        </div>

        {rec.virtual_session_date ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const, marginBottom: 12 }}>
            <Pill label="Date"     value={rec.virtual_session_date} />
            <Pill label="Time"     value={rec.virtual_session_time || "—"} />
            <Pill label="Platform" value="LiveKit (Tasjeel Room)" color={G} />
          </div>
        ) : (
          <p style={{ fontSize: 12, color: "#9CA3AF", margin: "0 0 12px" }}>Student has not yet scheduled a session.</p>
        )}

        {/* Tasjeel Room status */}
        <div style={{ background: "#fff", borderRadius: 10, border: `1px solid ${BORDER}`, padding: "10px 12px", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Video size={13} color={tasjeelSubject ? G : "#9CA3AF"} />
              <span style={{ fontSize: 12, fontWeight: 700, color: tasjeelSubject ? G : "#9CA3AF" }}>
                {tasjeelSubject ? "Tasjeel Room Ready" : "Tasjeel Room Not Created"}
              </span>
            </div>
            {!tasjeelSubject && rec.virtual_session_date && (
              <button onClick={createTasjeelRoom} disabled={creatingRoom}
                style={{ padding: "5px 10px", borderRadius: 8, border: "none", background: G, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                {creatingRoom ? <Loader2 size={11} style={{ animation: "spin .8s linear infinite" }} /> : <Video size={11} />}
                Create Room
              </button>
            )}
          </div>

          {tasjeelSubject && (
            <>
              {/* Admin link */}
              <div style={{ fontSize: 11, color: "#374151", marginBottom: 6 }}>
                <span style={{ fontWeight: 700 }}>Room:</span> <code style={{ fontSize: 10, background: "#F3F4F6", padding: "1px 5px", borderRadius: 4 }}>{roomName}</code>
              </div>
              {/* Student join link */}
              <div style={{ background: "#F0FDF4", borderRadius: 8, padding: "8px 10px", fontSize: 11 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 700, color: "#15803D" }}>Student Join Link:</span>
                  <button onClick={() => { navigator.clipboard.writeText(studentLink); toast({ title: "Link copied!" }); }}
                    style={{ padding: "3px 8px", borderRadius: 6, border: "none", background: "#16A34A", color: "#fff", fontSize: 10, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 3 }}>
                    <Copy size={10} /> Copy
                  </button>
                </div>
                <p style={{ fontSize: 10, color: "#16A34A", margin: "4px 0 0", wordBreak: "break-all" as const }}>{studentLink}</p>
              </div>
            </>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
          {rec.virtual_session_date && !approved && (
            <button onClick={acceptSession} disabled={accepting}
              style={{ flex: 1, padding: "10px 14px", borderRadius: 10, border: "none", background: G, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              {accepting ? <Loader2 size={14} style={{ animation: "spin .8s linear infinite" }} /> : <CheckCircle size={14} />}
              Confirm Session
            </button>
          )}
          {approved && !isActive && rec.virtual_session_date && (
            <button onClick={notifyStudent15Min}
              style={{ flex: 1, padding: "10px 14px", borderRadius: 10, border: `1.5px solid ${BORDER}`, background: "#fff", color: "#374151", fontWeight: 700, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <Bell size={13} /> Notify Student Now
            </button>
          )}
          {isActive && tasjeelSubject && (
            <button onClick={joinLiveSession}
              style={{ flex: 1, padding: "10px 14px", borderRadius: 10, border: "none", background: "#3B82F6", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <Video size={14} /> Join Live Now
            </button>
          )}
        </div>
      </SectionBlock>

      {/* ── Recitation audio ── */}
      {rec.audio_path && (
        <SectionBlock icon="🎙️" title="Recitation Recording" accent="#F5F3FF" border="#C4B5FD">
          <AudioPlayer path={rec.audio_path} />
          {rec.ai_score !== undefined && rec.ai_score !== null && (
            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" as const }}>
              <Pill label="AI Score" value={`${rec.ai_score}%`} color={G} />
              {rec.ai_transcript && <p style={{ fontSize: 11, color: "#6B7280", margin: 0 }}>{rec.ai_transcript.slice(0, 100)}…</p>}
            </div>
          )}
        </SectionBlock>
      )}

      {/* ── Evaluation scoring ── */}
      <SectionBlock icon="⭐" title="Evaluation & Level Assignment" accent="#FFFBEB" border="#FDE68A">
        <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>SCORE (0–100)</label>
            <input type="number" min={0} max={100} value={score} onChange={e => setScore(e.target.value === "" ? "" : +e.target.value)}
              style={inp} placeholder="Enter score…" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>ASSIGN LEVEL</label>
            <select value={selLevel} onChange={e => setSelLevel(e.target.value)} style={inp}>
              <option value="">— Select level —</option>
              {levels.map((l: any) => <option key={l.id || l.name} value={l.name}>{l.name}</option>)}
            </select>
          </div>
        </div>
        {typeof score === "number" && (
          <div style={{ marginBottom: 10, padding: "8px 12px", borderRadius: 10, background: score >= 75 ? "#F0FDF4" : score >= 50 ? "#FFFBEB" : "#FEF2F2", fontSize: 12, fontWeight: 700, color: score >= 75 ? "#15803D" : score >= 50 ? "#92400E" : "#991B1B" }}>
            {score >= 75 ? "🌟 Excellent" : score >= 50 ? "👍 Good — needs some work" : "⚠️ Needs significant improvement"}
            {selLevel && <span style={{ color: G, marginLeft: 8 }}>→ Will be assigned to {selLevel}</span>}
          </div>
        )}
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>EVALUATOR NOTES</label>
          <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)}
            style={{ ...inp, resize: "none" as const }} placeholder="Notes on recitation quality, tajweed, memorisation…" />
        </div>
        <button onClick={saveEval} disabled={saving}
          style={{ width: "100%", padding: "12px", borderRadius: 12, border: "none", background: saving ? "#9CA3AF" : G, color: "#fff", fontWeight: 800, fontSize: 14, cursor: saving ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
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

  const prof     = s.profiles   || {};
  const rec      = s.recitation || null;
  const exam     = s.exam       || null;
  const stepCfg  = STEPS[s.current_step] || { label: s.current_step, icon: "?", color: "#9CA3AF", bg: "#F9FAFB" };
  const hasSession  = !!rec?.virtual_session_date;
  const needsAction = hasSession && !rec?.admin_approved;

  return (
    <div style={{ background: "#fff", borderRadius: 18, border: `1.5px solid ${needsAction ? "#FCA5A5" : BORDER}`, overflow: "hidden", boxShadow: needsAction ? "0 0 0 3px #FEE2E2" : "0 2px 8px rgba(0,0,0,.04)" }}>

      {needsAction && (
        <div style={{ background: "#FEF2F2", borderBottom: "1px solid #FCA5A5", padding: "6px 16px", fontSize: 11, fontWeight: 700, color: "#DC2626", display: "flex", alignItems: "center", gap: 6 }}>
          <Bell size={11} /> Action required: confirm virtual session
        </div>
      )}

      {/* Card header */}
      <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        {avatar(prof)}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" as const }}>
            <span style={{ fontWeight: 800, fontSize: 15, color: "#111" }}>{prof.full_name || "New Student"}</span>
            {prof.full_name_ar && <span style={{ fontSize: 13, fontFamily: "'Amiri',serif", color: GOLD }}>{prof.full_name_ar}</span>}
          </div>
          <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
            {prof.email}{prof.student_id ? ` · #${prof.student_id}` : ""}{prof.country ? ` · ${prof.country}` : ""}
          </p>
          <p style={{ fontSize: 10, color: "#D1D5DB", margin: "2px 0 0" }}>Registered {fmt(s.created_at)}</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
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
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
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
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
                <Pill label="Score"     value={`${exam.score ?? 0} / ${exam.max_score ?? 0}`} />
                <Pill label="%"         value={exam.percentage !== undefined ? `${Math.round(exam.percentage)}%` : undefined}
                      color={exam.percentage >= 70 ? "#15803D" : exam.percentage >= 40 ? "#D97706" : "#DC2626"} />
                <Pill label="Suggested" value={exam.percentage !== undefined ? levelFromPct(exam.percentage) : undefined} color={G} />
                <Pill label="Submitted" value={fmt(exam.submitted_at)} />
              </div>
            ) : (
              <p style={{ fontSize: 12, color: "#9CA3AF", margin: 0 }}>Exam not yet taken or not required</p>
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
        <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{prof.email}</p>
      </div>
      <div style={{ textAlign: "right" as const, flexShrink: 0 }}>
        <span style={{ display: "block", padding: "3px 9px", borderRadius: 20, background: "#F0FDF4", color: "#15803D", fontSize: 10, fontWeight: 700, border: "1px solid #86EFAC" }}>
          {prof.level || prof.course_level || "Enrolled"}
        </span>
        <p style={{ fontSize: 10, color: "#D1D5DB", margin: "4px 0 0" }}>{fmt(prof.level_assigned_at || prof.created_at)}</p>
      </div>
    </div>
  );
};

// ── Flow Settings — synced live from Supabase ─────────────────────────────────
const FlowSettings = () => {
  const { config, loading, saveAll, fetch: refetchSettings, currencySymbol } = useRegistrationSettings();
  const { user } = useAuth();
  const { toast } = useToast();
  const [draft, setDraft]     = useState<any>(null);
  const [saving, setSaving]   = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  // Initialise draft when config loads
  useEffect(() => {
    if (!loading && config) {
      setDraft({ ...config });
      setLastSync(new Date());
    }
  }, [loading, config]);

  // Supabase Realtime — subscribe to academy_settings changes
  useEffect(() => {
    const channel = (supabase as any)
      .channel("academy_settings_admin")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "academy_settings" },
        async () => {
          // Re-fetch the full config when any key changes
          await refetchSettings();
          setLastSync(new Date());
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [refetchSettings]);

  // Keep draft in sync whenever config updates from realtime
  useEffect(() => {
    if (config && !saving) setDraft({ ...config });
  }, [config]);

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
    setLastSync(new Date());
    toast({ title: "✅ Settings saved", description: "Changes are live on the website immediately." });
  };

  const inp: React.CSSProperties = { width: "100%", padding: "9px 12px", borderRadius: 10, border: `1.5px solid ${BORDER}`, fontSize: 13, outline: "none", background: "#FAFAFA", boxSizing: "border-box" as const };
  const Grp = ({ children }: any) => <div style={{ background: "#fff", borderRadius: 16, border: `1.5px solid ${BORDER}`, overflow: "hidden", marginBottom: 14 }}>{children}</div>;
  const GrpHead = ({ icon: Icon, title }: any) => (
    <div style={{ padding: "11px 16px", background: "#F9FAFB", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 8 }}>
      <Icon size={15} color={G} />
      <p style={{ fontWeight: 800, fontSize: 11, color: "#374151", margin: 0, textTransform: "uppercase" as const, letterSpacing: .5 }}>{title}</p>
    </div>
  );
  const GrpBody = ({ children }: any) => <div style={{ padding: "12px 16px" }}>{children}</div>;

  return (
    <div>
      {/* Live sync badge */}
      <div style={{ background: "#F0FDF4", borderRadius: 12, border: "1px solid #86EFAC", padding: "8px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", animation: "pulse 2s infinite" }} />
        <p style={{ fontSize: 12, color: "#15803D", margin: 0, fontWeight: 600 }}>
          Live synced from Supabase
          {lastSync && <span style={{ color: "#9CA3AF", fontWeight: 400 }}> · Last updated {lastSync.toLocaleTimeString()}</span>}
        </p>
      </div>

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
            <Switch checked={!!draft.registration_open} onCheckedChange={v => set({ registration_open: v })} />
          </div>

          <div style={{ marginTop: 10 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>WELCOME MESSAGE (English)</label>
            <textarea rows={2} value={draft.registration_message || ""} onChange={e => set({ registration_message: e.target.value })}
              style={{ ...inp, resize: "none" as const }} />
          </div>
          <div style={{ marginTop: 10 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>WELCOME MESSAGE (Arabic)</label>
            <textarea rows={2} value={draft.registration_message_ar || ""} onChange={e => set({ registration_message_ar: e.target.value })}
              style={{ ...inp, resize: "none" as const, direction: "rtl" }} />
          </div>
          <div style={{ marginTop: 10 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>CLOSED MESSAGE</label>
            <textarea rows={2} value={draft.closed_message || ""} onChange={e => set({ closed_message: e.target.value })}
              style={{ ...inp, resize: "none" as const }} placeholder="Message shown when registration is closed…" />
          </div>
        </GrpBody>
      </Grp>

      {/* Registration steps */}
      <Grp>
        <GrpHead icon={FileText} title="Registration Steps" />
        <GrpBody>
          <SettingRow label="Require Payment"            sub="Students must pay before proceeding to onboarding"  checked={!!draft.entrance_fee_enabled}     onChange={(v: boolean) => set({ entrance_fee_enabled: v })} />
          <SettingRow label="Require Onboarding"         sub="Show the onboarding profile step"                   checked={!!draft.onboarding_required}       onChange={(v: boolean) => set({ onboarding_required: v })} />
          <SettingRow label="Require Entrance Exam"      sub="Written exam before virtual evaluation"             checked={!!draft.entrance_exam_required}    onChange={(v: boolean) => set({ entrance_exam_required: v })} />
          <SettingRow label="Require Recitation Test"    sub="Live recitation session via LiveKit"                checked={!!draft.recitation_test_required}  onChange={(v: boolean) => set({ recitation_test_required: v })} />
        </GrpBody>
      </Grp>

      {/* Entrance fee */}
      <Grp>
        <GrpHead icon={CreditCard} title="Entrance Fee" />
        <GrpBody>
          {draft.entrance_fee_enabled && (
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
                  <option value="GHS">GHS — ₵</option>
                </select>
              </div>
            </div>
          )}
          <div style={{ marginTop: 10 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>MAX REGISTRATIONS PER DAY (0 = unlimited)</label>
            <input type="number" value={draft.max_daily_registrations || 0} min={0}
              onChange={e => set({ max_daily_registrations: +e.target.value })} style={inp} />
          </div>
        </GrpBody>
      </Grp>

      {/* Exam settings */}
      <Grp>
        <GrpHead icon={BookOpen} title="Entrance Exam Settings" />
        <GrpBody>
          <SettingRow label="Enable Exam Timer"    sub="Students must complete within time limit"  checked={!!draft.exam_timer_enabled}    onChange={(v: boolean) => set({ exam_timer_enabled: v })} />
          <SettingRow label="Randomise Questions"  sub="Shuffle question order per student"        checked={!!draft.randomise_questions}   onChange={(v: boolean) => set({ randomise_questions: v })} />
          <SettingRow label="Proctoring Enabled"   sub="Screen capture during exam"               checked={!!draft.proctoring_enabled}    onChange={(v: boolean) => set({ proctoring_enabled: v })} />
          {draft.exam_timer_enabled && (
            <div style={{ marginTop: 10 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>TIME LIMIT (MINUTES)</label>
              <input type="number" value={draft.exam_duration_minutes || ""} onChange={e => set({ exam_duration_minutes: +e.target.value })} style={inp} placeholder="60" />
            </div>
          )}
          <div style={{ marginTop: 10 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>PASS PERCENTAGE (%)</label>
            <input type="number" min={0} max={100} value={draft.exam_pass_percentage || ""} onChange={e => set({ exam_pass_percentage: +e.target.value })} style={inp} placeholder="50" />
          </div>
        </GrpBody>
      </Grp>

      {/* Virtual session — LiveKit */}
      <Grp>
        <GrpHead icon={Video} title="Virtual Evaluation (LiveKit)" />
        <GrpBody>
          <div style={{ background: "#F0FDF4", borderRadius: 10, border: "1px solid #86EFAC", padding: "10px 12px", marginBottom: 12 }}>
            <p style={{ fontWeight: 700, fontSize: 12, color: G, margin: "0 0 2px" }}>Platform: Tahleem Academy LiveKit</p>
            <p style={{ fontSize: 11, color: "#6B7280", margin: 0 }}>Virtual evaluations are conducted directly inside the app via LiveKit rooms. A dedicated Tasjeel room is created per student from the Pipeline tab.</p>
          </div>
          <SettingRow label="Auto-notify on Session Confirm" sub="Push notification when admin approves session" checked={draft.notify_on_session_confirm ?? true} onChange={(v: boolean) => set({ notify_on_session_confirm: v })} />
          <div style={{ marginTop: 10 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>INSTRUCTIONS FOR STUDENT</label>
            <textarea rows={3} value={draft.virtual_session_instructions || ""} onChange={e => set({ virtual_session_instructions: e.target.value })}
              style={{ ...inp, resize: "none" as const }} placeholder="What should the student prepare before their session…" />
          </div>
        </GrpBody>
      </Grp>

      {/* Notification triggers */}
      <Grp>
        <GrpHead icon={Bell} title="Notification Triggers" />
        <GrpBody>
          <SettingRow label="New Registration Alert"   sub="Notify admin when a new student signs up"         checked={draft.notify_admin_new_reg ?? true}  onChange={(v: boolean) => set({ notify_admin_new_reg: v })} />
          <SettingRow label="Payment Received Alert"   sub="Notify admin when payment is confirmed"           checked={draft.notify_admin_payment ?? true}  onChange={(v: boolean) => set({ notify_admin_payment: v })} />
          <SettingRow label="Exam Submitted Alert"     sub="Notify admin when student completes exam"         checked={draft.notify_admin_exam ?? true}     onChange={(v: boolean) => set({ notify_admin_exam: v })} />
          <SettingRow label="Level Assigned Notif."    sub="Notify student when placed in a level"            checked={draft.notify_student_level ?? true}  onChange={(v: boolean) => set({ notify_student_level: v })} />
        </GrpBody>
      </Grp>

      <button onClick={handleSave} disabled={saving}
        style={{ width: "100%", padding: "14px", borderRadius: 14, border: "none", background: G, color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: `0 4px 16px ${G}40`, marginBottom: 24 }}>
        {saving ? <Loader2 size={18} style={{ animation: "spin .8s linear infinite" }} /> : <CheckCircle size={18} />}
        Save All Settings — Apply to Website
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
  const [tab, setTab]               = useState<Tab>("overview");
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [pipeline, setPipeline] = useState<any[]>([]);
  const [enrolled, setEnrolled] = useState<any[]>([]);
  const [stats, setStats]       = useState({ today: 0, week: 0, pending: 0, enrolled: 0, awaiting: 0 });
  const [query, setQuery]           = useState("");
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

  // Realtime subscription — refresh when tasjeel_progress or recitation_tests changes
  useEffect(() => {
    const ch = (supabase as any)
      .channel("student_reg_admin_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasjeel_progress" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "recitation_tests" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const filtered = pipeline.filter(s => {
    const prof = s.profiles || {};
    const q    = query.toLowerCase();
    const matchQ = !q || (prof.full_name || "").toLowerCase().includes(q) || (prof.email || "").toLowerCase().includes(q) || (prof.student_id || "").toLowerCase().includes(q);
    const matchS = filterStep === "all" || s.current_step === filterStep;
    return matchQ && matchS;
  });

  const evalStudents = pipeline.filter(s =>
    s.current_step === "level_assignment" ||
    (s.recitation?.virtual_session_date && !s.recitation?.admin_approved)
  );

  const TABS: { id: Tab; label: string; icon: any; badge?: number }[] = [
    { id: "overview",  label: "Overview",    icon: BarChart2 },
    { id: "new",       label: "Pipeline",    icon: UserPlus,  badge: stats.pending },
    { id: "enrolled",  label: "Enrolled",    icon: UserCheck, badge: stats.enrolled },
    { id: "eval",      label: "Evaluations", icon: Video,     badge: stats.awaiting },
    { id: "settings",  label: "Flow",        icon: Settings },
  ];

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", flexDirection: "column" as const, gap: 12 }}>
      <Loader2 size={24} style={{ animation: "spin .8s linear infinite", color: G }} />
      <p style={{ fontSize: 13, color: "#9CA3AF", margin: 0 }}>Loading…</p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const inp: React.CSSProperties = { width: "100%", padding: "9px 12px", borderRadius: 10, border: `1.5px solid ${BORDER}`, fontSize: 13, outline: "none", background: "#FAFAFA", boxSizing: "border-box" as const };

  return (
    <div style={{ minHeight: "100vh", background: CREAM }}>
      <style>{`
        @keyframes spin  { to { transform: rotate(360deg) } }
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:.5 } }
        @keyframes fadeIn{ from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:none } }
      `}</style>

      {/* ── Page header ── */}
      <div style={{ background: "#fff", borderBottom: `1px solid ${BORDER}`, padding: "0 16px" }}>
        <div style={{ paddingTop: 16, paddingBottom: 10, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `${G}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <GraduationCap size={18} color={G} />
            </div>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 900, color: "#111", margin: 0 }}>Student Registration</h1>
              <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>Full enrollment & evaluation control centre</p>
            </div>
          </div>
          <button onClick={load} disabled={refreshing}
            style={{ padding: "8px 12px", borderRadius: 10, border: `1.5px solid ${BORDER}`, background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#6B7280" }}>
            <RefreshCw size={13} style={refreshing ? { animation: "spin .8s linear infinite" } : undefined} />
            Refresh
          </button>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 2, overflowX: "auto" }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 12px", borderRadius: 0, border: "none", background: "none", cursor: "pointer", fontSize: 12, fontWeight: tab === t.id ? 800 : 500, color: tab === t.id ? G : "#6B7280", borderBottom: `2.5px solid ${tab === t.id ? G : "transparent"}`, whiteSpace: "nowrap" as const, flexShrink: 0, position: "relative" }}>
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

        {/* OVERVIEW */}
        {tab === "overview" && (
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <InfoCard icon={TrendingUp}  label="Today"       value={stats.today}    accent="#6366f1" />
              <InfoCard icon={BarChart2}   label="This Week"   value={stats.week}     accent="#0ea5e9" />
              <InfoCard icon={Clock}       label="In Pipeline" value={stats.pending}  accent="#f59e0b" />
              <InfoCard icon={UserCheck}   label="Enrolled"    value={stats.enrolled} accent="#22c55e" />
            </div>

            {stats.awaiting > 0 && (
              <div style={{ background: "#FFF7ED", borderRadius: 14, border: "1.5px solid #FED7AA", padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                <Video size={20} color="#D97706" />
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 800, fontSize: 13, margin: 0, color: "#92400E" }}>{stats.awaiting} student{stats.awaiting > 1 ? "s" : ""} awaiting virtual evaluation</p>
                  <p style={{ fontSize: 11, color: "#B45309", margin: "2px 0 0" }}>Go to Evaluations tab to confirm sessions & join via LiveKit</p>
                </div>
                <button onClick={() => setTab("eval")} style={{ padding: "7px 12px", borderRadius: 8, border: "none", background: "#D97706", color: "#fff", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>
                  View
                </button>
              </div>
            )}

            {/* Pipeline breakdown */}
            <div style={{ background: "#fff", borderRadius: 16, border: `1.5px solid ${BORDER}`, overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 8 }}>
                <Filter size={14} color={G} />
                <p style={{ fontWeight: 800, fontSize: 12, margin: 0, textTransform: "uppercase" as const, letterSpacing: .5, color: "#374151" }}>Pipeline Breakdown</p>
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
                      <div style={{ height: 4, borderRadius: 4, background: "#F3F4F6" }}>
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
                <p style={{ fontWeight: 800, fontSize: 12, margin: 0, textTransform: "uppercase" as const, letterSpacing: .5, color: "#374151" }}>Quick Actions</p>
              </div>
              {[
                { label: "Review Pipeline",          sub: `${stats.pending} students in progress`,        icon: UserPlus, color: "#6366f1", action: () => setTab("new") },
                { label: "Confirm Virtual Sessions", sub: `${evalStudents.filter(s => s.recitation?.virtual_session_date && !s.recitation?.admin_approved).length} sessions need confirmation`, icon: Video, color: "#DC2626", action: () => setTab("eval") },
                { label: "Flow Settings",            sub: "Edit steps, fees, exam settings",              icon: Settings, color: G,         action: () => setTab("settings") },
              ].map((a, i) => (
                <button key={i} onClick={a.action}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", background: "none", border: "none", borderBottom: i < 2 ? `1px solid ${BORDER}` : "none", cursor: "pointer", textAlign: "left" as const }}>
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

        {/* PIPELINE */}
        {tab === "new" && (
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 14 }}>
            <div style={{ background: "#fff", borderRadius: 14, border: `1.5px solid ${BORDER}`, padding: 12, display: "flex", flexDirection: "column" as const, gap: 10 }}>
              <div style={{ position: "relative" }}>
                <Search size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by name, email, or student ID…"
                  style={{ ...inp, paddingLeft: 32 }} />
              </div>
              <div style={{ display: "flex", gap: 8, overflowX: "auto" }}>
                {["all", ...STEP_ORDER].filter(s => s !== "completed").map(step => (
                  <button key={step} onClick={() => setFilterStep(step)}
                    style={{ padding: "5px 12px", borderRadius: 20, border: `1.5px solid ${filterStep === step ? G : BORDER}`, background: filterStep === step ? `${G}12` : "#fff", color: filterStep === step ? G : "#6B7280", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" as const, flexShrink: 0 }}>
                    {step === "all" ? "All" : STEPS[step]?.icon + " " + STEPS[step]?.label}
                  </button>
                ))}
              </div>
            </div>
            <p style={{ fontSize: 12, color: "#9CA3AF", margin: 0 }}>{filtered.length} student{filtered.length !== 1 ? "s" : ""} in pipeline</p>
            {filtered.length === 0 ? (
              <div style={{ background: "#fff", borderRadius: 16, border: `1.5px solid ${BORDER}`, padding: 32, textAlign: "center" as const }}>
                <p style={{ fontSize: 32, margin: "0 0 8px" }}>🕌</p>
                <p style={{ fontWeight: 700, color: "#374151", margin: 0 }}>No students found</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 12 }}>
                {filtered.map(s => <RegCard key={s.user_id} s={s} onRefresh={load} />)}
              </div>
            )}
          </div>
        )}

        {/* ENROLLED */}
        {tab === "enrolled" && (
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 14 }}>
            <div style={{ background: "#F0FDF4", borderRadius: 14, border: "1.5px solid #86EFAC", padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
              <UserCheck size={18} color="#16A34A" />
              <div>
                <p style={{ fontWeight: 800, fontSize: 13, color: "#15803D", margin: 0 }}>{enrolled.length} Enrolled Students</p>
                <p style={{ fontSize: 11, color: "#16A34A", margin: 0 }}>Fully registered and placed in levels</p>
              </div>
            </div>
            <div style={{ position: "relative" }}>
              <Search size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search enrolled students…" style={{ ...inp, paddingLeft: 32 }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>
              {enrolled
                .filter(s => { const q = query.toLowerCase(); return !q || (s.full_name || "").toLowerCase().includes(q) || (s.email || "").toLowerCase().includes(q); })
                .map(s => <EnrolledCard key={s.user_id || s.id} s={s} />)
              }
            </div>
          </div>
        )}

        {/* EVALUATIONS */}
        {tab === "eval" && (
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 14 }}>
            <div style={{ background: "#fff", borderRadius: 14, border: `1.5px solid ${BORDER}`, padding: "12px 14px" }}>
              <p style={{ fontWeight: 800, fontSize: 13, color: "#374151", margin: "0 0 4px" }}>Virtual Evaluations — LiveKit</p>
              <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>Confirm sessions, create Tasjeel rooms, join live calls, score recitation, and assign levels.</p>
            </div>

            {evalStudents.filter(s => s.recitation?.virtual_session_date && !s.recitation?.admin_approved).length > 0 && (
              <div>
                <p style={{ fontSize: 11, fontWeight: 800, color: "#DC2626", margin: "0 0 8px", textTransform: "uppercase" as const, letterSpacing: .5 }}>⚠️ Action Required</p>
                <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>
                  {evalStudents
                    .filter(s => s.recitation?.virtual_session_date && !s.recitation?.admin_approved)
                    .map(s => <RegCard key={s.user_id} s={s} onRefresh={load} viewEval />)
                  }
                </div>
              </div>
            )}

            {evalStudents.filter(s => !s.recitation?.virtual_session_date).length > 0 && (
              <div>
                <p style={{ fontSize: 11, fontWeight: 800, color: "#9CA3AF", margin: "0 0 8px", textTransform: "uppercase" as const, letterSpacing: .5 }}>Awaiting Student to Schedule</p>
                <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>
                  {evalStudents.filter(s => !s.recitation?.virtual_session_date).map(s => <RegCard key={s.user_id} s={s} onRefresh={load} />)}
                </div>
              </div>
            )}

            {evalStudents.length === 0 && (
              <div style={{ background: "#fff", borderRadius: 16, border: `1.5px solid ${BORDER}`, padding: 32, textAlign: "center" as const }}>
                <p style={{ fontSize: 36, margin: "0 0 8px" }}>✅</p>
                <p style={{ fontWeight: 700, color: "#374151", margin: 0 }}>All clear — no evaluations pending</p>
              </div>
            )}
          </div>
        )}

        {/* FLOW SETTINGS */}
        {tab === "settings" && <FlowSettings />}
      </div>
    </div>
  );
}
