
-- Teacher announcements table
CREATE TABLE IF NOT EXISTS public.teacher_announcements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id UUID NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  target_type TEXT DEFAULT 'all',
  target_id UUID,
  priority TEXT DEFAULT 'normal',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Validation trigger for target_type
CREATE OR REPLACE FUNCTION public.validate_announcement_target_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.target_type NOT IN ('all', 'subject', 'student') THEN
    RAISE EXCEPTION 'Invalid target_type: %. Must be all, subject, or student.', NEW.target_type;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_announcement_target_type_trigger
  BEFORE INSERT OR UPDATE ON public.teacher_announcements
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_announcement_target_type();

-- Validation trigger for priority
CREATE OR REPLACE FUNCTION public.validate_announcement_priority()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.priority NOT IN ('normal', 'important', 'urgent') THEN
    RAISE EXCEPTION 'Invalid priority: %. Must be normal, important, or urgent.', NEW.priority;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_announcement_priority_trigger
  BEFORE INSERT OR UPDATE ON public.teacher_announcements
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_announcement_priority();

ALTER TABLE public.teacher_announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can insert own announcements" ON public.teacher_announcements
  FOR INSERT WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Teachers can view own announcements" ON public.teacher_announcements
  FOR SELECT USING (auth.uid() = teacher_id);

CREATE POLICY "Teachers can delete own announcements" ON public.teacher_announcements
  FOR DELETE USING (auth.uid() = teacher_id);

CREATE POLICY "Admins can manage all announcements" ON public.teacher_announcements
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Students can view announcements targeting them" ON public.teacher_announcements
  FOR SELECT USING (
    target_type = 'all' OR
    (target_type = 'student' AND target_id = auth.uid()) OR
    (target_type = 'subject' AND EXISTS (
      SELECT 1 FROM public.enrollments e
      JOIN public.courses c ON c.id = e.course_id
      WHERE e.user_id = auth.uid() AND c.subject_id = target_id
    ))
  );

-- Manual attendance table (teacher marks attendance)
CREATE TABLE IF NOT EXISTS public.manual_attendance (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL,
  subject_id UUID REFERENCES public.subjects(id),
  teacher_id UUID NOT NULL,
  status TEXT DEFAULT 'absent',
  date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.validate_attendance_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status NOT IN ('present', 'absent', 'late') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be present, absent, or late.', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_attendance_status_trigger
  BEFORE INSERT OR UPDATE ON public.manual_attendance
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_attendance_status();

ALTER TABLE public.manual_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can manage own attendance" ON public.manual_attendance
  FOR ALL USING (auth.uid() = teacher_id)
  WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Admins can manage all attendance" ON public.manual_attendance
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Students can view own attendance" ON public.manual_attendance
  FOR SELECT USING (auth.uid() = student_id);
