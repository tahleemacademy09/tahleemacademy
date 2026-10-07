import AcademyStatusBanner from "@/components/shared/AcademyStatusBanner";
import NotificationPermissionBanner from "@/components/NotificationPermissionBanner";
import BackgroundRunBanner from "@/components/shared/BackgroundRunBanner";
import { useImpersonation } from "@/hooks/useImpersonation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import IslamicDailyFeed from "@/components/dashboard/IslamicDailyFeed";
import { DeadlineCountdown } from "@/components/dashboard/DeadlineCountdown";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useRevisionAssignedCount } from "@/hooks/useRevisionAssignedCount";
import { usePrivateStudent } from "@/hooks/usePrivateStudent";
import { useVisibleRealtime } from "@/hooks/useVisibleRealtime";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useAcademySettings } from "@/hooks/useAcademySettings";
import { useViewingTermId } from "@/hooks/useCurrentTermId";
import { useStudentSchedule, useTermInfo, type TermInfo } from "@/hooks/useStudentSchedule";
import {
  Clock, BookOpen, ClipboardList, Bell, TrendingUp, Calendar,
  GraduationCap, MessageCircle, ArrowRight, Video, Star, ChevronLeft,
  ChevronRight, AlertTriangle, Mic, Lock, ClipboardCheck, CheckCheck
} from "lucide-react";

const toHijri = (date: Date) => {
  try {
    const parts = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
      day: "numeric", month: "numeric", year: "numeric"
    }).formatToParts(date);
    const d = parts.find(p => p.type === "day")?.value ?? "0";
    const m = parts.find(p => p.type === "month")?.value ?? "0";
    const y = parts.find(p => p.type === "year")?.value ?? "0";
    const months = ["محرم","صفر","ربيع الأول","ربيع الثاني","جمادى الأولى","جمادى الآخرة","رجب","شعبان","رمضان","شوال","ذو القعدة","ذو الحجة"];
    const monthName = months[parseInt(m) - 1] ?? "";
    return { day: parseInt(d), month: monthName, year: parseInt(y), full: `${d} ${monthName} ${y} هـ` };
  } catch {
    return { day: 0, month: "", year: 0, full: "" };
  }
};

/** Convert "HH:MM:SS" → "H:MM AM/PM" */
const to12hr = (timeStr: string): string => {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
};

/** Minutes from now until HH:MM time string (negative = past) */
const minsUntilTime = (timeStr: string): number => {
  const now = new Date();
  const [h, m] = timeStr.split(":").map(Number);
  const t = new Date(); t.setHours(h, m, 0, 0);
  return (t.getTime() - now.getTime()) / 60_000;
};

const gradePoint = (pct: number): number => {
  if (pct >= 85) return 4.0; if (pct >= 75) return 3.5;
  if (pct >= 65) return 3.0; if (pct >= 55) return 2.0;
  if (pct >= 45) return 1.0; return 0.0;
};

const DARK_GREEN  = "#0f2d1f";
const MID_GREEN   = "#1a4731";
const GOLD        = "#c9a84c";
const GOLD_LIGHT  = "#e4c36a";
const CREAM       = "#faf6ee";
const TEXT_DARK   = "#0f2d1f";
const TEXT_MED    = "#4a7c59";
const TEXT_LIGHT  = "#7a9e88";
const BORDER      = "rgba(15,45,31,0.1)";

/* ── Shared building blocks ────────────────────────────────────────────── */
const SectionCard = ({ icon: Icon, title, right, children, noPad, accent }: {
  icon: any; title: string; right?: React.ReactNode; children: React.ReactNode; noPad?: boolean; accent?: string;
}) => (
  <section style={{ background:"#fff", border:`1px solid ${BORDER}`, borderRadius:18, boxShadow:"0 2px 12px rgba(0,0,0,.06)", overflow:"hidden" }}>
    <div style={{ padding:"14px 18px", borderBottom:`1px solid ${BORDER}`, display:"flex", alignItems:"center", justifyContent:"space-between", gap:10 }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, minWidth:0 }}>
        <Icon style={{ width:16, height:16, color: accent || MID_GREEN, flexShrink:0 }} />
        <h2 style={{ margin:0, fontSize:15, fontWeight:800, color:TEXT_DARK, fontFamily:"'Playfair Display',serif" }}>{title}</h2>
      </div>
      {right}
    </div>
    <div style={noPad ? undefined : { padding:"12px 14px" }}>{children}</div>
  </section>
);

const LinkButton = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button onClick={onClick} style={{ fontSize:11, fontWeight:700, color:GOLD, background:"none", border:"none", cursor:"pointer", display:"flex", alignItems:"center", gap:4, flexShrink:0 }}>
    {children}
  </button>
);

const EmptyState = ({ icon: Icon, text }: { icon: any; text: string }) => (
  <div style={{ padding:"22px 12px", textAlign:"center" }}>
    <Icon style={{ width:26, height:26, color:"#cbd5d0", margin:"0 auto 8px", display:"block" }} />
    <p style={{ margin:0, fontSize:12, color:TEXT_LIGHT, fontWeight:600 }}>{text}</p>
  </div>
);

const RowSkeleton = ({ rows = 2 }: { rows?: number }) => (
  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
    {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
  </div>
);

const timeAgo = (iso: string, ar: boolean) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return ar ? "الآن" : "now";
  if (mins < 60) return ar ? `منذ ${mins} د` : `${mins}m ago`;
  if (mins < 1440) return ar ? `منذ ${Math.floor(mins / 60)} س` : `${Math.floor(mins / 60)}h ago`;
  return new Date(iso).toLocaleDateString(ar ? "ar-SA" : "en-GB", { day:"numeric", month:"short" });
};

/* ── Assignment data (single loader shared by the widget + the calendar) ── */
async function loadAssignments(uid: string, level: string | null, termId: string | null) {
  const { data: enrollments } = await supabase.from("enrollments").select("course_id").eq("user_id", uid);
  const { data: ttSlots } = await supabase.from("subject_timetable" as any).select("subject_id, levels").eq("is_active", true);
  const ttIds = (ttSlots || []).filter((s: any) => {
    if (!s.levels || s.levels.length === 0) return true;
    return !!level && s.levels.includes(level);
  }).map((s: any) => s.subject_id);
  const ids = [...new Set([...(enrollments || []).map((e: any) => e.course_id), ...ttIds])].filter(Boolean);
  if (!ids.length) return { list: [] as any[], subs: {} as Record<string, any> };

  // This term's assignments plus legacy rows with no term_id yet — same rule as the Assignments page.
  let q = supabase.from("subject_assignments").select("*, subjects(id,title,title_ar,level,levels)").in("subject_id", ids).neq("status", "draft");
  if (termId) q = q.or(`term_id.eq.${termId},term_id.is.null`);
  const { data: asgn } = await q.order("deadline", { ascending: true });
  const list = (asgn || []).filter((a: any) => {
    const subj = a.subjects;
    if (!subj) return true;
    const sl: string[] = subj.levels || (subj.level ? [subj.level] : []);
    if (sl.length === 0) return true;
    return !!level && sl.includes(level);
  });
  const subs: Record<string, any> = {};
  if (list.length) {
    const { data: s } = await supabase.from("assignment_submissions").select("*").eq("user_id", uid).in("assignment_id", list.map((a: any) => a.id));
    (s || []).forEach((sub: any) => { subs[sub.assignment_id] = sub; });
  }
  return { list, subs };
}

/* ── Assignments widget ────────────────────────────────────────────────── */
const AssignmentPreview = ({ items, subs, loading, t, language, navigate }: {
  items: any[]; subs: Record<string, any>; loading: boolean; t: any; language: string; navigate: any;
}) => {
  const now = new Date();
  const open = items.filter(a => !subs[a.id]);
  const overdue = open.filter(a => a.deadline && new Date(a.deadline) < now);
  const pending = open.filter(a => !a.deadline || new Date(a.deadline) >= now);
  // Needs-attention first: overdue, then due soonest, then submitted/graded.
  const shown = [...overdue, ...pending, ...items.filter(a => subs[a.id])].slice(0, 4);

  return (
    <SectionCard icon={ClipboardCheck} title={t("Assignments", "الواجبات")}
      right={<LinkButton onClick={() => navigate("/student/assignments")}>{t("View all", "عرض الكل")} <ArrowRight style={{ width:12, height:12 }} /></LinkButton>}>
      {loading ? <RowSkeleton /> : shown.length === 0 ? (
        <EmptyState icon={ClipboardCheck} text={t("No assignments this term", "لا توجد واجبات لهذا الفصل")} />
      ) : (
        <>
          {(overdue.length > 0 || pending.length > 0) && (
            <div style={{ display:"flex", gap:6, marginBottom:10 }}>
              {overdue.length > 0 && <span style={{ background:"#c0392b", color:"#fff", fontSize:10, fontWeight:800, padding:"2px 8px", borderRadius:20 }}>{overdue.length} {t("overdue","متأخر")}</span>}
              {pending.length > 0 && <span style={{ background:GOLD+"22", color:"#8a6d1d", fontSize:10, fontWeight:800, padding:"2px 8px", borderRadius:20, border:`1px solid ${GOLD}44` }}>{pending.length} {t("due","قادم")}</span>}
            </div>
          )}
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {shown.map((a: any) => {
              const sub  = subs[a.id];
              const late = !sub && a.deadline && new Date(a.deadline) < now;
              const done = sub?.status === "graded";
              const sent = !!sub && !done;
              const title = language === "ar" ? (a.title_ar || a.title) : a.title;
              const subject = language === "ar" ? (a.subjects?.title_ar || a.subjects?.title) : a.subjects?.title;
              return (
                <div key={a.id} onClick={() => navigate("/student/assignments")} className="qa-tile"
                  style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 10px", borderRadius:12, cursor:"pointer",
                    background: late ? "#fff5f5" : done ? "#f0fdf4" : sent ? "#eff6ff" : "#f8fafb",
                    border:`1px solid ${late ? "#fca5a5" : done ? "#86efac" : sent ? "#93c5fd" : BORDER}` }}>
                  <div style={{ width:8, height:8, borderRadius:"50%", flexShrink:0, background: late ? "#c0392b" : done ? "#276749" : sent ? "#1d4ed8" : GOLD }} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:TEXT_DARK, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{title}</div>
                    {subject && <div style={{ fontSize:10, color:TEXT_LIGHT, marginTop:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{subject}</div>}
                  </div>
                  {late && <span style={{ fontSize:10, fontWeight:800, color:"#c0392b" }}>{t("Late","متأخر")}</span>}
                  {done && <span style={{ fontSize:10, fontWeight:800, color:"#276749" }}>{sub.grade ?? "✓"}</span>}
                  {sent && <span style={{ fontSize:10, fontWeight:800, color:"#1d4ed8" }}>{t("Sent","أُرسل")}</span>}
                  {!sub && !late && a.deadline && <DeadlineCountdown deadline={a.deadline} t={t} compact />}
                </div>
              );
            })}
          </div>
        </>
      )}
    </SectionCard>
  );
};

/* ── Timetable widget (follows the term the student is viewing) ────────── */
const DAY_LABELS = [
  { en:"Sun", ar:"أحد" }, { en:"Mon", ar:"إثنين" }, { en:"Tue", ar:"ثلاثاء" }, { en:"Wed", ar:"أربعاء" },
  { en:"Thu", ar:"خميس" }, { en:"Fri", ar:"جمعة" }, { en:"Sat", ar:"سبت" },
];
const localISODate = (d: Date) => d.toLocaleDateString("en-CA"); // yyyy-mm-dd in the student's timezone

const DashboardTimetable = ({ slots, sessions, loading, term, isCurrentTerm, blocked, blockedMessage, isPrivate, t, language, navigate, onJoin }: {
  slots: any[]; sessions: any[]; loading: boolean; term: TermInfo | null | undefined; isCurrentTerm: boolean;
  blocked: boolean; blockedMessage: string; isPrivate: boolean; t: any; language: string; navigate: any; onJoin: (slot: any) => void;
}) => {
  const todayIdx = new Date().getDay();
  const [sel, setSel] = useState(todayIdx);
  const [, tick] = useState(0);
  useEffect(() => { const iv = setInterval(() => tick(n => n + 1), 30_000); return () => clearInterval(iv); }, []);

  const ar = language === "ar";
  const termName = term ? (ar ? term.name_ar || term.name : term.name) : t("Current term", "الفصل الحالي");
  const fmt = (d: string) => new Date(d).toLocaleDateString(ar ? "ar-SA" : "en-GB", { day:"numeric", month:"short" });

  const title = t("My Timetable", "جدول دراستي");
  const fullLink = <LinkButton onClick={() => navigate("/student/timetable")}>{t("Full schedule", "الجدول الكامل")} <ArrowRight style={{ width:12, height:12 }} /></LinkButton>;

  if (blocked) {
    return (
      <SectionCard icon={Calendar} title={title}>
        <EmptyState icon={Calendar} text={blockedMessage} />
      </SectionCard>
    );
  }

  const daySlots = slots.filter(s => s.day_of_week === sel);
  const offset = (sel - todayIdx + 7) % 7;
  const selDate = new Date(); selDate.setDate(selDate.getDate() + offset);
  const daySessions = sessions.filter(s => s.session_date === localISODate(selDate));
  const isToday = sel === todayIdx;
  const total = daySlots.length + daySessions.length;

  return (
    <SectionCard icon={Calendar} title={title} right={fullLink} noPad>
      {/* Term strip — makes it obvious which term this schedule belongs to */}
      <div style={{ padding:"10px 14px", display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", borderBottom:`1px solid ${BORDER}`, background:"#fbfaf6" }}>
        <span style={{ fontSize:11, fontWeight:800, color:MID_GREEN, background:"#e8f3ec", border:"1px solid #bcd9c5", padding:"3px 10px", borderRadius:20 }}>{termName}</span>
        {term?.start_date && term?.end_date && (
          <span style={{ fontSize:10, color:TEXT_LIGHT, fontWeight:600 }}>{fmt(term.start_date)} – {fmt(term.end_date)}</span>
        )}
        {!isCurrentTerm && term && (
          <button onClick={() => navigate("/student/profile")} style={{ marginInlineStart:"auto", fontSize:10, fontWeight:800, color:"#92400e", background:"#fffbeb", border:"1px solid #f6d860", borderRadius:20, padding:"3px 10px", cursor:"pointer" }}>
            {t("Past term · switch", "فصل سابق · تبديل")}
          </button>
        )}
        {isPrivate && (
          <span style={{ display:"inline-flex", alignItems:"center", gap:3, marginInlineStart: isCurrentTerm ? "auto" : 0, fontSize:10, fontWeight:700, color:"#6d28d9" }}>
            <Lock style={{ width:10, height:10 }} /> {t("Private", "خاص")}
          </span>
        )}
      </div>

      {/* Day tabs */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4, padding:"10px 10px 4px" }}>
        {DAY_LABELS.map((d, i) => {
          const has = slots.some(s => s.day_of_week === i);
          const active = i === sel;
          return (
            <button key={i} onClick={() => setSel(i)} aria-pressed={active}
              style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:3, padding:"7px 0 6px", borderRadius:12, cursor:"pointer",
                border: i === todayIdx && !active ? `1px solid ${GOLD}` : "1px solid transparent",
                background: active ? `linear-gradient(135deg, ${MID_GREEN}, ${DARK_GREEN})` : "transparent" }}>
              <span style={{ fontSize:10, fontWeight: i === todayIdx ? 800 : 600, color: active ? "#fff" : i === todayIdx ? "#8a6d1d" : TEXT_LIGHT }}>{ar ? d.ar : d.en}</span>
              <span style={{ width:5, height:5, borderRadius:"50%", background: has ? (active ? GOLD_LIGHT : GOLD) : "transparent" }} />
            </button>
          );
        })}
      </div>

      <div style={{ padding:"6px 14px 14px", display:"flex", flexDirection:"column", gap:8 }}>
        {loading ? <RowSkeleton /> : total === 0 ? (
          <EmptyState icon={Calendar} text={
            slots.length === 0 && sessions.length === 0
              ? t("No classes scheduled for this term yet", "لا توجد حصص مجدولة لهذا الفصل بعد")
              : t("No classes on this day", "لا توجد حصص في هذا اليوم")
          } />
        ) : (
          <>
            <div style={{ fontSize:10, fontWeight:700, color:TEXT_LIGHT }}>
              {isToday ? t("Today", "اليوم") : ar ? DAY_LABELS[sel].ar : DAY_LABELS[sel].en} · {total} {t(total === 1 ? "class" : "classes", "حصص")}
            </div>
            {daySlots.map((slot: any) => {
              const ml = isToday ? minsUntilTime(slot.start_time) : Infinity;
              const me = isToday ? minsUntilTime(slot.end_time) : Infinity;
              const isNow = isToday && ml <= 0 && me > 0;
              const isSoon = isToday && ml > 0 && ml <= 15;
              const isPast = isToday && me <= 0;
              const canJoin = isNow || isSoon;
              const name = ar ? slot.subjects?.title_ar || slot.subjects?.title : slot.subjects?.title;
              const mins = Math.round(Math.abs(ml));
              return (
                <div key={slot.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 12px", borderRadius:12, opacity: isPast ? 0.55 : 1,
                  background: isNow ? "#f0fff4" : isSoon ? "#fffbeb" : "#f8fafb", border:`1px solid ${isNow ? "#9ae6b4" : isSoon ? "#f6d860" : BORDER}` }}>
                  <div style={{ flexShrink:0, textAlign:"center", minWidth:54 }}>
                    <div style={{ fontSize:13, fontWeight:900, color: isNow ? MID_GREEN : TEXT_DARK }}>{to12hr(slot.start_time)}</div>
                    {isNow && (
                      <span style={{ display:"inline-flex", alignItems:"center", gap:3, fontSize:9, fontWeight:800, color:"#16a34a" }}>
                        <span style={{ width:6, height:6, borderRadius:"50%", background:"#22c55e", animation:"livePulse 1.6s infinite" }} />{t("LIVE","مباشر")}
                      </span>
                    )}
                    {isSoon && <span style={{ fontSize:9, fontWeight:700, color:"#b7791f" }}>{t(`in ${mins}m`, `بعد ${mins} د`)}</span>}
                    {isPast && <span style={{ fontSize:9, color:TEXT_LIGHT }}>{t("Ended","انتهى")}</span>}
                  </div>
                  <div onClick={() => slot.subject_id && navigate(`/student/subjects/${slot.subject_id}`)} style={{ flex:1, minWidth:0, cursor: slot.subject_id ? "pointer" : "default" }}>
                    <p style={{ fontSize:13, fontWeight:700, color:TEXT_DARK, margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{name}</p>
                    <p style={{ fontSize:11, color:TEXT_LIGHT, margin:"2px 0 0", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {to12hr(slot.start_time)} – {to12hr(slot.end_time)}
                      {slot.teacher?.full_name ? ` · ${slot.teacher.full_name}` : ""}
                    </p>
                  </div>
                  {canJoin && (
                    <button onClick={() => onJoin(slot)} style={{ display:"flex", alignItems:"center", gap:5, padding:"7px 14px", borderRadius:10, border:"none", flexShrink:0, cursor:"pointer", fontSize:11, fontWeight:800,
                      background: isNow ? `linear-gradient(135deg, ${MID_GREEN}, ${DARK_GREEN})` : `linear-gradient(135deg, ${GOLD_LIGHT}, ${GOLD})`, color: isNow ? "#fff" : DARK_GREEN }}>
                      <Video style={{ width:11, height:11 }} />{t("Join","انضمام")}
                    </button>
                  )}
                </div>
              );
            })}
            {daySessions.map((s: any) => {
              const name = ar ? s.subjects?.title_ar || s.subjects?.title : s.subjects?.title;
              return (
                <div key={s.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 12px", borderRadius:12, background:"#faf5ff", border:"1px solid #e9d5ff" }}>
                  <div style={{ flexShrink:0, textAlign:"center", minWidth:54 }}>
                    <div style={{ fontSize:13, fontWeight:900, color:"#6d28d9" }}>{to12hr(s.start_time)}</div>
                    <Lock style={{ width:9, height:9, color:"#7c3aed" }} />
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontSize:13, fontWeight:700, color:TEXT_DARK, margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{name || t("Private session","جلسة خاصة")}</p>
                    <p style={{ fontSize:11, color:TEXT_LIGHT, margin:"2px 0 0" }}>{to12hr(s.start_time)} – {to12hr(s.end_time)} · {t("Private session","جلسة خاصة")}</p>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </SectionCard>
  );
};

/* ── Upcoming exams (same eligibility rules as the Exams page) ─────────── */
const ExamsPreview = ({ exams, t, language, navigate }: { exams: any[]; t: any; language: string; navigate: any }) => (
  <SectionCard icon={ClipboardList} title={t("Upcoming Exams", "الامتحانات القادمة")}
    right={<LinkButton onClick={() => navigate("/student/exams")}>{t("All exams", "كل الامتحانات")} <ArrowRight style={{ width:12, height:12 }} /></LinkButton>}>
    {exams.length === 0 ? <EmptyState icon={ClipboardList} text={t("No exams waiting for you", "لا توجد امتحانات بانتظارك")} /> : (
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {exams.map((e: any) => {
          const title = language === "ar" ? (e.title_ar || e.title) : e.title;
          const end = e._extendedUntil || e.end_date;
          const st = e._status as "in_progress" | "not_started" | "available";
          return (
            <div key={e.id} onClick={() => navigate("/student/exams")} className="qa-tile"
              style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", borderRadius:12, cursor:"pointer",
                background: st === "available" ? "#fff7f5" : "#f8fafb", border:`1px solid ${st === "available" ? "#fbc4b8" : BORDER}` }}>
              <div style={{ width:8, height:8, borderRadius:"50%", flexShrink:0, background: st === "available" ? "#c0392b" : st === "in_progress" ? "#1d4ed8" : GOLD }} />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:700, color:TEXT_DARK, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{title}</div>
                <div style={{ fontSize:10, color:TEXT_LIGHT, marginTop:1 }}>
                  {st === "not_started" && e.start_date
                    ? t("Opens ", "يفتح ") + new Date(e.start_date).toLocaleString(language === "ar" ? "ar-SA" : "en-GB", { day:"numeric", month:"short", hour:"numeric", minute:"2-digit" })
                    : st === "in_progress" ? t("In progress — resume", "قيد التنفيذ — تابع")
                    : t("Open now", "متاح الآن")}
                </div>
              </div>
              {st !== "not_started" && end && <DeadlineCountdown deadline={end} t={t} compact />}
            </div>
          );
        })}
      </div>
    )}
  </SectionCard>
);

/* ── Notifications ─────────────────────────────────────────────────────── */
const NotificationsCard = ({ items, unread, expanded, onToggle, onRead, onReadAll, t, language }: {
  items: any[]; unread: number; expanded: boolean; onToggle: () => void; onRead: (id: string) => void; onReadAll: () => void; t: any; language: string;
}) => {
  if (items.length === 0) return null;
  const shown = expanded ? items : items.slice(0, 3);
  return (
    <SectionCard icon={Bell} title={t("Notifications", "الإشعارات")}
      right={
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          {unread > 0 && <span style={{ background:"#c0392b", color:"#fff", fontSize:10, fontWeight:800, padding:"2px 8px", borderRadius:20 }}>{unread}</span>}
          {unread > 0 && <LinkButton onClick={onReadAll}><CheckCheck style={{ width:12, height:12 }} /> {t("Mark all read", "تعليم الكل كمقروء")}</LinkButton>}
        </div>
      }>
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {shown.map((n: any) => (
          <div key={n.id} onClick={() => !n.is_read && onRead(n.id)} style={{ display:"flex", gap:10, padding:"9px 10px", borderRadius:12, cursor: n.is_read ? "default" : "pointer",
            background: n.is_read ? "#fafafa" : "#fffdf5", border:`1px solid ${n.is_read ? BORDER : GOLD + "55"}` }}>
            <div style={{ width:8, height:8, borderRadius:"50%", marginTop:5, flexShrink:0, background: n.is_read ? "#d1d5db" : GOLD }} />
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:"flex", justifyContent:"space-between", gap:8 }}>
                <span style={{ fontSize:12, fontWeight: n.is_read ? 600 : 800, color:TEXT_DARK }}>{n.title}</span>
                <span style={{ fontSize:10, color:TEXT_LIGHT, flexShrink:0 }}>{n.created_at ? timeAgo(n.created_at, language === "ar") : ""}</span>
              </div>
              {n.message && <p style={{ margin:"2px 0 0", fontSize:11, color:TEXT_MED, lineHeight:1.45, display:"-webkit-box", WebkitLineClamp: expanded ? 4 : 2, WebkitBoxOrient:"vertical", overflow:"hidden" }}>{n.message}</p>}
            </div>
          </div>
        ))}
      </div>
      {items.length > 3 && (
        <button onClick={onToggle} style={{ width:"100%", marginTop:10, fontSize:11, fontWeight:700, color:MID_GREEN, background:"none", border:"none", cursor:"pointer" }}>
          {expanded ? t("Show less", "عرض أقل") : t(`Show ${items.length - 3} more`, `عرض ${items.length - 3} إضافية`)}
        </button>
      )}
    </SectionCard>
  );
};

const StudentDashboard = () => {
  const { t, language } = useLanguage();
  const { user, profile, refreshProfile, hasRole } = useAuth();
  const revisionBadge = useRevisionAssignedCount(user?.id);
  const { effectiveUserId, isImpersonating } = useImpersonation();
  const { isPrivateStudent: hookPrivate, allowGeneralAccess: hookGeneral } = usePrivateStudent();
  const { settings, isExamsModuleEnabled, isTimetableModuleEnabled } = useAcademySettings();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [attempts, setAttempts] = useState<any[]>([]);
  const [eligibleExams, setEligibleExams] = useState<any[]>([]);
  const [enrollmentCount, setEnrollmentCount] = useState(0);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<{ list: any[]; subs: Record<string, any> }>({ list: [], subs: {} });
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [selectedCalDay, setSelectedCalDay] = useState<number | null>(null);
  const [showAllNotifs, setShowAllNotifs] = useState(false);
  const [dashTab, setDashTab] = useState<"timetable"|"assignments"|"notifications">("timetable");
  const [greetingSpoken, setGreetingSpoken] = useState(false);
  const [impersonatedProfile, setImpersonatedProfile] = useState<any>(null);
  const [nowTick, setNowTick] = useState(new Date());
  const firstLoad = useRef(true);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tick every 30s so countdowns stay fresh
  useEffect(() => {
    const iv = setInterval(() => setNowTick(new Date()), 30_000);
    return () => clearInterval(iv);
  }, []);

  // Load impersonated student's profile
  useEffect(() => {
    if (!isImpersonating) return;
    supabase.from("profiles").select("*").eq("user_id", effectiveUserId).maybeSingle()
      .then(({ data }) => { if (data) setImpersonatedProfile(data); });
  }, [isImpersonating, effectiveUserId]);

  const displayProfile = isImpersonating ? impersonatedProfile : profile;

  // Private/general access follows the student being viewed (not the admin viewing as them).
  const isPrivileged = hasRole("admin") || hasRole("teacher");
  const isPrivateStudent = isImpersonating ? (impersonatedProfile as any)?.student_type === "private" : hookPrivate;
  const allowGeneralAccess = isImpersonating
    ? (!isPrivateStudent || (impersonatedProfile as any)?.allow_general_access === true)
    : hookGeneral;

  // The term this student is viewing: their own switch (Settings) or the live term.
  // Everything term-scoped on this page (timetable, assignments) keys off this one id.
  const viewingTermId = useViewingTermId(displayProfile);
  const { data: termInfo } = useTermInfo(viewingTermId);
  const schedule = useStudentSchedule({
    userId: effectiveUserId,
    termId: viewingTermId,
    level: (displayProfile as any)?.level || (displayProfile as any)?.course_level || null,
    isPrivateStudent,
    enabled: !isImpersonating || !!impersonatedProfile,
  });

  // ── Voice greeting — short, simple, works everywhere ─────────
  useEffect(() => {
    if (!profile?.full_name || greetingSpoken || loading || isImpersonating) return;
    // Use sessionStorage to prevent double-play across re-renders and hot reloads
    const key = 'tahleem-greeted-' + (user?.id || '');
    if (sessionStorage.getItem(key)) { setGreetingSpoken(true); return; }

    const firstName = (profile.full_name || 'student').split(' ')[0];
    const doSpeak = (voices: SpeechSynthesisVoice[]) => {
      window.speechSynthesis.cancel();
      const pick = (filters: ((v: SpeechSynthesisVoice) => boolean)[]) => {
        for (const f of filters) { const v = voices.find(f); if (v) return v; }
        return voices[0] || null;
      };

      // Strictly Arabic male voices only
      const bestVoice = pick([
        v => /Majed|Maged|Hatem|Tarik|Basem|Mehdi|Hamed|Naief|Mohammed|Ahmad|Omar|Khalid|Ali|Zaid/i.test(v.name) && v.lang.startsWith('ar'),
        v => v.lang === 'ar-SA' && !(/female|Laila|Amira|Fatima|Maryam|Salma|Hala|Lana/i.test(v.name)),
        v => v.lang === 'ar-EG' && !(/female|Laila|Amira|Fatima|Maryam|Salma|Hala|Lana/i.test(v.name)),
        v => v.lang.startsWith('ar') && !(/female|Laila|Amira|Fatima|Maryam|Salma|Hala|Lana/i.test(v.name)),
        v => v.lang.startsWith('ar'),
      ]);

      // Only speak if we found an Arabic voice — skip otherwise to avoid non-Arabic accent
      if (!bestVoice || !bestVoice.lang.startsWith('ar')) {
        sessionStorage.setItem(key, '1');
        setGreetingSpoken(true);
        return;
      }

      const text = "السلام عليكم ورحمة الله " + firstName + " أهلًا وسهلًا بك في أكاديمية التحليم";
      const u = new SpeechSynthesisUtterance(text);
      u.lang   = 'ar-SA';
      u.rate   = 0.68;
      u.pitch  = 0.42;
      u.volume = 0.9;
      u.voice  = bestVoice;
      window.speechSynthesis.speak(u);
      sessionStorage.setItem(key, '1');
      setGreetingSpoken(true);
    };

    const trySpeak = () => {
      if (!window.speechSynthesis) return;
      const vs = window.speechSynthesis.getVoices();
      if (vs.length > 0) {
        doSpeak(vs);
      } else {
        const h = () => {
          window.speechSynthesis.removeEventListener('voiceschanged', h);
          doSpeak(window.speechSynthesis.getVoices());
        };
        window.speechSynthesis.addEventListener('voiceschanged', h);
        setTimeout(() => {
          window.speechSynthesis.removeEventListener('voiceschanged', h);
          if (!sessionStorage.getItem(key)) doSpeak(window.speechSynthesis.getVoices());
        }, 2000);
      }
    };

    const onGesture = () => {
      document.removeEventListener('click',      onGesture);
      document.removeEventListener('touchstart', onGesture);
      document.removeEventListener('keydown',    onGesture);
      setTimeout(trySpeak, 150);
    };
    document.addEventListener('click',      onGesture, { once: true });
    document.addEventListener('touchstart', onGesture, { once: true });
    document.addEventListener('keydown',    onGesture, { once: true });

    return () => {
      document.removeEventListener('click',      onGesture);
      document.removeEventListener('touchstart', onGesture);
      document.removeEventListener('keydown',    onGesture);
    };
  }, [profile?.full_name, greetingSpoken, loading, user?.id]);

  const hijri = toHijri(new Date());
  const today = new Date();

  // Is any of today's scheduled classes happening right now? (same window the timetable uses)
  const hasLiveClassNow = schedule.slots.some((slot: any) =>
    slot.day_of_week === today.getDay() && minsUntilTime(slot.start_time) <= 0 && minsUntilTime(slot.end_time) > 0);

  const handleJoinClass = async (slot: any) => {
    if (slot.live_url) { window.open(slot.live_url, "_blank", "noopener"); return; }
    if (!slot.subject_id || isImpersonating) return;
    const todayStr = localISODate(new Date());
    const { data: existing } = await supabase.from("live_sessions").select("id").eq("subject_id", slot.subject_id).in("status", ["live","scheduled","active"]).limit(1).maybeSingle();
    if (!existing) await supabase.from("live_sessions").insert({ subject_id: slot.subject_id, scheduled_at: `${todayStr}T${slot.start_time}`, duration_minutes: slot.duration_minutes||60, status: "scheduled", chat_enabled: true, hand_raise_enabled: true, recording_enabled: true, whiteboard_enabled: false, waiting_room_enabled: false } as any);
    navigate(`/student/live-classes?subject=${slot.subject_id}&autoJoin=true`);
  };

  useEffect(() => {
    if (!effectiveUserId || (isImpersonating && !impersonatedProfile)) return;
    let cancelled = false;
    const fetchData = async () => {
      setFetchError(null);
      // Fresh profile once per visit so a level / term change made elsewhere is picked up.
      if (firstLoad.current && !isImpersonating) { firstLoad.current = false; await refreshProfile().catch(() => {}); }
      try {
        const uid = effectiveUserId;

        // iOS-safe timeout: race the whole batch so the spinner never freezes on slow cellular.
        const withTimeout = <T,>(p: Promise<T>, ms = 12000): Promise<T> =>
          Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

        const [enrollRes, attemptsRes, notifsRes, assignedRes, studentProfileRes, yearRes, regsRes] = await withTimeout(Promise.all([
          supabase.from("enrollments").select("id").eq("user_id", uid),
          supabase.from("exam_attempts").select("id, exam_id, status, score, total_points, percentage, passed, submitted_at, exams(title, title_ar, type, term, session)").eq("user_id", uid).order("submitted_at", { ascending: false }),
          supabase.from("notifications").select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(20),
          supabase.from("exam_assignments").select("exam_id, extended_until, exams(*)").eq("user_id", uid),
          supabase.from("profiles").select("level, student_type, active_term_id").eq("user_id", uid).maybeSingle(),
          supabase.from("academic_years" as any).select("label").eq("is_current", true).maybeSingle(),
          supabase.from("subject_registrations").select("subject_id").eq("user_id", uid),
        ]));

        const sp: any = studentProfileRes?.data ?? null;
        const level: string | null = sp?.level || (displayProfile as any)?.level || null;
        let termId: string | null = viewingTermId || sp?.active_term_id || null;
        if (!termId) {
          const { data: ct } = await supabase.from("academic_terms").select("id").eq("is_current", true).maybeSingle();
          termId = (ct as any)?.id || null;
        }

        // ── Exam eligibility — identical rules to the Exams page ──
        const sessionLabel = (yearRes?.data as any)?.label as string | undefined;
        const asn: any[] = assignedRes.data || [];
        const subjectIds = [...new Set(asn.map(a => a.exams?.subject_id).filter(Boolean))] as string[];
        let privateSubjects = new Set<string>();
        if (subjectIds.length) {
          const { data: rows } = await supabase.from("subjects").select("id, visibility").in("id", subjectIds);
          privateSubjects = new Set((rows || []).filter((s: any) => s.visibility === "private").map((s: any) => s.id));
        }
        const registered = new Set((regsRes.data || []).map((r: any) => r.subject_id));
        const seen = new Set<string>();
        const eligible = asn
          .map(a => (a.exams ? { ...a.exams, _extendedUntil: a.extended_until } : null))
          .filter((e: any) => {
            if (!e?.id || seen.has(e.id) || !e.is_published || e.is_entrance) return false;
            if (sessionLabel && e.session && e.session !== sessionLabel) return false;
            if (e.subject_id && privateSubjects.has(e.subject_id) && !registered.has(e.subject_id)) return false;
            const levels = (e.level || "").split(",").map((l: string) => l.trim()).filter(Boolean);
            if (levels.length && level && !levels.includes(level)) return false;
            seen.add(e.id);
            return true;
          });

        const asg = await withTimeout(loadAssignments(uid, level, termId));
        if (cancelled) return;

        setEnrollmentCount(enrollRes.data?.length || 0);
        setAttempts(attemptsRes.data || []);
        setNotifications(notifsRes.data || []);
        setEligibleExams(eligible);
        setAssignments(asg);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error("Dashboard data fetch error:", err);
        setFetchError(t(
          "Unable to load your dashboard. Please check your connection and try again.",
          "تعذّر تحميل لوحة التحكم. يرجى التحقق من اتصالك والمحاولة مجدداً."
        ));
        setLoading(false);
      }
    };
    fetchData();
    return () => { cancelled = true; };
    // Re-runs when the viewed term changes, so term-scoped data never goes stale.
  }, [effectiveUserId, viewingTermId, reloadKey, impersonatedProfile?.user_id]);

  // ── Realtime notifications — live updates ─────────
  // Realtime socket kept open ONLY while the tab is visible. A backgrounded tab
  // holding an open WebSocket is what makes Android evict it outright, which on
  // return looks exactly like a full page reload (students only — the staff
  // dashboards don't stack several of these sockets).
  useVisibleRealtime(
    () => {
      if (!effectiveUserId) return null;
      return supabase
        .channel('student-notifications')
        .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${effectiveUserId}` },
        (payload) => {
          setNotifications(prev => [payload.new as any, ...prev]);
          // Browser notification if permitted — guard 'Notification in window'
          // first: some Capacitor/WebView contexts don't define it at all, and
          // referencing it directly throws a ReferenceError that ErrorBoundary
          // catches and silently reloads the whole page on.
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(payload.new.title || 'Tahleem Academy', {
              body: payload.new.message || '',
              icon: '/favicon.ico',
            });
          }
        }
      )
        .subscribe();
    },
    [effectiveUserId],
  );

  useEffect(() => {
    if (!effectiveUserId) return;
    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [effectiveUserId]);

  // ── Live sync: admin edits to the timetable / terms / assignments / exams show up without a refresh ──
  const softReload = () => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => setReloadKey(k => k + 1), 800);
  };
  useVisibleRealtime(
    () => {
      if (!effectiveUserId) return null;
      const refreshSchedule = () => queryClient.invalidateQueries({ queryKey: ["student-schedule"] });
      const refreshTerm = () => {
        queryClient.invalidateQueries({ queryKey: ["current-term-id"] });
        queryClient.invalidateQueries({ queryKey: ["academic-term"] });
        refreshSchedule(); softReload();
      };
      const pg = (table: string, cb: () => void, filter?: string) =>
        ({ table, cb, filter });
      let ch = supabase.channel("student-dashboard-sync");
      [
        pg("subject_timetable", refreshSchedule),
        pg("private_student_timetable", refreshSchedule),
        pg("private_sessions", refreshSchedule),
        pg("academic_terms", refreshTerm),
        pg("subject_assignments", softReload),
        pg("exams", softReload),
        pg("exam_assignments", softReload, `user_id=eq.${effectiveUserId}`),
        pg("exam_attempts", softReload, `user_id=eq.${effectiveUserId}`),
      ].forEach(({ table, cb, filter }) => {
        ch = ch.on("postgres_changes" as any, { event: "*", schema: "public", table, ...(filter ? { filter } : {}) }, cb);
      });
      return ch.subscribe();
    },
    [effectiveUserId],
    () => { queryClient.invalidateQueries({ queryKey: ["student-schedule"] }); queryClient.invalidateQueries({ queryKey: ["current-term-id"] }); softReload(); },
  );

  // ── Stats / upcoming exams — same definitions as Transcripts + Exams pages ──
  const { stats, upcomingExams, recentResults } = useMemo(() => {
    const now = Date.now();
    const pct = (a: any) => Number(a.percentage) || 0;
    // Only RELEASED attempts count (students never see unreleased scores), scoped to the latest session like Transcripts.
    const released = attempts.filter(a => a.status === "released");
    const sessions = [...new Set(released.map(a => a.exams?.session).filter(Boolean))].sort() as string[];
    const latest = sessions[sessions.length - 1] || null;
    const scoped = latest ? released.filter(a => a.exams?.session === latest) : released;
    const avg = scoped.length ? scoped.reduce((s, a) => s + pct(a), 0) / scoped.length : 0;
    const cgpa = scoped.length ? scoped.reduce((s, a) => s + gradePoint(pct(a)), 0) / scoped.length : 0;

    const counts: Record<string, number> = {};
    const inProgress = new Set<string>();
    attempts.forEach(a => { if (a.status === "in_progress") inProgress.add(a.exam_id); else counts[a.exam_id] = (counts[a.exam_id] || 0) + 1; });
    const rank: Record<string, number> = { in_progress: 0, available: 1, not_started: 2 };
    const upcoming = eligibleExams
      .filter(e => {
        if (inProgress.has(e.id)) return true;
        if (settings.current_term && (e.term || "first") !== settings.current_term) return false;
        if ((counts[e.id] || 0) >= (e.max_attempts || 1)) return false;
        const end = e._extendedUntil || e.end_date;
        return !(end && new Date(end).getTime() < now);
      })
      .map(e => ({ ...e, _status: inProgress.has(e.id) ? "in_progress" : e.start_date && new Date(e.start_date).getTime() > now ? "not_started" : "available" }))
      .sort((a, b) => (rank[a._status] - rank[b._status]) || (new Date(a.end_date || a.start_date || 8.64e15).getTime() - new Date(b.end_date || b.start_date || 8.64e15).getTime()))
      .slice(0, 4);

    return {
      stats: {
        enrollments: enrollmentCount, attemptsDone: scoped.length, avgScore: Math.round(avg), cgpa, session: latest,
        // submitted OR graded-but-not-yet-released: the student is still waiting on a result
        pendingGrading: attempts.filter(a => a.status === "submitted" || a.status === "graded").length,
      },
      upcomingExams: upcoming,
      recentResults: scoped.slice(0, 3),
    };
  }, [attempts, eligibleExams, enrollmentCount, settings.current_term]);

  const calendarYear = calendarMonth.getFullYear();
  const calendarMonthIdx = calendarMonth.getMonth();
  const daysInMonth = new Date(calendarYear, calendarMonthIdx + 1, 0).getDate();
  const firstDayOfWeek = new Date(calendarYear, calendarMonthIdx, 1).getDay();
  const getEventsForDay = (day: number) => {
    const dateStr = `${calendarYear}-${String(calendarMonthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const events: { type: string; title: string; color: string }[] = [];
    eligibleExams.forEach(e => { if (e.start_date && localISODate(new Date(e.start_date)) === dateStr) events.push({ type: 'exam', title: (language === "ar" ? e.title_ar : null) || e.title, color: '#c0392b' }); });
    assignments.list.forEach(a => { if (a.deadline && localISODate(new Date(a.deadline)) === dateStr) events.push({ type: 'assignment', title: (language === "ar" ? a.title_ar : null) || a.title, color: GOLD }); });
    return events;
  };
  const prevMonth = () => { setSelectedCalDay(null); setCalendarMonth(new Date(calendarYear, calendarMonthIdx - 1, 1)); };
  const nextMonth = () => { setSelectedCalDay(null); setCalendarMonth(new Date(calendarYear, calendarMonthIdx + 1, 1)); };
  // An admin viewing-as-student must never mark the student's notifications as read.
  const markAsRead = async (id: string) => {
    if (isImpersonating) return;
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
  };
  const markAllAsRead = async () => {
    if (isImpersonating) return;
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", effectiveUserId).eq("is_read", false);
  };
  const unreadCount = notifications.filter(n => !n.is_read).length;
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - ((stats.cgpa / 4.0) * circumference);

  // ── Loading / Pending State ─────────
  if (loading) return (
    <div style={{ background: CREAM, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 40, height: 40, borderRadius: "50%", border: "4px solid #064E3B", borderTopColor: "transparent", animation: "spin .7s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (fetchError) return (
    <div className="container mx-auto flex flex-col items-center justify-center px-4 py-24 text-center">
      <AlertTriangle className="mb-4 h-12 w-12 text-destructive" aria-hidden="true" />
      <h2 className="mb-2 text-xl font-bold">{t("Something went wrong", "حدث خطأ ما")}</h2>
      <p className="mb-6 max-w-sm text-muted-foreground">{fetchError}</p>
      <Button onClick={() => { setLoading(true); setFetchError(null); setReloadKey(k => k + 1); }}>
        {t("Try Again", "حاول مجدداً")}
      </Button>
    </div>
  );

  return (
    <div style={{ background: CREAM, minHeight: "100vh", fontFamily: "'Cairo', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Scheherazade+New:wght@400;700&family=Amiri+Quran&family=Amiri:wght@400;700&family=Cairo:wght@400;600;700;900&family=Playfair+Display:wght@500;700&display=swap');
        .dwani-text {
          font-family: 'Scheherazade New', 'Amiri Quran', 'Amiri', serif !important;
        }
        .qa-scroll { scrollbar-width: none; -ms-overflow-style: none; }
        .qa-scroll::-webkit-scrollbar { display: none; }
        .qa-tile { transition: transform .15s ease; }
        .qa-tile:active { transform: scale(0.94); }
        @keyframes livePulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.45); }
          50% { box-shadow: 0 0 0 6px rgba(34,197,94,0); }
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 16px 40px", display: "flex", flexDirection: "column", gap: 18 }}>

        {/* Academy status banner — holiday / maintenance */}
        <AcademyStatusBanner />
        <NotificationPermissionBanner />
        <BackgroundRunBanner />

        <div style={{
          background: `linear-gradient(160deg, ${DARK_GREEN} 0%, ${MID_GREEN} 50%, #1a5c35 100%)`,
          borderRadius: 22, overflow: "hidden", position: "relative",
          boxShadow: "0 8px 32px rgba(15,45,31,0.25)"
        }}>
          <div style={{ position:"absolute", top:-50, right:-50, width:180, height:180, borderRadius:"50%", background:"rgba(255,255,255,0.03)", pointerEvents:"none" }} />
          <div style={{ position:"absolute", bottom:-40, left:-40, width:140, height:140, borderRadius:"50%", background:"rgba(255,255,255,0.03)", pointerEvents:"none" }} />
          <div style={{ position:"absolute", top:"40%", right:-20, width:80, height:80, borderRadius:"50%", background:"rgba(201,168,76,0.06)", pointerEvents:"none" }} />

          <div style={{ padding: "20px 20px 0", position:"relative", zIndex:1 }}>
            {/* Top row: Bismillah (always centered) + Level/Type badge (flush right) */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"flex-end", gap:10, position:"relative", minHeight:20 }}>
              <span className="dwani-text" style={{ position:"absolute", left:"50%", top:"50%", transform:"translate(-50%, -50%)", fontSize:13, color:"rgba(255,255,255,0.9)", fontWeight:700, letterSpacing:"0.06em", textShadow:"0 1px 6px rgba(0,0,0,0.3)", whiteSpace:"nowrap" as const }}>
                بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ
              </span>
              {/* Level / Type badge */}
              {(() => {
                const rawLevel = (displayProfile as any)?.level || (displayProfile as any)?.course_level;
                if (isPrivateStudent) {
                  const hasAccess = allowGeneralAccess;
                  return (
                    <span style={{ display:"flex", alignItems:"center", gap:4, fontSize:10, fontWeight:800, padding:"4px 10px", borderRadius:20, flexShrink:0,
                      background: hasAccess ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.12)",
                      color:"#fff", border:"1px solid rgba(255,255,255,0.25)", backdropFilter:"blur(4px)", lineHeight:1 }}>
                      <Lock style={{ width:9, height:9, flexShrink:0 }} />
                      <span style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:1 }}>
                        <span>{hasAccess ? "Private + General" : "Private"}</span>
                        <span style={{ fontFamily:"'Amiri',serif", fontSize:9, opacity:0.85 }}>{hasAccess ? "خاص + عام" : "خاص"}</span>
                      </span>
                    </span>
                  );
                }
                const levelLabels: Record<string,{en:string;ar:string;bg:string;color:string}> = {
                  beginner:     { en:"Beginner",     ar:"مبتدئ",  bg:"rgba(34,197,94,0.2)",  color:"#86efac" },
                  intermediate: { en:"Intermediate", ar:"متوسط",  bg:"rgba(251,191,36,0.2)", color:"#fde68a" },
                  advanced:     { en:"Advanced",     ar:"متقدم",  bg:"rgba(239,68,68,0.2)",  color:"#fca5a5" },
                  tamhidi:      { en:"Tamhidi",      ar:"تمهيدي", bg:"rgba(99,102,241,0.2)", color:"#c7d2fe" },
                };
                const lc = rawLevel
                  ? (levelLabels[rawLevel] || { en: rawLevel, ar: rawLevel, bg:"rgba(255,255,255,0.12)", color:"rgba(255,255,255,0.8)" })
                  : { en: "Level not set", ar: "لم يُحدد المستوى", bg:"rgba(255,255,255,0.1)", color:"rgba(255,255,255,0.7)" };
                return (
                  <span style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:1, fontSize:10, fontWeight:800, padding:"4px 10px", borderRadius:20, flexShrink:0,
                    background:lc.bg, color:lc.color, border:`1px solid ${lc.color}44`, lineHeight:1 }}>
                    <span>{lc.en}</span>
                    <span style={{ fontFamily:"'Amiri',serif", fontSize:9, opacity:0.9 }}>{lc.ar}</span>
                  </span>
                );
              })()}
            </div>

            {/* Hijri date — its own centered line */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:10, margin:"16px 0 18px" }}>
              <div style={{ flex:1, maxWidth:50, height:"1px", background:"rgba(255,255,255,0.18)" }} />
              <div style={{ background:`linear-gradient(135deg, ${GOLD_LIGHT}, ${GOLD})`, borderRadius:30, padding:"7px 18px", display:"inline-flex", alignItems:"center", gap:8, boxShadow:`0 4px 16px ${GOLD}4d` }}>
                <Calendar style={{ width:13, height:13, color:DARK_GREEN, flexShrink:0 }} />
                <span style={{ fontSize:13, color:DARK_GREEN, fontFamily:"'Amiri',serif", fontWeight:900, whiteSpace:"nowrap" as const }} dir="rtl">{hijri.full}</span>
              </div>
              <div style={{ flex:1, maxWidth:50, height:"1px", background:"rgba(255,255,255,0.18)" }} />
            </div>

            <div style={{ textAlign:"center", paddingBottom:4 }}>
              <div style={{ margin:"0 auto 8px", textAlign:"center" }}>
                <span className="dwani-text" style={{
                  fontSize: 30,
                  fontWeight: 700,
                  color: "#fff",
                  lineHeight: 1.8,
                  display: "block",
                  letterSpacing: "0.08em",
                  textShadow: `0 2px 24px rgba(201,168,76,0.4), 0 0 60px rgba(255,255,255,0.1)`,
                  filter: "drop-shadow(0 3px 10px rgba(0,0,0,0.45))",
                }} dir="rtl">
                  ٱلسَّلَامُ عَلَيْكُم
                </span>
              </div>
              <p style={{ fontSize:18, fontWeight:700, color:"#fff", margin:"0 0 4px", letterSpacing:"-0.2px" }}>
                {t(`Marhaban, ${displayProfile?.full_name || "Student"}! 👋`, `مرحباً، ${displayProfile?.full_name || "طالب"}! 👋`)}
              </p>
              <p style={{ fontSize:12, color:"rgba(255,255,255,0.5)", margin:0, fontWeight:600 }}>
                {today.toLocaleDateString(language === "ar" ? "ar-SA" : "en-US", { weekday:"long", month:"long", day:"numeric" })}
              </p>
            </div>
          </div>
        </div>

        {/* ── Quick Actions ── */}
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
            <Star style={{ width:13, height:13, color:GOLD, fill:GOLD, flexShrink:0 }} />
            <span style={{ fontSize:15, fontWeight:800, color:TEXT_DARK, fontFamily:"'Playfair Display',serif" }}>
              {t("Quick Actions", "الإجراءات السريعة")}
            </span>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16, rowGap:18 }}>
            {([
              { to:"/student/hifdh-program", icon:Mic,           label:t("Hifdh","الحفظ"),  grad:`linear-gradient(135deg, ${MID_GREEN}, ${DARK_GREEN})`,  iconColor:"#fff", show: true, live:false, badge: revisionBadge },
              { to:"/student/live-now",     icon:Video,         label:t("Live Classes","الفصول الحية"), grad:"linear-gradient(135deg,#4299e1,#2b6cb0)",               iconColor:"#fff", show: !isPrivateStudent || allowGeneralAccess, live: hasLiveClassNow },
              { to:"/student/exams",        icon:ClipboardList, label:t("My Exams","امتحاناتي"),        grad:"linear-gradient(135deg,#48bb78,#276749)",               iconColor:"#fff", show: true, live:false },
              { to:"/student/transcripts",  icon:GraduationCap, label:t("Transcripts","السجلات"),       grad:`linear-gradient(135deg, ${GOLD_LIGHT}, ${GOLD})`,       iconColor:DARK_GREEN, show: true, live:false },
              { to:"/student/majlis",       icon:MessageCircle, label:t("Al-Majlis","المجلس"),          grad:"linear-gradient(135deg,#9f7aea,#6b46c1)",               iconColor:"#fff", show: true, live:false },
              { to:"/student/courses",      icon:BookOpen,      label:t("Courses","الدروس"),            grad:"linear-gradient(135deg,#f56565,#c0392b)",               iconColor:"#fff", show: true, live:false },
            ] as const).filter(a => a.show).map((action, i) => (
              <Link to={action.to} key={i} className="qa-tile" style={{ textDecoration:"none" }}>
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:7 }}>
                  <div style={{ position:"relative", width:"100%", maxWidth:58, margin:"0 auto" }}>
                    <div style={{ width:"100%", aspectRatio:"1", borderRadius:18, background:action.grad, display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 6px 16px rgba(15,45,31,0.18)" }}>
                      <action.icon style={{ width:24, height:24, color:action.iconColor }} />
                    </div>
                    {((action as any).badge ?? 0) > 0 && (
                      <span aria-label={`${(action as any).badge} assigned`} style={{
                        position:"absolute", top:-6, right:-6, minWidth:20, height:20, padding:"0 5px",
                        display:"flex", alignItems:"center", justifyContent:"center",
                        background:"#ef4444", color:"#fff", fontSize:11, fontWeight:800, lineHeight:1,
                        borderRadius:10, boxShadow:"0 2px 6px rgba(239,68,68,0.5)", border:"1.5px solid #fff",
                      }}>
                        {(action as any).badge > 99 ? "99+" : (action as any).badge}
                      </span>
                    )}
                    {action.live && (
                      <span style={{
                        position:"absolute", top:-6, right:-6, display:"flex", alignItems:"center", gap:3,
                        background:"#ef4444", color:"#fff", fontSize:8, fontWeight:800, letterSpacing:"0.04em",
                        borderRadius:20, padding:"2px 6px", boxShadow:"0 2px 6px rgba(239,68,68,0.5)",
                        border:"1.5px solid #fff", animation:"livePulse 1.6s infinite",
                      }}>
                        <span style={{ width:5, height:5, borderRadius:"50%", background:"#fff" }} />
                        {t("LIVE","مباشر")}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize:11, fontWeight:700, color:TEXT_DARK, textAlign:"center", lineHeight:1.25 }}>{action.label}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* ── Timetable / Assignments / Notifications — one panel, switch with tabs ── */}
        <div style={{ display:"flex", background:"#fff", borderRadius:14, border:"1px solid #eadfc8", overflow:"hidden" }}>
          {([
            { id:"timetable",     label:t("Timetable","الجدول"),       badge:0 },
            { id:"assignments",   label:t("Assignments","الواجبات"),   badge:0 },
            { id:"notifications", label:t("Notifications","الإشعارات"), badge:unreadCount },
          ] as const).map(tab => {
            const on = dashTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setDashTab(tab.id)}
                style={{ flex:1, padding:"12px 4px", border:"none", background:"transparent", cursor:"pointer", fontFamily:"inherit",
                  fontSize:13, fontWeight:on ? 800 : 600, color:on ? TEXT_DARK : TEXT_LIGHT,
                  borderBottom:`3px solid ${on ? DARK_GREEN : "transparent"}`, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
                {tab.label}
                {tab.badge > 0 && <span style={{ background:"#ef4444", color:"#fff", fontSize:10, fontWeight:800, borderRadius:20, padding:"1px 6px" }}>{tab.badge}</span>}
              </button>
            );
          })}
        </div>

        {dashTab === "timetable" && (
          <>
        {/* ── Timetable (right after quick actions · follows the viewing term) ── */}
        <DashboardTimetable
          slots={schedule.slots} sessions={schedule.privateSessions} loading={schedule.isLoading || !viewingTermId}
          term={termInfo} isCurrentTerm={termInfo ? termInfo.is_current : true}
          blocked={!isPrivileged && !isTimetableModuleEnabled}
          blockedMessage={(language === "ar" ? settings.timetable_module_message_ar : settings.timetable_module_message) || t("The timetable isn't available right now.", "الجدول الدراسي غير متاح حالياً.")}
          isPrivate={isPrivateStudent} t={t} language={language} navigate={navigate} onJoin={handleJoinClass} />
          </>
        )}
        {dashTab === "assignments" && (
          <>
        {/* ── Assignments ── */}
        <AssignmentPreview items={assignments.list} subs={assignments.subs} loading={false} t={t} language={language} navigate={navigate} />
          </>
        )}
        {dashTab === "notifications" && (
          <>
        {/* ── Notifications ── */}
        <NotificationsCard items={notifications} unread={unreadCount} expanded={showAllNotifs} onToggle={() => setShowAllNotifs(v => !v)}
          onRead={markAsRead} onReadAll={markAllAsRead} t={t} language={language} />
          </>
        )}

        {/* ── Upcoming exams ── */}
        {(isExamsModuleEnabled || isPrivileged) && (
          <ExamsPreview exams={upcomingExams} t={t} language={language} navigate={navigate} />
        )}

        {/* ── Islamic Daily Feed (Quran · Hadith · Tawheed · Seerah · Events · News) ── */}
        <IslamicDailyFeed language={language} />

        {/* ── Academic Snapshot (released results only — matches Transcripts) ── */}
        <SectionCard icon={TrendingUp} title={t("Academic Snapshot", "نظرة أكاديمية")} noPad
          right={stats.session ? <span style={{ fontSize:10, fontWeight:800, color:MID_GREEN, background:"#e8f3ec", border:"1px solid #bcd9c5", padding:"3px 10px", borderRadius:20 }}>{stats.session}</span> : undefined}>
          <div style={{ padding:"18px 16px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:18, flexWrap:"wrap" as const }}>
              <div style={{ position:"relative", flexShrink:0 }}>
                <svg width={110} height={110} style={{ transform:"rotate(-90deg)" }}>
                  <circle cx={55} cy={55} r={45} stroke={BORDER} strokeWidth={9} fill="none" />
                  <circle cx={55} cy={55} r={45} stroke={GOLD} strokeWidth={9} fill="none"
                    strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
                    style={{ transition:"stroke-dashoffset 1s ease" }} />
                </svg>
                <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
                  <span style={{ fontSize:22, fontWeight:900, color:TEXT_DARK, fontFamily:"'Playfair Display',serif" }}>{stats.cgpa.toFixed(2)}</span>
                  <span style={{ fontSize:10, fontWeight:600, color:TEXT_LIGHT }}>CGPA</span>
                </div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, flex:1, minWidth:200 }}>
                {[
                  { icon:BookOpen, label:t("Enrollments","التسجيلات"), value:stats.enrollments, color:"#276749", grad:"linear-gradient(135deg,#48bb78,#276749)", link:"/student/courses" },
                  { icon:ClipboardList, label:t("Graded Exams","اختبارات مصححة"), value:stats.attemptsDone, color:"#b7791f", grad:`linear-gradient(135deg, ${GOLD_LIGHT}, ${GOLD})`, link:"/student/transcripts" },
                  { icon:TrendingUp, label:t("Avg Score","متوسط الدرجات"), value:`${stats.avgScore}%`, color:"#2b6cb0", grad:"linear-gradient(135deg,#4299e1,#2b6cb0)", link:"/student/transcripts" },
                  { icon:Bell, label:t("Pending","بانتظار المراجعة"), value:stats.pendingGrading, color:"#c0392b", grad:"linear-gradient(135deg,#f56565,#c0392b)", link:"/student/exams" },
                ].map((s, i) => (
                  <div key={i} onClick={() => navigate(s.link)} className="qa-tile"
                    style={{ textAlign:"center", borderRadius:14, background:"#fff", padding:"12px 8px", cursor:"pointer", border:`1px solid ${BORDER}`, boxShadow:"0 2px 8px rgba(0,0,0,.04)" }}>
                    <div style={{ width:34, height:34, borderRadius:10, background:s.grad, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 7px", boxShadow:`0 3px 10px ${s.color}33` }}>
                      <s.icon style={{ width:16, height:16, color: s.color === "#b7791f" ? DARK_GREEN : "#fff" }} />
                    </div>
                    <div style={{ fontSize:20, fontWeight:900, color:TEXT_DARK }}>{s.value}</div>
                    <div style={{ fontSize:10, fontWeight:600, color:TEXT_LIGHT, marginTop:2 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {recentResults.length > 0 && (
              <div style={{ marginTop:16, paddingTop:14, borderTop:`1px solid ${BORDER}` }}>
                <div style={{ fontSize:11, fontWeight:800, color:TEXT_MED, marginBottom:8 }}>{t("Recent results", "أحدث النتائج")}</div>
                <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                  {recentResults.map((r: any) => {
                    const pct = Math.round(Number(r.percentage) || 0);
                    const title = language === "ar" ? (r.exams?.title_ar || r.exams?.title) : r.exams?.title;
                    return (
                      <div key={r.id} onClick={() => navigate(`/student/results/${r.id}`)} className="qa-tile"
                        style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 10px", borderRadius:10, cursor:"pointer", background:"#f8fafb", border:`1px solid ${BORDER}` }}>
                        <span style={{ flex:1, minWidth:0, fontSize:12, fontWeight:700, color:TEXT_DARK, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{title}</span>
                        <span style={{ fontSize:12, fontWeight:900, color: r.passed ? "#276749" : "#c0392b" }}>{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </SectionCard>

        {/* ── Academic Calendar ── */}
        <SectionCard icon={Calendar} title={t("Academic Calendar","التقويم الأكاديمي")} noPad
          right={
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <button onClick={prevMonth} aria-label="Previous month" style={{ width:28, height:28, borderRadius:8, border:`1px solid ${BORDER}`, background:"#f8fafb", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <ChevronLeft style={{ width:14, height:14, color:TEXT_MED }} />
              </button>
              <div style={{ textAlign:"center", minWidth:100 }}>
                <div style={{ fontSize:12, fontWeight:700, color:TEXT_DARK }}>
                  {calendarMonth.toLocaleDateString(language==="ar"?"ar-SA":"en-US", { month:"long", year:"numeric" })}
                </div>
                <div style={{ fontSize:9, color:TEXT_LIGHT }} dir="rtl">
                  {(() => { const h = toHijri(new Date(calendarYear, calendarMonthIdx, 15)); return `${h.month} ${h.year} هـ`; })()}
                </div>
              </div>
              <button onClick={nextMonth} aria-label="Next month" style={{ width:28, height:28, borderRadius:8, border:`1px solid ${BORDER}`, background:"#f8fafb", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <ChevronRight style={{ width:14, height:14, color:TEXT_MED }} />
              </button>
            </div>
          }>
          <div style={{ padding:"14px 14px" }}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4, marginBottom:6 }}>
              {(language==="ar" ? ["أحد","إثن","ثلا","أرب","خمي","جمع","سبت"] : ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]).map(d => (
                <div key={d} style={{ textAlign:"center", fontSize:10, fontWeight:600, color:TEXT_LIGHT, padding:"4px 0" }}>{d}</div>
              ))}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4 }}>
              {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`e${i}`} style={{ height:40 }} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1; const events = getEventsForDay(day);
                const isToday = day === today.getDate() && calendarMonthIdx === today.getMonth() && calendarYear === today.getFullYear();
                const hijriDay = toHijri(new Date(calendarYear, calendarMonthIdx, day));
                return (
                  <div key={day} onClick={() => setSelectedCalDay(day === selectedCalDay ? null : day)}
                    style={{ height:40, borderRadius:8, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", position:"relative", cursor:"pointer",
                      background: isToday ? DARK_GREEN : events.length > 0 ? "#f0fff4" : "transparent",
                      border: isToday ? `1px solid ${DARK_GREEN}` : events.length > 0 ? "1px solid #9ae6b4" : "1px solid transparent",
                      outline: selectedCalDay === day ? `2px solid ${GOLD}` : "none", outlineOffset:1,
                    }}>
                    <span style={{ fontSize:12, fontWeight: isToday || events.length > 0 ? 700 : 400, color: isToday ? "#fff" : TEXT_DARK, lineHeight:1 }}>{day}</span>
                    <span style={{ fontSize:8, color: isToday ? "rgba(255,255,255,0.6)" : TEXT_LIGHT, lineHeight:1, marginTop:1 }} dir="rtl">{hijriDay.day}</span>
                    {events.length > 0 && (
                      <div style={{ display:"flex", gap:2, position:"absolute", bottom:3 }}>
                        {events.slice(0, 3).map((e, ei) => <div key={ei} style={{ width:4, height:4, borderRadius:"50%", background:e.color }} />)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ display:"flex", gap:14, marginTop:12, flexWrap:"wrap" as const }}>
              {[["#c0392b","Exam","امتحان"],[GOLD,"Assignment","واجب"],[DARK_GREEN,"Today","اليوم"]].map(([col,en,ar], i) => (
                <div key={i} style={{ display:"flex", alignItems:"center", gap:4, fontSize:10, color:TEXT_LIGHT }}>
                  <div style={{ width:8, height:8, borderRadius:"50%", background:col }} />
                  <span style={{ fontWeight:600, color:TEXT_DARK }}>{t(en, ar)}</span>
                </div>
              ))}
            </div>
            {selectedCalDay && (() => {
              const evs = getEventsForDay(selectedCalDay);
              return (
                <div style={{ marginTop:12, padding:"10px 12px", borderRadius:12, background:"#f8fafb", border:`1px solid ${BORDER}` }}>
                  <div style={{ fontSize:11, fontWeight:800, color:TEXT_DARK, marginBottom: evs.length ? 6 : 0 }}>
                    {new Date(calendarYear, calendarMonthIdx, selectedCalDay).toLocaleDateString(language==="ar"?"ar-SA":"en-GB", { weekday:"long", day:"numeric", month:"long" })}
                  </div>
                  {evs.length === 0
                    ? <div style={{ fontSize:11, color:TEXT_LIGHT, marginTop:4 }}>{t("Nothing scheduled", "لا يوجد شيء مجدول")}</div>
                    : evs.map((e, i) => (
                        <div key={i} style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, color:TEXT_DARK, padding:"3px 0" }}>
                          <div style={{ width:7, height:7, borderRadius:"50%", background:e.color, flexShrink:0 }} />
                          <span style={{ flex:1, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{e.title}</span>
                          <span style={{ fontSize:10, color:TEXT_LIGHT }}>{e.type === "exam" ? t("Exam","امتحان") : t("Assignment","واجب")}</span>
                        </div>
                      ))}
                </div>
              );
            })()}
          </div>
        </SectionCard>
      </div>
    </div>
  );
};

export default StudentDashboard;
