import { describe, it, expect } from "vitest";
import { planWindows, gradeFromScore, buildTarteelWords, fillTimes } from "./tarteelScore";

const ok = { grade: "ok" as const };
const bad = { grade: "missed" as const };

describe("planWindows", () => {
  it("does nothing when CTC accepted everything", () => {
    expect(planWindows([ok, ok, ok], [0, 1, 2], [1, 2, 3], 3)).toEqual([]);
  });
  it("makes one window around a single doubtful word", () => {
    const g = Array.from({ length: 10 }, (_, i) => (i === 5 ? bad : ok));
    const st = g.map((_, i) => i), en = g.map((_, i) => i + 0.9);
    const w = planWindows(g, st, en, 10);
    expect(w).toHaveLength(1);
    expect(w[0].targets).toEqual([5]);
    expect(w[0].a).toBe(3); expect(w[0].b).toBe(7);
  });
  it("merges neighbouring targets into one window", () => {
    const g = Array.from({ length: 12 }, (_, i) => (i === 4 || i === 6 ? bad : ok));
    const st = g.map((_, i) => i), en = g.map((_, i) => i + 0.9);
    const w = planWindows(g, st, en, 12);
    expect(w).toHaveLength(1);
    expect(w[0].targets).toEqual([4, 6]);
  });
  it("keeps far-apart targets in separate windows", () => {
    const g = Array.from({ length: 30 }, (_, i) => (i === 3 || i === 25 ? bad : ok));
    const st = g.map((_, i) => i), en = g.map((_, i) => i + 0.9);
    expect(planWindows(g, st, en, 30)).toHaveLength(2);
  });
  it("never exceeds the model window", () => {
    const g = Array.from({ length: 80 }, (_, i) => (i % 3 === 0 ? bad : ok));
    const st = g.map((_, i) => i), en = g.map((_, i) => i + 0.9);
    for (const w of planWindows(g, st, en, 80)) expect(w.t1 - w.t0).toBeLessThanOrEqual(22.0001);
  });
  it("fills missing times from neighbours", () => {
    const { s, e } = fillTimes([0, null, 2], [1, null, 3], 3);
    expect(s[1]).toBeGreaterThanOrEqual(1); expect(e[1]).toBeLessThanOrEqual(2);
  });
});

describe("grading", () => {
  it("accepts confident words, softens middling ones, rejects the rest", () => {
    expect(gradeFromScore({ mean: -0.1, min: -0.4, top1: 1, n: 3 })).toBe("ok");
    expect(gradeFromScore({ mean: -1.5, min: -2.5, top1: 0.5, n: 3 })).toBe("close");
    expect(gradeFromScore({ mean: -5, min: -9, top1: 0, n: 3 })).toBe("wrong");
    expect(gradeFromScore(undefined)).toBe("missed");
  });
  it("builds one result per page word", () => {
    const r = buildTarteelWords(["a", "b"], new Map([[1, { mean: -0.1, min: -0.2, top1: 1, n: 2 }]]));
    expect(r.map((x) => x.grade)).toEqual(["missed", "ok"]);
  });
});
