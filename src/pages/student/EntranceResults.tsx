import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { CheckCircle, Star, BookOpen, ArrowRight } from "lucide-react";

const EntranceResults = () => {
  const { attemptId } = useParams<{ attemptId: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [assignedLevel, setAssignedLevel] = useState("");
  const [enrolledSubjects, setEnrolledSubjects] = useState<any[]>([]);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!attemptId || !user) return;
    loadResults();
  }, [attemptId, user]);

  const loadResults = async () => {
    const { data: attemptData } = await supabase
      .from("exam_attempts")
      .select("*")
      .eq("id", attemptId)
      .single();

    if (!attemptData || attemptData.user_id !== user!.id) {
      navigate("/onboarding");
      return;
    }

    setAttempt(attemptData);

    // Calculate level
    const score = attemptData.score || 0;
    const total = attemptData.total_points || 20;
    const percentage = (score / total) * 100;

    let level = "beginner";
    if (percentage >= 70) level = "advanced";
    else if (percentage >= 40) level = "intermediate";

    setAssignedLevel(level);

    // Check if already processed
    const { data: profileData } = await supabase
      .from("profiles")
      .select("has_taken_entrance_exam, onboarding_completed")
      .eq("user_id", user!.id)
      .single();

    if (profileData && !(profileData as any).onboarding_completed) {
      await processEnrollment(level, score, total, percentage);
    } else {
      // Already processed, just load enrolled subjects
      await loadEnrolledSubjects(level);
    }

    setLoading(false);
  };

  const processEnrollment = async (level: string, score: number, total: number, percentage: number) => {
    setProcessing(true);

    // Update profile
    await supabase
      .from("profiles")
      .update({
        level,
        has_taken_entrance_exam: true,
        entrance_completed_at: new Date().toISOString(),
        onboarding_completed: true,
      } as any)
      .eq("user_id", user!.id);

    // Auto-enrol using level_courses mapping
    const { data: levelCourses } = await supabase
      .from("level_courses" as any)
      .select("subject_id")
      .eq("level", level);

    const subjectIds = (levelCourses as any[] || []).map((lc: any) => lc.subject_id);

    if (subjectIds.length > 0) {
      // Get courses for these subjects
      const { data: courses } = await supabase
        .from("courses")
        .select("id, title, title_ar, subject_id")
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

    // Load enrolled subjects for display
    await loadEnrolledSubjects(level);

    // Add student to level channel in Majlis
    const channelLevel = level.charAt(0).toUpperCase() + level.slice(1);
    const { data: levelChannel } = await supabase
      .from("chat_channels")
      .select("id")
      .eq("type", "level")
      .eq("level", level)
      .maybeSingle();

    if (levelChannel) {
      await supabase
        .from("chat_members")
        .insert({
          channel_id: levelChannel.id,
          user_id: user!.id,
          role: "member",
        })
        .select()
        .maybeSingle();
    }

    setProcessing(false);
  };

  const loadEnrolledSubjects = async (level: string) => {
    const { data: levelCourses } = await supabase
      .from("level_courses" as any)
      .select("subject_id")
      .eq("level", level);

    const subjectIds = (levelCourses as any[] || []).map((lc: any) => lc.subject_id);

    if (subjectIds.length > 0) {
      const { data: subjects } = await supabase
        .from("subjects")
        .select("id, title, title_ar")
        .in("id", subjectIds);
      setEnrolledSubjects(subjects || []);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0f3122" }}>
        <div className="text-center space-y-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-t-transparent mx-auto" style={{ borderColor: "#c9973a", borderTopColor: "transparent" }} />
          <p style={{ color: "#c9973a", fontFamily: "'Cairo', sans-serif" }}>
            {processing ? "Enrolling you in your programme..." : "Loading results..."}
          </p>
        </div>
      </div>
    );
  }

  const score = attempt?.score || 0;
  const total = attempt?.total_points || 20;
  const percentage = Math.round((score / total) * 100);

  const levelConfig: Record<string, { emoji: string; color: string; bg: string; labelEn: string; labelAr: string; message: string }> = {
    beginner: {
      emoji: "🟢",
      color: "#22c55e",
      bg: "rgba(34,197,94,0.15)",
      labelEn: "Beginner",
      labelAr: "مبتدئ",
      message: "Masha'Allah! Every journey begins with a single step. بارك الله فيك — You have been enrolled in our Beginner Programme.",
    },
    intermediate: {
      emoji: "🟡",
      color: "#eab308",
      bg: "rgba(234,179,8,0.15)",
      labelEn: "Intermediate",
      labelAr: "متوسط",
      message: "Excellent! You have a solid foundation. ما شاء الله — You have been enrolled in our Intermediate Programme.",
    },
    advanced: {
      emoji: "🔴",
      color: "#ef4444",
      bg: "rgba(239,68,68,0.15)",
      labelEn: "Advanced",
      labelAr: "متقدم",
      message: "Subhan'Allah! Your knowledge is impressive. سبحان الله — You have been enrolled in our Advanced Programme.",
    },
  };

  const lc = levelConfig[assignedLevel] || levelConfig.beginner;

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "linear-gradient(135deg, #0f3122 0%, #1a4a35 50%, #0f3122 100%)" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Cairo:wght@400;600;700&family=Cormorant+Garamond:wght@400;600;700&display=swap');
        .results-card { font-family: 'Cairo', sans-serif; }
        .amiri { font-family: 'Amiri', serif; }
        .cormorant { font-family: 'Cormorant Garamond', serif; }
      `}</style>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-lg"
      >
        <Card className="results-card border-0 shadow-2xl overflow-hidden" style={{ background: "#fdf8f0" }}>
          {/* Top decorative strip */}
          <div className="h-2" style={{ background: `linear-gradient(90deg, #0f3122, ${lc.color}, #c9973a)` }} />

          <CardContent className="p-8 space-y-6">
            {/* Bismillah */}
            <div className="text-center">
              <p className="amiri text-lg" style={{ color: "#c9973a" }} dir="rtl">
                بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ
              </p>
            </div>

            {/* Score */}
            <div className="text-center space-y-2">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.3, type: "spring" }}
                className="text-5xl font-bold"
                style={{ color: "#c9973a" }}
              >
                {score}/{total}
              </motion.div>
              <div className="text-lg font-semibold" style={{ color: "#0f3122" }}>
                {percentage}%
              </div>
            </div>

            {/* Level Badge */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="flex justify-center"
            >
              <div
                className="px-8 py-4 rounded-2xl text-center"
                style={{ background: lc.bg, border: `2px solid ${lc.color}` }}
              >
                <div className="text-3xl mb-1">{lc.emoji}</div>
                <div className="text-xl font-bold" style={{ color: lc.color }}>
                  {lc.labelEn}
                </div>
                <div className="amiri text-lg" style={{ color: lc.color }} dir="rtl">
                  {lc.labelAr}
                </div>
              </div>
            </motion.div>

            {/* Message */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
              className="text-center text-sm leading-relaxed"
              style={{ color: "#4a4a4a" }}
            >
              {lc.message}
            </motion.p>

            {/* Enrolled Subjects */}
            {enrolledSubjects.length > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.9 }}
                className="space-y-2"
              >
                <h3 className="text-sm font-bold" style={{ color: "#0f3122" }}>
                  Your Enrolled Courses:
                </h3>
                {enrolledSubjects.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-2 p-3 rounded-xl"
                    style={{ background: "rgba(15,49,34,0.05)" }}
                  >
                    <CheckCircle className="h-4 w-4" style={{ color: "#22c55e" }} />
                    <span className="text-sm font-medium" style={{ color: "#0f3122" }}>
                      {s.title}
                    </span>
                    {s.title_ar && (
                      <span className="amiri text-sm ml-auto" style={{ color: "#c9973a" }} dir="rtl">
                        {s.title_ar}
                      </span>
                    )}
                  </div>
                ))}
              </motion.div>
            )}

            {enrolledSubjects.length === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.9 }}
                className="p-4 rounded-xl text-center text-sm"
                style={{ background: "rgba(201,151,58,0.08)", color: "#888" }}
              >
                No courses mapped to your level yet. Your teacher will assign courses soon.
              </motion.div>
            )}

            {/* Go to Dashboard */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.1 }}
            >
              <Button
                onClick={() => navigate("/student", { replace: true })}
                className="w-full py-6 text-base rounded-xl font-bold"
                style={{ background: "#c9973a", color: "#fff", fontFamily: "'Cairo', sans-serif" }}
              >
                Go to My Dashboard <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </motion.div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default EntranceResults;
