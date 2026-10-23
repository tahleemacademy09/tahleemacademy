/*
  ctcLive.ts — live "read and reveal" helpers (CTC test mode, ?ctc=1).
    LiveMic    taps the microphone stream the page already records and hands out 16 kHz mono Float32 chunks
    revealFor  turns "N page words heard so far" into the per-ayah progress the Mushaf page cover understands
*/
import { refTokens } from "./recitationCompare";
import { stripMarks } from "./ctcAlign";

const TARGET = 16000;
const WORKLET = `class P extends AudioWorkletProcessor{constructor(){super();this.b=new Float32Array(2048);this.n=0}
process(i){const c=i[0]&&i[0][0];if(c){for(let k=0;k<c.length;k++){this.b[this.n++]=c[k];if(this.n===2048){this.port.postMessage(this.b.slice(0));this.n=0}}}return true}}
registerProcessor("ctc-live",P);`;

export class LiveMic {
  private ctx: AudioContext | null = null;
  private nodes: AudioNode[] = [];
  private tail = new Float32Array(0);
  private phase = 0;

  /** Resample whatever rate the device gives us to 16 kHz (linear — plenty for speech). */
  private push(x: Float32Array, onChunk: (s: Float32Array) => void) {
    const rate = this.ctx?.sampleRate ?? TARGET;
    if (rate === TARGET) { onChunk(x); return; }
    const ratio = rate / TARGET;
    const m = new Float32Array(this.tail.length + x.length);
    m.set(this.tail); m.set(x, this.tail.length);
    const out: number[] = [];
    let ph = this.phase;
    while (ph + 1 < m.length) {
      const i0 = Math.floor(ph), f = ph - i0;
      out.push(m[i0] * (1 - f) + m[i0 + 1] * f);
      ph += ratio;
    }
    const used = Math.floor(ph);
    this.tail = m.slice(Math.min(used, m.length));
    this.phase = ph - used;
    if (out.length) onChunk(Float32Array.from(out));
  }

  async start(stream: MediaStream, onChunk: (samples: Float32Array) => void): Promise<void> {
    const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    let ctx: AudioContext;
    try { ctx = new AC({ sampleRate: TARGET }); } catch { ctx = new AC(); }
    this.ctx = ctx;
    try { await ctx.resume(); } catch { /* noop */ }
    const src = ctx.createMediaStreamSource(stream);
    const mute = ctx.createGain(); mute.gain.value = 0;     // nodes only run when connected to the output; muted so nothing is heard
    mute.connect(ctx.destination);
    this.nodes = [src, mute];
    try {
      if (!ctx.audioWorklet) throw new Error("no audioWorklet");
      const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      const node = new AudioWorkletNode(ctx, "ctc-live", { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
      node.port.onmessage = (e) => this.push(e.data as Float32Array, onChunk);
      src.connect(node); node.connect(mute);
      this.nodes.push(node);
    } catch {
      // older WebViews: ScriptProcessor still works everywhere
      const sp = ctx.createScriptProcessor(2048, 1, 1);
      sp.onaudioprocess = (e) => this.push(new Float32Array(e.inputBuffer.getChannelData(0)), onChunk);
      src.connect(sp); sp.connect(mute);
      this.nodes.push(sp);
    }
  }

  stop() {
    try { this.nodes.forEach((n) => { try { n.disconnect(); } catch { /* noop */ } }); } catch { /* noop */ }
    try { void this.ctx?.close(); } catch { /* noop */ }
    this.nodes = []; this.ctx = null; this.tail = new Float32Array(0); this.phase = 0;
  }
}

/** Per-ayah progress ("surah:ayah" → m of n words, f = fraction of the ayah's letters) for the first `shown` page words. */
export function revealFor(
  ayahs: { text: string; numberInSurah: number; surah: { number: number } }[],
  shown: number,
): Record<string, { m: number; n: number; f: number }> {
  const out: Record<string, { m: number; n: number; f: number }> = {};
  let left = shown;
  for (const a of ayahs) {
    if (left <= 0) break;
    const words = refTokens(a.text);
    const n = words.length;
    if (!n) continue;
    const m = Math.min(left, n);
    left -= m;
    const lens = words.map((w) => Math.max(1, stripMarks(w).length));
    const total = lens.reduce((x, y) => x + y, 0);
    const done = lens.slice(0, m).reduce((x, y) => x + y, 0);
    out[`${a.surah.number}:${a.numberInSurah}`] = { m, n, f: done / total };
  }
  return out;
}
