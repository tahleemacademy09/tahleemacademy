import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { CapacitorUpdater } from "@capgo/capacitor-updater";
import { isReloadSafe, onReloadSafe } from "@/lib/reloadGuard";

const BASE = (import.meta.env.VITE_OTA_BASE_URL as string | undefined)?.replace(/\/$/, "");
const BUILT_IN = (import.meta.env.VITE_OTA_VERSION as string | undefined) ?? "builtin";

interface Manifest { version: string; url: string; minNativeBuild?: number; notes?: string }
export interface OtaReady { bundleId: string; version: string; notes?: string }

let ready: OtaReady | null = null;
let busy = false;
let lastCheck = 0;

export const getOtaReady = () => ready;

async function currentVersion(): Promise<string> {
  const { bundle } = await CapacitorUpdater.current();
  return bundle.version === "builtin" ? BUILT_IN : bundle.version;
}

export async function checkForOta(force = false): Promise<void> {
  if (!Capacitor.isNativePlatform() || !BASE || busy || ready) return;
  if (!force && Date.now() - lastCheck < 10 * 60_000) return;
  lastCheck = Date.now();
  busy = true;
  try {
    const res = await fetch(`${BASE}/ota/manifest.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return;
    const m: Manifest = await res.json();
    const [cur, info] = await Promise.all([currentVersion(), App.getInfo()]);
    if (m.version === cur) return;
    if (m.minNativeBuild && parseInt(info.build, 10) < m.minNativeBuild) return;
    const bundle = await CapacitorUpdater.download({ url: m.url, version: m.version });
    ready = { bundleId: bundle.id, version: m.version, notes: m.notes };
    window.dispatchEvent(new Event("ta:ota-ready"));
  } catch (e) {
    console.warn("[OTA] check failed", e);
  } finally {
    busy = false;
  }
}

export async function applyOta(): Promise<boolean> {
  if (!ready) return false;
  if (!isReloadSafe()) {
    const off = onReloadSafe(() => { off(); void applyOta(); });
    return false;
  }
  await CapacitorUpdater.set({ id: ready.bundleId });
  return true;
}

export function initOta(): void {
  if (!Capacitor.isNativePlatform()) return;
  CapacitorUpdater.notifyAppReady().catch(() => {});
  void checkForOta(true);
  App.addListener("appStateChange", ({ isActive }) => { if (isActive) void checkForOta(); });
}
