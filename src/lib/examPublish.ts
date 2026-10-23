/*
  src/lib/examPublish.ts — Tahleem Academy
  ────────────────────────────────────────────────────────────────────────────
  Shared by the admin Exam Manager and the teacher Exams page.

  Previously, publishing an exam only flipped `is_published` — a level tag
  set on the exam had no real effect until someone separately ran the
  "Assign" flow and picked that level again. That meant a published exam
  was effectively invisible to its intended students until a second manual
  step, and there was no notification either way.

  publishExam() now does both jobs in one action:
    - Splits `exam.level` the same way `subjects.level` already does
      (comma-separated slugs — e.g. "beginner,intermediate" — so an exam
      can target more than one level at once). An empty level still means
      "all students".
    - Upserts `exam_assignments` for every matching student immediately,
      so the exam shows up for them as soon as it's published.
    - Sends a push notification (via the `notifications` table + its
      dispatch trigger) to every newly-assigned student, and to every
      admin, so publishing an exam/test always tells the people it
      concerns rather than relying on them to check back.

  Unpublishing just flips the flag back — it never un-assigns or notifies.
*/
import { supabase } from "@/integrations/supabase/client";

export interface PublishableExam {
  id: string;
  title: string;
  type?: string | null;
  level?: string | null;
}

export function splitLevels(level?: string | null): string[] {
  return (level || "").split(",").map(l => l.trim()).filter(Boolean);
}

async function insertNotifications(rows: Record<string, any>[]) {
  if (rows.length === 0) return;
  const { error } = await supabase.from("notifications" as any).insert(rows);
  if (error) {
    // Bulk insert can fail under RLS in some setups — fall back to one at a
    // time so at least some notifications get through instead of none.
    console.warn("Bulk notification insert failed, trying individually:", error.message);
    for (const row of rows) {
      const { error: singleErr } = await supabase.from("notifications" as any).insert(row);
      if (singleErr) console.warn("Single notif insert failed:", singleErr.message);
    }
  }
}

export async function publishExam(
  exam: PublishableExam,
  publishing: boolean,
  assignedBy?: string
): Promise<{ newlyAssignedCount: number }> {
  await supabase.from("exams").update({ is_published: publishing }).eq("id", exam.id);
  if (!publishing) return { newlyAssignedCount: 0 };

  const levels = splitLevels(exam.level);
  const isTest = (exam.type || "exam") === "test";
  const kindLabel = isTest ? "Test" : "Exam";

  // Who this exam is for: matching level(s), or every student if no level was set.
  let studentIds: string[] = [];
  if (levels.length > 0) {
    const { data } = await supabase.from("profiles").select("user_id, level").in("level", levels);
    studentIds = (data || []).map((s: any) => s.user_id);
  } else {
    const { data } = await supabase.from("user_roles").select("user_id").eq("role", "student");
    studentIds = (data || []).map((s: any) => s.user_id);
  }

  let newlyAssignedCount = 0;
  if (studentIds.length > 0) {
    const { data: existing } = await supabase
      .from("exam_assignments").select("user_id").eq("exam_id", exam.id).in("user_id", studentIds);
    const already = new Set((existing || []).map((r: any) => r.user_id));
    const toAssign = studentIds.filter(id => !already.has(id));

    if (toAssign.length > 0) {
      const { error: assignErr } = await supabase.from("exam_assignments").upsert(
        toAssign.map(uid => ({ exam_id: exam.id, user_id: uid, assigned_by: assignedBy })),
        { onConflict: "exam_id,user_id" }
      );
      if (assignErr) console.warn("Publish auto-assign:", assignErr.message);
      newlyAssignedCount = toAssign.length;

      await insertNotifications(toAssign.map(uid => ({
        user_id: uid,
        title: `📝 ${kindLabel} published: ${exam.title}`,
        message: `"${exam.title}" is now available for you to take.`,
        type: "exam_assigned",
        link: "/student/exams",
        is_read: false,
      })));
    }
  }

  // Admins always hear about a publish, whether or not it produced new
  // assignments (e.g. re-publishing after edits still matters to them).
  const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
  const adminIds = Array.from(new Set((admins || []).map((a: any) => a.user_id)));
  await insertNotifications(adminIds.map(uid => ({
    user_id: uid,
    title: `📢 ${kindLabel} published`,
    message: `"${exam.title}" was published${newlyAssignedCount > 0 ? ` and assigned to ${newlyAssignedCount} student${newlyAssignedCount !== 1 ? "s" : ""}` : ""}.`,
    type: "exam_assigned",
    link: "/admin/exams",
    is_read: false,
  })));

  return { newlyAssignedCount };
}
