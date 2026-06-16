/*  src/pages/student/StudentCourses.tsx  */
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { usePrivateStudent } from "@/hooks/usePrivateStudent";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, Play, ArrowRight, ChevronRight } from "lucide-react";

const G    = "#064E3B";
const GOLD = "#C9A84C";
const ARABIC_FONT = "'Tajawal', 'Cairo', sans-serif";

// ── Level config ───────────────────────────────────────────────────────────
const LEVEL_CFG: Record<string, { label: string; labelAr: string; bg: string; text: string; border: string }> = {
  all:          { label: "All Levels",   labelAr: "جميع المستويات", bg: "#F3F4F6", text: "#374151", border: "#D1D5DB" },
  beginner:     { label: "Beginner",     labelAr: "مبتدئ",          bg: "#F0FDF4", text: "#166534", border: "#86EFAC" },
  intermediate: { label: "Intermediate", labelAr: "متوسط",          bg: "#EFF6FF", text: "#1E40AF", border: "#93C5FD" },
  advanced:     { label: "Advanced",     labelAr: "متقدم",          bg: "#FDF4FF", text: "#6B21A8", border: "#D8B4FE" },
};
const safeLvl = (v?: string) => LEVEL_CFG[v || "all"] ?? LEVEL_CFG.all;

// ── Full-height image thumbnail (same pattern as admin SubjThumb) ──────────
const CardThumb = ({ url, title, bg }: { url?: string | null; title: string; bg: string }) => {
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr]  = useState(false);

  useEffect(() => {
    if (!url || !url.trim()) { setSrc(null); return; }
    if (url.startsWith("http")) { setSrc(url); return; }
    // Resolve from storage
    import("@/integrations/supabase/storageClient").then(({ storageSupabase }) => {
      const { data } = storageSupabase.storage.from("subject-images").getPublicUrl(url);
      setSrc(data?.publicUrl || null);
    });
  }, [url]);

  if (!src || err) {
    return (
      <div style={{ width: "100%", height: "100%", background: bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <BookOpen size={24} style={{ opacity: 0.25, color: "#064E3B" }} />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={title}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center", display: "block" }}
      onError={() => setErr(true)}
    />
  );
};

// ── Subject banner card (wide, taller — matches admin subject card style) ──
const SubjectBanner = ({
  subject, courseCount, language, onViewAll,
}: {
  subject: any; courseCount: number; language: string; onViewAll: () => void;
}) => {
  const lv = safeLvl(subject.level);
  const title    = language === "ar" ? (subject.title_ar || subject.title) : subject.title;
  const titleSub = language === "ar" ? subject.title : subject.title_ar;

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 16,
        border: `1px solid ${lv.border}`,
        overflow: "hidden",
        display: "flex",
        height: 120,
        boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
        transition: "box-shadow .2s, border-color .2s",
        cursor: "pointer",
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 18px rgba(6,78,59,0.13)";
        (e.currentTarget as HTMLDivElement).style.borderColor = `${G}55`;
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = "0 1px 6px rgba(0,0,0,0.06)";
        (e.currentTarget as HTMLDivElement).style.borderColor = lv.border;
      }}
    >
      {/* Image panel */}
      <div style={{ position: "relative", width: 120, flexShrink: 0, overflow: "hidden", background: lv.bg }}>
        <CardThumb url={subject.image_url} title={subject.title} bg={lv.bg} />
        {/* Gradient fade */}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, transparent 55%, rgba(255,255,255,0.85))", pointerEvents: "none" }} />
        {/* Course count badge */}
        <div style={{
          position: "absolute", bottom: 6, left: 5,
          padding: "2px 7px", borderRadius: 20,
          background: G, color: "#fff",
          fontSize: 9, fontWeight: 700,
        }}>
          {courseCount} {language === "ar" ? "دورة" : "courses"}
        </div>
      </div>

      {/* Content panel */}
      <div style={{ flex: 1, minWidth: 0, padding: "11px 13px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6, marginBottom: 2 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{
                fontWeight: 800, fontSize: 13.5, color: "#111", margin: "0 0 1px",
                lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                fontFamily: language === "ar" ? ARABIC_FONT : "'Playfair Display', serif",
              }}>{title}</p>
              {titleSub && (
                <p style={{
                  fontWeight: 600, fontSize: 11, color: GOLD, margin: 0,
                  direction: language === "ar" ? "ltr" : "rtl",
                  fontFamily: language === "ar" ? undefined : "'Amiri', serif",
                  lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{titleSub}</p>
              )}
            </div>
            <span style={{
              flexShrink: 0, padding: "2px 8px", borderRadius: 20,
              fontSize: 9, fontWeight: 700,
              background: lv.bg, color: lv.text, border: `1px solid ${lv.border}`,
              whiteSpace: "nowrap",
            }}>
              {language === "ar" ? lv.labelAr : lv.label}
            </span>
          </div>
          {subject.description && (
            <p style={{
              fontSize: 11, color: "#6B7280", margin: "4px 0 0", lineHeight: 1.45,
              display: "-webkit-box", WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical" as any, overflow: "hidden",
            }}>
              {subject.description}
            </p>
          )}
        </div>

        {/* View subject button */}
        <div style={{ marginTop: 8 }}>
          <Link to={`/student/subjects/${subject.id}`} style={{ textDecoration: "none" }}>
            <button style={{
              padding: "6px 14px", borderRadius: 8, border: "none",
              background: `linear-gradient(135deg, ${G}, #075E54)`,
              color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: 4,
            }}>
              <ChevronRight size={12} />
              {language === "ar" ? "عرض المادة" : "View Subject"}
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
};

// ── Course card (horizontal, matching admin course card style) ─────────────
const CourseCard = ({
  course, lessonCount, completedCount, progressPct, language,
}: {
  course: any; lessonCount: number; completedCount: number; progressPct: number; language: string;
}) => {
  const lv = safeLvl(course.level);
  const rawImageUrl = course.image_url || course.thumbnail || null;
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!rawImageUrl || !rawImageUrl.trim()) { setImageUrl(null); return; }
    if (rawImageUrl.startsWith("http")) { setImageUrl(rawImageUrl); return; }
    import("@/integrations/supabase/storageClient").then(({ storageSupabase }) => {
      const { data } = storageSupabase.storage.from("subject-images").getPublicUrl(rawImageUrl);
      setImageUrl(data?.publicUrl || null);
    });
  }, [rawImageUrl]);

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 14,
        border: `1px solid ${lv.border}`,
        overflow: "hidden",
        display: "flex",
        height: 112,
        boxShadow: "0 1px 5px rgba(0,0,0,0.05)",
        transition: "box-shadow .2s, transform .2s",
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = "0 6px 20px rgba(6,78,59,0.12)";
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = "0 1px 5px rgba(0,0,0,0.05)";
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
      }}
    >
      {/* Image panel */}
      <div style={{ position: "relative", width: 112, flexShrink: 0, overflow: "hidden", background: lv.bg }}>
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={course.title}
            loading="lazy"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center" }}
            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <BookOpen style={{ width: 24, height: 24, color: lv.text, opacity: 0.25 }} />
          </div>
        )}
        {/* Gradient fade */}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, transparent 55%, rgba(255,255,255,0.9))", pointerEvents: "none" }} />
        {/* Progress dot overlay */}
        {progressPct > 0 && (
          <div style={{
            position: "absolute", top: 6, left: 5,
            width: 28, height: 28, borderRadius: "50%",
            background: "rgba(6,78,59,0.85)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 8, fontWeight: 800, color: "#fff",
          }}>
            {progressPct}%
          </div>
        )}
      </div>

      {/* Content panel */}
      <div style={{ flex: 1, minWidth: 0, padding: "10px 12px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6, marginBottom: 2 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {course.title_ar && (
                <p style={{
                  fontWeight: 700, fontSize: 12.5, color: "#111", margin: "0 0 1px",
                  direction: "rtl", fontFamily: ARABIC_FONT, lineHeight: 1.3,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{course.title_ar}</p>
              )}
              <p style={{
                fontWeight: course.title_ar ? 500 : 700,
                fontSize: course.title_ar ? 10.5 : 12.5,
                color: course.title_ar ? "#6B7280" : "#111",
                margin: 0,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>{course.title}</p>
            </div>
            <span style={{
              flexShrink: 0, padding: "2px 7px", borderRadius: 20,
              fontSize: 8.5, fontWeight: 700,
              background: lv.bg, color: lv.text, border: `1px solid ${lv.border}`,
              whiteSpace: "nowrap",
            }}>
              {language === "ar" ? lv.labelAr : lv.label}
            </span>
          </div>
          {(course.description_ar || course.description) && (
            <p style={{
              fontSize: 10.5, color: "#9CA3AF", margin: "3px 0 0", lineHeight: 1.4,
              display: "-webkit-box", WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical" as any, overflow: "hidden",
            }}>
              {language === "ar" ? (course.description_ar || course.description) : (course.description || course.description_ar)}
            </p>
          )}
        </div>

        {/* Progress + CTA */}
        <div style={{ marginTop: 6 }}>
          {lessonCount > 0 && (
            <div style={{ marginBottom: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9.5, color: "#9CA3AF", marginBottom: 3 }}>
                <span>{completedCount}/{lessonCount} {language === "ar" ? "درس" : "lessons"}</span>
                <span style={{ fontWeight: 700, color: G }}>{progressPct}%</span>
              </div>
              <div style={{ height: 4, borderRadius: 4, background: "#E5E7EB", overflow: "hidden" }}>
                <div style={{
                  height: "100%", width: `${progressPct}%`,
                  background: "linear-gradient(90deg, #064E3B, #059669)",
                  borderRadius: 4, transition: "width .4s ease",
                }} />
              </div>
            </div>
          )}
          <Link to={`/student/courses/${course.id}`} style={{ textDecoration: "none" }}>
            <button style={{
              width: "100%", padding: "6px 0", borderRadius: 8, border: "none",
              background: `linear-gradient(135deg, ${G}, #075E54)`,
              color: "#fff", fontSize: 10.5, fontWeight: 700, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
            }}>
              <Play style={{ width: 9, height: 9 }} />
              {completedCount > 0
                ? (language === "ar" ? "متابعة" : "Continue")
                : (language === "ar" ? "ابدأ الآن" : "Start Course")}
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
const StudentCourses = () => {
  const { language } = useLanguage();
  const { user, profile } = useAuth();
  const studentLevel = profile?.level || "beginner";
  const { isPrivateStudent } = usePrivateStudent();

  // Private student subject/course assignment sets
  const { data: privateSubjectIds } = useQuery({
    queryKey: ["private-subject-ids", user?.id],
    enabled: isPrivateStudent && !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.from("private_student_subjects" as any).select("subject_id").eq("student_id", user!.id);
      return new Set((data || []).map((r: any) => r.subject_id));
    },
  });

  const { data: privateCourseIds } = useQuery({
    queryKey: ["private-course-ids", user?.id],
    enabled: isPrivateStudent && !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.from("private_student_courses" as any).select("course_id").eq("student_id", user!.id);
      return new Set((data || []).map((r: any) => r.course_id));
    },
  });

  // Fetch subjects
  const { data: allSubjectsRaw, isLoading: loadingSubjects } = useQuery({
    queryKey: ["subjects-active", studentLevel],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subjects")
        .select("*")
        .eq("is_active", true)
        .order("created_at");
      if (error) throw error;
      return (data || []).filter((s: any) => {
        const lv: string = s.level || "all";
        if (!lv || lv === "all") return true;
        return lv.split(",").map((l: string) => l.trim()).includes(studentLevel);
      });
    },
  });

  const subjects = (() => {
    const raw = allSubjectsRaw || [];
    if (isPrivateStudent) {
      const assigned = privateSubjectIds ?? new Set<string>();
      return raw.filter((s: any) => {
        const v = s.visibility || "all";
        if (v === "general") return false;
        if (v === "private") return assigned.has(s.id);
        return true;
      });
    }
    return raw.filter((s: any) => (s.visibility || "all") !== "private");
  })();

  // Fetch courses
  const { data: courses, isLoading: loadingCourses } = useQuery({
    queryKey: ["all-courses-published", studentLevel],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("id, title, title_ar, description, description_ar, subject_id, level, image_url, thumbnail, is_published, sort_order, visibility")
        .eq("is_published", true)
        .order("sort_order");
      if (error) throw error;
      const raw = (data || []).filter((c: any) => !c.level || c.level === "all" || c.level === studentLevel);
      if (isPrivateStudent) {
        const assigned = privateCourseIds ?? new Set<string>();
        return raw.filter((c: any) => {
          const v = c.visibility || "all";
          if (v === "general") return false;
          if (v === "private") return assigned.has(c.id);
          return true;
        });
      }
      return raw.filter((c: any) => (c.visibility || "all") !== "private");
    },
  });

  // Fetch lessons
  const { data: lessons } = useQuery({
    queryKey: ["all-lessons"],
    queryFn: async () => {
      const { data, error } = await supabase.from("lessons").select("id, course_id").order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  // Fetch progress
  const { data: progress } = useQuery({
    queryKey: ["my-progress", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lesson_progress")
        .select("lesson_id, completed")
        .eq("user_id", user!.id)
        .eq("completed", true);
      if (error) throw error;
      return data;
    },
  });

  const isLoading = loadingSubjects || loadingCourses;
  const completedLessonIds = new Set((progress || []).map((p: any) => p.lesson_id));
  const getLessonCount = (courseId: string) => (lessons || []).filter((l: any) => l.course_id === courseId).length;
  const getCompletedCount = (courseId: string) => {
    const cls = (lessons || []).filter((l: any) => l.course_id === courseId);
    return cls.filter((l: any) => completedLessonIds.has(l.id)).length;
  };
  const getProgressPct = (courseId: string) => {
    const total = getLessonCount(courseId);
    if (total === 0) return 0;
    return Math.round((getCompletedCount(courseId) / total) * 100);
  };

  const levelLabel = (level: string) => {
    const cfg = safeLvl(level);
    return language === "ar" ? cfg.labelAr : cfg.label;
  };

  // ── Loading skeleton ────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 space-y-6">
        <Skeleton className="h-10 w-64" />
        {[1, 2].map(i => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-[120px] rounded-2xl" />
            <div className="space-y-2 pl-2">
              {[1, 2].map(j => <Skeleton key={j} className="h-[112px] rounded-xl" />)}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const hasAnyCourses = (subjects || []).some(
    (s: any) => (courses || []).some((c: any) => c.subject_id === s.id)
  );

  // ── Main render ─────────────────────────────────────────────────
  return (
    <div className="container mx-auto px-4 py-6 md:py-8 space-y-8">

      {/* Header */}
      <div>
        <h1 style={{
          fontSize: 26, fontWeight: 800, color: G, margin: "0 0 4px",
          fontFamily: language === "ar" ? ARABIC_FONT : "'Playfair Display', serif",
        }}>
          {language === "ar" ? "دوراتي" : "My Courses"}
        </h1>
        <p style={{ fontSize: 13, color: "#8a8a8a", margin: 0 }}>
          {language === "ar"
            ? `المستوى: ${levelLabel(studentLevel)}`
            : `Your level: ${levelLabel(studentLevel)}`}
        </p>
      </div>

      {/* Subject sections */}
      {(subjects || []).map((subject: any) => {
        const subjectCourses = (courses || []).filter((c: any) => c.subject_id === subject.id);
        if (subjectCourses.length === 0) return null;

        return (
          <div key={subject.id} style={{ display: "flex", flexDirection: "column", gap: 10 }}>

            {/* Subject banner card */}
            <SubjectBanner
              subject={subject}
              courseCount={subjectCourses.length}
              language={language}
              onViewAll={() => {}}
            />

            {/* Course cards — indented slightly */}
            <div style={{ paddingLeft: 12, borderLeft: `3px solid ${safeLvl(subject.level).border}`, display: "flex", flexDirection: "column", gap: 8 }}>
              {subjectCourses.map((course: any) => (
                <CourseCard
                  key={course.id}
                  course={course}
                  lessonCount={getLessonCount(course.id)}
                  completedCount={getCompletedCount(course.id)}
                  progressPct={getProgressPct(course.id)}
                  language={language}
                />
              ))}

              {/* View all link */}
              <Link
                to={`/student/subjects/${subject.id}`}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  fontSize: 12, fontWeight: 700, color: G,
                  textDecoration: "none", padding: "4px 0",
                }}
              >
                <ArrowRight size={13} />
                {language === "ar" ? "عرض المادة كاملة" : "View full subject"}
              </Link>
            </div>
          </div>
        );
      })}

      {/* Empty state */}
      {!hasAnyCourses && (
        <div style={{
          textAlign: "center", padding: "60px 20px",
          background: "#fff", borderRadius: 20, border: "1px solid #E5E7EB",
        }}>
          <BookOpen style={{ width: 48, height: 48, color: "#D1D5DB", margin: "0 auto 16px", display: "block" }} />
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "#374151", margin: "0 0 6px", fontFamily: ARABIC_FONT }}>
            {language === "ar" ? "لا توجد دورات متاحة حالياً" : "No courses available yet"}
          </h3>
          <p style={{ fontSize: 13, color: "#9CA3AF", margin: 0 }}>
            {language === "ar" ? "ترقّب المزيد من الدورات قريباً!" : "Check back soon for new courses!"}
          </p>
        </div>
      )}
    </div>
  );
};

export default StudentCourses;
