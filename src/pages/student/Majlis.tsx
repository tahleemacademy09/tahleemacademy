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
  Image, Paperclip, Smile, ArrowLeft, FileText, Trash2, Info, X
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

  const sendMessage = async (contentType = "text", mediaPath?: string) => {
    if (!user || !activeChannelId) return;
    if (contentType === "text" && !input.trim() && !mediaPath) return;

    if (activeChannel?.type === "announcement" && !isAdmin && !isTeacher) {
      toast({
        title: t("Restricted", "غير مسموح"),
        description: t("Only teachers and admins can post here.", "فقط المعلمون والمسؤولون يمكنهم النشر هنا."),
        variant: "destructive",
      });
      return;
    }

    const { error } = await supabase.from("chat_messages").insert({
      channel_id: activeChannelId,
      user_id: user.id,
      content: contentType === "text" ? input : (mediaPath || ""),
      content_type: contentType,
      reply_to: replyTo?.id || null
    });

    if (error) {
      toast({ title: t("Error", "خطأ"), description: error.message, variant: "destructive" });
    } else {
      setInput("");
      setReplyTo(null);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: "image" | "file") => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const fileExt = file.name.split('.').pop();
    const filePath = `${user.id}/${Math.random()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('chat_attachments')
      .upload(filePath, file);

    if (uploadError) {
      toast({ title: t("Upload Failed", "فشل الرفع"), variant: "destructive" });
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from('chat_attachments').getPublicUrl(filePath);
    await sendMessage(type, publicUrl);
  };

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-background" dir={dir}>
      <div className={`${mobileShowChat ? 'hidden' : 'flex'} md:flex w-full md:w-80 border-r flex-col shrink-0`}>
        <MajlisSidebar
          channels={channels}
          activeChannelId={activeChannelId}
          onSelectChannel={(id) => { setActiveChannelId(id); setMobileShowChat(true); }}
          unreadCounts={unreadCounts}
          onShowCreate={() => setShowCreateDialog(true)}
          onShowBrowse={() => setShowBrowseChannels(true)}
        />
      </div>

      <div className={`${mobileShowChat ? 'flex' : 'hidden'} md:flex flex-1 flex-col relative min-w-0`}>
        {!activeChannel ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
            <MessageCircle className="h-16 w-16 opacity-20 mb-4" />
            <h3 className="text-xl font-semibold mb-2">{t("Al-Majlis Chat", "مجلس الحوار")}</h3>
            <p className="max-w-xs">{t("Select a channel to start communicating with your peers.", "اختر قناة لبدء التواصل مع زملائك.")}</p>
          </div>
        ) : (
          <>
            <div className="h-16 border-b flex items-center justify-between px-4 shrink-0 bg-background/95 backdrop-blur">
              <div className="flex items-center gap-3 overflow-hidden">
                <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileShowChat(false)}>
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div className="truncate">
                  <h3 className="font-bold truncate">{activeChannel.name}</h3>
                  <Badge variant="outline" className="text-[10px] py-0">{activeChannel.type}</Badge>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => activeChannel.type === 'group' ? setShowGroupInfo(true) : setShowChannelInfo(true)}>
                <Info className="h-5 w-5" />
              </Button>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.user_id === user?.id ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] flex gap-2 ${msg.user_id === user?.id ? 'flex-row-reverse' : 'flex-row'}`}>
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarImage src={profiles[msg.user_id]?.avatar_url} />
                      <AvatarFallback>{profiles[msg.user_id]?.full_name?.charAt(0) || "?"}</AvatarFallback>
                    </Avatar>
                    <div className={`flex flex-col ${msg.user_id === user?.id ? 'items-end' : 'items-start'}`}>
                      <span className="text-[10px] text-muted-foreground mb-1">{profiles[msg.user_id]?.full_name}</span>
                      <div className={`rounded-2xl px-4 py-2 ${msg.user_id === user?.id ? 'bg-primary text-primary-foreground rounded-tr-none' : 'bg-muted rounded-tl-none'}`}>
                        {msg.content_type === 'image' ? <img src={msg.content} className="max-w-full rounded-lg" alt="" /> : <p className="text-sm whitespace-pre-wrap">{msg.content}</p>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 border-t bg-background">
              {replyTo && (
                <div className="mb-2 p-2 bg-muted rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs truncate">
                    <Reply className="h-3 w-3" />
                    <span>{t("Replying to", "الرد على")}: {replyTo.content}</span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setReplyTo(null)}><X className="h-3 w-3" /></Button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="shrink-0" onClick={() => imageInputRef.current?.click()}>
                  <Image className="h-5 w-5" />
                </Button>
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={t("Type a message...", "اكتب رسالة...")}
                  onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                  className="rounded-full"
                />
                <Button size="icon" className="rounded-full shrink-0" onClick={() => sendMessage()} disabled={!input.trim()}>
                  <Send className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      <input type="file" ref={imageInputRef} className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'image')} />
      <CreateChannelDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} />
      <BrowseChannelsDialog open={showBrowseChannels} onOpenChange={setShowBrowseChannels} />
    </div>
  );
};

export default Majlis;
