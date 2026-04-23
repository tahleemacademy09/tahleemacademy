/*
  useTimetableNotifications.ts — Tahleem Academy
  ─────────────────────────────────────────────────────────────────────
  Mounted GLOBALLY via <AppNotifications /> so it runs for every
  authenticated user on every page.

  WHAT THIS FILE DOES (foreground / browser-open):
  • Polls timetable every 60 s
  • Shows system notification + in-app bell for 15-min and 5-min alerts
  • Saves the Web Push subscription to Supabase so the SERVER-SIDE cron
    can wake the device even when this tab is closed / phone locked

  WHAT KEEPS WORKING WHEN THE BROWSER IS CLOSED:
  • The pg_cron job fires every minute on Supabase's servers
  • It calls the cron-class-reminders Edge Function
  • That function reads push_subscriptions, checks today's timetable,
    and sends Web Push via the VAPID API — no browser needed

  Required env var in Vercel / .env.local:
    VITE_VAPID_PUBLIC_KEY   — your VAPID public key (base64url)

  Run PUSH_NOTIFICATIONS_SETUP.sql in Supabase to create the
  push_subscriptions table and the pg_cron job.
*/

import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const CHECK_INTERVAL_MS = 60_000;
const THRESHOLDS        = [15, 5] as const;
const SW_PATH           = "/sw.js";

// ── helpers ─────────────────────────────────────────────────────────────────

function to12hr(timeStr: string): string {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":").map(Number);
  const ampm   = h >= 12 ? "PM" : "AM";
  const h12    = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function minutesUntil(timeStr: string): number {
  const now  = new Date();
  const [h, m] = timeStr.split(":").map(Number);
  const slot = new Date();
  slot.setHours(h, m, 0, 0);
  return (slot.getTime() - now.getTime()) / 60_000;
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64     = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw     = atob(b64);
  return new Uint8Array([...raw].map(c => c.charCodeAt(0)));
}

// ── localStorage dedup (per-device, per-day) ─────────────────────────────────

function sentKey(slotId: string, threshold: number): string {
  return `tt-notif:${slotId}:${threshold}:${new Date().toISOString().slice(0, 10)}`;
}
function alreadySentLocally(slotId: string, threshold: number): boolean {
  try   { return localStorage.getItem(sentKey(slotId, threshold)) === "1"; }
  catch { return false; }
}
function markSentLocally(slotId: string, threshold: number): void {
  try {
    localStorage.setItem(sentKey(slotId, threshold), "1");
    // prune stale keys
    const today = new Date().toISOString().slice(0, 10);
    const dead: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith("tt-notif:") && !k.includes(`:${today}`)) dead.push(k);
    }
    dead.forEach(k => localStorage.removeItem(k));
  } catch {}
}

// ── DB dedup (cross-device, survives reinstall) ───────────────────────────────

async function alreadySentToDB(
  userId: string, slotId: string, threshold: number
): Promise<boolean> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const { data } = await supabase
    .from("notifications")
    .select("id")
    .eq("user_id", userId)
    .eq("type", "class_reminder")
    .ilike("link", `%${slotId}:${threshold}%`)
    .gte("created_at", todayStart.toISOString())
    .limit(1);
  return (data?.length ?? 0) > 0;
}

// ── Service Worker + Push Subscription registration ───────────────────────────

let _swReg: ServiceWorkerRegistration | null = null;

async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    // Register (idempotent — browser deduplicates)
    _swReg = await navigator.serviceWorker.register(SW_PATH, { scope: "/" });
    await navigator.serviceWorker.ready;
    return _swReg;
  } catch (err) {
    console.warn("[useTimetableNotifications] SW register failed:", err);
    return null;
  }
}

async function savePushSubscription(userId: string, reg: ServiceWorkerRegistration): Promise<void> {
  if (!("PushManager" in window)) return;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return;

  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  if (!vapidKey) {
    // No VAPID key — foreground-only notifications will still work via SW message
    return;
  }

  try {
    // Re-use existing subscription or create a new one
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
    }

    const p256dh = sub.getKey("p256dh");
    const auth   = sub.getKey("auth");
    if (!p256dh || !auth) return;

    // Upsert into Supabase — server-side cron reads this table
    await supabase
      .from("push_subscriptions")
      .upsert(
        {
          user_id:    userId,
          endpoint:   sub.endpoint,
          p256dh:     btoa(String.fromCharCode(...new Uint8Array(p256dh))),
          auth:       btoa(String.fromCharCode(...new Uint8Array(auth))),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
  } catch (err) {
    console.warn("[useTimetableNotifications] Push subscription failed:", err);
  }
}

// ── Show notification ─────────────────────────────────────────────────────────

async function showNotification(opts: {
  title:        string;
  message:      string;
  url:          string;
  tag:          string;
  minutes_left: number;
}): Promise<void> {
  const baseOpts: NotificationOptions = {
    body:               opts.message,
    icon:               "/favicon.ico",
    badge:              "/favicon.ico",
    tag:                opts.tag,
    renotify:           true,
    requireInteraction: opts.minutes_left <= 5,
    vibrate:            [200, 100, 200, 100, 400],
    data:               { url: opts.url },
    actions: [
      { action: "join",    title: "Join Class 📹" },
      { action: "dismiss", title: "Dismiss"        },
    ],
  } as NotificationOptions;

  // Prefer SW.showNotification — gives action buttons + correct tray placement
  if (_swReg) {
    try {
      await _swReg.showNotification(opts.title, baseOpts);
    } catch {
      // Fallback to controller message
      navigator.serviceWorker?.controller?.postMessage({
        type: "SHOW_NOTIFICATION", ...opts,
      });
    }
  } else if (Notification.permission === "granted") {
    try { new Notification(opts.title, { body: opts.message, icon: "/favicon.ico", tag: opts.tag }); }
    catch {}
  }

  try { navigator.vibrate?.([200, 100, 200, 100, 400]); } catch {}
}

// ── Process one slot ─────────────────────────────────────────────────────────

async function processSlot(
  slot:       any,
  userId:     string,
  joinPrefix: string
): Promise<void> {
  const minsLeft     = minutesUntil(slot.start_time);
  const time12       = to12hr(slot.start_time);
  const subjectTitle = slot.subjects?.title_ar || slot.subjects?.title || "class";

  for (const threshold of THRESHOLDS) {
    if (minsLeft < 0 || minsLeft > threshold + 1) continue;
    if (threshold === 5  && minsLeft > 6)  continue;
    if (threshold === 15 && minsLeft > 16) continue;

    if (alreadySentLocally(slot.id, threshold)) continue;

    const sentDB = await alreadySentToDB(userId, slot.id, threshold);
    if (sentDB) { markSentLocally(slot.id, threshold); continue; }

    const link    = `${slot.live_url ?? joinPrefix}?slot=${slot.id}:${threshold}`;
    const minsDisp = Math.round(minsLeft);
    const title   = threshold === 5
      ? `📚 Class starts in 5 min — join now!`
      : `📚 Class starting in ${minsDisp} min`;
    const message =
      `${subjectTitle} starts at ${time12}. ` +
      (threshold === 5 ? "Tap to join!" : "Get ready!");

    // Show phone notification immediately (best-effort, don't await DB)
    await showNotification({ title, message, url: link, tag: `${slot.id}:${threshold}`, minutes_left: minsDisp });
    markSentLocally(slot.id, threshold);

    // In-app bell
    supabase.from("notifications").insert({
      user_id: userId, title, message, type: "class_reminder", link, is_read: false,
    }).then().catch(() => {});

    // Tell the server-side Edge Function (belt-and-suspenders for foreground)
    supabase.functions
      .invoke("send-class-reminder", {
        body: { user_id: userId, subject_title: subjectTitle, start_time: time12, minutes_left: minsDisp, join_url: link },
      })
      .catch(() => {});
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useTimetableNotifications() {
  const { user, profile, hasRole } = useAuth();
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const initRef   = useRef(false);

  useEffect(() => {
    if (!user || !profile) return;
    if (hasRole("admin")) return;

    const isTeacher     = hasRole("teacher");
    const studentLevel  = (profile as any).level ?? (profile as any).course_level ?? "beginner";

    // Register SW + push subscription once per session
    if (!initRef.current) {
      initRef.current = true;
      ensureServiceWorker().then(reg => {
        if (reg) savePushSubscription(user.id, reg);
      });
      // Prompt for permission if not yet decided
      if (Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
    }

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
        if (isTeacher) {
          if (slot.subjects?.teacher_id !== user.id) continue;
          await processSlot(slot, user.id, "/teacher/classes");
        } else {
          const slotLevels: string[] = slot.levels ?? [];
          const visible =
            slotLevels.length === 0 ||
            slotLevels.includes(studentLevel) ||
            slotLevels.includes("all");
          if (!visible) continue;
          await processSlot(slot, user.id, "/student/timetable");
        }
      }
    };

    check();
    timerRef.current = setInterval(check, CHECK_INTERVAL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [user?.id, profile]); // eslint-disable-line react-hooks/exhaustive-deps
}
