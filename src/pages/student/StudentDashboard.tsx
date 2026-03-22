import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  BookOpen, ClipboardList, Bell, TrendingUp, Calendar, CheckCircle, XCircle,
  GraduationCap, MessageCircle, ArrowRight, Video, Star, ChevronLeft,
  ChevronRight, AlertTriangle, Info, Mic
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

const VERSES = [
  { ar: "إِنَّ مَعَ الْعُسْرِ يُسْرًا", en: "Indeed, with hardship comes ease.", ref: "Quran 94:6" },
  { ar: "وَمَن يَتَوَكَّلْ عَلَى اللَّهِ فَهُوَ حَسْبُهُ", en: "Whoever relies upon Allah, He is sufficient for him.", ref: "Quran 65:3" },
  { ar: "رَبِّ زِدْنِي عِلْمًا", en: "My Lord, increase me in knowledge.", ref: "Quran 20:114" },
  { ar: "وَاصْبِرْ فَإِنَّ اللَّهَ لَا يُضِيعُ أَجْرَ الْمُحْسِنِينَ", en: "Be patient, for Allah does not waste the reward of the righteous.", ref: "Quran 11:115" },
  { ar: "فَاذْكُرُونِي أَذْكُرْكُمْ", en: "Remember Me; I will remember you.", ref: "Quran 2:152" },
  { ar: "وَلَسَوْفَ يُعْطِيكَ رَبُّكَ فَتَرْضَىٰ", en: "And your Lord is going to give you, and you will be satisfied.", ref: "Quran 93:5" },
  { ar: "إِنَّ اللَّهَ مَعَ الصَّابِرِينَ", en: "Indeed, Allah is with the patient.", ref: "Quran 2:153" },
  { ar: "وَعَسَىٰ أَن تَكْرَهُوا شَيْئًا وَهُوَ خَيْرٌ لَّكُمْ", en: "Perhaps you dislike something which is good for you.", ref: "Quran 2:216" },
  { ar: "إِنَّ اللَّهَ لَا يُغَيِّرُ مَا بِقَوْمٍ حَتَّىٰ يُغَيِّرُوا مَا بِأَنفُسِهِمْ", en: "Allah does not change a people until they change what is within themselves.", ref: "Quran 13:11" },
];

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

const StudentDashboard = () => {
  const { t, language } = useLanguage();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [stats, setStats] = useState({ enrollments: 0, attemptsDone: 0, avgScore: 0, pendingGrading: 0, cgpa: 0 });
  const [upcomingExams, setUpcomingExams] = useState<any[]>([]);
  const [recentResults, setRecentResults] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [liveSubjects, setLiveSubjects] = useState<any[]>([]);
  const [allExamsForCalendar, setAllExamsForCalendar] = useState<any[]>([]);
  const [subjectAssignments, setSubjectAssignments] = useState<any[]>([]);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [showAllNotifs, setShowAllNotifs] = useState(false);
  const [greetingSpoken, setGreetingSpoken] = useState(false);
  const [showNotifPanel, setShowNotifPanel] = useState(false);

  // ── Voice greeting on first login ──────────────────────────────
  useEffect(() => {
    if (!profile?.full_name || greetingSpoken || loading) return;
    const timer = setTimeout(() => {
      try {
        if (!window.speechSynthesis) return;
        window.speechSynthesis.cancel();
        const firstName = profile.full_name.split(" ")[0];

        // Greeting utterance in Arabic with high quality voice
        const greet = new SpeechSynthesisUtterance();
        greet.text = `السلام عليكم ${firstName}، أهلاً وسهلاً بك في أكاديمية تعليم`;
        greet.lang = "ar-SA";
        greet.rate = 0.85;
        greet.pitch = 1.0;
        greet.volume = 1.0;

        // Pick the best Arabic voice available
        const voices = window.speechSynthesis.getVoices();
        const arVoice = voices.find(v => v.lang.startsWith("ar")) ||
                        voices.find(v => v.lang.startsWith("ar-")) ||
                        voices.find(v => v.name.toLowerCase().includes("arabic"));
        if (arVoice) greet.voice = arVoice;

        window.speechSynthesis.speak(greet);
        setGreetingSpoken(true);
      } catch (_) {}
    }, 1200);
    return () => clearTimeout(timer);
  }, [profile?.full_name, greetingSpoken, loading]);

  // ── Voice notification alert for unread notifs ───────────────
  useEffect(() => {
    if (loading || greetingSpoken) return; // wait for greeting first
    const unread = notifications.filter(n => !n.is_read);
    if (unread.length === 0) return;
    const timer = setTimeout(() => {
      try {
        if (!window.speechSynthesis) return;
        const msg = new SpeechSynthesisUtterance();
        msg.text = `لديك ${unread.length} إشعار${unread.length > 1 ? "ات" : ""} جديد${unread.length > 1 ? "ة" : ""}. اضغط على أيقونة الجرس للاطلاع عليها.`;
        msg.lang = "ar-SA";
        msg.rate = 0.9;
        msg.pitch = 1.0;
        msg.volume = 0.9;
        const voices = window.speechSynthesis.getVoices();
        const arVoice = voices.find(v => v.lang.startsWith("ar"));
        if (arVoice) msg.voice = arVoice;
        // Delay until after greeting finishes (~4s)
        window.speechSynthesis.speak(msg);
      } catch (_) {}
    }, 6000);
    return () => clearTimeout(timer);
  }, [loading, greetingSpoken, notifications.length]);

  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  const dailyVerse = VERSES[dayOfYear % VERSES.length];
  const hijri = toHijri(new Date());
  const today = new Date();

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      setFetchError(null);
      try {
        const [enrollRes, gradedAttemptsRes, pendingAttemptsRes, notifsRes, assignmentsRes,
          recentRes, allAttemptsRes, subjectsRes, calendarExamsRes, subAssignmentsRes] = await Promise.all([
          supabase.from("enrollments").select("id").eq("user_id", user.id),
          supabase.from("exam_attempts").select("percentage").eq("user_id", user.id).eq("status", "graded"),
          supabase.from("exam_attempts").select("id").eq("user_id", user.id).eq("status", "submitted"),
          supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
          supabase.from("exam_assignments").select("exam_id, exams(*)").eq("user_id", user.id),
          supabase.from("exam_attempts").select("*, exams(title, title_ar)").eq("user_id", user.id).in("status", ["graded", "submitted"]).order("submitted_at", { ascending: false }).limit(5),
          supabase.from("exam_attempts").select("exam_id, status, percentage").eq("user_id", user.id),
          supabase.from("subjects").select("*").eq("is_active", true).limit(4),
          supabase.from("exams").select("id, title, title_ar, start_date, end_date, time_limit_minutes").eq("is_published", true),
          supabase.from("subject_assignments").select("id, title, deadline, subject_id, subjects(title, title_ar)"),
        ]);
      const gradedAttempts = gradedAttemptsRes.data || [];
      const avg = gradedAttempts.length > 0 ? gradedAttempts.reduce((s, a) => s + (Number(a.percentage) || 0), 0) / gradedAttempts.length : 0;
      const totalGP = gradedAttempts.reduce((sum, a) => sum + gradePoint(Number(a.percentage) || 0), 0);
      const cgpa = gradedAttempts.length > 0 ? totalGP / gradedAttempts.length : 0;
      const attemptCounts: Record<string, number> = {};
      (allAttemptsRes.data || []).forEach((a: any) => { if (a.status !== "in_progress") attemptCounts[a.exam_id] = (attemptCounts[a.exam_id] || 0) + 1; });
      const allAssigned = (assignmentsRes.data || []).map((a: any) => a.exams).filter((e: any) => e && e.is_published);
      const upcoming = allAssigned.filter((e: any) => (attemptCounts[e.id] || 0) < (e.max_attempts || 1));
      setStats({ enrollments: enrollRes.data?.length || 0, attemptsDone: gradedAttempts.length, avgScore: Math.round(avg), pendingGrading: pendingAttemptsRes.data?.length || 0, cgpa });
      setUpcomingExams(upcoming.slice(0, 5));
      setRecentResults(recentRes.data || []);
      setNotifications(notifsRes.data || []);
      setLiveSubjects(subjectsRes.data || []);
      setAllExamsForCalendar(calendarExamsRes.data || []);
      setSubjectAssignments(subAssignmentsRes.data || []);
        setLoading(false);
      } catch (err) {
        console.error("Dashboard data fetch error:", err);
        setFetchError(t(
          "Unable to load your dashboard. Please check your connection and try again.",
          "تعذّر تحميل لوحة التحكم. يرجى التحقق من اتصالك والمحاولة مجدداً."
        ));
        setLoading(false);
      }
    };
    fetchData();
  }, [user]);

  const calendarYear = calendarMonth.getFullYear();
  const calendarMonthIdx = calendarMonth.getMonth();
  const daysInMonth = new Date(calendarYear, calendarMonthIdx + 1, 0).getDate();
  const firstDayOfWeek = new Date(calendarYear, calendarMonthIdx, 1).getDay();
  const getEventsForDay = (day: number) => {
    const dateStr = `${calendarYear}-${String(calendarMonthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const events: { type: string; title: string; color: string }[] = [];
    allExamsForCalendar.forEach(e => { if (e.start_date?.startsWith(dateStr)) events.push({ type: 'exam', title: e.title_ar || e.title, color: '#c0392b' }); });
    subjectAssignments.forEach(a => { if (a.deadline?.startsWith(dateStr)) events.push({ type: 'assignment', title: a.title, color: GOLD }); });
    return events;
  };
  const prevMonth = () => setCalendarMonth(new Date(calendarYear, calendarMonthIdx - 1, 1));
  const nextMonth = () => setCalendarMonth(new Date(calendarYear, calendarMonthIdx + 1, 1));
  const markAsRead = async (id: string) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };
  const unreadCount = notifications.filter(n => !n.is_read).length;
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - ((stats.cgpa / 4.0) * circumference);

  const card: React.CSSProperties = {
    background: "#fff", border: `1px solid ${BORDER}`,
    borderRadius: 18, boxShadow: "0 2px 12px rgba(0,0,0,.06)", overflow: "hidden",
  };

  const sectionTitle = (en: string, ar: string) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: TEXT_DARK, fontFamily: "'Playfair Display', serif" }}>{t(en, ar)}</div>
    </div>
  );

  if (loading) return (
    <div className="container mx-auto px-4 py-8">
      <Skeleton className="h-20 w-full mb-4 rounded-2xl" />
      <div className="grid gap-4 grid-cols-2 mb-4">
        {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
      <Skeleton className="h-40 w-full rounded-2xl" />
    </div>
  );

  if (fetchError) return (
    <div className="container mx-auto flex flex-col items-center justify-center px-4 py-24 text-center">
      <AlertTriangle className="mb-4 h-12 w-12 text-destructive" aria-hidden="true" />
      <h2 className="mb-2 text-xl font-bold">{t("Something went wrong", "حدث خطأ ما")}</h2>
      <p className="mb-6 max-w-sm text-muted-foreground">{fetchError}</p>
      <Button onClick={() => { setLoading(true); setFetchError(null); }}>
        {t("Try Again", "حاول مجدداً")}
      </Button>
    </div>
  );

  return (
    <div style={{ background: CREAM, minHeight: "100vh", fontFamily: "'Cairo', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Amiri+Quran&family=Amiri:wght@400;700&family=Cairo:wght@400;600;700;900&family=Playfair+Display:wght@500;700&display=swap');`}</style>

      {/* ── Global Notification Bell Overlay ── */}
      {showNotifPanel && (
        <div
          onClick={() => setShowNotifPanel(false)}
          style={{ position:"fixed", inset:0, zIndex:200, background:"rgba(0,0,0,0.45)", backdropFilter:"blur(4px)" }}>
          <div
            onClick={e => e.stopPropagation()}
            style={{ position:"absolute", top:0, right:0, left:0, maxHeight:"80vh", background:"#fff", borderRadius:"0 0 24px 24px", overflow:"hidden", boxShadow:"0 8px 40px rgba(0,0,0,0.25)", display:"flex", flexDirection:"column" }}>
            {/* Panel header */}
            <div style={{ padding:"16px 20px 14px", background:DARK_GREEN, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <Bell style={{ width:18, height:18, color:GOLD }}/>
                <span style={{ fontSize:16, fontWeight:800, color:"#fff", fontFamily:"'Playfair Display',serif" }}>
                  {t("Notifications","الإشعارات")}
                </span>
                {notifications.filter(n=>!n.is_read).length > 0 && (
                  <span style={{ fontSize:11, fontWeight:800, background:"#c0392b", color:"#fff", borderRadius:20, padding:"2px 10px" }}>
                    {notifications.filter(n=>!n.is_read).length} {t("new","جديد")}
                  </span>
                )}
              </div>
              <button onClick={() => setShowNotifPanel(false)} style={{ background:"rgba(255,255,255,.15)", border:"none", borderRadius:8, width:32, height:32, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff" }}>
                ✕
              </button>
            </div>
            {/* Notif list */}
            <div style={{ overflowY:"auto", flex:1 }}>
              {notifications.length === 0 ? (
                <div style={{ textAlign:"center", padding:"40px 20px", color:TEXT_LIGHT, fontSize:14 }}>
                  {t("No notifications yet","لا توجد إشعارات بعد")}
                </div>
              ) : notifications.map(n => (
                <div key={n.id}
                  onClick={() => !n.is_read && markAsRead(n.id)}
                  style={{ display:"flex", alignItems:"flex-start", gap:12, padding:"14px 20px", cursor:"pointer",
                    background: n.is_read ? "#fafafa" : "#fffbeb",
                    borderBottom:`1px solid ${BORDER}`,
                  }}>
                  <div style={{ width:34, height:34, borderRadius:"50%", background:n.is_read?"#f0f4f0":"#fffbeb", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, border:`1.5px solid ${n.is_read?BORDER:GOLD+"66"}` }}>
                    {n.type==="warning" ? <AlertTriangle style={{ width:14, height:14, color:GOLD }}/> :
                     n.type==="exam"    ? <ClipboardList style={{ width:14, height:14, color:"#c0392b" }}/> :
                     <Info style={{ width:14, height:14, color:MID_GREEN }}/>}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <p style={{ fontSize:13, fontWeight:n.is_read?500:700, color:TEXT_DARK, margin:0 }}>{n.title}</p>
                      {!n.is_read && <div style={{ width:7, height:7, borderRadius:"50%", background:"#c0392b", flexShrink:0 }}/>}
                    </div>
                    <p style={{ fontSize:12, color:TEXT_LIGHT, margin:"3px 0 0" }}>{n.message}</p>
                    <p style={{ fontSize:10, color:TEXT_LIGHT, margin:"4px 0 0" }}>
                      {new Date(n.created_at).toLocaleDateString(language==="ar"?"ar-SA":"en-US", { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 16px 40px", display: "flex", flexDirection: "column", gap: 18 }}>

        {/* ── Hero + Daily Verse — Merged Card ── */}
        <div style={{
          background: `linear-gradient(160deg, ${DARK_GREEN} 0%, ${MID_GREEN} 50%, #1a5c35 100%)`,
          borderRadius: 22, overflow: "hidden", position: "relative",
          boxShadow: "0 8px 32px rgba(15,45,31,0.25)"
        }}>
          {/* Decorative circles */}
          <div style={{ position:"absolute", top:-50, right:-50, width:180, height:180, borderRadius:"50%", background:"rgba(255,255,255,0.03)", pointerEvents:"none" }} />
          <div style={{ position:"absolute", bottom:-40, left:-40, width:140, height:140, borderRadius:"50%", background:"rgba(255,255,255,0.03)", pointerEvents:"none" }} />
          <div style={{ position:"absolute", top:"40%", right:-20, width:80, height:80, borderRadius:"50%", background:"rgba(201,168,76,0.06)", pointerEvents:"none" }} />

          {/* ── TOP: Greeting section ── */}
          <div style={{ padding: "24px 22px 20px", position:"relative", zIndex:1 }}>
            {/* Top row: bismillah + hijri + notification bell */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
              <span style={{ fontSize:13, color:"rgba(255,255,255,0.92)", fontFamily:"'Amiri',serif", fontWeight:700, letterSpacing:"0.1em" }}>
                بسم الله الرحمن الرحيم
              </span>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                {/* Notification bell */}
                <button
                  onClick={() => setShowNotifPanel(true)}
                  style={{ position:"relative", width:36, height:36, borderRadius:"50%", background:"rgba(255,255,255,.15)", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", backdropFilter:"blur(4px)" }}>
                  <Bell style={{ width:16, height:16, color:"#fff" }}/>
                  {notifications.filter(n=>!n.is_read).length > 0 && (
                    <span style={{ position:"absolute", top:2, right:2, width:12, height:12, borderRadius:"50%", background:"#c0392b", border:"2px solid "+DARK_GREEN, display:"flex", alignItems:"center", justifyContent:"center", fontSize:7, fontWeight:900, color:"#fff" }}>
                      {notifications.filter(n=>!n.is_read).length > 9 ? "9+" : notifications.filter(n=>!n.is_read).length}
                    </span>
                  )}
                </button>
                {/* Hijri date */}
                <div style={{ background:GOLD, borderRadius:30, padding:"6px 14px", display:"flex", alignItems:"center", gap:6, boxShadow:`0 2px 10px ${GOLD}66` }}>
                  <Calendar style={{ width:12, height:12, color:DARK_GREEN }} />
                  <span style={{ fontSize:12, color:DARK_GREEN, fontFamily:"'Amiri',serif", fontWeight:900 }} dir="rtl">{hijri.full}</span>
                </div>
              </div>
            </div>

            {/* Greeting */}
            <div style={{ textAlign:"center" }}>
              {/* Quranic-style Arabic calligraphy via Google Fonts Amiri Quran */}
              <div style={{ margin:"0 auto 6px", textAlign:"center" }}>
                <span style={{
                  fontFamily: "'Amiri Quran', 'Amiri', serif",
                  fontSize: 40,
                  fontWeight: 400,
                  color: "#fff",
                  lineHeight: 1.7,
                  display: "block",
                  letterSpacing: "0.05em",
                  textShadow: `0 2px 20px rgba(201,168,76,0.3), 0 0 60px rgba(255,255,255,0.08)`,
                  filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.4))",
                }} dir="rtl">
                  ٱلسَّلَامُ عَلَيْكُم
                </span>
              </div>
              <p style={{ fontSize:17, fontWeight:700, color:"rgba(255,255,255,0.92)", margin:"0 0 5px", letterSpacing:"-0.2px" }}>
                {t(`Marhaban, ${profile?.full_name || "Student"}! 👋`, `مرحباً، ${profile?.full_name || "طالب"}! 👋`)}
              </p>
              <p style={{ fontSize:12, color:"rgba(255,255,255,0.45)", margin:0 }}>
                {today.toLocaleDateString(language === "ar" ? "ar-SA" : "en-US", { weekday:"long", month:"long", day:"numeric" })}
              </p>
            </div>
          </div>

          {/* ── GOLD SPLICER DIVIDER ── */}
          <div style={{ position:"relative", zIndex:1, padding:"0 22px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ flex:1, height:"1.5px", background:`linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
              <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                <div style={{ width:6, height:6, borderRadius:"50%", background:GOLD }} />
                <Star style={{ width:16, height:16, color:GOLD, fill:GOLD }} />
                <div style={{ width:6, height:6, borderRadius:"50%", background:GOLD }} />
              </div>
              <div style={{ flex:1, height:"1.5px", background:`linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
            </div>
          </div>

          {/* ── BOTTOM: Daily Verse section ── */}
          <div style={{ padding:"18px 22px 24px", textAlign:"center", position:"relative", zIndex:1 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, marginBottom:14 }}>
              <Star style={{ width:14, height:14, color:GOLD, fill:GOLD }} />
              <span style={{ fontSize:13, fontWeight:800, color:GOLD, fontFamily:"'Playfair Display',serif", letterSpacing:"0.05em" }}>
                {t("Daily Quranic Reflection", "تأمل قرآني يومي")}
              </span>
              <Star style={{ width:14, height:14, color:GOLD, fill:GOLD }} />
            </div>

            <p style={{ fontFamily:"'Amiri Quran',serif", fontSize:26, lineHeight:2.2, color:"#fff", margin:"0 0 12px", direction:"rtl" }}>
              {dailyVerse.ar}
            </p>

            <div style={{ width:50, height:"1.5px", background:GOLD, margin:"0 auto 12px", borderRadius:2 }} />

            <p style={{ fontSize:13, fontStyle:"italic", color:"rgba(255,255,255,0.8)", margin:"0 0 6px" }}>
              "{dailyVerse.en}"
            </p>
            <p style={{ fontSize:12, fontWeight:800, color:GOLD, margin:0, letterSpacing:"0.05em" }}>{dailyVerse.ref}</p>
          </div>
        </div>

        {/* ── Academic Snapshot ── */}
        <div style={card}>
          <div style={{ padding:"18px 18px 0", borderBottom:`1px solid ${BORDER}`, paddingBottom:14 }}>
            <div style={{ fontSize:15, fontWeight:800, color:TEXT_DARK, fontFamily:"'Playfair Display',serif" }}>
              {t("Academic Snapshot", "نظرة أكاديمية")}
            </div>
          </div>
          <div style={{ padding:"18px 16px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:18, flexWrap:"wrap" as const }}>
              {/* CGPA Ring */}
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
              {/* Stats grid */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, flex:1 }}>
                {[
                  { icon:BookOpen, label:t("Enrollments","التسجيلات"), value:stats.enrollments, color:"#276749", bg:"#f0fff4", link:"/student/courses" },
                  { icon:ClipboardList, label:t("Graded Exams","اختبارات مصححة"), value:stats.attemptsDone, color:"#b7791f", bg:"#fffbeb", link:"/student/exams" },
                  { icon:TrendingUp, label:t("Avg Score","متوسط الدرجات"), value:`${stats.avgScore}%`, color:"#2b6cb0", bg:"#ebf8ff", link:"/student/transcripts" },
                  { icon:Bell, label:t("Pending","بانتظار المراجعة"), value:stats.pendingGrading, color:"#c0392b", bg:"#fff5f5", link:"/student/exams" },
                ].map((s,i) => (
                  <div key={i} onClick={() => navigate(s.link)}
                    style={{ textAlign:"center", borderRadius:12, background:s.bg, padding:"12px 8px", cursor:"pointer", transition:"transform .15s", border:`1px solid ${s.color}22` }}>
                    <s.icon style={{ width:20, height:20, color:s.color, margin:"0 auto 6px" }} />
                    <div style={{ fontSize:20, fontWeight:900, color:TEXT_DARK }}>{s.value}</div>
                    <div style={{ fontSize:10, fontWeight:600, color:TEXT_LIGHT, marginTop:2 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Quick Actions ── */}
        <div>
          <div style={{ fontSize:15, fontWeight:800, color:TEXT_DARK, fontFamily:"'Playfair Display',serif", marginBottom:12 }}>
            {t("Quick Actions", "الإجراءات السريعة")}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10 }}>
            {[
              { to:"/student/exams",        icon:ClipboardList, label:t("My Exams","امتحاناتي"),        ar:"امتحاناتي",    color:"#276749", bg:"#f0fff4" },
              { to:"/student/transcripts",  icon:GraduationCap, label:t("Transcripts","السجلات"),        ar:"السجلات",      color:"#b7791f", bg:"#fffbeb" },
              { to:"/student/live-classes", icon:Video,         label:t("Live Classes","الفصول الحية"), ar:"الفصول الحية", color:"#2b6cb0", bg:"#ebf8ff" },
              { to:"/student/majlis",       icon:MessageCircle, label:t("Al-Majlis","المجلس"),           ar:"المجلس",       color:"#6b46c1", bg:"#faf5ff" },
              { to:"/student/hifdh",        icon:Mic,           label:t("AI-Hifdh","الحِفظ الذكي"),     ar:"الحِفظ الذكي", color:DARK_GREEN, bg:"#f0fdf4" },
              { to:"/student/courses",      icon:BookOpen,      label:t("Courses","الدروس"),             ar:"الدروس",       color:"#c0392b", bg:"#fff5f5" },
            ].map((link,i) => (
              <Link to={link.to} key={i} style={{ textDecoration:"none" }}>
                <div style={{ ...card, display:"flex", alignItems:"center", gap:12, padding:"14px 14px", transition:"transform .15s, box-shadow .15s" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform="translateY(-2px)"; (e.currentTarget as HTMLElement).style.boxShadow="0 6px 20px rgba(0,0,0,.1)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform="none"; (e.currentTarget as HTMLElement).style.boxShadow="0 2px 12px rgba(0,0,0,.06)"; }}>
                  <div style={{ width:40, height:40, borderRadius:12, background:link.bg, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, border:`1px solid ${link.color}22` }}>
                    <link.icon style={{ width:20, height:20, color:link.color }} />
                  </div>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color:TEXT_DARK }}>{link.label}</div>
                    <div style={{ fontSize:10, color:TEXT_LIGHT }}>{link.ar}</div>
                  </div>
                  <ArrowRight style={{ width:14, height:14, color:TEXT_LIGHT, marginLeft:"auto" }} />
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* ── Notifications ── */}
        <div style={card}>
          <div style={{ padding:"16px 18px", borderBottom:`1px solid ${BORDER}`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <Bell style={{ width:16, height:16, color:GOLD }} />
              <span style={{ fontSize:15, fontWeight:800, color:TEXT_DARK, fontFamily:"'Playfair Display',serif" }}>{t("Notifications","الإشعارات")}</span>
              {unreadCount > 0 && (
                <span style={{ fontSize:10, fontWeight:700, background:"#c0392b", color:"#fff", borderRadius:20, padding:"2px 8px" }}>{unreadCount}</span>
              )}
            </div>
            {notifications.length > 3 && (
              <button onClick={() => setShowAllNotifs(v=>!v)}
                style={{ fontSize:11, fontWeight:600, color:GOLD, background:"none", border:"none", cursor:"pointer" }}>
                {showAllNotifs ? t("Show less","عرض أقل") : t("View all","عرض الكل")}
              </button>
            )}
          </div>
          <div style={{ padding:"12px 16px" }}>
            {notifications.length === 0 ? (
              <div style={{ textAlign:"center", padding:"20px 0", fontSize:13, color:TEXT_LIGHT }}>
                {t("No notifications yet","لا توجد إشعارات بعد")}
              </div>
            ) : (showAllNotifs ? notifications : notifications.slice(0,3)).map(n => (
              <div key={n.id} onClick={() => !n.is_read && markAsRead(n.id)}
                style={{ display:"flex", alignItems:"flex-start", gap:12, padding:"10px 10px", borderRadius:10, marginBottom:6, cursor:"pointer",
                  background: n.is_read ? "#f8fafb" : "#fffbeb",
                  border:`1px solid ${n.is_read ? BORDER : GOLD+"44"}`,
                }}>
                <div style={{ width:30, height:30, borderRadius:"50%", background:n.is_read?"#f0f4f0":"#fffbeb", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, border:`1px solid ${n.is_read?BORDER:GOLD+"44"}` }}>
                  {n.type==="warning" ? <AlertTriangle style={{ width:12, height:12, color:GOLD }} /> :
                   n.type==="exam"    ? <ClipboardList style={{ width:12, height:12, color:"#c0392b" }} /> :
                   <Info style={{ width:12, height:12, color:MID_GREEN }} />}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <p style={{ fontSize:13, fontWeight:n.is_read?400:700, color:TEXT_DARK, margin:0 }}>{n.title}</p>
                    {!n.is_read && <div style={{ width:7, height:7, borderRadius:"50%", background:GOLD, flexShrink:0 }} />}
                  </div>
                  <p style={{ fontSize:11, color:TEXT_LIGHT, margin:"2px 0 0" }}>{n.message}</p>
                  <p style={{ fontSize:10, color:TEXT_LIGHT, margin:"3px 0 0" }}>
                    {new Date(n.created_at).toLocaleDateString(language==="ar"?"ar-SA":"en-US", { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Academic Calendar ── */}
        <div style={card}>
          <div style={{ padding:"16px 18px", borderBottom:`1px solid ${BORDER}`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <Calendar style={{ width:16, height:16, color:MID_GREEN }} />
              <span style={{ fontSize:15, fontWeight:800, color:TEXT_DARK, fontFamily:"'Playfair Display',serif" }}>{t("Academic Calendar","التقويم الأكاديمي")}</span>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <button onClick={prevMonth} style={{ width:28, height:28, borderRadius:8, border:`1px solid ${BORDER}`, background:"#f8fafb", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <ChevronLeft style={{ width:14, height:14, color:TEXT_MED }} />
              </button>
              <div style={{ textAlign:"center", minWidth:100 }}>
                <div style={{ fontSize:12, fontWeight:700, color:TEXT_DARK }}>
                  {calendarMonth.toLocaleDateString(language==="ar"?"ar-SA":"en-US", { month:"long", year:"numeric" })}
                </div>
                <div style={{ fontSize:9, color:TEXT_LIGHT }} dir="rtl">
                  {(() => { const h=toHijri(new Date(calendarYear,calendarMonthIdx,15)); return `${h.month} ${h.year} هـ`; })()}
                </div>
              </div>
              <button onClick={nextMonth} style={{ width:28, height:28, borderRadius:8, border:`1px solid ${BORDER}`, background:"#f8fafb", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <ChevronRight style={{ width:14, height:14, color:TEXT_MED }} />
              </button>
            </div>
          </div>
          <div style={{ padding:"14px 14px" }}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4, marginBottom:6 }}>
              {(language==="ar" ? ["أحد","إثن","ثلا","أرب","خمي","جمع","سبت"] : ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]).map(d=>(
                <div key={d} style={{ textAlign:"center", fontSize:10, fontWeight:600, color:TEXT_LIGHT, padding:"4px 0" }}>{d}</div>
              ))}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4 }}>
              {Array.from({length:firstDayOfWeek}).map((_,i)=><div key={`e${i}`} style={{ height:40 }} />)}
              {Array.from({length:daysInMonth}).map((_,i)=>{
                const day=i+1; const events=getEventsForDay(day);
                const isToday=day===today.getDate()&&calendarMonthIdx===today.getMonth()&&calendarYear===today.getFullYear();
                const hijriDay=toHijri(new Date(calendarYear,calendarMonthIdx,day));
                return (
                  <div key={day} title={events.map(e=>e.title).join(", ")}
                    style={{ height:40, borderRadius:8, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", position:"relative",
                      background:isToday?DARK_GREEN:events.length>0?"#f0fff4":"transparent",
                      border: isToday?`1px solid ${DARK_GREEN}`:events.length>0?`1px solid #9ae6b4`:`1px solid transparent`,
                    }}>
                    <span style={{ fontSize:12, fontWeight:isToday||events.length>0?700:400, color:isToday?"#fff":TEXT_DARK, lineHeight:1 }}>{day}</span>
                    <span style={{ fontSize:8, color:isToday?"rgba(255,255,255,0.6)":TEXT_LIGHT, lineHeight:1, marginTop:1 }} dir="rtl">{hijriDay.day}</span>
                    {events.length>0 && (
                      <div style={{ display:"flex", gap:2, position:"absolute", bottom:3 }}>
                        {events.slice(0,3).map((e,ei)=><div key={ei} style={{ width:4, height:4, borderRadius:"50%", background:e.color }} />)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Legend */}
            <div style={{ display:"flex", gap:14, marginTop:12, flexWrap:"wrap" as const }}>
              {[["#c0392b","Exam","امتحان"],[GOLD,"Assignment","واجب"],[DARK_GREEN,"Today","اليوم"]].map(([col,en,ar],i)=>(
                <div key={i} style={{ display:"flex", alignItems:"center", gap:4, fontSize:10, color:TEXT_LIGHT }}>
                  <div style={{ width:8, height:8, borderRadius:"50%", background:col }} />
                  <span style={{ fontWeight:600, color:TEXT_DARK }}>{t(en,ar)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Agenda Tabs ── */}
        <div style={card}>
          <div style={{ padding:"16px 18px 0", borderBottom:`1px solid ${BORDER}`, paddingBottom:0 }}>
            <div style={{ fontSize:15, fontWeight:800, color:TEXT_DARK, fontFamily:"'Playfair Display',serif", marginBottom:12 }}>
              {t("Agenda","الأجندة")}
            </div>
            <Tabs defaultValue="classes" className="w-full">
              <TabsList className="w-full h-9 mb-0" style={{ background:"#f8fafb", borderRadius:"10px 10px 0 0" }}>
                <TabsTrigger value="classes" className="flex-1 text-xs">{t("Classes","الفصول")}</TabsTrigger>
                <TabsTrigger value="exams"   className="flex-1 text-xs">{t("Exams","الامتحانات")}</TabsTrigger>
                <TabsTrigger value="results" className="flex-1 text-xs">{t("Results","النتائج")}</TabsTrigger>
              </TabsList>
              <div style={{ padding:"14px 4px" }}>
                <TabsContent value="classes" className="mt-0">
                  {liveSubjects.length===0 ? (
                    <p style={{ textAlign:"center", padding:"20px 0", fontSize:13, color:TEXT_LIGHT }}>{t("No active classes","لا توجد فصول نشطة")}</p>
                  ) : liveSubjects.map((s:any)=>(
                    <Link to={`/student/subjects/${s.id}`} key={s.id} style={{ textDecoration:"none" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 12px", borderRadius:10, marginBottom:6, background:"#f8fafb", border:`1px solid ${BORDER}` }}>
                        <div style={{ width:36, height:36, borderRadius:10, background:"#f0fff4", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                          <BookOpen style={{ width:16, height:16, color:MID_GREEN }} />
                        </div>
                        <div style={{ flex:1 }}>
                          <p style={{ fontSize:13, fontWeight:700, color:TEXT_DARK, margin:0 }}>{s.title}</p>
                          {s.title_ar && <p style={{ fontSize:11, color:TEXT_LIGHT, margin:"2px 0 0" }} dir="rtl">{s.title_ar}</p>}
                        </div>
                        <ArrowRight style={{ width:14, height:14, color:TEXT_LIGHT }} />
                      </div>
                    </Link>
                  ))}
                </TabsContent>
                <TabsContent value="exams" className="mt-0">
                  {upcomingExams.length===0 ? (
                    <p style={{ textAlign:"center", padding:"20px 0", fontSize:13, color:TEXT_LIGHT }}>{t("No upcoming exams","لا توجد امتحانات قادمة")}</p>
                  ) : upcomingExams.map(exam=>(
                    <div key={exam.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 12px", borderRadius:10, marginBottom:6, background:"#fff5f5", border:"1px solid #fca5a522" }}>
                      <div>
                        <div style={{ fontSize:13, fontWeight:700, color:TEXT_DARK }} dir="auto">{language==="ar"?exam.title_ar||exam.title:exam.title}</div>
                        <div style={{ display:"flex", alignItems:"center", gap:4, fontSize:11, color:TEXT_LIGHT, marginTop:2 }}>
                          <Calendar style={{ width:10, height:10 }} />
                          {exam.start_date ? new Date(exam.start_date).toLocaleDateString() : t("TBD","غير محدد")}
                        </div>
                      </div>
                      <span style={{ fontSize:10, fontWeight:700, background:"#fff5f5", color:"#c0392b", border:"1px solid #fca5a5", borderRadius:10, padding:"3px 9px" }}>
                        {exam.time_limit_minutes} {t("min","د")}
                      </span>
                    </div>
                  ))}
                </TabsContent>
                <TabsContent value="results" className="mt-0">
                  {recentResults.length===0 ? (
                    <p style={{ textAlign:"center", padding:"20px 0", fontSize:13, color:TEXT_LIGHT }}>{t("No results yet","لا توجد نتائج بعد")}</p>
                  ) : recentResults.map(attempt=>(
                    <div key={attempt.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 12px", borderRadius:10, marginBottom:6, background:"#f8fafb", border:`1px solid ${BORDER}` }}>
                      <div>
                        <div style={{ fontSize:13, fontWeight:700, color:TEXT_DARK }} dir="auto">{language==="ar"?attempt.exams?.title_ar||attempt.exams?.title:attempt.exams?.title}</div>
                        <div style={{ fontSize:11, color:TEXT_LIGHT, marginTop:2 }}>{attempt.submitted_at ? new Date(attempt.submitted_at).toLocaleDateString() : ""}</div>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        {attempt.status==="graded" ? (
                          <>
                            {attempt.passed
                              ? <CheckCircle style={{ width:16, height:16, color:"#276749" }} />
                              : <XCircle style={{ width:16, height:16, color:"#c0392b" }} />}
                            <span style={{ fontSize:14, fontWeight:900, color:attempt.passed?"#276749":"#c0392b" }}>
                              {Math.round(attempt.percentage||0)}%
                            </span>
                          </>
                        ) : (
                          <span style={{ fontSize:10, fontWeight:700, background:"#fffbeb", color:"#b7791f", border:"1px solid #f6d860", borderRadius:10, padding:"3px 9px" }}>
                            {t("Awaiting","بانتظار")}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </TabsContent>
              </div>
            </Tabs>
          </div>
        </div>

      </div>
    </div>
  );
};

export default StudentDashboard;
