
-- Revision rooms
CREATE TABLE IF NOT EXISTS public.revision_rooms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  title_ar TEXT,
  description TEXT,
  description_ar TEXT,
  level TEXT,
  type TEXT DEFAULT 'self',
  created_by UUID,
  is_active BOOLEAN DEFAULT true,
  scheduled_at TIMESTAMP WITH TIME ZONE,
  duration_minutes INTEGER DEFAULT 60,
  max_students INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Validation trigger for revision room type
CREATE OR REPLACE FUNCTION public.validate_revision_room_type() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.type NOT IN ('self','flashcard','quiz','summary','live','group','ai') THEN
    RAISE EXCEPTION 'Invalid revision room type: %', NEW.type;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_revision_room_type_trigger BEFORE INSERT OR UPDATE ON public.revision_rooms FOR EACH ROW EXECUTE FUNCTION public.validate_revision_room_type();

-- Validation trigger for revision room level
CREATE OR REPLACE FUNCTION public.validate_revision_room_level() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.level IS NOT NULL AND NEW.level NOT IN ('beginner','intermediate','advanced') THEN
    RAISE EXCEPTION 'Invalid level: %', NEW.level;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_revision_room_level_trigger BEFORE INSERT OR UPDATE ON public.revision_rooms FOR EACH ROW EXECUTE FUNCTION public.validate_revision_room_level();

ALTER TABLE public.revision_rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view active rooms" ON public.revision_rooms FOR SELECT TO authenticated USING (true);
CREATE POLICY "Teachers can manage rooms" ON public.revision_rooms FOR ALL TO authenticated USING (has_role(auth.uid(), 'teacher'::app_role)) WITH CHECK (has_role(auth.uid(), 'teacher'::app_role));
CREATE POLICY "Admins can manage all rooms" ON public.revision_rooms FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Flashcards
CREATE TABLE IF NOT EXISTS public.revision_flashcards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE,
  room_id UUID REFERENCES public.revision_rooms(id) ON DELETE CASCADE,
  front_text TEXT NOT NULL,
  front_text_ar TEXT,
  back_text TEXT NOT NULL,
  back_text_ar TEXT,
  topic TEXT,
  level TEXT DEFAULT 'beginner',
  created_by UUID,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.revision_flashcards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view flashcards" ON public.revision_flashcards FOR SELECT TO authenticated USING (true);
CREATE POLICY "Teachers can manage flashcards" ON public.revision_flashcards FOR ALL TO authenticated USING (has_role(auth.uid(), 'teacher'::app_role)) WITH CHECK (has_role(auth.uid(), 'teacher'::app_role));
CREATE POLICY "Admins can manage flashcards" ON public.revision_flashcards FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Students can create own flashcards" ON public.revision_flashcards FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Students can delete own flashcards" ON public.revision_flashcards FOR DELETE TO authenticated USING (created_by = auth.uid());

-- Flashcard progress
CREATE TABLE IF NOT EXISTS public.revision_flashcard_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL,
  flashcard_id UUID REFERENCES public.revision_flashcards(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'new',
  times_reviewed INTEGER DEFAULT 0,
  last_reviewed_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(student_id, flashcard_id)
);

CREATE OR REPLACE FUNCTION public.validate_flashcard_progress_status() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status NOT IN ('new','learning','known') THEN
    RAISE EXCEPTION 'Invalid flashcard progress status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_flashcard_progress_status_trigger BEFORE INSERT OR UPDATE ON public.revision_flashcard_progress FOR EACH ROW EXECUTE FUNCTION public.validate_flashcard_progress_status();

ALTER TABLE public.revision_flashcard_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Students can manage own progress" ON public.revision_flashcard_progress FOR ALL TO authenticated USING (student_id = auth.uid()) WITH CHECK (student_id = auth.uid());
CREATE POLICY "Teachers can view all progress" ON public.revision_flashcard_progress FOR SELECT TO authenticated USING (has_role(auth.uid(), 'teacher'::app_role));
CREATE POLICY "Admins can manage all progress" ON public.revision_flashcard_progress FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Summaries
CREATE TABLE IF NOT EXISTS public.revision_summaries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.live_sessions(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  title_ar TEXT,
  content TEXT NOT NULL,
  content_ar TEXT,
  topic TEXT,
  level TEXT,
  type TEXT DEFAULT 'text',
  created_by UUID,
  is_ai_generated BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.validate_summary_type() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.type NOT IN ('text','bullet','mindmap') THEN
    RAISE EXCEPTION 'Invalid summary type: %', NEW.type;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_summary_type_trigger BEFORE INSERT OR UPDATE ON public.revision_summaries FOR EACH ROW EXECUTE FUNCTION public.validate_summary_type();

ALTER TABLE public.revision_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view summaries" ON public.revision_summaries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Teachers can manage summaries" ON public.revision_summaries FOR ALL TO authenticated USING (has_role(auth.uid(), 'teacher'::app_role)) WITH CHECK (has_role(auth.uid(), 'teacher'::app_role));
CREATE POLICY "Admins can manage summaries" ON public.revision_summaries FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Quiz sessions
CREATE TABLE IF NOT EXISTS public.revision_quiz_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE,
  room_id UUID REFERENCES public.revision_rooms(id) ON DELETE SET NULL,
  source TEXT DEFAULT 'manual',
  score INTEGER DEFAULT 0,
  total INTEGER DEFAULT 0,
  percentage DECIMAL DEFAULT 0,
  answers JSONB,
  completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.validate_quiz_session_source() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.source NOT IN ('manual','flashcard','past_exam','past_test','ai_generated') THEN
    RAISE EXCEPTION 'Invalid quiz session source: %', NEW.source;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_quiz_session_source_trigger BEFORE INSERT OR UPDATE ON public.revision_quiz_sessions FOR EACH ROW EXECUTE FUNCTION public.validate_quiz_session_source();

ALTER TABLE public.revision_quiz_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Students can manage own quiz sessions" ON public.revision_quiz_sessions FOR ALL TO authenticated USING (student_id = auth.uid()) WITH CHECK (student_id = auth.uid());
CREATE POLICY "Teachers can view quiz sessions" ON public.revision_quiz_sessions FOR SELECT TO authenticated USING (has_role(auth.uid(), 'teacher'::app_role));
CREATE POLICY "Admins can manage all quiz sessions" ON public.revision_quiz_sessions FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Room members
CREATE TABLE IF NOT EXISTS public.revision_room_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID REFERENCES public.revision_rooms(id) ON DELETE CASCADE,
  student_id UUID NOT NULL,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(room_id, student_id)
);
ALTER TABLE public.revision_room_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Students can manage own membership" ON public.revision_room_members FOR ALL TO authenticated USING (student_id = auth.uid()) WITH CHECK (student_id = auth.uid());
CREATE POLICY "Teachers can view members" ON public.revision_room_members FOR SELECT TO authenticated USING (has_role(auth.uid(), 'teacher'::app_role));
CREATE POLICY "Admins can manage all members" ON public.revision_room_members FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Notes
CREATE TABLE IF NOT EXISTS public.revision_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.live_sessions(id) ON DELETE SET NULL,
  title TEXT,
  content TEXT,
  is_private BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.revision_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Students can manage own notes" ON public.revision_notes FOR ALL TO authenticated USING (student_id = auth.uid()) WITH CHECK (student_id = auth.uid());
CREATE POLICY "Teachers can view non-private notes" ON public.revision_notes FOR SELECT TO authenticated USING (has_role(auth.uid(), 'teacher'::app_role) AND is_private = false);
CREATE POLICY "Admins can view all notes" ON public.revision_notes FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Revision schedule
CREATE TABLE IF NOT EXISTS public.revision_schedule (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE,
  revision_type TEXT,
  scheduled_date DATE,
  scheduled_time TIME,
  duration_minutes INTEGER DEFAULT 30,
  is_completed BOOLEAN DEFAULT false,
  reminder_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.revision_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Students can manage own schedule" ON public.revision_schedule FOR ALL TO authenticated USING (student_id = auth.uid()) WITH CHECK (student_id = auth.uid());
CREATE POLICY "Teachers can view schedules" ON public.revision_schedule FOR SELECT TO authenticated USING (has_role(auth.uid(), 'teacher'::app_role));
CREATE POLICY "Admins can manage all schedules" ON public.revision_schedule FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
