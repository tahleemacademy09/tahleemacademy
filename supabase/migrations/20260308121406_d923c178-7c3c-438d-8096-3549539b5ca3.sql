ALTER TABLE exams ADD COLUMN IF NOT EXISTS term TEXT DEFAULT 'first';
UPDATE exams SET term = 'first' WHERE term IS NULL OR term = '';
ALTER TABLE exams ADD CONSTRAINT exams_term_check CHECK (term IN ('first', 'second', 'third'));