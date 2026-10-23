
-- Fix: The SELECT policy on profiles is RESTRICTIVE but needs to be PERMISSIVE
-- Drop the restrictive one and recreate as permissive
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;

CREATE POLICY "Authenticated users can view profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);
