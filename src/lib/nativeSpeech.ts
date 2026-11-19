// Speech recognition for BOTH places the app runs:
//   • a normal browser (Chrome) → the browser's own Web Speech API;
//   • the Android / iOS app (Capacitor) → the phone's own recogniser through the native plugin
//     @capgo/capacitor-speech-recognition (the app's WebView has no Web Speech API).
// Both are handed out through ONE constructor shaped like the Web Speech API, so the screens that listen
// (Read & Reveal, the voice answers of the test) do not care which one they got.
import { Capacitor, registerPlugin } from "@capacitor/core";

/* ── the part of the Web Speech API the screens use ───────────────────────────────────────────────────── */
export interface SpeechAlt { transcript: string }
export interface SpeechResult { isFinal: boolean; length: number; [i: number]: SpeechAlt }
export interface SpeechEvent { results: { length: number; [i: number]: SpeechResult } }
export interface SpeechErrorEvent { error: string }
export interface SpeechInstance {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: ((e: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  /** `track`: listen to this microphone track instead of opening the microphone a second time (newer Chrome only;
   *  older browsers ignore it and open the microphone themselves). */
  start(track?: MediaStreamTrack): void;
  stop(): void;
  abort(): void;
}
export type SpeechCtor = new () => SpeechInstance;

/* ── native plugin (only a thin handle: the plugin itself is added to the Android build by `cap sync`) ─────── */
interface NativePlugin {
  start(o: { language?: string; maxResults?: number; partialResults?: boolean; popup?: boolean }): Promise<unknown>;
  stop(): Promise<void>;
  requestPermissions(): Promise<{ speechRecognition?: string }>;
  addListener(name: string, cb: (e: any) => void): Promise<{ remove(): Promise<void> }>;
}
const Native = registerPlugin<NativePlugin>("SpeechRecognition");

/** true inside the installed app when this build contains the native speech plugin */
export const nativeSpeechAvailable = (): boolean => {
  try { return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("SpeechRecognition"); } catch { return false; }
};

/** The plugin reports Android recogniser errors as codes / words; the screens understand the Web Speech names. */
function mapError(code: string, message = ""): string {
  const c = `${code} ${message}`.toLowerCase();
  if (/permission|insufficient|not.?allowed|denied/.test(c)) return "not-allowed";
  if (/network|timeout.*network|server/.test(c)) return "network";
  if (/busy|audio|microphone|recorder/.test(c)) return "audio-capture";   // another recorder holds the microphone
  if (/no.?match|no.?speech|speech.?timeout|silence/.test(c)) return "no-speech";
  return "aborted";
}

class NativeSpeech implements SpeechInstance {
  lang = "ar-SA"; continuous = true; interimResults = true; maxAlternatives = 3;
  onresult: ((e: SpeechEvent) => void) | null = null;
  onerror: ((e: SpeechErrorEvent) => void) | null = null;
  onend: (() => void) | null = null;

  private handles: Array<{ remove(): Promise<void> }> = [];
  private alive = false;          // between start() and the session ending
  private last: string[] = [];    // the latest transcript(s) of this session
  private finalSent = false;

  private emit(final: boolean) {
    if (!this.last.length) return;
    const alts = this.last.slice(0, Math.max(1, this.maxAlternatives));
    const res: SpeechResult = { isFinal: final, length: alts.length };
    alts.forEach((t, i) => { res[i] = { transcript: t }; });
    this.onresult?.({ results: { length: 1, 0: res } });
    if (final) this.finalSent = true;
  }
  private cleanup() {
    const hs = this.handles; this.handles = [];
    hs.forEach((h) => { try { void h.remove(); } catch { /* noop */ } });
  }
  private end() {
    if (!this.alive) return;
    this.alive = false;
    if (!this.finalSent) this.emit(true);   // what was heard when the session closed counts as final
    this.cleanup();
    this.onend?.();
  }

  start() {
    if (this.alive) return;
    this.alive = true; this.last = []; this.finalSent = false;
    void (async () => {
      try {
        const perm = await Native.requestPermissions().catch(() => null);
        if (perm && perm.speechRecognition === "denied") { this.fail("not-allowed"); return; }
        this.handles.push(await Native.addListener("partialResults", (e: { matches?: string[] }) => {
          if (!this.alive) return;
          const m = (e?.matches ?? []).filter((x) => typeof x === "string" && x.trim());
          if (!m.length) return;
          this.last = m; this.emit(false);
        }));
        this.handles.push(await Native.addListener("listeningState", (e: { state?: string; status?: string }) => {
          if ((e?.state ?? e?.status) === "stopped") this.end();
        }));
        this.handles.push(await Native.addListener("error", (e: { code?: string; message?: string }) => {
          if (!this.alive) return;
          const mapped = mapError(String(e?.code ?? ""), String(e?.message ?? ""));
          if (mapped !== "no-speech" && mapped !== "aborted") this.onerror?.({ error: mapped });
          else if (mapped === "no-speech") this.onerror?.({ error: "no-speech" });
          // the session is over either way: 'listeningState: stopped' normally follows, but do not rely on it
          setTimeout(() => this.end(), 150);
        }));
        await Native.start({ language: this.lang, maxResults: this.maxAlternatives, partialResults: true, popup: false });
      } catch (err) {
        const msg = String((err as { message?: string })?.message ?? err);
        this.fail(mapError("", msg));
      }
    })();
  }
  private fail(code: string) {
    if (!this.alive) return;
    this.onerror?.({ error: code });
    this.end();
  }
  stop() { void Native.stop().catch(() => { /* ended already */ }); setTimeout(() => this.end(), 1200); }
  abort() {
    // the screens clear their handlers before aborting, so nothing is reported
    this.onresult = null; this.onerror = null; this.onend = null;
    this.alive = false; this.cleanup();
    void Native.stop().catch(() => { /* noop */ });
  }
}

/** The speech recogniser to use here (app → native plugin, browser → Web Speech API), or null when there is none. */
export function getSpeechCtor(): SpeechCtor | null {
  if (nativeSpeechAvailable()) return NativeSpeech as unknown as SpeechCtor;
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}
