// src/lib/hifdhPortion.ts
// Half-page arithmetic for Hifdh portions.
// A portion runs from (page_from, half_from) to (page_to, half_to), inclusive; half 0 = first half, 1 = second half.
//   ½ page → (50,0)-(50,0)    1 page → (50,0)-(50,1)    2 pages → (50,0)-(51,1)

export interface HifdhPortion {
  page_from: number;
  page_to: number;
  half_from?: number | null;
  half_to?: number | null;
  /** a second stretch read after the main one (weekly review: last slice wraps back to the start of Ankabut) */
  extra?: HifdhPortion | null;
}

/** 0-based half-page index: page 1 first half = 0 */
export const hpUnit = (page: number, half: number) => (page - 1) * 2 + half;
export const hpFromUnit = (u: number) => ({ page: Math.floor(u / 2) + 1, half: u % 2 });
export const HP_MAX_UNIT = 604 * 2 - 1;

/** How many half-pages a level asks for per memorization day (½ page → 1, 1 page → 2 …) */
export const hpUnitsFor = (dailyPages: number) => Math.max(1, Math.round((Number(dailyPages) || 0.5) * 2));

export const hpUnitsOf = (p: HifdhPortion) => ({
  start: hpUnit(p.page_from, p.half_from ?? 0),
  end: hpUnit(p.page_to, p.half_to ?? 1),
});

export const hpPortionFromUnits = (start: number, count: number) => {
  const s = Math.min(HP_MAX_UNIT, Math.max(0, start));
  const e = Math.min(HP_MAX_UNIT, s + Math.max(1, count) - 1);
  const a = hpFromUnit(s);
  const b = hpFromUnit(e);
  return { page_from: a.page, half_from: a.half, page_to: b.page, half_to: b.half };
};

const halfName = (h: number) => (h === 0 ? "1st half" : "2nd half");

const hpOneLabel = (p: HifdhPortion) => {
  const hf = p.half_from ?? 0;
  const ht = p.half_to ?? 1;
  if (p.page_from === p.page_to) {
    if (hf === 0 && ht === 1) return `Page ${p.page_from}`;
    if (hf === ht) return `Page ${p.page_from} · ${halfName(hf)}`;
    return `Page ${p.page_from}`;
  }
  if (hf === 0 && ht === 1) return `Pages ${p.page_from}–${p.page_to}`;
  return `Page ${p.page_from}${hf ? " (2nd half)" : ""} → Page ${p.page_to}${ht ? "" : " (1st half)"}`;
};

export const hpPortionLabel = (p: HifdhPortion): string =>
  p.extra ? `${hpOneLabel(p)} + ${hpOneLabel(p.extra)}` : hpOneLabel(p);

const hpRunPages = (p: HifdhPortion) =>
  Array.from({ length: Math.max(0, p.page_to - p.page_from + 1) }, (_, i) => p.page_from + i);

export const hpPagesOf = (p: HifdhPortion) => {
  const main = hpRunPages(p);
  const more = p.extra ? hpRunPages(p.extra).filter((x) => !main.includes(x)) : [];
  return [...main, ...more].slice(0, 14);
};

/** Which halves of `page` belong to the portion, as [startHalf, endHalf] */
export const hpSegmentFor = (page: number, p: HifdhPortion): [number, number] => {
  if (p.extra && (page < p.page_from || page > p.page_to)) return hpSegmentFor(page, { ...p.extra, extra: null });
  const hf = p.half_from ?? 0;
  const ht = p.half_to ?? 1;
  const start = page === p.page_from ? hf : 0;
  const end = page === p.page_to ? ht : 1;
  return [start, end];
};

export const HP_AMOUNTS: { units: number; label: string }[] = [
  { units: 1, label: "½ page" },
  { units: 2, label: "1 page" },
  { units: 3, label: "1½ pages" },
  { units: 4, label: "2 pages" },
  { units: 6, label: "3 pages" },
  { units: 8, label: "4 pages" },
];

/** Weekly review covers everything memorized in the current round of 5 pages (10 half-pages).
 *  It grows as the student moves forward and, once 5 pages are memorized, the next memorized portion starts a new round. */
export const HP_REVIEW_CYCLE = 10;

export const hpReviewRange = (passed: HifdhPortion[]) => {
  if (!passed.length) return null;
  const rs = passed.map(hpUnitsOf);
  const base = Math.min(...rs.map((r) => r.start));
  const end = Math.max(...rs.map((r) => r.end));
  const total = end - base + 1;
  if (total <= 0) return null;
  const round = Math.floor((total - 1) / HP_REVIEW_CYCLE);
  const start = base + round * HP_REVIEW_CYCLE;
  const units = end - start + 1;
  return { ...hpPortionFromUnits(start, units), units, round: round + 1 };
};

/** "3½ pages" for a count of half-pages */
export const hpUnitsLabel = (units: number) =>
  units % 2 === 0 ? `${units / 2} page${units === 2 ? "" : "s"}` : `${Math.floor(units / 2) ? Math.floor(units / 2) : ""}½ page${units > 2 ? "s" : ""}`;

/* ───────────── Weekly review: Surat al-Ankabut → where the student is, 5 pages a week ───────────── */

/** Surat al-Ankabut starts on page 396; its last ayah sits on the 1st half of page 404 (Ar-Rum begins there). */
export const HP_ANKABUT_START = hpUnit(396, 0);
export const HP_ANKABUT_LAST = hpUnit(404, 0);

export interface HifdhReviewRange extends HifdhPortion {
  units: number;
  /** which slice of the cycle this week is (1-based) */
  round: number;
  /** how many 5-page slices the whole memorized stretch makes */
  rounds: number;
  /** true when the range comes from the Ankabut → current-page cycle */
  fromAnkabut: boolean;
}

/**
 * Weekly review for one student.
 *  • Finished Surat al-Ankabut → everything from the start of Ankabut up to the page they are at is cut into slices of
 *    5 pages. Week 1 = first 5 pages, week 2 = next 5, … When it reaches the end it wraps to the start of Ankabut to
 *    make up the 5 pages and the next week carries on from there (12 pages: 396–400, 401–405, 406–407+396–398,
 *    399–403, 404–407+396, …).
 *  • Not there yet → the old behaviour (current round of what they memorized).
 * `current` is where the student memorizes NEXT (hifdh_program.current_page / current_half), so what is memorized
 * ends right before it. `doneWeeks` = how many earlier weekly reviews were passed (moves the cycle on).
 */
export const hpWeeklyReview = (
  current: { current_page?: number | null; current_half?: number | null } | null | undefined,
  passed: HifdhPortion[],
  doneWeeks = 0,
): HifdhReviewRange | null => {
  if (current?.current_page) {
    const next = hpUnit(current.current_page, current.current_half ?? 0);
    if (next > HP_ANKABUT_LAST) {
      const end = next - 1;
      const total = end - HP_ANKABUT_START + 1;
      const rounds = Math.max(1, Math.ceil(total / HP_REVIEW_CYCLE));
      // everything memorized is one circle; each week reads the next 5 pages round it and carries on from there
      if (total <= HP_REVIEW_CYCLE) {
        return { ...hpPortionFromUnits(HP_ANKABUT_START, total), units: total, round: doneWeeks + 1, rounds, fromAnkabut: true };
      }
      const off = (((doneWeeks * HP_REVIEW_CYCLE) % total) + total) % total;
      const run = Math.min(HP_REVIEW_CYCLE, total - off);
      const main = hpPortionFromUnits(HP_ANKABUT_START + off, run);
      if (run < HP_REVIEW_CYCLE) {
        const extra = hpPortionFromUnits(HP_ANKABUT_START, HP_REVIEW_CYCLE - run);
        return { ...main, extra, units: HP_REVIEW_CYCLE, round: doneWeeks + 1, rounds, fromAnkabut: true };
      }
      return { ...main, units: HP_REVIEW_CYCLE, round: doneWeeks + 1, rounds, fromAnkabut: true };
    }
  }
  const old = hpReviewRange(passed);
  return old ? { ...old, rounds: old.round, fromAnkabut: false } : null;
};

/** One-line description of this week's review slice */
export const hpReviewNote = (r: HifdhReviewRange) =>
  r.fromAnkabut
    ? `From Surat al-Ankabut · week ${r.round} · ${hpUnitsLabel(r.units)}`
    : `Round ${r.round} · ${hpUnitsLabel(r.units)} of 5 pages memorized`;
