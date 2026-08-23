/* src/pages/admin/ExamLiveMonitor.tsx
   Live, per-exam monitoring dashboard for admins/teachers:
   - Real-time roster of everyone assigned to this exam, with live status
     (not started / online / idle / submitted / graded), progress, and timer.
   - Violations + proctoring session detail per student (webcam/mic/fullscreen,
     integrity score, snapshot thumbnails).
   - Actions: grant extra time, force-submit (auto-graded via RPC), reset an
     in-progress attempt so the student can restart, save an admin note.
   - Realtime via Supabase channels on exam_attempts / violations, with a
     30s poll as a fallback if the socket drops.
*/
import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { storageSupabase } from "../../integrations/supabase/storageClient";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, RefreshCw, Clock, Plus, Send, ShieldAlert,
  Camera, Mic, Maximize, X, StickyNote, RotateCcw, CheckCircle2,
  AlertTriangle, Wifi, WifiOff, Users, Circle,
} from "lucide-react";

const G = "#0f2d1f", GM = "#1a4731", GOLD = "#c9a84c";
const CREAM = "#faf6ee", BORDER = "rgba(15,45,31,0.1)", TL = "#7a9e88";

const ONLINE_WINDOW_MS = 45_000; // heartbeat every 15s — 45s = missed 2-3 beats = idle

const sCol = (lvl: string) => ({
  low:      { bg: "#f0fff4", text: "#065f46", border: "#86efac" },
  medium:   { bg: "#fffbeb", text: "#92400e", border: "#fde68a" },
  high:     { bg: "#fff5f5", text: "#991b1b", border: "#fca5a5" },
  critical: { bg: "#1a0000", text: "#fff",    border: "#dc2626" },
}[lvl] || { bg: "#f8fafb", text: TL, border: "#e5e7eb" });

const iCol = (score: number) => score >= 80 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";

const fmtClock = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(ss)}` : `${pad(m)}:${pad(ss)}`;
};

const fmtAgo = (iso: string | null, t: (en: string, ar: string) => string) => {
  if (!iso) return t("never", "أبدًا");
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 10) return t("just now", "الآن");
  if (sec < 60) return `${sec}s ${t("ago", "مضت")}`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${t("ago", "مضت")}`;
  return `${Math.floor(sec / 3600)}h ${t("ago", "مضت")}`;
};

/* ── Snapshot thumbnail (signed URL, lazy) ─────────────────────── */
const Thumb = ({ media, onClick }: { media: any; onClick: () => void }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    storageSupabase.storage.from("proctoring-media").createSignedUrl(media.file_url, 3600)
      .then(({ data }) => data?.signedUrl ? setUrl(data.signedUrl) : setErr(true))
      .catch(() => setErr(true));
  }, [media.file_url]);
  return (
    <div onClick={onClick} style={{ position: "relative", borderRadius: 8, overflow: "hidden", aspectRatio: "1", background: "#111", cursor: "pointer", border: `1.5px solid ${BORDER}`, flexShrink: 0, width: 64 }}>
      {url && !err
        ? <img src={url} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={() => setErr(true)} />
        : <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#666" }}>
            {err ? <Camera size={16} /> : <div style={{ width: 14, height: 14, borderRadius: "50%", border: `2px solid ${GOLD}`, borderTopColor: "transparent", animation: "spin .8s linear infinite" }} />}
          </div>}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,.65)", color: "#fff", fontSize: 8, padding: "1px 4px", textAlign: "center" }}>
        {new Date(media.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </div>
    </div>
  );
};

type Row = {
  attempt: any | null;      // exam_attempts row, or null if student never started
  profile: any;
  status: "not_started" | "online" | "idle" | "submitted" | "graded";
  violationCount: number;
  answeredCount: number;
};

export default function ExamLiveMonitor() {
  const { examId } = useParams();
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [exam, setExam]           = useState<any>(null);
  const [rows, setRows]           = useState<Row[]>([]);
  const [questionCount, setQC]    = useState(0);
  const [loading, setLoading]     = useState(true);
  const [connected, setConnected] = useState(false);
  const [filter, setFilter]       = useState<"all" | "online" | "not_started" | "submitted" | "flagged">("all");
  const [search, setSearch]       = useState("");

  const [detail, setDetail]         = useState<Row | null>(null);
  const [detailViolations, setDV]   = useState<any[]>([]);
  const [detailSession, setDS]      = useState<any>(null);
  const [detailMedia, setDM]        = useState<any[]>([]);
  const [detailLoading, setDL]      = useState(false);
  const [noteDraft, setNoteDraft]   = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [busyId, setBusyId]         = useState<string | null>(null);
  const [preview, setPreview]       = useState<any>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [, forceTick] = useState(0); // re-render every second for live timers

  const rowsRef = useRef<Row[]>([]);
  useEffect(() => { rowsRef.current = rows; }, [rows]);

  /* ── Load everything ─────────────────────────────────────────── */
  const load = useCallback(async () => {
    if (!examId) return;
    const { data: e } = await supabase.from("exams").select("*").eq("id", examId).single();
    setExam(e);

    const { count: qc } = await supabase.from("exam_questions").select("id", { count: "exact", head: true }).eq("exam_id", examId);
    setQC(qc || 0);

    const { data: assigns } = await supabase.from("exam_assignments").select("user_id").eq("exam_id", examId);
    const userIds = Array.from(new Set((assigns || []).map((a: any) => a.user_id)));
    if (userIds.length === 0) { setRows([]); setLoading(false); return; }

    const { data: profiles } = await supabase.from("profiles")
      .select("user_id, full_name, full_name_ar, level").in("user_id", userIds);
    const profMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));

    const { data: attempts } = await supabase.from("exam_attempts")
      .select("*").eq("exam_id", examId).in("user_id", userIds)
      .order("started_at", { ascending: false });
    // Latest attempt per student
    const attemptMap = new Map<string, any>();
    (attempts || []).forEach((a: any) => { if (!attemptMap.has(a.user_id)) attemptMap.set(a.user_id, a); });

    const attemptIds = Array.from(attemptMap.values()).map((a: any) => a.id);
    let violCounts = new Map<string, number>();
    let answerCounts = new Map<string, number>();
    if (attemptIds.length > 0) {
      const { data: viols } = await supabase.from("violations").select("attempt_id").in("attempt_id", attemptIds);
      (viols || []).forEach((v: any) => violCounts.set(v.attempt_id, (violCounts.get(v.attempt_id) || 0) + 1));
      const { data: answers } = await supabase.from("exam_answers").select("attempt_id, answer_text, answer_data").in("attempt_id", attemptIds);
      (answers || []).forEach((a: any) => {
        const hasAnswer = (a.answer_text && a.answer_text.trim()) || (a.answer_data && Object.keys(a.answer_data).length > 0);
        if (hasAnswer) answerCounts.set(a.attempt_id, (answerCounts.get(a.attempt_id) || 0) + 1);
      });
    }

    const newRows: Row[] = userIds.map(uid => {
      const attempt = attemptMap.get(uid) || null;
      const profile = profMap.get(uid) || { full_name: "Unknown", full_name_ar: "", level: null };
      let status: Row["status"] = "not_started";
      if (attempt) {
        if (attempt.status === "graded") status = "graded";
        else if (attempt.status === "submitted") status = "submitted";
        else if (attempt.status === "in_progress") {
          const lastAct = attempt.last_activity_at ? new Date(attempt.last_activity_at).getTime() : 0;
          status = (Date.now() - lastAct) < ONLINE_WINDOW_MS ? "online" : "idle";
        }
      }
      return {
        attempt, profile, status,
        violationCount: attempt ? (violCounts.get(attempt.id) || 0) : 0,
        answeredCount: attempt ? (answerCounts.get(attempt.id) || 0) : 0,
      };
    });
    // Sort: online first, then idle, then not started, then submitted/graded — most actionable on top
    const order: Record<Row["status"], number> = { online: 0, idle: 1, not_started: 2, submitted: 3, graded: 4 };
    newRows.sort((a, b) => order[a.status] - order[b.status] || (a.profile.full_name || "").localeCompare(b.profile.full_name || ""));
    setRows(newRows);
    setLoading(false);
  }, [examId]);

  useEffect(() => { load(); }, [load]);

  /* ── Realtime — attempts + violations for this exam ────────────── */
  useEffect(() => {
    if (!examId) return;
    const channel = supabase
      .channel(`exam-live-monitor-${examId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "exam_attempts", filter: `exam_id=eq.${examId}` }, () => load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "violations" }, () => load())
      .subscribe((status: string) => setConnected(status === "SUBSCRIBED"));
    // Fallback poll — in case the socket drops silently
    const iv = setInterval(load, 30000);
    return () => { supabase.removeChannel(channel); clearInterval(iv); };
  }, [examId, load]);

  // Tick every second so on-screen timers (elapsed/remaining) count live
  // without needing a full data reload.
  useEffect(() => { const iv = setInterval(() => forceTick(x => x + 1), 1000); return () => clearInterval(iv); }, []);

  // Re-derive online/idle status every few seconds from last_activity_at
  // without a full reload (catches students who went idle mid-view).
  useEffect(() => {
    const iv = setInterval(() => {
      setRows(prev => prev.map(r => {
        if (!r.attempt || r.attempt.status !== "in_progress") return r;
        const lastAct = r.attempt.last_activity_at ? new Date(r.attempt.last_activity_at).getTime() : 0;
        const status: Row["status"] = (Date.now() - lastAct) < ONLINE_WINDOW_MS ? "online" : "idle";
        return status === r.status ? r : { ...r, status };
      }));
    }, 5000);
    return () => clearInterval(iv);
  }, []);

  /* ── Detail drawer ──────────────────────────────────────────── */
  const openDetail = async (row: Row) => {
    setDetail(row);
    setNoteDraft(row.attempt?.admin_note || "");
    if (!row.attempt) { setDV([]); setDS(null); setDM([]); return; }
    setDL(true);
    const [{ data: viols }, { data: sess }, { data: media }] = await Promise.all([
      supabase.from("violations").select("*").eq("attempt_id", row.attempt.id).order("timestamp", { ascending: false }),
      supabase.from("proctoring_sessions").select("*").eq("attempt_id", row.attempt.id).order("started_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("proctoring_media").select("*").eq("attempt_id", row.attempt.id).order("created_at", { ascending: false }).limit(24),
    ]);
    setDV(viols || []); setDS(sess || null); setDM(media || []);
    setDL(false);
  };

  useEffect(() => {
    if (!preview) { setPreviewUrl(null); return; }
    storageSupabase.storage.from("proctoring-media").createSignedUrl(preview.file_url, 3600)
      .then(({ data }) => setPreviewUrl(data?.signedUrl || null));
  }, [preview]);

  /* ── Actions ────────────────────────────────────────────────── */
  const grantExtraTime = async (attemptId: string, minutes: number) => {
    setBusyId(attemptId);
    const { error } = await supabase.rpc("admin_grant_exam_extra_time", { _attempt_id: attemptId, _minutes: minutes });
    setBusyId(null);
    if (error) { toast({ title: "Failed to add time", description: error.message, variant: "destructive" }); return; }
    toast({ title: `⏱️ +${minutes} min added`, description: t("The student's timer updates live.", "سيتحدث مؤقت الطالب مباشرة.") });
    load();
    if (detail?.attempt?.id === attemptId) setDetail(d => d ? { ...d, attempt: { ...d.attempt, extra_time_minutes: (d.attempt.extra_time_minutes || 0) + minutes } } : d);
  };

  const forceSubmit = async (attemptId: string) => {
    if (!confirm(t("Force-submit this attempt now? It will be graded with whatever answers are saved so far.", "إنهاء هذه المحاولة الآن؟ سيتم تصحيحها بالإجابات المحفوظة حتى الآن."))) return;
    setBusyId(attemptId);
    const { error } = await supabase.rpc("admin_force_submit_exam_attempt", { _attempt_id: attemptId });
    setBusyId(null);
    if (error) { toast({ title: "Failed to submit", description: error.message, variant: "destructive" }); return; }
    toast({ title: "✅ Submitted & graded" });
    setDetail(null);
    load();
  };

  const resetAttempt = async (attemptId: string) => {
    if (!confirm(t("Delete this in-progress attempt so the student can restart from scratch? Their saved answers will be lost.", "حذف هذه المحاولة الجارية ليبدأ الطالب من جديد؟ ستُفقد إجاباته المحفوظة."))) return;
    setBusyId(attemptId);
    await supabase.from("exam_attempts").delete().eq("id", attemptId);
    setBusyId(null);
    toast({ title: t("Attempt reset", "تمت إعادة تعيين المحاولة") });
    setDetail(null);
    load();
  };

  const saveNote = async () => {
    if (!detail?.attempt) return;
    setSavingNote(true);
    await supabase.from("exam_attempts").update({ admin_note: noteDraft }).eq("id", detail.attempt.id);
    setSavingNote(false);
    toast({ title: t("Note saved", "تم حفظ الملاحظة") });
    load();
  };

  /* ── Derived stats ──────────────────────────────────────────── */
  const stats = {
    total: rows.length,
    notStarted: rows.filter(r => r.status === "not_started").length,
    online: rows.filter(r => r.status === "online").length,
    idle: rows.filter(r => r.status === "idle").length,
    submitted: rows.filter(r => r.status === "submitted" || r.status === "graded").length,
    flagged: rows.filter(r => r.attempt && ["high", "critical"].includes(r.attempt.suspicion_level || "low")).length,
  };

  const filtered = rows.filter(r => {
    if (filter === "online" && r.status !== "online" && r.status !== "idle") return false;
    if (filter === "not_started" && r.status !== "not_started") return false;
    if (filter === "submitted" && !(r.status === "submitted" || r.status === "graded")) return false;
    if (filter === "flagged" && !(r.attempt && ["high", "critical"].includes(r.attempt.suspicion_level || "low"))) return false;
    if (search) {
      const name = (language === "ar" ? r.profile.full_name_ar || r.profile.full_name : r.profile.full_name || "").toLowerCase();
      if (!name.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const statusBadge = (status: Row["status"]) => {
    const map: Record<Row["status"], { bg: string; text: string; label: string; labelAr: string; dot?: string }> = {
      not_started: { bg: "#f8fafb", text: TL, label: "Not started", labelAr: "لم يبدأ" },
      online:      { bg: "#f0fff4", text: "#065f46", label: "Online", labelAr: "متصل", dot: "#22c55e" },
      idle:        { bg: "#fffbeb", text: "#92400e", label: "Idle", labelAr: "خامل", dot: "#f59e0b" },
      submitted:   { bg: "#eff6ff", text: "#1d4ed8", label: "Submitted", labelAr: "مُسلّم" },
      graded:      { bg: "#f0fdf4", text: "#166534", label: "Graded", labelAr: "مُصحّح" },
    };
    const m = map[status];
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 800, padding: "3px 9px", borderRadius: 10, background: m.bg, color: m.text }}>
        {m.dot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: m.dot, animation: status === "online" ? "livePulse2 1.4s ease-in-out infinite" : "none" }} />}
        {language === "ar" ? m.labelAr : m.label}
      </span>
    );
  };

  return (
    <div style={{ minHeight: "100vh", background: CREAM, fontFamily: "'Cairo',sans-serif", paddingBottom: 40 }}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes livePulse{0%,100%{opacity:1}50%{opacity:.3}}
        @keyframes livePulse2{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.3);opacity:.5}}
      `}</style>

      {/* Header */}
      <div style={{ background: `linear-gradient(135deg,${G},${GM})`, padding: "18px 16px 22px", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <button onClick={() => navigate("/admin/exams")} style={{ background: "rgba(255,255,255,.12)", border: "none", borderRadius: 10, padding: 8, cursor: "pointer" }}>
            <ArrowLeft size={16} color="#fff" />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444", animation: "livePulse 1.4s ease-in-out infinite" }} />
              <span style={{ fontSize: 10, fontWeight: 900, color: "#ef4444", letterSpacing: 1 }}>LIVE MONITOR</span>
              {connected
                ? <Wifi size={12} color="rgba(255,255,255,.6)" />
                : <WifiOff size={12} color="rgba(255,255,255,.4)" />}
            </div>
            <h1 style={{ fontSize: 18, fontWeight: 900, color: "#fff", margin: "2px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {exam ? (language === "ar" ? exam.title_ar || exam.title : exam.title) : "…"}
            </h1>
          </div>
          <button onClick={load} style={{ background: "rgba(255,255,255,.12)", border: "none", borderRadius: 10, padding: 8, cursor: "pointer" }}>
            <RefreshCw size={14} color="#fff" />
          </button>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6 }}>
          {[
            { icon: <Users size={12} />, val: stats.total, lbl: t("Assigned", "معيّن"), key: "all" as const },
            { icon: <Circle size={12} />, val: stats.online, lbl: t("Online", "متصل"), key: "online" as const },
            { icon: <Clock size={12} />, val: stats.notStarted, lbl: t("Not started", "لم يبدأ"), key: "not_started" as const },
            { icon: <CheckCircle2 size={12} />, val: stats.submitted, lbl: t("Done", "انتهى"), key: "submitted" as const },
            { icon: <ShieldAlert size={12} />, val: stats.flagged, lbl: t("Flagged", "مُعلّم"), key: "flagged" as const },
          ].map((s, i) => (
            <button key={i} onClick={() => setFilter(s.key)} style={{
              textAlign: "center", borderRadius: 12, padding: "8px 2px", cursor: "pointer", border: "none",
              background: filter === s.key ? "rgba(255,255,255,.22)" : "rgba(255,255,255,.08)",
            }}>
              <div style={{ display: "flex", justifyContent: "center", color: "rgba(255,255,255,.65)", marginBottom: 2 }}>{s.icon}</div>
              <div style={{ fontSize: 15, fontWeight: 900, color: "#fff", lineHeight: 1 }}>{s.val}</div>
              <div style={{ fontSize: 8, color: "rgba(255,255,255,.55)", fontWeight: 700, marginTop: 2 }}>{s.lbl}</div>
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: "14px 16px" }}>
        {/* Search */}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("Search student…", "ابحث عن طالب…")}
          style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: `1.5px solid ${BORDER}`, fontSize: 13, color: G, outline: "none", marginBottom: 12, boxSizing: "border-box" as const, background: "#fff" }} />

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
            <div style={{ width: 40, height: 40, border: `4px solid ${G}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin .8s linear infinite" }} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 20px", background: "#fff", borderRadius: 18, border: `1px dashed ${BORDER}` }}>
            <div style={{ fontSize: 36, marginBottom: 10, opacity: .4 }}>👀</div>
            <p style={{ fontSize: 13, color: TL, margin: 0 }}>{t("No students match this filter", "لا يوجد طلاب مطابقون")}</p>
          </div>
        ) : filtered.map(row => {
          const a = row.attempt;
          const name = language === "ar" ? row.profile.full_name_ar || row.profile.full_name : row.profile.full_name;
          const integ = a ? Math.round(Number(a.integrity_score) || 100) : 100;
          const sc = sCol(a?.suspicion_level || "low");
          const timeLimit = ((exam?.time_limit_minutes || 0) + (a?.extra_time_minutes || 0)) * 60;
          const elapsed = a?.started_at ? Math.floor((Date.now() - new Date(a.started_at).getTime()) / 1000) : 0;
          const remaining = a && a.status === "in_progress" ? Math.max(0, timeLimit - elapsed) : null;
          const answered = row.answeredCount, total = questionCount || 1;

          return (
            <div key={a?.id || row.profile.user_id} onClick={() => openDetail(row)}
              style={{ background: "#fff", borderRadius: 16, marginBottom: 10, border: `1.5px solid ${row.status === "online" ? "#86efac" : BORDER}`, boxShadow: "0 2px 10px rgba(15,45,31,.06)", cursor: "pointer", overflow: "hidden" }}>
              <div style={{ padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: "50%", background: `linear-gradient(135deg,${G},${GM})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 900, color: GOLD, flexShrink: 0 }}>
                    {(name || "?").charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" as const, marginBottom: 3 }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: G }}>{name}</span>
                      {statusBadge(row.status)}
                    </div>

                    {/* Progress bar */}
                    {a && (a.status === "in_progress") && (
                      <div style={{ margin: "6px 0" }}>
                        <div style={{ height: 5, borderRadius: 3, background: "#f0f0f0", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${Math.min(100, (answered / total) * 100)}%`, background: GOLD, transition: "width .3s" }} />
                        </div>
                        <div style={{ fontSize: 10, color: TL, marginTop: 3 }}>
                          {answered}/{questionCount} {t("answered", "مُجاب")} · {t("Q", "س")}{(a.current_question_index || 0) + 1}
                        </div>
                      </div>
                    )}

                    {/* Metrics row */}
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const, alignItems: "center", marginTop: 4 }}>
                      {remaining !== null && (
                        <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 800, color: remaining < 120 ? "#dc2626" : G, fontVariantNumeric: "tabular-nums" as const }}>
                          <Clock size={11} /> {fmtClock(remaining)}
                        </span>
                      )}
                      {a && (
                        <span style={{ fontSize: 10, color: TL }}>
                          {row.status === "online" || row.status === "idle" ? `${t("seen", "شوهد")} ${fmtAgo(a.last_activity_at, t)}` : null}
                        </span>
                      )}
                      {a && (
                        <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10 }}>
                          <span style={{ color: TL }}>Integrity:</span>
                          <span style={{ fontWeight: 900, color: iCol(integ) }}>{integ}%</span>
                        </span>
                      )}
                      {row.violationCount > 0 && (
                        <span style={{ padding: "2px 7px", borderRadius: 8, fontSize: 10, fontWeight: 800, background: sc.bg, color: sc.text, border: `1px solid ${sc.border}` }}>
                          ⚠ {row.violationCount}
                        </span>
                      )}
                      {a?.extra_time_minutes > 0 && (
                        <span style={{ padding: "2px 7px", borderRadius: 8, fontSize: 10, fontWeight: 700, background: "#fef3c7", color: "#92400e" }}>
                          +{a.extra_time_minutes}m
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Quick actions — only when in progress */}
                {a && a.status === "in_progress" && (
                  <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" as const }} onClick={e => e.stopPropagation()}>
                    <button onClick={() => grantExtraTime(a.id, 5)} disabled={busyId === a.id}
                      style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", borderRadius: 8, border: `1.5px solid ${BORDER}`, background: "#fff", fontSize: 11, fontWeight: 700, color: G, cursor: "pointer" }}>
                      <Plus size={11} /> 5{t("m", "د")}
                    </button>
                    <button onClick={() => grantExtraTime(a.id, 10)} disabled={busyId === a.id}
                      style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", borderRadius: 8, border: `1.5px solid ${BORDER}`, background: "#fff", fontSize: 11, fontWeight: 700, color: G, cursor: "pointer" }}>
                      <Plus size={11} /> 10{t("m", "د")}
                    </button>
                    <button onClick={() => forceSubmit(a.id)} disabled={busyId === a.id}
                      style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", borderRadius: 8, border: "none", background: "#eff6ff", fontSize: 11, fontWeight: 700, color: "#1d4ed8", cursor: "pointer" }}>
                      <Send size={11} /> {t("Force submit", "إنهاء الآن")}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Detail drawer */}
      <Dialog open={!!detail} onOpenChange={o => !o && setDetail(null)}>
        <DialogContent style={{ maxWidth: 480, maxHeight: "85vh", overflowY: "auto", fontFamily: "'Cairo',sans-serif", padding: 0 }}>
          {detail && (() => {
            const a = detail.attempt;
            const name = language === "ar" ? detail.profile.full_name_ar || detail.profile.full_name : detail.profile.full_name;
            return (
              <div>
                <DialogHeader style={{ padding: "18px 20px 12px", borderBottom: `1px solid ${BORDER}` }}>
                  <DialogTitle style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15, color: G }}>
                    <div style={{ width: 34, height: 34, borderRadius: "50%", background: `linear-gradient(135deg,${G},${GM})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 900, color: GOLD }}>
                      {(name || "?").charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div>{name}</div>
                      <div style={{ fontSize: 11, fontWeight: 500, color: TL }}>{detail.profile.level || ""}</div>
                    </div>
                  </DialogTitle>
                </DialogHeader>

                <div style={{ padding: "16px 20px" }}>
                  {!a ? (
                    <p style={{ fontSize: 13, color: TL, textAlign: "center", padding: "24px 0" }}>{t("This student hasn't started the exam yet.", "لم يبدأ هذا الطالب الامتحان بعد.")}</p>
                  ) : (
                    <>
                      {/* Status + core stats */}
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const, marginBottom: 14 }}>
                        {statusBadge(detail.status)}
                        <span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 10, background: sCol(a.suspicion_level).bg, color: sCol(a.suspicion_level).text, fontWeight: 700 }}>
                          {a.suspicion_level || "low"} risk
                        </span>
                        <span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 10, background: "#f8fafb", color: TL, fontWeight: 700 }}>
                          Integrity {Math.round(Number(a.integrity_score) || 100)}%
                        </span>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14, fontSize: 12 }}>
                        <div style={{ background: "#f8fafb", borderRadius: 10, padding: "8px 10px" }}>
                          <div style={{ color: TL, fontSize: 10 }}>{t("Started", "بدأ")}</div>
                          <div style={{ fontWeight: 700, color: G }}>{new Date(a.started_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                        </div>
                        <div style={{ background: "#f8fafb", borderRadius: 10, padding: "8px 10px" }}>
                          <div style={{ color: TL, fontSize: 10 }}>{t("Tab switches", "تبديل التبويب")}</div>
                          <div style={{ fontWeight: 700, color: (a.tab_switches || 0) > 0 ? "#dc2626" : G }}>{a.tab_switches || 0}</div>
                        </div>
                        <div style={{ background: "#f8fafb", borderRadius: 10, padding: "8px 10px" }}>
                          <div style={{ color: TL, fontSize: 10 }}>{t("Answered", "أُجيب")}</div>
                          <div style={{ fontWeight: 700, color: G }}>{detail.answeredCount}/{questionCount}</div>
                        </div>
                        <div style={{ background: "#f8fafb", borderRadius: 10, padding: "8px 10px" }}>
                          <div style={{ color: TL, fontSize: 10 }}>{t("Extra time granted", "وقت إضافي")}</div>
                          <div style={{ fontWeight: 700, color: G }}>{a.extra_time_minutes || 0} min</div>
                        </div>
                      </div>

                      {/* Proctoring session flags */}
                      {detailSession && (
                        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                          {[
                            { icon: <Camera size={13} />, on: detailSession.webcam_enabled, label: t("Webcam", "الكاميرا") },
                            { icon: <Mic size={13} />, on: detailSession.microphone_enabled, label: t("Mic", "الميكروفون") },
                            { icon: <Maximize size={13} />, on: detailSession.fullscreen_active, label: t("Fullscreen", "ملء الشاشة") },
                          ].map((f, i) => (
                            <div key={i} style={{ flex: 1, textAlign: "center", background: f.on ? "#f0fff4" : "#fff5f5", borderRadius: 10, padding: "8px 4px" }}>
                              <div style={{ display: "flex", justifyContent: "center", color: f.on ? "#065f46" : "#991b1b", marginBottom: 2 }}>{f.icon}</div>
                              <div style={{ fontSize: 9, fontWeight: 700, color: f.on ? "#065f46" : "#991b1b" }}>{f.label}</div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Actions */}
                      {a.status === "in_progress" && (
                        <div style={{ marginBottom: 16 }}>
                          <div style={{ fontSize: 11, fontWeight: 800, color: TL, marginBottom: 6 }}>{t("Actions", "إجراءات")}</div>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
                            <button onClick={() => grantExtraTime(a.id, 5)} disabled={busyId === a.id}
                              style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 12px", borderRadius: 9, border: `1.5px solid ${BORDER}`, background: "#fff", fontSize: 12, fontWeight: 700, color: G, cursor: "pointer" }}>
                              <Plus size={12} /> 5 min
                            </button>
                            <button onClick={() => grantExtraTime(a.id, 10)} disabled={busyId === a.id}
                              style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 12px", borderRadius: 9, border: `1.5px solid ${BORDER}`, background: "#fff", fontSize: 12, fontWeight: 700, color: G, cursor: "pointer" }}>
                              <Plus size={12} /> 10 min
                            </button>
                            <button onClick={() => {
                              const v = prompt(t("Custom minutes to add:", "عدد الدقائق المضافة:"), "15");
                              const n = v ? parseInt(v, 10) : 0;
                              if (n) grantExtraTime(a.id, n);
                            }} disabled={busyId === a.id}
                              style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 12px", borderRadius: 9, border: `1.5px solid ${BORDER}`, background: "#fff", fontSize: 12, fontWeight: 700, color: G, cursor: "pointer" }}>
                              <Plus size={12} /> {t("Custom", "مخصص")}
                            </button>
                            <button onClick={() => forceSubmit(a.id)} disabled={busyId === a.id}
                              style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 12px", borderRadius: 9, border: "none", background: "#eff6ff", fontSize: 12, fontWeight: 700, color: "#1d4ed8", cursor: "pointer" }}>
                              <Send size={12} /> {t("Force submit", "إنهاء الآن")}
                            </button>
                            <button onClick={() => resetAttempt(a.id)} disabled={busyId === a.id}
                              style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 12px", borderRadius: 9, border: "none", background: "#fef2f2", fontSize: 12, fontWeight: 700, color: "#dc2626", cursor: "pointer" }}>
                              <RotateCcw size={12} /> {t("Reset attempt", "إعادة تعيين")}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Admin note */}
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: TL, marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
                          <StickyNote size={12} /> {t("Admin note", "ملاحظة إدارية")}
                        </div>
                        <textarea value={noteDraft} onChange={e => setNoteDraft(e.target.value)}
                          placeholder={t("Internal note — not visible to the student…", "ملاحظة داخلية — غير مرئية للطالب…")}
                          style={{ width: "100%", minHeight: 60, padding: 10, borderRadius: 10, border: `1.5px solid ${BORDER}`, fontSize: 12, fontFamily: "'Cairo',sans-serif", resize: "vertical" as const, boxSizing: "border-box" as const }} />
                        <button onClick={saveNote} disabled={savingNote}
                          style={{ marginTop: 6, padding: "6px 14px", borderRadius: 8, border: "none", background: G, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                          {savingNote ? t("Saving…", "جارٍ الحفظ…") : t("Save note", "حفظ")}
                        </button>
                      </div>

                      {/* Violations timeline */}
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: TL, marginBottom: 6 }}>
                          {t("Violations", "المخالفات")} ({detailViolations.length})
                        </div>
                        {detailLoading ? (
                          <div style={{ textAlign: "center", padding: 12 }}><div style={{ width: 20, height: 20, border: `3px solid ${G}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin .8s linear infinite", display: "inline-block" }} /></div>
                        ) : detailViolations.length === 0 ? (
                          <p style={{ fontSize: 12, color: TL, margin: 0 }}>{t("None recorded.", "لا يوجد شيء مسجل.")}</p>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflowY: "auto" }}>
                            {detailViolations.map((v: any) => (
                              <div key={v.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, background: "#fff5f5", borderRadius: 8, padding: "6px 10px" }}>
                                <AlertTriangle size={12} color="#dc2626" style={{ marginTop: 2, flexShrink: 0 }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: "#991b1b" }}>{v.violation_type.replace(/_/g, " ")}</div>
                                  {v.details && <div style={{ fontSize: 10, color: "#7f1d1d" }}>{v.details}</div>}
                                  <div style={{ fontSize: 9, color: TL }}>{new Date(v.timestamp).toLocaleTimeString()}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Media snapshots */}
                      {detailMedia.length > 0 && (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 800, color: TL, marginBottom: 6 }}>
                            {t("Snapshots", "لقطات")} ({detailMedia.length})
                          </div>
                          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
                            {detailMedia.map((m: any) => <Thumb key={m.id} media={m} onClick={() => setPreview(m)} />)}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Snapshot lightbox */}
      {preview && (
        <div onClick={() => setPreview(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.9)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <button onClick={() => setPreview(null)} style={{ position: "absolute", top: 16, right: 16, background: "rgba(255,255,255,.15)", border: "none", borderRadius: 10, padding: 8, cursor: "pointer" }}>
            <X size={18} color="#fff" />
          </button>
          {previewUrl ? <img src={previewUrl} style={{ maxWidth: "100%", maxHeight: "85vh", borderRadius: 8 }} /> : <div style={{ width: 40, height: 40, border: "4px solid #fff", borderTopColor: "transparent", borderRadius: "50%", animation: "spin .8s linear infinite" }} />}
        </div>
      )}
    </div>
  );
}
