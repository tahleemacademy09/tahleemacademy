import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Bot, X, Send, GraduationCap, Calendar, BarChart3, BookOpen, Loader2 } from "lucide-react";

type Msg = { role: "user" | "assistant"; content: string };

const MuallimOverlay = () => {
  const { user } = useAuth();
  const { t, dir } = useLanguage();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const streamChat = async (msgs: Msg[], action?: string) => {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/muallim-chat`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ messages: msgs, action }),
    });

    if (!resp.ok || !resp.body) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error || "Failed to connect to Mu'allim");
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let textBuffer = "";
    let assistantSoFar = "";

    const upsert = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      textBuffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
        let line = textBuffer.slice(0, newlineIndex);
        textBuffer = textBuffer.slice(newlineIndex + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (!line.startsWith("data: ")) continue;
        const jsonStr = line.slice(6).trim();
        if (jsonStr === "[DONE]") return;
        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) upsert(content);
        } catch { /* partial JSON */ }
      }
    }
  };

  const send = async (text: string, action?: string) => {
    if (!text.trim() && !action) return;
    const userMsg: Msg = { role: "user", content: text || action || "" };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    setInput("");
    setIsLoading(true);
    try {
      await streamChat(newMsgs, action);
    } catch (e: any) {
      setMessages(prev => [...prev, { role: "assistant", content: `⚠️ ${e.message}` }]);
    }
    setIsLoading(false);
  };

  const quickActions = [
    { icon: BarChart3, label: t("What is my CGPA?", "ما هو معدلي التراكمي؟"), action: "cgpa", text: "What is my CGPA? Calculate it with a full breakdown." },
    { icon: Calendar, label: t("Next exam?", "الامتحان القادم؟"), action: "next_exam", text: "When is my next exam?" },
    { icon: GraduationCap, label: t("Term results", "نتائج الفصل"), action: "grades", text: "Summarize my latest exam results." },
    { icon: BookOpen, label: t("Hifdh score", "درجة الحفظ"), action: "grades", text: "Show my Hifdh exam score if available." },
  ];

  if (!user) return null;

  // Reduced size (30% smaller): 10 → 7, h-14 → h-10, w-14 → w-10
  // Position: LTR → bottom-left, RTL → bottom-right
  // z-index: 40 (above content, below modals at 50)
  const btnPosition = dir === "rtl" ? "right-5 bottom-5" : "left-5 bottom-5";
  const panelPosition = dir === "rtl" ? "right-4 bottom-4" : "left-4 bottom-4";

  return (
    <>
      {/* Floating button — 30% reduced */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className={`fixed ${btnPosition} z-40 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-105 transition-transform`}
          aria-label="Open Mu'allim AI"
        >
          <Bot className="h-5 w-5" />
        </button>
      )}

      {/* Overlay panel */}
      {open && (
        <div className={`fixed ${panelPosition} z-40 flex h-[500px] w-[360px] max-w-[calc(100vw-2rem)] flex-col rounded-2xl border bg-card shadow-2xl`}>
          {/* Header */}
          <div className="flex items-center justify-between rounded-t-2xl bg-primary px-4 py-3">
            <div className="flex items-center gap-2 text-primary-foreground">
              <Bot className="h-4 w-4" />
              <div>
                <div className="font-bold text-sm font-arabic">{t("Mu'allim", "المُعلِّم")}</div>
                <div className="text-[10px] opacity-80">{t("AI Academic Assistant", "المساعد الأكاديمي")}</div>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-primary-foreground hover:bg-primary/80" onClick={() => setOpen(false)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 p-3" ref={scrollRef}>
            {messages.length === 0 && (
              <div className="space-y-3 pt-2">
                <p className="text-center text-sm text-muted-foreground font-arabic">
                  {t("Assalamu Alaikum! How can I help you today?", "السلام عليكم! كيف يمكنني مساعدتك؟")}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {quickActions.map((qa, i) => (
                    <button
                      key={i}
                      onClick={() => send(qa.text, qa.action)}
                      className="flex items-center gap-2 rounded-lg border bg-muted/50 p-2 text-left text-xs hover:bg-accent transition-colors"
                    >
                      <qa.icon className="h-3.5 w-3.5 shrink-0 text-secondary" />
                      <span className="line-clamp-2">{qa.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-3">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}>
                    <span dir="auto" className="whitespace-pre-wrap">{m.content}</span>
                  </div>
                </div>
              ))}
              {isLoading && messages[messages.length - 1]?.role === "user" && (
                <div className="flex justify-start">
                  <div className="rounded-xl bg-muted px-3 py-2">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="border-t p-3">
            <form
              onSubmit={(e) => { e.preventDefault(); send(input); }}
              className="flex gap-2"
            >
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t("Ask Mu'allim...", "اسأل المُعلِّم...")}
                className="min-h-[36px] max-h-[72px] resize-none text-sm"
                dir="auto"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
                }}
              />
              <Button type="submit" size="icon" disabled={isLoading || !input.trim()} className="shrink-0 h-9 w-9">
                <Send className="h-3.5 w-3.5" />
              </Button>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default MuallimOverlay;
