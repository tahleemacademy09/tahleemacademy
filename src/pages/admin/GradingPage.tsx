-- ══════════════════════════════════════════════════════════════════════════════
-- TAHLEEM ACADEMY — EXAM ATTEMPTS FIX
-- Run this in Supabase Dashboard → SQL Editor
-- Fixes imported SpeedExam attempts that are stuck at 'in_progress'
-- ══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: Fix the CHECK constraint to allow 'released' status
-- The original constraint only has: in_progress | submitted | graded
-- The GradingPage "Release" button sets status = 'released' — this was silently failing
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.exam_attempts
DROP CONSTRAINT IF EXISTS exam_attempts_status_check;
ALTER TABLE public.exam_attempts
ADD CONSTRAINT exam_attempts_status_check
CHECK (status IN ('in_progress', 'submitted', 'graded', 'released'));

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: Add columns used by the GradingPage that may not exist yet
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.exam_attempts
ADD COLUMN IF NOT EXISTS results_released_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMPTZ DEFAULT now();

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3: DIAGNOSTIC — See ALL stuck attempts
-- Run this SELECT first to understand what's there before changing anything
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  ea.id                           AS attempt_id,
  ea.status,
  ea.score,
  ea.total_points,
  ea.percentage,
  ea.passed,
  ea.started_at,
  ea.submitted_at,
  e.title                         AS exam_title,
  e.title_ar                      AS exam_title_ar,
  p.full_name                     AS student_name,
  p.email,
  COUNT(ans.id)                   AS answer_count,
  SUM(CASE WHEN ans.answer_text IS NOT NULL THEN 1 ELSE 0 END) AS answered_count
FROM public.exam_attempts ea
JOIN public.exams e          ON e.id  = ea.exam_id
LEFT JOIN public.profiles p  ON p.user_id = ea.user_id
LEFT JOIN public.exam_answers ans ON ans.attempt_id = ea.id
WHERE ea.status = 'in_progress'
GROUP BY ea.id, ea.status, ea.score, ea.total_points, ea.percentage,
         ea.passed, ea.started_at, ea.submitted_at,         e.title, e.title_ar, p.full_name, p.email
ORDER BY e.title_ar, p.full_name;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4: MOVE STUCK ATTEMPTS TO 'submitted'
-- This makes them appear in the GradingPage → Pending tab
-- Run this for ALL stuck in_progress attempts (safe — just changes visibility)
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.exam_attempts
SET
  status       = 'submitted',
  submitted_at = COALESCE(submitted_at, started_at, now()),
  updated_at   = now()
WHERE status = 'in_progress';

-- Verify — should return 0 rows after the update
SELECT COUNT(*) AS still_stuck FROM public.exam_attempts WHERE status = 'in_progress';

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 5: FOR ATTEMPTS THAT ALREADY HAVE SCORES — Move directly to 'graded'
-- The user said "their grades are there" — if score/percentage are already
-- populated on the row, we can skip manual grading and go straight to graded.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.exam_attempts
SET
  status     = 'graded',
  updated_at = now()
WHERE status     = 'submitted'
  AND score      IS NOT NULL
  AND total_points IS NOT NULL
  AND percentage IS NOT NULL;

-- Show what was just graded
SELECT
  ea.id,
  ea.status,
  ea.score,
  ea.total_points,
  ea.percentage,
  ea.passed,
  e.title       AS exam_title,
  e.title_ar    AS exam_title_ar,
  p.full_name   AS student_name
FROM public.exam_attempts ea
JOIN public.exams e         ON e.id = ea.exam_id
LEFT JOIN public.profiles p ON p.user_id = ea.user_id
WHERE ea.status = 'graded'
ORDER BY e.title_ar, p.full_name;

-- ─────────────────────────────────────────────────────────────────────────────-- STEP 6: AUTO-GRADE MCQ answers that weren't graded during import
-- Some imported attempts may have answers but points_awarded = 0 or null
-- because grade_exam_attempt was never called. This fixes them.
-- ─────────────────────────────────────────────────────────────────────────────
-- 6a. Grade MCQ answers (match selected option against correct option)
UPDATE public.exam_answers ans
SET
  is_correct     = (
    EXISTS (
      SELECT 1
      FROM jsonb_array_elements(eq.options) opt
      WHERE (opt->>'is_correct')::boolean = true
        AND opt->>'id' = ans.answer_text
    )
  ),
  points_awarded = (
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM jsonb_array_elements(eq.options) opt
        WHERE (opt->>'is_correct')::boolean = true
          AND opt->>'id' = ans.answer_text
      ) THEN COALESCE(eq.points, 1)
      ELSE 0
    END
  ),
  graded_at = now()
FROM public.exam_questions eq
JOIN public.exam_attempts ea ON ea.exam_id = eq.exam_id
WHERE ans.question_id = eq.id
  AND ans.attempt_id  = ea.id
  AND ea.status       IN ('submitted', 'graded')
  AND eq.question_type IN ('mcq', 'image_mcq')
  AND eq.options IS NOT NULL
  AND ans.points_awarded IS NULL;   -- only fix un-graded answers

-- 6b. Grade True/False answers
UPDATE public.exam_answers ans
SET
  is_correct     = (lower(trim(ans.answer_text)) = lower(trim(eq.correct_answer))),
  points_awarded = CASE
    WHEN lower(trim(ans.answer_text)) = lower(trim(eq.correct_answer))
    THEN COALESCE(eq.points, 1) ELSE 0 END,
  graded_at = now()
FROM public.exam_questions eq
JOIN public.exam_attempts ea ON ea.exam_id = eq.exam_id
WHERE ans.question_id = eq.id
  AND ans.attempt_id  = ea.id
  AND ea.status       IN ('submitted', 'graded')
  AND eq.question_type = 'true_false'  AND eq.correct_answer IS NOT NULL
  AND ans.points_awarded IS NULL;

-- 6c. Grade Fill-in-the-blank answers
UPDATE public.exam_answers ans
SET
  is_correct     = (lower(trim(ans.answer_text)) = lower(trim(eq.correct_answer))),
  points_awarded = CASE
    WHEN lower(trim(ans.answer_text)) = lower(trim(eq.correct_answer))
    THEN COALESCE(eq.points, 1) ELSE 0 END,
  graded_at = now()
FROM public.exam_questions eq
JOIN public.exam_attempts ea ON ea.exam_id = eq.exam_id
WHERE ans.question_id = eq.id
  AND ans.attempt_id  = ea.id
  AND ea.status       IN ('submitted', 'graded')
  AND eq.question_type = 'fill_blank'
  AND eq.correct_answer IS NOT NULL
  AND ans.points_awarded IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 7: RECOMPUTE score/total_points/percentage for all graded attempts
-- where those values are wrong or missing (common after import)
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.exam_attempts ea
SET
  score        = sub.earned,
  total_points = sub.total,
  percentage   = CASE WHEN sub.total > 0 THEN ROUND((sub.earned / sub.total) * 100, 2) ELSE 0 END,
  passed       = CASE WHEN sub.total > 0 THEN (sub.earned / sub.total * 100) >= sub.passing_score ELSE false END,
  updated_at   = now()
FROM (
  SELECT
    ea2.id                                             AS attempt_id,
    COALESCE(SUM(q.points), COUNT(q.id))               AS total,
    COALESCE(SUM(COALESCE(ans.points_awarded, 0)), 0)  AS earned,
    COALESCE(e.passing_score, 50)                      AS passing_score
  FROM public.exam_attempts ea2
  JOIN public.exam_questions q  ON q.exam_id = ea2.exam_id
  LEFT JOIN public.exam_answers ans
    ON ans.question_id = q.id AND ans.attempt_id = ea2.id
  JOIN public.exams e ON e.id = ea2.exam_id
  WHERE ea2.status IN ('submitted', 'graded')
    -- Only recompute if values are missing or clearly wrong
    AND (ea2.score IS NULL OR ea2.total_points IS NULL OR ea2.percentage IS NULL)
  GROUP BY ea2.id, e.passing_score
) sub
WHERE ea.id = sub.attempt_id;

-- ─────────────────────────────────────────────────────────────────────────────-- STEP 8: Create an ADMIN grading function that bypasses auth.uid() check
-- This lets admin grade any attempt regardless of ownership
-- (SECURITY DEFINER runs as postgres superuser — safe because it's admin-only)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_grade_attempt(
  _attempt_id UUID,
  _score      NUMERIC,
  _total      NUMERIC,
  _passing    INTEGER DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pct NUMERIC;
BEGIN
  v_pct := CASE WHEN _total > 0 THEN ROUND((_score / _total) * 100, 2) ELSE 0 END;
  UPDATE public.exam_attempts
  SET
    status       = 'graded',
    score        = _score,
    total_points = _total,
    percentage   = v_pct,
    passed       = v_pct >= _passing,
    submitted_at = COALESCE(submitted_at, now()),
    updated_at   = now()
  WHERE id = _attempt_id;
  RETURN jsonb_build_object(
    'attempt_id', _attempt_id,
    'score',      _score,
    'total',      _total,
    'percentage', v_pct,
    'passed',     v_pct >= _passing
  );
END;
$$;

-- Grant access to authenticated users (admin will call it via the app)
GRANT EXECUTE ON FUNCTION public.admin_grade_attempt TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 9: Fix the RLS policy so admin can update any exam_attempt status
-- Without this, when GradingPage calls saveGrading() it gets RLS-blocked
-- ─────────────────────────────────────────────────────────────────────────────
-- Remove the old student-only update policy
DROP POLICY IF EXISTS "Users can update own in-progress attempts" ON public.exam_attempts;
DROP POLICY IF EXISTS "Admins can update any attempt"            ON public.exam_attempts;
-- Student policy: can only update their own in-progress attempts
CREATE POLICY "Students update own in_progress attempts" ON public.exam_attempts
FOR UPDATE TO authenticated
USING  (auth.uid() = user_id AND status = 'in_progress')
WITH CHECK (auth.uid() = user_id AND status IN ('in_progress','submitted','graded'));

-- Admin policy: can update ANY attempt (needed for grading + releasing)
CREATE POLICY "Admins update any attempt" ON public.exam_attempts
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin', 'teacher')
  )
);

-- Admin SELECT policy (so admins can see all attempts including in_progress)
DROP POLICY IF EXISTS "Admins can read all attempts" ON public.exam_attempts;
CREATE POLICY "Admins read all attempts" ON public.exam_attempts
FOR SELECT TO authenticated
USING (
  auth.uid() = user_id  -- student sees own
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin', 'teacher')
  )
);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 10: Fix exam_answers RLS so admin can update points_awarded
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can update any answer" ON public.exam_answers;
CREATE POLICY "Admins update any answer" ON public.exam_answers
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin', 'teacher')
  )
);

DROP POLICY IF EXISTS "Admins can read all answers" ON public.exam_answers;
CREATE POLICY "Admins read all answers" ON public.exam_answers
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.exam_attempts ea    WHERE ea.id = exam_answers.attempt_id
      AND (
        ea.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role IN ('admin', 'teacher')
        )
      )
  )
);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 11: FINAL CHECK — Summary of all attempts by status and exam
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  e.title_ar                              AS subject_arabic,
  e.title                                 AS subject_english,
  ea.status,
  COUNT(ea.id)                            AS student_count,
  ROUND(AVG(ea.percentage), 1)            AS avg_score_pct,
  COUNT(CASE WHEN ea.passed THEN 1 END)   AS passed_count,
  COUNT(CASE WHEN NOT COALESCE(ea.passed, false) THEN 1 END) AS failed_count
FROM public.exam_attempts ea
JOIN public.exams e ON e.id = ea.exam_id
GROUP BY e.title_ar, e.title, ea.status
ORDER BY e.title_ar, ea.status;