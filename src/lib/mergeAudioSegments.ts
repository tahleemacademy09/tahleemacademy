/*
  mergeAudioSegments.ts — joins the audio of a recitation that was recorded in several pieces
  (the student paused, closed or refreshed the app, and came back to continue) into ONE playable file.

  Every piece is a separate MediaRecorder file with its own header, so they cannot just be glued together.
  Each piece is decoded one at a time (keeps memory low on phones) and written into a single 16-bit mono WAV.
*/

const decode = (ctx: AudioContext, data: ArrayBuffer): Promise<AudioBuffer> =>
  new Promise((res, rej) => {
    // callback form works on old Safari too; the promise form is used when the browser returns one
    const p: any = ctx.decodeAudioData(data, res, rej);
    if (p && typeof p.then === "function") p.then(res, rej);
  });

function wavHeader(samples: number, rate: number): ArrayBuffer {
  const h = new ArrayBuffer(44);
  const v = new DataView(h);
  const s = (o: number, t: string) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  const bytes = samples * 2;
  s(0, "RIFF"); v.setUint32(4, 36 + bytes, true); s(8, "WAVE");
  s(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  s(36, "data"); v.setUint32(40, bytes, true);
  return h;
}

export async function mergeAudioSegments(blobs: Blob[], rate = 24000): Promise<Blob> {
  const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
  let ctx: AudioContext;
  try { ctx = new AC({ sampleRate: rate }); } catch { ctx = new AC(); }
  const outRate = ctx.sampleRate;
  const parts: Int16Array[] = [];
  let total = 0;
  try {
    for (const b of blobs) {
      if (!b || b.size < 1000) continue;
      try {
        const buf = await decode(ctx, await b.arrayBuffer());
        const d0 = buf.getChannelData(0);
        const d1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null;
        const out = new Int16Array(buf.length);
        for (let i = 0; i < out.length; i++) {
          let x = d1 ? (d0[i] + d1[i]) / 2 : d0[i];
          x = x > 1 ? 1 : x < -1 ? -1 : x;
          out[i] = x < 0 ? x * 0x8000 : x * 0x7fff;
        }
        parts.push(out); total += out.length;
      } catch (e) {
        console.warn("[mergeAudioSegments] a piece could not be decoded and was skipped:", e);
      }
    }
  } finally { try { void ctx.close(); } catch { /* noop */ } }
  if (!total) throw new Error("no decodable audio");
  return new Blob([wavHeader(total, outRate), ...(parts as unknown as BlobPart[])], { type: "audio/wav" });
}
