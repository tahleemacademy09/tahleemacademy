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

  HOW IT WORKS:
  ─────────────
  • startBackgroundAudio(title)
      - Creates/resumes an <audio> element playing a 1-second looped silence
      - Sets MediaSession metadata so the OS lock screen shows "Tahleem Academy"
      - Acquires a WakeLock (keeps screen on while active, optional)
      - Listens to pageshow + resume + focus to restart after screen unlock

  • stopBackgroundAudio()
      - Pauses and removes the <audio> element
      - Clears MediaSession metadata
      - Releases WakeLock

  USAGE (in GlobalClassroomOverlay):
      import { startBackgroundAudio, stopBackgroundAudio } from "@/hooks/useBackgroundAudio";
      useEffect(() => {
        if (!hasConnected) { stopBackgroundAudio(); return; }
        startBackgroundAudio(title);
        return () => stopBackgroundAudio();
      }, [hasConnected, title]);
*/

// ── 1-second mono WAV of silence (base64) ──────────────────────────────────
// 44-byte WAV header + 44100 zero-bytes of 16-bit PCM mono @ 44100 Hz.
// Keeping it in code avoids an extra network request and works offline.
const SILENCE_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQAC" +
  "ABAAZGF0YQAAAAA=";

// ── Module-level singletons (survive React re-renders) ──────────────────────
let audioEl:    HTMLAudioElement | null    = null;
let wakeLock:   WakeLockSentinel | null   = null;
let resumeFn:   (() => void) | null       = null;

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

// ── MediaSession helper ──────────────────────────────────────────────────────
function setMediaSession(title: string, onReturn: () => void, onLeave: () => void): void {
  if (!("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist: "Tahleem Academy",
      album:  "🟢 Live Class",
    });
    navigator.mediaSession.playbackState = "playing";

    const sa = (a: MediaSessionAction, h: MediaSessionActionHandler | null) => {
      try { navigator.mediaSession.setActionHandler(a, h); } catch {}
    };
    // "play" and "pause" on the lock-screen card both mean "return to class"
    sa("play",          onReturn);
    sa("pause",         onReturn);
    sa("stop",          onLeave);
    sa("previoustrack", onReturn);
    sa("nexttrack",     onReturn);
  } catch {}
}

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
    // Keep out of tab audio indicator — it's purely a keep-alive signal
    audioEl.style.display = "none";
    document.body.appendChild(audioEl);
  }
  audioEl.play().catch(() => {
    // Autoplay blocked (browser requires user gesture).
    // This is fine — the element stays ready; the next user interaction
    // (mic toggle, chat, any button tap) will unblock it via resume().
  });

  // ── WakeLock ───────────────────────────────────────────────────────────
  acquireWakeLock();

  // ── MediaSession ───────────────────────────────────────────────────────
  // Handlers are wired by GlobalClassroomOverlay separately so they stay
  // up-to-date with the latest handleReturn / handleLeave callbacks.
  // We just set the metadata here.
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
  // visibilityState is still "hidden" for a brief moment.
  if (!resumeFn) {
    resumeFn = () => {
      audioEl?.play().catch(() => {});
      acquireWakeLock();
    };
    window.addEventListener("pageshow",  resumeFn);
    window.addEventListener("focus",     resumeFn);
    document.addEventListener("resume",  resumeFn as EventListener); // Capacitor
  }
}

/**
 * Stop the background audio keep-alive and clean up all resources.
 */
export function stopBackgroundAudio(): void {
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
    window.removeEventListener("pageshow",  resumeFn);
    window.removeEventListener("focus",     resumeFn);
    document.removeEventListener("resume",  resumeFn as EventListener);
    resumeFn = null;
  }
}
