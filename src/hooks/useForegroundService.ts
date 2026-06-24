// src/hooks/useForegroundService.ts
// Native Android Foreground Service bridge for Tahleem Academy live classes.
// Keeps the WebView process alive when the home button is pressed on Android.
// On iOS / web this is a no-op (iOS uses BGProcessingTask differently).

import { Capacitor } from "@capacitor/core";

// We call the plugin via the Capacitor plugin bridge directly to avoid
// a missing-module error on web/iOS where the plugin isn't loaded.
const getPlugin = () => {
  try {
    // capacitor-plugin-foreground-service registers as "ForegroundService"
    return (window as any)?.Capacitor?.Plugins?.ForegroundService ?? null;
  } catch {
    return null;
  }
};

export interface ForegroundServiceConfig {
  title:   string;   // Notification title e.g. "Live Class in progress"
  body:    string;   // Notification body  e.g. "Al-Hadith · Tahleem Academy"
  id?:     number;   // Notification ID    (default 1001)
  icon?:   string;   // Drawable name      (default "ic_stat_icon")
  color?:  string;   // Hex color          (default "#064E3B")
}

let _running = false;

/**
 * Start the Android foreground service.
 * Shows a persistent notification and prevents the OS from killing the process.
 * Safe to call multiple times — idempotent.
 */
export async function startForegroundService(cfg: ForegroundServiceConfig): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const plugin = getPlugin();
  if (!plugin) {
    console.warn("[ForegroundService] Plugin not available — install capacitor-plugin-foreground-service");
    return;
  }
  if (_running) {
    // Update notification text without restarting
    await plugin.updateNotification?.({
      title:           cfg.title,
      body:            cfg.body,
      notificationId:  cfg.id ?? 1001,
    }).catch(() => {});
    return;
  }
  try {
    await plugin.startForegroundService({
      title:              cfg.title,
      body:               cfg.body,
      notificationId:     cfg.id   ?? 1001,
      notificationIcon:   cfg.icon ?? "ic_stat_icon",
      notificationColor:  cfg.color ?? "#064E3B",
    });
    _running = true;
  } catch (e) {
    console.error("[ForegroundService] start failed:", e);
  }
}

/**
 * Stop the Android foreground service and dismiss the notification.
 */
export async function stopForegroundService(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const plugin = getPlugin();
  if (!plugin || !_running) return;
  try {
    await plugin.stopForegroundService();
    _running = false;
  } catch (e) {
    console.error("[ForegroundService] stop failed:", e);
  }
}

export const isForegroundServiceRunning = () => _running;
