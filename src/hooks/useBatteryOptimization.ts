// src/hooks/useBatteryOptimization.ts
// OEM battery-optimization / auto-start whitelist bridge for Tahleem Academy
// live classes. No-op on iOS and web.
//
// WHY THIS EXISTS:
// A real Android Foreground Service (useForegroundService.ts) is enough on
// stock Android — it stops the OS from killing the process. But Samsung,
// Xiaomi, Huawei, Oppo, Vivo, and other OEMs layer their OWN battery/
// auto-start manager on top of stock Android that can still kill or freeze
// a backgrounded app's process even with a foreground service running,
// unless the user has explicitly whitelisted the app in THAT manufacturer's
// settings screen. This is the most common real-world reason "my foreground
// service should have fixed this but the call still drops" reports turn out
// to be device-specific, not app-specific.
//
// This can only be requested — never silently applied — because Google Play
// policy prohibits requesting direct Power Management exemption unless the
// app's core function depends on it (true here: live audio/video calling).

import { Capacitor } from "@capacitor/core";
import { logger } from "@/lib/logger";

const STORAGE_KEY = "tahleem_battery_opt_prompted_v1";

// Loaded lazily (not a static import) so a missing/broken native-only
// package can never break the web bundle or the build itself. Only ever
// actually resolved on Android native, where it must be present anyway.
async function loadDontKillMyApp() {
  try {
    const mod = await import(
      /* @vite-ignore */ "@squareetlabs/capacitor-dont-kill-my-app"
    );
    return mod.DontKillMyApp;
  } catch (e) {
    logger.warn("[BatteryOptimization] plugin unavailable:", e);
    return null;
  }
}

function isAndroidNative(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

/** Whether we've already asked once on this device (don't nag every class). */
export function hasPromptedBatteryOptimization(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function markPrompted(): void {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch { /* ignore */ }
}

/**
 * Check whether it's worth showing the "allow background running" prompt —
 * true only on Android native, and only if we haven't already asked.
 * Safe to call anywhere; resolves false on iOS/web/already-asked.
 */
export async function shouldPromptBatteryOptimization(): Promise<boolean> {
  if (!isAndroidNative() || hasPromptedBatteryOptimization()) return false;
  const DontKillMyApp = await loadDontKillMyApp();
  if (!DontKillMyApp) return false;
  try {
    const { isAvailable } = await DontKillMyApp.isBatterySaverPermissionAvailable();
    return isAvailable;
  } catch (e) {
    logger.warn("[BatteryOptimization] availability check failed:", e);
    return false;
  }
}

/**
 * Opens the OS/OEM battery-saver + auto-start whitelist flow for this app.
 * Call this from a real user tap (a settings dialog button), not
 * automatically — these screens require a genuine user gesture on most
 * OEMs and it's a much better experience to explain WHY first.
 */
export async function requestRunInBackground(): Promise<void> {
  if (!isAndroidNative()) return;
  markPrompted();
  const DontKillMyApp = await loadDontKillMyApp();
  if (!DontKillMyApp) return;
  try {
    await DontKillMyApp.requestRunInBackground();
  } catch (e) {
    logger.warn("[BatteryOptimization] requestRunInBackground failed:", e);
  }
}

/** User dismissed the prompt without acting — still remember so we don't nag. */
export function dismissBatteryOptimizationPrompt(): void {
  markPrompted();
}
