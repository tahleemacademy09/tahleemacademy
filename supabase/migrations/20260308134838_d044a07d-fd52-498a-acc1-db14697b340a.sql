
-- Create chat_channels table
CREATE TABLE IF NOT EXISTS public.chat_channels (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT,
  name_ar TEXT,
  description TEXT,
  type TEXT DEFAULT 'group',
  level TEXT,
  created_by UUID,
  is_private BOOLEAN DEFAULT false,
  avatar TEXT,
  last_message TEXT,
  last_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  member_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Validation trigger for channel type
CREATE OR REPLACE FUNCTION public.validate_channel_type()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.type NOT IN ('group', 'direct', 'level', 'announcement') THEN
    RAISE EXCEPTION 'Invalid channel type: %. Must be group, direct, level, or announcement.', NEW.type;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_channel_type_trigger
  BEFORE INSERT OR UPDATE ON public.chat_channels
  FOR EACH ROW EXECUTE FUNCTION public.validate_channel_type();

-- Create chat_members table
CREATE TABLE IF NOT EXISTS public.chat_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id UUID REFERENCES public.chat_channels(id) ON DELETE CASCADE NOT NULL,
  user_id UUID NOT NULL,
  role TEXT DEFAULT 'member',
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_read_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_muted BOOLEAN DEFAULT false,
  UNIQUE(channel_id, user_id)
);

-- Validation trigger for member role
CREATE OR REPLACE FUNCTION public.validate_member_role()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.role NOT IN ('admin', 'moderator', 'member') THEN
    RAISE EXCEPTION 'Invalid member role: %. Must be admin, moderator, or member.', NEW.role;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_member_role_trigger
  BEFORE INSERT OR UPDATE ON public.chat_members
  FOR EACH ROW EXECUTE FUNCTION public.validate_member_role();

-- Add channel_id to chat_messages
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS channel_id UUID REFERENCES public.chat_channels(id) ON DELETE CASCADE;

-- Enable RLS
ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_members ENABLE ROW LEVEL SECURITY;

-- RLS for chat_channels
CREATE POLICY "Users can view public channels" ON public.chat_channels FOR SELECT USING (is_private = false);
CREATE POLICY "Members can view their channels" ON public.chat_channels FOR SELECT USING (EXISTS (SELECT 1 FROM public.chat_members cm WHERE cm.channel_id = chat_channels.id AND cm.user_id = auth.uid()));
CREATE POLICY "Admins can view all channels" ON public.chat_channels FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Teachers can view all channels" ON public.chat_channels FOR SELECT USING (has_role(auth.uid(), 'teacher'::app_role));
CREATE POLICY "Authenticated can create channels" ON public.chat_channels FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Channel admins can update" ON public.chat_channels FOR UPDATE USING (EXISTS (SELECT 1 FROM public.chat_members cm WHERE cm.channel_id = chat_channels.id AND cm.user_id = auth.uid() AND cm.role = 'admin') OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins teachers can delete channels" ON public.chat_channels FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));

-- RLS for chat_members
CREATE POLICY "View members of joined channels" ON public.chat_members FOR SELECT USING (EXISTS (SELECT 1 FROM public.chat_members cm2 WHERE cm2.channel_id = chat_members.channel_id AND cm2.user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));
CREATE POLICY "Add members to channels" ON public.chat_members FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.chat_members cm WHERE cm.channel_id = chat_members.channel_id AND cm.user_id = auth.uid() AND cm.role = 'admin') OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role) OR auth.uid() = user_id);
CREATE POLICY "Update members in channels" ON public.chat_members FOR UPDATE USING (EXISTS (SELECT 1 FROM public.chat_members cm WHERE cm.channel_id = chat_members.channel_id AND cm.user_id = auth.uid() AND cm.role = 'admin') OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Remove members from channels" ON public.chat_members FOR DELETE USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role) OR EXISTS (SELECT 1 FROM public.chat_members cm WHERE cm.channel_id = chat_members.channel_id AND cm.user_id = auth.uid() AND cm.role = 'admin'));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_channels;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_members;

-- Insert default channels
INSERT INTO public.chat_channels (name, name_ar, description, type, level, is_private)
VALUES
  ('General', 'عام', 'General discussion for all students', 'group', null, false),
  ('Beginner Level', 'المستوى المبتدئ', 'Chat for beginner level students', 'level', 'beginner', false),
  ('Intermediate Level', 'المستوى المتوسط', 'Chat for intermediate level students', 'level', 'intermediate', false),
  ('Advanced Level', 'المستوى المتقدم', 'Chat for advanced level students', 'level', 'advanced', false),
  ('Announcements', 'الإعلانات', 'Official announcements from teachers and admins', 'announcement', null, false);
