// Listen to one spoken answer with the phone's own Arabic speech recognition (browser or the app; no model, nothing downloaded or uploaded).
// Used for the voice-answer questions of the daily revision test. Read & Reveal has its own, word-by-word reader.

import { getSpeechCtor } from "@/lib/nativeSpeech";

export const browserSpeechSupported = (): boolean => getSpeechCtor() !== null;

export interface Listener {
  /** stop listening and resolve with everything that was heard ("" = nothing) and the error, if the recogniser reported one */
  stop(): Promise<{ text: string; error: string }>;
  /** stop and throw everything away */
  cancel(): void;
}

/** Start listening. Returns null when this browser has no speech recognition or it could not start. */
export function startListening(): Listener | null {
  const SR = getSpeechCtor();
  if (!SR) return null;
  const rec = new SR();
  rec.lang = "ar-SA"; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
  let carried: string[] = [];      // what earlier sessions heard (Chrome ends a session after a stretch of silence)
  let sFinals: string[] = [];      // this session: finished phrases
  let sInterim = "";               // this session: the phrase still being heard
  let error = "";
  let ended = false;
  let wanted = true;               // false once stop()/cancel() was called
  let waiters: Array<() => void> = [];
  const text = () => [...carried, ...sFinals, sInterim].filter(Boolean).join(" ").trim();
  const finish = () => { ended = true; waiters.forEach((w) => w()); waiters = []; };

  rec.onresult = (e) => {
    sFinals = []; sInterim = "";
    for (let i = 0; i < e.results.length; i++) {
      const r = e.results[i];
      const t = r[0]?.transcript?.trim() ?? "";
      if (!t) continue;
      if (r.isFinal) sFinals.push(t); else sInterim = t;
    }
  };
  rec.onerror = (ev) => { if (ev.error !== "no-speech" && ev.error !== "aborted") error = ev.error; };
  rec.onend = () => {
    if (wanted && !error) {          // keep listening until the student taps stop
      carried = [...carried, ...sFinals, ...(sInterim ? [sInterim] : [])];
      sFinals = []; sInterim = "";
      try { rec.start(); return; } catch { /* fall through */ }
    }
    finish();
  };
  try { rec.start(); } catch { return null; }

  return {
    stop() {
      wanted = false;
      try { rec.stop(); } catch { /* noop */ }
      return new Promise((resolve) => {
        const done = () => resolve({ text: text(), error });
        if (ended) { done(); return; }
        waiters.push(done);
        setTimeout(done, 2500);      // never wait forever for onend
      });
    },
    cancel() {
      wanted = false;
      try { rec.abort(); } catch { /* noop */ }
    },
  };
}
