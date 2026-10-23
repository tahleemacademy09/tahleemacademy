
ALTER TABLE exams ADD COLUMN IF NOT EXISTS type text DEFAULT 'exam';

-- Use validation trigger instead of CHECK constraint
CREATE OR REPLACE FUNCTION public.validate_exam_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.type NOT IN ('exam', 'test') THEN
    RAISE EXCEPTION 'Invalid exam type: %. Must be exam or test.', NEW.type;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_exam_type_trigger
  BEFORE INSERT OR UPDATE ON exams
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_exam_type();

UPDATE exams SET type = 'exam' WHERE type IS NULL;
