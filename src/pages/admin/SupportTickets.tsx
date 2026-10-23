/*
  src/pages/admin/SupportTickets.tsx — Tahleem Academy
  Admin inbox for the student help/support channel (support_tickets +
  support_ticket_messages). RLS scopes what actually comes back: an admin
  gets every ticket; a teacher (this same component is reused at
  /teacher/support) only gets threads where teacher_id = their own id, so
  no extra filtering is needed here — the query is identical either way.

  Unread badges, message previews, and attachment-type previews are kept
  in sync server-side by the sync_ticket_on_new_message DB trigger.
*/

import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { LifeBuoy, ChevronLeft, Send, Loader2, MessageSquare, CheckCircle2, Paperclip, X, FileText, Plus, GraduationCap, Shield, CheckCheck, Trash2, Copy, Users, Reply, Pencil, Check } from "lucide-react";

const G      = "#064E3B";
const GOLD   = "#c9a84c";
const BORDER = "#E5E7EB";

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  open:        { label: "Open",        color: "#D97706", bg: "#FFFBEB" },
  in_progress: { label: "In Progress", color: "#2563EB", bg: "#EFF6FF" },
  resolved:    { label: "Resolved",    color: "#16A34A", bg: "#F0FDF4" },
};
const CATEGORY_LABEL: Record<string, string> = {
  technical: "Technical", payment: "Payment", academic: "Academic", account: "Account", other: "Other",
};
const CATEGORIES = [
  { value: "technical", label: "Technical Issue" },
  { value: "payment",   label: "Payment" },
  { value: "academic",  label: "Academic" },
  { value: "account",   label: "Account" },
  { value: "other",     label: "Other" },
];

const fmtDT = (d: string) => new Date(d).toLocaleString("en-NG", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

const attachmentKind = (file: File): "image" | "video" | "audio" | "file" => {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return "file";
};

const AttachmentBubble = ({ m }: { m: any }) => {
  if (!m.attachment_url) return null;
  if (m.attachment_type === "image") {
    return <img src={m.attachment_url} alt={m.attachment_name || "photo"} style={{ maxWidth: "100%", borderRadius: 10, display: "block", marginBottom: m.message ? 6 : 0 }} />;
  }
  if (m.attachment_type === "video") {
    return <video src={m.attachment_url} controls style={{ maxWidth: "100%", borderRadius: 10, display: "block", marginBottom: m.message ? 6 : 0 }} />;
  }
  if (m.attachment_type === "audio") {
    return <audio src={m.attachment_url} controls style={{ maxWidth: 220, display: "block", marginBottom: m.message ? 6 : 0 }} />;
  }
  return (
    <a href={m.attachment_url} target="_blank" rel="noreferrer" style={{
      display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", borderRadius: 8,
      background: "rgba(0,0,0,0.06)", color: "inherit", textDecoration: "none", fontSize: 12, fontWeight: 700,
      marginBottom: m.message ? 6 : 0,
    }}>
      <FileText size={14} /> {m.attachment_name || "Attachment"}
    </a>
  );
};

const SupportTickets = () => {
  const { user, hasRole } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [activeTicket, setActiveTicket] = useState<any>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // ── Reply-to-a-message (quote) and edit-in-place ────────────────────────
  const [replyingTo, setReplyingTo] = useState<any>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [highlightId, setHighlightId] = useState<string | null>(null);

  // Auto-grow the composer textarea as the user types (WhatsApp-style),
  // capped so a long message scrolls internally instead of pushing the
  // page around.
  const autoGrow = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  // Keep the composer visible when the on-screen keyboard opens. Mobile
  // browsers resize the *visual* viewport (not the layout viewport) when
  // the keyboard shows, so a bottom-anchored composer inside a tall,
  // scrollable page can end up rendered behind the keyboard until the
  // page itself is scrolled — this keeps it in view automatically instead.
  useEffect(() => {
    if (!activeTicket) return;
    const scrollComposerIntoView = () => {
      composerRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
    };
    const vv = window.visualViewport;
    vv?.addEventListener("resize", scrollComposerIntoView);
    return () => vv?.removeEventListener("resize", scrollComposerIntoView);
  }, [activeTicket?.id]);

  const scrollToMessage = (id: string) => {
    messageRefs.current[id]?.scrollIntoView({ block: "center", behavior: "smooth" });
    setHighlightId(id);
    setTimeout(() => setHighlightId(cur => (cur === id ? null : cur)), 1200);
  };

  // ── Swipe-left-to-act on a message bubble (copy / delete) ───────────────
  // openSwipeId: which message is currently pinned open (revealing its
  // action buttons). dragOffset: the live position of whichever bubble is
  // actively being dragged, tracked separately so it can move with the
  // finger/cursor before snapping open or closed on release.
  const SWIPE_ACTION_W = 64;
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ id: string; dx: number } | null>(null);
  const dragStartX = useRef<number | null>(null);
  const dragStartOpen = useRef(0);
  const dragActive = useRef(false);

  const closeSwipe = () => { setOpenSwipeId(null); setDragOffset(null); };

  // Reply is always available; Edit only for the sender's own message;
  // Delete for the sender or an admin; Copy is always last.
  const swipeWidthFor = (actionCount: number) => SWIPE_ACTION_W * actionCount;

  const beginDrag = (id: string, clientX: number, actionCount: number) => {
    dragStartX.current = clientX;
    dragActive.current = true;
    dragStartOpen.current = openSwipeId === id ? -swipeWidthFor(actionCount) : 0;
  };
  const moveDrag = (id: string, clientX: number, actionCount: number) => {
    if (dragStartX.current == null || !dragActive.current) return;
    const delta = clientX - dragStartX.current;
    const max = swipeWidthFor(actionCount);
    const next = Math.max(-max, Math.min(0, dragStartOpen.current + delta));
    setDragOffset({ id, dx: next });
  };
  const endDrag = (id: string, actionCount: number) => {
    if (dragStartX.current == null) return;
    const max = swipeWidthFor(actionCount);
    const finalDx = dragOffset?.id === id ? dragOffset.dx : dragStartOpen.current;
    dragStartX.current = null;
    dragActive.current = false;
    if (finalDx <= -max / 2) { setOpenSwipeId(id); setDragOffset({ id, dx: -max }); }
    else { setOpenSwipeId(null); setDragOffset({ id, dx: 0 }); }
  };

  const deleteMessage = async (id: string) => {
    if (!activeTicket) return;
    if (!window.confirm("Delete this message? This can't be undone.")) return;
    try {
      await supabase.from("support_ticket_messages" as any).delete().eq("id", id);
      qc.invalidateQueries({ queryKey: ["admin-support-thread", activeTicket.id] });
      qc.invalidateQueries({ queryKey: ["admin-support-tickets"] });
    } catch (e: any) {
      toast({ title: "Could not delete message", description: e?.message, variant: "destructive" });
    } finally {
      closeSwipe();
    }
  };

  const copyMessage = (text: string) => {
    navigator.clipboard?.writeText(text || "");
    toast({ title: "Copied to clipboard" });
    closeSwipe();
  };

  const startEdit = (m: any) => {
    setEditingId(m.id);
    setEditText(m.message || "");
    closeSwipe();
    setTimeout(() => { editTextareaRef.current?.focus(); autoGrow(editTextareaRef.current); }, 0);
  };
  const cancelEdit = () => { setEditingId(null); setEditText(""); };
  const saveEdit = async (id: string) => {
    if (!activeTicket) return;
    const trimmed = editText.trim();
    if (!trimmed) return;
    try {
      await supabase.from("support_ticket_messages" as any).update({ message: trimmed }).eq("id", id);
      qc.invalidateQueries({ queryKey: ["admin-support-thread", activeTicket.id] });
      cancelEdit();
    } catch (e: any) {
      toast({ title: "Could not save edit", description: e?.message, variant: "destructive" });
    }
  };

  const startReply = (m: any) => { setReplyingTo(m); closeSwipe(); textareaRef.current?.focus(); };

  // ── Admin → Teacher DMs, and Teacher → Admin messages ───────────────────
  // Both directions are just a support_tickets row with student_id = the
  // sender's own uid — RLS already allows that (student_insert only checks
  // student_id = auth.uid(), no role restriction), and the same ownership
  // clause is what lets a non-admin sender see their own outgoing ticket
  // afterward (support_tickets.select already needs student_id = auth.uid()
  // so students can view tickets they open — that isn't role-gated, so it
  // covers a teacher's own ticket too). The reply-routing trigger already
  // knows to send an admin-owned ticket's replies back to
  // /admin/support-tickets instead of /student/support.
  // composeTarget picks which direction: "teacher" (admin only, via the
  // chooseTeacher step first) or "admin" (teacher only, straight to message).
  const [composeStep, setComposeStep] = useState<null | "chooseTeacher" | "message">(null);
  const [composeTarget, setComposeTarget] = useState<"teacher" | "admin">("teacher");
  const [selectedTeacher, setSelectedTeacher] = useState<any>(null);
  const [newSubject, setNewSubject] = useState("");
  const [newCategory, setNewCategory] = useState("other");
  const [newMessage, setNewMessage] = useState("");
  const [creating, setCreating] = useState(false);

  const { data: teacherDirectory = [], isLoading: teachersLoading } = useQuery({
    queryKey: ["support-teacher-directory"],
    enabled: composeStep === "chooseTeacher",
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, full_name, full_name_ar, avatar_url")
        .eq("role", "teacher")
        .order("full_name");
      return data || [];
    },
  });

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["admin-support-tickets"],
    queryFn: async () => {
      const { data } = await supabase
        .from("support_tickets" as any)
        .select("*, profiles:student_id(full_name, email), teacher:teacher_id(full_name)")
        .order("updated_at", { ascending: false });
      return (data || []) as any[];
    },
    refetchInterval: 8000,
  });

  const { data: thread = [], isLoading: threadLoading } = useQuery({
    queryKey: ["admin-support-thread", activeTicket?.id],
    enabled: !!activeTicket,
    queryFn: async () => {
      const { data } = await supabase
        .from("support_ticket_messages" as any)
        .select("*, profiles:sender_id(full_name)")
        .eq("ticket_id", activeTicket.id)
        .order("created_at", { ascending: true });
      return (data || []) as any[];
    },
    refetchInterval: 8000,
  });

  useEffect(() => {
    if (activeTicket) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [activeTicket?.id, thread.length]);

  const isUnread = (tkt: any) =>
    !!tkt.last_sender_id && tkt.last_sender_id !== user?.id && tkt.last_message_at &&
    (!tkt.last_read_by_admin_at || new Date(tkt.last_read_by_admin_at) < new Date(tkt.last_message_at));

  // For a ticket the current viewer started themselves (an admin→teacher DM
  // or a teacher→admin message, where student_id is the sender's own uid),
  // the usual "profiles:student_id" name would just be their own name —
  // show who it's addressed to instead.
  const ownerLabel = (tkt: any) =>
    tkt.student_id === user?.id
      ? (tkt.recipient_type === "teacher" ? `To: ${tkt.teacher?.full_name || "Teacher"}` : "To: Admin")
      : (tkt.profiles?.full_name || "Student");

  const openTicket = async (tkt: any) => {
    setActiveTicket(tkt);
    if (tkt.last_sender_id && tkt.last_sender_id !== user?.id) {
      await supabase.from("support_tickets" as any).update({ last_read_by_admin_at: new Date().toISOString() }).eq("id", tkt.id);
      qc.invalidateQueries({ queryKey: ["admin-support-tickets"] });
    }
  };

  // Deep-link from a push notification: /admin/support-tickets?ticket=<id>
  // (also reused as-is at /teacher/support) should land straight in that
  // thread instead of the inbox list. `tickets` is unfiltered by status,
  // so this finds the ticket regardless of which tab it lives under, then
  // flips statusFilter to match so "Back to inbox" shows the right tab.
  // The param is stripped right after so going back doesn't reopen it.
  useEffect(() => {
    const ticketId = searchParams.get("ticket");
    if (!ticketId || activeTicket || tickets.length === 0) return;
    const found = tickets.find((tk: any) => tk.id === ticketId);
    if (found) {
      openTicket(found);
      setStatusFilter(found.status);
    }
    setSearchParams(prev => { prev.delete("ticket"); return prev; }, { replace: true });
  }, [searchParams, tickets]);

  // "teacher_dm" is a pseudo status: it isn't a value of support_tickets.status,
  // it's a dedicated view for admins to see teacher↔student conversations
  // (recipient_type = "teacher") separately from tickets addressed to the
  // admin team. These never show up under an admin's Open/In Progress/
  // Resolved tabs — they only live in this dedicated tab, regardless of
  // status. That exclusion is admin-only, though: for a teacher, tickets
  // with recipient_type "teacher" ARE their own inbox (messages a student
  // or admin sent straight to them) — RLS already scopes `tickets` to just
  // their own rows, so a teacher must see all of them under the normal
  // status tabs, or they'd never see anything sent to them at all.
  const isAdmin = hasRole("admin");
  const isTeacher = hasRole("teacher");
  const filtered = statusFilter === "teacher_dm"
    ? tickets.filter(tk => tk.recipient_type === "teacher")
    : tickets.filter(tk => tk.status === statusFilter && (!isAdmin || tk.recipient_type !== "teacher"));
  const teacherDmCount = tickets.filter(tk => tk.recipient_type === "teacher").length;

  // ── Group the inbox by student (WhatsApp-style) ─────────────────────────
  // Only meaningful for an admin/teacher inbox, where several different
  // students' tickets show up side by side. A student's own inbox is just
  // their own outgoing tickets, so it stays a flat list.
  const groupByStudent = isAdmin || isTeacher;
  const [expandedGroupKey, setExpandedGroupKey] = useState<string | null>(null);

  const groupKeyFor = (tkt: any) =>
    tkt.student_id !== user?.id
      ? `student:${tkt.student_id}`
      : (tkt.recipient_type === "teacher" ? `teacher:${tkt.teacher_id}` : "admin");
  const groupLabelFor = (tkt: any) =>
    tkt.student_id !== user?.id
      ? (tkt.profiles?.full_name || "Student")
      : (tkt.recipient_type === "teacher" ? `To: ${tkt.teacher?.full_name || "Teacher"}` : "To: Admin");
  const groupInitials = (label: string) =>
    label.replace(/^To:\s*/, "").trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || "").join("") || "?";

  const groups = !groupByStudent ? [] : Object.values(
    filtered.reduce((acc: Record<string, any>, tkt: any) => {
      const key = groupKeyFor(tkt);
      if (!acc[key]) acc[key] = { key, label: groupLabelFor(tkt), tickets: [] as any[] };
      acc[key].tickets.push(tkt);
      return acc;
    }, {} as Record<string, any>)
  ).map((g: any) => {
    const sorted = [...g.tickets].sort((a: any, b: any) =>
      new Date(b.last_message_at || b.updated_at).getTime() - new Date(a.last_message_at || a.updated_at).getTime());
    return { ...g, tickets: sorted, unreadCount: sorted.filter((t: any) => isUnread(t)).length, latest: sorted[0] };
  }).sort((a: any, b: any) =>
    new Date(b.latest.last_message_at || b.latest.updated_at).getTime() - new Date(a.latest.last_message_at || a.latest.updated_at).getTime());

  const expandedGroup = groups.find((g: any) => g.key === expandedGroupKey) || null;

  const switchStatusFilter = (s: string) => { setStatusFilter(s); setExpandedGroupKey(null); };

  const setStatus = async (ticketId: string, status: string) => {
    await supabase.from("support_tickets" as any).update({ status }).eq("id", ticketId);
    qc.invalidateQueries({ queryKey: ["admin-support-tickets"] });
    if (activeTicket?.id === ticketId) setActiveTicket({ ...activeTicket, status });
  };

  const uploadAttachment = async (ticketId: string, file: File) => {
    const kind = attachmentKind(file);
    const path = `${user!.id}/${ticketId}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("support-attachments").upload(path, file);
    if (error) throw error;
    const { data: pub } = supabase.storage.from("support-attachments").getPublicUrl(path);
    return { url: pub.publicUrl, kind, name: file.name };
  };

  const sendReply = async () => {
    if (!user || !activeTicket || (!reply.trim() && !pendingFile)) return;
    setSending(true);
    try {
      let attachment: any = {};
      if (pendingFile) {
        setUploading(true);
        const up = await uploadAttachment(activeTicket.id, pendingFile);
        attachment = { attachment_url: up.url, attachment_type: up.kind, attachment_name: up.name };
        setUploading(false);
      }
      await supabase.from("support_ticket_messages" as any).insert({
        ticket_id: activeTicket.id, sender_id: user.id, message: reply.trim(),
        reply_to_id: replyingTo?.id ?? null, ...attachment,
      });
      // Notifying the student is handled by the notify_on_support_ticket_message_insert DB trigger.
      setReply(""); setPendingFile(null); setReplyingTo(null);
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      qc.invalidateQueries({ queryKey: ["admin-support-thread", activeTicket.id] });
      qc.invalidateQueries({ queryKey: ["admin-support-tickets"] });
    } catch (e: any) {
      toast({ title: "Could not send reply", description: e?.message, variant: "destructive" });
    } finally {
      setSending(false);
      setUploading(false);
    }
  };

  const startConversation = async () => {
    if (!user || !newSubject.trim() || !newMessage.trim()) return;
    if (composeTarget === "teacher" && !selectedTeacher) return;
    setCreating(true);
    try {
      const insertRow: any = composeTarget === "teacher"
        ? { student_id: user.id, subject: newSubject.trim(), recipient_type: "teacher", teacher_id: selectedTeacher.user_id, status: "open" }
        : { student_id: user.id, subject: newSubject.trim(), recipient_type: "admin", category: newCategory, status: "open" };
      const { data: ticket, error } = await supabase
        .from("support_tickets" as any)
        .insert(insertRow)
        .select()
        .single();
      if (error) throw error;
      await supabase.from("support_ticket_messages" as any).insert({ ticket_id: (ticket as any).id, sender_id: user.id, message: newMessage.trim() });
      qc.invalidateQueries({ queryKey: ["admin-support-tickets"] });
      setComposeStep(null); setSelectedTeacher(null); setNewSubject(""); setNewMessage(""); setNewCategory("other");
      setActiveTicket(ticket);
    } catch (e: any) {
      toast({ title: "Could not start conversation", description: e?.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  // ── Choose a teacher (new DM) ────────────────────────────────────────────
  if (composeStep === "chooseTeacher") {
    return (
      <div style={{ padding: "16px", maxWidth: 700, margin: "0 auto", fontFamily: "'Cairo', sans-serif" }}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <button onClick={() => setComposeStep(null)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, color: G, fontWeight: 700, fontSize: 13, marginBottom: 12 }}>
          <ChevronLeft size={16} /> Back
        </button>
        <h1 style={{ fontSize: 20, fontWeight: 900, color: G, margin: "0 0 16px" }}>Choose a Teacher</h1>
        {teachersLoading ? (
          <div style={{ textAlign: "center", padding: 40 }}><Loader2 size={22} style={{ animation: "spin .8s linear infinite", color: G }} /></div>
        ) : teacherDirectory.length === 0 ? (
          <p style={{ fontSize: 13, color: "#9CA3AF" }}>No teachers available yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {teacherDirectory.map((tc: any) => (
              <button key={tc.user_id} onClick={() => { setSelectedTeacher(tc); setComposeStep("message"); }} style={{
                textAlign: "left", display: "flex", alignItems: "center", gap: 12, padding: "13px 14px",
                background: "#fff", borderRadius: 14, border: `1.5px solid ${BORDER}`, cursor: "pointer",
              }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#F3F4F6", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <GraduationCap size={16} color={G} />
                </div>
                <p style={{ fontWeight: 700, fontSize: 13, color: "#111", margin: 0 }}>{tc.full_name || "Teacher"}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── New DM / message composer ────────────────────────────────────────────
  if (composeStep === "message") {
    const toAdmin = composeTarget === "admin";
    return (
      <div style={{ padding: "16px", maxWidth: 700, margin: "0 auto", fontFamily: "'Cairo', sans-serif" }}>
        <button onClick={() => { if (toAdmin) { setComposeStep(null); } else { setComposeStep("chooseTeacher"); setSelectedTeacher(null); } }} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, color: G, fontWeight: 700, fontSize: 13, marginBottom: 12 }}>
          <ChevronLeft size={16} /> Back
        </button>
        <h1 style={{ fontSize: 20, fontWeight: 900, color: G, margin: "0 0 4px" }}>{toAdmin ? "Message Admin" : `Message ${selectedTeacher?.full_name || "Teacher"}`}</h1>
        <p style={{ fontSize: 12, color: "#9CA3AF", margin: "0 0 16px" }}>{toAdmin ? "Send a question or issue to the admin team." : "This starts a direct message thread with this teacher."}</p>
        <input
          value={newSubject} onChange={e => setNewSubject(e.target.value)}
          placeholder="Subject"
          style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: `1px solid ${BORDER}`, fontSize: 13, outline: "none", marginBottom: 10, boxSizing: "border-box" }}
        />
        {toAdmin && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            {CATEGORIES.map(c => (
              <button key={c.value} onClick={() => setNewCategory(c.value)} style={{
                padding: "6px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
                border: `1.5px solid ${newCategory === c.value ? G : BORDER}`,
                background: newCategory === c.value ? G : "#fff", color: newCategory === c.value ? "#fff" : "#9CA3AF",
              }}>
                {c.label}
              </button>
            ))}
          </div>
        )}
        <textarea
          value={newMessage} onChange={e => setNewMessage(e.target.value)}
          placeholder="Type a message…" rows={5}
          style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: `1px solid ${BORDER}`, fontSize: 13, outline: "none", marginBottom: 12, boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }}
        />
        <button onClick={startConversation} disabled={creating || !newSubject.trim() || !newMessage.trim()} style={{
          width: "100%", padding: "12px", borderRadius: 12, border: "none", cursor: "pointer",
          background: G, color: "#fff", fontWeight: 800, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          {creating ? <Loader2 size={15} style={{ animation: "spin .8s linear infinite" }} /> : <Send size={15} />}
          Send
        </button>
      </div>
    );
  }

  // ── Thread view ───────────────────────────────────────────────────────
  if (activeTicket) {
    const cfg = STATUS_CFG[activeTicket.status] || STATUS_CFG.open;
    return (
      <div style={{ padding: "16px", maxWidth: 700, margin: "0 auto", fontFamily: "'Cairo', sans-serif", display: "flex", flexDirection: "column", height: "100%", boxSizing: "border-box" }}>
        <button onClick={() => setActiveTicket(null)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, color: G, fontWeight: 700, fontSize: 13, marginBottom: 12 }}>
          <ChevronLeft size={16} /> Back to inbox
        </button>

        <div style={{ marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 900, color: G, margin: "0 0 2px" }}>{activeTicket.subject}</h2>
          <p style={{ fontSize: 12, color: "#9CA3AF", margin: 0 }}>
            {ownerLabel(activeTicket)} · {activeTicket.recipient_type === "teacher" ? "Direct message" : (CATEGORY_LABEL[activeTicket.category] || activeTicket.category)}
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {(["open", "in_progress", "resolved"] as const).map(s => (
            <button key={s} onClick={() => setStatus(activeTicket.id, s)} style={{
              flex: 1, padding: "8px 4px", borderRadius: 10, fontSize: 11, fontWeight: 800, cursor: "pointer",
              border: `1.5px solid ${activeTicket.status === s ? STATUS_CFG[s].color : BORDER}`,
              background: activeTicket.status === s ? STATUS_CFG[s].bg : "#fff",
              color: activeTicket.status === s ? STATUS_CFG[s].color : "#9CA3AF",
            }}>
              {STATUS_CFG[s].label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, paddingBottom: 12 }}>
          {threadLoading ? (
            <div style={{ textAlign: "center", padding: 30 }}><Loader2 size={20} style={{ animation: "spin .8s linear infinite", color: G }} /></div>
          ) : thread.map((m: any) => {
            const mine = m.sender_id === user?.id;
            // The other side's read state lives on the ticket row
            // (last_read_by_student_at), not per-message. Look it up from
            // the live `tickets` list (polled every 8s) so the tick updates
            // without needing to reopen the thread.
            const liveTicket = tickets.find((tk: any) => tk.id === activeTicket.id) || activeTicket;
            const seen = mine && liveTicket.last_read_by_student_at && new Date(liveTicket.last_read_by_student_at) >= new Date(m.created_at);
            // Admins can moderate any message; everyone else can only
            // remove what they themselves sent. Only the sender can edit.
            const canDelete = mine || hasRole("admin");
            const canEdit = mine;
            const actionCount = 1 /* reply */ + (canEdit ? 1 : 0) + 1 /* copy */ + (canDelete ? 1 : 0);
            const maxOffset = swipeWidthFor(actionCount);
            const offset = dragOffset?.id === m.id ? dragOffset.dx : (openSwipeId === m.id ? -maxOffset : 0);
            const quoted = m.reply_to_id ? thread.find((t: any) => t.id === m.reply_to_id) : null;
            const isEditing = editingId === m.id;
            const isHighlighted = highlightId === m.id;
            return (
              <div
                key={m.id}
                ref={el => { messageRefs.current[m.id] = el; }}
                style={{
                  alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "80%", width: "100%",
                  transition: "background-color 0.3s ease", borderRadius: 14,
                  background: isHighlighted ? "rgba(201,168,76,0.25)" : "transparent",
                }}
              >
                {!mine && <p style={{ fontSize: 10, color: "#9CA3AF", margin: "0 4px 2px" }}>{m.profiles?.full_name || "Student"}</p>}
                {isEditing ? (
                  <div style={{ padding: "9px 13px", borderRadius: 14, background: "#fff", border: `1.5px solid ${G}` }}>
                    <textarea
                      ref={editTextareaRef}
                      value={editText}
                      onChange={e => { setEditText(e.target.value); autoGrow(e.target as HTMLTextAreaElement); }}
                      onKeyDown={e => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveEdit(m.id); }
                        if (e.key === "Escape") cancelEdit();
                      }}
                      rows={1}
                      style={{
                        width: "100%", boxSizing: "border-box", border: "none", outline: "none", resize: "none",
                        fontSize: 13, fontFamily: "inherit", color: "#111", maxHeight: 120, overflowY: "auto",
                      }}
                    />
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 6 }}>
                      <button onClick={cancelEdit} style={{
                        padding: "5px 10px", borderRadius: 8, border: `1px solid ${BORDER}`, background: "#fff",
                        color: "#6B7280", fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
                      }}>
                        <X size={12} /> Cancel
                      </button>
                      <button onClick={() => saveEdit(m.id)} disabled={!editText.trim()} style={{
                        padding: "5px 10px", borderRadius: 8, border: "none", background: G,
                        color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
                      }}>
                        <Check size={12} /> Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ position: "relative", overflow: "hidden", borderRadius: 14 }}>
                    <div style={{ position: "absolute", top: 0, bottom: 0, right: 0, display: "flex" }}>
                      <button onClick={() => startReply(m)} style={{
                        width: SWIPE_ACTION_W, border: "none", cursor: "pointer", background: "#2563EB", color: "#fff",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <Reply size={15} />
                      </button>
                      {canEdit && (
                        <button onClick={() => startEdit(m)} style={{
                          width: SWIPE_ACTION_W, border: "none", cursor: "pointer", background: "#D97706", color: "#fff",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          <Pencil size={15} />
                        </button>
                      )}
                      <button onClick={() => copyMessage(m.message)} style={{
                        width: SWIPE_ACTION_W, border: "none", cursor: "pointer", background: "#6B7280", color: "#fff",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <Copy size={15} />
                      </button>
                      {canDelete && (
                        <button onClick={() => deleteMessage(m.id)} style={{
                          width: SWIPE_ACTION_W, border: "none", cursor: "pointer", background: "#DC2626", color: "#fff",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          <Trash2 size={15} />
                        </button>
                      )}
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
                        <div
                          onClick={e => { e.stopPropagation(); scrollToMessage(quoted.id); }}
                          style={{
                            borderLeft: `3px solid ${mine ? "rgba(255,255,255,0.6)" : GOLD}`, paddingLeft: 8,
                            marginBottom: 6, cursor: "pointer", opacity: 0.85,
                          }}
                        >
                          <p style={{ margin: 0, fontSize: 11, fontWeight: 800 }}>
                            {quoted.sender_id === user?.id ? "You" : (quoted.profiles?.full_name || "Student")}
                          </p>
                          <p style={{
                            margin: 0, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis",
                            whiteSpace: "nowrap", maxWidth: 220,
                          }}>
                            {quoted.message || (quoted.attachment_name ? `📎 ${quoted.attachment_name}` : "Attachment")}
                          </p>
                        </div>
                      )}
                      <AttachmentBubble m={m} />
                      {m.message}
                    </div>
                  </div>
                )}
                <p style={{ fontSize: 9, color: "#9CA3AF", margin: "3px 4px 0", display: "flex", alignItems: "center", gap: 3, justifyContent: mine ? "flex-end" : "flex-start" }}>
                  {fmtDT(m.created_at)}
                  {m.edited_at && <span style={{ fontStyle: "italic" }}>· edited</span>}
                  {mine && <CheckCheck size={12} style={{ color: seen ? "#53BDEB" : "#9CA3AF", flexShrink: 0 }} />}
                </p>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        <div ref={composerRef}>
          {replyingTo && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", marginBottom: 6,
              background: "#F3F4F6", borderRadius: 10, borderLeft: `3px solid ${G}`,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 800, color: G }}>
                  Replying to {replyingTo.sender_id === user?.id ? "yourself" : (replyingTo.profiles?.full_name || "Student")}
                </p>
                <p style={{ margin: 0, fontSize: 11, color: "#6B7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {replyingTo.message || (replyingTo.attachment_name ? `📎 ${replyingTo.attachment_name}` : "Attachment")}
                </p>
              </div>
              <button onClick={() => setReplyingTo(null)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexShrink: 0 }}><X size={14} /></button>
            </div>
          )}
          {pendingFile && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", marginBottom: 6, background: "#F3F4F6", borderRadius: 10, fontSize: 12 }}>
              <Paperclip size={13} /> <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pendingFile.name}</span>
              <button onClick={() => setPendingFile(null)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex" }}><X size={14} /></button>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, paddingTop: 8, borderTop: `1px solid ${BORDER}`, alignItems: "flex-end" }}>
            <input ref={fileInputRef} type="file" accept="image/*,video/*,audio/*" style={{ display: "none" }}
              onChange={e => setPendingFile(e.target.files?.[0] || null)} />
            <button onClick={() => fileInputRef.current?.click()} style={{
              width: 40, height: 40, borderRadius: "50%", border: `1px solid ${BORDER}`, cursor: "pointer",
              background: "#fff", color: G, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <Paperclip size={16} />
            </button>
            <textarea
              ref={textareaRef}
              value={reply}
              onChange={e => { setReply(e.target.value); autoGrow(e.target as HTMLTextAreaElement); }}
              onFocus={() => setTimeout(() => composerRef.current?.scrollIntoView({ block: "end", behavior: "smooth" }), 300)}
              onKeyDown={e => {
                // Enter alone inserts a newline (like WhatsApp's mobile keyboard);
                // Cmd/Ctrl+Enter sends, for people typing on a physical keyboard.
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendReply(); }
              }}
              placeholder="Type a reply…"
              rows={1}
              style={{
                flex: 1, padding: "10px 14px", borderRadius: 20, border: `1px solid ${BORDER}`, fontSize: 13,
                outline: "none", resize: "none", fontFamily: "inherit", maxHeight: 120, overflowY: "auto", lineHeight: 1.4,
              }}
            />
            <button onClick={sendReply} disabled={sending || (!reply.trim() && !pendingFile)} style={{
              width: 40, height: 40, borderRadius: "50%", border: "none", cursor: "pointer",
              background: G, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              {uploading ? <Loader2 size={15} style={{ animation: "spin .8s linear infinite" }} /> : <Send size={16} />}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Inbox view ────────────────────────────────────────────────────────
  return (
    <div style={{ padding: "16px", maxWidth: 700, margin: "0 auto", fontFamily: "'Cairo', sans-serif" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: G, margin: "0 0 4px", display: "flex", alignItems: "center", gap: 8 }}>
            <LifeBuoy size={20} /> Support Tickets
          </h1>
          <p style={{ fontSize: 12, color: "#9CA3AF", margin: "0 0 16px" }}>Student help requests and direct messages from the app</p>
        </div>
        {hasRole("admin") ? (
          <button onClick={() => { setComposeTarget("teacher"); setComposeStep("chooseTeacher"); }} style={{
            display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 10, flexShrink: 0,
            border: "none", cursor: "pointer", background: G, color: "#fff", fontWeight: 800, fontSize: 12,
          }}>
            <Plus size={14} /> Message a Teacher
          </button>
        ) : (
          <button onClick={() => { setComposeTarget("admin"); setNewCategory("other"); setComposeStep("message"); }} style={{
            display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 10, flexShrink: 0,
            border: "none", cursor: "pointer", background: G, color: "#fff", fontWeight: 800, fontSize: 12,
          }}>
            <Shield size={14} /> Message Admin
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {(["open", "in_progress", "resolved"] as const).map(s => {
          const count = tickets.filter(tk => tk.status === s && (!isAdmin || tk.recipient_type !== "teacher")).length;
          return (
            <button key={s} onClick={() => switchStatusFilter(s)} style={{
              flex: 1, padding: "9px 4px", borderRadius: 10, fontSize: 12, fontWeight: 800, cursor: "pointer",
              border: `1.5px solid ${statusFilter === s ? STATUS_CFG[s].color : BORDER}`,
              background: statusFilter === s ? STATUS_CFG[s].bg : "#fff",
              color: statusFilter === s ? STATUS_CFG[s].color : "#9CA3AF",
            }}>
              {STATUS_CFG[s].label} ({count})
            </button>
          );
        })}
        {/* Admin-only: teacher↔student DMs, pulled out of the status tabs
            above so admin can monitor them as their own section regardless
            of a thread's open/in-progress/resolved state. */}
        {hasRole("admin") && (
          <button onClick={() => switchStatusFilter("teacher_dm")} style={{
            flex: 1, padding: "9px 4px", borderRadius: 10, fontSize: 12, fontWeight: 800, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
            border: `1.5px solid ${statusFilter === "teacher_dm" ? "#7C3AED" : BORDER}`,
            background: statusFilter === "teacher_dm" ? "#F5F3FF" : "#fff",
            color: statusFilter === "teacher_dm" ? "#7C3AED" : "#9CA3AF",
          }}>
            <Users size={12} /> Teacher↔Student ({teacherDmCount})
          </button>
        )}
      </div>

      {isLoading ? (
        <div style={{ textAlign: "center", padding: 40 }}><Loader2 size={22} style={{ animation: "spin .8s linear infinite", color: G }} /></div>
      ) : groupByStudent ? (
        // ── Grouped-by-student view (admin/teacher inbox) ──────────────────
        expandedGroup ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button onClick={() => setExpandedGroupKey(null)} style={{
              background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
              color: G, fontWeight: 700, fontSize: 13, marginBottom: 4, padding: 0,
            }}>
              <ChevronLeft size={16} /> {expandedGroup.label}
            </button>
            {expandedGroup.tickets.map((tkt: any) => {
              const unread = isUnread(tkt);
              return (
                <button key={tkt.id} onClick={() => openTicket(tkt)} style={{
                  textAlign: "left", display: "flex", alignItems: "center", gap: 12, padding: "13px 14px",
                  background: "#fff", borderRadius: 14, border: `1.5px solid ${unread ? GOLD : BORDER}`, cursor: "pointer",
                }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: "#F3F4F6", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <MessageSquare size={16} color={G} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      {unread && <span style={{ color: GOLD, fontWeight: 900, fontSize: 14, lineHeight: 1 }}>*</span>}
                      <p style={{ fontWeight: unread ? 900 : 700, fontSize: 13, color: "#111", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tkt.subject}</p>
                    </div>
                    <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>
                      {tkt.recipient_type === "teacher" ? "Direct message" : (CATEGORY_LABEL[tkt.category] || tkt.category)}
                    </p>
                    <p style={{ fontSize: 11, color: unread ? "#111" : "#9CA3AF", fontWeight: unread ? 700 : 400, margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {tkt.last_message_preview || "No messages yet"}
                    </p>
                  </div>
                  <p style={{ fontSize: 9, color: "#9CA3AF", margin: 0, flexShrink: 0 }}>{fmtDT(tkt.last_message_at || tkt.updated_at)}</p>
                </button>
              );
            })}
          </div>
        ) : groups.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 20px", background: "#fff", borderRadius: 18, border: `1px dashed ${BORDER}` }}>
            <CheckCircle2 size={36} style={{ margin: "0 auto 10px", display: "block", opacity: 0.3, color: G }} />
            <p style={{ fontSize: 14, color: "#9CA3AF", margin: 0 }}>Nothing here</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {groups.map((g: any) => (
              <button key={g.key} onClick={() => setExpandedGroupKey(g.key)} style={{
                textAlign: "left", display: "flex", alignItems: "center", gap: 12, padding: "13px 14px",
                background: "#fff", borderRadius: 14, border: `1.5px solid ${g.unreadCount > 0 ? GOLD : BORDER}`, cursor: "pointer",
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: "50%", background: G, color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 13, fontWeight: 800,
                }}>
                  {groupInitials(g.label)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: g.unreadCount > 0 ? 900 : 700, fontSize: 13, color: "#111", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {g.label}
                    {g.tickets.length > 1 && <span style={{ fontWeight: 400, color: "#9CA3AF" }}> · {g.tickets.length} chats</span>}
                  </p>
                  <p style={{ fontSize: 11, color: g.unreadCount > 0 ? "#111" : "#9CA3AF", fontWeight: g.unreadCount > 0 ? 700 : 400, margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {g.latest.subject}{g.latest.last_message_preview ? ` — ${g.latest.last_message_preview}` : ""}
                  </p>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                  <p style={{ fontSize: 9, color: "#9CA3AF", margin: 0 }}>{fmtDT(g.latest.last_message_at || g.latest.updated_at)}</p>
                  {g.unreadCount > 0 && (
                    <span style={{
                      minWidth: 20, height: 20, padding: "0 5px", borderRadius: 10, background: "#DC2626", color: "#fff",
                      fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {g.unreadCount}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 20px", background: "#fff", borderRadius: 18, border: `1px dashed ${BORDER}` }}>
          <CheckCircle2 size={36} style={{ margin: "0 auto 10px", display: "block", opacity: 0.3, color: G }} />
          <p style={{ fontSize: 14, color: "#9CA3AF", margin: 0 }}>Nothing here</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((tkt: any) => {
            const unread = isUnread(tkt);
            return (
              <button key={tkt.id} onClick={() => openTicket(tkt)} style={{
                textAlign: "left", display: "flex", alignItems: "center", gap: 12, padding: "13px 14px",
                background: "#fff", borderRadius: 14, border: `1.5px solid ${unread ? GOLD : BORDER}`, cursor: "pointer",
              }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "#F3F4F6", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <MessageSquare size={16} color={G} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    {unread && <span style={{ color: GOLD, fontWeight: 900, fontSize: 14, lineHeight: 1 }}>*</span>}
                    <p style={{ fontWeight: unread ? 900 : 700, fontSize: 13, color: "#111", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tkt.subject}</p>
                  </div>
                  <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>
                    {ownerLabel(tkt)}
                    {tkt.recipient_type === "teacher" && tkt.student_id !== user?.id && (
                      <> → {tkt.teacher?.full_name || "Teacher"}</>
                    )}
                    {" · "}{tkt.recipient_type === "teacher" ? "Direct message" : (CATEGORY_LABEL[tkt.category] || tkt.category)}
                  </p>
                  <p style={{ fontSize: 11, color: unread ? "#111" : "#9CA3AF", fontWeight: unread ? 700 : 400, margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {tkt.last_message_preview || "No messages yet"}
                  </p>
                </div>
                <p style={{ fontSize: 9, color: "#9CA3AF", margin: 0, flexShrink: 0 }}>{fmtDT(tkt.last_message_at || tkt.updated_at)}</p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SupportTickets;
