
-- RPC for students to view exam questions AFTER submission (includes answers for review)
CREATE OR REPLACE FUNCTION public.get_exam_questions_for_review(_attempt_id uuid)
RETURNS TABLE(
  id uuid, exam_id uuid, question_type text, question_text text, question_text_ar text,
  options jsonb, points integer, difficulty text, media_url text, sort_order integer,
  correct_answer text, explanation text, explanation_ar text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only allow if this is the student's own submitted/graded attempt
  IF NOT EXISTS (
    SELECT 1 FROM public.exam_attempts ea
    WHERE ea.id = _attempt_id AND ea.user_id = auth.uid()
      AND ea.status IN ('submitted', 'graded')
  ) THEN
    RAISE EXCEPTION 'Access denied: attempt not found or not yet submitted';
  END IF;

  -- Check if the exam allows review
  IF NOT EXISTS (
    SELECT 1 FROM public.exam_attempts ea
    JOIN public.exams e ON e.id = ea.exam_id
    WHERE ea.id = _attempt_id AND (e.allow_review = true)
  ) THEN
    RAISE EXCEPTION 'Review not allowed for this exam';
  END IF;

  RETURN QUERY
  SELECT eq.id, eq.exam_id, eq.question_type, eq.question_text, eq.question_text_ar,
    eq.options, eq.points, eq.difficulty, eq.media_url, eq.sort_order,
    eq.correct_answer, eq.explanation, eq.explanation_ar
  FROM public.exam_questions eq
  JOIN public.exam_attempts ea ON ea.exam_id = eq.exam_id
  WHERE ea.id = _attempt_id
  ORDER BY eq.sort_order;
END;
$$;

-- Server-side grading function
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
  rec record;
BEGIN
  -- Verify ownership
  SELECT ea.exam_id, ea.user_id INTO v_exam_id, v_user_id
  FROM public.exam_attempts ea
  WHERE ea.id = _attempt_id AND ea.user_id = auth.uid() AND ea.status = 'in_progress';
  
  IF v_exam_id IS NULL THEN
    RAISE EXCEPTION 'Access denied or attempt not in progress';
  END IF;

  SELECT e.passing_score INTO v_passing_score FROM public.exams e WHERE e.id = v_exam_id;

  -- Grade each question
  FOR rec IN
    SELECT eq.id as question_id, eq.question_type, eq.correct_answer, eq.options, eq.points,
           ans.id as answer_id, ans.answer_text
    FROM public.exam_questions eq
    LEFT JOIN public.exam_answers ans ON ans.question_id = eq.id AND ans.attempt_id = _attempt_id
    WHERE eq.exam_id = v_exam_id
  LOOP
    v_total_points := v_total_points + COALESCE(rec.points, 1);

    IF rec.question_type IN ('short_answer', 'essay', 'audio', 'dictation') THEN
      v_has_subjective := true;
      CONTINUE;
    END IF;

    IF rec.answer_id IS NULL OR rec.answer_text IS NULL THEN
      CONTINUE;
    END IF;

    DECLARE
      v_is_correct boolean := false;
      v_pts numeric := 0;
    BEGIN
      IF rec.question_type IN ('mcq', 'image_mcq') AND rec.options IS NOT NULL THEN
        -- Check if selected option is correct
        DECLARE
          correct_ids text[];
          opt jsonb;
        BEGIN
          correct_ids := ARRAY[]::text[];
          FOR opt IN SELECT jsonb_array_elements(rec.options) LOOP
            IF (opt->>'is_correct')::boolean = true THEN
              correct_ids := array_append(correct_ids, opt->>'id');
            END IF;
          END LOOP;
          v_is_correct := array_length(correct_ids, 1) = 1 AND rec.answer_text = correct_ids[1];
        END;
      ELSIF rec.question_type = 'true_false' THEN
        v_is_correct := lower(rec.answer_text) = lower(rec.correct_answer);
      ELSIF rec.question_type = 'fill_blank' THEN
        v_is_correct := lower(trim(rec.answer_text)) = lower(trim(rec.correct_answer));
      END IF;

      v_pts := CASE WHEN v_is_correct THEN COALESCE(rec.points, 1) ELSE 0 END;
      v_earned_points := v_earned_points + v_pts;

      UPDATE public.exam_answers SET is_correct = v_is_correct, points_awarded = v_pts,
        graded_at = now() WHERE id = rec.answer_id;
    END;
  END LOOP;

  v_percentage := CASE WHEN v_total_points > 0 THEN (v_earned_points / v_total_points) * 100 ELSE 0 END;

  -- Update attempt
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

-- Also drop any leftover student SELECT policy on exam_questions if it exists
DROP POLICY IF EXISTS "Students can view questions for their exams" ON public.exam_questions;
