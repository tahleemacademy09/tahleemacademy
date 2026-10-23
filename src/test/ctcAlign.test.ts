import { describe, it, expect } from "vitest";
import { canonMarks, modelForm, ctcForcedAlign, scoreWords, ctcStatus, fft512, chunkAtQuiet, SpEncoder, type SpVocab } from "@/lib/ctcAlign";

describe("canonMarks — shadda order", () => {
  it("makes both stored orders identical", () => {
    const a = "ٱللَّهُ";               // one stored order
    const b = a.replace("\u0651\u064E", "\u064E\u0651");   // the other order
    expect(canonMarks(a, true)).toBe(canonMarks(b, true));
    expect(canonMarks(a, false)).toBe(canonMarks(b, false));
  });
  it("shaddaFirst decides the order", () => {
    expect(canonMarks("ل\u064E\u0651", true)).toBe("ل\u0651\u064E");
    expect(canonMarks("ل\u0651\u064E", false)).toBe("ل\u064E\u0651");
  });
  it("modelForm: alef wasla, quranic sukun, dagger alef", () => {
    expect(modelForm("ٱلرَّحْمَٰنِ", true, true)).toContain("ا");
    expect(modelForm("\u0671")).toBe("\u0627");
    expect(modelForm("ن\u06E1")).toBe("ن\u0652");
  });
});

describe("fft512", () => {
  it("matches a naive DFT", () => {
    const re = new Float64Array(512), im = new Float64Array(512);
    for (let i = 0; i < 512; i++) re[i] = Math.sin(i * 0.3) + 0.5 * Math.cos(i * 1.1);
    const x = Float64Array.from(re);
    fft512(re, im);
    for (const k of [0, 1, 7, 100, 256]) {
      let sr = 0, si = 0;
      for (let n = 0; n < 512; n++) { sr += x[n] * Math.cos((2 * Math.PI * k * n) / 512); si -= x[n] * Math.sin((2 * Math.PI * k * n) / 512); }
      expect(re[k]).toBeCloseTo(sr, 6); expect(im[k]).toBeCloseTo(si, 6);
    }
  });
});

describe("CTC forced alignment", () => {
  // 3 tokens (ids 0,1,2), blank 3. Frames: strong 0, blank, strong 1, strong 2.
  const V = 4, T = 5;
  const mk = (rows: number[][]) => Float32Array.from(rows.flatMap((r) => r.map((p) => Math.log(p))));
  const hi = 0.97, lo = 0.01;
  const row = (k: number) => [0, 1, 2, 3].map((i) => (i === k ? hi : lo));
  it("scores said words ~0 and an unsaid word very low", () => {
    const lp = mk([row(0), row(3), row(1), row(2), row(2)]);
    const wt = [[0], [1], [2]];
    const path = ctcForcedAlign(lp, T, V, [0, 1, 2], 3)!;
    const ok = scoreWords(lp, V, path, wt, 0.08);
    expect(ok.every((w) => ctcStatus(w.mean) === "ok")).toBe(true);
    // audio contains only tokens 0 and 2 — token 1 was "skipped"
    const lp2 = mk([row(0), row(0), row(3), row(2), row(2)]);
    const path2 = ctcForcedAlign(lp2, T, V, [0, 1, 2], 3)!;
    const sk = scoreWords(lp2, V, path2, wt, 0.08);
    expect(ctcStatus(sk[1].mean)).toBe("bad");
    expect(ctcStatus(sk[0].mean)).toBe("ok");
  });
  it("returns null when the audio is too short", () => {
    expect(ctcForcedAlign(mk([row(0)]), 1, V, [0, 1, 2], 3)).toBeNull();
  });
});

describe("SpEncoder", () => {
  const v: SpVocab = {
    pieces: ["<unk>", "▁", "▁ا", "ل", "▁الل", "ه", "لله", "<blank>"].slice(0, 7),
    scores: [0, -1, -5, -4, -2, -4, -3], types: [2, 1, 1, 1, 1, 1, 1], unkId: 0, blank: 7, shaddaFirst: true, hasDiacritics: false,
  };
  const enc = new SpEncoder(v);
  it("segments by best score", () => { expect(enc.encode("لله")).toEqual([1, 6]); });
  it("uses unk for unknown characters", () => { expect(enc.encode("ق")).toContain(0); });
});

describe("chunkAtQuiet", () => {
  it("keeps short audio whole and cuts long audio at the quiet gap", () => {
    expect(chunkAtQuiet(new Float32Array(16000 * 20)).length).toBe(1);
    const a = new Float32Array(16000 * 70).fill(0.2);
    a.fill(0, 16000 * 31, 16000 * 31.2);
    const parts = chunkAtQuiet(a);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.reduce((s, p) => s + p.length, 0)).toBe(a.length);
    expect(Math.abs(parts[0].length / 16000 - 31.1)).toBeLessThan(0.3);
  });
});
