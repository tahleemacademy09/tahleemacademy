import { Capacitor, CapacitorHttp, registerPlugin } from "@capacitor/core";
import { App } from "@capacitor/app";
import { CapacitorUpdater } from "@capgo/capacitor-updater";
import { isReloadSafe, onReloadSafe } from "@/lib/reloadGuard";
import { logDiag } from "@/lib/diagnostics";

const RAW_BASE = (import.meta.env.VITE_OTA_BASE_URL as string | undefined)?.trim();
const BASE = RAW_BASE ? (/^https?:\/\//i.test(RAW_BASE) ? RAW_BASE : `https://${RAW_BASE}`).replace(/\/$/, "") : undefined;
const BUILT_IN = (import.meta.env.VITE_OTA_VERSION as string | undefined) ?? "builtin";

interface Manifest { version: string; url: string; minNativeBuild?: number; notes?: string }
export interface OtaReady { bundleId: string; version: string; notes?: string }

let ready: OtaReady | null = null;
let busy = false;
let lastCheck = 0;

export const getOtaReady = () => ready;

/** Last thing the updater did, so "why didn't it update?" can be answered on the phone. */
const STATUS_KEY = "ta_ota_status";
function status(step: string, extra?: Record<string, unknown>) {
  logDiag(`ota:${step}`, extra);
  try { localStorage.setItem(STATUS_KEY, JSON.stringify({ step, at: new Date().toISOString(), base: BASE ?? null, ...extra })); } catch { /* ignore */ }
}
export function getOtaStatus(): Record<string, unknown> | null {
  try { return JSON.parse(localStorage.getItem(STATUS_KEY) || "null"); } catch { return null; }
}

async function currentVersion(): Promise<string> {
  const { bundle } = await CapacitorUpdater.current();
  return bundle.version === "builtin" ? BUILT_IN : bundle.version;
}

// Native HTTP: no CORS rules, so the manifest loads whatever host serves it.
async function fetchManifest(): Promise<Manifest> {
  const url = `${BASE}/ota/manifest.json?t=${Date.now()}`;
  const res = await CapacitorHttp.get({ url, headers: { "Cache-Control": "no-cache" }, responseType: "json", connectTimeout: 15000, readTimeout: 15000 });
  if (res.status !== 200) throw new Error(`manifest HTTP ${res.status}`);
  const m = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
  if (!m?.version || !m?.url) throw new Error("manifest missing version/url");
  return m as Manifest;
}

export async function checkForOta(force = false): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  if (!BASE) { status("no-base-url"); return; }   // APK was built without the OTA_BASE_URL secret
  if (busy) return;
  if (!force && Date.now() - lastCheck < 10 * 60_000) return;
  lastCheck = Date.now();
  busy = true;
  try {
    status("checking");
    const m = await fetchManifest();
    const [cur, info] = await Promise.all([currentVersion(), App.getInfo()]);
    if (m.version === cur) { status("up-to-date", { cur }); return; }
    if (ready?.version === m.version) return;
    if (m.minNativeBuild && parseInt(info.build, 10) < m.minNativeBuild) {
      status("needs-new-apk", { need: m.minNativeBuild, have: info.build });
      return;
    }

    // Reuse a copy we already downloaded (e.g. banner dismissed, app restarted).
    let id: string | undefined;
    try {
      const { bundles } = await CapacitorUpdater.list();
      id = bundles.find((b) => b.version === m.version && b.status !== "error")?.id;
    } catch { /* fall through to download */ }
    if (!id) {
      status("downloading", { version: m.version });
      let pct = -1; const evts: string[] = [];
      const lh = await (CapacitorUpdater as any).addListener("download", (ev: any) => { pct = ev?.percent ?? pct; });
      const lf = await (CapacitorUpdater as any).addListener("downloadFailed", (ev: any) => { evts.push("downloadFailed " + JSON.stringify(ev)); });
      try { id = (await CapacitorUpdater.download({ url: m.url, version: m.version })).id; }
      catch (de: any) { throw new Error(`${de?.message ?? de} | pct=${pct} | err=${JSON.stringify(de, Object.getOwnPropertyNames(de ?? {}))} | ${evts.join(";")}`); }
      finally { try { lh.remove(); lf.remove(); } catch {} }
    }

    // Also queue it for the next app start, so it lands even if nobody taps the banner.
    try { await CapacitorUpdater.next({ id }); } catch { /* banner still works */ }

    ready = { bundleId: id, version: m.version, notes: m.notes };
    status("ready", { version: m.version });
    window.dispatchEvent(new Event("ta:ota-ready"));
  } catch (e: any) {
    let probe = "";
    try {
      const m2 = await fetchManifest();
      const t0 = Date.now();
      const r = await CapacitorHttp.get({ url: m2.url, headers: { Range: "bytes=0-99" }, responseType: "blob", connectTimeout: 15000, readTimeout: 30000 });
      const h = r.headers || {};
      probe = ` | probe: HTTP ${r.status}, ${Date.now() - t0}ms, type=${h["Content-Type"] ?? h["content-type"]}, len=${h["Content-Length"] ?? h["content-length"]}, range=${h["Content-Range"] ?? h["content-range"]}, enc=${h["Content-Encoding"] ?? h["content-encoding"]}`;
    } catch (pe: any) {
      probe = ` | probe failed: ${String(pe?.message ?? pe)}`;
    }
    try {
      const AI = registerPlugin<any>("ApkInstaller");
      const lg = await AI.readLog();
      probe += " | NATIVE LOG: " + String(lg?.log ?? "").replace(/\n/g, " ¶ ");
    } catch (le: any) { probe += " | readLog failed: " + String(le?.message ?? le); }
    status("failed", { error: String(e?.message ?? e) + probe });
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
  status("applying", { version: ready.version });
  await CapacitorUpdater.set({ id: ready.bundleId });
  return true;
}

/** Returns the first update check, so main.tsx can wait briefly for it before showing the app. Never rejects. */
export function initOta(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return Promise.resolve();
  // Must run first and fast: if this isn't called within ~10s of an update loading, the plugin rolls the update back.
  CapacitorUpdater.notifyAppReady().catch(() => {});
  const first = checkForOta(true);
  App.addListener("appStateChange", ({ isActive }) => { if (isActive) void checkForOta(); });
  return first;
}
