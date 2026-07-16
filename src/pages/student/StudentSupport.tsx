/*
  src/pages/student/StudentSupport.tsx — Tahleem Academy
  ──────────────────────────────────────────────────────────
  In-app help channel. Al-Majlis is student-to-student only, so there was
  previously no way for a student to reach staff from inside the app.

  Tables: support_tickets (one row per issue), support_ticket_messages
  (threaded conversation). RLS: students see/create only their own tickets;
  admins/teachers see and can reply to all.
*/

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { LifeBuoy, Plus, ChevronLeft, Send, Loader2, MessageSquare } from "lucide-react";

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

const StudentSupport = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [view, setView] = useState<"list" | "new" | "thread">("list");
  const [activeTicket, setActiveTicket] = useState<any>(null);
  const [subject, setSubject]   = useState("");
  const [category, setCategory] = useState("other");
  const [message, setMessage]   = useState("");
  const [reply, setReply]       = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["support-tickets", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("support_tickets" as any)
        .select("*")
        .eq("student_id", user!.id)
        .order("updated_at", { ascending: false });
      return (data || []) as any[];
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
  });

  const openTicket = (tkt: any) => { setActiveTicket(tkt); setView("thread"); };

  const submitTicket = async () => {
    if (!user || !subject.trim() || !message.trim()) {
      toast({ title: t("Please fill in subject and message", "يرجى ملء الموضوع والرسالة"), variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { data: tkt, error } = await supabase
        .from("support_tickets" as any)
        .insert({ student_id: user.id, subject: subject.trim(), category })
        .select().single();
      if (error) throw error;
      await supabase.from("support_ticket_messages" as any).insert({
        ticket_id: (tkt as any).id, sender_id: user.id, message: message.trim(),
      });
      // Let admins know a new ticket came in.
      const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
      const adminIds = [...new Set((admins || []).map((a: any) => a.user_id))];
      if (adminIds.length > 0) {
        await supabase.from("notifications").insert(adminIds.map(id => ({
          user_id: id, title: "New support ticket",
          message: `${subject.trim()} (${category})`,
          type: "info", link: "/admin/support-tickets", is_read: false,
        })));
      }
      toast({ title: t("Ticket submitted", "تم إرسال التذكرة") });
      setSubject(""); setMessage(""); setCategory("other");
      qc.invalidateQueries({ queryKey: ["support-tickets", user.id] });
      setView("list");
    } catch (e: any) {
      toast({ title: t("Could not submit ticket", "تعذر إرسال التذكرة"), description: e?.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const sendReply = async () => {
    if (!user || !activeTicket || !reply.trim()) return;
    setSubmitting(true);
    try {
      await supabase.from("support_ticket_messages" as any).insert({
        ticket_id: activeTicket.id, sender_id: user.id, message: reply.trim(),
      });
      await supabase.from("support_tickets" as any).update({ status: "open" }).eq("id", activeTicket.id).eq("status", "resolved");
      setReply("");
      qc.invalidateQueries({ queryKey: ["support-thread", activeTicket.id] });
      qc.invalidateQueries({ queryKey: ["support-tickets", user.id] });
    } catch (e: any) {
      toast({ title: t("Could not send message", "تعذر إرسال الرسالة"), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Thread view ───────────────────────────────────────────────────────
  if (view === "thread" && activeTicket) {
    const cfg = STATUS_CFG[activeTicket.status] || STATUS_CFG.open;
    return (
      <div style={{ padding: "16px", maxWidth: 640, margin: "0 auto", fontFamily: "'Cairo', sans-serif", display: "flex", flexDirection: "column", height: "calc(100dvh - 32px)" }}>
        <button onClick={() => setView("list")} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, color: G, fontWeight: 700, fontSize: 13, marginBottom: 12 }}>
          <ChevronLeft size={16} /> {t("Back", "رجوع")}
        </button>
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <h2 style={{ fontSize: 16, fontWeight: 900, color: G, margin: 0 }}>{activeTicket.subject}</h2>
            <span style={{ fontSize: 10, padding: "2px 9px", borderRadius: 20, background: cfg.bg, color: cfg.color, fontWeight: 800 }}>
              {t(cfg.label, cfg.labelAr)}
            </span>
          </div>
          <p style={{ fontSize: 11, color: TL, margin: 0 }}>{CATEGORIES.find(c => c.value === activeTicket.category)?.en || activeTicket.category}</p>
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
                  {m.message}
                </div>
                <p style={{ fontSize: 9, color: TL, margin: "3px 4px 0", textAlign: mine ? "right" : "left" }}>{fmtDT(m.created_at)}</p>
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 8, paddingTop: 8, borderTop: `1px solid ${BORDER}` }}>
          <input
            value={reply} onChange={e => setReply(e.target.value)}
            onKeyDown={e => e.key === "Enter" && sendReply()}
            placeholder={t("Type a message…", "اكتب رسالة…")}
            style={{ flex: 1, padding: "10px 14px", borderRadius: 20, border: `1px solid ${BORDER}`, fontSize: 13, outline: "none" }}
          />
          <button onClick={sendReply} disabled={submitting || !reply.trim()} style={{
            width: 40, height: 40, borderRadius: "50%", border: "none", cursor: "pointer",
            background: G, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <Send size={16} />
          </button>
        </div>
      </div>
    );
  }

  // ── New ticket form ──────────────────────────────────────────────────
  if (view === "new") {
    return (
      <div style={{ padding: "16px", maxWidth: 640, margin: "0 auto", fontFamily: "'Cairo', sans-serif" }}>
        <button onClick={() => setView("list")} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, color: G, fontWeight: 700, fontSize: 13, marginBottom: 16 }}>
          <ChevronLeft size={16} /> {t("Back", "رجوع")}
        </button>
        <h2 style={{ fontSize: 18, fontWeight: 900, color: G, margin: "0 0 16px" }}>{t("New Support Ticket", "تذكرة دعم جديدة")}</h2>

        <label style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 6 }}>{t("Subject", "الموضوع")}</label>
        <input value={subject} onChange={e => setSubject(e.target.value)} placeholder={t("Briefly describe the issue", "صف المشكلة باختصار")}
          style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: `1.5px solid ${BORDER}`, fontSize: 14, marginBottom: 14, boxSizing: "border-box" }} />

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

        <label style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 6 }}>{t("Message", "الرسالة")}</label>
        <textarea value={message} onChange={e => setMessage(e.target.value)} rows={6}
          placeholder={t("Explain what happened, and what you expected instead…", "اشرح ما حدث وما كنت تتوقعه…")}
          style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: `1.5px solid ${BORDER}`, fontSize: 14, marginBottom: 18, boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }} />

        <button onClick={submitTicket} disabled={submitting} style={{
          width: "100%", padding: "13px", borderRadius: 12, border: "none", cursor: submitting ? "not-allowed" : "pointer",
          background: submitting ? "#9CA3AF" : G, color: "#fff", fontWeight: 800, fontSize: 14,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          {submitting ? <><Loader2 size={15} style={{ animation: "spin .8s linear infinite" }} />{t("Submitting…", "جاري الإرسال…")}</> : t("Submit Ticket", "إرسال التذكرة")}
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
        <button onClick={() => setView("new")} style={{
          display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 20,
          border: "none", background: G, color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer",
        }}>
          <Plus size={14} /> {t("New", "جديد")}
        </button>
      </div>
      <p style={{ fontSize: 12, color: TL, margin: "0 0 20px" }}>{t("Reach our team directly for technical, payment, or account issues", "تواصل مع فريقنا مباشرة للمشاكل التقنية أو المالية أو الحساب")}</p>

      {isLoading ? (
        <div style={{ textAlign: "center", padding: 40 }}><Loader2 size={22} style={{ animation: "spin .8s linear infinite", color: G }} /></div>
      ) : tickets.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 20px", background: "#fff", borderRadius: 18, border: `1px dashed ${BORDER}` }}>
          <LifeBuoy size={36} style={{ margin: "0 auto 10px", display: "block", opacity: 0.3, color: G }} />
          <p style={{ fontSize: 14, color: TL, margin: "0 0 4px" }}>{t("No tickets yet", "لا توجد تذاكر بعد")}</p>
          <p style={{ fontSize: 12, color: "#bbb", margin: 0 }}>{t("Tap New to reach staff", "اضغط جديد للتواصل مع الفريق")}</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {tickets.map((tkt: any) => {
            const cfg = STATUS_CFG[tkt.status] || STATUS_CFG.open;
            return (
              <button key={tkt.id} onClick={() => openTicket(tkt)} style={{
                textAlign: "left", display: "flex", alignItems: "center", gap: 12, padding: "13px 14px",
                background: "#fff", borderRadius: 14, border: `1.5px solid ${BORDER}`, cursor: "pointer",
              }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: CREAM, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <MessageSquare size={16} color={G} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 700, fontSize: 13, color: "#111", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tkt.subject}</p>
                  <p style={{ fontSize: 11, color: TL, margin: "2px 0 0" }}>{fmtDT(tkt.updated_at)}</p>
                </div>
                <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 20, background: cfg.bg, color: cfg.color, fontWeight: 800, flexShrink: 0 }}>
                  {t(cfg.label, cfg.labelAr)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default StudentSupport;
