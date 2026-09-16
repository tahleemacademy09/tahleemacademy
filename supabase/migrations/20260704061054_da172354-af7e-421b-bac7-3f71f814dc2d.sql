DROP TRIGGER IF EXISTS on_notification_inserted ON public.notifications;
DROP TRIGGER IF EXISTS trg_dispatch_notification ON public.notifications;
DROP TRIGGER IF EXISTS trg_dispatch_notification_on_insert ON public.notifications;

CREATE TRIGGER trg_dispatch_notification_on_insert
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.dispatch_notification_on_insert();

DROP TRIGGER IF EXISTS trg_notify_class_ring ON public.live_sessions;
DROP TRIGGER IF EXISTS on_class_goes_live ON public.live_sessions;

CREATE TRIGGER on_class_goes_live
  AFTER INSERT OR UPDATE OF status ON public.live_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_class_ring();