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
  
  const [subjects, setSubjects] = useState<any[]>([]);
  const [mappings, setMappings] = useState<Record<string, string[]>>({});
  const [initialMappings, setInitialMappings] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load subjects & current mappings
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [subRes, mapRes] = await Promise.all([
          supabase.from("subjects").select("id, title, title_ar, is_active").eq("is_active", true).order("title"),
          supabase.from("level_courses").select("level, subject_id")
        ]);

        if (subRes.data) setSubjects(subRes.data);
        
        const map: Record<string, string[]> = {};
        mapRes.data?.forEach((m: any) => {
          if (!map[m.subject_id]) map[m.subject_id] = [];
          map[m.subject_id].push(m.level);
        });

        setMappings(map);
        setInitialMappings(JSON.parse(JSON.stringify(map)));      } catch (err) {
        toast({ title: t("Failed to load data", "فشل تحميل البيانات"), variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const toggleLevel = (subjectId: string, level: Level) => {
    setMappings(prev => {
      const current = prev[subjectId] || [];
      const next = current.includes(level)
        ? current.filter(l => l !== level)
        : [...current, level];
      return { ...prev, [subjectId]: next };
    });
  };

  const hasChanges = () => {
    return JSON.stringify(mappings) !== JSON.stringify(initialMappings);
  };

  const saveChanges = async () => {
    if (!hasChanges()) return;
    setSaving(true);
    try {
      const toInsert: { level: Level; subject_id: string }[] = [];
      const toDelete: { level: Level; subject_id: string }[] = [];

      subjects.forEach(sub => {
        const newLevels = mappings[sub.id] || [];
        const oldLevels = initialMappings[sub.id] || [];

        newLevels.forEach(level => {
          if (!oldLevels.includes(level)) toInsert.push({ level, subject_id: sub.id });
        });
        oldLevels.forEach(level => {
          if (!newLevels.includes(level)) toDelete.push({ level, subject_id: sub.id });
        });
      });

      if (toInsert.length) {
        const { error } = await supabase.from("level_courses").insert(toInsert);
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
            {t("Assign subjects to beginner, intermediate, or advanced levels. Students will only see subjects mapped to their assigned level.", 
               "قم بتعيين المواد للمستويات المبتدئ أو المتوسط أو المتقدم. سيرى الطلاب فقط المواد المعينة لمستواهم.")}
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
                          const checked = (mappings[sub.id] || []).includes(level);
                          return (
                            <td key={level} className="p-4 text-center">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() => toggleLevel(sub.id, level)}
                                style={{ borderColor: LEVEL_CONFIG[level].color, color: LEVEL_CONFIG[level].color }}
                              />
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