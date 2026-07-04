// src/hooks/useForegroundService.ts
// Android Foreground Service bridge for Tahleem Academy live classes.
// Keeps the WebView process alive when the app is backgrounded on Android.
// No-op on iOS and web.

import { Capacitor } from "@capacitor/core";
import {
  ForegroundService,
  Importance,
  ServiceType,
} from "@capawesome-team/capacitor-android-foreground-service";
import { LocalNotifications } from "@capacitor/local-notifications";
import { logger } from "@/lib/logger";

export interface ForegroundServiceConfig {
  title: string;
  body:  string;
  id?:   number;
  icon?: string;
  color?: string;
}

let _running = false;
let _prepared = false;
let _tapListener: { remove: () => Promise<void> } | null = null;
const CHANNEL_ID = "tahleem_live_class";

async function prepareForegroundService(): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return false;
  if (_prepared) return true;

  try {
    const perm = await ForegroundService.requestPermissions().catch(() => null);
    if (perm && perm.display !== "granted") {
      logger.warn("[ForegroundService] notification permission denied");
      return false;
    }

    await ForegroundService.createNotificationChannel({
      id: CHANNEL_ID,
      name: "Live classes",
      description: "Keeps an active Tahleem live class running in the background.",
      importance: Importance.Low,
    }).catch(() => {});

    // LocalNotifications is only a fallback UI; the foreground service above is
    // the actual Android mechanism that keeps the WebView process alive.
    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: "Live classes",
      description: "Active live class indicator",
      importance: 2,
      visibility: 1,
      vibration: false,
    }).catch(() => {});

    if (!_tapListener) {
      _tapListener = await ForegroundService.addListener("notificationTapped", () => {
        ForegroundService.moveToForeground().catch(() => {});
        window.dispatchEvent(new CustomEvent("tahleem:live-class-return"));
      }).catch(() => null);
    }

    _prepared = true;
    return true;
  } catch (e) {
    logger.warn("[ForegroundService] prepare failed:", e);
    return false;
  }
}

export async function startForegroundService(cfg: ForegroundServiceConfig): Promise<void> {
  const ready = await prepareForegroundService();
  if (!ready) return;

  const options = {
    title:     cfg.title,
    body:      cfg.body,
    id:        cfg.id ?? 1001,
    smallIcon: cfg.icon ?? "ic_stat_icon",
    notificationChannelId: CHANNEL_ID,
    serviceType: ServiceType.Microphone,
    silent: true,
    buttons: [],
  };

  if (_running) {
    await ForegroundService.updateForegroundService(options).catch(() => {});
    return;
  }
  try {
    await ForegroundService.startForegroundService(options);
    _running = true;
  } catch (e) {
    logger.error("[ForegroundService] start failed:", e);
  }
}

export async function stopForegroundService(): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android" || !_running) return;
  try {
    await ForegroundService.stopForegroundService();
    await LocalNotifications.cancel({ notifications: [{ id: 1001 }] }).catch(() => {});
    _running = false;
  } catch (e) {
    logger.error("[ForegroundService] stop failed:", e);
  }
}

export const isForegroundServiceRunning = () => _running;