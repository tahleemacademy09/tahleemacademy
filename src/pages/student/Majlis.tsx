import { useEffect, useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Send, Users, MessageCircle, Hash, Menu, Reply, Smile, Check, CheckCheck, Search, Mic, MicOff, Image, FileText, Trash2, Edit, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ChatMessage {
  id: string;
  class_level_id: string;
  user_id: string;
  content_type: string;
  text: string | null;
  media_path: string | null;
  created_at: string;
  sender_name?: string;
}

interface ChatRoom {
  id: string;
  name: string;
  name_ar: string | null;
}

const REACTIONS = ["👍", "❤️", "😂", "🤲", "📖", "⭐"];

const Majlis = () => {
  const { t, language, dir } = useLanguage();
  const { user, profile, hasRole } = useAuth();
  const { toast } = useToast();
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showChannels, setShowChannels] = useState(false);
  const [editingMsg, setEditingMsg] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const isAdmin = hasRole("admin");

  // Load rooms
  useEffect(() => {
    if (!user) return;
    const loadRooms = async () => {
      const { data: enrollments } = await supabase
        .from("enrollments")
        .select("course_id, courses(id, title, title_ar)")
        .eq("user_id", user.id);

      const courseRooms: ChatRoom[] = (enrollments || [])
        .filter((e: any) => e.courses)
        .map((e: any) => ({ id: e.courses.id, name: e.courses.title, name_ar: e.courses.title_ar }));

      courseRooms.unshift({ id: "general", name: "General Majlis", name_ar: "المجلس العام" });
      setRooms(courseRooms);
      if (courseRooms.length > 0) setActiveRoom(courseRooms[0].id);
    };
    loadRooms();
  }, [user]);

  // Load messages
  useEffect(() => {
    if (!activeRoom) return;
    const loadMessages = async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("class_level_id", activeRoom)
        .order("created_at", { ascending: true })
        .limit(200);
      setMessages((data as ChatMessage[]) || []);

      const userIds = [...new Set((data || []).map((m: any) => m.user_id))];
      if (userIds.length > 0) {
        const { data: profs } = await supabase.from("profiles").select("user_id, full_name").in("user_id", userIds);
        const map: Record<string, string> = {};
        (profs || []).forEach((p: any) => { map[p.user_id] = p.full_name || "Student"; });
        setProfiles(prev => ({ ...prev, ...map }));
      }
    };
    loadMessages();

    const channel = supabase
      .channel(`majlis-${activeRoom}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages", filter: `class_level_id=eq.${activeRoom}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newMsg = payload.new as ChatMessage;
            setMessages(prev => [...prev, newMsg]);
            if (!profiles[newMsg.user_id]) {
              supabase.from("profiles").select("user_id, full_name").eq("user_id", newMsg.user_id).maybeSingle()
                .then(({ data }) => { if (data) setProfiles(prev => ({ ...prev, [data.user_id]: data.full_name || "Student" })); });
            }
          } else if (payload.eventType === "DELETE") {
            setMessages(prev => prev.filter(m => m.id !== payload.old.id));
          }
        })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeRoom]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const sendMessage = async (contentType = "text", mediaPath?: string) => {
    if ((!input.trim() && contentType === "text" && !mediaPath) || !activeRoom || !user) return;
    let text = input.trim();
    if (replyTo) {
      const replyName = profiles[replyTo.user_id] || "Student";
      text = `↩ ${replyName}: "${(replyTo.text || "").slice(0, 50)}"\n\n${text}`;
    }
    setInput("");
    setReplyTo(null);
    const { error } = await supabase.from("chat_messages").insert({
      class_level_id: activeRoom,
      user_id: user.id,
      content_type: contentType,
      text: contentType === "text" ? text : (text || null),
      media_path: mediaPath || null,
    });
    if (error) toast({ title: t("Error sending message", "خطأ في إرسال الرسالة"), variant: "destructive" });
    inputRef.current?.focus();
  };

  const deleteMessage = async (msgId: string) => {
    await supabase.from("chat_messages").delete().eq("id", msgId);
    setMessages(prev => prev.filter(m => m.id !== msgId));
  };

  // Voice recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach(t => t.stop());
        const path = `voice/${activeRoom}/${user!.id}/${crypto.randomUUID()}.webm`;
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

  // File/Image upload
  const handleFileUpload = async (file: File, type: "image" | "file") => {
    const path = `${type}s/${activeRoom}/${user!.id}/${crypto.randomUUID()}-${file.name}`;
    const { error } = await supabase.storage.from("subject-files").upload(path, file);
    if (!error) await sendMessage(type, path);
    else toast({ title: t("Upload failed", "فشل الرفع"), variant: "destructive" });
  };

  const activeRoomData = rooms.find(r => r.id === activeRoom);
  const filteredMessages = searchQuery
    ? messages.filter(m => m.text?.toLowerCase().includes(searchQuery.toLowerCase()))
    : messages;

  const ChannelList = ({ onSelect }: { onSelect?: () => void }) => (
    <div className="flex h-full flex-col">
      <div className="p-3 border-b">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Hash className="h-4 w-4" />
          {t("Channels", "القنوات")}
        </h3>
      </div>
      <div className="flex-1 overflow-auto p-2 space-y-1">
        {rooms.map(room => (
          <button
            key={room.id}
            onClick={() => { setActiveRoom(room.id); onSelect?.(); }}
            className={`w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
              activeRoom === room.id ? "bg-primary text-primary-foreground" : "hover:bg-accent text-foreground"
            }`}
          >
            <div className="flex items-center gap-2">
              <MessageCircle className="h-3.5 w-3.5 shrink-0" />
              <span dir="auto" className="truncate">
                {language === "ar" ? room.name_ar || room.name : room.name}
              </span>
            </div>
          </button>
        ))}
        {rooms.length === 0 && (
          <p className="text-xs text-muted-foreground p-3">
            {t("No channels yet. Enroll in a course to join.", "لا توجد قنوات بعد. سجّل في مقرر للانضمام.")}
          </p>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] md:h-[calc(100vh-0px)]">
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Sheet open={showChannels} onOpenChange={setShowChannels}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden shrink-0"><Menu className="h-5 w-5" /></Button>
          </SheetTrigger>
          <SheetContent side={dir === "rtl" ? "right" : "left"} className="w-72 p-0">
            <ChannelList onSelect={() => setShowChannels(false)} />
          </SheetContent>
        </Sheet>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold font-arabic truncate" dir="auto">
            {activeRoomData ? (language === "ar" ? activeRoomData.name_ar || activeRoomData.name : activeRoomData.name) : t("Al-Majlis", "المجلس")}
          </h1>
        </div>
        <div className="relative hidden sm:block">
          <Search className="absolute start-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={t("Search...", "بحث...")} className="h-8 w-40 ps-8 text-xs" />
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Desktop channel list */}
        <div className="hidden md:flex w-56 border-e flex-col bg-muted/30">
          <ChannelList />
        </div>

        {/* Chat area */}
        <div className="flex-1 flex flex-col min-w-0">
          {activeRoom ? (
            <>
              <ScrollArea className="flex-1 p-4" ref={scrollRef}>
                <div className="space-y-3">
                  {filteredMessages.length === 0 && (
                    <p className="text-center text-sm text-muted-foreground py-8">
                      {searchQuery ? t("No messages found", "لا توجد رسائل") : t("No messages yet. Start the conversation!", "لا توجد رسائل بعد. ابدأ المحادثة!")}
                    </p>
                  )}
                  {filteredMessages.map((m) => {
                    const isMe = m.user_id === user?.id;
                    const name = profiles[m.user_id] || (isMe ? profile?.full_name : "Student");
                    return (
                      <div key={m.id} className={`flex gap-2 group ${isMe ? "flex-row-reverse" : ""}`}>
                        <Avatar className="h-7 w-7 shrink-0 mt-0.5">
                          <AvatarFallback className="text-[10px] bg-accent font-bold">
                            {(name || "S").charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className={`max-w-[75%] ${isMe ? "text-end" : ""}`}>
                          <div className="text-[10px] text-muted-foreground mb-0.5 flex items-center gap-1" dir="auto">
                            <span className="font-medium">{isMe ? t("You", "أنت") : name}</span>
                            <span>·</span>
                            <span>{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                            {isMe && <CheckCheck className="h-3 w-3 text-primary ms-0.5" />}
                          </div>
                          <div className={`rounded-xl px-3 py-2 text-sm inline-block ${isMe ? "bg-primary text-primary-foreground" : "bg-muted"}`} dir="auto">
                            {m.content_type === "audio" && m.media_path ? (
                              <AudioMessage path={m.media_path} />
                            ) : m.content_type === "image" && m.media_path ? (
                              <ImageMessage path={m.media_path} />
                            ) : m.content_type === "file" && m.media_path ? (
                              <FileMessage path={m.media_path} text={m.text} />
                            ) : (
                              m.text?.split("\n").map((line, i) => (
                                <span key={i}>{i > 0 && <br />}{line}</span>
                              ))
                            )}
                          </div>
                          {/* Actions */}
                          <div className={`opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 mt-0.5 ${isMe ? "justify-end" : ""}`}>
                            <button onClick={() => { setReplyTo(m); inputRef.current?.focus(); }} className="text-muted-foreground hover:text-foreground p-0.5">
                              <Reply className="h-3 w-3" />
                            </button>
                            {(isMe || isAdmin) && (
                              <button onClick={() => deleteMessage(m.id)} className="text-muted-foreground hover:text-destructive p-0.5">
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>

              {/* Reply indicator */}
              {replyTo && (
                <div className="border-t border-secondary/30 bg-secondary/5 px-4 py-2 flex items-center gap-2">
                  <Reply className="h-3.5 w-3.5 text-secondary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-secondary">{profiles[replyTo.user_id] || "Student"}</p>
                    <p className="text-xs text-muted-foreground truncate">{replyTo.text}</p>
                  </div>
                  <button onClick={() => setReplyTo(null)} className="text-muted-foreground hover:text-foreground text-xs">✕</button>
                </div>
              )}

              {/* Input */}
              <div className="border-t p-3">
                <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="flex gap-2 items-end">
                  {/* Media buttons */}
                  <div className="flex gap-1 shrink-0">
                    <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0], "image"); }} />
                    <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0], "file"); }} />
                    <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => imageInputRef.current?.click()}>
                      <Image className="h-4 w-4" />
                    </Button>
                    <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => fileInputRef.current?.click()}>
                      <FileText className="h-4 w-4" />
                    </Button>
                    <Button type="button" size="icon" variant={isRecording ? "destructive" : "ghost"} className="h-8 w-8"
                      onClick={isRecording ? stopRecording : startRecording}>
                      {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    </Button>
                  </div>
                  <Input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} placeholder={t("Type a message...", "اكتب رسالة...")} dir="auto" className="flex-1" />
                  <Button type="submit" size="icon" disabled={!input.trim()} className="shrink-0">
                    <Send className="h-4 w-4" />
                  </Button>
                </form>
                {isRecording && (
                  <p className="text-xs text-destructive mt-1 animate-pulse">{t("🎙 Recording... Click mic to stop", "🎙 جاري التسجيل... اضغط الميكروفون للإيقاف")}</p>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-muted-foreground">{t("Select a channel to start chatting", "اختر قناة لبدء المحادثة")}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Sub-components for media messages
const AudioMessage = ({ path }: { path: string }) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    supabase.storage.from("subject-files").createSignedUrl(path, 3600).then(({ data }) => {
      if (data?.signedUrl) setUrl(data.signedUrl);
    });
  }, [path]);
  return url ? <audio controls src={url} className="max-w-[200px]" /> : <span className="text-xs opacity-70">Loading audio...</span>;
};

const ImageMessage = ({ path }: { path: string }) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    supabase.storage.from("subject-files").createSignedUrl(path, 3600).then(({ data }) => {
      if (data?.signedUrl) setUrl(data.signedUrl);
    });
  }, [path]);
  return url ? <img src={url} className="max-w-[200px] max-h-[200px] rounded-lg" alt="" /> : <span className="text-xs opacity-70">Loading image...</span>;
};

const FileMessage = ({ path, text }: { path: string; text: string | null }) => {
  const fileName = path.split("/").pop() || "File";
  const openFile = async () => {
    const { data } = await supabase.storage.from("subject-files").createSignedUrl(path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };
  return (
    <button onClick={openFile} className="flex items-center gap-2 hover:underline">
      <FileText className="h-4 w-4" />
      <span className="text-xs">{text || fileName}</span>
    </button>
  );
};

export default Majlis;
