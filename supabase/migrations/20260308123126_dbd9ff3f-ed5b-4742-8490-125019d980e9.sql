-- Add new profile columns (phone and level already exist)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS full_name_ar TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS nationality TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS whatsapp TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS parent_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS parent_phone TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS parent_whatsapp TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS parent_relationship TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS student_id TEXT UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS enrollment_date DATE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- Function to auto-generate student ID
CREATE OR REPLACE FUNCTION public.generate_student_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_year TEXT;
  next_seq INT;
BEGIN
  current_year := EXTRACT(YEAR FROM now())::TEXT;
  
  SELECT COALESCE(MAX(
    CASE 
      WHEN student_id LIKE 'TAH-' || current_year || '-%' 
      THEN CAST(SUBSTRING(student_id FROM 10) AS INT)
      ELSE 0
    END
  ), 0) + 1
  INTO next_seq
  FROM public.profiles
  WHERE student_id LIKE 'TAH-' || current_year || '-%';
  
  NEW.student_id := 'TAH-' || current_year || '-' || LPAD(next_seq::TEXT, 3, '0');
  NEW.enrollment_date := COALESCE(NEW.enrollment_date, CURRENT_DATE);
  
  RETURN NEW;
END;
$$;

-- Trigger to auto-generate student_id on insert
DROP TRIGGER IF EXISTS trigger_generate_student_id ON profiles;
CREATE TRIGGER trigger_generate_student_id
  BEFORE INSERT ON profiles
  FOR EACH ROW
  WHEN (NEW.student_id IS NULL)
  EXECUTE FUNCTION generate_student_id();