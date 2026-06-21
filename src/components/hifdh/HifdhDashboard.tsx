// src/components/hifdh/HifdhDashboard.tsx
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  BookOpen, TrendingUp, Flame, Clock, ChevronRight,
  CheckCircle2, RotateCcw, BookMarked, Headphones, Calendar,
  AlertCircle, Star, Plus, Play, BarChart3, Trophy, AlertTriangle,
  ArrowRight, Zap
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

const GOLD       = "#c9a84c";
const GOLD_LIGHT = "#e8c96b";
const DG         = "#0f2318";
const MG         = "#162d1f";
const LG         = "#1e3d2a";
const ACCENT     = "#276749";

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
      supabase.from("hifdh_progress").select("*").eq("user_id", userId).order("last_reviewed", { ascending: true }),
      supabase.from("hifdh_sessions").select("surah_name,ayah_start,accuracy_score,created_at,duration").eq("student_id", userId).order("created_at", { ascending: false }).limit(6),
      supabase.from("hifdh_daily_tasks").select("*").eq("user_id", userId).eq("target_date", new Date().toISOString().split("T")[0]).order("created_at", { ascending: true }),
    ]).then(([prog, sess, taskRes]) => {
      if (prog.data) {
        const entries = prog.data as ProgressEntry[];
        setProgress(entries);
        const done: number[] = [], partial: number[] = [];
        entries.forEach(p => {
          const j = Math.min(30, Math.ceil(p.surah_num / 4.27));
          if (p.best_accuracy >= 80 && !done.includes(j)) done.push(j);
          else if (!partial.includes(j) && !done.includes(j)) partial.push(j);
        });
        setJuzDone(done);
        setJuzPartial(partial);
        const scores = entries.map(p => p.best_accuracy).filter(Boolean);
        const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
        setStats(s => ({ ...s, avgAccuracy: avg, juzCount: done.length }));

        const weekData: WeeklyData[] = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date(); d.setDate(d.getDate() - i);
          const dateStr = d.toDateString();
          const count = sess.data?.filter((s: any) => new Date(s.created_at).toDateString() === dateStr).length || 0;
          weekData.push({ day: WEEK_DAYS[d.getDay()], count });
        }
        setWeeklyData(weekData);
      }
      if (sess.data) {
        setSessions(sess.data as SessionEntry[]);
        const dates = [...new Set(sess.data.map((s: any) => new Date(s.created_at).toDateString()))];
        let streak = 0;
        for (let i = 0; i < 30; i++) {
          const d = new Date(); d.setDate(d.getDate() - i);
          if (dates.includes(d.toDateString())) streak++;
          else if (i > 0) break;
        }
        const totalMins = Math.round(sess.data.reduce((a: number, s: any) => a + (s.duration || 0), 0) / 60);
        setStats(prev => ({ ...prev, streak, totalMins }));
      }
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

  const toggleTask = async (task: DailyTask) => {
    if (!task.id) return;
    await supabase.from("hifdh_daily_tasks").update({ completed: !task.completed }).eq("id", task.id);
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, completed: !t.completed } : t));
  };

  const completedToday  = tasks.filter(t => t.completed).length;
  const totalToday      = tasks.length;
  const progressPercent = totalToday > 0 ? Math.round((completedToday / totalToday) * 100) : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[500px]" style={{ background: DG }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-full border-4 border-t-transparent animate-spin"
            style={{ borderColor: GOLD + "44", borderTopColor: GOLD }} />
          <p className="text-sm font-semibold" style={{ color: GOLD + "aa" }}>Loading your Hifdh...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24 overflow-y-auto" style={{ background: DG }}>
      <div className="max-w-lg mx-auto px-4 pt-5 space-y-4">

        {/* ── Alert Banner ── */}
        {overdueCount > 0 && (
          <div
            className="rounded-2xl p-4 flex items-center gap-3"
            style={{
              background: "linear-gradient(135deg,#3b0d0d,#5a1010)",
              border: "1px solid #ef444455",
            }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "#ef444430" }}>
              <AlertTriangle size={18} color="#ef4444" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black" style={{ color: "#fca5a5" }}>
                {overdueCount} Revision{overdueCount > 1 ? "s" : ""} Overdue!
              </p>
              <p className="text-xs mt-0.5" style={{ color: "#f8717180" }}>
                {urgentCount > 0 ? `+${urgentCount} more due soon · ` : ""}
                Complete them to stay on track
              </p>
            </div>
            <button
              onClick={() => onNavigate("test")}
              className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-black"
              style={{ background: "#ef4444", color: "#fff" }}>
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
              background: `linear-gradient(135deg, ${LG}, ${ACCENT})`,
              border: `1px solid ${GOLD}33`,
              boxShadow: `0 4px 24px ${GOLD}18`,
            }}>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: GOLD + "25" }}>
              <Play size={22} fill={GOLD} color={GOLD} />
            </div>
            <div className="flex-1 text-left">
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: GOLD + "aa" }}>
                Continue Learning
              </p>
              <p className="text-sm font-black mt-0.5" style={{ color: "#fff" }}>
                Surah {currentSurah.surah_name}
              </p>
              <p className="text-xs mt-0.5" style={{ color: "#7aad90" }}>
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
            onClick={() => onNavigate("test")}
          />
          <StatCard
            icon={<Clock size={18} />}
            value={`${stats.totalMins}m`}
            label="Total Time"
            labelAr="الوقت"
            colors={["#1e1a4d", "#312e81"]}
            accent="#a78bfa"
            onClick={() => onNavigate("recitation")}
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
            <div className="mx-4 mb-3 h-1.5 rounded-full overflow-hidden" style={{ background: "#ffffff0f" }}>
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
                  <p className="text-sm font-bold" style={{ color: "#fff" }}>No tasks today</p>
                  <p className="text-xs mt-0.5" style={{ color: "#4a6d58" }}>لا توجد مهام اليوم بعد</p>
                </div>
                <button
                  onClick={() => setShowAddTask(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold"
                  style={{ background: GOLD + "20", color: GOLD, border: `1px solid ${GOLD}44` }}>
                  <Plus size={13} /> Add First Task
                </button>
              </div>
            ) : (
              <>
                {tasks.map(task => (
                  <button
                    key={task.id}
                    onClick={() => toggleTask(task)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all"
                    style={{
                      background: task.completed ? GOLD + "12" : "#ffffff09",
                      border: `1px solid ${task.completed ? GOLD + "44" : "#ffffff12"}`,
                    }}>
                    <div
                      className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center border-2 transition-all"
                      style={{
                        background:   task.completed ? GOLD : "transparent",
                        borderColor:  task.completed ? GOLD : "#4a6d58",
                      }}>
                      {task.completed && <CheckCircle2 size={11} color={DG} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black truncate"
                        style={{ color: task.completed ? GOLD : "#fff", textDecoration: task.completed ? "line-through" : "none" }}>
                        {task.task_type === "memorize" ? "📖" : "🔄"} {task.surah_name}
                      </p>
                      <p className="text-[10px] mt-0.5" style={{ color: "#4a6d58" }}>
                        {task.verses_count} verses · {task.task_type}
                      </p>
                    </div>
                    <span
                      className="text-[10px] font-black px-2 py-0.5 rounded-lg"
                      style={{
                        background: task.completed ? GOLD + "22" : "#ffffff0f",
                        color:       task.completed ? GOLD    : "#4a6d58",
                      }}>
                      {task.completed ? "Done" : "Pending"}
                    </span>
                  </button>
                ))}
                <button
                  onClick={() => setShowAddTask(true)}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold border-dashed border"
                  style={{ color: GOLD + "88", borderColor: GOLD + "33" }}>
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
                              ? `linear-gradient(180deg, ${ACCENT}cc, ${ACCENT}44)`
                              : "#ffffff0f",
                          boxShadow: isToday ? `0 0 8px ${GOLD}55` : "none",
                        }}
                      />
                    </div>
                    <span className="text-[9px] font-bold" style={{ color: isToday ? GOLD : "#4a6d58" }}>
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
              <div className="rounded-xl p-4" style={{ background: "#ffffff08", border: `1px solid ${GOLD}22` }}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider" style={{ color: GOLD + "88" }}>Juz {currentJuz}</p>
                    <p className="text-base font-black mt-0.5" style={{ color: "#fff" }}>
                      Surah {currentSurah.surah_name}
                    </p>
                  </div>
                  <Trophy size={20} color={GOLD} />
                </div>
                {/* Progress bar */}
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "#ffffff12" }}>
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${Math.round((currentSurah.verses_memorized || 0) / (currentSurah.total_verses || 1) * 100)}%`,
                      background: `linear-gradient(90deg,${GOLD},${GOLD_LIGHT})`,
                    }}
                  />
                </div>
                <div className="flex justify-between mt-2">
                  <span className="text-[10px]" style={{ color: "#4a6d58" }}>
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
            iconBg="#7f1d1d"
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
                        background: isUrgent ? "#7c300520" : "#16532120",
                        border: `1px solid ${isUrgent ? "#f59e0b44" : "#22c55e44"}`,
                      }}>
                      <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: isUrgent ? "#f59e0b" : "#22c55e" }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black truncate" style={{ color: "#fff" }}>
                          {item.surah_name}
                        </p>
                        <p className="text-[10px] mt-0.5" style={{ color: "#4a6d58" }}>
                          {days === 0 ? "Today" : `${days}d ago`} · Best:{" "}
                          <span style={{ color: GOLD }}>{item.best_accuracy}%</span>
                        </p>
                      </div>
                      <span
                        className="text-[10px] font-black px-2 py-0.5 rounded-lg shrink-0"
                        style={{
                          background: isUrgent ? "#f59e0b22" : "#22c55e22",
                          color:      isUrgent ? "#fbbf24"   : "#4ade80",
                        }}>
                        {isUrgent ? "⚡ Soon" : "✓ On Track"}
                      </span>
                    </button>
                  );
                })}
              {progress.filter(p => daysSince(p.last_reviewed) < 10).length === 0 && (
                <div className="py-6 text-center">
                  <p className="text-xs font-bold" style={{ color: "#4a6d58" }}>No urgent revisions — great job! 🎉</p>
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
            iconBg="#1e1a4d"
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
                const color = score >= 80 ? "#4ade80" : score >= 60 ? GOLD : "#f87171";
                const bg    = score >= 80 ? "#16532120" : score >= 60 ? "#7c300520" : "#7f1d1d20";
                return (
                  <button
                    key={i}
                    onClick={() => onNavigate("recitation")}
                    className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all active:scale-[0.98]"
                    style={{ background: "#ffffff08", border: "1px solid #ffffff0f" }}>
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 font-black text-xs"
                      style={{ background: bg, color, border: `1px solid ${color}44` }}>
                      {score}%
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black truncate" style={{ color: "#fff" }}>
                        {session.surah_name}
                      </p>
                      <p className="text-[10px] mt-0.5" style={{ color: "#4a6d58" }}>
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
          className="max-w-sm mx-4 rounded-2xl border-0"
          style={{ background: MG, border: `1px solid ${GOLD}33` }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-black" style={{ color: GOLD }}>
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
                    background: taskType === t ? GOLD : "#ffffff0f",
                    color:      taskType === t ? DG   : "#4a6d58",
                  }}>
                  {t === "revise" ? "🔄 Revise" : "📖 Memorize"}
                </button>
              ))}
            </div>

            {/* Surah */}
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider mb-1.5 block" style={{ color: GOLD + "aa" }}>
                Surah Name
              </label>
              <Input
                value={taskSurah}
                onChange={e => setTaskSurah(e.target.value)}
                placeholder="e.g. Al-Baqarah"
                className="h-10 text-sm rounded-xl border-0 font-medium"
                style={{ background: "#ffffff0f", color: "#fff" }}
              />
            </div>

            {/* Verses */}
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider mb-1.5 block" style={{ color: GOLD + "aa" }}>
                Verses per day
              </label>
              <Input
                type="number" min={1} max={50}
                value={taskVerses}
                onChange={e => setTaskVerses(e.target.value)}
                className="h-10 text-sm rounded-xl border-0 font-bold"
                style={{ background: "#ffffff0f", color: "#fff" }}
              />
            </div>

            {/* Plan */}
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider mb-2 block" style={{ color: GOLD + "aa" }}>
                Duration
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {(["daily","weekly","biweekly","monthly"] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setTaskPlan(p)}
                    className="py-2 rounded-xl text-[10px] font-black transition-all"
                    style={{
                      background: taskPlan === p ? GOLD : "#ffffff0f",
                      color:      taskPlan === p ? DG   : "#4a6d58",
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
                style={{ background: "#ffffff0f", color: "#4a6d58" }}>
                Cancel
              </button>
              <button
                onClick={addTask}
                disabled={savingTask || !taskSurah.trim()}
                className="flex-1 py-2.5 rounded-xl text-xs font-black disabled:opacity-40"
                style={{ background: GOLD, color: DG }}>
                {savingTask ? "Saving..." : "Add Task"}
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
      style={{ background: "#162d1f", border: "1px solid #ffffff0f" }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: "1px solid #ffffff08" }}>
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: iconBg + "cc" }}>
          <span style={{ color: "#fff" }}>{icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-black leading-tight" style={{ color: "#fff" }}>{title}</p>
          <p className="text-[10px] leading-tight mt-0.5" style={{ color: "#4a6d58" }}>{titleAr}</p>
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
        boxShadow: `0 4px 20px ${colors[0]}80`,
      }}>
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center"
        style={{ background: accent + "25" }}>
        <span style={{ color: accent }}>{icon}</span>
      </div>
      <div>
        <p className="text-2xl font-black leading-none" style={{ color: "#fff" }}>{value}</p>
        <p className="text-[11px] font-bold mt-1 leading-tight" style={{ color: "#ffffffcc" }}>{label}</p>
        <p className="text-[9px] mt-0.5" style={{ color: accent + "88" }}>{labelAr}</p>
      </div>
    </button>
  );
}
