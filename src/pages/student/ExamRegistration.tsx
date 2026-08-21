/* src/pages/student/ExamRegistration.tsx
   Students browse tests/exams that are open for self-registration and
   register themselves. Registering inserts a row into exam_assignments
   (RLS re-validates level match, course enrollment, deadlines — see
   migration 20260821120000_exam_self_registration.sql). Once registered,
   the exam shows up in /student/exams exactly like an admin-assigned one,
   because both pages read from the same exam_assignments table.

   Private students (usePrivateStudent) never see this page — they only
   ever get exams their teacher assigns directly, same rule already used
   on StudentExams.tsx.
*/
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { usePrivateStudent } from "@/hooks/usePrivateStudent";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Clock, CheckCircle, Lock, BookOpen, ChevronLeft, ClipboardCheck,
} from "lucide-react";

const G      = "#0f2d1f";
const GM     = "#1a4731";
const CREAM  = "#faf6ee";
const BORDER = "rgba(15,45,31,0.1)";
const TL     = "#7a9e88";

const ExamRegistration = () => {
  const { t, language } = useLanguage();
  const { user }        = useAuth();
  const { toast }        = useToast();
  const navigate         = useNavigate();
  const { isPrivateStudent } = usePrivateStudent();

  const [loading, setLoading]         = useState(true);
  const [exams, setExams]             = useState<any[]>([]);
  const [registeredIds, setRegisteredIds] = useState<Set<string>>(new Set());
  const [courseTitles, setCourseTitles]   = useState<Record<string, string>>({});
  const [enrolledCourseIds, setEnrolledCourseIds] = useState<Set<string>>(new Set());
  const [studentLevel, setStudentLevel]   = useState<string>("");
  const [registering, setRegistering]     = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user]);

  const load = async () => {
    setLoading(true);
    try {
      const { data: profile } = await supabase
        .from("profiles").select("level").eq("user_id", user!.id).maybeSingle();
      const myLevel = profile?.level || "";
      setStudentLevel(myLevel);

      // Course access here is gated by course *registration* (enrollments row exists),
      // not payment — payment/subscription access is handled separately via
      // profiles.payment_status / subscription_end_date.
      const { data: enrollments } = await supabase
        .from("enrollments").select("course_id").eq("user_id", user!.id);
      const registeredCourseIds = new Set((enrollments || []).map((e: any) => e.course_id));
      setEnrolledCourseIds(registeredCourseIds);

      const { data: existing } = await supabase
        .from("exam_assignments").select("exam_id").eq("user_id", user!.id);
      setRegisteredIds(new Set((existing || []).map((r: any) => r.exam_id)));

      const nowIso = new Date().toISOString();
      const { data: openExams } = await supabase
        .from("exams" as any).select("*")
        .eq("is_published", true)
        .eq("registration_open", true)
        .or(`end_date.is.null,end_date.gt.${nowIso}`)
        .order("start_date", { ascending: true });

      const list = (openExams || []).filter((e: any) => {
        if (e.registration_deadline && new Date(e.registration_deadline).getTime() < Date.now()) return false;
        return true;
      });
      setExams(list);

      const courseIds = Array.from(new Set(list.map((e: any) => e.course_id).filter(Boolean)));
      if (courseIds.length) {
        const { data: courses } = await supabase.from("courses").select("id, title, title_ar").in("id", courseIds);
        const map: Record<string, string> = {};
        (courses || []).forEach((c: any) => { map[c.id] = language === "ar" ? (c.title_ar || c.title) : c.title; });
        setCourseTitles(map);
      }
    } finally {
      setLoading(false);
    }
  };

  const eligibility = (exam: any): { eligible: boolean; reason?: string } => {
    if (exam.level && exam.level !== "" && studentLevel && exam.level !== studentLevel) {
      return { eligible: false, reason: t("Not offered at your level","غير متاح لمستواك") };
    }
    if (exam.course_id && !enrolledCourseIds.has(exam.course_id)) {
      const title = courseTitles[exam.course_id] || t("this course","هذه الدورة");
      return { eligible: false, reason: `${t("Register for","سجّل في")} “${title}” ${t("first","أولاً")}` };
    }
    return { eligible: true };
  };

  const register = async (exam: any) => {
    setRegistering(exam.id);
    try {
      const { error } = await supabase.from("exam_assignments").insert({ exam_id: exam.id, user_id: user!.id } as any);
      if (error) {
        toast({ title: t("Registration failed","فشل التسجيل"), description: error.message, variant: "destructive" });
        return;
      }
      setRegisteredIds(prev => new Set(prev).add(exam.id));
      toast({ title: `✅ ${t("Registered!","تم التسجيل!")}`, description: t("You can now find this in your exams list.","يمكنك الآن العثور عليه في قائمة اختباراتك.") });
    } finally {
      setRegistering(null);
    }
  };

  if (isPrivateStudent) {
    return (
      <div style={{ background: CREAM, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 340 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
          <p style={{ fontWeight: 800, color: G, marginBottom: 6 }}>{t("Private Student","طالب خاص")}</p>
          <p style={{ fontSize: 13, color: TL }}>
            {t("Your teacher assigns exams and tests to you directly — self-registration isn't available for private students.",
               "معلمك يقوم بتعيين الامتحانات والاختبارات لك مباشرة — التسجيل الذاتي غير متاح للطلاب الخاصين.")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: CREAM, minHeight: "100vh", fontFamily: "'Cairo',sans-serif" }}>
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "20px 16px 48px" }}>

        <button onClick={() => navigate("/student/exams")} style={{
          display: "flex", alignItems: "center", gap: 6, background: "none", border: "none",
          color: TL, fontSize: 13, fontWeight: 700, cursor: "pointer", padding: 0, marginBottom: 14,
        }}>
          <ChevronLeft style={{ width: 16, height: 16 }} /> {t("My Exams","اختباراتي")}
        </button>

        <div style={{
          background: `linear-gradient(135deg,${G} 0%,${GM} 100%)`, borderRadius: 22,
          padding: "22px 20px", marginBottom: 20, boxShadow: "0 8px 32px rgba(15,45,31,.25)",
        }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#fff", margin: "0 0 6px" }}>
            {t("Register for Tests & Exams","التسجيل للاختبارات والامتحانات")}
          </h1>
          <p style={{ fontSize: 12.5, color: "rgba(255,255,255,.65)", margin: 0 }}>
            {t("Only students who register here will be able to write the test or exam.",
               "فقط الطلاب المسجلون هنا سيتمكنون من كتابة الاختبار أو الامتحان.")}
          </p>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 48 }}>
            <div style={{ width: 40, height: 40, border: `4px solid ${G}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin .8s linear infinite", margin: "0 auto" }} />
            <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
          </div>
        ) : exams.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 20px", background: "#fff", borderRadius: 18, border: `1px dashed ${BORDER}` }}>
            <ClipboardCheck style={{ width: 36, height: 36, color: TL, opacity: .5, margin: "0 auto 10px" }} />
            <p style={{ fontSize: 14, color: TL, margin: 0 }}>{t("No tests or exams are open for registration right now.","لا توجد اختبارات أو امتحانات مفتوحة للتسجيل حالياً.")}</p>
          </div>
        ) : (
          exams.map(exam => {
            const isTest = (exam.type || "exam") === "test";
            const title  = language === "ar" ? exam.title_ar || exam.title : exam.title;
            const already = registeredIds.has(exam.id);
            const elig = eligibility(exam);
            const deadline = exam.registration_deadline || exam.start_date;

            return (
              <div key={exam.id} style={{
                background: "#fff", borderRadius: 16, border: `1.5px solid ${BORDER}`,
                boxShadow: "0 2px 12px rgba(15,45,31,.07)", padding: "14px 16px", marginBottom: 12,
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
                  <div>
                    <span style={{
                      fontSize: 10, fontWeight: 800, letterSpacing: .8, padding: "3px 9px", borderRadius: 10,
                      background: isTest ? "#fffbeb" : "#f0fff4", color: isTest ? "#92400e" : "#065f46",
                      border: `1px solid ${isTest ? "#fde68a" : "#86efac"}`,
                    }}>
                      {isTest ? t("TEST","تمرين") : t("EXAM","امتحان")}
                    </span>
                    <h3 style={{ fontSize: 15, fontWeight: 800, color: G, margin: "6px 0 0" }}>{title}</h3>
                    {exam.course_id && courseTitles[exam.course_id] && (
                      <p style={{ fontSize: 11.5, color: TL, margin: "3px 0 0" }}>
                        <BookOpen style={{ width: 11, height: 11, display: "inline", verticalAlign: -1, marginRight: 4 }} />
                        {courseTitles[exam.course_id]}
                      </p>
                    )}
                  </div>
                </div>

                {deadline && (
                  <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: TL, marginBottom: 10 }}>
                    <Clock style={{ width: 12, height: 12 }} />
                    {t("Register by","سجل قبل")} {new Date(deadline).toLocaleDateString(language === "ar" ? "ar-SA" : "en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </div>
                )}

                {already ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "11px", borderRadius: 12, background: "#f0fff4", border: "1px solid #86efac", color: "#065f46", fontSize: 13, fontWeight: 700 }}>
                    <CheckCircle style={{ width: 15, height: 15 }} /> {t("Registered","تم التسجيل")}
                  </div>
                ) : !elig.eligible ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "11px", borderRadius: 12, background: "#f9fafb", border: "1px solid #e5e7eb", color: TL, fontSize: 12.5, fontWeight: 600 }}>
                    <Lock style={{ width: 13, height: 13 }} /> {elig.reason}
                  </div>
                ) : (
                  <button onClick={() => register(exam)} disabled={registering === exam.id} style={{
                    width: "100%", padding: "12px", borderRadius: 13, border: "none", color: "#fff", fontSize: 14, fontWeight: 800,
                    cursor: registering === exam.id ? "default" : "pointer", opacity: registering === exam.id ? .7 : 1,
                    background: `linear-gradient(135deg,${G},${GM})`,
                  }}>
                    {registering === exam.id ? t("Registering…","جارٍ التسجيل…") : t("Register","سجّل الآن")}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default ExamRegistration;
