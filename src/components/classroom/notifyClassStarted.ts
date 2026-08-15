/*  src/components/classroom/notifyClassStarted.ts
    Fires ONCE when the host actually starts/joins a live class, so students get
    a notification the moment the teacher is in the room — previously the only
    class notifications were the scheduled reminder/ring (which fires on the
    timetable, not on the teacher actually showing up) and the end-of-class
    attendance nudge, so "teacher has joined" was never announced.

    Writes rows into `notifications`, which is what fans out to web push /
    Telegram server-side — so it reaches students whose app is closed too. */

import { supabase } from "@/integrations/supabase/client";

const seenKey = (sessionId: string) => `ta_class_started_notified:${sessionId}`;

export async function notifyClassStarted(
  sessionId: string,
  subject: any,
  hostUserId: string,
  hostName?: string,
): Promise<void> {
  if (!sessionId || !subject?.id) return;
  try {
    if (localStorage.getItem(seenKey(sessionId))) return;   // already announced from this device
    localStorage.setItem(seenKey(sessionId), "1");
  } catch { /* private mode — worst case a duplicate */ }

  try {
    const subjectId = subject.id;
    const teacherId = subject.teacher_id || hostUserId;

    // ── Roster: enrolled + private students + level-matched (same lookup the
    //    attendance sync uses, minus the live-participant list — nobody has
    //    joined yet at this point). ──
    const { data: courses } = await supabase.from("courses").select("id").eq("subject_id", subjectId);
    const courseIds = (courses || []).map((c: any) => c.id);
    let enrolledIds: string[] = [];
    if (courseIds.length > 0) {
      const { data: enr } = await supabase.from("enrollments").select("user_id").in("course_id", courseIds);
      enrolledIds = (enr || []).map((e: any) => e.user_id);
    }
    const { data: privateStudents } = await supabase
      .from("profiles").select("user_id").eq("assigned_teacher_id", teacherId).eq("student_type", "private");
    const privateIds = (privateStudents || []).map((p: any) => p.user_id);

    const levels: string[] = subject.levels?.length ? subject.levels : (subject.level ? [subject.level] : []);
    let levelIds: string[] = [];
    if (levels.length > 0) {
      const { data: lvl } = await supabase.from("profiles").select("user_id").in("level", levels);
      levelIds = (lvl || []).map((p: any) => p.user_id);
    }

    const recipients = [...new Set([...enrolledIds, ...privateIds, ...levelIds])]
      .filter((id) => id && id !== teacherId && id !== hostUserId);
    if (recipients.length === 0) return;

    const subjectLabel = subject.title || "Class";
    const who = hostName?.trim() ? hostName.trim() : "Your teacher";
    const link = `/student/live-classes?subjectId=${subjectId}&sessionId=${sessionId}`;

    await supabase.from("notifications").insert(
      recipients.map((userId) => ({
        user_id: userId,
        title: `${subjectLabel} is live now`,
        message: `${who} has joined the class. Tap to enter the classroom.`,
        type: "class_live_now",
        link,
        is_read: false,
      })) as any,
    );
  } catch (err) {
    // Never block the class on a notification failure.
    console.warn("[notifyClassStarted] failed:", err);
  }
}
