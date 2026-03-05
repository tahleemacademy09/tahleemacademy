
-- Subjects table
CREATE TABLE public.subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  title_ar text,
  description text,
  description_ar text,
  teacher_id uuid,
  is_active boolean DEFAULT true,
  livekit_room_name text,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view active subjects" ON public.subjects FOR SELECT TO authenticated USING (is_active = true);
CREATE POLICY "Admins can view all subjects" ON public.subjects FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage subjects" ON public.subjects FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update subjects" ON public.subjects FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete subjects" ON public.subjects FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

-- Live sessions table
CREATE TABLE public.live_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid REFERENCES public.subjects(id) ON DELETE CASCADE NOT NULL,
  host_id uuid NOT NULL,
  status text DEFAULT 'scheduled',
  started_at timestamptz,
  ended_at timestamptz,
  recording_status text DEFAULT 'none',
  total_participants integer DEFAULT 0,
  peak_participants integer DEFAULT 0,
  chat_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.live_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view sessions" ON public.live_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/teacher can insert sessions" ON public.live_sessions FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'teacher'));
CREATE POLICY "Admin/teacher can update sessions" ON public.live_sessions FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'teacher'));

-- Session recordings
CREATE TABLE public.session_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.live_sessions(id) ON DELETE CASCADE NOT NULL,
  subject_id uuid REFERENCES public.subjects(id) ON DELETE CASCADE NOT NULL,
  teacher_name text,
  file_url text,
  file_size bigint,
  duration_seconds integer,
  thumbnail_url text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.session_recordings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view recordings" ON public.session_recordings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/teacher can insert recordings" ON public.session_recordings FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'teacher'));

-- Attendance logs
CREATE TABLE public.attendance_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.live_sessions(id) ON DELETE CASCADE NOT NULL,
  user_id uuid NOT NULL,
  joined_at timestamptz DEFAULT now(),
  left_at timestamptz,
  duration_seconds integer,
  device_info text,
  ip_address text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own attendance" ON public.attendance_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admin/teacher can view all attendance" ON public.attendance_logs FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'teacher'));
CREATE POLICY "Authenticated can insert attendance" ON public.attendance_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own attendance" ON public.attendance_logs FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Session chat messages
CREATE TABLE public.session_chat (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.live_sessions(id) ON DELETE CASCADE NOT NULL,
  user_id uuid NOT NULL,
  message text NOT NULL,
  is_teacher_only boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.session_chat ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view session chat" ON public.session_chat FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can send chat" ON public.session_chat FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Subject materials
CREATE TABLE public.subject_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid REFERENCES public.subjects(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  file_url text NOT NULL,
  file_type text,
  file_size bigint,
  topic text,
  uploaded_by uuid NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.subject_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view materials" ON public.subject_materials FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/teacher can upload materials" ON public.subject_materials FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'teacher'));
CREATE POLICY "Admin/teacher can delete materials" ON public.subject_materials FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'teacher'));

-- Subject syllabus
CREATE TABLE public.subject_syllabus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid REFERENCES public.subjects(id) ON DELETE CASCADE NOT NULL,
  week_number integer,
  title text NOT NULL,
  description text,
  objectives text[],
  file_url text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.subject_syllabus ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view syllabus" ON public.subject_syllabus FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/teacher can manage syllabus" ON public.subject_syllabus FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'teacher'));
CREATE POLICY "Admin/teacher can update syllabus" ON public.subject_syllabus FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'teacher'));
CREATE POLICY "Admin/teacher can delete syllabus" ON public.subject_syllabus FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'teacher'));

-- Subject assignments
CREATE TABLE public.subject_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid REFERENCES public.subjects(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text,
  deadline timestamptz,
  file_url text,
  created_by uuid NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.subject_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view assignments" ON public.subject_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/teacher can manage assignments" ON public.subject_assignments FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'teacher'));
CREATE POLICY "Admin/teacher can update assignments" ON public.subject_assignments FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'teacher'));
CREATE POLICY "Admin/teacher can delete assignments" ON public.subject_assignments FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'teacher'));

-- Assignment submissions
CREATE TABLE public.assignment_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid REFERENCES public.subject_assignments(id) ON DELETE CASCADE NOT NULL,
  user_id uuid NOT NULL,
  file_url text,
  comment text,
  grade numeric,
  feedback text,
  graded_by uuid,
  graded_at timestamptz,
  is_late boolean DEFAULT false,
  submitted_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.assignment_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own submissions" ON public.assignment_submissions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admin/teacher can view all submissions" ON public.assignment_submissions FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'teacher'));
CREATE POLICY "Users can submit" ON public.assignment_submissions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own submission" ON public.assignment_submissions FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admin/teacher can grade" ON public.assignment_submissions FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'teacher'));

-- Subject announcements
CREATE TABLE public.subject_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid REFERENCES public.subjects(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  file_url text,
  is_pinned boolean DEFAULT false,
  created_by uuid NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.subject_announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view announcements" ON public.subject_announcements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/teacher can post announcements" ON public.subject_announcements FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'teacher'));
CREATE POLICY "Admin/teacher can update announcements" ON public.subject_announcements FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'teacher'));
CREATE POLICY "Admin/teacher can delete announcements" ON public.subject_announcements FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'teacher'));

-- Enable realtime for chat and sessions
ALTER PUBLICATION supabase_realtime ADD TABLE public.session_chat;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_logs;

-- Storage bucket for subject files
INSERT INTO storage.buckets (id, name, public) VALUES ('subject-files', 'subject-files', false);

CREATE POLICY "Authenticated can upload subject files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'subject-files');
CREATE POLICY "Authenticated can view subject files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'subject-files');
CREATE POLICY "Admin/teacher can delete subject files" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'subject-files' AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'teacher')));
