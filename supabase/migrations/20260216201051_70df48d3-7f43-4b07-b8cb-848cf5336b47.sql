
-- Fix 1: Restrictive storage policies for exam-media bucket
DROP POLICY IF EXISTS "Authenticated users can view exam media" ON storage.objects;

-- Admins/teachers can view all exam media
CREATE POLICY "Admins/teachers can view all exam media" 
  ON storage.objects FOR SELECT USING (
    bucket_id = 'exam-media' AND
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'teacher'::public.app_role))
  );

-- Students can view exam question media (questions/ folder)
CREATE POLICY "Students can view exam question media" 
  ON storage.objects FOR SELECT USING (
    bucket_id = 'exam-media' AND
    (storage.foldername(name))[1] = 'questions'
  );

-- Students can view only their own answer recordings
CREATE POLICY "Students can view own answer media" 
  ON storage.objects FOR SELECT USING (
    bucket_id = 'exam-media' AND
    (storage.foldername(name))[1] = 'student-answers' AND
    auth.uid()::text = (storage.foldername(name))[2]
  );

-- Fix 2: Server-side HTML sanitization trigger for exam questions
CREATE OR REPLACE FUNCTION public.sanitize_exam_question_html()
RETURNS TRIGGER AS $$
BEGIN
  -- Strip script tags
  NEW.question_text := regexp_replace(NEW.question_text, '<script[^>]*>.*?</script>', '', 'gi');
  NEW.question_text := regexp_replace(NEW.question_text, 'on\w+\s*=', '', 'gi');
  NEW.question_text := regexp_replace(NEW.question_text, 'javascript:', '', 'gi');
  
  IF NEW.question_text_ar IS NOT NULL THEN
    NEW.question_text_ar := regexp_replace(NEW.question_text_ar, '<script[^>]*>.*?</script>', '', 'gi');
    NEW.question_text_ar := regexp_replace(NEW.question_text_ar, 'on\w+\s*=', '', 'gi');
    NEW.question_text_ar := regexp_replace(NEW.question_text_ar, 'javascript:', '', 'gi');
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER sanitize_question_html_trigger
  BEFORE INSERT OR UPDATE ON public.exam_questions
  FOR EACH ROW
  EXECUTE FUNCTION public.sanitize_exam_question_html();
