
-- Fix ALL RLS policies to be PERMISSIVE instead of RESTRICTIVE
-- This is the root cause: with only RESTRICTIVE policies and no PERMISSIVE ones, access is always denied

-- ============ exam_questions ============
DROP POLICY IF EXISTS "Admins/teachers can delete questions" ON public.exam_questions;
DROP POLICY IF EXISTS "Admins/teachers can manage questions" ON public.exam_questions;
DROP POLICY IF EXISTS "Admins/teachers can update questions" ON public.exam_questions;
DROP POLICY IF EXISTS "Students can view questions for their exams" ON public.exam_questions;

CREATE POLICY "Admins/teachers can delete questions" ON public.exam_questions FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));
CREATE POLICY "Admins/teachers can manage questions" ON public.exam_questions FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));
CREATE POLICY "Admins/teachers can update questions" ON public.exam_questions FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));
CREATE POLICY "Students can view questions for their exams" ON public.exam_questions FOR SELECT TO authenticated USING (
  (EXISTS (SELECT 1 FROM exam_attempts ea WHERE ea.exam_id = exam_questions.exam_id AND ea.user_id = auth.uid()))
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'teacher'::app_role)
);

-- ============ exams ============
DROP POLICY IF EXISTS "Admins can delete exams" ON public.exams;
DROP POLICY IF EXISTS "Admins/teachers can create exams" ON public.exams;
DROP POLICY IF EXISTS "Admins/teachers can update exams" ON public.exams;
DROP POLICY IF EXISTS "Admins/teachers can view all exams" ON public.exams;
DROP POLICY IF EXISTS "Students can view published exams" ON public.exams;

CREATE POLICY "Admins can delete exams" ON public.exams FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins/teachers can create exams" ON public.exams FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));
CREATE POLICY "Admins/teachers can update exams" ON public.exams FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));
CREATE POLICY "Admins/teachers can view all exams" ON public.exams FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));
CREATE POLICY "Students can view published exams" ON public.exams FOR SELECT TO authenticated USING (is_published = true);

-- ============ exam_attempts ============
DROP POLICY IF EXISTS "Admins/teachers can update attempts for grading" ON public.exam_attempts;
DROP POLICY IF EXISTS "Admins/teachers can view all attempts" ON public.exam_attempts;
DROP POLICY IF EXISTS "Users can create own attempts" ON public.exam_attempts;
DROP POLICY IF EXISTS "Users can update own in-progress attempts" ON public.exam_attempts;
DROP POLICY IF EXISTS "Users can view own attempts" ON public.exam_attempts;

CREATE POLICY "Admins/teachers can update attempts for grading" ON public.exam_attempts FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));
CREATE POLICY "Admins/teachers can view all attempts" ON public.exam_attempts FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));
CREATE POLICY "Users can create own attempts" ON public.exam_attempts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own in-progress attempts" ON public.exam_attempts FOR UPDATE TO authenticated USING (auth.uid() = user_id AND status = 'in_progress') WITH CHECK (auth.uid() = user_id AND status = ANY(ARRAY['in_progress', 'submitted', 'graded']));
CREATE POLICY "Users can view own attempts" ON public.exam_attempts FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ============ exam_answers ============
DROP POLICY IF EXISTS "Admins/teachers can update answers for grading" ON public.exam_answers;
DROP POLICY IF EXISTS "Admins/teachers can view all answers" ON public.exam_answers;
DROP POLICY IF EXISTS "Users can insert own answers" ON public.exam_answers;
DROP POLICY IF EXISTS "Users can update own answers during exam" ON public.exam_answers;
DROP POLICY IF EXISTS "Users can view own answers" ON public.exam_answers;

CREATE POLICY "Admins/teachers can update answers for grading" ON public.exam_answers FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));
CREATE POLICY "Admins/teachers can view all answers" ON public.exam_answers FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));
CREATE POLICY "Users can insert own answers" ON public.exam_answers FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM exam_attempts ea WHERE ea.id = exam_answers.attempt_id AND ea.user_id = auth.uid() AND ea.status = 'in_progress'));
CREATE POLICY "Users can update own answers during exam" ON public.exam_answers FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM exam_attempts ea WHERE ea.id = exam_answers.attempt_id AND ea.user_id = auth.uid() AND ea.status = 'in_progress'));
CREATE POLICY "Users can view own answers" ON public.exam_answers FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM exam_attempts ea WHERE ea.id = exam_answers.attempt_id AND ea.user_id = auth.uid()));

-- ============ exam_assignments ============
DROP POLICY IF EXISTS "Admins/teachers can create assignments" ON public.exam_assignments;
DROP POLICY IF EXISTS "Admins/teachers can delete assignments" ON public.exam_assignments;
DROP POLICY IF EXISTS "Admins/teachers can manage assignments" ON public.exam_assignments;
DROP POLICY IF EXISTS "Users can view own assignments" ON public.exam_assignments;

CREATE POLICY "Admins/teachers can create assignments" ON public.exam_assignments FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));
CREATE POLICY "Admins/teachers can delete assignments" ON public.exam_assignments FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));
CREATE POLICY "Admins/teachers can manage assignments" ON public.exam_assignments FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));
CREATE POLICY "Users can view own assignments" ON public.exam_assignments FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ============ profiles ============
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Authenticated users can view profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- ============ user_roles ============
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;

CREATE POLICY "Admins can delete roles" ON public.user_roles FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update roles" ON public.user_roles FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ============ courses ============
DROP POLICY IF EXISTS "Admins can delete courses" ON public.courses;
DROP POLICY IF EXISTS "Admins can view all courses" ON public.courses;
DROP POLICY IF EXISTS "Admins/teachers can create courses" ON public.courses;
DROP POLICY IF EXISTS "Admins/teachers can update courses" ON public.courses;
DROP POLICY IF EXISTS "Anyone can view published courses" ON public.courses;

CREATE POLICY "Admins can delete courses" ON public.courses FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view all courses" ON public.courses FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));
CREATE POLICY "Admins/teachers can create courses" ON public.courses FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));
CREATE POLICY "Admins/teachers can update courses" ON public.courses FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));
CREATE POLICY "Anyone can view published courses" ON public.courses FOR SELECT TO authenticated USING (is_published = true);

-- ============ violations ============
DROP POLICY IF EXISTS "Admins/teachers can delete violations" ON public.violations;
DROP POLICY IF EXISTS "Admins/teachers can view all violations" ON public.violations;
DROP POLICY IF EXISTS "Students can insert own violations" ON public.violations;
DROP POLICY IF EXISTS "Students can view own violations" ON public.violations;

CREATE POLICY "Admins/teachers can delete violations" ON public.violations FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins/teachers can view all violations" ON public.violations FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));
CREATE POLICY "Students can insert own violations" ON public.violations FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM exam_attempts ea WHERE ea.id = violations.attempt_id AND ea.user_id = auth.uid()));
CREATE POLICY "Students can view own violations" ON public.violations FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM exam_attempts ea WHERE ea.id = violations.attempt_id AND ea.user_id = auth.uid()));

-- ============ proctoring_sessions ============
DROP POLICY IF EXISTS "Admins/teachers can update proctoring sessions" ON public.proctoring_sessions;
DROP POLICY IF EXISTS "Admins/teachers can view all proctoring sessions" ON public.proctoring_sessions;
DROP POLICY IF EXISTS "Students can insert own proctoring session" ON public.proctoring_sessions;
DROP POLICY IF EXISTS "Students can update own proctoring session" ON public.proctoring_sessions;
DROP POLICY IF EXISTS "Students can view own proctoring session" ON public.proctoring_sessions;

CREATE POLICY "Admins/teachers can update proctoring sessions" ON public.proctoring_sessions FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));
CREATE POLICY "Admins/teachers can view all proctoring sessions" ON public.proctoring_sessions FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));
CREATE POLICY "Students can insert own proctoring session" ON public.proctoring_sessions FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM exam_attempts ea WHERE ea.id = proctoring_sessions.attempt_id AND ea.user_id = auth.uid()));
CREATE POLICY "Students can update own proctoring session" ON public.proctoring_sessions FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM exam_attempts ea WHERE ea.id = proctoring_sessions.attempt_id AND ea.user_id = auth.uid()));
CREATE POLICY "Students can view own proctoring session" ON public.proctoring_sessions FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM exam_attempts ea WHERE ea.id = proctoring_sessions.attempt_id AND ea.user_id = auth.uid()));

-- ============ proctoring_media ============
DROP POLICY IF EXISTS "Admins can delete media" ON public.proctoring_media;
DROP POLICY IF EXISTS "Admins/teachers can view all media" ON public.proctoring_media;
DROP POLICY IF EXISTS "Students can insert own media" ON public.proctoring_media;
DROP POLICY IF EXISTS "Students can view own media" ON public.proctoring_media;

CREATE POLICY "Admins can delete media" ON public.proctoring_media FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins/teachers can view all media" ON public.proctoring_media FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));
CREATE POLICY "Students can insert own media" ON public.proctoring_media FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM exam_attempts ea WHERE ea.id = proctoring_media.attempt_id AND ea.user_id = auth.uid()));
CREATE POLICY "Students can view own media" ON public.proctoring_media FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM exam_attempts ea WHERE ea.id = proctoring_media.attempt_id AND ea.user_id = auth.uid()));

-- ============ device_logs ============
DROP POLICY IF EXISTS "Admins/teachers can view all device logs" ON public.device_logs;
DROP POLICY IF EXISTS "Students can insert own device logs" ON public.device_logs;

CREATE POLICY "Admins/teachers can view all device logs" ON public.device_logs FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));
CREATE POLICY "Students can insert own device logs" ON public.device_logs FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM exam_attempts ea WHERE ea.id = device_logs.attempt_id AND ea.user_id = auth.uid()));

-- ============ enrollments ============
DROP POLICY IF EXISTS "Admins can manage enrollments" ON public.enrollments;
DROP POLICY IF EXISTS "Admins can view all enrollments" ON public.enrollments;
DROP POLICY IF EXISTS "Users can enroll themselves" ON public.enrollments;
DROP POLICY IF EXISTS "Users can update own enrollment progress" ON public.enrollments;
DROP POLICY IF EXISTS "Users can view own enrollments" ON public.enrollments;

CREATE POLICY "Admins can manage enrollments" ON public.enrollments FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view all enrollments" ON public.enrollments FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));
CREATE POLICY "Users can enroll themselves" ON public.enrollments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own enrollment progress" ON public.enrollments FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view own enrollments" ON public.enrollments FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ============ notifications ============
DROP POLICY IF EXISTS "Admins can create notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;

CREATE POLICY "Admins can create notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ============ activity_logs ============
DROP POLICY IF EXISTS "Admins can create logs for any user" ON public.activity_logs;
DROP POLICY IF EXISTS "Admins can view all logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Users can create own logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Users can view own logs" ON public.activity_logs;

CREATE POLICY "Admins can create logs for any user" ON public.activity_logs FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view all logs" ON public.activity_logs FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can create own logs" ON public.activity_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view own logs" ON public.activity_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);
