/*  src/components/hifdh/HifdhDashboard.tsx - PROFESSIONAL OPTIMIZED VERSION */
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  BookOpen, TrendingUp, Flame, Clock, ChevronDown, ChevronRight,
  CheckCircle2, RotateCcw, BookMarked, Headphones, Calendar, 
  AlertCircle, Star, Plus, Play, BarChart3, Trophy, AlertTriangle,
  X, ArrowRight
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
interface WeeklyData {
  day: string;
  count: number;
}

const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

const JUZ_NAMES = ["الم","سَيَقُول","تِلْكَ","لَن","وَالْمُحْصَنَات","لَا يُحِبُّ","وَإِذَا","وَلَوْ","قَالَ الْمَلَأُ","وَاعْلَمُوا","يَعْتَذِرُون","وَمَا مِن دَابَّة","وَمَا أُبَرِّئُ","رُبَمَا","سُبْحَانَ","قَالَ أَلَمْ","اقْتَرَبَ","قَدْ أَفْلَحَ","وَقَالَ الَّذِينَ","أَمَّنْ خَلَقَ","اتْلُ مَا أُوحِيَ","وَمَن يَقْنُتْ","وَمَا لِيَ","فَمَن أَظْلَمُ","إِلَيْهِ يُرَدُّ","حم","قَالَ فَمَا خَطْبُكُمْ","قَدْ سَمِعَ","تَبَارَكَ","عَمَّ"];

const WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function HifdhDashboard({ userId, studentName, onNavigate }: Props) {
  const [progress, setProgress] = useState<ProgressEntry[]>([]);
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [juzDone, setJuzDone] = useState<number[]>([]);
  const [juzPartial, setJuzPartial] = useState<number[]>([]);
  const [stats, setStats] = useState({ streak: 0, avgAccuracy: 0, totalMins: 0, juzCount: 0 });
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [weeklyData, setWeeklyData] = useState<WeeklyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddTask, setShowAddTask] = useState(false);
  const [taskType, setTaskType] = useState<"memorize"|"revise">("revise");
  const [taskSurah, setTaskSurah] = useState("");
  const [taskVerses, setTaskVerses] = useState("5");
  const [taskPlan, setTaskPlan] = useState<"daily"|"weekly"|"biweekly"|"monthly">("daily");
  const [savingTask, setSavingTask] = useState(false);

  const overdueCount = progress.filter(p => daysSince(p.last_reviewed) >= 10).length;
  const urgentCount = progress.filter(p => {
    const days = daysSince(p.last_reviewed);
    return days >= 5 && days < 10;
  }).length;

  const currentJuz = juzPartial.length > 0 ? juzPartial[0] : null;
  const currentSurah = currentJuz ? progress.find(p => 
    Math.ceil(p.surah_num / 4.27) === currentJuz
  ) : null;

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

        const weekData: WeeklyData[] = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const dateStr = d.toDateString();
          const count = sess.data?.filter((s: any) => new Date(s.created_at).toDateString() === dateStr).length || 0;
          weekData.push({
            day: WEEK_DAYS[d.getDay()],
            count
          });
        }
        setWeeklyData(weekData);
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
    const count = taskPlan==="daily"?1:taskPlan==="weekly"?7:taskPlan==="biweekly"?14:30;    for (let i=0;i<count;i++) {
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
    setShowAddTask(false);
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
      <div className="flex items-center justify-center min-h-[600px]">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-4 border-[#1a3d24] border-t-[#c9a84c] rounded-full animate-spin mx-auto" />
          <p className="text-[#7a9e88] font-medium text-lg">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 md:p-6 max-w-6xl mx-auto bg-gradient-to-br from-[#fafafa] via-[#f8fafb] to-[#f0f4f0] min-h-screen pb-20">
      
      {overdueCount > 0 && (
        <Card className="border-2 border-red-300 bg-gradient-to-r from-red-50 to-red-100 p-4 shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-6 h-6 text-white" />
            </div>            <div className="flex-1">
              <h3 className="font-bold text-red-900 text-lg">
                {overdueCount} Revision{overdueCount > 1 ? "s" : ""} Overdue!
              </h3>
              <p className="text-red-700 text-sm">
                {urgentCount > 0 && `${urgentCount} more due soon. `}
                Complete them today to stay on track.
              </p>
            </div>
            <Button 
              onClick={() => onNavigate("test")}
              className="bg-red-600 hover:bg-red-700 text-white font-semibold px-6"
            >
              Review Now
            </Button>
          </div>
        </Card>
      )}

      {currentSurah && (
        <Button 
          onClick={() => onNavigate("recitation")}
          className="w-full h-16 md:h-20 text-base md:text-lg bg-gradient-to-r from-[#1a3d24] via-[#276749] to-[#1a3d24] hover:from-[#276749] hover:to-[#1a3d24] text-white font-bold shadow-xl hover:shadow-2xl transition-all hover:-translate-y-0.5 group"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Play className="w-6 h-6 fill-white" />
            </div>
            <div className="text-left">
              <div className="font-bold">Continue: Surah {currentSurah.surah_name}</div>
              <div className="text-white/80 text-sm font-medium">
                {currentSurah.verses_memorized || 0} of {currentSurah.total_verses || "???"} verses
              </div>
            </div>
            <ArrowRight className="w-6 h-6 ml-auto mr-2 group-hover:translate-x-1 transition-transform" />
          </div>
        </Button>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatCard
          icon={<BookOpen className="w-5 h-5" />}
          value={stats.juzCount || "0"}
          label="Juz Memorized"
          labelAr="أجزاء محفوظة"
          gradient="from-[#1a3d24] to-[#276749]"
          onClick={() => onNavigate("recitation")}
        />
        <StatCard
          icon={<TrendingUp className="w-5 h-5" />}          value={`${stats.avgAccuracy}%`}
          label="Accuracy"
          labelAr="الدقة"
          gradient="from-[#276749] to-[#38a169]"
          onClick={() => onNavigate("test")}
        />
        <StatCard
          icon={<Flame className="w-5 h-5" />}
          value={stats.streak}
          label="Day Streak"
          labelAr="الأيام"
          gradient="from-[#b7791f] to-[#d69e2e]"
          onClick={() => onNavigate("test")}
        />
        <StatCard
          icon={<Clock className="w-5 h-5" />}
          value={`${stats.totalMins}m`}
          label="Total Time"
          labelAr="الوقت"
          gradient="from-[#2b6cb0] to-[#4299e1]"
          onClick={() => onNavigate("recitation")}
        />
      </div>

      <Card className="overflow-hidden border-2 border-[#e2e8f0] shadow-lg">
        <div className="bg-gradient-to-r from-[#1a3d24] to-[#276749] p-4 md:p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-xl text-white">Today's Tasks</h3>
                <p className="text-white/80 text-sm">مهام اليوم</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-white">{completedToday}/{totalToday}</div>
              <div className="text-xs text-white/70">Completed</div>
            </div>
          </div>
          <Progress value={progressPercent} className="mt-3 h-2 bg-white/20" />
        </div>

        <div className="p-4 md:p-5 space-y-4">
          {tasks.length === 0 ? (
            <div className="text-center py-10">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-[#c9a84c]/20 to-[#b7791f]/20 flex items-center justify-center">
                <Calendar className="w-9 h-9 text-[#b7791f]" />
              </div>              <p className="text-[#1a3d24] font-bold text-lg mb-1">No tasks for today</p>
              <p className="text-[#7a9e88] text-sm mb-4">لا توجد مهام اليوم بعد</p>
              <Button 
                onClick={() => setShowAddTask(true)}
                className="bg-[#1a3d24] hover:bg-[#276749] text-white font-semibold"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Your First Task
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  onClick={() => toggleTask(task)}
                  className={cn(
                    "flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all",
                    task.completed 
                      ? "bg-gradient-to-r from-[#276749]/10 to-[#1a3d24]/10 border-[#276749]/30" 
                      : "bg-white border-[#e2e8f0] hover:border-[#c9a84c]/50 hover:shadow-md"
                  )}
                >
                  <div className={cn(
                    "w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                    task.completed 
                      ? "bg-gradient-to-br from-[#276749] to-[#1a3d24] border-[#276749]" 
                      : "border-[#cbd5e0]"
                  )}>
                    {task.completed && <CheckCircle2 className="w-4 h-4 text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={cn(
                      "font-bold text-sm",
                      task.completed ? "text-[#276749] line-through" : "text-[#1a3d24]"
                    )}>
                      {task.task_type === "memorize" ? "📖 Memorize" : "🔄 Revise"} · {task.surah_name}
                    </div>
                    <div className="text-xs text-[#7a9e88] font-medium">{task.verses_count} verses</div>
                  </div>
                  <Badge 
                    className={cn(
                      "text-xs font-bold px-3 py-1",
                      task.completed 
                        ? "bg-gradient-to-r from-[#276749] to-[#1a3d24] text-white" 
                        : "bg-[#f0f4f0] text-[#7a9e88]"
                    )}
                  >
                    {task.completed ? "Done" : "Pending"}
                  </Badge>                </div>
              ))}
            </div>
          )}

          {tasks.length > 0 && (
            <Button 
              onClick={() => setShowAddTask(true)}
              variant="outline"
              className="w-full border-2 border-dashed border-[#c9a84c] text-[#b7791f] hover:bg-[#c9a84c]/10 font-semibold h-11"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add New Task
            </Button>
          )}
        </div>
      </Card>

      <Card className="overflow-hidden border-2 border-[#e2e8f0] shadow-lg">
        <div className="p-4 md:p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#4299e1] to-[#2b6cb0] flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-[#1a3d24]">Weekly Activity</h3>
                <p className="text-sm text-[#7a9e88]">النشاط الأسبوعي</p>
              </div>
            </div>
          </div>
          
          <div className="flex items-end justify-between gap-2 h-24">
            {weeklyData.map((day, index) => {
              const maxCount = Math.max(...weeklyData.map(d => d.count), 1);
              const height = (day.count / maxCount) * 100;
              const isToday = index === 6;
              return (
                <div key={index} className="flex-1 flex flex-col items-center gap-2">
                  <div className="w-full relative">
                    <div 
                      className={cn(
                        "w-full rounded-t-lg transition-all duration-500",
                        isToday 
                          ? "bg-gradient-to-t from-[#1a3d24] to-[#276749]" 
                          : "bg-gradient-to-t from-[#c9a84c]/40 to-[#b7791f]/40"
                      )}
                      style={{ height: `${Math.max(height, day.count > 0 ? 20 : 5)}%` }}
                    />
                  </div>                  <span className={cn(
                    "text-xs font-bold",
                    isToday ? "text-[#1a3d24]" : "text-[#a0aec0]"
                  )}>
                    {day.day}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {currentSurah && (
        <Card className="overflow-hidden border-2 border-[#e2e8f0] shadow-lg">
          <div className="p-4 md:p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#c9a84c] to-[#b7791f] flex items-center justify-center">
                  <BookMarked className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-[#1a3d24]">Current Progress</h3>
                  <p className="text-sm text-[#7a9e88]">التقدم الحالي</p>
                </div>
              </div>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => onNavigate("recitation")}
                className="text-[#c9a84c] hover:text-[#b7791f] hover:bg-[#c9a84c]/10 font-semibold"
              >
                View All <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>

            <div className="bg-gradient-to-r from-[#1a3d24]/5 to-[#c9a84c]/5 rounded-xl p-4 border border-[#e2e8f0]">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="font-bold text-[#1a3d24] text-lg">Juz {currentJuz}</h4>
                  <p className="text-sm text-[#7a9e88]">Surah {currentSurah.surah_name}</p>
                </div>
                <Trophy className="w-8 h-8 text-[#c9a84c]" />
              </div>
              <Progress 
                value={(currentSurah.verses_memorized || 0) / (currentSurah.total_verses || 1) * 100} 
                className="h-3 bg-white"
              />
              <div className="flex justify-between mt-2 text-sm">
                <span className="text-[#7a9e88] font-medium">                  {currentSurah.verses_memorized || 0} verses memorized
                </span>
                <span className="text-[#1a3d24] font-bold">
                  {Math.round((currentSurah.verses_memorized || 0) / (currentSurah.total_verses || 1) * 100)}%
                </span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {progress.length > 0 && (
        <Card className="overflow-hidden border-2 border-[#e2e8f0] shadow-lg">
          <div className="p-4 md:p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#e74c3c] to-[#c0392b] flex items-center justify-center">
                  <RotateCcw className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-[#1a3d24]">Urgent Revisions</h3>
                  <p className="text-sm text-[#7a9e88]">المراجعات العاجلة</p>
                </div>
              </div>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => onNavigate("test")}
                className="text-[#c9a84c] hover:text-[#b7791f] hover:bg-[#c9a84c]/10 font-semibold"
              >
                View All <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>

            <div className="space-y-2">
              {progress
                .filter(p => daysSince(p.last_reviewed) < 10)
                .slice(0, 3)
                .map((item, index) => {
                  const days = daysSince(item.last_reviewed);
                  const isUrgent = days >= 5;
                  return (
                    <div
                      key={index}
                      onClick={() => onNavigate("test")}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all hover:shadow-md",
                        isUrgent 
                          ? "bg-gradient-to-r from-amber-50 to-amber-100 border-amber-300" 
                          : "bg-gradient-to-r from-emerald-50 to-emerald-100 border-emerald-300"                      )}
                    >
                      <div className={cn(
                        "w-3 h-3 rounded-full flex-shrink-0",
                        isUrgent ? "bg-amber-600" : "bg-emerald-600"
                      )} />
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-sm text-[#1a3d24] truncate">{item.surah_name}</h4>
                        <p className="text-xs text-[#7a9e88] font-medium">
                          {days === 0 ? "Today" : `${days}d ago`} · Best: <span className="font-bold text-[#b7791f]">{item.best_accuracy}%</span>
                        </p>
                      </div>
                      <Badge 
                        className={cn(
                          "text-xs font-bold px-3 py-1",
                          isUrgent 
                            ? "bg-amber-500 text-white" 
                            : "bg-emerald-600 text-white"
                        )}
                      >
                        {isUrgent ? "Soon" : "On Track"}
                      </Badge>
                    </div>
                  );
                })}
            </div>
          </div>
        </Card>
      )}

      {sessions.length > 0 && (
        <Card className="overflow-hidden border-2 border-[#e2e8f0] shadow-lg">
          <div className="p-4 md:p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#2b6cb0] to-[#4299e1] flex items-center justify-center">
                  <Headphones className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-[#1a3d24]">Recent Sessions</h3>
                  <p className="text-sm text-[#7a9e88]">الجلسات الأخيرة</p>
                </div>
              </div>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => onNavigate("recitation")}
                className="text-[#c9a84c] hover:text-[#b7791f] hover:bg-[#c9a84c]/10 font-semibold"
              >
                View History <ChevronRight className="w-4 h-4 ml-1" />              </Button>
            </div>

            <div className="space-y-2">
              {sessions.slice(0, 3).map((session, index) => (
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
                      "bg-gradient-to-br from-[#c0392b] to-[#e74c3c] text-white border-[#c0392b]"
                  )}>
                    {session.accuracy_score}%
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-sm text-[#1a3d24] truncate">{session.surah_name}</h4>
                    <p className="text-xs text-[#7a9e88] font-medium">
                      Ayah {session.ayah_start} · {Math.round((session.duration || 0) / 60)}m
                    </p>
                  </div>
                  {session.accuracy_score >= 80 && <Star className="w-4 h-4 text-[#c9a84c] fill-[#c9a84c]" />}
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      <Dialog open={showAddTask} onOpenChange={setShowAddTask}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#1a3d24] text-xl font-bold flex items-center gap-2">
              <Plus className="w-5 h-5 text-[#c9a84c]" />
              Add New Task
              <span className="text-[#7a9e88] text-sm font-normal">إضافة مهمة جديدة</span>
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-[#1a3d24] mb-1.5 block">Type</label>
                <select
                  value={taskType}                  onChange={(e) => setTaskType(e.target.value as any)}
                  className="w-full rounded-lg border-2 border-[#e2e8f0] bg-white px-3 py-2.5 text-sm font-medium text-[#1a3d24] focus:border-[#c9a84c] focus:outline-none"
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
                className="h-11 border-2 border-[#e2e8f0] text-sm font-medium text-[#1a3d24] placeholder:text-[#a0aec0] focus:border-[#c9a84c]"
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
                    onClick={() => setTaskPlan(key as "daily" | "weekly" | "biweekly" | "monthly")}
                    className={cn(
                      "py-2.5 px-2 rounded-xl text-center transition-all text-xs font-bold",
                      taskPlan === key
                        ? "bg-gradient-to-br from-[#1a3d24] to-[#276749] text-white shadow-lg scale-105"
                        : "bg-[#f8fafb] text-[#7a9e88] hover:bg-[#e2e8f0]"
                    )}
                  >
                    <div>{en}</div>                    <div className="text-[10px] opacity-80 mt-0.5">{ar}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button 
                variant="outline" 
                onClick={() => setShowAddTask(false)}
                className="flex-1 h-11 border-2 font-semibold"
              >
                Cancel
              </Button>
              <Button 
                onClick={addTask}
                disabled={savingTask || !taskSurah.trim()}
                className="flex-1 h-11 bg-gradient-to-r from-[#1a3d24] to-[#276749] hover:from-[#276749] hover:to-[#1a3d24] text-white font-bold shadow-lg disabled:opacity-50"
              >
                {savingTask ? "Saving..." : "Add Task"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ icon, value, label, labelAr, gradient, onClick }: any) {
  return (
    <Card 
      onClick={onClick}
      className={cn(
        "p-4 cursor-pointer transition-all hover:shadow-xl hover:-translate-y-1 active:scale-95 overflow-hidden bg-gradient-to-br",
        gradient
      )}
    >
      <div className="space-y-2 text-center">
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