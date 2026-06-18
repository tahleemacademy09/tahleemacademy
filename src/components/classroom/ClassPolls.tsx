/**
 * ClassPolls.tsx — Tahleem Academy
 * Upgraded: broadcast results via LiveKit data channel, better UI
 */
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { BarChart3, Plus, Check, X, Radio } from "lucide-react";

let useRoomContextHook: (() => any) | null = null;
try {
  const lk = require("@livekit/components-react");
  useRoomContextHook = lk.useRoomContext;
} catch {
  useRoomContextHook = () => null;
}

interface ClassPollsProps { sessionId: string; }

const T = {
  bg: "#13181f", surface: "#1e2535", border: "rgba(255,255,255,.08)",
  text: "#e8eaf0", muted: "rgba(255,255,255,.45)", teal: "#0a7c68",
  gold: "#c9a84c", green: "#22c55e", red: "#ef4444",
};

const ClassPolls = ({ sessionId }: ClassPollsProps) => {
  const { user, hasRole } = useAuth();
  const { t } = useLanguage();
  const isPrivileged = hasRole("admin") || hasRole("teacher");
  const room = useRoomContextHook ? useRoomContextHook() : null;

  const [polls, setPolls]       = useState<any[]>([]);
  const [answers, setAnswers]   = useState<Record<string, any[]>>({});
  const [myAnswers, setMyAnswers] = useState<Record<string, number>>({});
  const [creating, setCreating] = useState(false);
  const [question, setQuestion] = useState("");
  const [options, setOptions]   = useState(["", "", "", ""]);
  const [broadcasting, setBroadcasting] = useState<string | null>(null);

  const load = async () => {
    const { data: pollData } = await supabase.from("class_polls").select("*").eq("session_id", sessionId).order("created_at", { ascending: false });
    setPolls(pollData || []);
    if (pollData?.length) {
      const { data: ansData } = await supabase.from("class_poll_answers").select("*").in("poll_id", pollData.map(p => p.id));
      const grouped: Record<string, any[]> = {};
      const mine: Record<string, number> = {};
      (ansData || []).forEach((a: any) => {
        if (!grouped[a.poll_id]) grouped[a.poll_id] = [];
        grouped[a.poll_id].push(a);
        if (a.student_id === user?.id) mine[a.poll_id] = a.answer_index;
      });
      setAnswers(grouped);
      setMyAnswers(mine);
    }
  };

  useEffect(() => {
    load();
    const ch = supabase.channel(`polls-${sessionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "class_polls", filter: `session_id=eq.${sessionId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "class_poll_answers" }, load)
      .subscribe();

    // Listen for broadcast poll results from teacher
    if (room) {
      const onData = (payload: Uint8Array) => {
        try {
          const msg = JSON.parse(new TextDecoder().decode(payload));
          if (msg.type === "poll_results_broadcast") load();
        } catch {}
      };
      room.on("dataReceived", onData);
      return () => { supabase.removeChannel(ch); room.off("dataReceived", onData); };
    }
    return () => { supabase.removeChannel(ch); };
  }, [sessionId, user?.id, room]);

  const createPoll = async () => {
    const valid = options.filter(o => o.trim());
    if (!question.trim() || valid.length < 2) return;
    await supabase.from("class_polls").insert({
      session_id: sessionId, question: question.trim(),
      options: valid.map((o, i) => ({ index: i, text: o.trim() })),
      created_by: user?.id,
    });
    setCreating(false); setQuestion(""); setOptions(["", "", "", ""]);
  };

  const vote = async (pollId: string, index: number) => {
    if (!user || myAnswers[pollId] !== undefined) return;
    await supabase.from("class_poll_answers").insert({ poll_id: pollId, student_id: user.id, answer_index: index });
  };

  const endPoll = async (pollId: string) => {
    await supabase.from("class_polls").update({ is_active: false, show_results: true }).eq("id", pollId);
  };

  const toggleResults = async (pollId: string, current: boolean) => {
    await supabase.from("class_polls").update({ show_results: !current }).eq("id", pollId);
  };

  const broadcastResults = async (poll: any) => {
    setBroadcasting(poll.id);
    // Make results visible to all
    await supabase.from("class_polls").update({ show_results: true }).eq("id", poll.id);
    // Broadcast via LiveKit data channel so students see immediately
    try {
      const pollAnswers = answers[poll.id] || [];
      const total = pollAnswers.length;
      const results = (poll.options as any[]).map((opt: any) => {
        const count = pollAnswers.filter((a: any) => a.answer_index === opt.index).length;
        return { ...opt, count, pct: total > 0 ? Math.round((count / total) * 100) : 0 };
      });
      room?.localParticipant?.publishData(
        new TextEncoder().encode(JSON.stringify({ type: "poll_results_broadcast", pollId: poll.id, question: poll.question, results, total })),
        { reliable: true }
      );
    } catch {}
    setTimeout(() => setBroadcasting(null), 1000);
  };

  const Bar = ({ pct, color = T.teal }: { pct: number; color?: string }) => (
    <div style={{ width: "100%", height: 5, borderRadius: 99, background: "rgba(255,255,255,.08)", overflow: "hidden", marginTop: 3 }}>
      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 99, transition: "width .4s ease" }} />
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: T.bg, fontFamily: "system-ui,sans-serif" }}>
      {/* Header */}
      <div style={{ padding: "12px 14px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: T.text, display: "flex", alignItems: "center", gap: 6 }}>
          <BarChart3 style={{ width: 14, height: 14, color: T.teal }} />
          {t("Polls", "التصويتات")}
        </span>
        {isPrivileged && (
          <button onClick={() => setCreating(v => !v)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 8, border: `1px solid ${T.border}`, background: "rgba(255,255,255,.06)", color: T.muted, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
            <Plus style={{ width: 11, height: 11 }} /> {t("New", "جديد")}
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Create form */}
        {creating && isPrivileged && (
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 14 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: T.gold, margin: "0 0 10px" }}>📊 New Poll</p>
            <input value={question} onChange={e => setQuestion(e.target.value)} placeholder={t("Question...", "السؤال...")}
              style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.border}`, background: "rgba(255,255,255,.05)", color: T.text, fontSize: 12, marginBottom: 8, fontFamily: "inherit", outline: "none" }} />
            {options.map((opt, i) => (
              <input key={i} value={opt} onChange={e => { const n = [...options]; n[i] = e.target.value; setOptions(n); }}
                placeholder={`${t("Option", "خيار")} ${i + 1}`}
                style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 8, border: `1px solid ${T.border}`, background: "rgba(255,255,255,.05)", color: T.text, fontSize: 12, marginBottom: 6, fontFamily: "inherit", outline: "none" }} />
            ))}
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              <button onClick={createPoll} style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", background: T.teal, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{t("Launch Poll", "إطلاق التصويت")}</button>
              <button onClick={() => setCreating(false)} style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.border}`, background: "transparent", color: T.muted, cursor: "pointer" }}><X style={{ width: 12, height: 12 }} /></button>
            </div>
          </div>
        )}

        {/* Poll cards */}
        {polls.map(poll => {
          const pollAnswers = answers[poll.id] || [];
          const total = pollAnswers.length;
          const opts = (poll.options as any[]) || [];
          const hasVoted = myAnswers[poll.id] !== undefined;
          const showResults = poll.show_results || (isPrivileged && total > 0);
          const isBroadcasting = broadcasting === poll.id;
          const winnerIdx = total > 0 ? opts.reduce((best: any, opt: any) => {
            const count = pollAnswers.filter((a: any) => a.answer_index === opt.index).length;
            return count > (best.count || 0) ? { ...opt, count } : best;
          }, {}).index : -1;

          return (
            <div key={poll.id} style={{ background: T.surface, border: `1px solid ${poll.is_active ? "rgba(34,197,94,.2)" : T.border}`, borderRadius: 12, padding: 14, opacity: poll.is_active ? 1 : 0.75 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                <p style={{ flex: 1, fontSize: 13, fontWeight: 700, color: T.text, margin: 0 }}>{poll.question}</p>
                <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: poll.is_active ? "rgba(34,197,94,.12)" : "rgba(255,255,255,.06)", color: poll.is_active ? T.green : T.muted }}>
                  {poll.is_active ? "LIVE" : "ENDED"}
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {opts.map((opt: any) => {
                  const count = pollAnswers.filter((a: any) => a.answer_index === opt.index).length;
                  const pct   = total > 0 ? Math.round((count / total) * 100) : 0;
                  const isMy  = myAnswers[poll.id] === opt.index;
                  const isWin = showResults && opt.index === winnerIdx && total > 0;

                  if (poll.is_active && !hasVoted) return (
                    <button key={opt.index} onClick={() => vote(poll.id, opt.index)}
                      style={{ padding: "9px 12px", borderRadius: 8, border: `1px solid ${T.border}`, background: "rgba(255,255,255,.05)", color: T.text, cursor: "pointer", textAlign: "left", fontSize: 12, fontWeight: 500, transition: "background .12s", fontFamily: "inherit" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "rgba(10,124,104,.18)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,.05)")}>
                      {opt.text}
                    </button>
                  );

                  return (
                    <div key={opt.index} style={{ padding: "8px 10px", borderRadius: 8, background: isMy ? "rgba(10,124,104,.15)" : isWin ? "rgba(34,197,94,.07)" : "rgba(255,255,255,.03)", border: `1px solid ${isMy ? "rgba(10,124,104,.3)" : isWin ? "rgba(34,197,94,.2)" : T.border}` }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 12, color: isMy ? "#4ade80" : T.text, fontWeight: isMy || isWin ? 700 : 400 }}>
                          {isWin && "🏆 "}{opt.text} {isMy && <Check style={{ width: 11, height: 11, display: "inline" }} />}
                        </span>
                        {showResults && <span style={{ fontSize: 11, fontWeight: 700, color: isWin ? T.green : T.muted }}>{pct}% · {count}</span>}
                      </div>
                      {showResults && <Bar pct={pct} color={isWin ? T.green : T.teal} />}
                    </div>
                  );
                })}
              </div>

              {hasVoted && !showResults && (
                <p style={{ fontSize: 10, color: T.muted, textAlign: "center", margin: "8px 0 0" }}>{t("Waiting for results...", "بانتظار النتائج...")}</p>
              )}

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
                <span style={{ fontSize: 10, color: T.muted }}>{total} {t("votes", "صوت")}</span>
                {isPrivileged && poll.is_active && (
                  <div style={{ display: "flex", gap: 5 }}>
                    <button onClick={() => broadcastResults(poll)} disabled={isBroadcasting}
                      style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 7, border: `1px solid rgba(201,168,76,.35)`, background: "rgba(201,168,76,.1)", color: T.gold, fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                      <Radio style={{ width: 9, height: 9 }} /> {isBroadcasting ? "Sent!" : "Show All"}
                    </button>
                    <button onClick={() => toggleResults(poll.id, poll.show_results)}
                      style={{ padding: "4px 10px", borderRadius: 7, border: `1px solid ${T.border}`, background: "rgba(255,255,255,.06)", color: T.muted, fontSize: 10, cursor: "pointer" }}>
                      {poll.show_results ? t("Hide", "إخفاء") : t("Show", "إظهار")}
                    </button>
                    <button onClick={() => endPoll(poll.id)}
                      style={{ padding: "4px 10px", borderRadius: 7, border: "1px solid rgba(239,68,68,.3)", background: "rgba(239,68,68,.1)", color: T.red, fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                      {t("End", "إنهاء")}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {polls.length === 0 && !creating && (
          <div style={{ textAlign: "center", padding: "40px 16px", color: T.muted }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
            <p style={{ fontSize: 12, margin: 0 }}>{t("No polls yet", "لا توجد تصويتات بعد")}</p>
            {isPrivileged && <p style={{ fontSize: 11, margin: "4px 0 0", color: "rgba(255,255,255,.25)" }}>Tap + New above to create one</p>}
          </div>
        )}
      </div>
    </div>
  );
};

export default ClassPolls;
