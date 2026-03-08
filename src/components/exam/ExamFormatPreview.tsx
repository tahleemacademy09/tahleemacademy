import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { sanitizeHtml } from "@/lib/sanitize";
import type { ExamFormatSettings } from "./BulkQuestionFormatter";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  format: ExamFormatSettings;
  questions: any[];
  examTitle?: string;
  examTitleAr?: string;
}

const ExamFormatPreview = ({ open, onClose, format, questions, examTitle, examTitleAr }: Props) => {
  const { t, language } = useLanguage();

  const getQuestionStyle = (q?: any): React.CSSProperties => {
    const custom = q?.custom_format as any;
    return {
      fontSize: `${custom?.font_size || format.question_font_size}px`,
      fontFamily: format.question_font_family,
      textAlign: (custom?.alignment || format.question_alignment) as any,
      fontWeight: (custom?.bold ?? format.question_bold) ? "bold" : "normal",
      fontStyle: format.question_italic ? "italic" : "normal",
      color: custom?.color || format.question_color,
      lineHeight: format.question_line_height,
      direction: format.rtl_mode ? "rtl" : "ltr",
    };
  };

  const getOptionStyle = (): React.CSSProperties => ({
    fontSize: `${format.options_font_size}px`,
    fontWeight: format.options_bold ? "bold" : "normal",
    textAlign: format.options_alignment as any,
    direction: format.rtl_mode ? "rtl" : "ltr",
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            {t("Exam Preview", "معاينة الامتحان")}
            <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
          </DialogTitle>
        </DialogHeader>

        {/* Simulated exam paper */}
        <div className="bg-white rounded-lg border p-8 space-y-2 text-black" dir={format.rtl_mode ? "rtl" : "ltr"}>
          {/* Header */}
          <div className="text-center space-y-1 pb-4 border-b border-gray-200">
            <h2 className="text-xl font-bold" style={{ fontFamily: format.question_font_family }}>
              {language === "ar" ? examTitleAr || examTitle : examTitle}
            </h2>
            {examTitleAr && examTitle && language !== "ar" && (
              <p className="text-lg font-medium text-gray-600" style={{ fontFamily: "Amiri" }} dir="rtl">{examTitleAr}</p>
            )}
            <p className="text-sm text-gray-500">{questions.length} {t("questions", "سؤال")}</p>
          </div>

          {/* Questions */}
          {questions.map((q, idx) => (
            <div key={idx} style={{ paddingTop: `${format.question_padding}px`, paddingBottom: `${format.question_padding}px` }} className="border-b border-gray-100 last:border-0">
              <div className="flex items-start gap-2" style={getQuestionStyle(q)}>
                {format.show_question_numbers && (
                  <span className="font-bold shrink-0" style={{ color: format.question_color }}>Q{idx + 1}.</span>
                )}
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(q.question_text || "") }} />
                    {format.show_marks_per_question && (
                      <Badge variant="outline" className="shrink-0 text-xs">[{q.points || 1} {t("marks", "درجات")}]</Badge>
                    )}
                  </div>
                  {q.question_text_ar && q.question_text_ar !== q.question_text && (
                    <div className="mt-1 opacity-80" dir="rtl" style={{ fontFamily: "Amiri" }} dangerouslySetInnerHTML={{ __html: sanitizeHtml(q.question_text_ar) }} />
                  )}
                </div>
              </div>

              {/* MCQ Options */}
              {(q.question_type === "mcq" || q.question_type === "image_mcq") && q.options && (
                <div className="mt-2 space-y-1" style={{ marginLeft: format.show_question_numbers ? "1.5rem" : 0, marginRight: format.rtl_mode && format.show_question_numbers ? "1.5rem" : 0 }}>
                  {(Array.isArray(q.options) ? q.options : []).map((opt: any, oi: number) => (
                    <div key={oi} className="flex items-center gap-2 rounded px-2 py-1" style={getOptionStyle()}>
                      <span className="font-semibold text-gray-500">{String.fromCharCode(65 + oi)}.</span>
                      <span>{opt.text || opt.text_ar || ""}</span>
                    </div>
                  ))}
                </div>
              )}

              {q.question_type === "true_false" && (
                <div className="mt-2 flex gap-4" style={{ marginLeft: format.show_question_numbers ? "1.5rem" : 0 }}>
                  <span style={getOptionStyle()}>○ {t("True", "صح")}</span>
                  <span style={getOptionStyle()}>○ {t("False", "خطأ")}</span>
                </div>
              )}

              {["short_answer", "fill_blank", "essay"].includes(q.question_type) && (
                <div className="mt-2 border border-dashed border-gray-300 rounded h-8" style={{ marginLeft: format.show_question_numbers ? "1.5rem" : 0 }} />
              )}
            </div>
          ))}

          {questions.length === 0 && (
            <p className="text-center text-gray-400 py-8">{t("No questions to preview", "لا توجد أسئلة للمعاينة")}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ExamFormatPreview;
