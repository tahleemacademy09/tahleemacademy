/*
  src/lib/nativeApp.ts — Tahleem Academy
  ──────────────────────────────────────
  Native-only bootstrap. Safe no-op on web.

  • Splash screen hide
  • Status bar theming
  • Push notification registration (FCM/APNs) → push_subscriptions
  • Local notification permissions (used by useTimetableNotifications)
  • App URL open → SPA navigation (deep links from notifications)
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

async function registerPushToken() {
  try {
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== "granted") return;
    await PushNotifications.register();

    PushNotifications.addListener("registration", async (token) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const platform = Capacitor.getPlatform(); // 'ios' | 'android'
      // Reuse push_subscriptions: store native token in endpoint, platform in keys
      await (supabase as any).from("push_subscriptions").upsert(
        {
          user_id: user.id,
          endpoint: `native:${platform}:${token.value}`,
          keys: { platform, token: token.value, native: true },
        },
        { onConflict: "endpoint" }
      );
      logger.log("[Native] Push token registered:", platform);
    });

    PushNotifications.addListener("registrationError", (err) =>
      logger.warn("[Native] Push registration error:", err)
    );

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

async function setupLocalNotifications() {
  try {
    await LocalNotifications.requestPermissions();
    await LocalNotifications.addListener("localNotificationActionPerformed", (a) => {
      const url = (a.notification.extra as any)?.url;
      if (url) window.location.assign(url);
    });
  } catch (e) {
    logger.warn("[Native] Local notifications setup failed:", e);
  }
}

function setupDeepLinks() {
  CapApp.addListener("appUrlOpen", ({ url }) => {
    try {
      const u = new URL(url);
      const target = u.pathname + u.search + u.hash;
      if (target) window.location.assign(target);
    } catch {}
  });
}

export async function initNativeApp() {
  if (!isNative()) return;
  try {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: "#064E3B" });
  } catch {}

  setupDeepLinks();
  await setupLocalNotifications();

  // Register push once user is authenticated (and on every auth change)
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user) registerPushToken();
  });
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) registerPushToken();

  setTimeout(() => SplashScreen.hide().catch(() => {}), 800);
}