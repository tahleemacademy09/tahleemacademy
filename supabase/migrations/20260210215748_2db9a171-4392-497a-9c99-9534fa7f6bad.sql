
-- Fix: The UPDATE policy's implicit WITH CHECK blocks status changes
-- because the NEW row has status != 'in_progress'

-- Drop and recreate exam_attempts student update policy with explicit WITH CHECK
DROP POLICY IF EXISTS "Users can update own in-progress attempts" ON public.exam_attempts;
CREATE POLICY "Users can update own in-progress attempts"
ON public.exam_attempts FOR UPDATE
USING (auth.uid() = user_id AND status = 'in_progress')
WITH CHECK (auth.uid() = user_id AND status IN ('in_progress', 'submitted', 'graded'));

-- Same fix for exam_answers - student must be able to update their answers during exam
DROP POLICY IF EXISTS "Students can update own answers" ON public.exam_answers;
CREATE POLICY "Students can update own answers"
ON public.exam_answers FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.exam_attempts ea
    WHERE ea.id = exam_answers.attempt_id AND ea.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.exam_attempts ea
    WHERE ea.id = exam_answers.attempt_id AND ea.user_id = auth.uid()
  )
);
