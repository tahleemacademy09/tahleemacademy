import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Menu, LogOut, Globe, BookOpen, LayoutDashboard, Home } from "lucide-react";

/**
 * Minimal hamburger nav for standalone pages (onboarding, entrance exam, payment).
 * Renders a fixed top-bar with logo + hamburger that slides out basic links.
 */
const StandaloneNav = () => {
  const [open, setOpen] = useState(false);
  const { t, language, setLanguage, dir } = useLanguage();
  const { user, signOut, hasRole } = useAuth();
  const navigate = useNavigate();

  const getDashboardPath = () => {
    if (hasRole("admin") || hasRole("teacher")) return "/admin";
    return "/student";
  };

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3"
      style={{
        background: "rgba(15,49,34,0.92)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(201,151,58,0.3)",
      }}
    >
      {/* Logo */}
      <Link to="/" className="flex items-center gap-2">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ background: "#c9973a" }}
        >
          <BookOpen className="h-4 w-4 text-white" />
        </div>
        <span
          className="text-lg font-bold text-white"
          style={{ fontFamily: "'Cormorant Garamond', serif" }}
        >
          Tahleem <span style={{ color: "#c9973a" }}>Academy</span>
        </span>
      </Link>

      {/* Hamburger */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="text-[#c9973a] hover:text-white hover:bg-white/10"
          >
            <Menu className="h-6 w-6" />
          </Button>
        </SheetTrigger>
        <SheetContent
          side={dir === "rtl" ? "left" : "right"}
          className="w-72 border-border"
          style={{
            background: "linear-gradient(180deg, #0f3122 0%, #1a4a35 100%)",
            borderColor: "rgba(201,151,58,0.3)",
          }}
        >
          <div className="flex flex-col gap-2 mt-8">
            <Link
              to="/"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              <Home className="h-4 w-4" style={{ color: "#c9973a" }} />
              {t("Home", "الرئيسية")}
            </Link>

            {user && (
              <Link
                to={getDashboardPath()}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              >
                <LayoutDashboard className="h-4 w-4" style={{ color: "#c9973a" }} />
                {t("Dashboard", "لوحة التحكم")}
              </Link>
            )}

            <div className="my-2 h-px" style={{ background: "rgba(201,151,58,0.3)" }} />

            <button
              onClick={() => {
                setLanguage(language === "en" ? "ar" : "en");
                setOpen(false);
              }}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white w-full text-left"
            >
              <Globe className="h-4 w-4" style={{ color: "#c9973a" }} />
              {t("العربية", "English")}
            </button>

            {user && (
              <button
                onClick={() => {
                  signOut();
                  setOpen(false);
                }}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-400 transition-colors hover:bg-white/10 w-full text-left"
              >
                <LogOut className="h-4 w-4" />
                {t("Sign Out", "تسجيل الخروج")}
              </button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  );
};

export default StandaloneNav;
