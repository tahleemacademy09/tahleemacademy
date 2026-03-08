export interface ChatChannel {
  id: string;
  name: string | null;
  name_ar: string | null;
  description: string | null;
  type: string;
  level: string | null;
  created_by: string | null;
  is_private: boolean;
  avatar: string | null;
  last_message: string | null;
  last_message_at: string | null;
  member_count: number;
  created_at: string;
}

export interface ChatMember {
  id: string;
  channel_id: string;
  user_id: string;
  role: string;
  joined_at: string;
  last_read_at: string;
  is_muted: boolean;
}

export interface ChatMessage {
  id: string;
  class_level_id: string;
  channel_id: string | null;
  user_id: string;
  content_type: string;
  text: string | null;
  media_path: string | null;
  created_at: string;
  sender_name?: string;
}

export interface UserProfile {
  user_id: string;
  full_name: string | null;
  full_name_ar: string | null;
  avatar_url: string | null;
  level: string | null;
  email: string | null;
}

export type ChannelType = 'group' | 'direct' | 'level' | 'announcement';
