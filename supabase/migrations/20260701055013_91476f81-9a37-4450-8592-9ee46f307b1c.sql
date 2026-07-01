
-- Reattach missing triggers so admin/teacher actions actually fan out to
-- push/telegram notifications and student notifications.

-- 1) Fan out every new row in notifications to the dispatch-notification
--    edge function (web-push + Telegram + realtime bell).
DROP TRIGGER IF EXISTS trg_dispatch_notification ON public.notifications;
CREATE TRIGGER trg_dispatch_notification
AFTER INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.dispatch_notification_on_insert();

-- 2) Ring live-class notification when a session flips to 'live'.
DROP TRIGGER IF EXISTS trg_notify_class_ring ON public.live_sessions;
CREATE TRIGGER trg_notify_class_ring
AFTER INSERT OR UPDATE OF status ON public.live_sessions
FOR EACH ROW EXECUTE FUNCTION public.notify_class_ring();

-- 3) Auto-attendance on join.
DROP TRIGGER IF EXISTS trg_auto_attendance_on_join ON public.class_participants;
CREATE TRIGGER trg_auto_attendance_on_join
AFTER INSERT OR UPDATE OF joined_at ON public.class_participants
FOR EACH ROW EXECUTE FUNCTION public.auto_attendance_on_join();

-- 4) Content-upload notifications: announcements, materials, recordings.
DROP TRIGGER IF EXISTS trg_notify_announcement ON public.subject_announcements;
CREATE TRIGGER trg_notify_announcement
AFTER INSERT ON public.subject_announcements
FOR EACH ROW EXECUTE FUNCTION public.notify_content_upload('announcement');

DROP TRIGGER IF EXISTS trg_notify_material ON public.subject_materials;
CREATE TRIGGER trg_notify_material
AFTER INSERT ON public.subject_materials
FOR EACH ROW EXECUTE FUNCTION public.notify_content_upload('material');

DROP TRIGGER IF EXISTS trg_notify_recording ON public.session_recordings;
CREATE TRIGGER trg_notify_recording
AFTER INSERT ON public.session_recordings
FOR EACH ROW EXECUTE FUNCTION public.notify_content_upload('recording');

DROP TRIGGER IF EXISTS trg_notify_teacher_announcement ON public.teacher_announcements;
CREATE TRIGGER trg_notify_teacher_announcement
AFTER INSERT ON public.teacher_announcements
FOR EACH ROW EXECUTE FUNCTION public.notify_content_upload('teacher_announcement');
