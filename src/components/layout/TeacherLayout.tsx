// src/components/layout/TeacherLayout.tsx
// Professional teacher sidebar layout matching student's green-gold design

import { useState, useEffect } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  BookOpen, LayoutDashboard, Users, LogOut, Globe, Menu,
  Video, Mic, Settings, ClipboardList, GraduationCap,
  UserCheck, Calendar, Megaphone, FileText, BarChart, Trophy,
  MessageSquare, Clock, Bell, CheckSquare, Star, Pencil,
  ChevronDown, ChevronRight, Radio,
} from "lucide-react";

const G    = "#064E3B";
const GM   = "#075E54";
const GOLD = "#C9A84C";

const TeacherLayout = () => {
  const { t, language, setLanguage, dir } = useLanguage();
  const { signOut, profile, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [notifCount, setNotifCount] = useState(0);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Load pending exam counts and notifications
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data: subs } = await supabase.from("subjects").select("id").eq("teacher_id", user.id);
      const subjectIds = (subs || []).map(s => s.id);
      if (subjectIds.length > 0) {
        const { data: courses } = await supabase.from("courses").select("id").in("subject_id", subjectIds);
        const courseIds = (courses || []).map(c => c.id);
        if (courseIds.length > 0) {
          const { data: exams } = await supabase.from("exams").select("id").in("course_id", courseIds);
          const examIds = (exams || []).map(e => e.id);
          if (examIds.length > 0) {
            const { count } = await supabase.from("exam_attempts")
              .select("id", { count: "exact", head: true })
              .in("exam_id", examIds)
              .eq("status", "submitted");
            setPendingCount(count || 0);
          }
        }
      }
      // Notifications
      const { count: nc } = await supabase.from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id).eq("is_read", false);
      setNotifCount(nc || 0);
    };
    load();
  }, [user]);

  const sections = [
    {
      id: "main",
      title: t("Main", "الرئيسية"),
      links: [
        { to: "/teacher", icon: LayoutDashboard, label: t("Dashboard", "لوحة التحكم"), exact: true },
        { to: "/teacher/students", icon: Users, label: t("My Students", "طلابي") },
        { to: "/teacher/private-students", icon: UserCheck, label: t("Private Students", "الطلاب الخاصون") },
        { to: "/teacher/subjects", icon: BookOpen, label: t("My Subjects", "موادي") },
      ],
    },
    {
      id: "teaching",
      title: t("Teaching", "التدريس"),
      links: [
        { to: "/teacher/classes", icon: Video, label: t("Live Classes", "الفصول المباشرة") },
        { to: "/teacher/timetable", icon: Clock, label: t("Timetable", "الجدول الدراسي") },
        { to: "/teacher/recordings", icon: Mic, label: t("Recordings", "التسجيلات") },
        { to: "/teacher/recitation", icon: Star, label: t("Recitation Studio", "استوديو التلاوة") },
        { to: "/teacher/hifdh", icon: BookOpen, label: t("Hifdh Review", "مراجعة الحفظ") },
        { to: "/teacher/private-sessions", icon: Calendar, label: t("Private Sessions", "الجلسات الخاصة") },
        { to: "/teacher/public-classes", icon: Radio, label: t("Public Classes", "الدروس العامة") },
      ],
    },
    {
      id: "assessments",
      title: t("Assessments", "التقييمات"),
      links: [
        { to: "/teacher/exams", icon: ClipboardList, label: t("Exams", "الامتحانات") },
        { to: "/teacher/tests", icon: FileText, label: t("Tests", "التمرينات") },
        {
          to: "/teacher/grading",
          icon: CheckSquare,
          label: t("Grading", "التصحيح"),
          badge: pendingCount > 0 ? pendingCount : undefined,
        },
        { to: "/teacher/results", icon: BarChart, label: t("Results", "النتائج") },
        { to: "/teacher/transcripts", icon: GraduationCap, label: t("Transcripts", "كشف النتائج") },
      ],
    },
    {
      id: "tools",
      title: t("Tools", "الأدوات"),
      links: [
        { to: "/live-quiz", icon: Trophy, label: t("Al-Musabaqah 🏆", "المسابقة الحية 🏆") },
        { to: "/teacher/majlis", icon: MessageSquare, label: t("Al-Majlis", "المجلس") },
        { to: "/teacher/attendance", icon: Calendar, label: t("Attendance", "الحضور") },
        { to: "/teacher/announcements", icon: Megaphone, label: t("Announcements", "الإعلانات") },
        { to: "/teacher/settings", icon: Settings, label: t("Settings", "الإعدادات") },
      ],
    },
  ];

  const isActive = (link: { to: string; exact?: boolean }) =>
    link.exact ? location.pathname === link.to : location.pathname.startsWith(link.to);

  const SidebarContent = ({ onNavigate }: { onNavigate?: () => void }) => (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: G }}>
      {/* Logo */}
      <div style={{
        padding: "20px 16px 16px",
        borderBottom: "1px solid rgba(255,255,255,.1)",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: GOLD, display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          <Pencil size={18} color={G} />
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 900, color: "#fff", fontFamily: "'Amiri', serif" }}>
            {t("Tahleem", "تعليم")}
          </div>
          <div style={{ fontSize: 10, color: GOLD, fontWeight: 700, letterSpacing: "0.08em" }}>
            {t("TEACHER PORTAL", "بوابة المعلم")}
          </div>
        </div>
        {notifCount > 0 && (
          <div style={{
            marginLeft: "auto", width: 20, height: 20, borderRadius: "50%",
            background: "#EF4444", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 10, fontWeight: 900, color: "#fff", flexShrink: 0,
          }}>
            {notifCount > 9 ? "9+" : notifCount}
          </div>
        )}
      </div>

      {/* Profile strip */}
      {profile?.full_name && (
        <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%",
              background: GOLD, display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: 14, fontWeight: 900, color: G, flexShrink: 0,
            }}>
              {(profile.full_name || "T")[0].toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {profile.full_name}
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,.5)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {(profile as any).email || ""}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav style={{ flex: 1, overflowY: "auto", padding: "8px 10px" }}>
        {sections.map((section) => (
          <div key={section.id} style={{ marginBottom: 4 }}>
            <div style={{
              fontSize: 9, fontWeight: 800, color: "rgba(255,255,255,.35)",
              padding: "10px 8px 4px", letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}>
              {section.title}
            </div>
            {section.links.map((link) => {
              const active = isActive(link);
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={onNavigate}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "9px 10px", borderRadius: 10, marginBottom: 2,
                    textDecoration: "none", transition: "all .15s",
                    background: active ? "rgba(201,168,76,.15)" : "transparent",
                    borderLeft: active ? `3px solid ${GOLD}` : "3px solid transparent",
                  }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.07)"; }}
                  onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <link.icon size={15} color={active ? GOLD : "rgba(255,255,255,.6)"} style={{ flexShrink: 0 }} />
                  <span style={{
                    fontSize: 13, fontWeight: active ? 700 : 400,
                    color: active ? GOLD : "rgba(255,255,255,.75)",
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

      {/* Bottom actions */}
      <div style={{ padding: "10px", borderTop: "1px solid rgba(255,255,255,.08)" }}>
        <button
          onClick={() => { setLanguage(language === "en" ? "ar" : "en"); onNavigate?.(); }}
          style={{
            width: "100%", padding: "8px 12px", borderRadius: 10,
            background: "rgba(255,255,255,.07)", border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 8, color: "rgba(255,255,255,.6)",
            fontSize: 12, marginBottom: 6,
          }}
        >
          <Globe size={14} />
          {t("العربية", "English")}
        </button>
        <button
          onClick={() => { signOut(); onNavigate?.(); }}
          style={{
            width: "100%", padding: "8px 12px", borderRadius: 10,
            background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.2)",
            cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
            color: "#FCA5A5", fontSize: 12,
          }}
        >
          <LogOut size={14} />
          {t("Sign Out", "تسجيل الخروج")}
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#F3F4F6" }}>
      {/* Desktop sidebar */}
      <aside style={{
        width: 240, flexShrink: 0,
        display: "flex", flexDirection: "column",
        position: "sticky", top: 0, height: "100vh",
      }}
        className="hidden md:flex"
      >
        <SidebarContent />
      </aside>

      {/* Main content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Mobile header */}
        <div style={{
          display: "flex", height: 56, alignItems: "center",
          borderBottom: `3px solid ${G}`, padding: "0 16px",
          background: "#fff", gap: 12,
        }}
          className="md:hidden"
        >
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button style={{ background: "none", border: "none", cursor: "pointer", padding: 6, borderRadius: 8 }}>
                <Menu size={20} color={G} />
              </button>
            </SheetTrigger>
            <SheetContent
              side={dir === "rtl" ? "right" : "left"}
              style={{ width: 240, padding: 0, border: "none" }}
            >
              <SidebarContent onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8, background: GOLD,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Pencil size={14} color={G} />
            </div>
            <span style={{ fontWeight: 900, fontSize: 14, color: G, fontFamily: "'Amiri', serif" }}>
              {t("Tahleem", "تعليم")} <span style={{ color: GOLD, fontSize: 11 }}>{t("Teacher", "المعلم")}</span>
            </span>
          </div>
          {pendingCount > 0 && (
            <Link to="/teacher/grading" style={{ textDecoration: "none" }}>
              <div style={{
                background: "#EF4444", color: "#fff", borderRadius: 20,
                fontSize: 10, fontWeight: 900, padding: "2px 8px",
              }}>
                {pendingCount} {t("pending", "معلق")}
              </div>
            </Link>
          )}
        </div>

        <main style={{ flex: 1, overflow: "auto" }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default TeacherLayout;
