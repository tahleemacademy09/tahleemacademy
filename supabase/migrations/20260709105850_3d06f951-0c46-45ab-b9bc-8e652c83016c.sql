-- ══════════════════════════════════════════════════════════════════
-- Notify all admins when a new student registers, and add a daily
-- reminder cron for enrollments that admins have not yet reviewed.
-- ══════════════════════════════════════════════════════════════════

-- 1. Trigger function: fires on INSERT into user_roles for role='student'
CREATE OR REPLACE FUNCTION public.notify_admins_of_new_student()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_id       uuid;
  student_name   text;
  student_email  text;
BEGIN
  IF NEW.role::text <> 'student' THEN
    RETURN NEW;
  END IF;

  SELECT full_name, email
    INTO student_name, student_email
    FROM public.profiles
    WHERE user_id = NEW.user_id;

  FOR admin_id IN
    SELECT user_id FROM public.user_roles WHERE role = 'admin'
  LOOP
    INSERT INTO public.notifications
      (user_id, title, message, title_ar, message_ar, type, link, is_read)
    VALUES (
      admin_id,
      '👤 New Student Registration',
      'Assalamu Alaikum 🌙 ' ||
        COALESCE(student_name, student_email, 'A new student') ||
        ' has just registered. Please review their enrollment.',
      '👤 تسجيل طالب جديد',
      'السلام عليكم ورحمة الله 🌙 قام ' ||
        COALESCE(student_name, student_email, 'طالب جديد') ||
        ' بالتسجيل. يرجى مراجعة تسجيله.',
      'admin_new_student',
      '/admin/students',
      false
    );
  END LOOP;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[notify_admins_of_new_student] failed for %: %', NEW.user_id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_admins_of_new_student ON public.user_roles;
CREATE TRIGGER trg_notify_admins_of_new_student
  AFTER INSERT ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admins_of_new_student();

-- 2. Daily reminder function — nudge admins about students still pending
--    Tasjeel verification for more than 24h. Only sends one reminder per day.
CREATE OR REPLACE FUNCTION public.remind_admins_unreviewed_students()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pending_count int;
  admin_id      uuid;
  inserted      int := 0;
BEGIN
  SELECT COUNT(*) INTO pending_count
    FROM public.tasjeel_progress tp
    JOIN public.profiles p ON p.user_id = tp.user_id
    WHERE tp.current_step <> 'verified'
      AND tp.created_at < now() - interval '24 hours';

  IF pending_count = 0 THEN RETURN 0; END IF;

  FOR admin_id IN
    SELECT user_id FROM public.user_roles WHERE role = 'admin'
  LOOP
    -- Skip if we already sent a reminder to this admin today
    IF EXISTS (
      SELECT 1 FROM public.notifications
      WHERE user_id = admin_id
        AND type = 'admin_pending_reminder'
        AND created_at::date = CURRENT_DATE
    ) THEN CONTINUE; END IF;

    INSERT INTO public.notifications
      (user_id, title, message, title_ar, message_ar, type, link, is_read)
    VALUES (
      admin_id,
      '⏰ ' || pending_count || ' student registration' ||
        CASE WHEN pending_count = 1 THEN '' ELSE 's' END || ' awaiting review',
      'Assalamu Alaikum 🌙 There ' ||
        CASE WHEN pending_count = 1 THEN 'is 1 student' ELSE 'are ' || pending_count || ' students' END ||
        ' whose enrollment has been pending for over 24 hours. Please review at your earliest convenience.',
      '⏰ ' || pending_count || ' تسجيل بانتظار المراجعة',
      'السلام عليكم ورحمة الله 🌙 يوجد ' || pending_count ||
        ' تسجيل طلاب لم تتم مراجعته منذ أكثر من ٢٤ ساعة. يرجى المراجعة في أقرب وقت.',
      'admin_pending_reminder',
      '/admin/students',
      false
    );
    inserted := inserted + 1;
  END LOOP;

  RETURN inserted;
END;
$$;

-- 3. Schedule the reminder cron at 8am daily
SELECT cron.unschedule('remind-admins-unreviewed-students')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='remind-admins-unreviewed-students');

SELECT cron.schedule(
  'remind-admins-unreviewed-students',
  '0 8 * * *',
  $$ SELECT public.remind_admins_unreviewed_students(); $$
);