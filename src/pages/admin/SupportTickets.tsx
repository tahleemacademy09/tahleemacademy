/*
  src/pages/admin/SupportTickets.tsx — Tahleem Academy
  Admin inbox for the student help/support channel (support_tickets +
  support_ticket_messages). Teachers also have SELECT/UPDATE access per RLS
  but this UI is wired for admin nav only for now.
*/

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { LifeBuoy, ChevronLeft, Send, Loader2, MessageSquare, CheckCircle2 } from "lucide-react";

const G      = "#064E3B";
const BORDER = "#E5E7EB";

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  open:        { label: "Open",        color: "#D97706", bg: "#FFFBEB" },
  in_progress: { label: "In Progress", color: "#2563EB", bg: "#EFF6FF" },
  resolved:    { label: "Resolved",    color: "#16A34A", bg: "#F0FDF4" },
};
const CATEGORY_LABEL: Record<string, string> = {
  technical: "Technical", payment: "Payment", academic: "Academic", account: "Account", other: "Other",
};

const fmtDT = (d: string) => new Date(d).toLocaleString("en-NG", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

const SupportTickets = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [activeTicket, setActiveTicket] = useState<any>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["admin-support-tickets"],
    queryFn: async () => {
      const { data } = await supabase
        .from("support_tickets" as any)
        .select("*, profiles:student_id(full_name, email)")
        .order("updated_at", { ascending: false });
      return (data || []) as any[];
    },
    refetchInterval: 30000,
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
  });

  const filtered = tickets.filter(tk => tk.status === statusFilter);

  const setStatus = async (ticketId: string, status: string) => {
    await supabase.from("support_tickets" as any).update({ status }).eq("id", ticketId);
    qc.invalidateQueries({ queryKey: ["admin-support-tickets"] });
    if (activeTicket?.id === ticketId) setActiveTicket({ ...activeTicket, status });
  };

  const sendReply = async () => {
    if (!user || !activeTicket || !reply.trim()) return;
    setSending(true);
    try {
      await supabase.from("support_ticket_messages" as any).insert({
        ticket_id: activeTicket.id, sender_id: user.id, message: reply.trim(),
      });
      await supabase.from("notifications").insert({
        user_id: activeTicket.student_id, title: "Reply to your support ticket",
        message: `${activeTicket.subject}: ${reply.trim().slice(0, 80)}`,
        type: "info", link: "/student/support", is_read: false,
      });
      setReply("");
      qc.invalidateQueries({ queryKey: ["admin-support-thread", activeTicket.id] });
      qc.invalidateQueries({ queryKey: ["admin-support-tickets"] });
    } catch (e: any) {
      toast({ title: "Could not send reply", description: e?.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  // ── Thread view ───────────────────────────────────────────────────────
  if (activeTicket) {
    const cfg = STATUS_CFG[activeTicket.status] || STATUS_CFG.open;
    return (
      <div style={{ padding: "16px", maxWidth: 700, margin: "0 auto", fontFamily: "'Cairo', sans-serif", display: "flex", flexDirection: "column", height: "calc(100dvh - 32px)" }}>
        <button onClick={() => setActiveTicket(null)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, color: G, fontWeight: 700, fontSize: 13, marginBottom: 12 }}>
          <ChevronLeft size={16} /> Back to inbox
        </button>

        <div style={{ marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 900, color: G, margin: "0 0 2px" }}>{activeTicket.subject}</h2>
          <p style={{ fontSize: 12, color: "#9CA3AF", margin: 0 }}>
            {activeTicket.profiles?.full_name || "Student"} · {CATEGORY_LABEL[activeTicket.category] || activeTicket.category}
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
            return (
              <div key={m.id} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "80%" }}>
                {!mine && <p style={{ fontSize: 10, color: "#9CA3AF", margin: "0 4px 2px" }}>{m.profiles?.full_name || "Student"}</p>}
                <div style={{
                  padding: "9px 13px", borderRadius: 14,
                  background: mine ? G : "#fff", color: mine ? "#fff" : "#111",
                  border: mine ? "none" : `1px solid ${BORDER}`, fontSize: 13,
                }}>
                  {m.message}
                </div>
                <p style={{ fontSize: 9, color: "#9CA3AF", margin: "3px 4px 0", textAlign: mine ? "right" : "left" }}>{fmtDT(m.created_at)}</p>
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 8, paddingTop: 8, borderTop: `1px solid ${BORDER}` }}>
          <input
            value={reply} onChange={e => setReply(e.target.value)}
            onKeyDown={e => e.key === "Enter" && sendReply()}
            placeholder="Type a reply…"
            style={{ flex: 1, padding: "10px 14px", borderRadius: 20, border: `1px solid ${BORDER}`, fontSize: 13, outline: "none" }}
          />
          <button onClick={sendReply} disabled={sending || !reply.trim()} style={{
            width: 40, height: 40, borderRadius: "50%", border: "none", cursor: "pointer",
            background: G, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <Send size={16} />
          </button>
        </div>
      </div>
    );
  }

  // ── Inbox view ────────────────────────────────────────────────────────
  return (
    <div style={{ padding: "16px", maxWidth: 700, margin: "0 auto", fontFamily: "'Cairo', sans-serif" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <h1 style={{ fontSize: 22, fontWeight: 900, color: G, margin: "0 0 4px", display: "flex", alignItems: "center", gap: 8 }}>
        <LifeBuoy size={20} /> Support Tickets
      </h1>
      <p style={{ fontSize: 12, color: "#9CA3AF", margin: "0 0 16px" }}>Student help requests from the app</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {(["open", "in_progress", "resolved"] as const).map(s => {
          const count = tickets.filter(tk => tk.status === s).length;
          return (
            <button key={s} onClick={() => setStatusFilter(s)} style={{
              flex: 1, padding: "9px 4px", borderRadius: 10, fontSize: 12, fontWeight: 800, cursor: "pointer",
              border: `1.5px solid ${statusFilter === s ? STATUS_CFG[s].color : BORDER}`,
              background: statusFilter === s ? STATUS_CFG[s].bg : "#fff",
              color: statusFilter === s ? STATUS_CFG[s].color : "#9CA3AF",
            }}>
              {STATUS_CFG[s].label} ({count})
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div style={{ textAlign: "center", padding: 40 }}><Loader2 size={22} style={{ animation: "spin .8s linear infinite", color: G }} /></div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 20px", background: "#fff", borderRadius: 18, border: `1px dashed ${BORDER}` }}>
          <CheckCircle2 size={36} style={{ margin: "0 auto 10px", display: "block", opacity: 0.3, color: G }} />
          <p style={{ fontSize: 14, color: "#9CA3AF", margin: 0 }}>Nothing here</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((tkt: any) => (
            <button key={tkt.id} onClick={() => setActiveTicket(tkt)} style={{
              textAlign: "left", display: "flex", alignItems: "center", gap: 12, padding: "13px 14px",
              background: "#fff", borderRadius: 14, border: `1.5px solid ${BORDER}`, cursor: "pointer",
            }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "#F3F4F6", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <MessageSquare size={16} color={G} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 700, fontSize: 13, color: "#111", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tkt.subject}</p>
                <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>
                  {tkt.profiles?.full_name || "Student"} · {CATEGORY_LABEL[tkt.category] || tkt.category} · {fmtDT(tkt.updated_at)}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default SupportTickets;
