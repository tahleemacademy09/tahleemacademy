import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Save, CheckCircle2, AlertCircle, BookOpen } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAcademicLevels, getLevelConfig, getLevelDisplay } from "@/hooks/useAcademicLevels";

type Level = string;

const LEVEL_STYLE_STATIC: Record<string, { label: string; labelAr: string; color: string; bg: string }> = {
  beginner:     { label: "Beginner",     labelAr: "مبتدئ",     color: "#16A34A", bg: "#F0FDF4" },
  intermediate: { label: "Intermediate", labelAr: "متوسط",     color: "#2563EB", bg: "#EFF6FF" },
  advanced:     { label: "Advanced",     labelAr: "متقدم",     color: "#7C3AED", bg: "#F5F3FF" },
};

const LevelSubjectMapping = () => {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const { data: academicLevels = [] } = useAcademicLevels();
  const LEVELS = academicLevels.map(l => l.slug);
  const LEVEL_CONFIG = Object.fromEntries(academicLevels.map(l => {
    const cfg = getLevelConfig(l.slug, academicLevels);
    return [l.slug, { label: l.name_en, labelAr: l.name_ar, color: cfg.color, bg: cfg.bg }];
  }));
  
  // Each mapping cell now carries whether the subject is compulsory (true)
  // or optional (false) for that level, instead of a plain boolean checked.
  type CellMap = Record<string, Record<Level, boolean>>; // subjectId -> level -> is_compulsory
  const [mappings, setMappings] = useState<CellMap>({});
  const [initialMappings, setInitialMappings] = useState<CellMap>({});
  const [subjects, setSubjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const isChecked   = (subjectId: string, level: Level) => level in (mappings[subjectId] || {});
  const isCompulsory = (subjectId: string, level: Level) => (mappings[subjectId] || {})[level] ?? true;

  // Load subjects & current mappings
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [subRes, mapRes] = await Promise.all([
          supabase.from("subjects").select("id, title, title_ar, is_active").eq("is_active", true).order("title"),
          supabase.from("level_courses").select("level, subject_id, is_compulsory")
        ]);

        if (subRes.data) setSubjects(subRes.data);

        const map: CellMap = {};
        (mapRes.data as any[])?.forEach((m: any) => {
          if (!map[m.subject_id]) map[m.subject_id] = {};
          map[m.subject_id][m.level as Level] = m.is_compulsory ?? true;
        });

        setMappings(map);
        setInitialMappings(JSON.parse(JSON.stringify(map)));
      } catch (err) {
        toast({ title: t("Failed to load data", "فشل تحميل البيانات"), variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // Toggling the checkbox adds/removes the mapping (defaults to compulsory)
  const toggleLevel = (subjectId: string, level: Level) => {
    setMappings(prev => {
      const current = { ...(prev[subjectId] || {}) };
      if (level in current) delete current[level];
      else current[level] = true; // new mappings default to compulsory
      return { ...prev, [subjectId]: current };
    });
  };

  // Toggling the compulsory/optional pill flips it, without touching whether
  // the subject is mapped at all.
  const toggleCompulsory = (subjectId: string, level: Level) => {
    setMappings(prev => {
      if (!(level in (prev[subjectId] || {}))) return prev;
      const current = { ...(prev[subjectId] || {}) };
      current[level] = !current[level];
      return { ...prev, [subjectId]: current };
    });
  };

  const hasChanges = () => {
    return JSON.stringify(mappings) !== JSON.stringify(initialMappings);
  };

  const saveChanges = async () => {
    if (!hasChanges()) return;
    setSaving(true);
    try {
      const toInsert: { level: Level; subject_id: string; is_compulsory: boolean }[] = [];
      const toUpdate: { level: Level; subject_id: string; is_compulsory: boolean }[] = [];
      const toDelete: { level: Level; subject_id: string }[] = [];

      subjects.forEach(sub => {
        const newLevels = mappings[sub.id] || {};
        const oldLevels = initialMappings[sub.id] || {};

        Object.keys(newLevels).forEach(level => {
          if (!(level in oldLevels)) {
            toInsert.push({ level: level as Level, subject_id: sub.id, is_compulsory: newLevels[level as Level] });
          } else if (oldLevels[level as Level] !== newLevels[level as Level]) {
            toUpdate.push({ level: level as Level, subject_id: sub.id, is_compulsory: newLevels[level as Level] });
          }
        });
        Object.keys(oldLevels).forEach(level => {
          if (!(level in newLevels)) toDelete.push({ level: level as Level, subject_id: sub.id });
        });
      });

      if (toInsert.length) {
        const { error } = await supabase.from("level_courses").insert(toInsert as any);
        if (error) throw error;
      }
      for (const u of toUpdate) {
        const { error } = await supabase.from("level_courses" as any)
          .update({ is_compulsory: u.is_compulsory }).eq("level", u.level).eq("subject_id", u.subject_id);
        if (error) throw error;
      }
      if (toDelete.length) {
        for (const d of toDelete) {
          const { error } = await supabase.from("level_courses").delete().eq("level", d.level).eq("subject_id", d.subject_id);
          if (error) throw error;        }
      }

      setInitialMappings(JSON.parse(JSON.stringify(mappings)));
      toast({ title: t("✅ Mappings saved successfully!", "✅ تم حفظ التعيينات بنجاح!") });
    } catch (e: any) {
      toast({ title: t("❌ Failed to save", "❌ فشل الحفظ"), description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 space-y-4">
        <Skeleton className="h-10 w-64" />
        {[1,2,3,4].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
      </div>
    );
  }

  return (
    <div style={{ background: "#FAF6EE", minHeight: "100vh", padding: "24px 16px", fontFamily: "'Cairo', sans-serif" }}>
      <div className="container mx-auto max-w-5xl space-y-6">
        
        {/* Header */}
        <div style={{ background: "linear-gradient(135deg, #064E3B 0%, #075E54 100%)", padding: "24px", borderRadius: 16, color: "#fff", boxShadow: "0 4px 20px rgba(6,78,59,0.15)" }}>
          <div className="flex items-center gap-3 mb-2">
            <BookOpen className="h-6 w-6" style={{ color: "#E8C070" }} />
            <h1 className="text-2xl font-bold" style={{ fontFamily: language === "ar" ? "'Amiri', serif" : "'Playfair Display', serif" }}>
              {t("Subject Level Mapping", "تعيين مستويات المواد")}
            </h1>
          </div>
          <p className="text-sm opacity-80">
            {t("Assign subjects to levels. Students are auto-enrolled in every mapped subject when their level is set. Tap the pill under a checked box to mark a subject Compulsory (can't be disenrolled) or Optional (students may disenroll themselves).",
               "قم بتعيين المواد للمستويات. يتم تسجيل الطلاب تلقائياً في كل مادة مرتبطة عند تحديد مستواهم. اضغط على الشارة أسفل المربع المحدد لتحديد المادة كإلزامية (لا يمكن إلغاء تسجيلها) أو اختيارية (يمكن للطلاب إلغاء تسجيلهم بأنفسهم).")}
          </p>
        </div>

        {/* Mapping Table */}
        <Card className="border-0 shadow-sm" style={{ borderRadius: 16, overflow: "hidden" }}>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead style={{ background: "#F8F9FA", borderBottom: "1px solid #E5E7EB" }}>
                  <tr>
                    <th className="text-left p-4 font-semibold text-gray-700 w-1/3">
                      {t("Subject", "المادة")}
                    </th>
                    {LEVELS.map(level => (                      <th key={level} className="text-center p-4 font-semibold" style={{ color: LEVEL_CONFIG[level].color, width: "22%" }}>
                        {language === "ar" ? LEVEL_CONFIG[level].labelAr : LEVEL_CONFIG[level].label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {subjects.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center p-8 text-gray-500">
                        {t("No active subjects found. Create subjects first.", "لا توجد مواد نشطة. أنشئ المواد أولاً.")}
                      </td>
                    </tr>
                  ) : (
                    subjects.map((sub, idx) => (
                      <tr key={sub.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"} style={{ borderBottom: "1px solid #F0F0F0" }}>
                        <td className="p-4">
                          <div className="font-medium text-gray-900">
                            {language === "ar" ? sub.title_ar || sub.title : sub.title}
                          </div>
                          {sub.title_ar && language !== "ar" && (
                            <div className="text-xs text-gray-500 font-arabic" dir="rtl">{sub.title_ar}</div>
                          )}
                        </td>
                        {LEVELS.map(level => {
                          const checked = isChecked(sub.id, level);
                          const compulsory = isCompulsory(sub.id, level);
                          return (
                            <td key={level} className="p-4 text-center">
                              <div className="flex flex-col items-center gap-1">
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={() => toggleLevel(sub.id, level)}
                                  style={{ borderColor: LEVEL_CONFIG[level].color, color: LEVEL_CONFIG[level].color }}
                                />
                                {checked && (
                                  <button
                                    type="button"
                                    onClick={() => toggleCompulsory(sub.id, level)}
                                    title={t(
                                      "Click to toggle whether students can disenroll from this subject",
                                      "اضغط لتبديل إمكانية إلغاء تسجيل الطلاب من هذه المادة"
                                    )}
                                    style={{
                                      fontSize: 9, fontWeight: 700, padding: "1px 7px", borderRadius: 20,
                                      border: "1px solid transparent", cursor: "pointer",
                                      background: compulsory ? "#FEF2F2" : "#F0FDF4",
                                      color: compulsory ? "#B91C1C" : "#15803D",
                                      borderColor: compulsory ? "#FCA5A5" : "#86EFAC",
                                    }}
                                  >
                                    {compulsory
                                      ? t("Compulsory", "إلزامي")
                                      : t("Optional", "اختياري")}
                                  </button>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Save Bar */}
        <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            {hasChanges() ? (
              <>                <AlertCircle className="h-4 w-4 text-amber-600" />
                <span>{t("Unsaved changes", "تغييرات غير محفوظة")}</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span>{t("All changes saved", "جميع التغييرات محفوظة")}</span>
              </>
            )}
          </div>
          <Button
            onClick={saveChanges}
            disabled={!hasChanges() || saving}
            style={{ 
              background: hasChanges() ? "#064E3B" : "#E5E7EB", 
              color: hasChanges() ? "#fff" : "#9CA3AF",
              borderRadius: 10,
              padding: "10px 24px",
              fontWeight: 600
            }}
          >
            {saving ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" /> {t("Saving…", "جارٍ الحفظ…")}</>
            ) : (
              <><Save className="h-4 w-4 mr-2" /> {t("Save Mappings", "حفظ التعيينات")}</>
            )}
          </Button>
        </div>

      </div>
    </div>
  );
};

export default LevelSubjectMapping;