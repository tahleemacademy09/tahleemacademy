import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Send, MessageCircle, Reply, Check, CheckCheck, Search, Mic, MicOff,
  Image, Paperclip, Smile, ArrowLeft, FileText, Trash2
} from "lucide-react";
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
  lastMessage?: string;
  lastMessageTime?: string;
  unread?: number;
}

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
  const [showSearch, setShowSearch] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [mobileShowChat, setMobileShowChat] = useState(false);
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
        .map((e: any) => ({
          id: e.courses.id,
          name: e.courses.title,
          name_ar: e.courses.title_ar,
        }));

      courseRooms.unshift({ id: "general", name: "General Majlis", name_ar: "المجلس العام" });
      setRooms(courseRooms);
      if (courseRooms.length > 0 && !activeRoom) setActiveRoom(courseRooms[0].id);
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

  const formatTime = (dateStr: string) =>
    new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const getLastMessage = (roomId: string) => {
    const roomMsgs = messages.filter(m => m.class_level_id === roomId);
    return roomMsgs[roomMsgs.length - 1];
  };

  const getRoomDisplayName = (room: ChatRoom) =>
    language === "ar" ? room.name_ar || room.name : room.name;

  const selectRoom = (roomId: string) => {
    setActiveRoom(roomId);
    setMobileShowChat(true);
  };

  // ─── Chat List Pane ───
  const ChatListPane = () => (
    <div className="flex flex-col h-full" style={{ backgroundColor: "#FAFAF8" }}>
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between"
        style={{ backgroundColor: "#064E3B" }}
      >
        <h1
          className="text-lg font-bold text-white"
          style={{ fontFamily: language === "ar" ? "'Amiri', serif" : "'Playfair Display', serif" }}
        >
          {t("Al-Majlis", "المجلس")}
        </h1>
        <button
          onClick={() => setShowSearch(!showSearch)}
          className="text-white/80 hover:text-white p-1"
        >
          <Search className="h-5 w-5" />
        </button>
      </div>

      {/* Search */}
      {showSearch && (
        <div className="px-3 py-2 border-b" style={{ borderColor: "hsl(var(--border))" }}>
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("Search chats...", "بحث في المحادثات...")}
            className="h-8 text-sm"
            dir="auto"
          />
        </div>
      )}

      {/* Room list */}
      <div className="flex-1 overflow-y-auto">
        {rooms.length === 0 && (
          <p className="text-sm text-muted-foreground p-6 text-center" dir="auto">
            {t("No channels yet. Enroll in a course to join.", "لا توجد قنوات بعد. سجّل في مقرر للانضمام.")}
          </p>
        )}
        {rooms.map((room) => (
          <button
            key={room.id}
            onClick={() => selectRoom(room.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 transition-colors border-b hover:bg-accent/30 ${
              activeRoom === room.id ? "bg-accent/40" : ""
            }`}
            style={{ borderColor: "hsl(var(--border))" }}
          >
            {/* Avatar */}
            <Avatar className="h-12 w-12 shrink-0">
              <AvatarFallback
                className="text-sm font-bold text-white"
                style={{ backgroundColor: "#064E3B" }}
              >
                {getRoomDisplayName(room).charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>

            {/* Info */}
            <div className="flex-1 min-w-0 text-start">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm truncate text-foreground" dir="auto">
                  {getRoomDisplayName(room)}
                </span>
                {room.lastMessageTime && (
                  <span className="text-[11px] text-muted-foreground shrink-0 ms-2">
                    {room.lastMessageTime}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between mt-0.5">
                <p className="text-xs text-muted-foreground truncate" dir="auto">
                  {room.lastMessage || t("Tap to open", "اضغط لفتح")}
                </p>
                {room.unread && room.unread > 0 ? (
                  <span
                    className="shrink-0 ms-2 h-5 min-w-[20px] px-1 rounded-full text-[11px] font-bold text-white flex items-center justify-center"
                    style={{ backgroundColor: "#25D366" }}
                  >
                    {room.unread}
                  </span>
                ) : null}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  // ─── Active Chat Pane ───
  const ActiveChatPane = () => {
    if (!activeRoom || !activeRoomData) {
      return (
        <div
          className="flex-1 flex flex-col items-center justify-center"
          style={{ backgroundColor: "#F0ECE3" }}
        >
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
        <div
          className="px-3 py-2.5 flex items-center gap-3 shadow-sm"
          style={{ backgroundColor: "#064E3B" }}
        >
          {/* Back button mobile */}
          <button
            onClick={() => setMobileShowChat(false)}
            className="md:hidden text-white/80 hover:text-white p-1"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <Avatar className="h-10 w-10 shrink-0">
            <AvatarFallback className="text-sm font-bold bg-emerald-light text-foreground">
              {getRoomDisplayName(activeRoomData).charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <h2 className="text-white font-semibold text-sm truncate" dir="auto">
              {getRoomDisplayName(activeRoomData)}
            </h2>
            <p className="text-white/60 text-[11px]">
              {t("Online", "متصل")}
            </p>
          </div>
        </div>

        {/* Messages Area with Islamic doodle background */}
        <div
          className="flex-1 overflow-y-auto px-3 py-4"
          ref={scrollRef}
          style={{
            backgroundColor: "#FAFAF8",
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23064E3B' fill-opacity='0.03'%3E%3Cpath d='M30 0l30 30-30 30L0 30z'/%3E%3Ccircle cx='30' cy='30' r='8'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        >
          <div className="max-w-2xl mx-auto space-y-1">
            {filteredMessages.length === 0 && (
              <div className="text-center py-12">
                <p className="text-sm text-muted-foreground" dir="auto">
                  {searchQuery
                    ? t("No messages found", "لا توجد رسائل")
                    : t("No messages yet. Start the conversation!", "لا توجد رسائل بعد. ابدأ المحادثة!")}
                </p>
              </div>
            )}

            {filteredMessages.map((m, idx) => {
              const isMe = m.user_id === user?.id;
              const name = profiles[m.user_id] || (isMe ? profile?.full_name : "Student");
              const prevMsg = filteredMessages[idx - 1];
              const showName = !isMe && (!prevMsg || prevMsg.user_id !== m.user_id);

              return (
                <div
                  key={m.id}
                  className={`flex group ${isMe ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`relative max-w-[80%] md:max-w-[65%] px-3 py-1.5 rounded-lg shadow-sm ${
                      isMe ? "rounded-tr-none" : "rounded-tl-none"
                    }`}
                    style={{
                      backgroundColor: isMe ? "#DCF8C6" : "#FFFFFF",
                      marginTop: showName || (prevMsg && prevMsg.user_id !== m.user_id) ? "8px" : "2px",
                    }}
                  >
                    {/* Sender name for group chats */}
                    {showName && (
                      <p
                        className="text-[11px] font-semibold mb-0.5"
                        style={{ color: "#064E3B" }}
                        dir="auto"
                      >
                        {name}
                      </p>
                    )}

                    {/* Content */}
                    <div className="text-sm text-gray-900" dir="auto">
                      {m.content_type === "audio" && m.media_path ? (
                        <AudioMessage path={m.media_path} />
                      ) : m.content_type === "image" && m.media_path ? (
                        <ImageMessage path={m.media_path} />
                      ) : m.content_type === "file" && m.media_path ? (
                        <FileMessage path={m.media_path} text={m.text} />
                      ) : (
                        <span className="whitespace-pre-wrap break-words">{m.text}</span>
                      )}
                    </div>

                    {/* Time + Read receipts */}
                    <div className={`flex items-center gap-1 mt-0.5 ${isMe ? "justify-end" : "justify-end"}`}>
                      <span className="text-[10px] text-gray-500">
                        {formatTime(m.created_at)}
                      </span>
                      {isMe && (
                        <CheckCheck className="h-3.5 w-3.5" style={{ color: "#53BDEB" }} />
                      )}
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
          <div
            className="px-4 py-2 flex items-center gap-2 border-t"
            style={{ backgroundColor: "#F0F2F5", borderColor: "hsl(var(--border))" }}
          >
            <div
              className="w-1 h-10 rounded-full"
              style={{ backgroundColor: "#064E3B" }}
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold" style={{ color: "#064E3B" }}>
                {profiles[replyTo.user_id] || "Student"}
              </p>
              <p className="text-xs text-muted-foreground truncate">{replyTo.text}</p>
            </div>
            <button
              onClick={() => setReplyTo(null)}
              className="text-muted-foreground hover:text-foreground p-1"
            >
              ✕
            </button>
          </div>
        )}

        {/* Recording indicator */}
        {isRecording && (
          <div
            className="px-4 py-2 flex items-center gap-3"
            style={{ backgroundColor: "#F0F2F5" }}
          >
            <div className="w-3 h-3 rounded-full bg-destructive animate-pulse" />
            <span className="text-sm text-destructive font-medium flex-1">
              {t("Recording... Tap mic to stop", "جاري التسجيل... اضغط على الميكروفون للإيقاف")}
            </span>
            <Button
              size="sm"
              variant="destructive"
              onClick={stopRecording}
              className="h-8"
            >
              <MicOff className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Input Bar */}
        <div className="px-2 py-2 flex items-end gap-2" style={{ backgroundColor: "#F0F2F5" }}>
          <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0], "image"); }} />
          <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0], "file"); }} />

          {/* Emoji placeholder */}
          <button className="p-2 text-gray-500 hover:text-gray-700 shrink-0">
            <Smile className="h-5 w-5" />
          </button>

          {/* Attachment */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-gray-500 hover:text-gray-700 shrink-0"
          >
            <Paperclip className="h-5 w-5" />
          </button>

          {/* Image */}
          <button
            onClick={() => imageInputRef.current?.click()}
            className="p-2 text-gray-500 hover:text-gray-700 shrink-0 hidden sm:block"
          >
            <Image className="h-5 w-5" />
          </button>

          {/* Text input */}
          <form
            onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
            className="flex-1 flex items-center"
          >
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("Type a message...", "اكتب رسالة...")}
              dir="auto"
              className="rounded-full border-0 bg-white shadow-sm h-10 px-4 text-sm focus-visible:ring-1"
            />
          </form>

          {/* Mic or Send */}
          {input.trim() ? (
            <button
              onClick={() => sendMessage()}
              className="p-2.5 rounded-full shrink-0 text-white"
              style={{ backgroundColor: "#25D366" }}
            >
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
      </div>
    );
  };

  // ─── Main Layout ───
  return (
    <div className="flex h-[calc(100vh-3.5rem)] md:h-[calc(100vh-0px)] overflow-hidden">
      {/* Desktop: two-pane | Mobile: stack */}

      {/* Chat list - always visible on desktop, conditionally on mobile */}
      <div
        className={`${
          mobileShowChat ? "hidden md:flex" : "flex"
        } w-full md:w-80 lg:w-96 flex-col border-e`}
        style={{ borderColor: "hsl(var(--border))" }}
      >
        <ChatListPane />
      </div>

      {/* Chat area - always visible on desktop, conditionally on mobile */}
      <div
        className={`${
          mobileShowChat ? "flex" : "hidden md:flex"
        } flex-1 flex-col min-w-0`}
      >
        <ActiveChatPane />
      </div>
    </div>
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
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
        style={{ backgroundColor: "#25D366" }}
      >
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
