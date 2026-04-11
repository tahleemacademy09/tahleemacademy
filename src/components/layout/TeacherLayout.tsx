// src/components/layout/TeacherLayout.tsx
// Fixed: sidebar is a slide-in drawer on mobile, auto-closes on any link click
// Uses pure inline styles — no Tailwind classes that may fail in WebView

import { useState, useEffect, useRef } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  BookOpen, LayoutDashboard, Users, LogOut, Globe, Menu, X,
  Video, Mic, Settings, ClipboardList, GraduationCap,
  UserCheck, Calendar, Megaphone, FileText, BarChart, Trophy,
  MessageSquare, Clock, CheckSquare, Star, Pencil, Radio,
} from "lucide-react";

const G    = "#064E3B";
const GOLD = "#C9A84C";

const TeacherLayout = () => {
  const { t, language, setLanguage, dir } = useLanguage();
  const { signOut, profile, user } = useAuth();
  const location = useLocation();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // ── Detect mobile ────────────────────────────────────────────
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // ── Auto-close sidebar on any route change ───────────────────
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // ── Lock body scroll when drawer open ───────────────────────
  useEffect(() => {
    document.body.style.overflow = (isMobile && sidebarOpen) ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [sidebarOpen, isMobile]);

  // ── Load pending exam count ──────────────────────────────────
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: subs } = await supabase.from("subjects").select("id").eq("teacher_id", user.id);
      const subIds = (subs || []).map(s => s.id);
      if (!subIds.length) return;
      const { data: courses } = await supabase.from("courses").select("id").in("subject_id", subIds);
      const cIds = (courses || []).map(c => c.id);
      if (!cIds.length) return;
      const { data: exams } = await supabase.from("exams").select("id").in("course_id", cIds);
      const eIds = (exams || []).map(e => e.id);
      if (!eIds.length) return;
      const { count } = await supabase.from("exam_attempts")
        .select("id", { count: "exact", head: true })
        .in("exam_id", eIds).eq("status", "submitted");
      setPendingCount(count || 0);
    })();
  }, [user]);

  const sections = [
    {
      title: t("MAIN", "الرئيسية"),
      links: [
        { to: "/teacher",                  icon: LayoutDashboard, label: t("Dashboard",        "لوحة التحكم"),      exact: true },
        { to: "/teacher/students",         icon: Users,           label: t("My Students",      "طلابي") },
        { to: "/teacher/private-students", icon: UserCheck,       label: t("Private Students", "الطلاب الخاصون") },
        { to: "/teacher/subjects",         icon: BookOpen,        label: t("My Subjects",      "موادي") },
      ],
    },
    {
      title: t("TEACHING", "التدريس"),
      links: [
        { to: "/teacher/classes",          icon: Video,     label: t("Live Classes",      "الفصول المباشرة") },
        { to: "/teacher/timetable",        icon: Clock,     label: t("Timetable",         "الجدول الدراسي") },
        { to: "/teacher/recordings",       icon: Mic,       label: t("Recordings",        "التسجيلات") },
        { to: "/teacher/recitation",       icon: Star,      label: t("Recitation Studio", "استوديو التلاوة") },
        { to: "/teacher/hifdh",            icon: BookOpen,  label: t("Hifdh Review",      "مراجعة الحفظ") },
        { to: "/teacher/private-sessions", icon: Calendar,  label: t("Private Sessions",  "الجلسات الخاصة") },
        { to: "/teacher/public-classes",   icon: Radio,     label: t("Public Classes",    "الدروس العامة") },
      ],
    },
    {
      title: t("ASSESSMENTS", "التقييمات"),
      links: [
        { to: "/teacher/exams",       icon: ClipboardList, label: t("Exams",       "الامتحانات") },
        { to: "/teacher/tests",       icon: FileText,      label: t("Tests",       "التمرينات") },
        { to: "/teacher/grading",     icon: CheckSquare,   label: t("Grading",     "التصحيح"),      badge: pendingCount || undefined },
        { to: "/teacher/results",     icon: BarChart,      label: t("Results",     "النتائج") },
        { to: "/teacher/transcripts", icon: GraduationCap, label: t("Transcripts", "كشف النتائج") },
      ],
    },
    {
      title: t("TOOLS", "الأدوات"),
      links: [
        { to: "/live-quiz",              icon: Trophy,       label: t("Al-Musabaqah 🏆", "المسابقة 🏆") },
        { to: "/teacher/majlis",         icon: MessageSquare,label: t("Al-Majlis",       "المجلس") },
        { to: "/teacher/attendance",     icon: Calendar,     label: t("Attendance",      "الحضور") },
        { to: "/teacher/announcements",  icon: Megaphone,    label: t("Announcements",   "الإعلانات") },
        { to: "/teacher/settings",       icon: Settings,     label: t("Settings",        "الإعدادات") },
      ],
    },
  ];

  const isActive = (to: string, exact?: boolean) =>
    exact ? location.pathname === to : location.pathname === to || location.pathname.startsWith(to + "/");

  // ── Sidebar content (shared between desktop & drawer) ────────
  const SidebarContent = () => (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: G }}>

      {/* Logo + close btn */}
      <div style={{
        padding: "18px 14px 14px",
        borderBottom: "1px solid rgba(255,255,255,.1)",
        display: "flex", alignItems: "center", gap: 10,
        flexShrink: 0,
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9, background: GOLD,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <Pencil size={16} color={G} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: "#fff", fontFamily: "serif" }}>
            {t("Tahleem", "تعليم")}
          </div>
          <div style={{ fontSize: 9, color: GOLD, fontWeight: 800, letterSpacing: "0.08em" }}>
            {t("TEACHER PORTAL", "بوابة المعلم")}
          </div>
        </div>
        {/* X button — only shown on mobile */}
        {isMobile && (
          <button
            onClick={() => setSidebarOpen(false)}
            style={{
              width: 30, height: 30, borderRadius: 8,
              background: "rgba(255,255,255,.12)", border: "none",
              cursor: "pointer", display: "flex", alignItems: "center",
              justifyContent: "center", flexShrink: 0,
            }}
          >
            <X size={16} color="rgba(255,255,255,.85)" />
          </button>
        )}
      </div>

      {/* Profile */}
      {profile?.full_name && (
        <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,.08)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{
              width: 30, height: 30, borderRadius: "50%", background: GOLD,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 900, color: G, flexShrink: 0,
            }}>
              {(profile.full_name || "T")[0].toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {profile.full_name}
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,.45)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {(profile as any).email || ""}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: "auto", padding: "6px 8px" }}>
        {sections.map((section, si) => (
          <div key={si} style={{ marginBottom: 2 }}>
            <div style={{
              fontSize: 9, fontWeight: 800, color: "rgba(255,255,255,.3)",
              padding: "9px 8px 3px", letterSpacing: "0.09em",
            }}>
              {section.title}
            </div>
            {section.links.map(link => {
              const active = isActive(link.to, link.exact);
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  style={{
                    display: "flex", alignItems: "center", gap: 9,
                    padding: "9px 10px", borderRadius: 9, marginBottom: 1,
                    textDecoration: "none",
                    background: active ? "rgba(201,168,76,.16)" : "transparent",
                    borderLeft: `3px solid ${active ? GOLD : "transparent"}`,
                  }}
                >
                  <link.icon size={14} color={active ? GOLD : "rgba(255,255,255,.58)"} style={{ flexShrink: 0 }} />
                  <span style={{
                    fontSize: 13, fontWeight: active ? 700 : 400,
                    color: active ? GOLD : "rgba(255,255,255,.72)",
                    flex: 1,
                  }}>
                    {link.label}
                  </span>
                  {(link as any).badge && (
                    <span style={{
                      background: "#EF4444", color: "#fff", borderRadius: 20,
                      fontSize: 9, fontWeight: 900, padding: "1px 6px", flexShrink: 0,
                    }}>
                      {(link as any).badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div style={{ padding: "8px", borderTop: "1px solid rgba(255,255,255,.08)", flexShrink: 0 }}>
        <button
          onClick={() => setLanguage(language === "en" ? "ar" : "en")}
          style={{
            width: "100%", padding: "8px 10px", borderRadius: 9,
            background: "rgba(255,255,255,.07)", border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 7,
            color: "rgba(255,255,255,.58)", fontSize: 12, marginBottom: 5,
          }}
        >
          <Globe size={13} />
          {t("العربية", "English")}
        </button>
        <button
          onClick={() => signOut()}
          style={{
            width: "100%", padding: "8px 10px", borderRadius: 9,
            background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.2)",
            cursor: "pointer", display: "flex", alignItems: "center", gap: 7,
            color: "#FCA5A5", fontSize: 12,
          }}
        >
          <LogOut size={13} />
          {t("Sign Out", "تسجيل الخروج")}
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#F3F4F6" }}>

      {/* ── Desktop sidebar ─────────────────────────────────────── */}
      {!isMobile && (
        <aside style={{ width: 240, flexShrink: 0, height: "100vh", position: "sticky", top: 0 }}>
          <SidebarContent />
        </aside>
      )}

      {/* ── Mobile: dim overlay (closes on tap) ─────────────────── */}
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 40,
            background: "rgba(0,0,0,.52)",
          }}
        />
      )}

      {/* ── Mobile: slide-in drawer ──────────────────────────────── */}
      {isMobile && (
        <aside style={{
          position: "fixed",
          top: 0, bottom: 0,
          [dir === "rtl" ? "right" : "left"]: 0,
          width: 255, zIndex: 50,
          transform: sidebarOpen
            ? "translateX(0)"
            : dir === "rtl" ? "translateX(260px)" : "translateX(-260px)",
          transition: "transform .26s ease",
          boxShadow: sidebarOpen ? "6px 0 30px rgba(0,0,0,.28)" : "none",
        }}>
          <SidebarContent />
        </aside>
      )}

      {/* ── Right side: topbar + page content ───────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: "100vh" }}>

        {/* Mobile top bar */}
        {isMobile && (
          <div style={{
            height: 54, flexShrink: 0,
            display: "flex", alignItems: "center",
            padding: "0 14px", gap: 10,
            background: "#fff",
            borderBottom: `3px solid ${G}`,
            position: "sticky", top: 0, zIndex: 30,
          }}>
            {/* Hamburger */}
            <button
              onClick={() => setSidebarOpen(v => !v)}
              style={{
                width: 36, height: 36, borderRadius: 9,
                border: "none", cursor: "pointer",
                background: sidebarOpen ? `${G}18` : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <Menu size={20} color={G} />
            </button>

            {/* Title */}
            <div style={{ display: "flex", alignItems: "center", gap: 7, flex: 1 }}>
              <div style={{ width: 26, height: 26, borderRadius: 7, background: GOLD, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Pencil size={13} color={G} />
              </div>
              <span style={{ fontWeight: 900, fontSize: 14, color: G, fontFamily: "serif" }}>
                {t("Tahleem", "تعليم")}{" "}
                <span style={{ color: GOLD, fontSize: 11, fontFamily: "system-ui" }}>
                  {t("Teacher", "المعلم")}
                </span>
              </span>
            </div>

            {/* Pending badge */}
            {pendingCount > 0 && (
              <Link to="/teacher/grading" style={{ textDecoration: "none" }}>
                <div style={{
                  background: "#EF4444", color: "#fff", borderRadius: 20,
                  fontSize: 10, fontWeight: 900, padding: "3px 9px",
                  display: "flex", alignItems: "center", gap: 4,
                }}>
                  <CheckSquare size={10} />
                  {pendingCount}
                </div>
              </Link>
            )}
          </div>
        )}

        {/* Page */}
        <main style={{ flex: 1, overflow: "auto" }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default TeacherLayout;
