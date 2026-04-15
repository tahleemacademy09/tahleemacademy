/*
  useTimetableNotifications.ts — Tahleem Academy
  ─────────────────────────────────────────────────
  Runs every 60 s in the background.
  • 15-min warning: "Class starting in 15 min"
  • 5-min  warning: "Class starts in 5 min — join now!"
  • 12-hour time format in messages
  • Inserts notification for the student AND the subject's teacher
  • Attempts optional WhatsApp reminder via edge function (non-blocking)
  • localStorage + DB dual dedup to survive Android minimize / refresh
*/
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const CHECK_INTERVAL_MS = 60_000;
const THRESHOLDS = [15, 5] as const;   // minutes before class to fire

// ── 12-hour time formatter ────────────────────────────────────────────────────
function to12hr(timeStr: string): string {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12  = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

// ── localStorage dedup key ────────────────────────────────────────────────────
function sentKey(slotId: string, threshold: number): string {
  const today = new Date().toISOString().slice(0, 10);
  return `tt-notif:${slotId}:${threshold}:${today}`;
}

function alreadySentLocally(slotId: string, threshold: number): boolean {
  try   { return localStorage.getItem(sentKey(slotId, threshold)) === "1"; }
  catch { return false; }
}

function markSentLocally(slotId: string, threshold: number) {
  try {
    localStorage.setItem(sentKey(slotId, threshold), "1");
    pruneOldKeys();
  } catch {}
}

function pruneOldKeys() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const toDelete: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith("tt-notif:") && !k.includes(`:${today}`)) toDelete.push(k);
    }
    toDelete.forEach(k => localStorage.removeItem(k));
  } catch {}
}

// ── DB dedup ──────────────────────────────────────────────────────────────────
async function alreadySentToDB(userId: string, slotId: string, threshold: number): Promise<boolean> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const tag = `${slotId}:${threshold}`;
  const { data } = await supabase
    .from("notifications")
    .select("id")
    .eq("user_id", userId)
    .eq("type", "class_reminder")
    .ilike("link", `%${tag}%`)
    .gte("created_at", todayStart.toISOString())
    .limit(1);
  return (data?.length ?? 0) > 0;
}

function minutesUntil(timeStr: string): number {
  const now = new Date();
  const [h, m] = timeStr.split(":").map(Number);
  const slot = new Date();
  slot.setHours(h, m, 0, 0);
  return (slot.getTime() - now.getTime()) / 60_000;
}

export function useTimetableNotifications() {
  const { user, profile } = useAuth();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user || !profile) return;

    const studentLevel: string =
      (profile as any).level || (profile as any).course_level || "beginner";

    const check = async () => {
      const todayIndex = new Date().getDay();

      const { data: slots, error } = await supabase
        .from("subject_timetable")
        .select(`
          id, subject_id, start_time, end_time, levels, live_url,
          subjects(title, title_ar, teacher_id)
        `)
        .eq("day_of_week", todayIndex)
        .eq("is_active", true);

      if (error || !slots) return;

      for (const slot of slots as any[]) {
        // ── Level filter ─────────────────────────────────────────────────────
        const slotLevels: string[] = slot.levels || [];
        const visibleToMe =
          slotLevels.length === 0 ||
          slotLevels.includes(studentLevel) ||
          slotLevels.includes("all");
        if (!visibleToMe) continue;

        const minsLeft     = minutesUntil(slot.start_time);
        const time12       = to12hr(slot.start_time);
        const subjectTitle = slot.subjects?.title_ar || slot.subjects?.title || "class";
        const teacherId    = slot.subjects?.teacher_id || null;

        for (const threshold of THRESHOLDS) {
          // ── Check if this threshold window applies ─────────────────────────
          if (minsLeft < 0 || minsLeft > threshold) continue;
          // But don't fire a 5-min alert for something already fired at 15-min
          // that is now within 5 min — check exact bucket (threshold - 2 … threshold)
          if (threshold === 5  && minsLeft > 6)  continue;
          if (threshold === 15 && minsLeft > 16) continue;

          // ── Fast local dedup ──────────────────────────────────────────────
          if (alreadySentLocally(slot.id, threshold)) continue;

          // ── DB dedup ──────────────────────────────────────────────────────
          const sentInDB = await alreadySentToDB(user.id, slot.id, threshold);
          if (sentInDB) { markSentLocally(slot.id, threshold); continue; }

          const minsDisplay = Math.round(minsLeft);
          const link        = slot.live_url
            ? `${slot.live_url}?slot=${slot.id}:${threshold}`
            : `/student/courses?slot=${slot.id}:${threshold}`;

          const title   = threshold === 5
            ? `Class starts in 5 min — join now!`
            : `Class starting in ${minsDisplay} min`;
          const message = `${subjectTitle} starts at ${time12}. ${threshold === 5 ? "Tap to join!" : "Get ready!"}`;

          // ── Insert student notification ───────────────────────────────────
          const { error: insErr } = await supabase.from("notifications").insert({
            user_id: user.id,
            title,
            message,
            type:    "class_reminder",
            link,
            is_read: false,
          });

          if (insErr) {
            console.error("[useTimetableNotifications] insert error:", insErr.message);
            continue;
          }

          // ── Insert teacher notification (non-blocking) ────────────────────
          if (teacherId && teacherId !== user.id) {
            supabase.from("notifications").insert({
              user_id: teacherId,
              title:   `Your class starts in ${minsDisplay} min`,
              message: `${subjectTitle} at ${time12}. Open your dashboard to start.`,
              type:    "class_reminder",
              link:    `/teacher/classes?slot=${slot.id}:${threshold}`,
              is_read: false,
            }).then().catch(() => {});
          }

          // ── WhatsApp reminder via edge function (best-effort, non-blocking) ─
          supabase.functions.invoke("send-class-reminder", {
            body: {
              user_id:       user.id,
              subject_title: subjectTitle,
              start_time:    time12,
              minutes_left:  minsDisplay,
            },
          }).catch(() => {}); // edge function may not exist yet — silently ignore

          // ── Browser push notification ─────────────────────────────────────
          if (Notification.permission === "granted") {
            new Notification(`📚 ${title}`, {
              body: message,
              icon: "/favicon.ico",
              tag:  `${slot.id}:${threshold}`,
            });
          }

          markSentLocally(slot.id, threshold);
        }
      }
    };

    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }

    check();
    timerRef.current = setInterval(check, CHECK_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [user?.id, profile]); // eslint-disable-line react-hooks/exhaustive-deps
}
