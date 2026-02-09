import { Link, Outlet, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { BookOpen, LayoutDashboard, ClipboardList, Users, Settings, LogOut, Globe, CheckSquare, BarChart } from "lucide-react";
import { cn } from "@/lib/utils";

interface DashboardLayoutProps {
  role: "student" | "admin";
}

const DashboardLayout = ({ role }: DashboardLayoutProps) => {
  const { t, language, setLanguage } = useLanguage();
  const { signOut, profile } = useAuth();
  const location = useLocation();

  const studentLinks = [
    { to: "/student", icon: LayoutDashboard, label: t("Dashboard", "لوحة التحكم") },
    { to: "/student/exams", icon: ClipboardList, label: t("Exams", "الامتحانات") },
  ];

  const adminLinks = [
    { to: "/admin", icon: LayoutDashboard, label: t("Dashboard", "لوحة التحكم") },
    { to: "/admin/exams", icon: ClipboardList, label: t("Exams", "الامتحانات") },
    { to: "/admin/students", icon: Users, label: t("Students", "الطلاب") },
    { to: "/admin/grading", icon: CheckSquare, label: t("Grading", "التصحيح") },
  ];

  const links = role === "admin" ? adminLinks : studentLinks;

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="hidden w-64 flex-col border-r bg-sidebar md:flex">
        <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-4">
          <BookOpen className="h-6 w-6 text-sidebar-primary" />
          <span className="font-bold text-sidebar-foreground font-arabic">
            {t("Tahleem", "تعليم")}
          </span>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                location.pathname === link.to
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
              )}
            >
              <link.icon className="h-4 w-4" />
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-sidebar-border p-3 space-y-1">
          <Button variant="ghost" size="sm" className="w-full justify-start text-sidebar-foreground/70" onClick={() => setLanguage(language === "en" ? "ar" : "en")}>
            <Globe className="mr-2 h-4 w-4" />
            {t("العربية", "English")}
          </Button>
          <Button variant="ghost" size="sm" className="w-full justify-start text-sidebar-foreground/70" onClick={signOut}>
            <LogOut className="mr-2 h-4 w-4" />
            {t("Sign Out", "تسجيل الخروج")}
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1">
        {/* Mobile header */}
        <div className="flex h-16 items-center justify-between border-b px-4 md:hidden">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <span className="font-bold font-arabic">{t("Tahleem", "تعليم")}</span>
          </div>
          <div className="flex gap-2">
            {links.map((link) => (
              <Link key={link.to} to={link.to}>
                <Button variant={location.pathname === link.to ? "default" : "ghost"} size="icon">
                  <link.icon className="h-4 w-4" />
                </Button>
              </Link>
            ))}
            <Button variant="ghost" size="icon" onClick={signOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <Outlet />
      </div>
    </div>
  );
};

export default DashboardLayout;
