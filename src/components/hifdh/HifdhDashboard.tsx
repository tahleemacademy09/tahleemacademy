/*  src/components/hifdh/HifdhDashboard.tsx - BEAUTIFUL VERSION (FIXED) */
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  BookOpen, TrendingUp, Flame, Clock, ChevronDown,
  CheckCircle2, RotateCcw, BookMarked, Headphones,
  Calendar, AlertCircle, Star, Plus
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  userId: string | null;
  studentName: string;
  onNavigate: (tab: string) => void;
}

interface ProgressEntry {
  surah_num: number;
  surah_name: string;
  last_reviewed: string;
  best_accuracy: number;
  times_reviewed: number;
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

const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

const JUZ_NAMES = ["الم","سَيَقُول","تِلْكَ","لَن","وَالْمُحْصَنَات","لَا يُحِبُّ","وَإِذَا","وَلَوْ","قَالَ الْمَلَأُ","وَاعْلَمُوا","يَعْتَذِرُون","وَمَا مِن دَابَّة","وَمَا أُبَرِّئُ","رُبَمَا","سُبْحَانَ","قَالَ أَلَمْ","اقْتَرَبَ","قَدْ أَفْلَحَ","وَقَالَ الَّذِينَ","أَمَّنْ خَلَقَ","اتْلُ مَا أُوحِيَ","وَمَن يَقْنُتْ","وَمَا لِيَ","فَمَن أَظْلَمُ","إِلَيْهِ يُرَدُّ","حم","قَالَ فَمَا خَطْبُكُمْ","قَدْ سَمِعَ","تَبَارَكَ","عَمَّ"];
export default function HifdhDashboard({ userId, studentName, onNavigate }: Props) {
  const [progress, setProgress] = useState<ProgressEntry[]>([]);
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [juzDone, setJuzDone] = useState<number[]>([]);
  const [juzPartial, setJuzPartial] = useState<number[]>([]);
  const [stats, setStats] = useState({ streak: 0, avgAccuracy: 0, totalMins: 0, juzCount: 0 });
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTasks, setShowTasks] = useState(true);
  const [showJuz, setShowJuz] = useState(true);
  const [showSchedule, setShowSchedule] = useState(true);
  const [showSessions, setShowSessions] = useState(true);
  const [taskType, setTaskType] = useState<"memorize"|"revise">("revise");
  const [taskSurah, setTaskSurah] = useState("");
  const [taskVerses, setTaskVerses] = useState("5");
  const [taskPlan, setTaskPlan] = useState<"daily"|"weekly"|"biweekly"|"monthly">("daily");
  const [savingTask, setSavingTask] = useState(false);

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
        const done: number[] = [];
        const partial: number[] = [];
        entries.forEach(p => {
          const j = Math.min(30, Math.ceil(p.surah_num / 4.27));
          if (p.best_accuracy >= 80 && !done.includes(j)) done.push(j);
          else if (!partial.includes(j) && !done.includes(j)) partial.push(j);
        });
        setJuzDone(done);
        setJuzPartial(partial);
        const scores = entries.map(p => p.best_accuracy).filter(Boolean);
        const avg = scores.length ? Math.round(scores.reduce((a,b)=>a+b,0)/scores.length) : 0;
        setStats(s => ({ ...s, avgAccuracy: avg, juzCount: done.length }));
      }
      if (sess.data) {
        setSessions(sess.data as SessionEntry[]);
        const dates = [...new Set(sess.data.map((s:any) => new Date(s.created_at).toDateString()))];
        let streak = 0;
        for (let i = 0; i < 30; i++) {
          const d = new Date();
          d.setDate(d.getDate() - i);          if (dates.includes(d.toDateString())) streak++;
          else if (i > 0) break;
        }
        const totalMins = Math.round(sess.data.reduce((a:number,s:any)=>a+(s.duration||0),0)/60);
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
    const dates: string[] = [];
    const count = taskPlan==="daily"?1:taskPlan==="weekly"?7:taskPlan==="biweekly"?14:30;
    for (let i=0;i<count;i++) {
      const d = new Date();
      d.setDate(d.getDate()+i);
      dates.push(d.toISOString().split("T")[0]);
    }
    const inserts = dates.map(d => ({
      user_id: userId,
      task_type: taskType,
      surah_name: taskSurah.trim(),
      verses_count: parseInt(taskVerses)||5,
      completed: false,
      target_date: d
    }));
    const { data } = await supabase.from("hifdh_daily_tasks").insert(inserts).select();
    if (data) setTasks(prev => [...prev, ...data.filter((t:any)=>t.target_date===today) as DailyTask[]]);
    setSavingTask(false);
    setTaskSurah("");
  };

  const toggleTask = async (task: DailyTask) => {
    if (!task.id) return;
    await supabase.from("hifdh_daily_tasks").update({ completed: !task.completed }).eq("id", task.id);
    setTasks(prev => prev.map(t => t.id===task.id ? {...t,completed:!t.completed} : t));
  };

  const completedToday = tasks.filter(t => t.completed).length;
  const totalToday = tasks.length;
  const progressPercent = totalToday > 0 ? Math.round((completedToday/totalToday)*100) : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-3">          <div className="w-12 h-12 border-4 border-[#1a3d24] border-t-[#c9a84c] rounded-full animate-spin mx-auto" />
          <p className="text-sm text-[#7a9e88] font-medium">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 md:p-6 max-w-6xl mx-auto bg-gradient-to-br from-[#fafafa] via-[#f8fafb] to-[#f0f4f0] min-h-screen">
      
      {/* ═══════════════════════════════════════════════════════════
          STATS OVERVIEW - Beautiful Gradient Cards
      ═══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<BookOpen className="w-5 h-5" />}
          value={stats.juzCount || "0"}
          label="Juz Memorized"
          labelAr="أجزاء محفوظة"
          gradient="from-[#1a3d24] to-[#276749]"
          accentColor="#c9a84c"
          onClick={() => onNavigate("recitation")}
        />
        <StatCard
          icon={<TrendingUp className="w-5 h-5" />}
          value={`${stats.avgAccuracy}%`}
          label="Avg Accuracy"
          labelAr="متوسط الدقة"
          gradient="from-[#276749] to-[#38a169]"
          accentColor="#c9a84c"
          onClick={() => onNavigate("test")}
        />
        <StatCard
          icon={<Flame className="w-5 h-5" />}
          value={stats.streak}
          label="Day Streak"
          labelAr="سلسلة الأيام"
          gradient="from-[#b7791f] to-[#d69e2e]"
          accentColor="#fff"
          onClick={() => onNavigate("test")}
        />
        <StatCard
          icon={<Clock className="w-5 h-5" />}
          value={`${stats.totalMins}m`}
          label="Total Time"
          labelAr="إجمالي الوقت"
          gradient="from-[#2b6cb0] to-[#4299e1]"
          accentColor="#fff"
          onClick={() => onNavigate("recitation")}
        />      </div>

      {/* ═══════════════════════════════════════════════════════════
          TODAY'S TASKS
      ═══════════════════════════════════════════════════════════ */}
      <Card className="overflow-hidden border border-[#e2e8f0] shadow-sm">
        <button
          onClick={() => setShowTasks(!showTasks)}
          className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-[#1a3d24]/5 to-[#c9a84c]/5 hover:from-[#1a3d24]/10 hover:to-[#c9a84c]/10 transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1a3d24] to-[#276749] flex items-center justify-center shadow-lg">
              <CheckCircle2 className="w-5 h-5 text-[#c9a84c]" />
            </div>
            <div className="text-left">
              <h3 className="font-bold text-lg text-[#1a3d24]">Today's Tasks</h3>
              <p className="text-sm text-[#7a9e88] font-medium">مهام اليوم</p>
            </div>
          </div>
          <ChevronDown className={cn("w-5 h-5 text-[#7a9e88] transition-transform", showTasks && "rotate-180")} />
        </button>

        {showTasks && (
          <div className="px-4 pb-4 space-y-4">
            {totalToday > 0 && (
              <div className="space-y-2 p-3 bg-gradient-to-r from-[#1a3d24]/5 to-transparent rounded-lg">
                <div className="flex justify-between text-sm">
                  <span className="text-[#1a3d24] font-semibold">{completedToday} of {totalToday} completed</span>
                  <span className="font-bold text-[#276749]">{progressPercent}%</span>
                </div>
                <Progress value={progressPercent} className="h-2 bg-[#e2e8f0]" />
              </div>
            )}

            {tasks.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-gradient-to-br from-[#c9a84c]/20 to-[#b7791f]/20 flex items-center justify-center">
                  <Calendar className="w-7 h-7 text-[#b7791f]" />
                </div>
                <p className="text-[#1a3d24] font-semibold">No tasks for today yet</p>
                <p className="text-sm text-[#7a9e88] mt-1">لا توجد مهام اليوم بعد</p>
              </div>
            ) : (
              <div className="space-y-2">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    onClick={() => toggleTask(task)}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all",                      task.completed 
                        ? "bg-gradient-to-r from-[#276749]/10 to-[#1a3d24]/10 border-[#276749]/30" 
                        : "bg-white border-[#e2e8f0] hover:border-[#c9a84c]/50 hover:shadow-md"
                    )}
                  >
                    <div className={cn(
                      "w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all",
                      task.completed 
                        ? "bg-gradient-to-br from-[#276749] to-[#1a3d24] border-[#276749]" 
                        : "border-[#cbd5e0]"
                    )}>
                      {task.completed && <CheckCircle2 className="w-4 h-4 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={cn(
                        "font-bold text-sm truncate",
                        task.completed ? "text-[#276749] line-through" : "text-[#1a3d24]"
                      )}>
                        {task.task_type === "memorize" ? "📖 Memorize" : "🔄 Revise"} · {task.surah_name}
                      </div>
                      <div className="text-xs text-[#7a9e88] font-medium">{task.verses_count} verses · {task.verses_count} آيات</div>
                    </div>
                    <Badge 
                      className={cn(
                        "text-xs font-semibold px-3 py-1",
                        task.completed 
                          ? "bg-gradient-to-r from-[#276749] to-[#1a3d24] text-white" 
                          : "bg-[#f0f4f0] text-[#7a9e88]"
                      )}
                    >
                      {task.completed ? "Done" : "Pending"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}

            {/* Add Task Form */}
            <div className="border-t-2 border-[#e2e8f0] pt-4 space-y-3">
              <div className="text-center">
                <h4 className="font-bold text-[#1a3d24] flex items-center justify-center gap-2">
                  <Plus className="w-4 h-4 text-[#c9a84c]" />
                  Add New Task
                </h4>
                <p className="text-xs text-[#7a9e88] mt-0.5">إضافة مهمة جديدة</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-[#1a3d24] mb-1.5 block">Type</label>                  <select
                    value={taskType}
                    onChange={(e) => setTaskType(e.target.value as any)}
                    className="w-full rounded-lg border-2 border-[#e2e8f0] bg-white px-3 py-2 text-sm font-medium text-[#1a3d24] focus:border-[#c9a84c] focus:outline-none"
                  >
                    <option value="revise">🔄 Revise</option>
                    <option value="memorize">📖 Memorize</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-[#1a3d24] mb-1.5 block">Verses per day</label>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={taskVerses}
                    onChange={(e) => setTaskVerses(e.target.value)}
                    className="h-10 border-2 border-[#e2e8f0] text-sm font-semibold text-[#1a3d24] focus:border-[#c9a84c]"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-[#1a3d24] mb-1.5 block">Surah name</label>
                <Input
                  value={taskSurah}
                  onChange={(e) => setTaskSurah(e.target.value)}
                  placeholder="e.g. Al-Baqarah"
                  className="h-10 border-2 border-[#e2e8f0] text-sm font-medium text-[#1a3d24] placeholder:text-[#a0aec0] focus:border-[#c9a84c]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[#1a3d24] mb-2 block">Plan Duration</label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    ["daily", "Daily", "يومي"],
                    ["weekly", "Weekly", "أسبوعي"],
                    ["biweekly", "2 Weeks", "أسبوعان"],
                    ["monthly", "Monthly", "شهري"]
                  ].map(([key, en, ar]) => (
                    <button
                      key={key}
                      onClick={() => setTaskPlan(key)}
                      className={cn(
                        "py-2.5 px-2 rounded-xl text-center transition-all text-xs font-bold",
                        taskPlan === key
                          ? "bg-gradient-to-br from-[#1a3d24] to-[#276749] text-white shadow-lg scale-105"
                          : "bg-[#f8fafb] text-[#7a9e88] hover:bg-[#e2e8f0]"
                      )}                    >
                      <div>{en}</div>
                      <div className="text-[10px] opacity-80 mt-0.5">{ar}</div>
                    </button>
                  ))}
                </div>
              </div>

              <Button
                onClick={addTask}
                disabled={savingTask || !taskSurah.trim()}
                className="w-full h-11 bg-gradient-to-r from-[#1a3d24] to-[#276749] hover:from-[#276749] hover:to-[#1a3d24] text-white font-bold text-sm shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {savingTask ? "Saving..." : "Add Task · إضافة مهمة"}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* ═══════════════════════════════════════════════════════════
          JUZ PROGRESS MAP - Beautiful Grid
      ═══════════════════════════════════════════════════════════ */}
      <Card className="overflow-hidden border border-[#e2e8f0] shadow-sm">
        <button
          onClick={() => setShowJuz(!showJuz)}
          className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-[#c9a84c]/10 to-[#1a3d24]/5 hover:from-[#c9a84c]/20 hover:to-[#1a3d24]/10 transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#c9a84c] to-[#b7791f] flex items-center justify-center shadow-lg">
              <BookMarked className="w-5 h-5 text-white" />
            </div>
            <div className="text-left">
              <h3 className="font-bold text-lg text-[#1a3d24]">Juz Progress Map</h3>
              <p className="text-sm text-[#7a9e88] font-medium">خريطة الأجزاء الثلاثين</p>
            </div>
          </div>
          <ChevronDown className={cn("w-5 h-5 text-[#7a9e88] transition-transform", showJuz && "rotate-180")} />
        </button>

        {showJuz && (
          <div className="px-4 pb-4 space-y-4">
            {/* Compact Juz Grid */}
            <div className="grid grid-cols-6 gap-2">
              {Array.from({ length: 30 }, (_, i) => {
                const juz = i + 1;
                const done = juzDone.includes(juz);
                const partial = juzPartial.includes(juz);
                return (
                  <button                    key={juz}
                    onClick={() => onNavigate("recitation")}
                    title={JUZ_NAMES[i]}
                    className={cn(
                      "aspect-square rounded-xl flex flex-col items-center justify-center transition-all hover:scale-110 shadow-md",
                      done 
                        ? "bg-gradient-to-br from-[#1a3d24] to-[#276749] text-white" 
                        : partial 
                        ? "bg-gradient-to-br from-[#9ae6b4] to-[#276749] text-[#1a3d24] border-2 border-[#276749]" 
                        : "bg-[#f8fafb] text-[#a0aec0] border-2 border-[#e2e8f0]"
                    )}
                  >
                    <span className="text-sm font-bold">{juz}</span>
                    {done && <CheckCircle2 className="w-3 h-3 mt-0.5" />}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-4 justify-center text-xs">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-lg bg-gradient-to-br from-[#1a3d24] to-[#276749] shadow" />
                <span className="font-semibold text-[#1a3d24]">Memorized <span className="text-[#7a9e88]">محفوظ</span></span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-lg bg-gradient-to-br from-[#9ae6b4] to-[#276749] border-2 border-[#276749] shadow" />
                <span className="font-semibold text-[#1a3d24]">In Progress <span className="text-[#7a9e88]">جارٍ</span></span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-lg bg-[#f8fafb] border-2 border-[#e2e8f0]" />
                <span className="font-semibold text-[#1a3d24]">Not Started <span className="text-[#7a9e88]">لم يبدأ</span></span>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* ═══════════════════════════════════════════════════════════
          REVISION SCHEDULE
      ═══════════════════════════════════════════════════════════ */}
      <Card className="overflow-hidden border border-[#e2e8f0] shadow-sm">
        <button
          onClick={() => setShowSchedule(!showSchedule)}
          className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-[#c0392b]/5 to-[#b7791f]/5 hover:from-[#c0392b]/10 hover:to-[#b7791f]/10 transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#c0392b] to-[#e74c3c] flex items-center justify-center shadow-lg">
              <RotateCcw className="w-5 h-5 text-white" />
            </div>            <div className="text-left">
              <h3 className="font-bold text-lg text-[#1a3d24]">Revision Schedule</h3>
              <p className="text-sm text-[#7a9e88] font-medium">جدول المراجعة</p>
            </div>
          </div>
          <ChevronDown className={cn("w-5 h-5 text-[#7a9e88] transition-transform", showSchedule && "rotate-180")} />
        </button>

        {showSchedule && (
          <div className="px-4 pb-4">
            {progress.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-gradient-to-br from-[#c9a84c]/20 to-[#b7791f]/20 flex items-center justify-center">
                  <AlertCircle className="w-7 h-7 text-[#b7791f]" />
                </div>
                <p className="text-[#1a3d24] font-semibold">Start reciting to build your revision schedule</p>
                <p className="text-sm text-[#7a9e88] mt-1">ابدأ التلاوة لبناء جدول مراجعتك</p>
              </div>
            ) : (
              <div className="space-y-2">
                {progress.map((item, index) => {
                  const days = daysSince(item.last_reviewed);
                  const isUrgent = days >= 10;
                  const isSoon = days >= 5 && days < 10;
                  return (
                    <div
                      key={index}
                      onClick={() => onNavigate("test")}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all hover:shadow-md",
                        isUrgent ? "bg-gradient-to-r from-red-50 to-red-100 border-red-300" :
                        isSoon ? "bg-gradient-to-r from-amber-50 to-amber-100 border-amber-300" :
                        "bg-gradient-to-r from-emerald-50 to-emerald-100 border-emerald-300"
                      )}
                    >
                      <div className={cn(
                        "w-3 h-3 rounded-full flex-shrink-0",
                        isUrgent ? "bg-red-600" : isSoon ? "bg-amber-600" : "bg-emerald-600"
                      )} />
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-sm text-[#1a3d24] truncate">{item.surah_name}</h4>
                        <p className="text-xs text-[#7a9e88] font-medium">
                          {days === 0 ? "Today" : `${days}d ago`} · Best: <span className="font-bold text-[#b7791f]">{item.best_accuracy}%</span>
                        </p>
                      </div>
                      <Badge 
                        className={cn(
                          "text-xs font-bold px-3 py-1 border-2",
                          isUrgent ? "bg-red-600 text-white border-red-600" :
                          isSoon ? "bg-amber-500 text-white border-amber-500" :                          "bg-emerald-600 text-white border-emerald-600"
                        )}
                      >
                        {isUrgent ? "Urgent" : isSoon ? "Soon" : "On Track"}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* ═══════════════════════════════════════════════════════════
          RECENT SESSIONS
      ═══════════════════════════════════════════════════════════ */}
      {sessions.length > 0 && (
        <Card className="overflow-hidden border border-[#e2e8f0] shadow-sm">
          <button
            onClick={() => setShowSessions(!showSessions)}
            className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-[#2b6cb0]/5 to-[#4299e1]/5 hover:from-[#2b6cb0]/10 hover:to-[#4299e1]/10 transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#2b6cb0] to-[#4299e1] flex items-center justify-center shadow-lg">
                <Headphones className="w-5 h-5 text-white" />
              </div>
              <div className="text-left">
                <h3 className="font-bold text-lg text-[#1a3d24]">Recent Sessions</h3>
                <p className="text-sm text-[#7a9e88] font-medium">الجلسات الأخيرة</p>
              </div>
            </div>
            <ChevronDown className={cn("w-5 h-5 text-[#7a9e88] transition-transform", showSessions && "rotate-180")} />
          </button>

          {showSessions && (
            <div className="px-4 pb-4 space-y-2">
              {sessions.map((session, index) => (
                <div
                  key={index}
                  onClick={() => onNavigate("recitation")}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-gradient-to-r hover:from-[#1a3d24]/5 hover:to-[#c9a84c]/5 cursor-pointer transition-all border border-transparent hover:border-[#e2e8f0]"
                >
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0 border-2 shadow-md",
                    session.accuracy_score >= 80 
                      ? "bg-gradient-to-br from-[#276749] to-[#1a3d24] text-white border-[#276749]" :
                    session.accuracy_score >= 60 
                      ? "bg-gradient-to-br from-[#b7791f] to-[#d69e2e] text-white border-[#b7791f]" :
                      "bg-gradient-to-br from-[#c0392b] to-[#e74c3c] text-white border-[#c0392b]"                  )}>
                    {session.accuracy_score}%
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-sm text-[#1a3d24] truncate">{session.surah_name}</h4>
                    <p className="text-xs text-[#7a9e88] font-medium">
                      Ayah {session.ayah_start} · {Math.round((session.duration || 0) / 60)}m · {new Date(session.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  {session.accuracy_score >= 80 && <Star className="w-4 h-4 text-[#c9a84c] fill-[#c9a84c]" />}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// StatCard Component with Gradient
// ═══════════════════════════════════════════════════════════════

function StatCard({ icon, value, label, labelAr, gradient, accentColor, onClick }: any) {
  return (
    <Card 
      onClick={onClick}
      className={cn(
        "p-4 cursor-pointer transition-all hover:shadow-xl hover:-translate-y-1 active:scale-95 overflow-hidden",
        "bg-gradient-to-br", gradient
      )}
    >
      <div className="space-y-2 text-center relative">
        <div className="w-10 h-10 rounded-xl mx-auto flex items-center justify-center bg-white/20 backdrop-blur-sm">
          {icon}
        </div>
        <div className="text-2xl md:text-3xl font-black text-white">{value}</div>
        <div className="font-bold text-xs text-white/90 leading-tight">{label}</div>
        <div className="text-[10px] text-white/70">{labelAr}</div>
      </div>
    </Card>
  );
}