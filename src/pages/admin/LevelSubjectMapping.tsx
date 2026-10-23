import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Save, CheckCircle2, AlertCircle, BookOpen, ChevronDown, ChevronUp } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAcademicLevels, getLevelConfig } from "@/hooks/useAcademicLevels";

type Level = string;

const LevelSubjectMapping = () => {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const { data: academicLevels = [] } = useAcademicLevels();
  const LEVELS = academicLevels.map(l => l.slug);
  const LEVEL_CONFIG = Object.fromEntries(academicLevels.map(l => {
    const cfg = getLevelConfig(l.slug, academicLevels);
    return [l.slug, { label: l.name_en, labelAr: l.name_ar, color: cfg.color, bg: cfg.bg }];
  }));

  // subjectId -> level -> is_compulsory
  type CellMap = Record<string, Record<Level, boolean>>;
  const [mappings, setMappings] = useState<CellMap>({});
  const [initialMappings, setInitialMappings] = useState<CellMap>({});
  const [subjects, setSubjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState<Level | null>(null);
  const [showOthers, setShowOthers] = useState(false);

  // Parse a subject's `level` text field ("beginner,intermediate" / "all" / "tamhidi")
  // into the set of level slugs it belongs to.
  const subjectLevels = (sub: any): string[] => {
    const raw = (sub.level || "").toLowerCase().trim();
    if (!raw) return [];
    if (raw === "all" || raw.split(",").map((s: string) => s.trim()).includes("all")) return LEVELS;
    return raw.split(",").map((s: string) => s.trim()).filter(Boolean);
  };

  const isChecked    = (subjectId: string, level: Level) => level in (mappings[subjectId] || {});
  const isCompulsory = (subjectId: string, level: Level) => (mappings[subjectId] || {})[level] ?? true;

  // Load subjects & current mappings, then default-fill any (subject, level)
  // pair that the subject's own `level` tag applies to but that doesn't yet
  // have a level_courses row — defaulted to Compulsory, awaiting Save.
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [subRes, mapRes] = await Promise.all([
          supabase.from("subjects").select("id, title, title_ar, level, is_active").eq("is_active", true).order("title"),
          supabase.from("level_courses").select("level, subject_id, is_compulsory")
        ]);

        const subs = subRes.data || [];
        setSubjects(subs);

        const dbMap: CellMap = {};
        (mapRes.data as any[])?.forEach((m: any) => {
          if (!dbMap[m.subject_id]) dbMap[m.subject_id] = {};
          dbMap[m.subject_id][m.level as Level] = m.is_compulsory ?? true;
        });
        setInitialMappings(JSON.parse(JSON.stringify(dbMap)));

        const defaulted: CellMap = JSON.parse(JSON.stringify(dbMap));
        subs.forEach((sub: any) => {
          subjectLevels(sub).forEach(lvl => {
            if (!LEVELS.includes(lvl)) return;
            if (!defaulted[sub.id]) defaulted[sub.id] = {};
            if (!(lvl in defaulted[sub.id])) defaulted[sub.id][lvl] = true; // default: compulsory
          });
        });
        setMappings(defaulted);

        if (!selectedLevel && LEVELS.length) setSelectedLevel(LEVELS[0]);
      } catch (err) {
        toast({ title: t("Failed to load data", "فشل تحميل البيانات"), variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };
    if (academicLevels.length) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [academicLevels.length]);

  const toggleLevel = (subjectId: string, level: Level) => {
    setMappings(prev => {
      const current = { ...(prev[subjectId] || {}) };
      if (level in current) delete current[level];
      else current[level] = true; // new mappings default to compulsory
      return { ...prev, [subjectId]: current };
    });
  };

  const toggleCompulsory = (subjectId: string, level: Level, value: boolean) => {
    setMappings(prev => {
      if (!(level in (prev[subjectId] || {}))) return prev;
      const current = { ...(prev[subjectId] || {}) };
      current[level] = value;
      return { ...prev, [subjectId]: current };
    });
  };

  const hasChanges = () => JSON.stringify(mappings) !== JSON.stringify(initialMappings);

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
          if (error) throw error;
        }
      }

      setInitialMappings(JSON.parse(JSON.stringify(mappings)));
      toast({ title: t("✅ Mappings saved successfully!", "✅ تم حفظ التعيينات بنجاح!") });
    } catch (e: any) {
      toast({ title: t("❌ Failed to save", "❌ فشل الحفظ"), description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Subjects tagged for the selected level (via subjects.level), plus any
  // subject that's already manually mapped to it even if untagged.
  const levelSubjects = useMemo(() => {
    if (!selectedLevel) return [];
    return subjects.filter(sub =>
      subjectLevels(sub).includes(selectedLevel) || isChecked(sub.id, selectedLevel)
    );
  }, [subjects, selectedLevel, mappings]);

  const otherSubjects = useMemo(() => {
    if (!selectedLevel) return [];
    const shown = new Set(levelSubjects.map(s => s.id));
    return subjects.filter(sub => !shown.has(sub.id));
  }, [subjects, levelSubjects, selectedLevel]);

  if (loading || !selectedLevel) {
    return (
      <div className="container mx-auto px-4 py-8 space-y-4">
        <Skeleton className="h-10 w-64" />
        {[1,2,3,4].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
      </div>
    );
  }

  const renderSubjectRow = (sub: any) => {
    const checked = isChecked(sub.id, selectedLevel);
    const compulsory = isCompulsory(sub.id, selectedLevel);
    return (
      <div
        key={sub.id}
        style={{
          background: "#fff",
          border: "1px solid #F0F0F0",
          borderRadius: 14,
          padding: "14px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="font-medium text-gray-900" style={{ wordBreak: "break-word" }}>
              {language === "ar" ? sub.title_ar || sub.title : sub.title}
            </div>
            {sub.title_ar && language !== "ar" && (
              <div className="text-xs text-gray-500 font-arabic" dir="rtl">{sub.title_ar}</div>
            )}
          </div>
          <Switch
            checked={checked}
            onCheckedChange={() => toggleLevel(sub.id, selectedLevel)}
          />
        </div>
        {checked && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => toggleCompulsory(sub.id, selectedLevel, true)}
              style={{
                flex: 1, fontSize: 12, fontWeight: 700, padding: "7px 10px", borderRadius: 10,
                border: "1px solid", cursor: "pointer",
                background: compulsory ? "#FEF2F2" : "#fff",
                color: compulsory ? "#B91C1C" : "#9CA3AF",
                borderColor: compulsory ? "#FCA5A5" : "#E5E7EB",
              }}
            >
              {t("Compulsory", "إلزامي")}
            </button>
            <button
              type="button"
              onClick={() => toggleCompulsory(sub.id, selectedLevel, false)}
              style={{
                flex: 1, fontSize: 12, fontWeight: 700, padding: "7px 10px", borderRadius: 10,
                border: "1px solid", cursor: "pointer",
                background: !compulsory ? "#F0FDF4" : "#fff",
                color: !compulsory ? "#15803D" : "#9CA3AF",
                borderColor: !compulsory ? "#86EFAC" : "#E5E7EB",
              }}
            >
              {t("Optional", "اختياري")}
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ background: "#FAF6EE", minHeight: "100vh", padding: "20px 12px 100px", fontFamily: "'Cairo', sans-serif" }}>
      <div className="mx-auto w-full space-y-5" style={{ maxWidth: 640 }}>

        {/* Header */}
        <div style={{ background: "linear-gradient(135deg, #064E3B 0%, #075E54 100%)", padding: "20px", borderRadius: 16, color: "#fff", boxShadow: "0 4px 20px rgba(6,78,59,0.15)" }}>
          <div className="flex items-center gap-3 mb-2">
            <BookOpen className="h-5 w-5 shrink-0" style={{ color: "#E8C070" }} />
            <h1 className="text-xl font-bold" style={{ fontFamily: language === "ar" ? "'Amiri', serif" : "'Playfair Display', serif" }}>
              {t("Subject Level Mapping", "تعيين مستويات المواد")}
            </h1>
          </div>
          <p className="text-sm opacity-80">
            {t("Pick a level below to see just its subjects. They're pre-filled as Compulsory based on each subject's own level tag — review, adjust, and Save.",
               "اختر مستوى أدناه لرؤية مواده فقط. تم تعبئتها مسبقاً كإلزامية بناءً على وسم المستوى الخاص بكل مادة — راجع وعدّل ثم احفظ.")}
          </p>
        </div>

        {/* Level selector — horizontally scrollable pill row */}
        <div
          className="flex gap-2 overflow-x-auto pb-1"
          style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
        >
          {LEVELS.map(level => {
            const active = level === selectedLevel;
            const cfg = LEVEL_CONFIG[level];
            return (
              <button
                key={level}
                type="button"
                onClick={() => setSelectedLevel(level)}
                style={{
                  flexShrink: 0,
                  padding: "9px 16px",
                  borderRadius: 999,
                  fontSize: 13,
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                  border: `1.5px solid ${active ? cfg.color : "#E5E7EB"}`,
                  background: active ? cfg.color : "#fff",
                  color: active ? "#fff" : cfg.color,
                  cursor: "pointer",
                }}
              >
                {language === "ar" ? cfg.labelAr : cfg.label}
              </button>
            );
          })}
        </div>

        {/* Subject list for the selected level */}
        <div className="space-y-3">
          {levelSubjects.length === 0 ? (
            <div className="text-center p-8 text-gray-500 bg-white rounded-2xl border border-gray-100">
              {t("No subjects tagged for this level yet.", "لا توجد مواد موسومة لهذا المستوى بعد.")}
            </div>
          ) : (
            levelSubjects.map(renderSubjectRow)
          )}
        </div>

        {/* Other subjects, collapsed by default */}
        {otherSubjects.length > 0 && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setShowOthers(v => !v)}
              className="flex items-center gap-1.5 text-sm font-medium"
              style={{ color: "#6B7280" }}
            >
              {showOthers ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {t(`Add other subjects (${otherSubjects.length})`, `إضافة مواد أخرى (${otherSubjects.length})`)}
            </button>
            {showOthers && (
              <div className="space-y-3">
                {otherSubjects.map(renderSubjectRow)}
              </div>
            )}
          </div>
        )}

        {/* Sticky Save Bar */}
        <div
          className="flex items-center justify-between bg-white p-4 rounded-xl border border-gray-200 shadow-sm"
          style={{ position: "sticky", bottom: 12, zIndex: 10 }}
        >
          <div className="flex items-center gap-2 text-sm text-gray-600">
            {hasChanges() ? (
              <>
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                <span>{t("Unsaved changes", "تغييرات غير محفوظة")}</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                <span>{t("All changes saved", "جميع التغييرات محفوظة")}</span>
              </>
            )}
          </div>
          <button
            onClick={saveChanges}
            disabled={!hasChanges() || saving}
            style={{
              background: hasChanges() ? "#064E3B" : "#E5E7EB",
              color: hasChanges() ? "#fff" : "#9CA3AF",
              borderRadius: 10,
              padding: "10px 20px",
              fontWeight: 600,
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              gap: 6,
              border: "none",
              cursor: hasChanges() && !saving ? "pointer" : "default",
            }}
          >
            {saving ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> {t("Saving…", "جارٍ الحفظ…")}</>
            ) : (
              <><Save className="h-4 w-4" /> {t("Save", "حفظ")}</>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};

export default LevelSubjectMapping;
