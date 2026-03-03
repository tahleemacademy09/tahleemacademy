import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Send, Users, MessageCircle, Hash } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ChatMessage {
  id: string;
  class_level_id: string;
  user_id: string;
  content_type: string;
  text: string | null;
  created_at: string;
  sender_name?: string;
}

// Group channels derived from courses the student is enrolled in
interface ChatRoom {
  id: string;
  name: string;
  name_ar: string | null;
}

const Majlis = () => {
  const { t, language } = useLanguage();
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load rooms from enrolled courses
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

      // Also add a "General" room
      courseRooms.unshift({ id: "general", name: "General Majlis", name_ar: "المجلس العام" });
      setRooms(courseRooms);
      if (courseRooms.length > 0) setActiveRoom(courseRooms[0].id);
    };
    loadRooms();
  }, [user]);

  // Load messages for active room
  useEffect(() => {
    if (!activeRoom) return;
    const loadMessages = async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("class_level_id", activeRoom)
        .order("created_at", { ascending: true })
        .limit(100);
      setMessages((data as ChatMessage[]) || []);

      // Load unique sender profiles
      const userIds = [...new Set((data || []).map((m: any) => m.user_id))];
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", userIds);
        const map: Record<string, string> = {};
        (profs || []).forEach((p: any) => { map[p.user_id] = p.full_name || "Student"; });
        setProfiles(prev => ({ ...prev, ...map }));
      }
    };
    loadMessages();

    // Subscribe to realtime
    const channel = supabase
      .channel(`majlis-${activeRoom}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "chat_messages",
        filter: `class_level_id=eq.${activeRoom}`,
      }, (payload) => {
        const newMsg = payload.new as ChatMessage;
        setMessages(prev => [...prev, newMsg]);
        // Load profile if not cached
        if (!profiles[newMsg.user_id]) {
          supabase.from("profiles").select("user_id, full_name").eq("user_id", newMsg.user_id).maybeSingle()
            .then(({ data }) => {
              if (data) setProfiles(prev => ({ ...prev, [data.user_id]: data.full_name || "Student" }));
            });
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeRoom]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || !activeRoom || !user) return;
    const text = input.trim();
    setInput("");
    const { error } = await supabase.from("chat_messages").insert({
      class_level_id: activeRoom,
      user_id: user.id,
      content_type: "text",
      text,
    });
    if (error) {
      toast({ title: t("Error sending message", "خطأ في إرسال الرسالة"), variant: "destructive" });
    }
  };

  const activeRoomData = rooms.find(r => r.id === activeRoom);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold font-arabic">{t("Al-Majlis", "المجلس")}</h1>
        <p className="text-muted-foreground">{t("Connect with your classmates", "تواصل مع زملائك")}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4" style={{ height: "calc(100vh - 220px)" }}>
        {/* Room list */}
        <Card className="md:col-span-1 flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Hash className="h-4 w-4" />
              {t("Channels", "القنوات")}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto p-2">
            <div className="space-y-1">
              {rooms.map(room => (
                <button
                  key={room.id}
                  onClick={() => setActiveRoom(room.id)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    activeRoom === room.id
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent"
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
                <p className="text-xs text-muted-foreground p-2">
                  {t("No channels yet. Enroll in a course to join.", "لا توجد قنوات بعد. سجّل في مقرر للانضمام.")}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Chat area */}
        <Card className="md:col-span-3 flex flex-col">
          {activeRoom ? (
            <>
              <CardHeader className="border-b pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Hash className="h-4 w-4 text-secondary" />
                  <span dir="auto">
                    {activeRoomData ? (language === "ar" ? activeRoomData.name_ar || activeRoomData.name : activeRoomData.name) : ""}
                  </span>
                </CardTitle>
              </CardHeader>
              <ScrollArea className="flex-1 p-4" ref={scrollRef}>
                <div className="space-y-3">
                  {messages.length === 0 && (
                    <p className="text-center text-sm text-muted-foreground py-8">
                      {t("No messages yet. Start the conversation!", "لا توجد رسائل بعد. ابدأ المحادثة!")}
                    </p>
                  )}
                  {messages.map((m) => {
                    const isMe = m.user_id === user?.id;
                    const name = profiles[m.user_id] || (isMe ? profile?.full_name : "Student");
                    return (
                      <div key={m.id} className={`flex gap-2 ${isMe ? "flex-row-reverse" : ""}`}>
                        <Avatar className="h-7 w-7 shrink-0">
                          <AvatarFallback className="text-xs bg-accent">
                            {(name || "S").charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className={`max-w-[75%] ${isMe ? "text-right" : ""}`}>
                          <div className="text-xs text-muted-foreground mb-0.5" dir="auto">
                            {isMe ? t("You", "أنت") : name}
                            <span className="mx-1">·</span>
                            {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </div>
                          <div
                            className={`rounded-xl px-3 py-2 text-sm ${
                              isMe ? "bg-primary text-primary-foreground" : "bg-muted"
                            }`}
                            dir="auto"
                          >
                            {m.text}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
              <div className="border-t p-3">
                <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="flex gap-2">
                  <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={t("Type a message...", "اكتب رسالة...")}
                    dir="auto"
                    className="flex-1"
                  />
                  <Button type="submit" size="icon" disabled={!input.trim()}>
                    <Send className="h-4 w-4" />
                  </Button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-muted-foreground">{t("Select a channel to start chatting", "اختر قناة لبدء المحادثة")}</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default Majlis;
