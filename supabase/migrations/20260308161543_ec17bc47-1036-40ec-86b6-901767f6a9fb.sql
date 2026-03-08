
-- Add new columns to live_sessions (subject_id already exists)
ALTER TABLE public.live_sessions ADD COLUMN IF NOT EXISTS level TEXT;
ALTER TABLE public.live_sessions ADD COLUMN IF NOT EXISTS is_recorded BOOLEAN DEFAULT true;
ALTER TABLE public.live_sessions ADD COLUMN IF NOT EXISTS recording_auto_saved BOOLEAN DEFAULT false;
ALTER TABLE public.live_sessions ADD COLUMN IF NOT EXISTS session_number INTEGER DEFAULT 1;
ALTER TABLE public.live_sessions ADD COLUMN IF NOT EXISTS topic TEXT;
ALTER TABLE public.live_sessions ADD COLUMN IF NOT EXISTS topic_ar TEXT;
ALTER TABLE public.live_sessions ADD COLUMN IF NOT EXISTS materials_url TEXT;
ALTER TABLE public.live_sessions ADD COLUMN IF NOT EXISTS homework TEXT;
ALTER TABLE public.live_sessions ADD COLUMN IF NOT EXISTS homework_ar TEXT;
ALTER TABLE public.live_sessions ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.live_sessions ADD COLUMN IF NOT EXISTS duration_minutes INTEGER DEFAULT 60;

-- Add new columns to subjects
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS total_sessions INTEGER DEFAULT 0;
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS sessions_per_week INTEGER DEFAULT 1;
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS session_day TEXT;
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS session_time TIME;
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS session_duration INTEGER DEFAULT 60;
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS level TEXT;
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS course_syllabus TEXT;
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS course_syllabus_ar TEXT;
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS next_session_at TIMESTAMP WITH TIME ZONE;

-- Add session_id to existing subject_materials table
ALTER TABLE public.subject_materials ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES public.live_sessions(id) ON DELETE SET NULL;

-- Create session_homework table
CREATE TABLE IF NOT EXISTS public.session_homework (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE,
  student_id UUID NOT NULL,
  teacher_id UUID,
  description TEXT,
  description_ar TEXT,
  due_date DATE,
  status TEXT DEFAULT 'pending',
  submission_url TEXT,
  submission_notes TEXT,
  grade INTEGER,
  teacher_feedback TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS for session_homework
ALTER TABLE public.session_homework ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can view own homework" ON public.session_homework FOR SELECT TO authenticated USING (student_id = auth.uid());
CREATE POLICY "Students can update own homework" ON public.session_homework FOR UPDATE TO authenticated USING (student_id = auth.uid());
CREATE POLICY "Teachers can manage homework" ON public.session_homework FOR ALL TO authenticated USING (has_role(auth.uid(), 'teacher'::app_role)) WITH CHECK (has_role(auth.uid(), 'teacher'::app_role));
CREATE POLICY "Admins can manage all homework" ON public.session_homework FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Validation trigger for homework status
CREATE OR REPLACE FUNCTION public.validate_homework_status() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status NOT IN ('pending', 'submitted', 'graded') THEN
    RAISE EXCEPTION 'Invalid homework status: %. Must be pending, submitted, or graded.', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_homework_status_trigger BEFORE INSERT OR UPDATE ON public.session_homework FOR EACH ROW EXECUTE FUNCTION public.validate_homework_status();
