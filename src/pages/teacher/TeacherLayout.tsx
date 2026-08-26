// src/components/layout/TeacherLayout.tsx
// Modernized shell: same 5 nav groups, all teacher pages linked, badge counts,
// notification bell — rebuilt on Tailwind + the app's emerald/gold design tokens
// (rounded-2xl cards, shadow-premium, consistent spacing) instead of inline styles.

import { useState, useEffect, useRef } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Users, UserCheck, Video, ClipboardList,
  LogOut, Globe, Menu, X, Settings, Trophy, MessageSquare,
  CheckSquare, Mic, BookOpen, GraduationCap, BarChart2,
  Megaphone, Calendar, Headphones, Radio, ChevronDown,
  ChevronRight, Bell, BookMarked, Clock, Trash2,
} from "lucide-react";
import NotificationPermissionBanner from "@/components/NotificationPermissionBanner";

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
    link: { to: "/teacher/musabaqah", icon: Trophy, label: t("Al-Musābaqah 🏆", "المسابقة 🏆") },
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
    if (!sid) return true;
    if (teacherSubjectIdsRef.current.size === 0) return true;
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

    let ch: ReturnType<typeof supabase.channel> | null = null;
    let iv: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (ch) return;
      load();
      ch = supabase.channel(`teacher-notifs:${user.id}`)
        .on("postgres_changes" as any, { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
          (p: any) => { if (!belongsToTeacher(p.new)) return; setNotifList(prev => [p.new, ...prev]); setUnreadNotifs(n => n + 1); })
        .subscribe();
      iv = setInterval(load, 20000);
    };
    const stop = () => {
      if (iv) { clearInterval(iv); iv = null; }
      if (ch) { supabase.removeChannel(ch); ch = null; }
    };

    if (document.visibilityState === "visible") start();
    const onVisibility = () => { if (document.visibilityState === "visible") start(); else stop(); };
    document.addEventListener("visibilitychange", onVisibility);

    return () => { document.removeEventListener("visibilitychange", onVisibility); stop(); };
  }, [user]);

  const markRead = async (id: string) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    setNotifList(p => p.map(n => n.id === id ? { ...n, is_read: true } : n));
    setUnreadNotifs(p => Math.max(0, p - 1));
  };

  const markAllNotifsRead = async () => {
    if (!user || unreadNotifs === 0) return;
    setNotifList(p => p.map(n => ({ ...n, is_read: true })));
    setUnreadNotifs(0);
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
  };

  const deleteOneNotif = async (id: string) => {
    const wasUnread = notifList.find(n => n.id === id)?.is_read === false;
    setNotifList(p => p.filter(n => n.id !== id));
    if (wasUnread) setUnreadNotifs(p => Math.max(0, p - 1));
    await supabase.from("notifications").delete().eq("id", id);
  };

  const deleteAllNotifs = async () => {
    if (!user || notifList.length === 0) return;
    if (!window.confirm(t("Delete all notifications? This can't be undone.", "هل تريد حذف جميع الإشعارات؟ لا يمكن التراجع عن هذا."))) return;
    setNotifList([]);
    setUnreadNotifs(0);
    await supabase.from("notifications").delete().eq("user_id", user.id);
  };

  const badges = { grading: gradingBadge };
  const navItems = buildNav(t, badges);
  const toggle = (key: string) => setExpanded(p => ({ ...p, [key]: !p[key] }));

  // ── Sidebar content ─────────────────────────────────────────────
  const SidebarContent = () => (
    <div className="flex h-full flex-col bg-sidebar">
      {/* Header */}
      <div className="flex flex-shrink-0 items-center gap-2.5 border-b border-white/10 px-3.5 py-4">
        <img src="/brand-logo.png" alt="Tahleem Academy" className="h-9 w-9 flex-shrink-0 rounded-xl object-contain" />
        <div className="min-w-0 flex-1">
          <div className="font-display text-base font-black text-sidebar-foreground">{t("Tahleem", "تعليم")}</div>
          <div className="text-[9px] font-extrabold tracking-widest text-sidebar-primary">{t("TEACHER PORTAL", "بوابة المعلم")}</div>
        </div>
        {isMobile && (
          <button onClick={() => setSidebarOpen(false)}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white/10 transition-colors hover:bg-white/20">
            <X size={16} className="text-white/85" />
          </button>
        )}
      </div>

      {/* Profile strip */}
      {profile?.full_name && (
        <div className="flex-shrink-0 border-b border-white/10 px-3.5 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-sm font-black text-sidebar-primary-foreground">
              {(profile.full_name || "T")[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-sidebar-foreground">{profile.full_name}</div>
              <div className="text-[10px] text-white/40">{t("Teacher", "معلم")}</div>
            </div>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-2">
        {navItems.map((item) => {
          if (item.type === "link") {
            const lnk = item.link;
            const active = isActive(location.pathname, lnk.to, lnk.to === "/teacher");
            return (
              <Link key={lnk.to} to={lnk.to}
                className={cn(
                  "mb-0.5 flex items-center gap-2.5 rounded-lg border-l-[3px] px-2.5 py-2.5 text-sm transition-colors",
                  active
                    ? "border-sidebar-primary bg-sidebar-primary/15 font-semibold text-sidebar-primary"
                    : "border-transparent text-white/70 hover:bg-white/5 hover:text-white/90"
                )}>
                <lnk.icon size={15} className="flex-shrink-0" />
                <span className="flex-1">{lnk.label}</span>
                {!!lnk.badge && (
                  <span className="flex-shrink-0 rounded-full bg-destructive px-1.5 py-0.5 text-[9px] font-black text-destructive-foreground">{lnk.badge}</span>
                )}
              </Link>
            );
          }

          const grp = item.group;
          const gActive  = groupActive(location.pathname, grp.children.map(c => c.to));
          const gOpen    = expanded[grp.key] ?? gActive;
          const groupBadgeTotal = grp.children.reduce((s, c) => s + (c.badge || 0), 0);
          return (
            <div key={grp.key} className="mb-0.5">
              <button onClick={() => toggle(grp.key)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg border-l-[3px] px-2.5 py-2.5 text-left text-sm transition-colors",
                  gActive
                    ? "border-sidebar-primary/50 bg-sidebar-primary/10 font-semibold text-sidebar-primary"
                    : "border-transparent text-white/70 hover:bg-white/5 hover:text-white/90"
                )}>
                <grp.icon size={15} className="flex-shrink-0" />
                <span className="flex-1">{grp.label}</span>
                {groupBadgeTotal > 0 && !gOpen && (
                  <span className="flex-shrink-0 rounded-full bg-destructive px-1.5 py-0.5 text-[9px] font-black text-destructive-foreground">
                    {groupBadgeTotal}
                  </span>
                )}
                {gOpen
                  ? <ChevronDown size={13} className="flex-shrink-0 text-white/40" />
                  : <ChevronRight size={13} className="flex-shrink-0 text-white/40" />}
              </button>
              {gOpen && (
                <div className="ml-5 border-l border-white/10 pl-2.5">
                  {grp.children.map(child => {
                    const ca = isActive(location.pathname, child.to);
                    return (
                      <Link key={child.to} to={child.to}
                        className={cn(
                          "mb-px flex items-center gap-2 rounded-md px-2.5 py-2 text-[13px] transition-colors",
                          ca ? "bg-sidebar-primary/15 font-semibold text-sidebar-primary" : "text-white/65 hover:bg-white/5 hover:text-white/85"
                        )}>
                        <child.icon size={13} className="flex-shrink-0" />
                        <span className="flex-1">{child.label}</span>
                        {!!child.badge && (
                          <span className="flex-shrink-0 rounded-full bg-destructive px-1.5 py-0.5 text-[9px] font-black text-destructive-foreground">{child.badge}</span>
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
      <div className="flex-shrink-0 border-t border-white/10 p-2">
        <button onClick={() => setLanguage(language === "en" ? "ar" : "en")}
          className="mb-1.5 flex w-full items-center gap-2 rounded-lg bg-white/5 px-2.5 py-2 text-xs text-white/60 transition-colors hover:bg-white/10">
          <Globe size={13} />{t("العربية", "English")}
        </button>
        <button onClick={() => signOut()}
          className="flex w-full items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-2.5 py-2 text-xs text-red-300 transition-colors hover:bg-destructive/15">
          <LogOut size={13} />{t("Sign Out", "تسجيل الخروج")}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-muted/40">
      {/* Desktop sidebar */}
      {!isMobile && (
        <aside className="sticky top-0 h-screen w-[248px] flex-shrink-0">
          <SidebarContent />
        </aside>
      )}

      {/* Mobile overlay */}
      {isMobile && sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />
      )}
      {isMobile && (
        <aside
          className={cn(
            "fixed top-0 bottom-0 z-50 w-[260px] shadow-premium-lg transition-transform duration-300 ease-out",
            dir === "rtl" ? "right-0" : "left-0",
            sidebarOpen ? "translate-x-0" : dir === "rtl" ? "translate-x-full" : "-translate-x-full"
          )}>
          <SidebarContent />
        </aside>
      )}

      {/* Main area */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        {isMobile && (
          <div className="sticky top-0 z-30 flex h-14 flex-shrink-0 items-center gap-2.5 border-b-[3px] border-primary bg-card px-3.5">
            <button onClick={() => setSidebarOpen(v => !v)}
              className={cn("flex h-9 w-9 items-center justify-center rounded-lg transition-colors", sidebarOpen ? "bg-primary/10" : "hover:bg-muted")}>
              <Menu size={20} className="text-primary" />
            </button>
            <div className="flex flex-1 items-center gap-2">
              <img src="/brand-logo.png" alt="Tahleem Academy" className="h-7 w-7 rounded-lg object-contain" />
              <span className="font-display text-[15px] font-black text-primary">
                {t("Tahleem", "تعليم")}{" "}
                <span className="font-sans text-[11px] text-secondary">{t("Teacher", "المعلم")}</span>
              </span>
            </div>
            <div className="relative">
              <button onClick={() => setShowNotifs(v => !v)}
                className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-muted">
                <Bell size={18} className="text-primary" />
              </button>
              {unreadNotifs > 0 && (
                <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-card bg-destructive text-[9px] font-black text-destructive-foreground">
                  {unreadNotifs > 9 ? "9+" : unreadNotifs}
                </span>
              )}
            </div>
            {gradingBadge > 0 && (
              <Link to="/teacher/grading" className="flex items-center gap-1 rounded-full bg-destructive px-2.5 py-1 text-[10px] font-black text-destructive-foreground">
                <CheckSquare size={10} />{gradingBadge}
              </Link>
            )}
          </div>
        )}

        {/* Desktop top bar */}
        {!isMobile && (
          <div className="sticky top-0 z-30 flex h-[58px] flex-shrink-0 items-center justify-end gap-2.5 border-b border-border bg-card/80 px-5 backdrop-blur-sm">
            {gradingBadge > 0 && (
              <Link to="/teacher/grading"
                className="flex items-center gap-1.5 rounded-full border border-destructive/20 bg-destructive/10 px-3 py-1.5 text-xs font-bold text-destructive transition-colors hover:bg-destructive/15">
                <CheckSquare size={13} />
                {gradingBadge} {t("to grade", "ينتظر التصحيح")}
              </Link>
            )}
            <div className="relative">
              <button onClick={() => setShowNotifs(v => !v)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card shadow-sm transition-colors hover:bg-muted">
                <Bell size={17} className="text-primary" />
              </button>
              {unreadNotifs > 0 && (
                <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-card bg-destructive text-[9px] font-black text-destructive-foreground">
                  {unreadNotifs > 9 ? "9+" : unreadNotifs}
                </span>
              )}
            </div>
            {profile?.full_name && (
              <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card py-1.5 pl-2.5 pr-3.5 shadow-sm">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-sm font-black text-secondary-foreground">
                  {profile.full_name[0].toUpperCase()}
                </div>
                <div>
                  <div className="text-[13px] font-semibold leading-tight text-foreground">{profile.full_name}</div>
                  <div className="text-[10px] leading-tight text-muted-foreground">{t("Teacher", "معلم")}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Notification panel */}
        {showNotifs && (
          <div className="fixed inset-0 z-50 bg-black/50" onClick={() => setShowNotifs(false)}>
            <div
              className="absolute left-0 right-0 top-0 flex max-h-[80vh] flex-col overflow-hidden rounded-b-3xl bg-card shadow-premium-lg"
              onClick={e => e.stopPropagation()}>
              <div className="flex flex-wrap items-center justify-between gap-2.5 bg-primary px-5 py-4">
                <div className="flex items-center gap-2.5">
                  <Bell size={16} className="text-secondary" />
                  <span className="text-[15px] font-extrabold text-primary-foreground">{t("Notifications", "الإشعارات")}</span>
                  {unreadNotifs > 0 && (
                    <span className="rounded-full bg-destructive px-2 py-0.5 text-[10px] font-black text-destructive-foreground">{unreadNotifs}</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {unreadNotifs > 0 && (
                    <button onClick={markAllNotifsRead}
                      className="rounded-full border border-secondary/30 bg-secondary/20 px-2.5 py-1 text-[10.5px] font-bold text-secondary transition-colors hover:bg-secondary/30">
                      {t("Read all", "قراءة الكل")}
                    </button>
                  )}
                  {notifList.length > 0 && (
                    <button onClick={deleteAllNotifs}
                      className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10.5px] font-bold text-white/80 transition-colors hover:bg-white/15">
                      {t("Delete all", "حذف الكل")}
                    </button>
                  )}
                  <button onClick={() => setShowNotifs(false)}
                    className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-white/15 text-primary-foreground transition-colors hover:bg-white/25">✕</button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {notifList.length === 0
                  ? <div className="py-8 text-center text-sm text-muted-foreground">{t("No notifications yet", "لا توجد إشعارات")}</div>
                  : notifList.map((n: any) => (
                    <div key={n.id}
                      onClick={() => { if (!n.is_read) markRead(n.id); if (n.link) { setShowNotifs(false); window.location.href = n.link; } }}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 border-b border-border/60 px-5 py-3.5 transition-colors hover:bg-muted/50",
                        n.is_read ? "bg-card" : "bg-secondary/10"
                      )}>
                      <div className={cn(
                        "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border-[1.5px] text-[15px]",
                        n.is_read ? "border-border bg-muted" : "border-secondary/50 bg-secondary/15"
                      )}>
                        {n.type === "class_reminder" ? "📚" : n.type === "warning" ? "⚠️" : n.type === "payment" ? "💳" : "🔔"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={cn("m-0 text-[13px] text-foreground", n.is_read ? "font-medium" : "font-bold")}>{n.title}</p>
                        <p className="m-0 mt-0.5 text-xs text-muted-foreground">{n.message}</p>
                        <p className="m-0 mt-1 text-[10px] text-muted-foreground/70">
                          {new Date(n.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      {!n.is_read && <div className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-destructive" />}
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteOneNotif(n.id); }}
                        aria-label={t("Delete notification", "حذف الإشعار")}
                        className="mt-0.5 flex h-6.5 w-6.5 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-muted hover:text-muted-foreground"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        <main className="flex-1 overflow-auto">
          <NotificationPermissionBanner />
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default TeacherLayout;
