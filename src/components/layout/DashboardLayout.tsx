/*  src/components/layout/DashboardLayout.tsx
    KEY FIX: When on /student/majlis the layout renders ONLY the Outlet
    inside a position:fixed fullscreen div — no overflow-auto wrapper,
    no sidebar competing for space. This is what caused Majlis to not
    go truly fullscreen on mobile.
*/
import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  BookOpen, LayoutDashboard, ClipboardList, Users, LogOut, Globe,
  CheckSquare, BarChart, UserCircle, Library, GraduationCap, MessageCircle,
  Menu, Video, Mic, Layers, FileText, UserCheck, BookMarked, Settings,
  CreditCard, Calendar, ChevronDown, ChevronRight, Wallet,
  BookOpenCheck, RefreshCw, Headphones,
} from "lucide-react";
import { cn } from "@/lib/utils";
import PaymentBanner from "./PaymentBanner";
import HolidayBanner from "./HolidayBanner";
import AdminPaymentIndicator from "./AdminPaymentIndicator";

interface DashboardLayoutProps { role: "student" | "admin"; }

const DashboardLayout = ({ role }: DashboardLayoutProps) => {
  const { t, language, setLanguage, dir } = useLanguage();
  const { signOut, profile } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    revision: true,
    exams: true,
  });

  // ── TRUE FULLSCREEN ESCAPE for Majlis ────────────────────────
  const isMajlis = location.pathname === "/student/majlis";
  if (isMajlis) {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 40 }}>
        <Outlet />
      </div>
    );
  }

  const toggleSection = (key: string) =>
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  const isGroupActive = (paths: string[]) =>
    paths.some(p => location.pathname.startsWith(p));

  type NavItem =
    | { type: "link";  to: string; icon: any; label: string }
    | { type: "group"; key: string; icon: any; label: string; children: { to: string; icon: any; label: string }[] };

  const studentNav: NavItem[] = [
    { type: "link", to: "/student",                   icon: LayoutDashboard, label: t("Dashboard",            "لوحة التحكم")    },
    { type: "link", to: "/student/courses",            icon: BookOpenCheck,   label: t("Learning Hub",         "مركز التعلم")    },
    {
      type: "group", key: "revision",
      icon: RefreshCw,
      label: t("Revision", "المراجعة"),
      children: [
        { to: "/student/revision", icon: BookMarked, label: t("General Revision", "المراجعة العامة") },
        { to: "/student/hifdh",    icon: Headphones, label: t("Al-Hifdh",          "الحفظ")           },
      ],
    },
    {
      type: "group", key: "exams",
      icon: ClipboardList,
      label: t("Exams", "الامتحانات"),
      children: [
        { to: "/student/exams",       icon: ClipboardList, label: t("My Exams",    "امتحاناتي")        },
        { to: "/student/transcripts", icon: GraduationCap, label: t("Transcripts", "السجل الأكاديمي") },
      ],
    },
    { type: "link", to: "/student/majlis",             icon: MessageCircle, label: t("Al-Majlis",            "المجلس")         },
    { type: "link", to: "/student/profile",            icon: UserCircle,    label: t("Settings",             "الإعدادات")      },
  ];

  const adminLinks = [
{ to: "/admin/level-assignment", label: "Level Assignment" }
    { to: "/admin",                   icon: LayoutDashboard, label: t("Dashboard",           "لوحة التحكم")    },
    { to: "/admin/subjects",          icon: BookOpen,        label: t("Subjects",             "المواد")         },
    { to: "/admin/courses",           icon: Layers,          label: t("Courses",              "الدورات")        },
    { to: "/admin/syllabus",          icon: FileText,        label: t("Syllabus & Materials", "المنهج والمواد") },
    { to: "/admin/live-classes",      icon: Video,           label: t("Live Classes",         "الفصول الحية")   },
    { to: "/admin/exams",             icon: ClipboardList,   label: t("Exams",                "الامتحانات")     },
    { to: "/admin/question-bank",     icon: Library,         label: t("Question Bank",        "بنك الأسئلة")    },
    { to: "/admin/students",          icon: Users,           label: t("Students",             "الطلاب")         },
    { to: "/admin/grading",           icon: CheckSquare,     label: t("Grading",              "التصحيح")        },
    { to: "/admin/private-sessions",  icon: UserCheck,       label: t("Private Sessions",     "الجلسات الخاصة") },
    { to: "/admin/proctoring",        icon: BarChart,        label: t("Proctoring",           "المراقبة")       },
    { to: "/admin/entrance-exam",     icon: GraduationCap,   label: t("Entrance Exam",        "اختبار القبول")  },
    { to: "/admin/recitation-review",        icon: Mic,             label: t("Recitation Review",    "مراجعة التلاوة") },
    { to: "/admin/recitation-test-settings", icon: Settings,        label: t("Recitation Settings",  "إعدادات التلاوة") },
    { to: "/admin/payments",          icon: CreditCard,      label: t("Payments",             "المدفوعات")      },
    { to: "/admin/calendar",          icon: Calendar,        label: t("Calendar",             "التقويم")        },
    { to: "/admin/public-classes",    icon: Globe,           label: t("Public Classes",       "الدروس العامة")  },
    { to: "/admin/majlis-moderation", icon: MessageCircle,   label: t("Al-Majlis",            "المجلس")         },
  ];

  const SidebarContent = ({ onNavigate }: { onNavigate?: () => void }) => (
    <div className="flex h-full flex-col">

      {/* Logo */}
      <div className="flex h-16 items-center gap-2.5 border-b border-sidebar-border px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary">
          <BookOpen className="h-4 w-4 text-sidebar-primary-foreground" />
        </div>
        <span className="font-bold text-sidebar-foreground font-arabic text-lg">
          {t("Tahleem", "تعليم")}
          <span className="text-sidebar-primary ms-1 text-sm">{t("Academy", "أكاديمية")}</span>
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 p-3 overflow-auto">

        {/* Student nav */}
        {role === "student" && studentNav.map((item) => {
          if (item.type === "link") {
            const isActive = item.to === "/student"
              ? location.pathname === "/student"
              : location.pathname.startsWith(item.to);
            return (
              <Link key={item.to} to={item.to} onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                )}>
                <item.icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          }

          const groupActive = isGroupActive(item.children.map(c => c.to));
          const isOpen = expanded[item.key];
          return (
            <div key={item.key}>
              <button onClick={() => toggleSection(item.key)}
                className={cn(
                  "w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  groupActive
                    ? "text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                )}>
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left">{item.label}</span>
                {isOpen
                  ? <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                  : <ChevronRight className="h-3.5 w-3.5 opacity-60" />}
              </button>
              {isOpen && (
                <div className="ms-4 mt-0.5 space-y-0.5 border-l border-sidebar-border/50 ps-3">
                  {item.children.map(child => {
                    const childActive = location.pathname.startsWith(child.to);
                    return (
                      <Link key={child.to} to={child.to} onClick={onNavigate}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                          childActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                        )}>
                        <child.icon className="h-3.5 w-3.5 shrink-0" />
                        <span>{child.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Admin nav */}
        {role === "admin" && adminLinks.map(link => (
          <Link key={link.to} to={link.to} onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              location.pathname === link.to
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
            )}>
            <link.icon className="h-4 w-4 shrink-0" />
            <span>{link.label}</span>
          </Link>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-3 space-y-1">
        {profile?.full_name && (
          <div className="px-3 py-2 mb-1">
            <p className="text-xs text-sidebar-foreground/50 truncate">{profile.full_name}</p>
            <p className="text-xs text-sidebar-foreground/40 truncate">{(profile as any).email}</p>
          </div>
        )}

        {role === "student" && (
          <Link to="/student/enrollment-payment" onClick={onNavigate}
            className={cn(
              "w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              location.pathname === "/student/enrollment-payment"
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
            )}>
            <Wallet className="h-4 w-4 shrink-0 text-yellow-400" />
            <span>{t("Enrollment & Payment", "التسجيل والدفع")}</span>
          </Link>
        )}

        <Button variant="ghost" size="sm"
          className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
          onClick={() => { setLanguage(language === "en" ? "ar" : "en"); onNavigate?.(); }}>
          <Globe className="h-4 w-4 me-2" />
          {t("العربية", "English")}
        </Button>
        <Button variant="ghost" size="sm"
          className="w-full justify-start text-sidebar-foreground/70 hover:text-destructive hover:bg-destructive/10"
          onClick={() => { signOut(); onNavigate?.(); }}>
          <LogOut className="h-4 w-4 me-2" />
          {t("Sign Out", "تسجيل الخروج")}
        </Button>
      </div>
    </div>
  );

  // ── Normal dashboard layout ───────────────────────────────────
  return (
    <div className="flex h-screen overflow-hidden">

      {/* Desktop sidebar */}
      <aside className="hidden w-64 flex-col bg-sidebar md:flex flex-shrink-0">
        <SidebarContent />
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Mobile top bar */}
        <div className="flex h-14 items-center border-b px-4 md:hidden flex-shrink-0">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side={dir === "rtl" ? "right" : "left"}
              className="w-72 p-0 bg-sidebar border-sidebar-border">
              <SidebarContent onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>

          <div className="flex-1 flex items-center justify-center">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              <span className="font-bold font-arabic text-sm">{t("Tahleem", "تعليم")}</span>
            </div>
          </div>

          {/* Enrollment & Payment shortcut in mobile header */}
          {role === "student" && (
            <Link to="/student/enrollment-payment">
              <Button variant="ghost" size="icon" title={t("Enrollment & Payment", "التسجيل والدفع")}>
                <Wallet className="h-5 w-5 text-yellow-500" />
              </Button>
            </Link>
          )}
        </div>

        <HolidayBanner />
        {role === "student" && <PaymentBanner />}
        {role === "admin"   && <AdminPaymentIndicator />}

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
