import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Send, MessageCircle, Reply, CheckCheck, Mic, MicOff,
  Image, Paperclip, Smile, ArrowLeft, FileText, Trash2, Info
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import MajlisSidebar from "@/components/majlis/MajlisSidebar";
import CreateChannelDialog from "@/components/majlis/CreateChannelDialog";
import ChannelInfoPanel from "@/components/majlis/ChannelInfoPanel";
import BrowseChannelsDialog from "@/components/majlis/BrowseChannelsDialog";
import GroupInfoPanel from "@/components/majlis/GroupInfoPanel";
import StudentProfileSheet from "@/components/majlis/StudentProfileSheet";
import MessageReactions from "@/components/majlis/MessageReactions";
import type { ChatChannel, ChatMessage, UserProfile } from "@/components/majlis/types";

const Majlis = () => {
  const { t, language, dir } = useLanguage();
  const { user, profile, hasRole } = useAuth();
  const { toast } = useToast();

  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [input, setInput] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createMode, setCreateMode] = useState<"group" | "dm" | "menu">("menu");
  const [showChannelInfo, setShowChannelInfo] = useState(false);
  const [showBrowseChannels, setShowBrowseChannels] = useState(false);
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [showStudentProfile, setShowStudentProfile] = useState(false);
  const [reactions, setReactions] = useState<Record<string, Record<string, string[]>>>({});

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const isAdmin = hasRole("admin");
  const isTeacher = hasRole("teacher");
  const activeChannel = channels.find(c => c.id === activeChannelId) || null;

  useEffect(() => {
    if (!user) return;
    const loadChannels = async () => {
      const { data: memberData } = await supabase.from("chat_members" as any).select("channel_id").eq("user_id", user.id);
      const channelIds = (memberData || []).map((m: any) => m.channel_id);
      const { data: publicChannels } = await supabase.from("chat_channels" as any).select("*").eq("is_private", false);
      const { data: memberChannels } = channelIds.length > 0 ? await supabase.from("chat_channels" as any).select("*").in("id", channelIds) : { data: [] };
      const allChannels = [...(memberChannels || []), ...(publicChannels || [])];
      const unique = Array.from(new Map(allChannels.map((c: any) => [c.id, c])).values()) as unknown as ChatChannel[];
      setChannels(unique);
      await autoJoinLevelChannel(user.id, profile?.level);
      await autoJoinDefaultChannels(user.id, unique);
      if (!activeChannelId && unique.length > 0) setActiveChannelId(unique[0].id);
    };
    loadChannels();
  }, [user, profile?.level]);

  const autoJoinLevelChannel = async (userId: string, level: string | null) => {
    if (!level) return;
    const { data: levelChannels } = await supabase.from("chat_channels" as any).select("id").eq("type", "level").eq("level", level);
    for (const ch of (levelChannels || []) as any[]) {
      await supabase.from("chat_members" as any).upsert({ channel_id: ch.id, user_id: userId, role: "member" }, { onConflict: "channel_id,user_id" });
    }
  };

  const autoJoinDefaultChannels = async (userId: string, allChannels: ChatChannel[]) => {
    const defaults = allChannels.filter(c => c.type === "group" && c.name === "General" || c.type === "announcement");
    for (const ch of defaults) {
      await supabase.from("chat_members" as any).upsert({ channel_id: ch.id, user_id: userId, role: "member" }, { onConflict: "channel_id,user_id" });
    }
  };

  useEffect(() => {
    if (!activeChannelId) return;
    const loadMessages = async () => {
      const { data } = await supabase.from("chat_messages").select("*").eq("channel_id", activeChannelId).order("created_at", { ascending: true }).limit(200);
      setMessages((data as unknown as ChatMessage[]) || []);
      const userIds = [...new Set((data || []).map((m: any) => m.user_id))];
      if (userIds.length > 0) {
        const { data: profs } = await supabase.from("profiles").select("user_id, full_name, full_name_ar, avatar_url, level, email").in("user_id", userIds);
        const map: Record<string, UserProfile> = {};
        (profs || []).forEach((p: any) => { map[p.user_id] = p as UserProfile; });
        setProfiles(prev => ({ ...prev, ...map }));
      }
      if (user) await supabase.from("chat_members" as any).update({ last_read_at: new Date().toISOString() }).eq("channel_id", activeChannelId).eq("user_id", user.id);
      const msgIds = (data || []).map((m: any) => m.id);
      if (msgIds.length > 0) {
        const { data: reactData } = await supabase.from("message_reactions" as any).select("message_id, user_id, emoji").in("message_id", msgIds);
        const reactMap: Record<string, Record<string, string[]>> = {};
        (reactData || []).forEach((r: any) => {
          if (!reactMap[r.message_id]) reactMap[r.message_id] = {};
          if (!reactMap[r.message_id][r.emoji]) reactMap[r.message_id][r.emoji] = [];
          reactMap[r.message_id][r.emoji].push(r.user_id);
        });
        setReactions(reactMap);
      }
    };
    loadMessages();
    const channel = supabase.channel(`majlis-channel-${activeChannelId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages", filter: `channel_id=eq.${activeChannelId}` }, (payload) => {
        if (payload.eventType === "INSERT") {
          const newMsg = payload.new as unknown as ChatMessage;
          setMessages(prev => [...prev, newMsg]);
          if (!profiles[newMsg.user_id]) {
            supabase.from("profiles").select("user_id, full_name, full_name_ar, avatar_url, level, email").eq("user_id", newMsg.user_id).maybeSingle()
              .then(({ data }) => { if (data) setProfiles(prev => ({ ...prev, [data.user_id]: data as unknown as UserProfile })); });
          }
        } else if (payload.eventType === "DELETE") {
          setMessages(prev => prev.filter(m => m.id !== (payload.old as any).id));
        }
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeChannelId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const reloadReactions = async () => {
    if (!activeChannelId || messages.length === 0) return;
    const msgIds = messages.map(m => m.id);
    const { data: reactData } = await supabase.from("message_reactions" as any).select("message_id, user_id, emoji").in("message_id", msgIds);
    const reactMap: Record<string, Record<string, string[]>> = {};
    (reactData || []).forEach((r: any) => {
      if (!reactMap[r.message_id]) reactMap[r.message_id] = {};
      if (!reactMap[r.message_id][r.emoji]) reactMap[r.message_id][r.emoji] = [];
      reactMap[r.message_id][r.emoji].push(r.user_id);
    });
    setReactions(reactMap);
  };

  const sendMessage = async (contentType = "text", mediaPath?: string) => {
    if ((!input.trim() && contentType === "text" && !mediaPath) || !activeChannelId || !user) return;
    if (activeChannel?.type === "announcement" && !isAdmin && !isTeacher) {
      toast({ title
