"use client";

import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Send, MessageCircle, ArrowLeft, Info } from "lucide-react";

import MajlisSidebar from "@/components/majlis/MajlisSidebar";
import CreateChannelDialog from "@/components/majlis/CreateChannelDialog";
import BrowseChannelsDialog from "@/components/majlis/BrowseChannelsDialog";
import type { ChatChannel, ChatMessage, UserProfile } from "@/components/majlis/types";

const MasterMajlisChat = () => {
  const { t, dir } = useLanguage();
  const { user, profile, hasRole } = useAuth();

  // --- States ---
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [input, setInput] = useState("");
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showBrowseChannels, setShowBrowseChannels] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = hasRole?.("admin") ?? false;
  const isTeacher = hasRole?.("teacher") ?? false;
  const activeChannel = channels.find(c => c.id === activeChannelId) ?? null;

  // --- Loading state ---
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(true);

  // --- Load Channels ---
  useEffect(() => {
    if (!user) return;

    const fetchChannels = async () => {
      setLoadingChannels(true);
      try {
        const { data: memberData } = await supabase.from("chat_members").select("channel_id").eq("user_id", user.id);
        const memberIds = (memberData ?? []).map(m => m.channel_id);

        const { data: publicChannels } = await supabase.from("chat_channels").select("*").eq("is_private", false);
        const { data: memberChannels } = memberIds.length > 0
          ? await supabase.from("chat_channels").select("*").in("id", memberIds)
          : { data: [] };

        const allChannels = [...(memberChannels ?? []), ...(publicChannels ?? [])];
        const unique = Array.from(new Map(allChannels.map((c: any) => [c.id, c])).values());
        setChannels(unique as ChatChannel[]);
        if (!activeChannelId && unique.length > 0) setActiveChannelId(unique[0].id);
      } catch (err) {
        console.error("Error loading channels:", err);
      } finally {
        setLoadingChannels(false);
      }
    };

    fetchChannels();
  }, [user]);

  // --- Load Messages ---
  useEffect(() => {
    if (!activeChannelId) return;

    const fetchMessages = async () => {
      setLoadingMessages(true);
      try {
        const { data } = await supabase.from("chat_messages")
          .select("*")
          .eq("channel_id", activeChannelId)
          .order("created_at", { ascending: true });
        setMessages(data ?? []);

        // Load profiles of message senders
        const userIds = [...new Set((data ?? []).map(m => m.user_id))];
        if (userIds.length > 0) {
          const { data: profs } = await supabase.from("profiles")
            .select("user_id, full_name, avatar_url")
            .in("user_id", userIds);
          const map: Record<string, UserProfile> = {};
          (profs ?? []).forEach(p => { map[p.user_id] = p; });
          setProfiles(prev => ({ ...prev, ...map }));
        }
      } catch (err) {
        console.error("Error loading messages:", err);
      } finally {
        setLoadingMessages(false);
      }
    };

    fetchMessages();
  }, [activeChannelId]);

  // --- Auto Scroll ---
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // --- Send Message ---
  const sendMessage = async () => {
    if (!input.trim() || !activeChannelId || !user) return;

    if (activeChannel?.type === "announcement" && !isAdmin && !isTeacher) {
      return;
    }

    try {
      await supabase.from("chat_messages").insert({
        channel_id: activeChannelId,
        user_id: user.id,
        content: input,
        content_type: "text"
      });
      setInput("");
    } catch (err) {
      console.error("Error sending message:", err);
    }
  };

  // --- Handle File Upload ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const filePath = `${user.id}/${Date.now()}-${file.name}`;
    try {
      const { error } = await supabase.storage.from("chat_attachments").upload(filePath, file);
      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage.from("chat_attachments").getPublicUrl(filePath);
      await supabase.from("chat_messages").insert({
        channel_id: activeChannelId,
        user_id: user.id,
        content: publicUrl,
        content_type: "image"
      });
    } catch (err) {
      console.error("Upload failed:", err);
    }
  };

  // --- Render ---
  if (!user) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)]">
        Loading user...
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-64px)] bg-background" dir={dir}>
      {/* Sidebar */}
      <div className={`${mobileShowChat ? "hidden" : "flex"} md:flex w-80 border-r`}>
        {loadingChannels ? <div className="p-4">Loading channels...</div> :
          <MajlisSidebar
            channels={channels}
            activeChannelId={activeChannelId}
            onSelectChannel={(id) => { setActiveChannelId(id); setMobileShowChat(true); }}
            onShowCreate={() => setShowCreateDialog(true)}
            onShowBrowse={() => setShowBrowseChannels(true)}
          />
        }
      </div>

      {/* Chat */}
      <div className={`${mobileShowChat ? "flex" : "hidden"} md:flex flex-1 flex-col`}>
        {!activeChannel ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
            <MessageCircle className="h-16 w-16 opacity-20" />
            <p>Select a channel to start chatting</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="h-16 border-b flex items-center justify-between px-4">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileShowChat(false)}>
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <h3 className="font-bold">{activeChannel.name}</h3>
                <Badge variant="outline">{activeChannel.type}</Badge>
              </div>
              <Button variant="ghost" size="icon"><Info className="h-5 w-5" /></Button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
              {loadingMessages ? (
                <p className="text-center text-sm text-muted-foreground">Loading messages...</p>
              ) : messages.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground">No messages yet</p>
              ) : (
                messages.map(msg => {
                  const isMe = msg.user_id === user.id;
                  return (
                    <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] flex gap-2 ${isMe ? "flex-row-reverse" : ""}`}>
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarImage src={profiles[msg.user_id]?.avatar_url} />
                          <AvatarFallback>{profiles[msg.user_id]?.full_name?.charAt(0) || "?"}</AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                          <span className="text-[10px] text-muted-foreground">{profiles[msg.user_id]?.full_name}</span>
                          <div className={`rounded-2xl px-4 py-2 ${isMe ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                            {msg.content}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Input */}
            <div className="p-4 border-t flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => imageInputRef.current?.click()}>
                <Send className="h-5 w-5" />
              </Button>
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type a message..."
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              />
              <Button onClick={sendMessage} disabled={!input.trim()}>
                <Send className="h-5 w-5" />
              </Button>
            </div>
          </>
        )}
      </div>

      <input type="file" ref={imageInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
      <CreateChannelDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} />
      <BrowseChannelsDialog open={showBrowseChannels} onOpenChange={setShowBrowseChannels} />
    </div>
  );
};

export default MasterMajlisChat;
