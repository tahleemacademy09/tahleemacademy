-- Add private student columns to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS student_type TEXT DEFAULT 'group';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS assigned_teacher_id UUID;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS private_session_rate TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS private_notes TEXT;

-- Create private_sessions table
CREATE TABLE IF NOT EXISTS private_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL,
  teacher_id UUID NOT NULL,
  subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  status TEXT DEFAULT 'scheduled',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE private_sessions ENABLE ROW LEVEL SECURITY;

-- RLS: Admins can do everything
CREATE POLICY "Admins can manage private sessions"
ON private_sessions FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- RLS: Teachers can view/manage their own sessions
CREATE POLICY "Teachers can view own private sessions"
ON private_sessions FOR SELECT TO authenticated
USING (teacher_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Teachers can insert own private sessions"
ON private_sessions FOR INSERT TO authenticated
WITH CHECK (teacher_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Teachers can update own private sessions"
ON private_sessions FOR UPDATE TO authenticated
USING (teacher_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Teachers can delete own private sessions"
ON private_sessions FOR DELETE TO authenticated
USING (teacher_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

-- Students can view their own sessions
CREATE POLICY "Students can view own private sessions"
ON private_sessions FOR SELECT TO authenticated
USING (student_id = auth.uid());