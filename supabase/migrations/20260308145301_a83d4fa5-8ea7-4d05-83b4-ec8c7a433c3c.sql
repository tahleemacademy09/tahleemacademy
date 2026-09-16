
-- 1. Update validate_exam_type function to allow 'entrance'
CREATE OR REPLACE FUNCTION public.validate_exam_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.type NOT IN ('exam', 'test', 'entrance') THEN
    RAISE EXCEPTION 'Invalid exam type: %. Must be exam, test, or entrance.', NEW.type;
  END IF;
  RETURN NEW;
END;
$function$;

-- 2. Add is_entrance column to exams
ALTER TABLE exams ADD COLUMN IF NOT EXISTS is_entrance BOOLEAN DEFAULT false;

-- 3. Add profile columns for onboarding
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS has_taken_entrance_exam BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS entrance_completed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS age_group TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS learning_goal TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS allow_entrance_retake BOOLEAN DEFAULT false;

-- 4. Create level_courses mapping table
CREATE TABLE IF NOT EXISTS level_courses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  level TEXT NOT NULL,
  subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
  UNIQUE(level, subject_id)
);

-- Validation trigger for level_courses.level
CREATE OR REPLACE FUNCTION public.validate_level_course_level()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.level NOT IN ('beginner', 'intermediate', 'advanced') THEN
    RAISE EXCEPTION 'Invalid level: %. Must be beginner, intermediate, or advanced.', NEW.level;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER validate_level_course_level_trigger
BEFORE INSERT OR UPDATE ON level_courses
FOR EACH ROW EXECUTE FUNCTION validate_level_course_level();

-- RLS for level_courses
ALTER TABLE level_courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view level courses"
ON level_courses FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can insert level courses"
ON level_courses FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update level courses"
ON level_courses FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete level courses"
ON level_courses FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'));
