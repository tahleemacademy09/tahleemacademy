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
  • Reply-from-notification for support tickets (RemoteInput action)

  KEY FIX: Previously only "pushNotificationActionPerformed" was handled —
  meaning notifications only worked when tapped from the system tray.
  Now "pushNotificationReceived" also fires a LocalNotification so the
  user sees the alert even while the app is open (foreground delivery).
  Also: "registration" was missing onConflict for user_id so stale tokens
  were accumulating in the DB instead of being replaced.

  REPLY-FROM-NOTIFICATION: support_ticket pushes now arrive as data-only FCM
  messages (see supabase/functions/send-notification), so Android never
  auto-displays its own bare notification for them — pushNotificationReceived
  fires instead (this happens even when the app is backgrounded or fully
  swiped away, as long as it hasn't been force-stopped) and we build the
  notification ourselves with a "Reply" action attached. Typing a reply and
  hitting Send delivers the text via localNotificationActionPerformed, which
  we insert straight into support_ticket_messages — no need to open the
  ticket screen. Note: because @capacitor/local-notifications implements this
  action with an Activity-launching PendingIntent (not a background service),
  the app will briefly come to the foreground when "Send" is tapped — this is
  a plugin limitation, not fully invisible like WhatsApp's own native reply.
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
const CLASS_CHANNEL_ID = "tahleem_class";
const SUPPORT_REPLY_ACTION_TYPE = "support_ticket_reply";

async function setupNotificationChannels() {
  if (!isNative() || Capacitor.getPlatform() !== "android") return;
  await Promise.allSettled([
    PushNotifications.createChannel({
      id: CLASS_CHANNEL_ID,
      name: "Class notifications",
      description: "Live class rings and academy reminders",
      importance: 4,
      visibility: 1,
      vibration: true,
      sound: "adhan.wav",
    }),
    LocalNotifications.createChannel({
      id: CLASS_CHANNEL_ID,
      name: "Class notifications",
      description: "Live class rings and academy reminders",
      importance: 4,
      visibility: 1,
      vibration: true,
      sound: "adhan.wav",
    }),
  ]);
}

// ── Reply action type (registered once) ─────────────────────────────────────
// input: true → Android renders this as a RemoteInput "inline reply" field
// directly in the notification shade (@capacitor/local-notifications builds
// the native NotificationCompat.Action + RemoteInput for us).
async function registerReplyActionType() {
  if (!isNative() || Capacitor.getPlatform() !== "android") return;
  try {
    await LocalNotifications.registerActionTypes({
      types: [{
        id: SUPPORT_REPLY_ACTION_TYPE,
        actions: [{
          id: "reply",
          title: "Reply",
          input: true,
          inputButtonTitle: "Send",
          inputPlaceholder: "Type a reply...",
        }],
      }],
    });
  } catch (e) {
    logger.warn("[Native] registerActionTypes failed:", e);
  }
}

function extractTicketId(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url, window.location.origin);
    return u.searchParams.get("ticket");
  } catch {
    const m = url.match(/[?&]ticket=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }
}

async function sendTicketReply(ticketId: string, message: string): Promise<void> {
  if (!message.trim()) return;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from("support_ticket_messages" as any)
      .insert({ ticket_id: ticketId, sender_id: user.id, message: message.trim() });
    if (error) logger.warn("[Native] Reply-from-notification insert failed:", error.message);
  } catch (e) {
    logger.warn("[Native] Reply-from-notification failed:", e);
  }
}

// ── Push registration & token storage ────────────────────────────────────────

// registerPushToken() runs on every auth event (login, hourly TOKEN_REFRESHED,
// etc). Listeners must only be attached ONCE, otherwise each auth event stacks
// another copy — duplicate foreground notifications and duplicate token writes.
let pushListenersAttached = false;

async function registerPushToken() {
  try {
    await setupNotificationChannels();
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== "granted") {
      logger.warn("[Native] Push permission denied");
      return;
    }

    if (pushListenersAttached) {
      // Listeners already live — just re-register so the current user's token
      // is (re)saved after a login/logout cycle.
      await PushNotifications.register();
      return;
    }
    pushListenersAttached = true;

    // ── Token received / refreshed ──────────────────────────────────────────
    PushNotifications.addListener("registration", async (token) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const platform = Capacitor.getPlatform(); // 'ios' | 'android'
      const endpoint = `native:${platform}:${token.value}`;

      const row = {
        user_id:  user.id,
        endpoint,
        p256dh:   null,
        auth:     null,
        keys:     { platform, token: token.value, native: true },
        updated_at: new Date().toISOString(),
      };

      // Keep one current native token per user/platform. Some existing projects
      // have old duplicate web-push rows, so do not rely on a global endpoint
      // unique constraint for native tokens.
      await supabase
        .from("push_subscriptions")
        .delete()
        .eq("endpoint", endpoint);

      const { error } = await supabase.from("push_subscriptions").insert(row as any);
      if (error) logger.warn("[Native] Token upsert error:", error.message);
      else logger.log("[Native] Push token registered/refreshed:", platform);
    });

    PushNotifications.addListener("registrationError", (err) =>
      logger.warn("[Native] Push registration error:", err)
    );

    // ── Foreground push received ────────────────────────────────────────────
    // FCM/APNs suppress the notification UI when the app is in the foreground.
    // We re-display it as a LocalNotification so the user still sees it.
    // For support_ticket pushes (sent data-only, see send-notification), this
    // also fires while backgrounded/killed — see file header — so we attach
    // the reply action here too.
    PushNotifications.addListener("pushNotificationReceived", async (notification) => {
      const data  = (notification.data as any) ?? {};
      const title = notification.title ?? data.title ?? "Tahleem Academy";
      const body  = notification.body  ?? data.message ?? "";
      const url   = data.url ?? null;

      const isSupportTicket = data.type === "support_ticket";
      const ticketId = isSupportTicket ? extractTicketId(url) : null;

      try {
        await LocalNotifications.schedule({
          notifications: [{
            id:    Math.floor(Math.random() * 100000),
            title,
            body,
            extra: { url, ticketId },
            // Use the same sound configured in capacitor.config.ts
            sound: "adhan.wav",
            smallIcon: "ic_stat_icon",
            iconColor: "#D4AF37",
            channelId: CLASS_CHANNEL_ID,
            ...(ticketId ? { actionTypeId: SUPPORT_REPLY_ACTION_TYPE } : {}),
          }],
        });
      } catch (e) {
        logger.warn("[Native] Foreground local notification failed:", e);
      }
    });

    // ── Notification tapped (background / system tray) ──────────────────────
    // This is the primary path students hit — tapping a class reminder /
    // ring-live-class push from the system tray. See navigateToUrl() below.
    PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const url = (action.notification.data as any)?.url;
      if (url) navigateToUrl(url);
    });

    // Register AFTER every listener is attached so the first token event
    // can never be missed.
    await PushNotifications.register();

  } catch (e) {
    pushListenersAttached = false;
    logger.warn("[Native] Push setup failed:", e);
  }
}

// ── Local notifications ───────────────────────────────────────────────────────

async function setupLocalNotifications() {
  try {
    await setupNotificationChannels();
    await registerReplyActionType();
    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== "granted") {
      logger.warn("[Native] Local notification permission denied");
      return;
    }
    LocalNotifications.addListener("localNotificationActionPerformed", (a) => {
      const extra = (a.notification.extra as any) ?? {};
      // Reply action: post straight to the ticket, no need to open the screen.
      if (a.actionId === "reply" && (a as any).inputValue && extra.ticketId) {
        sendTicketReply(extra.ticketId, (a as any).inputValue);
        return;
      }
      if (extra.url) navigateToUrl(extra.url);
    });
  } catch (e) {
    logger.warn("[Native] Local notifications setup failed:", e);
  }
}

// ── SPA navigation bridge ────────────────────────────────────────────────────
// FIX (student-only "reload on resume" bug): deep links and local-notification
// taps used to call window.location.assign(), which throws away the entire
// React app and loads the URL as a brand-new document — full AuthContext
// re-init, fresh Supabase realtime connections, everything. Since class
// reminders / live-class rings are what routinely bring students back into
// the app, this fired constantly for students and almost never for
// teachers/admins, who don't get those notifications. Route through the
// app's own router instead so this is an ordinary client-side navigation.
//
// setNavigateRef() is called once from inside <BrowserRouter> (see App.tsx)
// as soon as a router is mounted. Until then — or if for any reason no
// router has registered — we fall back to the old hard-navigation behavior
// rather than silently dropping the link.
let navigateRef: ((path: string) => void) | null = null;

export function setNavigateRef(fn: ((path: string) => void) | null): void {
  navigateRef = fn;
}

function navigateToUrl(url: string): void {
  try {
    const u = new URL(url, window.location.origin);
    const target = u.pathname + u.search + u.hash;
    if (!target) return;
    if (navigateRef) {
      navigateRef(target);
    } else {
      window.location.assign(target);
    }
  } catch {
    // Not a parseable URL (e.g. already a bare path) — try it as-is.
    if (navigateRef) navigateRef(url);
    else window.location.assign(url);
  }
}

// ── Deep links ────────────────────────────────────────────────────────────────

function setupDeepLinks() {
  CapApp.addListener("appUrlOpen", ({ url }) => {
    navigateToUrl(url);
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
  await setupNotificationChannels();
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
