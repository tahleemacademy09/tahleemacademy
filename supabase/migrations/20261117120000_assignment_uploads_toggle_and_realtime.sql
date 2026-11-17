-- In-class assignments: admin/teacher toggle for student uploads + live sync of submissions/grades.

ALTER TABLE public.subject_assignments
  ADD COLUMN IF NOT EXISTS submissions_open boolean NOT NULL DEFAULT true;

-- Students can only submit / re-submit while the teacher has uploads switched on.
DROP POLICY IF EXISTS "Users can submit" ON public.assignment_submissions;
CREATE POLICY "Users can submit" ON public.assignment_submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.subject_assignments a WHERE a.id = assignment_id AND a.submissions_open)
  );

DROP POLICY IF EXISTS "Users can update own submission" ON public.assignment_submissions;
CREATE POLICY "Users can update own submission" ON public.assignment_submissions
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.subject_assignments a WHERE a.id = assignment_id AND a.submissions_open)
  );

-- A student must never be able to change their own score/feedback.
CREATE OR REPLACE FUNCTION public.protect_submission_grade()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher')) THEN
    NEW.grade := OLD.grade;
    NEW.feedback := OLD.feedback;
    NEW.graded_by := OLD.graded_by;
    NEW.graded_at := OLD.graded_at;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_protect_submission_grade ON public.assignment_submissions;
CREATE TRIGGER trg_protect_submission_grade BEFORE UPDATE ON public.assignment_submissions
  FOR EACH ROW EXECUTE FUNCTION public.protect_submission_grade();

-- Realtime: teacher sees uploads instantly, students see scores / the on-off switch instantly.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='assignment_submissions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.assignment_submissions;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='subject_assignments') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.subject_assignments;
  END IF;
END $$;
