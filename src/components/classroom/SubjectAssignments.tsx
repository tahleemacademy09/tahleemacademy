/*  src/pages/student/StudentAssignments.tsx
    Full-featured student assignment hub:
    – Lists all assignments from enrolled subjects
    – Filter by status / subject
    – Submission modal: text editor · file upload · audio recorder
    – View graded feedback & score
*/

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { uploadStorageFile, getSignedUrl } from "@/integrations/supabase/storageClient";
import {
  ClipboardList, Clock, CheckCircle, AlertTriangle, Upload, Mic,
  MicOff, FileText, BookOpen, ChevronRight, X, Send, Star,
  Play, Pause, RotateCcw, Paperclip, MessageSquare, Calendar,
  Filter, Search, ArrowLeft, StopCircle, Eye, Download,
  TrendingUp, Award, Loader2,
} from "lucide-react";

/* ── Design tokens ─────────────────────────────────────── */
const G      = "#0f2d1f";
const MG     = "#1a4731";
const GOLD   = "#c9a84c";
const GOLDF  = "#e4c36a";
const CREAM  = "#faf6ee";
const BORDER = "rgba(15,45,31,0.1)";
const TXT    = "#0f2d1f";
const TMID   = "#4a7c59";
const TLIT   = "#7a9e88";

/* ── Helpers ───────────────────────────────────────────── */
const card: React.CSSProperties = {
  background: "#fff", border: `1px solid ${BORDER}`,
  borderRadius: 18, boxShadow: "0 2px 12px rgba(0,0,0,.06)", overflow: "hidden",
};

const fmtDate = (s?: string | null) => {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const isOverdue = (d?: string | null) => d ? new Date(d) < new Date() : false;
const daysLeft  = (d?: string | null) => {
  if (!d) return null;
  const diff = new Date(d).getTime() - Date.now();
  const days = Math.ceil(diff / 86_400_000);
  return days;
};

type AStatus = "all" | "pending" | "submitted" | "graded" | "overdue";

/* ═══════════════════════════════════════════════════════ */
export default function StudentAssignments() {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const navigate = useNavigate();

  const [assignments, setAssignments]   = useState<any[]>([]);
  const [submissions, setSubmissions]   = useState<Record<string, any>>({});
  const [loading, setLoading]           = useState(true);
  const [filter, setFilter]             = useState<AStatus>("all");
  const [search, setSearch]             = useState("");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [subjects, setSubjects]         = useState<any[]>([]);
  const [selected, setSelected]         = useState<any | null>(null);
  const [showSubmit, setShowSubmit]     = useState(false);

  /* ── Load data ─────────────────────────────────────────── */
  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // 1. Get student level from profile
      const { data: profileData } = await supabase
        .from("profiles").select("level").eq("user_id", user.id).single();
      const studentLevel: string | null = (profileData as any)?.level || null;

      // 2. Get enrolled subject IDs
      const { data: enrollments } = await supabase
        .from("enrollments").select("subject_id").eq("user_id", user.id);
      const subjectIds = (enrollments || []).map((e: any) => e.subject_id).filter(Boolean);

      // 3. Pull from subject_timetable — only slots matching student level
      const { data: ttSlots } = await supabase
        .from("subject_timetable" as any).select("subject_id, levels").eq("is_active", true);
      const ttSubjectIds = (ttSlots || [])
        .filter((s: any) => {
          if (!s.levels || s.levels.length === 0) return true;
          if (!studentLevel) return false;
          return s.levels.includes(studentLevel);
        })
        .map((s: any) => s.subject_id)
        .filter(Boolean);

      const allSubjectIds = [...new Set([...subjectIds, ...ttSubjectIds])];

      if (allSubjectIds.length === 0) { setAssignments([]); setLoading(false); return; }

      // 4. Load assignments — include subject level for filtering
      const { data: asgn } = await supabase
        .from("subject_assignments")
        .select("*, subjects(id, title, title_ar, level, levels)")
        .in("subject_id", allSubjectIds)
        .order("deadline", { ascending: true });

      // 5. Filter by subject level restriction
      const list = (asgn || []).filter((a: any) => {
        const subj = a.subjects;
        if (!subj) return true;
        const subjLevels: string[] = subj.levels || (subj.level ? [subj.level] : []);
        if (subjLevels.length === 0) return true;
        if (!studentLevel) return false;
        return subjLevels.includes(studentLevel);
      });
      setAssignments(list);

      // Load unique subjects for filter
      const uniqueSubjects = Object.values(
        list.reduce((acc: any, a: any) => {
          if (a.subjects) acc[a.subjects.id] = a.subjects;
          return acc;
        }, {})
      );
      setSubjects(uniqueSubjects as any[]);

      // Load student's submissions for these assignments
      if (list.length > 0) {
        const assignmentIds = list.map((a: any) => a.id);
        const { data: subs } = await supabase
          .from("assignment_submissions")
          .select("*")
          .eq("user_id", user.id)
          .in("assignment_id", assignmentIds);

        const subMap: Record<string, any> = {};
        (subs || []).forEach((s: any) => { subMap[s.assignment_id] = s; });
        setSubmissions(subMap);
      }
    } catch (err) {
      console.error("Failed to load assignments:", err);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  /* ── Derived filtered list ─────────────────────────── */
  const filtered = assignments.filter(a => {
    const sub = submissions[a.id];
    const status = sub ? (sub.status === "graded" ? "graded" : "submitted")
      : isOverdue(a.deadline) ? "overdue" : "pending";

    if (filter !== "all" && filter !== status) return false;
    if (subjectFilter !== "all" && a.subject_id !== subjectFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const title = language === "ar" ? (a.title_ar || a.title) : a.title;
      if (!title?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  /* ── Stats ─────────────────────────────────────────── */
  const total     = assignments.length;
  const pending   = assignments.filter(a => !submissions[a.id] && !isOverdue(a.deadline)).length;
  const submitted = assignments.filter(a => submissions[a.id] && submissions[a.id].status !== "graded").length;
  const graded    = assignments.filter(a => submissions[a.id]?.status === "graded").length;
  const overdue   = assignments.filter(a => !submissions[a.id] && isOverdue(a.deadline)).length;

  const avgScore = (() => {
    const gradedSubs = Object.values(submissions).filter((s: any) => s.grade != null);
    if (!gradedSubs.length) return null;
    return Math.round(gradedSubs.reduce((sum: number, s: any) => sum + Number(s.grade), 0) / gradedSubs.length);
  })();

  /* ── Status chip helper ────────────────────────────── */
  const statusChip = (a: any) => {
    const sub = submissions[a.id];
    if (sub?.status === "graded") return { label: t("Graded", "مُصحَّح"), color: "#276749", bg: "#dcfce7", border: "#9ae6b4", icon: Award };
    if (sub) return { label: t("Submitted", "مُرسَل"), color: "#1d4ed8", bg: "#eff6ff", border: "#93c5fd", icon: CheckCircle };
    if (isOverdue(a.deadline)) return { label: t("Overdue", "متأخر"), color: "#c0392b", bg: "#fff5f5", border: "#fca5a5", icon: AlertTriangle };
    const dl = daysLeft(a.deadline);
    if (dl !== null && dl <= 2) return { label: t(`Due in ${dl}d`, `باقي ${dl} يوم`), color: "#b45309", bg: "#fffbeb", border: "#fde68a", icon: Clock };
    return { label: t("Pending", "قيد الانتظار"), color: TMID, bg: "#f0fdf4", border: "#86efac", icon: ClipboardList };
  };

  /* ─── Main render ──────────────────────────────────── */
  return (
    <div style={{ background: CREAM, minHeight: "100vh", fontFamily: "'Cairo', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&family=Playfair+Display:wght@500;700&display=swap');
        .asm-card { transition: box-shadow .18s, transform .18s; }
        .asm-card:hover { box-shadow: 0 8px 32px rgba(15,45,31,0.13) !important; transform: translateY(-1px); }
        .asm-btn { transition: opacity .15s, transform .12s; }
        .asm-btn:active { transform: scale(0.96); }
        .asm-tab { transition: background .15s, color .15s; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 16px 48px", display: "flex", flexDirection: "column", gap: 18 }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => navigate("/student")} style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${BORDER}`, background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ArrowLeft style={{ width: 16, height: 16, color: TXT }} />
          </button>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: TXT, margin: 0, fontFamily: "'Playfair Display', serif" }}>
              {t("My Assignments", "واجباتي")}
            </h1>
            <p style={{ fontSize: 12, color: TLIT, margin: "2px 0 0" }}>
              {t("All assignments from your classes", "جميع الواجبات من دروسك")}
            </p>
          </div>
        </div>

        {/* ── Stats row ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
          {[
            { label: t("Pending", "قيد الانتظار"),  value: pending,   color: TMID,     icon: ClipboardList,  status: "pending" as AStatus },
            { label: t("Submitted", "مُرسَل"),        value: submitted, color: "#1d4ed8", icon: CheckCircle,    status: "submitted" as AStatus },
            { label: t("Graded", "مُصحَّح"),          value: graded,    color: "#276749", icon: Award,          status: "graded" as AStatus },
            { label: t("Overdue", "متأخر"),           value: overdue,   color: "#c0392b", icon: AlertTriangle,  status: "overdue" as AStatus },
          ].map(s => (
            <div key={s.status} onClick={() => setFilter(filter === s.status ? "all" : s.status)}
              className="asm-btn"
              style={{ ...card, padding: "12px 10px", textAlign: "center", cursor: "pointer", border: `1px solid ${filter === s.status ? s.color + "55" : BORDER}`, background: filter === s.status ? s.color + "08" : "#fff" }}>
              <s.icon style={{ width: 18, height: 18, color: s.color, marginBottom: 4 }} />
              <div style={{ fontSize: 20, fontWeight: 900, color: TXT }}>{s.value}</div>
              <div style={{ fontSize: 10, fontWeight: 600, color: TLIT, lineHeight: 1.2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Avg score pill */}
        {avgScore !== null && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", background: `linear-gradient(135deg, ${G}, ${MG})`, borderRadius: 14 }}>
            <TrendingUp style={{ width: 16, height: 16, color: GOLD }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{t("Average score across graded assignments:", "متوسط درجاتك في الواجبات:")}</span>
            <span style={{ fontSize: 16, fontWeight: 900, color: GOLD }}>{avgScore}%</span>
          </div>
        )}

        {/* ── Search + Filters ── */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 180, position: "relative" }}>
            <Search style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: TLIT }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder={t("Search assignments…", "ابحث عن واجب…")}
              style={{ width: "100%", paddingLeft: 36, paddingRight: 12, height: 38, borderRadius: 10, border: `1px solid ${BORDER}`, background: "#fff", fontSize: 13, color: TXT, outline: "none", boxSizing: "border-box" }}
            />
          </div>
          <select
            value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)}
            style={{ height: 38, borderRadius: 10, border: `1px solid ${BORDER}`, background: "#fff", fontSize: 13, color: TXT, padding: "0 12px", cursor: "pointer", outline: "none" }}>
            <option value="all">{t("All Subjects", "جميع المواد")}</option>
            {subjects.map((s: any) => (
              <option key={s.id} value={s.id}>
                {language === "ar" ? (s.title_ar || s.title) : s.title}
              </option>
            ))}
          </select>
        </div>

        {/* ── Assignment list ── */}
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", border: `3px solid ${G}`, borderTopColor: "transparent", animation: "spin .7s linear infinite" }} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ ...card, padding: "48px 20px", textAlign: "center" }}>
            <ClipboardList style={{ width: 48, height: 48, color: TLIT, margin: "0 auto 12px", opacity: .4 }} />
            <p style={{ fontSize: 16, fontWeight: 700, color: TXT, margin: "0 0 4px" }}>{t("No assignments found", "لا توجد واجبات")}</p>
            <p style={{ fontSize: 13, color: TLIT, margin: 0 }}>{t("You're all caught up!", "أنت منتهٍ من كل شيء!")}</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {filtered.map(a => {
              const sub  = submissions[a.id];
              const chip = statusChip(a);
              const title = language === "ar" ? (a.title_ar || a.title) : a.title;
              const subjTitle = language === "ar" ? (a.subjects?.title_ar || a.subjects?.title) : a.subjects?.title;
              return (
                <div key={a.id} className="asm-card" style={{ ...card, cursor: "pointer" }}
                  onClick={() => { setSelected(a); setShowSubmit(false); }}>
                  <div style={{ padding: "16px 18px" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                      {/* Icon */}
                      <div style={{ width: 44, height: 44, borderRadius: 13, background: `${G}10`, border: `1px solid ${G}20`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <ClipboardList style={{ width: 20, height: 20, color: G }} />
                      </div>
                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                          <span style={{ fontSize: 15, fontWeight: 800, color: TXT }}>{title}</span>
                          <span style={{ fontSize: 10, fontWeight: 800, color: chip.color, background: chip.bg, border: `1px solid ${chip.border}`, borderRadius: 20, padding: "2px 9px", display: "flex", alignItems: "center", gap: 4 }}>
                            <chip.icon style={{ width: 10, height: 10 }} />
                            {chip.label}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 11, color: TMID, display: "flex", alignItems: "center", gap: 4 }}>
                            <BookOpen style={{ width: 11, height: 11 }} />{subjTitle}
                          </span>
                          {a.deadline && (
                            <span style={{ fontSize: 11, color: isOverdue(a.deadline) ? "#c0392b" : TLIT, display: "flex", alignItems: "center", gap: 4 }}>
                              <Calendar style={{ width: 11, height: 11 }} />
                              {fmtDate(a.deadline)}
                            </span>
                          )}
                          {sub?.grade != null && (
                            <span style={{ fontSize: 11, fontWeight: 800, color: "#276749", display: "flex", alignItems: "center", gap: 4 }}>
                              <Star style={{ width: 11, height: 11, fill: GOLD, color: GOLD }} />
                              {sub.grade}/{a.max_score ?? 100}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight style={{ width: 16, height: 16, color: TLIT, flexShrink: 0 }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Detail / Submit Modal ── */}
      {selected && (
        <AssignmentModal
          assignment={selected}
          submission={submissions[selected.id]}
          userId={user!.id}
          language={language}
          t={t}
          onClose={() => setSelected(null)}
          onSubmitted={async () => { await load(); setSelected(null); }}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   AssignmentModal — full-featured submission modal
   ═══════════════════════════════════════════════════════════════ */
function AssignmentModal({
  assignment: a, submission: existingSub, userId,
  language, t, onClose, onSubmitted,
}: {
  assignment: any; submission: any; userId: string;
  language: string; t: (en: string, ar: string) => string;
  onClose: () => void; onSubmitted: () => void;
}) {
  const [activeTab, setActiveTab]   = useState<"details" | "submit" | "feedback">("details");
  const [textInput, setTextInput]   = useState(existingSub?.text_response || "");
  const [file, setFile]             = useState<File | null>(null);
  const [uploading, setUploading]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [fileUrl, setFileUrl]       = useState<string | null>(null);
  const [comments, setComments]     = useState<any[]>([]);
  const [commentText, setCommentText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  /* Audio recorder */
  const [recording, setRecording]       = useState(false);
  const [audioBlob, setAudioBlob]       = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl]         = useState<string | null>(null);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const mediaRecRef  = useRef<MediaRecorder | null>(null);
  const chunksRef    = useRef<BlobEvent["data"][]>([]);
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const [playing, setPlaying]           = useState(false);
  const audioRef     = useRef<HTMLAudioElement | null>(null);

  const title = language === "ar" ? (a.title_ar || a.title) : a.title;
  const desc  = language === "ar" ? (a.description_ar || a.description) : a.description;
  const subjTitle = language === "ar" ? (a.subjects?.title_ar || a.subjects?.title) : a.subjects?.title;
  const isGraded  = existingSub?.status === "graded";
  const submitted = !!existingSub && !["draft"].includes(existingSub?.status);
  const closed    = a.status === "closed" || (isOverdue(a.deadline) && submitted);

  // Load signed URL for existing attachment
  useEffect(() => {
    if (!existingSub?.file_url) return;
    getSignedUrl(existingSub.file_url, 3600).then(u => { if (u) setFileUrl(u); });
  }, [existingSub?.file_url]);

  // Load comments
  useEffect(() => {
    if (!existingSub?.id) return;
    supabase.from("assignment_comments" as any)
      .select("*, profiles(full_name, role)")
      .eq("submission_id", existingSub.id)
      .order("created_at")
      .then(({ data }) => { if (data) setComments(data); });
  }, [existingSub?.id]);

  /* ── Audio recording ───────────────────────────────── */
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach(t => t.stop());
      };
      mr.start();
      mediaRecRef.current = mr;
      setRecording(true);
      setRecordSeconds(0);
      timerRef.current = setInterval(() => setRecordSeconds(s => s + 1), 1000);
    } catch {
      setError(t("Microphone access denied.", "تم رفض الوصول إلى الميكروفون."));
    }
  };

  const stopRecording = () => {
    mediaRecRef.current?.stop();
    setRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const clearAudio = () => {
    setAudioBlob(null);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setRecordSeconds(0);
    setPlaying(false);
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { audioRef.current.play(); setPlaying(true); }
  };

  const fmtSecs = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  /* ── File upload ───────────────────────────────────── */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { setFile(f); setError(null); }
  };

  /* ── Submit ────────────────────────────────────────── */
  const handleSubmit = async () => {
    if (!textInput.trim() && !file && !audioBlob) {
      setError(t("Please provide a text answer, file, or voice recording.", "يرجى تقديم إجابة نصية أو ملف أو تسجيل صوتي."));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      let uploadedFileUrl: string | null = existingSub?.file_url || null;
      let uploadedAudioUrl: string | null = existingSub?.audio_url || null;

      // Upload file
      if (file) {
        setUploading(true);
        const ext  = file.name.split(".").pop();
        const path = `${userId}/${a.id}/file_${Date.now()}.${ext}`;
        const res  = await uploadStorageFile("subject-files" as any, path, file, { upsert: true });
        if (!res.success) { setError(res.error || "Upload failed"); setSubmitting(false); setUploading(false); return; }
        uploadedFileUrl = res.path!;
        setUploading(false);
      }

      // Upload audio
      if (audioBlob) {
        setUploading(true);
        const path = `${userId}/${a.id}/audio_${Date.now()}.webm`;
        const res  = await uploadStorageFile("subject-files" as any, path, audioBlob, { upsert: true, contentType: "audio/webm" });
        if (!res.success) { setError(res.error || "Audio upload failed"); setSubmitting(false); setUploading(false); return; }
        uploadedAudioUrl = res.path!;
        setUploading(false);
      }

      const payload: any = {
        assignment_id:  a.id,
        user_id:        userId,
        text_response:  textInput || null,
        file_url:       uploadedFileUrl,
        audio_url:      uploadedAudioUrl,
        status:         "submitted",
        is_late:        isOverdue(a.deadline),
        submitted_at:   new Date().toISOString(),
        updated_at:     new Date().toISOString(),
      };

      if (existingSub?.id) {
        await supabase.from("assignment_submissions").update(payload).eq("id", existingSub.id);
      } else {
        await supabase.from("assignment_submissions").insert(payload);
      }
      onSubmitted();
    } catch (err: any) {
      setError(err.message || "Submission failed");
    }
    setSubmitting(false);
  };

  /* ── Post comment ──────────────────────────────────── */
  const postComment = async () => {
    if (!commentText.trim() || !existingSub?.id) return;
    const { data: inserted } = await supabase
      .from("assignment_comments" as any)
      .insert({ submission_id: existingSub.id, author_id: userId, body: commentText.trim() })
      .select("*, profiles(full_name, role)")
      .single();
    if (inserted) setComments(prev => [...prev, inserted]);
    setCommentText("");
  };

  /* ── Tabs ─────────────────────────────────────────── */
  const tabs: { key: typeof activeTab; label: string }[] = [
    { key: "details", label: t("Details", "التفاصيل") },
    { key: "submit",  label: submitted ? t("My Submission", "إجابتي") : t("Submit", "إرسال") },
    ...(existingSub ? [{ key: "feedback" as const, label: t("Feedback", "التغذية الراجعة") }] : []),
  ];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.5)", backdropFilter: "blur(6px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={onClose}>
      <div style={{ width: "100%", maxWidth: 600, background: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden" }}
        onClick={e => e.stopPropagation()}>

        {/* Drag handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "#ddd" }} />
        </div>

        {/* Header */}
        <div style={{ padding: "12px 20px 14px", borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 11, color: TMID, margin: "0 0 2px", fontWeight: 700 }}>{subjTitle}</p>
              <p style={{ fontSize: 18, fontWeight: 900, color: TXT, margin: 0, lineHeight: 1.2 }}>{title}</p>
              {a.deadline && (
                <p style={{ fontSize: 11, color: isOverdue(a.deadline) ? "#c0392b" : TLIT, margin: "4px 0 0", display: "flex", alignItems: "center", gap: 4 }}>
                  <Calendar style={{ width: 11, height: 11 }} />
                  {t("Due:", "الموعد النهائي:")} {fmtDate(a.deadline)}
                  {isOverdue(a.deadline) && !existingSub && <span style={{ fontWeight: 800, color: "#c0392b" }}> — {t("OVERDUE", "متأخر")}</span>}
                </p>
              )}
            </div>
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 10, border: `1px solid ${BORDER}`, background: "#f4f4f4", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <X style={{ width: 15, height: 15, color: "#888" }} />
            </button>
          </div>

          {/* Score badge */}
          {existingSub?.grade != null && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, background: `${GOLD}18`, border: `1px solid ${GOLD}44`, borderRadius: 20, padding: "4px 12px" }}>
              <Star style={{ width: 13, height: 13, fill: GOLD, color: GOLD }} />
              <span style={{ fontSize: 13, fontWeight: 800, color: G }}>{existingSub.grade} / {a.max_score ?? 100}</span>
              <span style={{ fontSize: 11, color: TMID }}>pts</span>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className="asm-tab"
              style={{ flex: 1, padding: "12px 8px", border: "none", background: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, color: activeTab === tab.key ? G : TLIT, borderBottom: `2px solid ${activeTab === tab.key ? G : "transparent"}` }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>

          {/* ─── DETAILS tab ─────────────────────────────── */}
          {activeTab === "details" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {desc && (
                <div style={{ background: "#f8fafb", border: `1px solid ${BORDER}`, borderRadius: 14, padding: "14px 16px" }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: TLIT, margin: "0 0 6px", textTransform: "uppercase", letterSpacing: ".5px" }}>{t("Instructions", "التعليمات")}</p>
                  <p style={{ fontSize: 14, color: TXT, margin: 0, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{desc}</p>
                </div>
              )}
              {/* Attachment from teacher */}
              {a.file_url && (
                <AttachmentRow url={a.file_url} label={t("Teacher's Attachment", "مرفق المعلم")} />
              )}
              {/* Meta info */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  { label: t("Max Score", "أعلى درجة"),  value: `${a.max_score ?? 100} pts` },
                  { label: t("Subject", "المادة"),        value: subjTitle || "—" },
                  { label: t("Deadline", "الموعد"),       value: a.deadline ? fmtDate(a.deadline) : t("No deadline", "بدون موعد") },
                  { label: t("Allows", "يقبل"),           value: [a.allow_text !== false && t("Text","نص"), a.allow_file !== false && t("File","ملف"), a.allow_audio !== false && t("Audio","صوت")].filter(Boolean).join(" · ") },
                ].map((m, i) => (
                  <div key={i} style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "10px 14px" }}>
                    <p style={{ fontSize: 10, color: TLIT, margin: "0 0 3px", fontWeight: 700 }}>{m.label}</p>
                    <p style={{ fontSize: 13, color: TXT, margin: 0, fontWeight: 700 }}>{m.value}</p>
                  </div>
                ))}
              </div>
              {!submitted && !closed && (
                <button onClick={() => setActiveTab("submit")}
                  className="asm-btn"
                  style={{ width: "100%", padding: "14px", borderRadius: 14, border: "none", background: `linear-gradient(135deg, ${G}, ${MG})`, color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
                  {t("Start Submission →", "ابدأ التسليم →")}
                </button>
              )}
            </div>
          )}

          {/* ─── SUBMIT tab ──────────────────────────────── */}
          {activeTab === "submit" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {submitted && !isGraded && (
                <div style={{ background: "#eff6ff", border: "1px solid #93c5fd", borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                  <CheckCircle style={{ width: 16, height: 16, color: "#1d4ed8" }} />
                  <p style={{ fontSize: 13, fontWeight: 700, color: "#1d4ed8", margin: 0 }}>{t("Submitted! You can still update your answer.", "تم التسليم! يمكنك تحديث إجابتك.")}</p>
                </div>
              )}
              {isGraded && (
                <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                  <Award style={{ width: 16, height: 16, color: "#276749" }} />
                  <p style={{ fontSize: 13, fontWeight: 700, color: "#276749", margin: 0 }}>{t("This assignment has been graded.", "تم تصحيح هذا الواجب.")}</p>
                </div>
              )}

              {/* Text response */}
              {a.allow_text !== false && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: TLIT, display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <FileText style={{ width: 13, height: 13 }} />{t("Text Answer", "الإجابة النصية")}
                  </label>
                  <textarea
                    value={textInput}
                    onChange={e => setTextInput(e.target.value)}
                    disabled={isGraded}
                    placeholder={t("Write your answer here…", "اكتب إجابتك هنا…")}
                    rows={6}
                    style={{ width: "100%", borderRadius: 12, border: `1px solid ${BORDER}`, padding: "12px 14px", fontSize: 14, color: TXT, resize: "vertical", outline: "none", fontFamily: "'Cairo', sans-serif", background: isGraded ? "#f8f8f8" : "#fff", boxSizing: "border-box" }}
                  />
                </div>
              )}

              {/* File upload */}
              {a.allow_file !== false && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: TLIT, display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <Paperclip style={{ width: 13, height: 13 }} />{t("Attach File", "إرفاق ملف")}
                  </label>
                  <input type="file" ref={fileRef} onChange={handleFileChange} style={{ display: "none" }} accept="*/*" />
                  {existingSub?.file_url && !file && fileUrl && (
                    <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 10, padding: "10px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                      <CheckCircle style={{ width: 14, height: 14, color: "#276749" }} />
                      <a href={fileUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#276749", fontWeight: 700, flex: 1 }}>{t("Existing attachment →", "المرفق الحالي →")}</a>
                    </div>
                  )}
                  {file && (
                    <div style={{ background: "#eff6ff", border: "1px solid #93c5fd", borderRadius: 10, padding: "10px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                      <Paperclip style={{ width: 14, height: 14, color: "#1d4ed8" }} />
                      <span style={{ fontSize: 12, color: "#1d4ed8", fontWeight: 700, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</span>
                      <button onClick={() => setFile(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#888", padding: 0 }}><X style={{ width: 13, height: 13 }} /></button>
                    </div>
                  )}
                  {!isGraded && (
                    <button onClick={() => fileRef.current?.click()}
                      style={{ width: "100%", padding: "11px", borderRadius: 12, border: `2px dashed ${BORDER}`, background: "#f8fafb", cursor: "pointer", fontSize: 13, fontWeight: 700, color: TMID, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                      <Upload style={{ width: 15, height: 15 }} />
                      {t("Choose file", "اختر ملفاً")}
                    </button>
                  )}
                </div>
              )}

              {/* Audio recorder */}
              {a.allow_audio !== false && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: TLIT, display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    <Mic style={{ width: 13, height: 13 }} />{t("Voice Recording", "التسجيل الصوتي")}
                  </label>

                  {/* Existing audio */}
                  {existingSub?.audio_url && !audioBlob && (
                    <ExistingAudioPlayer url={existingSub.audio_url} label={t("Your recorded answer", "تسجيلك الصوتي")} />
                  )}

                  {/* New recording UI */}
                  {!isGraded && (
                    <div style={{ background: "#f8fafb", border: `1px solid ${BORDER}`, borderRadius: 14, padding: "16px" }}>
                      {!recording && !audioBlob && (
                        <button onClick={startRecording}
                          style={{ width: "100%", padding: "13px", borderRadius: 12, border: "none", background: `linear-gradient(135deg, #c0392b, #e74c3c)`, color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                          <Mic style={{ width: 16, height: 16 }} />
                          {t("Start Recording", "ابدأ التسجيل")}
                        </button>
                      )}
                      {recording && (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                          <div style={{ width: 60, height: 60, borderRadius: "50%", background: "rgba(192,57,43,0.1)", border: "2px solid #c0392b", display: "flex", alignItems: "center", justifyContent: "center", animation: "livePulse 1.2s infinite" }}>
                            <Mic style={{ width: 26, height: 26, color: "#c0392b" }} />
                          </div>
                          <p style={{ fontSize: 22, fontWeight: 900, color: "#c0392b", margin: 0, fontVariantNumeric: "tabular-nums" }}>{fmtSecs(recordSeconds)}</p>
                          <p style={{ fontSize: 12, color: TLIT, margin: 0 }}>{t("Recording…", "جارٍ التسجيل…")}</p>
                          <button onClick={stopRecording}
                            style={{ padding: "10px 24px", borderRadius: 12, border: "none", background: "#111", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                            <StopCircle style={{ width: 15, height: 15 }} />{t("Stop", "إيقاف")}
                          </button>
                        </div>
                      )}
                      {audioBlob && audioUrl && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          <audio ref={audioRef} src={audioUrl} onEnded={() => setPlaying(false)} style={{ display: "none" }} />
                          <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", borderRadius: 12, padding: "10px 14px", border: `1px solid ${BORDER}` }}>
                            <button onClick={togglePlay} style={{ width: 36, height: 36, borderRadius: "50%", background: G, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              {playing ? <Pause style={{ width: 15, height: 15, color: "#fff" }} /> : <Play style={{ width: 15, height: 15, color: "#fff" }} />}
                            </button>
                            <div style={{ flex: 1 }}>
                              <p style={{ fontSize: 12, fontWeight: 700, color: TXT, margin: 0 }}>{t("Recording ready", "التسجيل جاهز")}</p>
                              <p style={{ fontSize: 11, color: TLIT, margin: 0 }}>{fmtSecs(recordSeconds)}</p>
                            </div>
                            <button onClick={clearAudio} style={{ background: "none", border: "none", cursor: "pointer", color: "#999", padding: 4 }}>
                              <RotateCcw style={{ width: 14, height: 14 }} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Error */}
              {error && (
                <div style={{ background: "#fff5f5", border: "1px solid #fca5a5", borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8 }}>
                  <AlertTriangle style={{ width: 14, height: 14, color: "#c0392b" }} />
                  <p style={{ fontSize: 13, color: "#c0392b", margin: 0 }}>{error}</p>
                </div>
              )}

              {/* Submit button */}
              {!isGraded && (
                <button onClick={handleSubmit} disabled={submitting || uploading}
                  className="asm-btn"
                  style={{ width: "100%", padding: "14px", borderRadius: 14, border: "none", background: submitting ? "#ccc" : `linear-gradient(135deg, ${G}, ${MG})`, color: "#fff", fontSize: 14, fontWeight: 800, cursor: submitting ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  {submitting ? <Loader2 style={{ width: 16, height: 16, animation: "spin .7s linear infinite" }} /> : <Send style={{ width: 15, height: 15 }} />}
                  {uploading ? t("Uploading…", "جارٍ الرفع…") : submitting ? t("Submitting…", "جارٍ الإرسال…") : submitted ? t("Update Submission", "تحديث الإجابة") : t("Submit Assignment", "إرسال الواجب")}
                </button>
              )}
            </div>
          )}

          {/* ─── FEEDBACK tab ──────────────────────────── */}
          {activeTab === "feedback" && existingSub && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Grade */}
              {existingSub.grade != null && (
                <div style={{ background: `linear-gradient(135deg, ${G}, ${MG})`, borderRadius: 16, padding: "16px 20px", display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ width: 56, height: 56, borderRadius: "50%", background: GOLD, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: 18, fontWeight: 900, color: G }}>{existingSub.grade}</span>
                  </div>
                  <div>
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,.6)", margin: "0 0 2px" }}>{t("Your Score", "درجتك")}</p>
                    <p style={{ fontSize: 20, fontWeight: 900, color: "#fff", margin: 0 }}>{existingSub.grade} / {a.max_score ?? 100}</p>
                    <p style={{ fontSize: 11, color: GOLDF, margin: "2px 0 0" }}>
                      {Math.round((existingSub.grade / (a.max_score ?? 100)) * 100)}%
                    </p>
                  </div>
                </div>
              )}

              {/* Written feedback */}
              {existingSub.feedback && (
                <div style={{ background: "#f8fafb", border: `1px solid ${BORDER}`, borderRadius: 14, padding: "14px 16px" }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: TLIT, margin: "0 0 6px", textTransform: "uppercase" }}>{t("Teacher's Feedback", "ملاحظات المعلم")}</p>
                  <p style={{ fontSize: 14, color: TXT, margin: 0, lineHeight: 1.65 }}>{existingSub.feedback}</p>
                  {existingSub.graded_at && (
                    <p style={{ fontSize: 11, color: TLIT, margin: "8px 0 0" }}>{fmtDate(existingSub.graded_at)}</p>
                  )}
                </div>
              )}

              {/* Comments thread */}
              <div>
                <p style={{ fontSize: 13, fontWeight: 800, color: TXT, margin: "0 0 10px", display: "flex", alignItems: "center", gap: 6 }}>
                  <MessageSquare style={{ width: 14, height: 14, color: TMID }} />{t("Comments", "التعليقات")}
                </p>
                {comments.length === 0 ? (
                  <p style={{ fontSize: 13, color: TLIT, textAlign: "center", padding: "16px 0" }}>{t("No comments yet.", "لا توجد تعليقات بعد.")}</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {comments.map((c: any) => {
                      const isMe = c.author_id === existingSub.user_id;
                      return (
                        <div key={c.id} style={{ display: "flex", gap: 8, flexDirection: isMe ? "row-reverse" : "row" }}>
                          <div style={{ width: 28, height: 28, borderRadius: "50%", background: isMe ? G : "#f0f0f0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <span style={{ fontSize: 11, fontWeight: 800, color: isMe ? "#fff" : TXT }}>
                              {(c.profiles?.full_name || "?")[0].toUpperCase()}
                            </span>
                          </div>
                          <div style={{ maxWidth: "75%" }}>
                            <div style={{ background: isMe ? G : "#f4f4f4", borderRadius: isMe ? "14px 4px 14px 14px" : "4px 14px 14px 14px", padding: "8px 12px" }}>
                              <p style={{ fontSize: 13, color: isMe ? "#fff" : TXT, margin: 0, lineHeight: 1.5 }}>{c.body}</p>
                            </div>
                            <p style={{ fontSize: 10, color: TLIT, margin: "3px 4px 0", textAlign: isMe ? "right" : "left" }}>
                              {c.profiles?.full_name || "?"} · {fmtDate(c.created_at)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Comment input */}
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); postComment(); } }}
                  placeholder={t("Ask a question or leave a comment…", "اسأل أو اترك تعليقاً…")}
                  style={{ flex: 1, height: 40, borderRadius: 12, border: `1px solid ${BORDER}`, padding: "0 14px", fontSize: 13, color: TXT, outline: "none" }}
                />
                <button onClick={postComment} disabled={!commentText.trim()}
                  style={{ width: 40, height: 40, borderRadius: 12, border: "none", background: commentText.trim() ? G : "#ddd", cursor: commentText.trim() ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Send style={{ width: 15, height: 15, color: "#fff" }} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Small helper components ─────────────────────────── */
function AttachmentRow({ url, label }: { url: string; label: string }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  useEffect(() => { getSignedUrl(url, 3600).then(u => setSignedUrl(u)); }, [url]);
  if (!signedUrl) return null;
  return (
    <a href={signedUrl} target="_blank" rel="noopener noreferrer"
      style={{ display: "flex", alignItems: "center", gap: 10, background: "#eff6ff", border: "1px solid #93c5fd", borderRadius: 12, padding: "10px 14px", textDecoration: "none" }}>
      <Download style={{ width: 15, height: 15, color: "#1d4ed8" }} />
      <span style={{ fontSize: 13, fontWeight: 700, color: "#1d4ed8" }}>{label}</span>
    </a>
  );
}

function ExistingAudioPlayer({ url, label }: { url: string; label: string }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const ref = useRef<HTMLAudioElement | null>(null);
  useEffect(() => { getSignedUrl(url, 3600).then(u => setSignedUrl(u)); }, [url]);
  if (!signedUrl) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 12, padding: "10px 14px", marginBottom: 8 }}>
      <audio ref={ref} src={signedUrl} onEnded={() => setPlaying(false)} style={{ display: "none" }} />
      <button onClick={() => { if (playing) { ref.current?.pause(); setPlaying(false); } else { ref.current?.play(); setPlaying(true); } }}
        style={{ width: 34, height: 34, borderRadius: "50%", background: "#276749", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {playing ? <Pause style={{ width: 14, height: 14, color: "#fff" }} /> : <Play style={{ width: 14, height: 14, color: "#fff" }} />}
      </button>
      <span style={{ fontSize: 12, fontWeight: 700, color: "#276749" }}>{label}</span>
    </div>
  );
}
