
-- Tighten exam-media storage: students can only view question media for exams they have an active attempt on
-- Drop the overly broad policy
DROP POLICY IF EXISTS "Students can view exam question media" ON storage.objects;

-- Replace with attempt-scoped access
CREATE POLICY "Students can view media for their exam attempts"
  ON storage.objects FOR SELECT USING (
    bucket_id = 'exam-media' AND
    (storage.foldername(name))[1] = 'questions' AND
    EXISTS (
      SELECT 1 FROM public.exam_attempts ea
      JOIN public.exam_questions eq ON eq.exam_id = ea.exam_id
      WHERE ea.user_id = auth.uid()
        AND ea.status IN ('in_progress', 'submitted', 'graded')
    )
  );
