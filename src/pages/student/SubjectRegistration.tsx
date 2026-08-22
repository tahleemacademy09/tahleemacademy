/* src/pages/student/SubjectRegistration.tsx
   Students register for subjects (the actual classes teachers run, e.g.
   Tajweed, Tafsir). Only open when the admin has turned on the Subject
   Registration Portal (/admin/subject-registration), and only subjects
   matching the student's own level/class are ever shown. Registering
   inserts a row into `subject_registrations` (subject_id, user_id) — the
   table StudentExams.tsx and ExamRegistration.tsx check before showing any
   exam tied to a subject (teacher-assigned or self-registered).

   This does not touch payment/subscription access (profiles.payment_status,
   subscription_end_date) — that's still what unlocks lesson content once a
   student is registered.

   Private students (usePrivateStudent) don't use this — their subjects are
   assigned directly by their teacher/admin (private_student_subjects),
   same rule as ExamRegistration.tsx.
*/
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { usePrivateStudent } from "@/hooks/usePrivateStudent";
import { useSubjectRegistrationSettings } from "@/hooks/useSubjectRegistrationSettings";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Lock, CheckCircle, BookOpen, ChevronLeft, Layers } from "lucide-react";

const G      = "#0f2d1f";
const GM     = "#1a4731";
const CREAM  = "#faf6ee";
const BORDER = "rgba(15,45,31,0.1)";
const TL     = "#7a9e88";

const SubjectRegistration = () => {
  const { t, language } = useLanguage();
  const { user }         = useAuth();
  const { toast }        = useToast();
  const navigate         = useNavigate();
  const { isPrivateStudent } = usePrivateStudent();
  const { config: portal, loading: portalLoading, isEffectivelyOpen } = useSubjectRegistrationSettings();

  const [loading, setLoading]             = useState(true);
  const [subjects, setSubjects]           = useState<any[]>([]);
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

      // Subjects matching the student's own level (or open to "all")
      const { data: allSubjects } = await supabase
        .from("subjects")
        .select("id, title, title_ar, description, description_ar, level, visibility, teacher_id")
        .eq("is_active", true)
        .order("title");

      const list = (allSubjects || []).filter((s: any) => {
        if ((s.visibility || "all") === "private") return false;
        const lv: string = s.level || "all";
        if (!lv || lv === "all") return true;
        return lv.split(",").map((l: string) => l.trim()).includes(myLevel);
      });
      setSubjects(list);

      const { data: existing } = await supabase
        .from("subject_registrations").select("subject_id").eq("user_id", user!.id);
      setRegisteredIds(new Set((existing || []).map((r: any) => r.subject_id)));
    } finally {
      setLoading(false);
    }
  };

  const register = async (subject: any) => {
    setRegistering(subject.id);
    try {
      const { error } = await supabase.from("subject_registrations").insert({ subject_id: subject.id, user_id: user!.id } as any);
      if (error) {
        toast({ title: t("Registration failed", "فشل التسجيل"), description: error.message, variant: "destructive" });
        return;
      }
      setRegisteredIds(prev => new Set(prev).add(subject.id));
      toast({ title: `✅ ${t("Registered!", "تم التسجيل!")}`, description: t("You'll now see tests and exams for this subject.", "ستظهر لك الآن اختبارات وامتحانات هذه المادة.") });
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
            {t("Your teacher assigns your subjects directly — self-registration isn't available for private students.",
               "معلمك يقوم بتعيين موادك مباشرة — التسجيل الذاتي غير متاح للطلاب الخاصين.")}
          </p>
        </div>
      </div>
    );
  }

  if (!portalLoading && !isEffectivelyOpen) {
    return (
      <div style={{ background: CREAM, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 360 }}>
          <Lock style={{ width: 40, height: 40, color: TL, opacity: .6, margin: "0 auto 14px" }} />
          <p style={{ fontWeight: 800, color: G, marginBottom: 6, fontSize: 16 }}>{t("Registration Closed", "التسجيل مغلق")}</p>
          <p style={{ fontSize: 13, color: TL, lineHeight: 1.7 }}>
            {language === "ar" ? portal.subject_registration_closed_message_ar : portal.subject_registration_closed_message}
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
            {t("Register for Subjects", "التسجيل في المواد")}
          </h1>
          <p style={{ fontSize: 12.5, color: "rgba(255,255,255,.65)", margin: 0 }}>
            {language === "ar" ? portal.subject_registration_message_ar : portal.subject_registration_message}
          </p>
          {portal.subject_registration_deadline && (
            <p style={{ fontSize: 11.5, color: "#fde68a", margin: "8px 0 0", fontWeight: 700 }}>
              ⏰ {t("Registration closes","التسجيل يُغلق")} {new Date(portal.subject_registration_deadline).toLocaleDateString(language === "ar" ? "ar-SA" : "en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 48 }}>
            <div style={{ width: 40, height: 40, border: `4px solid ${G}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin .8s linear infinite", margin: "0 auto" }} />
            <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
          </div>
        ) : subjects.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 20px", background: "#fff", borderRadius: 18, border: `1px dashed ${BORDER}` }}>
            <Layers style={{ width: 36, height: 36, color: TL, opacity: .5, margin: "0 auto 10px" }} />
            <p style={{ fontSize: 14, color: TL, margin: 0 }}>{t("No subjects are available for your level right now.", "لا توجد مواد متاحة لمستواك حالياً.")}</p>
          </div>
        ) : (
          subjects.map(subject => {
            const title  = language === "ar" ? subject.title_ar || subject.title : subject.title;
            const already = registeredIds.has(subject.id);

            return (
              <div key={subject.id} style={{
                background: "#fff", borderRadius: 16, border: `1.5px solid ${BORDER}`,
                boxShadow: "0 2px 12px rgba(15,45,31,.07)", padding: "14px 16px", marginBottom: 12,
              }}>
                <div style={{ marginBottom: 8 }}>
                  <p style={{ fontSize: 11, color: TL, margin: "0 0 3px", fontWeight: 700 }}>
                    <BookOpen style={{ width: 11, height: 11, display: "inline", verticalAlign: -1, marginRight: 4 }} />
                    {t("Subject", "مادة")}
                  </p>
                  <h3 style={{ fontSize: 15, fontWeight: 800, color: G, margin: 0 }}>{title}</h3>
                  {subject.description && (
                    <p style={{ fontSize: 12, color: TL, margin: "4px 0 0", lineHeight: 1.5 }}>
                      {language === "ar" ? (subject.description_ar || subject.description) : subject.description}
                    </p>
                  )}
                </div>

                {already ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "11px", borderRadius: 12, background: "#f0fff4", border: "1px solid #86efac", color: "#065f46", fontSize: 13, fontWeight: 700 }}>
                    <CheckCircle style={{ width: 15, height: 15 }} /> {t("Registered", "تم التسجيل")}
                  </div>
                ) : (
                  <button onClick={() => register(subject)} disabled={registering === subject.id} style={{
                    width: "100%", padding: "12px", borderRadius: 13, border: "none", color: "#fff", fontSize: 14, fontWeight: 800,
                    cursor: registering === subject.id ? "default" : "pointer", opacity: registering === subject.id ? .7 : 1,
                    background: `linear-gradient(135deg,${G},${GM})`,
                  }}>
                    {registering === subject.id ? t("Registering…", "جارٍ التسجيل…") : t("Register", "سجّل الآن")}
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

export default SubjectRegistration;
