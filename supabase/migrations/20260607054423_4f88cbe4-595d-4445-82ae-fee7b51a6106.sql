DO $$
BEGIN
  IF to_regclass('public.notifications') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_dispatch_notification_on_insert ON public.notifications;

    CREATE TRIGGER trg_dispatch_notification_on_insert
      AFTER INSERT ON public.notifications
      FOR EACH ROW
      EXECUTE FUNCTION public.dispatch_notification_on_insert();
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;