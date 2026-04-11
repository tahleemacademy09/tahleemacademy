import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Send, Pin, Trash2, Smile } from "lucide-react";

interface ClassChatPanelProps {
  sessionId: string;
}

const EMOJI_LIST = ["👏", "🤲", "❤️", "😂", "🌟", "👍"];

const ClassChatPanel = ({ sessionId }: ClassChatPanelProps) => {
  const { user, hasRole } = useAuth();
  const { t } = useLanguage();
  const isPrivileged = hasRole("admin") || hasRole("teacher");
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [profiles, setProfiles] = useState<Record<string, { name: string; role: string }>>({});
  const [showEmoji, setShowEmoji] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadProfiles = async (userIds: string[]) => {
    const missing = userIds.filter(id => !profiles[id]);
    if (missing.length === 0) return;
    const { data } = await supabase.from("profiles").select("user_id, full_name").in("user_id", missing);
    const { data: roles } = await supabase.from("user_roles").select("user_id, role").in("user_id", missing);
    const newProfiles: Record<string, { name: string; role: string }> = {};
    (data || []).forEach(p => {
      const userRole = (roles || []).find(r => r.user_id === p.user_id);
      newProfiles[p.user_id] = { name: p.full_name || "Student", role: userRole?.role || "student" };
    });
    setProfiles(prev => ({ ...prev, ...newProfiles }));
  };

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("class_chat_messages")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at");
      setMessages(data || []);
      const ids = [...new Set((data || []).map(m => m.sender_id))];
      loadProfiles(ids);
    };
    load();

    const channel = supabase.channel(`class-chat-${sessionId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "class_chat_messages", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          setMessages(prev => [...prev, payload.new]);
          loadProfiles([payload.new.sender_id]);
        })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "class_chat_messages", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          setMessages(prev => prev.filter(m => m.id !== payload.old.id));
        })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [sessionId]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const sendMessage = async (text?: string) => {
    const msg = text || input.trim();
    if (!msg || !user) return;
    await supabase.from("class_chat_messages").insert({
      session_id: sessionId,
      sender_id: user.id,
      message: msg,
      type: text && EMOJI_LIST.includes(text) ? "emoji" : "text",
    });
    if (!text) setInput("");
    setShowEmoji(false);
  };

  const deleteMessage = async (id: string) => {
    await supabase.from("class_chat_messages").delete().eq("id", id);
  };

  const pinMessage = async (id: string, pinned: boolean) => {
    await supabase.from("class_chat_messages").update({ is_pinned: !pinned }).eq("id", id);
    setMessages(prev => prev.map(m => m.id === id ? { ...m, is_pinned: !pinned } : m));
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b">
        <h3 className="font-semibold text-sm">{t("Chat", "المحادثة")}</h3>
      </div>

      {/* Pinned messages */}
      {messages.filter(m => m.is_pinned).map(m => (
        <div key={`pin-${m.id}`} className="bg-secondary/10 border-b px-3 py-1.5 flex items-center gap-2">
          <Pin className="h-3 w-3 text-secondary shrink-0" />
          <p className="text-xs truncate">{m.message}</p>
        </div>
      ))}

      <ScrollArea className="flex-1 p-3">
        <div className="space-y-2">
          {messages.map(m => {
            const isMe = m.sender_id === user?.id;
            const prof = profiles[m.sender_id];
            const name = prof?.name || "Student";
            const isTeacher = prof?.role === "teacher" || prof?.role === "admin";

            if (m.type === "system") {
              return (
                <div key={m.id} className="text-center">
                  <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded">{m.message}</span>
                </div>
              );
            }

            if (m.type === "emoji") {
              return (
                <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                  <div className="text-center">
                    <span className="text-2xl">{m.message}</span>
                    <p className="text-[9px] text-muted-foreground">{isMe ? t("You", "أنت") : name}</p>
                  </div>
                </div>
              );
            }

            return (
              <div key={m.id} className={`group ${isMe ? "ms-6" : "me-6"}`}>
                <div className={`text-sm p-2 rounded-lg ${isMe ? "bg-primary/10" : "bg-muted"} ${isTeacher && !isMe ? "border-s-2 border-secondary" : ""}`}>
                  <div className="flex items-center gap-1 mb-0.5">
                    <p className="text-[10px] text-muted-foreground font-medium">{isMe ? t("You", "أنت") : name}</p>
                    {isTeacher && <Badge className="text-[8px] h-3 bg-secondary/20 text-secondary px-1">{t("Teacher", "معلم")}</Badge>}
                  </div>
                  <p className="break-words">{m.message}</p>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className="text-[9px] text-muted-foreground">
                      {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                    {isPrivileged && (
                      <div className="hidden group-hover:flex items-center gap-0.5">
                        <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => pinMessage(m.id, m.is_pinned)}>
                          <Pin className="h-2.5 w-2.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-5 w-5 text-destructive" onClick={() => deleteMessage(m.id)}>
                          <Trash2 className="h-2.5 w-2.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Emoji bar */}
      {showEmoji && (
        <div className="border-t p-2 flex gap-2 justify-center">
          {EMOJI_LIST.map(e => (
            <button key={e} onClick={() => sendMessage(e)} className="text-xl hover:scale-125 transition-transform">{e}</button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="p-2 border-t flex gap-2">
        <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={() => setShowEmoji(!showEmoji)}>
          <Smile className="h-4 w-4" />
        </Button>
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={t("Message the class...", "أرسل رسالة...")}
          className="text-sm"
          style={{ color: "#111", backgroundColor: "#fff" }}
          onKeyDown={e => e.key === "Enter" && sendMessage()}
        />
        <Button size="icon" onClick={() => sendMessage()} disabled={!input.trim()} className="shrink-0">
          <Send className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
};

export default ClassChatPanel;
