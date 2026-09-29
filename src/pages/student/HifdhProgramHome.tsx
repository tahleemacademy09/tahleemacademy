// src/pages/student/HifdhProgramHome.tsx
// Student home for the Hifdh Program — three big cards:
//   1) Today's Revision   → existing daily revision page
//   2) This Week's Memorization → portions, read-along status, submit when memorized
//   3) Read-Along (live)  → join the group's live class (normal classroom)
// Banner only shows when something needs attention (fines, misses, suspension).

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLiveClass } from "@/contexts/LiveClassContext";
import { useToast } from "@/hooks/use-toast";
import { Loader2, BookOpen, Repeat, Video, CheckCircle2, Clock, AlertTriangle, Lock } from "lucide-react";

const hhDb = supabase as any;

const HH_GREEN = "#064E3B";
const HH_GOLD = "#C9A84C";
const HH_INK = "#1a1a2e";
const HH_MUTED = "#6b7a72";
const HH_LINE = "#e3e9e5";
const HH_BG = "#f6f8f6";
const HH_RED = "#DC2626";
const HH_OK = "#16A34A";
const HH_AMBER = "#D97706";

const hhIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hhMonday = () => {
  const x = new Date();
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return hhIso(x);
};
const hhWhen = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" }) : null;

const HhPill = ({ text, color }: { text: string; color: string }) => (
  <span style={{ background: color + "1a", color, fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 99 }}>{text}</span>
);

const HhCard = ({ icon, title, sub, children, accent = HH_GREEN }: {
  icon: React.ReactNode; title: string; sub?: string; children: React.ReactNode; accent?: string;
}) => (
  <div style={{ background: "#fff", border: `1px solid ${HH_LINE}`, borderRadius: 18, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,.04)" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
      <div style={{ width: 42, height: 42, borderRadius: 12, background: accent + "14", color: accent, display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</div>
      <div>
        <div style={{ fontWeight: 800, fontSize: 16, color: HH_INK }}>{title}</div>
        {sub && <div style={{ fontSize: 12, color: HH_MUTED }}>{sub}</div>}
      </div>
    </div>
    {children}
  </div>
);

const HhBtn = ({ children, onClick, disabled, kind = "primary" }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean; kind?: "primary" | "gold";
}) => (
  <button onClick={onClick} disabled={disabled} style={{
    width: "100%", padding: "13px 14px", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 800,
    cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1,
    background: kind === "gold" ? HH_GOLD : HH_GREEN, color: kind === "gold" ? HH_INK : "#fff",
  }}>{children}</button>
);

const HH_TASK_LABEL: Record<string, { text: string; color: string }> = {
  pending: { text: "Waiting for read-along", color: HH_MUTED },
  read_cleared: { text: "Ready to memorize", color: HH_AMBER },
  submitted: { text: "Submitted for review", color: HH_GREEN },
  passed: { text: "Passed", color: HH_OK },
  failed: { text: "Repeat this portion", color: HH_RED },
};

export default function HifdhProgramHome() {
  const { user } = useAuth();
  const { joinClass } = useLiveClass();
  const navigate = useNavigate();
  const { toast } = useToast();
  const week = hhMonday();
  const today = hhIso(new Date());

  const [loading, setLoading] = useState(true);
  const [program, setProgram] = useState<any>(null);
  const [level, setLevel] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [member, setMember] = useState<any>(null);
  const [group, setGroup] = useState<any>(null);
  const [ustadh, setUstadh] = useState("");
  const [tasks, setTasks] = useState<any[]>([]);
  const [review, setReview] = useState<any>(null);
  const [fines, setFines] = useState<any[]>([]);
  const [doneToday, setDoneToday] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const sid = user.id;
    const { data: prog } = await hhDb.from("hifdh_program").select("*").eq("student_id", sid)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    setProgram(prog || null);
    if (!prog) { setLoading(false); return; }

    const [lv, st, mm, tk, rv, fn, lg] = await Promise.all([
      prog.level_id ? hhDb.from("hifdh_levels").select("*").eq("id", prog.level_id).maybeSingle() : Promise.resolve({ data: null }),
      hhDb.from("hifdh_settings").select("*").eq("id", true).maybeSingle(),
      hhDb.from("hifdh_read_group_members").select("*").eq("student_id", sid).eq("week_start", week).limit(1).maybeSingle(),
      hhDb.from("hifdh_memorization_tasks").select("*").eq("student_id", sid).eq("week_start", week).order("slot"),
      hhDb.from("hifdh_weekly_reviews").select("*").eq("student_id", sid).eq("week_start", week).maybeSingle(),
      hhDb.from("hifdh_fines").select("*").eq("student_id", sid).eq("status", "unpaid"),
      hhDb.from("hifdh_daily_logs").select("id,completed").eq("student_id", sid).eq("log_date", today).eq("completed", true).limit(1),
    ]);
    setLevel(lv.data || null);
    setSettings(st.data || null);
    setMember(mm.data || null);
    setTasks(tk.data || []);
    setReview(rv.data || null);
    setFines(fn.data || []);
    setDoneToday((lg.data || []).length > 0);

    if (mm.data?.group_id) {
      const { data: g } = await hhDb.from("hifdh_read_groups").select("*").eq("id", mm.data.group_id).maybeSingle();
      setGroup(g || null);
      if (g?.ustadh_id) {
        const { data: pf } = await hhDb.from("profiles").select("full_name").eq("user_id", g.ustadh_id).maybeSingle();
        setUstadh(pf?.full_name || "");
      }
    } else { setGroup(null); }
    setLoading(false);
  }, [user?.id, week, today]);

  useEffect(() => { load(); }, [load]);

  const submitTask = async (id: string) => {
    setBusy(true);
    const { error } = await hhDb.from("hifdh_memorization_tasks")
      .update({ status: "submitted", submitted_at: new Date().toISOString() }).eq("id", id);
    setBusy(false);
    if (error) toast({ title: "Couldn't submit", description: error.message, variant: "destructive" });
    else { toast({ title: "Submitted to your ustadh" }); load(); }
  };

  const joinReadAlong = async () => {
    if (!group?.live_session_id) return;
    const { data: ls } = await hhDb.from("live_sessions").select("subject_id").eq("id", group.live_session_id).maybeSingle();
    if (!ls?.subject_id) return toast({ title: "Class not available yet", variant: "destructive" });
    const { data: subject } = await hhDb.from("subjects").select("*").eq("id", ls.subject_id).maybeSingle();
    if (!subject) return toast({ title: "Class not available yet", variant: "destructive" });
    joinClass(subject);
  };

  if (loading) {
    return <div style={{ display: "flex", justifyContent: "center", padding: 60 }}><Loader2 className="animate-spin" color={HH_GOLD} /></div>;
  }

  if (!program) {
    return (
      <div style={{ padding: 20, maxWidth: 520, margin: "0 auto", textAlign: "center", color: HH_MUTED }}>
        <BookOpen size={36} color={HH_GOLD} style={{ marginBottom: 10 }} />
        <div style={{ fontWeight: 800, fontSize: 18, color: HH_INK, marginBottom: 6 }}>Hifdh Program</div>
        You're not enrolled in the Hifdh program yet. Please speak to the admin.
      </div>
    );
  }

  const suspended = program.status === "suspended";
  const unpaidTotal = fines.reduce((n, f) => n + Number(f.amount), 0);
  const limit = settings?.streak_limit ?? 3;
  const memDays: number[] = settings?.memorization_days || [];
  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const showBanner = suspended || fines.length > 0 || program.miss_streak > 0;

  return (
    <div style={{ background: HH_BG, minHeight: "100%", padding: 14, maxWidth: 520, margin: "0 auto", display: "grid", gap: 12, alignContent: "start" }}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 800, color: HH_GREEN }}>Hifdh Program</div>
        <div style={{ fontSize: 12, color: HH_MUTED }}>
          {level ? `${level.name} · ${Number(level.daily_pages)} page${Number(level.daily_pages) === 1 ? "" : "s"} a day` : "Level not set yet"}
          {" · "}Page {program.current_page}
        </div>
      </div>

      {showBanner && (
        <div style={{
          borderRadius: 14, padding: 12, fontSize: 13, display: "flex", gap: 10, alignItems: "flex-start",
          background: suspended ? "#fef2f2" : "#fffbeb", border: `1px solid ${suspended ? "#fecaca" : "#fde68a"}`, color: HH_INK,
        }}>
          {suspended ? <Lock size={18} color={HH_RED} /> : <AlertTriangle size={18} color={HH_AMBER} />}
          <div>
            {suspended && <div style={{ fontWeight: 800, color: HH_RED }}>Your Hifdh program is suspended</div>}
            {suspended && <div style={{ color: HH_MUTED }}>Please contact the admin to be reinstated. Your other classes are not affected.</div>}
            {!suspended && program.miss_streak > 0 && (
              <div><b>{program.miss_streak} missed week{program.miss_streak > 1 ? "s" : ""} in a row.</b> {limit - program.miss_streak} more will suspend the program.</div>
            )}
            {fines.length > 0 && (
              <div style={{ marginTop: suspended || program.miss_streak > 0 ? 4 : 0 }}>
                Unpaid fine{fines.length > 1 ? "s" : ""}: <b>₦{unpaidTotal.toLocaleString()}</b>
              </div>
            )}
          </div>
        </div>
      )}

      {!suspended && (
        <>
          {/* 1 — Today's revision */}
          <HhCard icon={<Repeat size={22} />} title="Today's Revision" sub="Recite your revision portion">
            {doneToday ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: HH_OK, fontWeight: 700, fontSize: 14 }}>
                <CheckCircle2 size={18} /> Done for today — well done
              </div>
            ) : (
              <HhBtn onClick={() => navigate("/student/hifdh-daily")}>Start today's revision</HhBtn>
            )}
          </HhCard>

          {/* 2 — Weekly memorization */}
          <HhCard icon={<BookOpen size={22} />} title="This Week's Memorization"
            sub={memDays.length ? `Memorization days: ${memDays.map((d) => dayNames[d - 1]).join(" & ")}` : undefined} accent={HH_GOLD}>
            {tasks.length === 0 ? (
              <div style={{ fontSize: 13, color: HH_MUTED }}>Your portions will appear here once your ustadh assigns them.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {tasks.map((t) => {
                  const lb = HH_TASK_LABEL[t.status] || HH_TASK_LABEL.pending;
                  return (
                    <div key={t.id} style={{ border: `1px solid ${HH_LINE}`, borderRadius: 12, padding: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ fontWeight: 700, color: HH_INK }}>
                          {t.page_from === t.page_to ? `Page ${t.page_from}` : `Pages ${t.page_from}–${t.page_to}`}
                        </div>
                        <HhPill text={lb.text} color={lb.color} />
                      </div>
                      {t.status === "read_cleared" && (
                        <div style={{ marginTop: 10 }}>
                          <HhBtn kind="gold" disabled={busy} onClick={() => submitTask(t.id)}>I've memorized this — submit</HhBtn>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </HhCard>

          {/* 3 — Read-along */}
          <HhCard icon={<Video size={22} />} title="Join Read-Along" sub="Read with your ustadh before you memorize" accent="#0B7285">
            {!group ? (
              <div style={{ fontSize: 13, color: HH_MUTED }}>You haven't been placed in a group for this week yet.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                  <div>
                    <div style={{ fontWeight: 700, color: HH_INK }}>{group.name}</div>
                    <div style={{ fontSize: 12, color: HH_MUTED }}>
                      {ustadh ? `Ustadh ${ustadh}` : "Ustadh not assigned yet"}
                      {group.scheduled_at ? ` · ${hhWhen(group.scheduled_at)}` : ""}
                    </div>
                  </div>
                  {member?.read_status === "passed" && <HhPill text="Read correctly ✓" color={HH_OK} />}
                  {member?.read_status === "repeat" && <HhPill text="Please repeat" color={HH_AMBER} />}
                  {member?.read_status === "pending" && <HhPill text="Not yet marked" color={HH_MUTED} />}
                </div>
                {group.live_session_id ? (
                  <HhBtn onClick={joinReadAlong}>Join class</HhBtn>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: HH_MUTED }}>
                    <Clock size={14} /> The class hasn't been scheduled yet
                  </div>
                )}
              </div>
            )}
          </HhCard>

          {/* Weekly grade, only once the ustadh has graded */}
          {review && (
            <div style={{ background: "#fff", border: `1px solid ${HH_LINE}`, borderRadius: 14, padding: 14, fontSize: 13 }}>
              <div style={{ fontWeight: 800, color: HH_INK, marginBottom: 4 }}>This week's review</div>
              {review.excused ? (
                <HhPill text="Excused" color={HH_MUTED} />
              ) : (
                <HhPill
                  text={review.grade === "pass" ? "Passed" : review.grade === "repeat" ? "Repeat" : "Not passed"}
                  color={review.grade === "pass" ? HH_OK : review.grade === "repeat" ? HH_AMBER : HH_RED}
                />
              )}
              {review.notes && <div style={{ marginTop: 8, color: HH_MUTED }}>{review.notes}</div>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
