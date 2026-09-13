-- grade_exam_attempt must grade only the questions actually presented to this
-- attempt. Pool questions (question_group = 'name::pick=N') are drawn
-- deterministically per attempt by get_exam_questions_for_student using
-- md5(question_id::text || attempt_id::text) ranking. Grading now mirrors
-- that exact selection instead of scoring every question in the pool.

CREATE OR REPLACE FUNCTION public.grade_exam_attempt(_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_exam_id uuid;
  v_user_id uuid;
  v_total_points numeric := 0;
  v_earned_points numeric := 0;
  v_percentage numeric;
  v_has_subjective boolean := false;
  v_passing_score integer;
BEGIN
  SELECT ea.exam_id, ea.user_id INTO v_exam_id, v_user_id
  FROM public.exam_attempts ea
  WHERE ea.id = _attempt_id AND ea.user_id = auth.uid() AND ea.status = 'in_progress';

  IF v_exam_id IS NULL THEN
    RAISE EXCEPTION 'Access denied or attempt not in progress';
  END IF;

  SELECT e.passing_score INTO v_passing_score FROM public.exams e WHERE e.id = v_exam_id;

  WITH bank AS (
    SELECT
      eq.*,
      CASE WHEN eq.question_group IS NOT NULL
        THEN substring(eq.question_group FROM '^(.*?)(?:::pick=\d+)?$')
        ELSE NULL
      END AS group_key,
      CASE WHEN eq.question_group IS NOT NULL
        THEN COALESCE((substring(eq.question_group FROM '::pick=(\d+)'))::int, 1)
        ELSE NULL
      END AS pick_n
    FROM public.exam_questions eq
    WHERE eq.exam_id = v_exam_id
  ),
  ranked AS (
    SELECT
      b.*,
      CASE WHEN b.group_key IS NOT NULL
        THEN row_number() OVER (
          PARTITION BY b.group_key
          ORDER BY md5(b.id::text || _attempt_id::text)
        )
        ELSE NULL
      END AS grp_rank
    FROM bank b
  ),
  selected AS (
    SELECT * FROM ranked
    WHERE group_key IS NULL OR grp_rank <= pick_n
  ),
  candidates AS (
    SELECT
      s.id AS question_id,
      s.question_type,
      s.correct_answer,
      s.options,
      COALESCE(s.points, 1) AS points,
      ans.id AS answer_id,
      ans.answer_text,
      s.question_type IN ('short_answer', 'essay', 'audio', 'dictation') AS is_subjective
    FROM selected s
    LEFT JOIN public.exam_answers ans
      ON ans.question_id = s.id AND ans.attempt_id = _attempt_id
  ),
  mcq_meta AS (
    SELECT
      c.question_id,
      (SELECT count(*) FROM jsonb_array_elements(c.options) o WHERE (o->>'is_correct')::boolean) AS n_correct,
      (SELECT o->>'id' FROM jsonb_array_elements(c.options) o WHERE (o->>'is_correct')::boolean LIMIT 1) AS correct_id
    FROM candidates c
    WHERE c.question_type IN ('mcq', 'image_mcq') AND c.options IS NOT NULL
  ),
  graded AS (
    SELECT
      c.*,
      CASE
        WHEN c.is_subjective THEN NULL
        WHEN c.answer_id IS NULL OR c.answer_text IS NULL THEN false
        WHEN c.question_type IN ('mcq', 'image_mcq') THEN
          (mm.n_correct = 1 AND c.answer_text = mm.correct_id)
        WHEN c.question_type = 'true_false' THEN
          lower(c.answer_text) = lower(c.correct_answer)
        WHEN c.question_type = 'fill_blank' THEN
          lower(trim(c.answer_text)) = lower(trim(c.correct_answer))
        ELSE false
      END AS is_correct
    FROM candidates c
    LEFT JOIN mcq_meta mm ON mm.question_id = c.question_id
  ),
  updated AS (
    UPDATE public.exam_answers ea
    SET
      is_correct = g.is_correct,
      points_awarded = CASE WHEN g.is_correct THEN g.points ELSE 0 END,
      graded_at = now()
    FROM graded g
    WHERE ea.id = g.answer_id AND NOT g.is_subjective
    RETURNING ea.id
  )
  SELECT
    COALESCE(SUM(g.points), 0),
    COALESCE(SUM(CASE WHEN NOT g.is_subjective AND g.is_correct THEN g.points ELSE 0 END), 0),
    bool_or(g.is_subjective)
  INTO v_total_points, v_earned_points, v_has_subjective
  FROM graded g;

  v_percentage := CASE WHEN v_total_points > 0 THEN (v_earned_points / v_total_points) * 100 ELSE 0 END;

  UPDATE public.exam_attempts SET
    status = CASE WHEN v_has_subjective THEN 'submitted' ELSE 'graded' END,
    submitted_at = now(),
    score = v_earned_points,
    total_points = v_total_points,
    percentage = v_percentage,
    passed = v_percentage >= COALESCE(v_passing_score, 50),
    feedback = CASE WHEN v_has_subjective THEN 'Pending manual grading for subjective questions' ELSE NULL END
  WHERE id = _attempt_id;

  RETURN jsonb_build_object(
    'score', v_earned_points,
    'total_points', v_total_points,
    'percentage', v_percentage,
    'passed', v_percentage >= COALESCE(v_passing_score, 50),
    'has_subjective', v_has_subjective,
    'status', CASE WHEN v_has_subjective THEN 'submitted' ELSE 'graded' END
  );
END;
$$;
