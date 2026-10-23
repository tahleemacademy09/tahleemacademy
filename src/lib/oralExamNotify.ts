/*
  src/lib/oralExamNotify.ts — Tahleem Academy
  ────────────────────────────────────────────────────────────────────────────
  Fires when a student books (or is allocated) an oral exam slot — notifies
  the exam's creating teacher AND every admin, so a booking never sits
  unnoticed until someone happens to open Manage. Same `notifications` table
  + dispatch-trigger approach as notifyClassStarted.ts / examPublish.ts, so
  it reaches push/Telegram too, not just the in-app bell.

  Deliberately fire-and-forget: a notification failure must never block the
  booking itself.
*/
import { supabase } from "@/integrations/supabase/client";

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

export interface OralSlotBookedInfo {
  examId: string;
  examTitle: string;
  teacherId?: string | null; // exams.created_by
  studentName?: string | null;
  startAt: string; // slot start_at (ISO)
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export async function notifyOralSlotBooked(info: OralSlotBookedInfo): Promise<void> {
  try {
    const { examId, examTitle, teacherId, studentName, startAt } = info;
    const who = studentName?.trim() || "A student";
    const when = fmt(startAt);
    const title = "🎙️ Oral exam slot booked";
    const message = `${who} booked "${examTitle}" for ${when}.`;

    const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
    const adminIds = new Set<string>((admins || []).map((a: any) => a.user_id));

    const rows: Record<string, any>[] = [];
    if (teacherId) {
      rows.push({ user_id: teacherId, title, message, type: "oral_slot_booked", link: "/teacher/oral-exams", is_read: false });
      adminIds.delete(teacherId); // don't double-notify a teacher who is also an admin
    }
    adminIds.forEach((uid) => {
      rows.push({ user_id: uid, title, message, type: "oral_slot_booked", link: "/admin/oral-exams", is_read: false });
    });

    await insertNotifications(rows);
  } catch (err) {
    // Never block booking on a notification failure.
    console.warn("[notifyOralSlotBooked] failed:", err);
  }
}
