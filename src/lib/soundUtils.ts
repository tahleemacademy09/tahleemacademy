// src/lib/soundUtils.ts — Tahleem Academy
// Web Audio API tones for class join / leave events.
// No external dependencies; works offline and on Android WebView.

const makeCtx = (): AudioContext | null => {
  try {
    const A = (window as any).AudioContext ?? (window as any).webkitAudioContext;
    return A ? new A() : null;
  } catch { return null; }
};

function tone(
  ac: AudioContext,
  freq: number,
  type: OscillatorType,
  vol: number,
  startSec: number,
  durSec: number,
) {
  const osc  = ac.createOscillator();
  const gain = ac.createGain();
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.type            = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, ac.currentTime + startSec);
  gain.gain.linearRampToValueAtTime(vol, ac.currentTime + startSec + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + startSec + durSec);
  osc.start(ac.currentTime + startSec);
  osc.stop(ac.currentTime + startSec + durSec + 0.05);
}

/** Ascending C–E–G chime — played when joining a live class. */
export function playJoinSound(): void {
  const ac = makeCtx();
  if (!ac) return;
  ac.resume().catch(() => {});
  tone(ac, 523, "sine", 0.18, 0.00, 0.25); // C5
  tone(ac, 659, "sine", 0.15, 0.14, 0.25); // E5
  tone(ac, 784, "sine", 0.12, 0.28, 0.35); // G5
}

/** Descending soft tones — played when leaving a class. */
export function playLeaveSound(): void {
  const ac = makeCtx();
  if (!ac) return;
  ac.resume().catch(() => {});
  tone(ac, 523, "sine", 0.12, 0.00, 0.30);
  tone(ac, 440, "sine", 0.10, 0.14, 0.30);
  tone(ac, 349, "sine", 0.08, 0.28, 0.40);
}

/** Speaks a short phrase out loud, if the browser supports it. Best-effort —
 *  silently does nothing if speechSynthesis isn't available (already the
 *  pattern used elsewhere in this app, e.g. StudentDashboard/AdhkaarPage). */
function speak(text: string): void {
  try {
    if (!("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95;
    u.volume = 1;
    window.speechSynthesis.speak(u);
  } catch {}
}

/** Two short rising beeps (distinct from the join chime) + a spoken
 *  "Recording started" — played for everyone in the room when the
 *  admin/teacher starts recording. */
export function playRecordingStartSound(): void {
  const ac = makeCtx();
  if (ac) {
    ac.resume().catch(() => {});
    tone(ac, 880, "square", 0.10, 0.00, 0.12);
    tone(ac, 880, "square", 0.10, 0.18, 0.12);
  }
  speak("Recording started");
}

/** A single lower tone + a spoken "Recording stopped" — played for everyone
 *  in the room when the admin/teacher stops (or pauses) recording. */
export function playRecordingStopSound(): void {
  const ac = makeCtx();
  if (ac) {
    ac.resume().catch(() => {});
    tone(ac, 440, "square", 0.10, 0.00, 0.22);
  }
  speak("Recording stopped");
}
