
-- Add icon column to subjects
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS icon text DEFAULT 'BookOpen';

-- Add level column to profiles for student level tracking
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS level text DEFAULT 'beginner';

-- Add subject_id FK to courses
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL;

-- Add sort_order to courses
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;

-- Add level column to subject_syllabus
ALTER TABLE public.subject_syllabus ADD COLUMN IF NOT EXISTS level text DEFAULT 'beginner';

-- Add columns to subject_materials
ALTER TABLE public.subject_materials ADD COLUMN IF NOT EXISTS level text DEFAULT 'beginner';
ALTER TABLE public.subject_materials ADD COLUMN IF NOT EXISTS material_type text DEFAULT 'PDF';
ALTER TABLE public.subject_materials ADD COLUMN IF NOT EXISTS content text;
ALTER TABLE public.subject_materials ADD COLUMN IF NOT EXISTS is_downloadable boolean DEFAULT true;
ALTER TABLE public.subject_materials ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;

-- Create lessons table
CREATE TABLE IF NOT EXISTS public.lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  title_ar text,
  video_url text,
  duration_minutes integer DEFAULT 0,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

-- Admins/teachers can manage lessons
CREATE POLICY "Admins/teachers can manage lessons" ON public.lessons
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'));

-- Authenticated can view lessons
CREATE POLICY "Authenticated can view lessons" ON public.lessons
  FOR SELECT TO authenticated
  USING (true);

-- Create lesson_progress table
CREATE TABLE IF NOT EXISTS public.lesson_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  completed boolean DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, lesson_id)
);

ALTER TABLE public.lesson_progress ENABLE ROW LEVEL SECURITY;

-- Users can manage own progress
CREATE POLICY "Users can insert own progress" ON public.lesson_progress
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own progress" ON public.lesson_progress
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own progress" ON public.lesson_progress
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Admins/teachers can view all progress
CREATE POLICY "Admins can view all progress" ON public.lesson_progress
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'));
