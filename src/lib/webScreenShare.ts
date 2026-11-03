/**
 * webScreenShare.ts — browser screen sharing with an "app/window only" mode.
 * LiveKit's setScreenShareEnabled can't pass monitorTypeSurfaces, so we call
 * getDisplayMedia ourselves and publish the tracks.
 */
import { Track, type Room, type LocalTrackPublication } from "livekit-client";
import type { ShareOptions } from "@/lib/nativeScreenShare";

const RES = { low: { w: 1280, h: 720, fps: 10 }, medium: { w: 1920, h: 1080, fps: 15 }, high: { w: 2560, h: 1440, fps: 24 } } as const;

export async function startWebScreenShare(room: Room, opts: ShareOptions, onEnded: () => void) {
  const r = RES[opts.quality];
  const video: any = { width: { ideal: r.w }, height: { ideal: r.h }, frameRate: { ideal: r.fps } };
  if (opts.mode === "app") video.displaySurface = "window";
  const stream = await (navigator.mediaDevices as any).getDisplayMedia({
    video,
    audio: true,
    selfBrowserSurface: "exclude",
    surfaceSwitching: "include",
    systemAudio: "include",
    ...(opts.mode === "app" ? { monitorTypeSurfaces: "exclude" } : {}),
  });
  const v: MediaStreamTrack = stream.getVideoTracks()[0];
  try { (v as any).contentHint = "detail"; } catch { /* ignore */ }
  v.addEventListener("ended", onEnded);
  await room.localParticipant.publishTrack(v, {
    source: Track.Source.ScreenShare,
    simulcast: false,
    videoEncoding: { maxBitrate: 2_500_000, maxFramerate: r.fps },
  } as any);
  const a: MediaStreamTrack | undefined = stream.getAudioTracks()[0];
  if (a) await room.localParticipant.publishTrack(a, { source: Track.Source.ScreenShareAudio } as any);
}

export async function stopWebScreenShare(room: Room) {
  const lp = room.localParticipant;
  const pubs: LocalTrackPublication[] = [];
  lp.trackPublications.forEach((p: any) => {
    if (p.source === Track.Source.ScreenShare || p.source === Track.Source.ScreenShareAudio) pubs.push(p);
  });
  for (const p of pubs) {
    if (p.track) { await lp.unpublishTrack(p.track as any, true).catch(() => {}); }
  }
}

/** Mute / unmute the shared video without ending the share. */
export async function setWebScreenSharePaused(room: Room, paused: boolean) {
  const pub: any = room.localParticipant.getTrackPublication(Track.Source.ScreenShare);
  if (!pub) return;
  if (paused) await pub.mute(); else await pub.unmute();
}
