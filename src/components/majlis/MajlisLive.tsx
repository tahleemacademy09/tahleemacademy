/*
  src/components/majlis/MajlisLive.tsx — Tahleem Academy
  ──────────────────────────────────────────────────────────────────
  Al-Majlis Live: meetings, urgent discussions, lectures.

  It is connected to the classroom — not a second video stack. A dedicated
  "Al-Majlis Live" subject (subjects.is_majlis_live) owns the LiveKit room, so
  "Go Live" / "Join" simply call joinClass(subject) and open the real classroom
  (controls, whiteboard, chat, participants, recording). Recordings therefore
  land in session_recordings under that subject and are listed here through the
  same SubjectRecordings component every other classroom uses.

  Tabs:  Live (go live / join)  ·  Schedule (upcoming + past)  ·  Recordings
*/
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Radio, Calendar, Video, Plus, Users, Clock, Siren, Mic,
  GraduationCap, MessageSquare, Loader2, CalendarPlus, Trash2, Play, StopCircle, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useLiveClass } from "@/contexts/LiveClassContext";
import { useAcademicLevels } from "@/hooks/useAcademicLevels";
import { useToast } from "@/hooks/use-toast";
import SubjectRecordings from "@/components/classroom/SubjectRecordings";
import { useMajlisLive, type MajlisMeeting } from "@/components/majlis/useMajlisLive";

const G0 = "#061409", G1 = "#0f2d1f", G2 = "#1a3d27", G3 = "#276749";
const GOLD = "#c9a84c", WARM = "#faf8f4", BRD = "#e5ddd3";

type Kind = MajlisMeeting["kind"];
const KINDS: { id: Kind; en: string; ar: string; icon: any; color: string; bg: string }[] = [
  { id: "meeting",    en: "Meeting",    ar: "اجتماع",  icon: Users,         color: "#1D4ED8", bg: "#EFF6FF" },
  { id: "urgent",     en: "Urgent",     ar: "عاجل",    icon: Siren,         color: "#DC2626", bg: "#FEF2F2" },
  { id: "discussion", en: "Discussion", ar: "نقاش",    icon: MessageSquare, color: "#7C3AED", bg: "#F5F3FF" },
  { id: "lecture",    en: "Lecture",    ar: "محاضرة",  icon: GraduationCap, color: "#B45309", bg: "#FFFBEB" },
];
const kindOf = (k: string) => KINDS.find(x => x.id === k) || KINDS[0];

const fmtDT = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }) : "—";

const until = (iso?: string | null) => {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "now";
  const m = Math.round(ms / 60000);
  if (m < 60) return `in ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `in ${h}h ${m % 60}m`;
  return `in ${Math.round(h / 24)}d`;
};

const elapsed = (iso?: string | null) => {
  if (!iso) return "";
  const m = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
};

const toIcs = (m: MajlisMeeting) => {
  const start = new Date(m.scheduled_at || Date.now());
  const end = new Date(start.getTime() + 60 * 60000);
  const f = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Tahleem Academy//Majlis Live//EN", "BEGIN:VEVENT",
    `UID:${m.id}@tahleemacademy`, `DTSTAMP:${f(new Date())}`, `DTSTART:${f(start)}`, `DTEND:${f(end)}`,
    `SUMMARY:${(m.title || "Majlis").replace(/[\n,;]/g, " ")}`, `DESCRIPTION:${(m.description || "Al-Majlis Live — Tahleem Academy").replace(/[\n,;]/g, " ")}`,
    "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  const a = document.createElement("a"); a.href = url; a.download = "majlis-meeting.ics"; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

async function fetchAllIds(build: (from: number, to: number) => any): Promise<string[]> {
  const out: string[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data } = await build(from, from + 999);
    const rows = data || [];
    rows.forEach((r: any) => r.user_id && out.push(r.user_id));
    if (rows.length < 1000) break;
  }
  return out;
}

async function recipientsFor(audience: string, selfId: string): Promise<string[]> {
  let ids: string[] = [];
  if (audience === "students" || audience === "teachers") {
    const roles = audience === "students" ? ["student"] : ["teacher", "admin"];
    ids = await fetchAllIds((a, b) => supabase.from("user_roles").select("user_id").in("role", roles as any).range(a, b));
  } else if (audience.startsWith("level:")) {
    const lvl = audience.slice(6);
    ids = await fetchAllIds((a, b) => supabase.from("profiles").select("user_id").eq("level", lvl).range(a, b));
  } else {
    ids = await fetchAllIds((a, b) => supabase.from("profiles").select("user_id").range(a, b));
  }
  return [...new Set(ids)].filter(i => i && i !== selfId);
}

/* ─────────────────────────────────────────────────────────────────── */
interface Props { onClose: () => void; isPrivileged: boolean; }

export default function MajlisLive({ onClose, isPrivileged }: Props) {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();
  const { joinClass } = useLiveClass();
  const { data: levels = [] } = useAcademicLevels();
  const { subject, liveSession, liveMeeting, isLive, ready, refresh } = useMajlisLive();

  const [tab, setTab] = useState<"live" | "schedule" | "recordings">("live");
  const [meetings, setMeetings] = useState<MajlisMeeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);

  // composer state (Go Live)
  const [kind, setKind] = useState<Kind>("meeting");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [audience, setAudience] = useState("all");
  const [notify, setNotify] = useState(true);

  // schedule form state
  const [sTitle, setSTitle] = useState("");
  const [sNote, setSNote] = useState("");
  const [sKind, setSKind] = useState<Kind>("meeting");
  const [sAudience, setSAudience] = useState("all");
  const [sWhen, setSWhen] = useState("");

  const hostName = profile?.full_name || user?.email || "Host";

  const load = useCallback(async () => {
    try {
      const { data } = await (supabase as any).from("majlis_meetings").select("*")
        .order("scheduled_at", { ascending: true, nullsFirst: false }).limit(200);
      setMeetings((data || []) as MajlisMeeting[]);
    } catch { setMeetings([]); }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase.channel("majlis-live-panel")
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "majlis_meetings" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  // Staff tidy-up: a meeting still flagged "live" while the classroom session has ended.
  useEffect(() => {
    if (!isPrivileged || !ready || isLive) return;
    const stale = meetings.filter(m => m.status === "live");
    if (!stale.length) return;
    (supabase as any).from("majlis_meetings").update({ status: "ended", ended_at: new Date().toISOString() })
      .in("id", stale.map(m => m.id)).then(load);
  }, [isPrivileged, ready, isLive, meetings, load]);

  const upcoming = useMemo(() => meetings.filter(m => m.status === "scheduled")
    .sort((a, b) => new Date(a.scheduled_at || 0).getTime() - new Date(b.scheduled_at || 0).getTime()), [meetings]);
  const past = useMemo(() => meetings.filter(m => m.status === "ended" || m.status === "cancelled")
    .sort((a, b) => new Date(b.ended_at || b.scheduled_at || b.created_at).getTime() - new Date(a.ended_at || a.scheduled_at || a.created_at).getTime()), [meetings]);

  const audienceLabel = (a: string) =>
    a === "all" ? t("Everyone", "الجميع") : a === "students" ? t("Students", "الطلاب") : a === "teachers" ? t("Teachers", "المعلمون")
      : t(`Level: ${levels.find(l => l.slug === a.slice(6))?.name_en || a.slice(6)}`, `المستوى: ${a.slice(6)}`);

  const sendNotices = async (m: { id: string; title: string; kind: Kind; audience: string }, mode: "live" | "scheduled", when?: string | null) => {
    if (!user) return;
    try {
      const ids = await recipientsFor(m.audience, user.id);
      if (!ids.length) return;
      const urgent = m.kind === "urgent";
      const head = urgent ? "🚨 Urgent Majlis" : "🎙️ Majlis Live";
      const body = mode === "live"
        ? `${hostName} is live now — ${m.title}. Tap to join.`
        : `${m.title} — scheduled ${fmtDT(when)}.`;
      const link = m.audience === "teachers" ? "/teacher/majlis?live=1" : "/student/majlis?live=1";
      const rows = ids.map(uid => ({
        user_id: uid, title: `${head}: ${m.title}`, message: body, type: "admin_announcement",
        priority: mode === "live" ? (urgent ? "urgent" : "high") : "normal",
        link, is_read: false, created_at: new Date().toISOString(),
      }));
      for (let i = 0; i < rows.length; i += 400) {
        await (supabase as any).from("notifications").insert(rows.slice(i, i + 400));
      }
    } catch (e) { console.warn("[MajlisLive] notify failed", e); }
  };

  /** Create/reuse the classroom session, flag the meeting live, notify, open classroom. */
  const goLive = async (existing?: MajlisMeeting) => {
    if (!user || !subject) { toast({ title: t("Majlis Live isn't set up yet", "المجلس المباشر غير مهيأ بعد"), variant: "destructive" }); return; }
    const mTitle = (existing?.title || title).trim();
    if (!mTitle) { toast({ title: t("Add a title first", "أضف عنواناً أولاً"), variant: "destructive" }); return; }
    setBusy(true);
    try {
      const nowIso = new Date().toISOString();
      const mKind = existing?.kind || kind;
      const mAud = existing?.audience || audience;

      // 1) classroom session (same live_sessions row the classroom itself uses)
      let sessionId = existing?.session_id || null;
      const { data: already } = await supabase.from("live_sessions").select("id").eq("subject_id", subject.id).eq("status", "live").maybeSingle();
      if (already) sessionId = already.id;
      else if (sessionId) {
        await supabase.from("live_sessions").update({ status: "live", started_at: nowIso, actual_start_time: nowIso, topic: mTitle } as any).eq("id", sessionId);
      } else {
        const { data: s, error } = await supabase.from("live_sessions").insert({
          subject_id: subject.id, host_id: user.id, status: "live", topic: mTitle,
          scheduled_at: nowIso, started_at: nowIso, actual_start_time: nowIso,
        } as any).select("id").single();
        if (error) throw error;
        sessionId = s!.id;
      }

      // 2) meeting row
      let meetingId = existing?.id;
      if (existing) {
        await (supabase as any).from("majlis_meetings").update({ status: "live", started_at: nowIso, session_id: sessionId, host_id: user.id, host_name: hostName }).eq("id", existing.id);
      } else {
        const { data: m, error } = await (supabase as any).from("majlis_meetings").insert({
          title: mTitle, description: note.trim() || null, kind: mKind, audience: mAud, status: "live",
          started_at: nowIso, host_id: user.id, host_name: hostName, session_id: sessionId,
        }).select("id").single();
        if (error) throw error;
        meetingId = m.id;
      }

      // 3) alert people, then open the classroom
      if (notify || mKind === "urgent") await sendNotices({ id: meetingId!, title: mTitle, kind: mKind, audience: mAud }, "live");
      setTitle(""); setNote("");
      joinClass(subject);
      onClose();
    } catch (e: any) {
      toast({ title: t("Couldn't go live", "تعذر البث المباشر"), description: e?.message, variant: "destructive" });
    }
    setBusy(false);
  };

  const join = () => { if (subject) { joinClass(subject); onClose(); } };

  const endMeeting = async () => {
    if (!liveSession) return;
    if (!window.confirm(t("End this meeting for everyone?", "إنهاء الاجتماع للجميع؟"))) return;
    const nowIso = new Date().toISOString();
    await supabase.from("live_sessions").update({ status: "ended", ended_at: nowIso, actual_end_time: nowIso } as any).eq("id", liveSession.id);
    await (supabase as any).from("majlis_meetings").update({ status: "ended", ended_at: nowIso }).eq("status", "live");
    await refresh(); await load();
    toast({ title: t("Meeting ended", "انتهى الاجتماع") });
  };

  const createSchedule = async () => {
    if (!user) return;
    if (!sTitle.trim() || !sWhen) { toast({ title: t("Title and time are required", "العنوان والوقت مطلوبان"), variant: "destructive" }); return; }
    setBusy(true);
    try {
      const whenIso = new Date(sWhen).toISOString();
      const { data: m, error } = await (supabase as any).from("majlis_meetings").insert({
        title: sTitle.trim(), description: sNote.trim() || null, kind: sKind, audience: sAudience,
        status: "scheduled", scheduled_at: whenIso, host_id: user.id, host_name: hostName,
      }).select("id").single();
      if (error) throw error;
      await sendNotices({ id: m.id, title: sTitle.trim(), kind: sKind, audience: sAudience }, "scheduled", whenIso);
      setSTitle(""); setSNote(""); setSWhen(""); setShowSchedule(false);
      toast({ title: t("Meeting scheduled", "تمت جدولة الاجتماع") });
      load();
    } catch (e: any) { toast({ title: "Error", description: e?.message, variant: "destructive" }); }
    setBusy(false);
  };

  const setStatus = async (m: MajlisMeeting, status: "cancelled") => {
    await (supabase as any).from("majlis_meetings").update({ status }).eq("id", m.id);
    load();
  };
  const remove = async (m: MajlisMeeting) => {
    if (!window.confirm(t("Delete this entry?", "حذف هذا السجل؟"))) return;
    await (supabase as any).from("majlis_meetings").delete().eq("id", m.id);
    load();
  };

  /* ── small UI helpers ── */
  const inp: React.CSSProperties = { width: "100%", padding: "11px 12px", borderRadius: 12, border: `1.5px solid ${BRD}`, fontSize: 13, outline: "none", background: "#fff", boxSizing: "border-box", fontFamily: "inherit" };
  const KindBadge = ({ k }: { k: string }) => {
    const c = kindOf(k); const I = c.icon;
    return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, padding: "2px 8px", borderRadius: 20, background: c.bg, color: c.color, border: `1px solid ${c.color}33`, fontWeight: 800 }}><I size={10} /> {t(c.en, c.ar)}</span>;
  };
  const KindPicker = ({ value, onChange }: { value: Kind; onChange: (k: Kind) => void }) => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6 }}>
      {KINDS.map(k => {
        const I = k.icon; const sel = value === k.id;
        return (
          <button key={k.id} onClick={() => onChange(k.id)} style={{ padding: "9px 2px", borderRadius: 12, border: `1.5px solid ${sel ? k.color : BRD}`, background: sel ? k.bg : "#fff", color: sel ? k.color : "#6B7280", fontSize: 11, fontWeight: 800, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, fontFamily: "inherit" }}>
            <I size={15} />{t(k.en, k.ar)}
          </button>
        );
      })}
    </div>
  );
  const AudiencePicker = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <select value={value} onChange={e => onChange(e.target.value)} style={inp}>
      <option value="all">{t("Everyone", "الجميع")}</option>
      <option value="students">{t("Students only", "الطلاب فقط")}</option>
      <option value="teachers">{t("Teachers & admins", "المعلمون والإداريون")}</option>
      {levels.map(l => <option key={l.slug} value={`level:${l.slug}`}>{t("Level: ", "المستوى: ")}{l.name_en}</option>)}
    </select>
  );
  const lbl: React.CSSProperties = { margin: "0 0 6px", fontSize: 11, fontWeight: 800, color: "#374151" };

  const MeetingCard = ({ m, isPast }: { m: MajlisMeeting; isPast?: boolean }) => (
    <div style={{ background: "#fff", borderRadius: 16, border: `1px solid ${m.kind === "urgent" && !isPast ? "#FECACA" : BRD}`, padding: "12px 14px", opacity: m.status === "cancelled" ? 0.6 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
        {KindBadge({ k: m.kind })}
        <span style={{ fontSize: 10, color: "#6B7280", fontWeight: 700 }}>{audienceLabel(m.audience)}</span>
        {m.status === "cancelled" && <span style={{ fontSize: 10, color: "#DC2626", fontWeight: 800 }}>{t("CANCELLED", "ملغى")}</span>}
      </div>
      <p style={{ margin: 0, fontWeight: 800, fontSize: 14, color: G2 }}>{m.title}</p>
      {m.description && <p style={{ margin: "3px 0 0", fontSize: 12, color: "#6B7280", lineHeight: 1.5 }}>{m.description}</p>}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 11, color: "#6B7280" }}>
        <Clock size={12} /> {fmtDT(isPast ? (m.started_at || m.scheduled_at) : m.scheduled_at)}
        {!isPast && m.scheduled_at && <strong style={{ color: G3 }}>· {until(m.scheduled_at)}</strong>}
        {m.host_name && <span>· {m.host_name}</span>}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
        {!isPast && (
          <button onClick={() => toIcs(m)} style={{ padding: "7px 10px", borderRadius: 10, border: `1.5px solid ${BRD}`, background: "#fff", fontSize: 11, fontWeight: 700, color: "#374151", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontFamily: "inherit" }}>
            <CalendarPlus size={13} /> {t("Add to calendar", "أضف للتقويم")}
          </button>
        )}
        {!isPast && isPrivileged && (
          <>
            <button disabled={busy || isLive} onClick={() => goLive(m)} style={{ padding: "7px 12px", borderRadius: 10, border: "none", background: isLive ? "#E5E7EB" : G2, color: isLive ? "#9CA3AF" : "#fff", fontSize: 11, fontWeight: 800, cursor: isLive ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 5, fontFamily: "inherit" }}>
              <Play size={12} /> {t("Start now", "ابدأ الآن")}
            </button>
            <button onClick={() => setStatus(m, "cancelled")} style={{ padding: "7px 10px", borderRadius: 10, border: "1.5px solid #FECACA", background: "#FEF2F2", color: "#DC2626", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              {t("Cancel", "إلغاء")}
            </button>
          </>
        )}
        {isPast && isPrivileged && (
          <button onClick={() => remove(m)} style={{ padding: "7px 10px", borderRadius: 10, border: `1.5px solid ${BRD}`, background: "#fff", color: "#6B7280", fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontFamily: "inherit" }}>
            <Trash2 size={12} /> {t("Delete", "حذف")}
          </button>
        )}
      </div>
    </div>
  );

  const TABS = [
    { id: "live" as const, icon: Radio, label: t("Live", "مباشر") },
    { id: "schedule" as const, icon: Calendar, label: t("Schedule", "الجدول") },
    { id: "recordings" as const, icon: Video, label: t("Recordings", "التسجيلات") },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 600, background: WARM, display: "flex", flexDirection: "column", fontFamily: "'Cairo',sans-serif" }}>
      <style>{`@keyframes mlPulse{0%,100%{opacity:1}50%{opacity:.35}} @keyframes mlSpin{to{transform:rotate(360deg)}}`}</style>

      {/* Header */}
      <div style={{ background: `linear-gradient(135deg,${G1},${G2})`, padding: "calc(env(safe-area-inset-top,0px) + 12px) 14px 12px", borderBottom: `1px solid ${GOLD}33` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={onClose} aria-label="Back" style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 4, display: "flex" }}><ArrowLeft size={20} /></button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.5)", letterSpacing: 0.6 }}>AL-MAJLIS</p>
            <p style={{ margin: "1px 0 0", fontWeight: 900, fontSize: 18, color: "#fff" }}>{t("Majlis Live", "المجلس المباشر")}</p>
          </div>
          {isLive && (
            <span style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 20, background: "#DC2626", color: "#fff", fontSize: 11, fontWeight: 800 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#fff", animation: "mlPulse 1.2s infinite" }} /> LIVE
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
          {TABS.map(x => {
            const I = x.icon; const sel = tab === x.id;
            return (
              <button key={x.id} onClick={() => setTab(x.id)} style={{ flex: 1, padding: "8px 4px", borderRadius: 12, border: `1px solid ${sel ? GOLD : "rgba(255,255,255,.15)"}`, background: sel ? GOLD : "rgba(255,255,255,.07)", color: sel ? G0 : "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "inherit" }}>
                <I size={14} />{x.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px 40px", display: "flex", flexDirection: "column", gap: 12 }}>
        {!ready || loading ? (
          <div style={{ textAlign: "center", padding: 50 }}><Loader2 size={28} style={{ color: G2, animation: "mlSpin .8s linear infinite" }} /></div>
        ) : !subject ? (
          <div style={{ textAlign: "center", padding: "40px 20px", background: "#fff", borderRadius: 16, border: `1.5px dashed ${BRD}` }}>
            <p style={{ fontSize: 34, margin: "0 0 6px" }}>🛠️</p>
            <p style={{ fontWeight: 800, color: "#374151", margin: 0 }}>{t("Majlis Live isn't set up yet", "المجلس المباشر غير مهيأ بعد")}</p>
            <p style={{ fontSize: 12, color: "#6B7280", margin: "6px 0 0" }}>{t("Run the latest database migration, then reopen this page.", "شغّل آخر ترحيل لقاعدة البيانات ثم أعد فتح الصفحة.")}</p>
          </div>
        ) : tab === "live" ? (
          <>
            {/* Live now */}
            {isLive ? (
              <div style={{ background: `linear-gradient(135deg,${G1},${G2})`, borderRadius: 20, padding: 16, border: `1px solid ${liveMeeting?.kind === "urgent" ? "#DC2626" : GOLD + "55"}`, boxShadow: `0 4px 24px ${G1}44` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#EF4444", animation: "mlPulse 1.2s infinite" }} />
                  <span style={{ fontSize: 11, fontWeight: 800, color: "#fca5a5", letterSpacing: 0.6 }}>{t("LIVE NOW", "مباشر الآن")}</span>
                  {liveMeeting && KindBadge({ k: liveMeeting.kind })}
                </div>
                <p style={{ margin: 0, fontWeight: 900, fontSize: 18, color: "#fff" }}>{liveMeeting?.title || liveSession?.topic || t("Majlis is live", "المجلس مباشر الآن")}</p>
                <p style={{ margin: "4px 0 12px", fontSize: 12, color: "rgba(255,255,255,.6)" }}>
                  {liveMeeting?.host_name ? `${liveMeeting.host_name} · ` : ""}{t("started", "بدأ منذ")} {elapsed(liveSession?.actual_start_time || liveSession?.started_at)}
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={join} style={{ flex: 1, padding: "12px", borderRadius: 12, border: "none", background: GOLD, color: G0, fontWeight: 900, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "inherit" }}>
                    <Mic size={16} /> {t("Join now", "انضم الآن")}
                  </button>
                  {isPrivileged && (
                    <button onClick={endMeeting} style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(255,255,255,.25)", background: "rgba(255,255,255,.1)", color: "#fff", fontWeight: 800, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit" }}>
                      <StopCircle size={15} /> {t("End", "إنهاء")}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              !isPrivileged && (
                <div style={{ textAlign: "center", padding: "34px 20px", background: "#fff", borderRadius: 16, border: `1.5px dashed ${BRD}` }}>
                  <p style={{ fontSize: 34, margin: "0 0 6px" }}>🎙️</p>
                  <p style={{ fontWeight: 800, color: "#374151", margin: 0 }}>{t("No live meeting right now", "لا يوجد اجتماع مباشر الآن")}</p>
                  <p style={{ fontSize: 12, color: "#6B7280", margin: "6px 0 0" }}>{t("You'll get a notification the moment one starts.", "ستصلك رسالة فور بدء أي اجتماع.")}</p>
                </div>
              )
            )}

            {/* Go live composer (staff) */}
            {isPrivileged && (
              <div style={{ background: "#fff", borderRadius: 18, border: `1px solid ${BRD}`, padding: 14, display: "flex", flexDirection: "column", gap: 12, opacity: isLive ? 0.55 : 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Radio size={16} color={G3} />
                  <p style={{ margin: 0, fontWeight: 900, fontSize: 14, color: G2 }}>{t("Go live", "ابدأ بثاً مباشراً")}</p>
                  {isLive && <span style={{ fontSize: 10, color: "#92400E", fontWeight: 700 }}>{t("· a meeting is already live", "· يوجد اجتماع مباشر")}</span>}
                </div>
                <div><p style={lbl}>{t("Type", "النوع")}</p>{KindPicker({ value: kind, onChange: setKind })}</div>
                <div><p style={lbl}>{t("Title", "العنوان")}</p>
                  <input value={title} onChange={e => setTitle(e.target.value)} disabled={isLive} placeholder={kind === "urgent" ? t("e.g. Urgent: timetable change today", "مثال: عاجل: تغيير الجدول اليوم") : t("e.g. Staff meeting", "مثال: اجتماع المعلمين")} style={inp} /></div>
                <div><p style={lbl}>{t("Agenda / note (optional)", "جدول الأعمال / ملاحظة (اختياري)")}</p>
                  <textarea value={note} onChange={e => setNote(e.target.value)} disabled={isLive} rows={2} style={{ ...inp, resize: "vertical" }} /></div>
                <div><p style={lbl}>{t("Who should be alerted", "من سيصله التنبيه")}</p>{AudiencePicker({ value: audience, onChange: setAudience })}</div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#374151", fontWeight: 700 }}>
                  <input type="checkbox" checked={notify || kind === "urgent"} disabled={kind === "urgent"} onChange={e => setNotify(e.target.checked)} />
                  {t("Send a notification now", "أرسل إشعاراً الآن")}{kind === "urgent" ? t(" (always on for urgent)", " (دائماً للعاجل)") : ""}
                </label>
                <button disabled={busy || isLive || !title.trim()} onClick={() => goLive()}
                  style={{ padding: "13px", borderRadius: 12, border: "none", background: busy || isLive || !title.trim() ? "#E5E7EB" : kind === "urgent" ? "#DC2626" : `linear-gradient(135deg,${G2},${G3})`, color: busy || isLive || !title.trim() ? "#9CA3AF" : "#fff", fontWeight: 900, fontSize: 14, cursor: busy || isLive || !title.trim() ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "inherit" }}>
                  {busy ? <Loader2 size={15} style={{ animation: "mlSpin .8s linear infinite" }} /> : kind === "urgent" ? <Siren size={16} /> : <Radio size={16} />}
                  {kind === "urgent" ? t("Alert everyone & go live", "نبّه الجميع وابدأ") : t("Go live", "ابدأ الآن")}
                </button>
              </div>
            )}

            {/* Next up */}
            {upcoming.length > 0 && (
              <div>
                <p style={{ margin: "4px 2px 8px", fontSize: 11, fontWeight: 800, color: "#6B7280", letterSpacing: 0.5 }}>{t("COMING UP", "القادم")}</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{upcoming.slice(0, 2).map(m => <div key={m.id}>{MeetingCard({ m })}</div>)}</div>
              </div>
            )}
          </>
        ) : tab === "schedule" ? (
          <>
            {isPrivileged && (
              <button onClick={() => setShowSchedule(s => !s)} style={{ padding: "12px", borderRadius: 14, border: `1.5px dashed ${G3}`, background: "#fff", color: G2, fontWeight: 800, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "inherit" }}>
                {showSchedule ? <X size={15} /> : <Plus size={15} />} {showSchedule ? t("Close", "إغلاق") : t("Schedule a meeting", "جدولة اجتماع")}
              </button>
            )}
            {isPrivileged && showSchedule && (
              <div style={{ background: "#fff", borderRadius: 18, border: `1px solid ${BRD}`, padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
                <div><p style={lbl}>{t("Type", "النوع")}</p>{KindPicker({ value: sKind, onChange: setSKind })}</div>
                <div><p style={lbl}>{t("Title", "العنوان")}</p><input value={sTitle} onChange={e => setSTitle(e.target.value)} style={inp} /></div>
                <div><p style={lbl}>{t("Date & time", "التاريخ والوقت")}</p><input type="datetime-local" value={sWhen} onChange={e => setSWhen(e.target.value)} style={inp} /></div>
                <div><p style={lbl}>{t("Agenda (optional)", "جدول الأعمال (اختياري)")}</p><textarea value={sNote} onChange={e => setSNote(e.target.value)} rows={2} style={{ ...inp, resize: "vertical" }} /></div>
                <div><p style={lbl}>{t("Invite", "الدعوة")}</p>{AudiencePicker({ value: sAudience, onChange: setSAudience })}</div>
                <button disabled={busy} onClick={createSchedule} style={{ padding: "13px", borderRadius: 12, border: "none", background: `linear-gradient(135deg,${G2},${G3})`, color: "#fff", fontWeight: 900, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                  {busy ? t("Scheduling…", "جارٍ الجدولة…") : t("Schedule & notify", "جدولة وإشعار")}
                </button>
              </div>
            )}

            <div style={{ display: "flex", gap: 6 }}>
              {[{ v: false, l: `${t("Upcoming", "القادمة")} (${upcoming.length})` }, { v: true, l: `${t("Past", "السابقة")} (${past.length})` }].map(o => (
                <button key={String(o.v)} onClick={() => setShowPast(o.v)} style={{ flexShrink: 0, padding: "7px 14px", borderRadius: 20, border: `1.5px solid ${showPast === o.v ? G2 : BRD}`, background: showPast === o.v ? G2 : "#fff", color: showPast === o.v ? "#fff" : "#374151", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{o.l}</button>
              ))}
            </div>

            {(showPast ? past : upcoming).length === 0 ? (
              <div style={{ textAlign: "center", padding: "36px 20px", background: "#fff", borderRadius: 16, border: `1.5px dashed ${BRD}` }}>
                <p style={{ fontSize: 34, margin: "0 0 6px" }}>📅</p>
                <p style={{ fontWeight: 700, color: "#374151", margin: 0 }}>{showPast ? t("No past meetings yet", "لا توجد اجتماعات سابقة") : t("Nothing scheduled", "لا يوجد اجتماعات مجدولة")}</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {(showPast ? past : upcoming).map(m => <div key={m.id}>{MeetingCard({ m, isPast: showPast })}</div>)}
              </div>
            )}
          </>
        ) : (
          <div style={{ background: "#fff", borderRadius: 16, border: `1px solid ${BRD}`, padding: 10 }}>
            <SubjectRecordings subjectId={subject.id} />
          </div>
        )}
      </div>
    </div>
  );
}
