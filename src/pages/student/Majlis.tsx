import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Send, MessageCircle, CheckCheck, Smile, ArrowLeft, Paperclip, Info, Lock
} from "lucide-react";
import MajlisSidebar from "@/components/majlis/MajlisSidebar";
import CreateChannelDialog from "@/components/majlis/CreateChannelDialog";
import BrowseChannelsDialog from "@/components/majlis/BrowseChannelsDialog";
import type { ChatChannel, ChatMessage, UserProfile } from "@/components/majlis/types";

const Majlis = () => {
  const { t, dir } = useLanguage();
  const { user, hasRole } = useAuth();

  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [input, setInput] = useState("");
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showBrowseChannels, setShowBrowseChannels] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const isAdmin = hasRole("admin");
  const isTeacher = hasRole("teacher");
  
  const activeChannel = channels?.find(c => c.id === activeChannelId) || null;
  const isAnnouncement = activeChannel?.type === "announcement";
  const canPost = !isAnnouncement || isAdmin || isTeacher;

  // 1. Fetch Channels safely
  useEffect(() => {
    if (!user) return;
    const fetchChannels = async () => {
      try {
        const { data: memberData } = await supabase.from("chat_members" as any).select("channel_id").eq("user_id", user.id);
        const { data: publicChannels } = await supabase.from("chat_channels" as any).select("*").eq("is_private", false);
        
        const channelIds = memberData?.map((m: any) => m.channel_id) || [];
        const { data: memberChannels } = channelIds.length > 0 
          ? await supabase.from("chat_channels" as any).select("*").in("id", channelIds) 
          : { data: [] };

        const combined = [...(memberChannels || []), ...(publicChannels || [])];
        const unique = Array.from(new Map(combined.map((c: any) => [c.id, c])).values()) as unknown as ChatChannel[];
        
        setChannels(unique);
        if (!activeChannelId && unique.length > 0) setActiveChannelId(unique[0].id);
      } catch (err) {
        console.error("Error fetching channels:", err);
      }
    };
    fetchChannels();
  }, [user]);

  // 2. Fetch Messages & Real-time
  useEffect(() => {
    if (!activeChannelId) return;
    
    const fetchMessages = async () => {
      const { data } = await supabase.from("chat_messages").select("*").eq("channel_id", activeChannelId).order("created_at", { ascending: true });
      if (data) setMessages(data as unknown as ChatMessage[]);
    };
    fetchMessages();

    const channel = supabase.channel(`room-${activeChannelId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `channel_id=eq.${activeChannelId}` }, 
      (payload) => {
        setMessages(prev => [...prev, payload.new as ChatMessage]);
      }).subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeChannelId]);

  // Auto scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !activeChannelId || !user) return;
    const { error } = await supabase.from("chat_messages").insert({
      channel_id: activeChannelId,
      user_id: user.id,
      content: input,
      content_type: "text"
    });
    if (!error) setInput("");
  };

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-[#efe7de] dark:bg-background" dir={dir}>
      {/* Sidebar - Visible on Desktop, hidden on Mobile if chat is open */}
      <div className={`${mobileShowChat ? 'hidden' : 'flex'} md:flex w-full md:w-80 border-r flex-col bg-white dark:bg-card`}>
        <MajlisSidebar
          channels={channels}
          activeChannelId={activeChannelId}
          onSelectChannel={(id) => { setActiveChannelId(id); setMobileShowChat(true); }}
          onShowCreate={() => setShowCreateDialog(true)}
          onShowBrowse={() => setShowBrowseChannels(true)}
        />
      </div>

      {/* Chat Window */}
      <div className={`${mobileShowChat ? 'flex' : 'hidden'} md:flex flex-1 flex-col relative`}>
        {activeChannel ? (
          <>
            {/* Header */}
            <div className="h-14 flex items-center justify-between px-4 bg-[#f0f2f5] dark:bg-muted/50 border-b">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileShowChat(false)}><ArrowLeft /></Button>
                <Avatar className="h-9 w-9">
                  <AvatarFallback>{activeChannel?.name?.charAt(0)}</AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-bold text-sm">{activeChannel?.name}</h3>
                  <p className="text-[10px] opacity-60">{isAnnouncement ? "Official Updates" : "WhatsApp Group"}</p>
                </div>
              </div>
              <Button variant="ghost" size="icon"><Info className="h-5 w-5" /></Button>
            </div>

            {/* Messages - WhatsApp Background Image */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2 bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')]">
              {messages.map((msg) => {
                const isMe = msg.user_id === user?.id;
                return (
                  <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`relative max-w-[80%] px-3 py-1.5 rounded-lg shadow-sm border ${
                      isMe ? 'bg-[#d9fdd3] border-[#c6e9bc] rounded-tr-none' : 'bg-white border-none rounded-tl-none'
                    }`}>
                      <p className="text-sm text-black dark:text-black leading-relaxed pr-10">{msg.content}</p>
                      <div className="flex items-center gap-1 absolute bottom-1 right-2">
                        <span className="text-[9px] opacity-50">{new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                        {isMe && <CheckCheck className="h-3 w-3 text-blue-500" />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Input */}
            <div className="p-3 bg-[#f0f2f5] dark:bg-muted/50">
              {canPost ? (
                <div className="flex items-center gap-2 max-w-4xl mx-auto">
                  <Smile className="text-muted-foreground h-6 w-6 cursor-pointer" />
                  <Paperclip className="text-muted-foreground h-5 w-5 cursor-pointer" />
                  <Input 
                    value={input} 
                    onChange={(e) => setInput(e.target.value)} 
                    placeholder="Type a message" 
                    className="bg-white border-none rounded-full h-10 px-4"
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  />
                  <Button onClick={handleSend} className="rounded-full bg-[#00a884] hover:bg-[#008f72] h-10 w-10 p-0">
                    <Send className="h-5 w-5 text-white" />
                  </Button>
                </div>
              ) : (
                <div className="text-center py-2 bg-white/50 rounded-lg text-xs text-muted-foreground flex items-center justify-center gap-2">
                  <Lock className="h-3 w-3" /> Only admins can send messages
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
            <MessageCircle className="h-12 w-12 opacity-10 mb-2" />
            <p className="text-sm">Select a chat to begin</p>
          </div>
        )}
      </div>

      <CreateChannelDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} />
      <BrowseChannelsDialog open={showBrowseChannels} onOpenChange={setShowBrowseChannels} />
    </div>
  );
};

export default Majlis;
