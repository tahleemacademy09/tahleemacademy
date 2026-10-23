import { describe, it, expect } from "vitest";
import { splitAtPauses } from "@/lib/tarteelOnDevice";

const SR = 16000;
// speech = loud tone, pause = silence
function build(parts: Array<["s" | "p", number]>): Float32Array {
  const len = parts.reduce((a, [, sec]) => a + Math.round(sec * SR), 0);
  const x = new Float32Array(len);
  let o = 0;
  for (const [k, sec] of parts) {
    const n = Math.round(sec * SR);
    if (k === "s") for (let i = 0; i < n; i++) x[o + i] = 0.2 * Math.sin(i * 0.3);
    o += n;
  }
  return x;
}

describe("splitAtPauses", () => {
  it("leaves a short recording alone", () => {
    const x = build([["s", 10]]);
    const r = splitAtPauses(x, SR);
    expect(r).toHaveLength(1);
    expect(r[0].data.length).toBe(x.length);
  });

  it("cuts a long recording inside a pause, never inside speech", () => {
    const x = build([["s", 9], ["p", 0.6], ["s", 9], ["p", 0.6], ["s", 9], ["p", 0.6], ["s", 6]]);
    const r = splitAtPauses(x, SR);
    expect(r.length).toBeGreaterThanOrEqual(3);
    r.forEach(seg => expect(seg.overlapped).toBe(false));
    let off = 0;
    for (let i = 0; i < r.length - 1; i++) {
      off += r[i].data.length;
      // the sample at the cut is silent
      expect(Math.abs(x[off])).toBeLessThan(1e-6);
    }
    expect(r.reduce((a, s) => a + s.data.length, 0)).toBe(x.length);   // nothing lost
  });

  it("forces an overlapped cut when there is no pause", () => {
    const x = build([["s", 50]]);
    const r = splitAtPauses(x, SR);
    expect(r.length).toBeGreaterThanOrEqual(3);
    expect(r[1].overlapped).toBe(true);
    r.forEach(seg => expect(seg.data.length / SR).toBeLessThanOrEqual(22));
  });
});
