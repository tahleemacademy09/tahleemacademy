
CREATE TABLE IF NOT EXISTS student_preferences (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  email_notifications boolean DEFAULT true,
  whatsapp_notifications boolean DEFAULT false,
  class_reminder boolean DEFAULT true,
  class_reminder_minutes integer DEFAULT 30,
  exam_reminder boolean DEFAULT true,
  new_recording_alert boolean DEFAULT true,
  results_notification boolean DEFAULT true,
  language text DEFAULT 'both',
  dark_mode boolean DEFAULT false,
  text_direction text DEFAULT 'auto',
  show_profile_photo boolean DEFAULT true,
  default_subject_view text DEFAULT 'grid',
  autoplay_recordings boolean DEFAULT true,
  playback_speed text DEFAULT '1x',
  show_subtitles boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE student_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own preferences" ON student_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own preferences" ON student_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own preferences" ON student_preferences FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all preferences" ON student_preferences FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
