ALTER TABLE public.class_participants
  ADD COLUMN IF NOT EXISTS is_banned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS banned_at timestamptz,
  ADD COLUMN IF NOT EXISTS join_request_status text,
  ADD COLUMN IF NOT EXISTS join_requested_at timestamptz;

ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS materials_locked boolean NOT NULL DEFAULT false;