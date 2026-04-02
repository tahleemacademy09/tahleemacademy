
/*  src/components/hifdh/HifdhDashboard.tsx - REDESIGNED VERSION  */
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  BookOpen, 
  TrendingUp, 
  Flame, 
  Clock, 
  ChevronDown, 
  ChevronUp,
  Plus,
  CheckCircle2,
  Circle,
  RotateCcw,
  BookMarked,
  Headphones,
  Calendar,
  Trophy,
  AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

// ... (keep all your existing interfaces and helper functions)

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
const urgencyColor = (d: number) => d >= 10 ? "text-destructive" : d >= 5 ? "text-amber-600" : "text-emerald-600";
const urgencyBg = (d: number) => d >= 10 ? "bg-destructive/10 border-destructive/20" : d >= 5 ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200";
const urgencyLabel = (d: number) => d >= 10 ? "Urgent" : d >= 5 ? "Soon" : "On Track";

const JUZ_NAMES = ["الم","سَيَقُول","تِلْكَ","لَن","وَالْمُحْصَنَات","لَا يُحِبُّ","وَإِذَا","وَلَوْ","قَالَ الْمَلَأُ","وَاعْلَمُوا","يَعْتَذِرُون","وَمَا مِن دَابَّة","وَمَا أُبَرِّئُ","رُبَمَا","سُبْحَانَ","قَالَ أَلَمْ","اقْتَرَبَ","قَدْ أَفْلَحَ","وَقَالَ الَّذِينَ","أَمَّنْ خَلَقَ","اتْلُ مَا أُوحِيَ","وَمَن يَقْنُتْ","وَمَا لِيَ","فَمَن أَظْلَمُ","إِلَيْهِ يُرَدُّ","حم","قَالَ فَمَا خَطْبُكُمْ","قَدْ سَمِعَ","تَبَارَكَ","عَمَّ"];

export default function HifdhDashboard({ userId, studentName, onNavigate }: Props) {
  const [progress, setProgress] = useState<ProgressEntry[]>([]);
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [juzDone, setJuzDone] = useState<number[]>([]);
  const [juzPartial, setJuzPartial] = useState<number[]>([]);
  const [stats, setStats] = useState({ streak: 0, avgAccuracy: 0, totalMins: 0, juzCount: 0 });
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [loading, setLoading] = useState(true);

  // Collapse state
  const [showTasks, setShowTasks] = useState(true);
  const [showJuz, setShowJuz] = useState(true);
  const [showSchedule, setShowSchedule] = useState(true);
  const [showSessions, setShowSessions] = useState(true);

  // Daily task form
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
        setProgress(entries);        const done: number[] = [];
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
    }));    const { data } = await supabase.from("hifdh_daily_tasks").insert(inserts).select();
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
        <div className="text-center space-y-3">
          <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      
      {/* ═══════════════════════════════════════════════════════════
          STATS OVERVIEW - Horizontal Cards
      ═══════════════════════════════════════════════════════════ */}
      <section>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            icon={<BookOpen className="w-5 h-5" />}
            value={stats.juzCount || "0"}
            label="Juz Memorized"
            labelAr="أجزاء محفوظة"
            color="text-emerald-700"
            bg="bg-emerald-50"
            onClick={() => onNavigate("recitation")}
          />
          <StatCard
            icon={<TrendingUp className="w-5 h-5" />}
            value={`${stats.avgAccuracy}%`}
            label="Avg Accuracy"
            labelAr="متوسط الدقة"
            color="text-emerald-600"            bg="bg-emerald-50"
            onClick={() => onNavigate("test")}
          />
          <StatCard
            icon={<Flame className="w-5 h-5" />}
            value={stats.streak}
            label="Day Streak"
            labelAr="سلسلة الأيام"
            color="text-amber-600"
            bg="bg-amber-50"
            onClick={() => onNavigate("test")}
          />
          <StatCard
            icon={<Clock className="w-5 h-5" />}
            value={`${stats.totalMins}m`}
            label="Total Time"
            labelAr="إجمالي الوقت"
            color="text-blue-600"
            bg="bg-blue-50"
            onClick={() => onNavigate("recitation")}
          />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          TODAY'S TASKS
      ═══════════════════════════════════════════════════════════ */}
      <section>
        <Card className="overflow-hidden">
          <button
            onClick={() => setShowTasks(!showTasks)}
            className="w-full flex items-center justify-between p-4 md:p-5 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-emerald-700" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-lg text-emerald-900">Today's Tasks</h3>
                <p className="text-sm text-muted-foreground">مهام اليوم</p>
              </div>
            </div>
            <ChevronDown className={cn("w-5 h-5 text-muted-foreground transition-transform", showTasks && "rotate-180")} />
          </button>

          {showTasks && (
            <div className="px-4 md:px-5 pb-4 md:pb-5 space-y-4">
              {/* Progress Bar */}
              {totalToday > 0 && (
                <div className="space-y-2">                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{completedToday} of {totalToday} completed</span>
                    <span className="font-medium text-emerald-700">{progressPercent}%</span>
                  </div>
                  <Progress value={progressPercent} className="h-2" />
                </div>
              )}

              {/* Task List */}
              {tasks.length === 0 ? (
                <EmptyState
                  icon={<Calendar className="w-8 h-8" />}
                  title="No tasks for today yet"
                  subtitle="لا توجد مهام اليوم بعد"
                />
              ) : (
                <div className="space-y-2">
                  {tasks.map((task) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      onToggle={() => toggleTask(task)}
                    />
                  ))}
                </div>
              )}

              {/* Add Task Form */}
              <AddTaskForm
                taskType={taskType}
                setTaskType={setTaskType}
                taskSurah={taskSurah}
                setTaskSurah={setTaskSurah}
                taskVerses={taskVerses}
                setTaskVerses={setTaskVerses}
                taskPlan={taskPlan}
                setTaskPlan={setTaskPlan}
                savingTask={savingTask}
                onAdd={addTask}
              />
            </div>
          )}
        </Card>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          JUZ PROGRESS MAP - Linear Progress Bar
      ═══════════════════════════════════════════════════════════ */}
      <section>
        <Card className="overflow-hidden">          <button
            onClick={() => setShowJuz(!showJuz)}
            className="w-full flex items-center justify-between p-4 md:p-5 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <BookMarked className="w-5 h-5 text-amber-700" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-lg text-emerald-900">Juz Progress Map</h3>
                <p className="text-sm text-muted-foreground">خريطة الأجزاء الثلاثين</p>
              </div>
            </div>
            <ChevronDown className={cn("w-5 h-5 text-muted-foreground transition-transform", showJuz && "rotate-180")} />
          </button>

          {showJuz && (
            <div className="px-4 md:px-5 pb-4 md:pb-5 space-y-4">
              {/* Linear Progress Bar */}
              <div className="grid grid-cols-15 gap-1">
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
                        "aspect-square rounded-md flex flex-col items-center justify-center text-xs font-bold transition-all hover:scale-110",
                        done ? "bg-emerald-700 text-white" :
                        partial ? "bg-emerald-100 text-emerald-700 border-2 border-emerald-300" :
                        "bg-muted text-muted-foreground"
                      )}
                    >
                      <span>{juz}</span>
                      {done && <CheckCircle2 className="w-3 h-3 mt-0.5" />}
                    </button>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="flex flex-wrap gap-4 justify-center">
                <LegendItem color="bg-emerald-700" label="Memorized" labelAr="محفوظ" />
                <LegendItem color="bg-emerald-100 border-2 border-emerald-300" label="In Progress" labelAr="جارٍ" />
                <LegendItem color="bg-muted" label="Not Started" labelAr="لم يبدأ" />
              </div>
            </div>          )}
        </Card>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          REVISION SCHEDULE
      ═══════════════════════════════════════════════════════════ */}
      <section>
        <Card className="overflow-hidden">
          <button
            onClick={() => setShowSchedule(!showSchedule)}
            className="w-full flex items-center justify-between p-4 md:p-5 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-rose-100 flex items-center justify-center">
                <RotateCcw className="w-5 h-5 text-rose-700" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-lg text-emerald-900">Revision Schedule</h3>
                <p className="text-sm text-muted-foreground">جدول المراجعة</p>
              </div>
            </div>
            <ChevronDown className={cn("w-5 h-5 text-muted-foreground transition-transform", showSchedule && "rotate-180")} />
          </button>

          {showSchedule && (
            <div className="px-4 md:px-5 pb-4 md:pb-5">
              {progress.length === 0 ? (
                <EmptyState
                  icon={<AlertCircle className="w-8 h-8" />}
                  title="Start reciting to build your revision schedule"
                  subtitle="ابدأ التلاوة لبناء جدول مراجعتك"
                />
              ) : (
                <div className="space-y-2">
                  {progress.map((item, index) => {
                    const days = daysSince(item.last_reviewed);
                    return (
                      <div
                        key={index}
                        onClick={() => onNavigate("test")}
                        className={cn(
                          "flex items-center gap-4 p-3 rounded-lg border cursor-pointer transition-all hover:shadow-md",
                          urgencyBg(days)
                        )}
                      >
                        <div className={cn("w-3 h-3 rounded-full flex-shrink-0", urgencyColor(days).replace("text-", "bg-"))} />
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-emerald-900 truncate">{item.surah_name}</h4>
                          <p className="text-sm text-muted-foreground">                            {days === 0 ? "Today" : `${days}d ago`} · Best: <span className="font-bold text-amber-600">{item.best_accuracy}%</span>
                          </p>
                        </div>
                        <Badge variant="outline" className={cn("font-bold", urgencyColor(days))}>
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
      </section>

      {/* ═══════════════════════════════════════════════════════════
          RECENT SESSIONS
      ═══════════════════════════════════════════════════════════ */}
      {sessions.length > 0 && (
        <section>
          <Card className="overflow-hidden">
            <button
              onClick={() => setShowSessions(!showSessions)}
              className="w-full flex items-center justify-between p-4 md:p-5 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Headphones className="w-5 h-5 text-blue-700" />
                </div>
                <div className="text-left">
                  <h3 className="font-semibold text-lg text-emerald-900">Recent Sessions</h3>
                  <p className="text-sm text-muted-foreground">الجلسات الأخيرة</p>
                </div>
              </div>
              <ChevronDown className={cn("w-5 h-5 text-muted-foreground transition-transform", showSessions && "rotate-180")} />
            </button>

            {showSessions && (
              <div className="px-4 md:px-5 pb-4 md:pb-5 space-y-2">
                {sessions.map((session, index) => (
                  <div
                    key={index}
                    onClick={() => onNavigate("recitation")}
                    className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                  >
                    <div className={cn(
                      "w-12 h-12 rounded-lg flex items-center justify-center font-bold text-sm flex-shrink-0 border-2",
                      session.accuracy_score >= 80 ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                      session.accuracy_score >= 60 ? "bg-amber-50 text-amber-700 border-amber-200" :                      "bg-rose-50 text-rose-700 border-rose-200"
                    )}>
                      {session.accuracy_score}%
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-emerald-900 truncate">{session.surah_name}</h4>
                      <p className="text-sm text-muted-foreground">
                        Ayah {session.ayah_start} · {Math.round((session.duration || 0) / 60)}m · {new Date(session.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </section>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════

function StatCard({ icon, value, label, labelAr, color, bg, onClick }: any) {
  return (
    <Card 
      onClick={onClick}
      className="p-4 cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1 active:scale-95"
    >
      <div className="space-y-2 text-center">
        <div className={cn("w-10 h-10 rounded-lg mx-auto flex items-center justify-center", bg)}>
          {icon}
        </div>
        <div className={cn("text-2xl md:text-3xl font-black", color)}>{value}</div>
        <div className="font-semibold text-sm text-emerald-900">{label}</div>
        <div className="text-xs text-muted-foreground">{labelAr}</div>
      </div>
    </Card>
  );
}

function TaskItem({ task, onToggle }: { task: DailyTask; onToggle: () => void }) {
  return (
    <div
      onClick={onToggle}
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
        task.completed ? "bg-emerald-50 border-emerald-200" : "bg-muted/50 border-border"      )}
    >
      <div className={cn(
        "w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0",
        task.completed ? "bg-emerald-600 border-emerald-600" : "border-muted-foreground"
      )}>
        {task.completed && <CheckCircle2 className="w-4 h-4 text-white" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className={cn(
          "font-semibold text-sm truncate",
          task.completed ? "text-emerald-700 line-through" : "text-emerald-900"
        )}>
          {task.task_type === "memorize" ? "📖 Memorize" : "🔄 Revise"} · {task.surah_name}
        </div>
        <div className="text-xs text-muted-foreground">{task.verses_count} verses</div>
      </div>
      <Badge variant={task.completed ? "default" : "secondary"} className="text-xs">
        {task.completed ? "Done" : "Pending"}
      </Badge>
    </div>
  );
}

function AddTaskForm({ ...props }: any) {
  return (
    <div className="border-t pt-4 space-y-3">
      <div className="text-center">
        <h4 className="font-semibold text-emerald-900">Add New Task</h4>
        <p className="text-sm text-muted-foreground">إضافة مهمة جديدة</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Type</label>
          <select
            value={props.taskType}
            onChange={(e) => props.setTaskType(e.target.value)}
            className="w-full rounded-lg border bg-background p-2 text-sm"
          >
            <option value="revise">🔄 Revise</option>
            <option value="memorize">📖 Memorize</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Verses per day</label>
          <input
            type="number"
            min={1}
            max={50}            value={props.taskVerses}
            onChange={(e) => props.setTaskVerses(e.target.value)}
            className="w-full rounded-lg border bg-background p-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Surah name</label>
        <input
          value={props.taskSurah}
          onChange={(e) => props.setTaskSurah(e.target.value)}
          placeholder="e.g. Al-Baqarah"
          className="w-full rounded-lg border bg-background p-2 text-sm"
        />
      </div>

      <div>
        <label className="text-xs font-semibold text-muted-foreground mb-2 block">Plan Duration</label>
        <div className="grid grid-cols-4 gap-2">
          {[
            ["daily", "Daily", "يومي"],
            ["weekly", "Weekly", "أسبوعي"],
            ["biweekly", "2 Weeks", "أسبوعان"],
            ["monthly", "Monthly", "شهري"]
          ].map(([key, en, ar]) => (
            <button
              key={key}
              onClick={() => props.setTaskPlan(key)}
              className={cn(
                "p-2 rounded-lg text-center transition-all",
                props.taskPlan === key
                  ? "bg-emerald-700 text-white"
                  : "bg-muted hover:bg-muted/80"
              )}
            >
              <div className="text-xs font-bold">{en}</div>
              <div className="text-[10px] opacity-70">{ar}</div>
            </button>
          ))}
        </div>
      </div>

      <Button
        onClick={props.onAdd}
        disabled={props.savingTask || !props.taskSurah.trim()}
        className="w-full bg-emerald-700 hover:bg-emerald-800"
      >
        {props.savingTask ? "Saving..." : "Add Task · إضافة مهمة"}
      </Button>    </div>
  );
}

function EmptyState({ icon, title, subtitle }: any) {
  return (
    <div className="text-center py-8 text-muted-foreground">
      <div className="mb-3 flex justify-center">{icon}</div>
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs mt-1">{subtitle}</p>
    </div>
  );
}

function LegendItem({ color, label, labelAr }: any) {
  return (
    <div className="flex items-center gap-2">
      <div className={cn("w-4 h-4 rounded", color)} />
      <div>
        <span className="text-xs font-semibold text-emerald-900">{label}</span>
        <span className="text-xs text-muted-foreground ml-1">{labelAr}</span>
      </div>
    </div>
  );
}