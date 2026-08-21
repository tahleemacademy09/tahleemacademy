/* src/pages/student/CourseRegistration.tsx
   Students register (enroll) into courses. Only open when the admin has
   turned on the Course Registration Portal (/admin/course-registration
   settings), and only courses matching the student's own level/class are
   ever shown. Registering inserts a row into `enrollments` (course_id,
   user_id) — the same table ExamRegistration.tsx already reads to decide
   which self-registration exams a student is eligible for, and that
   StudentExams.tsx now checks before showing ANY exam tied to a course
   (teacher-assigned or self-registered) — see StudentExams.tsx.

   This does not touch payment/subscription access (profiles.payment_status,
   subscription_end_date) — that's still what unlocks lesson content once a
   student is registered for a course.

   Private students (usePrivateStudent) don't use this — their courses are
   assigned directly by their teacher, same rule as ExamRegistration.tsx.
*/
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { usePrivateStudent } from "@/hooks/usePrivateStudent";
import { useCourseRegistrationSettings } from "@/hooks/useCourseRegistrationSettings";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Lock, CheckCircle, BookOpen, ChevronLeft, Layers } from "lucide-react";

const G      = "#0f2d1f";
const GM     = "#1a4731";
const CREAM  = "#faf6ee";
const BORDER = "rgba(15,45,31,0.1)";
const TL     = "#7a9e88";

const CourseRegistration = () => {
  const { t, language } = useLanguage();
  const { user }         = useAuth();
  const { toast }         = useToast();
  const navigate          = useNavigate();
  const { isPrivateStudent } = usePrivateStudent();
  const { config: portal, loading: portalLoading } = useCourseRegistrationSettings();

  const [loading, setLoading]             = useState(true);
  const [courses, setCourses]             = useState<any[]>([]);
  const [subjectTitles, setSubjectTitles] = useState<Record<string, string>>({});
  const [registeredIds, setRegisteredIds] = useState<Set<string>>(new Set());
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

      // Courses matching the student's own level (or open to "all")
      const { data: allCourses } = await supabase
        .from("courses")
        .select("id, title, title_ar, description, description_ar, subject_id, level, visibility")
        .eq("is_published", true)
        .order("sort_order");

      const list = (allCourses || []).filter((c: any) => {
        if ((c.visibility || "all") === "private") return false;
        if (!c.level || c.level === "all") return true;
        return c.level.split(",").map((l: string) => l.trim()).includes(myLevel);
      });
      setCourses(list);

      const subjectIds = Array.from(new Set(list.map((c: any) => c.subject_id).filter(Boolean)));
      if (subjectIds.length) {
        const { data: subjects } = await supabase.from("subjects").select("id, title, title_ar").in("id", subjectIds);
        const map: Record<string, string> = {};
        (subjects || []).forEach((s: any) => { map[s.id] = language === "ar" ? (s.title_ar || s.title) : s.title; });
        setSubjectTitles(map);
      }

      const { data: existing } = await supabase
        .from("enrollments").select("course_id").eq("user_id", user!.id);
      setRegisteredIds(new Set((existing || []).map((r: any) => r.course_id)));
    } finally {
      setLoading(false);
    }
  };

  const register = async (course: any) => {
    setRegistering(course.id);
    try {
      const { error } = await supabase.from("enrollments").insert({ course_id: course.id, user_id: user!.id } as any);
      if (error) {
        toast({ title: t("Registration failed", "فشل التسجيل"), description: error.message, variant: "destructive" });
        return;
      }
      setRegisteredIds(prev => new Set(prev).add(course.id));
      toast({ title: `✅ ${t("Registered!", "تم التسجيل!")}`, description: t("You'll now see tests and exams for this course.", "ستظهر لك الآن اختبارات وامتحانات هذه الدورة.") });
    } finally {
      setRegistering(null);
    }
  };

  if (isPrivateStudent) {
    return (
      <div style={{ background: CREAM, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 340 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
          <p style={{ fontWeight: 800, color: G, marginBottom: 6 }}>{t("Private Student", "طالب خاص")}</p>
          <p style={{ fontSize: 13, color: TL }}>
            {t("Your teacher assigns your courses directly — self-registration isn't available for private students.",
               "معلمك يقوم بتعيين دوراتك مباشرة — التسجيل الذاتي غير متاح للطلاب الخاصين.")}
          </p>
        </div>
      </div>
    );
  }

  if (!portalLoading && !portal.course_registration_open) {
    return (
      <div style={{ background: CREAM, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 360 }}>
          <Lock style={{ width: 40, height: 40, color: TL, opacity: .6, margin: "0 auto 14px" }} />
          <p style={{ fontWeight: 800, color: G, marginBottom: 6, fontSize: 16 }}>{t("Registration Closed", "التسجيل مغلق")}</p>
          <p style={{ fontSize: 13, color: TL, lineHeight: 1.7 }}>
            {language === "ar" ? portal.course_registration_closed_message_ar : portal.course_registration_closed_message}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: CREAM, minHeight: "100vh", fontFamily: "'Cairo',sans-serif" }}>
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "20px 16px 48px" }}>

        <button onClick={() => navigate("/student/courses")} style={{
          display: "flex", alignItems: "center", gap: 6, background: "none", border: "none",
          color: TL, fontSize: 13, fontWeight: 700, cursor: "pointer", padding: 0, marginBottom: 14,
        }}>
          <ChevronLeft style={{ width: 16, height: 16 }} /> {t("My Courses", "دوراتي")}
        </button>

        <div style={{
          background: `linear-gradient(135deg,${G} 0%,${GM} 100%)`, borderRadius: 22,
          padding: "22px 20px", marginBottom: 20, boxShadow: "0 8px 32px rgba(15,45,31,.25)",
        }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#fff", margin: "0 0 6px" }}>
            {t("Register for Courses", "التسجيل في الدورات")}
          </h1>
          <p style={{ fontSize: 12.5, color: "rgba(255,255,255,.65)", margin: 0 }}>
            {language === "ar" ? portal.course_registration_message_ar : portal.course_registration_message}
          </p>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 48 }}>
            <div style={{ width: 40, height: 40, border: `4px solid ${G}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin .8s linear infinite", margin: "0 auto" }} />
            <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
          </div>
        ) : courses.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 20px", background: "#fff", borderRadius: 18, border: `1px dashed ${BORDER}` }}>
            <Layers style={{ width: 36, height: 36, color: TL, opacity: .5, margin: "0 auto 10px" }} />
            <p style={{ fontSize: 14, color: TL, margin: 0 }}>{t("No courses are available for your level right now.", "لا توجد دورات متاحة لمستواك حالياً.")}</p>
          </div>
        ) : (
          courses.map(course => {
            const title  = language === "ar" ? course.title_ar || course.title : course.title;
            const already = registeredIds.has(course.id);

            return (
              <div key={course.id} style={{
                background: "#fff", borderRadius: 16, border: `1.5px solid ${BORDER}`,
                boxShadow: "0 2px 12px rgba(15,45,31,.07)", padding: "14px 16px", marginBottom: 12,
              }}>
                <div style={{ marginBottom: 8 }}>
                  {course.subject_id && subjectTitles[course.subject_id] && (
                    <p style={{ fontSize: 11, color: TL, margin: "0 0 3px", fontWeight: 700 }}>
                      <BookOpen style={{ width: 11, height: 11, display: "inline", verticalAlign: -1, marginRight: 4 }} />
                      {subjectTitles[course.subject_id]}
                    </p>
                  )}
                  <h3 style={{ fontSize: 15, fontWeight: 800, color: G, margin: 0 }}>{title}</h3>
                  {course.description && (
                    <p style={{ fontSize: 12, color: TL, margin: "4px 0 0", lineHeight: 1.5 }}>
                      {language === "ar" ? (course.description_ar || course.description) : course.description}
                    </p>
                  )}
                </div>

                {already ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "11px", borderRadius: 12, background: "#f0fff4", border: "1px solid #86efac", color: "#065f46", fontSize: 13, fontWeight: 700 }}>
                    <CheckCircle style={{ width: 15, height: 15 }} /> {t("Registered", "تم التسجيل")}
                  </div>
                ) : (
                  <button onClick={() => register(course)} disabled={registering === course.id} style={{
                    width: "100%", padding: "12px", borderRadius: 13, border: "none", color: "#fff", fontSize: 14, fontWeight: 800,
                    cursor: registering === course.id ? "default" : "pointer", opacity: registering === course.id ? .7 : 1,
                    background: `linear-gradient(135deg,${G},${GM})`,
                  }}>
                    {registering === course.id ? t("Registering…", "جارٍ التسجيل…") : t("Register", "سجّل الآن")}
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

export default CourseRegistration;
