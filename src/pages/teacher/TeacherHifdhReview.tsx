// src/pages/teacher/TeacherHifdhReview.tsx
// Teacher review of student Hifdh recordings — mirrors HifdhAdminReview

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { audioManager } from "@/components/hifdh/audioManager";
import { Search, Play, Square, Check, X, ChevronDown, ChevronUp, Loader2, BookOpen } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const G    = "#064E3B";
const GM   = "#075E54";
const GOLD = "#C9A84C";

type FilterStatus = "all" | "pending" | "reviewed";

interface Recording {
  id: string; student_id: string; surah_name: string; surah_num: number;
  ayah_start: number; audio_url: string; ai_score: number;
  admin_score: number | null; admin_feedback: string | null;
  status: "pending" | "reviewed" | "overridden"; transcript: string | null;
  word_results: { word: string; result: string }[] | null; created_at: string;
  student_name?: string; student_email?: string;
}

export default function TeacherHifdhReview() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();

  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading]       = useState(true);
  const [filter, setFilter]         = useState<FilterStatus>("pending");
  const [search, setSearch]         = useState("");
  const [expanded, setExpanded]     = useState<string | null>(null);
  const [overrides, setOverrides]   = useState<Record<string, { score: string; feedback: string }>>({});
  const [saving, setSaving]         = useState<string | null>(null);
  const [playingId, setPlayingId]   = useState<string | null>(null);
  const [teacherId, setTeacherId]   = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setTeacherId(data.user.id);
    });
    loadRecordings();
    return () => { audioManager.stop(); };
  }, []);

  const loadRecordings = async () => {
    setLoading(true);
    try {
      // Get teacher's students
      const { data: teacherUser } = await supabase.auth.getUser();
      if (!teacherUser?.user) { setLoading(false); return; }

      const { data: subs } = await supabase.from("subjects").select("id").eq("teacher_id", teacherUser.user.id);
      const subjectIds = (subs || []).map(s => s.id);

      // Get student IDs via enrollments
      let studentIds: string[] = [];
      if (subjectIds.length > 0) {
        const { data: courses } = await supabase.from("courses").select("id").in("subject_id", subjectIds);
        const courseIds = (courses || []).map(c => c.id);
        if (courseIds.length > 0) {
          const { data: enrollments } = await supabase.from("enrollments").select("user_id").in("course_id", courseIds);
          studentIds = [...new Set((enrollments || []).map(e => e.user_id))];
        }
      }
      // Also private students
      const { data: pvt } = await supabase.from("profiles").select("user_id").eq("assigned_teacher_id", teacherUser.user.id);
      const pvtIds = (pvt || []).map(p => p.user_id);
      studentIds = [...new Set([...studentIds, ...pvtIds])];

      if (studentIds.length === 0) { setLoading(false); return; }

      // Fetch recordings for these students
      const { data } = await supabase
        .from("hifdh_recordings" as any)
        .select("*")
        .in("student_id", studentIds)
        .order("created_at", { ascending: false })
        .limit(100);

      if (!data) { setLoading(false); return; }

      // Get profiles
      const { data: profiles } = await supabase.from("profiles").select("user_id, full_name, email").in("user_id", studentIds);
      const pmap: Record<string, { name: string; email: string }> = {};
      profiles?.forEach((p: any) => { pmap[p.user_id] = { name: p.full_name ?? "Student", email: p.email ?? "" }; });

      const enriched = data.map((r: any) => ({
        ...r,
        student_name: pmap[r.student_id]?.name ?? "Student",
        student_email: pmap[r.student_id]?.email ?? "",
        word_results: typeof r.word_results === "string" ? JSON.parse(r.word_results) : r.word_results,
      }));

      setRecordings(enriched);
      const init: Record<string, { score: string; feedback: string }> = {};
      enriched.forEach((r: Recording) => {
        init[r.id] = { score: String(r.admin_score ?? r.ai_score), feedback: r.admin_feedback ?? "" };
      });
      setOverrides(init);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const playRec = (rec: Recording) => {
    if (playingId === rec.id) { audioManager.stop(); setPlayingId(null); return; }
    audioManager.play(rec.audio_url, () => setPlayingId(null), () => setPlayingId(null));
    setPlayingId(rec.id);
  };

  const saveOverride = async (rec: Recording) => {
    const ov = overrides[rec.id];
    if (!ov || !teacherId) return;
    setSaving(rec.id);
    try {
      const newScore = parseFloat(ov.score) || 0;
      const newStatus: "reviewed" | "overridden" = newScore === rec.ai_score ? "reviewed" : "overridden";
      const { error } = await supabase.from("hifdh_recordings" as any).update({
        admin_score: newScore, admin_feedback: ov.feedback,
        status: newStatus, reviewed_by: teacherId,
      }).eq("id", rec.id);
      if (!error) {
        setRecordings(prev => prev.map(r => r.id === rec.id ? { ...r, admin_score: newScore, admin_feedback: ov.feedback, status: newStatus } : r));
        toast({ title: t("✅ Review saved", "✅ تم حفظ المراجعة") });
        setExpanded(null);
      }
    } catch (e) {
      toast({ title: "Error", variant: "destructive" });
    }
    setSaving(null);
  };

  const filtered = recordings.filter(r => {
    if (filter === "pending"  && r.status !== "pending")  return false;
    if (filter === "reviewed" && r.status === "pending")  return false;
    if (search && !(r.student_name || "").toLowerCase().includes(search.toLowerCase()) &&
                  !(r.surah_name  || "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const scoreColor = (s: number) => s >= 80 ? "#16A34A" : s >= 60 ? GOLD : "#DC2626";

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400 }}>
      <Loader2 size={32} style={{ animation: "spin .8s linear infinite", color: GOLD }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#F3F4F6", fontFamily: "system-ui, sans-serif" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Header */}
      <div style={{ background: `linear-gradient(135deg, ${G}, ${GM})`, padding: "24px 20px 20px" }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: "#fff", margin: "0 0 4px", fontFamily: "'Amiri', serif" }}>
          {t("Hifdh Review", "مراجعة الحفظ")}
        </h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,.6)", margin: 0 }}>
          {t("Review your students' Quran recitation recordings", "راجع تسجيلات تلاوة طلابك")}
        </p>
      </div>

      {/* Controls */}
      <div style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", padding: "12px 20px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        {(["all", "pending", "reviewed"] as FilterStatus[]).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: "6px 16px", borderRadius: 20, fontSize: 12, fontWeight: 700,
            border: `1.5px solid ${filter === f ? G : "#E5E7EB"}`,
            background: filter === f ? G : "#fff",
            color: filter === f ? "#fff" : "#6B7280",
            cursor: "pointer",
          }}>
            {f === "all" ? t("All", "الكل") : f === "pending" ? `${t("Pending", "بانتظار")} (${recordings.filter(r => r.status === "pending").length})` : t("Reviewed", "تمت المراجعة")}
          </button>
        ))}
        <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder={t("Search by student or surah…", "ابحث بالطالب أو السورة…")}
            style={{
              paddingLeft: 30, paddingRight: 12, paddingTop: 8, paddingBottom: 8,
              borderRadius: 10, border: "1.5px solid #E5E7EB", background: "#FAFAFA",
              fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" as const,
            }}
          />
        </div>
      </div>

      {/* List */}
      <div style={{ maxWidth: 800, margin: "20px auto", padding: "0 20px 40px", display: "flex", flexDirection: "column", gap: 12 }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "64px 24px", borderRadius: 20, border: "2px dashed #E5E7EB", background: "#FAFAFA" }}>
            <BookOpen size={48} style={{ margin: "0 auto 16px", display: "block", opacity: 0.2, color: G }} />
            <p style={{ fontWeight: 700, fontSize: 16, color: "#374151", margin: "0 0 4px" }}>
              {filter === "pending" ? t("No pending reviews! 🎉", "لا توجد مراجعات معلقة! 🎉") : t("No recordings found", "لم يتم العثور على تسجيلات")}
            </p>
          </div>
        ) : filtered.map(rec => {
          const isExpanded = expanded === rec.id;
          const ov = overrides[rec.id] || { score: String(rec.ai_score), feedback: rec.admin_feedback || "" };
          const displayScore = rec.admin_score ?? rec.ai_score;
          return (
            <div key={rec.id} style={{ background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,.04)" }}>
              {/* Row */}
              <div style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }} onClick={() => setExpanded(isExpanded ? null : rec.id)}>
                {/* Avatar */}
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: G, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 900, color: "#fff", flexShrink: 0 }}>
                  {(rec.student_name || "S")[0].toUpperCase()}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: G, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {rec.student_name}
                  </div>
                  <div style={{ fontSize: 12, color: "#9CA3AF" }}>
                    {rec.surah_name} — {t("Ayah", "الآية")} {rec.ayah_start}
                    {" • "}{new Date(rec.created_at).toLocaleDateString()}
                  </div>
                </div>

                {/* Score */}
                <div style={{ textAlign: "center", flexShrink: 0 }}>
                  <div style={{ fontSize: 20, fontWeight: 900, color: scoreColor(displayScore) }}>
                    {Math.round(displayScore)}
                  </div>
                  <div style={{ fontSize: 9, color: "#9CA3AF" }}>/ 100</div>
                </div>

                {/* Status */}
                <span style={{
                  padding: "3px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700, flexShrink: 0,
                  background: rec.status === "pending" ? "#FEF9C3" : "#F0FDF4",
                  color: rec.status === "pending" ? "#854D0E" : "#16A34A",
                }}>
                  {rec.status === "pending" ? t("Pending", "معلق") : t("Reviewed", "مراجع")}
                </span>

                {/* Play */}
                <button
                  onClick={e => { e.stopPropagation(); playRec(rec); }}
                  style={{
                    width: 36, height: 36, borderRadius: "50%", border: "none",
                    background: playingId === rec.id ? "#DC2626" : G,
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}
                >
                  {playingId === rec.id ? <Square size={14} color="#fff" /> : <Play size={14} color="#fff" />}
                </button>

                {isExpanded ? <ChevronUp size={16} color="#9CA3AF" /> : <ChevronDown size={16} color="#9CA3AF" />}
              </div>

              {/* Expanded panel */}
              {isExpanded && (
                <div style={{ padding: "16px 18px", borderTop: "1px solid #F3F4F6", background: "#FAFAFA", display: "flex", flexDirection: "column", gap: 14 }}>
                  {/* Word results */}
                  {rec.word_results && rec.word_results.length > 0 && (
                    <div>
                      <p style={{ fontSize: 12, fontWeight: 700, color: G, margin: "0 0 8px" }}>{t("Word-by-word Analysis", "تحليل كلمة بكلمة")}</p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {rec.word_results.map((w, i) => (
                          <span key={i} style={{
                            padding: "4px 10px", borderRadius: 20, fontSize: 12,
                            background: w.result === "correct" ? "#F0FDF4" : w.result === "partial" ? "#FFFBEB" : "#FEF2F2",
                            color: w.result === "correct" ? "#16A34A" : w.result === "partial" ? "#D97706" : "#DC2626",
                            border: `1px solid ${w.result === "correct" ? "#86EFAC" : w.result === "partial" ? "#FDE68A" : "#FECACA"}`,
                            fontFamily: "'Amiri', serif", direction: "rtl",
                          }}>
                            {w.word}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Transcript */}
                  {rec.transcript && (
                    <div>
                      <p style={{ fontSize: 12, fontWeight: 700, color: G, margin: "0 0 4px" }}>{t("Transcript", "النص")}</p>
                      <p style={{ fontSize: 13, color: "#374151", lineHeight: 1.6, direction: "rtl", fontFamily: "'Amiri', serif", margin: 0 }}>{rec.transcript}</p>
                    </div>
                  )}

                  {/* Override score & feedback */}
                  <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>
                        {t("Teacher Score", "درجة المعلم")} (0–100)
                      </label>
                      <input
                        type="number" min={0} max={100}
                        value={ov.score}
                        onChange={e => setOverrides(o => ({ ...o, [rec.id]: { ...ov, score: e.target.value } }))}
                        style={{
                          width: "100%", padding: "8px 12px", borderRadius: 10, border: "1.5px solid #E5E7EB",
                          fontSize: 13, outline: "none", background: "#fff", boxSizing: "border-box" as const,
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>
                        {t("Feedback", "الملاحظة")}
                      </label>
                      <input
                        value={ov.feedback}
                        onChange={e => setOverrides(o => ({ ...o, [rec.id]: { ...ov, feedback: e.target.value } }))}
                        placeholder={t("Write feedback for student…", "اكتب ملاحظتك للطالب…")}
                        style={{
                          width: "100%", padding: "8px 12px", borderRadius: 10, border: "1.5px solid #E5E7EB",
                          fontSize: 13, outline: "none", background: "#fff", boxSizing: "border-box" as const,
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => saveOverride(rec)}
                      disabled={saving === rec.id}
                      style={{
                        flex: 1, padding: "10px", borderRadius: 12, border: "none",
                        background: saving === rec.id ? "#E5E7EB" : `linear-gradient(135deg, ${G}, ${GM})`,
                        color: saving === rec.id ? "#9CA3AF" : "#fff",
                        fontSize: 13, fontWeight: 700, cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      }}
                    >
                      {saving === rec.id
                        ? <><Loader2 size={14} style={{ animation: "spin .8s linear infinite" }} /> {t("Saving…", "جاري الحفظ…")}</>
                        : <><Check size={14} /> {t("Save Review", "حفظ المراجعة")}</>
                      }
                    </button>
                    <button onClick={() => setExpanded(null)} style={{
                      padding: "10px 16px", borderRadius: 12, border: "1.5px solid #E5E7EB",
                      background: "#fff", color: "#6B7280", fontSize: 13, fontWeight: 700, cursor: "pointer",
                    }}>
                      <X size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
