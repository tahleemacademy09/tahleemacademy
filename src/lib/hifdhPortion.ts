// src/lib/hifdhPortion.ts
// Half-page arithmetic for Hifdh portions.
// A portion runs from (page_from, half_from) to (page_to, half_to), inclusive; half 0 = first half, 1 = second half.
//   ½ page → (50,0)-(50,0)    1 page → (50,0)-(50,1)    2 pages → (50,0)-(51,1)

export interface HifdhPortion {
  page_from: number;
  page_to: number;
  half_from?: number | null;
  half_to?: number | null;
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

export const hpPortionLabel = (p: HifdhPortion) => {
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

export const hpPagesOf = (p: HifdhPortion) =>
  Array.from({ length: Math.max(0, p.page_to - p.page_from + 1) }, (_, i) => p.page_from + i).slice(0, 14);

/** Which halves of `page` belong to the portion, as [startHalf, endHalf] */
export const hpSegmentFor = (page: number, p: HifdhPortion): [number, number] => {
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
