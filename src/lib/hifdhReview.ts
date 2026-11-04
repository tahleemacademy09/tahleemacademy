// src/lib/hifdhReview.ts
// How many earlier weekly reviews each student has PASSED (not excused) — this moves the 5-page review cycle on.
// A "repeat" / "fail" week keeps the same 5 pages for the next week.

export async function loadDoneReviewWeeks(db: any, studentIds: string[], thisWeek: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (!studentIds.length) return out;
  const { data } = await db.from("hifdh_weekly_reviews").select("student_id,grade,excused,week_start")
    .in("student_id", studentIds).lt("week_start", thisWeek);
  (data || []).forEach((r: any) => { if (r.grade === "pass" && !r.excused) out[r.student_id] = (out[r.student_id] || 0) + 1; });
  return out;
}
