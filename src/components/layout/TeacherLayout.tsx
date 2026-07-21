// src/components/layout/TeacherLayout.tsx
// Fully rebuilt: 5 nav groups, all 20 teacher pages linked, badge counts, notification bell.

import { useState, useEffect, useRef } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard, Users, UserCheck, Video, ClipboardList,
  LogOut, Globe, Menu, X, Settings, Trophy, MessageSquare,
  CheckSquare, Mic, BookOpen, GraduationCap, BarChart2,
  Megaphone, Calendar, Headphones, Radio, ChevronDown,
  ChevronRight, Bell, BookMarked, Clock,
} from "lucide-react";
import NotificationPermissionBanner from "@/components/NotificationPermissionBanner";

// Same greens/gold used everywhere else in the app (student sidebar,
// TeacherDashboard.tsx, SubjectAssignments/SubjectMaterials) — this file used
// to hardcode a different teal (#064E3B), which is why the teacher nav looked
// like a different colour from the rest of the platform.
const TL_G    = "#0f2d1f";
const TL_GM   = "#1a4731";
const TL_GOLD = "#c9a84c";

// ── Helpers ──────────────────────────────────────────────────────────
const isActive = (pathname: string, to: string, exact = false) =>
  exact ? pathname === to : pathname === to || pathname.startsWith(to + "/");

const groupActive = (pathname: string, paths: string[]) =>
  paths.some(p => pathname === p || pathname.startsWith(p + "/"));

// ── Nav definition ───────────────────────────────────────────────────
type NavLink  = { to: string; icon: any; label: string; badge?: number };
type NavGroup = { key: string; icon: any; label: string; children: NavLink[] };
type NavItem  = { type: "link"; link: NavLink } | { type: "group"; group: NavGroup };

const buildNav = (t: (a: string, b: string) => string, badges: Record<string, number>): NavItem[] => [
  {
    type: "link",
    link: { to: "/teacher", icon: LayoutDashboard, label: t("Dashboard", "لوحة التحكم") },
  },

  // ── Teaching ─────────────────────────────────────────────────────
  {
    type: "group",
    group: {
      key: "teaching",
      icon: Video,
      label: t("Teaching", "التدريس"),
      children: [
        { to: "/teacher/classes",      icon: Video,      label: t("My Classes",      "فصولي الحية") },
        { to: "/teacher/timetable",    icon: Clock,      label: t("Timetable",       "جدولي الدراسي") },
        { to: "/teacher/subjects",     icon: BookOpen,   label: t("Subjects",        "موادي") },
        { to: "/teacher/recordings",   icon: Headphones, label: t("Recordings",      "التسجيلات") },
        { to: "/teacher/public-classes", icon: Radio,    label: t("Public Classes",  "الدروس العامة") },
      ],
    },
  },

  // ── Students ─────────────────────────────────────────────────────
  {
    type: "group",
    group: {
      key: "students",
      icon: Users,
      label: t("Students", "الطلاب"),
      children: [
        { to: "/teacher/students",         icon: Users,      label: t("All Students",      "جميع الطلاب") },
        { to: "/teacher/private-students", icon: UserCheck,  label: t("Private Students",  "الطلاب الخاصون") },
        { to: "/teacher/private-sessions", icon: BookMarked, label: t("Private Sessions",  "الجلسات الخاصة") },
        { to: "/teacher/attendance",       icon: Calendar,   label: t("Attendance",        "الحضور والغياب") },
        { to: "/teacher/announcements",    icon: Megaphone,  label: t("Announcements",     "الإعلانات") },
      ],
    },
  },

  // ── Assessments ──────────────────────────────────────────────────
  {
    type: "group",
    group: {
      key: "assessments",
      icon: ClipboardList,
      label: t("Assessments", "التقييمات"),
      children: [
        { to: "/teacher/exams",       icon: ClipboardList, label: t("Exams & Tests",  "الامتحانات والتمارين") },
        { to: "/teacher/grading",     icon: CheckSquare,   label: t("Grading",        "التصحيح"),           badge: badges.grading },
        { to: "/teacher/results",     icon: BarChart2,     label: t("Results",        "النتائج") },
        { to: "/teacher/transcripts", icon: GraduationCap, label: t("Transcripts",    "السجلات الأكاديمية") },
      ],
    },
  },

  // ── Recitation & Ḥifẓ ────────────────────────────────────────────
  {
    type: "group",
    group: {
      key: "recitation",
      icon: Mic,
      label: t("Recitation & Ḥifẓ", "التلاوة والحفظ"),
      children: [
        { to: "/teacher/recitation", icon: Mic,    label: t("My Recitations", "تسجيلات التلاوة") },
        { to: "/teacher/hifdh",      icon: BookOpen,label: t("Ḥifẓ Review",   "مراجعة الحفظ") },
      ],
    },
  },

  // ── Communication ────────────────────────────────────────────────
  {
    type: "link",
    link: { to: "/teacher/majlis", icon: MessageSquare, label: t("Al-Majlis", "المجلس") },
  },

  // ── Al-Musābaqah ─────────────────────────────────────────────────
  {
    type: "link",
    link: { to: "/live-quiz", icon: Trophy, label: t("Al-Musābaqah 🏆", "المسابقة 🏆") },
  },

  // ── Settings ─────────────────────────────────────────────────────
  {
    type: "link",
    link: { to: "/teacher/settings", icon: Settings, label: t("Settings", "الإعدادات") },
  },
];

// ─────────────────────────────────────────────────────────────────────
const TeacherLayout = () => {
  const { t, language, setLanguage, dir } = useLanguage();
  const { signOut, profile, user } = useAuth();
  const location = useLocation();

  const [sidebarOpen,   setSidebarOpen]   = useState(false);
  const [isMobile,      setIsMobile]      = useState(false);
  const [expanded,      setExpanded]      = useState<Record<string, boolean>>({});
  const [gradingBadge,  setGradingBadge]  = useState(0);
  const [unreadNotifs,  setUnreadNotifs]  = useState(0);
  const [showNotifs,    setShowNotifs]    = useState(false);
  const [notifList,     setNotifList]     = useState<any[]>([]);

  // ── Responsive ─────────────────────────────────────────────────
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

  // ── Auto-expand active group ────────────────────────────────────
  useEffect(() => {
    const groupDefs: Record<string, string[]> = {
      teaching:    ["/teacher/classes","/teacher/timetable","/teacher/subjects","/teacher/recordings","/teacher/public-classes"],
      students:    ["/teacher/students","/teacher/private-students","/teacher/private-sessions","/teacher/attendance","/teacher/announcements"],
      assessments: ["/teacher/exams","/teacher/grading","/teacher/results","/teacher/transcripts"],
      recitation:  ["/teacher/recitation","/teacher/hifdh"],
    };
    setExpanded(prev => {
      const next = { ...prev };
      for (const [key, paths] of Object.entries(groupDefs)) {
        if (groupActive(location.pathname, paths)) next[key] = true;
      }
      return next;
    });
  }, [location.pathname]);

  // ── Grading badge ───────────────────────────────────────────────
  const teacherSubjectIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: subs } = await supabase.from("subjects").select("id").eq("teacher_id", user.id);
      const { data: ttSlots } = await supabase.from("subject_timetable" as any).select("subject_id").eq("teacher_id", user.id);
      const subIds = [...new Set([
        ...((subs || []).map((s: any) => s.id)),
        ...((ttSlots || []).map((s: any) => s.subject_id).filter(Boolean)),
      ])];
      teacherSubjectIdsRef.current = new Set(subIds);
      if (!subIds.length) return;
      const { data: courses } = await supabase.from("courses").select("id").in("subject_id", subIds);
      const cIds = (courses || []).map((c: any) => c.id);
      if (!cIds.length) return;
      const { data: exams } = await supabase.from("exams").select("id").in("course_id", cIds);
      const eIds = (exams || []).map((e: any) => e.id);
      if (!eIds.length) return;
      const { count } = await supabase
        .from("exam_attempts")
        .select("id", { count: "exact", head: true })
        .in("exam_id", eIds)
        .eq("status", "submitted");
      setGradingBadge(count || 0);
    })();
  }, [user]);

  // ── Notifications ───────────────────────────────────────────────
  // A notification is "course-scoped" when its link encodes a subject id
  // (class reminders: `reminder:{sessionId}:{minsAhead}:{subjectId}`, or
  // attendance-review deep links: `/teacher/attendance?subjectId=...`).
  // Those only belong on the bell if that subject is actually one the
  // teacher teaches — guards against a stale/reassigned class still
  // notifying the old teacher. Non-course notifications (payments, admin
  // announcements, support replies) are left untouched.
  const extractSubjectId = (link?: string | null): string | null => {
    if (!link) return null;
    const reminderMatch = link.match(/^reminder:[^:]+:[^:]+:(.+)$/);
    if (reminderMatch) return reminderMatch[1];
    const qsMatch = link.match(/[?&]subjectId=([^&]+)/);
    if (qsMatch) return decodeURIComponent(qsMatch[1]);
    return null;
  };
  const belongsToTeacher = (n: any) => {
    const sid = extractSubjectId(n.link);
    if (!sid) return true; // not course-scoped — always show
    if (teacherSubjectIdsRef.current.size === 0) return true; // scope not loaded yet — don't hide anything
    return teacherSubjectIdsRef.current.has(sid);
  };

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30);
      const list = (data || []).filter(belongsToTeacher);
      setNotifList(list);
      setUnreadNotifs(list.filter((n: any) => !n.is_read).length);
    };
    load();
    const ch = supabase.channel(`teacher-notifs:${user.id}`)
      .on("postgres_changes" as any, { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (p: any) => { if (!belongsToTeacher(p.new)) return; setNotifList(prev => [p.new, ...prev]); setUnreadNotifs(n => n + 1); })
      .subscribe();
    const iv = setInterval(load, 20000);
    return () => { clearInterval(iv); supabase.removeChannel(ch); };
  }, [user]);

  const markRead = async (id: string) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    setNotifList(p => p.map(n => n.id === id ? { ...n, is_read: true } : n));
    setUnreadNotifs(p => Math.max(0, p - 1));
  };

  const badges = { grading: gradingBadge };
  const navItems = buildNav(t, badges);
  const toggle = (key: string) => setExpanded(p => ({ ...p, [key]: !p[key] }));

  // ── Sidebar content ─────────────────────────────────────────────
  const SidebarContent = () => (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: TL_G }}>
      {/* Header */}
      <div style={{ padding: "16px 14px 12px", borderBottom: "1px solid rgba(255,255,255,.1)", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <img src="/brand-logo.png" alt="Tahleem Academy" style={{ width: 36, height: 36, borderRadius: 10, objectFit: "contain", flexShrink: 0, background: TL_GOLD }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: "#fff", fontFamily: "serif" }}>{t("Tahleem", "تعليم")}</div>
          <div style={{ fontSize: 9, color: TL_GOLD, fontWeight: 800, letterSpacing: "0.09em" }}>{t("TEACHER PORTAL", "بوابة المعلم")}</div>
        </div>
        {isMobile && (
          <button onClick={() => setSidebarOpen(false)}
            style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(255,255,255,.12)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <X size={16} color="rgba(255,255,255,.85)" />
          </button>
        )}
      </div>

      {/* Profile strip */}
      {profile?.full_name && (
        <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,.08)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: "50%", background: TL_GOLD, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 900, color: TL_G, flexShrink: 0 }}>
              {(profile.full_name || "T")[0].toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profile.full_name}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,.4)" }}>{t("Teacher", "معلم")}</div>
            </div>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: "auto", padding: "8px 8px 4px" }}>
        {navItems.map((item, idx) => {
          if (item.type === "link") {
            const lnk = item.link;
            const active = isActive(location.pathname, lnk.to, lnk.to === "/teacher");
            return (
              <Link key={lnk.to} to={lnk.to}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 11px", borderRadius: 10, marginBottom: 2, textDecoration: "none", background: active ? "rgba(201,168,76,.18)" : "transparent", borderLeft: `3px solid ${active ? TL_GOLD : "transparent"}` }}>
                <lnk.icon size={15} color={active ? TL_GOLD : "rgba(255,255,255,.6)"} style={{ flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: active ? 700 : 400, color: active ? TL_GOLD : "rgba(255,255,255,.75)", flex: 1 }}>{lnk.label}</span>
                {!!lnk.badge && (
                  <span style={{ background: "#EF4444", color: "#fff", borderRadius: 20, fontSize: 9, fontWeight: 900, padding: "2px 7px", flexShrink: 0 }}>{lnk.badge}</span>
                )}
              </Link>
            );
          }

          // group
          const grp = item.group;
          const gActive  = groupActive(location.pathname, grp.children.map(c => c.to));
          const gOpen    = expanded[grp.key] ?? gActive;
          return (
            <div key={grp.key} style={{ marginBottom: 2 }}>
              <button onClick={() => toggle(grp.key)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 11px", borderRadius: 10, background: gActive ? "rgba(201,168,76,.10)" : "transparent", borderLeft: `3px solid ${gActive ? TL_GOLD + "88" : "transparent"}`, border: "none", cursor: "pointer", textAlign: "left" }}>
                <grp.icon size={15} color={gActive ? TL_GOLD : "rgba(255,255,255,.6)"} style={{ flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: gActive ? 700 : 400, color: gActive ? TL_GOLD : "rgba(255,255,255,.75)", flex: 1 }}>{grp.label}</span>
                {/* total badge for group */}
                {grp.children.reduce((s, c) => s + (c.badge || 0), 0) > 0 && !gOpen && (
                  <span style={{ background: "#EF4444", color: "#fff", borderRadius: 20, fontSize: 9, fontWeight: 900, padding: "2px 7px", flexShrink: 0 }}>
                    {grp.children.reduce((s, c) => s + (c.badge || 0), 0)}
                  </span>
                )}
                {gOpen
                  ? <ChevronDown size={13} color="rgba(255,255,255,.4)" style={{ flexShrink: 0 }} />
                  : <ChevronRight size={13} color="rgba(255,255,255,.4)" style={{ flexShrink: 0 }} />}
              </button>
              {gOpen && (
                <div style={{ marginLeft: 20, paddingLeft: 10, borderLeft: "1px solid rgba(255,255,255,.1)" }}>
                  {grp.children.map(child => {
                    const ca = isActive(location.pathname, child.to);
                    return (
                      <Link key={child.to} to={child.to}
                        style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 10px", borderRadius: 9, marginBottom: 1, textDecoration: "none", background: ca ? "rgba(201,168,76,.18)" : "transparent" }}>
                        <child.icon size={13} color={ca ? TL_GOLD : "rgba(255,255,255,.5)"} style={{ flexShrink: 0 }} />
                        <span style={{ fontSize: 12, fontWeight: ca ? 700 : 400, color: ca ? TL_GOLD : "rgba(255,255,255,.65)", flex: 1 }}>{child.label}</span>
                        {!!child.badge && (
                          <span style={{ background: "#EF4444", color: "#fff", borderRadius: 20, fontSize: 9, fontWeight: 900, padding: "2px 7px", flexShrink: 0 }}>{child.badge}</span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
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
      {/* Desktop sidebar */}
      {!isMobile && (
        <aside style={{ width: 248, flexShrink: 0, height: "100vh", position: "sticky", top: 0 }}>
          <SidebarContent />
        </aside>
      )}

      {/* Mobile overlay */}
      {isMobile && sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(0,0,0,.52)" }} />
      )}
      {isMobile && (
        <aside style={{ position: "fixed", top: 0, bottom: 0, [dir === "rtl" ? "right" : "left"]: 0, width: 255, zIndex: 50, transform: sidebarOpen ? "translateX(0)" : dir === "rtl" ? "translateX(260px)" : "translateX(-260px)", transition: "transform .26s ease", boxShadow: sidebarOpen ? "6px 0 30px rgba(0,0,0,.28)" : "none" }}>
          <SidebarContent />
        </aside>
      )}

      {/* Main area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: "100vh" }}>
        {/* Mobile top bar */}
        {isMobile && (
          <div style={{ height: 54, flexShrink: 0, display: "flex", alignItems: "center", padding: "0 14px", gap: 10, background: "#fff", borderBottom: `3px solid ${TL_G}`, position: "sticky", top: 0, zIndex: 30 }}>
            <button onClick={() => setSidebarOpen(v => !v)}
              style={{ width: 36, height: 36, borderRadius: 9, border: "none", cursor: "pointer", background: sidebarOpen ? `${TL_G}18` : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Menu size={20} color={TL_G} />
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
              <img src="/brand-logo.png" alt="Tahleem Academy" style={{ width: 28, height: 28, borderRadius: 8, objectFit: "contain", background: TL_GOLD }} />
              <span style={{ fontWeight: 900, fontSize: 15, color: TL_G, fontFamily: "serif" }}>
                {t("Tahleem", "تعليم")}{" "}
                <span style={{ color: TL_GOLD, fontSize: 11, fontFamily: "system-ui" }}>{t("Teacher", "المعلم")}</span>
              </span>
            </div>
            {/* Notification bell */}
            <div style={{ position: "relative" }}>
              <button onClick={() => setShowNotifs(v => !v)}
                style={{ width: 36, height: 36, borderRadius: 9, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Bell size={18} color={TL_G} />
              </button>
              {unreadNotifs > 0 && (
                <span style={{ position: "absolute", top: 4, right: 4, width: 16, height: 16, borderRadius: "50%", background: "#EF4444", color: "#fff", fontSize: 9, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff" }}>
                  {unreadNotifs > 9 ? "9+" : unreadNotifs}
                </span>
              )}
            </div>
            {/* Grading shortcut */}
            {gradingBadge > 0 && (
              <Link to="/teacher/grading" style={{ textDecoration: "none" }}>
                <div style={{ background: "#EF4444", color: "#fff", borderRadius: 20, fontSize: 10, fontWeight: 900, padding: "3px 9px", display: "flex", alignItems: "center", gap: 4 }}>
                  <CheckSquare size={10} />{gradingBadge}
                </div>
              </Link>
            )}
          </div>
        )}

        {/* Desktop top notification bar */}
        {!isMobile && (
          <div style={{ height: 50, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "0 20px", gap: 10, background: "#fff", borderBottom: "1px solid #e5e7eb", position: "sticky", top: 0, zIndex: 30 }}>
            {gradingBadge > 0 && (
              <Link to="/teacher/grading" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 6, background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 700, color: "#DC2626" }}>
                <CheckSquare size={13} />
                {gradingBadge} {t("to grade", "ينتظر التصحيح")}
              </Link>
            )}
            <div style={{ position: "relative" }}>
              <button onClick={() => setShowNotifs(v => !v)}
                style={{ width: 38, height: 38, borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Bell size={17} color={TL_G} />
              </button>
              {unreadNotifs > 0 && (
                <span style={{ position: "absolute", top: 4, right: 4, width: 16, height: 16, borderRadius: "50%", background: "#EF4444", color: "#fff", fontSize: 9, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff" }}>
                  {unreadNotifs > 9 ? "9+" : unreadNotifs}
                </span>
              )}
            </div>
            {profile?.full_name && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 34, height: 34, borderRadius: "50%", background: TL_GOLD, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900, color: TL_G }}>
                  {profile.full_name[0].toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: TL_G }}>{profile.full_name}</div>
                  <div style={{ fontSize: 10, color: "#9CA3AF" }}>{t("Teacher", "معلم")}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Notification panel */}
        {showNotifs && (
          <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,.5)" }} onClick={() => setShowNotifs(false)}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, maxHeight: "80vh", background: "#fff", borderRadius: "0 0 24px 24px", boxShadow: "0 8px 40px rgba(0,0,0,.18)", display: "flex", flexDirection: "column", overflow: "hidden" }}
              onClick={e => e.stopPropagation()}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", background: TL_G }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Bell size={16} color={TL_GOLD} />
                  <span style={{ fontWeight: 800, color: "#fff", fontSize: 15 }}>{t("Notifications", "الإشعارات")}</span>
                  {unreadNotifs > 0 && (
                    <span style={{ background: "#EF4444", color: "#fff", borderRadius: 20, fontSize: 10, fontWeight: 900, padding: "2px 8px" }}>{unreadNotifs}</span>
                  )}
                </div>
                <button onClick={() => setShowNotifs(false)} style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(255,255,255,.15)", border: "none", cursor: "pointer", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
              </div>
              <div style={{ overflowY: "auto", flex: 1 }}>
                {notifList.length === 0
                  ? <div style={{ textAlign: "center", padding: "32px 0", color: "#9CA3AF", fontSize: 14 }}>{t("No notifications yet", "لا توجد إشعارات")}</div>
                  : notifList.map((n: any) => (
                    <div key={n.id}
                      onClick={() => { if (!n.is_read) markRead(n.id); if (n.link) { setShowNotifs(false); window.location.href = n.link; } }}
                      style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 20px", borderBottom: "1px solid #F9FAFB", cursor: "pointer", background: n.is_read ? "#fff" : "#FFFBEB" }}>
                      <div style={{ width: 36, height: 36, borderRadius: "50%", background: n.is_read ? "#F3F4F6" : "#FEF9EE", border: `1.5px solid ${n.is_read ? "#E5E7EB" : TL_GOLD + "88"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 15 }}>
                        {n.type === "class_reminder" ? "📚" : n.type === "warning" ? "⚠️" : n.type === "payment" ? "💳" : "🔔"}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: n.is_read ? 500 : 700, color: "#111" }}>{n.title}</p>
                        <p style={{ margin: "2px 0 0", fontSize: 12, color: "#6B7280" }}>{n.message}</p>
                        <p style={{ margin: "4px 0 0", fontSize: 10, color: "#9CA3AF" }}>
                          {new Date(n.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      {!n.is_read && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#EF4444", flexShrink: 0, marginTop: 4 }} />}
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        <main style={{ flex: 1, overflow: "auto" }}>
          <NotificationPermissionBanner />
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default TeacherLayout;
