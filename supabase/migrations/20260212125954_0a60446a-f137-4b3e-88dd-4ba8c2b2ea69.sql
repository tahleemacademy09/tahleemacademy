
-- Violations table for tracking all proctoring events
CREATE TABLE public.violations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
  violation_type text NOT NULL, -- 'tab_switch', 'face_missing', 'fullscreen_exit', 'multiple_faces', 'no_audio', 'copy_paste', 'right_click', 'dev_tools'
  severity_score integer NOT NULL DEFAULT 1, -- 1=low, 2=medium, 3=high
  details text,
  screenshot_url text,
  timestamp timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.violations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins/teachers can view all violations" ON public.violations
  FOR SELECT USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'teacher'));

CREATE POLICY "Admins/teachers can delete violations" ON public.violations
  FOR DELETE USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Students can insert own violations" ON public.violations
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM exam_attempts ea WHERE ea.id = violations.attempt_id AND ea.user_id = auth.uid())
  );

CREATE POLICY "Students can view own violations" ON public.violations
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM exam_attempts ea WHERE ea.id = violations.attempt_id AND ea.user_id = auth.uid())
  );

-- Device log table
CREATE TABLE public.device_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
  device_type text, -- 'desktop', 'mobile', 'tablet'
  browser text,
  ip_address text,
  user_agent text,
  screen_resolution text,
  vpn_detected boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.device_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins/teachers can view all device logs" ON public.device_logs
  FOR SELECT USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'teacher'));

CREATE POLICY "Students can insert own device logs" ON public.device_logs
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM exam_attempts ea WHERE ea.id = device_logs.attempt_id AND ea.user_id = auth.uid())
  );

-- Proctoring sessions table  
CREATE TABLE public.proctoring_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE UNIQUE,
  webcam_enabled boolean DEFAULT false,
  microphone_enabled boolean DEFAULT false,
  fullscreen_active boolean DEFAULT false,
  suspicion_level text DEFAULT 'low', -- 'low', 'medium', 'high', 'critical'
  total_violations integer DEFAULT 0,
  integrity_score numeric DEFAULT 100,
  warnings_issued integer DEFAULT 0,
  max_warnings integer DEFAULT 3,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.proctoring_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins/teachers can view all proctoring sessions" ON public.proctoring_sessions
  FOR SELECT USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'teacher'));

CREATE POLICY "Admins/teachers can update proctoring sessions" ON public.proctoring_sessions
  FOR UPDATE USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'teacher'));

CREATE POLICY "Students can insert own proctoring session" ON public.proctoring_sessions
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM exam_attempts ea WHERE ea.id = proctoring_sessions.attempt_id AND ea.user_id = auth.uid())
  );

CREATE POLICY "Students can update own proctoring session" ON public.proctoring_sessions
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM exam_attempts ea WHERE ea.id = proctoring_sessions.attempt_id AND ea.user_id = auth.uid())
  );

CREATE POLICY "Students can view own proctoring session" ON public.proctoring_sessions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM exam_attempts ea WHERE ea.id = proctoring_sessions.attempt_id AND ea.user_id = auth.uid())
  );

-- Media files tracking table
CREATE TABLE public.proctoring_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
  file_type text NOT NULL, -- 'screenshot', 'webcam_recording', 'screen_recording', 'audio_log'
  file_url text NOT NULL,
  file_size bigint,
  file_name text,
  duration_seconds integer,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.proctoring_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins/teachers can view all media" ON public.proctoring_media
  FOR SELECT USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'teacher'));

CREATE POLICY "Admins can delete media" ON public.proctoring_media
  FOR DELETE USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Students can insert own media" ON public.proctoring_media
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM exam_attempts ea WHERE ea.id = proctoring_media.attempt_id AND ea.user_id = auth.uid())
  );

CREATE POLICY "Students can view own media" ON public.proctoring_media
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM exam_attempts ea WHERE ea.id = proctoring_media.attempt_id AND ea.user_id = auth.uid())
  );

-- Add proctoring fields to exams table
ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS proctoring_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS webcam_required boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS fullscreen_required boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS tab_switch_limit integer DEFAULT 3,
  ADD COLUMN IF NOT EXISTS screenshot_interval_seconds integer DEFAULT 30,
  ADD COLUMN IF NOT EXISTS record_webcam boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS record_screen boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS record_audio boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_warnings integer DEFAULT 3,
  ADD COLUMN IF NOT EXISTS auto_submit_on_violation boolean DEFAULT false;

-- Add integrity fields to exam_attempts
ALTER TABLE public.exam_attempts
  ADD COLUMN IF NOT EXISTS suspicion_level text DEFAULT 'low',
  ADD COLUMN IF NOT EXISTS integrity_score numeric DEFAULT 100;

-- Create storage bucket for proctoring media
INSERT INTO storage.buckets (id, name, public) VALUES ('proctoring-media', 'proctoring-media', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for proctoring media
CREATE POLICY "Students can upload proctoring media" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'proctoring-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Admins/teachers can view proctoring media" ON storage.objects
  FOR SELECT USING (bucket_id = 'proctoring-media' AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'teacher')));

CREATE POLICY "Students can view own proctoring media" ON storage.objects
  FOR SELECT USING (bucket_id = 'proctoring-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Admins can delete proctoring media" ON storage.objects
  FOR DELETE USING (bucket_id = 'proctoring-media' AND has_role(auth.uid(), 'admin'));

-- Indexes for performance
CREATE INDEX idx_violations_attempt_id ON public.violations(attempt_id);
CREATE INDEX idx_violations_type ON public.violations(violation_type);
CREATE INDEX idx_device_logs_attempt_id ON public.device_logs(attempt_id);
CREATE INDEX idx_proctoring_media_attempt_id ON public.proctoring_media(attempt_id);
CREATE INDEX idx_proctoring_sessions_attempt_id ON public.proctoring_sessions(attempt_id);
