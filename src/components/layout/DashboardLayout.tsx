import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  BookOpen, LayoutDashboard, ClipboardList, Users, LogOut, Globe,
  CheckSquare, BarChart, UserCircle, Library, GraduationCap, MessageCircle,
  Menu, Video, Mic, Settings, Shield, Layers, FileText, UserCheck, BookMarked,
  CreditCard, Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import PaymentBanner from "./PaymentBanner";
import HolidayBanner from "./HolidayBanner";
import AdminPaymentIndicator from "./AdminPaymentIndicator";

interface DashboardLayoutProps {
  role: "student" | "admin";
}

const DashboardLayout = ({ role }: DashboardLayoutProps) => {
  const { t, language, setLanguage, dir } = useLanguage();
  const { signOut, profile } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const studentLinks = [
    { to: "/student", icon: LayoutDashboard, label: t("Dashboard", "لوحة التحكم") },
    { to: "/student/courses", icon: BookOpen, label: t("Courses", "الدورات") },
    { to: "/student/live-classes", icon: Video, label: t("Live Classes", "الفصول الحية") },
    { to: "/student/revision", icon: BookMarked, label: t("Revision", "المراجعة") },
    { to: "/student/exams", icon: ClipboardList, label: t("Exams", "الامتحانات") },
    { to: "/student/transcripts", icon: GraduationCap, label: t("Transcripts", "السجل الأكاديمي") },
    { to: "/student/majlis", icon: MessageCircle, label: t("Al-Majlis", "المجلس") },
    { to: "/student/profile", icon: UserCircle, label: t("Settings", "الإعدادات") },
  ];

  const adminLinks = [
    { to: "/admin", icon: LayoutDashboard, label: t("Dashboard", "لوحة التحكم") },
    { to: "/admin/subjects", icon: BookOpen, label: t("Subjects", "المواد") },
    { to: "/admin/courses", icon: Layers, label: t("Courses", "الدورات") },
    { to: "/admin/syllabus", icon: FileText, label: t("Syllabus & Materials", "المنهج والمواد") },
    { to: "/admin/live-classes", icon: Video, label: t("Live Classes", "الفصول الحية") },
    { to: "/admin/exams", icon: ClipboardList, label: t("Exams", "الامتحانات") },
    { to: "/admin/question-bank", icon: Library, label: t("Question Bank", "بنك الأسئلة") },
    { to: "/admin/students", icon: Users, label: t("Students", "الطلاب") },
    { to: "/admin/grading", icon: CheckSquare, label: t("Grading", "التصحيح") },
    { to: "/admin/private-sessions", icon: UserCheck, label: t("Private Sessions", "الجلسات الخاصة") },
    { to: "/admin/proctoring", icon: BarChart, label: t("Proctoring", "المراقبة") },
    { to: "/admin/entrance-exam", icon: GraduationCap, label: t("Entrance Exam", "اختبار القبول") },
    { to: "/admin/payments", icon: CreditCard, label: t("Payments", "المدفوعات") },
    { to: "/admin/calendar", icon: Calendar, label: t("Calendar", "التقويم") },
  ];

  const links = role === "admin" ? adminLinks : studentLinks;

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
      <nav className="flex-1 space-y-1 p-3 overflow-auto">
        {links.map((link) => (
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
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-3 space-y-1">
        {/* Profile info */}
        {profile?.full_name && (
          <div className="px-3 py-2 mb-1">
            <p className="text-xs text-sidebar-foreground/50 truncate">{profile.full_name}</p>
            <p className="text-xs text-sidebar-foreground/40 truncate">{profile.email}</p>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
          onClick={() => { setLanguage(language === "en" ? "ar" : "en"); onNavigate?.(); }}
        >
          <Globe className="h-4 w-4 me-2" />
          {t("العربية", "English")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-sidebar-foreground/70 hover:text-destructive hover:bg-destructive/10"
          onClick={() => { signOut(); onNavigate?.(); }}
        >
          <LogOut className="h-4 w-4 me-2" />
          {t("Sign Out", "تسجيل الخروج")}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 flex-col bg-sidebar md:flex">
        <SidebarContent />
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header with hamburger */}
        <div className="flex h-14 items-center border-b px-4 md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className={cn(dir === "rtl" ? "order-first" : "order-first")}>
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side={dir === "rtl" ? "right" : "left"}
              className="w-72 p-0 bg-sidebar border-sidebar-border"
            >
              <SidebarContent onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <div className="flex-1 flex items-center justify-center">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              <span className="font-bold font-arabic text-sm">{t("Tahleem", "تعليم")}</span>
            </div>
          </div>
          <div className="w-10" /> {/* Spacer for centering */}
        </div>

        <HolidayBanner />
        {role === "student" && <PaymentBanner />}
        {role === "admin" && <AdminPaymentIndicator />}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
