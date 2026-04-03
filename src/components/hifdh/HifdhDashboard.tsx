import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  BookOpen, TrendingUp, Flame, Clock, ChevronRight,
  CheckCircle2, RotateCcw, BookMarked, Headphones, Calendar, 
  AlertCircle, Star, Plus, Play, BarChart3, Trophy, AlertTriangle,
  ArrowRight
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
interface WeeklyData {
  day: string;
  count: number;
}

const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
const WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function HifdhDashboard({ userId, studentName, onNavigate, activeTab = "overview" }: Props) {
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
        setProgress(entries);
        const done: number[] = [];
        const partial: number[] = [];
        entries.forEach(p => {          const j = Math.min(30, Math.ceil(p.surah_num / 4.27));
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
          weekData.push({ day: WEEK_DAYS[d.getDay()], count });
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
    const count = taskPlan==="daily"?1:taskPlan==="weekly"?7:taskPlan==="biweekly"?14:30;
    for (let i=0;i<count;i++) {
      const d = new Date();
      d.setDate(d.getDate()+i);
      dates.push(d.toISOString().split("T")[0]);
    }
    const inserts = dates.map(d => ({      user_id: userId,
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
    <div className="min-h-screen bg-[#faf6ee] pb-20">
      
      {/* ── Dashboard Content ────────────────────────────────────────────── */}
      <div className="space-y-4 p-4 md:p-6 max-w-6xl mx-auto">
        
        {overdueCount > 0 && (
          <Card className="border-2 border-red-300 bg-gradient-to-r from-red-50 to-red-100 p-4 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-red-900 text-lg">
                  {overdueCount} Revision{overdueCount > 1 ? "s" : ""} Overdue!                </h3>
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
            icon={<TrendingUp className="w-5 h-5" />}
            value={`${stats.avgAccuracy}%`}
            label="Accuracy"
            labelAr="الدقة"            gradient="from-[#276749] to-[#38a169]"
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
                </div>
                <p className="text-[#1a3d24] font-bold text-lg mb-1">No tasks for today</p>
                <p className="text-[#7a9e88] text-sm mb-4">لا توجد مهام اليوم بعد</p>
                <Button                   onClick={() => setShowAddTask(true)}
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
                        task.completed ? "text-[#2