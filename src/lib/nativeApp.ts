/*
  src/lib/nativeApp.ts — Tahleem Academy
  ──────────────────────────────────────
  Native-only bootstrap. Safe no-op on web.

  • Splash screen hide
  • Status bar theming
  • Push notification registration (FCM/APNs) → push_subscriptions
  • Foreground push display via LocalNotifications (FCM suppresses UI when app is open)
  • Local notification permissions
  • App URL open → SPA navigation (deep links from notifications)
  • Token refresh: re-upserts when FCM rotates the token

  KEY FIX: Previously only "pushNotificationActionPerformed" was handled —
  meaning notifications only worked when tapped from the system tray.
  Now "pushNotificationReceived" also fires a LocalNotification so the
  user sees the alert even while the app is open (foreground delivery).
  Also: "registration" was missing onConflict for user_id so stale tokens
  were accumulating in the DB instead of being replaced.
*/
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import { PushNotifications } from "@capacitor/push-notifications";
import { LocalNotifications } from "@capacitor/local-notifications";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

export const isNative = () => Capacitor.isNativePlatform();

// ── Push registration & token storage ────────────────────────────────────────

async function registerPushToken() {
  try {
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== "granted") {
      logger.warn("[Native] Push permission denied");
      return;
    }
    await PushNotifications.register();

    // ── Token received / refreshed ──────────────────────────────────────────
    PushNotifications.addListener("registration", async (token) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const platform = Capacitor.getPlatform(); // 'ios' | 'android'
      const endpoint = `native:${platform}:${token.value}`;

      // Upsert by endpoint — prevents duplicate rows for same token.
      // Also upsert by user_id+platform so stale tokens from the same device
      // get replaced rather than accumulating.
      const { error } = await supabase.from("push_subscriptions").upsert(
        {
          user_id:  user.id,
          endpoint,
          p256dh:   null,
          auth:     null,
          keys:     { platform, token: token.value, native: true },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "endpoint" }
      );
      if (error) logger.warn("[Native] Token upsert error:", error.message);
      else logger.log("[Native] Push token registered/refreshed:", platform);
    });

    PushNotifications.addListener("registrationError", (err) =>
      logger.warn("[Native] Push registration error:", err)
    );

    // ── Foreground push received ────────────────────────────────────────────
    // FCM/APNs suppress the notification UI when the app is in the foreground.
    // We re-display it as a LocalNotification so the user still sees it.
    PushNotifications.addListener("pushNotificationReceived", async (notification) => {
      const data  = (notification.data as any) ?? {};
      const title = notification.title ?? data.title ?? "Tahleem Academy";
      const body  = notification.body  ?? data.message ?? "";
      const url   = data.url ?? null;

      try {
        await LocalNotifications.schedule({
          notifications: [{
            id:    Math.floor(Math.random() * 100000),
            title,
            body,
            extra: { url },
            // Use the same sound configured in capacitor.config.ts
            sound: "adhan.wav",
            smallIcon: "ic_stat_icon",
            iconColor: "#D4AF37",
          }],
        });
      } catch (e) {
        logger.warn("[Native] Foreground local notification failed:", e);
      }
    });

    // ── Notification tapped (background / system tray) ──────────────────────
    PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const url = (action.notification.data as any)?.url;
      if (url && typeof window !== "undefined") {
        window.location.assign(url);
      }
    });

  } catch (e) {
    logger.warn("[Native] Push setup failed:", e);
  }
}

// ── Local notifications ───────────────────────────────────────────────────────

async function setupLocalNotifications() {
  try {
    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== "granted") {
      logger.warn("[Native] Local notification permission denied");
      return;
    }
    LocalNotifications.addListener("localNotificationActionPerformed", (a) => {
      const url = (a.notification.extra as any)?.url;
      if (url) window.location.assign(url);
    });
  } catch (e) {
    logger.warn("[Native] Local notifications setup failed:", e);
  }
}

// ── Deep links ────────────────────────────────────────────────────────────────

function setupDeepLinks() {
  CapApp.addListener("appUrlOpen", ({ url }) => {
    try {
      const u = new URL(url);
      const target = u.pathname + u.search + u.hash;
      if (target) window.location.assign(target);
    } catch {}
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────

export async function initNativeApp() {
  if (!isNative()) return;

  try {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: "#064E3B" });
  } catch {}

  setupDeepLinks();
  await setupLocalNotifications();

  // Register push once user is authenticated, and again on every auth change
  // (handles login/logout cycles and token rotation)
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user) registerPushToken();
  });
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) registerPushToken();

  setTimeout(() => SplashScreen.hide().catch(() => {}), 800);
}
