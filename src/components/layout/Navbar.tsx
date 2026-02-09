import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { Menu, X, Globe, LogOut, BookOpen } from "lucide-react";

const Navbar = () => {
  const [open, setOpen] = useState(false);
  const { t, language, setLanguage } = useLanguage();
  const { user, signOut, hasRole } = useAuth();
  const navigate = useNavigate();

  const getDashboardPath = () => {
    if (hasRole("admin") || hasRole("teacher")) return "/admin";
    return "/student";
  };

  const navLinks = [
    { to: "/", label: t("Home", "الرئيسية") },
    { to: "/courses", label: t("Courses", "الدورات") },
    { to: "/about", label: t("About", "عن الأكاديمية") },
    { to: "/contact", label: t("Contact", "اتصل بنا") },
  ];

  return (
    <nav className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2">
          <BookOpen className="h-7 w-7 text-primary" />
          <span className="text-xl font-bold text-primary font-arabic">
            {t("Tahleem Academy", "أكاديمية تعليم")}
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-6 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLanguage(language === "en" ? "ar" : "en")}
            title={t("Switch to Arabic", "التبديل إلى الإنجليزية")}
          >
            <Globe className="h-4 w-4" />
          </Button>
          {user ? (
            <>
              <Button variant="outline" size="sm" onClick={() => navigate(getDashboardPath())}>
                {t("Dashboard", "لوحة التحكم")}
              </Button>
              <Button variant="ghost" size="icon" onClick={signOut}>
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => navigate("/login")}>
                {t("Sign In", "تسجيل الدخول")}
              </Button>
              <Button size="sm" onClick={() => navigate("/register")}>
                {t("Register", "التسجيل")}
              </Button>
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(!open)}>
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="border-t bg-card px-4 py-4 md:hidden">
          <div className="flex flex-col gap-3">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="text-sm font-medium text-muted-foreground"
                onClick={() => setOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <hr className="border-border" />
            <Button
              variant="ghost"
              size="sm"
              className="justify-start"
              onClick={() => { setLanguage(language === "en" ? "ar" : "en"); setOpen(false); }}
            >
              <Globe className="mr-2 h-4 w-4" />
              {t("العربية", "English")}
            </Button>
            {user ? (
              <>
                <Button variant="outline" size="sm" onClick={() => { navigate(getDashboardPath()); setOpen(false); }}>
                  {t("Dashboard", "لوحة التحكم")}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { signOut(); setOpen(false); }}>
                  <LogOut className="mr-2 h-4 w-4" />
                  {t("Sign Out", "تسجيل الخروج")}
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => { navigate("/login"); setOpen(false); }}>
                  {t("Sign In", "تسجيل الدخول")}
                </Button>
                <Button size="sm" onClick={() => { navigate("/register"); setOpen(false); }}>
                  {t("Register", "التسجيل")}
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
