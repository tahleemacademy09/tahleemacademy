/*
  src/hooks/useBackgroundAudio.ts — Tahleem Academy
  ────────────────────────────────────────────────────
  WhatsApp / Google Meet-style background audio keep-alive.

  WHY a real <audio> element instead of AudioContext oscillator:
  ─────────────────────────────────────────────────────────────
  Chrome on Android 9+ detects when an AudioContext is playing silence
  (gain=0 / empty buffer) and classifies it as "silent audio". After ~30 s
  of screen lock it throttles the JS thread, killing LiveKit's WebRTC
  heartbeat and causing disconnection. A real <audio> element at volume=0.001
  (inaudible but non-zero) is treated as active media — Android grants audio
  focus and keeps the thread alive exactly as WhatsApp does.

  HOW IT WORKS (5 layers):
  ─────────────────────────
  • Layer 1 — <audio> element (looping silence at volume=0.001)
      Real media playback → Android grants audio focus → JS thread alive.

  • Layer 2 — setInterval heartbeat every 20 s
      Forces event-loop ticks even if Chrome background-throttles timers.
      Also re-plays the audio element if it somehow paused.

  • Layer 3 — WakeLock (screen stays on only while camera is active, via
      setWakeLockActive(); released on stop). Audio-only sessions skip this —
      Layer 1 + Layer 2 alone keep the thread alive, saving battery.

  • Layer 4 — MediaSession metadata + action handlers
      Shows Tahleem lock-screen card with "Return to Class" button.

  • Layer 5 — pageshow / resume / focus / visibilitychange listeners
      Re-starts all layers the moment the user unlocks / returns to tab.

  USAGE (in GlobalClassroomOverlay):
      import { startBackgroundAudio, stopBackgroundAudio } from "@/hooks/useBackgroundAudio";
      useEffect(() => {
        if (!hasConnected) { stopBackgroundAudio(); return; }
        startBackgroundAudio(title);
        return () => stopBackgroundAudio();
      }, [hasConnected, title]);
*/

// ── Silence WAV (base64) ────────────────────────────────────────────────────
// Valid minimal WAV: 44-byte header + empty data chunk.
// "Empty" data chunk with zero bytes still produces a valid looping audio element.
// Chrome / Android WebView treats it as active media regardless of content.
const SILENCE_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQAC" +
  "ABAAZGF0YQAAAAA=";

// ── Module-level singletons (survive React re-renders) ──────────────────────
let audioEl:    HTMLAudioElement | null    = null;
let wakeLock:   WakeLockSentinel | null   = null;
let resumeFn:   (() => void) | null       = null;
let heartbeat:  ReturnType<typeof setInterval> | null = null;

// Whether the screen wake lock should currently be held. Video sessions need
// the screen visibly on (there's a camera preview to show); audio-only
// sessions don't — the <audio> element (Layer 1) alone is what grants Android
// audio focus and keeps the JS thread alive per the note above, mirroring how
// WhatsApp keeps a voice call running without forcing the screen to stay lit.
// Defaults to true so any caller that never calls setWakeLockActive() keeps
// the original (video-safe) behaviour.
let wakeLockNeeded = true;

// ── Wake lock helper ─────────────────────────────────────────────────────────
async function acquireWakeLock(): Promise<void> {
  if (!("wakeLock" in navigator)) return;
  try {
    if (wakeLock && wakeLock.released === false) return; // already held
    wakeLock = await (navigator as any).wakeLock.request("screen");
  } catch { /* permission denied or API unavailable */ }
}

function releaseWakeLock(): void {
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}

// ── Service-worker keep-alive ping ───────────────────────────────────────────
// Pings the SW so it doesn't sleep during background. The SW handles
// LIVE_CLASS_KEEPALIVE and resets its idle timer.
function pingServiceWorker(): void {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: "LIVE_CLASS_KEEPALIVE" });
  } catch { /* SW not available */ }
}

// ── Heartbeat: keeps audio alive and SW awake every 20 s ────────────────────
function startHeartbeat(): void {
  if (heartbeat) return; // already running
  heartbeat = setInterval(() => {
    // Re-play if the OS paused it (screen lock, audio-focus steal)
    if (audioEl?.paused) {
      audioEl.play().catch(() => {});
    }
    // Re-acquire wake lock if it was released (screen-off / interrupted) —
    // only when this session actually needs the screen kept on.
    if (wakeLockNeeded) acquireWakeLock();
    // Ping the service worker so it doesn't sleep
    pingServiceWorker();
  }, 5_000);
}

function stopHeartbeat(): void {
  if (heartbeat) {
    clearInterval(heartbeat);
    heartbeat = null;
  }
}

// ── MediaSession helper ──────────────────────────────────────────────────────
const ALL_ACTIONS: MediaSessionAction[] = [
  "play","pause","stop","previoustrack","nexttrack","seekbackward","seekforward",
];

function clearMediaSession(): void {
  if (!("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.metadata      = null;
    navigator.mediaSession.playbackState = "none";
    ALL_ACTIONS.forEach(a => { try { navigator.mediaSession.setActionHandler(a, null); } catch {} });
  } catch {}
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Update the notification card to show live mic/camera controls.
 *
 * Android notification action mapping:
 *   seekbackward  → "⏮" icon slot  → repurposed as Mute/Unmute Mic
 *   seekforward   → "⏭" icon slot  → repurposed as Camera On/Off
 *   previoustrack → Return to Class
 *   stop          → Leave
 *
 * The MediaSession spec doesn't allow custom button labels, so we encode
 * mic/cam state into the notification title so the user can read it at a
 * glance from the lock screen:
 *   "🎙 ON  📹 OFF — Al-hadith"
 *
 * Call this whenever micEnabled or camEnabled changes.
 */
export function updateMediaSessionControls(opts: {
  title:         string;
  micOn:         boolean;
  camOn:         boolean;
  onToggleMic:   () => void;
  onToggleCam:   () => void;
  onReturn:      () => void;
  onLeave:       () => void;
}): void {
  if (!("mediaSession" in navigator)) return;
  const { title, micOn, camOn, onToggleMic, onToggleCam, onReturn, onLeave } = opts;
  try {
    // Title encodes live mic/cam state so it's readable on the lock screen
    const micLabel = micOn  ? "🎙 Mic ON"  : "🎙 Mic OFF";
    const camLabel = camOn  ? "📹 Cam ON"  : "📹 Cam OFF";
    navigator.mediaSession.metadata = new MediaMetadata({
      title:  `${title}`,
      artist: `${micLabel}  ·  ${camLabel}`,
      album:  "🔴 Live Class — Tahleem Academy",
      // Artwork: a simple coloured square that looks like a live indicator
      // (data URIs are the only cross-origin-safe artwork source)
      artwork: [
        { src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='96'%3E%3Crect width='96' height='96' rx='18' fill='%23064E3B'/%3E%3Ccircle cx='20' cy='48' r='8' fill='%23ef4444'/%3E%3Ctext x='36' y='53' font-family='sans-serif' font-size='22' fill='white'%3E🎙%3C/text%3E%3C/svg%3E", sizes: "96x96", type: "image/svg+xml" },
      ],
    });
    navigator.mediaSession.playbackState = "playing";

    const sa = (a: MediaSessionAction, h: MediaSessionActionHandler | null) => {
      try { navigator.mediaSession.setActionHandler(a, h); } catch {}
    };

    // Core class actions
    sa("stop",          onLeave);
    sa("previoustrack", onReturn);  // ⏮ = "Return to Class"
    sa("play",          onReturn);
    sa("pause",         onReturn);
    sa("nexttrack",     onReturn);

    // Repurposed slots → mic / cam toggles
    // seekbackward renders as a rewind-style button — we hijack it for mic
    // seekforward  renders as a fast-forward button — we hijack it for camera
    sa("seekbackward",  () => onToggleMic());
    sa("seekforward",   () => onToggleCam());
  } catch {}
}

/**
 * Tell the keep-alive whether it currently needs to hold the screen wake
 * lock — call this whenever camera state changes during a live session
 * (e.g. from GlobalClassroomOverlay, keyed on `camEnabled`).
 *
 * true  → acquires the wake lock (screen stays on; needed when there's a
 *         camera preview visible, exactly like a video call).
 * false → releases it (screen can lock; the <audio> element + heartbeat
 *         alone keep the JS thread alive for audio-only sessions, the same
 *         way WhatsApp keeps a voice call running without forcing the
 *         screen to stay lit).
 *
 * Safe to call before startBackgroundAudio() — it just updates the flag
 * that startBackgroundAudio/heartbeat/resumeFn read.
 */
export function setWakeLockActive(needed: boolean): void {
  wakeLockNeeded = needed;
  if (needed) {
    acquireWakeLock();
  } else {
    releaseWakeLock();
  }
}

/**
 * Start the background audio keep-alive.
 * Safe to call multiple times — idempotent (won't create duplicate elements).
 */
export function startBackgroundAudio(title = "Live Class"): void {
  // ── Audio element ──────────────────────────────────────────────────────
  if (!audioEl) {
    audioEl = document.createElement("audio");
    audioEl.src    = SILENCE_WAV;
    audioEl.loop   = true;
    audioEl.volume = 0.001;   // inaudible but non-zero → real audio focus
    audioEl.setAttribute("playsinline", "");
    audioEl.setAttribute("webkit-playsinline", "");
    audioEl.style.display = "none";
    document.body.appendChild(audioEl);
  }
  audioEl.play().catch(() => {
    // Autoplay blocked (browser requires a user gesture). The element stays
    // ready; the resume listeners below (pageshow/focus/visibilitychange)
    // will retry it, but those only fire on tab-switch/lock-unlock — if the
    // very first play() attempt was blocked and the user never leaves and
    // returns to the tab, none of them fire either. Chrome only shows the
    // MediaSession notification for a page while it has an ACTUALLY playing
    // <audio>/<video> element — metadata/playbackState alone aren't enough —
    // so a permanently-blocked play() here means the notification silently
    // never appears at all. Retry once on the next real tap/click anywhere
    // on the page, which always counts as a qualifying user gesture.
    const retryOnGesture = () => {
      audioEl?.play().catch(() => {});
      window.removeEventListener("pointerdown", retryOnGesture);
      window.removeEventListener("keydown",     retryOnGesture);
    };
    window.addEventListener("pointerdown", retryOnGesture, { once: true });
    window.addEventListener("keydown",     retryOnGesture, { once: true });
  });

  // ── Heartbeat ──────────────────────────────────────────────────────────
  startHeartbeat();

  // ── WakeLock ───────────────────────────────────────────────────────────
  if (wakeLockNeeded) acquireWakeLock();

  // ── MediaSession metadata ──────────────────────────────────────────────
  // Action handlers are wired by GlobalClassroomOverlay separately so they
  // stay up-to-date with the latest handleReturn / handleLeave callbacks.
  if ("mediaSession" in navigator) {
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title,
        artist: "Tahleem Academy",
        album:  "🟢 Live Class",
      });
      navigator.mediaSession.playbackState = "playing";
    } catch {}
  }

  // ── Wake-up listeners ──────────────────────────────────────────────────
  // These fire when the user returns from lock screen / background even if
  // visibilityState is still "hidden" for a brief moment (screen-lock path).
  if (!resumeFn) {
    resumeFn = () => {
      audioEl?.play().catch(() => {});
      if (wakeLockNeeded) acquireWakeLock();
      pingServiceWorker();
    };
    window.addEventListener("pageshow",         resumeFn);
    window.addEventListener("focus",            resumeFn);
    document.addEventListener("resume",         resumeFn as EventListener); // Capacitor
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") resumeFn?.();
    });
  }

  // ── Service-worker initial ping ────────────────────────────────────────
  pingServiceWorker();
}

/**
 * Stop the background audio keep-alive and clean up all resources.
 */
export function stopBackgroundAudio(): void {
  // ── Heartbeat ──────────────────────────────────────────────────────────
  stopHeartbeat();

  // ── Audio element ──────────────────────────────────────────────────────
  if (audioEl) {
    audioEl.pause();
    audioEl.src = "";
    audioEl.remove();
    audioEl = null;
  }

  // ── WakeLock ───────────────────────────────────────────────────────────
  releaseWakeLock();
  wakeLockNeeded = true; // reset to default for the next session

  // ── MediaSession ───────────────────────────────────────────────────────
  clearMediaSession();

  // ── Listeners ──────────────────────────────────────────────────────────
  if (resumeFn) {
    window.removeEventListener("pageshow", resumeFn);
    window.removeEventListener("focus",    resumeFn);
    document.removeEventListener("resume", resumeFn as EventListener);
    // Note: the visibilitychange handler captures resumeFn in closure —
    // we can't remove it precisely. It's a no-op after resumeFn = null.
    resumeFn = null;
  }
}
