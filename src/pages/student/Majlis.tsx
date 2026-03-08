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
  Image, Paperclip, Smile, ArrowLeft, FileText, Trash2, Info,
  BarChart3, Megaphone, Star
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import MajlisSidebar from "@/components/majlis/MajlisSidebar";
import CreateChannelDialog from "@/components/majlis/CreateChannelDialog";
import ChannelInfoPanel from "@/components/majlis/ChannelInfoPanel";
import BrowseChannelsDialog from "@/components/majlis/BrowseChannelsDialog";
import AdminMessageMenu from "@/components/majlis/AdminMessageMenu";
import AdminBroadcastDialog from "@/components/majlis/AdminBroadcastDialog";
import AdminDashboardPanel from "@/components/majlis/AdminDashboardPanel";
import AdminProfileCard from "@/components/majlis/AdminProfileCard";
import type { ChatChannel, ChatMessage, UserProfile } from "@/components/majlis/types";

const Majlis = () => {
  const { t, language, dir } = useLanguage();
  const { user, profile, hasRole } = useAuth();
  const { toast } = useToast();

  // Channels & messages
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

  // UI state
  const [input, setInput] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createMode, setCreateMode] = useState<"group" | "dm" | "menu">("menu");
  const [showChannelInfo, setShowChannelInfo] = useState(false);
  const [showBrowseChannels, setShowBrowseChannels] = useState(false);

  // Admin state
  const [contextMenu, setContextMenu] = useState<{ message: ChatMessage; x: number; y: number } | null>(null);
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [showAdminDashboard, setShowAdminDashboard] = useState(false);
  const [profileCardUserId, setProfileCardUserId] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const isAdmin = hasRole("admin");
  const isTeacher = hasRole("teacher");

  const activeChannel = channels.find(c => c.id === activeChannelId) || null;

  // ─── Load channels user is a member of ───
  useEffect(() => {
    if (!user) return;
    const loadChannels = async () => {
      // Get channels the user is a member of
      const { data: memberData } = await supabase
        .from("chat_members" as any)
        .select("channel_id")
        .eq("user_id", user.id);

      const channelIds = (memberData || []).map((m: any) => m.channel_id);

      // Also get public channels
      const { data: publicChannels } = await supabase
        .from("chat_channels" as any)
        .select("*")
        .eq("is_private", false);

      const { data: memberChannels } = channelIds.length > 0
        ? await supabase.from("chat_channels" as any).select("*").in("id", channelIds)
        : { data: [] };

      // Merge and deduplicate
      const allChannels = [...(memberChannels || []), ...(publicChannels || [])];
      const unique = Array.from(new Map(allChannels.map((c: any) => [c.id, c])).values()) as unknown as ChatChannel[];
      setChannels(unique);

      // Auto-join level channel based on profile
      await autoJoinLevelChannel(user.id, profile?.level);

      // Auto-join general & announcement channels
      await autoJoinDefaultChannels(user.id, unique);

      // Select first channel if none selected
      if (!activeChannelId && unique.length > 0) {
        setActiveChannelId(unique[0].id);
      }
    };
    loadChannels();
  }, [user, profile?.level]);

  const autoJoinLevelChannel = async (userId: string, level: string | null) => {
    if (!level) return;
    const { data: levelChannels } = await supabase
      .from("chat_channels" as any)
      .select("id")
      .eq("type", "level")
      .eq("level", level);

    for (const ch of (levelChannels || []) as any[]) {
      await supabase.from("chat_members" as any).upsert(
        { channel_id: ch.id, user_id: userId, role: "member" },
        { onConflict: "channel_id,user_id" }
      );
    }
  };

  const autoJoinDefaultChannels = async (userId: string, allChannels: ChatChannel[]) => {
    const defaults = allChannels.filter(c => c.type === "group" && c.name === "General" || c.type === "announcement");
    for (const ch of defaults) {
      await supabase.from("chat_members" as any).upsert(
        { channel_id: ch.id, user_id: userId, role: "member" },
        { onConflict: "channel_id,user_id" }
      );
    }
  };

  // ─── Load messages for active channel ───
  useEffect(() => {
    if (!activeChannelId) return;
    const loadMessages = async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("channel_id", activeChannelId)
        .order("created_at", { ascending: true })
        .limit(200);
      setMessages((data as unknown as ChatMessage[]) || []);

      // Load profiles for senders
      const userIds = [...new Set((data || []).map((m: any) => m.user_id))];
      if (userIds.length > 0) {
        const { data: profs } = await supabase.from("profiles").select("user_id, full_name, full_name_ar, avatar_url, level, email").in("user_id", userIds);
        const map: Record<string, UserProfile> = {};
        (profs || []).forEach((p: any) => { map[p.user_id] = p as UserProfile; });
        setProfiles(prev => ({ ...prev, ...map }));
      }

      // Update last_read_at
      if (user) {
        await supabase.from("chat_members" as any)
          .update({ last_read_at: new Date().toISOString() })
          .eq("channel_id", activeChannelId)
          .eq("user_id", user.id);
      }
    };
    loadMessages();

    // Realtime subscription
    const channel = supabase
      .channel(`majlis-channel-${activeChannelId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "chat_messages",
        filter: `channel_id=eq.${activeChannelId}`
      }, (payload) => {
        if (payload.eventType === "INSERT") {
          const newMsg = payload.new as unknown as ChatMessage;
          setMessages(prev => [...prev, newMsg]);
          if (!profiles[newMsg.user_id]) {
            supabase.from("profiles").select("user_id, full_name, full_name_ar, avatar_url, level, email")
              .eq("user_id", newMsg.user_id).maybeSingle()
              .then(({ data }) => {
                if (data) setProfiles(prev => ({ ...prev, [data.user_id]: data as unknown as UserProfile }));
              });
          }
        } else if (payload.eventType === "DELETE") {
          setMessages(prev => prev.filter(m => m.id !== (payload.old as any).id));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeChannelId]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // ─── Send message ───
  const sendMessage = async (contentType = "text", mediaPath?: string) => {
    if ((!input.trim() && contentType === "text" && !mediaPath) || !activeChannelId || !user) return;

    // Check announcement permission
    if (activeChannel?.type === "announcement" && !isAdmin && !isTeacher) {
      toast({ title: t("Only teachers and admins can post here", "فقط المعلمون والمشرفون يمكنهم النشر هنا"), variant: "destructive" });
      return;
    }

    let text = input.trim();
    if (replyTo) {
      const replyName = profiles[replyTo.user_id]?.full_name || "Student";
      text = `↩ ${replyName}: "${(replyTo.text || "").slice(0, 50)}"\n\n${text}`;
    }
    setInput("");
    setReplyTo(null);

    const { error } = await supabase.from("chat_messages").insert({
      class_level_id: activeChannelId,
      channel_id: activeChannelId,
      user_id: user.id,
      content_type: contentType,
      text: contentType === "text" ? text : (text || null),
      media_path: mediaPath || null,
    } as any);

    if (error) {
      toast({ title: t("Error sending message", "خطأ في إرسال الرسالة"), variant: "destructive" });
    } else {
      // Update last_message on channel
      await supabase.from("chat_channels" as any).update({
        last_message: contentType === "text" ? (text || "").slice(0, 100) : `📎 ${contentType}`,
        last_message_at: new Date().toISOString(),
      }).eq("id", activeChannelId);
    }
    inputRef.current?.focus();
  };

  const deleteMessage = async (msgId: string) => {
    await supabase.from("chat_messages").delete().eq("id", msgId);
    setMessages(prev => prev.filter(m => m.id !== msgId));
  };

  // ─── Voice recording ───
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach(t => t.stop());
        const path = `voice/${activeChannelId}/${user!.id}/${crypto.randomUUID()}.webm`;
        const { error } = await supabase.storage.from("subject-files").upload(path, blob);
        if (!error) await sendMessage("audio", path);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      toast({ title: t("Microphone access denied", "تم رفض الوصول للميكروفون"), variant: "destructive" });
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  // ─── File/Image upload ───
  const handleFileUpload = async (file: File, type: "image" | "file") => {
    const path = `${type}s/${activeChannelId}/${user!.id}/${crypto.randomUUID()}-${file.name}`;
    const { error } = await supabase.storage.from("subject-files").upload(path, file);
    if (!error) await sendMessage(type, path);
    else toast({ title: t("Upload failed", "فشل الرفع"), variant: "destructive" });
  };

  // ─── Channel actions ───
  const selectChannel = (channelId: string) => {
    setActiveChannelId(channelId);
    setMobileShowChat(true);
  };

  const handleNewChat = () => {
    setCreateMode("menu");
    setShowCreateDialog(true);
  };

  const handleChannelCreated = async (channelId: string) => {
    // Reload channels
    const { data } = await supabase.from("chat_channels" as any).select("*").eq("id", channelId).single();
    if (data) {
      setChannels(prev => {
        const exists = prev.find(c => c.id === channelId);
        if (exists) return prev;
        return [data as unknown as ChatChannel, ...prev];
      });
    }
    setActiveChannelId(channelId);
    setMobileShowChat(true);
  };

  const handleLeaveChannel = async () => {
    if (!activeChannelId || !user) return;
    await supabase.from("chat_members" as any).delete().eq("channel_id", activeChannelId).eq("user_id", user.id);
    setChannels(prev => prev.filter(c => c.id !== activeChannelId));
    setActiveChannelId(channels[0]?.id || null);
    setShowChannelInfo(false);
    toast({ title: t("Left the group", "غادرت المجموعة") });
  };

  const handleDeleteChannel = async () => {
    if (!activeChannelId) return;
    await supabase.from("chat_channels" as any).delete().eq("id", activeChannelId);
    setChannels(prev => prev.filter(c => c.id !== activeChannelId));
    setActiveChannelId(channels[0]?.id || null);
    setShowChannelInfo(false);
    toast({ title: t("Group deleted", "تم حذف المجموعة") });
  };

  const handleBrowseJoined = (channelId: string) => {
    handleChannelCreated(channelId);
    setShowBrowseChannels(false);
  };

  const formatTime = (dateStr: string) =>
    new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const getChannelDisplayName = (channel: ChatChannel) =>
    language === "ar" ? (channel.name_ar || channel.name || "") : (channel.name || "");

  const getLevelBadge = (level: string | null) => {
    switch (level) {
      case "beginner": return <span className="text-[10px]">🟢</span>;
      case "intermediate": return <span className="text-[10px]">🟡</span>;
      case "advanced": return <span className="text-[10px]">🔴</span>;
      default: return null;
    }
  };

  const getRoleBadge = (userId: string) => {
    // We can check from user_roles but for now use a simple approach
    if (userId === user?.id) {
      if (isAdmin) return <Badge className="text-[9px] px-1 py-0 bg-amber-500 text-white border-0 leading-tight">⚙️</Badge>;
      if (isTeacher) return <Badge className="text-[9px] px-1 py-0 bg-green-600 text-white border-0 leading-tight">👨‍🏫</Badge>;
    }
    return null;
  };

  const canSendInChannel = () => {
    if (!activeChannel) return false;
    if (activeChannel.type === "announcement") return isAdmin || isTeacher;
    return true;
  };

  // ─── Active Chat Pane ───
  const ActiveChatPane = () => {
    if (!activeChannelId || !activeChannel) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center" style={{ backgroundColor: "#F0ECE3" }}>
          <div className="text-center space-y-2 opacity-60">
            <MessageCircle className="h-16 w-16 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground text-lg" style={{ fontFamily: "'Playfair Display', serif" }}>
              {t("Select a chat to start messaging", "اختر محادثة لبدء المراسلة")}
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {/* Chat Header */}
        <div className="px-3 py-2.5 flex items-center gap-3 shadow-sm" style={{ backgroundColor: "#064E3B" }}>
          <button onClick={() => setMobileShowChat(false)} className="md:hidden text-white/80 hover:text-white p-1">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <Avatar className="h-10 w-10 shrink-0">
            <AvatarFallback className="text-sm font-bold" style={{ backgroundColor: "hsl(var(--accent))", color: "hsl(var(--accent-foreground))" }}>
              {activeChannel.type === "announcement" ? "📢" : getChannelDisplayName(activeChannel).charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <button className="flex-1 min-w-0 text-start" onClick={() => setShowChannelInfo(true)}>
            <h2 className="text-white font-semibold text-sm truncate" dir="auto">
              {getChannelDisplayName(activeChannel)}
            </h2>
            <p className="text-white/60 text-[11px]">
              {activeChannel.type === "direct"
                ? t("Online", "متصل")
                : `${activeChannel.member_count} ${t("members", "عضو")}`}
            </p>
          </button>
          {/* Admin quick actions in header */}
          {isAdmin && (
            <>
              <button
                onClick={() => setShowBroadcast(true)}
                className="text-white/80 hover:text-white p-1.5"
                title={t("Broadcast", "بث")}
              >
                <Megaphone className="h-5 w-5" />
              </button>
              <button
                onClick={() => setShowAdminDashboard(true)}
                className="text-white/80 hover:text-white p-1.5"
                title={t("Admin Dashboard", "لوحة المشرف")}
              >
                <BarChart3 className="h-5 w-5" />
              </button>
            </>
          )}
          <button
            onClick={() => setShowChannelInfo(true)}
            className="text-white/80 hover:text-white p-1.5"
          >
            <Info className="h-5 w-5" />
          </button>
        </div>

        {/* Messages Area */}
        <div
          className="flex-1 overflow-y-auto px-3 py-4"
          ref={scrollRef}
          style={{
            backgroundColor: "#FAFAF8",
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23064E3B' fill-opacity='0.03'%3E%3Cpath d='M30 0l30 30-30 30L0 30z'/%3E%3Ccircle cx='30' cy='30' r='8'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        >
          <div className="max-w-2xl mx-auto space-y-1">
            {messages.length === 0 && (
              <div className="text-center py-12">
                <p className="text-sm text-muted-foreground" dir="auto">
                  {t("No messages yet. Start the conversation!", "لا توجد رسائل بعد. ابدأ المحادثة!")}
                </p>
              </div>
            )}

            {messages.map((m, idx) => {
              const isMe = m.user_id === user?.id;
              const senderProfile = profiles[m.user_id];
              const name = senderProfile?.full_name || (isMe ? profile?.full_name : "Student");
              const prevMsg = messages[idx - 1];
              const showName = !isMe && (!prevMsg || prevMsg.user_id !== m.user_id);

              return (
                <div key={m.id} className={`flex group ${isMe ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`relative max-w-[80%] md:max-w-[65%] px-3 py-1.5 rounded-lg shadow-sm ${
                      isMe ? "rounded-tr-none" : "rounded-tl-none"
                    }`}
                    style={{
                      backgroundColor: (m as any).is_broadcast ? "#FFF8E1" : isMe ? "#DCF8C6" : "#FFFFFF",
                      marginTop: showName || (prevMsg && prevMsg.user_id !== m.user_id) ? "8px" : "2px",
                    }}
                    onContextMenu={(e) => {
                      if (isAdmin) {
                        e.preventDefault();
                        setContextMenu({ message: m, x: e.clientX, y: e.clientY });
                      }
                    }}
                  >
                    {/* Pinned indicator */}
                    {(m as any).is_pinned && (
                      <div className="text-[9px] text-amber-600 mb-0.5">📌 {t("Pinned", "مثبت")}</div>
                    )}

                    {/* Sender name + badges */}
                    {showName && (
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <button
                          className="text-[11px] font-semibold hover:underline"
                          style={{ color: "#064E3B" }}
                          dir="auto"
                          onClick={() => isAdmin && setProfileCardUserId(m.user_id)}
                        >
                          {name}
                        </button>
                        {getLevelBadge(senderProfile?.level || null)}
                        {getRoleBadge(m.user_id)}
                      </div>
                    )}

                    {/* Content */}
                    <div className="text-sm text-gray-900" dir="auto">
                      {(m as any).content_type === "deleted" ? (
                        <span className="italic text-muted-foreground text-xs">🚫 {t("This message was deleted", "تم حذف هذه الرسالة")}</span>
                      ) : m.content_type === "audio" && m.media_path ? (
                        <AudioMessage path={m.media_path} />
                      ) : m.content_type === "image" && m.media_path ? (
                        <ImageMessage path={m.media_path} />
                      ) : m.content_type === "file" && m.media_path ? (
                        <FileMessage path={m.media_path} text={m.text} />
                      ) : (
                        <span className="whitespace-pre-wrap break-words">{m.text}</span>
                      )}
                    </div>

                    {/* Edited indicator */}
                    {(m as any).edited_at && (
                      <span className="text-[9px] text-muted-foreground italic"> ✏️ {t("edited", "معدّل")}</span>
                    )}

                    {/* Time + Read receipts */}
                    <div className="flex items-center gap-1 mt-0.5 justify-end">
                      {(m as any).is_starred && <Star className="h-3 w-3 text-amber-400" />}
                      <span className="text-[10px] text-gray-500">{formatTime(m.created_at)}</span>
                      {isMe && <CheckCheck className="h-3.5 w-3.5" style={{ color: "#53BDEB" }} />}
                    </div>

                    {/* Hover actions */}
                    <div className={`absolute top-1 ${isMe ? "start-[-60px]" : "end-[-60px]"} opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5`}>
                      <button
                        onClick={() => { setReplyTo(m); inputRef.current?.focus(); }}
                        className="p-1 rounded-full bg-white shadow-md text-gray-500 hover:text-gray-700"
                      >
                        <Reply className="h-3.5 w-3.5" />
                      </button>
                      {(isMe || isAdmin) && (
                        <button
                          onClick={() => deleteMessage(m.id)}
                          className="p-1 rounded-full bg-white shadow-md text-gray-500 hover:text-red-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Reply indicator */}
        {replyTo && (
          <div className="px-4 py-2 flex items-center gap-2 border-t" style={{ backgroundColor: "#F0F2F5", borderColor: "hsl(var(--border))" }}>
            <div className="w-1 h-10 rounded-full" style={{ backgroundColor: "#064E3B" }} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold" style={{ color: "#064E3B" }}>
                {profiles[replyTo.user_id]?.full_name || "Student"}
              </p>
              <p className="text-xs text-muted-foreground truncate">{replyTo.text}</p>
            </div>
            <button onClick={() => setReplyTo(null)} className="text-muted-foreground hover:text-foreground p-1">✕</button>
          </div>
        )}

        {/* Recording indicator */}
        {isRecording && (
          <div className="px-4 py-2 flex items-center gap-3" style={{ backgroundColor: "#F0F2F5" }}>
            <div className="w-3 h-3 rounded-full bg-destructive animate-pulse" />
            <span className="text-sm text-destructive font-medium flex-1">
              {t("Recording... Tap mic to stop", "جاري التسجيل... اضغط على الميكروفون للإيقاف")}
            </span>
            <Button size="sm" variant="destructive" onClick={stopRecording} className="h-8">
              <MicOff className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Input Bar */}
        {canSendInChannel() ? (
          <div className="px-2 py-2 flex items-end gap-2" style={{ backgroundColor: "#F0F2F5" }}>
            <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0], "image"); }} />
            <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0], "file"); }} />

            <button className="p-2 text-gray-500 hover:text-gray-700 shrink-0"><Smile className="h-5 w-5" /></button>
            <button onClick={() => fileInputRef.current?.click()} className="p-2 text-gray-500 hover:text-gray-700 shrink-0"><Paperclip className="h-5 w-5" /></button>
            <button onClick={() => imageInputRef.current?.click()} className="p-2 text-gray-500 hover:text-gray-700 shrink-0 hidden sm:block"><Image className="h-5 w-5" /></button>

            <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="flex-1 flex items-center">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t("Type a message...", "اكتب رسالة...")}
                dir="auto"
                className="rounded-full border-0 bg-white shadow-sm h-10 px-4 text-sm focus-visible:ring-1"
              />
            </form>

            {input.trim() ? (
              <button onClick={() => sendMessage()} className="p-2.5 rounded-full shrink-0 text-white" style={{ backgroundColor: "#25D366" }}>
                <Send className="h-5 w-5" />
              </button>
            ) : (
              <button
                onClick={isRecording ? stopRecording : startRecording}
                className={`p-2.5 rounded-full shrink-0 text-white ${isRecording ? "animate-pulse" : ""}`}
                style={{ backgroundColor: isRecording ? "#EF4444" : "#25D366" }}
              >
                {isRecording ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </button>
            )}
          </div>
        ) : (
          <div className="px-4 py-3 text-center text-sm text-muted-foreground" style={{ backgroundColor: "#F0F2F5" }}>
            {t("Only teachers and admins can post in this channel", "فقط المعلمون والمشرفون يمكنهم النشر في هذه القناة")}
          </div>
        )}
      </div>
    );
  };

  // ─── Main Layout ───
  return (
    <>
      <div className="flex h-[calc(100vh-3.5rem)] md:h-[calc(100vh-0px)] overflow-hidden">
        {/* Sidebar */}
        <div
          className={`${mobileShowChat ? "hidden md:flex" : "flex"} w-full md:w-80 lg:w-96 flex-col border-e`}
          style={{ borderColor: "hsl(var(--border))" }}
        >
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

        {/* Chat area */}
        <div className={`${mobileShowChat ? "flex" : "hidden md:flex"} flex-1 flex-col min-w-0`}>
          <ActiveChatPane />
        </div>
      </div>

      {/* Dialogs */}
      <CreateChannelDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        mode={createMode}
        onCreated={handleChannelCreated}
      />

      <ChannelInfoPanel
        open={showChannelInfo}
        onOpenChange={setShowChannelInfo}
        channel={activeChannel}
        onLeave={handleLeaveChannel}
        onDelete={handleDeleteChannel}
      />

      <BrowseChannelsDialog
        open={showBrowseChannels}
        onOpenChange={setShowBrowseChannels}
        myChannelIds={channels.map(c => c.id)}
        onJoined={handleBrowseJoined}
      />

      {/* Admin Components */}
      {isAdmin && contextMenu && (
        <AdminMessageMenu
          message={contextMenu.message}
          senderProfile={profiles[contextMenu.message.user_id] || null}
          isMe={contextMenu.message.user_id === user?.id}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={() => setContextMenu(null)}
          onReply={() => { setReplyTo(contextMenu.message); inputRef.current?.focus(); }}
          onDelete={(msgId) => setMessages(prev => prev.filter(m => m.id !== msgId))}
          onEditComplete={(msgId, newText) => setMessages(prev => prev.map(m => m.id === msgId ? { ...m, text: newText } : m))}
          onViewProfile={(userId) => setProfileCardUserId(userId)}
        />
      )}

      {isAdmin && (
        <>
          <AdminBroadcastDialog open={showBroadcast} onOpenChange={setShowBroadcast} />
          <AdminDashboardPanel open={showAdminDashboard} onClose={() => setShowAdminDashboard(false)} />
          <AdminProfileCard
            userId={profileCardUserId || ""}
            open={!!profileCardUserId}
            onClose={() => setProfileCardUserId(null)}
            onStartDM={(uid) => {
              // Trigger DM creation via CreateChannelDialog approach
              setCreateMode("dm");
              setShowCreateDialog(true);
            }}
          />
        </>
      )}
    </>
  );
};

// ─── Media Sub-components ───

const AudioMessage = ({ path }: { path: string }) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    supabase.storage.from("subject-files").createSignedUrl(path, 3600).then(({ data }) => {
      if (data?.signedUrl) setUrl(data.signedUrl);
    });
  }, [path]);
  if (!url) return <span className="text-xs opacity-70">Loading audio...</span>;
  return (
    <div className="flex items-center gap-2 min-w-[180px]">
      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: "#25D366" }}>
        <Mic className="h-4 w-4 text-white" />
      </div>
      <audio controls src={url} className="h-8 flex-1" style={{ maxWidth: "200px" }} />
    </div>
  );
};

const ImageMessage = ({ path }: { path: string }) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    supabase.storage.from("subject-files").createSignedUrl(path, 3600).then(({ data }) => {
      if (data?.signedUrl) setUrl(data.signedUrl);
    });
  }, [path]);
  return url
    ? <img src={url} className="max-w-[240px] max-h-[240px] rounded-lg" alt="" loading="lazy" />
    : <span className="text-xs opacity-70">Loading image...</span>;
};

const FileMessage = ({ path, text }: { path: string; text: string | null }) => {
  const fileName = path.split("/").pop() || "File";
  const openFile = async () => {
    const { data } = await supabase.storage.from("subject-files").createSignedUrl(path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };
  return (
    <button onClick={openFile} className="flex items-center gap-2 hover:underline py-1">
      <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
        <FileText className="h-4 w-4 text-foreground" />
      </div>
      <span className="text-xs font-medium">{text || fileName}</span>
    </button>
  );
};

export default Majlis;
