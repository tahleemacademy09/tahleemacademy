
-- Public classes table
CREATE TABLE IF NOT EXISTS public_classes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  title_ar TEXT,
  description TEXT,
  description_ar TEXT,
  host_id UUID NOT NULL,
  subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
  room_code TEXT UNIQUE NOT NULL,
  join_url TEXT,
  password TEXT,
  password_enabled BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'scheduled',
  scheduled_at TIMESTAMP WITH TIME ZONE,
  actual_start_time TIMESTAMP WITH TIME ZONE,
  actual_end_time TIMESTAMP WITH TIME ZONE,
  max_guests INTEGER DEFAULT 100,
  allow_guests BOOLEAN DEFAULT true,
  guest_count INTEGER DEFAULT 0,
  require_name BOOLEAN DEFAULT true,
  chat_enabled BOOLEAN DEFAULT true,
  raise_hand_enabled BOOLEAN DEFAULT true,
  recording_enabled BOOLEAN DEFAULT false,
  is_featured BOOLEAN DEFAULT false,
  livekit_room_name TEXT,
  allow_guest_camera BOOLEAN DEFAULT false,
  allow_guest_mic BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Validation trigger for status
CREATE OR REPLACE FUNCTION public.validate_public_class_status()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status NOT IN ('scheduled','live','ended','cancelled') THEN
    RAISE EXCEPTION 'Invalid status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_public_class_status
  BEFORE INSERT OR UPDATE ON public_classes
  FOR EACH ROW EXECUTE FUNCTION validate_public_class_status();

-- Guests table
CREATE TABLE IF NOT EXISTS public_class_guests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  class_id UUID REFERENCES public_classes(id) ON DELETE CASCADE,
  guest_name TEXT NOT NULL,
  guest_email TEXT,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  left_at TIMESTAMP WITH TIME ZONE,
  duration_minutes INTEGER DEFAULT 0,
  device_info TEXT,
  is_registered_user BOOLEAN DEFAULT false,
  user_id UUID
);

-- Registrations table
CREATE TABLE IF NOT EXISTS public_class_registrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  class_id UUID REFERENCES public_classes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  registered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS
ALTER TABLE public_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_class_guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_class_registrations ENABLE ROW LEVEL SECURITY;

-- Public classes: anyone can view
CREATE POLICY "Anyone can view public classes" ON public_classes FOR SELECT USING (true);
-- Admin/teacher can manage
CREATE POLICY "Admin/teacher can manage public classes" ON public_classes FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));

-- Guests: anyone can insert (no auth required for guests)
CREATE POLICY "Anyone can view guests" ON public_class_guests FOR SELECT USING (true);
CREATE POLICY "Anyone can insert guests" ON public_class_guests FOR INSERT WITH CHECK (true);
CREATE POLICY "Admin/teacher can manage guests" ON public_class_guests FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));

-- Registrations: anyone can insert
CREATE POLICY "Anyone can view registrations" ON public_class_registrations FOR SELECT USING (true);
CREATE POLICY "Anyone can register" ON public_class_registrations FOR INSERT WITH CHECK (true);
CREATE POLICY "Admin/teacher can manage registrations" ON public_class_registrations FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public_classes;
ALTER PUBLICATION supabase_realtime ADD TABLE public_class_guests;
