import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, Clock, FileText, ChevronRight, Star, Sparkles } from "lucide-react";
import StandaloneNav from "@/components/layout/StandaloneNav";

const ENTRANCE_EXAM_ID = "36ef6492-2515-44ea-b086-67c9cee02475";

const Onboarding = () => {
  const navigate = useNavigate();
  const { user, profile, hasRole } = useAuth();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [ageGroup, setAgeGroup] = useState("");
  const [language, setLanguage] = useState("");
  const [goals, setGoals] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Redirect if already completed or if admin/teacher
  useEffect(() => {
    if (!user) { navigate("/login"); return; }
    if (hasRole("admin") || hasRole("teacher")) { navigate("/admin"); return; }
    if (profile?.onboarding_completed || profile?.has_taken_entrance_exam) {
      navigate("/student"); return;
    }
  }, [user, profile, hasRole]);

  const toggleGoal = (goal: string) => {
    setGoals((prev) =>
      prev.includes(goal) ? prev.filter((g) => g !== goal) : [...prev, goal]
    );
  };

  const saveBasicInfo = async () => {
    if (!ageGroup || !language) {
      toast({ title: "Please fill all fields", variant: "destructive" });
      return;
    }
    setSaving(true);
    await supabase
      .from("profiles")
      .update({
        age_group: ageGroup,
        learning_goal: goals.join(","),
        preferred_language: language === "both" ? "both" : language === "arabic" ? "ar" : "en",
      } as any)
      .eq("user_id", user!.id);
    setSaving(false);
    setStep(3);
  };

  const startEntranceExam = async () => {
    setSaving(true);
    // Check for existing in-progress attempt
    const { data: existing } = await supabase
      .from("exam_attempts")
      .select("id")
      .eq("exam_id", ENTRANCE_EXAM_ID)
      .eq("user_id", user!.id)
      .eq("status", "in_progress")
      .maybeSingle();

    if (existing) {
      navigate(`/student/entrance-exam/${existing.id}`);
      return;
    }

    // Create new attempt
    const { data: attempt, error } = await supabase
      .from("exam_attempts")
      .insert({
        exam_id: ENTRANCE_EXAM_ID,
        user_id: user!.id,
        status: "in_progress",
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error || !attempt) {
      toast({ title: "Failed to start exam", description: error?.message, variant: "destructive" });
      setSaving(false);
      return;
    }

    navigate(`/student/entrance-exam/${attempt.id}`);
  };

  const skipExam = async () => {
    setSaving(true);
    await supabase
      .from("profiles")
      .update({
        level: "beginner",
        has_taken_entrance_exam: true,
        entrance_completed_at: new Date().toISOString(),
        onboarding_completed: true,
      } as any)
      .eq("user_id", user!.id);

    // Auto-enrol in beginner courses
    const { data: levelCourses } = await supabase
      .from("level_courses" as any)
      .select("subject_id")
      .eq("level", "beginner");

    if (levelCourses && levelCourses.length > 0) {
      // Get courses for these subjects
      const subjectIds = (levelCourses as any[]).map((lc: any) => lc.subject_id);
      const { data: courses } = await supabase
        .from("courses")
        .select("id")
        .in("subject_id", subjectIds)
        .eq("is_published", true);

      if (courses) {
        for (const course of courses) {
          await supabase
            .from("enrollments")
            .insert({ user_id: user!.id, course_id: course.id })
            .select()
            .maybeSingle();
        }
      }
    }

    toast({ title: "Welcome! You've been placed in the Beginner Programme." });
    setSaving(false);
    navigate("/student");
  };

  const goalOptions = [
    { id: "quran", label: "Learn Quran & Tajweed", labelAr: "تعلم القرآن والتجويد" },
    { id: "arabic", label: "Master Arabic Language", labelAr: "إتقان اللغة العربية" },
    { id: "islamic", label: "Islamic Sciences", labelAr: "العلوم الإسلامية" },
    { id: "all", label: "All of the above", labelAr: "كل ما سبق" },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "linear-gradient(135deg, #0f3122 0%, #1a4a35 50%, #0f3122 100%)" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Cairo:wght@400;600;700&family=Cormorant+Garamond:wght@400;600;700&display=swap');
        .onboarding-card { font-family: 'Cairo', sans-serif; }
        .amiri { font-family: 'Amiri', serif; }
        .cormorant { font-family: 'Cormorant Garamond', serif; }
        .gold-btn { background: #c9973a; color: #fff; border: none; font-weight: 700; font-family: 'Cairo', sans-serif; }
        .gold-btn:hover { background: #e8c070; color: #0f3122; }
        .gold-text { color: #c9973a; }
        .dark-green { color: #0f3122; }
      `}</style>

      <motion.div
        key={step}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-lg"
      >
        {/* Progress */}
        <div className="mb-6 flex items-center justify-center gap-3">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all"
                style={{
                  background: step >= s ? "#c9973a" : "rgba(255,255,255,0.15)",
                  color: step >= s ? "#fff" : "rgba(255,255,255,0.4)",
                }}
              >
                {s}
              </div>
              {s < 3 && (
                <div className="w-12 h-0.5" style={{ background: step > s ? "#c9973a" : "rgba(255,255,255,0.15)" }} />
              )}
            </div>
          ))}
        </div>

        <Card className="onboarding-card border-0 shadow-2xl" style={{ background: "#fdf8f0" }}>
          <CardContent className="p-8">
            <AnimatePresence mode="wait">
              {/* STEP 1 — WELCOME */}
              {step === 1 && (
                <motion.div key="s1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center space-y-6">
                  <div className="amiri text-3xl gold-text leading-relaxed" dir="rtl">
                    بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ
                  </div>
                  <div className="w-16 h-0.5 mx-auto" style={{ background: "#c9973a" }} />
                  <h1 className="cormorant text-2xl font-bold dark-green">
                    Ahlan wa Sahlan, {profile?.full_name || "Student"}!
                  </h1>
                  <p className="amiri text-lg gold-text" dir="rtl">أهلاً وسهلاً</p>
                  <p className="text-sm leading-relaxed" style={{ color: "#4a4a4a" }}>
                    Welcome to Tahleem Academy. We will ask you a few quick questions then give you a short entrance exam to place you in the right programme.
                  </p>
                  <Button
                    onClick={() => setStep(2)}
                    className="gold-btn w-full py-6 text-base rounded-xl"
                  >
                    Begin Setup <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                </motion.div>
              )}

              {/* STEP 2 — BASIC INFO */}
              {step === 2 && (
                <motion.div key="s2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
                  <div className="text-center">
                    <h2 className="cormorant text-xl font-bold dark-green">Tell Us About Yourself</h2>
                    <p className="text-sm" style={{ color: "#888" }}>Step 2 of 3</p>
                  </div>

                  {/* Age Group */}
                  <div className="space-y-3">
                    <Label className="font-semibold dark-green text-sm">Age Group</Label>
                    <RadioGroup value={ageGroup} onValueChange={setAgeGroup} className="grid grid-cols-3 gap-2">
                      {[
                        { value: "child", label: "Child", sub: "6-12" },
                        { value: "teen", label: "Teen", sub: "13-17" },
                        { value: "adult", label: "Adult", sub: "18+" },
                      ].map((opt) => (
                        <Label
                          key={opt.value}
                          className="flex flex-col items-center p-3 rounded-lg border-2 cursor-pointer transition-all text-center"
                          style={{
                            borderColor: ageGroup === opt.value ? "#c9973a" : "#e5e5e5",
                            background: ageGroup === opt.value ? "rgba(201,151,58,0.08)" : "#fff",
                          }}
                        >
                          <RadioGroupItem value={opt.value} className="sr-only" />
                          <span className="font-semibold text-sm dark-green">{opt.label}</span>
                          <span className="text-xs" style={{ color: "#888" }}>{opt.sub}</span>
                        </Label>
                      ))}
                    </RadioGroup>
                  </div>

                  {/* Language */}
                  <div className="space-y-3">
                    <Label className="font-semibold dark-green text-sm">Preferred Language</Label>
                    <RadioGroup value={language} onValueChange={setLanguage} className="grid grid-cols-3 gap-2">
                      {[
                        { value: "arabic", label: "العربية", sub: "Arabic" },
                        { value: "english", label: "English", sub: "إنجليزي" },
                        { value: "both", label: "Both", sub: "كلاهما" },
                      ].map((opt) => (
                        <Label
                          key={opt.value}
                          className="flex flex-col items-center p-3 rounded-lg border-2 cursor-pointer transition-all text-center"
                          style={{
                            borderColor: language === opt.value ? "#c9973a" : "#e5e5e5",
                            background: language === opt.value ? "rgba(201,151,58,0.08)" : "#fff",
                          }}
                        >
                          <RadioGroupItem value={opt.value} className="sr-only" />
                          <span className="font-semibold text-sm dark-green">{opt.label}</span>
                          <span className="text-xs" style={{ color: "#888" }}>{opt.sub}</span>
                        </Label>
                      ))}
                    </RadioGroup>
                  </div>

                  {/* Goals */}
                  <div className="space-y-3">
                    <Label className="font-semibold dark-green text-sm">Your Goals</Label>
                    <div className="space-y-2">
                      {goalOptions.map((g) => (
                        <label
                          key={g.id}
                          className="flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all"
                          style={{
                            borderColor: goals.includes(g.id) ? "#c9973a" : "#e5e5e5",
                            background: goals.includes(g.id) ? "rgba(201,151,58,0.08)" : "#fff",
                          }}
                        >
                          <Checkbox
                            checked={goals.includes(g.id)}
                            onCheckedChange={() => toggleGoal(g.id)}
                          />
                          <div>
                            <span className="text-sm font-medium dark-green">{g.label}</span>
                            <span className="text-xs gold-text ml-2 amiri">{g.labelAr}</span>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  <Button
                    onClick={saveBasicInfo}
                    disabled={saving}
                    className="gold-btn w-full py-6 text-base rounded-xl"
                  >
                    {saving ? "Saving..." : "Continue"} <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                </motion.div>
              )}

              {/* STEP 3 — ENTRANCE EXAM INTRO */}
              {step === 3 && (
                <motion.div key="s3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
                  <div className="text-center">
                    <div className="text-4xl mb-2">📝</div>
                    <h2 className="cormorant text-xl font-bold dark-green">Entrance Exam</h2>
                    <p className="amiri text-lg gold-text" dir="rtl">اختبار القبول</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 rounded-xl text-center" style={{ background: "rgba(15,49,34,0.06)" }}>
                      <Clock className="h-5 w-5 mx-auto mb-1 gold-text" />
                      <div className="text-lg font-bold dark-green">15 min</div>
                      <div className="text-xs" style={{ color: "#888" }}>Duration</div>
                    </div>
                    <div className="p-4 rounded-xl text-center" style={{ background: "rgba(15,49,34,0.06)" }}>
                      <FileText className="h-5 w-5 mx-auto mb-1 gold-text" />
                      <div className="text-lg font-bold dark-green">20</div>
                      <div className="text-xs" style={{ color: "#888" }}>Questions</div>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl" style={{ background: "rgba(201,151,58,0.08)", border: "1px solid rgba(201,151,58,0.2)" }}>
                    <div className="flex items-start gap-2">
                      <Sparkles className="h-4 w-4 mt-0.5 gold-text flex-shrink-0" />
                      <p className="text-sm" style={{ color: "#4a4a4a" }}>
                        Topics: Arabic, Quran, Tajweed, Islamic Knowledge. <strong>Don't worry — this just helps us place you in the right level. There are no wrong answers!</strong>
                      </p>
                    </div>
                  </div>

                  <Button
                    onClick={startEntranceExam}
                    disabled={saving}
                    className="gold-btn w-full py-6 text-base rounded-xl"
                  >
                    {saving ? "Starting..." : "Start Exam →"}
                  </Button>

                  <button
                    onClick={skipExam}
                    disabled={saving}
                    className="w-full text-center text-sm py-2 transition-colors"
                    style={{ color: "#999", background: "none", border: "none", cursor: "pointer" }}
                  >
                    Skip — place me in Beginner level
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default Onboarding;
