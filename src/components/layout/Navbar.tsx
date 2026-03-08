import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { Menu, X, Globe, LogOut, BookOpen, Shield } from "lucide-react";

const Navbar = () => {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { t, language, setLanguage } = useLanguage();
  const { user, signOut, hasRole } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const getDashboardPath = () => {
    if (hasRole("admin") || hasRole("teacher")) return "/admin";
    return "/student";
  };

  const isAdmin = hasRole("admin") || hasRole("teacher");

  const navLinks = [
    { to: "/", label: t("Home", "الرئيسية") },
    { to: "/courses", label: t("Courses", "الدورات") },
    { to: "/about", label: t("About", "عن الأكاديمية") },
    { to: "/contact", label: t("Contact", "اتصل بنا") },
  ];

  return (
    <nav className={`sticky top-0 z-50 transition-all duration-300 ${scrolled ? "border-b border-border bg-card/95 backdrop-blur-xl shadow-premium" : "bg-transparent"}`}>
      <div className="container mx-auto flex h-18 items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <BookOpen className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold font-display text-foreground">
            {t("Tahleem", "تعليم")}
            <span className="text-gold"> {t("Academy", "أكاديمية")}</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="relative text-sm font-medium text-muted-foreground transition-colors duration-300 hover:text-foreground after:absolute after:bottom-[-4px] after:left-0 after:h-[2px] after:w-0 after:bg-gold after:transition-all after:duration-300 hover:after:w-full"
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
            className="text-muted-foreground hover:text-foreground"
          >
            <Globe className="h-4 w-4" />
          </Button>
          {user ? (
            <>
              {/* Admin portal link - only visible to admin/teacher */}
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-muted-foreground hover:text-foreground"
                  onClick={() => navigate("/admin")}
                >
                  <Shield className="h-4 w-4" />
                  {t("Admin", "المدير")}
                </Button>
              )}
              <Button variant="outline" size="sm" className="rounded-lg" onClick={() => navigate(getDashboardPath())}>
                {t("Dashboard", "لوحة التحكم")}
              </Button>
              <Button variant="ghost" size="icon" onClick={signOut} className="text-muted-foreground hover:text-foreground">
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" onClick={() => navigate("/login")}>
                {t("Sign In", "تسجيل الدخول")}
              </Button>
              <Button size="sm" className="bg-gold text-gold-foreground hover:bg-gold/90 rounded-lg font-semibold shadow-gold" onClick={() => navigate("/register")}>
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
        <div className="border-t border-border bg-card px-4 py-5 md:hidden animate-fade-in">
          <div className="flex flex-col gap-3">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                onClick={() => setOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <div className="gold-divider my-2" />
            <Button
              variant="ghost"
              size="sm"
              className="justify-start"
              onClick={() => { setLanguage(language === "en" ? "ar" : "en"); setOpen(false); }}
            >
              <Globe className="mr-2 h-4 w-4" />
              {t("العربية", "English")}
            </Button>
            {/* Admin link - only for logged-in admins/teachers */}
            {user && isAdmin && (
              <Link
                to="/admin"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-primary"
                onClick={() => setOpen(false)}
              >
                <Shield className="h-4 w-4" />
                {t("Admin Portal", "بوابة المدير")}
              </Link>
            )}
            {user ? (
              <>
                <Button variant="outline" size="sm" className="rounded-lg" onClick={() => { navigate(getDashboardPath()); setOpen(false); }}>
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
                <Button size="sm" className="bg-gold text-gold-foreground hover:bg-gold/90 rounded-lg font-semibold" onClick={() => { navigate("/register"); setOpen(false); }}>
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
