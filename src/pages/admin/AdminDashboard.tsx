import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Users, ClipboardList, BookOpen, TrendingUp, Plus, AlertTriangle, Layers,
  CheckSquare, BarChart, Shield, Activity, ArrowRight, UserCheck,
  Video, CreditCard, Calendar, Bell, ChevronRight, Mic,
} from "lucide-react";

const AdminDashboard = () => {
  const { t, language } = useLanguage();
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    students:0, exams:0, tests:0, courses:0, attempts:0, pendingGrading:0,
    activeExams:0, violations:0, privateStudents:0, privateSessions:0,
  });
  const [recentSubmissions, setRecentSubmissions] = useState<any[]>([]);
  const [recentActivity,    setRecentActivity]    = useState<any[]>([]);
  const [privateStudentsList, setPrivateStudentsList] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      const [studRes, coursesRes, attRes, pendRes, recentRes, profRes,
             activeRes, violRes, actRes, pvtStuRes, pvtSesRes] = await Promise.all([
        supabase.from("profiles").select("id",{count:"exact",head:true}),
        supabase.from("courses").select("id",{count:"exact",head:true}),
        supabase.from("exam_attempts").select("id",{count:"exact",head:true}),
        supabase.from("exam_attempts").select("id",{count:"exact",head:true}).eq("status","submitted"),
        supabase.from("exam_attempts").select("*, exams(title,title_ar)").eq("status","submitted").order("submitted_at",{ascending:false}).limit(5),
        supabase.from("profiles").select("user_id,full_name,email"),
        supabase.from("exam_attempts").select("id",{count:"exact",head:true}).eq("status","in_progress"),
        supabase.from("violations").select("id",{count:"exact",head:true}),
        supabase.from("activity_logs").select("*").order("created_at",{ascending:false}).limit(6),
        supabase.from("profiles").select("user_id,full_name,email,assigned_teacher_id,private_session_rate").eq("student_type","private"),
        supabase.from("private_sessions").select("id",{count:"exact",head:true}),
      ]);
      const profiles = profRes.data || [];
      const allExams = await supabase.from("exams").select("type");
      const ed = allExams.data || [];
      setStats({
        students:   studRes.count || 0,
        exams:      ed.filter((e:any)=>(e.type||"exam")==="exam").length,
        tests:      ed.filter((e:any)=>e.type==="test").length,
        courses:    coursesRes.count || 0,
        attempts:   attRes.count || 0,
        pendingGrading: pendRes.count || 0,
        activeExams: activeRes.count || 0,
        violations:  violRes.count || 0,
        privateStudents: pvtStuRes.data?.length || 0,
        privateSessions: pvtSesRes.count || 0,
      });
      setRecentSubmissions((recentRes.data||[]).map((a:any)=>({...a, profiles:profiles.find((p:any)=>p.user_id===a.user_id)||{}})));
      setRecentActivity(actRes.data||[]);
      setPrivateStudentsList((pvtStuRes.data||[]).map((s:any)=>({...s, teacher_name:profiles.find((p:any)=>p.user_id===s.assigned_teacher_id)?.full_name||"—"})));
      setLoading(false);
    };
    load();
    const ch = supabase.channel("admin-dash")
      .on("postgres_changes",{event:"*",schema:"public",table:"exam_attempts"},load)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"violations"},load)
      .subscribe();
    return ()=>{ supabase.removeChannel(ch); };
  }, []);

  if (loading) return (
    <div className="p-4 space-y-4">
      <Skeleton className="h-7 w-48"/>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[1,2,3,4].map(i=><Skeleton key={i} className="h-20 rounded-xl"/>)}
      </div>
      <Skeleton className="h-32 rounded-xl"/>
    </div>
  );

  const hour = new Date().getHours();
  const greeting = hour < 12 ? t("Good morning","صباح الخير") : hour < 17 ? t("Good afternoon","مساء الخير") : t("Good evening","مساء النور");

  return (
    <div className="min-h-full bg-muted/30">
      {/* Hero header */}
      <div className="bg-primary px-4 pb-5 pt-5">
        <p className="text-xs text-primary-foreground/60 font-medium uppercase tracking-wider mb-0.5">{greeting}</p>
        <h1 className="text-xl font-bold text-primary-foreground font-display leading-tight">
          {profile?.full_name?.split(" ")[0] || t("Admin","مدير")}
        </h1>
        <p className="text-xs text-primary-foreground/50 mt-0.5">{t("Admin Dashboard","لوحة تحكم المدير")}</p>
      </div>

      {/* Alert banner */}
      {stats.pendingGrading > 0 && (
        <div className="mx-4 -mt-1">
          <Link to="/admin/grading">
            <div className="flex items-center justify-between rounded-xl bg-secondary/95 px-4 py-3 shadow-sm">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary-foreground/10">
                  <AlertTriangle className="h-4 w-4 text-secondary-foreground"/>
                </div>
                <div>
                  <p className="text-sm font-semibold text-secondary-foreground leading-tight">
                    {stats.pendingGrading} {t("pending","بانتظار")}
                  </p>
                  <p className="text-xs text-secondary-foreground/70">{t("Exams need grading","امتحانات تحتاج تصحيح")}</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-secondary-foreground/60"/>
            </div>
          </Link>
        </div>
      )}

      <div className="p-4 space-y-5">

        {/* Stats grid */}
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">{t("Overview","نظرة عامة")}</p>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {[
              { icon:Users,       label:t("Students","الطلاب"),   value:stats.students,  to:"/admin/students",  color:"bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
              { icon:ClipboardList,label:t("Exams","الامتحانات"), value:stats.exams,     to:"/admin/exams",     color:"bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
              { icon:BookOpen,    label:t("Courses","الدورات"),   value:stats.courses,   to:"/admin/courses",   color:"bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
              { icon:TrendingUp,  label:t("Attempts","المحاولات"),value:stats.attempts,  to:"/admin/grading",   color:"bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
            ].map((s,i)=>(
              <Link key={i} to={s.to}>
                <Card className="hover:shadow-md transition-all active:scale-[0.98] border-0 shadow-sm">
                  <CardContent className="p-3.5">
                    <div className={cn("inline-flex h-8 w-8 items-center justify-center rounded-lg mb-2", s.color)}>
                      <s.icon className="h-4 w-4"/>
                    </div>
                    <div className="text-2xl font-bold tabular-nums leading-none mb-0.5">{s.value}</div>
                    <div className="text-[11px] text-muted-foreground font-medium">{s.label}</div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>

        {/* Live monitor */}
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">{t("Live","مباشر")}</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { icon:Activity, label:t("Active","نشط"),       value:stats.activeExams,    color:"text-emerald-600" },
              { icon:Shield,   label:t("Violations","مخالفات"),value:stats.violations,    color:"text-destructive" },
              { icon:CheckSquare,label:t("Grading","تصحيح"),  value:stats.pendingGrading, color:"text-amber-600" },
            ].map((s,i)=>(
              <Card key={i} className="border-dashed shadow-none">
                <CardContent className="p-3 text-center">
                  <s.icon className={cn("h-4 w-4 mx-auto mb-1", s.color)}/>
                  <div className="text-lg font-bold tabular-nums leading-none">{s.value}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{s.label}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Quick actions */}
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">{t("Quick Actions","إجراءات سريعة")}</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {[
              { to:"/admin/exams/create",   icon:Plus,         label:t("New Exam","امتحان جديد"),    color:"bg-primary text-primary-foreground" },
              { to:"/admin/students",       icon:Users,        label:t("Students","الطلاب"),          color:"bg-card border" },
              { to:"/admin/live-classes",   icon:Video,        label:t("Classes","الفصول"),           color:"bg-card border" },
              { to:"/admin/grading",        icon:CheckSquare,  label:t("Grade","تصحيح"),              color:"bg-card border" },
              { to:"/admin/payments",       icon:CreditCard,   label:t("Payments","مدفوعات"),         color:"bg-card border" },
              { to:"/admin/recitation-review",icon:Mic,        label:t("Recitation","تلاوة"),         color:"bg-card border" },
            ].map((a,i)=>(
              <Link key={i} to={a.to}>
                <div className={cn("flex flex-col items-center justify-center gap-1.5 rounded-xl p-3 text-center transition-all active:scale-[0.97] hover:shadow-sm", a.color, !a.color.includes("primary") && "hover:bg-muted/50")}>
                  <a.icon className="h-4.5 w-4.5 h-5 w-5"/>
                  <span className="text-[10px] font-semibold leading-tight">{a.label}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent submissions */}
        {recentSubmissions.length > 0 && (
          <Card className="shadow-sm border-0">
            <CardHeader className="px-4 pt-4 pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">{t("Recent Submissions","التقديمات الأخيرة")}</CardTitle>
                <Link to="/admin/grading" className="flex items-center gap-1 text-xs text-primary font-medium">
                  {t("View all","عرض الكل")} <ArrowRight className="h-3 w-3"/>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {recentSubmissions.map(sub=>(
                <div key={sub.id} className="flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary/20 shrink-0">
                    <ClipboardList className="h-3.5 w-3.5 text-secondary-foreground"/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" dir="auto">
                      {language==="ar" ? sub.exams?.title_ar||sub.exams?.title : sub.exams?.title}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {sub.profiles?.full_name||sub.profiles?.email||"Unknown"}
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-[10px] shrink-0">{t("Grade","صحّح")}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Private students */}
        {privateStudentsList.length > 0 && (
          <Card className="shadow-sm border-0">
            <CardHeader className="px-4 pt-4 pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                  <UserCheck className="h-3.5 w-3.5 text-secondary"/>
                  {t("Private Students","الطلاب الخصوصيين")}
                  <Badge className="text-[10px] px-1.5 py-0">{stats.privateStudents}</Badge>
                </CardTitle>
                <Link to="/admin/private-sessions" className="flex items-center gap-1 text-xs text-primary font-medium">
                  {t("Sessions","جلسات")} <ArrowRight className="h-3 w-3"/>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {privateStudentsList.slice(0,4).map(s=>(
                <div key={s.user_id} className="flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary/20 text-xs font-bold text-secondary-foreground shrink-0">
                    {(s.full_name||s.email||"?")[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{s.full_name||s.email}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{s.teacher_name}</p>
                  </div>
                  {s.private_session_rate && <span className="text-[10px] text-muted-foreground shrink-0">{s.private_session_rate}</span>}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Activity feed */}
        {recentActivity.length > 0 && (
          <Card className="shadow-sm border-0">
            <CardHeader className="px-4 pt-4 pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5"/>
                {t("Recent Activity","النشاط الأخير")}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-1.5">
              {recentActivity.map(log=>(
                <div key={log.id} className="flex items-center gap-3 rounded-lg px-3 py-2 bg-muted/30">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary shrink-0"/>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium">{log.action}</span>
                    {log.entity_type && <span className="text-xs text-muted-foreground ms-1.5">({log.entity_type})</span>}
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                    {new Date(log.created_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Navigation tiles — all sections */}
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">{t("Manage","إدارة")}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[
              { to:"/admin/courses",     icon:Layers,      label:t("Courses & Subjects","الدورات والمواد"), sub:t("Syllabus, materials & sessions","المنهج والمواد والحصص") },
              { to:"/admin/live-classes",icon:Video,       label:t("Live Classes","الفصول الحية"),sub:t("Schedule & manage","جدولة وإدارة") },
              { to:"/admin/exams",       icon:ClipboardList,label:t("Exams","الامتحانات"),       sub:t("All exams & tests","الامتحانات والاختبارات") },
              { to:"/admin/question-bank",icon:BookOpen,   label:t("Question Bank","بنك الأسئلة"),sub:t("Manage questions","إدارة الأسئلة") },
              { to:"/admin/grading",     icon:CheckSquare, label:t("Grading","التصحيح"),          sub:t("Mark submissions","تصحيح الإجابات") },
              { to:"/admin/proctoring",  icon:Shield,      label:t("Proctoring","المراقبة"),      sub:t("Exam violations","مخالفات الامتحان") },
              { to:"/admin/calendar",    icon:Calendar,    label:t("Calendar","التقويم"),         sub:t("Academic schedule","الجدول الأكاديمي") },
              { to:"/admin/payments",    icon:CreditCard,  label:t("Payments","المدفوعات"),       sub:t("Fees & subscriptions","الرسوم والاشتراكات") },
              { to:"/admin/majlis-moderation",icon:Users,  label:t("Al-Majlis","المجلس"),         sub:t("Moderate chat","إدارة المحادثات") },
              { to:"/admin/notifications",icon:Bell,       label:t("Notifications","الإشعارات"),  sub:t("Send alerts","إرسال تنبيهات") },
            ].map((item,i)=>(
              <Link key={i} to={item.to}>
                <Card className="hover:shadow-md transition-all active:scale-[0.98] border-0 shadow-sm">
                  <CardContent className="flex items-center gap-3 p-3.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted shrink-0">
                      <item.icon className="h-4 w-4 text-muted-foreground"/>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold leading-tight truncate">{item.label}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{item.sub}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>

        <div className="pb-4"/>
      </div>
    </div>
  );
};

// helper
const cn = (...classes: (string|undefined|false)[]) => classes.filter(Boolean).join(" ");

export default AdminDashboard;
