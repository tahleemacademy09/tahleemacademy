
-- Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'teacher', 'student');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  bio TEXT,
  preferred_language TEXT DEFAULT 'en',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- Create courses table
CREATE TABLE public.courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  title_ar TEXT,
  description TEXT,
  description_ar TEXT,
  level TEXT CHECK (level IN ('beginner', 'intermediate', 'advanced')),
  category TEXT,
  instructor_name TEXT,
  instructor_bio TEXT,
  image_url TEXT,
  is_published BOOLEAN DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create enrollments table
CREATE TABLE public.enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
  progress INTEGER DEFAULT 0,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, course_id)
);

-- Create exams table
CREATE TABLE public.exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  title_ar TEXT,
  description TEXT,
  description_ar TEXT,
  course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id),
  time_limit_minutes INTEGER DEFAULT 60,
  passing_score INTEGER DEFAULT 50,
  max_attempts INTEGER DEFAULT 1,
  is_published BOOLEAN DEFAULT false,
  show_results_immediately BOOLEAN DEFAULT true,
  randomize_questions BOOLEAN DEFAULT false,
  randomize_answers BOOLEAN DEFAULT false,
  allow_review BOOLEAN DEFAULT true,
  display_mode TEXT DEFAULT 'one_at_a_time' CHECK (display_mode IN ('one_at_a_time', 'all_at_once')),
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  guidelines TEXT,
  guidelines_ar TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create exam_questions table
CREATE TABLE public.exam_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID REFERENCES public.exams(id) ON DELETE CASCADE NOT NULL,
  question_type TEXT NOT NULL CHECK (question_type IN ('mcq', 'true_false', 'short_answer', 'essay', 'fill_blank', 'matching', 'audio', 'video')),
  question_text TEXT NOT NULL,
  question_text_ar TEXT,
  options JSONB, -- for MCQ: [{id, text, text_ar, is_correct}], for matching: [{left, right}]
  correct_answer TEXT, -- for true_false, fill_blank, short_answer
  points INTEGER DEFAULT 1,
  difficulty TEXT DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  tags TEXT[],
  media_url TEXT,
  sort_order INTEGER DEFAULT 0,
  explanation TEXT,
  explanation_ar TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create exam_assignments table
CREATE TABLE public.exam_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID REFERENCES public.exams(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (exam_id, user_id)
);

-- Create exam_attempts table
CREATE TABLE public.exam_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID REFERENCES public.exams(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  status TEXT DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted', 'graded')),
  score NUMERIC,
  total_points NUMERIC,
  percentage NUMERIC,
  passed BOOLEAN,
  feedback TEXT,
  tab_switches INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create exam_answers table
CREATE TABLE public.exam_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID REFERENCES public.exam_attempts(id) ON DELETE CASCADE NOT NULL,
  question_id UUID REFERENCES public.exam_questions(id) ON DELETE CASCADE NOT NULL,
  answer_text TEXT,
  answer_data JSONB,
  is_correct BOOLEAN,
  points_awarded NUMERIC DEFAULT 0,
  is_flagged BOOLEAN DEFAULT false,
  feedback TEXT,
  graded_by UUID REFERENCES auth.users(id),
  graded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create notifications table
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'info' CHECK (type IN ('info', 'exam', 'result', 'announcement')),
  is_read BOOLEAN DEFAULT false,
  link TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create activity_logs table
CREATE TABLE public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  
  -- Default role is student
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'student');
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Update timestamp function
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_courses_updated_at BEFORE UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_exams_updated_at BEFORE UPDATE ON public.exams FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_exam_answers_updated_at BEFORE UPDATE ON public.exam_answers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- RLS Policies

-- Profiles: users can read all profiles, update own
CREATE POLICY "Anyone can view profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- User roles: users can read own, admins can manage
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update roles" ON public.user_roles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete roles" ON public.user_roles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Courses: anyone can read published, admins/teachers can manage
CREATE POLICY "Anyone can view published courses" ON public.courses FOR SELECT USING (is_published = true);
CREATE POLICY "Admins can view all courses" ON public.courses FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'));
CREATE POLICY "Admins/teachers can create courses" ON public.courses FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'));
CREATE POLICY "Admins/teachers can update courses" ON public.courses FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'));
CREATE POLICY "Admins can delete courses" ON public.courses FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Enrollments
CREATE POLICY "Users can view own enrollments" ON public.enrollments FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all enrollments" ON public.enrollments FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'));
CREATE POLICY "Users can enroll themselves" ON public.enrollments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can manage enrollments" ON public.enrollments FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Exams
CREATE POLICY "Students can view published exams" ON public.exams FOR SELECT TO authenticated USING (is_published = true);
CREATE POLICY "Admins/teachers can view all exams" ON public.exams FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'));
CREATE POLICY "Admins/teachers can create exams" ON public.exams FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'));
CREATE POLICY "Admins/teachers can update exams" ON public.exams FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'));
CREATE POLICY "Admins can delete exams" ON public.exams FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Exam questions
CREATE POLICY "Students can view questions for active exams" ON public.exam_questions FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.exam_attempts ea WHERE ea.exam_id = exam_questions.exam_id AND ea.user_id = auth.uid() AND ea.status = 'in_progress')
  OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher')
);
CREATE POLICY "Admins/teachers can manage questions" ON public.exam_questions FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'));
CREATE POLICY "Admins/teachers can update questions" ON public.exam_questions FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'));
CREATE POLICY "Admins/teachers can delete questions" ON public.exam_questions FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'));

-- Exam assignments
CREATE POLICY "Users can view own assignments" ON public.exam_assignments FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins/teachers can manage assignments" ON public.exam_assignments FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'));
CREATE POLICY "Admins/teachers can create assignments" ON public.exam_assignments FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'));
CREATE POLICY "Admins/teachers can delete assignments" ON public.exam_assignments FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'));

-- Exam attempts
CREATE POLICY "Users can view own attempts" ON public.exam_attempts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins/teachers can view all attempts" ON public.exam_attempts FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'));
CREATE POLICY "Users can create own attempts" ON public.exam_attempts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own in-progress attempts" ON public.exam_attempts FOR UPDATE TO authenticated USING (auth.uid() = user_id AND status = 'in_progress');
CREATE POLICY "Admins/teachers can update attempts for grading" ON public.exam_attempts FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'));

-- Exam answers
CREATE POLICY "Users can view own answers" ON public.exam_answers FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.exam_attempts ea WHERE ea.id = exam_answers.attempt_id AND ea.user_id = auth.uid())
);
CREATE POLICY "Admins/teachers can view all answers" ON public.exam_answers FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'));
CREATE POLICY "Users can insert own answers" ON public.exam_answers FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.exam_attempts ea WHERE ea.id = exam_answers.attempt_id AND ea.user_id = auth.uid() AND ea.status = 'in_progress')
);
CREATE POLICY "Users can update own answers during exam" ON public.exam_answers FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.exam_attempts ea WHERE ea.id = exam_answers.attempt_id AND ea.user_id = auth.uid() AND ea.status = 'in_progress')
);
CREATE POLICY "Admins/teachers can update answers for grading" ON public.exam_answers FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'));

-- Notifications
CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can create notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'));

-- Activity logs
CREATE POLICY "Users can view own logs" ON public.activity_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all logs" ON public.activity_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can create own logs" ON public.activity_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
