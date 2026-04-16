/*
  useTimetableNotifications.ts — Tahleem Academy
  ─────────────────────────────────────────────────
  Runs every 60 s in the background.
  • 15-min warning: "Class starting in 15 min"
  • 5-min  warning: "Class starts in 5 min — join now!"
  • 12-hour time format in messages
  • Inserts DB notification for the student AND the subject's teacher
  • Shows SYSTEM-LEVEL phone notifications via the service worker
    (works on phone notification tray even when screen is locked)
  • Vibration via navigator.vibrate on mobile
  • localStorage + DB dual dedup to survive Android minimize / refresh
  • Saves Web Push subscription to Supabase for server-side push
    (Edge Function "send-class-reminder" can use it to wake the phone)
*/
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const CHECK_INTERVAL_MS  = 60_000;
const THRESHOLDS         = [15, 5] as const;  // minutes before class
const SW_PATH            = "/sw.js";

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

// ── Service worker registration + push subscription ───────────────────────────
let swRegistration: ServiceWorkerRegistration | null = null;

async function registerServiceWorker(userId: string): Promise<void> {
  if (!("serviceWorker" in navigator)) return;

  try {
    // Register / reuse the SW
    swRegistration = await navigator.serviceWorker.register(SW_PATH, { scope: "/" });
    await navigator.serviceWorker.ready;

    // Request push permission
    if (!("PushManager" in window)) return;

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;

    // Get or create push subscription
    let subscription = await swRegistration.pushManager.getSubscription();
    if (!subscription) {
      // VAPID public key — set VITE_VAPID_PUBLIC_KEY in your .env
      const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
      if (!vapidPublicKey) {
        // No VAPID key configured — SW still handles foreground messages
        return;
      }
      subscription = await swRegistration.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
    }

    // Save subscription to Supabase (upsert by user)
    const p256dh = subscription.getKey("p256dh");
    const auth   = subscription.getKey("auth");
    if (p256dh && auth) {
      await supabase.from("push_subscriptions").upsert(
        {
          user_id:    userId,
          endpoint:   subscription.endpoint,
          p256dh:     btoa(String.fromCharCode(...new Uint8Array(p256dh))),
          auth:       btoa(String.fromCharCode(...new Uint8Array(auth))),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      ).then().catch(() => {}); // best-effort — table may not exist yet
    }

  } catch (err) {
    console.warn("[useTimetableNotifications] SW registration failed:", err);
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw     = atob(base64);
  return new Uint8Array([...raw].map(c => c.charCodeAt(0)));
}

// ── Show notification via service worker (works in phone notification tray) ───
function showPhoneNotification(opts: {
  title:        string;
  message:      string;
  url:          string;
  tag:          string;
  minutes_left: number;
}) {
  const notifOptions: NotificationOptions = {
    body:    opts.message,
    icon:    "/favicon.ico",
    badge:   "/favicon.ico",
    tag:     opts.tag,
    renotify: true,
    requireInteraction: opts.minutes_left <= 5,
    vibrate: [200, 100, 200, 100, 400],
    data:    { url: opts.url },
    actions: [
      { action: "join",    title: "Join Class 📹" },
      { action: "dismiss", title: "Dismiss"        },
    ],
  } as NotificationOptions;

  // 1. SW-level notification — appears in phone tray, lock screen, etc.
  if (swRegistration && "showNotification" in swRegistration) {
    swRegistration.showNotification(opts.title, notifOptions).catch(() => {});
  } else if (navigator.serviceWorker?.controller) {
    // 2. Post to active SW controller so it can show on our behalf
    navigator.serviceWorker.controller.postMessage({
      type:        "SHOW_NOTIFICATION",
      title:       opts.title,
      message:     opts.message,
      url:         opts.url,
      tag:         opts.tag,
      minutes_left: opts.minutes_left,
    });
  } else {
    // 3. Last-resort: standard browser Notification (foreground only)
    if (Notification.permission === "granted") {
      try {
        new Notification(opts.title, {
          body: opts.message,
          icon: "/favicon.ico",
          tag:  opts.tag,
        });
      } catch {}
    }
  }

  // 4. Haptic vibration on mobile (works regardless of notification permission)
  try { navigator.vibrate?.([200, 100, 200, 100, 400]); } catch {}
}

// ── Main hook ─────────────────────────────────────────────────────────────────
export function useTimetableNotifications() {
  const { user, profile } = useAuth();
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const swInitRef = useRef(false);

  useEffect(() => {
    if (!user || !profile) return;

    // Register service worker once per session
    if (!swInitRef.current) {
      swInitRef.current = true;
      registerServiceWorker(user.id);
    }

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
            : `/student/timetable?slot=${slot.id}:${threshold}`;

          const title   = threshold === 5
            ? `📚 Class starts in 5 min — join now!`
            : `📚 Class starting in ${minsDisplay} min`;
          const message = `${subjectTitle} starts at ${time12}. ${threshold === 5 ? "Tap to join!" : "Get ready!"}`;

          // ── Insert student notification in DB ─────────────────────────────
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

          // ── PHONE / SYSTEM NOTIFICATION via service worker ────────────────
          showPhoneNotification({
            title,
            message,
            url:          link,
            tag:          `${slot.id}:${threshold}`,
            minutes_left: minsDisplay,
          });

          // ── Server-side push via Edge Function (wakes phone even if closed) ─
          supabase.functions.invoke("send-class-reminder", {
            body: {
              user_id:       user.id,
              subject_title: subjectTitle,
              start_time:    time12,
              minutes_left:  minsDisplay,
              join_url:      link,
            },
          }).catch(() => {}); // silently ignore if function not deployed yet

          markSentLocally(slot.id, threshold);
        }
      }
    };

    // Request notification permission on mount
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
