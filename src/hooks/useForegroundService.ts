// src/hooks/useForegroundService.ts
// Android Foreground Service bridge for Tahleem Academy live classes.
// Keeps the WebView process alive when the app is backgrounded on Android.
// No-op on iOS and web.

import { Capacitor } from "@capacitor/core";

export interface ForegroundServiceConfig {
  title: string;
  body:  string;
  id?:   number;
  icon?: string;
  color?: string;
}

let _running = false;

// Dynamically import so web/iOS bundles never try to resolve the Android module.
async function getPlugin(): Promise<any | null> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return null;
  try {
    const mod: any = await import(
      /* @vite-ignore */ "@capawesome-team/capacitor-android-foreground-service"
    );
    return mod.ForegroundService ?? null;
  } catch {
    return null;
  }
}

export async function startForegroundService(cfg: ForegroundServiceConfig): Promise<void> {
  const plugin = await getPlugin();
  if (!plugin) return;
  if (_running) {
    await plugin.updateForegroundService?.({
      title:     cfg.title,
      body:      cfg.body,
      id:        cfg.id ?? 1001,
      smallIcon: cfg.icon ?? "ic_stat_icon",
    }).catch(() => {});
    return;
  }
  try {
    await plugin.startForegroundService({
      title:     cfg.title,
      body:      cfg.body,
      id:        cfg.id   ?? 1001,
      smallIcon: cfg.icon ?? "ic_stat_icon",
      buttons:   [],
    });
    _running = true;
  } catch (e) {
    console.error("[ForegroundService] start failed:", e);
  }
}

export async function stopForegroundService(): Promise<void> {
  const plugin = await getPlugin();
  if (!plugin || !_running) return;
  try {
    await plugin.stopForegroundService();
    _running = false;
  } catch (e) {
    console.error("[ForegroundService] stop failed:", e);
  }
}

export const isForegroundServiceRunning = () => _running;