/*
  DashboardLayout.tsx — Tahleem Academy
  Mobile-first responsive layout with collapsible admin nav groups
*/
import { useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useTasjeel } from "@/hooks/useTasjeel";
import { usePaymentAccess } from "@/hooks/usePaymentAccess";
import {
  BookOpen, LayoutDashboard, ClipboardList, Users, LogOut, Globe,UserPlus,
  CheckSquare, BarChart, UserCircle, Library, GraduationCap, MessageCircle,
  Menu, Video, Mic, Layers, FileText, UserCheck, BookMarked, Settings,
  CreditCard, Calendar, ChevronDown, ChevronRight, Wallet, Bell,
  BookOpenCheck, RefreshCw, Headphones, Trophy, X, Lock, Clock, FolderOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useState as useLayoutState, useEffect as useLayoutEffect } from "react";
import PaymentBanner from "./PaymentBanner";
import HolidayBanner from "./HolidayBanner";
import AdminPaymentIndicator from "./AdminPaymentIndicator";
import ImpersonationBanner from "./ImpersonationBanner";

interface DashboardLayoutProps { role: "student" | "admin"; }

// ── PaymentLockScreen ────────────────────────────────────────────────────
// Shown in-place of locked pages when student's subscription has expired.
const PaymentLockScreen = () => {
  const navigate = useNavigate();
  return (
    <div style={{
      minHeight: "100%", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "40px 20px", gap: 20, textAlign: "center",
      background: "linear-gradient(160deg, #f9fafb 0%, #f0fff4 100%)",
    }}>
      {/* Lock icon */}
      <div style={{
        width: 72, height: 72, borderRadius: "50%",
        background: "linear-gradient(135deg, #ffebee, #fce4ec)",
        border: "2px solid #ef9a9a",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Lock style={{ width: 32, height: 32, color: "#c62828" }} />
      </div>

      {/* Text */}
      <div>
        <p style={{ fontSize: 20, fontWeight: 900, color: "#111", margin: "0 0 6px" }}>
          Feature Locked
        </p>
        <p style={{ fontSize: 14, color: "#666", margin: "0 0 4px", maxWidth: 280 }}>
          Your subscription has expired.
        </p>
        <p style={{ fontSize: 13, color: "#999", margin: 0, maxWidth: 280 }}>
          Renew now to restore access to courses, timetable, revision, exams, and more.
        </p>
      </div>

      {/* Locked features list */}
      <div style={{
        background: "#fff", borderRadius: 14, border: "1px solid #f0f0f0",
        padding: "14px 20px", width: "100%", maxWidth: 320,
        display: "flex", flexDirection: "column", gap: 8,
      }}>
        {["Courses & Lessons","Timetable","Al-Murājaʿah (Revision)","Al-Ḥifẓ Tracker","Exams & Transcripts","Al-Majlis Chat","Live Classes","Al-Musābaqah"].map(f => (
          <div key={f} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#e53935" }}>
            <span style={{ fontSize: 15 }}>🔒</span>
            <span>{f}</span>
          </div>
        ))}
      </div>

      {/* CTA */}
      <button
        onClick={() => navigate("/student/enrollment-payment")}
        style={{
          background: "linear-gradient(135deg, #064E3B, #075E54)",
          color: "#fff", border: "none", borderRadius: 14,
          padding: "16px 36px", cursor: "pointer",
          fontWeight: 800, fontSize: 16,
          display: "flex", alignItems: "center", gap: 10,
          boxShadow: "0 6px 24px rgba(7,94,84,.35)",
        }}
      >
        <CreditCard style={{ width: 18, height: 18 }} />
        Renew Subscription
      </button>

      <p style={{ fontSize: 11, color: "#aaa" }}>
        Secured by Paystack · SSL Encrypted
      </p>
    </div>
  );
};

const DashboardLayout = ({ role }: DashboardLayoutProps) => {
  const { t, language, setLanguage, dir } = useLanguage();
  const { signOut, profile } = useAuth();
  const { currentStep } = useTasjeel();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // ── Level-pending: lock most features until admin assigns a level ─────────
  const levelPending = role === "student" && currentStep !== null && currentStep !== "completed";

  // ── Payment-locking: block features when student subscription is locked ──
  const { accessStatus: paymentStatus, isLoading: paymentLoading } = usePaymentAccess();
  const isPaymentLocked = role === "student" && !paymentLoading && paymentStatus === "locked";

  // Routes that are blocked when payment is locked (student must pay to enter)
  const PAYMENT_GATED_ROUTES = new Set([
    "/student/courses",
    "/student/timetable",
    "/student/revision",
    "/student/hifdh",
    "/student/majlis",
    "/live-quiz",
    "/student/live-classes",
    "/student/exams",
    "/student/transcripts",
    "/student/musabaqah",
  ]);

  const LOCKED_ROUTES = new Set([
    "/student/courses",
    "/student/timetable",
    "/student/revision",
    "/student/hifdh",
    "/student/majlis",
    "/live-quiz",
    "/student/live-classes",
    "/student/exams",
    "/student/transcripts",
    "/student/musabaqah",
  ]);

  const isMajlis = location.pathname === "/student/majlis";  if (isMajlis) return <div style={{ position:"fixed", inset:0, zIndex:40 }}><Outlet /></div>;

  const toggle = (key: string) => setExpanded(p => ({ ...p, [key]: !p[key] }));
  const groupActive = (paths: string[]) => paths.some(p => location.pathname.startsWith(p));

  // ── Student nav ──────────────────────────────────────────────
  type NavItem =
    | { type:"link"; to:string; icon:any; label:string }
    | { type:"group"; key:string; icon:any; label:string; children:{to:string;icon:any;label:string}[] };

  const studentNav: NavItem[] = [
    { type:"link", to:"/student",           icon:LayoutDashboard, label:t("Dashboard","الصفحة الرئيسية") },
    { type:"link", to:"/student/courses",   icon:BookOpenCheck,   label:t("At-Ta'allum","التعلّم") },
    { type:"link", to:"/student/timetable", icon:Calendar,        label:t("Jadwal (Timetable)","الجدول الدراسي") },
    { type:"group", key:"revision", icon:RefreshCw, label:t("Al-Murāja'ah","المراجعة"), children:[
      { to:"/student/revision", icon:BookMarked, label:t("At-Tadārus","التدارس") },
      { to:"/student/hifdh",    icon:Headphones, label:t("Al-Ḥifẓ","الحفظ") },
    ]},
    { type:"group", key:"exams", icon:ClipboardList, label:t("Al-Ikhtibārāt","الاختبارات"), children:[
      { to:"/student/exams",       icon:ClipboardList, label:t("Ikhtibārātī","اختباراتي") },
      { to:"/student/transcripts", icon:GraduationCap, label:t("As-Sijill","السجل الأكاديمي") },
    ]},
    { type:"link", to:"/student/majlis",     icon:MessageCircle, label:t("Al-Majlis","المجلس") },
    // ── Musabaqah (updated route) ──────────────────────────────
    { type:"link", to:"/student/musabaqah",  icon:Trophy,        label:t("Al-Musābaqah 🏆","المسابقة 🏆") },
    { type:"link", to:"/student/profile",    icon:UserCircle,    label:t("Al-I'dādāt","الإعدادات") },
  ];

  // ── Admin nav — fully organized, every page linked ──────────
  type AdminNavItem =
    | { type:"link";  to:string; icon:any; label:string }
    | { type:"group"; key:string; icon:any; label:string; children:{to:string;icon:any;label:string}[] };

  const adminNav: AdminNavItem[] = [
    { type:"link", to:"/admin", icon:LayoutDashboard, label:t("Dashboard","لوحة التحكم") },

    // 1 ── Student Pipeline ─────────────────────────────────────
    { type:"group", key:"pipeline", icon:UserPlus, label:t("Student Pipeline","سير التسجيل"), children:[
      { to:"/admin/level-assignment",      icon:GraduationCap, label:t("New Registrations","الطلاب الجدد") },
      { to:"/admin/tasjeel",               icon:ClipboardList, label:t("Pipeline Tracker","متابعة التسجيل") },
      { to:"/admin/registration-settings", icon:Settings,      label:t("Reg. Settings","إعدادات التسجيل") },
    ]},

    // 2 ── Students ─────────────────────────────────────────────
    { type:"group", key:"students", icon:Users, label:t("Students","الطلاب"), children:[
      { to:"/admin/students",         icon:Users,         label:t("All Students","جميع الطلاب") },
      { to:"/admin/attendance",       icon:CheckSquare,   label:t("Attendance","الحضور والغياب") },
      { to:"/admin/transcripts",      icon:GraduationCap, label:t("Transcripts","السجلات الأكاديمية") },
      { to:"/admin/private-sessions", icon:UserCheck,     label:t("Private Sessions","الجلسات الخاصة") },
    ]},

    // 3 ── Academic ─────────────────────────────────────────────
    { type:"group", key:"academic", icon:BookOpen, label:t("Academic","الأكاديمي"), children:[
      { to:"/admin/courses",          icon:Layers,      label:t("Courses & Subjects","الدورات والمواد") },
      { to:"/admin/timetable",        icon:Clock,       label:t("Timetable","الجدول الدراسي") },
      { to:"/admin/material-manager", icon:FolderOpen,  label:t("Materials","المواد التعليمية") },
      { to:"/admin/level-subject",    icon:BookMarked,  label:t("Level–Subject Map","ربط المستويات") },
      { to:"/admin/calendar",         icon:Calendar,    label:t("Academic Calendar","التقويم الأكاديمي") },
    ]},

    // 4 ── Classes ──────────────────────────────────────────────
    { type:"group", key:"classes", icon:Video, label:t("Classes","الفصول"), children:[
      { to:"/admin/live-classes",   icon:Video,      label:t("Live Classes","الفصول الحية") },
      { to:"/admin/public-classes", icon:Globe,      label:t("Public Classes","الدروس العامة") },
      { to:"/admin/recordings",     icon:Headphones, label:t("Recordings","التسجيلات") },
    ]},

    // 5 ── Assessments ──────────────────────────────────────────
    { type:"group", key:"assess", icon:ClipboardList, label:t("Assessments","التقييمات"), children:[
      { to:"/admin/exams",         icon:ClipboardList, label:t("Exams","الامتحانات") },
      { to:"/admin/question-bank", icon:Library,       label:t("Question Bank","بنك الأسئلة") },
      { to:"/admin/grading",       icon:CheckSquare,   label:t("Grading","التصحيح") },
      { to:"/admin/entrance-exam", icon:GraduationCap, label:t("Entrance Exam","اختبار القبول") },
      { to:"/admin/proctoring",    icon:BarChart,      label:t("Proctoring","المراقبة") },
    ]},

    // 6 ── Recitation & Ḥifẓ ────────────────────────────────────
    { type:"group", key:"recit", icon:Mic, label:t("Recitation & Ḥifẓ","التلاوة والحفظ"), children:[
      { to:"/admin/recitation-review",        icon:Mic,      label:t("Recitation Review","مراجعة التلاوة") },
      { to:"/admin/recitation-test-settings", icon:Settings, label:t("Recitation Settings","إعدادات التلاوة") },
    ]},

    // 7 ── Finance ──────────────────────────────────────────────
    { type:"group", key:"finance", icon:CreditCard, label:t("Finance","المالية"), children:[
      { to:"/admin/payments",         icon:CreditCard, label:t("All Payments","جميع المدفوعات") },
      { to:"/admin/payment-settings", icon:Settings,   label:t("Payment Settings","إعدادات الدفع") },
    ]},

    // 8 ── Communication ────────────────────────────────────────
    { type:"group", key:"comms", icon:MessageCircle, label:t("Communication","التواصل"), children:[
      { to:"/admin/majlis-moderation", icon:MessageCircle, label:t("Al-Majlis","المجلس") },
      { to:"/admin/notifications",     icon:Bell,          label:t("Notifications","الإشعارات") },
    ]},

    // 9 ── Al-Musābaqah (updated route) ─────────────────────────
    { type:"link", to:"/admin/musabaqah", icon:Trophy, label:t("Al-Musābaqah 🏆","المسابقة 🏆") },
  ];

  // ── Notification badge count for top bar ────────────────────
  const { user } = useAuth();
  const [unreadNotifs, setUnreadNotifs] = useLayoutState(0);
  const [showNotifPanel, setShowNotifPanel] = useLayoutState(false);
  const [notifList, setNotifList] = useLayoutState<any[]>([]);

  useLayoutEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      const list = data || [];
      setNotifList(list);
      setUnreadNotifs(list.filter((n: any) => !n.is_read).length);
    };
    load();

    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        "postgres_changes" as any,
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload: any) => {
          setNotifList(prev => [payload.new, ...prev]);
          setUnreadNotifs(p => p + 1);
        }
      )      .on(
        "postgres_changes" as any,
        { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload: any) => {
          setNotifList(prev => prev.map((n: any) => n.id === payload.new.id ? payload.new : n));
          setUnreadNotifs(prev => Math.max(0, prev - (payload.old?.is_read === false && payload.new?.is_read === true ? 1 : 0)));
        }
      )
      .subscribe();

    const iv = setInterval(load, 15000);
    return () => {
      clearInterval(iv);
      supabase.removeChannel(channel);
    };
  }, [user]);

  const markRead = async (id: string) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    setNotifList(p => p.map(n => n.id === id ? { ...n, is_read: true } : n));
    setUnreadNotifs(p => Math.max(0, p - 1));
  };

  // ── Shared sidebar content ────────────────────────────────────
  const SidebarContent = ({ onNavigate }: { onNavigate?: () => void }) => {
    const nav = role === "student" ? studentNav : adminNav;
    return (
      <div className="flex h-full flex-col">
        <div className="flex h-14 items-center gap-3 border-b border-sidebar-border px-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sidebar-primary shrink-0">
            <BookOpen className="h-3.5 w-3.5 text-sidebar-primary-foreground" />
          </div>
          <span className="font-bold text-sidebar-foreground font-arabic text-base leading-tight">
            {t("Tahleem","تعليم")}
            <span className="text-sidebar-primary ms-1 text-xs font-normal opacity-80">{t("Academy","أكاديمية")}</span>
          </span>
          {onNavigate && (
            <button onClick={onNavigate} className="ml-auto text-sidebar-foreground/50 hover:text-sidebar-foreground">
              <X className="h-4 w-4"/>
            </button>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {(nav as any[]).map((item: any) => {
            if (item.type === "link") {
              const active = item.to === "/admin" || item.to === "/student"
                ? location.pathname === item.to
                : location.pathname.startsWith(item.to);
              const isLocked = levelPending && LOCKED_ROUTES.has(item.to);              if (isLocked) {
                return (
                  <div key={item.to}
                    title="Available after level assignment"
                    style={{ opacity: .45, cursor: "not-allowed" }}
                    className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/40">
                    <item.icon className="h-4 w-4 shrink-0"/>
                    <span className="truncate flex-1">{item.label}</span>
                    <Lock className="h-3 w-3 shrink-0 opacity-60"/>
                  </div>
                );
              }
              return (
                <Link key={item.to} to={item.to} onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/65 hover:bg-sidebar-accent/40 hover:text-sidebar-accent-foreground"
                  )}>
                  <item.icon className="h-4 w-4 shrink-0"/>
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            }
            const isActive = groupActive(item.children.map((c: any) => c.to));
            const isOpen   = expanded[item.key] ?? isActive; // auto-expand if a child is active
            const groupLocked = levelPending && item.children.every((c: any) => LOCKED_ROUTES.has(c.to));
            return (
              <div key={item.key}>
                <button onClick={() => !groupLocked && toggle(item.key)}
                  title={groupLocked ? "Available after level assignment" : undefined}
                  style={groupLocked ? { opacity: .45, cursor: "not-allowed" } : undefined}
                  className={cn(
                    "w-full flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-sidebar-accent/50 text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/65 hover:bg-sidebar-accent/40 hover:text-sidebar-accent-foreground"
                  )}>
                  <item.icon className="h-4 w-4 shrink-0"/>
                  <span className="flex-1 text-left truncate">{item.label}</span>
                  {isOpen
                    ? <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0"/>
                    : <ChevronRight className="h-3.5 w-3.5 opacity-50 shrink-0"/>}
                </button>
                {isOpen && (
                  <div className="ms-5 mt-0.5 mb-1 space-y-0.5 border-l border-sidebar-border/40 ps-3">
                    {item.children.map((child: any) => {
                      const ca = location.pathname.startsWith(child.to);
                      return (                        <Link key={child.to} to={child.to} onClick={onNavigate}
                          className={cn(
                            "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                            ca
                              ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                              : "text-sidebar-foreground/55 hover:bg-sidebar-accent/40 hover:text-sidebar-accent-foreground"
                          )}>
                          <child.icon className="h-3.5 w-3.5 shrink-0"/>
                          <span className="truncate">{child.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-2 space-y-0.5">
          {profile?.full_name && (
            <div className="px-3 py-2">
              <p className="text-xs font-medium text-sidebar-foreground/70 truncate">{profile.full_name}</p>
              <p className="text-[11px] text-sidebar-foreground/40 truncate">{(profile as any).email}</p>
            </div>
          )}
          {role === "student" && (
            <Link to="/student/enrollment-payment" onClick={onNavigate}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                location.pathname === "/student/enrollment-payment"
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/65 hover:bg-sidebar-accent/40 hover:text-sidebar-accent-foreground"
              )}>
              <Wallet className="h-4 w-4 shrink-0 text-yellow-400"/>
              <span>{t("Payment","الدفع")}</span>
            </Link>
          )}
          <button
            className="w-full flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-sidebar-foreground/65 hover:bg-sidebar-accent/40 hover:text-sidebar-accent-foreground transition-colors"
            onClick={() => { setLanguage(language === "en" ? "ar" : "en"); onNavigate?.(); }}>
            <Globe className="h-4 w-4"/>
            <span>{t("العربية","English")}</span>
          </button>
          <button
            className="w-full flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-sidebar-foreground/65 hover:bg-destructive/20 hover:text-destructive transition-colors"
            onClick={() => { signOut(); onNavigate?.(); }}>
            <LogOut className="h-4 w-4"/>
            <span>{t("Sign Out","تسجيل الخروج")}</span>
          </button>        </div>
      </div>
    );
  };

  return (
    <div className="flex overflow-hidden" style={{ height: "100dvh" }}>
      <aside className="hidden w-60 flex-col bg-sidebar md:flex flex-shrink-0 border-r border-sidebar-border">
        <SidebarContent />
      </aside>

      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <header className="flex h-12 items-center gap-3 border-b bg-background px-4 md:hidden flex-shrink-0">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Menu className="h-4 w-4"/>
              </Button>
            </SheetTrigger>
            <SheetContent
              side={dir === "rtl" ? "right" : "left"}
              className="w-64 p-0 bg-sidebar border-sidebar-border">
              <SidebarContent onNavigate={() => setOpen(false)}/>
            </SheetContent>
          </Sheet>

          <div className="flex-1 flex items-center justify-center">
            <div className="flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5 text-primary"/>
              <span className="font-bold font-arabic text-sm">{t("Tahleem","تعليم")}</span>
              <span className="text-muted-foreground text-xs">{t("Academy","أكاديمية")}</span>
            </div>
          </div>

          <div className="flex items-center gap-1">
              <div className="relative">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowNotifPanel(true)}>
                  <Bell className="h-4 w-4"/>
                </Button>
                {unreadNotifs > 0 && (
                  <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-black text-white border border-background">
                    {unreadNotifs > 9 ? "9+" : unreadNotifs}
                  </span>
                )}
              </div>
              <Link to="/student/enrollment-payment">
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Wallet className="h-4 w-4 text-yellow-500"/>
                </Button>
              </Link>            </div>
        </header>

        <ImpersonationBanner/>
        <HolidayBanner/>
        {role === "student" && <PaymentBanner/>}
        {role === "admin"   && <AdminPaymentIndicator/>}

        {levelPending && (
          <div style={{
            background: "linear-gradient(90deg, #0f2d1f, #1a4731)",
            borderBottom: "1px solid rgba(201,168,76,.2)",
            padding: "10px 20px",
            display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
          }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(201,168,76,.15)", border: "1.5px solid rgba(201,168,76,.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Clock style={{ width: 14, height: 14, color: "#c9a84c" }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 12, fontWeight: 800, color: "#c9a84c", margin: "0 0 1px" }}>
                Awaiting Level Assignment
              </p>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,.55)", margin: 0 }}>
                Your application is under review. Full dashboard access unlocks once an admin assigns your learning level (within 48h).
              </p>
            </div>
            <div style={{ flexShrink: 0 }}>
              <Lock style={{ width: 14, height: 14, color: "rgba(255,255,255,.3)" }} />
            </div>
          </div>
        )}

        {showNotifPanel && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowNotifPanel(false)}>
            <div className="absolute top-0 left-0 right-0 max-h-[80vh] bg-white rounded-b-3xl shadow-2xl flex flex-col overflow-hidden"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b" style={{ background:"#0f2d1f" }}>
                <div className="flex items-center gap-2.5">
                  <Bell className="h-4 w-4" style={{ color:"#c9a84c" }}/>
                  <span className="font-bold text-white text-base">Notifications · الإشعارات</span>
                  {unreadNotifs > 0 && (
                    <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full text-white" style={{ background:"#c0392b" }}>
                      {unreadNotifs} new
                    </span>
                  )}
                </div>
                <button onClick={() => setShowNotifPanel(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10">
                  ✕
                </button>              </div>
              <div className="overflow-y-auto flex-1">
                {notifList.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground text-sm">No notifications yet</div>
                ) : notifList.map((n: any) => (
                    <div key={n.id} onClick={() => {
                        if (!n.is_read) markRead(n.id);
                        if (n.link) { setShowNotifPanel(false); window.location.href = n.link; }
                      }}
                      className="flex items-start gap-3 px-5 py-3.5 border-b cursor-pointer transition-colors"
                      style={{ background: n.is_read ? "#fafafa" : n.type === "class_reminder" ? "#f0fff4" : n.type === "payment" ? "#fff5f5" : "#fffbeb" }}>
                      <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                        style={{ background: n.is_read ? "#f0f4f0" : "#fffbeb", border:`1.5px solid ${n.is_read ? "#e0e0e0" : "#c9a84c88"}` }}>
                        <span className="text-sm">
                          {n.type === "class_reminder"  ? "📚"
                            : n.type === "warning"        ? "⚠️"
                            : n.type === "exam_assigned"  ? "📋"
                            : n.type === "result_released"? "🎯"
                            : n.type === "exam"           ? "📋"
                            : n.type === "payment"        ? "💳"
                            : "🔔"}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`text-sm leading-tight ${n.is_read ? "font-medium" : "font-bold"} text-gray-900`}>{n.title}</p>
                          {!n.is_read && <div className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0"/>}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{n.message}</p>
                        <div className="flex items-center justify-between mt-1">
                          <p className="text-[10px] text-gray-400">
                            {new Date(n.created_at).toLocaleDateString("en-US", { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" })}
                          </p>
                          {n.type === "class_reminder" && n.link && (
                            <span style={{ fontSize:10, padding:"2px 8px", borderRadius:9, background:"#0f2d1f", color:"#c9a84c", fontWeight:700 }}>
                              Join →
                            </span>
                          )}
                          {n.type === "payment" && n.link && (
                            <span style={{ fontSize:10, padding:"2px 8px", borderRadius:9, background:"#c62828", color:"#fff", fontWeight:700 }}>
                              Pay Now →
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <main className="flex-1 overflow-auto">
          {/* ── Payment lock screen for gated routes ── */}
          {isPaymentLocked && PAYMENT_GATED_ROUTES.has(location.pathname) ? (
            <PaymentLockScreen />
          ) : (
            <Outlet/>
          )}
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
