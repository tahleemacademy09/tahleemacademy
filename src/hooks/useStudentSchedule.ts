/*  src/hooks/useStudentSchedule.ts

    One place for "what classes does this student have, in the term they are
    viewing". Mirrors the rules on /student/timetable so the dashboard and the
    timetable page can never disagree:

      - slots come from subject_timetable, is_active, term_id = viewing term
      - general students: slot.levels empty / "all" / includes student's level
      - private students: only slots assigned to them through
        private_student_timetable (+ their one-off private_sessions)

    useTermInfo(termId)  -> academic_terms row (name, dates, is_current)
    useStudentSchedule() -> { slots, privateSessions, isLoading }
*/
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TermInfo {
  id: string;
  term_number: number;
  name: string;
  name_ar: string | null;
  start_date: string;
  end_date: string;
  is_current: boolean;
}

export function useTermInfo(termId?: string | null) {
  return useQuery({
    queryKey: ["academic-term", termId],
    enabled: !!termId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("academic_terms")
        .select("id, term_number, name, name_ar, start_date, end_date, is_current")
        .eq("id", termId)
        .maybeSingle();
      return (data ?? null) as TermInfo | null;
    },
  });
}

/** Same level rule the Timetable page uses. */
export const slotMatchesLevel = (slot: any, level: string) => {
  const lvs: string[] = slot?.levels || [];
  return lvs.length === 0 || lvs.includes(level) || lvs.includes("all");
};

const teacherNames = async (slots: any[]) => {
  const ids = [
    ...new Set(
      slots
        .flatMap((s: any) =>
          Array.isArray(s.teacher_ids) && s.teacher_ids.length ? s.teacher_ids : s.teacher_id ? [s.teacher_id] : [],
        )
        .filter(Boolean),
    ),
  ] as string[];
  const map: Record<string, string> = {};
  if (ids.length) {
    const { data } = await supabase.from("profiles").select("user_id, full_name").in("user_id", ids);
    (data || []).forEach((p: any) => { map[p.user_id] = p.full_name; });
  }
  return slots.map((s: any) => {
    const sid: string[] =
      Array.isArray(s.teacher_ids) && s.teacher_ids.length ? s.teacher_ids : s.teacher_id ? [s.teacher_id] : [];
    const names = sid.map((id) => map[id]).filter(Boolean);
    return { ...s, teacher: names.length ? { full_name: names.join(", ") } : null };
  });
};

interface Options {
  userId?: string | null;
  termId?: string | null;
  level?: string | null;
  isPrivateStudent: boolean;
  enabled?: boolean;
}

export function useStudentSchedule({ userId, termId, level, isPrivateStudent, enabled = true }: Options) {
  const studentLevel = level || "beginner"; // same default as the Timetable page

  const slotsQ = useQuery({
    queryKey: ["student-schedule", "slots", userId, termId, isPrivateStudent, studentLevel],
    enabled: enabled && !!userId && !!termId,
    refetchInterval: 120_000,
    queryFn: async () => {
      if (isPrivateStudent) {
        const { data: rows } = await (supabase as any)
          .from("private_student_timetable").select("slot_id").eq("student_id", userId);
        const slotIds = (rows || []).map((r: any) => r.slot_id);
        if (!slotIds.length) return [];
        const { data: slots } = await (supabase as any)
          .from("subject_timetable")
          .select("*, subjects(id, title, title_ar, image_url)")
          .in("id", slotIds).eq("is_active", true).eq("term_id", termId)
          .order("day_of_week").order("start_time");
        return teacherNames(slots || []);
      }
      const { data: slots } = await (supabase as any)
        .from("subject_timetable")
        .select("*, subjects(id, title, title_ar, image_url)")
        .eq("is_active", true).eq("term_id", termId)
        .order("day_of_week").order("start_time");
      return teacherNames((slots || []).filter((s: any) => slotMatchesLevel(s, studentLevel)));
    },
  });

  const sessionsQ = useQuery({
    queryKey: ["student-schedule", "private-sessions", userId],
    enabled: enabled && !!userId && isPrivateStudent,
    refetchInterval: 120_000,
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const { data } = await (supabase as any)
        .from("private_sessions")
        .select("*, subjects(id, title, title_ar)")
        .eq("student_id", userId).gte("session_date", today)
        .order("session_date").order("start_time");
      return data || [];
    },
  });

  return {
    slots: (slotsQ.data || []) as any[],
    privateSessions: (sessionsQ.data || []) as any[],
    isLoading: slotsQ.isLoading || (isPrivateStudent && sessionsQ.isLoading),
    isError: slotsQ.isError,
  };
}
