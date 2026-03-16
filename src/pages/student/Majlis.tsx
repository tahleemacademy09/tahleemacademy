import { useEffect, useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Send, MessageCircle, Reply, CheckCheck, Check, Mic, MicOff,
  Image, Paperclip, Smile, ArrowLeft, FileText, Trash2, Info,
  X, Pin, Search, Forward, Star, Ban, Volume2, VolumeX,
  MoreVertical, Copy, Download, Eye, Lock
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

const EMOJI_LIST = ["❤️", "😂", "😮", "😢", "🤲", "👍", "🎉", "🔥"];

const Majlis = () => {
  const { t, language, dir } = useLanguage();
  const { user, profile, hasRole } = useAuth();
  const { toast } = useToast();

  // Core state
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [reactions, setReactions] = useState<Record<string, Record<string, string[]>>>({});
  const [pinnedMessages, setPinnedMessages] = useState<ChatMessage[]>([]);
  const [mutedChannels, setMutedChannels] = useState<Set<string>>(new Set());
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [starredMessages, setStarredMessages] = useState<Set<string>>(new Set());

  // UI state
  const [input, setInput] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showChannelInfo, setShowChannelInfo] = useState(false);
  const [showBrowseChannels, setShowBrowseChannels] = useState(false);
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [showStudentProfile, setShowStudentProfile] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState<string | null>(null);
  const [showMessageMenu, setShowMessageMenu] = useState<string | null>(null);
  const [showPinnedBar, setShowPinnedBar] = useState(true);

  // Admin controls state
  const [channelLocked, setChannelLocked] = useState(false);
  const [slowMode, setSlowMode] = useState(false);
  const [mutedMembers, setMutedMembers] = useState<Set<string>>(new Set());
  const [bannedMembers, setBannedMembers] = useState<Set<string>>(new Set());

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const recordingTimerRef = useRef<any>(null);
  const typingTimerRef = useRef<any>(null);

  const isAdmin = hasRole("admin");
  const isTeacher = hasRole("teacher");
  const canModerate = isAdmin || isTeacher;
  const activeChannel = channels.find(c => c.id === activeChannelId) || null;

  // ─── Load Channels ───
  useEffect(() => {
    if (!user) return;
    const loadChannels = async () => {
      const { data: memberData } = await supabase.from("chat_members" as any).select("channel_id, is_muted").eq("user_id", user.id);
      const channelIds = (memberData || []).map((m: any) => m.channel_id);
      const muted = new Set((memberData || []).filter((m: any) => m.is_muted).map((m: any) => m.channel_id));
      setMutedChannels(muted);

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
    const defaults = allChannels.filter(c => (c.type === "group" && c.name === "General") || c.type === "announcement");
    for (const ch of defaults) {
      await supabase.from("chat_members" as any).upsert({ channel_id: ch.id, user_id: userId, role: "member" }, { onConflict: "channel_id,user_id" });
    }
  };

  // ─── Load Messages ───
  useEffect(() => {
    if (!activeChannelId) return;
    const loadMessages = async () => {
      const { data } = await supabase.from("chat_messages").select("*").eq("channel_id", activeChannelId).order("created_at", { ascending: true }).limit(200);
      setMessages((data as unknown as ChatMessage[]) || []);

      const userIds = [...new Set((data || []).map((m: any) => m.user_id))];
      if (userIds.length > 0) {
        const { data: profs } = await supabase.from("profiles").select("user_id, full_name, full_name_ar, avatar_url, level, email, student_id").in("user_id", userIds);
        const map: Record<string, UserProfile> = {};
        (profs || []).forEach((p: any) => { map[p.user_id] = p as UserProfile; });
        setProfiles(prev => ({ ...prev, ...map }));
      }

      if (user) await supabase.from("chat_members" as any).update({ last_read_at: new Date().toISOString() }).eq("channel_id", activeChannelId).eq("user_id", user.id);

      // Load reactions
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

      // Load pinned messages
      const pinned = (data || []).filter((m: any) => m.is_pinned) as unknown as ChatMessage[];
      setPinnedMessages(pinned);
    };
    loadMessages();

    // Realtime subscription
    const channel = supabase.channel(`majlis-${activeChannelId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages", filter: `channel_id=eq.${activeChannelId}` }, (payload) => {
        if (payload.eventType === "INSERT") {
          const newMsg = payload.new as unknown as ChatMessage;
          setMessages(prev => [...prev, newMsg]);
          if (!profiles[newMsg.user_id]) {
            supabase.from("profiles").select("user_id, full_name, full_name_ar, avatar_url, level, email, student_id").eq("user_id", newMsg.user_id).maybeSingle()
              .then(({ data }) => { if (data) setProfiles(prev => ({ ...prev, [data.user_id]: data as unknown as UserProfile })); });
          }
        } else if (payload.eventType === "UPDATE") {
          setMessages(prev => prev.map(m => m.id === (payload.new as any).id ? payload.new as unknown as ChatMessage : m));
        } else if (payload.eventType === "DELETE") {
          setMessages(prev => prev.filter(m => m.id !== (payload.old as any).id));
        }
      })
      .on("broadcast", { event: "typing" }, (payload) => {
        if (payload.payload.userId !== user?.id) {
          setTypingUsers(prev => [...new Set([...prev, payload.payload.name])]);
          clearTimeout(typingTimerRef.current);
          typingTimerRef.current = setTimeout(() => setTypingUsers([]), 3000);
        }
      })
      .subscribe();

    // Update online status
    supabase.from("chat_members" as any).update({ is_online: true, last_seen: new Date().toISOString() }).eq("channel_id", activeChannelId).eq("user_id", user?.id || "");

    return () => {
      supabase.removeChannel(channel);
      supabase.from("chat_members" as any).update({ is_online: false, last_seen: new Date().toISOString() }).eq("channel_id", activeChannelId).eq("user_id", user?.id || "");
    };
  }, [activeChannelId]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // ─── Reload Reactions ───
  const reloadReactions = async () => {
    if (!messages.length) return;
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

  // ─── Typing Indicator ───
  const handleTyping = () => {
    if (!activeChannelId || !user) return;
    supabase.channel(`majlis-${activeChannelId}`).send({
      type: "broadcast", event: "typing",
      payload: { userId: user.id, name: profile?.full_name || "Someone" }
    });
  };

  // ─── Send Message ───
  const sendMessage = async (contentType = "text", mediaPath?: string) => {
    if (!user || !activeChannelId) return;
    if (contentType === "text" && !input.trim() && !mediaPath) return;
    if (channelLocked && !canModerate) {
      toast({ title: t("Channel is locked", "القناة مقفلة"), variant: "destructive" });
      return;
    }
    if (mutedMembers.has(user.id) && !canModerate) {
      toast({ title: t("You are muted", "أنت مكتوم"), variant: "destructive" });
      return;
    }
    if (activeChannel?.type === "announcement" && !canModerate) {
      toast({ title: t("Only admins can post here", "فقط المشرفون يمكنهم النشر هنا"), variant: "destructive" });
      return;
    }

    let text = input.trim();
    setInput("");
    setReplyTo(null);

    const msgData: any = {
      class_level_id: activeChannelId,
      channel_id: activeChannelId,
      user_id: user.id,
      content_type: contentType,
      text: contentType === "text" ? text : (text || null),
      media_path: mediaPath || null,
    };

    if (replyTo) {
      msgData.reply_to_id = replyTo.id;
      msgData.reply_preview = (replyTo.text || "").slice(0, 100);
    }

    const { error } = await supabase.from("chat_messages").insert(msgData as any);
    if (error) toast({ title: t("Error sending message", "خطأ في الإرسال"), variant: "destructive" });
    else {
      await supabase.from("chat_channels" as any).update({
        last_message: contentType === "text" ? text.slice(0, 100) : `📎 ${contentType}`,
        last_message_at: new Date().toISOString(),
      }).eq("id", activeChannelId);
    }
    inputRef.current?.focus();
  };

  // ─── Delete Message ───
  const deleteMessage = async (msgId: string) => {
    await supabase.from("chat_messages").delete().eq("id", msgId);
    setMessages(prev => prev.filter(m => m.id !== msgId));
    setShowMessageMenu(null);
    toast({ title: t("Message deleted", "تم حذف الرسالة") });
  };

  // ─── Pin Message (Admin only) ───
  const pinMessage = async (msg: ChatMessage) => {
    const isPinned = !msg.is_pinned;
    await supabase.from("chat_messages").update({ is_pinned: isPinned } as any).eq("id", msg.id);
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, is_pinned: isPinned } : m));
    setPinnedMessages(prev => isPinned ? [...prev, msg] : prev.filter(m => m.id !== msg.id));
    setShowMessageMenu(null);
    toast({ title: isPinned ? t("Message pinned 📌", "تم تثبيت الرسالة 📌") : t("Message unpinned", "تم إلغاء التثبيت") });
  };

  // ─── Star Message ───
  const starMessage = (msgId: string) => {
    setStarredMessages(prev => {
      const next = new Set(prev);
      next.has(msgId) ? next.delete(msgId) : next.add(msgId);
      return next;
    });
    setShowMessageMenu(null);
  };

  // ─── Copy Message ───
  const copyMessage = (text: string) => {
    navigator.clipboard?.writeText(text);
    setShowMessageMenu(null);
    toast({ title: t("Copied!", "تم النسخ!") });
  };

  // ─── Voice Recording ───
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach(t => t.stop());
        clearInterval(recordingTimerRef.current);
        setRecordingTime(0);
        const path = `voice/${activeChannelId}/${user!.id}/${crypto.randomUUID()}.webm`;
        const { error } = await supabase.storage.from("majlis-media").upload(path, blob);
        if (!error) await sendMessage("audio", path);
        else toast({ title: t("Failed to send voice message", "فشل إرسال الرسالة الصوتية"), variant: "destructive" });
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      recordingTimerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch {
      toast({ title: t("Microphone access denied", "تم رفض الوصول للميكروفون"), variant: "destructive" });
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  // ─── File Upload ───
  const handleFileUpload = async (file: File, type: "image" | "file") => {
    if (!user || !activeChannelId) return;
    const path = `${type}s/${activeChannelId}/${user.id}/${crypto.randomUUID()}-${file.name}`;
    const { error } = await supabase.storage.from("majlis-media").upload(path, file);
    if (!error) await sendMessage(type, path);
    else toast({ title: t("Upload failed", "فشل الرفع"), variant: "destructive" });
  };

  // ─── Admin: Mute Member ───
  const muteMember = async (userId: string) => {
    const isMuted = !mutedMembers.has(userId);
    if (isMuted) setMutedMembers(prev => new Set([...prev, userId]));
    else setMutedMembers(prev => { const n = new Set(prev); n.delete(userId); return n; });
    await supabase.from("chat_members" as any).update({ role: isMuted ? "muted" : "member" }).eq("channel_id", activeChannelId).eq("user_id", userId);
    toast({ title: isMuted ? t("Member muted 🔇", "تم كتم العضو 🔇") : t("Member unmuted 🔊", "تم رفع الكتم 🔊") });
  };

  // ─── Admin: Ban Member ───
  const banMember = async (userId: string) => {
    setBannedMembers(prev => new Set([...prev, userId]));
    await supabase.from("chat_members" as any).delete().eq("channel_id", activeChannelId).eq("user_id", userId);
    setMessages(prev => prev.filter(m => m.user_id !== userId));
    toast({ title: t("Member banned 🚫", "تم حظر العضو 🚫") });
  };

  // ─── Admin: Lock Channel ───
  const toggleChannelLock = async () => {
    const newLocked = !channelLocked;
    setChannelLocked(newLocked);
    toast({ title: newLocked ? t("Channel locked 🔒", "القناة مقفلة 🔒") : t("Channel unlocked 🔓", "القناة مفتوحة 🔓") });
  };

  // ─── Channel Actions ───
  const selectChannel = (channelId: string) => { setActiveChannelId(channelId); setMobileShowChat(true); setShowSearch(false); };
  const handleNewChat = () => setShowCreateDialog(true);
  const handleChannelCreated = async (channelId: string) => {
    const { data } = await supabase.from("chat_channels" as any).select("*").eq("id", channelId).single();
    if (data) setChannels(prev => prev.find(c => c.id === channelId) ? prev : [data as unknown as ChatChannel, ...prev]);
    setActiveChannelId(channelId);
    setMobileShowChat(true);
  };
  const handleLeaveChannel = async () => {
    if (!activeChannelId || !user) return;
    await supabase.from("chat_members" as any).delete().eq("channel_id", activeChannelId).eq("user_id", user.id);
    setChannels(prev => prev.filter(c => c.id !== activeChannelId));
    setActiveChannelId(channels[0]?.id || null);
    setShowChannelInfo(false);
  };
  const handleDeleteChannel = async () => {
    if (!activeChannelId) return;
    await supabase.from("chat_channels" as any).delete().eq("id", activeChannelId);
    setChannels(prev => prev.filter(c => c.id !== activeChannelId));
    setActiveChannelId(channels[0]?.id || null);
    setShowChannelInfo(false);
  };
  const handleBrowseJoined = (channelId: string) => { handleChannelCreated(channelId); setShowBrowseChannels(false); };

  // ─── Helpers ───
  const formatTime = (dateStr: string) => new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const formatRecordingTime = (secs: number) => `${Math.floor(secs / 60).toString().padStart(2, '0')}:${(secs % 60).toString().padStart(2, '0')}`;
  const getChannelName = (ch: ChatChannel) => language === "ar" ? (ch.name_ar || ch.name || "") : (ch.name || "");
  const canSend = () => {
    if (!activeChannel) return false;
    if (channelLocked && !canModerate) return false;
    if (activeChannel.type === "announcement") return canModerate;
    if (mutedMembers.has(user?.id || "") && !canModerate) return false;
    return true;
  };

  const filteredMessages = searchQuery
    ? messages.filter(m => (m.text || "").toLowerCase().includes(searchQuery.toLowerCase()))
    : messages;

  // ─── Media Sub-components ───
  const AudioMessage = ({ path }: { path: string }) => {
    const [url, setUrl] = useState<string | null>(null);
    useEffect(() => {
      supabase.storage.from("majlis-media").createSignedUrl(path, 3600).then(({ data }) => {
        if (data?.signedUrl) setUrl(data.signedUrl);
      });
    }, [path]);
    if (!url) return <span className="text-xs opacity-60">Loading voice...</span>;
    return (
      <div className="flex items-center gap-2 min-w-[180px]">
        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: "#1a3a2a" }}>
          <Mic className="h-4 w-4 text-white" />
        </div>
        <audio controls src={url} className="h-8 flex-1" style={{ maxWidth: "180px" }} />
      </div>
    );
  };

  const ImageMsg = ({ path }: { path: string }) => {
    const [url, setUrl] = useState<string | null>(null);
    useEffect(() => {
      supabase.storage.from("majlis-media").createSignedUrl(path, 3600).then(({ data }) => {
        if (data?.signedUrl) setUrl(data.signedUrl);
      });
    }, [path]);
    return url
      ? <img src={url} className="max-w-[220px] max-h-[220px] rounded-xl cursor-pointer" alt="" loading="lazy" onClick={() => window.open(url, "_blank")} />
      : <span className="text-xs opacity-60">Loading image...</span>;
  };

  const FileMsg = ({ path, text }: { path: string; text: string | null }) => {
    const fileName = path.split("/").pop() || "File";
    const open = async () => {
      const { data } = await supabase.storage.from("majlis-media").createSignedUrl(path, 300);
      if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    };
    return (
      <button onClick={open} className="flex items-center gap-2 hover:opacity-80 py-1">
        <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
          <FileText className="h-4 w-4" />
        </div>
        <span className="text-xs font-medium underline">{text || fileName}</span>
      </button>
    );
  };

  // ─── Message Bubble ───
  const MessageBubble = ({ m, idx }: { m: ChatMessage; idx: number }) => {
    const isMe = m.user_id === user?.id;
    const senderProfile = profiles[m.user_id];
    const name = senderProfile?.full_name || (isMe ? profile?.full_name : "Student");
    const prevMsg = messages[idx - 1];
    const showAvatar = !isMe && (!prevMsg || prevMsg.user_id !== m.user_id);
    const msgReactions = reactions[m.id] || {};
    const isStarred = starredMessages.has(m.id);
    const replyMsg = m.reply_to_id ? messages.find(x => x.id === m.reply_to_id) : null;
    const isHighlighted = searchQuery && (m.text || "").toLowerCase().includes(searchQuery.toLowerCase());

    return (
      <div className={`flex group ${isMe ? "justify-end" : "justify-start"} mb-1`}>
        {/* Avatar */}
        {!isMe && (
          <div className="w-9 shrink-0 self-end mb-1 mr-1">
            {showAvatar && (
              <button onClick={() => { setSelectedMember({ user_id: m.user_id, full_name: senderProfile?.full_name || null, avatar_url: senderProfile?.avatar_url || null, level: senderProfile?.level || null, student_id: (senderProfile as any)?.student_id || null, is_online: onlineUsers.has(m.user_id), last_seen: null }); setShowStudentProfile(true); }}>
                <Avatar className="h-8 w-8">
                  <AvatarImage src={senderProfile?.avatar_url || ""} />
                  <AvatarFallback style={{ backgroundColor: "#1a3a2a", color: "white", fontSize: "0.65rem" }}>{(name || "S")[0]}</AvatarFallback>
                </Avatar>
              </button>
            )}
          </div>
        )}

        <div className={`flex flex-col max-w-[72%] md:max-w-[58%] ${isMe ? "items-end" : "items-start"}`}>
          {/* Bubble */}
          <div
            className={`relative px-3 py-2 rounded-2xl shadow-sm ${isMe ? "rounded-tr-none" : "rounded-tl-none"} ${isHighlighted ? "ring-2 ring-yellow-400" : ""}`}
            style={{ backgroundColor: isMe ? "#DCF8C6" : "#FFFFFF", marginTop: showAvatar ? "6px" : "1px" }}
          >
            {/* Pinned indicator */}
            {m.is_pinned && <div className="flex items-center gap-1 mb-1"><Pin className="h-3 w-3 text-amber-500" /><span className="text-[9px] text-amber-500">Pinned</span></div>}

            {/* Sender name */}
            {showAvatar && !isMe && (
              <p className="text-[11px] font-semibold mb-0.5" style={{ color: "#1a3a2a" }}>{name}</p>
            )}

            {/* Reply preview */}
            {replyMsg && (
              <div className="mb-1.5 px-2 py-1 rounded-lg border-l-2 border-primary/50 bg-black/5">
                <p className="text-[10px] font-semibold opacity-70">{profiles[replyMsg.user_id]?.full_name || "..."}</p>
                <p className="text-[11px] opacity-60 truncate">{replyMsg.text || `[${replyMsg.content_type}]`}</p>
              </div>
            )}

            {/* Content */}
            <div className="text-sm text-gray-900" dir="auto">
              {m.content_type === "audio" && m.media_path ? <AudioMessage path={m.media_path} />
                : m.content_type === "image" && m.media_path ? <ImageMsg path={m.media_path} />
                : m.content_type === "file" && m.media_path ? <FileMsg path={m.media_path} text={m.text} />
                : <span className="whitespace-pre-wrap break-words">{m.text}</span>}
            </div>

            {/* Time + status */}
            <div className="flex items-center gap-1 mt-0.5 justify-end">
              {isStarred && <Star className="h-3 w-3 text-amber-400" />}
              <span className="text-[10px] text-gray-400">{formatTime(m.created_at)}</span>
              {isMe && <CheckCheck className="h-3.5 w-3.5" style={{ color: "#53BDEB" }} />}
            </div>

            {/* Hover action buttons */}
            <div className={`absolute -top-7 ${isMe ? "right-0" : "left-0"} opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5 bg-white rounded-full shadow-md px-1 py-0.5`}>
              {/* Quick emoji */}
              {["❤️", "👍", "😂"].map(emoji => (
                <button key={emoji} className="text-sm hover:scale-125 transition-transform px-0.5"
                  onClick={async () => {
                    await supabase.from("message_reactions" as any).upsert({ message_id: m.id, user_id: user?.id, emoji });
                    reloadReactions();
                  }}>
                  {emoji}
                </button>
              ))}
              <button onClick={() => { setReplyTo(m); inputRef.current?.focus(); }} className="p-1 text-gray-500 hover:text-gray-700">
                <Reply className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => setShowMessageMenu(showMessageMenu === m.id ? null : m.id)} className="p-1 text-gray-500 hover:text-gray-700">
                <MoreVertical className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Message context menu */}
            {showMessageMenu === m.id && (
              <div className={`absolute top-6 ${isMe ? "right-0" : "left-0"} bg-white rounded-xl shadow-xl border z-50 min-w-[160px] overflow-hidden`}>
                <button onClick={() => copyMessage(m.text || "")} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-sm">
                  <Copy className="h-4 w-4 text-gray-500" /> {t("Copy", "نسخ")}
                </button>
                <button onClick={() => { setReplyTo(m); setShowMessageMenu(null); inputRef.current?.focus(); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-sm">
                  <Reply className="h-4 w-4 text-gray-500" /> {t("Reply", "رد")}
                </button>
                <button onClick={() => starMessage(m.id)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-sm">
                  <Star className="h-4 w-4 text-amber-500" /> {isStarred ? t("Unstar", "إلغاء النجمة") : t("Star", "نجمة")}
                </button>
                {canModerate && (
                  <button onClick={() => pinMessage(m)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-sm">
                    <Pin className="h-4 w-4 text-blue-500" /> {m.is_pinned ? t("Unpin", "إلغاء التثبيت") : t("Pin", "تثبيت")}
                  </button>
                )}
                {(isMe || canModerate) && (
                  <button onClick={() => deleteMessage(m.id)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-red-50 text-sm text-red-500">
                    <Trash2 className="h-4 w-4" /> {t("Delete", "حذف")}
                  </button>
                )}
                {canModerate && !isMe && (
                  <>
                    <div className="border-t" />
                    <button onClick={() => muteMember(m.user_id)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-orange-50 text-sm text-orange-500">
                      {mutedMembers.has(m.user_id) ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                      {mutedMembers.has(m.user_id) ? t("Unmute", "رفع الكتم") : t("Mute", "كتم")}
                    </button>
                    <button onClick={() => banMember(m.user_id)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-red-50 text-sm text-red-500">
                      <Ban className="h-4 w-4" /> {t("Ban", "حظر")}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Reactions */}
          <MessageReactions messageId={m.id} reactions={msgReactions} onReactionUpdate={reloadReactions} />
        </div>
      </div>
    );
  };

  // ─── Main Render ───
  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden" onClick={() => { setShowMessageMenu(null); setShowEmojiPicker(null); }}>

      {/* Sidebar */}
      <div className={`${mobileShowChat ? "hidden md:flex" : "flex"} w-full md:w-80 lg:w-96 flex-col border-e`} style={{ borderColor: "hsl(var(--border))" }}>
        <MajlisSidebar
          channels={channels}
          activeChannelId={activeChannelId}
          onSelectChannel={selectChannel}
          onNewChat={handleNewChat}
          onBrowseChannels={() => setShowBrowseChannels(true)}
          profiles={profiles}
          unreadCounts={unreadCounts}
          userId={user?.id || ""}
        />
      </div>

      {/* Chat Area */}
      <div className={`${mobileShowChat ? "flex" : "hidden md:flex"} flex-1 flex-col min-w-0`}>
        {!activeChannel ? (
          <div className="flex-1 flex flex-col items-center justify-center" style={{ backgroundColor: "#F0ECE3" }}>
            <MessageCircle className="h-16 w-16 text-muted-foreground opacity-30 mb-3" />
            <p className="text-muted-foreground">{t("Select a chat to start messaging", "اختر محادثة لبدء المراسلة")}</p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col h-full">

            {/* Header */}
            <div className="px-3 py-2.5 flex items-center gap-3 shadow-sm shrink-0" style={{ backgroundColor: "#064E3B" }}>
              <button onClick={() => setMobileShowChat(false)} className="md:hidden text-white/80 p-1"><ArrowLeft className="h-5 w-5" /></button>
              <button className="flex-1 flex items-center gap-3 text-start" onClick={() => setShowGroupInfo(true)}>
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarFallback style={{ backgroundColor: "#b8962e", color: "white" }}>
                    {activeChannel.type === "announcement" ? "📢" : getChannelName(activeChannel).charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <h2 className="text-white font-semibold text-sm truncate">{getChannelName(activeChannel)}</h2>
                  <p className="text-white/60 text-[11px]">
                    {typingUsers.length > 0 ? (
                      <span className="text-green-300">{typingUsers[0]} {t("is typing...", "يكتب...")}</span>
                    ) : (
                      `${activeChannel.member_count || 0} ${t("members", "عضو")}`
                    )}
                  </p>
                </div>
              </button>
              <div className="flex items-center gap-1">
                <button onClick={() => setShowSearch(!showSearch)} className="text-white/80 hover:text-white p-1.5"><Search className="h-4.5 w-4.5" /></button>
                {canModerate && (
                  <button onClick={toggleChannelLock} className="text-white/80 hover:text-white p-1.5" title={channelLocked ? "Unlock channel" : "Lock channel"}>
                    <Lock className={`h-4.5 w-4.5 ${channelLocked ? "text-red-400" : ""}`} />
                  </button>
                )}
                <button onClick={() => setShowGroupInfo(true)} className="text-white/80 hover:text-white p-1.5"><Info className="h-4.5 w-4.5" /></button>
              </div>
            </div>

            {/* Search Bar */}
            {showSearch && (
              <div className="px-3 py-2 flex items-center gap-2 border-b" style={{ backgroundColor: "#f5f0e8" }}>
                <Search className="h-4 w-4 text-gray-400 shrink-0" />
                <input
                  autoFocus
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder={t("Search messages...", "ابحث في الرسائل...")}
                  className="flex-1 bg-transparent text-sm outline-none"
                />
                {searchQuery && <button onClick={() => setSearchQuery("")} className="text-gray-400"><X className="h-4 w-4" /></button>}
                <button onClick={() => { setShowSearch(false); setSearchQuery(""); }} className="text-gray-400 ml-1"><X className="h-4 w-4" /></button>
              </div>
            )}

            {/* Admin Controls Bar */}
            {canModerate && (
              <div className="px-3 py-1.5 flex items-center gap-2 border-b text-xs" style={{ backgroundColor: "#f5f0e8" }}>
                <span className="text-gray-500 flex-1">👑 Admin Controls</span>
                <button onClick={toggleChannelLock} className={`px-2 py-0.5 rounded-full text-white text-[10px] ${channelLocked ? "bg-red-500" : "bg-gray-400"}`}>
                  {channelLocked ? "🔒 Locked" : "🔓 Open"}
                </button>
                <button onClick={() => setSlowMode(!slowMode)} className={`px-2 py-0.5 rounded-full text-white text-[10px] ${slowMode ? "bg-orange-500" : "bg-gray-400"}`}>
                  {slowMode ? "⏱ Slow" : "⚡ Fast"}
                </button>
              </div>
            )}

            {/* Pinned Message Bar */}
            {pinnedMessages.length > 0 && showPinnedBar && (
              <div className="px-3 py-2 flex items-center gap-2 border-b cursor-pointer" style={{ backgroundColor: "#f0f7f4" }}
                onClick={() => { const m = pinnedMessages[0]; const el = document.getElementById(`msg-${m.id}`); el?.scrollIntoView({ behavior: "smooth" }); }}>
                <Pin className="h-3.5 w-3.5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-primary">Pinned Message</p>
                  <p className="text-xs text-gray-600 truncate">{pinnedMessages[0].text || `[${pinnedMessages[0].content_type}]`}</p>
                </div>
                <button onClick={e => { e.stopPropagation(); setShowPinnedBar(false); }} className="text-gray-400 p-0.5"><X className="h-3.5 w-3.5" /></button>
              </div>
            )}

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto px-3 py-3" ref={scrollRef}
              style={{ backgroundColor: "#FAFAF8", backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23064E3B' fill-opacity='0.025'%3E%3Cpath d='M30 0l30 30-30 30L0 30z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")` }}>

              {filteredMessages.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-sm text-muted-foreground">{searchQuery ? t("No messages found", "لم يتم العثور على رسائل") : t("No messages yet", "لا رسائل بعد")}</p>
                </div>
              )}

              {filteredMessages.map((m, idx) => (
                <div id={`msg-${m.id}`} key={m.id}>
                  <MessageBubble m={m} idx={idx} />
                </div>
              ))}
            </div>

            {/* Reply Banner */}
            {replyTo && (
              <div className="px-4 py-2 flex items-center gap-2 border-t shrink-0" style={{ backgroundColor: "#F0F2F5" }}>
                <div className="w-0.5 h-10 rounded-full bg-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold text-primary">{profiles[replyTo.user_id]?.full_name || "Student"}</p>
                  <p className="text-xs text-gray-500 truncate">{replyTo.text || `[${replyTo.content_type}]`}</p>
                </div>
                <button onClick={() => setReplyTo(null)} className="text-gray-400 p-1"><X className="h-4 w-4" /></button>
              </div>
            )}

            {/* Recording Banner */}
            {isRecording && (
              <div className="px-4 py-2 flex items-center gap-3 shrink-0" style={{ backgroundColor: "#FEE2E2" }}>
                <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                <span className="text-sm text-red-600 font-medium flex-1">{t("Recording", "تسجيل")} {formatRecordingTime(recordingTime)}</span>
                <Button size="sm" variant="destructive" onClick={stopRecording} className="h-7 text-xs"><MicOff className="h-3.5 w-3.5 mr-1" /> Stop</Button>
              </div>
            )}

            {/* Input Bar */}
            {canSend() ? (
              <div className="px-2 py-2 flex items-end gap-2 shrink-0" style={{ backgroundColor: "#F0F2F5" }}>
                <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={e => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0], "image"); }} />
                <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.xlsx,.pptx" className="hidden" onChange={e => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0], "file"); }} />

                <button onClick={() => imageInputRef.current?.click()} className="p-2 text-gray-500 hover:text-gray-700 shrink-0"><Image className="h-5 w-5" /></button>
                <button onClick={() => fileInputRef.current?.click()} className="p-2 text-gray-500 hover:text-gray-700 shrink-0"><Paperclip className="h-5 w-5" /></button>

                <div className="flex-1 flex items-center bg-white rounded-full shadow-sm px-3 gap-2">
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={e => { setInput(e.target.value); handleTyping(); }}
                    onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
                    placeholder={channelLocked ? t("Channel locked", "القناة مقفلة") : t("Type a message...", "اكتب رسالة...")}
                    dir="auto"
                    disabled={channelLocked && !canModerate}
                    className="flex-1 h-10 text-sm outline-none bg-transparent"
                  />
                </div>

                {input.trim() ? (
                  <button onClick={() => sendMessage()} className="p-2.5 rounded-full text-white shrink-0" style={{ backgroundColor: "#1a3a2a" }}>
                    <Send className="h-5 w-5" />
                  </button>
                ) : (
                  <button onClick={isRecording ? stopRecording : startRecording} className={`p-2.5 rounded-full text-white shrink-0 ${isRecording ? "animate-pulse" : ""}`} style={{ backgroundColor: isRecording ? "#EF4444" : "#1a3a2a" }}>
                    {isRecording ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                  </button>
                )}
              </div>
            ) : (
              <div className="px-4 py-3 text-center text-sm text-muted-foreground shrink-0" style={{ backgroundColor: "#F0F2F5" }}>
                {channelLocked ? "🔒 " + t("This channel is locked", "هذه القناة مقفلة") : t("Only admins can post here", "فقط المشرفون يمكنهم النشر هنا")}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <CreateChannelDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} mode="menu" onCreated={handleChannelCreated} />
      <ChannelInfoPanel open={showChannelInfo} onOpenChange={setShowChannelInfo} channel={activeChannel} onLeave={handleLeaveChannel} onDelete={handleDeleteChannel} />
      <BrowseChannelsDialog open={showBrowseChannels} onOpenChange={setShowBrowseChannels} myChannelIds={channels.map(c => c.id)} onJoined={handleBrowseJoined} />
      <GroupInfoPanel
        open={showGroupInfo}
        onOpenChange={setShowGroupInfo}
        channel={activeChannel}
        onUpdated={() => {
          if (activeChannelId) supabase.from("chat_channels" as any).select("*").eq("id", activeChannelId).single().then(({ data }) => {
            if (data) setChannels(prev => prev.map(c => c.id === activeChannelId ? data as unknown as ChatChannel : c));
          });
        }}
        onMemberTap={(member) => { setSelectedMember(member); setShowStudentProfile(true); }}
      />
      <StudentProfileSheet open={showStudentProfile} onOpenChange={setShowStudentProfile} member={selectedMember} />
    </div>
  );
};

export default Majlis;
