/*
  src/pages/student/StudentSupport.tsx — Tahleem Academy
  ──────────────────────────────────────────────────────────
  In-app help channel. Al-Majlis is student-to-student only, so there was
  previously no way for a student to reach staff (or a specific teacher)
  from inside the app.

  Tables: support_tickets (one row per thread — either to Admin or to one
  named teacher via recipient_type/teacher_id), support_ticket_messages
  (threaded conversation, with optional image/video/audio/file attachment).
  RLS: students see/create only their own tickets; admins see everything;
  a teacher only sees threads addressed to them.

  Unread badges, message previews and attachment-type previews are all kept
  in sync server-side by the sync_ticket_on_new_message DB trigger — this
  page just reads last_message_preview / last_message_at / last_sender_id /
  last_read_by_student_at and marks its own side read on open.
*/

import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import {
  LifeBuoy, Plus, ChevronLeft, Send, Loader2, MessageSquare,
  Paperclip, X, FileText, Shield, GraduationCap,
} from "lucide-react";

const G      = "#0f2d1f";
const GOLD   = "#c9a84c";
const CREAM  = "#faf6ee";
const BORDER = "rgba(15,45,31,0.1)";
const TL     = "#7a9e88";

const CATEGORIES = [
  { value: "technical", en: "Technical Issue",  ar: "مشكلة تقنية" },
  { value: "payment",   en: "Payment",           ar: "الدفع" },
  { value: "academic",  en: "Academic",          ar: "أكاديمي" },
  { value: "account",   en: "Account",           ar: "الحساب" },
  { value: "other",     en: "Other",             ar: "أخرى" },
];

const STATUS_CFG: Record<string, { label: string; labelAr: string; color: string; bg: string }> = {
  open:        { label: "Open",        labelAr: "مفتوحة",  color: "#D97706", bg: "#FFFBEB" },
  in_progress: { label: "In Progress", labelAr: "قيد المعالجة", color: "#2563EB", bg: "#EFF6FF" },
  resolved:    { label: "Resolved",    labelAr: "تم الحل", color: "#16A34A", bg: "#F0FDF4" },
};

const fmtDT = (d: string) => new Date(d).toLocaleString("en-NG", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

// Everything a message bubble needs to show an attachment, keyed by the
// attachment_type column the DB trigger already understands.
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

const StudentSupport = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const [view, setView] = useState<"list" | "recipient" | "teachers" | "new" | "thread">("list");
  const [activeTicket, setActiveTicket] = useState<any>(null);
  const [recipientType, setRecipientType] = useState<"admin" | "teacher">("admin");
  const [selectedTeacher, setSelectedTeacher] = useState<any>(null);
  const [subject, setSubject]   = useState("");
  const [category, setCategory] = useState("other");
  const [message, setMessage]   = useState("");
  const [reply, setReply]       = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["support-tickets", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("support_tickets" as any)
        .select("*, teacher:teacher_id(full_name, full_name_ar)")
        .eq("student_id", user!.id)
        .order("updated_at", { ascending: false });
      return (data || []) as any[];
    },
    refetchInterval: 20000,
  });

  const { data: teachers = [], isLoading: teachersLoading } = useQuery({
    queryKey: ["support-teacher-directory"],
    enabled: view === "teachers",
    queryFn: async () => {
      // Reads profiles.role directly (matches the pattern already used in
      // admin/TeacherPayments.tsx). The previous version went through
      // user_roles, but RLS on that table only lets an admin view all rows
      // or a user view their own — a student querying role='teacher' always
      // got back zero rows, hence "No teachers available yet." for everyone.
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, full_name, full_name_ar, avatar_url")
        .eq("role", "teacher")
        .order("full_name");
      return profs || [];
    },
  });

  const { data: thread = [], isLoading: threadLoading } = useQuery({
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
    refetchInterval: 8000,
  });

  // Jump to the latest message the moment a thread opens, and again every
  // time a new one arrives — not until then does the student have to
  // scroll manually.
  useEffect(() => {
    if (view === "thread") bottomRef.current?.scrollIntoView({ block: "end" });
  }, [view, activeTicket?.id, thread.length]);

  // Mark this thread read on our side the moment it's opened, so the
  // asterisk clears immediately instead of waiting on the next poll.
  const openTicket = async (tkt: any) => {
    setActiveTicket(tkt);
    setView("thread");
    if (tkt.last_sender_id && tkt.last_sender_id !== user?.id) {
      await supabase.from("support_tickets" as any).update({ last_read_by_student_at: new Date().toISOString() }).eq("id", tkt.id);
      qc.invalidateQueries({ queryKey: ["support-tickets", user?.id] });
    }
  };

  // Deep-link from a push notification: /student/support?ticket=<id> should
  // land straight in that thread instead of the inbox list. Runs once the
  // tickets have loaded, and strips the param immediately after so "Back
  // to inbox" behaves normally rather than re-opening the same thread.
  useEffect(() => {
    const ticketId = searchParams.get("ticket");
    if (!ticketId || activeTicket || tickets.length === 0) return;
    const found = tickets.find((t: any) => t.id === ticketId);
    if (found) openTicket(found);
    setSearchParams(prev => { prev.delete("ticket"); return prev; }, { replace: true });
  }, [searchParams, tickets]);

  const isUnread = (tkt: any) =>
    !!tkt.last_sender_id && tkt.last_sender_id !== user?.id && tkt.last_message_at &&
    (!tkt.last_read_by_student_at || new Date(tkt.last_read_by_student_at) < new Date(tkt.last_message_at));

  const uploadAttachment = async (ticketId: string, file: File) => {
    const kind = attachmentKind(file);
    const path = `${user!.id}/${ticketId}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("support-attachments").upload(path, file);
    if (error) throw error;
    const { data: pub } = supabase.storage.from("support-attachments").getPublicUrl(path);
    return { url: pub.publicUrl, kind, name: file.name };
  };

  const submitTicket = async () => {
    if (!user || !subject.trim() || !message.trim()) {
      toast({ title: t("Please fill in subject and message", "يرجى ملء الموضوع والرسالة"), variant: "destructive" });
      return;
    }
    if (recipientType === "teacher" && !selectedTeacher) {
      toast({ title: t("Pick a teacher first", "اختر معلماً أولاً"), variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { data: tkt, error } = await supabase
        .from("support_tickets" as any)
        .insert({
          student_id: user.id, subject: subject.trim(), category,
          recipient_type: recipientType,
          teacher_id: recipientType === "teacher" ? selectedTeacher.user_id : null,
        })
        .select().single();
      if (error) throw error;

      let attachment: any = {};
      if (pendingFile) {
        setUploading(true);
        const up = await uploadAttachment((tkt as any).id, pendingFile);
        attachment = { attachment_url: up.url, attachment_type: up.kind, attachment_name: up.name };
        setUploading(false);
      }
      await supabase.from("support_ticket_messages" as any).insert({
        ticket_id: (tkt as any).id, sender_id: user.id, message: message.trim(), ...attachment,
      });
      // Notifications for the recipient are handled by DB triggers now.
      toast({ title: t("Message sent", "تم إرسال الرسالة") });
      setSubject(""); setMessage(""); setCategory("other"); setPendingFile(null); setSelectedTeacher(null);
      qc.invalidateQueries({ queryKey: ["support-tickets", user.id] });
      setView("list");
    } catch (e: any) {
      toast({ title: t("Could not send", "تعذر الإرسال"), description: e?.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  };

  const sendReply = async () => {
    if (!user || !activeTicket || (!reply.trim() && !pendingFile)) return;
    setSubmitting(true);
    try {
      let attachment: any = {};
      if (pendingFile) {
        setUploading(true);
        const up = await uploadAttachment(activeTicket.id, pendingFile);
        attachment = { attachment_url: up.url, attachment_type: up.kind, attachment_name: up.name };
        setUploading(false);
      }
      await supabase.from("support_ticket_messages" as any).insert({
        ticket_id: activeTicket.id, sender_id: user.id, message: reply.trim(), ...attachment,
      });
      await supabase.from("support_tickets" as any).update({ status: "open" }).eq("id", activeTicket.id).eq("status", "resolved");
      setReply(""); setPendingFile(null);
      qc.invalidateQueries({ queryKey: ["support-thread", activeTicket.id] });
      qc.invalidateQueries({ queryKey: ["support-tickets", user.id] });
    } catch (e: any) {
      toast({ title: t("Could not send message", "تعذر إرسال الرسالة"), variant: "destructive" });
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  };

  const recipientLabel = (tkt: any) =>
    tkt.recipient_type === "teacher"
      ? (t("Teacher: ", "المعلم: ") + (tkt.teacher?.full_name || t("Teacher", "معلم")))
      : t("Admin Support", "دعم الإدارة");

  // ── Thread view ───────────────────────────────────────────────────────
  if (view === "thread" && activeTicket) {
    const cfg = STATUS_CFG[activeTicket.status] || STATUS_CFG.open;
    return (
      <div style={{ padding: "16px", maxWidth: 640, margin: "0 auto", fontFamily: "'Cairo', sans-serif", display: "flex", flexDirection: "column", height: "calc(100dvh - 32px)" }}>
        <button onClick={() => { setActiveTicket(null); setView("list"); }} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, color: G, fontWeight: 700, fontSize: 13, marginBottom: 12 }}>
          <ChevronLeft size={16} /> {t("Back", "رجوع")}
        </button>
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <h2 style={{ fontSize: 16, fontWeight: 900, color: G, margin: 0 }}>{activeTicket.subject}</h2>
            <span style={{ fontSize: 10, padding: "2px 9px", borderRadius: 20, background: cfg.bg, color: cfg.color, fontWeight: 800 }}>
              {t(cfg.label, cfg.labelAr)}
            </span>
          </div>
          <p style={{ fontSize: 11, color: TL, margin: 0 }}>{recipientLabel(activeTicket)} · {CATEGORIES.find(c => c.value === activeTicket.category)?.en || activeTicket.category}</p>
        </div>

        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, paddingBottom: 12 }}>
          {threadLoading ? (
            <div style={{ textAlign: "center", padding: 30 }}><Loader2 size={20} style={{ animation: "spin .8s linear infinite", color: G }} /></div>
          ) : thread.map((m: any) => {
            const mine = m.sender_id === user?.id;
            return (
              <div key={m.id} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "80%" }}>
                <div style={{
                  padding: "9px 13px", borderRadius: 14,
                  background: mine ? G : "#fff", color: mine ? "#fff" : "#111",
                  border: mine ? "none" : `1px solid ${BORDER}`, fontSize: 13,
                }}>
                  <AttachmentBubble m={m} />
                  {m.message}
                </div>
                <p style={{ fontSize: 9, color: TL, margin: "3px 4px 0", textAlign: mine ? "right" : "left" }}>{fmtDT(m.created_at)}</p>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {pendingFile && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", marginBottom: 6, background: CREAM, borderRadius: 10, fontSize: 12 }}>
            <Paperclip size={13} /> <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pendingFile.name}</span>
            <button onClick={() => setPendingFile(null)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex" }}><X size={14} /></button>
          </div>
        )}
        <div style={{ display: "flex", gap: 8, paddingTop: 8, borderTop: `1px solid ${BORDER}` }}>
          <input ref={fileInputRef} type="file" accept="image/*,video/*,audio/*" style={{ display: "none" }}
            onChange={e => setPendingFile(e.target.files?.[0] || null)} />
          <button onClick={() => fileInputRef.current?.click()} style={{
            width: 40, height: 40, borderRadius: "50%", border: `1px solid ${BORDER}`, cursor: "pointer",
            background: "#fff", color: G, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <Paperclip size={16} />
          </button>
          <input
            value={reply} onChange={e => setReply(e.target.value)}
            onKeyDown={e => e.key === "Enter" && sendReply()}
            placeholder={t("Type a message…", "اكتب رسالة…")}
            style={{ flex: 1, padding: "10px 14px", borderRadius: 20, border: `1px solid ${BORDER}`, fontSize: 13, outline: "none" }}
          />
          <button onClick={sendReply} disabled={submitting || (!reply.trim() && !pendingFile)} style={{
            width: 40, height: 40, borderRadius: "50%", border: "none", cursor: "pointer",
            background: G, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            {uploading ? <Loader2 size={15} style={{ animation: "spin .8s linear infinite" }} /> : <Send size={16} />}
          </button>
        </div>
      </div>
    );
  }

  // ── Pick a teacher ───────────────────────────────────────────────────
  if (view === "teachers") {
    return (
      <div style={{ padding: "16px", maxWidth: 640, margin: "0 auto", fontFamily: "'Cairo', sans-serif" }}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <button onClick={() => setView("recipient")} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, color: G, fontWeight: 700, fontSize: 13, marginBottom: 16 }}>
          <ChevronLeft size={16} /> {t("Back", "رجوع")}
        </button>
        <h2 style={{ fontSize: 18, fontWeight: 900, color: G, margin: "0 0 16px" }}>{t("Choose a Teacher", "اختر معلماً")}</h2>
        {teachersLoading ? (
          <div style={{ textAlign: "center", padding: 40 }}><Loader2 size={22} style={{ animation: "spin .8s linear infinite", color: G }} /></div>
        ) : teachers.length === 0 ? (
          <p style={{ fontSize: 13, color: TL }}>{t("No teachers available yet.", "لا يوجد معلمون متاحون بعد.")}</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {teachers.map((tr: any) => (
              <button key={tr.user_id} onClick={() => { setSelectedTeacher(tr); setView("new"); }} style={{
                textAlign: "left", display: "flex", alignItems: "center", gap: 12, padding: "13px 14px",
                background: "#fff", borderRadius: 14, border: `1.5px solid ${BORDER}`, cursor: "pointer",
              }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: CREAM, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
                  {tr.avatar_url ? <img src={tr.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <GraduationCap size={16} color={G} />}
                </div>
                <p style={{ fontWeight: 700, fontSize: 13, color: "#111", margin: 0 }}>{tr.full_name || t("Teacher", "معلم")}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Choose recipient ─────────────────────────────────────────────────
  if (view === "recipient") {
    return (
      <div style={{ padding: "16px", maxWidth: 640, margin: "0 auto", fontFamily: "'Cairo', sans-serif" }}>
        <button onClick={() => setView("list")} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, color: G, fontWeight: 700, fontSize: 13, marginBottom: 16 }}>
          <ChevronLeft size={16} /> {t("Back", "رجوع")}
        </button>
        <h2 style={{ fontSize: 18, fontWeight: 900, color: G, margin: "0 0 16px" }}>{t("Who do you want to reach?", "من تريد التواصل معه؟")}</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button onClick={() => { setRecipientType("admin"); setSelectedTeacher(null); setView("new"); }} style={{
            display: "flex", alignItems: "center", gap: 12, padding: "16px", borderRadius: 14, border: `1.5px solid ${BORDER}`,
            background: "#fff", cursor: "pointer", textAlign: "left",
          }}>
            <Shield size={20} color={G} />
            <div>
              <p style={{ fontWeight: 800, fontSize: 14, color: "#111", margin: 0 }}>{t("Admin Support", "دعم الإدارة")}</p>
              <p style={{ fontSize: 12, color: TL, margin: "2px 0 0" }}>{t("Technical, payment, or account issues", "مشاكل تقنية أو مالية أو الحساب")}</p>
            </div>
          </button>
          <button onClick={() => { setRecipientType("teacher"); setView("teachers"); }} style={{
            display: "flex", alignItems: "center", gap: 12, padding: "16px", borderRadius: 14, border: `1.5px solid ${BORDER}`,
            background: "#fff", cursor: "pointer", textAlign: "left",
          }}>
            <GraduationCap size={20} color={G} />
            <div>
              <p style={{ fontWeight: 800, fontSize: 14, color: "#111", margin: 0 }}>{t("Message a Teacher", "مراسلة معلم")}</p>
              <p style={{ fontSize: 12, color: TL, margin: "2px 0 0" }}>{t("Academic questions, straight to them", "أسئلة أكاديمية مباشرة إليه")}</p>
            </div>
          </button>
        </div>
      </div>
    );
  }

  // ── New ticket form ──────────────────────────────────────────────────
  if (view === "new") {
    return (
      <div style={{ padding: "16px", maxWidth: 640, margin: "0 auto", fontFamily: "'Cairo', sans-serif" }}>
        <button onClick={() => setView(recipientType === "teacher" ? "teachers" : "recipient")} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, color: G, fontWeight: 700, fontSize: 13, marginBottom: 16 }}>
          <ChevronLeft size={16} /> {t("Back", "رجوع")}
        </button>
        <h2 style={{ fontSize: 18, fontWeight: 900, color: G, margin: "0 0 4px" }}>
          {recipientType === "teacher" ? t("Message Teacher", "مراسلة المعلم") : t("New Support Ticket", "تذكرة دعم جديدة")}
        </h2>
        {recipientType === "teacher" && selectedTeacher && (
          <p style={{ fontSize: 12, color: TL, margin: "0 0 16px" }}>{t("To: ", "إلى: ")}{selectedTeacher.full_name}</p>
        )}
        {recipientType === "admin" && <div style={{ marginBottom: 16 }} />}

        <label style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 6 }}>{t("Subject", "الموضوع")}</label>
        <input value={subject} onChange={e => setSubject(e.target.value)} placeholder={t("Briefly describe the issue", "صف المشكلة باختصار")}
          style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: `1.5px solid ${BORDER}`, fontSize: 14, marginBottom: 14, boxSizing: "border-box" }} />

        {recipientType === "admin" && (
          <>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 6 }}>{t("Category", "الفئة")}</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
              {CATEGORIES.map(c => (
                <button key={c.value} onClick={() => setCategory(c.value)} style={{
                  padding: "7px 13px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
                  border: `1.5px solid ${category === c.value ? G : BORDER}`,
                  background: category === c.value ? G : "#fff", color: category === c.value ? "#fff" : G,
                }}>
                  {t(c.en, c.ar)}
                </button>
              ))}
            </div>
          </>
        )}

        <label style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 6 }}>{t("Message", "الرسالة")}</label>
        <textarea value={message} onChange={e => setMessage(e.target.value)} rows={6}
          placeholder={t("Explain what happened, and what you expected instead…", "اشرح ما حدث وما كنت تتوقعه…")}
          style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: `1.5px solid ${BORDER}`, fontSize: 14, marginBottom: 10, boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }} />

        <input ref={fileInputRef} type="file" accept="image/*,video/*,audio/*" style={{ display: "none" }}
          onChange={e => setPendingFile(e.target.files?.[0] || null)} />
        <button onClick={() => fileInputRef.current?.click()} style={{
          display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 10, marginBottom: 18,
          border: `1.5px dashed ${BORDER}`, background: "#fff", color: G, fontSize: 12, fontWeight: 700, cursor: "pointer",
        }}>
          <Paperclip size={14} /> {pendingFile ? pendingFile.name : t("Attach photo, video, or audio", "إرفاق صورة أو فيديو أو صوت")}
        </button>

        <button onClick={submitTicket} disabled={submitting} style={{
          width: "100%", padding: "13px", borderRadius: 12, border: "none", cursor: submitting ? "not-allowed" : "pointer",
          background: submitting ? "#9CA3AF" : G, color: "#fff", fontWeight: 800, fontSize: 14,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          {submitting ? <><Loader2 size={15} style={{ animation: "spin .8s linear infinite" }} />{uploading ? t("Uploading…", "جاري الرفع…") : t("Sending…", "جاري الإرسال…")}</> : t("Send", "إرسال")}
        </button>
      </div>
    );
  }

  // ── List view ─────────────────────────────────────────────────────────
  return (
    <div style={{ padding: "16px", maxWidth: 640, margin: "0 auto", fontFamily: "'Cairo', sans-serif" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: G, margin: 0 }}>{t("Help & Support", "المساعدة والدعم")}</h1>
        <button onClick={() => setView("recipient")} style={{
          display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 20,
          border: "none", background: G, color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer",
        }}>
          <Plus size={14} /> {t("New", "جديد")}
        </button>
      </div>
      <p style={{ fontSize: 12, color: TL, margin: "0 0 20px" }}>{t("Reach our team or message a teacher directly", "تواصل مع فريقنا أو راسل معلماً مباشرة")}</p>

      {isLoading ? (
        <div style={{ textAlign: "center", padding: 40 }}><Loader2 size={22} style={{ animation: "spin .8s linear infinite", color: G }} /></div>
      ) : tickets.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 20px", background: "#fff", borderRadius: 18, border: `1px dashed ${BORDER}` }}>
          <LifeBuoy size={36} style={{ margin: "0 auto 10px", display: "block", opacity: 0.3, color: G }} />
          <p style={{ fontSize: 14, color: TL, margin: "0 0 4px" }}>{t("No conversations yet", "لا توجد محادثات بعد")}</p>
          <p style={{ fontSize: 12, color: "#bbb", margin: 0 }}>{t("Tap New to reach staff or a teacher", "اضغط جديد للتواصل مع الفريق أو معلم")}</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {tickets.map((tkt: any) => {
            const cfg = STATUS_CFG[tkt.status] || STATUS_CFG.open;
            const unread = isUnread(tkt);
            return (
              <button key={tkt.id} onClick={() => openTicket(tkt)} style={{
                textAlign: "left", display: "flex", alignItems: "center", gap: 12, padding: "13px 14px",
                background: "#fff", borderRadius: 14, border: `1.5px solid ${unread ? GOLD : BORDER}`, cursor: "pointer",
                position: "relative",
              }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: CREAM, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {tkt.recipient_type === "teacher" ? <GraduationCap size={16} color={G} /> : <MessageSquare size={16} color={G} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    {unread && <span style={{ color: GOLD, fontWeight: 900, fontSize: 14, lineHeight: 1 }}>*</span>}
                    <p style={{ fontWeight: unread ? 900 : 700, fontSize: 13, color: "#111", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tkt.subject}</p>
                  </div>
                  <p style={{ fontSize: 11, color: TL, margin: "2px 0 0" }}>{recipientLabel(tkt)}</p>
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
