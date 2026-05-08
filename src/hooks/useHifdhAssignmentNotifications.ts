/*  src/hooks/useHifdhAssignmentNotifications.ts — Tahleem Academy
    ──────────────────────────────────────────────────────────────────────────
    Mounted globally for students via <AppNotifications />.

    What this does:
    ✓ Requests browser notification permission proactively with a soft prompt
    ✓ Checks every 5 minutes (tighter than the old 30-min window)
    ✓ Also fires immediately on:
        • mount (app opened / refreshed)
        • document visibilitychange (student returns to tab)
        • each new calendar day detected (cross-midnight check)
    ✓ Three reminder windows: morning / midday / evening
    ✓ "Missed yesterday" catch-up alert fires once on the first check of each day
    ✓ De-duplicates via localStorage — one fire per window per day per user
    ✓ Writes to `notifications` table (bell badge) + shows browser Notification
    ✓ Does nothing for non-students or users with no active assignment
*/

import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/* ── Constants ─────────────────────────────────────────────────── */
const CHECK_INTERVAL_MS  = 5 * 60 * 1000; // 5 minutes

const REMINDER_WINDOWS = [
  { slot: "morning",  startH:  7, endH:  9,  emoji: "🌅", en: "Morning Reminder",   ar: "تذكير الصباح"   },
  { slot: "midday",   startH: 12, endH: 13,  emoji: "☀️", en: "Midday Reminder",    ar: "تذكير الظهيرة"  },
  { slot: "evening",  startH: 17, endH: 19,  emoji: "🌙", en: "Evening Reminder",   ar: "تذكير المساء"   },
] as const;

/* ── Date helpers ───────────────────────────────────────────────── */
function todayStr():     string { return new Date().toISOString().slice(0, 10); }
function yesterdayStr(): string {
  const d = new Date(); d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

/* ── De-dup helpers ─────────────────────────────────────────────── */
function dedupKey(userId: string, tag: string): string {
  return `hifdh-notif:${userId}:${todayStr()}:${tag}`;
}
function alreadySent(userId: string, tag: string): boolean {
  try { return localStorage.getItem(dedupKey(userId, tag)) === "1"; }
  catch { return false; }
}
function markSent(userId: string, tag: string): void {
  try {
    localStorage.setItem(dedupKey(userId, tag), "1");
    // Prune stale keys (older than today)
    const today = todayStr();
    const dead: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith("hifdh-notif:") && !k.includes(`:${today}:`)) dead.push(k);
    }
    dead.forEach(k => localStorage.removeItem(k));
  } catch {}
}

/* ── Browser notification helper ───────────────────────────────── */
function showBrowserNotif(title: string, body: string): void {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, {
      body,
      icon:     "/favicon.ico",
      badge:    "/favicon.ico",
      tag:      "hifdh-reminder",
      renotify: true,
    });
  } catch {}
  try { navigator.vibrate?.([200, 100, 200, 100, 200]); } catch {}
}

/* ── Permission request (soft, shown once per session) ─────────── */
let _permAsked = false;
function askPermission(): void {
  if (_permAsked) return;
  _permAsked = true;
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "default")  return;
  // Small delay so it doesn't pop immediately on page load
  setTimeout(() => {
    Notification.requestPermission().catch(() => {});
  }, 4000);
}

/* ── Assignment description ─────────────────────────────────────── */
function describeAssignment(a: any): string {
  if (!a) return "your revision";
  const modeLabel = a.mode === "juz" ? "Juz" : a.mode === "hizb" ? "Hizb" : "Surah";
  const items     = (a.selected_items as number[] ?? []).slice(0, 3).join(", ");
  const pages     = a.daily_pages ?? 1;
  return `${modeLabel} ${items} (${pages} page${pages > 1 ? "s" : ""})`;
}

/* ── DB insert helper ───────────────────────────────────────────── */
async function insertNotif(userId: string, title: string, message: string): Promise<void> {
  try {
    await supabase.from("notifications").insert({
      user_id: userId,
      title,
      message,
      type:    "hifdh_reminder",
      link:    "/student/hifdh",
      is_read: false,
    });
  } catch (err) {
    console.warn("[HifdhNotif] insert failed:", err);
  }
}

/* ── Core check ─────────────────────────────────────────────────── */
async function runCheck(userId: string): Promise<void> {
  // ── 1. Fetch active assignment ──
  const { data: assignment } = await (supabase as any)
    .from("hifdh_daily_assignments")
    .select("*")
    .eq("student_id", userId)
    .eq("active", true)
    .maybeSingle();

  if (!assignment) return;

  const desc  = describeAssignment(assignment);
  const today = todayStr();

  // ── 2. Fetch today's log ──
  const { data: todayLog } = await (supabase as any)
    .from("hifdh_daily_logs")
    .select("completed, pages_revised")
    .eq("student_id", userId)
    .eq("log_date", today)
    .maybeSingle();

  if (todayLog?.completed) return; // already done → no reminder needed

  const pagesRevised = todayLog?.pages_revised ?? 0;
  const pagesTarget  = assignment.daily_pages ?? 1;
  const progressNote = pagesRevised > 0 ? ` (${pagesRevised}/${pagesTarget} pages done)` : "";

  // ── 3. "Missed yesterday" catch-up (fires once per day on first check) ──
  const missedTag = `missed-${today}`;
  if (!alreadySent(userId, missedTag)) {
    const { data: ystdLog } = await (supabase as any)
      .from("hifdh_daily_logs")
      .select("completed")
      .eq("student_id", userId)
      .eq("log_date", yesterdayStr())
      .maybeSingle();

    if (!ystdLog?.completed) {
      // Yesterday was also missed — send a catch-up nudge
      const title   = "📖 Missed Yesterday's Hifdh";
      const message = `You didn't complete yesterday's revision of ${desc}. Today is a new chance — start now!`;
      await insertNotif(userId, title, message);
      showBrowserNotif(title, message);
    }
    markSent(userId, missedTag);
  }

  // ── 4. Window-based reminders ──
  const nowH = new Date().getHours();
  for (const win of REMINDER_WINDOWS) {
    if (nowH < win.startH || nowH > win.endH) continue;
    if (alreadySent(userId, win.slot)) continue;

    const title   = `${win.emoji} Hifdh Revision — ${win.en}`;
    const titleAr = `${win.emoji} مراجعة الحفظ — ${win.ar}`;
    const message = `Time to revise ${desc}${progressNote}. Open the app to begin!`;

    await insertNotif(userId, `${title} · ${titleAr}`, message);
    showBrowserNotif(title, message);
    markSent(userId, win.slot);
    break; // only one window per check
  }
}

/* ── Hook ───────────────────────────────────────────────────────── */
export function useHifdhAssignmentNotifications() {
  const { user, profile, hasRole } = useAuth();
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastDayRef   = useRef<string>(todayStr());

  useEffect(() => {
    if (!user || !profile) return;
    if (!hasRole("student"))   return;

    const userId = user.id;

    // Request permission early (soft, delayed)
    askPermission();

    // Immediate first check
    runCheck(userId).catch(() => {});

    // Polling every 5 minutes
    intervalRef.current = setInterval(() => {
      // Cross-midnight detection: if day changed, force a fresh check
      const now = todayStr();
      if (now !== lastDayRef.current) {
        lastDayRef.current = now;
      }
      runCheck(userId).catch(() => {});
    }, CHECK_INTERVAL_MS);

    // Check again when student returns to the tab
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        runCheck(userId).catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user?.id, profile]); // eslint-disable-line react-hooks/exhaustive-deps
}
