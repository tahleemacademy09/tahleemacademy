-- Bucket for students' daily Hifdh recitation recordings (used by HifdhDailyRevisionPage).
-- Safe to run more than once. Private bucket: students write/read only their own folder
-- ({user_id}/...), admins and teachers can read everything.

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('hifdh-daily-audio', 'hifdh-daily-audio', false, 104857600)
ON CONFLICT (id) DO UPDATE SET file_size_limit = 104857600;

DROP POLICY IF EXISTS "hifdh_daily_audio_owner_insert" ON storage.objects;
CREATE POLICY "hifdh_daily_audio_owner_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'hifdh-daily-audio' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "hifdh_daily_audio_owner_update" ON storage.objects;
CREATE POLICY "hifdh_daily_audio_owner_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'hifdh-daily-audio' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "hifdh_daily_audio_read" ON storage.objects;
CREATE POLICY "hifdh_daily_audio_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'hifdh-daily-audio'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'teacher')
    )
  );

DROP POLICY IF EXISTS "hifdh_daily_audio_staff_delete" ON storage.objects;
CREATE POLICY "hifdh_daily_audio_staff_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'hifdh-daily-audio'
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'))
  );
