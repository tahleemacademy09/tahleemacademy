
CREATE TABLE IF NOT EXISTS public.recording_watch_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  recording_id UUID REFERENCES public.session_recordings(id) ON DELETE CASCADE NOT NULL,
  student_id UUID NOT NULL,
  progress_seconds INTEGER DEFAULT 0,
  completed BOOLEAN DEFAULT false,
  last_watched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  watch_count INTEGER DEFAULT 1,
  UNIQUE(recording_id, student_id)
);

CREATE TABLE IF NOT EXISTS public.recording_bookmarks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  recording_id UUID REFERENCES public.session_recordings(id) ON DELETE CASCADE NOT NULL,
  student_id UUID NOT NULL,
  timestamp_seconds INTEGER NOT NULL,
  label TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.recording_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  recording_id UUID REFERENCES public.session_recordings(id) ON DELETE CASCADE NOT NULL,
  student_id UUID NOT NULL,
  timestamp_seconds INTEGER NOT NULL,
  note_text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS for recording_watch_progress
ALTER TABLE public.recording_watch_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own watch progress"
ON public.recording_watch_progress FOR ALL
TO authenticated
USING (student_id = auth.uid())
WITH CHECK (student_id = auth.uid());

CREATE POLICY "Admins can view all watch progress"
ON public.recording_watch_progress FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Teachers can view all watch progress"
ON public.recording_watch_progress FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'teacher'::app_role));

-- RLS for recording_bookmarks
ALTER TABLE public.recording_bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own bookmarks"
ON public.recording_bookmarks FOR ALL
TO authenticated
USING (student_id = auth.uid())
WITH CHECK (student_id = auth.uid());

CREATE POLICY "Admins can view all bookmarks"
ON public.recording_bookmarks FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- RLS for recording_notes
ALTER TABLE public.recording_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own notes"
ON public.recording_notes FOR ALL
TO authenticated
USING (student_id = auth.uid())
WITH CHECK (student_id = auth.uid());

CREATE POLICY "Admins can view all notes"
ON public.recording_notes FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Enable realtime for watch progress
ALTER PUBLICATION supabase_realtime ADD TABLE public.recording_watch_progress;
