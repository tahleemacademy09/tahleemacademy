
-- FIX 1: Restrict profiles table access (was USING (true) for all authenticated)
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;

CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Teachers can view all profiles" ON public.profiles
  FOR SELECT USING (public.has_role(auth.uid(), 'teacher'::app_role));

-- FIX 2: Hide correct_answer and explanation from students
-- Replace the student SELECT policy on exam_questions to only allow admin/teacher full access
-- Students get questions through a secure function that strips answers
DROP POLICY IF EXISTS "Students can view questions for their exams" ON public.exam_questions;

-- Admin/teacher full access (already exists for INSERT/UPDATE/DELETE, add SELECT)
CREATE POLICY "Admin/teacher can view all questions" ON public.exam_questions
  FOR SELECT USING (
    public.has_role(auth.uid(), 'admin'::app_role) OR 
    public.has_role(auth.uid(), 'teacher'::app_role)
  );

-- Create a secure function for students to get questions without answers
CREATE OR REPLACE FUNCTION public.get_exam_questions_for_student(_exam_id uuid)
RETURNS TABLE (
  id uuid,
  exam_id uuid,
  question_type text,
  question_text text,
  question_text_ar text,
  options jsonb,
  points integer,
  difficulty text,
  media_url text,
  sort_order integer,
  explanation text,
  explanation_ar text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify student has an active attempt for this exam
  IF NOT EXISTS (
    SELECT 1 FROM public.exam_attempts ea
    WHERE ea.exam_id = _exam_id AND ea.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied: no exam attempt found';
  END IF;

  RETURN QUERY
  SELECT 
    eq.id,
    eq.exam_id,
    eq.question_type,
    eq.question_text,
    eq.question_text_ar,
    -- Strip is_correct from MCQ options
    CASE 
      WHEN eq.question_type IN ('mcq', 'image_mcq') AND eq.options IS NOT NULL THEN
        (SELECT jsonb_agg(
          jsonb_build_object(
            'id', opt->>'id',
            'text', opt->>'text',
            'text_ar', opt->>'text_ar',
            'image_url', opt->>'image_url'
          )
        ) FROM jsonb_array_elements(eq.options) AS opt)
      ELSE NULL
    END as options,
    eq.points,
    eq.difficulty,
    eq.media_url,
    eq.sort_order,
    NULL::text as explanation,
    NULL::text as explanation_ar
  FROM public.exam_questions eq
  WHERE eq.exam_id = _exam_id
  ORDER BY eq.sort_order;
END;
$$;

-- FIX 3: Make exam-media bucket private
UPDATE storage.buckets SET public = false WHERE id = 'exam-media';

-- Remove the public access policy
DROP POLICY IF EXISTS "Anyone can view exam media" ON storage.objects;

-- Add authenticated access policy for exam media
CREATE POLICY "Authenticated users can view exam media" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'exam-media' AND
    auth.role() = 'authenticated'
  );
