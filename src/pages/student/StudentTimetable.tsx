/*
  src/pages/student/StudentTimetable.tsx — Tahleem Academy
  ──────────────────────────────────────────────────────────
  • General students  → weekly timetable from subject_timetable
  • Private students  → TWO sections:
      1. "My Weekly Classes"  — slots from private_student_timetable → subject_timetable
      2. "My Private Sessions" — one-off sessions from private_sessions
  • 12-hour time display
*/

import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePrivateStudent } from "@/hooks/usePrivateStudent";
import { Video, Calendar, BookOpen, Bell, Users, Lock, UserCheck, LayoutGrid } from "lucide-react";

const G    = "#0f2d1f";
const GM   = "#1a4731";
const GOLD = "#c9a84c";

const DAYS = [
  { index: 0, en: "Sun", ar: "أحد" },
  { index: 1, en: "Mon", ar: "إثنين" },
  { index: 2, en: "Tue", ar: "ثلاثاء" },
  { index: 3, en: "Wed", ar: "أربعاء" },
  { index: 4, en: "Thu", ar: "خميس" },
  { index: 5, en: "Fri", ar: "جمعة" },
  { index: 6, en: "Sat", ar: "سبت" },
];

const LEVEL_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  beginner:     { bg: "#f0fff4", color: "#276749", border: "#9ae6b4" },
  intermediate: { bg: "#fffbeb", color: "#b7791f", border: "#f6d860" },
  advanced:     { bg: "#f5f0ff", color: "#6b46c1", border: "#d6bcfa" },
};

function minutesUntil(timeStr: string): number {
  const now = new Date();
  const [h, m] = timeStr.split(":").map(Number);
  const t = new Date(); t.setHours(h, m, 0, 0);
  return (t.getTime() - now.getTime()) / 60_000;
}

function minutesUntilDateTime(dateStr: string, timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  const t = new Date(dateStr); t.setHours(h, m, 0, 0);
  return (t.getTime() - new Date().getTime()) / 60_000;
}

function formatCountdown(minutes: number): string {
  if (minutes <= 0) return "Now";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  return `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m`;
}

function to12hr(timeStr: string): string {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

// ─── Private Session Card (one-off dated sessions) ────────────────────────────
function PrivateSessionCard({ session, isToday, navigate }: { session: any; isToday: boolean; navigate: any }) {
  const minsLeft  = minutesUntilDateTime(session.session_date, session.start_time);
  const minsToEnd = minutesUntilDateTime(session.session_date, session.end_time);
  const isNow     = isToday && minsLeft <= 0 && minsToEnd > 0;
  const isSoon    = isToday && minsLeft > 0 && minsLeft <= 15;
  const isPast    = isToday && minsToEnd <= 0;
  const canJoin   = isNow || isSoon;

  return (
    <div style={{
      background: "#fff", borderRadius: 16,
      border: `1.5px solid ${isNow ? "#7C3AED" : isSoon ? GOLD + "80" : "#e5e7eb"}`,
      padding: "16px", display: "flex", gap: 14, alignItems: "flex-start",
      opacity: isPast ? .5 : 1,
      boxShadow: isNow ? "0 0 0 3px #7C3AED22" : "0 1px 4px rgba(0,0,0,.04)",
    }}>
      <div style={{ textAlign: "center", flexShrink: 0, minWidth: 64 }}>
        <div style={{ fontSize: 14, fontWeight: 900, color: isNow ? "#7C3AED" : G }}>{to12hr(session.start_time)}</div>
        <div style={{ fontSize: 10, color: "#d1d5db", margin: "1px 0" }}>—</div>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af" }}>{to12hr(session.end_time)}</div>
        {isNow && <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 9, background: "#F3E8FF", color: "#7C3AED", display: "block", marginTop: 5 }}>LIVE</span>}
        {isSoon && <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 9, background: "#fffbeb", color: "#b7791f", display: "block", marginTop: 5 }}>{formatCountdown(minsLeft)}</span>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: G }}>{session.subject?.title || "Private Session"}</span>
          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 9, background: "#F3E8FF", color: "#7C3AED", fontWeight: 700, border: "1px solid #D8B4FE", flexShrink: 0 }}>🔒 Private</span>
        </div>
        {session.teacher_profile?.full_name && (
          <div style={{ display: "flex", alignItems: "center", gap: 5, color: "#6b7280", fontSize: 12, marginTop: 4 }}>
            <UserCheck style={{ width: 11, height: 11 }} /> {session.teacher_profile.full_name}
          </div>
        )}
        {session.notes && <p style={{ fontSize: 11, color: "#9ca3af", margin: "6px 0 0", lineHeight: 1.5 }}>{session.notes}</p>}
        {isToday && !isNow && !isSoon && !isPast && (
          <p style={{ fontSize: 10, color: "#9ca3af", margin: "6px 0 0", display: "flex", alignItems: "center", gap: 4 }}>
            <Lock style={{ width: 9, height: 9 }} /> Opens 15 min before class
          </p>
        )}
      </div>
      {isPast ? (
        <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 700, padding: "9px 10px", flexShrink: 0 }}>Ended</span>
      ) : canJoin ? (
        <button onClick={() => session.subject_id && navigate(`/student/live-classes?subject=${session.subject_id}`)}
          style={{ display: "flex", alignItems: "center", gap: 5, padding: "9px 14px", borderRadius: 11, border: "none", background: "#7C3AED", color: "#fff", fontSize: 11, fontWeight: 800, cursor: "pointer", flexShrink: 0 }}>
          <Video style={{ width: 12, height: 12 }} /> Join
        </button>
      ) : !isToday ? (
        <div style={{ fontSize: 10, color: "#9ca3af", flexShrink: 0, textAlign: "center" }}>
          <Calendar style={{ width: 14, height: 14, display: "block", margin: "0 auto 2px", color: "#d1d5db" }} />
          {formatDate(session.session_date)}
        </div>
      ) : (
        <div style={{ flexShrink: 0, opacity: .45 }}>
          <Lock style={{ width: 14, height: 14, color: "#9ca3af", display: "block" }} />
        </div>
      )}
    </div>
  );
}

// ─── Assigned Slot Card (weekly recurring slots from private_student_timetable) ─
function AssignedSlotCard({ slot, isSelectedToday, navigate }: { slot: any; isSelectedToday: boolean; navigate: any }) {
  const ml = isSelectedToday ? minutesUntil(slot.start_time) : Infinity;
  const me = isSelectedToday ? minutesUntil(slot.end_time)   : Infinity;
  const isNow   = isSelectedToday && ml <= 0 && me > 0;
  const isSoon  = isSelectedToday && ml > 0  && ml <= 15;
  const isPast  = isSelectedToday && me <= 0;
  const canJoin = isNow || isSoon;

  const handleJoin = async () => {
    if (slot.live_url) { window.open(slot.live_url, "_blank", "noopener"); return; }
    if (!slot.subject_id) return;
    const today = new Date().toISOString().split("T")[0];
    const { data: existing } = await supabase
      .from("live_sessions")
      .select("id")
      .eq("subject_id", slot.subject_id)
      .in("status", ["live", "scheduled", "active"])
      .order("scheduled_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!existing) {
      await supabase.from("live_sessions").insert({
        subject_id: slot.subject_id,
        topic: slot.notes || null,
        scheduled_at: `${today}T${slot.start_time}`,
        duration_minutes: slot.duration_minutes || 60,
        status: "scheduled",
        recording_enabled: true,
        chat_enabled: true,
        hand_raise_enabled: true,
        waiting_room_enabled: false,
        whiteboard_enabled: false,
      } as any);
    }
    navigate(`/student/live-classes?subject=${slot.subject_id}`);
  };

  return (
    <div style={{
      background: "#fff", borderRadius: 16,
      border: `1.5px solid ${isNow ? GM : isSoon ? GOLD + "80" : "#e5e7eb"}`,
      padding: "16px", display: "flex", gap: 14, alignItems: "flex-start",
      opacity: isPast ? .5 : 1,
      boxShadow: isNow ? `0 0 0 3px ${GM}22` : "0 1px 4px rgba(0,0,0,.04)",
    }}>
      <div style={{ textAlign: "center", flexShrink: 0, minWidth: 64 }}>
        <div style={{ fontSize: 14, fontWeight: 900, color: isNow ? GM : G }}>{to12hr(slot.start_time)}</div>
        <div style={{ fontSize: 10, color: "#d1d5db", margin: "1px 0" }}>—</div>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af" }}>{to12hr(slot.end_time)}</div>
        {isNow  && <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 9, background: "#dcfce7", color: "#16a34a", display: "block", marginTop: 5 }}>LIVE</span>}
        {isSoon && <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 9, background: "#fffbeb", color: "#b7791f", display: "block", marginTop: 5 }}>{formatCountdown(ml)}</span>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: G, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
          {slot.subjects?.title || "Class"}
        </span>
        {slot.subjects?.title_ar && (
          <p dir="rtl" style={{ fontSize: 12, color: GOLD, margin: "2px 0 0", fontFamily: "'Amiri', serif" }}>{slot.subjects.title_ar}</p>
        )}
        {slot.teacher?.full_name && (
          <div style={{ display: "flex", alignItems: "center", gap: 5, color: "#6b7280", fontSize: 12, marginTop: 5 }}>
            <Users style={{ width: 11, height: 11 }} /> {slot.teacher.full_name}
          </div>
        )}
        {slot.notes && <p style={{ fontSize: 11, color: "#9ca3af", margin: "6px 0 0", lineHeight: 1.5 }}>{slot.notes}</p>}
        {isSelectedToday && !isNow && !isSoon && !isPast && (
          <p style={{ fontSize: 10, color: "#9ca3af", margin: "6px 0 0", display: "flex", alignItems: "center", gap: 4 }}>
            <Lock style={{ width: 9, height: 9 }} /> Opens 15 min before class
          </p>
        )}
      </div>
      {isPast ? (
        <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 700, padding: "9px 10px", flexShrink: 0 }}>Ended</span>
      ) : canJoin ? (
        <button onClick={handleJoin}
          style={{ display: "flex", alignItems: "center", gap: 5, padding: "9px 14px", borderRadius: 11, border: "none", background: isNow ? G : GOLD, color: isNow ? "#fff" : G, fontSize: 11, fontWeight: 800, cursor: "pointer", flexShrink: 0 }}>
          <Video style={{ width: 12, height: 12 }} /> Join
        </button>
      ) : (
        <button onClick={() => slot.subject_id && navigate(`/student/subjects/${slot.subject_id}`)}
          style={{ display: "flex", alignItems: "center", gap: 5, padding: "9px 12px", borderRadius: 11, border: "1px solid #e5e7eb", background: "#f9fafb", color: "#6b7280", fontSize: 11, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
          <BookOpen style={{ width: 11, height: 11 }} /> View
        </button>
      )}
    </div>
  );
}

// ─── Private View ─────────────────────────────────────────────────────────────
function PrivateTimetable({ profile, navigate }: any) {
  const today      = new Date().toISOString().split("T")[0];
  const todayIndex = new Date().getDay();
  const [selectedDay, setSelectedDay] = useState(todayIndex);

  // ── 1. Assigned weekly slots from private_student_timetable ──────────────
  const { data: assignedSlots, isLoading: loadingSlots } = useQuery({
    queryKey: ["private-assigned-slots", profile?.user_id],
    queryFn: async () => {
      // Fetch the junction rows for this student
      const { data: rows, error } = await (supabase as any)
        .from("private_student_timetable")
        .select("slot_id")
        .eq("student_id", profile.user_id);

      if (error || !rows?.length) return [];

      const slotIds = rows.map((r: any) => r.slot_id);

      // Fetch the actual timetable slots
      const { data: slots } = await supabase
        .from("subject_timetable")
        .select("*, subjects(id, title, title_ar)")
        .in("id", slotIds)
        .eq("is_active", true)
        .order("day_of_week")
        .order("start_time");

      if (!slots?.length) return [];

      // Attach teacher names
      const teacherIds = [...new Set(slots.map((s: any) => s.teacher_id).filter(Boolean))];
      let teacherMap: Record<string, string> = {};
      if (teacherIds.length) {
        const { data: teachers } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", teacherIds as string[]);
        (teachers || []).forEach((t: any) => { teacherMap[t.user_id] = t.full_name; });
      }

      return slots.map((s: any) => ({
        ...s,
        teacher: s.teacher_id ? { full_name: teacherMap[s.teacher_id] || null } : null,
      }));
    },
    enabled: !!profile?.user_id,
  });

  // ── 2. One-off private sessions ──────────────────────────────────────────
  const { data: sessions, isLoading: loadingSessions } = useQuery({
    queryKey: ["private-sessions-student", profile?.user_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("private_sessions")
        .select("*, subjects(id, title, title_ar)")
        .eq("student_id", profile.user_id)
        .gte("session_date", today)
        .order("session_date").order("start_time");
      if (!data?.length) return [];
      const teacherIds = [...new Set(data.map((s: any) => s.teacher_id))];
      const { data: teachers } = await supabase.from("profiles").select("user_id, full_name").in("user_id", teacherIds);
      const tm = new Map((teachers || []).map((t: any) => [t.user_id, t]));
      return data.map((s: any) => ({ ...s, teacher_profile: tm.get(s.teacher_id) }));
    },
    enabled: !!profile?.user_id,
  });

  const isLoading = loadingSlots || loadingSessions;

  const slotsForDay   = (assignedSlots || []).filter((s: any) => s.day_of_week === selectedDay);
  const todaySessions  = (sessions || []).filter((s: any) => s.session_date === today);
  const futureSessions = (sessions || []).filter((s: any) => s.session_date > today);

  const hasWeeklySlots  = (assignedSlots || []).length > 0;
  const hasPrivateSess  = (sessions || []).length > 0;
  const hasAnything     = hasWeeklySlots || hasPrivateSess;

  if (isLoading) return <div style={{ textAlign: "center", padding: 50, color: "#9ca3af" }}>Loading…</div>;

  if (!hasAnything) {
    return (
      <div style={{ background: "#fff", borderRadius: 18, padding: "50px 20px", textAlign: "center", border: "1px solid #e5e7eb" }}>
        <Calendar style={{ width: 40, height: 40, color: "#d1d5db", margin: "0 auto 12px" }} />
        <p style={{ color: "#374151", fontSize: 14, fontWeight: 700, margin: "0 0 6px" }}>No classes scheduled yet</p>
        <p style={{ color: "#9ca3af", fontSize: 12, margin: 0 }}>Your teacher will assign your classes soon.</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>

      {/* ── Weekly Assigned Classes ── */}
      {hasWeeklySlots && (
        <div>
          <h3 style={{ fontSize: 13, fontWeight: 800, color: G, margin: "0 0 12px", display: "flex", alignItems: "center", gap: 6 }}>
            <LayoutGrid style={{ width: 14, height: 14, color: GOLD }} />
            My Weekly Classes
          </h3>

          {/* Day tabs */}
          <div style={{ display: "flex", overflowX: "auto", scrollbarWidth: "none", marginBottom: 14, background: `linear-gradient(135deg,${G},${GM})`, borderRadius: 16, padding: "12px 14px 0" }}>
            {DAYS.map(d => {
              const hasSlots = (assignedSlots || []).some((s: any) => s.day_of_week === d.index);
              const isToday  = d.index === todayIndex;
              const isSel    = d.index === selectedDay;
              return (
                <button key={d.index} onClick={() => setSelectedDay(d.index)}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 12px 10px", border: "none", background: "none", cursor: "pointer", borderBottom: isSel ? `3px solid ${GOLD}` : "3px solid transparent", flexShrink: 0 }}>
                  <span style={{ fontSize: 10, color: isToday ? GOLD : "rgba(255,255,255,.55)", fontWeight: isToday ? 800 : 400, marginBottom: 3 }}>
                    {isToday ? "Today" : d.en}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: isSel ? 900 : 500, color: isSel ? "#fff" : "rgba(255,255,255,.55)" }}>{d.index}</span>
                  {hasSlots && <div style={{ width: 5, height: 5, borderRadius: "50%", background: isSel ? GOLD : "rgba(255,255,255,.35)", marginTop: 4 }} />}
                </button>
              );
            })}
          </div>

          {slotsForDay.length === 0 ? (
            <div style={{ background: "#fff", borderRadius: 18, padding: "30px 20px", textAlign: "center", border: "1px solid #e5e7eb" }}>
              <p style={{ color: "#9ca3af", fontSize: 13, margin: 0 }}>No assigned classes on this day</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {slotsForDay.map((slot: any) => (
                <AssignedSlotCard key={slot.id} slot={slot} isSelectedToday={selectedDay === todayIndex} navigate={navigate} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Private Sessions (one-off dated) ── */}
      {hasPrivateSess && (
        <div>
          <h3 style={{ fontSize: 13, fontWeight: 800, color: G, margin: "0 0 12px", display: "flex", alignItems: "center", gap: 6 }}>
            <Lock style={{ width: 14, height: 14, color: "#7C3AED" }} />
            My Private Sessions
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {todaySessions.length > 0 && (
              <div>
                <p style={{ fontSize: 11, fontWeight: 800, color: "#22c55e", margin: "0 0 8px", display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} /> Today
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {todaySessions.map((s: any) => <PrivateSessionCard key={s.id} session={s} isToday={true} navigate={navigate} />)}
                </div>
              </div>
            )}
            {futureSessions.length > 0 && (
              <div>
                {todaySessions.length > 0 && (
                  <p style={{ fontSize: 11, fontWeight: 800, color: "#6b7280", margin: "0 0 8px" }}>Upcoming</p>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {futureSessions.map((s: any) => <PrivateSessionCard key={s.id} session={s} isToday={false} navigate={navigate} />)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── General View ─────────────────────────────────────────────────────────────
function GeneralTimetable({ profile, hasRole, t, language, navigate, showBanner }: any) {
  const todayIndex   = new Date().getDay();
  const studentLevel = (profile as any)?.level || (profile as any)?.course_level || "beginner";
  const isPrivileged = hasRole("admin") || hasRole("teacher");
  const [selectedDay, setSelectedDay] = useState(todayIndex);

  useEffect(() => {
    const iv = setInterval(() => {}, 30_000);
    return () => clearInterval(iv);
  }, []);

  const { data: allSlots, isLoading } = useQuery({
    queryKey: ["timetable-student"],
    queryFn: async () => {
      const { data: slots, error } = await supabase
        .from("subject_timetable")
        .select(`*, subjects(id, title, title_ar, image_url)`)
        .eq("is_active", true).order("day_of_week").order("start_time");
      if (error || !slots?.length) return [];

      const teacherIds = [...new Set(slots.map((s: any) => s.teacher_id).filter(Boolean))];
      let teacherMap: Record<string, string> = {};
      if (teacherIds.length) {
        const { data: teachers } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", teacherIds as string[]);
        (teachers || []).forEach((t: any) => { teacherMap[t.user_id] = t.full_name; });
      }

      return slots.map((s: any) => ({
        ...s,
        teacher: s.teacher_id ? { full_name: teacherMap[s.teacher_id] || null } : null,
      }));
    },
  });

  const slots = (allSlots || []).filter((s: any) => {
    if (isPrivileged) return true;
    const lvs: string[] = s.levels || [];
    return lvs.length === 0 || lvs.includes(studentLevel) || lvs.includes("all");
  });

  const slotsForDay   = slots.filter((s: any) => s.day_of_week === selectedDay);
  const upcomingToday = slots
    .filter((s: any) => s.day_of_week === todayIndex && minutesUntil(s.end_time) > 0)
    .sort((a: any, b: any) => (a.start_time > b.start_time ? 1 : -1))[0];

  const handleJoin = async (slot: any) => {
    if (slot.live_url) { window.open(slot.live_url, "_blank", "noopener"); return; }
    if (!slot.subject_id) return;
    const today2 = new Date().toISOString().split("T")[0];
    const { data: existing } = await supabase.from("live_sessions").select("id").eq("subject_id", slot.subject_id).in("status", ["live", "scheduled", "active"]).order("scheduled_at", { ascending: false }).limit(1).maybeSingle();
    if (!existing) {
      await supabase.from("live_sessions").insert({ subject_id: slot.subject_id, topic: slot.notes || null, scheduled_at: `${today2}T${slot.start_time}`, duration_minutes: slot.duration_minutes || 60, status: "scheduled", recording_enabled: true, chat_enabled: true, hand_raise_enabled: true, waiting_room_enabled: false, whiteboard_enabled: false } as any);
    }
    navigate(`/student/live-classes?subject=${slot.subject_id}`);
  };

  return (
    <div>
      {showBanner && (
        <div style={{ background: "#FDF4FF", border: "1px solid #D8B4FE", borderRadius: 14, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>🔓</span>
          <div>
            <p style={{ fontSize: 12, fontWeight: 800, color: "#7C3AED", margin: "0 0 2px" }}>General Access Enabled</p>
            <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>Your admin has allowed you to view the general class schedule.</p>
          </div>
        </div>
      )}

      {/* Day tabs */}
      <div style={{ display: "flex", overflowX: "auto", scrollbarWidth: "none", marginBottom: 16, background: `linear-gradient(135deg,${G},${GM})`, borderRadius: 16, padding: "12px 14px 0" }}>
        {DAYS.map(d => {
          const hasSlots = slots.some((s: any) => s.day_of_week === d.index);
          const isToday  = d.index === todayIndex;
          const isSel    = d.index === selectedDay;
          return (
            <button key={d.index} onClick={() => setSelectedDay(d.index)}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 12px 10px", border: "none", background: "none", cursor: "pointer", borderBottom: isSel ? `3px solid ${GOLD}` : "3px solid transparent", flexShrink: 0 }}>
              <span style={{ fontSize: 10, color: isToday ? GOLD : "rgba(255,255,255,.55)", fontWeight: isToday ? 800 : 400, marginBottom: 3 }}>{isToday ? t("Today", "اليوم") : (language === "ar" ? d.ar : d.en)}</span>
              <span style={{ fontSize: 13, fontWeight: isSel ? 900 : 500, color: isSel ? "#fff" : "rgba(255,255,255,.55)" }}>{d.index}</span>
              {hasSlots && <div style={{ width: 5, height: 5, borderRadius: "50%", background: isSel ? GOLD : "rgba(255,255,255,.35)", marginTop: 4 }} />}
            </button>
          );
        })}
      </div>

      {/* Next class banner */}
      {upcomingToday && selectedDay === todayIndex && (() => {
        const ml = minutesUntil(upcomingToday.start_time);
        const me = minutesUntil(upcomingToday.end_time);
        const isNow = ml <= 0 && me > 0; const isSoon = ml > 0 && ml <= 15;
        return (
          <div style={{ background: `linear-gradient(135deg,${G},${GM})`, borderRadius: 18, padding: "16px 18px", marginBottom: 16, display: "flex", alignItems: "center", gap: 14, boxShadow: "0 4px 20px rgba(15,45,31,.2)" }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(201,168,76,.2)", border: `1.5px solid ${GOLD}44`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Bell style={{ width: 22, height: 22, color: GOLD }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,.55)", margin: "0 0 2px" }}>{t("Next class", "الحصة القادمة")}</p>
              <p style={{ fontSize: 14, fontWeight: 800, color: "#fff", margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {language === "ar" ? upcomingToday.subjects?.title_ar || upcomingToday.subjects?.title : upcomingToday.subjects?.title}
              </p>
              <p style={{ fontSize: 12, color: GOLD, margin: 0, fontWeight: 700 }}>{to12hr(upcomingToday.start_time)} · {formatCountdown(ml)} {t("left", "متبقي")}</p>
            </div>
            {(isNow || isSoon) ? (
              <button onClick={() => handleJoin(upcomingToday)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 12, background: GOLD, border: "none", color: G, fontSize: 12, fontWeight: 900, cursor: "pointer" }}>
                <Video style={{ width: 14, height: 14 }} /> {t("Join", "انضمام")}
              </button>
            ) : (
              <div style={{ textAlign: "center", flexShrink: 0 }}>
                <Lock style={{ width: 14, height: 14, color: "rgba(255,255,255,.4)", display: "block", margin: "0 auto 2px" }} />
                <span style={{ fontSize: 9, color: "rgba(255,255,255,.35)", whiteSpace: "nowrap" }}>{t("Opens 15m before", "يفتح قبل 15د")}</span>
              </div>
            )}
          </div>
        );
      })()}

      {/* Slots */}
      {isLoading ? (
        <div style={{ textAlign: "center", padding: 50, color: "#9ca3af" }}>Loading…</div>
      ) : slotsForDay.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 18, padding: "50px 20px", textAlign: "center", border: "1px solid #e5e7eb" }}>
          <Calendar style={{ width: 40, height: 40, color: "#d1d5db", margin: "0 auto 12px" }} />
          <p style={{ color: "#9ca3af", fontSize: 14, margin: 0 }}>{t("No classes scheduled for this day", "لا توجد حصص في هذا اليوم")}</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {slotsForDay.map((slot: any) => {
            const ml = minutesUntil(slot.start_time), me = minutesUntil(slot.end_time);
            const isToday2 = selectedDay === todayIndex;
            const isNow = isToday2 && ml <= 0 && me > 0;
            const isSoon = isToday2 && ml > 0 && ml <= 15;
            const isPast = isToday2 && me <= 0;
            const tooEarly = isToday2 && !isNow && !isSoon && !isPast;
            const canJoin = isNow || isSoon;
            const subjectTitle = language === "ar" ? slot.subjects?.title_ar || slot.subjects?.title : slot.subjects?.title;
            return (
              <div key={slot.id} style={{ background: "#fff", borderRadius: 16, border: `1.5px solid ${isNow ? GM : isSoon ? GOLD + "80" : "#e5e7eb"}`, padding: "16px", display: "flex", gap: 14, alignItems: "flex-start", opacity: isPast ? .5 : 1, boxShadow: isNow ? `0 0 0 3px ${GM}22` : "0 1px 4px rgba(0,0,0,.04)" }}>
                <div style={{ textAlign: "center", flexShrink: 0, minWidth: 64 }}>
                  <div style={{ fontSize: 14, fontWeight: 900, color: isNow ? GM : G }}>{to12hr(slot.start_time)}</div>
                  <div style={{ fontSize: 10, color: "#d1d5db", margin: "1px 0" }}>—</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af" }}>{to12hr(slot.end_time)}</div>
                  {isNow && <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 9, background: "#dcfce7", color: "#16a34a", display: "block", marginTop: 5 }}>LIVE</span>}
                  {isSoon && <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 9, background: "#fffbeb", color: "#b7791f", display: "block", marginTop: 5 }}>{formatCountdown(ml)}</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: G, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{subjectTitle}</span>
                  {slot.subjects?.title_ar && language !== "ar" && <p dir="rtl" style={{ fontSize: 12, color: GOLD, margin: "2px 0 0", fontFamily: "'Amiri', serif" }}>{slot.subjects.title_ar}</p>}
                  {slot.teacher?.full_name && <div style={{ display: "flex", alignItems: "center", gap: 5, color: "#6b7280", fontSize: 12, marginTop: 5 }}><Users style={{ width: 11, height: 11 }} /> {slot.teacher.full_name}</div>}
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 7 }}>
                    {(slot.levels || []).length === 0 ? <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 9, background: "#f0fff4", color: "#22c55e", fontWeight: 700 }}>{t("All Levels", "جميع المستويات")}</span>
                      : (slot.levels || []).map((lv: string) => { const lc = LEVEL_COLORS[lv] || LEVEL_COLORS.beginner; return <span key={lv} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 9, fontWeight: 700, ...lc }}>{lv}</span>; })}
                  </div>
                  {slot.notes && <p style={{ fontSize: 11, color: "#9ca3af", margin: "6px 0 0", lineHeight: 1.5 }}>{slot.notes}</p>}
                  {tooEarly && <p style={{ fontSize: 10, color: "#9ca3af", margin: "6px 0 0", display: "flex", alignItems: "center", gap: 4 }}><Lock style={{ width: 9, height: 9 }} />{t("Opens 15 min before class", "يفتح 15 دقيقة قبل الحصة")}</p>}
                </div>
                {isPast ? <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 700, padding: "9px 10px", flexShrink: 0 }}>{t("Ended", "انتهت")}</span>
                  : canJoin ? <button onClick={() => handleJoin(slot)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "9px 14px", borderRadius: 11, border: "none", background: isNow ? G : GOLD, color: isNow ? "#fff" : G, fontSize: 11, fontWeight: 800, cursor: "pointer", flexShrink: 0 }}><Video style={{ width: 12, height: 12 }} /> {t("Join", "انضمام")}</button>
                  : tooEarly ? <div style={{ flexShrink: 0, opacity: .45 }}><Lock style={{ width: 14, height: 14, color: "#9ca3af", display: "block" }} /></div>
                  : <button onClick={() => slot.subject_id && navigate(`/student/subjects/${slot.subject_id}`)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "9px 12px", borderRadius: 11, border: "1px solid #e5e7eb", background: "#f9fafb", color: "#6b7280", fontSize: 11, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}><BookOpen style={{ width: 11, height: 11 }} /> {t("View", "عرض")}</button>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function StudentTimetable() {
  const { profile, hasRole } = useAuth();
  const { t, language }      = useLanguage();
  const navigate             = useNavigate();
  const { isPrivateStudent } = usePrivateStudent();
  const isPrivileged = hasRole("admin") || hasRole("teacher");
  const studentLevel = (profile as any)?.level || (profile as any)?.course_level || "beginner";

  return (
    <div style={{ fontFamily: "'Cairo', sans-serif", background: "#f8fafb", minHeight: "100vh" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
      `}</style>

      {/* Header */}
      <div style={{ background: `linear-gradient(135deg,${G},${GM})`, padding: "20px 18px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6 }}>
          <Calendar style={{ width: 22, height: 22, color: GOLD }} />
          <h1 style={{ fontSize: 21, fontWeight: 900, color: "#fff", margin: 0 }}>{t("My Timetable", "جدول دراستي")}</h1>
          {isPrivateStudent && (
            <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: "rgba(124,58,237,.3)", color: "#D8B4FE", fontWeight: 700, border: "1px solid rgba(216,180,254,.3)", flexShrink: 0 }}>
              🔒 Private
            </span>
          )}
        </div>

        <p style={{ fontSize: 11, color: "rgba(255,255,255,.5)", margin: 0 }}>
          {isPrivateStudent
            ? "Private student · Your assigned classes & sessions"
            : !isPrivileged
              ? `${t("Classes for your level:", "الحصص لمستواك:")} ${studentLevel}`
              : "All classes"}
        </p>
      </div>

      <div style={{ padding: "16px", maxWidth: 720, margin: "0 auto" }}>
        {isPrivateStudent ? (
          <PrivateTimetable profile={profile} navigate={navigate} />
        ) : (
          <GeneralTimetable profile={profile} hasRole={hasRole} t={t} language={language} navigate={navigate} showBanner={false} />
        )}
      </div>
    </div>
  );
}