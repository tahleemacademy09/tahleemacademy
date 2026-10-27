-- 1) Admin-facing notification types must also be pushed, not just written to the bell.
-- 2) admin_user_ids(): students/teachers can't read admin rows (RLS), so client "notify all admins" lookups returned [].
-- (Already applied to project qasmwzwaorncalximemy as admin_notification_types_push + admin_user_ids_rpc.)
CREATE OR REPLACE FUNCTION public.is_push_type(p_type text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $f$
  select p_type = any(array[
    'class_ring','admin_class_ring','exam_assigned','exam_reminder_2hr','exam_deadline_extended','exam_rescheduled','result_released',
    'assignment_new','assignment_due_soon','assignment_graded','announcement_new','announcement','support_ticket',
    'payment_update','payment_failed','admin_payment','oral_exam_assigned','oral_exam_called','oral_exam_slot_start','oral_exam_noshow',
    'hifdh_assignment','hifdh_reminder','hifdh_fine','private_session','live_class_scheduled','live_class_cancelled','class_join_response',
    'musabaqah_registration_open','musabaqah_registration_status','admin_musabaqah_registration',
    'admin_recitation_booking','admin_new_student','admin_violation','admin_recording_failed','recording_ready','teacher_payment','majlis_mention',
    'hifdh_submission','admin_registration_step','admin_pending_reminder','class_join','oral_slot_booked'
  ]);
$f$;
CREATE OR REPLACE FUNCTION public.admin_user_ids() RETURNS TABLE(user_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
  select ur.user_id from public.user_roles ur where ur.role = 'admin'::app_role;
$f$;
REVOKE ALL ON FUNCTION public.admin_user_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_user_ids() TO authenticated, service_role;
