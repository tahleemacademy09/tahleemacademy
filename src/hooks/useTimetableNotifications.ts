/*
useTimetableNotifications.ts — Tahleem Academy
─────────────────────────────────────────────────
Runs every 60 s in the background.
When a timetable slot is starting within 15 minutes:
• Inserts a 'class_reminder' notification for the student
• Tracks sent reminders in sessionStorage to avoid duplicates
within the same browser session.
*/
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const WARN_MINUTES = 15;
const CHECK_INTERVAL_MS = 60_000;

// Key: `timetable-${slotId}-${YYYY-MM-DD}` → already sent
function sentKey(slotId: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return `tt-notif:${slotId}:${today}`;
}

function alreadySent(slotId: string): boolean {
  return sessionStorage.getItem(sentKey(slotId)) === "1";
}

function markSent(slotId: string) {
  sessionStorage.setItem(sentKey(slotId), "1");
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
      const todayIndex = new Date().getDay(); // 0 = Sun … 6 = Sat
      // Fetch today's active slots
      const { data: slots, error } = await supabase
        .from("subject_timetable")
        .select("id, subject_id, start_time, end_time, levels, live_url, subjects(title, title_ar)")
        .eq("day_of_week", todayIndex)
        .eq("is_active", true);

      if (error || !slots) return;

      for (const slot of slots as any[]) {
        // Level filter: empty levels[] = all levels
        const slotLevels: string[] = slot.levels || [];
        const visibleToMe =
          slotLevels.length === 0 ||
          slotLevels.includes(studentLevel) ||
          slotLevels.includes("all");
        if (!visibleToMe) continue;

        const minsLeft = minutesUntil(slot.start_time);
        if (minsLeft < 0 || minsLeft > WARN_MINUTES) continue;
        if (alreadySent(slot.id)) continue;

        const subjectTitle =
          slot.subjects?.title_ar || slot.subjects?.title || "class";
        const minsDisplay = Math.round(minsLeft);

        const link = slot.live_url || `/student/courses`;

        // Insert notification into Supabase
        await supabase.from("notifications").insert({
          user_id: user.id,
          title: `Class starting in ${minsDisplay} min`,
          message: `Your ${subjectTitle} class starts at ${slot.start_time.slice(0, 5)}. Join now!`,
          type: "class_reminder",
          link,
          is_read: false,
        });

        // Browser push notification (if permission granted)
        if (Notification.permission === "granted") {
          new Notification(`📚 Class in ${minsDisplay} min`, {
            body: `${subjectTitle} starts at ${slot.start_time.slice(0, 5)}`,
            icon: "/favicon.ico",
            tag: slot.id,
          });
        }

        markSent(slot.id);
      }    };

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
  }, [user?.id, profile]);
}