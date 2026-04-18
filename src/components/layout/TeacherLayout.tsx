// src/components/layout/TeacherLayout.tsx
// Redesigned: 8-item sidebar (was 20+). Consolidated nav groups.

import { useState, useEffect } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard, Users, BookOpen, Video, ClipboardList,
  LogOut, Globe, Menu, X, Pencil, Settings, Trophy, MessageSquare,
  CheckSquare,
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

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = (isMobile && sidebarOpen) ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [sidebarOpen, isMobile]);

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
        { to: "/teacher", icon: LayoutDashboard, label: t("Dashboard", "لوحة التحكم"), exact: true },
      ],
    },
    {
      title: t("STUDENTS", "الطلاب"),
      links: [
        { to: "/teacher/students", icon: Users, label: t("Students", "الطلاب") },
      ],
    },
    {
      title: t("TEACHING", "التدريس"),
      links: [
        { to: "/teacher/classes", icon: Video, label: t("My Teaching", "تدريسي") },
      ],
    },
    {
      title: t("ASSESSMENTS", "التقييمات"),
      links: [
        {
          to: "/teacher/exams", icon: ClipboardList,
          label: t("Examinations", "الامتحانات"),
          badge: pendingCount || undefined,
        },
      ],
    },
    {
      title: t("TOOLS", "الأدوات"),
      links: [
        { to: "/live-quiz",       icon: Trophy,        label: t("Al-Musabaqah 🏆", "المسابقة 🏆") },
        { to: "/teacher/majlis",  icon: MessageSquare, label: t("Al-Majlis",        "المجلس") },
        { to: "/teacher/settings",icon: Settings,      label: t("Settings",         "الإعدادات") },
      ],
    },
  ];

  const isActive = (to: string, exact?: boolean) =>
    exact ? location.pathname === to : location.pathname === to || location.pathname.startsWith(to + "/");

  const SidebarContent = () => (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: G }}>
      {/* Header */}
      <div style={{ padding: "18px 14px 14px", borderBottom: "1px solid rgba(255,255,255,.1)", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: GOLD, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Pencil size={17} color={G} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: "#fff", fontFamily: "serif" }}>{t("Tahleem", "تعليم")}</div>
          <div style={{ fontSize: 9, color: GOLD, fontWeight: 800, letterSpacing: "0.09em" }}>{t("TEACHER PORTAL", "بوابة المعلم")}</div>
        </div>
        {isMobile && (
          <button onClick={() => setSidebarOpen(false)} style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(255,255,255,.12)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <X size={16} color="rgba(255,255,255,.85)" />
          </button>
        )}
      </div>

      {/* Profile */}
      {profile?.full_name && (
        <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,.08)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: "50%", background: GOLD, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 900, color: G, flexShrink: 0 }}>
              {(profile.full_name || "T")[0].toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profile.full_name}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,.45)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(profile as any).email || ""}</div>
            </div>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: "auto", padding: "8px 8px 4px" }}>
        {sections.map((sec, si) => (
          <div key={si} style={{ marginBottom: 4 }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: "rgba(255,255,255,.28)", padding: "10px 8px 3px", letterSpacing: "0.1em" }}>
              {sec.title}
            </div>
            {sec.links.map(link => {
              const active = isActive(link.to, (link as any).exact);
              return (
                <Link key={link.to} to={link.to} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 11px", borderRadius: 10, marginBottom: 2, textDecoration: "none", background: active ? "rgba(201,168,76,.18)" : "transparent", borderLeft: `3px solid ${active ? GOLD : "transparent"}` }}>
                  <link.icon size={15} color={active ? GOLD : "rgba(255,255,255,.6)"} style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: active ? 700 : 400, color: active ? GOLD : "rgba(255,255,255,.75)", flex: 1 }}>
                    {link.label}
                  </span>
                  {(link as any).badge && (
                    <span style={{ background: "#EF4444", color: "#fff", borderRadius: 20, fontSize: 9, fontWeight: 900, padding: "2px 7px", flexShrink: 0 }}>
                      {(link as any).badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div style={{ padding: "8px", borderTop: "1px solid rgba(255,255,255,.08)", flexShrink: 0 }}>
        <button onClick={() => setLanguage(language === "en" ? "ar" : "en")}
          style={{ width: "100%", padding: "8px 11px", borderRadius: 9, background: "rgba(255,255,255,.07)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, color: "rgba(255,255,255,.6)", fontSize: 12, marginBottom: 6 }}>
          <Globe size={13} />{t("العربية", "English")}
        </button>
        <button onClick={() => signOut()}
          style={{ width: "100%", padding: "8px 11px", borderRadius: 9, background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.2)", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, color: "#FCA5A5", fontSize: 12 }}>
          <LogOut size={13} />{t("Sign Out", "تسجيل الخروج")}
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#F0F2F5" }}>
      {!isMobile && (
        <aside style={{ width: 240, flexShrink: 0, height: "100vh", position: "sticky", top: 0 }}>
          <SidebarContent />
        </aside>
      )}
      {isMobile && sidebarOpen && <div onClick={() => setSidebarOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(0,0,0,.52)" }} />}
      {isMobile && (
        <aside style={{ position: "fixed", top: 0, bottom: 0, [dir === "rtl" ? "right" : "left"]: 0, width: 255, zIndex: 50, transform: sidebarOpen ? "translateX(0)" : dir === "rtl" ? "translateX(260px)" : "translateX(-260px)", transition: "transform .26s ease", boxShadow: sidebarOpen ? "6px 0 30px rgba(0,0,0,.28)" : "none" }}>
          <SidebarContent />
        </aside>
      )}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: "100vh" }}>
        {isMobile && (
          <div style={{ height: 54, flexShrink: 0, display: "flex", alignItems: "center", padding: "0 14px", gap: 10, background: "#fff", borderBottom: `3px solid ${G}`, position: "sticky", top: 0, zIndex: 30 }}>
            <button onClick={() => setSidebarOpen(v => !v)} style={{ width: 36, height: 36, borderRadius: 9, border: "none", cursor: "pointer", background: sidebarOpen ? `${G}18` : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Menu size={20} color={G} />
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: GOLD, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Pencil size={14} color={G} />
              </div>
              <span style={{ fontWeight: 900, fontSize: 15, color: G, fontFamily: "serif" }}>
                {t("Tahleem", "تعليم")}{" "}
                <span style={{ color: GOLD, fontSize: 11, fontFamily: "system-ui" }}>{t("Teacher", "المعلم")}</span>
              </span>
            </div>
            {pendingCount > 0 && (
              <Link to="/teacher/exams" style={{ textDecoration: "none" }}>
                <div style={{ background: "#EF4444", color: "#fff", borderRadius: 20, fontSize: 10, fontWeight: 900, padding: "3px 9px", display: "flex", alignItems: "center", gap: 4 }}>
                  <CheckSquare size={10} />{pendingCount}
                </div>
              </Link>
            )}
          </div>
        )}
        <main style={{ flex: 1, overflow: "auto" }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default TeacherLayout;
