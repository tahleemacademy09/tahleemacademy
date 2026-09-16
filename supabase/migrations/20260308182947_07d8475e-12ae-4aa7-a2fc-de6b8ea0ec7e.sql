
-- Add formatting columns to exams table
ALTER TABLE exams ADD COLUMN IF NOT EXISTS question_font_size INTEGER DEFAULT 16;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS question_font_family TEXT DEFAULT 'Cairo';
ALTER TABLE exams ADD COLUMN IF NOT EXISTS question_alignment TEXT DEFAULT 'left';
ALTER TABLE exams ADD COLUMN IF NOT EXISTS question_bold BOOLEAN DEFAULT false;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS question_italic BOOLEAN DEFAULT false;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS options_font_size INTEGER DEFAULT 14;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS options_bold BOOLEAN DEFAULT false;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS options_alignment TEXT DEFAULT 'left';
ALTER TABLE exams ADD COLUMN IF NOT EXISTS question_color TEXT DEFAULT '#1a1a1a';
ALTER TABLE exams ADD COLUMN IF NOT EXISTS question_line_height DECIMAL DEFAULT 1.7;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS question_padding INTEGER DEFAULT 16;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS show_question_numbers BOOLEAN DEFAULT true;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS show_marks_per_question BOOLEAN DEFAULT true;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS rtl_mode BOOLEAN DEFAULT false;

-- Add custom_format to exam_questions for per-question overrides
ALTER TABLE exam_questions ADD COLUMN IF NOT EXISTS custom_format JSONB;

-- Validation triggers for alignment
CREATE OR REPLACE FUNCTION public.validate_exam_alignment()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.question_alignment IS NOT NULL AND NEW.question_alignment NOT IN ('left','center','right') THEN
    RAISE EXCEPTION 'Invalid question_alignment: %', NEW.question_alignment;
  END IF;
  IF NEW.options_alignment IS NOT NULL AND NEW.options_alignment NOT IN ('left','center','right') THEN
    RAISE EXCEPTION 'Invalid options_alignment: %', NEW.options_alignment;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS validate_exam_alignment_trigger ON exams;
CREATE TRIGGER validate_exam_alignment_trigger BEFORE INSERT OR UPDATE ON exams FOR EACH ROW EXECUTE FUNCTION validate_exam_alignment();

-- Create exam_format_templates table
CREATE TABLE IF NOT EXISTS exam_format_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_by UUID REFERENCES profiles(user_id),
  settings JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE exam_format_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage format templates" ON exam_format_templates FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Teachers can manage own templates" ON exam_format_templates FOR ALL TO authenticated USING (has_role(auth.uid(), 'teacher'::app_role) AND created_by = auth.uid()) WITH CHECK (has_role(auth.uid(), 'teacher'::app_role) AND created_by = auth.uid());
CREATE POLICY "Anyone can view templates" ON exam_format_templates FOR SELECT TO authenticated USING (true);
