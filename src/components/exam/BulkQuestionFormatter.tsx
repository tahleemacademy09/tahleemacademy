import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Bold, Italic, AlignLeft, AlignCenter, AlignRight, Minus, Plus, Eye, RotateCcw, Check, Save, Download, Trash2 } from "lucide-react";
import ExamFormatPreview from "./ExamFormatPreview";

export interface ExamFormatSettings {
  question_font_size: number;
  question_font_family: string;
  question_alignment: string;
  question_bold: boolean;
  question_italic: boolean;
  options_font_size: number;
  options_bold: boolean;
  options_alignment: string;
  question_color: string;
  question_line_height: number;
  question_padding: number;
  show_question_numbers: boolean;
  show_marks_per_question: boolean;
  rtl_mode: boolean;
}

const DEFAULT_FORMAT: ExamFormatSettings = {
  question_font_size: 16,
  question_font_family: "Cairo",
  question_alignment: "left",
  question_bold: false,
  question_italic: false,
  options_font_size: 14,
  options_bold: false,
  options_alignment: "left",
  question_color: "#1a1a1a",
  question_line_height: 1.7,
  question_padding: 16,
  show_question_numbers: true,
  show_marks_per_question: true,
  rtl_mode: false,
};

const PRESETS: { name: string; icon: string; settings: Partial<ExamFormatSettings> }[] = [
  {
    name: "Standard",
    icon: "📋",
    settings: { ...DEFAULT_FORMAT },
  },
  {
    name: "Arabic Mode",
    icon: "🕌",
    settings: {
      question_font_family: "Amiri",
      question_font_size: 18,
      question_color: "#0f3122",
      question_alignment: "right",
      question_line_height: 2.0,
      question_bold: false,
      rtl_mode: true,
      options_font_size: 16,
      options_alignment: "right",
      show_question_numbers: true,
      show_marks_per_question: true,
    },
  },
  {
    name: "Large Print",
    icon: "📰",
    settings: {
      question_font_family: "Cairo",
      question_font_size: 22,
      question_color: "#1a1a1a",
      question_alignment: "left",
      question_line_height: 2.0,
      question_bold: false,
      options_font_size: 18,
      options_alignment: "left",
      rtl_mode: false,
    },
  },
  {
    name: "Formal Exam",
    icon: "🎓",
    settings: {
      question_font_family: "Cairo",
      question_font_size: 16,
      question_color: "#1a237e",
      question_alignment: "left",
      question_line_height: 1.7,
      question_bold: true,
      options_font_size: 14,
      options_alignment: "left",
      question_padding: 24,
      show_question_numbers: true,
      show_marks_per_question: true,
      rtl_mode: false,
    },
  },
];

const FONT_FAMILIES = [
  { value: "Cairo", label: "Cairo" },
  { value: "Amiri", label: "Amiri" },
  { value: "'Cormorant Garamond', serif", label: "Cormorant Garamond" },
  { value: "Arial, sans-serif", label: "Arial" },
  { value: "'Times New Roman', serif", label: "Times New Roman" },
];

const COLOR_SWATCHES = [
  { value: "#1a1a1a", label: "Black" },
  { value: "#0f3122", label: "Dark Green" },
  { value: "#1a237e", label: "Dark Blue" },
  { value: "#b71c1c", label: "Dark Red" },
  { value: "#c9973a", label: "Gold" },
];

interface Props {
  format: ExamFormatSettings;
  onChange: (f: ExamFormatSettings) => void;
  onApply: () => void;
  questions: any[];
  examTitle?: string;
  examTitleAr?: string;
}

const BulkQuestionFormatter = ({ format, onChange, onApply, questions, examTitle, examTitleAr }: Props) => {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [showLoadTemplate, setShowLoadTemplate] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    const { data } = await supabase.from("exam_format_templates" as any).select("*").order("created_at", { ascending: false });
    setTemplates(data || []);
  };

  const set = (key: keyof ExamFormatSettings, val: any) => onChange({ ...format, [key]: val });

  const applyPreset = (preset: typeof PRESETS[0]) => {
    onChange({ ...format, ...preset.settings });
    toast({ title: `${preset.icon} ${t(`${preset.name} preset applied`, `تم تطبيق نمط ${preset.name}`)}` });
  };

  const resetToDefault = () => {
    onChange({ ...DEFAULT_FORMAT });
    toast({ title: t("↺ Reset to defaults", "↺ تم إعادة التعيين") });
  };

  const saveTemplate = async () => {
    if (!templateName.trim()) return;
    await supabase.from("exam_format_templates" as any).insert({
      name: templateName,
      created_by: user?.id,
      settings: format as any,
    });
    toast({ title: t("✅ Template saved!", "✅ تم حفظ القالب!") });
    setShowSaveTemplate(false);
    setTemplateName("");
    loadTemplates();
  };

  const loadTemplate = (tpl: any) => {
    const s = tpl.settings as any;
    onChange({ ...format, ...s });
    setShowLoadTemplate(false);
    toast({ title: t(`✅ Loaded: ${tpl.name}`, `✅ تم تحميل: ${tpl.name}`) });
  };

  const deleteTemplate = async (id: string) => {
    await supabase.from("exam_format_templates" as any).delete().eq("id", id);
    loadTemplates();
    toast({ title: t("Template deleted", "تم حذف القالب") });
  };

  const ToggleBtn = ({ active, onClick, children, className = "" }: { active: boolean; onClick: () => void; children: React.ReactNode; className?: string }) => (
    <button
      type="button"
      onClick={onClick}
      className={`h-9 w-9 rounded-md border text-sm font-bold transition-all flex items-center justify-center ${
        active ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:bg-accent text-foreground"
      } ${className}`}
    >
      {children}
    </button>
  );

  const SizeControl = ({ value, onChange: onSizeChange, min, max, label }: { value: number; onChange: (v: number) => void; min: number; max: number; label: string }) => (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground whitespace-nowrap">{label}</span>
      <button type="button" onClick={() => onSizeChange(Math.max(min, value - 1))} className="h-7 w-7 rounded border border-border flex items-center justify-center hover:bg-accent"><Minus className="h-3 w-3" /></button>
      <span className="w-8 text-center text-sm font-mono font-semibold">{value}</span>
      <button type="button" onClick={() => onSizeChange(Math.min(max, value + 1))} className="h-7 w-7 rounded border border-border flex items-center justify-center hover:bg-accent"><Plus className="h-3 w-3" /></button>
    </div>
  );

  return (
    <>
      <Card className="border-2 border-primary/20 bg-card/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            📝 {t("Bulk Question Formatter — Apply to All Questions", "تنسيق الأسئلة الجماعي — تطبيق على كل الأسئلة")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Section 1: Text Formatting */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("Question Text", "نص السؤال")}</Label>
            <div className="flex flex-wrap items-center gap-3">
              <ToggleBtn active={format.question_bold} onClick={() => set("question_bold", !format.question_bold)}>
                <Bold className="h-4 w-4" />
              </ToggleBtn>
              <ToggleBtn active={format.question_italic} onClick={() => set("question_italic", !format.question_italic)}>
                <Italic className="h-4 w-4" />
              </ToggleBtn>
              <SizeControl value={format.question_font_size} onChange={(v) => set("question_font_size", v)} min={12} max={32} label={t("Font Size", "حجم الخط")} />
              <Select value={format.question_font_family} onValueChange={(v) => set("question_font_family", v)}>
                <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FONT_FAMILIES.map((f) => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">{t("Color", "اللون")}</span>
                {COLOR_SWATCHES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => set("question_color", c.value)}
                    className={`h-7 w-7 rounded-full border-2 transition-all ${format.question_color === c.value ? "border-primary scale-110 ring-2 ring-primary/30" : "border-border"}`}
                    style={{ backgroundColor: c.value }}
                    title={c.label}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Section 2: Alignment */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("Alignment", "المحاذاة")}</Label>
            <div className="flex items-center gap-2">
              <ToggleBtn active={format.question_alignment === "left"} onClick={() => { set("question_alignment", "left"); if (format.rtl_mode) set("rtl_mode", false); }}>
                <AlignLeft className="h-4 w-4" />
              </ToggleBtn>
              <ToggleBtn active={format.question_alignment === "center"} onClick={() => set("question_alignment", "center")}>
                <AlignCenter className="h-4 w-4" />
              </ToggleBtn>
              <ToggleBtn active={format.question_alignment === "right"} onClick={() => { set("question_alignment", "right"); set("rtl_mode", true); }}>
                <AlignRight className="h-4 w-4" />
              </ToggleBtn>
            </div>
          </div>

          {/* Section 3: Answer Options */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("Answer Options", "خيارات الإجابة")}</Label>
            <div className="flex flex-wrap items-center gap-3">
              <ToggleBtn active={format.options_bold} onClick={() => set("options_bold", !format.options_bold)}>
                <Bold className="h-4 w-4" />
              </ToggleBtn>
              <SizeControl value={format.options_font_size} onChange={(v) => set("options_font_size", v)} min={11} max={24} label={t("Size", "الحجم")} />
              <div className="flex items-center gap-1">
                <ToggleBtn active={format.options_alignment === "left"} onClick={() => set("options_alignment", "left")}><AlignLeft className="h-3.5 w-3.5" /></ToggleBtn>
                <ToggleBtn active={format.options_alignment === "center"} onClick={() => set("options_alignment", "center")}><AlignCenter className="h-3.5 w-3.5" /></ToggleBtn>
                <ToggleBtn active={format.options_alignment === "right"} onClick={() => set("options_alignment", "right")}><AlignRight className="h-3.5 w-3.5" /></ToggleBtn>
              </div>
            </div>
          </div>

          {/* Section 4: Spacing & Layout */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("Layout", "التخطيط")}</Label>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">{t("Line Spacing", "تباعد الأسطر")}</span>
                {[{ v: 1.4, l: t("Compact", "مضغوط") }, { v: 1.7, l: t("Normal", "عادي") }, { v: 2.0, l: t("Relaxed", "مريح") }].map((o) => (
                  <button key={o.v} type="button" onClick={() => set("question_line_height", o.v)}
                    className={`px-3 h-8 rounded-md text-xs font-medium border transition-all ${format.question_line_height === o.v ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:bg-accent"}`}>
                    {o.l}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">{t("Spacing", "المسافة")}</span>
                {[{ v: 8, l: t("Small", "صغير") }, { v: 16, l: t("Medium", "متوسط") }, { v: 24, l: t("Large", "كبير") }].map((o) => (
                  <button key={o.v} type="button" onClick={() => set("question_padding", o.v)}
                    className={`px-3 h-8 rounded-md text-xs font-medium border transition-all ${format.question_padding === o.v ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:bg-accent"}`}>
                    {o.l}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Section 5: Display Options */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("Display", "العرض")}</Label>
            <div className="flex flex-wrap items-center gap-5">
              <div className="flex items-center gap-2">
                <Switch checked={format.show_question_numbers} onCheckedChange={(v) => set("show_question_numbers", v)} />
                <span className="text-sm">{t("Question Numbers", "ترقيم الأسئلة")}</span>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={format.show_marks_per_question} onCheckedChange={(v) => set("show_marks_per_question", v)} />
                <span className="text-sm">{t("Show Marks", "عرض الدرجات")}</span>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={format.rtl_mode} onCheckedChange={(v) => set("rtl_mode", v)} />
                <span className="text-sm">{t("RTL Mode", "وضع RTL")}</span>
              </div>
            </div>
          </div>

          {/* Section 6: Quick Presets */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("Quick Presets", "أنماط سريعة")}</Label>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <Button key={p.name} variant="outline" size="sm" onClick={() => applyPreset(p)} className="gap-1.5">
                  {p.icon} {p.name}
                </Button>
              ))}
            </div>
          </div>

          {/* Section 7: Templates */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("Templates", "القوالب")}</Label>
            <div className="flex flex-wrap gap-2">
              <Dialog open={showSaveTemplate} onOpenChange={setShowSaveTemplate}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1"><Save className="h-3 w-3" />{t("Save as Template", "حفظ كقالب")}</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>{t("Save Format Template", "حفظ قالب التنسيق")}</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <Input placeholder={t("Template name...", "اسم القالب...")} value={templateName} onChange={(e) => setTemplateName(e.target.value)} />
                    <Button onClick={saveTemplate} disabled={!templateName.trim()} className="w-full gap-1"><Save className="h-4 w-4" />{t("Save", "حفظ")}</Button>
                  </div>
                </DialogContent>
              </Dialog>
              <Dialog open={showLoadTemplate} onOpenChange={setShowLoadTemplate}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1"><Download className="h-3 w-3" />{t("Load Template", "تحميل قالب")}</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>{t("Load Format Template", "تحميل قالب التنسيق")}</DialogTitle></DialogHeader>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {templates.length === 0 && <p className="text-sm text-muted-foreground">{t("No templates saved yet", "لم يتم حفظ قوالب بعد")}</p>}
                    {templates.map((tpl: any) => (
                      <div key={tpl.id} className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent/50">
                        <button type="button" onClick={() => loadTemplate(tpl)} className="text-sm font-medium text-start flex-1">{tpl.name}</button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteTemplate(tpl.id)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    ))}
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-2 border-t">
            <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)} className="gap-1">
              <Eye className="h-3 w-3" />{t("Preview", "معاينة")}
            </Button>
            <Button variant="outline" size="sm" onClick={resetToDefault} className="gap-1">
              <RotateCcw className="h-3 w-3" />{t("Reset", "إعادة تعيين")}
            </Button>
            <Button size="sm" onClick={onApply} className="gap-1 ml-auto">
              <Check className="h-3 w-3" />{t(`Apply to All ${questions.length} Questions`, `تطبيق على كل ${questions.length} سؤال`)}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Preview Modal */}
      <ExamFormatPreview
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        format={format}
        questions={questions}
        examTitle={examTitle}
        examTitleAr={examTitleAr}
      />
    </>
  );
};

export { DEFAULT_FORMAT };
export default BulkQuestionFormatter;
