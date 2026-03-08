
-- Allow admins to delete exam_attempts (for reset)
CREATE POLICY "Admins can delete exam attempts"
ON public.exam_attempts
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to insert enrollments (for manual enrollment)
CREATE POLICY "Admins can insert enrollments"
ON public.enrollments
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to update enrollments
CREATE POLICY "Admins can update enrollments"
ON public.enrollments
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to update session_recordings
CREATE POLICY "Admins can update recordings"
ON public.session_recordings
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to delete session_recordings
CREATE POLICY "Admins can delete recordings"
ON public.session_recordings
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to update profiles (for editing student profiles)
CREATE POLICY "Admins can update all profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
