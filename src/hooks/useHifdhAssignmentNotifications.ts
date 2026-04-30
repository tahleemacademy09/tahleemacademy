/*
  src/hooks/useHifdhAssignmentNotifications.ts — Tahleem Academy
  ──────────────────────────────────────────────────────────────
  Mounted GLOBALLY via <AppNotifications /> alongside the timetable hook.

  WHAT THIS FILE DOES:
  • Polls every 30 minutes while the app is open
  • Fires reminders in 3 daily windows (morning / afternoon / evening)
    if the student has an active Hifdh assignment AND has NOT yet completed
    today's revision log
  • Shows an in-app notification (inserted into `notifications` table so
    the bell badge updates in real-time) + a browser/system notification
  • Deduplicates per-window per-day per-user using localStorage
    (no double-firing even on page reload)

  Reminder windows  (local device time):
    morning   → 07:00 – 09:59
    afternoon → 12:00 – 14:59
    evening   → 17:00 – 19:59
*/

import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// ── constants ────────────────────────────────────────────────────────────────

const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

const REMINDER_WINDOWS = [
  { slot: "morning",   startH: 7,  endH: 9,  emoji: "🌅", labelEn: "Morning Reminder",   labelAr: "تذكير الصباح"   },
  { slot: "afternoon", startH: 12, endH: 14, emoji: "☀️", labelEn: "Afternoon Reminder", labelAr: "تذكير الظهيرة" },
  { slot: "evening",   startH: 17, endH: 19, emoji: "🌙", labelEn: "Evening Reminder",   labelAr: "تذكير المساء"   },
] as const;

// ── dedup helpers ─────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function dedupKey(userId: string, slot: string): string {
  return `hifdh-reminder:${userId}:${todayStr()}:${slot}`;
}

function alreadySent(userId: string, slot: string): boolean {
  try { return localStorage.getItem(dedupKey(userId, slot)) === "1"; }
  catch { return false; }
}

function markSent(userId: string, slot: string): void {
  try {
    localStorage.setItem(dedupKey(userId, slot), "1");
    // Prune stale keys older than today
    const today = todayStr();
    const dead: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith("hifdh-reminder:") && !k.includes(`:${today}:`)) dead.push(k);
    }
    dead.forEach(k => localStorage.removeItem(k));
  } catch {}
}

// ── notification helpers ──────────────────────────────────────────────────────

function showBrowserNotification(title: string, body: string): void {
  // iOS Safari doesn't support Notification API in regular browser mode
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    new Notification(title, {
      body,
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      tag: "hifdh-reminder",
      renotify: true,
    });
  } catch {}
  try { navigator.vibrate?.([200, 100, 200]); } catch {}
}

// Formatted description of the assignment for the notification body
function describeAssignment(assignment: any): string {
  if (!assignment) return "";
  const mode: string = assignment.mode ?? "juz";
  const items: number[] = assignment.selected_items ?? [];
  const pages: number   = assignment.daily_pages ?? 1;

  const modeLabel =
    mode === "juz"   ? "Juz" :
    mode === "hizb"  ? "Hizb" :
    "Surah";

  const itemsStr = items.slice(0, 3).join(", ") + (items.length > 3 ? "…" : "");
  return `${modeLabel} ${itemsStr} — ${pages} page${pages > 1 ? "s" : ""} today`;
}

// ── core check ────────────────────────────────────────────────────────────────

async function runCheck(userId: string): Promise<void> {
  const nowH = new Date().getHours();

  const window = REMINDER_WINDOWS.find(w => nowH >= w.startH && nowH <= w.endH);
  if (!window) return; // not in any reminder window right now

  if (alreadySent(userId, window.slot)) return;

  // 1. Fetch active Hifdh assignment
  const { data: assignment } = await (supabase as any)
    .from("hifdh_daily_assignments")
    .select("*")
    .eq("student_id", userId)
    .eq("active", true)
    .maybeSingle();

  if (!assignment) return; // no assignment → nothing to remind about

  // 2. Fetch today's log
  const { data: log } = await (supabase as any)
    .from("hifdh_daily_logs")
    .select("completed, pages_revised")
    .eq("student_id", userId)
    .eq("log_date", todayStr())
    .maybeSingle();

  if (log?.completed) return; // already completed today → no reminder needed

  // 3. Build notification content
  const desc    = describeAssignment(assignment);
  const pagesRevised = log?.pages_revised ?? 0;
  const pagesTarget  = assignment.daily_pages ?? 1;
  const progress     = pagesRevised > 0 ? ` (${pagesRevised}/${pagesTarget} pages done)` : "";

  const title   = `${window.emoji} Hifdh Revision — ${window.labelEn}`;
  const titleAr = `${window.emoji} مراجعة الحفظ — ${window.labelAr}`;
  const message = `${desc}${progress}. Open the app to complete your revision!`;
  const messageAr = `${desc}${progress}. افتح التطبيق لإتمام مراجعتك!`;

  // 4. Insert in-app notification (real-time bell will pick it up)
  try {
    await supabase.from("notifications").insert({
      user_id:  userId,
      title:    title,
      message:  `${message} | ${messageAr}`,
      type:     "hifdh_reminder",
      link:     "/student/hifdh",
      is_read:  false,
    });
  } catch (err) {
    console.warn("[useHifdhAssignmentNotifications] Insert failed:", err);
  }

  // 5. Browser notification
  showBrowserNotification(title, message);

  // 6. Mark sent so we don't fire again in this window today
  markSent(userId, window.slot);
}

// ── hook ──────────────────────────────────────────────────────────────────────

export function useHifdhAssignmentNotifications() {
  const { user, profile, hasRole } = useAuth();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Only run for students (not admins or teachers)
    if (!user || !profile) return;
    if (!hasRole("student")) return;

    // Request notification permission once
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }

    const userId = user.id;

    // Run immediately, then every 30 minutes
    runCheck(userId).catch(() => {});
    timerRef.current = setInterval(() => {
      runCheck(userId).catch(() => {});
    }, CHECK_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [user?.id, profile]); // eslint-disable-line react-hooks/exhaustive-deps
}
