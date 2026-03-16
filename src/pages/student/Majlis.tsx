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
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [showChannelInfo, setShowChannelInfo] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = hasRole("admin");
  const isTeacher = hasRole("teacher");
  const activeChannel = channels.find(c => c.id === activeChannelId) || null;
  const isAnnouncement = activeChannel?.type === "announcement";
  const canPost = !isAnnouncement || isAdmin || isTeacher;

  [cite_start]// Load Channels & Auto-join logic[span_11](end_span)
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

  [span_12](start_span)// Real-time message listener[span_12](end_span)
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

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-[#efe7de] dark:bg-background" dir={dir}>
      [span_13](start_span)[span_14](start_span){/* Sidebar[span_13](end_span)[span_14](end_span) */}
      <div className={`${mobileShowChat ? 'hidden' : 'flex'} md:flex w-full md:w-96 border-r flex-col shrink-0 bg-white dark:bg-muted/10`}>
        <MajlisSidebar
          channels={channels}
          activeChannelId={activeChannelId}
          onSelectChannel={(id) => { setActiveChannelId(id); setMobileShowChat(true); }}
          onShowCreate={() => setShowCreateDialog(true)}
          onShowBrowse={() => setShowBrowseChannels(true)}
        />
      </div>

      {/* Main Chat Area */}
      <div className={`${mobileShowChat ? 'flex' : 'hidden'} md:flex flex-1 flex-col relative`}>
        {activeChannel ? (
          <>
            {/* Header: WhatsApp Style */}
            <div className="h-16 border-b flex items-center justify-between px-4 bg-[#f0f2f5] dark:bg-muted/20 shrink-0">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileShowChat(false)}><ArrowLeft /></Button>
                <Avatar className="h-10 w-10">
                  <AvatarFallback>{activeChannel.name.charAt(0)}</AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-bold text-sm">{activeChannel.name}</h3>
                  <p className="text-[10px] text-muted-foreground">
                    {isAnnouncement ? t("Only admins can post", "المسؤولون فقط يمكنهم النشر") : t("online", "متصل")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={() => setShowChannelInfo(true)}><Info className="h-5 w-5" /></Button>
              </div>
            </div>

            [span_15](start_span){/* Messages Area[span_15](end_span) */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2 bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat">
              {messages.map((msg) => {
                const isMe = msg.user_id === user?.id;
                return (
                  <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`relative max-w-[75%] px-3 py-1.5 rounded-lg shadow-sm ${
                      isMe ? 'bg-[#d9fdd3] dark:bg-primary/20 rounded-tr-none' : 'bg-white dark:bg-muted rounded-tl-none'
                    }`}>
                      {!isMe && <p className="text-[11px] font-bold text-primary mb-0.5">{profiles[msg.user_id]?.full_name}</p>}
                      <p className="text-sm whitespace-pre-wrap pr-10">{msg.content}</p>
                      <div className="flex items-center gap-1 absolute bottom-1 right-2">
                         <span className="text-[9px] text-muted-foreground">
                           {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                         </span>
                         {isMe && <CheckCheck className="h-3 w-3 text-blue-500" />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            [span_16](start_span)[span_17](start_span){/* Input Area[span_16](end_span)[span_17](end_span) */}
            <div className="p-3 bg-[#f0f2f5] dark:bg-muted/20">
              {canPost ? (
                <div className="flex items-center gap-2 max-w-5xl mx-auto">
                   <Button variant="ghost" size="icon" className="shrink-0"><Smile className="text-muted-foreground" /></Button>
                   <Button variant="ghost" size="icon" className="shrink-0" onClick={() => imageInputRef.current?.click()}><Paperclip className="text-muted-foreground" /></Button>
                   <Input 
                     value={input} 
                     onChange={(e) => setInput(e.target.value)} 
                     placeholder={t("Type a message", "اكتب رسالة")}
                     className="bg-white dark:bg-background rounded-full border-none h-10 shadow-sm"
                     onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                   />
                   <Button onClick={sendMessage} className="rounded-full h-10 w-10 p-0 shrink-0 bg-primary hover:bg-primary/90">
                     <Send className="h-5 w-5 text-white" />
                   </Button>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 py-2 text-muted-foreground text-sm bg-white/50 rounded-lg">
                  <Lock className="h-4 w-4" />
                  <span>{t("Only admins can send messages", "فقط المسؤولون يمكنهم إرسال رسائل")}</span>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center opacity-40">
            <MessageCircle className="h-20 w-20 mb-4" />
            <p>{t("Select a chat to start", "اختر محادثة للبدء")}</p>
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
