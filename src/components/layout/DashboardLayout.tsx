/*
  DashboardLayout.tsx — Tahleem Academy
  Mobile-first responsive layout with collapsible admin nav groups
*/
import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  BookOpen, LayoutDashboard, ClipboardList, Users, LogOut, Globe,UserPlus,
  CheckSquare, BarChart, UserCircle, Library, GraduationCap, MessageCircle,
  Menu, Video, Mic, Layers, FileText, UserCheck, BookMarked, Settings,
  CreditCard, Calendar, ChevronDown, ChevronRight, Wallet, Bell,
  BookOpenCheck, RefreshCw, Headphones, Trophy, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useState as useLayoutState, useEffect as useLayoutEffect } from "react";
import PaymentBanner from "./PaymentBanner";
import HolidayBanner from "./HolidayBanner";
import AdminPaymentIndicator from "./AdminPaymentIndicator";

interface DashboardLayoutProps { role: "student" | "admin"; }

const DashboardLayout = ({ role }: DashboardLayoutProps) => {
  const { t, language, setLanguage, dir } = useLanguage();
  const { signOut, profile } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Fullscreen escape for Majlis
  const isMajlis = location.pathname === "/student/majlis";
  if (isMajlis) return <div style={{ position:"fixed", inset:0, zIndex:40 }}><Outlet /></div>;

  const toggle = (key: string) => setExpanded(p => ({ ...p, [key]: !p[key] }));
  const groupActive = (paths: string[]) => paths.some(p => location.pathname.startsWith(p));

  // ── Student nav ──────────────────────────────────────────────
  type NavItem =
    | { type:"link"; to:string; icon:any; label:string }
    | { type:"group"; key:string; icon:any; label:string; children:{to:string;icon:any;label:string}[] };

  const studentNav: NavItem[] = [
    { type:"link", to:"/student",         icon:LayoutDashboard, label:t("Dashboard","لوحة التحكم") },
    { type:"link", to:"/student/courses", icon:BookOpenCheck,   label:t("Learning Hub","مركز التعلم") },
    { type:"group", key:"revision", icon:RefreshCw, label:t("Revision","المراجعة"), children:[
      { to:"/student/revision", icon:BookMarked, label:t("General Revision","المراجعة العامة") },
      { to:"/student/hifdh",    icon:Headphones, label:t("Al-Hifdh","الحفظ") },
    ]},
    { type:"group", key:"exams", icon:ClipboardList, label:t("Exams","الامتحانات"), children:[
      { to:"/student/exams",       icon:ClipboardList, label:t("My Exams","امتحاناتي") },
      { to:"/student/transcripts", icon:GraduationCap, label:t("Transcripts","السجل الأكاديمي") },
    ]},
    { type:"link", to:"/student/majlis",  icon:MessageCircle, label:t("Al-Majlis","المجلس") },
    { type:"link", to:"/live-quiz",       icon:Trophy,        label:t("Al-Musabaqah 🏆","المسابقة الحية 🏆") },
    { type:"link", to:"/student/profile", icon:UserCircle,    label:t("Settings","الإعدادات") },
  ];

  // ── Admin nav — grouped ──────────────────────────────────────
  type AdminNavItem =
    | { type:"link";  to:string; icon:any; label:string }
    | { type:"group"; key:string; icon:any; label:string; children:{to:string;icon:any;label:string}[] };

  const adminNav: AdminNavItem[] = [
    { type:"link",  to:"/admin",                  icon:LayoutDashboard, label:t("Dashboard","لوحة التحكم") },
    { type:"link",  to:"/admin/level-assignment", icon:GraduationCap,   label:t("Level Assignment","تحديد المستوى") },
    { type:"group", key:"academic", icon:BookOpen, label:t("Academic","المحتوى الأكاديمي"), children:[
      { to:"/admin/subjects", icon:BookOpen,  label:t("Subjects","المواد") },
      { to:"/admin/courses",  icon:Layers,    label:t("Courses","الدورات") },
      { to:"/admin/syllabus", icon:FileText,  label:t("Syllabus & Materials","المنهج والمواد") },
      { to:"/admin/calendar", icon:Calendar,  label:t("Calendar","التقويم") },
    ]},
    { type:"group", key:"classes", icon:Video, label:t("Classes","الفصول"), children:[
      { to:"/admin/live-classes",   icon:Video, label:t("Live Classes","الفصول الحية") },
      { to:"/admin/public-classes", icon:Globe, label:t("Public Classes","الدروس العامة") },
    ]},
    { type:"group", key:"assess", icon:ClipboardList, label:t("Assessments","التقييمات"), children:[
      { to:"/admin/exams",         icon:ClipboardList, label:t("Exams","الامتحانات") },
      { to:"/admin/question-bank", icon:Library,       label:t("Question Bank","بنك الأسئلة") },
      { to:"/admin/grading",       icon:CheckSquare,   label:t("Grading","التصحيح") },
      { to:"/admin/entrance-exam", icon:GraduationCap, label:t("Entrance Exam","اختبار القبول") },
      { to:"/admin/proctoring",    icon:BarChart,      label:t("Proctoring","المراقبة") },
    ]},
    { type:"group", key:"recit", icon:Mic, label:t("Recitation","التلاوة"), children:[
      { to:"/admin/recitation-review",        icon:Mic,      label:t("Recitation Review","مراجعة التلاوة") },
      { to:"/admin/recitation-test-settings", icon:Settings, label:t("Recitation Settings","إعدادات التلاوة") },
    ]},
    { type:"group", key:"students", icon:Users, label:t("Students","الطلاب"), children:[
      { to:"/admin/students",         icon:Users,     label:t("All Students","جميع الطلاب") },
      { to:"/admin/private-sessions", icon:UserCheck, label:t("Private Sessions","الجلسات الخاصة") },
    ]},
    { type:"link", to:"/admin/payments",          icon:CreditCard,    label:t("Payments","المدفوعات") },
    { type:"link", to:"/admin/majlis-moderation", icon:MessageCircle, label:t("Al-Majlis","المجلس") },
    { type:"link", to:"/live-quiz",               icon:Trophy,        label:t("Al-Musabaqah 🏆","المسابقة الحية 🏆") },
  ];

  // ── Notification badge count for top bar ────────────────────
  const { user } = useAuth();
  const [unreadNotifs, setUnreadNotifs] = useLayoutState(0);
  const [showNotifPanel, setShowNotifPanel] = useLayoutState(false);
  const [notifList, setNotifList] = useLayoutState<any[]>([]);

  useLayoutEffect(() => {
    if (!user || role !== "student") return;
    const load = async () => {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30);
      const list = data || [];
      setNotifList(list);
      setUnreadNotifs(list.filter((n: any) => !n.is_read).length);
    };
    load();
    // Re-fetch every 60s
    const iv = setInterval(load, 60000);
    return () => clearInterval(iv);
  }, [user, role]);

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
        {/* Logo */}
        <div className="flex h-14 items-center gap-3 border-b border-sidebar-border px-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sidebar-primary shrink-0">
            <BookOpen className="h-3.5 w-3.5 text-sidebar-primary-foreground" />
          </div>
          <span className="font-bold text-sidebar-foreground font-arabic text-base leading-tight">
            {t("Tahleem","تعليم")}
            <span className="text-sidebar-primary ms-1 text-xs font-normal opacity-80">{t("Academy","أكاديمية")}</span>
          </span>
          {/* Close button on mobile */}
          {onNavigate && (
            <button onClick={onNavigate} className="ml-auto text-sidebar-foreground/50 hover:text-sidebar-foreground">
              <X className="h-4 w-4"/>
            </button>
          )}
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {(nav as any[]).map((item: any) => {
            if (item.type === "link") {
              const active = item.to === "/admin" || item.to === "/student"
                ? location.pathname === item.to
                : location.pathname.startsWith(item.to);
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
            const isOpen   = expanded[item.key] ?? false;
            return (
              <div key={item.key}>
                <button onClick={() => toggle(item.key)}
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
                      return (
                        <Link key={child.to} to={child.to} onClick={onNavigate}
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

        {/* Footer */}
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
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 flex-col bg-sidebar md:flex flex-shrink-0 border-r border-sidebar-border">
        <SidebarContent />
      </aside>

      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar */}
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

          {role === "student" && (
            <div className="flex items-center gap-1">
              {/* Notification bell */}
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
              {/* Payment wallet */}
              <Link to="/student/enrollment-payment">
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Wallet className="h-4 w-4 text-yellow-500"/>
                </Button>
              </Link>
            </div>
          )}
        </header>

        <HolidayBanner/>
        {role === "student" && <PaymentBanner/>}
        {role === "admin"   && <AdminPaymentIndicator/>}

        {/* ── Notification panel (student) ── */}
        {role === "student" && showNotifPanel && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowNotifPanel(false)}>
            <div className="absolute top-0 left-0 right-0 max-h-[80vh] bg-white rounded-b-3xl shadow-2xl flex flex-col overflow-hidden"
              onClick={e => e.stopPropagation()}>
              {/* Header */}
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
                </button>
              </div>
              {/* List */}
              <div className="overflow-y-auto flex-1">
                {notifList.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground text-sm">No notifications yet</div>
                ) : notifList.map((n: any) => (
                  <div key={n.id} onClick={() => !n.is_read && markRead(n.id)}
                    className="flex items-start gap-3 px-5 py-3.5 border-b cursor-pointer transition-colors"
                    style={{ background: n.is_read ? "#fafafa" : "#fffbeb" }}>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: n.is_read ? "#f0f4f0" : "#fffbeb", border:`1.5px solid ${n.is_read ? "#e0e0e0" : "#c9a84c88"}` }}>
                      <span className="text-sm">
                        {n.type === "warning" ? "⚠️" : n.type === "exam" ? "📋" : "ℹ️"}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm leading-tight ${n.is_read ? "font-medium" : "font-bold"} text-gray-900`}>{n.title}</p>
                        {!n.is_read && <div className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0"/>}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{n.message}</p>
                      <p className="text-[10px] text-gray-400 mt-1">
                        {new Date(n.created_at).toLocaleDateString("en-US", { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <main className="flex-1 overflow-auto">
          <Outlet/>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
