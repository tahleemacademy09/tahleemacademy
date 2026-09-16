-- Allow admin/teacher to upload files to subject-files bucket
CREATE POLICY "Admin/teacher can upload to subject-files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'subject-files' AND
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'))
);

-- Allow authenticated users to read from subject-files bucket (for playback)
CREATE POLICY "Authenticated can read subject-files"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'subject-files');
