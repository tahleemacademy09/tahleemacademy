-- Lets anyone in a class see the display name + role of people who posted in class chat,
-- without opening up the profiles table (students can only read their own row).
CREATE OR REPLACE FUNCTION public.get_chat_sender_names(_ids uuid[])
RETURNS TABLE(user_id uuid, full_name text, role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.user_id, p.full_name,
         COALESCE((SELECT ur.role::text FROM public.user_roles ur WHERE ur.user_id = p.user_id
                   ORDER BY (ur.role::text = 'admin') DESC, (ur.role::text = 'teacher') DESC LIMIT 1), 'student')
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND p.user_id = ANY(_ids)
    AND EXISTS (SELECT 1 FROM public.class_chat_messages m WHERE m.sender_id = p.user_id);
$$;
REVOKE ALL ON FUNCTION public.get_chat_sender_names(uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_chat_sender_names(uuid[]) TO authenticated;
