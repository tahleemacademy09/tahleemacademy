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

interface ScreenSharePlugin {
  start(opts: { url: string; token: string }): Promise<void>;
  stop(): Promise<void>;
  isSharing(): Promise<{ sharing: boolean }>;
  addListener(event: "stopped", cb: () => void): Promise<PluginListenerHandle>;
}

const ScreenShare = registerPlugin<ScreenSharePlugin>("ScreenShare");

/** True for the hidden helper participant that carries a phone's screen. */
export const isScreenBot = (identity?: string | null) => !!identity && identity.endsWith("::screen");

/** Only the Android app has the native plugin. */
export const canNativeScreenShare = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";

export async function startNativeScreenShare(ids: { subjectId?: string | null; sessionId?: string | null }) {
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
  await ScreenShare.start({ url: data.url, token: data.token });
}

export async function stopNativeScreenShare() {
  try { await ScreenShare.stop(); } catch { /* nothing was running */ }
}

/** Called when sharing ends from outside the app (system "Stop" button, call dropped). */
export function onNativeScreenShareStopped(cb: () => void): () => void {
  let handle: PluginListenerHandle | undefined;
  let cancelled = false;
  ScreenShare.addListener("stopped", cb).then(h => { if (cancelled) h.remove(); else handle = h; }).catch(() => {});
  return () => { cancelled = true; handle?.remove(); };
}
