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

  • Layer 3 — WakeLock (screen stays on while active, releases on stop)

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
    // Re-acquire wake lock if it was released (screen-off / interrupted)
    acquireWakeLock();
    // Ping the service worker so it doesn't sleep
    pingServiceWorker();
  }, 20_000);
}

function stopHeartbeat(): void {
  if (heartbeat) {
    clearInterval(heartbeat);
    heartbeat = null;
  }
}

// ── MediaSession helper ──────────────────────────────────────────────────────
function clearMediaSession(): void {
  if (!("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.metadata       = null;
    navigator.mediaSession.playbackState  = "none";
    (["play","pause","stop","previoustrack","nexttrack"] as MediaSessionAction[])
      .forEach(a => { try { navigator.mediaSession.setActionHandler(a, null); } catch {} });
  } catch {}
}

// ── Public API ───────────────────────────────────────────────────────────────

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
    // Autoplay blocked (browser requires user gesture).
    // Fine — the element stays ready; next user interaction unblocks it.
  });

  // ── Heartbeat ──────────────────────────────────────────────────────────
  startHeartbeat();

  // ── WakeLock ───────────────────────────────────────────────────────────
  acquireWakeLock();

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
      acquireWakeLock();
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
