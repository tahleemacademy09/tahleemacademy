import { describe, it, expect } from "vitest";
import { DAYS, TOTAL_DAYS, computeProgress, currentDay, rankFor, badgesFor } from "./ramadanJourney";

const finish = (days: number[]) => new Set(days.flatMap((d) => DAYS[d - 1].tasks.map((t) => t.id)));

describe("ramadan journey", () => {
  it("has 30 days with 4 tasks each and unique ids", () => {
    expect(DAYS).toHaveLength(TOTAL_DAYS);
    const ids = DAYS.flatMap((d) => d.tasks.map((t) => t.id));
    expect(new Set(ids).size).toBe(120);
  });
  it("the odd nights of the last ten carry a bonus", () => {
    expect(DAYS[22].qadr).toBe(true);
    expect(DAYS[22].tasks[1].xp).toBeGreaterThan(DAYS[21].tasks[1].xp);
  });
  it("currentDay counts local calendar days", () => {
    expect(currentDay(new Date(2027, 1, 7, 23, 59), "2027-02-08")).toBe(0);
    expect(currentDay(new Date(2027, 1, 8, 0, 1), "2027-02-08")).toBe(1);
    expect(currentDay(new Date(2027, 2, 9, 12), "2027-02-08")).toBe(30);
    expect(currentDay(new Date(2027, 2, 10, 12), "2027-02-08")).toBe(31);
  });
  it("traveller moves on once a day is finished", () => {
    expect(computeProgress(new Set(), 5, 5).travelerDay).toBe(1);
    expect(computeProgress(finish([1]), 5, 5).travelerDay).toBe(2);
    expect(computeProgress(finish([1, 2, 3, 4, 5]), 5, 5).travelerDay).toBe(5);
  });
  it("partial day is neither done nor open", () => {
    const s = new Set([DAYS[0].tasks[0].id]);
    expect(computeProgress(s, 3, 3).statuses.slice(0, 3)).toEqual(["partial", "open", "open"]);
    expect(computeProgress(s, 3, 3).statuses[3]).toBe("locked");
  });
  it("streak: unfinished today does not break it, a missed day does", () => {
    expect(computeProgress(finish([1, 2, 3]), 4, 4).streak).toBe(3);
    expect(computeProgress(finish([1, 2, 3, 4]), 4, 4).streak).toBe(4);
    expect(computeProgress(finish([1, 3, 4]), 4, 4).streak).toBe(2);
    expect(computeProgress(finish([1, 2, 3]), 6, 6).streak).toBe(0);
  });
  it("xp, rank and badges", () => {
    const p = computeProgress(finish([1, 2, 3, 4, 5, 6, 7]), 8, 8);
    expect(p.xp).toBe(7 * 60);
    expect(rankFor(p.daysDone).name.en).toBe("Steadfast");
    expect(badgesFor(p, finish([1, 2, 3, 4, 5, 6, 7])).find((b) => b.id === "s7")?.earned).toBe(true);
  });
  it("finishing everything puts the traveller on day 30", () => {
    const all = finish(Array.from({ length: 30 }, (_, i) => i + 1));
    const p = computeProgress(all, 30, 30);
    expect(p.daysDone).toBe(30); expect(p.travelerDay).toBe(30);
    expect(badgesFor(p, all).every((b) => b.earned)).toBe(true);
  });
});
