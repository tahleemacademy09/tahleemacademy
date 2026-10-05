// src/components/majlis/useMajlisLive.ts
// Shared lookup for Al-Majlis Live: the dedicated classroom subject + whatever
// meeting is live right now. Used by the Majlis header dot / banner and by the
// MajlisLive panel itself.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface MajlisMeeting {
  id: string; title: string; description: string | null;
  kind: "meeting" | "urgent" | "discussion" | "lecture";
  audience: string; status: "scheduled" | "live" | "ended" | "cancelled";
  scheduled_at: string | null; started_at: string | null; ended_at: string | null;
  host_id: string; host_name: string | null; session_id: string | null; created_at: string; program_id?: string | null;
}

export function useMajlisLive() {
  const [subject, setSubject] = useState<any | null>(null);
  const [liveSession, setLiveSession] = useState<any | null>(null);
  const [liveMeeting, setLiveMeeting] = useState<MajlisMeeting | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      let subj = subject;
      if (!subj) {
        const { data } = await (supabase as any).from("subjects").select("*")
          .eq("is_majlis_live", true).limit(1).maybeSingle();
        subj = data || null;
        setSubject(subj);
      }
      if (!subj) { setLiveSession(null); setLiveMeeting(null); return; }
      const { data: sess } = await supabase.from("live_sessions").select("*")
        .eq("subject_id", subj.id).eq("status", "live").maybeSingle();
      setLiveSession(sess || null);
      if (sess) {
        const { data: m } = await (supabase as any).from("majlis_meetings").select("*")
          .eq("status", "live").order("started_at", { ascending: false }).limit(1).maybeSingle();
        setLiveMeeting(m || null);
      } else setLiveMeeting(null);
    } catch { /* table may not exist yet */ }
    finally { setReady(true); }
  }, [subject]);

  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, 15000);
    const ch = supabase.channel("majlis-live-status")
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "majlis_meetings" }, refresh)
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "live_sessions" }, refresh)
      .subscribe();
    return () => { clearInterval(iv); supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject?.id]);

  return { subject, liveSession, liveMeeting, isLive: !!liveSession, ready, refresh };
}
