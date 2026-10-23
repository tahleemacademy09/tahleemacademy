// src/components/student/TasjeelFAQBot.tsx
// ═══════════════════════════════════════════════════════════════════════════
// TASJEEL FAQ ASSISTANT — floating bottom-right widget for registration-
// pipeline pages (e.g. TasjeelAwaitingLevel).
//
// Flow:
//   1. Student taps the floating button → chat panel opens with a greeting
//      from "the Tasjeel Bot" and a set of quick-reply FAQ chips covering
//      the registration journey (payment, exam, recitation, session
//      booking, admin confirmation, level assignment timing).
//   2. Student can tap a chip or type a question — matched against a small
//      keyword-based FAQ table so common questions are answered instantly
//      without needing a human.
//   3. Only once the bot has had a chance to help (i.e. after the first
//      exchange) does a "Talk to an admin on WhatsApp" option appear, so
//      students go through the bot first rather than skipping straight to
//      WhatsApp. If the bot can't match a question, it says so and
//      surfaces the WhatsApp escalation immediately.
//   4. WhatsApp opens a chat to 0816 818 4730 with a short, subtle Islamic
//      greeting pre-filled — not a hard-sell message.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useRef, useEffect } from "react";
import { MessageCircleQuestion, X, Send, ExternalLink } from "lucide-react";

const G    = "#064E3B";
const GM   = "#075E54";
const GOLD = "#C9973A";

// Nigerian local format → international wa.me format (matches the pattern
// already used for the site-wide WhatsApp link in Footer.tsx).
const WHATSAPP_NUMBER = "2348168184730"; // 08168184730
const WHATSAPP_MESSAGE =
  "Assalamu alaikum, jazakumullahu khayran. I have an enquiry about my Tahleem Academy registration.";

type Msg = { from: "bot" | "user"; text: string };

interface FaqEntry {
  keywords: string[];
  answer: string;
}

const FAQS: FaqEntry[] = [
  {
    keywords: ["pay", "paid", "payment", "fee", "paystack", "charge", "receipt"],
    answer:
      "If you've completed payment and it isn't reflecting, give it a minute and refresh — Paystack confirmations can take a moment. If it still shows unpaid after that, an admin will need to check your transaction reference.",
  },
  {
    keywords: ["onboard", "onboarding", "form"],
    answer:
      "The onboarding form only needs to be completed once, right after payment. If you can't access it, make sure you're signed in with the same email you registered with.",
  },
  {
    keywords: ["exam", "entrance", "test", "question"],
    answer:
      "The entrance exam is a one-time written assessment used to help place you at the right learning level. It's auto-submitted once you finish, so there's nothing further needed from you after that.",
  },
  {
    keywords: ["recit", "audio", "record", "microphone", "mic"],
    answer:
      "The recitation test asks you to record yourself reciting the Qur'an page shown on screen. Make sure you're in a quiet room and allow microphone access when prompted.",
  },
  {
    keywords: ["session", "book", "schedule", "reschedule", "time", "date", "virtual"],
    answer:
      "Your virtual session date/time is the one you selected when booking. If you need to change it, an admin can help reschedule — that's not something you can edit yourself once booked.",
  },
  {
    keywords: ["confirm", "confirmed", "approve", "approval", "pending", "waiting", "review", "how long", "assign", "level"],
    answer:
      "Admin confirmation and level assignment are done manually by our instructors after reviewing your exam and recitation, usually within 24–48 hours. You'll see this page update automatically — no action needed from your side.",
  },
  {
    keywords: ["refund", "money back", "cancel"],
    answer:
      "Refund requests are handled case-by-case by our admin team, so I'd recommend reaching out directly for that.",
  },
  {
    keywords: ["join", "link", "class", "room"],
    answer:
      "The Join button for your session activates automatically 15 minutes before your scheduled time — you'll see it light up right here on this page.",
  },
];

const QUICK_REPLIES = [
  "Why is my session pending?",
  "How long does level assignment take?",
  "Can I reschedule my session?",
  "I paid but it's not showing",
];

function matchFaq(question: string): string | null {
  const q = question.toLowerCase();
  for (const entry of FAQS) {
    if (entry.keywords.some((k) => q.includes(k))) return entry.answer;
  }
  return null;
}

const TasjeelFAQBot = () => {
  const [open, setOpen]         = useState(false);
  const [input, setInput]       = useState("");
  const [messages, setMessages] = useState<Msg[]>([
    {
      from: "bot",
      text:
        "السلام عليكم — I'm the Tasjeel Assistant. Ask me anything about your registration (payment, exam, recitation, session booking, or level assignment) and I'll do my best to help.",
    },
  ]);
  // Escalation only appears after the bot has had at least one real attempt
  // to help — either a matched answer or a genuine "I don't know" miss.
  const [hasReplied, setHasReplied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open]);

  const ask = (question: string) => {
    const trimmed = question.trim();
    if (!trimmed) return;

    const answer = matchFaq(trimmed);
    setMessages((m) => [
      ...m,
      { from: "user", text: trimmed },
      {
        from: "bot",
        text:
          answer ||
          "I'm not totally sure about that one — an admin will be able to help directly. You can reach them on WhatsApp below.",
      },
    ]);
    setHasReplied(true);
    setInput("");
  };

  const whatsappHref = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`;

  return (
    <>
      {/* ── Floating button ── */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Registration FAQ assistant"
        style={{
          position: "fixed", right: 18, bottom: 18, zIndex: 60,
          width: 56, height: 56, borderRadius: "50%", border: "none",
          background: `linear-gradient(135deg,${G},${GM})`,
          color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 8px 24px rgba(6,78,59,.35)", cursor: "pointer",
        }}
      >
        {open ? <X size={24} /> : <MessageCircleQuestion size={26} />}
      </button>

      {/* ── Chat panel ── */}
      {open && (
        <div
          style={{
            position: "fixed", right: 16, bottom: 84, zIndex: 60,
            width: "min(360px, calc(100vw - 32px))", maxHeight: "70vh",
            background: "#fff", borderRadius: 20, border: "1px solid #e5e7eb",
            boxShadow: "0 16px 48px rgba(0,0,0,.2)", display: "flex", flexDirection: "column",
            overflow: "hidden", fontFamily: "'Cairo',sans-serif",
          }}
        >
          {/* Header */}
          <div style={{ background: `linear-gradient(135deg,${G},${GM})`, padding: "14px 16px", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(255,255,255,.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
              🤖
            </div>
            <div>
              <p style={{ margin: 0, color: "#fff", fontWeight: 800, fontSize: 14 }}>Tasjeel Assistant</p>
              <p style={{ margin: 0, color: "rgba(255,255,255,.65)", fontSize: 11 }}>Registration help</p>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "14px 12px", background: "#F8FAFB", display: "flex", flexDirection: "column", gap: 10, minHeight: 180 }}>
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  alignSelf: m.from === "bot" ? "flex-start" : "flex-end",
                  maxWidth: "85%", padding: "9px 12px", borderRadius: 14,
                  fontSize: 13, lineHeight: 1.5,
                  background: m.from === "bot" ? "#fff" : G,
                  color: m.from === "bot" ? "#1f2937" : "#fff",
                  border: m.from === "bot" ? "1px solid #e5e7eb" : "none",
                  borderBottomLeftRadius: m.from === "bot" ? 4 : 14,
                  borderBottomRightRadius: m.from === "user" ? 4 : 14,
                }}
              >
                {m.text}
              </div>
            ))}

            {/* Quick replies — shown until the first real question is asked */}
            {!hasReplied && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                {QUICK_REPLIES.map((q) => (
                  <button
                    key={q}
                    onClick={() => ask(q)}
                    style={{
                      fontSize: 11.5, padding: "6px 10px", borderRadius: 999,
                      border: `1px solid ${GOLD}`, background: "rgba(201,151,58,.08)",
                      color: "#7D5A1E", cursor: "pointer", fontWeight: 600,
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {/* WhatsApp escalation — only offered once the bot has actually
                had a turn, so students go through the bot first. */}
            {hasReplied && (
              <div style={{ marginTop: 4, background: "#F0FDF4", border: "1px solid #86EFAC", borderRadius: 14, padding: "10px 12px" }}>
                <p style={{ margin: "0 0 4px", fontSize: 11.5, color: "#166534", fontFamily: "'Amiri',serif", direction: "rtl" }}>
                  بارك الله فيك
                </p>
                <p style={{ margin: "0 0 8px", fontSize: 12, color: "#166534", lineHeight: 1.5 }}>
                  Still need help? An admin is happy to assist you directly.
                </p>
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    padding: "9px 12px", borderRadius: 10, background: "#25D366", color: "#fff",
                    fontSize: 12.5, fontWeight: 700, textDecoration: "none",
                  }}
                >
                  <ExternalLink size={13} /> Continue on WhatsApp
                </a>
              </div>
            )}
          </div>

          {/* Input */}
          <div style={{ display: "flex", gap: 8, padding: "10px 12px", borderTop: "1px solid #e5e7eb", background: "#fff" }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") ask(input); }}
              placeholder="Type your question…"
              style={{
                flex: 1, padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb",
                fontSize: 13, outline: "none", fontFamily: "'Cairo',sans-serif",
              }}
            />
            <button
              onClick={() => ask(input)}
              disabled={!input.trim()}
              style={{
                width: 40, height: 40, borderRadius: 12, border: "none",
                background: input.trim() ? G : "#e5e7eb", color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: input.trim() ? "pointer" : "not-allowed", flexShrink: 0,
              }}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default TasjeelFAQBot;
