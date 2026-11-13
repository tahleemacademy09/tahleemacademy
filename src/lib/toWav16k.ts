// src/lib/toWav16k.ts
// Decode any recorded blob (webm/opus on Android+Chrome, mp4/aac on iOS) and re-encode as 16 kHz mono 16-bit WAV.
// No gain/normalisation is applied (boosting the signal made transcription worse in earlier tests).

/** Decode any recorded blob to mono 16 kHz samples. */
export async function decodeToPcm16k(blob: Blob): Promise<Float32Array> {
  const AC: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new AC();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  } finally {
    ctx.close?.();
  }
  const rate = 16000;
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * rate)), rate);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  return (await off.startRendering()).getChannelData(0);
}

/** 16 kHz mono samples → 16-bit WAV file. */
export function pcm16kToWav(pcm: Float32Array): Blob {
  const rate = 16000;
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + pcm.length * 2, true); str(8, "WAVE"); str(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

export async function blobToWav16k(blob: Blob): Promise<Blob> {
  return pcm16kToWav(await decodeToPcm16k(blob));
}
