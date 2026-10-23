
-- Academic Calendar table
CREATE TABLE IF NOT EXISTS academic_calendar (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  title_ar TEXT,
  academic_year TEXT NOT NULL,
  term TEXT NOT NULL,
  term_start_date DATE NOT NULL,
  term_end_date DATE NOT NULL,
  resume_date DATE NOT NULL,
  payment_due_date DATE,
  is_active BOOLEAN DEFAULT false,
  is_holiday BOOLEAN DEFAULT false,
  holiday_reason TEXT,
  holiday_reason_ar TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Validation trigger for term
CREATE OR REPLACE FUNCTION public.validate_academic_calendar_term()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.term NOT IN ('first','second','third') THEN
    RAISE EXCEPTION 'Invalid term: %', NEW.term;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_validate_academic_calendar_term
  BEFORE INSERT OR UPDATE ON academic_calendar
  FOR EACH ROW EXECUTE FUNCTION validate_academic_calendar_term();

-- Academy Settings table
CREATE TABLE IF NOT EXISTS academy_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  description TEXT,
  updated_by UUID,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Payment Switch Log table
CREATE TABLE IF NOT EXISTS payment_switch_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  action TEXT,
  reason TEXT,
  reason_ar TEXT,
  done_by UUID,
  auto_on_date DATE,
  affected_students INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Validation trigger for payment_switch_log action
CREATE OR REPLACE FUNCTION public.validate_payment_switch_action()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.action NOT IN ('enabled','disabled') THEN
    RAISE EXCEPTION 'Invalid action: %', NEW.action;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_validate_payment_switch_action
  BEFORE INSERT OR UPDATE ON payment_switch_log
  FOR EACH ROW EXECUTE FUNCTION validate_payment_switch_action();

-- Seed academy settings
INSERT INTO academy_settings (key, value, description) VALUES
  ('academy_status', 'active', 'Current status: active, holiday, closed'),
  ('current_term', 'first', 'Current term: first, second, third'),
  ('current_academic_year', '2025/2026', 'Current academic year'),
  ('resume_date', null, 'Date academy resumes from holiday'),
  ('payment_grace_days', '7', 'Days after resume before payment required'),
  ('holiday_message', null, 'Message shown to students during holiday'),
  ('holiday_message_ar', null, 'Arabic message shown during holiday'),
  ('payment_counting_started', 'false', 'Whether payment countdown has started'),
  ('payment_count_start_date', null, 'Date payment countdown started from'),
  ('payment_enabled', 'true', 'Master switch for all payments'),
  ('payment_disabled_reason', null, 'Reason shown when payments are off'),
  ('payment_disabled_reason_ar', null, 'Arabic reason when payments are off'),
  ('payment_free_access_during_off', 'true', 'Free access when payments off'),
  ('payment_disabled_by', null, 'Admin who turned payments off'),
  ('payment_disabled_at', null, 'When payments were turned off'),
  ('payment_enabled_at', null, 'When payments were turned back on'),
  ('payment_auto_on_date', null, 'Scheduled date to auto turn payments back on')
ON CONFLICT (key) DO NOTHING;

-- Add columns to existing tables
ALTER TABLE student_subscriptions ADD COLUMN IF NOT EXISTS count_from_date DATE;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS term TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS payment_grace_end DATE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_founding_member BOOLEAN DEFAULT false;

-- RLS for academic_calendar
ALTER TABLE academic_calendar ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage calendar" ON academic_calendar FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated can view calendar" ON academic_calendar FOR SELECT TO authenticated
  USING (true);

-- RLS for academy_settings
ALTER TABLE academy_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage settings" ON academy_settings FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated can view settings" ON academy_settings FOR SELECT TO authenticated
  USING (true);

-- RLS for payment_switch_log
ALTER TABLE payment_switch_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage switch log" ON payment_switch_log FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view switch log" ON payment_switch_log FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Update payment_status validation to include new statuses
CREATE OR REPLACE FUNCTION public.validate_profile_payment_status()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.payment_status IS NOT NULL AND NEW.payment_status NOT IN ('paid','unpaid','partial','exempt','grace','exempt_temp','suspended') THEN
    RAISE EXCEPTION 'Invalid payment status: %', NEW.payment_status;
  END IF;
  RETURN NEW;
END;
$$;
