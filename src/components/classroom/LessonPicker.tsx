import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";

/** Lessons of one subject, in order — used to tag classes / recordings / materials with a lesson. */
export function useSubjectLessons(subjectId?: string | null) {
  return useQuery({
    queryKey: ["subject-lessons-pick", subjectId],
    enabled: !!subjectId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("lessons")
        .select("id,title,title_ar,sort_order")
        .eq("subject_id", subjectId!)
        .order("sort_order");
      return data || [];
    },
  });
}

interface LessonPickerProps {
  subjectId?: string | null;
  value: string | null | undefined;
  onChange: (lessonId: string | null) => void;
  style?: React.CSSProperties;
  disabled?: boolean;
}

/** Small "Which lesson?" dropdown. Optional by design — empty means "not linked". */
const LessonPicker = ({ subjectId, value, onChange, style, disabled }: LessonPickerProps) => {
  const { t, language } = useLanguage();
  const { data: lessons = [], isLoading } = useSubjectLessons(subjectId);

  // If the subject changed, a previously picked lesson no longer belongs to it.
  useEffect(() => {
    if (!isLoading && value && !lessons.some((l: any) => l.id === value)) onChange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId, isLoading, lessons, value]);

  return (
    <select
      value={value || ""}
      disabled={disabled || !subjectId || isLoading}
      onChange={e => onChange(e.target.value || null)}
      style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid rgba(15,45,31,0.15)", fontSize: 14, background: "#fff", color: "#0f2d1f", boxSizing: "border-box", ...style }}
    >
      <option value="">{isLoading ? t("Loading lessons…", "جارٍ تحميل الدروس…") : lessons.length ? t("— Not linked to a lesson —", "— غير مرتبط بدرس —") : t("No lessons for this subject", "لا توجد دروس لهذه المادة")}</option>
      {lessons.map((l: any, i: number) => (
        <option key={l.id} value={l.id}>
          {(language === "ar" && l.title_ar) ? l.title_ar : l.title}
        </option>
      ))}
    </select>
  );
};

export default LessonPicker;
