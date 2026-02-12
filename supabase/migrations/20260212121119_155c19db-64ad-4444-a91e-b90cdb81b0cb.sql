
-- =====================================================
-- FIX: Change all RESTRICTIVE policies to PERMISSIVE
-- on exam_answers, exam_attempts, exam_questions, exams,
-- exam_assignments, activity_logs, courses, enrollments,
-- notifications, profiles, user_roles
-- =====================================================

-- ========== exam_answers ==========
DROP POLICY IF EXISTS "Admins/teachers can view all answers" ON public.exam_answers;
DROP POLICY IF EXISTS "Users can view own answers" ON public.exam_answers;
DROP POLICY IF EXISTS "Admins/teachers can update answers for grading" ON public.exam_answers;
DROP POLICY IF EXISTS "Students can update own answers" ON public.exam_answers;
DROP POLICY IF EXISTS "Users can insert own answers" ON public.exam_answers;
DROP POLICY IF EXISTS "Users can update own answers during exam" ON public.exam_answers;

CREATE POLICY "Admins/teachers can view all answers" ON public.exam_answers
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));

CREATE POLICY "Users can view own answers" ON public.exam_answers
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM exam_attempts ea WHERE ea.id = exam_answers.attempt_id AND ea.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own answers" ON public.exam_answers
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM exam_attempts ea WHERE ea.id = exam_answers.attempt_id AND ea.user_id = auth.uid() AND ea.status = 'in_progress'
  ));

CREATE POLICY "Users can update own answers during exam" ON public.exam_answers
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM exam_attempts ea WHERE ea.id = exam_answers.attempt_id AND ea.user_id = auth.uid() AND ea.status = 'in_progress'
  ));

CREATE POLICY "Admins/teachers can update answers for grading" ON public.exam_answers
  FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));

-- ========== exam_attempts ==========
DROP POLICY IF EXISTS "Admins/teachers can view all attempts" ON public.exam_attempts;
DROP POLICY IF EXISTS "Users can view own attempts" ON public.exam_attempts;
DROP POLICY IF EXISTS "Admins/teachers can update attempts for grading" ON public.exam_attempts;
DROP POLICY IF EXISTS "Users can update own in-progress attempts" ON public.exam_attempts;
DROP POLICY IF EXISTS "Users can create own attempts" ON public.exam_attempts;

CREATE POLICY "Admins/teachers can view all attempts" ON public.exam_attempts
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));

CREATE POLICY "Users can view own attempts" ON public.exam_attempts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own attempts" ON public.exam_attempts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own in-progress attempts" ON public.exam_attempts
  FOR UPDATE USING (auth.uid() = user_id AND status = 'in_progress')
  WITH CHECK (auth.uid() = user_id AND status = ANY(ARRAY['in_progress', 'submitted', 'graded']));

CREATE POLICY "Admins/teachers can update attempts for grading" ON public.exam_attempts
  FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));

-- ========== exam_questions ==========
DROP POLICY IF EXISTS "Students can view questions for active exams" ON public.exam_questions;
DROP POLICY IF EXISTS "Admins/teachers can manage questions" ON public.exam_questions;
DROP POLICY IF EXISTS "Admins/teachers can update questions" ON public.exam_questions;
DROP POLICY IF EXISTS "Admins/teachers can delete questions" ON public.exam_questions;

-- Allow students to view questions for any exam they have an attempt for (not just in_progress - needed for results)
CREATE POLICY "Students can view questions for their exams" ON public.exam_questions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM exam_attempts ea WHERE ea.exam_id = exam_questions.exam_id AND ea.user_id = auth.uid()
    )
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'teacher'::app_role)
  );

CREATE POLICY "Admins/teachers can manage questions" ON public.exam_questions
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));

CREATE POLICY "Admins/teachers can update questions" ON public.exam_questions
  FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));

CREATE POLICY "Admins/teachers can delete questions" ON public.exam_questions
  FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));

-- ========== exams ==========
DROP POLICY IF EXISTS "Admins/teachers can view all exams" ON public.exams;
DROP POLICY IF EXISTS "Students can view published exams" ON public.exams;
DROP POLICY IF EXISTS "Admins/teachers can create exams" ON public.exams;
DROP POLICY IF EXISTS "Admins/teachers can update exams" ON public.exams;
DROP POLICY IF EXISTS "Admins can delete exams" ON public.exams;

CREATE POLICY "Admins/teachers can view all exams" ON public.exams
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));

CREATE POLICY "Students can view published exams" ON public.exams
  FOR SELECT USING (is_published = true);

CREATE POLICY "Admins/teachers can create exams" ON public.exams
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));

CREATE POLICY "Admins/teachers can update exams" ON public.exams
  FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));

CREATE POLICY "Admins can delete exams" ON public.exams
  FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- ========== exam_assignments ==========
DROP POLICY IF EXISTS "Admins/teachers can create assignments" ON public.exam_assignments;
DROP POLICY IF EXISTS "Admins/teachers can delete assignments" ON public.exam_assignments;
DROP POLICY IF EXISTS "Admins/teachers can manage assignments" ON public.exam_assignments;
DROP POLICY IF EXISTS "Users can view own assignments" ON public.exam_assignments;

CREATE POLICY "Admins/teachers can manage assignments" ON public.exam_assignments
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));

CREATE POLICY "Users can view own assignments" ON public.exam_assignments
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins/teachers can create assignments" ON public.exam_assignments
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));

CREATE POLICY "Admins/teachers can delete assignments" ON public.exam_assignments
  FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));

-- ========== activity_logs ==========
DROP POLICY IF EXISTS "Admins can create logs for any user" ON public.activity_logs;
DROP POLICY IF EXISTS "Admins can view all logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Users can create own logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Users can view own logs" ON public.activity_logs;

CREATE POLICY "Admins can view all logs" ON public.activity_logs
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view own logs" ON public.activity_logs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can create logs for any user" ON public.activity_logs
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can create own logs" ON public.activity_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ========== courses ==========
DROP POLICY IF EXISTS "Admins can delete courses" ON public.courses;
DROP POLICY IF EXISTS "Admins can view all courses" ON public.courses;
DROP POLICY IF EXISTS "Admins/teachers can create courses" ON public.courses;
DROP POLICY IF EXISTS "Admins/teachers can update courses" ON public.courses;
DROP POLICY IF EXISTS "Anyone can view published courses" ON public.courses;

CREATE POLICY "Admins can view all courses" ON public.courses
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));

CREATE POLICY "Anyone can view published courses" ON public.courses
  FOR SELECT USING (is_published = true);

CREATE POLICY "Admins/teachers can create courses" ON public.courses
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));

CREATE POLICY "Admins/teachers can update courses" ON public.courses
  FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));

CREATE POLICY "Admins can delete courses" ON public.courses
  FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- ========== enrollments ==========
DROP POLICY IF EXISTS "Admins can manage enrollments" ON public.enrollments;
DROP POLICY IF EXISTS "Admins can view all enrollments" ON public.enrollments;
DROP POLICY IF EXISTS "Users can enroll themselves" ON public.enrollments;
DROP POLICY IF EXISTS "Users can update own enrollment progress" ON public.enrollments;
DROP POLICY IF EXISTS "Users can view own enrollments" ON public.enrollments;

CREATE POLICY "Admins can view all enrollments" ON public.enrollments
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));

CREATE POLICY "Users can view own enrollments" ON public.enrollments
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can enroll themselves" ON public.enrollments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own enrollment progress" ON public.enrollments
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage enrollments" ON public.enrollments
  FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- ========== notifications ==========
DROP POLICY IF EXISTS "Admins can create notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;

CREATE POLICY "Users can view own notifications" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can create notifications" ON public.notifications
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));

CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id);

-- ========== profiles ==========
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Authenticated users can view profiles" ON public.profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = user_id);

-- ========== user_roles ==========
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;

CREATE POLICY "Admins can view all roles" ON public.user_roles
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can insert roles" ON public.user_roles
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update roles" ON public.user_roles
  FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete roles" ON public.user_roles
  FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));
