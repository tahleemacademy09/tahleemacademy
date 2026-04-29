/*
  useTimetableNotifications.ts — Tahleem Academy
  ─────────────────────────────────────────────────────────────────────
  Mounted GLOBALLY via <AppNotifications /> so it runs for every
  authenticated user on every page.

  ROUTING LOGIC:
  • Admin          → skipped entirely
  • Teacher        → notified for slots where subjects.teacher_id = their id
  • Private student → notified for their private_sessions only (today)
  • General student → notified for subject_timetable slots matching their level

  Required env var in Vercel / .env.local:
    VITE_VAPID_PUBLIC_KEY   — your VAPID public key (base64url)
*/

import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const CHECK_INTERVAL_MS = 60_000;
const THRESHOLDS        = [15, 5] as const;
const SW_PATH           = "/sw.js";

// ── helpers ──────────────────────────────────────────────────────────────────

function to12hr(timeStr: string): string {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function minutesUntil(timeStr: string): number {
  const now = new Date();
  const [h, m] = timeStr.split(":").map(Number);
  const slot = new Date(); slot.setHours(h, m, 0, 0);
  return (slot.getTime() - now.getTime()) / 60_000;
}

function minutesUntilDateTime(dateStr: string, timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  const t = new Date(dateStr); t.setHours(h, m, 0, 0);
  return (t.getTime() - new Date().getTime()) / 60_000;
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return new Uint8Array([...raw].map(c => c.charCodeAt(0)));
}

// ── localStorage dedup ────────────────────────────────────────────────────────

function sentKey(slotId: string, threshold: number): string {
  return `tt-notif:${slotId}:${threshold}:${new Date().toISOString().slice(0, 10)}`;
}
function alreadySentLocally(slotId: string, threshold: number): boolean {
  try { return localStorage.getItem(sentKey(slotId, threshold)) === "1"; } catch { return false; }
}
function markSentLocally(slotId: string, threshold: number): void {
  try {
    localStorage.setItem(sentKey(slotId, threshold), "1");
    const today = new Date().toISOString().slice(0, 10);
    const dead: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith("tt-notif:") && !k.includes(`:${today}`)) dead.push(k);
    }
    dead.forEach(k => localStorage.removeItem(k));
  } catch {}
}

// ── DB dedup ──────────────────────────────────────────────────────────────────

async function alreadySentToDB(userId: string, slotId: string, threshold: number): Promise<boolean> {
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
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

// ── Service Worker ─────────────────────────────────────────────────────────────

let _swReg: ServiceWorkerRegistration | null = null;

async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
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
  if (!vapidKey) return;
  try {
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
    }
    const p256dh = sub.getKey("p256dh");
    const auth   = sub.getKey("auth");
    if (!p256dh || !auth) return;
    await supabase.from("push_subscriptions").upsert(
      { user_id: userId, endpoint: sub.endpoint, p256dh: btoa(String.fromCharCode(...new Uint8Array(p256dh))), auth: btoa(String.fromCharCode(...new Uint8Array(auth))), updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
  } catch (err) {
    console.warn("[useTimetableNotifications] Push subscription failed:", err);
  }
}

// ── Show notification ──────────────────────────────────────────────────────────

async function showNotification(opts: { title: string; message: string; url: string; tag: string; minutes_left: number }): Promise<void> {
  const baseOpts: NotificationOptions = {
    body: opts.message, icon: "/favicon.ico", badge: "/favicon.ico",
    tag: opts.tag, renotify: true, requireInteraction: opts.minutes_left <= 5,
    vibrate: [200, 100, 200, 100, 400], data: { url: opts.url },
    actions: [{ action: "join", title: "Join Class 📹" }, { action: "dismiss", title: "Dismiss" }],
  } as NotificationOptions;
  if (_swReg) {
    try { await _swReg.showNotification(opts.title, baseOpts); }
    catch { navigator.serviceWorker?.controller?.postMessage({ type: "SHOW_NOTIFICATION", ...opts }); }
  } else if (Notification.permission === "granted") {
    try { new Notification(opts.title, { body: opts.message, icon: "/favicon.ico", tag: opts.tag }); } catch {}
  }
  try { navigator.vibrate?.([200, 100, 200, 100, 400]); } catch {}
}

// ── Shared notify sender ───────────────────────────────────────────────────────

async function fireNotification(opts: {
  id:           string;   // session or slot id (for dedup)
  userId:       string;
  start_time:   string;
  subjectTitle: string;
  live_url?:    string;
  joinPrefix:   string;
  label:        string;   // "Class" | "Private class"
}): Promise<void> {
  const minsLeft = minutesUntil(opts.start_time);
  const time12   = to12hr(opts.start_time);

  for (const threshold of THRESHOLDS) {
    if (minsLeft < 0 || minsLeft > threshold + 1) continue;
    if (threshold === 5  && minsLeft > 6)  continue;
    if (threshold === 15 && minsLeft > 16) continue;

    if (alreadySentLocally(opts.id, threshold)) continue;
    const sentDB = await alreadySentToDB(opts.userId, opts.id, threshold);
    if (sentDB) { markSentLocally(opts.id, threshold); continue; }

    const link     = `${opts.live_url ?? opts.joinPrefix}?slot=${opts.id}:${threshold}`;
    const minsDisp = Math.round(minsLeft);
    const title    = threshold === 5
      ? `📚 ${opts.label} starts in 5 min — join now!`
      : `📚 ${opts.label} starting in ${minsDisp} min`;
    const message  = `${opts.subjectTitle} starts at ${time12}. ${threshold === 5 ? "Tap to join!" : "Get ready!"}`;

    await showNotification({ title, message, url: link, tag: `${opts.id}:${threshold}`, minutes_left: minsDisp });
    markSentLocally(opts.id, threshold);

    // In-app bell — allowed by the "Students can insert own notifications" RLS policy
    supabase.from("notifications").insert({
      user_id: opts.userId, title, message, type: "class_reminder", link, is_read: false,
    }).then().catch(() => {});

    supabase.functions.invoke("send-class-reminder", {
      body: { user_id: opts.userId, subject_title: opts.subjectTitle, start_time: time12, minutes_left: minsDisp, join_url: link },
    }).catch(() => {});
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useTimetableNotifications() {
  const { user, profile, hasRole } = useAuth();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initRef  = useRef(false);

  useEffect(() => {
    if (!user || !profile) return;
    if (hasRole("admin")) return;

    const isTeacher    = hasRole("teacher");
    // A student is "private" when student_type === "private"
    const isPrivate    = !isTeacher && (profile as any)?.student_type === "private";
    const studentLevel = (profile as any).level ?? (profile as any).course_level ?? "beginner";

    if (!initRef.current) {
      initRef.current = true;
      ensureServiceWorker().then(reg => { if (reg) savePushSubscription(user.id, reg); });
      if (Notification.permission === "default") Notification.requestPermission().catch(() => {});
    }

    const check = async () => {
      const todayIndex = new Date().getDay();
      const today      = new Date().toISOString().split("T")[0];

      // ── TEACHER: only their timetable slots ─────────────────────────────────
      if (isTeacher) {
        const { data: slots, error } = await supabase
          .from("subject_timetable")
          .select("id, subject_id, start_time, end_time, levels, live_url, subjects(title, title_ar, teacher_id)")
          .eq("day_of_week", todayIndex)
          .eq("is_active", true);
        if (!error && slots) {
          for (const slot of slots as any[]) {
            if (slot.subjects?.teacher_id !== user.id) continue;
            await fireNotification({
              id: slot.id, userId: user.id, start_time: slot.start_time,
              subjectTitle: slot.subjects?.title_ar || slot.subjects?.title || "class",
              live_url: slot.live_url, joinPrefix: "/teacher/classes", label: "Class",
            });
          }
        }
        return;
      }

      // ── PRIVATE STUDENT: only their personal private_sessions ───────────────
      if (isPrivate) {
        const { data: sessions, error } = await supabase
          .from("private_sessions")
          .select("id, student_id, session_date, start_time, end_time, subject_id, subjects(title, title_ar)")
          .eq("student_id", user.id)
          .eq("session_date", today);
        if (!error && sessions) {
          for (const s of sessions as any[]) {
            // Use minutesUntilDateTime so we compare date+time, not just time
            const minsLeft = minutesUntilDateTime(s.session_date, s.start_time);
            const time12   = to12hr(s.start_time);
            const subjectTitle = s.subjects?.title_ar || s.subjects?.title || "Private Session";
            for (const threshold of THRESHOLDS) {
              if (minsLeft < 0 || minsLeft > threshold + 1) continue;
              if (threshold === 5  && minsLeft > 6)  continue;
              if (threshold === 15 && minsLeft > 16) continue;
              if (alreadySentLocally(s.id, threshold)) continue;
              const sentDB = await alreadySentToDB(user.id, s.id, threshold);
              if (sentDB) { markSentLocally(s.id, threshold); continue; }
              const link     = `/student/timetable?slot=${s.id}:${threshold}`;
              const minsDisp = Math.round(minsLeft);
              const title    = threshold === 5
                ? `🔒 Private class starts in 5 min — join now!`
                : `🔒 Private class starting in ${minsDisp} min`;
              const message  = `${subjectTitle} starts at ${time12}. ${threshold === 5 ? "Tap to join!" : "Get ready!"}`;
              await showNotification({ title, message, url: link, tag: `${s.id}:${threshold}`, minutes_left: minsDisp });
              markSentLocally(s.id, threshold);
              supabase.from("notifications").insert({
                user_id: user.id, title, message, type: "class_reminder", link, is_read: false,
              }).then().catch(() => {});
              supabase.functions.invoke("send-class-reminder", {
                body: { user_id: user.id, subject_title: subjectTitle, start_time: time12, minutes_left: minsDisp, join_url: link },
              }).catch(() => {});
            }
          }
        }
        return;
      }

      // ── GENERAL STUDENT: subject_timetable filtered by their level ──────────
      const { data: slots, error } = await supabase
        .from("subject_timetable")
        .select("id, subject_id, start_time, end_time, levels, live_url, subjects(title, title_ar)")
        .eq("day_of_week", todayIndex)
        .eq("is_active", true);
      if (!error && slots) {
        for (const slot of slots as any[]) {
          const slotLevels: string[] = (slot as any).levels ?? [];
          const visible = slotLevels.length === 0 || slotLevels.includes(studentLevel) || slotLevels.includes("all");
          if (!visible) continue;
          await fireNotification({
            id: slot.id, userId: user.id, start_time: slot.start_time,
            subjectTitle: (slot as any).subjects?.title_ar || (slot as any).subjects?.title || "class",
            live_url: (slot as any).live_url, joinPrefix: "/student/timetable", label: "Class",
          });
        }
      }
    };

    check();
    timerRef.current = setInterval(check, CHECK_INTERVAL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [user?.id, profile]); // eslint-disable-line react-hooks/exhaustive-deps
}
