
-- Chat messages table for Al-Majlis
CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_level_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'text' CHECK (content_type IN ('text', 'image', 'audio')),
  text TEXT,
  media_path TEXT,
  audio_duration_ms INTEGER,
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Students can read messages in their enrolled class levels
CREATE POLICY "Users can read chat messages" ON public.chat_messages
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can send messages" ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can delete messages" ON public.chat_messages
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_chat_messages_class_level ON public.chat_messages(class_level_id, created_at DESC);

-- Enable realtime for chat messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;

-- AI query logs table
CREATE TABLE public.ai_query_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  query_text TEXT NOT NULL,
  intent_type TEXT DEFAULT 'generic' CHECK (intent_type IN ('grades', 'schedule', 'generic', 'curriculum')),
  result_meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_query_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own AI logs" ON public.ai_query_logs
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own AI logs" ON public.ai_query_logs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
