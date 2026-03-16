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
  Image, Paperclip, Smile, ArrowLeft, FileText, Trash2, Info, X, Lock
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
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showBrowseChannels, setShowBrowseChannels] = useState(false);
  const [showChannelInfo, setShowChannelInfo] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = hasRole("admin");
  const isTeacher = hasRole("teacher");
  const activeChannel = channels.find(c => c.id === activeChannelId) || null;
  const isAnnouncement = activeChannel?.type === "announcement";
  const canPost = !isAnnouncement || isAdmin || isTeacher;

  // 1. Load Channels
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
      if (!activeChannelId && unique.length > 0) setActiveChannelId(unique[0].id);
    };
    loadChannels();
  }, [user]);

  // 2. Real-time Messages
  useEffect(() => {
    if (!activeChannelId) return;
    const loadMessages = async () => {
      const { data } = await supabase.from("chat_messages").select("*").eq("channel_id", activeChannelId).order("created_at", { ascending: true });
      setMessages((data as unknown as ChatMessage[]) || []);
    };
    loadMessages();

    const channel = supabase.channel(`whatsapp-${activeChannelId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `channel_id=eq.${activeChannelId}` }, 
      (payload) => {
        setMessages(prev => [...prev, payload.new as ChatMessage]);
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeChannelId]);

  // Scroll to bottom
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || !user || !activeChannelId || !canPost) return;
    
    const { error } = await supabase.from("chat_messages").insert({
      channel_id: activeChannelId,
      user_id: user.id,
      content: input,
      content_type: "text",
      reply_to: replyTo?.id || null
    });

    if (!error) {
      setInput("");
      setReplyTo(null);
    }
  };

  // THE RETURN BLOCK - This is what was missing!
  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-[#efe7de] dark:bg-background" dir={dir}>
      {/* Sidebar */}
      <div className={`${mobileShowChat ? 'hidden' : 'flex'} md:flex w-full md:w-96 border-r flex-col shrink-0 bg-white dark:bg-muted/10 shadow-xl z-20`}>
        <MajlisSidebar
          channels={channels}
          activeChannelId={activeChannelId}
          onSelectChannel={(id) => { setActiveChannelId(id); setMobileShowChat(true); }}
          onShowCreate={() => setShowCreateDialog(true)}
          onShowBrowse={() => setShowBrowseChannels(true)}
        />
      </div>

      {/* Main Chat Area */}
      <div className={`${mobileShowChat ? 'flex' : 'hidden'} md:flex flex-1 flex-col relative min-w-0`}>
        {activeChannel ? (
          <>
            {/* Header */}
            <div className="h-16 border-b flex items-center justify-between px-4 bg-[#f0f2f5] dark:bg-muted/40 shrink-0 z-10">
              <div className="flex items-center gap-3 min-w-0">
                <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileShowChat(false)}><ArrowLeft /></Button>
                <Avatar className="h-10 w-10 shrink-0 shadow-sm border border-white/50">
                  <AvatarFallback className="bg-primary/10 text-primary">{activeChannel.name.charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="truncate">
                  <h3 className="font-bold text-sm truncate">{activeChannel.name}</h3>
                  <p className="text-[10px] text-muted-foreground">
                    {isAnnouncement ? t("Admin Updates", "تحديثات الإدارة") : t("online", "متصل")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={() => setShowChannelInfo(true)}><Info className="h-5 w-5 text-muted-foreground" /></Button>
              </div>
            </div>

            {/* WhatsApp Background & Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat">
              {messages.map((msg) => {
                const isMe = msg.user_id === user?.id;
                return (
                  <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                    <div className={`relative max-w-[85%] sm:max-w-[70%] px-3 py-1.5 rounded-lg shadow-sm border ${
                      isMe ? 'bg-[#d9fdd3] dark:bg-primary/20 border-[#c6e9bc] dark:border-primary/30 rounded-tr-none' : 'bg-white dark:bg-muted border-white/20 rounded-tl-none'
                    }`}>
                      {!isMe && <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 mb-0.5">{profiles[msg.user_id]?.full_name || t("Member", "عضو")}</p>}
                      <p className="text-[14px] leading-relaxed whitespace-pre-wrap pb-2 pr-12">{msg.content}</p>
                      <div className="flex items-center gap-1 absolute bottom-1 right-2">
                         <span className="text-[9px] text-muted-foreground/80 font-medium">
                           {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                         </span>
                         {isMe && <CheckCheck className="h-3 w-3 text-blue-500" />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Input Container */}
            <div className="p-3 bg-[#f0f2f5] dark:bg-muted/40 border-t">
              {canPost ? (
                <div className="flex items-center gap-2 max-w-5xl mx-auto">
                   <Button variant="ghost" size="icon" className="shrink-0 rounded-full hover:bg-white/50"><Smile className="text-muted-foreground h-6 w-6" /></Button>
                   <Button variant="ghost" size="icon" className="shrink-0 rounded-full hover:bg-white/50" onClick={() => imageInputRef.current?.click()}><Paperclip className="text-muted-foreground h-5 w-5" /></Button>
                   <Input 
                     value={input} 
                     onChange={(e) => setInput(e.target.value)} 
                     placeholder={t("Type a message", "اكتب رسالة")}
                     className="bg-white dark:bg-background rounded-full border-none h-11 shadow-sm px-5"
                     onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                   />
                   <Button onClick={sendMessage} className="rounded-full h-11 w-11 p-0 shrink-0 bg-[#00a884] hover:bg-[#008f72] shadow-md transition-transform active:scale-95">
                     <Send className="h-5 w-5 text-white" />
                   </Button>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 py-3 text-muted-foreground text-sm bg-white/40 backdrop-blur-sm rounded-xl border border-dashed border-muted-foreground/20">
                  <Lock className="h-4 w-4" />
                  <span className="font-medium">{t("Only admins can send messages", "فقط المسؤولون يمكنهم إرسال رسائل")}</span>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-[#f0f2f5] dark:bg-muted/10">
            <div className="h-24 w-24 bg-primary/5 rounded-full flex items-center justify-center mb-6">
              <MessageCircle className="h-12 w-12 text-primary opacity-20" />
            </div>
            <h2 className="text-xl font-semibold text-muted-foreground/60">{t("Al-Majlis Chat", "مجلس الحوار")}</h2>
            <p className="text-sm text-muted-foreground/40 mt-2">{t("Select a contact to start messaging", "اختر جهة اتصال لبدء المراسلة")}</p>
          </div>
        )}
      </div>

      <input type="file" ref={imageInputRef} className="hidden" accept="image/*" />
      <CreateChannelDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} />
      <BrowseChannelsDialog open={showBrowseChannels} onOpenChange={setShowBrowseChannels} />
    </div>
  );
};

export default Majlis;
