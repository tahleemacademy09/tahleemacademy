// src/pages/teacher/TeacherTimetable.tsx
// Teacher timetable — shows teacher's scheduled sessions with green-gold design

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAcademicLevels, getLevelConfig, getLevelDisplay } from "@/hooks/useAcademicLevels";
import { useLanguage } from "@/contexts/LanguageContext";
import { format } from "date-fns";
import { Clock, Video, Calendar, BookOpen, Plus, ChevronRight, Users, Mic, ClipboardList, MapPin } from "lucide-react";

const G    = "#0f2d1f";
const GM   = "#1a4731";
const GOLD = "#c9a84c";

const DAYS = [
  { index: 0, en: "Sun", full: "Sunday",    ar: "أحد",    arFull: "الأحد" },
  { index: 1, en: "Mon", full: "Monday",    ar: "إثنين",  arFull: "الاثنين" },
  { index: 2, en: "Tue", full: "Tuesday",   ar: "ثلاثاء", arFull: "الثلاثاء" },
  { index: 3, en: "Wed", full: "Wednesday", ar: "أربعاء", arFull: "الأربعاء" },
  { index: 4, en: "Thu", full: "Thursday",  ar: "خميس",   arFull: "الخميس" },
  { index: 5, en: "Fri", full: "Friday",    ar: "جمعة",   arFull: "الجمعة" },
  { index: 6, en: "Sat", full: "Saturday",  ar: "سبت",    arFull: "السبت" },
];

/** Convert "HH:MM:SS" → "H:MM AM/PM" */
function to12hr(timeStr: string): string {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12  = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function minutesUntil(timeStr: string): number {
  const now = new Date();
  const [h, m] = timeStr.split(":").map(Number);
  const target = new Date();
  target.setHours(h, m, 0, 0);
  return (target.getTime() - now.getTime()) / 60_000;
}

function formatCountdown(minutes: number): string {
  if (minutes <= 0) return "Now";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  return `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m`;
}

// Local calendar-date string (YYYY-MM-DD) from local fields only — never
// toISOString(), which round-trips through UTC and silently lands a day
// off in any positive-UTC-offset timezone (e.g. Africa/Lagos, UTC+1).
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// Weekday of a plain "YYYY-MM-DD" string, derived purely from its own
// digits via Date.UTC + getUTCDay (never mixed with local getters), so it
// can never disagree with the date it's labelling.
function weekdayOfDateStr(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
const WEEKDAY_SHORT_TT = [
  { en: "Sun", ar: "أحد" }, { en: "Mon", ar: "إثنين" }, { en: "Tue", ar: "ثلاثاء" },
  { en: "Wed", ar: "أربعاء" }, { en: "Thu", ar: "خميس" }, { en: "Fri", ar: "جمعة" }, { en: "Sat", ar: "سبت" },
];
const EXAM_TYPE_LABEL_TT: Record<string, { en: string; ar: string }> = {
  test: { en: "Test", ar: "اختبار قصير" }, quiz: { en: "Quiz", ar: "مسابقة" },
  mid_term: { en: "Mid-Term", ar: "امتحان منتصف الفصل" }, final: { en: "Final", ar: "امتحان نهائي" }, exam: { en: "Exam", ar: "امتحان" },
};

export default function TeacherTimetable() {
  const { user }        = useAuth();
  const { t, language } = useLanguage();
  const { data: academicLevels = [] } = useAcademicLevels();
  
  // ✅ Fixed: use "color" instead of "text" to match usage below
  const levelColors = Object.fromEntries(academicLevels.map(l => {
    const cfg = getLevelConfig(l.slug, academicLevels);
    return [l.slug, { bg: cfg.bg, color: cfg.color, border: cfg.border }];
  }));
  
  const navigate        = useNavigate();
  const todayIndex      = new Date().getDay();
  const [selectedDay, setSelectedDay] = useState(todayIndex);
  const [now, setNow]                 = useState(new Date());
  const [subjectIds, setSubjectIds]   = useState<string[]>([]);

  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (!user) return;
    const fetchIds = async () => {
      // Subject visibility comes ONLY from the admin timetable
      // (subject_timetable.teacher_id) — not from subjects.teacher_id, which
      // can be stale or set independently of what the admin has actually
      // assigned. Only active assignments count.
      const { data: ttSlots } = await supabase
        .from("subject_timetable" as any).select("subject_id").eq("teacher_id", user.id).eq("is_active", true);
      const ttIds = (ttSlots || []).map((s: any) => s.subject_id).filter(Boolean);

      setSubjectIds([...new Set(ttIds)]);
    };
    fetchIds();
  }, [user]);

  const { data: timetableSlots, isLoading: ttLoading } = useQuery({
    queryKey: ["teacher-timetable", subjectIds],
    enabled: !!user,
    queryFn: async () => {
      try {
        // subjectIds is already derived solely from subject_timetable rows
        // assigned to this teacher, so a single direct query by teacher_id
        // is both sufficient and authoritative — no need to also query by
        // subject_id, which previously let stale subjects.teacher_id rows
        // leak other teachers' slots into this list.
        const { data: byTeacher } = await supabase
          .from("subject_timetable" as any)
          .select("*, subjects(id, title, title_ar, image_url)")
          .eq("teacher_id", user!.id)
          .eq("is_active", true)
          .order("day_of_week").order("start_time");
        return byTeacher || [];
      } catch { return []; }
    },
  });

  const { data: upcomingSessions } = useQuery({
    queryKey: ["teacher-upcoming-sessions", subjectIds],
    enabled: subjectIds.length > 0,
    queryFn: async () => {
      const nowIso = new Date().toISOString();
      const { data } = await supabase.from("live_sessions")
        .select("*, subjects(title, title_ar)")
        .in("subject_id", subjectIds)
        .gte("scheduled_at", nowIso)
        .order("scheduled_at")
        .limit(10);
      return data || [];
    },
  });

  const examToday = localDateStr(new Date());
  const [selectedExamDate, setSelectedExamDate] = useState<string | null>(null);
  const { data: allExamSlots, isLoading: examLoading } = useQuery({
    queryKey: ["teacher-exam-timetable"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("exam_timetable_slots")
        .select(`*, subjects(id, title, title_ar)`)
        .eq("is_active", true)
        .gte("exam_date", examToday)
        .order("exam_date")
        .order("start_time");
      if (error) return [];
      return data || [];
    },
  });
  // Only tests that are relevant to this teacher — for one of their own
  // subjects, or a general test not tied to any single subject.
  const examSlots = (allExamSlots || []).filter((s: any) => !s.subject_id || subjectIds.includes(s.subject_id));
  const examDistinctDates = Array.from(new Set(examSlots.map((s: any) => s.exam_date))).sort() as string[];
  const examDayTabs = examDistinctDates.map(dateStr => ({
    dateStr,
    dayNum: Number(dateStr.split("-")[2]),
    weekday: WEEKDAY_SHORT_TT[weekdayOfDateStr(dateStr)],
    isToday: dateStr === examToday,
  }));
  const effectiveExamDate = (selectedExamDate && examDistinctDates.includes(selectedExamDate))
    ? selectedExamDate
    : (examDistinctDates.includes(examToday) ? examToday : examDistinctDates[0]);
  const examSlotsForDate = examSlots.filter((s: any) => s.exam_date === effectiveExamDate);


  const todaySlots    = (timetableSlots || []).filter((s: any) => s.day_of_week === todayIndex);
  const selectedSlots = (timetableSlots || []).filter((s: any) => s.day_of_week === selectedDay);

  // ❌ REMOVED: Duplicate levelColors declaration was here (lines 134-138)

  if (ttLoading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400 }}>
      <div style={{ width: 32, height: 32, borderRadius: "50%", border: `4px solid ${GOLD}`, borderTopColor: "transparent", animation: "spin .8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#F3F4F6", fontFamily: "system-ui, sans-serif" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Header */}      <div style={{ background: `linear-gradient(135deg, ${G} 0%, ${GM} 100%)`, padding: "24px 20px 70px", position: "relative" }}>
        <div style={{ position: "absolute", top: -30, right: -30, width: 150, height: 150, borderRadius: "50%", background: "rgba(201,168,76,.08)" }} />
        <h1 style={{ fontSize: 22, fontWeight: 900, color: "#fff", margin: "0 0 4px" }}>
          {t("My Timetable", "جدولي الدراسي")}
        </h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,.6)", margin: 0 }}>
          {format(now, "EEEE, MMMM d")}
        </p>

        {/* Today's classes quick view */}
        {todaySlots.length > 0 && (
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            {todaySlots.slice(0, 2).map((slot: any) => {
              const mins  = minutesUntil(slot.start_time);
              const isNow = mins <= 0 && mins > -slot.duration_minutes;
              return (
                <div key={slot.id} style={{
                  padding: "10px 14px", borderRadius: 12,
                  background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.15)",
                  display: "flex", alignItems: "center", gap: 12,
                }}>
                  <Video size={16} color={GOLD} />
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>
                      {language === "ar" ? slot.subjects?.title_ar || slot.subjects?.title : slot.subjects?.title}
                    </span>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,.6)", marginLeft: 8 }}>
                      {to12hr(slot.start_time)} — {to12hr(slot.end_time)}
                    </span>
                  </div>
                  {isNow ? (
                    <span style={{ padding: "3px 10px", borderRadius: 20, background: "#DC2626", color: "#fff", fontSize: 10, fontWeight: 900 }}>LIVE</span>
                  ) : mins > 0 && mins < 120 ? (
                    <span style={{ fontSize: 11, color: GOLD, fontWeight: 700 }}>{formatCountdown(mins)}</span>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Day selector */}
      <div style={{ position: "relative", zIndex: 1, margin: "-40px 16px 0", display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
        {DAYS.map(day => {
          const isToday    = day.index === todayIndex;
          const isSelected = day.index === selectedDay;
          const hasClass   = (timetableSlots || []).some((s: any) => s.day_of_week === day.index);
          return (
            <button key={day.index} onClick={() => setSelectedDay(day.index)} style={{              flexShrink: 0, width: 52, padding: "10px 0",
              borderRadius: 14, border: "none", cursor: "pointer",
              background: isSelected ? GOLD : "#fff",
              boxShadow: isSelected ? `0 4px 16px rgba(201,168,76,.35)` : "0 2px 8px rgba(0,0,0,.08)",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
              transition: "all .2s",
            }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: isSelected ? G : "#9CA3AF", textTransform: "uppercase" }}>
                {language === "ar" ? day.ar : day.en}
              </span>
              <span style={{ fontSize: 15, fontWeight: 900, color: isSelected ? G : isToday ? GOLD : G }}>
                {isToday ? "•" : ""}
              </span>
              {hasClass && <div style={{ width: 4, height: 4, borderRadius: "50%", background: isSelected ? G : GOLD }} />}
            </button>
          );
        })}
      </div>

      {/* Selected day content */}
      <div style={{ padding: "16px 20px", maxWidth: 700, margin: "0 auto" }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, color: G, marginBottom: 12 }}>
          {language === "ar" ? DAYS[selectedDay].arFull : DAYS[selectedDay].full}
          {selectedDay === todayIndex && (
            <span style={{ marginLeft: 8, fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "#F0FDF4", color: "#16A34A", fontWeight: 700 }}>
              {t("Today", "اليوم")}
            </span>
          )}
        </h2>

        {selectedSlots.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 24px", borderRadius: 20, border: "2px dashed #E5E7EB", background: "#FAFAFA" }}>
            <Calendar size={40} style={{ margin: "0 auto 12px", display: "block", opacity: 0.2, color: G }} />
            <p style={{ color: "#9CA3AF", fontSize: 14 }}>
              {t("No classes scheduled", "لا توجد حصص مجدولة")}
            </p>
            <button onClick={() => navigate("/teacher/classes")} style={{
              marginTop: 12, padding: "8px 16px", borderRadius: 10, background: G,
              color: "#fff", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700,
            }}>
              + {t("Schedule a class", "جدولة حصة")}
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {selectedSlots
              .sort((a: any, b: any) => a.start_time.localeCompare(b.start_time))
              .map((slot: any) => {
                const lc = levelColors[slot.level as string] || { bg: "#F3F4F6", color: "#374151", border: "#D1D5DB" };
                const mins   = selectedDay === todayIndex ? minutesUntil(slot.start_time) : 9999;                const isLive = mins <= 0 && mins > -(slot.duration_minutes || 60);
                const isSoon = mins > 0 && mins < 60;
                return (
                  <div key={slot.id} style={{
                    background: "#fff", borderRadius: 18,
                    border: `1.5px solid ${isLive ? GOLD : lc.border}`,
                    overflow: "hidden",
                    boxShadow: isLive ? `0 0 0 3px ${GOLD}30` : "0 1px 6px rgba(0,0,0,.04)",
                    transition: "all .2s",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 18px" }}>
                      {/* Time column */}
                      <div style={{ textAlign: "center", flexShrink: 0, width: 68 }}>
                        <div style={{ fontSize: 14, fontWeight: 900, color: isLive ? GOLD : G }}>
                          {to12hr(slot.start_time)}
                        </div>
                        <div style={{ fontSize: 10, color: "#9CA3AF" }}>
                          {to12hr(slot.end_time)}
                        </div>
                        {isLive && <div style={{ fontSize: 9, fontWeight: 900, color: "#DC2626", marginTop: 2 }}>LIVE</div>}
                        {isSoon && !isLive && <div style={{ fontSize: 9, color: GOLD, fontWeight: 700 }}>{formatCountdown(mins)}</div>}
                      </div>

                      {/* Divider */}
                      <div style={{ width: 2, height: 50, borderRadius: 1, background: lc.border, flexShrink: 0 }} />

                      {/* Subject info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <BookOpen size={14} color={G} />
                          <span style={{ fontWeight: 800, fontSize: 14, color: G, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {language === "ar" ? slot.subjects?.title_ar || slot.subjects?.title : slot.subjects?.title}
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: lc.bg, color: lc.color, border: `1px solid ${lc.border}` }}>
                            {slot.level || "all"}
                          </span>
                          {slot.session_type && (
                            <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: "#F3F4F6", color: "#6B7280" }}>
                              {slot.session_type}
                            </span>
                          )}
                          {slot.duration_minutes && (
                            <span style={{ fontSize: 11, color: "#9CA3AF", display: "flex", alignItems: "center", gap: 3 }}>
                              <Clock size={10} /> {slot.duration_minutes}m
                            </span>
                          )}
                        </div>
                      </div>
                      {/* Action */}
                      <button onClick={() => navigate("/teacher/classes")} style={{
                        padding: "8px 14px", borderRadius: 10, border: "none",
                        background: isLive ? GOLD : G, color: isLive ? G : "#fff",
                        fontSize: 12, fontWeight: 800, cursor: "pointer", flexShrink: 0,
                        display: "flex", alignItems: "center", gap: 5,
                      }}>
                        {isLive ? "Join" : "View"}
                        <ChevronRight size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        )}

        {/* Upcoming live sessions */}
        {(upcomingSessions || []).length > 0 && (
          <div style={{ marginTop: 24 }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: G, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
              <Video size={16} color={GOLD} />
              {t("Upcoming Sessions", "الجلسات القادمة")}
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {(upcomingSessions || []).slice(0, 5).map((s: any) => (
                <div key={s.id} style={{
                  background: "#fff", borderRadius: 14, border: "1px solid #E5E7EB",
                  padding: "14px 16px", display: "flex", alignItems: "center", gap: 14,
                  boxShadow: "0 1px 4px rgba(0,0,0,.04)",
                }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Video size={16} color="#2563EB" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 700, fontSize: 13, color: G, margin: 0 }}>
                      {language === "ar" ? s.subjects?.title_ar || s.subjects?.title : s.subjects?.title}
                    </p>
                    {s.topic && <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>{s.topic}</p>}
                    <p style={{ fontSize: 11, color: GOLD, margin: "2px 0 0", fontWeight: 600 }}>
                      {s.scheduled_at ? format(new Date(s.scheduled_at), "EEE, MMM d 'at' h:mm a") : ""}
                    </p>
                  </div>
                  <button onClick={() => navigate("/teacher/classes")} style={{
                    padding: "6px 12px", borderRadius: 8, background: G,
                    color: "#fff", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700,
                  }}>
                    {t("Open", "فتح")}
                  </button>                </div>
              ))}
            </div>
          </div>
        )}
        {/* Exam & Test Schedule — tests for subjects this teacher teaches,
            plus any general test not tied to one subject */}
        <div style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: G, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <ClipboardList size={16} color={GOLD} />
            {t("Exam & Test Schedule", "جدول الامتحانات والاختبارات")}
          </h2>

          {examLoading ? (
            <div style={{ textAlign: "center", padding: 24, color: "#9CA3AF", fontSize: 12 }}>{t("Loading…", "جارٍ التحميل…")}</div>
          ) : examDistinctDates.length === 0 ? (
            <div style={{ background: "#fff", borderRadius: 16, padding: "20px 16px", textAlign: "center", border: "1px solid #E5E7EB" }}>
              <p style={{ color: "#9CA3AF", fontSize: 12, margin: 0 }}>{t("No exams or tests scheduled right now.", "لا توجد امتحانات أو اختبارات مجدولة حالياً.")}</p>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", overflowX: "auto", scrollbarWidth: "none", marginBottom: 12, background: `linear-gradient(135deg,${G},${GM})`, borderRadius: 16, padding: "10px 12px 0" }}>
                {examDayTabs.map(d => {
                  const isSel = d.dateStr === effectiveExamDate;
                  return (
                    <button key={d.dateStr} onClick={() => setSelectedExamDate(d.dateStr)}
                      style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "7px 11px 9px", border: "none", background: "none", cursor: "pointer", borderBottom: isSel ? `3px solid ${GOLD}` : "3px solid transparent", flexShrink: 0 }}>
                      <span style={{ fontSize: 10, color: d.isToday ? GOLD : "rgba(255,255,255,.55)", fontWeight: d.isToday ? 800 : 400, marginBottom: 3 }}>
                        {language === "ar" ? d.weekday.ar : d.weekday.en}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: isSel ? 900 : 500, color: isSel ? "#fff" : "rgba(255,255,255,.55)" }}>{d.dayNum}</span>
                      {d.isToday && <div style={{ width: 5, height: 5, borderRadius: "50%", background: isSel ? GOLD : "rgba(255,255,255,.35)", marginTop: 4 }} />}
                    </button>
                  );
                })}
              </div>

              {examSlotsForDate.length === 0 ? (
                <div style={{ background: "#fff", borderRadius: 16, padding: "20px 16px", textAlign: "center", border: "1px solid #E5E7EB" }}>
                  <p style={{ color: "#9CA3AF", fontSize: 12, margin: 0 }}>{t("No exams or tests scheduled for this day.", "لا توجد امتحانات أو اختبارات مجدولة في هذا اليوم.")}</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {examSlotsForDate.map((s: any) => {
                    const typeInfo = EXAM_TYPE_LABEL_TT[s.exam_type] || { en: s.exam_type, ar: s.exam_type };
                    const title = language === "ar" ? (s.title_ar || s.title) : s.title;
                    return (
                      <div key={s.id} style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #E5E7EB", padding: 16, display: "flex", gap: 14, alignItems: "flex-start" }}>
                        <div style={{ textAlign: "center", flexShrink: 0, minWidth: 64 }}>
                          <div style={{ fontSize: 13, fontWeight: 900, color: G }}>{to12hr(s.start_time)}</div>
                          <div style={{ fontSize: 10, color: "#D1D5DB", margin: "1px 0" }}>—</div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF" }}>{to12hr(s.end_time)}</div>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 14, fontWeight: 800, color: G }}>{title}</span>
                            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 9, background: "#FFFBEB", color: "#B7791F", fontWeight: 700, border: "1px solid #F6D860" }}>
                              {language === "ar" ? typeInfo.ar : typeInfo.en}
                            </span>
                          </div>
                          {s.subjects?.title && (
                            <div style={{ display: "flex", alignItems: "center", gap: 5, color: "#6B7280", fontSize: 12, marginTop: 4 }}>
                              <BookOpen size={11} /> {language === "ar" ? (s.subjects.title_ar || s.subjects.title) : s.subjects.title}
                            </div>
                          )}
                          {s.venue && (
                            <div style={{ display: "flex", alignItems: "center", gap: 5, color: "#6B7280", fontSize: 12, marginTop: 4 }}>
                              <MapPin size={11} /> {s.venue}
                            </div>
                          )}
                          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 7 }}>
                            {(s.levels || []).length === 0
                              ? <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 9, background: "#F0FFF4", color: "#22C55E", fontWeight: 700 }}>{t("All Levels", "جميع المستويات")}</span>
                              : (s.levels || []).map((lv: string) => {
                                  const lc = levelColors[lv] || { bg: "#F3F4F6", color: "#374151", border: "#D1D5DB" };
                                  return <span key={lv} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 9, fontWeight: 700, background: lc.bg, color: lc.color }}>{lv}</span>;
                                })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}