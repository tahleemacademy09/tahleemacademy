-- Link live classes (and therefore their recordings) and materials to a lesson.
ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS lesson_id uuid REFERENCES public.lessons(id) ON DELETE SET NULL;

ALTER TABLE public.subject_materials
  ADD COLUMN IF NOT EXISTS lesson_id uuid REFERENCES public.lessons(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS live_sessions_lesson_id_idx ON public.live_sessions (lesson_id) WHERE lesson_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS subject_materials_lesson_id_idx ON public.subject_materials (lesson_id) WHERE lesson_id IS NOT NULL;
