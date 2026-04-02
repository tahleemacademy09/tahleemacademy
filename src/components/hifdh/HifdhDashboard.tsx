/*  src/components/hifdh/HifdhDashboard.tsx - REFINED VERSION */
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  BookOpen, TrendingUp, Flame, Clock, ChevronDown, ChevronUp,
  CheckCircle2, Circle, RotateCcw, BookMarked, Headphones,
  Calendar, AlertCircle, Plus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
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
const urgencyColor = (d: number) => d >= 10 ? "text-red-600" : d >= 5 ? "text-amber-600" : "text-emerald-600";
const urgencyBg = (d: number) => d >= 10 ? "bg-red-50 border-red-200" : d >= 5 ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200";const urgencyLabel = (d: number) => d >= 10 ? "Urgent" : d >= 5 ? "Soon" : "On Track";

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
        let streak = 0;        for (let i = 0; i < 30; i++) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          if (dates.includes(d.toDateString())) streak++;
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

  if (loading) {    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3 p-3 md:p-4 max-w-6xl mx-auto">
      
      {/* ═══════════════════════════════════════════════════════════
          STATS OVERVIEW - Compact Grid
      ═══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={<BookOpen className="w-4 h-4" />}
          value={stats.juzCount || "0"}
          label="Juz Memorized"
          labelAr="أجزاء محفوظة"
          color="text-emerald-700"
          bg="bg-emerald-50"
          onClick={() => onNavigate("recitation")}
        />
        <StatCard
          icon={<TrendingUp className="w-4 h-4" />}
          value={`${stats.avgAccuracy}%`}
          label="Avg Accuracy"
          labelAr="متوسط الدقة"
          color="text-emerald-600"
          bg="bg-emerald-50"
          onClick={() => onNavigate("test")}
        />
        <StatCard
          icon={<Flame className="w-4 h-4" />}
          value={stats.streak}
          label="Day Streak"
          labelAr="سلسلة الأيام"
          color="text-amber-600"
          bg="bg-amber-50"
          onClick={() => onNavigate("test")}
        />
        <StatCard
          icon={<Clock className="w-4 h-4" />}
          value={`${stats.totalMins}m`}
          label="Total Time"
          labelAr="إجمالي الوقت"
          color="text-blue-600"
          bg="bg-blue-50"
          onClick={() => onNavigate("recitation")}
        />      </div>

      {/* ═══════════════════════════════════════════════════════════
          TODAY'S TASKS
      ═══════════════════════════════════════════════════════════ */}
      <Card className="overflow-hidden">
        <button
          onClick={() => setShowTasks(!showTasks)}
          className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-emerald-700" />
            </div>
            <div className="text-left">
              <h3 className="font-semibold text-base text-emerald-900">Today's Tasks</h3>
              <p className="text-xs text-muted-foreground">مهام اليوم</p>
            </div>
          </div>
          <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", showTasks && "rotate-180")} />
        </button>

        {showTasks && (
          <div className="px-3 pb-3 space-y-3">
            {totalToday > 0 && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{completedToday}/{totalToday} completed</span>
                  <span className="font-medium text-emerald-700">{progressPercent}%</span>
                </div>
                <Progress value={progressPercent} className="h-1.5" />
              </div>
            )}

            {tasks.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <Calendar className="w-6 h-6 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No tasks for today yet</p>
                <p className="text-xs mt-0.5">لا توجد مهام اليوم بعد</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    onClick={() => toggleTask(task)}
                    className={cn(
                      "flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-all",
                      task.completed ? "bg-emerald-50 border-emerald-200" : "bg-muted/30 border-border"
                    )}                  >
                    <div className={cn(
                      "w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                      task.completed ? "bg-emerald-600 border-emerald-600" : "border-muted-foreground/40"
                    )}>
                      {task.completed && <CheckCircle2 className="w-3 h-3 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={cn(
                        "font-medium text-sm truncate",
                        task.completed ? "text-emerald-700 line-through" : "text-emerald-900"
                      )}>
                        {task.task_type === "memorize" ? "📖 Memorize" : "🔄 Revise"} · {task.surah_name}
                      </div>
                      <div className="text-xs text-muted-foreground">{task.verses_count} verses</div>
                    </div>
                    <Badge variant={task.completed ? "default" : "secondary"} className="text-xs h-5 px-2">
                      {task.completed ? "Done" : "Pending"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}

            {/* Add Task Form - Compact */}
            <div className="border-t pt-3 space-y-2">
              <div className="text-center">
                <h4 className="font-semibold text-sm text-emerald-900">Add New Task</h4>
                <p className="text-xs text-muted-foreground">إضافة مهمة جديدة</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Type</label>
                  <select
                    value={taskType}
                    onChange={(e) => setTaskType(e.target.value as any)}
                    className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                  >
                    <option value="revise">🔄 Revise</option>
                    <option value="memorize">📖 Memorize</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Verses</label>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={taskVerses}                    onChange={(e) => setTaskVerses(e.target.value)}
                    className="h-8 text-sm px-2"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Surah name</label>
                <Input
                  value={taskSurah}
                  onChange={(e) => setTaskSurah(e.target.value)}
                  placeholder="e.g. Al-Baqarah"
                  className="h-8 text-sm px-2"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Plan Duration</label>
                <div className="grid grid-cols-4 gap-1.5">
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
                        "py-1.5 px-1 rounded-md text-center transition-all text-xs",
                        taskPlan === key
                          ? "bg-emerald-700 text-white font-medium"
                          : "bg-muted hover:bg-muted/80"
                      )}
                    >
                      <div>{en}</div>
                      <div className="text-[10px] opacity-70">{ar}</div>
                    </button>
                  ))}
                </div>
              </div>

              <Button
                onClick={addTask}
                disabled={savingTask || !taskSurah.trim()}
                className="w-full h-9 text-sm bg-emerald-700 hover:bg-emerald-800"
              >
                {savingTask ? "Saving..." : "Add Task · إضافة مهمة"}
              </Button>
            </div>          </div>
        )}
      </Card>

      {/* ═══════════════════════════════════════════════════════════
          JUZ PROGRESS MAP - Compact Grid
      ═══════════════════════════════════════════════════════════ */}
      <Card className="overflow-hidden">
        <button
          onClick={() => setShowJuz(!showJuz)}
          className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
              <BookMarked className="w-4 h-4 text-amber-700" />
            </div>
            <div className="text-left">
              <h3 className="font-semibold text-base text-emerald-900">Juz Progress Map</h3>
              <p className="text-xs text-muted-foreground">خريطة الأجزاء الثلاثين</p>
            </div>
          </div>
          <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", showJuz && "rotate-180")} />
        </button>

        {showJuz && (
          <div className="px-3 pb-3 space-y-3">
            {/* Compact Juz Grid - 6 columns */}
            <div className="grid grid-cols-6 gap-1.5">
              {Array.from({ length: 30 }, (_, i) => {
                const juz = i + 1;
                const done = juzDone.includes(juz);
                const partial = juzPartial.includes(juz);
                return (
                  <button
                    key={juz}
                    onClick={() => onNavigate("recitation")}
                    title={JUZ_NAMES[i]}
                    className={cn(
                      "aspect-square rounded-md flex flex-col items-center justify-center transition-all hover:scale-105",
                      done ? "bg-emerald-700 text-white" :
                      partial ? "bg-emerald-100 text-emerald-700 border border-emerald-300" :
                      "bg-muted text-muted-foreground"
                    )}
                  >
                    <span className="text-xs font-bold">{juz}</span>
                    {done && <CheckCircle2 className="w-2.5 h-2.5 mt-0.5" />}
                  </button>
                );
              })}
            </div>
            {/* Legend */}
            <div className="flex flex-wrap gap-3 justify-center text-xs">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-emerald-700" />
                <span className="text-muted-foreground">Memorized <span className="text-[10px]">محفوظ</span></span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300" />
                <span className="text-muted-foreground">In Progress <span className="text-[10px]">جارٍ</span></span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-muted" />
                <span className="text-muted-foreground">Not Started <span className="text-[10px]">لم يبدأ</span></span>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* ═══════════════════════════════════════════════════════════
          REVISION SCHEDULE
      ═══════════════════════════════════════════════════════════ */}
      <Card className="overflow-hidden">
        <button
          onClick={() => setShowSchedule(!showSchedule)}
          className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-rose-100 flex items-center justify-center">
              <RotateCcw className="w-4 h-4 text-rose-700" />
            </div>
            <div className="text-left">
              <h3 className="font-semibold text-base text-emerald-900">Revision Schedule</h3>
              <p className="text-xs text-muted-foreground">جدول المراجعة</p>
            </div>
          </div>
          <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", showSchedule && "rotate-180")} />
        </button>

        {showSchedule && (
          <div className="px-3 pb-3">
            {progress.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <AlertCircle className="w-6 h-6 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Start reciting to build your revision schedule</p>
                <p className="text-xs mt-0.5">ابدأ التلاوة لبناء جدول مراجعتك</p>
              </div>
            ) : (
              <div className="space-y-1.5">                {progress.map((item, index) => {
                  const days = daysSince(item.last_reviewed);
                  return (
                    <div
                      key={index}
                      onClick={() => onNavigate("test")}
                      className={cn(
                        "flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all hover:shadow-sm",
                        urgencyBg(days)
                      )}
                    >
                      <div className={cn("w-2.5 h-2.5 rounded-full flex-shrink-0", urgencyColor(days).replace("text-", "bg-"))} />
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-sm text-emerald-900 truncate">{item.surah_name}</h4>
                        <p className="text-xs text-muted-foreground">
                          {days === 0 ? "Today" : `${days}d ago`} · Best: <span className="font-semibold text-amber-600">{item.best_accuracy}%</span>
                        </p>
                      </div>
                      <Badge variant="outline" className={cn("text-xs h-5 px-2 font-medium", urgencyColor(days))}>
                        {urgencyLabel(days)}
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
        <Card className="overflow-hidden">
          <button
            onClick={() => setShowSessions(!showSessions)}
            className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                <Headphones className="w-4 h-4 text-blue-700" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-base text-emerald-900">Recent Sessions</h3>
                <p className="text-xs text-muted-foreground">الجلسات الأخيرة</p>
              </div>
            </div>
            <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", showSessions && "rotate-180")} />
          </button>
          {showSessions && (
            <div className="px-3 pb-3 space-y-1.5">
              {sessions.map((session, index) => (
                <div
                  key={index}
                  onClick={() => onNavigate("recitation")}
                  className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                >
                  <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center font-bold text-xs flex-shrink-0 border",
                    session.accuracy_score >= 80 ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                    session.accuracy_score >= 60 ? "bg-amber-50 text-amber-700 border-amber-200" :
                    "bg-rose-50 text-rose-700 border-rose-200"
                  )}>
                    {session.accuracy_score}%
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm text-emerald-900 truncate">{session.surah_name}</h4>
                    <p className="text-xs text-muted-foreground">
                      Ayah {session.ayah_start} · {Math.round((session.duration || 0) / 60)}m
                    </p>
                  </div>
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
// StatCard Component
// ═══════════════════════════════════════════════════════════════

function StatCard({ icon, value, label, labelAr, color, bg, onClick }: any) {
  return (
    <Card 
      onClick={onClick}
      className="p-3 cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 active:scale-95"
    >
      <div className="space-y-1.5 text-center">
        <div className={cn("w-8 h-8 rounded-lg mx-auto flex items-center justify-center", bg)}>
          {icon}
        </div>
        <div className={cn("text-xl md:text-2xl font-bold", color)}>{value}</div>
        <div className="font-medium text-xs text-emerald-900 leading-tight">{label}</div>
        <div className="text-[10px] text-muted-foreground">{labelAr}</div>      </div>
    </Card>
  );
}