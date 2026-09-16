
-- Add unique constraint for exam_answers upsert
ALTER TABLE public.exam_answers ADD CONSTRAINT exam_answers_attempt_question_unique UNIQUE (attempt_id, question_id);
