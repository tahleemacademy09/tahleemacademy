-- Fill a role-specific link for notifications created without one, so every
-- notification opens a real page. Runs for every creator (app code, edge
-- functions, other triggers). Then backfills currently-unread rows.
create or replace function public.notification_default_link(p_type text, p_user uuid)
returns text language plpgsql stable security definer set search_path to 'public' as $$
declare r text;
begin
  select case when bool_or(role::text='admin') then 'admin'
              when bool_or(role::text='teacher') then 'teacher'
              else 'student' end
    into r from public.user_roles where user_id = p_user;
  r := coalesce(r, 'student');
  return case
    when p_type in ('announcement','general','admin_announcement','system_announcement','info','admin_message') then
      case r when 'admin' then '/admin/notifications' when 'teacher' then '/teacher/announcements' else '/student' end
    when p_type = 'exam' then
      case r when 'admin' then '/admin/exams' when 'teacher' then '/teacher/exams' else '/student/exams' end
    when p_type = 'daily_ai_reminder' then
      case r when 'admin' then '/admin' when 'teacher' then '/teacher' else '/student' end
    when p_type = 'support_ticket' then
      case r when 'admin' then '/admin/support-tickets' when 'teacher' then '/teacher/support' else '/student/support' end
    when p_type = 'hifdh_reminder' then
      case r when 'admin' then '/admin/hifdh-program' when 'teacher' then '/teacher/hifdh' else '/student/hifdh-daily' end
    when p_type = 'app_update' then
      case r when 'admin' then '/admin/app-releases' when 'teacher' then '/teacher/app' else '/student/app' end
    else null end;
end $$;

create or replace function public.fill_notification_link()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.link is null or btrim(new.link) in ('', '/', '/dashboard') then
    new.link := coalesce(public.notification_default_link(new.type, new.user_id), new.link);
  end if;
  return new;
end $$;

drop trigger if exists trg_fill_notification_link on public.notifications;
create trigger trg_fill_notification_link before insert on public.notifications
  for each row execute function public.fill_notification_link();

-- Backfill: unread rows only
update public.notifications n
   set link = public.notification_default_link(n.type, n.user_id)
 where n.is_read = false
   and (n.link is null or btrim(n.link) in ('', '/', '/dashboard'))
   and public.notification_default_link(n.type, n.user_id) is not null;
