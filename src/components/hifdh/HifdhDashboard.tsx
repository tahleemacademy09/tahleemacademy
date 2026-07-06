// src/components/hifdh/HifdhDashboard.tsx
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  BookOpen, TrendingUp, Flame, ChevronRight,
  CheckCircle2, RotateCcw, BookMarked, Headphones, Calendar,
  Star, Plus, Play, BarChart3, Trophy, AlertTriangle,
  ArrowRight, Brain, ClipboardCheck
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { H_GOLD as GOLD, H_GOLD_L3 as GOLD_LIGHT, H_INK2 as INK } from "./hifdhTokens";

interface Props {
  userId: string | null;
  studentName: string;
  onNavigate: (tab: string) => void;
  refreshKey?: number;
}

interface ProgressEntry {
  surah_num: number;
  surah_name: string;
  last_reviewed: string;
  best_accuracy: number;
  times_reviewed: number;
  verses_memorized?: number;
  total_verses?: number;
}

interface SessionEntry {
  surah_name: string;
  ayah_start: number;
  accuracy_score: number;
  created_at: string;
  duration: number;
}

interface DailyTask {
  id?: string;
  user_id: string;
  task_type: "memorize" | "revise";
  surah_name: string;
  verses_count: number;
  completed: boolean;
  target_date: string;
}

interface WeeklyData { day: string; count: number; }

// ── Light, brand-consistent palette (unique names to avoid rollup hoist collisions) ──
const MUTED      = "#8a9b85";
const PAGE_BG    = "#f5f2ec";
const CARD_BG    = "#ffffff";
const CARD_BRD   = "#e8ddd0";

const daysSince = (iso: string) =>
  Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
const WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function HifdhDashboard({
  userId, studentName, onNavigate, refreshKey = 0,
}: Props) {
  const [progress,    setProgress]    = useState<ProgressEntry[]>([]);
  const [sessions,    setSessions]    = useState<SessionEntry[]>([]);
  const [juzDone,     setJuzDone]     = useState<number[]>([]);
  const [juzPartial,  setJuzPartial]  = useState<number[]>([]);
  const [stats,       setStats]       = useState({ streak: 0, avgAccuracy: 0, totalMins: 0, juzCount: 0 });
  const [tasks,       setTasks]       = useState<DailyTask[]>([]);
  const [weeklyData,  setWeeklyData]  = useState<WeeklyData[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [showAddTask, setShowAddTask] = useState(false);
  const [taskType,    setTaskType]    = useState<"memorize"|"revise">("revise");
  const [taskSurah,   setTaskSurah]   = useState("");
  const [taskVerses,  setTaskVerses]  = useState("5");
  const [taskPlan,    setTaskPlan]    = useState<"daily"|"weekly"|"biweekly"|"monthly">("daily");
  const [savingTask,  setSavingTask]  = useState(false);
  // Per-module summary stats shown in Overview cards
  const [revStats,  setRevStats]  = useState({ sessions: 0, avgScore: 0, pagesRevised: 0 });
  const [memStats,  setMemStats]  = useState({ sessions: 0, versesMemorized: 0, avgScore: 0 });
  const [testStats, setTestStats] = useState({ sessions: 0, avgScore: 0, lastScore: 0 });

  // ── Today's Revision — mirrors exactly what the Revision tab itself
  // resumes into, so clicking this card lands on the same page(s).
  const [todaysRevision, setTodaysRevision] = useState<{
    source: "assigned" | "personal";
    modeLabel: string;
    pageLabel: string;
  } | null>(null);
  const [todaysRevisionChecked, setTodaysRevisionChecked] = useState(false);

  const overdueCount = progress.filter(p => daysSince(p.last_reviewed) >= 10).length;
  const urgentCount  = progress.filter(p => { const d = daysSince(p.last_reviewed); return d >= 5 && d < 10; }).length;
  const currentJuz   = juzPartial.length > 0 ? juzPartial[0] : null;
  const currentSurah = currentJuz
    ? progress.find(p => Math.ceil(p.surah_num / 4.27) === currentJuz)
    : null;

  const MODE_LABEL: Record<string, string> = { juz: "Juz", hizb: "Hizb", surah: "Surah" };

  useEffect(() => {
    if (!userId) return;
    setTodaysRevisionChecked(false);

    (supabase as any)
      .from("hifdh_daily_assignments")
      .select("mode,selected_items,daily_pages")
      .eq("student_id", userId)
      .eq("active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .then(({ data }: any) => {
        const assignment = data?.[0] ?? null;
        const source: "assigned" | "personal" = assignment ? "assigned" : "personal";
        const modeForLabel = assignment?.mode;
        const selectedForLabel: number[] = (assignment?.selected_items ?? []).map(Number);

        // The Revision tab keeps the authoritative day-to-day plan (with
        // currentIdx) in localStorage — read the same key it uses so this
        // card always shows exactly what "Continue" will resume into.
        let pageLabel = "Tap to start today's revision";
        let modeLabel = modeForLabel ? `${MODE_LABEL[modeForLabel] ?? modeForLabel} ${selectedForLabel.join(", ")}` : "";
        try {
          const saved = localStorage.getItem(`revision_plan_${userId}`);
          if (saved) {
            const p = JSON.parse(saved);
            const todays: number[] = (p.allPages ?? []).slice(p.currentIdx, p.currentIdx + (p.dailyPages || 1));
            if (todays.length === 1) pageLabel = `Page ${todays[0]}`;
            else if (todays.length > 1) pageLabel = `Pages ${todays[0]}–${todays[todays.length - 1]}`;
            if (!modeLabel) modeLabel = `${MODE_LABEL[p.mode] ?? p.mode} ${(p.selected ?? []).join(", ")}`;
          }
        } catch { /* ignore */ }

        if (!assignment && modeLabel === "") {
          setTodaysRevision(null); // no assignment and no personal plan yet
        } else {
          setTodaysRevision({ source, modeLabel, pageLabel });
        }
        setTodaysRevisionChecked(true);
      });
  }, [userId, refreshKey]);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);

    Promise.all([
      // ── Revision sessions (written by HifdhRevision) ─────────────────
      supabase.from("hifdh_revision_sessions")
        .select("page_number,score,duration_seconds,created_at,stage")
        .eq("student_id", userId)
        .order("created_at", { ascending: false })
        .limit(90),

      // ── Revision progress (pages completed) ──────────────────────────
      supabase.from("hifdh_revision_progress")
        .select("page_number,completed,best_score,completed_at")
        .eq("user_id", userId)
        .order("completed_at", { ascending: false }),

      // ── Memorization sessions (written by HifdhMemorization) ─────────
      supabase.from("hifdh_memorization_sessions")
        .select("surah_name,verses_count,score,duration_seconds,created_at")
        .eq("student_id", userId)
        .order("created_at", { ascending: false })
        .limit(90),

      // ── Test sessions (written by HifdhTest) ─────────────────────────
      supabase.from("hifdh_test_sessions")
        .select("surah_name,score,duration_seconds,created_at")
        .eq("student_id", userId)
        .order("created_at", { ascending: false })
        .limit(90),

      // ── Daily tasks ───────────────────────────────────────────────────
      supabase.from("hifdh_daily_tasks")
        .select("*")
        .eq("user_id", userId)
        .eq("target_date", new Date().toISOString().split("T")[0])
        .order("created_at", { ascending: true }),

    ]).then(([revSessRes, revProgRes, memSessRes, testSessRes, taskRes]) => {

      const revSessions  = (revSessRes.data  ?? []) as any[];
      const revProgress  = (revProgRes.data  ?? []) as any[];
      const memSessions  = (memSessRes.data  ?? []) as any[];
      const testSessions = (testSessRes.data ?? []) as any[];

      // ── Streak: any session from ANY module counts ─────────────────
      const allDates = [
        ...revSessions.map((s: any)  => new Date(s.created_at).toDateString()),
        ...memSessions.map((s: any)  => new Date(s.created_at).toDateString()),
        ...testSessions.map((s: any) => new Date(s.created_at).toDateString()),
      ];
      const uniqueDates = new Set(allDates);
      let streak = 0;
      for (let i = 0; i < 365; i++) {
        const d = new Date(); d.setDate(d.getDate() - i);
        if (uniqueDates.has(d.toDateString())) streak++;
        else if (i > 0) break;
      }

      // ── Total mins across all modules ─────────────────────────────
      const allDurSec = [
        ...revSessions.map((s: any)  => s.duration_seconds || 0),
        ...memSessions.map((s: any)  => s.duration_seconds || 0),
        ...testSessions.map((s: any) => s.duration_seconds || 0),
      ];
      const totalMins = Math.round(allDurSec.reduce((a, b) => a + b, 0) / 60);

      // ── Average accuracy across all modules ───────────────────────
      const allScores = [
        ...revSessions.map((s: any)  => s.score).filter(Boolean),
        ...memSessions.map((s: any)  => s.score).filter(Boolean),
        ...testSessions.map((s: any) => s.score).filter(Boolean),
      ];
      const avg = allScores.length
        ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : 0;

      // ── Per-module stats ──────────────────────────────────────────
      const revScores = revSessions.map((s: any) => s.score).filter(Boolean);
      const revAvg    = revScores.length ? Math.round(revScores.reduce((a:number,b:number)=>a+b,0)/revScores.length) : 0;
      const pagesRevised = new Set(revProgress.map((p: any) => p.page_number)).size;
      setRevStats({ sessions: revSessions.length, avgScore: revAvg, pagesRevised });

      const memScores = memSessions.map((s: any) => s.score).filter(Boolean);
      const memAvg    = memScores.length ? Math.round(memScores.reduce((a:number,b:number)=>a+b,0)/memScores.length) : 0;
      const versesMemorized = memSessions.reduce((a: number, s: any) => a + (s.verses_count || 0), 0);
      setMemStats({ sessions: memSessions.length, versesMemorized, avgScore: memAvg });

      const testScores = testSessions.map((s: any) => s.score).filter(Boolean);
      const testAvg    = testScores.length ? Math.round(testScores.reduce((a:number,b:number)=>a+b,0)/testScores.length) : 0;
      setTestStats({ sessions: testSessions.length, avgScore: testAvg, lastScore: testScores[0] ?? 0 });

      // ── Recent sessions list (all modules, latest 8) ──────────────
      const combined = [
        ...revSessions.map((s: any) => ({
          surah_name:    `Revision · Page ${s.page_number}`,
          ayah_start:    s.page_number,
          accuracy_score: s.score ?? 0,
          created_at:    s.created_at,
          duration:      s.duration_seconds ?? 0,
        })),
        ...memSessions.map((s: any) => ({
          surah_name:    `Memorize · ${s.surah_name || ""}`,
          ayah_start:    0,
          accuracy_score: s.score ?? 0,
          created_at:    s.created_at,
          duration:      s.duration_seconds ?? 0,
        })),
        ...testSessions.map((s: any) => ({
          surah_name:    `Test · ${s.surah_name || ""}`,
          ayah_start:    0,
          accuracy_score: s.score ?? 0,
          created_at:    s.created_at,
          duration:      s.duration_seconds ?? 0,
        })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
       .slice(0, 8);
      setSessions(combined);

      // ── Revision progress → ProgressEntry list ────────────────────
      const progEntries: ProgressEntry[] = revProgress.slice(0, 20).map((p: any) => ({
        surah_num:        p.page_number,
        surah_name:       `Page ${p.page_number}`,
        last_reviewed:    p.completed_at ?? new Date().toISOString(),
        best_accuracy:    p.best_score ?? 0,
        times_reviewed:   1,
        verses_memorized: p.completed ? 20 : 0,
        total_verses:     20,
      }));
      setProgress(progEntries);

      // Juz tracking from revision progress
      const pageToJuz = (pg: number) => Math.min(30, Math.ceil(pg / 20));
      const juzMap = new Map<number, boolean>();
      revProgress.forEach((p: any) => {
        const j = pageToJuz(p.page_number);
        juzMap.set(j, (juzMap.get(j) ?? false) || !!p.completed);
      });
      const done: number[] = [], partial: number[] = [];
      juzMap.forEach((v, j) => { if (v) done.push(j); else partial.push(j); });
      setJuzDone(done); setJuzPartial(partial);

      // ── Weekly activity chart (all modules) ───────────────────────
      const weekData: WeeklyData[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const ds = d.toDateString();
        const count =
          revSessions.filter((s: any)  => new Date(s.created_at).toDateString() === ds).length +
          memSessions.filter((s: any)  => new Date(s.created_at).toDateString() === ds).length +
          testSessions.filter((s: any) => new Date(s.created_at).toDateString() === ds).length;
        weekData.push({ day: WEEK_DAYS[d.getDay()], count });
      }
      setWeeklyData(weekData);

      setStats({ streak, avgAccuracy: avg, totalMins, juzCount: done.length });
      if (taskRes.data) setTasks(taskRes.data as DailyTask[]);
      setLoading(false);
    });
  }, [userId, refreshKey]);

  const addTask = async () => {
    if (!userId || !taskSurah.trim()) return;
    setSavingTask(true);
    const today = new Date().toISOString().split("T")[0];
    const count = taskPlan === "daily" ? 1 : taskPlan === "weekly" ? 7 : taskPlan === "biweekly" ? 14 : 30;
    const dates: string[] = [];
    for (let i = 0; i < count; i++) {
      const d = new Date(); d.setDate(d.getDate() + i);
      dates.push(d.toISOString().split("T")[0]);
    }
    const inserts = dates.map(d => ({
      user_id: userId, task_type: taskType, surah_name: taskSurah.trim(),
      verses_count: parseInt(taskVerses) || 5, completed: false, target_date: d,
    }));
    const { data } = await supabase.from("hifdh_daily_tasks").insert(inserts).select();
    if (data) setTasks(prev => [...prev, ...data.filter((t: any) => t.target_date === today) as DailyTask[]]);
    setSavingTask(false);
    setTaskSurah("");
    setShowAddTask(false);
  };

  // Tapping a task row navigates the student to the tab where they actually
  // DO the task (so completion isn't just a checkbox — it leads to the work).
  const startTask = (task: DailyTask) => {
    onNavigate(task.task_type === "memorize" ? "memorize" : "recitation");
  };

  // The small checkbox is the only control that toggles completion directly —
  // kept separate from "start" so one tap can't fake-complete a task.
  const toggleTask = async (task: DailyTask, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!task.id) return;
    await supabase.from("hifdh_daily_tasks").update({ completed: !task.completed }).eq("id", task.id);
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, completed: !t.completed } : t));
  };

  const completedToday  = tasks.filter(t => t.completed).length;
  const totalToday      = tasks.length;
  const progressPercent = totalToday > 0 ? Math.round((completedToday / totalToday) * 100) : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[500px]" style={{ background: PAGE_BG }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-full border-4 border-t-transparent animate-spin"
            style={{ borderColor: GOLD + "33", borderTopColor: GOLD }} />
          <p className="text-sm font-semibold" style={{ color: MUTED }}>Loading your Hifdh…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24 overflow-y-auto" style={{ background: PAGE_BG }}>

      {/* ── Welcome header ── */}
      <div style={{ background: `linear-gradient(160deg,${INK} 0%,#276749 100%)`, padding: "20px 16px 22px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg,${GOLD},${GOLD_LIGHT},${GOLD})` }} />
        <p style={{ fontFamily: "'Amiri',serif", fontSize: 13, color: GOLD, marginBottom: 2 }}>السلام عليكم</p>
        <p style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>
          {studentName ? `Welcome, ${studentName.split(" ")[0]}` : "Welcome back"}
        </p>
        <p style={{ fontSize: 12, color: "#ffffffaa", marginTop: 2 }}>
          {stats.streak > 0 ? `🔥 ${stats.streak}-day streak — keep it going!` : "Start your streak today"}
        </p>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">

        {/* ── Alert Banner ── */}
        {overdueCount > 0 && (
          <div
            className="rounded-2xl p-4 flex items-center gap-3"
            style={{ background: "#fdeceb", border: "1px solid #f2b8b5" }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "#ef444422" }}>
              <AlertTriangle size={18} color="#dc2626" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black" style={{ color: "#991b1b" }}>
                {overdueCount} Revision{overdueCount > 1 ? "s" : ""} Overdue!
              </p>
              <p className="text-xs mt-0.5" style={{ color: "#b9534f" }}>
                {urgentCount > 0 ? `+${urgentCount} more due soon · ` : ""}
                Complete them to stay on track
              </p>
            </div>
            <button
              onClick={() => onNavigate("test")}
              className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-black"
              style={{ background: "#dc2626", color: "#fff" }}>
              Review Now
            </button>
          </div>
        )}

        {/* ── Continue Button ── */}
        {currentSurah && (
          <button
            onClick={() => onNavigate("recitation")}
            className="w-full rounded-2xl p-4 flex items-center gap-4 transition-transform active:scale-[0.98]"
            style={{
              background: `linear-gradient(135deg, ${INK}, #276749)`,
              border: `1px solid ${GOLD}33`,
              boxShadow: `0 4px 24px ${GOLD}18`,
            }}>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: GOLD + "25" }}>
              <Play size={22} fill={GOLD} color={GOLD} />
            </div>
            <div className="flex-1 text-left">
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: GOLD + "cc" }}>
                Continue Learning
              </p>
              <p className="text-sm font-black mt-0.5" style={{ color: "#fff" }}>
                Surah {currentSurah.surah_name}
              </p>
              <p className="text-xs mt-0.5" style={{ color: "#bcd9c8" }}>
                {currentSurah.verses_memorized || 0} of {currentSurah.total_verses || "???"} verses
              </p>
            </div>
            <ArrowRight size={18} color={GOLD} />
          </button>
        )}

        {/* ── 4 Stat Cards ── */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            icon={<BookOpen size={18} />}
            value={stats.juzCount || "0"}
            label="Juz Memorized"
            labelAr="أجزاء محفوظة"
            colors={["#1e4d35", "#276749"]}
            accent="#4ade80"
            onClick={() => onNavigate("recitation")}
          />
          <StatCard
            icon={<TrendingUp size={18} />}
            value={`${stats.avgAccuracy}%`}
            label="Accuracy"
            labelAr="الدقة"
            colors={["#1a3d5c", "#1e5799"]}
            accent="#60a5fa"
            onClick={() => onNavigate("test")}
          />
          <StatCard
            icon={<Flame size={18} />}
            value={stats.streak}
            label="Day Streak"
            labelAr="الأيام"
            colors={["#4a2008", "#7c3005"]}
            accent={GOLD}
            onClick={() => onNavigate("recitation")}
          />
          <StatCard
            icon={<Brain size={18} />}
            value={`${stats.totalMins}m`}
            label="Total Time"
            labelAr="الوقت"
            colors={["#1e1a4d", "#312e81"]}
            accent="#a78bfa"
            onClick={() => onNavigate("memorize")}
          />
        </div>

        {/* ── Today's Tasks ── */}
        <SectionCard
          icon={<CheckCircle2 size={16} />}
          title="Today's Tasks"
          titleAr="مهام اليوم"
          iconBg="#276749"
          headerRight={
            <div className="flex items-center gap-2">
              <span className="text-xs font-black" style={{ color: GOLD }}>
                {completedToday}/{totalToday}
              </span>
            </div>
          }>
          {/* Mini progress bar */}
          {totalToday > 0 && (
            <div className="mx-4 mb-3 h-1.5 rounded-full overflow-hidden" style={{ background: "#eee7d8" }}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${progressPercent}%`,
                  background: `linear-gradient(90deg, ${GOLD}, ${GOLD_LIGHT})`,
                }}
              />
            </div>
          )}

          <div className="px-4 pb-4 space-y-2">
            {tasks.length === 0 ? (
              <div className="py-8 flex flex-col items-center gap-3">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                  style={{ background: GOLD + "15" }}>
                  <Calendar size={24} color={GOLD} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold" style={{ color: INK }}>No tasks today</p>
                  <p className="text-xs mt-0.5" style={{ color: MUTED }}>لا توجد مهام اليوم بعد</p>
                </div>
                <button
                  onClick={() => setShowAddTask(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold"
                  style={{ background: GOLD + "15", color: GOLD, border: `1px solid ${GOLD}44` }}>
                  <Plus size={13} /> Add First Task
                </button>
              </div>
            ) : (
              <>
                {tasks.map(task => (
                  <button
                    key={task.id}
                    onClick={() => startTask(task)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all active:scale-[0.98]"
                    style={{
                      background: task.completed ? GOLD + "10" : "#f7f4ec",
                      border: `1px solid ${task.completed ? GOLD + "44" : CARD_BRD}`,
                    }}>
                    <div
                      onClick={(e) => toggleTask(task, e)}
                      className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center border-2 transition-all"
                      style={{
                        background:   task.completed ? GOLD : "transparent",
                        borderColor:  task.completed ? GOLD : "#c9bda3",
                      }}>
                      {task.completed && <CheckCircle2 size={11} color="#fff" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black truncate"
                        style={{ color: task.completed ? GOLD : INK, textDecoration: task.completed ? "line-through" : "none" }}>
                        {task.task_type === "memorize" ? "📖" : "🔄"} {task.surah_name}
                      </p>
                      <p className="text-[10px] mt-0.5" style={{ color: MUTED }}>
                        {task.verses_count} verses · {task.task_type} · tap to start
                      </p>
                    </div>
                    <span
                      className="text-[10px] font-black px-2 py-0.5 rounded-lg shrink-0"
                      style={{
                        background: task.completed ? GOLD + "1f" : "#ffffff",
                        color:       task.completed ? GOLD    : MUTED,
                        border: `1px solid ${task.completed ? GOLD + "33" : CARD_BRD}`,
                      }}>
                      {task.completed ? "Done" : "Start"}
                    </span>
                  </button>
                ))}
                <button
                  onClick={() => setShowAddTask(true)}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold border-dashed border"
                  style={{ color: GOLD, borderColor: GOLD + "44" }}>
                  <Plus size={13} /> Add Task
                </button>
              </>
            )}
          </div>
        </SectionCard>

        {/* ── Weekly Activity ── */}
        <SectionCard
          icon={<BarChart3 size={16} />}
          title="Weekly Activity"
          titleAr="النشاط الأسبوعي"
          iconBg="#1e5799">
          <div className="px-4 pb-4">
            <div className="flex items-end gap-1.5 h-20">
              {weeklyData.map((day, i) => {
                const maxCount = Math.max(...weeklyData.map(d => d.count), 1);
                const pct = (day.count / maxCount) * 100;
                const isToday = i === 6;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                    <div className="w-full flex items-end" style={{ height: 56 }}>
                      <div
                        className="w-full rounded-t-lg transition-all duration-700"
                        style={{
                          height: `${Math.max(pct, day.count > 0 ? 18 : 4)}%`,
                          background: isToday
                            ? `linear-gradient(180deg, ${GOLD}, ${GOLD_LIGHT})`
                            : day.count > 0
                              ? `linear-gradient(180deg, #276749cc, #27674944)`
                              : "#eee7d8",
                          boxShadow: isToday ? `0 0 8px ${GOLD}55` : "none",
                        }}
                      />
                    </div>
                    <span className="text-[9px] font-bold" style={{ color: isToday ? GOLD : MUTED }}>
                      {day.day}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </SectionCard>

        {/* ── Current Progress ── */}
        {currentSurah && (
          <SectionCard
            icon={<BookMarked size={16} />}
            title="Current Progress"
            titleAr="التقدم الحالي"
            iconBg="#7c3005"
            headerRight={
              <button
                onClick={() => onNavigate("recitation")}
                className="flex items-center gap-0.5 text-xs font-bold"
                style={{ color: GOLD }}>
                View All <ChevronRight size={13} />
              </button>
            }>
            <div className="px-4 pb-4">
              <div className="rounded-xl p-4" style={{ background: "#fdf6e3", border: `1px solid ${GOLD}33` }}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider" style={{ color: GOLD }}>Juz {currentJuz}</p>
                    <p className="text-base font-black mt-0.5" style={{ color: INK }}>
                      Surah {currentSurah.surah_name}
                    </p>
                  </div>
                  <Trophy size={20} color={GOLD} />
                </div>
                {/* Progress bar */}
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "#eee0bd" }}>
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${Math.round((currentSurah.verses_memorized || 0) / (currentSurah.total_verses || 1) * 100)}%`,
                      background: `linear-gradient(90deg,${GOLD},${GOLD_LIGHT})`,
                    }}
                  />
                </div>
                <div className="flex justify-between mt-2">
                  <span className="text-[10px]" style={{ color: "#8a6030" }}>
                    {currentSurah.verses_memorized || 0} verses
                  </span>
                  <span className="text-[10px] font-black" style={{ color: GOLD }}>
                    {Math.round((currentSurah.verses_memorized || 0) / (currentSurah.total_verses || 1) * 100)}%
                  </span>
                </div>
              </div>
            </div>
          </SectionCard>
        )}

        {/* ── Today's Revision (assigned by teacher, or personal plan) ── */}
        {todaysRevisionChecked && (
          <SectionCard
            icon={<RotateCcw size={16} />}
            title="Today's Revision"
            titleAr="مراجعة اليوم"
            iconBg="#276749">
            <div className="px-4 pb-4">
              {todaysRevision ? (
                <button
                  onClick={() => onNavigate("recitation")}
                  className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all active:scale-[0.98]"
                  style={{ background: "#f0faf3", border: "1px solid #b6e5c5" }}>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: "#276749", color: "#fff" }}>
                    <BookOpen size={15} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-black truncate" style={{ color: INK }}>
                        {todaysRevision.modeLabel || "Your Revision"}
                      </p>
                      <span
                        className="text-[9px] font-black px-1.5 py-0.5 rounded shrink-0"
                        style={{
                          background: todaysRevision.source === "assigned" ? "#c9a84c22" : "#8a9b8522",
                          color:      todaysRevision.source === "assigned" ? "#9a7b1f"   : "#5c6b58",
                        }}>
                        {todaysRevision.source === "assigned" ? "ASSIGNED" : "PERSONAL"}
                      </span>
                    </div>
                    <p className="text-[11px] mt-0.5" style={{ color: MUTED }}>
                      {todaysRevision.pageLabel}
                    </p>
                  </div>
                  <ChevronRight size={13} color={MUTED} />
                </button>
              ) : (
                <button
                  onClick={() => onNavigate("recitation")}
                  className="w-full py-4 text-center rounded-xl transition-all active:scale-[0.98]"
                  style={{ background: "#f5f2ec", border: "1px dashed #d8cdb8" }}>
                  <p className="text-xs font-bold" style={{ color: MUTED }}>
                    No revision plan yet — tap to set one up
                  </p>
                </button>
              )}
            </div>
          </SectionCard>
        )}

        {/* ── Per-Module Summary ── */}
        <SectionCard
          icon={<BarChart3 size={16} />}
          title="Module Summary"
          titleAr="ملخص الأنشطة"
          iconBg="#1a3d5c">
          <div className="px-4 pb-4 space-y-2">

            {/* Revision */}
            <button onClick={() => onNavigate("recitation")}
              className="w-full flex items-center gap-2 p-3 rounded-xl text-left active:scale-[0.98] transition-all"
              style={{ background: "#f0faf3", border: "1px solid #b6e5c5" }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: "#276749", color: "#fff" }}>
                <BookOpen size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black" style={{ color: INK }}>Revision</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "#d1f0da" }}>
                    <div className="h-full rounded-full" style={{ width: `${revStats.avgScore}%`, background: "#276749" }} />
                  </div>
                  <span className="text-[10px] font-black shrink-0" style={{ color: "#276749" }}>{revStats.avgScore}%</span>
                </div>
                <p className="text-[10px] mt-0.5" style={{ color: MUTED }}>
                  {revStats.sessions} session{revStats.sessions !== 1 ? "s" : ""} · {revStats.pagesRevised} pages revised
                </p>
              </div>
              <ChevronRight size={12} color={MUTED} className="shrink-0" />
            </button>

            {/* Memorization */}
            <button onClick={() => onNavigate("memorize")}
              className="w-full flex items-center gap-3 p-3 rounded-xl text-left active:scale-[0.98] transition-all"
              style={{ background: "#f5f0ff", border: "1px solid #d3bbfa" }}>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: "#5b21b6", color: "#fff" }}>
                <Brain size={15} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black" style={{ color: INK }}>Memorization</p>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "#ede9fe" }}>
                    <div className="h-full rounded-full" style={{ width: `${memStats.avgScore}%`, background: "#5b21b6" }} />
                  </div>
                  <span className="text-[10px] font-black shrink-0" style={{ color: "#5b21b6" }}>{memStats.avgScore}%</span>
                </div>
                <p className="text-[10px] mt-0.5" style={{ color: MUTED }}>
                  {memStats.sessions} session{memStats.sessions !== 1 ? "s" : ""} · {memStats.versesMemorized} verses
                </p>
              </div>
              <ChevronRight size={13} color={MUTED} />
            </button>

            {/* Test */}
            <button onClick={() => onNavigate("test")}
              className="w-full flex items-center gap-3 p-3 rounded-xl text-left active:scale-[0.98] transition-all"
              style={{ background: "#fff7ed", border: "1px solid #fed7aa" }}>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: "#c2410c", color: "#fff" }}>
                <ClipboardCheck size={15} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black" style={{ color: INK }}>Test</p>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "#fed7aa" }}>
                    <div className="h-full rounded-full" style={{ width: `${testStats.avgScore}%`, background: "#c2410c" }} />
                  </div>
                  <span className="text-[10px] font-black shrink-0" style={{ color: "#c2410c" }}>{testStats.avgScore}%</span>
                </div>
                <p className="text-[10px] mt-0.5" style={{ color: MUTED }}>
                  {testStats.sessions} test{testStats.sessions !== 1 ? "s" : ""}{testStats.lastScore ? ` · Last: ${testStats.lastScore}%` : ""}
                </p>
              </div>
              <ChevronRight size={13} color={MUTED} />
            </button>

          </div>
        </SectionCard>

        {/* ── Recent Sessions (all modules combined) ── */}
        {sessions.length > 0 && (
          <SectionCard
            icon={<Headphones size={16} />}
            title="Recent Sessions"
            titleAr="الجلسات الأخيرة"
            iconBg="#312e81">
            <div className="px-4 pb-4 space-y-2">
              {sessions.slice(0, 6).map((session, i) => {
                const score = session.accuracy_score;
                const color = score >= 80 ? "#15803d" : score >= 60 ? "#b45309" : "#b91c1c";
                const bg    = score >= 80 ? "#eaf7ee" : score >= 60 ? "#fdf3e0" : "#fdeceb";
                const isRev = session.surah_name.startsWith("Revision");
                const isMem = session.surah_name.startsWith("Memorize");
                const dest  = isRev ? "recitation" : isMem ? "memorize" : "test";
                return (
                  <button
                    key={i}
                    onClick={() => onNavigate(dest)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all active:scale-[0.98]"
                    style={{ background: "#f7f4ec", border: `1px solid ${CARD_BRD}` }}>
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 font-black text-xs"
                      style={{ background: bg, color, border: `1px solid ${color}33` }}>
                      {score > 0 ? `${score}%` : "–"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black truncate" style={{ color: INK }}>
                        {session.surah_name}
                      </p>
                      <p className="text-[10px] mt-0.5" style={{ color: MUTED }}>
                        {new Date(session.created_at).toLocaleDateString("en-GB", { day:"numeric", month:"short" })}
                        {session.duration ? ` · ${Math.max(1, Math.round(session.duration / 60))}m` : ""}
                      </p>
                    </div>
                    {score >= 80 && <Star size={14} color={GOLD} fill={GOLD} />}
                  </button>
                );
              })}
            </div>
          </SectionCard>
        )}
      </div>

      {/* ── Add Task Dialog ── */}
      <Dialog open={showAddTask} onOpenChange={setShowAddTask}>
        <DialogContent
          className="max-w-sm mx-4 rounded-2xl"
          style={{ background: CARD_BG, border: `1px solid ${CARD_BRD}` }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-black" style={{ color: INK }}>
              <Plus size={16} /> Add New Task
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Type */}
            <div className="grid grid-cols-2 gap-2">
              {(["revise", "memorize"] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTaskType(t)}
                  className="py-2.5 rounded-xl text-xs font-black transition-all"
                  style={{
                    background: taskType === t ? GOLD : "#f7f4ec",
                    color:      taskType === t ? "#fff" : MUTED,
                    border: `1px solid ${taskType === t ? GOLD : CARD_BRD}`,
                  }}>
                  {t === "revise" ? "🔄 Revise" : "📖 Memorize"}
                </button>
              ))}
            </div>

            {/* Surah */}
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider mb-1.5 block" style={{ color: GOLD }}>
                Surah Name
              </label>
              <Input
                value={taskSurah}
                onChange={e => setTaskSurah(e.target.value)}
                placeholder="e.g. Al-Baqarah"
                className="h-10 text-sm rounded-xl font-medium"
                style={{ background: "#f7f4ec", color: INK, border: `1px solid ${CARD_BRD}` }}
              />
            </div>

            {/* Verses */}
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider mb-1.5 block" style={{ color: GOLD }}>
                Verses per day
              </label>
              <Input
                type="number" min={1} max={50}
                value={taskVerses}
                onChange={e => setTaskVerses(e.target.value)}
                className="h-10 text-sm rounded-xl font-bold"
                style={{ background: "#f7f4ec", color: INK, border: `1px solid ${CARD_BRD}` }}
              />
            </div>

            {/* Plan */}
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider mb-2 block" style={{ color: GOLD }}>
                Duration
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {(["daily","weekly","biweekly","monthly"] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setTaskPlan(p)}
                    className="py-2 rounded-xl text-[10px] font-black transition-all"
                    style={{
                      background: taskPlan === p ? GOLD : "#f7f4ec",
                      color:      taskPlan === p ? "#fff" : MUTED,
                      border: `1px solid ${taskPlan === p ? GOLD : CARD_BRD}`,
                    }}>
                    {p === "daily" ? "Daily" : p === "weekly" ? "Weekly" : p === "biweekly" ? "2 Wks" : "Monthly"}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowAddTask(false)}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold"
                style={{ background: "#f7f4ec", color: MUTED, border: `1px solid ${CARD_BRD}` }}>
                Cancel
              </button>
              <button
                onClick={addTask}
                disabled={savingTask || !taskSurah.trim()}
                className="flex-1 py-2.5 rounded-xl text-xs font-black disabled:opacity-40"
                style={{ background: GOLD, color: "#fff" }}>
                {savingTask ? "Saving…" : "Add Task"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Reusable Section Card ──────────────────────────────────────────────────
function SectionCard({
  icon, title, titleAr, iconBg, children, headerRight,
}: {
  icon: React.ReactNode;
  title: string;
  titleAr: string;
  iconBg: string;
  children: React.ReactNode;
  headerRight?: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: CARD_BG, border: `1px solid ${CARD_BRD}`, boxShadow: "0 2px 10px rgba(26,61,36,.06)" }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: `1px solid ${CARD_BRD}` }}>
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: iconBg }}>
          <span style={{ color: "#fff" }}>{icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-black leading-tight" style={{ color: INK }}>{title}</p>
          <p className="text-[10px] leading-tight mt-0.5" style={{ color: MUTED }}>{titleAr}</p>
        </div>
        {headerRight}
      </div>
      {children}
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────
function StatCard({
  icon, value, label, labelAr, colors, accent, onClick,
}: {
  icon: React.ReactNode;
  value: any;
  label: string;
  labelAr: string;
  colors: [string, string];
  accent: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-2xl p-4 flex flex-col items-start gap-3 w-full text-left transition-transform active:scale-95"
      style={{
        background: `linear-gradient(135deg, ${colors[0]}, ${colors[1]})`,
        border: `1px solid ${accent}22`,
        boxShadow: `0 4px 20px ${colors[0]}55`,
      }}>
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center"
        style={{ background: accent + "25" }}>
        <span style={{ color: accent }}>{icon}</span>
      </div>
      <div>
        <p className="text-2xl font-black leading-none" style={{ color: "#fff" }}>{value}</p>
        <p className="text-[11px] font-bold mt-1 leading-tight" style={{ color: "#ffffffcc" }}>{label}</p>
        <p className="text-[9px] mt-0.5" style={{ color: accent + "aa" }}>{labelAr}</p>
      </div>
    </button>
  );
}
