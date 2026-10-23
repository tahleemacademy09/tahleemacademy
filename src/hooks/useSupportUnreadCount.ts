/*  src/hooks/useSupportUnreadCount.ts

    How many Help / Support threads are waiting for THIS person to read.
    Uses exactly the same rule as the support pages themselves:
      a thread is unread when its last message was sent by someone else AND it
      is newer than this side's last_read_* timestamp.

      student -> their own tickets            (last_read_by_student_at)
      teacher -> tickets addressed to them    (last_read_by_admin_at - the teacher
                 inbox is the admin SupportTickets component, so it shares that field)
      admin   -> tickets addressed to Admin   (last_read_by_admin_at); direct
                 student->teacher messages are not the admin's to answer, so they
                 are not counted here.

    The badge refreshes every 8s (same as the support pages), on window focus,
    on every route change, and instantly when support_tickets changes (realtime).
*/
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type SupportRole = "student" | "teacher" | "admin";

export const useSupportUnreadCount = (role: SupportRole): number => {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const uid = user?.id;

  const { data = 0, refetch } = useQuery({
    queryKey: ["support-unread", role, uid],
    enabled: !!uid,
    refetchInterval: 8000,
    refetchOnWindowFocus: true,
    staleTime: 4000,
    queryFn: async () => {
      let q: any = supabase
        .from("support_tickets" as any)
        .select("id, student_id, teacher_id, recipient_type, last_sender_id, last_message_at, last_read_by_student_at, last_read_by_admin_at")
        .not("last_message_at", "is", null)
        .order("last_message_at", { ascending: false })
        .limit(500);
      if (role === "student") q = q.eq("student_id", uid);
      else if (role === "teacher") q = q.eq("teacher_id", uid);
      const { data: rows, error } = await q;
      if (error || !rows) return 0;
      return (rows as any[]).filter((tk) => {
        if (!tk.last_sender_id || tk.last_sender_id === uid || !tk.last_message_at) return false;
        if (role === "admin" && tk.recipient_type === "teacher") return false;
        const readAt = role === "student" ? tk.last_read_by_student_at : tk.last_read_by_admin_at;
        return !readAt || new Date(readAt) < new Date(tk.last_message_at);
      }).length;
    },
  });

  // Re-check whenever the user navigates (e.g. after opening the support page).
  useEffect(() => { if (uid) refetch(); }, [pathname, uid]);

  // Instant update when a ticket row changes (falls back to the 8s poll if realtime is off).
  useEffect(() => {
    if (!uid) return;
    let ch: any;
    try {
      ch = supabase
        .channel(`support-unread-${role}-${uid}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets" }, () => { refetch(); })
        .subscribe();
    } catch {}
    return () => { try { if (ch) supabase.removeChannel(ch); } catch {} };
  }, [role, uid]);

  return data;
};
