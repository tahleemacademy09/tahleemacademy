-- Al-Majlis Live — meetings / urgent discussions that run inside the real classroom.
-- One dedicated "Al-Majlis Live" subject owns the LiveKit room, so the existing
-- classroom (controls, whiteboard, chat, participants, recording) is reused as-is,
-- and its recordings show up through the normal session_recordings pipeline.

ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS is_majlis_live boolean NOT NULL DEFAULT false;

INSERT INTO public.subjects (title, title_ar, description, is_active, visibility, is_compulsory, is_majlis_live)
SELECT 'Al-Majlis Live', 'المجلس المباشر', 'Meetings and urgent discussions', true, 'private', false, true
WHERE NOT EXISTS (SELECT 1 FROM public.subjects WHERE is_majlis_live = true);

CREATE TABLE IF NOT EXISTS public.majlis_meetings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  description   text,
  kind          text NOT NULL DEFAULT 'meeting'
                CHECK (kind IN ('meeting','urgent','discussion','lecture')),
  audience      text NOT NULL DEFAULT 'all',        -- all | students | teachers | level:<slug>
  status        text NOT NULL DEFAULT 'scheduled'
                CHECK (status IN ('scheduled','live','ended','cancelled')),
  scheduled_at  timestamptz,
  started_at    timestamptz,
  ended_at      timestamptz,
  host_id       uuid NOT NULL,
  host_name     text,
  session_id    uuid,                               -- live_sessions row in the Majlis Live subject
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS majlis_meetings_status_idx ON public.majlis_meetings (status, scheduled_at);

ALTER TABLE public.majlis_meetings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "majlis_meetings read" ON public.majlis_meetings;
CREATE POLICY "majlis_meetings read" ON public.majlis_meetings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "majlis_meetings staff write" ON public.majlis_meetings;
CREATE POLICY "majlis_meetings staff write" ON public.majlis_meetings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.majlis_meetings;
