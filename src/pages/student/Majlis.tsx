"use client";

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
import BrowseChannelsDialog from "@/components/majlis/BrowseChannelsDialog";
import type { ChatChannel, ChatMessage, UserProfile } from "@/components/majlis/types";

const MajlisEnhanced = () => {
  const { t, dir } = useLanguage();
  const { user, profile, hasRole } = useAuth();
  const { toast } = useToast();

  // --- States ---
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [input, setInput] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showBrowseChannels, setShowBrowseChannels] = useState(false);
  const [reactions, setReactions] = useState<Record<string, Record<string, string[]>>>({});
  const [isRecording, setIsRecording] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = hasRole("admin");
  const isTeacher = hasRole("teacher");
  const activeChannel = channels.find(c => c.id === activeChannelId);

  // --- Load Channels ---
  useEffect(() => {
    if (!user) return;
    const loadChannels = async () => {
      const { data: memberData } = await supabase.from("chat_members" as any)
        .select("channel_id")
        .eq("user_id", user.id);
      const memberIds = (memberData || []).map(m => m.channel_id);
      const { data: publicChannels } = await supabase.from("chat_channels").select("*").eq("is_private", false);
      const { data: memberChannels } = memberIds.length > 0 
        ? await supabase.from("chat_channels").select("*").in("id", memberIds) 
        : { data: [] };
      const all = [...(memberChannels || []), ...(publicChannels || [])];
      const unique = Array.from(new Map(all.map(c => [c.id, c])).values());
      setChannels(unique as ChatChannel[]);
      if (!activeChannelId && unique.length) setActiveChannelId(unique[0].id);
    };
    loadChannels();
  }, [user]);

  // --- Load Messages & Profiles ---
  useEffect(() => {
    if (!activeChannelId) return;

    const loadMessages = async () => {
      const { data } = await supabase.from("chat_messages")
        .select("*")
        .eq("channel_id", activeChannelId)
        .order("created_at", { ascending: true });
      setMessages(data || []);

      // Load user profiles
      const userIds = [...new Set((data || []).map(m => m.user_id))];
      if (userIds.length) {
        const { data: profs } = await supabase.from("profiles")
          .select("user_id, full_name, avatar_url")
          .in("user_id", userIds);
        const map: Record<string, UserProfile> = {};
        (profs || []).forEach(p => { map[p.user_id] = p; });
        setProfiles(prev => ({ ...prev, ...map }));
      }
    };

    loadMessages();

    const channel = supabase.channel(`majlis-channel-${activeChannelId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages", filter: `channel_id=eq.${activeChannelId}` }, (payload) => {
        if (payload.eventType === "INSERT") {
          const newMsg = payload.new as ChatMessage;
          setMessages(prev => [...prev, newMsg]);
        }
        if (payload.eventType === "DELETE") {
          setMessages(prev => prev.filter(m => m.id !== (payload.old as any).id));
        }
      }).subscribe();

    return () => supabase.removeChannel(channel);
  }, [activeChannelId]);

  // --- Auto Scroll ---
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // --- Send Message ---
  const sendMessage = async (type: "text" | "image" | "file" | "voice" = "text", mediaUrl?: string) => {
    if (!user || !activeChannelId) return;
    if (type === "text" && !input.trim() && !mediaUrl) return;

    if (activeChannel?.type === "announcement" && !isAdmin && !isTeacher) {
      toast({ title: "Restricted", description: "Only teachers/admins can post here", variant: "destructive" });
      return;
    }

    const { error } = await supabase.from("chat_messages").insert({
      channel_id: activeChannelId,
      user_id: user.id,
      content: type === "text" ? input : (mediaUrl || ""),
      content_type: type,
      reply_to: replyTo?.id || null
    });

    if (!error) {
      setInput("");
      setReplyTo(null);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: "image" | "file") => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const filePath = `${user.id}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("chat_attachments").upload(filePath, file);
    if (error) return toast({ title: "Upload failed", variant: "destructive" });

    const { data: { publicUrl } } = supabase.storage.from("chat_attachments").getPublicUrl(filePath);
    sendMessage(type, publicUrl);
  };

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-background" dir={dir}>
      {/* Sidebar */}
      <div className={`${mobileShowChat ? "hidden" : "flex"} md:flex w-80 border-r flex-col`}>
        <MajlisSidebar
          channels={channels}
          activeChannelId={activeChannelId}
          onSelectChannel={(id) => { setActiveChannelId(id); setMobileShowChat(true); }}
          onShowCreate={() => setShowCreateDialog(true)}
          onShowBrowse={() => setShowBrowseChannels(true)}
        />
      </div>

      {/* Chat Window */}
      <div className={`${mobileShowChat ? "flex" : "hidden"} md:flex flex-1 flex-col min-w-0`}>
        {!activeChannel ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <MessageCircle className="h-16 w-16 opacity-20" />
            <p className="ml-2 text-lg">Select a channel to start chatting</p>
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
              {messages.map(msg => {
                const isMe = msg.user_id === user?.id;
                return (
                  <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] flex gap-2 ${isMe ? "flex-row-reverse" : ""}`}>
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarImage src={profiles[msg.user_id]?.avatar_url} />
                        <AvatarFallback>{profiles[msg.user_id]?.full_name?.charAt(0) || "?"}</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <span className="text-[10px] text-muted-foreground">{profiles[msg.user_id]?.full_name}</span>
                        <div className={`rounded-2xl px-4 py-2 ${isMe ? "bg-primary text-primary-foreground rounded-tr-none" : "bg-muted rounded-tl-none"}`}>
                          {msg.content_type === "image" ? <img src={msg.content} className="max-w-full rounded-lg" /> : <p className="text-sm">{msg.content}</p>}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Input */}
            <div className="p-4 border-t flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => imageInputRef.current?.click()}><Image className="h-5 w-5" /></Button>
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                placeholder="Type a message..."
              />
              <Button onClick={() => sendMessage()} disabled={!input.trim()}><Send className="h-5 w-5" /></Button>
            </div>
          </>
        )}
      </div>

      <input type="file" ref={imageInputRef} className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, "image")} />
      <CreateChannelDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} />
      <BrowseChannelsDialog open={showBrowseChannels} onOpenChange={setShowBrowseChannels} />
    </div>
  );
};

export default MajlisEnhanced;
