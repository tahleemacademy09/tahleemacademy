import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  BookOpen, LayoutDashboard, Users, LogOut, Globe, Menu,
  Video, Mic, Settings, ClipboardList, GraduationCap,
  UserCheck, Calendar, Megaphone, FileText, BarChart, Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

const TeacherLayout = () => {
  const { t, language, setLanguage, dir } = useLanguage();
  const { signOut, profile } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const sections = [
    {
      title: t("Main", "الرئيسية"),
      links: [
        { to: "/teacher/dashboard", icon: LayoutDashboard, label: t("Dashboard", "لوحة التحكم") },
        { to: "/teacher/students", icon: Users, label: t("My Students", "طلابي") },
        { to: "/teacher/private-students", icon: UserCheck, label: t("Private Students", "الطلاب الخاصون") },
        { to: "/teacher/subjects", icon: BookOpen, label: t("My Subjects", "موادي") },
      ],
    },
    {
      title: t("Teaching", "التدريس"),
      links: [
        { to: "/teacher/classes", icon: Video, label: t("Live Classes", "الفصول المباشرة") },
        { to: "/teacher/recordings", icon: Mic, label: t("Recordings", "التسجيلات") },
        { to: "/teacher/recitation", icon: BookOpen, label: t("Recitation Sessions", "جلسات التلاوة") },
        { to: "/teacher/private-sessions", icon: Calendar, label: t("Private Sessions", "الجلسات الخاصة") },
        { to: "/teacher/public-classes", icon: Globe, label: t("Public Classes", "الدروس العامة") },
      ],
    },
    {
      title: t("Assessments", "التقييمات"),
      links: [
        { to: "/teacher/exams", icon: ClipboardList, label: t("Exams", "الامتحانات") },
        { to: "/teacher/tests", icon: FileText, label: t("Tests", "التمرينات") },
        { to: "/teacher/results", icon: BarChart, label: t("Results", "النتائج") },
        { to: "/teacher/transcript", icon: GraduationCap, label: t("Transcript", "كشف النتائج") },
      ],
    },
    {
      title: t("Tools", "الأدوات"),
      links: [
        { to: "/live-quiz",              icon: Trophy,    label: t("Al-Musabaqah 🏆", "المسابقة الحية 🏆") },
        { to: "/teacher/attendance",     icon: Calendar,  label: t("Attendance", "الحضور") },
        { to: "/teacher/announcements",  icon: Megaphone, label: t("Announcements", "الإعلانات") },
        { to: "/teacher/settings",       icon: Settings,  label: t("Settings", "الإعدادات") },
      ],
    },
  ];

  const SidebarContent = ({ onNavigate }: { onNavigate?: () => void }) => (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2.5 border-b border-sidebar-border px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary">
          <BookOpen className="h-4 w-4 text-sidebar-primary-foreground" />
        </div>
        <span className="font-bold text-sidebar-foreground font-arabic text-lg">
          {t("Tahleem", "تعليم")}
          <span className="text-sidebar-primary ms-1 text-sm">{t("Teacher", "المعلم")}</span>
        </span>
      </div>

      <nav className="flex-1 space-y-1 p-3 overflow-auto">
        {sections.map((section, idx) => (
          <div key={idx}>
            {idx > 0 && <Separator className="my-2 bg-sidebar-border" />}
            <p className="px-3 py-1 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">
              {section.title}
            </p>
            {section.links.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  location.pathname === link.to
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                )}
              >
                <link.icon className="h-4 w-4 shrink-0" />
                <span>{link.label}</span>
              </Link>
            ))}
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-3 space-y-1">
        {profile?.full_name && (
          <div className="px-3 py-2 mb-1">
            <p className="text-xs text-sidebar-foreground/50 truncate">{profile.full_name}</p>
            <p className="text-xs text-sidebar-foreground/40 truncate">{profile.email}</p>
          </div>
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

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 flex-col bg-sidebar md:flex">
        <SidebarContent />
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex h-14 items-center border-b px-4 md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon"><Menu className="h-5 w-5" /></Button>
            </SheetTrigger>
            <SheetContent side={dir === "rtl" ? "right" : "left"} className="w-72 p-0 bg-sidebar border-sidebar-border">
              <SidebarContent onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <div className="flex-1 flex items-center justify-center">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              <span className="font-bold font-arabic text-sm">{t("Tahleem Teacher", "تعليم المعلم")}</span>
            </div>
          </div>
          <div className="w-10" />
        </div>
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default TeacherLayout;
