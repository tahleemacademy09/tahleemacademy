
-- Fix the live_sessions ring trigger that was throwing
-- "Quote command returned error" when admins/teachers clicked Start Class.
-- The function had a placeholder URL (<PROJECT_REF>) and bogus service-role
-- token, so net.http_post failed and the EXCEPTION block was missing.
-- Replace with the real URL + anon JWT + a guard that never blocks the insert.

CREATE OR REPLACE FUNCTION public.notify_class_ring()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_url  TEXT := 'https://wvqeubhupkddtkcdwqcm.supabase.co/functions/v1/ring-live-class';
  v_anon TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2cWV1Ymh1cGtkZHRrY2R3cWNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2NjE4MTgsImV4cCI6MjA4NjIzNzgxOH0.4RTpTVhZbbToO8bLecJhC2wXe82s__Ag8d6gUmmigTc';
BEGIN
  IF NEW.status = 'live' AND (OLD IS NULL OR OLD.status IS DISTINCT FROM 'live') THEN
    BEGIN
      PERFORM net.http_post(
        url     := v_url,
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || v_anon,
          'Content-Type',  'application/json'
        ),
        body    := jsonb_build_object(
          'session_id', NEW.id,
          'subject_id', NEW.subject_id,
          'host_id',    NEW.host_id
        )
      );
    EXCEPTION WHEN OTHERS THEN
      -- Never block the insert/update if the ring call fails.
      NULL;
    END;
  END IF;
  RETURN NEW;
END;
$function$;
