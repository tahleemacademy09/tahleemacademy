
-- Fix RESTRICTIVE policies on exam_attempts - convert to PERMISSIVE
-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can update own in-progress attempts" ON public.exam_attempts;
DROP POLICY IF EXISTS "Admins/teachers can update attempts for grading" ON public.exam_attempts;

-- Recreate as PERMISSIVE (default) so student OR admin can update
CREATE POLICY "Users can update own in-progress attempts"
ON public.exam_attempts FOR UPDATE
USING (auth.uid() = user_id AND status = 'in_progress');

CREATE POLICY "Admins/teachers can update attempts for grading"
ON public.exam_attempts FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));

-- Fix RESTRICTIVE policies on exam_answers too
DROP POLICY IF EXISTS "Users can insert own answers" ON public.exam_answers;
DROP POLICY IF EXISTS "Users can update own answers during exam" ON public.exam_answers;
DROP POLICY IF EXISTS "Admins/teachers can update answers for grading" ON public.exam_answers;

CREATE POLICY "Users can insert own answers"
ON public.exam_answers FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM exam_attempts ea
  WHERE ea.id = exam_answers.attempt_id AND ea.user_id = auth.uid() AND ea.status = 'in_progress'
));

CREATE POLICY "Users can update own answers during exam"
ON public.exam_answers FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM exam_attempts ea
  WHERE ea.id = exam_answers.attempt_id AND ea.user_id = auth.uid() AND ea.status = 'in_progress'
));

CREATE POLICY "Admins/teachers can update answers for grading"
ON public.exam_answers FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));
