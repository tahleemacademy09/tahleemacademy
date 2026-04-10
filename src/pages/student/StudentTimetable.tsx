/*
  src/pages/student/StudentTimetable.tsx — Tahleem Academy
  ──────────────────────────────────────────────────────────
  Student weekly timetable view.
  • Filtered by student's assigned level
  • Shows countdown to next class
  • "Join" button → live_url OR internal classroom route
  • Today's classes highlighted
  • Background notification hook active on this page
*/

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTimetableNotifications } from "@/hooks/useTimetableNotifications";
import {
  Clock, Video, Calendar, BookOpen, ChevronRight,
  Bell, Users,
} from "lucide-react";

const G    = "#0f2d1f";
const GM   = "#1a4731";
const GOLD = "#c9a84c";

const DAYS = [
  { index: 0, en: "Sun", full: "Sunday",    ar: "أحد",      arFull: "الأحد" },
  { index: 1, en: "Mon", full: "Monday",    ar: "إثنين",    arFull: "الاثنين" },
  { index: 2, en: "Tue", full: "Tuesday",   ar: "ثلاثاء",   arFull: "الثلاثاء" },
  { index: 3, en: "Wed", full: "Wednesday", ar: "أربعاء",   arFull: "الأربعاء" },
  { index: 4, en: "Thu", full: "Thursday",  ar: "خميس",     arFull: "الخميس" },
  { index: 5, en: "Fri", full: "Friday",    ar: "جمعة",     arFull: "الجمعة" },
  { index: 6, en: "Sat", full: "Saturday",  ar: "سبت",      arFull: "السبت" },
];

const LEVEL_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  beginner:     { bg: "#f0fff4", color: "#276749", border: "#9ae6b4" },
  intermediate: { bg: "#fffbeb", color: "#b7791f", border: "#f6d860" },
  advanced:     { bg: "#f5f0ff", color: "#6b46c1", border: "#d6bcfa" },
};

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

export default function StudentTimetable() {
  const { profile, hasRole } = useAuth();
  const { t, language }     = useLanguage();
  const navigate            = useNavigate();
  const todayIndex          = new Date().getDay();

  // Activate class reminder notifications while on this page
  useTimetableNotifications();

  const studentLevel =
    (profile as any)?.level || (profile as any)?.course_level || "beginner";
  const isPrivileged = hasRole("admin") || hasRole("teacher");

  const [selectedDay, setSelectedDay] = useState(todayIndex);
  const [now, setNow]                 = useState(new Date());

  // Tick every 30 s to update countdowns
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(iv);
  }, []);

  const { data: allSlots, isLoading } = useQuery({
    queryKey: ["timetable-student"],
    queryFn: async () => {
      const { data } = await supabase
        .from("subject_timetable")
        .select(`
          *,
          subjects(id, title, title_ar, image_url),
          teacher:profiles!subject_timetable_teacher_id_fkey(full_name)
        `)
        .eq("is_active", true)
        .order("day_of_week")
        .order("start_time");
      if (!data) {
        // Fallback without join
        const { data: d2 } = await supabase
          .from("subject_timetable")
          .select("*, subjects(id, title, title_ar, image_url)")
          .eq("is_active", true)
          .order("day_of_week")
          .order("start_time");
        return d2 || [];
      }
      return data || [];
    },
    refetchInterval: 60_000,
  });

  // Filter by student's level
  const slots = (allSlots || []).filter((s: any) => {
    if (isPrivileged) return true;
    const lvs: string[] = s.levels || [];
    return lvs.length === 0 || lvs.includes(studentLevel) || lvs.includes("all");
  });

  const slotsForDay = slots.filter((s: any) => s.day_of_week === selectedDay);

  // Next upcoming class today
  const upcomingToday = slots
    .filter((s: any) => s.day_of_week === todayIndex && minutesUntil(s.start_time) > -30)
    .sort((a: any, b: any) => (a.start_time > b.start_time ? 1 : -1))[0];

  // Only the next upcoming class is joinable — all others are locked
  const isNextClass = (slot: any) =>
    upcomingToday?.id === slot.id;

  // Navigate directly to this specific subject's classroom
  const handleJoin = async (slot: any) => {
    if (!slot.subject_id) return;
    if (slot.live_url) {
      window.open(slot.live_url, "_blank", "noopener");
      return;
    }

    const today       = new Date().toISOString().split("T")[0];
    const scheduledAt = `${today}T${slot.start_time}`;

    // Find or create a session for this subject
    const { data: existing } = await supabase
      .from("live_sessions")
      .select("id, status")
      .eq("subject_id", slot.subject_id)
      .in("status", ["live", "scheduled", "active"])
      .order("scheduled_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!existing) {
      await supabase.from("live_sessions").insert({
        subject_id:           slot.subject_id,
        topic:                slot.notes || null,
        scheduled_at:         scheduledAt,
        duration_minutes:     slot.duration_minutes || 60,
        status:               "scheduled",
        recording_enabled:    true,
        chat_enabled:         true,
        hand_raise_enabled:   true,
        waiting_room_enabled: false,
        whiteboard_enabled:   false,
      } as any);
    }

    // Go directly to THIS subject's live class
    navigate(`/student/live-classes?subject=${slot.subject_id}`);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: "'Cairo', sans-serif", background: "#f8fafb", minHeight: "100vh" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      {/* ── Header ── */}
      <div style={{ background: `linear-gradient(135deg,${G},${GM})`, padding: "20px 18px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 4 }}>
          <Calendar style={{ width: 22, height: 22, color: GOLD }} />
          <h1 style={{ fontSize: 21, fontWeight: 900, color: "#fff", margin: 0 }}>
            {t("My Timetable", "جدول دراستي")}
          </h1>
        </div>
        {!isPrivileged && (
          <p style={{ fontSize: 11, color: "rgba(255,255,255,.5)", margin: "0 0 14px" }}>
            {t("Classes for your level:", "الحصص لمستواك:")} <strong style={{ color: GOLD }}>{studentLevel}</strong>
          </p>
        )}

        {/* Day selector */}
        <div style={{ display: "flex", overflowX: "auto", scrollbarWidth: "none", paddingBottom: 0 }}>
          {DAYS.map(d => {
            const hasSlots = slots.some((s: any) => s.day_of_week === d.index);
            const isToday  = d.index === todayIndex;
            const isSel    = d.index === selectedDay;
            return (
              <button key={d.index} onClick={() => setSelectedDay(d.index)}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center",
                  padding: "10px 14px 12px", border: "none", background: "none", cursor: "pointer",
                  borderBottom: isSel ? `3px solid ${GOLD}` : "3px solid transparent",
                  flexShrink: 0, transition: "all .15s", fontFamily: "'Cairo', sans-serif",
                }}>
                <span style={{ fontSize: 10, color: isToday ? GOLD : "rgba(255,255,255,.55)", fontWeight: isToday ? 800 : 400, marginBottom: 3 }}>
                  {isToday ? t("Today", "اليوم") : (language === "ar" ? d.ar : d.en)}
                </span>
                <span style={{ fontSize: 13, fontWeight: isSel ? 900 : 500, color: isSel ? "#fff" : "rgba(255,255,255,.55)" }}>
                  {d.index}
                </span>
                {hasSlots && (
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: isSel ? GOLD : "rgba(255,255,255,.35)", marginTop: 4 }} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ padding: "16px", maxWidth: 720, margin: "0 auto" }}>

        {/* ── Next class banner ── */}
        {upcomingToday && selectedDay === todayIndex && (
          <div style={{ background: `linear-gradient(135deg,${G},${GM})`, borderRadius: 18, padding: "16px 18px", marginBottom: 16, display: "flex", alignItems: "center", gap: 14, boxShadow: "0 4px 20px rgba(15,45,31,.2)", animation: "fadeUp .3s ease" }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(201,168,76,.2)", border: `1.5px solid ${GOLD}44`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Bell style={{ width: 22, height: 22, color: GOLD }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,.55)", margin: "0 0 2px" }}>
                {t("Next class", "الحصة القادمة")}
              </p>
              <p style={{ fontSize: 14, fontWeight: 800, color: "#fff", margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {language === "ar"
                  ? upcomingToday.subjects?.title_ar || upcomingToday.subjects?.title
                  : upcomingToday.subjects?.title}
              </p>
              <p style={{ fontSize: 12, color: GOLD, margin: 0, fontWeight: 700 }}>
                {upcomingToday.start_time?.slice(0, 5)} · {formatCountdown(minutesUntil(upcomingToday.start_time))} {t("left", "متبقي")}
              </p>
            </div>
            <button onClick={() => handleJoin(upcomingToday)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 12, background: GOLD, border: "none", color: G, fontSize: 12, fontWeight: 900, cursor: "pointer", flexShrink: 0, fontFamily: "'Cairo', sans-serif" }}>
              <Video style={{ width: 14, height: 14 }} />
              {t("Join", "انضمام")}
            </button>
          </div>
        )}

        {/* ── Slots for selected day ── */}
        {isLoading ? (
          <div style={{ textAlign: "center", padding: 50, color: "#9ca3af" }}>Loading…</div>
        ) : slotsForDay.length === 0 ? (
          <div style={{ background: "#fff", borderRadius: 18, padding: "50px 20px", textAlign: "center", border: "1px solid #e5e7eb" }}>
            <Calendar style={{ width: 40, height: 40, color: "#d1d5db", margin: "0 auto 12px" }} />
            <p style={{ color: "#9ca3af", fontSize: 14, margin: 0 }}>
              {t("No classes scheduled for this day", "لا توجد حصص في هذا اليوم")}
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, animation: "fadeUp .25s ease" }}>
            {slotsForDay.map((slot: any) => {
              const minsLeft     = minutesUntil(slot.start_time);
              const isNow        = minsLeft >= -30 && minsLeft <= 0;
              const isSoon       = minsLeft > 0 && minsLeft <= 15;
              const isUpcoming   = minsLeft > 0;
              const isPast       = minsLeft < -30;
              const subjectTitle = language === "ar"
                ? slot.subjects?.title_ar || slot.subjects?.title
                : slot.subjects?.title;
              const slotLevels: string[] = slot.levels || [];

              return (
                <div key={slot.id}
                  style={{
                    background: "#fff", borderRadius: 16,
                    border: `1.5px solid ${isNow ? GM : isSoon ? GOLD + "80" : "#e5e7eb"}`,
                    padding: "16px", display: "flex", gap: 14, alignItems: "flex-start",
                    opacity: isPast ? .6 : 1,
                    boxShadow: isNow ? `0 0 0 3px ${GM}22` : "0 1px 4px rgba(0,0,0,.04)",
                    animation: "fadeUp .25s ease",
                  }}>

                  {/* Time block */}
                  <div style={{ textAlign: "center", flexShrink: 0, minWidth: 58 }}>
                    <div style={{ fontSize: 16, fontWeight: 900, color: isNow ? GM : G }}>
                      {slot.start_time?.slice(0, 5)}
                    </div>
                    <div style={{ fontSize: 10, color: "#d1d5db", margin: "1px 0" }}>—</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#9ca3af" }}>
                      {slot.end_time?.slice(0, 5)}
                    </div>
                    {/* Status badge */}
                    {isNow && (
                      <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 9, background: "#dcfce7", color: "#16a34a", display: "block", marginTop: 5, animation: "pulse 1.5s infinite" }}>
                        LIVE
                      </span>
                    )}
                    {isSoon && (
                      <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 9, background: "#fffbeb", color: "#b7791f", display: "block", marginTop: 5 }}>
                        {formatCountdown(minsLeft)}
                      </span>
                    )}
                  </div>

                  {/* Subject info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: G, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {subjectTitle}
                      </span>
                    </div>

                    {slot.subjects?.title_ar && language !== "ar" && (
                      <p dir="rtl" style={{ fontSize: 12, color: GOLD, margin: "2px 0 0", fontFamily: "'Amiri', serif" }}>
                        {slot.subjects.title_ar}
                      </p>
                    )}

                    {(slot.teacher?.full_name) && (
                      <div style={{ display: "flex", alignItems: "center", gap: 5, color: "#6b7280", fontSize: 12, marginTop: 5 }}>
                        <Users style={{ width: 11, height: 11 }} />
                        {slot.teacher.full_name}
                      </div>
                    )}

                    {/* Level chips */}
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 7 }}>
                      {slotLevels.length === 0 ? (
                        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 9, background: "#f0fff4", color: "#22c55e", fontWeight: 700 }}>
                          {t("All Levels", "جميع المستويات")}
                        </span>
                      ) : slotLevels.map(lv => {
                        const lc = LEVEL_COLORS[lv] || LEVEL_COLORS.beginner;
                        return (
                          <span key={lv} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 9, fontWeight: 700, ...lc }}>
                            {lv}
                          </span>
                        );
                      })}
                    </div>

                    {slot.notes && (
                      <p style={{ fontSize: 11, color: "#9ca3af", margin: "6px 0 0", lineHeight: 1.5 }}>
                        {slot.notes}
                      </p>
                    )}
                  </div>

                  {/* Join button — only active for next upcoming class or live now */}
                  {(() => {
                    const canJoin  = isNow || (!isPast && isNextClass(slot));
                    const isLocked = !isPast && !isNow && !isNextClass(slot);
                    return (
                      <button
                        onClick={canJoin ? () => handleJoin(slot) : undefined}
                        disabled={!canJoin}
                        style={{
                          display: "flex", alignItems: "center", gap: 5,
                          padding: "9px 14px", borderRadius: 11, border: "none",
                          background: isPast    ? "#F3F4F6"
                                    : isNow     ? G
                                    : canJoin   ? GOLD
                                    : "#F3F4F6",
                          color: isPast    ? "#9CA3AF"
                               : isNow     ? "#fff"
                               : canJoin   ? G
                               : "#C4C4C4",
                          fontSize: 11, fontWeight: 800,
                          cursor: canJoin ? "pointer" : "not-allowed",
                          flexShrink: 0, fontFamily: "'Cairo', sans-serif",
                          opacity: isLocked ? 0.45 : 1,
                        }}>
                        {isLocked
                          ? <span style={{ fontSize: 12 }}>🔒</span>
                          : <Video style={{ width: 12, height: 12 }} />}
                        {isPast    ? t("Ended",  "انتهت")
                        : isLocked ? t("Locked", "مقفل")
                        : t("Join", "انضمام")}
                      </button>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Weekly overview ── */}
        <div style={{ marginTop: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: G, margin: "0 0 12px" }}>
            {t("Weekly Overview", "نظرة أسبوعية")}
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6 }}>
            {DAYS.map(d => {
              const count = slots.filter((s: any) => s.day_of_week === d.index).length;
              const isToday = d.index === todayIndex;
              return (
                <button key={d.index} onClick={() => setSelectedDay(d.index)}
                  style={{
                    background: d.index === selectedDay ? G : isToday ? "#f0fff4" : "#fff",
                    borderRadius: 12, border: `1.5px solid ${d.index === selectedDay ? G : isToday ? "#9ae6b4" : "#e5e7eb"}`,
                    padding: "10px 4px", textAlign: "center", cursor: "pointer",
                    fontFamily: "'Cairo', sans-serif",
                  }}>
                  <div style={{ fontSize: 9, color: d.index === selectedDay ? "rgba(255,255,255,.7)" : isToday ? "#22c55e" : "#9ca3af", fontWeight: 700, marginBottom: 3 }}>
                    {language === "ar" ? d.ar : d.en}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: d.index === selectedDay ? "#fff" : isToday ? G : "#374151" }}>
                    {count}
                  </div>
                  <div style={{ fontSize: 9, color: d.index === selectedDay ? GOLD : "#9ca3af" }}>
                    {count === 1 ? t("class", "حصة") : t("classes", "حصص")}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}