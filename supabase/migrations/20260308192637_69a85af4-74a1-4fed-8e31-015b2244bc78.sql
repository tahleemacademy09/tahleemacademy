
-- Add columns to live_sessions
ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS class_settings JSONB DEFAULT '{}';
ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS waiting_room_enabled BOOLEAN DEFAULT true;
ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS hand_raise_enabled BOOLEAN DEFAULT true;
ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS chat_enabled BOOLEAN DEFAULT true;
ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS whiteboard_enabled BOOLEAN DEFAULT false;
ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS recording_enabled BOOLEAN DEFAULT true;
ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS participant_count INTEGER DEFAULT 0;
ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS actual_start_time TIMESTAMP WITH TIME ZONE;
ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS actual_end_time TIMESTAMP WITH TIME ZONE;

-- Class participants table
CREATE TABLE IF NOT EXISTS class_participants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES live_sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  left_at TIMESTAMP WITH TIME ZONE,
  duration_minutes INTEGER DEFAULT 0,
  hand_raised BOOLEAN DEFAULT false,
  hand_raised_at TIMESTAMP WITH TIME ZONE,
  is_muted BOOLEAN DEFAULT true,
  camera_on BOOLEAN DEFAULT false,
  UNIQUE(session_id, student_id)
);

ALTER TABLE class_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view participants" ON class_participants FOR SELECT USING (true);
CREATE POLICY "Users can manage own participation" ON class_participants FOR ALL USING (student_id = auth.uid()) WITH CHECK (student_id = auth.uid());
CREATE POLICY "Admins/teachers can manage participants" ON class_participants FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));

-- Class chat messages table
CREATE TABLE IF NOT EXISTS class_chat_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES live_sessions(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'text',
  file_url TEXT,
  is_pinned BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE class_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view class chat" ON class_chat_messages FOR SELECT USING (true);
CREATE POLICY "Authenticated can send class chat" ON class_chat_messages FOR INSERT WITH CHECK (sender_id = auth.uid());
CREATE POLICY "Admins/teachers can manage class chat" ON class_chat_messages FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));

-- Class polls table
CREATE TABLE IF NOT EXISTS class_polls (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES live_sessions(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  options JSONB NOT NULL,
  is_active BOOLEAN DEFAULT true,
  show_results BOOLEAN DEFAULT false,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE class_polls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view polls" ON class_polls FOR SELECT USING (true);
CREATE POLICY "Teachers can manage polls" ON class_polls FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));

-- Class poll answers table
CREATE TABLE IF NOT EXISTS class_poll_answers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  poll_id UUID REFERENCES class_polls(id) ON DELETE CASCADE,
  student_id UUID NOT NULL,
  answer_index INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(poll_id, student_id)
);

ALTER TABLE class_poll_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can vote" ON class_poll_answers FOR INSERT WITH CHECK (student_id = auth.uid());
CREATE POLICY "Authenticated can view answers" ON class_poll_answers FOR SELECT USING (true);
CREATE POLICY "Teachers can manage answers" ON class_poll_answers FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));

-- Class live quiz table
CREATE TABLE IF NOT EXISTS class_quiz_live (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES live_sessions(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  options JSONB NOT NULL,
  correct_answer INTEGER NOT NULL,
  time_limit_seconds INTEGER DEFAULT 30,
  is_active BOOLEAN DEFAULT true,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE class_quiz_live ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view quizzes" ON class_quiz_live FOR SELECT USING (true);
CREATE POLICY "Teachers can manage quizzes" ON class_quiz_live FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));

-- Enable realtime for class features
ALTER PUBLICATION supabase_realtime ADD TABLE class_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE class_chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE class_polls;
ALTER PUBLICATION supabase_realtime ADD TABLE class_poll_answers;
ALTER PUBLICATION supabase_realtime ADD TABLE class_quiz_live;
