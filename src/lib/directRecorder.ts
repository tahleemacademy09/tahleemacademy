/*
  directRecorder.ts — Tahleem Academy
  ─────────────────────────────────────────────────────────────────────
  DIRECT (in-browser) class recording. Replaces the server-side LiveKit
  Egress recording. Currently AUDIO-ONLY (see RECORD_VIDEO below).

  What gets recorded
    • Audio : everyone in the class, mixed — the teacher's mic plus every
              subscribed remote mic / screen-share audio (WebAudio mix).
    • Video : drawn onto a 854x480 canvas — a screen share if there is one,
              otherwise the teacher's camera, otherwise the first student
              camera. When a screen is shared the teacher camera sits in
              the bottom-right corner. If the class connection drops, the
              frame says "Reconnecting…" and the recording keeps going.

  How it is saved (see recordingOutbox.ts)
    Every chunk is written to the device first, then uploaded to R2 in the
    background and deleted only once the server has the file. A dropped
    connection, ending class offline, or a crashed app never loses the
    recording — it finishes uploading as soon as it can.
*/
import { RoomEvent, Track } from "livekit-client";
import { api, appendChunk, createJob, drainUntilIdle, finalizeJob, markLive, unmarkLive, sleep, hasJobForSession, resumePendingRecordings } from "@/lib/recordingOutbox";

// ── AUDIO-ONLY switch ──────────────────────────────────────────────────
// false = records audio only (≈ 9 MB/hour in total). Set to true to bring the
// video (screen share / camera canvas) back — nothing else needs to change.
export const RECORD_VIDEO = false;

// ── size vs quality knobs ──────────────────────────────────────────────
// A class is mostly a talking head or slides, so video can be small; speech
// is what matters, so audio is tuned for clarity at a tiny size.
// Audio ≈ 9 MB/hour, whole file ≈ 145 MB/hour (was ≈ 430 MB).
const W = 854, H = 480, FPS = 10;
const VIDEO_BPS = 300_000;
const AUDIO_BPS = 20_000;   // mono speech: 20 kbps ≈ 9 MB/hour (raise to 24_000 ≈ 11 MB/hr if it ever sounds thin)
const AUDIO_RATE = 24_000;  // 24 kHz = full speech range (up to 12 kHz); the encoder spends its few bits on voice, not on unused highs

// mp4 first (plays on iPhones/iPads too); webm only if the device can't do mp4.
const AUDIO_MIME_CANDIDATES = [
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/webm;codecs=opus",
  "audio/webm",
];
const VIDEO_MIME_CANDIDATES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

export const pickMime = (): string | null => {
  if (typeof MediaRecorder === "undefined") return null;
  return (RECORD_VIDEO ? VIDEO_MIME_CANDIDATES : AUDIO_MIME_CANDIDATES).find(m => { try { return MediaRecorder.isTypeSupported(m); } catch { return false; } }) || null;
};

export const directRecordingSupported = (): boolean =>
  typeof window !== "undefined" &&
  !!pickMime() &&
  (!RECORD_VIDEO || typeof (HTMLCanvasElement.prototype as any).captureStream === "function") &&
  !!((window as any).AudioContext || (window as any).webkitAudioContext);

export type RecState = "idle" | "starting" | "recording" | "paused" | "stopping";
type Handlers = { onState?: (s: RecState) => void; onError?: (m: string) => void };

// One live recorder per class session, kept at module level so the
// recording survives RecController unmounting/remounting (the classroom is
// a fixed overlay that can re-render) — it only ends on Stop / class end.
const active = new Map<string, DirectRecorder>();
export const getActiveRecorder = (sessionId: string) => active.get(sessionId) || null;

/** On opening a class: first push anything this device still holds (it may have
 *  unsent data), and only if this device has nothing for the session ask the server
 *  to close a recording abandoned by ANOTHER device. */
export async function recoverStaleRecording(sessionId: string): Promise<{ active?: boolean; recovered?: boolean; local?: boolean }> {
  await resumePendingRecordings();
  if (await hasJobForSession(sessionId)) return { local: true };
  return api("recover", { session_id: sessionId });
}

export class DirectRecorder {
  state: RecState = "idle";
  private recordingId = "";
  private mime = "";
  private room: any;
  private rec: MediaRecorder | null = null;
  private ctx: AudioContext | null = null;
  private dest: MediaStreamAudioDestinationNode | null = null;
  private bus: GainNode | null = null;
  private srcs = new Map<string, MediaStreamAudioSourceNode>();
  private canvas: HTMLCanvasElement | null = null;
  private c2d: CanvasRenderingContext2D | null = null;
  private vstream: MediaStream | null = null;
  private worker: Worker | null = null;
  private fallbackTimer: any = null;
  private els = new Map<string, { el: HTMLVideoElement; track: any }>();
  private holder: HTMLDivElement | null = null;
  private wake: any = null;
  private onVis: (() => void) | null = null;
  private onRoom: (() => void) | null = null;
  private nextStart = 0;                       // byte offset of the next chunk in the stream
  private chain: Promise<void> = Promise.resolve(); // chunks are written to disk strictly in order
  private releaseLock: (() => void) | null = null;
  private accMs = 0;
  private resumedAt = 0;

  constructor(private opts: { sessionId: string; subjectId: string; getRoom: () => any } & Handlers) {}

  setHandlers(h: Handlers) { this.opts = { ...this.opts, ...h }; }
  private set(s: RecState) { this.state = s; this.opts.onState?.(s); }
  elapsedSeconds() { return Math.floor((this.accMs + (this.state === "recording" ? performance.now() - this.resumedAt : 0)) / 1000); }

  async start() {
    if (this.state !== "idle") return;
    const room = this.opts.getRoom();
    if (!room) throw new Error("Not connected to the class yet");
    const mime = pickMime();
    if (!mime) throw new Error("This device can't record directly");
    this.room = room; this.mime = mime;
    this.set("starting");
    try {
      const info = await api("start", { session_id: this.opts.sessionId, subject_id: this.opts.subjectId, mime });
      this.recordingId = info.recording_id;
      await createJob({ rid: this.recordingId, sessionId: this.opts.sessionId, subjectId: this.opts.subjectId, mime,
        createdAt: Date.now(), partsDone: 0, final: false, duration: null });
      markLive(this.recordingId);
      // Hold a cross-tab lock so another tab/the resumer never touches this recording while it is live.
      const locks = (navigator as any).locks;
      if (locks?.request) locks.request(`tahleem-rec-${this.recordingId}`, () => new Promise<void>(res => { this.releaseLock = res; }));
      await this.buildAudio();
      if (RECORD_VIDEO) this.buildVideo();
      const stream = new MediaStream([...(RECORD_VIDEO ? this.vstream!.getVideoTracks() : []), ...this.dest!.stream.getAudioTracks()]);
      this.rec = new MediaRecorder(stream, RECORD_VIDEO
        ? { mimeType: mime, videoBitsPerSecond: VIDEO_BPS, audioBitsPerSecond: AUDIO_BPS }
        : { mimeType: mime, audioBitsPerSecond: AUDIO_BPS });
      this.rec.ondataavailable = (e) => {
        if (!e.data || !e.data.size) return;
        const blob = e.data, start = this.nextStart;
        this.nextStart += blob.size;
        // device first (survives crashes / offline), then nudge the uploader
        this.chain = this.chain
          .then(() => appendChunk(this.recordingId, start, blob))
          .then(() => { void drainUntilIdle(this.recordingId, 0); })
          .catch(() => this.opts.onError?.("Can't save the recording on this device (storage full?)"));
      };
      this.rec.onerror = () => this.opts.onError?.("Recorder error");
      this.rec.start(4000);
      this.resumedAt = performance.now();
      this.lockScreen();
      active.set(this.opts.sessionId, this);
      this.set("recording");
    } catch (e) {
      this.teardown();
      this.releaseLock?.(); unmarkLive(this.recordingId);
      if (this.recordingId) api("abort", { recording_id: this.recordingId }).catch(() => {});
      this.set("idle");
      throw e;
    }
  }

  pause() {
    if (this.state !== "recording" || !this.rec) return;
    try { this.rec.pause(); } catch { return; }
    this.accMs += performance.now() - this.resumedAt;
    this.set("paused");
  }

  resume() {
    if (this.state !== "paused" || !this.rec) return;
    try { this.rec.resume(); } catch { return; }
    this.resumedAt = performance.now();
    this.set("recording");
  }

  /** Stops capturing. Resolves "uploaded" if the file is already complete on the
   *  server, or "on-device" if it's safely stored here and will upload in the
   *  background as soon as the connection allows. */
  async stop(): Promise<"uploaded" | "on-device"> {
    if (this.state === "idle" || this.state === "stopping" || this.state === "starting") return "uploaded";
    if (this.state === "recording") this.accMs += performance.now() - this.resumedAt;
    this.set("stopping");
    const r = this.rec!;
    await new Promise<void>((res) => {
      r.onstop = () => res();
      try { if (r.state !== "inactive") r.stop(); else res(); } catch { res(); }
    });
    await this.chain; // every chunk is on disk
    const rid = this.recordingId;
    await finalizeJob(rid, Math.max(1, Math.round(this.accMs / 1000)));
    this.teardown();
    this.releaseLock?.(); unmarkLive(rid);
    active.delete(this.opts.sessionId);
    this.set("idle");
    // Try to finish the upload now (so the teacher gets a clear "saved"), but never
    // trap them: offline → skip straight to background; online → wait up to 20s.
    let result: "done" | "pending" = "pending";
    if (navigator.onLine) result = await Promise.race([drainUntilIdle(rid, Date.now() + 20_000), sleep(21_000).then(() => "pending" as const)]);
    if (result !== "done") void drainUntilIdle(rid, 0); // keep retrying in the background until it's saved
    return result === "done" ? "uploaded" : "on-device";
  }

  // ── audio: mix every live audio track in the room ─────────────────────
  private allPubs(): any[] {
    const out: any[] = [];
    const parts = [this.room.localParticipant, ...Array.from(this.room.remoteParticipants?.values?.() || [])];
    for (const p of parts as any[]) p?.trackPublications?.forEach?.((pub: any) => out.push({ pub, p }));
    return out;
  }

  private async buildAudio() {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    this.ctx = new Ctx({ sampleRate: AUDIO_RATE });
    await this.ctx!.resume().catch(() => {});
    // Speech chain: mix → cut rumble → even out loud/quiet speakers → mono.
    const bus = this.ctx!.createGain();                      // everyone's audio sums here
    const hp = this.ctx!.createBiquadFilter();               // remove low rumble / handling noise
    hp.type = "highpass"; hp.frequency.value = 90;
    const comp = this.ctx!.createDynamicsCompressor();       // far/quiet students come up, shouting won't clip
    comp.threshold.value = -26; comp.knee.value = 24; comp.ratio.value = 4;
    comp.attack.value = 0.005; comp.release.value = 0.25;
    const makeup = this.ctx!.createGain(); makeup.gain.value = 1.6;
    const limiter = this.ctx!.createDynamicsCompressor();    // safety net against clipping
    limiter.threshold.value = -3; limiter.knee.value = 0; limiter.ratio.value = 20;
    limiter.attack.value = 0.001; limiter.release.value = 0.1;
    this.dest = this.ctx!.createMediaStreamDestination();
    this.dest.channelCount = 1; this.dest.channelCountMode = "explicit"; // mono: half the audio data, same clarity for speech
    bus.connect(hp); hp.connect(comp); comp.connect(makeup); makeup.connect(limiter); limiter.connect(this.dest);
    this.bus = bus;
    this.syncAudio();
    this.onRoom = () => this.syncAudio();
    [RoomEvent.TrackSubscribed, RoomEvent.TrackUnsubscribed, RoomEvent.LocalTrackPublished,
     RoomEvent.LocalTrackUnpublished, RoomEvent.TrackMuted, RoomEvent.TrackUnmuted,
     RoomEvent.ParticipantConnected, RoomEvent.ParticipantDisconnected,
     RoomEvent.Reconnecting, RoomEvent.Reconnected, RoomEvent.Disconnected,
    ].forEach(e => this.room.on(e, this.onRoom!));
  }

  // NOTE: Chrome only feeds remote WebRTC audio into WebAudio while the
  // track is also playing in a media element. The classroom's
  // <RoomAudioRenderer/> already does that, so nothing extra is needed here.
  private syncAudio() {
    if (!this.ctx || !this.bus) return;
    const wanted = new Map<string, MediaStreamTrack>();
    for (const { pub } of this.allPubs()) {
      const mst: MediaStreamTrack | undefined = pub.track?.mediaStreamTrack;
      if (pub.kind === "audio" && mst && mst.readyState === "live") wanted.set(mst.id, mst);
    }
    for (const [id, node] of this.srcs) {
      if (!wanted.has(id)) { try { node.disconnect(); } catch {} this.srcs.delete(id); }
    }
    for (const [id, mst] of wanted) {
      if (this.srcs.has(id)) continue;
      try {
        const n = this.ctx.createMediaStreamSource(new MediaStream([mst]));
        n.connect(this.bus!); this.srcs.set(id, n);
      } catch {}
    }
  }

  // ── video: composite onto a canvas ────────────────────────────────────
  private buildVideo() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = W; this.canvas.height = H;
    this.c2d = this.canvas.getContext("2d")!;
    this.holder = document.createElement("div");
    this.holder.style.cssText = "position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none;overflow:hidden";
    document.body.appendChild(this.holder);
    this.vstream = (this.canvas as any).captureStream(FPS);
    this.draw();
    // A Worker timer keeps drawing when the tab/app is in the background
    // (normal timers get throttled to ~1/sec there and the video would freeze).
    try {
      const url = URL.createObjectURL(new Blob([`setInterval(()=>postMessage(0),${Math.round(1000 / FPS)})`], { type: "text/javascript" }));
      this.worker = new Worker(url);
      this.worker.onmessage = () => this.draw();
    } catch {
      this.fallbackTimer = setInterval(() => this.draw(), Math.round(1000 / FPS));
    }
  }

  private pickVideo() {
    let screen: any = null, camLocal: any = null, camRemote: any = null;
    for (const { pub, p } of this.allPubs()) {
      if (pub.kind !== "video" || !pub.track || pub.isMuted) continue;
      if (pub.source === Track.Source.ScreenShare) screen = screen || pub.track;
      else if (pub.source === Track.Source.Camera) {
        if (p === this.room.localParticipant) camLocal = pub.track; else camRemote = camRemote || pub.track;
      }
    }
    const cam = camLocal || camRemote;
    return { main: screen || cam, pip: screen ? cam : null };
  }

  private elFor(track: any): HTMLVideoElement {
    const key = track.sid || track.mediaStreamTrack?.id;
    let rec = this.els.get(key);
    if (!rec) {
      const el = document.createElement("video");
      el.muted = true; el.playsInline = true; el.autoplay = true;
      this.holder?.appendChild(el);
      track.attach(el);
      rec = { el, track }; this.els.set(key, rec);
    }
    return rec.el;
  }

  private drawContain(v: HTMLVideoElement, x: number, y: number, w: number, h: number) {
    if (!v.videoWidth || !v.videoHeight || v.readyState < 2) return;
    const s = Math.min(w / v.videoWidth, h / v.videoHeight);
    const dw = v.videoWidth * s, dh = v.videoHeight * s;
    this.c2d!.drawImage(v, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }

  private draw() {
    const c = this.c2d; if (!c || this.state === "paused") return;
    c.fillStyle = "#0b1410"; c.fillRect(0, 0, W, H);
    let main: any = null, pip: any = null;
    try { ({ main, pip } = this.pickVideo()); } catch {}
    if (main) this.drawContain(this.elFor(main), 0, 0, W, H);
    else { c.fillStyle = "#2d6a4f"; c.font = "bold 36px sans-serif"; c.textAlign = "center"; c.fillText("Tahleem Academy", W / 2, H / 2); }
    if (this.room?.state && this.room.state !== "connected") { // class link is down: say so on the video, keep recording
      c.fillStyle = "rgba(0,0,0,0.55)"; c.fillRect(0, 0, W, 64);
      c.fillStyle = "#fbbf24"; c.font = "bold 26px sans-serif"; c.textAlign = "center"; c.fillText("Reconnecting…", W / 2, 42);
    }
    if (pip) { const pw = Math.round(W * 0.22), ph = Math.round(pw * 9 / 16); this.drawContain(this.elFor(pip), W - pw - 16, H - ph - 16, pw, ph); }
  }

  // ── housekeeping ─────────────────────────────────────────────────────
  private async lockScreen() {
    try { this.wake = await (navigator as any).wakeLock?.request("screen"); } catch {}
    this.onVis = () => { if (document.visibilityState === "visible" && this.state !== "idle") this.lockScreen(); };
    document.addEventListener("visibilitychange", this.onVis);
  }

  private teardown() {
    try { if (this.onRoom) [RoomEvent.TrackSubscribed, RoomEvent.TrackUnsubscribed, RoomEvent.LocalTrackPublished,
      RoomEvent.LocalTrackUnpublished, RoomEvent.TrackMuted, RoomEvent.TrackUnmuted,
      RoomEvent.ParticipantConnected, RoomEvent.ParticipantDisconnected,
      RoomEvent.Reconnecting, RoomEvent.Reconnected, RoomEvent.Disconnected].forEach(e => this.room?.off(e, this.onRoom!)); } catch {}
    if (this.onVis) document.removeEventListener("visibilitychange", this.onVis);
    try { this.wake?.release?.(); } catch {}
    try { this.worker?.terminate(); } catch {}
    if (this.fallbackTimer) clearInterval(this.fallbackTimer);
    this.els.forEach(({ el, track }) => { try { track.detach(el); } catch {} el.remove(); });
    this.els.clear();
    this.holder?.remove();
    this.srcs.forEach(n => { try { n.disconnect(); } catch {} });
    this.srcs.clear();
    try { this.vstream?.getTracks().forEach(t => t.stop()); } catch {} // canvas track only — never LiveKit's own tracks
    try { this.ctx?.close(); } catch {}
    this.rec = null;
  }
}
