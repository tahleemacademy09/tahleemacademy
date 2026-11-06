/*  src/hooks/useSupportLive.ts — Tahleem Academy

    Live layer for ONE support conversation (student <-> admin/teacher).
    Used by StudentSupport.tsx and the admin/teacher SupportTickets.tsx so
    both sides of the chat behave the same.

    What it gives you
      • instant new / edited messages  (Supabase realtime on
        support_ticket_messages, filtered to this ticket)
      • typing indicator               (realtime *broadcast* — nothing is
        written to the database)
      • "online now"                   (realtime *presence* — true while the
        other person has THIS conversation open)
      • live                            true once the realtime channel is
        connected. Pages use it to slow their polling down; if realtime is
        not enabled for the table the pages simply keep polling like before,
        so nothing breaks.

    No database changes are required for typing / online. For instant
    messages the table must be in the supabase_realtime publication (see
    the optional SQL shipped with this change).
*/
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Options {
  ticketId: string | null | undefined;
  userId: string | null | undefined;
  /** Called whenever a message row in this ticket is inserted / updated. */
  onMessagesChange?: () => void;
}

export const useSupportLive = ({ ticketId, userId, onMessagesChange }: Options) => {
  const [otherTyping, setOtherTyping] = useState(false);
  const [otherOnline, setOtherOnline] = useState(false);
  const [live, setLive] = useState(false);

  const chRef = useRef<any>(null);
  const liveRef = useRef(false);
  const idleTimer = useRef<any>(null);
  const hideTimer = useRef<any>(null);
  const lastTypingSent = useRef(0);
  const cbRef = useRef(onMessagesChange);
  cbRef.current = onMessagesChange;

  useEffect(() => {
    setOtherTyping(false);
    setOtherOnline(false);
    setLive(false);
    liveRef.current = false;
    if (!ticketId || !userId) return;

    let ch: any = null;
    try {
      ch = supabase
        .channel(`support-live-${ticketId}`, {
          config: { broadcast: { self: false }, presence: { key: userId } },
        })
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "support_ticket_messages", filter: `ticket_id=eq.${ticketId}` },
          () => { cbRef.current?.(); },
        )
        .on("broadcast", { event: "typing" }, (msg: any) => {
          const p = msg?.payload;
          if (!p || p.uid === userId) return;
          clearTimeout(hideTimer.current);
          setOtherTyping(!!p.typing);
          // Safety net: if the "stopped typing" signal is lost, hide it anyway.
          if (p.typing) hideTimer.current = setTimeout(() => setOtherTyping(false), 4000);
        })
        .on("presence", { event: "sync" }, () => {
          try {
            const state = ch?.presenceState?.() || {};
            setOtherOnline(Object.keys(state).some(k => k !== userId));
          } catch {}
        })
        .subscribe(async (status: string) => {
          if (status === "SUBSCRIBED") {
            liveRef.current = true;
            setLive(true);
            try { await ch?.track?.({ at: Date.now() }); } catch {}
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            liveRef.current = false;
            setLive(false);
          }
        });
      chRef.current = ch;
    } catch {
      chRef.current = null;
    }

    return () => {
      clearTimeout(idleTimer.current);
      clearTimeout(hideTimer.current);
      liveRef.current = false;
      try { if (ch) supabase.removeChannel(ch); } catch {}
      chRef.current = null;
    };
  }, [ticketId, userId]);

  /** Call with true on every keystroke (it throttles itself), false after sending. */
  const sendTyping = useCallback((typing: boolean) => {
    const ch = chRef.current;
    if (!ch || !liveRef.current || !userId) return;
    clearTimeout(idleTimer.current);
    const push = (v: boolean) => {
      try { ch.send({ type: "broadcast", event: "typing", payload: { uid: userId, typing: v } }); } catch {}
    };
    if (typing) {
      const now = Date.now();
      if (now - lastTypingSent.current > 2500) { lastTypingSent.current = now; push(true); }
      idleTimer.current = setTimeout(() => { lastTypingSent.current = 0; push(false); }, 3000);
    } else {
      lastTypingSent.current = 0;
      push(false);
    }
  }, [userId]);

  return { otherTyping, otherOnline, live, sendTyping };
};
