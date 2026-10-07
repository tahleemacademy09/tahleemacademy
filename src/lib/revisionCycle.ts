// src/lib/revisionCycle.ts
// Cumulative Murājaʿah cycle.
//
//   Day 1: page A            (1 page)
//   Day 2: A + B             (2 pages)
//   Day 3: A + B + C         (3 pages)
//   Day 4: A + B + C + D     (4 pages)
//   Day 5: A + B + C + D + E (5 pages)
//   Day 6: new page F        (cycle restarts with a fresh page)
//
// "Page" here means one daily slot of `daily_pages` Quran pages, so a plan of
// 2 pages/day builds 2 → 4 → 6 → 8 → 10 pages across the cycle.
// Cycles are counted in WORKING days (days off are skipped), exactly like the
// existing sequential programme, so Day 6 is always "the next working day".

export const CYCLE_LENGTH = 5;

/** Reads the per-assignment flag from the notes JSON. Defaults to ON. */
export function isCumulative(assignment: { notes?: string | null }): boolean {
  try {
    const extra = JSON.parse(assignment.notes || "{}");
    return extra?.cumulative !== false;
  } catch {
    return true;
  }
}

/** Absolute Quran pages (1-604) for a working-day index (0-based). */
export function pagesForWorkDay(opts: {
  base: number;          // first page of the assignment
  dailyPages: number;    // new pages per day
  workDayIdx: number;    // 0 = first working day of the programme
  cumulative: boolean;
}): number[] {
  const { base, workDayIdx, cumulative } = opts;
  const n = Math.max(1, Math.round(Number(opts.dailyPages) || 1));
  const idx = Math.max(0, workDayIdx);

  // Cumulative: start from the first day of the current 5-day cycle.
  const firstSlot = cumulative ? Math.floor(idx / CYCLE_LENGTH) * CYCLE_LENGTH : idx;
  const startPage = base + firstSlot * n;
  const endPage = base + idx * n + (n - 1);

  const pages: number[] = [];
  for (let p = startPage; p <= endPage; p++) {
    if (p >= 1 && p <= 604) pages.push(p);
  }
  return pages;
}

/** The pages that are NEW today (the last slot) — useful for labels. */
export function newPagesForWorkDay(opts: {
  base: number; dailyPages: number; workDayIdx: number;
}): number[] {
  const n = Math.max(1, Math.round(Number(opts.dailyPages) || 1));
  const start = opts.base + Math.max(0, opts.workDayIdx) * n;
  return Array.from({ length: n }, (_, i) => start + i).filter(p => p >= 1 && p <= 604);
}

/** 1-based position inside the 5-day cycle (1..5). */
export function cycleDayOf(workDayIdx: number): number {
  return (Math.max(0, workDayIdx) % CYCLE_LENGTH) + 1;
}

/** 1-based cycle number. */
export function cycleNumberOf(workDayIdx: number): number {
  return Math.floor(Math.max(0, workDayIdx) / CYCLE_LENGTH) + 1;
}
