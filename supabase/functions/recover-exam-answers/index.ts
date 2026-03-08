import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { dry_run = true } = await req.json().catch(() => ({ dry_run: true }));

    // 1. Get all audio files from storage
    const { data: storageFiles, error: storageError } = await supabase.storage
      .from("exam-media")
      .list("student-answers", { limit: 1000 });

    if (storageError) throw storageError;

    // List all user subdirectories
    const userDirs = storageFiles?.filter((f: any) => f.id === null || f.metadata === null) || [];
    
    const allAudioFiles: { user_id: string; attempt_id: string; question_id: string; path: string; created_at: string }[] = [];

    for (const dir of userDirs) {
      const userId = dir.name;
      const { data: userFiles } = await supabase.storage
        .from("exam-media")
        .list(`student-answers/${userId}`, { limit: 1000 });

      if (!userFiles) continue;

      for (const file of userFiles) {
        // filename pattern: {attempt_id}_{question_id}.webm
        const match = file.name.match(/^([0-9a-f-]{36})_([0-9a-f-]{36})\.webm$/);
        if (match) {
          allAudioFiles.push({
            user_id: userId,
            attempt_id: match[1],
            question_id: match[2],
            path: `student-answers/${userId}/${file.name}`,
            created_at: file.created_at || new Date().toISOString(),
          });
        }
      }
    }

    // 2. Get existing exam_answers to avoid duplicates
    const { data: existingAnswers } = await supabase
      .from("exam_answers")
      .select("attempt_id, question_id");

    const existingSet = new Set(
      (existingAnswers || []).map((a: any) => `${a.attempt_id}_${a.question_id}`)
    );

    // 3. Get valid attempts and questions for validation
    const { data: attempts } = await supabase
      .from("exam_attempts")
      .select("id, user_id, exam_id");

    const attemptMap = new Map((attempts || []).map((a: any) => [a.id, a]));

    const { data: questions } = await supabase
      .from("exam_questions")
      .select("id, exam_id, question_type");

    const questionMap = new Map((questions || []).map((q: any) => [q.id, q]));

    // 4. Determine which audio files need exam_answers records
    const toRecover: any[] = [];
    const skipped: any[] = [];

    for (const file of allAudioFiles) {
      const key = `${file.attempt_id}_${file.question_id}`;
      
      if (existingSet.has(key)) {
        skipped.push({ ...file, reason: "already_exists" });
        continue;
      }

      const attempt = attemptMap.get(file.attempt_id);
      if (!attempt) {
        skipped.push({ ...file, reason: "attempt_not_found" });
        continue;
      }

      if (attempt.user_id !== file.user_id) {
        skipped.push({ ...file, reason: "user_mismatch" });
        continue;
      }

      const question = questionMap.get(file.question_id);
      if (!question) {
        skipped.push({ ...file, reason: "question_not_found" });
        continue;
      }

      if (question.exam_id !== attempt.exam_id) {
        skipped.push({ ...file, reason: "exam_mismatch" });
        continue;
      }

      const audioUrl = `${supabaseUrl}/storage/v1/object/public/exam-media/${file.path}`;
      
      toRecover.push({
        attempt_id: file.attempt_id,
        question_id: file.question_id,
        answer_text: "[audio_recorded]",
        answer_data: { audioUrl, fileType: "audio" },
        created_at: file.created_at,
        updated_at: file.created_at,
      });
    }

    // 5. Insert recovered answers if not dry run
    let inserted = 0;
    if (!dry_run && toRecover.length > 0) {
      // Insert in batches of 50
      for (let i = 0; i < toRecover.length; i += 50) {
        const batch = toRecover.slice(i, i + 50);
        const { error: insertError, data: insertData } = await supabase
          .from("exam_answers")
          .insert(batch)
          .select("id");

        if (insertError) {
          console.error("Insert error batch", i, insertError);
        } else {
          inserted += (insertData?.length || 0);
        }
      }
    }

    // 6. Summary of attempts with 0 answers
    const { data: emptyAttempts } = await supabase
      .from("exam_attempts")
      .select(`
        id, exam_id, user_id, status, score, submitted_at,
        exams!inner(title)
      `)
      .in("status", ["submitted", "graded"]);

    const attemptsWithCounts: any[] = [];
    for (const att of emptyAttempts || []) {
      const { count } = await supabase
        .from("exam_answers")
        .select("id", { count: "exact", head: true })
        .eq("attempt_id", att.id);

      if (count === 0) {
        attemptsWithCounts.push({
          attempt_id: att.id,
          exam_title: (att as any).exams?.title,
          user_id: att.user_id,
          status: att.status,
          score: att.score,
          submitted_at: att.submitted_at,
        });
      }
    }

    return new Response(
      JSON.stringify({
        summary: {
          total_audio_files_in_storage: allAudioFiles.length,
          already_linked: skipped.filter((s: any) => s.reason === "already_exists").length,
          to_recover: toRecover.length,
          inserted: dry_run ? 0 : inserted,
          dry_run,
        },
        attempts_still_missing_answers: attemptsWithCounts,
        recovery_details: toRecover.map((r: any) => ({
          attempt_id: r.attempt_id,
          question_id: r.question_id,
          audio_url: r.answer_data.audioUrl,
        })),
        skipped_files: skipped,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Recovery error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
