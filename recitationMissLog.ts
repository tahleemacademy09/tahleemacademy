/*
  recitationMissLog.ts
  ────────────────────────────────────────────────────────────────────────
  Writes the words a recitation was marked red / yellow on (with what the model heard in their place) to
  public.recitation_misses, so staff can spot words the model gets wrong again and again.

  Best-effort only: it never throws and never blocks the result screen. Re-grading the same recording replaces
  the earlier rows (delete + insert), so a student's retries do not inflate the counts.
*/
import { supabase } from "@/integrations/supabase/client";
import { soundKey, type WordResult } from "@/lib/recitationCompare";

const done = new Set<string>();   // grading already logged this session
const MAX_ROWS = 150;

export async function logRecitationMisses(opts: {
  studentId: string;
  logDate: string;                 // YYYY-MM-DD
  pageNum: number | null;
  words: WordResult[];             // graded words of the whole recording
  transcript: string;
}): Promise<void> {
  try {
    const { studentId, logDate, pageNum, words, transcript } = opts;
    if (!studentId || !words.length || !transcript.trim()) return;
    const sig = `${studentId}|${logDate}|${pageNum}|${transcript.length}|${words.length}`;
    if (done.has(sig)) return;
    done.add(sig);

    const rows = words
      .map((w, i) => ({ w, i }))
      .filter(({ w }) => w.grade === "wrong" || w.grade === "close")
      .slice(0, MAX_ROWS)
      .map(({ w, i }) => ({
        student_id: studentId, log_date: logDate, page_num: pageNum, word_index: i,
        expected_word: w.word, expected_key: soundKey(w.word, true),
        heard: w.heard ?? null, heard_key: w.heard ? soundKey(w.heard) : null,
        grade: w.grade, source: "daily",
      }));

    const db = supabase as any;
    await db.from("recitation_misses").delete()
      .eq("student_id", studentId).eq("log_date", logDate).eq("source", "daily")
      .filter("page_num", pageNum === null ? "is" : "eq", pageNum === null ? null : pageNum);
    if (rows.length) await db.from("recitation_misses").insert(rows);
  } catch (e) {
    console.warn("[recitationMissLog] skipped:", e);
  }
}
