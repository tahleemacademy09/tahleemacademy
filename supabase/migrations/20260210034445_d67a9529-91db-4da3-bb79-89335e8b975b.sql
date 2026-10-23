
-- Create storage bucket for exam media
INSERT INTO storage.buckets (id, name, public)
VALUES ('exam-media', 'exam-media', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for exam-media bucket
CREATE POLICY "Anyone can view exam media"
ON storage.objects FOR SELECT
USING (bucket_id = 'exam-media');

CREATE POLICY "Admins and teachers can upload exam media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'exam-media' 
  AND (
    public.has_role(auth.uid(), 'admin') 
    OR public.has_role(auth.uid(), 'teacher')
  )
);

CREATE POLICY "Students can upload audio answers"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'exam-media' 
  AND (storage.foldername(name))[1] = 'student-answers'
);

CREATE POLICY "Admins and teachers can delete exam media"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'exam-media' 
  AND (
    public.has_role(auth.uid(), 'admin') 
    OR public.has_role(auth.uid(), 'teacher')
  )
);
