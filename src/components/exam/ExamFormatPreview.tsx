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

              {/* Media (image / audio) attached to the question, shown for any type */}
              {q.media_url && (
                <div className="mt-2" style={{ marginLeft: format.show_question_numbers ? "1.5rem" : 0 }}>
                  {q.question_type === "audio" || /\.(mp3|wav|ogg|m4a|webm)$/i.test(q.media_url) ? (
                    <audio controls src={q.media_url} className="w-full h-8" />
                  ) : (
                    <img src={q.media_url} alt="" className="max-h-40 rounded border object-contain" />
                  )}
                </div>
              )}

              {/* MCQ / Multi-Select Options */}
              {(q.question_type === "mcq" || q.question_type === "image_mcq" || q.question_type === "multi_select") && q.options && (
                <div className="mt-2 space-y-1" style={{ marginLeft: format.show_question_numbers ? "1.5rem" : 0, marginRight: format.rtl_mode && format.show_question_numbers ? "1.5rem" : 0 }}>
                  {(Array.isArray(q.options) ? q.options : []).map((opt: any, oi: number) => (
                    <div key={oi} className="flex items-center gap-2 rounded px-2 py-1" style={getOptionStyle()}>
                      <span className="font-semibold text-gray-500">
                        {q.question_type === "multi_select" ? "☐" : `${String.fromCharCode(65 + oi)}.`}
                      </span>
                      {opt.image_url && <img src={opt.image_url} alt="" className="h-10 rounded object-contain" />}
                      <span>{opt.text || opt.text_ar || ""}</span>
                    </div>
                  ))}
                  {q.question_type === "multi_select" && (
                    <p className="text-xs text-gray-400 italic">{t("Select all that apply", "اختر كل ما ينطبق")}</p>
                  )}
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

              {/* Audio / Dictation — response mode determines what the student does */}
              {q.question_type === "audio" && (
                <div className="mt-2 space-y-1" style={{ marginLeft: format.show_question_numbers ? "1.5rem" : 0 }}>
                  {q.audio_response_type === "audio" ? (
                    <>
                      <p className="text-xs text-gray-500 italic">{t("Student reads the Arabic text and records themselves reciting it.", "يقرأ الطالب النص العربي ويسجل نفسه وهو يتلوه.")}</p>
                      <div className="flex items-center gap-2 border border-dashed border-gray-300 rounded px-2 py-1.5 text-xs text-gray-400">🎙️ {t("Recording control", "زر التسجيل")}</div>
                    </>
                  ) : (
                    <>
                      {!q.media_url && (
                        <p className="text-xs text-red-500 italic">{t("No audio file attached — student will hear nothing.", "لا يوجد ملف صوتي مرفق — لن يسمع الطالب شيئًا.")}</p>
                      )}
                      <p className="text-xs text-gray-500 italic">{t("Student listens and types what they hear.", "يستمع الطالب ويكتب ما سمعه.")}</p>
                      <div className="border border-dashed border-gray-300 rounded h-8" />
                    </>
                  )}
                </div>
              )}

              {/* Matching (Drag & Drop) */}
              {q.question_type === "matching" && (
                <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1" style={{ marginLeft: format.show_question_numbers ? "1.5rem" : 0 }}>
                  {(Array.isArray(q.matching_pairs) ? q.matching_pairs : []).map((p: any, pi: number) => (
                    <div key={pi} className="contents" style={getOptionStyle()}>
                      <span className="rounded px-2 py-1 bg-gray-50 border border-gray-200">{p.left || "—"}</span>
                      <span className="rounded px-2 py-1 bg-gray-50 border border-gray-200">{p.right || "—"}</span>
                    </div>
                  ))}
                  {(!q.matching_pairs || q.matching_pairs.length === 0) && (
                    <p className="text-xs text-gray-400 italic col-span-2">{t("No matching pairs added yet", "لم تتم إضافة أزواج مطابقة بعد")}</p>
                  )}
                </div>
              )}

              {/* Ordering / Sequence */}
              {q.question_type === "ordering" && (
                <div className="mt-2 space-y-1" style={{ marginLeft: format.show_question_numbers ? "1.5rem" : 0 }}>
                  {(Array.isArray(q.ordering_items) ? q.ordering_items : []).filter(Boolean).map((item: string, ii: number) => (
                    <div key={ii} className="flex items-center gap-2 rounded px-2 py-1" style={getOptionStyle()}>
                      <span className="font-semibold text-gray-500">{ii + 1}.</span>
                      <span>{item}</span>
                    </div>
                  ))}
                  {(!q.ordering_items || q.ordering_items.filter(Boolean).length === 0) && (
                    <p className="text-xs text-gray-400 italic">{t("No items added yet", "لم تتم إضافة عناصر بعد")}</p>
                  )}
                  <p className="text-xs text-gray-400 italic">{t("(Shown shuffled to the student)", "(يظهر بترتيب عشوائي للطالب)")}</p>
                </div>
              )}

              {/* Drawing / Whiteboard */}
              {q.question_type === "drawing" && (
                <div className="mt-2 border border-dashed border-gray-300 rounded h-24 flex items-center justify-center text-xs text-gray-400" style={{ marginLeft: format.show_question_numbers ? "1.5rem" : 0 }}>
                  ✏️ {t("Whiteboard / drawing area", "لوحة رسم")}
                </div>
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
