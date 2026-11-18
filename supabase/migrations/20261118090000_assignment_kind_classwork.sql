-- Assignments vs. Classwork.
--   assignment: homework with a deadline (default, so every existing row keeps working)
--   classwork : done during the live class, no deadline; the teacher switches student uploads on from the ⋮ menu.
ALTER TABLE public.subject_assignments
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'assignment';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subject_assignments_kind_check'
  ) THEN
    ALTER TABLE public.subject_assignments
      ADD CONSTRAINT subject_assignments_kind_check CHECK (kind IN ('assignment', 'classwork'));
  END IF;
END $$;
