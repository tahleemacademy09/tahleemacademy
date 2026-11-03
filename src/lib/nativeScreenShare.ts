/**
 * nativeScreenShare.ts — Tahleem Academy
 * ─────────────────────────────────────────────────────────────────
 * Screen sharing inside the Android app.
 *
 * Android's WebView has no getDisplayMedia(), so the web way of sharing
 * (room.localParticipant.setScreenShareEnabled) can't work in the app.
 * Instead a native plugin (android/.../ScreenSharePlugin.kt) captures the
 * screen with Android's MediaProjection and publishes it to the class as a
 * second, publish-only participant whose identity is "<userId>::screen".
 *
 * The livekit-token edge function already issues that token when called
 * with { subject_id, screen_share: true }.
 */
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

export type ShareMode = "app" | "screen";
export type ShareQuality = "low" | "medium" | "high";
export interface ShareOptions {
  /** "app" = pick ONE app (Android 14+ hides everything else, incl. notifications). "screen" = whole screen. */
  mode: ShareMode;
  quality: ShareQuality;
  /** Turn on Do Not Disturb while sharing so notification pop-ups never show. */
  silenceNotifications: boolean;
}
export const DEFAULT_SHARE_OPTIONS: ShareOptions = { mode: "app", quality: "medium", silenceNotifications: true };

const OPTS_KEY = "tahleem_share_opts_v1";
export function loadShareOptions(): ShareOptions {
  try { return { ...DEFAULT_SHARE_OPTIONS, ...JSON.parse(localStorage.getItem(OPTS_KEY) || "{}") }; } catch { return DEFAULT_SHARE_OPTIONS; }
}
export function saveShareOptions(o: ShareOptions) {
  try { localStorage.setItem(OPTS_KEY, JSON.stringify(o)); } catch { /* ignore */ }
}

interface ScreenSharePlugin {
  start(opts: { url: string; token: string; mode: ShareMode; quality: ShareQuality; silenceNotifications: boolean }): Promise<void>;
  stop(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  isSharing(): Promise<{ sharing: boolean }>;
  hasDndAccess(): Promise<{ granted: boolean }>;
  openDndSettings(): Promise<void>;
  addListener(event: "stopped", cb: (e: { reason?: string }) => void): Promise<PluginListenerHandle>;
}

const ScreenShare = registerPlugin<ScreenSharePlugin>("ScreenShare");

/** True for the hidden helper participant that carries a phone's screen. */
/** Turn any share error into a clear title + description for a toast. */
export function describeShareError(e: any): { title: string; description: string; cancelled: boolean } {
  const msg: string = e?.message || String(e || "Unknown error");
  const code: string = e?.code || e?.name || "";
  const stageTitles: Record<string, string> = {
    DIALOG: "Couldn't open Android's share dialog",
    PERMISSION: "Screen capture permission problem",
    SERVICE: "Couldn't start the screen-share service",
    CONNECT: "Couldn't connect the screen to the class",
    CAPTURE: "Android wouldn't let the app capture the screen",
    PUBLISH: "Couldn't send the screen to the class",
    BUSY: "Screen share is already starting",
    BAD_ARGS: "Missing class details",
    DND_NEEDED: "One more step",
    NotAllowedError: "Screen share permission denied",
    NotSupportedError: "Screen share not supported on this device",
  };
  const key = String(code).toUpperCase() in stageTitles ? String(code).toUpperCase() : String(code);
  return {
    title: stageTitles[key] || "Screen share failed",
    description: `${msg}${code && !msg.includes(String(code)) ? `  [${code}]` : ""}`,
    cancelled: key === "DENIED" || key === "NotAllowedError",
  };
}

export const isScreenBot = (identity?: string | null) => !!identity && identity.endsWith("::screen");

/** Only the Android app has the native plugin. */
export const canNativeScreenShare = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";

export async function startNativeScreenShare(
  ids: { subjectId?: string | null; sessionId?: string | null },
  opts: ShareOptions = DEFAULT_SHARE_OPTIONS,
) {
  let subjectId = ids.subjectId || null;
  if (!subjectId && ids.sessionId) {
    const { data } = await supabase.from("live_sessions").select("subject_id").eq("id", ids.sessionId).maybeSingle();
    subjectId = (data as any)?.subject_id || null;
  }
  if (!subjectId) throw new Error("Could not tell which class this is");

  const { data, error } = await supabase.functions.invoke("livekit-token", {
    body: { subject_id: subjectId, screen_share: true },
  });
  if (error || !data?.token || !data?.url) {
    throw new Error((data as any)?.error || error?.message || "Could not get a screen-share token");
  }
  let silence = opts.silenceNotifications;
  if (silence) {
    // Do Not Disturb needs a one-time permission. Send the user to the switch and stop here.
    const { granted } = await ScreenShare.hasDndAccess().catch(() => ({ granted: false }));
    if (!granted) {
      await ScreenShare.openDndSettings().catch(() => {});
      const err: any = new Error("Allow Tahleem under Do Not Disturb access, come back, then tap Share again");
      err.code = "DND_NEEDED";
      throw err;
    }
  }
  await ScreenShare.start({ url: data.url, token: data.token, mode: opts.mode, quality: opts.quality, silenceNotifications: silence });
}

export async function pauseNativeScreenShare() { await ScreenShare.pause(); }
export async function resumeNativeScreenShare() { await ScreenShare.resume(); }

export async function stopNativeScreenShare() {
  try { await ScreenShare.stop(); } catch { /* nothing was running */ }
}

/** Called when sharing ends from outside the app (system "Stop" button, call dropped). */
export function onNativeScreenShareStopped(cb: (reason?: string) => void): () => void {
  let handle: PluginListenerHandle | undefined;
  let cancelled = false;
  ScreenShare.addListener("stopped", (e) => cb(e?.reason)).then(h => { if (cancelled) h.remove(); else handle = h; }).catch(() => {});
  return () => { cancelled = true; handle?.remove(); };
}
