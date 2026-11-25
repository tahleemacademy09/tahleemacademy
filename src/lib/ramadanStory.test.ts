import { describe, it, expect } from "vitest";
import { STORIES, LANDMARKS, hasStory, storyFor, shuffledIndices, questionCount } from "./ramadanStory";
import { DAYS, TOTAL_DAYS } from "./ramadanJourney";

describe("ramadan story", () => {
  it("every day has a landmark and a playable story", () => {
    expect(LANDMARKS).toHaveLength(TOTAL_DAYS);
    for (const d of DAYS) expect(storyFor(d).length).toBeGreaterThan(1);
  });
  it("authored scenes are well formed and every learn card cites its source", () => {
    for (const [day, scenes] of Object.entries(STORIES)) {
      expect(hasStory(Number(day))).toBe(true);
      for (const s of scenes) {
        if (s.type === "quiz") { expect(s.options.filter((o) => o.right)).toHaveLength(1); expect(s.options.length).toBeGreaterThanOrEqual(2); }
        if (s.type === "order") expect(s.items.length).toBeGreaterThanOrEqual(2);
        if (s.type === "tap") expect(s.count).toBeGreaterThan(0);
        if (s.type === "learn") { expect(s.source.length).toBeGreaterThan(3); expect(s.arabic.length).toBeGreaterThan(3); }
        if (s.type === "reflect") expect(s.options.length).toBeGreaterThanOrEqual(2);
      }
      expect(questionCount(scenes)).toBeGreaterThan(0);
    }
  });
  it("an authored day's knowledge task is the story; other days keep the study task", () => {
    expect(DAYS[0].tasks[3].text.en).toContain("story");
    expect(DAYS[9].tasks[3].text.en).not.toContain("story");
  });
  it("the shuffle is deterministic and never already solved", () => {
    for (let n = 2; n <= 6; n++) {
      const a = shuffledIndices(n, 3);
      expect([...a].sort()).toEqual(Array.from({ length: n }, (_, i) => i));
      expect(a.every((v, i) => v === i)).toBe(false);
      expect(shuffledIndices(n, 3)).toEqual(a);
    }
  });
});
