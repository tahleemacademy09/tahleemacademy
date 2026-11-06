/*
  src/pages/student/StudentSupport.tsx — Tahleem Academy
  ──────────────────────────────────────────────────────────
  Help & Support as a LIVE CHAT.

  Before: tap New → pick recipient → fill Subject + Category + Message →
  submit a "ticket" (a new one every single time).

  Now:
    • The home screen has two contact cards (Admin Support / a Teacher) and
      the list of past conversations.
    • Tapping a contact opens the chat immediately — header, a welcome
      message and one-tap SUGGESTIONS. Tapping a suggestion sends its full
      message straight away; typing your own works the same.
    • The ticket row is created lazily, with the first message (subject and
      category are filled in automatically), so there is no form at all.
    • If there is already an open conversation with that recipient, it is
      continued instead of starting a new one each time.
    • Live: messages arrive instantly, typing indicator, "online now"
      (the other side has this chat open), read ticks that turn blue as soon
      as the message is seen, optimistic sending with retry, date
      separators, auto-growing composer, reply-to-message, edit, copy,
      delete, photo/video/audio/file attachments.

  Tables (unchanged): support_tickets (one row per conversation) and
  support_ticket_messages. Unread badges / previews are still maintained by
  the sync_ticket_on_new_message DB trigger. Realtime via useSupportLive
  (falls back to polling if realtime is not enabled for the tables).
*/

import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { useSupportLive } from "@/hooks/useSupportLive";
import {
  LifeBuoy, ChevronLeft, Send, Loader2, Paperclip, X, FileText, Shield,
  GraduationCap, Check, CheckCheck, Clock, Trash2, Copy, Reply, Pencil,
  ChevronDown, AlertCircle, RotateCcw,
} from "lucide-react";

const G      = "#0f2d1f";
const GOLD   = "#c9a84c";
const CREAM  = "#faf6ee";
const BORDER = "rgba(15,45,31,0.1)";
const TL     = "#7a9e88";
const MAX_FILE_BYTES = 25 * 1024 * 1024;

const STATUS_CFG: Record<string, { label: string; labelAr: string; color: string; bg: string }> = {
  open:        { label: "Open",        labelAr: "مفتوحة",        color: "#D97706", bg: "#FFFBEB" },
  in_progress: { label: "In Progress", labelAr: "قيد المعالجة",  color: "#2563EB", bg: "#EFF6FF" },
  resolved:    { label: "Resolved",    labelAr: "تم الحل",       color: "#16A34A", bg: "#F0FDF4" },
};

// ── One-tap suggestions ────────────────────────────────────────────────
// Tapping one sends `text` as the full first message. `subject` and
// `category` (always English — that is what staff see in their inbox) are
// saved on the ticket automatically. text === null means "let me type".
type Suggestion = {
  id: string;
  emoji: string;
  subject: string;
  category: string;
  label: [string, string];
  text: [string, string] | null;
};

const ADMIN_SUGGESTIONS: Suggestion[] = [
  { id: "login", emoji: "🔑", subject: "Can't log in", category: "account",
    label: ["I can't log in", "لا أستطيع تسجيل الدخول"],
    text: ["Assalamu alaikum. I'm unable to log in to my account. Please help me get back in.",
           "السلام عليكم، لا أستطيع تسجيل الدخول إلى حسابي. أرجو مساعدتي في استعادة الوصول."] },
  { id: "payment", emoji: "💳", subject: "Payment not confirmed", category: "payment",
    label: ["Payment not confirmed", "الدفع لم يتم تأكيده"],
    text: ["Assalamu alaikum. I made a payment but it has not been confirmed on my account yet. Please check it for me.",
           "السلام عليكم، قمت بالدفع ولكن لم يتم تأكيده في حسابي بعد. أرجو التحقق من ذلك."] },
  { id: "app", emoji: "📱", subject: "App not working", category: "technical",
    label: ["The app isn't working", "التطبيق لا يعمل"],
    text: ["Assalamu alaikum. The app is not working properly for me. Something keeps failing or will not load.",
           "السلام عليكم، التطبيق لا يعمل بشكل صحيح معي؛ هناك شيء يتوقف باستمرار أو لا يتم تحميله."] },
  { id: "live", emoji: "🎥", subject: "Live class problem", category: "technical",
    label: ["Live class problem", "مشكلة في الحصة المباشرة"],
    text: ["Assalamu alaikum. I'm having trouble joining my live class, or I can't see or hear properly.",
           "السلام عليكم، أواجه مشكلة في دخول الحصة المباشرة أو لا أستطيع الرؤية أو السماع بشكل جيد."] },
  { id: "level", emoji: "🔁", subject: "Change level or class", category: "academic",
    label: ["Change my level or class", "تغيير مستواي أو فصلي"],
    text: ["Assalamu alaikum. I would like to request a change to my level or class. Please let me know how to proceed.",
           "السلام عليكم، أود طلب تغيير مستواي أو فصلي. أرجو إفادتي بالخطوات."] },
  { id: "other", emoji: "✍️", subject: "", category: "other",
    label: ["Something else", "شيء آخر"], text: null },
];

const TEACHER_SUGGESTIONS: Suggestion[] = [
  { id: "question", emoji: "❓", subject: "Question about the lesson", category: "academic",
    label: ["I have a question about the lesson", "لدي سؤال حول الدرس"],
    text: ["Assalamu alaikum, I have a question about the lesson. May I ask?",
           "السلام عليكم، لدي سؤال حول الدرس. هل يمكنني السؤال؟"] },
  { id: "assignment", emoji: "📝", subject: "Help with an assignment", category: "academic",
    label: ["Help with an assignment", "مساعدة في واجب"],
    text: ["Assalamu alaikum, I need some help with my assignment.",
           "السلام عليكم، أحتاج إلى مساعدة في الواجب."] },
  { id: "absent", emoji: "🗓️", subject: "Absence from class", category: "academic",
    label: ["I can't attend the next class", "لن أتمكن من حضور الحصة القادمة"],
    text: ["Assalamu alaikum, I will not be able to attend the next class. Please excuse me.",
           "السلام عليكم، لن أتمكن من حضور الحصة القادمة. أرجو المعذرة."] },
  { id: "practice", emoji: "💪", subject: "Extra practice", category: "academic",
    label: ["Ask for extra practice", "طلب تمارين إضافية"],
    text: ["Assalamu alaikum, could you give me some extra practice so I can improve?",
           "السلام عليكم، هل يمكنك إعطائي تمارين إضافية لأتحسن؟"] },
  { id: "recitation", emoji: "🎧", subject: "Recitation feedback", category: "academic",
    label: ["Review my recitation", "مراجعة تلاوتي"],
    text: ["Assalamu alaikum, could you please listen to my recitation and give me feedback?",
           "السلام عليكم، هل يمكنك الاستماع إلى تلاوتي وإبداء ملاحظاتك؟"] },
  { id: "other", emoji: "✍️", subject: "", category: "other",
    label: ["Something else", "شيء آخر"], text: null },
];

// ── Small helpers ──────────────────────────────────────────────────────
const fmtDT = (d: string) => new Date(d).toLocaleString("en-NG", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const fmtTime = (d: string) => new Date(d).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" });

const attachmentKind = (file: File): "image" | "video" | "audio" | "file" => {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return "file";
};

// Subject for a conversation that starts with a typed message.
const autoSubject = (text: string, hasFile: boolean) => {
  const line = (text.split("\n")[0] || "").trim();
  if (!line) return hasFile ? "Attachment" : "Support chat";
  return line.length > 60 ? line.slice(0, 57) + "…" : line;
};

const AttachmentBubble = ({ m }: { m: any }) => {
  if (!m.attachment_url) return null;
  const gap = m.message ? 6 : 0;
  if (m.attachment_type === "image") {
    return <img src={m.attachment_url} alt={m.attachment_name || "photo"} style={{ maxWidth: "100%", borderRadius: 10, display: "block", marginBottom: gap }} />;
  }
  if (m.attachment_type === "video") {
    return <video src={m.attachment_url} controls style={{ maxWidth: "100%", borderRadius: 10, display: "block", marginBottom: gap }} />;
  }
  if (m.attachment_type === "audio") {
    return <audio src={m.attachment_url} controls style={{ maxWidth: 220, display: "block", marginBottom: gap }} />;
  }
  return (
    <a href={m.attachment_url} target="_blank" rel="noreferrer" style={{
      display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", borderRadius: 8,
      background: "rgba(0,0,0,0.06)", color: "inherit", textDecoration: "none", fontSize: 12, fontWeight: 700,
      marginBottom: gap,
    }}>
      <FileText size={14} /> {m.attachment_name || "Attachment"}
    </a>
  );
};

type PendingMsg = {
  tempId: string;
  text: string;
  file: File | null;
  previewUrl: string | null;
  replyToId: string | null;
  subject?: string;
  category?: string;
  createdAt: string;
  status: "sending" | "failed";
};

type Draft = { type: "admin" | "teacher"; teacher?: any };

const SWIPE_ACTION_W = 64;

const StudentSupport = () => {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const myId = user?.id;

  const [view, setView] = useState<"list" | "teachers" | "chat">("list");
  const [activeTicket, setActiveTicket] = useState<any>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const [reply, setReply] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [replyingTo, setReplyingTo] = useState<any>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [pending, setPending] = useState<PendingMsg[]>([]);
  const [showJump, setShowJump] = useState(false);
  const [visTick, setVisTick] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const nearBottomRef = useRef(true);
  const lastMarkedRef = useRef("");
  const [highlightId, setHighlightId] = useState<string | null>(null);

  // Refs so an async send always sees the latest conversation, and so two
  // quick taps can never create two tickets.
  const activeTicketRef = useRef<any>(null);
  const draftRef = useRef<Draft | null>(null);
  const creatingRef = useRef<Promise<any> | null>(null);
  activeTicketRef.current = activeTicket;
  draftRef.current = draft;

  // ── Swipe-left-to-act on a bubble ────────────────────────────────────
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ id: string; dx: number } | null>(null);
  const dragStartX = useRef<number | null>(null);
  const dragStartOpen = useRef(0);
  const dragActive = useRef(false);

  const closeSwipe = () => { setOpenSwipeId(null); setDragOffset(null); };
  const swipeWidthFor = (n: number) => SWIPE_ACTION_W * n;
  const beginDrag = (id: string, x: number, n: number) => {
    dragStartX.current = x; dragActive.current = true;
    dragStartOpen.current = openSwipeId === id ? -swipeWidthFor(n) : 0;
  };
  const moveDrag = (id: string, x: number, n: number) => {
    if (dragStartX.current == null || !dragActive.current) return;
    const max = swipeWidthFor(n);
    setDragOffset({ id, dx: Math.max(-max, Math.min(0, dragStartOpen.current + (x - dragStartX.current))) });
  };
  const endDrag = (id: string, n: number) => {
    if (dragStartX.current == null) return;
    const max = swipeWidthFor(n);
    const finalDx = dragOffset?.id === id ? dragOffset.dx : dragStartOpen.current;
    dragStartX.current = null; dragActive.current = false;
    if (finalDx <= -max / 2) { setOpenSwipeId(id); setDragOffset({ id, dx: -max }); }
    else { setOpenSwipeId(null); setDragOffset({ id, dx: 0 }); }
  };

  // ── Data ─────────────────────────────────────────────────────────────
  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["support-tickets", myId],
    enabled: !!myId,
    queryFn: async () => {
      const { data } = await supabase
        .from("support_tickets" as any)
        .select("*, teacher:teacher_id(full_name, full_name_ar, avatar_url)")
        .eq("student_id", myId!)
        .order("updated_at", { ascending: false });
      return (data || []) as any[];
    },
    refetchInterval: 15000,
  });

  const { data: teachers = [], isLoading: teachersLoading } = useQuery({
    queryKey: ["support-teacher-directory"],
    enabled: view === "teachers",
    queryFn: async () => {
      // profiles.role directly — RLS on user_roles hides other users' roles
      // from a student, which used to make this list come back empty.
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, full_name, full_name_ar, avatar_url")
        .eq("role", "teacher")
        .order("full_name");
      return profs || [];
    },
  });

  const { otherTyping, otherOnline, live, sendTyping } = useSupportLive({
    ticketId: activeTicket?.id,
    userId: myId,
    onMessagesChange: () => {
      if (activeTicketRef.current) qc.invalidateQueries({ queryKey: ["support-thread", activeTicketRef.current.id] });
      qc.invalidateQueries({ queryKey: ["support-tickets", myId] });
    },
  });

  const threadQ = useQuery({
    queryKey: ["support-thread", activeTicket?.id],
    enabled: !!activeTicket,
    queryFn: async () => {
      const { data } = await supabase
        .from("support_ticket_messages" as any)
        .select("*")
        .eq("ticket_id", activeTicket.id)
        .order("created_at", { ascending: true });
      return (data || []) as any[];
    },
    // Realtime does the heavy lifting; the poll is only a safety net.
    refetchInterval: live ? 20000 : 6000,
  });
  const thread: any[] = threadQ.data || [];
  const threadLoading = !!activeTicket && threadQ.isLoading;

  // Live copy of the open ticket (status + read ticks) from the polled list.
  const liveTicket = activeTicket ? (tickets.find((tk: any) => tk.id === activeTicket.id) || activeTicket) : null;

  // Realtime for the conversation list / ticks / status.
  useEffect(() => {
    if (!myId) return;
    let ch: any;
    try {
      ch = supabase
        .channel(`student-support-list-${myId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets", filter: `student_id=eq.${myId}` },
          () => { qc.invalidateQueries({ queryKey: ["support-tickets", myId] }); })
        .subscribe();
    } catch {}
    return () => { try { if (ch) supabase.removeChannel(ch); } catch {} };
  }, [myId]);

  // Re-run "mark as read" when the app comes back to the foreground.
  useEffect(() => {
    const onVis = () => setVisTick(v => v + 1);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Keep the composer above the on-screen keyboard.
  useEffect(() => {
    if (view !== "chat") return;
    const bump = () => { composerRef.current?.scrollIntoView({ block: "end", behavior: "smooth" }); };
    const vv = window.visualViewport;
    vv?.addEventListener("resize", bump);
    return () => vv?.removeEventListener("resize", bump);
  }, [view]);

  // ── Scrolling ────────────────────────────────────────────────────────
  const scrollToBottom = (smooth = true) => {
    bottomRef.current?.scrollIntoView({ block: "end", behavior: smooth ? "smooth" : "auto" });
    setShowJump(false);
  };
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    nearBottomRef.current = near;
    if (near) setShowJump(false);
  };

  // New message / typing bubble / my own optimistic message.
  useEffect(() => {
    if (view !== "chat") return;
    const last = thread[thread.length - 1];
    const fromMe = pending.length > 0 || last?.sender_id === myId;
    if (nearBottomRef.current || fromMe) scrollToBottom(true);
    else if (last) setShowJump(true);
  }, [thread.length, pending.length, otherTyping, view]);

  // First paint of a conversation: jump (no animation) once messages load.
  useEffect(() => {
    if (view === "chat" && !threadLoading) { nearBottomRef.current = true; scrollToBottom(false); }
  }, [view, activeTicket?.id, threadLoading]);

  // Mark the conversation read the moment the latest message from staff is
  // on screen — including ones that arrive while the chat is open — so the
  // sender's ticks turn blue live.
  useEffect(() => {
    if (view !== "chat" || !activeTicket || !myId || thread.length === 0) return;
    const last = thread[thread.length - 1];
    if (last.sender_id === myId) return;
    if (document.visibilityState !== "visible") return;
    const key = `${activeTicket.id}:${last.id}`;
    if (lastMarkedRef.current === key) return;
    lastMarkedRef.current = key;
    (supabase.from("support_tickets" as any) as any)
      .update({ last_read_by_student_at: new Date().toISOString() })
      .eq("id", activeTicket.id)
      .then(() => qc.invalidateQueries({ queryKey: ["support-tickets", myId] }));
  }, [thread, view, activeTicket?.id, visTick]);

  // ── Navigation ───────────────────────────────────────────────────────
  const resetComposer = () => {
    setReply(""); setPendingFile(null); setReplyingTo(null); setEditingId(null); setEditText("");
    closeSwipe();
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };
  const dropPending = (list: PendingMsg[]) => {
    list.forEach(p => { if (p.previewUrl) { try { URL.revokeObjectURL(p.previewUrl); } catch {} } });
  };
  const clearPending = () => { setPending(prev => { dropPending(prev); return []; }); };

  const openTicket = (tkt: any) => {
    clearPending(); resetComposer();
    nearBottomRef.current = true; lastMarkedRef.current = "";
    setDraft(null); setActiveTicket(tkt); setView("chat");
  };
  const openDraft = (d: Draft) => {
    clearPending(); resetComposer();
    nearBottomRef.current = true; lastMarkedRef.current = "";
    setActiveTicket(null); setDraft(d); setView("chat");
  };
  const leaveChat = () => {
    sendTyping(false);
    clearPending(); resetComposer();
    setActiveTicket(null); setDraft(null); setView("list");
  };

  // Continue the open conversation with this recipient if there is one.
  const openAdminChat = () => {
    const existing = tickets.find((tk: any) => tk.recipient_type === "admin" && tk.status !== "resolved");
    if (existing) openTicket(existing); else openDraft({ type: "admin" });
  };
  const openTeacherChat = (tr: any) => {
    const existing = tickets.find((tk: any) =>
      tk.recipient_type === "teacher" && tk.teacher_id === tr.user_id && tk.status !== "resolved");
    if (existing) openTicket(existing); else openDraft({ type: "teacher", teacher: tr });
  };

  // Deep-link from a push notification: /student/support?ticket=<id>.
  useEffect(() => {
    const ticketId = searchParams.get("ticket");
    if (!ticketId || activeTicket || tickets.length === 0) return;
    const found = tickets.find((tk: any) => tk.id === ticketId);
    if (found) openTicket(found);
    setSearchParams(prev => { prev.delete("ticket"); return prev; }, { replace: true });
  }, [searchParams, tickets]);

  const isUnread = (tkt: any) =>
    !!tkt.last_sender_id && tkt.last_sender_id !== myId && tkt.last_message_at &&
    (!tkt.last_read_by_student_at || new Date(tkt.last_read_by_student_at) < new Date(tkt.last_message_at));

  const nameOf = (p: any) =>
    (language === "ar" && p?.full_name_ar) ? p.full_name_ar : (p?.full_name || t("Teacher", "معلم"));

  // ── Sending ──────────────────────────────────────────────────────────
  const uploadAttachment = async (ticketId: string, file: File) => {
    const kind = attachmentKind(file);
    const path = `${myId}/${ticketId}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("support-attachments").upload(path, file);
    if (error) throw error;
    const { data: pub } = supabase.storage.from("support-attachments").getPublicUrl(path);
    return { url: pub.publicUrl, kind, name: file.name };
  };

  // The conversation row is created here, by the first message — never by a form.
  const ensureTicket = async (subject: string, category: string) => {
    if (activeTicketRef.current) return activeTicketRef.current;
    if (creatingRef.current) return creatingRef.current;
    const d = draftRef.current;
    if (!d || !myId) throw new Error("No conversation selected");
    const p = (async () => {
      const { data, error } = await supabase
        .from("support_tickets" as any)
        .insert({
          student_id: myId, subject, category,
          recipient_type: d.type,
          teacher_id: d.type === "teacher" ? d.teacher.user_id : null,
        })
        .select().single();
      if (error) throw error;
      const created = {
        ...(data as any),
        teacher: d.type === "teacher"
          ? { full_name: d.teacher.full_name, full_name_ar: d.teacher.full_name_ar, avatar_url: d.teacher.avatar_url }
          : null,
      };
      activeTicketRef.current = created;
      setActiveTicket(created);
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["support-tickets", myId] });
      return created;
    })();
    creatingRef.current = p;
    try { return await p; } finally { creatingRef.current = null; }
  };

  const sendMessage = async (opts: {
    text: string; file?: File | null; replyToId?: string | null;
    subject?: string; category?: string; retryId?: string;
  }) => {
    if (!myId) return;
    const text = opts.text.trim();
    const file = opts.file ?? null;
    if (!text && !file) return;
    if (file && file.size > MAX_FILE_BYTES) {
      toast({ title: t("File is too large (max 25 MB)", "الملف كبير جداً (الحد 25 ميغابايت)"), variant: "destructive" });
      return;
    }

    const tempId = opts.retryId || `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    if (opts.retryId) {
      setPending(p => p.map(x => x.tempId === tempId ? { ...x, status: "sending" } : x));
    } else {
      const previewUrl = file && attachmentKind(file) === "image" ? URL.createObjectURL(file) : null;
      setPending(p => [...p, {
        tempId, text, file, previewUrl, replyToId: opts.replyToId ?? null,
        subject: opts.subject, category: opts.category,
        createdAt: new Date().toISOString(), status: "sending",
      }]);
    }

    try {
      const ticket = await ensureTicket(
        opts.subject || autoSubject(text, !!file),
        opts.category || "other",
      );
      let attachment: any = {};
      if (file) {
        const up = await uploadAttachment(ticket.id, file);
        attachment = { attachment_url: up.url, attachment_type: up.kind, attachment_name: up.name };
      }
      const row: any = { ticket_id: ticket.id, sender_id: myId, message: text, ...attachment };
      if (opts.replyToId) row.reply_to_id = opts.replyToId;
      const { error } = await supabase.from("support_ticket_messages" as any).insert(row);
      if (error) throw error;
      // Writing back in a resolved conversation reopens it.
      await supabase.from("support_tickets" as any).update({ status: "open" }).eq("id", ticket.id).eq("status", "resolved");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["support-thread", ticket.id] }),
        qc.invalidateQueries({ queryKey: ["support-tickets", myId] }),
      ]);
      setPending(p => {
        const gone = p.filter(x => x.tempId === tempId);
        dropPending(gone);
        return p.filter(x => x.tempId !== tempId);
      });
    } catch (e: any) {
      setPending(p => p.map(x => x.tempId === tempId ? { ...x, status: "failed" } : x));
      toast({ title: t("Could not send message", "تعذر إرسال الرسالة"), description: e?.message, variant: "destructive" });
    }
  };

  const retryPending = (p: PendingMsg) =>
    sendMessage({ text: p.text, file: p.file, replyToId: p.replyToId, subject: p.subject, category: p.category, retryId: p.tempId });
  const discardPending = (tempId: string) =>
    setPending(prev => { dropPending(prev.filter(x => x.tempId === tempId)); return prev.filter(x => x.tempId !== tempId); });

  const submitComposer = () => {
    if (!reply.trim() && !pendingFile) return;
    const text = reply, file = pendingFile, replyToId = replyingTo?.id ?? null;
    setReply(""); setPendingFile(null); setReplyingTo(null);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    sendTyping(false);
    sendMessage({ text, file, replyToId });
  };

  const pickSuggestion = (s: Suggestion) => {
    if (!s.text) { textareaRef.current?.focus(); return; }
    sendMessage({ text: t(s.text[0], s.text[1]), subject: s.subject, category: s.category });
  };

  // ── Message actions ──────────────────────────────────────────────────
  const autoGrow = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  const copyMessage = (text: string) => {
    navigator.clipboard?.writeText(text || "");
    toast({ title: t("Copied to clipboard", "تم النسخ") });
    closeSwipe();
  };

  const startReply = (m: any) => { setReplyingTo(m); closeSwipe(); textareaRef.current?.focus(); };

  const startEdit = (m: any) => {
    setEditingId(m.id); setEditText(m.message || ""); closeSwipe();
    setTimeout(() => { editTextareaRef.current?.focus(); autoGrow(editTextareaRef.current); }, 0);
  };
  const cancelEdit = () => { setEditingId(null); setEditText(""); };
  const saveEdit = async (id: string) => {
    const trimmed = editText.trim();
    if (!trimmed || !activeTicket) return;
    try {
      const { data, error } = await (supabase.from("support_ticket_messages" as any) as any)
        .update({ message: trimmed }).eq("id", id).select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error(t("Editing isn't allowed for this message", "لا يمكن تعديل هذه الرسالة"));
      qc.invalidateQueries({ queryKey: ["support-thread", activeTicket.id] });
      cancelEdit();
    } catch (e: any) {
      toast({ title: t("Could not save edit", "تعذر حفظ التعديل"), description: e?.message, variant: "destructive" });
    }
  };

  const deleteMessage = async (id: string) => {
    if (!activeTicket) return;
    if (!window.confirm(t("Delete this message? This can't be undone.", "حذف هذه الرسالة؟ لا يمكن التراجع عن ذلك."))) return;
    try {
      const { data, error } = await (supabase.from("support_ticket_messages" as any) as any)
        .delete().eq("id", id).select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error(t("You can only delete your own messages", "يمكنك حذف رسائلك فقط"));
      qc.invalidateQueries({ queryKey: ["support-thread", activeTicket.id] });
      qc.invalidateQueries({ queryKey: ["support-tickets", myId] });
    } catch (e: any) {
      toast({ title: t("Could not delete message", "تعذر حذف الرسالة"), description: e?.message, variant: "destructive" });
    } finally {
      closeSwipe();
    }
  };

  const scrollToMessage = (id: string) => {
    messageRefs.current[id]?.scrollIntoView({ block: "center", behavior: "smooth" });
    setHighlightId(id);
    setTimeout(() => setHighlightId(cur => (cur === id ? null : cur)), 1200);
  };

  const dayLabel = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    const y = new Date(); y.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return t("Today", "اليوم");
    if (d.toDateString() === y.toDateString()) return t("Yesterday", "أمس");
    return d.toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" });
  };

  const recipientLabel = (tkt: any) =>
    tkt.recipient_type === "teacher" ? nameOf(tkt.teacher) : t("Admin Support", "دعم الإدارة");

  const css = (
    <style>{`
      @keyframes spin{to{transform:rotate(360deg)}}
      @keyframes supportDot{0%,60%,100%{transform:translateY(0);opacity:.35}30%{transform:translateY(-4px);opacity:1}}
    `}</style>
  );
  const spinner = (size = 20) => <Loader2 size={size} style={{ animation: "spin .8s linear infinite", color: G }} />;
  const backBtn = (onClick: () => void) => (
    <button onClick={onClick} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, color: G, fontWeight: 700, fontSize: 13, padding: 0 }}>
      <ChevronLeft size={18} />
    </button>
  );

  // ══ CHAT ═════════════════════════════════════════════════════════════
  if (view === "chat" && (activeTicket || draft)) {
    const chatType: "admin" | "teacher" = activeTicket ? activeTicket.recipient_type : draft!.type;
    const teacherInfo = liveTicket ? liveTicket.teacher : draft?.teacher;
    const chatName = chatType === "teacher" ? nameOf(teacherInfo) : t("Admin Support", "دعم الإدارة");
    const cfg = liveTicket ? (STATUS_CFG[liveTicket.status] || STATUS_CFG.open) : null;
    const suggestions = chatType === "teacher" ? TEACHER_SUGGESTIONS : ADMIN_SUGGESTIONS;
    const isEmpty = !threadLoading && thread.length === 0 && pending.length === 0;
    const resolved = liveTicket?.status === "resolved";
    const isTouch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

    const subtitle = otherTyping
      ? <span style={{ color: "#16A34A", fontWeight: 700 }}>{t("typing…", "يكتب…")}</span>
      : otherOnline
        ? <span style={{ color: "#16A34A", fontWeight: 700 }}>● {t("Online now", "متصل الآن")}</span>
        : <span>{chatType === "teacher" ? t("Teacher", "معلم") : t("Support team", "فريق الدعم")}</span>;

    // pending messages the server already confirmed are hidden (no double bubble)
    const visiblePending = pending.filter(p =>
      !(p.status === "sending" && thread.some(m =>
        m.sender_id === myId && (m.message || "") === p.text &&
        new Date(m.created_at).getTime() >= new Date(p.createdAt).getTime() - 15000)));

    let lastDay = "";

    return (
      <div style={{ padding: "12px 16px 16px", maxWidth: 640, margin: "0 auto", fontFamily: "'Cairo', sans-serif", display: "flex", flexDirection: "column", height: "100%", boxSizing: "border-box" }}>
        {css}

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 10, borderBottom: `1px solid ${BORDER}`, marginBottom: 10 }}>
          {backBtn(leaveChat)}
          <div style={{ width: 40, height: 40, borderRadius: "50%", background: chatType === "admin" ? G : CREAM, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
            {chatType === "admin"
              ? <Shield size={18} color={GOLD} />
              : teacherInfo?.avatar_url
                ? <img src={teacherInfo.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <GraduationCap size={18} color={G} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: 15, fontWeight: 900, color: G, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{chatName}</h2>
            <p style={{ fontSize: 11, color: TL, margin: 0 }}>{subtitle}</p>
          </div>
          {cfg && (
            <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 20, background: cfg.bg, color: cfg.color, fontWeight: 800, flexShrink: 0 }}>
              {t(cfg.label, cfg.labelAr)}
            </span>
          )}
        </div>

        {/* Messages */}
        <div style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <div ref={scrollRef} onScroll={onScroll} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, padding: 10, background: CREAM, borderRadius: 16 }}>
            {threadLoading ? (
              <div style={{ textAlign: "center", padding: 30 }}>{spinner()}</div>
            ) : (
              <>
                {/* Welcome + suggestions, until the first message is sent */}
                {isEmpty && (
                  <>
                    <div style={{ alignSelf: "flex-start", maxWidth: "85%" }}>
                      <div style={{ padding: "10px 14px", borderRadius: 14, background: "#fff", border: `1px solid ${BORDER}`, fontSize: 13, color: "#111", lineHeight: 1.5 }}>
                        {chatType === "teacher"
                          ? t(`Assalamu alaikum! 👋 You're messaging ${chatName} directly. What would you like to ask?`,
                              `السلام عليكم! 👋 أنت تراسل ${chatName} مباشرة. ماذا تود أن تسأل؟`)
                          : t("Assalamu alaikum! 👋 How can we help you today?",
                              "السلام عليكم! 👋 كيف يمكننا مساعدتك اليوم؟")}
                        <div style={{ fontSize: 11, color: TL, marginTop: 4 }}>
                          {t("Tap an option below, or type your own message.", "اختر أحد الخيارات أدناه أو اكتب رسالتك.")}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                      {suggestions.map(s => (
                        <button key={s.id} onClick={() => pickSuggestion(s)} style={{
                          padding: "9px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
                          border: `1.5px solid ${s.text ? G : BORDER}`, background: s.text ? "#fff" : "transparent",
                          color: G, display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit",
                        }}>
                          <span>{s.emoji}</span> {t(s.label[0], s.label[1])}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {thread.map((m: any) => {
                  const mine = m.sender_id === myId;
                  const seen = mine && liveTicket?.last_read_by_admin_at && new Date(liveTicket.last_read_by_admin_at) >= new Date(m.created_at);
                  const hasText = !!m.message;
                  const canEdit = mine && hasText;
                  const canDelete = mine;
                  const actionCount = 1 + (hasText ? 1 : 0) + (canEdit ? 1 : 0) + (canDelete ? 1 : 0);
                  const maxOffset = swipeWidthFor(actionCount);
                  const offset = dragOffset?.id === m.id ? dragOffset.dx : (openSwipeId === m.id ? -maxOffset : 0);
                  const quoted = m.reply_to_id ? thread.find((x: any) => x.id === m.reply_to_id) : null;
                  const isEditing = editingId === m.id;

                  const dk = new Date(m.created_at).toDateString();
                  const showDay = dk !== lastDay;
                  lastDay = dk;

                  const actionBtn = (bg: string, onClick: () => void, icon: any) => (
                    <button onClick={onClick} style={{ width: SWIPE_ACTION_W, border: "none", cursor: "pointer", background: bg, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</button>
                  );

                  return (
                    <div key={m.id} style={{ display: "flex", flexDirection: "column" }}>
                      {showDay && (
                        <div style={{ alignSelf: "center", margin: "6px 0 10px", fontSize: 10, fontWeight: 800, color: TL, background: "rgba(15,45,31,0.06)", padding: "3px 12px", borderRadius: 20 }}>
                          {dayLabel(m.created_at)}
                        </div>
                      )}
                      <div
                        ref={el => { messageRefs.current[m.id] = el; }}
                        style={{
                          alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "82%", minWidth: isEditing ? "70%" : undefined,
                          borderRadius: 14, transition: "background-color .3s ease",
                          background: highlightId === m.id ? "rgba(201,168,76,0.3)" : "transparent",
                        }}
                      >
                        {isEditing ? (
                          <div style={{ padding: "9px 13px", borderRadius: 14, background: "#fff", border: `1.5px solid ${G}` }}>
                            <textarea
                              ref={editTextareaRef} value={editText} rows={1}
                              onChange={e => { setEditText(e.target.value); autoGrow(e.target as HTMLTextAreaElement); }}
                              onKeyDown={e => {
                                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveEdit(m.id); }
                                if (e.key === "Escape") cancelEdit();
                              }}
                              style={{ width: "100%", boxSizing: "border-box", border: "none", outline: "none", resize: "none", fontSize: 13, fontFamily: "inherit", color: "#111", maxHeight: 120, overflowY: "auto", background: "transparent" }}
                            />
                            <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 6 }}>
                              <button onClick={cancelEdit} style={{ padding: "5px 10px", borderRadius: 8, border: `1px solid ${BORDER}`, background: "#fff", color: "#6B7280", fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                                <X size={12} /> {t("Cancel", "إلغاء")}
                              </button>
                              <button onClick={() => saveEdit(m.id)} disabled={!editText.trim()} style={{ padding: "5px 10px", borderRadius: 8, border: "none", background: G, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                                <Check size={12} /> {t("Save", "حفظ")}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ position: "relative", overflow: "hidden", borderRadius: 14 }}>
                            <div style={{ position: "absolute", top: 0, bottom: 0, right: 0, display: "flex" }}>
                              {actionBtn("#2563EB", () => startReply(m), <Reply size={15} />)}
                              {canEdit && actionBtn("#D97706", () => startEdit(m), <Pencil size={15} />)}
                              {hasText && actionBtn("#6B7280", () => copyMessage(m.message), <Copy size={15} />)}
                              {canDelete && actionBtn("#DC2626", () => deleteMessage(m.id), <Trash2 size={15} />)}
                            </div>
                            <div
                              onPointerDown={e => beginDrag(m.id, e.clientX, actionCount)}
                              onPointerMove={e => moveDrag(m.id, e.clientX, actionCount)}
                              onPointerUp={() => endDrag(m.id, actionCount)}
                              onPointerCancel={() => endDrag(m.id, actionCount)}
                              onClick={() => { if (openSwipeId === m.id) closeSwipe(); }}
                              style={{
                                padding: "9px 13px", borderRadius: 14, position: "relative", touchAction: "pan-y",
                                background: mine ? G : "#fff", color: mine ? "#fff" : "#111",
                                border: mine ? "none" : `1px solid ${BORDER}`, fontSize: 13,
                                transform: `translateX(${offset}px)`,
                                transition: dragOffset?.id === m.id ? "none" : "transform 0.2s ease",
                                whiteSpace: "pre-wrap", wordBreak: "break-word",
                              }}
                            >
                              {quoted && (
                                <div onClick={e => { e.stopPropagation(); scrollToMessage(quoted.id); }} style={{ borderLeft: `3px solid ${mine ? "rgba(255,255,255,0.6)" : GOLD}`, paddingLeft: 8, marginBottom: 6, cursor: "pointer", opacity: 0.85 }}>
                                  <p style={{ margin: 0, fontSize: 11, fontWeight: 800 }}>{quoted.sender_id === myId ? t("You", "أنت") : chatName}</p>
                                  <p style={{ margin: 0, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>
                                    {quoted.message || (quoted.attachment_name ? `📎 ${quoted.attachment_name}` : t("Attachment", "مرفق"))}
                                  </p>
                                </div>
                              )}
                              <AttachmentBubble m={m} />
                              {m.message}
                            </div>
                          </div>
                        )}
                        <p style={{ fontSize: 9, color: TL, margin: "3px 4px 0", display: "flex", alignItems: "center", gap: 3, justifyContent: mine ? "flex-end" : "flex-start" }}>
                          {fmtTime(m.created_at)}
                          {m.edited_at && <span style={{ fontStyle: "italic" }}>· {t("edited", "معدّلة")}</span>}
                          {mine && <CheckCheck size={12} style={{ color: seen ? "#53BDEB" : TL, flexShrink: 0 }} />}
                        </p>
                      </div>
                    </div>
                  );
                })}

                {/* Optimistic (sending / failed) messages */}
                {visiblePending.map(p => (
                  <div key={p.tempId} style={{ alignSelf: "flex-end", maxWidth: "82%" }}>
                    <div style={{
                      padding: "9px 13px", borderRadius: 14, background: G, color: "#fff", fontSize: 13,
                      opacity: p.status === "sending" ? 0.7 : 1, whiteSpace: "pre-wrap", wordBreak: "break-word",
                      outline: p.status === "failed" ? "2px solid #DC2626" : "none",
                    }}>
                      {p.previewUrl && <img src={p.previewUrl} alt="" style={{ maxWidth: "100%", borderRadius: 10, display: "block", marginBottom: p.text ? 6 : 0 }} />}
                      {p.file && !p.previewUrl && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, marginBottom: p.text ? 6 : 0 }}>
                          <Paperclip size={13} /> {p.file.name}
                        </div>
                      )}
                      {p.text}
                    </div>
                    <p style={{ fontSize: 9, margin: "3px 4px 0", display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end", color: p.status === "failed" ? "#DC2626" : TL }}>
                      {p.status === "sending" ? (
                        <><Clock size={11} /> {t("Sending…", "جاري الإرسال…")}</>
                      ) : (
                        <>
                          <AlertCircle size={11} /> {t("Not sent", "لم تُرسل")}
                          <button onClick={() => retryPending(p)} style={{ background: "none", border: "none", cursor: "pointer", color: "#DC2626", fontWeight: 800, fontSize: 10, display: "flex", alignItems: "center", gap: 3, padding: 0 }}>
                            <RotateCcw size={10} /> {t("Retry", "إعادة")}
                          </button>
                          <button onClick={() => discardPending(p.tempId)} style={{ background: "none", border: "none", cursor: "pointer", color: TL, fontWeight: 700, fontSize: 10, padding: 0 }}>
                            {t("Discard", "حذف")}
                          </button>
                        </>
                      )}
                    </p>
                  </div>
                ))}

                {/* Typing indicator */}
                {otherTyping && (
                  <div style={{ alignSelf: "flex-start" }}>
                    <div style={{ display: "flex", gap: 4, padding: "11px 14px", borderRadius: 14, background: "#fff", border: `1px solid ${BORDER}` }}>
                      {[0, 1, 2].map(i => (
                        <span key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: TL, display: "block", animation: `supportDot 1.2s ${i * 0.2}s infinite ease-in-out` }} />
                      ))}
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </>
            )}
          </div>

          {showJump && (
            <button onClick={() => scrollToBottom(true)} style={{
              position: "absolute", right: 14, bottom: 12, display: "flex", alignItems: "center", gap: 4,
              padding: "7px 12px", borderRadius: 20, border: "none", cursor: "pointer",
              background: G, color: "#fff", fontSize: 11, fontWeight: 800, boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
            }}>
              <ChevronDown size={14} /> {t("New messages", "رسائل جديدة")}
            </button>
          )}
        </div>

        {/* Composer */}
        <div ref={composerRef} style={{ marginTop: 8 }}>
          {resolved && (
            <div style={{ fontSize: 11, color: "#16A34A", background: "#F0FDF4", borderRadius: 10, padding: "6px 10px", marginBottom: 6, fontWeight: 700 }}>
              ✓ {t("Marked as resolved. Send a message to reopen this conversation.", "تم وضع علامة تم الحل. أرسل رسالة لإعادة فتح المحادثة.")}
            </div>
          )}
          {replyingTo && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", marginBottom: 6, background: "#fff", borderRadius: 10, borderLeft: `3px solid ${G}`, border: `1px solid ${BORDER}` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 800, color: G }}>
                  {t("Replying to ", "الرد على ")}{replyingTo.sender_id === myId ? t("yourself", "نفسك") : chatName}
                </p>
                <p style={{ margin: 0, fontSize: 11, color: "#6B7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {replyingTo.message || (replyingTo.attachment_name ? `📎 ${replyingTo.attachment_name}` : t("Attachment", "مرفق"))}
                </p>
              </div>
              <button onClick={() => setReplyingTo(null)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexShrink: 0 }}><X size={14} /></button>
            </div>
          )}
          {pendingFile && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", marginBottom: 6, background: CREAM, borderRadius: 10, fontSize: 12 }}>
              <Paperclip size={13} />
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pendingFile.name}</span>
              <button onClick={() => setPendingFile(null)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex" }}><X size={14} /></button>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <input ref={fileInputRef} type="file" accept="image/*,video/*,audio/*,.pdf,.doc,.docx" style={{ display: "none" }}
              onChange={e => { setPendingFile(e.target.files?.[0] || null); e.target.value = ""; }} />
            <button onClick={() => fileInputRef.current?.click()} aria-label={t("Attach", "إرفاق")} style={{
              width: 40, height: 40, borderRadius: "50%", border: `1px solid ${BORDER}`, cursor: "pointer",
              background: "#fff", color: G, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <Paperclip size={16} />
            </button>
            <textarea
              ref={textareaRef} value={reply} rows={1}
              onChange={e => { setReply(e.target.value); autoGrow(e.target as HTMLTextAreaElement); sendTyping(e.target.value.length > 0); }}
              onFocus={() => setTimeout(() => composerRef.current?.scrollIntoView({ block: "end", behavior: "smooth" }), 300)}
              onKeyDown={e => {
                // Phones: Enter = new line. Desktop: Enter sends, Shift+Enter = new line.
                if (e.key === "Enter" && !e.shiftKey && !isTouch && !(e.nativeEvent as any).isComposing) {
                  e.preventDefault(); submitComposer();
                }
              }}
              placeholder={t("Type a message…", "اكتب رسالة…")}
              style={{
                flex: 1, padding: "10px 14px", borderRadius: 20, border: `1px solid ${BORDER}`, fontSize: 13,
                outline: "none", resize: "none", fontFamily: "inherit", maxHeight: 120, overflowY: "auto", lineHeight: 1.4, background: "#fff",
              }}
            />
            <button onClick={submitComposer} disabled={!reply.trim() && !pendingFile} aria-label={t("Send", "إرسال")} style={{
              width: 40, height: 40, borderRadius: "50%", border: "none",
              cursor: (!reply.trim() && !pendingFile) ? "default" : "pointer",
              background: (!reply.trim() && !pendingFile) ? "#9CA3AF" : G, color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ══ PICK A TEACHER ═══════════════════════════════════════════════════
  if (view === "teachers") {
    return (
      <div style={{ padding: "16px", maxWidth: 640, margin: "0 auto", fontFamily: "'Cairo', sans-serif" }}>
        {css}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          {backBtn(() => setView("list"))}
          <h2 style={{ fontSize: 18, fontWeight: 900, color: G, margin: 0 }}>{t("Choose a Teacher", "اختر معلماً")}</h2>
        </div>
        {teachersLoading ? (
          <div style={{ textAlign: "center", padding: 40 }}>{spinner(22)}</div>
        ) : teachers.length === 0 ? (
          <p style={{ fontSize: 13, color: TL }}>{t("No teachers available yet.", "لا يوجد معلمون متاحون بعد.")}</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {teachers.map((tr: any) => (
              <button key={tr.user_id} onClick={() => openTeacherChat(tr)} style={{
                textAlign: "start", display: "flex", alignItems: "center", gap: 12, padding: "13px 14px",
                background: "#fff", borderRadius: 14, border: `1.5px solid ${BORDER}`, cursor: "pointer", fontFamily: "inherit",
              }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: CREAM, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
                  {tr.avatar_url ? <img src={tr.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <GraduationCap size={16} color={G} />}
                </div>
                <p style={{ fontWeight: 700, fontSize: 13, color: "#111", margin: 0 }}>{nameOf(tr)}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ══ HOME: contacts + conversations ═══════════════════════════════════
  return (
    <div style={{ padding: "16px", maxWidth: 640, margin: "0 auto", fontFamily: "'Cairo', sans-serif" }}>
      {css}
      <h1 style={{ fontSize: 22, fontWeight: 900, color: G, margin: "0 0 4px" }}>{t("Help & Support", "المساعدة والدعم")}</h1>
      <p style={{ fontSize: 12, color: TL, margin: "0 0 16px" }}>{t("Chat with our team or message a teacher directly", "تحدّث مع فريقنا أو راسل معلماً مباشرة")}</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 22, opacity: isLoading ? 0.6 : 1, pointerEvents: isLoading ? "none" : "auto" }}>
        <button onClick={openAdminChat} style={{
          display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 16, border: "none",
          background: G, cursor: "pointer", textAlign: "start", fontFamily: "inherit",
        }}>
          <div style={{ width: 42, height: 42, borderRadius: "50%", background: "rgba(201,168,76,0.18)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Shield size={20} color={GOLD} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 800, fontSize: 14, color: "#fff", margin: 0 }}>{t("Chat with Admin Support", "تحدّث مع دعم الإدارة")}</p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", margin: "2px 0 0" }}>{t("Technical, payment or account help", "مساعدة تقنية أو مالية أو في الحساب")}</p>
          </div>
        </button>
        <button onClick={() => setView("teachers")} style={{
          display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 16,
          border: `1.5px solid ${BORDER}`, background: "#fff", cursor: "pointer", textAlign: "start", fontFamily: "inherit",
        }}>
          <div style={{ width: 42, height: 42, borderRadius: "50%", background: CREAM, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <GraduationCap size={20} color={G} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 800, fontSize: 14, color: "#111", margin: 0 }}>{t("Message a Teacher", "مراسلة معلم")}</p>
            <p style={{ fontSize: 11, color: TL, margin: "2px 0 0" }}>{t("Academic questions, straight to them", "أسئلة أكاديمية مباشرة إليه")}</p>
          </div>
        </button>
      </div>

      <h3 style={{ fontSize: 12, fontWeight: 800, color: TL, margin: "0 0 8px", letterSpacing: 0.3 }}>{t("YOUR CONVERSATIONS", "محادثاتك")}</h3>
      {isLoading ? (
        <div style={{ textAlign: "center", padding: 40 }}>{spinner(22)}</div>
      ) : tickets.length === 0 ? (
        <div style={{ textAlign: "center", padding: "36px 20px", background: "#fff", borderRadius: 18, border: `1px dashed ${BORDER}` }}>
          <LifeBuoy size={32} style={{ margin: "0 auto 10px", display: "block", opacity: 0.3, color: G }} />
          <p style={{ fontSize: 14, color: TL, margin: "0 0 4px" }}>{t("No conversations yet", "لا توجد محادثات بعد")}</p>
          <p style={{ fontSize: 12, color: "#bbb", margin: 0 }}>{t("Start a chat above", "ابدأ محادثة من الأعلى")}</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {tickets.map((tkt: any) => {
            const cfg = STATUS_CFG[tkt.status] || STATUS_CFG.open;
            const unread = isUnread(tkt);
            return (
              <button key={tkt.id} onClick={() => openTicket(tkt)} style={{
                textAlign: "start", display: "flex", alignItems: "center", gap: 12, padding: "13px 14px",
                background: "#fff", borderRadius: 14, border: `1.5px solid ${unread ? GOLD : BORDER}`, cursor: "pointer", fontFamily: "inherit",
              }}>
                <div style={{ width: 38, height: 38, borderRadius: "50%", background: tkt.recipient_type === "teacher" ? CREAM : G, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
                  {tkt.recipient_type === "teacher"
                    ? (tkt.teacher?.avatar_url ? <img src={tkt.teacher.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <GraduationCap size={17} color={G} />)
                    : <Shield size={17} color={GOLD} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {unread && <span style={{ width: 8, height: 8, borderRadius: "50%", background: GOLD, flexShrink: 0 }} />}
                    <p style={{ fontWeight: unread ? 900 : 700, fontSize: 13, color: "#111", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{recipientLabel(tkt)}</p>
                  </div>
                  <p style={{ fontSize: 11, color: TL, margin: "1px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tkt.subject}</p>
                  <p style={{ fontSize: 11, color: unread ? "#111" : "#9CA3AF", fontWeight: unread ? 700 : 400, margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {tkt.last_message_preview || t("No messages yet", "لا توجد رسائل بعد")}
                  </p>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                  <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 20, background: cfg.bg, color: cfg.color, fontWeight: 800 }}>
                    {t(cfg.label, cfg.labelAr)}
                  </span>
                  <p style={{ fontSize: 9, color: TL, margin: 0 }}>{fmtDT(tkt.last_message_at || tkt.updated_at)}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default StudentSupport;
