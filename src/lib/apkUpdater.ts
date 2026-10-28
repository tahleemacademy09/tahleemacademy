// src/lib/apkUpdater.ts
//
// In-app APK update: download inside the app (with progress), then hand the
// file to Android's installer. Needs the native ApkInstaller plugin
// (android/.../ApkInstallerPlugin.java). Older APKs without it fall back to
// the browser download, see useAppRelease.
//
// One shared store so the banner, the "Get the App" page and the mandatory
// update screen all show the same progress.

import { useSyncExternalStore } from "react";
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";

interface ApkInstallerPlugin {
  download(o: { url: string; fileName: string }): Promise<{ path: string; size: number }>;
  install(o: { path: string }): Promise<{ started: boolean; needsPermission?: boolean }>;
  canInstall(): Promise<{ allowed: boolean }>;
  addListener(
    ev: "progress",
    cb: (p: { received: number; total: number }) => void,
  ): Promise<PluginListenerHandle>;
}

const ApkInstaller = registerPlugin<ApkInstallerPlugin>("ApkInstaller");

export const inAppInstallSupported = (): boolean =>
  Capacitor.isNativePlatform() &&
  Capacitor.getPlatform() === "android" &&
  Capacitor.isPluginAvailable("ApkInstaller");

export type UpdatePhase =
  | "idle"
  | "signing"
  | "downloading"
  | "ready"
  | "needs-permission"
  | "installing"
  | "error";

export interface UpdaterState {
  phase: UpdatePhase;
  code: number | null;
  received: number;
  total: number;
  path: string | null;
  error: string | null;
}

let state: UpdaterState = { phase: "idle", code: null, received: 0, total: 0, path: null, error: null };
const listeners = new Set<() => void>();
const set = (patch: Partial<UpdaterState>) => {
  state = { ...state, ...patch };
  listeners.forEach(l => l());
};

export const getUpdaterState = () => state;
export const useUpdaterState = (): UpdaterState =>
  useSyncExternalStore(
    cb => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => state,
    () => state,
  );

export const isUpdaterBusy = () =>
  state.phase === "signing" || state.phase === "downloading";

async function launchInstaller(path: string): Promise<void> {
  const r = await ApkInstaller.install({ path });
  set({ phase: r.needsPermission ? "needs-permission" : "installing" });
}

/**
 * Downloads (once per version) and starts the installer.
 * `getUrl` returns a fresh signed download URL; `onDownloaded` records the download.
 */
export async function runInAppUpdate(
  release: { version_code: number; file_name: string },
  getUrl: () => Promise<string>,
  onDownloaded?: () => Promise<void>,
): Promise<void> {
  if (isUpdaterBusy()) return;

  // Already downloaded this version — just open the installer again.
  if (state.path && state.code === release.version_code) {
    try { await launchInstaller(state.path); }
    catch (e: any) { set({ phase: "error", error: e?.message ?? "Could not start the installer" }); throw e; }
    return;
  }

  set({ phase: "signing", code: release.version_code, received: 0, total: 0, path: null, error: null });
  let handle: PluginListenerHandle | null = null;
  try {
    const url = await getUrl();
    set({ phase: "downloading" });
    handle = await ApkInstaller.addListener("progress", p => set({ received: p.received, total: p.total }));
    const { path } = await ApkInstaller.download({ url, fileName: release.file_name || "tahleem-update.apk" });
    await handle.remove();
    handle = null;
    set({ phase: "ready", path });
    try { await onDownloaded?.(); } catch { /* recording the download must never block the update */ }
    await launchInstaller(path);
  } catch (e: any) {
    try { await handle?.remove(); } catch { /* ignore */ }
    set({ phase: "error", error: e?.message ?? "Download failed. Please try again." });
    throw e;
  }
}

// Coming back from Android's settings / installer screen:
//  - permission just granted → open the installer automatically
//  - installer was cancelled  → offer the Install button again
if (Capacitor.isNativePlatform()) {
  CapApp.addListener("appStateChange", ({ isActive }) => {
    if (!isActive || !state.path) return;
    if (state.phase === "needs-permission") {
      void launchInstaller(state.path).catch(() => set({ phase: "ready" }));
    } else if (state.phase === "installing") {
      set({ phase: "ready" });
    }
  });
}
