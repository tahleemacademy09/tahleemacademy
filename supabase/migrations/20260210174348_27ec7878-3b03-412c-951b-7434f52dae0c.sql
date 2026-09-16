
-- Fix activity_logs RLS policies (currently all RESTRICTIVE = broken)
DROP POLICY IF EXISTS "Admins can view all logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Users can view own logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Users can create own logs" ON public.activity_logs;

CREATE POLICY "Admins can view all logs"
ON public.activity_logs FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view own logs"
ON public.activity_logs FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can create own logs"
ON public.activity_logs FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can create logs for any user"
ON public.activity_logs FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
