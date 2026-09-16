CREATE OR REPLACE FUNCTION public.dispatch_notification_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_url text := 'https://wvqeubhupkddtkcdwqcm.supabase.co/functions/v1/dispatch-notification';
  v_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2cWV1Ymh1cGtkZHRrY2R3cWNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2NjE4MTgsImV4cCI6MjA4NjIzNzgxOH0.4RTpTVhZbbToO8bLecJhC2wXe82s__Ag8d6gUmmigTc';
BEGIN
  BEGIN
    PERFORM net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_key
      ),
      body := jsonb_build_object('notification_id', NEW.id)
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_dispatch_notification_on_insert ON public.notifications;
CREATE TRIGGER trg_dispatch_notification_on_insert
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.dispatch_notification_on_insert();

DROP TRIGGER IF EXISTS on_class_goes_live ON public.live_sessions;
CREATE TRIGGER on_class_goes_live
  AFTER INSERT OR UPDATE OF status ON public.live_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_class_ring();