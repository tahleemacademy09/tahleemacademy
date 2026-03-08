
-- Payment Plans table
CREATE TABLE IF NOT EXISTS payment_plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  name_ar TEXT,
  description TEXT,
  description_ar TEXT,
  type TEXT DEFAULT 'term',
  amount INTEGER NOT NULL,
  currency TEXT DEFAULT 'NGN',
  duration_months INTEGER,
  level TEXT,
  is_active BOOLEAN DEFAULT true,
  paystack_plan_code TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.validate_payment_plan_type()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.type NOT IN ('term','monthly','yearly','one_time','private') THEN
    RAISE EXCEPTION 'Invalid payment plan type: %', NEW.type;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_payment_plan_type
  BEFORE INSERT OR UPDATE ON payment_plans
  FOR EACH ROW EXECUTE FUNCTION validate_payment_plan_type();

CREATE OR REPLACE FUNCTION public.validate_payment_plan_level()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.level IS NOT NULL AND NEW.level NOT IN ('beginner','intermediate','advanced','all') THEN
    RAISE EXCEPTION 'Invalid payment plan level: %', NEW.level;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_payment_plan_level
  BEFORE INSERT OR UPDATE ON payment_plans
  FOR EACH ROW EXECUTE FUNCTION validate_payment_plan_level();

ALTER TABLE payment_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active plans" ON payment_plans FOR SELECT USING (true);
CREATE POLICY "Admins can manage plans" ON payment_plans FOR ALL USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID REFERENCES profiles(user_id) ON DELETE CASCADE NOT NULL,
  plan_id UUID REFERENCES payment_plans(id),
  amount INTEGER NOT NULL,
  currency TEXT DEFAULT 'NGN',
  status TEXT DEFAULT 'pending',
  type TEXT DEFAULT 'enrollment',
  paystack_reference TEXT UNIQUE,
  paystack_transaction_id TEXT,
  payment_method TEXT,
  paid_at TIMESTAMP WITH TIME ZONE,
  receipt_sent BOOLEAN DEFAULT false,
  notes TEXT,
  recorded_by UUID REFERENCES profiles(user_id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.validate_payment_status()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status NOT IN ('pending','success','failed','refunded','abandoned') THEN
    RAISE EXCEPTION 'Invalid payment status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_payment_status
  BEFORE INSERT OR UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION validate_payment_status();

CREATE OR REPLACE FUNCTION public.validate_payment_type()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.type NOT IN ('enrollment','subscription','private_session','manual') THEN
    RAISE EXCEPTION 'Invalid payment type: %', NEW.type;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_payment_type
  BEFORE INSERT OR UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION validate_payment_type();

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can view own payments" ON payments FOR SELECT USING (student_id = auth.uid());
CREATE POLICY "Students can insert own payments" ON payments FOR INSERT WITH CHECK (student_id = auth.uid());
CREATE POLICY "Admins can manage all payments" ON payments FOR ALL USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Teachers can view student payments" ON payments FOR SELECT USING (has_role(auth.uid(), 'teacher'));

-- Student Subscriptions table
CREATE TABLE IF NOT EXISTS student_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID REFERENCES profiles(user_id) ON DELETE CASCADE NOT NULL,
  plan_id UUID REFERENCES payment_plans(id),
  payment_id UUID REFERENCES payments(id),
  status TEXT DEFAULT 'active',
  start_date DATE DEFAULT CURRENT_DATE,
  end_date DATE,
  auto_renew BOOLEAN DEFAULT false,
  paystack_subscription_code TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.validate_subscription_status()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status NOT IN ('active','expired','cancelled','suspended') THEN
    RAISE EXCEPTION 'Invalid subscription status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_subscription_status
  BEFORE INSERT OR UPDATE ON student_subscriptions
  FOR EACH ROW EXECUTE FUNCTION validate_subscription_status();

ALTER TABLE student_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can view own subscriptions" ON student_subscriptions FOR SELECT USING (student_id = auth.uid());
CREATE POLICY "Admins can manage all subscriptions" ON student_subscriptions FOR ALL USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Students can insert own subscriptions" ON student_subscriptions FOR INSERT WITH CHECK (student_id = auth.uid());

-- Profile columns for payment
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_end_date DATE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_payment_exempt BOOLEAN DEFAULT false;

CREATE OR REPLACE FUNCTION public.validate_profile_payment_status()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.payment_status IS NOT NULL AND NEW.payment_status NOT IN ('paid','unpaid','partial','exempt','grace') THEN
    RAISE EXCEPTION 'Invalid payment status: %', NEW.payment_status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_profile_payment_status
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION validate_profile_payment_status();
