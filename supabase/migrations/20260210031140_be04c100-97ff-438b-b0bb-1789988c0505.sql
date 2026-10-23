
-- Fix 1: Replace public profiles SELECT with authenticated-only
DROP POLICY IF EXISTS "Anyone can view profiles" ON public.profiles;

CREATE POLICY "Authenticated users can view profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);

-- Fix 2: Add missing UPDATE policy for enrollments progress
CREATE POLICY "Users can update own enrollment progress"
ON public.enrollments
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
