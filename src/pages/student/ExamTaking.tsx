/*  src/pages/student/ExamTaking.tsx
    Professional exam interface with review screen,
    enhanced mobile nav, auto-save indicator, fullscreen lock
*/
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/lib/logger";
import { sanitizeHtml } from "@/lib/sanitize";
import {
  Clock, Flag, Send, AlertTriangle, BookOpen, CheckCircle2,
  HelpCircle, ShieldAlert, Lock, ChevronLeft, ChevronRight,
  Save, Eye, List, Grid
} from "lucide-react";
import AudioPlayer from "@/components/exam/AudioPlayer";
import AudioRecorder from "@/components/exam/AudioRecorder";
import ProctoringOverlay from "@/components/exam/ProctoringOverlay";
import { useProctoring } from "@/hooks/useProctoring";

const G      = "#0f2d1f";
const GM     = "#1a4731";
const GOLD   = "#c9a84c";
const BORDER = "rgba(15,45,31,0.12)";

const logActivity = async (userId: string, action: string, entityType: string, entityId: string, metadata?: any) => {
  try { await supabase.from("activity_logs").insert({ user_id:userId, action, entity_type:entityType, entity_id:entityId, metadata:metadata||null }); } catch(_){}
};

function isImageUrl(url: string): boolean {
  return [".jpg",".jpeg",".png",".gif",".webp",".svg",".bmp"].some(e => url.toLowerCase().split("?")[0].endsWith(e));
}

const ExamTaking = () => {
  const { attemptId } = useParams<{ attemptId: string }>();
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [exam, setExam]           = useState<any>(null);
  const [attempt, setAttempt]     = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [answers, setAnswers]     = useState<Record<string,{text:string;data:any;flagged:boolean}>>({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [timeLeft, setTimeLeft]   = useState(0);
  const [loading, setLoading]     = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<any>(null);
  const [tabSwitches, setTabSwitches] = useState(0);
  const [phase, setPhase]         = useState<"exam"|"review"|"confirm">("exam");
  const [lastSaved, setLastSaved] = useState<Date|null>(null);
  const [saving, setSaving]       = useState(false);
  const [showNav, setShowNav]     = useState(false);

  const autoSaveRef    = useRef<NodeJS.Timeout>();
  const submittedRef   = useRef(false);
  const answersRef     = useRef(answers);
  const questionsRef   = useRef(questions);
  const examRef        = useRef(exam);
  const handleSubmitRef = useRef<()=>Promise<void>>(()=>Promise.resolve());

  const proctoringEnabled = exam?.proctoring_enabled === true;
  const proctoring = useProctoring({
    attemptId: attemptId||"", userId: user?.id||"",
    proctoring_enabled: exam?.proctoring_enabled,
    fullscreen_required: exam?.fullscreen_required,
    tab_switch_limit: exam?.tab_switch_limit,
    max_warnings: exam?.max_warnings,
    auto_submit_on_violation: exam?.auto_submit_on_violation,
    screenshot_interval_seconds: exam?.screenshot_interval_seconds,
    webcam_required: exam?.webcam_required,
    record_audio: exam?.record_audio,
  }, proctoringEnabled && !submitted && !loading, ()=>{ if(!submittedRef.current) handleSubmitRef.current(); });

  useEffect(()=>{ answersRef.current=answers; },[answers]);
  useEffect(()=>{ questionsRef.current=questions; },[questions]);
  useEffect(()=>{ examRef.current=exam; },[exam]);

  // Block right-click & copy-paste
  useEffect(()=>{
    if (submitted) return;
    const noRC  = (e:MouseEvent)  => e.preventDefault();
    const noCP  = (e:ClipboardEvent) => e.preventDefault();
    const noKey = (e:KeyboardEvent) => {
      if ((e.ctrlKey||e.metaKey) && ["c","v","x","a"].includes(e.key.toLowerCase())) e.preventDefault();
    };
    document.addEventListener("contextmenu", noRC);
    document.addEventListener("copy", noCP);
    document.addEventListener("cut", noCP);
    document.addEventListener("paste", noCP);
    document.addEventListener("keydown", noKey);
    return ()=>{
      document.removeEventListener("contextmenu", noRC);
      document.removeEventListener("copy", noCP);
      document.removeEventListener("cut", noCP);
      document.removeEventListener("paste", noCP);
      document.removeEventListener("keydown", noKey);
    };
  }, [submitted]);

  // Load exam
  useEffect(()=>{
    if (!attemptId||!user) return;
    const load = async ()=>{
      const { data: attemptData } = await supabase.from("exam_attempts").select("*, exams(*)").eq("id",attemptId).single();
      if (!attemptData||attemptData.user_id!==user.id) { navigate("/student/exams"); return; }
      setAttempt(attemptData);
      if (attemptData.status!=="in_progress") {
        setSubmitted(true); setExam(attemptData.exams);
        setSubmissionResult({ status:attemptData.status, score:attemptData.score, totalPoints:attemptData.total_points, percentage:attemptData.percentage, passed:attemptData.passed });
        setLoading(false); return;
      }
      setExam(attemptData.exams);
      const elapsed = Math.floor((Date.now()-new Date(attemptData.started_at).getTime())/1000);
      setTimeLeft(Math.max(0,(attemptData.exams.time_limit_minutes||60)*60-elapsed));
      setTabSwitches(attemptData.tab_switches||0);
      logActivity(user.id,"exam_started","exam_attempt",attemptId,{exam_id:attemptData.exam_id});
      const { data: qs } = await supabase.rpc("get_exam_questions_for_student",{_exam_id:attemptData.exam_id});
      let qList = qs||[];
      if (attemptData.exams.randomize_questions) qList=qList.sort(()=>Math.random()-.5);
      setQuestions(qList);
      const { data: ea } = await supabase.from("exam_answers").select("*").eq("attempt_id",attemptId);
      const am: Record<string,any> = {};
      (ea||[]).forEach((a:any)=>{ am[a.question_id]={text:a.answer_text||"",data:a.answer_data,flagged:a.is_flagged||false}; });
      setAnswers(am);
      setLoading(false);
    };
    load();
  },[attemptId,user]);

  // Timer
  useEffect(()=>{
    if (submitted||loading||!exam) return;
    if (timeLeft<=0) { if(!submittedRef.current) handleSubmitRef.current(); return; }
    const iv=setInterval(()=>setTimeLeft(tt=>{
      const n=Math.max(0,tt-1);
      if(n===0&&!submittedRef.current) setTimeout(()=>handleSubmitRef.current(),0);
      return n;
    }),1000);
    return ()=>clearInterval(iv);
  },[timeLeft,loading,submitted,exam]);

  // Tab switch detection
  useEffect(()=>{
    if (submitted) return;
    const handler=()=>{
      if(document.hidden){
        setTabSwitches(p=>{
          const n=p+1;
          supabase.from("exam_attempts").update({tab_switches:n}).eq("id",attemptId!);
          if(n>=3) toast({title:t("⚠️ Warning!","⚠️ تحذير!"),description:t("Tab switching detected!","تم اكتشاف تبديل النوافذ!"),variant:"destructive"});
          return n;
        });
      }
    };
    document.addEventListener("visibilitychange",handler);
    return ()=>document.removeEventListener("visibilitychange",handler);
  },[attemptId,submitted]);

  // Auto-save every 30s
  useEffect(()=>{
    if(submitted) return;
    autoSaveRef.current=setInterval(async()=>{ await saveAnswers(true); },30000);
    return ()=>clearInterval(autoSaveRef.current);
  },[answers,submitted]);

  // Prevent page refresh
  useEffect(()=>{
    if(submitted) return;
    const h=(e:BeforeUnloadEvent)=>{ e.preventDefault(); e.returnValue=""; };
    window.addEventListener("beforeunload",h);
    return ()=>window.removeEventListener("beforeunload",h);
  },[submitted]);

  const saveAnswers = async (silent=false)=>{
    if(!attemptId||submittedRef.current) return;
    if(!silent) setSaving(true);
    for (const [qId,ans] of Object.entries(answersRef.current)) {
      const { data:ex } = await supabase.from("exam_answers").select("id").eq("attempt_id",attemptId).eq("question_id",qId).maybeSingle();
      const payload:any = { answer_text:ans.text, answer_data:ans.data, is_flagged:ans.flagged };
      if(ex) await supabase.from("exam_answers").update(payload).eq("id",ex.id);
      else    await supabase.from("exam_answers").insert({attempt_id:attemptId,question_id:qId,...payload});
    }
    setLastSaved(new Date());
    if(!silent) setSaving(false);
  };

  const setAnswer=(qId:string,text:string,data?:any)=>{
    if(submitted) return;
    setAnswers(p=>({...p,[qId]:{...p[qId],text,data:data??p[qId]?.data,flagged:p[qId]?.flagged||false}}));
  };
  const toggleFlag=(qId:string)=>{
    if(submitted) return;
    setAnswers(p=>({...p,[qId]:{...p[qId],text:p[qId]?.text||"",data:p[qId]?.data,flagged:!p[qId]?.flagged}}));
  };

  const handleSubmit = useCallback(async()=>{
    if(submittedRef.current) return;
    submittedRef.current=true; setSubmitting(true); setPhase("exam");
    const ca=answersRef.current; const cq=questionsRef.current; const ce=examRef.current;
    if(attemptId){
      for(const [qId,ans] of Object.entries(ca)){
        if(!ans.text&&!ans.data) continue;
        const{data:ex}=await supabase.from("exam_answers").select("id").eq("attempt_id",attemptId).eq("question_id",qId).maybeSingle();
        const p:any={answer_text:ans.text||null,answer_data:ans.data||null,is_flagged:ans.flagged||false};
        if(ex) await supabase.from("exam_answers").update(p).eq("id",ex.id);
        else    await supabase.from("exam_answers").insert({attempt_id:attemptId,question_id:qId,...p});
      }
    }
    const{data:gr,error:ge}=await supabase.rpc("grade_exam_attempt",{_attempt_id:attemptId!});
    if(ge){
      toast({title:t("❌ Submission failed.","❌ فشل التقديم."),variant:"destructive"});
      submittedRef.current=false; setSubmitting(false); return;
    }
    const r=gr as any;
    setSubmissionResult({status:r.status,score:r.score,totalPoints:r.total_points,percentage:r.percentage,passed:r.passed});
    setSubmitted(true); setSubmitting(false);
    toast({title:t("✅ Exam Submitted!","✅ تم تقديم الامتحان!")});
    if(user) logActivity(user.id,"exam_submitted","exam_attempt",attemptId!,{exam_id:ce?.id,status:r.status,score:r.score,percentage:Math.round(r.percentage)});
  },[attemptId,user]);

  useEffect(()=>{ handleSubmitRef.current=handleSubmit; },[handleSubmit]);

  // Computed values
  const answeredCount  = Object.keys(answers).filter(k=>answers[k]?.text).length;
  const flaggedCount   = Object.values(answers).filter(a=>a?.flagged).length;
  const progressPct    = questions.length>0?(answeredCount/questions.length)*100:0;
  const isTimeCritical = timeLeft<300;
  const isTimeWarning  = timeLeft<600&&timeLeft>=300;
  const fmt=(s:number)=>`${Math.floor(s/60).toString().padStart(2,"0")}:${(s%60).toString().padStart(2,"0")}`;
  const q = questions[currentIdx];

  const timerColor = isTimeCritical?"#EF4444" : isTimeWarning?"#f59e0b" : "#22c55e";
  const timerBg    = isTimeCritical?"rgba(239,68,68,.12)" : isTimeWarning?"rgba(245,158,11,.12)" : "rgba(34,197,94,.1)";

  // ── SUBMITTED SCREEN ──
  if (submitted&&!loading) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#f8fafb", fontFamily:"'Cairo',sans-serif", padding:20 }}>
      <div style={{ background:"#fff", borderRadius:20, padding:"40px 32px", maxWidth:440, width:"100%", textAlign:"center", boxShadow:"0 8px 32px rgba(0,0,0,.08)" }}>
        <div style={{ width:80, height:80, borderRadius:"50%", background:submissionResult?.passed?"#f0fff4":"#fff5f5", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 20px" }}>
          {submissionResult?.status==="graded"
            ? submissionResult?.passed
              ? <CheckCircle2 style={{width:40,height:40,color:"#22c55e"}}/>
              : <AlertTriangle style={{width:40,height:40,color:"#EF4444"}}/>
            : <Lock style={{width:40,height:40,color:GOLD}}/>}
        </div>
        <h2 style={{ fontSize:22, fontWeight:900, color:G, marginBottom:8 }}>
          {submissionResult?.status==="graded"
            ? submissionResult?.passed?t("Exam Passed! 🎉","نجحت! 🎉"):t("Not Passed","لم تجتز")
            : t("Exam Submitted","تم تقديم الامتحان")}
        </h2>
        {submissionResult?.status==="graded" && (
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:52, fontWeight:900, color:submissionResult.passed?"#22c55e":"#EF4444", marginBottom:4 }}>
              {Math.round(submissionResult.percentage||0)}%
            </div>
            <div style={{ fontSize:14, color:"#7a9e88" }}>
              {submissionResult.score}/{submissionResult.totalPoints} {t("points","نقاط")}
            </div>
          </div>
        )}
        {submissionResult?.status==="submitted" && (
          <p style={{ fontSize:13, color:"#7a9e88", marginBottom:16, lineHeight:1.6 }}>
            {t("Submitted and awaiting grading by your instructor.","تم التقديم وبانتظار التصحيح من المدرس.")}
          </p>
        )}
        <button onClick={()=>navigate("/student/exams")}
          style={{ width:"100%", padding:"13px 0", borderRadius:12, background:G, border:"none", color:"#fff", fontSize:15, fontWeight:700, cursor:"pointer", fontFamily:"'Cairo',sans-serif" }}>
          {t("Back to Exams","العودة إلى الامتحانات")}
        </button>
      </div>
    </div>
  );

  if (loading) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#f8fafb" }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ width:48, height:48, border:`4px solid ${G}`, borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.8s linear infinite", margin:"0 auto 16px" }} />
        <p style={{ color:"#7a9e88", fontSize:14 }}>{t("Loading your exam…","جارٍ تحميل امتحانك…")}</p>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // ── REVIEW SCREEN ──
  if (phase==="review") return (
    <div style={{ minHeight:"100vh", background:"#f8fafb", fontFamily:"'Cairo',sans-serif" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      {proctoringEnabled&&!submitted&&<ProctoringOverlay cameraReady={proctoring.cameraReady} faceDetected={proctoring.faceDetected} integrityScore={proctoring.integrityScore} suspicionLevel={proctoring.suspicionLevel} strikes={proctoring.strikes} maxStrikes={proctoring.maxStrikes} violations={proctoring.violations} lastWarningType={proctoring.lastWarningType} audioMonitoring={proctoring.audioMonitoring} recentViolations={proctoring.recentViolations} getStream={proctoring.getStream} />}

      {/* Review header */}
      <div style={{ background:G, padding:"14px 18px", display:"flex", alignItems:"center", gap:12, position:"sticky", top:0, zIndex:50 }}>
        <button onClick={()=>setPhase("exam")} style={{ background:"rgba(255,255,255,.15)", border:"none", color:"#fff", borderRadius:10, padding:"7px 14px", fontSize:13, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", gap:5, fontFamily:"'Cairo',sans-serif" }}>
          <ChevronLeft style={{width:14,height:14}}/>{t("Back","عودة")}
        </button>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:15, fontWeight:700, color:"#fff" }}>{t("Review Your Answers","مراجعة إجاباتك")}</div>
          <div style={{ fontSize:11, color:"rgba(255,255,255,.6)" }}>{answeredCount}/{questions.length} answered · {flaggedCount} flagged</div>
        </div>
        <div style={{ fontSize:13, fontWeight:700, color:timerColor, background:timerBg, borderRadius:20, padding:"4px 12px", display:"flex", alignItems:"center", gap:5 }}>
          <Clock style={{width:13,height:13}}/>{fmt(timeLeft)}
        </div>
      </div>

      <div style={{ padding:"16px", maxWidth:720, margin:"0 auto" }}>
        {/* Summary cards */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:20 }}>
          {[
            {label:t("Answered","مُجاب"),value:answeredCount,color:"#22c55e",bg:"#f0fff4"},
            {label:t("Flagged","مُعلّم"),value:flaggedCount,color:GOLD,bg:"#fffbeb"},
            {label:t("Unanswered","غير مُجاب"),value:questions.length-answeredCount,color:"#EF4444",bg:"#fff5f5"},
          ].map((s,i)=>(
            <div key={i} style={{ background:s.bg, borderRadius:12, padding:"12px 10px", textAlign:"center", border:`1px solid ${s.color}22` }}>
              <div style={{ fontSize:24, fontWeight:900, color:s.color }}>{s.value}</div>
              <div style={{ fontSize:11, color:"#7a9e88", marginTop:2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Question grid */}
        <div style={{ background:"#fff", borderRadius:16, padding:"16px", marginBottom:16, border:`1px solid ${BORDER}` }}>
          <div style={{ fontSize:13, fontWeight:700, color:G, marginBottom:12 }}>{t("Question Overview","نظرة عامة على الأسئلة")}</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(42px,1fr))", gap:6 }}>
            {questions.map((qq,i)=>{
              const ans=answers[qq.id];
              const bg = i===currentIdx?"#0f2d1f" : ans?.flagged?"#fffbeb" : ans?.text?"#f0fff4" : "#f8fafb";
              const color = i===currentIdx?"#fff" : ans?.flagged?GOLD : ans?.text?"#22c55e" : "#7a9e88";
              const border = i===currentIdx?`2px solid ${G}` : ans?.flagged?`1px solid ${GOLD}` : ans?.text?`1px solid #9ae6b4`:`1px solid ${BORDER}`;
              return (
                <button key={qq.id} onClick={()=>{ setCurrentIdx(i); setPhase("exam"); }}
                  style={{ height:42, borderRadius:10, border, background:bg, color, fontSize:12, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", position:"relative" }}>
                  {i+1}
                  {ans?.flagged && <span style={{ position:"absolute", top:2, right:2, fontSize:8 }}>🚩</span>}
                </button>
              );
            })}
          </div>
          {/* Legend */}
          <div style={{ display:"flex", gap:12, marginTop:12, flexWrap:"wrap" as const }}>
            {[["#f0fff4","#9ae6b4",t("Answered","مُجاب")],["#fffbeb",GOLD,t("Flagged","مُعلّم")],["#f8fafb",BORDER,t("Unanswered","غير مُجاب")]].map(([bg,bd,lb],i)=>(
              <div key={i} style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:"#7a9e88" }}>
                <div style={{ width:14,height:14,borderRadius:4,background:bg,border:`1px solid ${bd}` }}/>
                {lb}
              </div>
            ))}
          </div>
        </div>

        {/* Unanswered warning */}
        {questions.length-answeredCount>0 && (
          <div style={{ background:"#fff5f5", borderRadius:12, padding:"12px 14px", marginBottom:16, display:"flex", alignItems:"center", gap:10, border:"1px solid #fca5a5" }}>
            <AlertTriangle style={{width:18,height:18,color:"#EF4444",flexShrink:0}}/>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:"#EF4444" }}>
                {questions.length-answeredCount} {t("question(s) unanswered","سؤال/أسئلة لم تُجب عنها")}
              </div>
              <div style={{ fontSize:11, color:"#7a9e88" }}>{t("You can still go back and answer them.","لا تزال بإمكانك العودة والإجابة عنها.")}</div>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={()=>setPhase("exam")}
            style={{ flex:1, padding:"13px 0", borderRadius:12, background:"#f8fafb", border:`1px solid ${BORDER}`, color:G, fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"'Cairo',sans-serif" }}>
            {t("← Continue Exam","← متابعة الامتحان")}
          </button>
          <button onClick={handleSubmit} disabled={submitting}
            style={{ flex:1, padding:"13px 0", borderRadius:12, background:"#EF4444", border:"none", color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"'Cairo',sans-serif", opacity:submitting?.7:1 }}>
            {submitting?t("Submitting…","جارٍ التقديم…"):t("Submit Exam ✓","تقديم الامتحان ✓")}
          </button>
        </div>
      </div>
    </div>
  );

  // ── EXAM SCREEN ──
  return (
    <div style={{ height:"100vh", display:"flex", flexDirection:"column", background:"#f5f7fa", fontFamily:"'Cairo',sans-serif", userSelect:"none", WebkitUserSelect:"none" }} onContextMenu={e=>e.preventDefault()}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>

      {/* Proctoring */}
      {proctoringEnabled&&!submitted&&(
        <ProctoringOverlay cameraReady={proctoring.cameraReady} faceDetected={proctoring.faceDetected} integrityScore={proctoring.integrityScore} suspicionLevel={proctoring.suspicionLevel} strikes={proctoring.strikes} maxStrikes={proctoring.maxStrikes} violations={proctoring.violations} lastWarningType={proctoring.lastWarningType} audioMonitoring={proctoring.audioMonitoring} recentViolations={proctoring.recentViolations} getStream={proctoring.getStream}/>
      )}

      {/* ── TOP HEADER ── */}
      <div style={{ background:G, padding:"0 14px", height:56, display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0, zIndex:40 }}>
        {/* Left: title */}
        <div style={{ display:"flex", alignItems:"center", gap:8, minWidth:0, flex:1 }}>
          <BookOpen style={{width:16,height:16,color:GOLD,flexShrink:0}}/>
          <span style={{ fontSize:13, fontWeight:700, color:"#fff", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>
            {language==="ar"?exam?.title_ar||exam?.title:exam?.title}
          </span>
        </div>

        {/* Center: timer */}
        <div style={{ display:"flex", alignItems:"center", gap:5, background:timerBg, border:`1px solid ${timerColor}44`, borderRadius:20, padding:"5px 12px", flexShrink:0, animation:isTimeCritical?"pulse 1s infinite":"none" }}>
          <Clock style={{width:13,height:13,color:timerColor}}/>
          <span style={{ fontSize:14, fontWeight:900, color:timerColor, fontVariantNumeric:"tabular-nums" }}>{fmt(timeLeft)}</span>
        </div>

        {/* Right: actions */}
        <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0, marginLeft:8 }}>
          {/* Auto-save indicator */}
          <div style={{ fontSize:10, color:"rgba(255,255,255,.5)", display:"flex", alignItems:"center", gap:3 }}>
            {saving ? (
              <><div style={{width:8,height:8,border:"1px solid rgba(255,255,255,.5)",borderTopColor:"transparent",borderRadius:"50%",animation:"spin .8s linear infinite"}}/> Saving</>
            ) : lastSaved ? (
              <><div style={{width:6,height:6,borderRadius:"50%",background:"#22c55e"}}/> Saved</>
            ) : null}
          </div>
          {/* Progress */}
          <div style={{ fontSize:11, color:"rgba(255,255,255,.7)", background:"rgba(255,255,255,.1)", borderRadius:20, padding:"3px 10px" }}>
            {answeredCount}/{questions.length}
          </div>
          {/* Violations */}
          {tabSwitches>0 && (
            <div style={{ fontSize:10, color:"#fca5a5", display:"flex", alignItems:"center", gap:3 }}>
              <AlertTriangle style={{width:11,height:11}}/>{tabSwitches}
            </div>
          )}
          {/* Save manually */}
          <button onClick={()=>saveAnswers(false)} style={{ background:"rgba(255,255,255,.12)", border:"none", color:"rgba(255,255,255,.8)", borderRadius:8, padding:"5px 8px", cursor:"pointer" }}>
            <Save style={{width:13,height:13}}/>
          </button>
          {/* Nav toggle (mobile) */}
          <button onClick={()=>setShowNav(v=>!v)} style={{ background:"rgba(255,255,255,.12)", border:"none", color:"rgba(255,255,255,.8)", borderRadius:8, padding:"5px 8px", cursor:"pointer" }} className="lg:hidden">
            <Grid style={{width:13,height:13}}/>
          </button>
          {/* Submit */}
          <button onClick={()=>{ saveAnswers(true); setPhase("review"); }}
            style={{ background:"#EF4444", border:"none", color:"#fff", borderRadius:10, padding:"6px 14px", fontSize:12, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", gap:5, fontFamily:"'Cairo',sans-serif" }}>
            <Eye style={{width:13,height:13}}/><span>{t("Review","مراجعة")}</span>
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height:3, background:"rgba(15,45,31,.1)", flexShrink:0 }}>
        <div style={{ height:"100%", width:`${progressPct}%`, background:`linear-gradient(90deg,${GM},${GOLD})`, transition:"width .5s" }} />
      </div>

      {/* ── MAIN CONTENT ── */}
      <div style={{ flex:1, display:"flex", overflow:"hidden", position:"relative" }}>

        {/* LEFT: Question navigator (desktop) */}
        <div className="hidden lg:flex" style={{ width:200, background:"#fff", borderRight:`1px solid ${BORDER}`, flexDirection:"column", overflow:"hidden", flexShrink:0 }}>
          <div style={{ padding:"12px 12px 8px", borderBottom:`1px solid ${BORDER}` }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#7a9e88", letterSpacing:1, marginBottom:8 }}>QUESTIONS</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:5 }}>
              {questions.map((qq,i)=>{
                const a=answers[qq.id];
                return (
                  <button key={qq.id} onClick={()=>setCurrentIdx(i)}
                    style={{ height:36, borderRadius:8, border:"none", fontSize:11, fontWeight:700, cursor:"pointer", transition:"all .15s",
                      background:i===currentIdx?G:a?.flagged?"#fffbeb":a?.text?"#f0fff4":"#f8fafb",
                      color:i===currentIdx?"#fff":a?.flagged?GOLD:a?.text?"#22c55e":"#7a9e88",
                      outline:i===currentIdx?`2px solid ${GOLD}`:""
                    }}>
                    {i+1}
                  </button>
                );
              })}
            </div>
          </div>
          {/* Legend */}
          <div style={{ padding:"10px 12px", fontSize:10, display:"flex", flexDirection:"column", gap:5 }}>
            {[["#f0fff4","#9ae6b4","#22c55e",`Answered (${answeredCount})`],["#fffbeb",GOLD,GOLD,`Flagged (${flaggedCount})`],["#f8fafb",BORDER,"#7a9e88",`Unanswered (${questions.length-answeredCount})`]].map(([bg,bd,c,lb],i)=>(
              <div key={i} style={{ display:"flex", alignItems:"center", gap:6 }}>
                <div style={{ width:12,height:12,borderRadius:3,background:bg,border:`1px solid ${bd}`,flexShrink:0 }}/>
                <span style={{ color:"#7a9e88" }}>{lb}</span>
              </div>
            ))}
          </div>
          {/* Summary */}
          <div style={{ marginTop:"auto", padding:"10px 12px", borderTop:`1px solid ${BORDER}`, fontSize:11, display:"flex", flexDirection:"column", gap:4 }}>
            <div style={{ display:"flex", justifyContent:"space-between", color:"#7a9e88" }}>
              <span>{t("Pass Mark","درجة النجاح")}</span><span style={{ fontWeight:700, color:G }}>{exam?.passing_score}%</span>
            </div>
            {exam?.guidelines && (
              <div style={{ fontSize:10, color:"#7a9e88", background:"#f8fafb", borderRadius:8, padding:"6px 8px", lineHeight:1.4 }}>
                {language==="ar"?exam.guidelines_ar||exam.guidelines:exam.guidelines}
              </div>
            )}
          </div>
        </div>

        {/* CENTER: Question card */}
        <div style={{ flex:1, overflow:"auto", padding:"16px" }}>
          {q && (
            <div style={{ maxWidth:680, margin:"0 auto" }}>
              <div style={{ background:"#fff", borderRadius:18, boxShadow:"0 2px 16px rgba(0,0,0,.08)", overflow:"hidden" }}>
                {/* Question header bar */}
                <div style={{ background:`linear-gradient(135deg,${G},${GM})`, padding:"14px 18px", display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ width:30, height:30, borderRadius:"50%", background:"rgba(255,255,255,.15)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:900, color:"#fff", flexShrink:0 }}>
                    {currentIdx+1}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap" as const }}>
                      <span style={{ fontSize:10, padding:"2px 8px", borderRadius:20, background:"rgba(255,255,255,.15)", color:"rgba(255,255,255,.9)", fontWeight:600 }}>
                        {q.question_type?.replace("_"," ")}
                      </span>
                      {q.difficulty && (
                        <span style={{ fontSize:10, padding:"2px 8px", borderRadius:20, background:q.difficulty==="hard"?"rgba(239,68,68,.3)":q.difficulty==="easy"?"rgba(34,197,94,.3)":"rgba(255,255,255,.15)", color:"#fff", fontWeight:600 }}>
                          {q.difficulty}
                        </span>
                      )}
                      <span style={{ fontSize:10, padding:"2px 8px", borderRadius:20, background:`rgba(201,168,76,.3)`, color:GOLD, fontWeight:700, marginLeft:"auto" }}>
                        {q.points||1} {t("pts","نقطة")}
                      </span>
                    </div>
                  </div>
                  {/* Flag button */}
                  <button onClick={()=>toggleFlag(q.id)}
                    style={{ width:32, height:32, borderRadius:"50%", border:"none", background:answers[q.id]?.flagged?"#EF4444":"rgba(255,255,255,.15)", color:"#fff", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    <Flag style={{width:14,height:14}}/>
                  </button>
                </div>

                <div style={{ padding:"20px 20px" }}>
                  {/* Question text */}
                  <div style={{ marginBottom:20, direction:exam?.rtl_mode?"rtl":"ltr" }}>
                    {q.question_text && (
                      <div className="font-medium leading-relaxed prose prose-sm max-w-none" dir="auto"
                        style={{ fontSize:`${q.custom_format?.font_size||exam?.question_font_size||16}px`, fontFamily:exam?.question_font_family||"Cairo", lineHeight:exam?.question_line_height||1.7, fontWeight:q.custom_format?.bold||exam?.question_bold?"bold":"normal", color:q.custom_format?.color||exam?.question_color||G }}
                        dangerouslySetInnerHTML={{__html:sanitizeHtml(q.question_text)}}/>
                    )}
                    {q.question_text_ar && q.question_text_ar!==q.question_text && (
                      <div className="arabic-exam-text mt-2" style={{ fontSize:`${exam?.question_font_size||16}px`, lineHeight:exam?.question_line_height||1.7, color:G }}
                        dangerouslySetInnerHTML={{__html:sanitizeHtml(q.question_text_ar)}}/>
                    )}
                    {!q.question_text&&!q.question_text_ar && <p style={{ color:"#7a9e88", fontStyle:"italic", fontSize:13 }}>Question text missing.</p>}

                    {/* Media */}
                    {q.media_url&&(q.question_type==="audio"||q.question_type==="dictation")&&<div style={{marginTop:12}}><AudioPlayer src={q.media_url} title={t("Listen carefully","استمع بعناية")} maxPlays={3}/></div>}
                    {q.media_url&&q.question_type==="video"&&<div style={{marginTop:12,borderRadius:12,overflow:"hidden"}}><video controls src={q.media_url} style={{width:"100%",maxHeight:240,background:"#000"}}/></div>}
                    {q.media_url&&isImageUrl(q.media_url)&&!["audio","dictation","video"].includes(q.question_type)&&<img src={q.media_url} alt="Q" style={{marginTop:12,maxHeight:240,borderRadius:10,objectFit:"contain"}}/>}
                    {q.media_url&&!isImageUrl(q.media_url)&&!["audio","dictation","video"].includes(q.question_type)&&<div style={{marginTop:12}}><AudioPlayer src={q.media_url} title={t("Audio","صوت")}/></div>}
                  </div>

                  {/* MCQ */}
                  {(q.question_type==="mcq"||q.question_type==="image_mcq") && q.options && (
                    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                      {(q.options as any[]).map((opt:any,idx:number)=>{
                        const sel=answers[q.id]?.text===opt.id;
                        return (
                          <div key={opt.id} onClick={()=>setAnswer(q.id,opt.id)}
                            style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", borderRadius:12, cursor:"pointer", transition:"all .15s",
                              background:sel?"#f0fff4":"#f8fafb",
                              border:`2px solid ${sel?"#22c55e":BORDER}`,
                              boxShadow:sel?"0 2px 8px rgba(34,197,94,.15)":"none",
                            }}>
                            <div style={{ width:28, height:28, borderRadius:"50%", background:sel?GM:"rgba(15,45,31,.08)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, color:sel?"#fff":G, flexShrink:0 }}>
                              {String.fromCharCode(65+idx)}
                            </div>
                            {opt.image_url&&<img src={opt.image_url} alt={`Option ${String.fromCharCode(65+idx)}`} style={{height:64,borderRadius:8,objectFit:"contain"}}/>}
                            <div style={{ flex:1, fontSize:14, color:sel?G:"#374151", fontWeight:sel?600:400 }}
                              dangerouslySetInnerHTML={{__html:sanitizeHtml(opt.text||"")}}/>
                            {sel && <div style={{ width:20, height:20, borderRadius:"50%", background:"#22c55e", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>✓</div>}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* True/False */}
                  {q.question_type==="true_false" && (
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                      {[{v:"true",l:t("True","صح"),e:"✓",c:"#22c55e"},{v:"false",l:t("False","خطأ"),e:"✗",c:"#EF4444"}].map(opt=>{
                        const sel=answers[q.id]?.text===opt.v;
                        return (
                          <div key={opt.v} onClick={()=>setAnswer(q.id,opt.v)}
                            style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"20px 12px", borderRadius:14, cursor:"pointer", transition:"all .15s",
                              background:sel?opt.c+"18":"#f8fafb",
                              border:`2px solid ${sel?opt.c:BORDER}`,
                            }}>
                            <span style={{ fontSize:28, marginBottom:6 }}>{opt.e}</span>
                            <span style={{ fontSize:16, fontWeight:700, color:sel?opt.c:G }}>{opt.l}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Fill blank */}
                  {q.question_type==="fill_blank" && (
                    <input placeholder={t("Type your answer…","اكتب إجابتك…")} value={answers[q.id]?.text||""} onChange={e=>setAnswer(q.id,e.target.value)}
                      style={{ width:"100%", padding:"12px 14px", borderRadius:12, border:`2px solid ${BORDER}`, fontSize:15, outline:"none", color:G, background:"#f8fafb", boxSizing:"border-box" as const, transition:"border .15s" }}
                      onFocus={e=>(e.target.style.borderColor=GM)} onBlur={e=>(e.target.style.borderColor=BORDER)} />
                  )}

                  {/* Short answer / Essay */}
                  {(q.question_type==="short_answer"||q.question_type==="essay") && (
                    <textarea rows={q.question_type==="essay"?8:4} placeholder={t("Write your answer…","اكتب إجابتك…")} value={answers[q.id]?.text||""} onChange={e=>setAnswer(q.id,e.target.value)}
                      style={{ width:"100%", padding:"12px 14px", borderRadius:12, border:`2px solid ${BORDER}`, fontSize:14, outline:"none", color:G, background:"#f8fafb", resize:"vertical" as const, lineHeight:1.6, fontFamily:"'Cairo',sans-serif", boxSizing:"border-box" as const, transition:"border .15s" }}
                      onFocus={e=>(e.target.style.borderColor=GM)} onBlur={e=>(e.target.style.borderColor=BORDER)} />
                  )}

                  {/* Audio/Dictation */}
                  {(q.question_type==="audio"||q.question_type==="dictation") && (
                    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                      <textarea rows={3} placeholder={t("Write what you heard…","اكتب ما سمعته…")} value={answers[q.id]?.text||""} onChange={e=>setAnswer(q.id,e.target.value)}
                        style={{ padding:"12px 14px", borderRadius:12, border:`2px solid ${BORDER}`, fontSize:14, outline:"none", color:G, background:"#f8fafb", resize:"none" as const, fontFamily:"'Cairo',sans-serif", boxSizing:"border-box" as const }} />
                      <div>
                        <p style={{ fontSize:12, color:"#7a9e88", marginBottom:8 }}>{t("Or record your answer:","أو سجّل إجابتك:")}</p>
                        <AudioRecorder onRecordingComplete={async(blob,url)=>{
                          if(!blob.size){toast({title:t("Recording is empty.","التسجيل فارغ."),variant:"destructive"});return;}
                          const path=`student-answers/${user!.id}/${attemptId}_${q.id}.webm`;
                          const{error}=await supabase.storage.from("exam-media").upload(path,blob,{upsert:true});
                          if(!error){const{data:ud}=await supabase.storage.from("exam-media").createSignedUrl(path,3600);setAnswer(q.id,answers[q.id]?.text||"[audio_recorded]",{audioUrl:ud?.signedUrl||url,fileType:"audio"});}
                          else{toast({title:t("Audio upload failed.","فشل رفع الصوت."),variant:"destructive"});setAnswer(q.id,answers[q.id]?.text||"[audio_recorded]",{audioUrl:url,fileType:"audio"});}
                        }} existingUrl={answers[q.id]?.data?.audioUrl}/>
                      </div>
                    </div>
                  )}
                </div>

                {/* Navigation footer */}
                <div style={{ padding:"14px 20px", borderTop:`1px solid ${BORDER}`, display:"flex", alignItems:"center", gap:10 }}>
                  <button onClick={()=>setCurrentIdx(p=>Math.max(0,p-1))} disabled={currentIdx===0}
                    style={{ display:"flex", alignItems:"center", gap:5, padding:"9px 16px", borderRadius:10, background:"#f8fafb", border:`1px solid ${BORDER}`, color:currentIdx===0?"#cbd5e0":G, fontSize:13, fontWeight:700, cursor:currentIdx===0?"not-allowed":"pointer", opacity:currentIdx===0?.5:1, fontFamily:"'Cairo',sans-serif" }}>
                    <ChevronLeft style={{width:15,height:15}}/>{t("Prev","السابق")}
                  </button>
                  <span style={{ flex:1, textAlign:"center", fontSize:12, color:"#7a9e88" }}>{currentIdx+1} / {questions.length}</span>
                  {currentIdx===questions.length-1 ? (
                    <button onClick={()=>{ saveAnswers(true); setPhase("review"); }}
                      style={{ display:"flex", alignItems:"center", gap:5, padding:"9px 16px", borderRadius:10, background:G, border:"none", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'Cairo',sans-serif" }}>
                      <Eye style={{width:14,height:14}}/>{t("Review & Submit","مراجعة وتقديم")}
                    </button>
                  ) : (
                    <button onClick={()=>setCurrentIdx(p=>Math.min(questions.length-1,p+1))}
                      style={{ display:"flex", alignItems:"center", gap:5, padding:"9px 16px", borderRadius:10, background:G, border:"none", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'Cairo',sans-serif" }}>
                      {t("Next","التالي")}<ChevronRight style={{width:15,height:15}}/>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: Summary panel (desktop) */}
        <div className="hidden lg:flex" style={{ width:200, background:"#fff", borderLeft:`1px solid ${BORDER}`, flexDirection:"column", flexShrink:0, padding:14, gap:12, overflowY:"auto" }}>
          {/* Timer */}
          <div style={{ textAlign:"center", background:timerBg, borderRadius:12, padding:"12px 8px", border:`1px solid ${timerColor}33` }}>
            <div style={{ fontSize:10, fontWeight:600, color:"#7a9e88", letterSpacing:1, marginBottom:4 }}>TIME LEFT</div>
            <div style={{ fontSize:26, fontWeight:900, color:timerColor, fontVariantNumeric:"tabular-nums" }}>{fmt(timeLeft)}</div>
          </div>
          {/* Stats */}
          <div style={{ background:"#f8fafb", borderRadius:12, padding:"12px 10px", display:"flex", flexDirection:"column", gap:8 }}>
            {[{label:t("Answered","مُجاب"),v:answeredCount,c:"#22c55e"},{label:t("Flagged","مُعلّم"),v:flaggedCount,c:GOLD},{label:t("Unanswered","غير مُجاب"),v:questions.length-answeredCount,c:"#EF4444"}].map((s,i)=>(
              <div key={i} style={{ display:"flex", justifyContent:"space-between", fontSize:12 }}>
                <span style={{ color:"#7a9e88" }}>{s.label}</span>
                <span style={{ fontWeight:700, color:s.c }}>{s.v}</span>
              </div>
            ))}
            <div style={{ height:4, borderRadius:2, background:"#f0f4f0", overflow:"hidden", marginTop:2 }}>
              <div style={{ height:"100%", width:`${progressPct}%`, background:`linear-gradient(90deg,${GM},${GOLD})`, transition:"width .5s" }}/>
            </div>
          </div>
          {/* Exam info */}
          <div style={{ fontSize:11, color:"#7a9e88", display:"flex", flexDirection:"column", gap:5 }}>
            <div style={{ display:"flex", justifyContent:"space-between" }}>
              <span>Pass Mark</span><span style={{ fontWeight:700, color:G }}>{exam?.passing_score}%</span>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between" }}>
              <span>Questions</span><span style={{ fontWeight:700, color:G }}>{questions.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── MOBILE BOTTOM NAV ── */}
      <div style={{ background:"#fff", borderTop:`1px solid ${BORDER}`, padding:"8px 12px", flexShrink:0 }} className="lg:hidden">
        {showNav ? (
          <div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(38px,1fr))", gap:5, marginBottom:8 }}>
              {questions.map((qq,i)=>{
                const a=answers[qq.id];
                return (
                  <button key={qq.id} onClick={()=>{ setCurrentIdx(i); setShowNav(false); }}
                    style={{ height:36, borderRadius:8, border:"none", fontSize:11, fontWeight:700, cursor:"pointer",
                      background:i===currentIdx?G:a?.flagged?"#fffbeb":a?.text?"#f0fff4":"#f8fafb",
                      color:i===currentIdx?"#fff":a?.flagged?GOLD:a?.text?"#22c55e":"#7a9e88",
                    }}>
                    {i+1}
                  </button>
                );
              })}
            </div>
            <button onClick={()=>setShowNav(false)} style={{ width:"100%", padding:"8px 0", borderRadius:10, background:"#f8fafb", border:`1px solid ${BORDER}`, fontSize:12, fontWeight:700, color:G, cursor:"pointer", fontFamily:"'Cairo',sans-serif" }}>
              Close
            </button>
          </div>
        ) : (
          <div style={{ display:"flex", alignItems:"center", gap:6, overflowX:"auto", paddingBottom:2 }}>
            {questions.slice(Math.max(0,currentIdx-3),currentIdx+6).map((qq,_,arr)=>{
              const i=questions.indexOf(qq);
              const a=answers[qq.id];
              return (
                <button key={qq.id} onClick={()=>setCurrentIdx(i)}
                  style={{ width:34, height:34, borderRadius:8, border:"none", fontSize:11, fontWeight:700, cursor:"pointer", flexShrink:0,
                    background:i===currentIdx?G:a?.flagged?"#fffbeb":a?.text?"#f0fff4":"#f8fafb",
                    color:i===currentIdx?"#fff":a?.flagged?GOLD:a?.text?"#22c55e":"#7a9e88",
                  }}>
                  {i+1}
                </button>
              );
            })}
            {questions.length>9 && <button onClick={()=>setShowNav(true)} style={{ width:34, height:34, borderRadius:8, border:`1px solid ${BORDER}`, background:"#f8fafb", fontSize:11, fontWeight:700, color:G, cursor:"pointer", flexShrink:0 }}>…</button>}
          </div>
        )}
      </div>
    </div>
  );
};

export default ExamTaking;
