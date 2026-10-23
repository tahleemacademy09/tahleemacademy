// src/lib/hifdhSegments.ts
// Mixed Murajaah assignments: a student who memorised random parts of the Quran can be
// given any mix of juz', hizb, whole surahs and individual page ranges in ONE assignment.
//
// The segments live inside the existing `notes` JSON of hifdh_daily_assignments
// (key: "segments"), so no database change is needed. Assignments without segments keep
// the old behaviour (first selected item = start page, then contiguous pages).
//
// The resulting page list is always in MUSHAF ORDER (ascending page number) with no
// duplicates, whatever order the teacher added the segments in.

export type Segment =
  | { t: "juz"; n: number }      // 1-30
  | { t: "hizb"; n: number }     // 1-60
  | { t: "surah"; n: number }    // 1-114
  | { t: "pages"; from: number; to: number }; // 1-604

export const TOTAL_PAGES = 604;

export const JUZ_START_PAGES: Record<number, number> = {
  1:1,   2:22,  3:42,  4:62,  5:82,  6:102, 7:122, 8:142, 9:162, 10:182,
  11:202,12:222,13:242,14:262,15:282,16:302,17:322,18:342,19:362,20:382,
  21:402,22:422,23:442,24:462,25:482,26:502,27:522,28:542,29:562,30:582,
};

/** Hizb = half a juz (60 hizbs). Odd hizb = first half of the juz, even = second half. */
export function getHizbStartPage(h: number): number {
  const juz = Math.ceil(h / 2);
  const isSecond = h % 2 === 0;
  return (JUZ_START_PAGES[juz] ?? 1) + (isSecond ? 10 : 0);
}

export const SURAH_START_PAGES: Record<number, number> = {
  1:1,   2:2,   3:50,  4:77,  5:106, 6:128, 7:151, 8:177, 9:187, 10:208,
  11:221,12:235,13:249,14:255,15:262,16:267,17:282,18:293,19:305,20:312,
  21:322,22:332,23:342,24:350,25:359,26:367,27:377,28:385,29:396,30:404,
  31:411,32:415,33:418,34:428,35:434,36:440,37:446,38:453,39:458,40:467,
  41:477,42:483,43:489,44:496,45:499,46:502,47:507,48:511,49:515,50:518,
  51:520,52:523,53:526,54:528,55:531,56:534,57:537,58:542,59:545,60:549,
  61:551,62:553,63:554,64:556,65:558,66:560,67:562,68:564,69:566,70:568,
  71:570,72:572,73:574,74:575,75:577,76:578,77:580,78:582,79:583,80:585,
  81:586,82:587,83:587,84:589,85:590,86:591,87:591,88:592,89:593,90:594,
  91:595,92:595,93:596,94:596,95:597,96:597,97:598,98:598,99:599,100:599,
  101:600,102:601,103:601,104:601,105:602,106:602,107:602,108:603,109:603,110:603,
  111:603,112:604,113:604,114:604,
};

const clamp = (p: number) => Math.min(TOTAL_PAGES, Math.max(1, Math.round(p)));
const range = (a: number, b: number) =>
  Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);

/** Inclusive page range [from, to] covered by one segment. */
export function segmentRange(s: Segment): [number, number] | null {
  if (s.t === "juz") {
    if (!JUZ_START_PAGES[s.n]) return null;
    const from = JUZ_START_PAGES[s.n];
    const to = s.n === 30 ? TOTAL_PAGES : JUZ_START_PAGES[s.n + 1] - 1;
    return [from, to];
  }
  if (s.t === "hizb") {
    if (s.n < 1 || s.n > 60) return null;
    const from = getHizbStartPage(s.n);
    const to = s.n === 60 ? TOTAL_PAGES : getHizbStartPage(s.n + 1) - 1;
    return [from, Math.max(from, to)];
  }
  if (s.t === "surah") {
    const from = SURAH_START_PAGES[s.n];
    if (!from) return null;
    // A surah runs up to the page before the next one starts (at least its own start page).
    // Page-level data only: a surah that ends part-way down a page shared with the next
    // surah is counted as ending on its own last full page.
    const next = SURAH_START_PAGES[s.n + 1];
    const to = s.n === 114 ? TOTAL_PAGES : Math.max(from, (next ?? TOTAL_PAGES + 1) - 1);
    return [from, to];
  }
  if (s.t === "pages") {
    const a = clamp(Math.min(s.from, s.to));
    const b = clamp(Math.max(s.from, s.to));
    return [a, b];
  }
  return null;
}

/** All pages for a list of segments: Mushaf order, de-duplicated. */
export function segmentsToPages(segments: Segment[] | null | undefined): number[] {
  const set = new Set<number>();
  for (const s of segments ?? []) {
    const r = segmentRange(s);
    if (r) range(r[0], r[1]).forEach(p => set.add(p));
  }
  return [...set].sort((a, b) => a - b);
}

export function segmentLabel(s: Segment): string {
  if (s.t === "juz") return `Juz ${s.n}`;
  if (s.t === "hizb") return `Hizb ${s.n}`;
  if (s.t === "surah") return `Surah ${s.n}`;
  return s.from === s.to ? `Page ${s.from}` : `Pages ${s.from}–${s.to}`;
}

/** Short summary, e.g. "Juz 30 · Surah 36 · Pages 10–12" (Mushaf order). */
export function segmentsSummary(segments: Segment[]): string {
  const sorted = [...segments].sort(
    (a, b) => (segmentRange(a)?.[0] ?? 0) - (segmentRange(b)?.[0] ?? 0),
  );
  return [...new Set(sorted.map(segmentLabel))].join(" · ");
}

/** Reads and validates segments from an assignment's notes JSON. */
export function parseSegments(notes?: string | null): Segment[] {
  try {
    const raw = JSON.parse(notes || "{}")?.segments;
    if (!Array.isArray(raw)) return [];
    return raw.filter((s: any): s is Segment => {
      if (!s || typeof s !== "object") return false;
      if (s.t === "pages") return Number.isFinite(s.from) && Number.isFinite(s.to);
      return (s.t === "juz" || s.t === "hizb" || s.t === "surah") && Number.isFinite(s.n);
    });
  } catch {
    return [];
  }
}

/** Page list for an assignment, or null when it has no segments (old behaviour). */
export function assignmentPageList(a: { notes?: string | null }): number[] | null {
  const segs = parseSegments(a.notes);
  if (!segs.length) return null;
  const pages = segmentsToPages(segs);
  return pages.length ? pages : null;
}

/**
 * Keeps the legacy columns meaningful for the other screens that still show
 * "Juz 28" / "Surah 36" labels: mode + selected_items come from the earliest segment.
 */
export function legacyFieldsFromSegments(segments: Segment[]): {
  mode: "juz" | "hizb" | "surah";
  selected_items: number[];
} {
  const sorted = [...segments].sort(
    (a, b) => (segmentRange(a)?.[0] ?? 0) - (segmentRange(b)?.[0] ?? 0),
  );
  const first = sorted[0];
  if (!first) return { mode: "juz", selected_items: [1] };
  if (first.t !== "pages") return { mode: first.t, selected_items: [first.n] };
  // Page range first: label it by the juz' it starts in.
  const startPage = Math.min(first.from, first.to);
  let juz = 1;
  for (let j = 1; j <= 30; j++) if (JUZ_START_PAGES[j] <= startPage) juz = j;
  return { mode: "juz", selected_items: [juz] };
}

/** Merges segments into an existing notes JSON string without touching other keys. */
export function withSegments(notesJson: string, segments: Segment[]): string {
  let obj: any = {};
  try { obj = JSON.parse(notesJson || "{}") || {}; } catch { obj = {}; }
  if (segments.length) obj.segments = segments;
  else delete obj.segments;
  return JSON.stringify(obj);
}

/**
 * Surahs that belong to the student's portion on `page`, or null when the whole page counts.
 * Used to blur the part of a page that is NOT assigned (e.g. the end of the previous surah above
 * the place where Adh-Dhariyat starts) and to leave that text out of scoring.
 * A page is only clipped when every segment covering it is a whole surah; if a juz', hizb or page
 * range also covers the page, the full page is shown.
 */
export function allowedSurahsForPage(segments: Segment[], page: number): number[] | null {
  if (!segments.length) return null;
  const cover = segments.filter(s => {
    const r = segmentRange(s);
    return !!r && page >= r[0] && page <= r[1];
  });
  if (!cover.length || cover.some(s => s.t !== "surah")) return null;
  return [...new Set(cover.map(s => (s as { n: number }).n))];
}

/** Same, for a whole assignment (mixed segments, or the old single-surah mode on its first page). */
export function pageClipForAssignment(
  a: { notes?: string | null; mode?: string; selected_items?: number[] },
  page: number,
): number[] | null {
  const segs = parseSegments(a.notes);
  if (segs.length) return allowedSurahsForPage(segs, page);
  const first = a.selected_items?.[0];
  if (a.mode === "surah" && first && SURAH_START_PAGES[first] === page) return range(first, 114);
  return null;
}
