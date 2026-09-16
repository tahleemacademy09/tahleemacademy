-- Allow admins to delete live sessions
CREATE POLICY "Admins can delete live sessions"
ON public.live_sessions
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to delete chat messages
CREATE POLICY "Admins can delete chat messages"
ON public.chat_messages
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow teachers to delete chat messages in their channels
CREATE POLICY "Teachers can delete chat messages"
ON public.chat_messages
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'teacher'::app_role));

-- Allow admins to manage all notifications
CREATE POLICY "Admins can manage all notifications"
ON public.notifications
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Allow teachers to insert notifications
CREATE POLICY "Teachers can insert notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'teacher'::app_role));

-- Allow teachers to view sent notifications
CREATE POLICY "Teachers can view sent notifications"
ON public.notifications
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'teacher'::app_role));

-- Allow teachers to delete their own recordings
CREATE POLICY "Teachers can delete own recordings"
ON public.session_recordings
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'teacher'::app_role));

-- Allow teachers to update their own recordings
CREATE POLICY "Teachers can update own recordings"
ON public.session_recordings
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'teacher'::app_role));