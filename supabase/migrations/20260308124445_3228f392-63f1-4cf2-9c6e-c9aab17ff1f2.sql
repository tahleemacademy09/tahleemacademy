
-- Add max review views to exams (admin controls this, default 1)
ALTER TABLE exams ADD COLUMN IF NOT EXISTS max_review_views integer DEFAULT 1;

-- Track how many times a student has viewed their exam script
CREATE TABLE IF NOT EXISTS exam_review_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  viewed_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(attempt_id, user_id)
);

ALTER TABLE exam_review_views ENABLE ROW LEVEL SECURITY;

-- Students can view/insert their own review view record
CREATE POLICY "Users can view own review views" ON exam_review_views FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own review views" ON exam_review_views FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own review views" ON exam_review_views FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage review views" ON exam_review_views FOR ALL USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Add view_count column to track number of views
ALTER TABLE exam_review_views ADD COLUMN IF NOT EXISTS view_count integer DEFAULT 0;
