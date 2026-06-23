/*
  AdminDashboard.tsx — Tahleem Academy
  Redesigned: all pages linked, 8 organised sections, brand styling.
*/

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Users, ClipboardList, BookOpen, TrendingUp, Plus, Layers,
  CheckSquare, Shield, Activity, ArrowRight, UserCheck,
  Video, CreditCard, Calendar, Bell, ChevronRight, Mic, GraduationCap,
  FolderOpen, BookMarked, Globe, Headphones, MessageCircle, Trophy,
  UserPlus, Clock, Settings, Library,
} from "lucide-react";

const cn = (...c: (string|undefined|false)[]) => c.filter(Boolean).join(" ");

const G  = "#0f2d1f";
const GM = "#1a4731";
const AU = "#c9a84c";

// ── Activity log time formatter — always 12hr, relative for recent ────────
const formatActivityTime = (iso: string): string => {
  const date    = new Date(iso);
  if (isNaN(date.getTime())) return "";
  const diffMs  = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr  = Math.floor(diffMs / 3_600_000);
  const time12  = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  if (diffMin < 1)  return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr  < 24) return `${diffHr}h ago · ${time12}`;
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday · ${time12}`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + ` · ${time12}`;
};

// ─── Section colour map ───────────────────────────────────────────
const SC: Record<string,{bg:string;border:string;dot:string}> = {
  pipeline:    {bg:"#f0fdf4",border:"#bbf7d0",dot:"#16a34a"},
  students:    {bg:"#eff6ff",border:"#bfdbfe",dot:"#2563eb"},
  academic:    {bg:"#fefce8",border:"#fde68a",dot:"#d97706"},
  classes:     {bg:"#fdf4ff",border:"#e9d5ff",dot:"#7c3aed"},
  assessments: {bg:"#fff7ed",border:"#fed7aa",dot:"#ea580c"},
  recitation:  {bg:"#f0fdfa",border:"#99f6e4",dot:"#0d9488"},
  finance:     {bg:"#fff1f2",border:"#fecdd3",dot:"#e11d48"},
  comms:       {bg:"#f8fafc",border:"#cbd5e1",dot:"#475569"},
};

// ─── Reusable: KPI card ───────────────────────────────────────────
const KpiCard = ({icon:Icon,label,value,to,accent}:{icon:any;label:string;value:number;to:string;accent:string}) => (
  <Link to={to}>
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4 flex flex-col gap-2 hover:shadow-md active:scale-[.98] transition-all">
      <div className="flex items-center justify-between">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{background:accent+"18"}}>
          <Icon className="h-4 w-4" style={{color:accent}}/>
        </div>
        <ChevronRight className="h-3.5 w-3.5 text-gray-300"/>
      </div>
      <div className="text-2xl font-black tabular-nums text-gray-900 leading-none">{value}</div>
      <div className="text-[11px] font-medium text-gray-500">{label}</div>
    </div>
  </Link>
);

// ─── Reusable: alert banner ───────────────────────────────────────
const AlertBanner = ({to,icon:Icon,title,sub,color}:{to:string;icon:any;title:string;sub:string;color:string}) => (
  <Link to={to}>
    <div className="flex items-center justify-between rounded-2xl px-4 py-3 border"
      style={{background:color+"12",borderColor:color+"44"}}>
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0" style={{background:color+"22"}}>
          <Icon className="h-4 w-4" style={{color}}/>
        </div>
        <div>
          <p className="text-sm font-bold" style={{color}}>{title}</p>
          <p className="text-xs text-gray-500">{sub}</p>
        </div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 opacity-50" style={{color}}/>
    </div>
  </Link>
);

// ─── Reusable: section block ──────────────────────────────────────
const Section = ({title,ck,items}:{
  title:string; ck:keyof typeof SC;
  items:{to:string;icon:any;label:string;sub?:string;badge?:number}[];
}) => {
  const c = SC[ck];
  return (
    <div className="rounded-2xl border overflow-hidden shadow-sm bg-white" style={{borderColor:c.border}}>
      <div className="px-4 py-2.5 flex items-center gap-2 border-b" style={{background:c.bg,borderColor:c.border}}>
        <div className="w-2 h-2 rounded-full shrink-0" style={{background:c.dot}}/>
        <span className="text-[10px] font-black uppercase tracking-widest" style={{color:c.dot}}>{title}</span>
      </div>
      <div className="divide-y divide-gray-50">
        {items.map(item=>(
          <Link key={item.to} to={item.to}
            className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors group">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0" style={{background:c.bg}}>
              <item.icon className="h-4 w-4" style={{color:c.dot}}/>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800 truncate">{item.label}</p>
              {item.sub && <p className="text-[11px] text-gray-400 truncate">{item.sub}</p>}
            </div>
            {!!item.badge && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full text-white shrink-0"
                style={{background:c.dot}}>{item.badge}</span>
            )}
            <ChevronRight className="h-3.5 w-3.5 text-gray-300 shrink-0 group-hover:text-gray-500 transition-colors"/>
          </Link>
        ))}
      </div>
    </div>
  );
};

// ─── Main component ────────────────────────────────────────────────
export default function AdminDashboard() {
  const {t, language} = useLanguage();
  const {profile} = useAuth();
  const [loading, setLoading]   = useState(true);
  const [stats, setStats]       = useState({
    students:0, exams:0, courses:0, attempts:0,
    pendingGrading:0, activeExams:0, violations:0,
    pendingRegistrations:0, pendingPayments:0,
  });
  const [recentSubs, setRecentSubs] = useState<any[]>([]);
  const [activity,   setActivity]   = useState<any[]>([]);

  useEffect(()=>{
    const load = async () => {
      const [studRes,coursesRes,attRes,pendRes,recentRes,profRes,
             activeRes,violRes,actRes,pendRegRes,pendPayRes] = await Promise.all([
        supabase.from("profiles").select("id",{count:"exact",head:true}),
        supabase.from("courses").select("id",{count:"exact",head:true}),
        supabase.from("exam_attempts").select("id",{count:"exact",head:true}),
        supabase.from("exam_attempts").select("id",{count:"exact",head:true}).eq("status","submitted"),
        supabase.from("exam_attempts").select("*, exams(title,title_ar)").eq("status","submitted").order("submitted_at",{ascending:false}).limit(5),
        supabase.from("profiles").select("user_id,full_name,email"),
        supabase.from("exam_attempts").select("id",{count:"exact",head:true}).eq("status","in_progress"),
        supabase.from("violations").select("id",{count:"exact",head:true}),
        supabase.from("activity_logs").select("*").order("created_at",{ascending:false}).limit(6),
        supabase.from("profiles").select("id",{count:"exact",head:true}).eq("course_level","pending"),
        supabase.from("payments").select("id",{count:"exact",head:true}).eq("status","pending"),
      ]);
      const profiles = profRes.data||[];
      const allExams = await supabase.from("exams").select("type");
      const ed = allExams.data||[];
      setStats({
        students:   studRes.count||0,
        exams:      ed.filter((e:any)=>(e.type||"exam")==="exam").length,
        courses:    coursesRes.count||0,
        attempts:   attRes.count||0,
        pendingGrading:       pendRes.count||0,
        activeExams:          activeRes.count||0,
        violations:           violRes.count||0,
        pendingRegistrations: pendRegRes.count||0,
        pendingPayments:      pendPayRes.count||0,
      });
      setRecentSubs((recentRes.data||[]).map((a:any)=>({...a,profiles:profiles.find((p:any)=>p.user_id===a.user_id)||{}})));
      setActivity(actRes.data||[]);
      setLoading(false);
    };
    load();
    const ch = supabase.channel("admin-dash")
      .on("postgres_changes",{event:"*",schema:"public",table:"exam_attempts"},load)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"violations"},load)
      .subscribe();
    return ()=>{supabase.removeChannel(ch);};
  },[]);

  if (loading) return (
    <div className="p-4 space-y-4">
      <Skeleton className="h-28 rounded-2xl"/>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[1,2,3,4].map(i=><Skeleton key={i} className="h-24 rounded-2xl"/>)}
      </div>
      <Skeleton className="h-40 rounded-2xl"/>
      <Skeleton className="h-64 rounded-2xl"/>
    </div>
  );

  const hour = new Date().getHours();
  const greeting = hour<12 ? t("Good morning","صباح الخير") : hour<17 ? t("Good afternoon","مساء الخير") : t("Good evening","مساء النور");

  return (
    <div className="min-h-full" style={{background:"#f8faf9"}}>

      {/* ── Hero header ─────────────────────────────────────────── */}
      <div className="relative overflow-hidden px-5 pb-6 pt-5"
        style={{background:`linear-gradient(135deg,${G} 0%,${GM} 100%)`}}>
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-10"
          style={{background:AU,filter:"blur(40px)"}}/>
        <div className="pointer-events-none absolute -left-8 bottom-0 h-24 w-24 rounded-full opacity-10"
          style={{background:AU,filter:"blur(30px)"}}/>

        <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{color:AU+"99"}}>
          {greeting}
        </p>
        <h1 className="text-2xl font-black text-white leading-tight">
          {profile?.full_name?.split(" ")[0] || t("Admin","المدير")}
        </h1>
        <p className="text-xs mt-0.5 text-white/40">
          {t("Admin Control Panel","لوحة تحكم المدير")}
        </p>

        {/* Live strip */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            {label:t("Active Exams","امتحانات حية"), value:stats.activeExams, emoji:"🟢"},
            {label:t("Pending Grade","بانتظار تصحيح"),value:stats.pendingGrading,emoji:"🟡"},
            {label:t("Violations","مخالفات"),         value:stats.violations,  emoji:"🔴"},
          ].map((k,i)=>(
            <div key={i} className="rounded-xl px-3 py-2.5 text-center"
              style={{background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.1)"}}>
              <div className="text-xl font-black text-white tabular-nums">{k.value}</div>
              <div className="text-[10px] mt-0.5 text-white/50">{k.emoji} {k.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-4">

        {/* ── Alert banners ──────────────────────────────────────── */}
        {(stats.pendingGrading>0 || stats.pendingRegistrations>0 || stats.pendingPayments>0) && (
          <div className="space-y-2">
            {stats.pendingGrading>0 && (
              <AlertBanner to="/admin/grading" icon={CheckSquare} color="#d97706"
                title={`${stats.pendingGrading} ${t("submissions need grading","تقديم يحتاج تصحيح")}`}
                sub={t("Open grading queue","فتح قائمة التصحيح")}/>
            )}
            {stats.pendingRegistrations>0 && (
              <AlertBanner to="/admin/level-assignment" icon={UserPlus} color="#2563eb"
                title={`${stats.pendingRegistrations} ${t("students awaiting level","طالب بانتظار المستوى")}`}
                sub={t("Assign levels to unlock dashboards","حدد المستوى لتفعيل لوحة الطالب")}/>
            )}
            {stats.pendingPayments>0 && (
              <AlertBanner to="/admin/payments" icon={CreditCard} color="#e11d48"
                title={`${stats.pendingPayments} ${t("pending payments","دفعة معلقة")}`}
                sub={t("Review and confirm","راجع وأكد")}/>
            )}
          </div>
        )}

        {/* ── KPI grid ──────────────────────────────────────────── */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2.5">
            {t("Overview","نظرة عامة")}
          </p>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <KpiCard icon={Users}        label={t("Students","الطلاب")}      value={stats.students}  to="/admin/students"  accent="#2563eb"/>
            <KpiCard icon={BookOpen}     label={t("Courses","الدورات")}       value={stats.courses}  to="/admin/courses"   accent="#d97706"/>
            <KpiCard icon={ClipboardList}label={t("Exams","الامتحانات")}      value={stats.exams}    to="/admin/exams"     accent="#7c3aed"/>
            <KpiCard icon={TrendingUp}   label={t("Attempts","المحاولات")}    value={stats.attempts} to="/admin/grading"   accent="#0d9488"/>
          </div>
        </div>

        {/* ── Quick actions ─────────────────────────────────────── */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2.5">
            {t("Quick Actions","إجراءات سريعة")}
          </p>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
            {[
              {to:"/admin/exams/create",      icon:Plus,        label:t("New Exam","امتحان"),   primary:true},
              {to:"/admin/students",           icon:Users,       label:t("Students","الطلاب"),   primary:false},
              {to:"/admin/live-classes",       icon:Video,       label:t("Classes","الفصول"),    primary:false},
              {to:"/admin/grading",            icon:CheckSquare, label:t("Grade","تصحيح"),       primary:false},
              {to:"/admin/payments",           icon:CreditCard,  label:t("Payments","دفعات"),    primary:false},
              {to:"/admin/recitation-review",  icon:Mic,         label:t("Recitation","تلاوة"),  primary:false},
              {to:"/admin/hifdh-tracker",       icon:BookOpen,    label:t("Hifdh Tracker","متابعة الحفظ"), primary:true},
              {to:"/admin/notifications",      icon:Bell,        label:t("Notify","إشعار"),      primary:false},
              {to:"/admin/attendance",         icon:CheckSquare, label:t("Attend","حضور"),       primary:false},
            ].map((a,i)=>(
              <Link key={i} to={a.to}>
                <div className={cn(
                  "flex flex-col items-center justify-center gap-1.5 rounded-xl p-2.5 text-center transition-all active:scale-95",
                  a.primary ? "text-white shadow-md" : "bg-white border border-gray-100 text-gray-600 hover:bg-gray-50 shadow-sm"
                )} style={a.primary ? {background:`linear-gradient(135deg,${G},${GM})`} : {}}>
                  <a.icon className="h-4 w-4"/>
                  <span className="text-[9px] font-bold leading-tight">{a.label}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* ── All Sections ──────────────────────────────────────── */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2.5">
            {t("All Sections","جميع الأقسام")}
          </p>
          <div className="space-y-3">

            <Section title={t("Student Pipeline","سير التسجيل")} ck="pipeline" items={[
              {to:"/admin/level-assignment",      icon:GraduationCap, label:t("New Registrations","الطلاب الجدد"),         sub:t("Review & assign course levels","مراجعة وتعيين المستويات"),        badge:stats.pendingRegistrations},
              {to:"/admin/tasjeel",               icon:ClipboardList, label:t("Pipeline Tracker","متابعة التسجيل"),         sub:t("Full registration state machine","متابعة مسار التسجيل الكامل")},
              {to:"/admin/student-registration",  icon:UserCheck,     label:t("Student Registration","تسجيل الطلاب"),        sub:t("Manage student registrations","إدارة تسجيل الطلاب")},
              {to:"/admin/registration-settings", icon:Settings,      label:t("Registration Settings","إعدادات التسجيل"),   sub:t("Toggle fees, flow & rules","ضبط الرسوم والقواعد")},
            ]}/>

            <Section title={t("Students","الطلاب")} ck="students" items={[
              {to:"/admin/students",         icon:Users,         label:t("All Students","جميع الطلاب"),             sub:t("Browse, search & manage","تصفح وإدارة")},
              {to:"/admin/attendance",       icon:CheckSquare,   label:t("Attendance","الحضور والغياب"),            sub:t("Mark & view attendance","تسجيل ومتابعة الحضور")},
              {to:"/admin/transcripts",      icon:GraduationCap, label:t("Transcripts","السجلات الأكاديمية"),       sub:t("CGPA, grades & history","المعدل والسجل الأكاديمي")},
              {to:"/admin/private-sessions", icon:UserCheck,     label:t("Private Sessions","الجلسات الخاصة"),      sub:t("Manage 1-on-1 tuition","إدارة الدروس الخاصة")},
            ]}/>

            <Section title={t("Academic","الأكاديمي")} ck="academic" items={[
              {to:"/admin/courses",          icon:Layers,     label:t("Courses & Subjects","الدورات والمواد"),          sub:t("Curricula, subjects & sessions","المناهج والمواد")},
              {to:"/admin/timetable",        icon:Clock,      label:t("Timetable","الجدول الدراسي"),                    sub:t("Weekly class schedule","الجدول الأسبوعي")},
              {to:"/admin/material-manager", icon:FolderOpen, label:t("Materials","المواد التعليمية"),                  sub:t("PDFs, videos & resources","ملفات ومقاطع وموارد")},
              {to:"/admin/level-subject",    icon:BookMarked, label:t("Level–Subject Mapping","ربط المستويات والمواد"), sub:t("Which subjects per level","المواد المخصصة لكل مستوى")},
              {to:"/admin/calendar",         icon:Calendar,   label:t("Academic Calendar","التقويم الأكاديمي"),         sub:t("Holidays & key dates","الإجازات والمناسبات")},
            ]}/>

            <Section title={t("Classes","الفصول")} ck="classes" items={[
              {to:"/admin/live-classes",   icon:Video,      label:t("Live Classes","الفصول الحية"),     sub:t("Launch & manage LiveKit rooms","إطلاق وإدارة الفصول الحية")},
              {to:"/admin/public-classes", icon:Globe,      label:t("Public Classes","الدروس العامة"), sub:t("Open sessions for guests","دروس مفتوحة")},
              {to:"/admin/recordings",     icon:Headphones, label:t("Recordings","التسجيلات"),         sub:t("Browse class recordings","تسجيلات الدروس")},
            ]}/>

            <Section title={t("Assessments","التقييمات")} ck="assessments" items={[
              {to:"/admin/exams",         icon:ClipboardList, label:t("Exams","الامتحانات"),           sub:t("Create & publish","إنشاء ونشر")},
              {to:"/admin/question-bank", icon:Library,       label:t("Question Bank","بنك الأسئلة"), sub:t("Manage reusable questions","قاعدة الأسئلة")},
              {to:"/admin/grading",       icon:CheckSquare,   label:t("Grading","التصحيح"),           sub:t("Mark pending submissions","تصحيح التقديمات"), badge:stats.pendingGrading},
              {to:"/admin/entrance-exam", icon:GraduationCap, label:t("Entrance Exam","اختبار القبول"), sub:t("Admissions test","اختبار القبول")},
              {to:"/admin/proctoring",    icon:Shield,        label:t("Proctoring","المراقبة"),        sub:t("Violations & flags","المخالفات"), badge:stats.violations||undefined as any},
            ]}/>

            <Section title={t("Recitation & Ḥifẓ","التلاوة والحفظ")} ck="recitation" items={[
              {to:"/admin/recitation-review",        icon:Mic,      label:t("Recitation Review","مراجعة التلاوة"),    sub:t("Listen & grade recitations","الاستماع والتقييم")},
              {to:"/admin/hifdh-tracker",             icon:BookOpen, label:t("Hifdh Daily Tracker","متابعة مراجعة الحفظ"), sub:t("Assign & acknowledge daily revision","تعيين ومتابعة المراجعة اليومية")},
              {to:"/admin/recitation-test-settings", icon:Settings, label:t("Recitation Settings","إعدادات التلاوة"), sub:t("AI grading & pass criteria","معايير التقييم")},
            ]}/>

            <Section title={t("Finance","المالية")} ck="finance" items={[
              {to:"/admin/payments",         icon:CreditCard, label:t("All Payments","جميع المدفوعات"),   sub:t("History & status","السجل والحالة"), badge:stats.pendingPayments},
              {to:"/admin/payment-settings", icon:Settings,   label:t("Payment Settings","إعدادات الدفع"), sub:t("Enable fees & set amounts","تفعيل الرسوم وضبط المبالغ")},
            ]}/>

            <Section title={t("Communication","التواصل")} ck="comms" items={[
              {to:"/admin/majlis-moderation", icon:MessageCircle, label:t("Al-Majlis Moderation","إدارة المجلس"), sub:t("Channels & messages","القنوات والرسائل")},
              {to:"/admin/notifications",     icon:Bell,          label:t("Notifications","الإشعارات"),          sub:t("Send alerts & reminders","إرسال تنبيهات")},
            ]}/>

          </div>
        </div>

        {/* ── Recent Submissions ─────────────────────────────────── */}
        {recentSubs.length > 0 && (
          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
              <span className="text-sm font-bold text-gray-800">
                {t("Recent Submissions","التقديمات الأخيرة")}
              </span>
              <Link to="/admin/grading" className="flex items-center gap-1 text-xs font-semibold" style={{color:G}}>
                {t("View all","عرض الكل")} <ArrowRight className="h-3 w-3"/>
              </Link>
            </div>
            <div className="divide-y divide-gray-50">
              {recentSubs.map(sub=>(
                <Link key={sub.id} to="/admin/grading"
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 shrink-0">
                    <ClipboardList className="h-3.5 w-3.5 text-amber-600"/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate" dir="auto">
                      {language==="ar" ? sub.exams?.title_ar||sub.exams?.title : sub.exams?.title}
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      {sub.profiles?.full_name||sub.profiles?.email||"—"}
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-[10px] shrink-0">{t("Grade","صحّح")}</Badge>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ── Activity feed ──────────────────────────────────────── */}
        {activity.length > 0 && (
          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-50">
              <Activity className="h-3.5 w-3.5 text-gray-400"/>
              <span className="text-sm font-bold text-gray-800">{t("Recent Activity","النشاط الأخير")}</span>
            </div>
            <div className="divide-y divide-gray-50">
              {activity.map(log=>(
                <div key={log.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{background:G}}/>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-semibold text-gray-700">{log.action}</span>
                    {log.entity_type && <span className="text-[10px] text-gray-400 ms-1.5">({log.entity_type})</span>}
                  </div>
                  <span className="text-[10px] text-gray-400 shrink-0 tabular-nums">
                    {formatActivityTime(log.created_at)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Al-Musābaqah promo ─────────────────────────────────── */}
        <Link to="/live-quiz">
          <div className="relative overflow-hidden rounded-2xl px-5 py-4 flex items-center gap-4"
            style={{background:"linear-gradient(135deg,#1a1a2e 0%,#16213e 100%)"}}>
            <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-20"
              style={{background:"#f7c948",filter:"blur(20px)"}}/>
            <Trophy className="h-8 w-8 shrink-0" style={{color:"#f7c948"}}/>
            <div className="flex-1 min-w-0">
              <p className="font-black text-white text-base leading-tight">Al-Musābaqah 🏆</p>
              <p className="text-xs text-white/50 mt-0.5">{t("Launch live quiz competition","ابدأ المسابقة الحية")}</p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-white/30"/>
          </div>
        </Link>

        <div className="pb-6"/>
      </div>
    </div>
  );
}
