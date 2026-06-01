-- Fix push/notification pipeline
ALTER TABLE public.push_subscriptions
  DROP CONSTRAINT IF EXISTS push_subscriptions_user_id_fkey;

ALTER TABLE public.push_subscriptions
  ADD CONSTRAINT push_subscriptions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

DROP POLICY IF EXISTS "Service role manages push subs" ON public.push_subscriptions;
CREATE POLICY "Service role manages push subs"
  ON public.push_subscriptions
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.notify_class_ring()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_url  TEXT := 'https://wvqeubhupkddtkcdwqcm.supabase.co/functions/v1/ring-live-class';
  v_anon TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2cWV1Ymh1cGtkZHRrY2R3cWNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2NjE4MTgsImV4cCI6MjA4NjIzNzgxOH0.4RTpTVhZbbToO8bLecJhC2wXe82s__Ag8d6gUmmigTc';
BEGIN
  IF NEW.status = 'live' AND (OLD.status IS NULL OR OLD.status != 'live') THEN
    PERFORM net.http_post(
      url := v_url,
      headers := jsonb_build_object('Authorization','Bearer '||v_anon,'Content-Type','application/json'),
      body := jsonb_build_object('session_id', NEW.id, 'subject_id', NEW.subject_id, 'host_id', NEW.host_id)
    );
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_notify_class_ring ON public.live_sessions;
CREATE TRIGGER trg_notify_class_ring
  AFTER INSERT OR UPDATE OF status ON public.live_sessions
  FOR EACH ROW EXECUTE FUNCTION public.notify_class_ring();

DROP TRIGGER IF EXISTS trg_dispatch_notification ON public.notifications;
CREATE TRIGGER trg_dispatch_notification
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_notification_on_insert();
