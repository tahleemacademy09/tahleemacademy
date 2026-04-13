/*
useTimetableNotifications.ts — Tahleem Academy
─────────────────────────────────────────────────
Runs every 60 s in the background.
When a timetable slot is starting within 15 minutes:
• Inserts a 'class_reminder' notification for the student
• Tracks sent reminders in localStorage (persists across refreshes/minimize)
• Also checks the DB to avoid duplicate rows if localStorage was cleared
*/
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const WARN_MINUTES      = 15;
const CHECK_INTERVAL_MS = 60_000;

// ── localStorage key: `tt-notif:<slotId>:<YYYY-MM-DD>` ──────────────────────
function sentKey(slotId: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return `tt-notif:${slotId}:${today}`;
}

function alreadySentLocally(slotId: string): boolean {
  try {
    return localStorage.getItem(sentKey(slotId)) === "1";
  } catch {
    return false; // private-browsing may throw on localStorage access
  }
}

function markSentLocally(slotId: string) {
  try {
    localStorage.setItem(sentKey(slotId), "1");
    // Prune old keys (keep only today's) to avoid unbounded localStorage growth
    pruneOldKeys();
  } catch {
    // ignore
  }
}

function pruneOldKeys() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const toDelete: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith("tt-notif:") && !k.endsWith(`:${today}`)) {
        toDelete.push(k);
      }
    }
    toDelete.forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore
  }
}

function minutesUntil(timeStr: string): number {
  const now = new Date();
  const [h, m] = timeStr.split(":").map(Number);
  const slot = new Date();
  slot.setHours(h, m, 0, 0);
  return (slot.getTime() - now.getTime()) / 60_000;
}

// ── DB check: has a class_reminder for this slot already been inserted today? ─
async function alreadySentToDB(userId: string, slotId: string): Promise<boolean> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from("notifications")
    .select("id")
    .eq("user_id", userId)
    .eq("type", "class_reminder")
    // Use the slotId in the link field as the dedup key
    .ilike("link", `%${slotId}%`)
    .gte("created_at", todayStart.toISOString())
    .limit(1);

  if (error) return false; // on error, allow insert (better a duplicate than silence)
  return (data?.length ?? 0) > 0;
}

export function useTimetableNotifications() {
  const { user, profile } = useAuth();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user || !profile) return;

    const studentLevel: string =
      (profile as any).level || (profile as any).course_level || "beginner";

    const check = async () => {
      const todayIndex = new Date().getDay(); // 0 = Sun … 6 = Sat

      const { data: slots, error } = await supabase
        .from("subject_timetable")
        .select("id, subject_id, start_time, end_time, levels, live_url, subjects(title, title_ar)")
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

        // ── Time window ──────────────────────────────────────────────────────
        const minsLeft = minutesUntil(slot.start_time);
        if (minsLeft < 0 || minsLeft > WARN_MINUTES) continue;

        // ── Fast local dedup (survives page refresh / Android minimize) ──────
        if (alreadySentLocally(slot.id)) continue;

        // ── DB dedup (guards against localStorage being cleared) ─────────────
        const sentInDB = await alreadySentToDB(user.id, slot.id);
        if (sentInDB) {
          markSentLocally(slot.id); // re-sync local cache
          continue;
        }

        const subjectTitle =
          slot.subjects?.title_ar || slot.subjects?.title || "class";
        const minsDisplay = Math.round(minsLeft);
        const link = slot.live_url
          ? `${slot.live_url}?slot=${slot.id}`
          : `/student/courses?slot=${slot.id}`;

        // ── Insert notification row ──────────────────────────────────────────
        const { error: insErr } = await supabase.from("notifications").insert({
          user_id:  user.id,
          title:    `Class starting in ${minsDisplay} min`,
          message:  `Your ${subjectTitle} class starts at ${slot.start_time.slice(0, 5)}. Join now!`,
          type:     "class_reminder",
          link,
          is_read:  false,
        });

        if (insErr) {
          console.error("[useTimetableNotifications] insert error:", insErr.message);
          continue; // don't mark as sent if insert failed
        }

        // ── Browser push notification ────────────────────────────────────────
        if (Notification.permission === "granted") {
          new Notification(`📚 Class in ${minsDisplay} min`, {
            body: `${subjectTitle} starts at ${slot.start_time.slice(0, 5)}`,
            icon: "/favicon.ico",
            tag:  slot.id, // browser deduplicates same-tag notifications natively
          });
        }

        markSentLocally(slot.id);
      }
    };

    // Request browser notification permission once
    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }

    // Run immediately, then on interval
    check();
    timerRef.current = setInterval(check, CHECK_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [user?.id, profile]); // eslint-disable-line react-hooks/exhaustive-deps
}
