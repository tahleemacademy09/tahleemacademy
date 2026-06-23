// src/components/hifdh/HifdhDashboard.tsx
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  BookOpen, TrendingUp, Flame, ChevronRight,
  CheckCircle2, RotateCcw, BookMarked, Headphones, Calendar,
  Star, Plus, Play, BarChart3, Trophy, AlertTriangle,
  ArrowRight, Brain
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Props {
  userId: string | null;
  studentName: string;
  onNavigate: (tab: string) => void;
  activeTab?: string;
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

// ── Light, brand-consistent palette (matches the Revision/Test/Memorize tabs) ──
const GOLD       = "#b7791f";
const GOLD_LIGHT = "#e8c96b";
const INK        = "#1a3d24";   // primary text — dark green
const MUTED      = "#8a9b85";   // secondary text
const PAGE_BG    = "#f5f2ec";   // warm cream page background
const CARD_BG    = "#ffffff";
const CARD_BRD   = "#e8ddd0";

const daysSince = (iso: string) =>
  Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
const WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function HifdhDashboard({
  userId, studentName, onNavigate, activeTab = "overview",
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

  const overdueCount = progress.filter(p => daysSince(p.last_reviewed) >= 10).length;
  const urgentCount  = progress.filter(p => { const d = daysSince(p.last_reviewed); return d >= 5 && d < 10; }).length;
  const currentJuz   = juzPartial.length > 0 ? juzPartial[0] : null;
  const currentSurah = currentJuz
    ? progress.find(p => Math.ceil(p.surah_num / 4.27) === currentJuz)
    : null;

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    Promise.all([
      // Revision progress — written by HifdhRevision after each page is completed
      supabase
        .from("hifdh_revision_progress")
        .select("*")
        .eq("user_id", userId)
        .order("completed_at", { ascending: false }),

      // Revision sessions — written after each page recitation
      supabase
        .from("hifdh_revision_sessions")
        .select("page_number,score,duration_seconds,created_at,stage")
        .eq("student_id", userId)
        .order("created_at", { ascending: false })
        .limit(30),

      // Daily tasks
      supabase
        .from("hifdh_daily_tasks")
        .select("*")
        .eq("user_id", userId)
        .eq("target_date", new Date().toISOString().split("T")[0])
        .order("created_at", { ascending: true }),

      // Active assignment — for page count / mode info
      supabase
        .from("hifdh_daily_assignments")
        .select("mode,selected_items,daily_pages")
        .eq("student_id", userId)
        .eq("active", true)
        .maybeSingle(),
    ]).then(([revProg, revSess, taskRes, assignRes]) => {

      // ── Sessions ──────────────────────────────────────────────────
      const sessData = (revSess.data ?? []) as any[];
      setSessions(sessData.map((s: any) => ({
        surah_name:    `Page ${s.page_number}`,
        ayah_start:    s.page_number,
        accuracy_score: s.score ?? 0,
        created_at:    s.created_at,
        duration:      s.duration_seconds ?? 0,
      })));

      // Streak — count consecutive days with at least one session
      const sessionDates = [...new Set(sessData.map((s: any) => new Date(s.created_at).toDateString()))];
      let streak = 0;
      for (let i = 0; i < 90; i++) {
        const d = new Date(); d.setDate(d.getDate() - i);
        if (sessionDates.includes(d.toDateString())) streak++;
        else if (i > 0) break;
      }

      const totalMins = Math.round(sessData.reduce((a: number, s: any) => a + (s.duration_seconds || 0), 0) / 60);

      // Average accuracy from all recitation sessions
      const scores = sessData.map((s: any) => s.score).filter((x: any) => x != null && x > 0);
      const avg = scores.length ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length) : 0;

      // ── Revision progress (completed pages) ───────────────────────
      const progData = (revProg.data ?? []) as any[];
      const completedPages = progData.filter(p => p.completed).length;
      const totalPages = (assignRes.data as any)?.selected_items?.length ?? 0;

      // Build fake ProgressEntry list from revision progress for juz/surah display
      // Map page numbers to juz (rough: pages 1-20 = juz1, etc.)
      const pageToJuz = (page: number) => Math.min(30, Math.ceil(page / 20));
      const juzMap = new Map<number, { done: boolean; pages: number }>();
      progData.forEach((p: any) => {
        const j = pageToJuz(p.page_number);
        const ex = juzMap.get(j) ?? { done: false, pages: 0 };
        juzMap.set(j, { done: ex.done || p.completed, pages: ex.pages + 1 });
      });
      const done: number[] = [], partial: number[] = [];
      juzMap.forEach((v, j) => { if (v.done) done.push(j); else partial.push(j); });
      setJuzDone(done);
      setJuzPartial(partial);

      // Build progress entries for display
      const fakeProgress: ProgressEntry[] = progData.slice(0, 20).map((p: any) => ({
        surah_num:      p.page_number,
        surah_name:     `Page ${p.page_number}`,
        last_reviewed:  p.completed_at ?? new Date().toISOString(),
        best_accuracy:  p.best_score ?? p.exercise_score ?? 0,
        times_reviewed: 1,
        verses_memorized: p.completed ? 20 : 0,
        total_verses:   20,
      }));
      setProgress(fakeProgress);

      // Weekly activity chart
      const weekData: WeeklyData[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const count = sessData.filter((s: any) => new Date(s.created_at).toDateString() === d.toDateString()).length;
        weekData.push({ day: WEEK_DAYS[d.getDay()], count });
      }
      setWeeklyData(weekData);

      setStats({ streak, avgAccuracy: avg, totalMins, juzCount: done.length });
      if (taskRes.data) setTasks(taskRes.data as DailyTask[]);
      setLoading(false);
    });
  }, [userId]);

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

        {/* ── Urgent Revisions ── */}
        {progress.length > 0 && (
          <SectionCard
            icon={<RotateCcw size={16} />}
            title="Urgent Revisions"
            titleAr="المراجعات العاجلة"
            iconBg="#b91c1c"
            headerRight={
              <button
                onClick={() => onNavigate("test")}
                className="flex items-center gap-0.5 text-xs font-bold"
                style={{ color: GOLD }}>
                View All <ChevronRight size={13} />
              </button>
            }>
            <div className="px-4 pb-4 space-y-2">
              {progress
                .filter(p => daysSince(p.last_reviewed) < 10)
                .slice(0, 3)
                .map((item, i) => {
                  const days = daysSince(item.last_reviewed);
                  const isUrgent = days >= 5;
                  return (
                    <button
                      key={i}
                      onClick={() => onNavigate("test")}
                      className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all active:scale-[0.98]"
                      style={{
                        background: isUrgent ? "#fdf3e0" : "#eaf7ee",
                        border: `1px solid ${isUrgent ? "#f3c66b" : "#bbe4c8"}`,
                      }}>
                      <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: isUrgent ? "#d97706" : "#16a34a" }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black truncate" style={{ color: INK }}>
                          {item.surah_name}
                        </p>
                        <p className="text-[10px] mt-0.5" style={{ color: MUTED }}>
                          {days === 0 ? "Today" : `${days}d ago`} · Best:{" "}
                          <span style={{ color: GOLD }}>{item.best_accuracy}%</span>
                        </p>
                      </div>
                      <span
                        className="text-[10px] font-black px-2 py-0.5 rounded-lg shrink-0"
                        style={{
                          background: isUrgent ? "#f59e0b22" : "#16a34a22",
                          color:      isUrgent ? "#b45309"   : "#15803d",
                        }}>
                        {isUrgent ? "⚡ Soon" : "✓ On Track"}
                      </span>
                    </button>
                  );
                })}
              {progress.filter(p => daysSince(p.last_reviewed) < 10).length === 0 && (
                <div className="py-6 text-center">
                  <p className="text-xs font-bold" style={{ color: MUTED }}>No urgent revisions — great job! 🎉</p>
                </div>
              )}
            </div>
          </SectionCard>
        )}

        {/* ── Recent Sessions ── */}
        {sessions.length > 0 && (
          <SectionCard
            icon={<Headphones size={16} />}
            title="Recent Sessions"
            titleAr="الجلسات الأخيرة"
            iconBg="#312e81"
            headerRight={
              <button
                onClick={() => onNavigate("recitation")}
                className="flex items-center gap-0.5 text-xs font-bold"
                style={{ color: GOLD }}>
                History <ChevronRight size={13} />
              </button>
            }>
            <div className="px-4 pb-4 space-y-2">
              {sessions.slice(0, 4).map((session, i) => {
                const score = session.accuracy_score;
                const color = score >= 80 ? "#15803d" : score >= 60 ? "#b45309" : "#b91c1c";
                const bg    = score >= 80 ? "#eaf7ee" : score >= 60 ? "#fdf3e0" : "#fdeceb";
                return (
                  <button
                    key={i}
                    onClick={() => onNavigate("recitation")}
                    className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all active:scale-[0.98]"
                    style={{ background: "#f7f4ec", border: `1px solid ${CARD_BRD}` }}>
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 font-black text-xs"
                      style={{ background: bg, color, border: `1px solid ${color}33` }}>
                      {score}%
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black truncate" style={{ color: INK }}>
                        {session.surah_name}
                      </p>
                      <p className="text-[10px] mt-0.5" style={{ color: MUTED }}>
                        Ayah {session.ayah_start} · {Math.round((session.duration || 0) / 60)}m
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
