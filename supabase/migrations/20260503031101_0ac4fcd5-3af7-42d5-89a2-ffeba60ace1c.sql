
-- Add telegram link columns to profiles (append-only)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT,
  ADD COLUMN IF NOT EXISTS telegram_link_code TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_telegram_link_code
  ON public.profiles(telegram_link_code)
  WHERE telegram_link_code IS NOT NULL;

-- Ensure pg_net is enabled (already enabled per inspection, but safe to repeat)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Trigger function: fan-out new notifications via the dispatch-notification edge function
CREATE OR REPLACE FUNCTION public.dispatch_notification_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url TEXT := 'https://wvqeubhupkddtkcdwqcm.supabase.co/functions/v1/dispatch-notification';
  v_anon TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2cWV1Ymh1cGtkZHRrY2R3cWNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2NjE4MTgsImV4cCI6MjA4NjIzNzgxOH0.4RTpTVhZbbToO8bLecJhC2wXe82s__Ag8d6gUmmigTc';
BEGIN
  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon
    ),
    body := jsonb_build_object('notification_id', NEW.id)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block the insert if dispatch fails
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dispatch_notification ON public.notifications;
CREATE TRIGGER trg_dispatch_notification
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.dispatch_notification_on_insert();
