
-- Admin actions log
CREATE TABLE IF NOT EXISTS public.majlis_admin_actions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  target_user_id UUID REFERENCES public.profiles(user_id),
  target_message_id UUID REFERENCES public.chat_messages(id),
  target_channel_id UUID REFERENCES public.chat_channels(id),
  reason TEXT,
  duration_hours INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Banned users
CREATE TABLE IF NOT EXISTS public.majlis_banned_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(user_id) ON DELETE CASCADE NOT NULL,
  banned_by UUID REFERENCES public.profiles(user_id),
  channel_id UUID REFERENCES public.chat_channels(id),
  reason TEXT,
  banned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  is_permanent BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  UNIQUE(user_id, channel_id)
);

-- Broadcast messages
CREATE TABLE IF NOT EXISTS public.majlis_broadcast (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sent_by UUID REFERENCES public.profiles(user_id),
  title TEXT,
  message TEXT NOT NULL,
  message_ar TEXT,
  target TEXT DEFAULT 'all',
  target_user_ids UUID[],
  is_pinned BOOLEAN DEFAULT false,
  pin_expires_at TIMESTAMP WITH TIME ZONE,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  read_count INTEGER DEFAULT 0
);

-- Validation trigger for broadcast target
CREATE OR REPLACE FUNCTION public.validate_broadcast_target()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.target NOT IN ('all','students','teachers','level_beginner','level_intermediate','level_advanced','custom') THEN
    RAISE EXCEPTION 'Invalid broadcast target: %', NEW.target;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_broadcast_target
  BEFORE INSERT OR UPDATE ON public.majlis_broadcast
  FOR EACH ROW EXECUTE FUNCTION public.validate_broadcast_target();

-- Admin private notes on users
CREATE TABLE IF NOT EXISTS public.majlis_admin_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID REFERENCES public.profiles(user_id),
  user_id UUID REFERENCES public.profiles(user_id),
  note TEXT NOT NULL,
  is_private BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Audit log
CREATE TABLE IF NOT EXISTS public.majlis_audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID REFERENCES public.profiles(user_id),
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add extra columns to chat_messages
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS edited_by UUID;
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS deleted_by UUID;
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS deleted_reason TEXT;
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS is_broadcast BOOLEAN DEFAULT false;
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false;
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN DEFAULT false;
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS is_starred BOOLEAN DEFAULT false;
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS original_text TEXT;

-- RLS policies for new tables
ALTER TABLE public.majlis_admin_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.majlis_banned_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.majlis_broadcast ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.majlis_admin_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.majlis_audit_log ENABLE ROW LEVEL SECURITY;

-- Admin-only access policies
CREATE POLICY "Admins can manage admin actions" ON public.majlis_admin_actions
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage banned users" ON public.majlis_banned_users
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage broadcasts" ON public.majlis_broadcast
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage notes" ON public.majlis_admin_notes
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can view audit log" ON public.majlis_audit_log
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Enable realtime for broadcast
ALTER PUBLICATION supabase_realtime ADD TABLE public.majlis_broadcast;
