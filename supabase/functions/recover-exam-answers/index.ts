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

    // 1. Get all audio files from storage organized by attempt
    const userDirs = ["3d0eed36-62b0-4270-830d-24a656db132a", "41329b56-4a04-400b-a9f2-e78eebb9e61f", 
      "6ab60f22-325d-4f2c-b4ec-87791cd29b54", "a6cf7918-89be-42d3-b4e7-3e1eeb56d652",
      "dc2c35d7-db7c-4df5-9b8b-706ca6212701", "e625001c-f5bc-47a8-9dcc-66259cb14800",
      "b3111484-6bde-4738-91fd-5ee38d3d0bb9", "776d74d9-7c32-493c-a28d-50b24cafaa78",
      "c08dbeb5-51ac-4cf6-a51d-ab868ef26a65", "595ce859-1c6e-48df-bb2e-1cfd0ed0769b"];

    // Also try dynamic listing
    const { data: storageDirs } = await supabase.storage.from("exam-media").list("student-answers", { limit: 100 });
    const allUserIds = new Set([...userDirs, ...(storageDirs || []).map((d: any) => d.name)]);

    interface AudioFile {
      user_id: string;
      attempt_id: string;
      original_question_id: string;
      path: string;
      created_at: string;
    }

    // Group files by attempt_id
    const filesByAttempt = new Map<string, AudioFile[]>();

    for (const userId of allUserIds) {
      const { data: userFiles } = await supabase.storage
        .from("exam-media")
        .list(`student-answers/${userId}`, { limit: 1000 });

      if (!userFiles) continue;

      for (const file of userFiles) {
        const match = file.name.match(/^([0-9a-f-]{36})_([0-9a-f-]{36})\.webm$/);
        if (!match) continue;

        const audioFile: AudioFile = {
          user_id: userId,
          attempt_id: match[1],
          original_question_id: match[2],
          path: `student-answers/${userId}/${file.name}`,
          created_at: file.created_at || new Date().toISOString(),
        };

        if (!filesByAttempt.has(match[1])) filesByAttempt.set(match[1], []);
        filesByAttempt.get(match[1])!.push(audioFile);
      }
    }

    // 2. Get attempts info
    const { data: attempts } = await supabase
      .from("exam_attempts")
      .select("id, user_id, exam_id, status");
    const attemptMap = new Map((attempts || []).map((a: any) => [a.id, a]));

    // 3. Get audio questions grouped by exam (sorted by sort_order)
    const { data: audioQuestions } = await supabase
      .from("exam_questions")
      .select("id, exam_id, question_type, sort_order, question_text")
      .in("question_type", ["audio", "dictation"])
      .order("sort_order");

    const questionsByExam = new Map<string, any[]>();
    for (const q of audioQuestions || []) {
      if (!questionsByExam.has(q.exam_id)) questionsByExam.set(q.exam_id, []);
      questionsByExam.get(q.exam_id)!.push(q);
    }

    // 4. Get existing answers to avoid duplicates
    const { data: existingAnswers } = await supabase
      .from("exam_answers")
      .select("attempt_id, question_id");
    const existingSet = new Set(
      (existingAnswers || []).map((a: any) => `${a.attempt_id}_${a.question_id}`)
    );

    // 5. Match audio files to current questions by position within exam
    const toInsert: any[] = [];
    const unmatched: any[] = [];
    const matched: any[] = [];

    for (const [attemptId, files] of filesByAttempt) {
      const attempt = attemptMap.get(attemptId);
      if (!attempt) {
        for (const f of files) unmatched.push({ ...f, reason: "attempt_not_found" });
        continue;
      }

      const examAudioQuestions = questionsByExam.get(attempt.exam_id) || [];
      
      // Sort files by created_at to maintain order
      files.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Try to match by position (ith audio file → ith audio question)
        if (i < examAudioQuestions.length) {
          const targetQuestion = examAudioQuestions[i];
          const key = `${attemptId}_${targetQuestion.id}`;
          
          if (existingSet.has(key)) {
            matched.push({ ...file, matched_question: targetQuestion.id, status: "already_exists" });
            continue;
          }

          const audioUrl = `${supabaseUrl}/storage/v1/object/public/exam-media/${file.path}`;
          
          toInsert.push({
            attempt_id: attemptId,
            question_id: targetQuestion.id,
            answer_text: "[audio_recorded]",
            answer_data: { audioUrl, fileType: "audio", recovered: true, original_question_id: file.original_question_id },
            created_at: file.created_at,
            updated_at: file.created_at,
          });

          matched.push({
            ...file,
            matched_question_id: targetQuestion.id,
            matched_question_text: targetQuestion.question_text?.substring(0, 80),
            status: "will_insert",
          });

          existingSet.add(key); // prevent dups within same batch
        } else {
          unmatched.push({ ...file, reason: "no_matching_question_in_exam", exam_id: attempt.exam_id });
        }
      }
    }

    // 6. Insert if not dry run
    let inserted = 0;
    const insertErrors: any[] = [];
    if (!dry_run && toInsert.length > 0) {
      for (let i = 0; i < toInsert.length; i += 50) {
        const batch = toInsert.slice(i, i + 50);
        const { error, data } = await supabase.from("exam_answers").insert(batch).select("id");
        if (error) {
          insertErrors.push({ batch: i, error: error.message });
        } else {
          inserted += (data?.length || 0);
        }
      }
    }

    // 7. Summary of all attempts still missing answers
    const { data: allAttempts } = await supabase
      .from("exam_attempts")
      .select("id, exam_id, user_id, status, score, submitted_at")
      .in("status", ["submitted", "graded"]);

    const emptyAttempts: any[] = [];
    for (const att of allAttempts || []) {
      const { count } = await supabase
        .from("exam_answers")
        .select("id", { count: "exact", head: true })
        .eq("attempt_id", att.id);
      if (count === 0) {
        // Get student name
        const { data: prof } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("user_id", att.user_id)
          .maybeSingle();
        // Get exam title
        const { data: exam } = await supabase
          .from("exams")
          .select("title")
          .eq("id", att.exam_id)
          .maybeSingle();

        emptyAttempts.push({
          attempt_id: att.id,
          student: prof?.full_name,
          exam: exam?.title,
          user_id: att.user_id,
          status: att.status,
          score: att.score,
        });
      }
    }

    return new Response(JSON.stringify({
      summary: {
        total_audio_files: Array.from(filesByAttempt.values()).flat().length,
        matched_and_will_insert: toInsert.length,
        already_linked: matched.filter(m => m.status === "already_exists").length,
        unmatched_files: unmatched.length,
        inserted: dry_run ? 0 : inserted,
        insert_errors: insertErrors,
        dry_run,
      },
      matched_details: matched,
      unmatched_files: unmatched,
      attempts_still_missing_all_answers: emptyAttempts,
    }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Recovery error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
