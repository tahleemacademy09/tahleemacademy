import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Clock, CheckCircle, XCircle, PlayCircle,
  BookOpen, History, Star,
  Shield, Zap, Trophy, RotateCcw, Eye, ChevronRight,
} from "lucide-react";

/* ── Brand tokens ────────────────────────────────────── */
const G      = "#0f2d1f";
const GM     = "#1a4731";
const GOLD   = "#c9a84c";
const CREAM  = "#faf6ee";
const BORDER = "rgba(15,45,31,0.1)";
const TL     = "#7a9e88";

type Tab        = "available" | "completed" | "history";
type TermFilter = "all" | "first" | "second" | "third";
type TypeFilter = "all" | "exam" | "test";

const StudentExams = () => {
  const { t, language } = useLanguage();
  const { user }        = useAuth();
  const { toast }       = useToast();
  const navigate        = useNavigate();

  const [assignedExams, setAssignedExams] = useState<any[]>([]);
  const [pastAttempts,  setPastAttempts]  = useState<any[]>([]);
  const [attemptCounts, setAttemptCounts] = useState<Record<string, number>>({});
  const [loading,       setLoading]       = useState(true);
  const [tab,           setTab]           = useState<Tab>("available");
  const [termFilter,    setTermFilter]    = useState<TermFilter>("all");
  const [typeFilter,    setTypeFilter]    = useState<TypeFilter>("all");
  // Student's own level — used to filter exams by level
  const [studentLevel,  setStudentLevel]  = useState<string>("");

  useEffect(() => {
    if (!user) return;
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, [user]);

  const load = async () => {
    try {
      // Fetch student's profile level first
      const { data: profile } = await supabase
        .from("profiles")
        .select("level")
        .eq("user_id", user!.id)
        .maybeSingle();
      const myLevel = profile?.level || "";
      setStudentLevel(myLevel);

      const { data: asn } = await supabase
        .from("exam_assignments").select("exam_id, exams(*)")
        .eq("user_id", user!.id);

      // Filter: show exam if exam has no level set (all levels) OR matches student's level
      const list = (asn || [])
        .map((a: any) => a.exams)
        .filter((e: any) => {
          if (!e?.is_published) return false;
          if (!e.level || e.level === "") return true;      // exam is for all levels
          if (!myLevel) return true;                         // student has no level, show all
          return e.level === myLevel;                        // match
        });
      setAssignedExams(list);

      const { data: att } = await supabase
        .from("exam_attempts").select("*, exams(title,title_ar,max_attempts,type)")
        .eq("user_id", user!.id).order("created_at", { ascending: false });
      setPastAttempts(att || []);

      const counts: Record<string, number> = {};
      (att || []).forEach((a: any) => { if (a.status !== "in_progress") counts[a.exam_id] = (counts[a.exam_id] || 0) + 1; });
      setAttemptCounts(counts);
    } finally {
      setLoading(false);
    }
  };

  const getStatus = (exam: any) => {
    const max  = exam.max_attempts || 1;
    const done = attemptCounts[exam.id] || 0;
    if (pastAttempts.some(a => a.exam_id === exam.id && a.status === "in_progress")) return "in_progress";
    if (done >= max) return "exhausted";
    const now = Date.now();
    if (exam.start_date && new Date(exam.start_date).getTime() > now) return "not_started";
    if (exam.end_date   && new Date(exam.end_date).getTime()   < now) return "expired";
    return "available";
  };

  const handleStart = async (exam: any) => {
    const max  = exam.max_attempts || 1;
    const done = attemptCounts[exam.id] || 0;
    if (done >= max) { toast({ title: t("No attempts left","لا محاولات متبقية"), variant:"destructive" }); return; }
    const now = new Date();
    if (exam.start_date && new Date(exam.start_date) > now) { toast({ title: t("Not started yet","لم يبدأ بعد"), variant:"destructive" }); return; }
    if (exam.end_date   && new Date(exam.end_date)   < now) { toast({ title: t("Expired","منتهي"), variant:"destructive" }); return; }
    const { data: existing } = await supabase.from("exam_attempts").select("id")
      .eq("exam_id", exam.id).eq("user_id", user!.id).eq("status","in_progress").maybeSingle();
    if (existing) { navigate(`/student/exam/${existing.id}`); return; }
    navigate(`/student/exam-verify/${exam.id}`);
  };

  const applyFilters = (list: any[]) => list.filter(e => {
    if (typeFilter !== "all" && (e.type || "exam") !== typeFilter) return false;
    if (termFilter !== "all" && (e.term || "first") !== termFilter) return false;
    return true;
  });

  const available = applyFilters(assignedExams.filter(e => !["exhausted","expired"].includes(getStatus(e))));
  const completed = applyFilters(assignedExams.filter(e => getStatus(e) === "exhausted"));
  const counts    = { available: available.length, completed: completed.length, history: pastAttempts.length };

  const totalDone      = assignedExams.filter(e => getStatus(e) === "exhausted").length;
  const gradedAttempts = pastAttempts.filter(a => a.status === "graded" || a.status === "released");
  const avgPct         = gradedAttempts.length ? Math.round(gradedAttempts.reduce((s,a) => s + (a.percentage||0), 0) / gradedAttempts.length) : 0;
  const passedCount    = gradedAttempts.filter(a => a.passed).length;

  const Chip = ({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) => (
    <button onClick={onClick} style={{
      padding:"7px 15px", borderRadius:20, fontSize:12, fontWeight:700,
      cursor:"pointer", transition:"all .2s",
      background: active ? G : "#fff",
      color: active ? "#fff" : G,
      border: `1.5px solid ${active ? G : BORDER}`,
      boxShadow: active ? "0 2px 8px rgba(15,45,31,.2)" : "none",
    }}>{label}</button>
  );

  const ExamCard = ({ exam }: { exam: any }) => {
    const status  = getStatus(exam);
    const done    = attemptCounts[exam.id] || 0;
    const max     = exam.max_attempts || 1;
    const isTest  = (exam.type || "exam") === "test";
    const latest  = pastAttempts.find(a => a.exam_id === exam.id && a.status !== "in_progress");
    const title   = language === "ar" ? exam.title_ar || exam.title : exam.title;

    const SM: Record<string,{icon:string;color:string;bg:string;label:string}> = {
      available:   { icon:"▶",  color:"#22c55e", bg:"#f0fff4", label:t("Available","متاح") },
      in_progress: { icon:"⚡", color:"#f59e0b", bg:"#fffbeb", label:t("In Progress","جارٍ") },
      exhausted:   { icon:"✓",  color:"#6366f1", bg:"#eef2ff", label:t("Completed","مكتمل") },
      not_started: { icon:"🔒", color:"#9ca3af", bg:"#f9fafb", label:t("Upcoming","قادم") },
      expired:     { icon:"✗",  color:"#ef4444", bg:"#fff5f5", label:t("Expired","منتهي") },
    };
    const sm = SM[status] || SM.available;

    return (
      <div style={{
        background:"#fff", borderRadius:18, overflow:"hidden",
        border:`1.5px solid ${BORDER}`, boxShadow:"0 2px 12px rgba(15,45,31,.07)",
        marginBottom:12,
      }}>
        <div style={{ height:4, background: isTest ? "linear-gradient(90deg,#f59e0b,#fbbf24)" : `linear-gradient(90deg,${G},${GM})` }}/>
        <div style={{ padding:"16px 16px 14px" }}>

          {/* Header */}
          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:10, marginBottom:10 }}>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:5, flexWrap:"wrap" as const }}>
                <span style={{
                  fontSize:10, fontWeight:800, letterSpacing:.8, padding:"3px 9px", borderRadius:10,
                  background: isTest ? "#fffbeb" : "#f0fff4",
                  color: isTest ? "#92400e" : "#065f46",
                  border:`1px solid ${isTest ? "#fde68a" : "#86efac"}`,
                }}>
                  {isTest ? t("TEST","تمرين") : t("EXAM","امتحان")}
                </span>
                {exam.term && (
                  <span style={{ fontSize:10, color:TL, fontWeight:600 }}>
                    {exam.term === "first" ? t("Term 1","ف١") : exam.term === "second" ? t("Term 2","ف٢") : t("Term 3","ف٣")}
                  </span>
                )}
              </div>
              <h3 style={{ fontSize:15, fontWeight:800, color:G, lineHeight:1.4, margin:0 }}>{title}</h3>
            </div>
            <div style={{
              display:"flex", alignItems:"center", gap:5, padding:"5px 10px", borderRadius:12, flexShrink:0,
              background:sm.bg, border:`1px solid ${sm.color}33`,
            }}>
              <span style={{ fontSize:11 }}>{sm.icon}</span>
              <span style={{ fontSize:11, fontWeight:700, color:sm.color }}>{sm.label}</span>
            </div>
          </div>

          {/* Meta */}
          <div style={{ display:"flex", gap:14, flexWrap:"wrap" as const, marginBottom:12 }}>
            {[
              [<Clock style={{width:11,height:11}}/>,  `${exam.time_limit_minutes} ${t("min","دق")}`],
              [<Shield style={{width:11,height:11}}/>, `${t("Pass","نجاح")} ${exam.passing_score}%`],
              [<RotateCcw style={{width:11,height:11}}/>, `${done}/${max} ${t("attempts","محاولات")}`],
              ...(exam.question_count ? [[<BookOpen style={{width:11,height:11}}/>, `${exam.question_count} ${t("Qs","سؤال")}`]] : []),
            ].map(([icon, text], i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:4, fontSize:12, color:TL }}>
                {icon as React.ReactNode}<span>{text as string}</span>
              </div>
            ))}
          </div>

          {/* Dates */}
          {(exam.start_date || exam.end_date) && (
            <div style={{ display:"flex", gap:12, marginBottom:12, padding:"8px 10px", background:"#f8fafb", borderRadius:10 }}>
              {exam.start_date && (
                <div style={{ fontSize:11, color:TL }}>
                  <span style={{ fontWeight:700, color:G }}>{t("Opens","يفتح")}: </span>
                  {new Date(exam.start_date).toLocaleDateString(language==="ar"?"ar-SA":"en-US",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}
                </div>
              )}
              {exam.end_date && (
                <div style={{ fontSize:11, color:TL }}>
                  <span style={{ fontWeight:700, color:"#ef4444" }}>{t("Due","آخر")}: </span>
                  {new Date(exam.end_date).toLocaleDateString(language==="ar"?"ar-SA":"en-US",{month:"short",day:"numeric"})}
                </div>
              )}
            </div>
          )}

          {/* Score */}
          {status === "exhausted" && (latest?.status === "graded" || latest?.status === "released") && (
            <div style={{
              display:"flex", alignItems:"center", gap:10, padding:"10px 12px", borderRadius:12, marginBottom:12,
              background: latest.passed ? "#f0fff4" : "#fff5f5",
              border:`1px solid ${latest.passed ? "#86efac" : "#fca5a5"}`,
            }}>
              {latest.passed
                ? <CheckCircle style={{width:17,height:17,color:"#22c55e",flexShrink:0}}/>
                : <XCircle    style={{width:17,height:17,color:"#ef4444",flexShrink:0}}/>}
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:800, color:latest.passed ? "#065f46" : "#991b1b" }}>
                  {Math.round(latest.percentage||0)}% — {latest.passed ? t("Passed","ناجح") : t("Failed","راسب")}
                </div>
                <div style={{ fontSize:11, color:TL }}>{latest.score}/{latest.total_points} {t("points","نقطة")}</div>
              </div>
            </div>
          )}
          {status === "exhausted" && latest?.status === "submitted" && latest?.status !== "released" && (
            <div style={{ padding:"9px 12px", borderRadius:10, background:"#fffbeb", border:"1px solid #fde68a", marginBottom:12, fontSize:12, color:"#92400e", fontWeight:600 }}>
              ⏳ {t("Awaiting grading","بانتظار التصحيح")}
            </div>
          )}

          {/* CTA */}
          {status === "available" && (
            <button onClick={() => handleStart(exam)} style={{
              width:"100%", padding:"13px", borderRadius:13, border:"none", color:"#fff", fontSize:14, fontWeight:800,
              cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8,
              background:`linear-gradient(135deg,${G},${GM})`, boxShadow:"0 4px 14px rgba(15,45,31,.3)",
            }}>
              <PlayCircle style={{width:16,height:16}}/> {isTest ? t("Start Test","بدء التمرين") : t("Start Exam","بدء الامتحان")}
            </button>
          )}
          {status === "in_progress" && (
            <button onClick={() => handleStart(exam)} style={{
              width:"100%", padding:"13px", borderRadius:13, border:"none", color:"#fff", fontSize:14, fontWeight:800,
              cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8,
              background:"linear-gradient(135deg,#f59e0b,#d97706)",
            }}>
              <Zap style={{width:16,height:16}}/> {t("Continue","متابعة")}
            </button>
          )}
          {status === "exhausted" && latest && (
            <button onClick={() => navigate(`/student/results/${latest.id}`)} style={{
              width:"100%", padding:"12px", borderRadius:13, cursor:"pointer",
              background:"#fff", border:`2px solid ${G}`, color:G,
              fontSize:14, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", gap:8,
            }}>
              <Eye style={{width:15,height:15}}/> {t("View Results","عرض النتائج")}
            </button>
          )}
          {status === "not_started" && (
            <div style={{ padding:"11px 14px", borderRadius:12, background:"#f9fafb", border:"1px solid #e5e7eb", textAlign:"center", fontSize:12, color:TL, fontWeight:600 }}>
              🔒 {t("Opens","يفتح")} {exam.start_date ? new Date(exam.start_date).toLocaleDateString(language==="ar"?"ar-SA":"en-US",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}) : ""}
            </div>
          )}
          {status === "expired" && (
            <div style={{ padding:"11px 14px", borderRadius:12, background:"#fff5f5", border:"1px solid #fca5a5", textAlign:"center", fontSize:12, color:"#ef4444", fontWeight:600 }}>
              ✗ {t("This exam has expired","انتهت صلاحية هذا الامتحان")}
            </div>
          )}
        </div>
      </div>
    );
  };

  const HistoryRow = ({ attempt }: { attempt: any }) => {
    const title  = language === "ar" ? attempt.exams?.title_ar || attempt.exams?.title : attempt.exams?.title;
    const isTest = (attempt.exams?.type || "exam") === "test";
    const graded = attempt.status === "graded" || attempt.status === "released";
    const inProg = attempt.status === "in_progress";
    return (
      <div onClick={() => !inProg && navigate(`/student/results/${attempt.id}`)} style={{
        background:"#fff", borderRadius:14, border:`1px solid ${BORDER}`,
        padding:"13px 14px", marginBottom:8, cursor: inProg ? "default" : "pointer",
        display:"flex", alignItems:"center", gap:12,
        boxShadow:"0 1px 6px rgba(15,45,31,.06)",
      }}>
        <div style={{
          width:38, height:38, borderRadius:10, flexShrink:0,
          background: graded ? (attempt.passed ? "#f0fff4" : "#fff5f5") : "#f8fafb",
          display:"flex", alignItems:"center", justifyContent:"center",
          border:`1.5px solid ${graded ? (attempt.passed ? "#86efac" : "#fca5a5") : BORDER}`,
        }}>
          {graded
            ? (attempt.passed ? <CheckCircle style={{width:16,height:16,color:"#22c55e"}}/> : <XCircle style={{width:16,height:16,color:"#ef4444"}}/>)
            : attempt.status === "submitted"
            ? <Clock style={{width:16,height:16,color:"#f59e0b"}}/>
            : <PlayCircle style={{width:16,height:16,color:"#6366f1"}}/>}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:700, color:G, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>
            {title || t("Unknown exam","امتحان غير معروف")}
          </div>
          <div style={{ fontSize:11, color:TL, marginTop:2 }}>
            {new Date(attempt.created_at).toLocaleDateString(language==="ar"?"ar-SA":"en-US",{month:"short",day:"numeric",year:"numeric"})}
            <span style={{ marginLeft:8, padding:"1px 7px", borderRadius:8, fontSize:10, fontWeight:700, background: isTest ? "#fffbeb" : "#f0fff4", color: isTest ? "#92400e" : "#065f46" }}>
              {isTest ? t("Test","تمرين") : t("Exam","امتحان")}
            </span>
          </div>
        </div>
        <div style={{ textAlign:"right", flexShrink:0 }}>
          {graded && (
            <>
              <div style={{ fontSize:16, fontWeight:900, color: attempt.passed ? "#22c55e" : "#ef4444" }}>{Math.round(attempt.percentage||0)}%</div>
              <div style={{ fontSize:10, color:TL }}>{attempt.score}/{attempt.total_points}</div>
            </>
          )}
          {attempt.status === "submitted" && <div style={{ fontSize:11, fontWeight:600, color:"#f59e0b" }}>⏳ {t("Pending","قيد التصحيح")}</div>}
          {inProg && <div style={{ fontSize:11, fontWeight:600, color:"#6366f1" }}>▶ {t("In Progress","جارٍ")}</div>}
          {graded && <ChevronRight style={{width:14,height:14,color:TL,marginTop:2}}/>}
        </div>
      </div>
    );
  };

  const Empty = ({ msg }: { msg: string }) => (
    <div style={{ textAlign:"center", padding:"48px 20px", background:"#fff", borderRadius:18, border:`1px dashed ${BORDER}` }}>
      <div style={{ fontSize:40, marginBottom:12, opacity:.4 }}>📋</div>
      <p style={{ fontSize:14, color:TL, margin:0 }}>{msg}</p>
    </div>
  );

  if (loading) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:CREAM }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ width:44,height:44,border:`4px solid ${G}`,borderTopColor:"transparent",borderRadius:"50%",animation:"spin .8s linear infinite",margin:"0 auto 14px" }}/>
        <p style={{ color:TL, fontSize:14 }}>{t("Loading…","جارٍ التحميل…")}</p>
      </div>
      <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
    </div>
  );

  return (
    <div style={{ background:CREAM, minHeight:"100vh", fontFamily:"'Cairo',sans-serif" }}>
      <style>{"@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Playfair+Display:wght@700&display=swap');"}</style>
      <div style={{ maxWidth:680, margin:"0 auto", padding:"20px 16px 48px" }}>

        {/* Hero */}
        <div style={{
          background:`linear-gradient(135deg,${G} 0%,${GM} 100%)`,
          borderRadius:22, padding:"24px 22px 20px", marginBottom:20,
          boxShadow:"0 8px 32px rgba(15,45,31,.25)", position:"relative", overflow:"hidden",
        }}>
          <div style={{ position:"absolute",top:-40,right:-40,width:140,height:140,borderRadius:"50%",background:"rgba(255,255,255,.03)",pointerEvents:"none"}}/>
          <div style={{ position:"relative", zIndex:1 }}>
            <p style={{ fontSize:11,color:"rgba(255,255,255,.6)",fontWeight:700,letterSpacing:1,textTransform:"uppercase" as const,margin:"0 0 6px" }}>
              {t("My Learning","تعلمي")}
            </p>
            <h1 style={{ fontFamily:"'Playfair Display',serif",fontSize:26,fontWeight:700,color:"#fff",margin:"0 0 18px",lineHeight:1.3 }}>
              {t("Exams & Tests","الامتحانات والتمرينات")}
            </h1>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
              {[
                [<BookOpen style={{width:13,height:13}}/>, String(assignedExams.length), t("Total","إجمالي")],
                [<CheckCircle style={{width:13,height:13}}/>, String(totalDone), t("Done","منجز")],
                [<Trophy style={{width:13,height:13}}/>, String(passedCount), t("Passed","ناجح")],
                [<Star style={{width:13,height:13}}/>, gradedAttempts.length ? `${avgPct}%` : "—", t("Avg","معدل")],
              ].map(([icon, val, lbl], i) => (
                <div key={i} style={{ textAlign:"center",background:"rgba(255,255,255,.1)",borderRadius:12,padding:"10px 4px" }}>
                  <div style={{ display:"flex",justifyContent:"center",color:"rgba(255,255,255,.6)",marginBottom:3 }}>{icon as React.ReactNode}</div>
                  <div style={{ fontSize:18,fontWeight:900,color:"#fff",lineHeight:1 }}>{val as string}</div>
                  <div style={{ fontSize:9,color:"rgba(255,255,255,.5)",fontWeight:600,marginTop:2 }}>{lbl as string}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Filters */}
        <div style={{ marginBottom:16 }}>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" as const, marginBottom:9 }}>
            {([["all",t("All","الكل")],["exam",t("Exams","امتحانات")],["test",t("Tests","تمرينات")]] as [TypeFilter,string][]).map(([v,l]) => (
              <Chip key={v} active={typeFilter===v} onClick={()=>setTypeFilter(v)} label={l}/>
            ))}
          </div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" as const }}>
            {([["all",t("All Terms","كل الفصول")],["first",t("Term 1","الفصل 1")],["second",t("Term 2","الفصل 2")],["third",t("Term 3","الفصل 3")]] as [TermFilter,string][]).map(([v,l]) => (
              <Chip key={v} active={termFilter===v} onClick={()=>setTermFilter(v)} label={l}/>
            ))}
          </div>
        </div>

        {/* Tab bar */}
        <div style={{
          display:"grid", gridTemplateColumns:"1fr 1fr 1fr",
          background:"#fff", borderRadius:16, padding:4, gap:4,
          border:`1px solid ${BORDER}`, marginBottom:18,
          boxShadow:"0 2px 8px rgba(15,45,31,.06)",
        }}>
          {([
            ["available", <PlayCircle style={{width:14,height:14}}/>, t("Available","المتاحة"), counts.available],
            ["completed", <CheckCircle style={{width:14,height:14}}/>, t("Completed","المكتملة"), counts.completed],
            ["history",   <History style={{width:14,height:14}}/>, t("History","السجل"), counts.history],
          ] as [Tab,React.ReactNode,string,number][]).map(([key,icon,label,cnt]) => (
            <button key={key} onClick={() => setTab(key)} style={{
              display:"flex", flexDirection:"column" as const, alignItems:"center",
              padding:"10px 6px", borderRadius:12, border:"none", cursor:"pointer", transition:"all .2s",
              background: tab===key ? G : "transparent",
              color: tab===key ? "#fff" : TL,
            }}>
              <div style={{ display:"flex",alignItems:"center",gap:5,marginBottom:2 }}>
                {icon}
                {cnt > 0 && (
                  <span style={{
                    fontSize:10, fontWeight:900, padding:"1px 6px", borderRadius:8,
                    background: tab===key ? "rgba(255,255,255,.25)" : `${G}18`,
                    color: tab===key ? "#fff" : G,
                  }}>{cnt}</span>
                )}
              </div>
              <span style={{ fontSize:11, fontWeight:700 }}>{label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        {tab === "available" && (
          available.length === 0
            ? <Empty msg={t("No available exams at the moment.","لا توجد امتحانات متاحة الآن.")}/>
            : available.map(e => <ExamCard key={e.id} exam={e}/>)
        )}
        {tab === "completed" && (
          completed.length === 0
            ? <Empty msg={t("No completed exams yet.","لا توجد امتحانات مكتملة بعد.")}/>
            : completed.map(e => <ExamCard key={e.id} exam={e}/>)
        )}
        {tab === "history" && (
          pastAttempts.length === 0
            ? <Empty msg={t("No exam history yet.","لا يوجد سجل امتحانات بعد.")}/>
            : pastAttempts.map(a => <HistoryRow key={a.id} attempt={a}/>)
        )}

      </div>
    </div>
  );
};

export default StudentExams;
