import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeHtml } from "@/lib/sanitize";
import { Search, Filter, BookOpen, Eye } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const QuestionBank = () => {
  const { t, language } = useLanguage();
  const [questions, setQuestions] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [difficultyFilter, setDifficultyFilter] = useState("all");
  const [examFilter, setExamFilter] = useState("all");
  const [previewQuestion, setPreviewQuestion] = useState<any>(null);

  useEffect(() => {
    const load = async () => {
      const [qRes, eRes] = await Promise.all([
        supabase.from("exam_questions").select("*, exams(title, title_ar)").order("created_at", { ascending: false }),
        supabase.from("exams").select("id, title, title_ar"),
      ]);
      setQuestions(qRes.data || []);
      setExams(eRes.data || []);
      setLoading(false);
    };
    load();
  }, []);

  const filtered = questions.filter((q) => {
    if (typeFilter !== "all" && q.question_type !== typeFilter) return false;
    if (difficultyFilter !== "all" && q.difficulty !== difficultyFilter) return false;
    if (examFilter !== "all" && q.exam_id !== examFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      const text = (q.question_text || "").toLowerCase();
      const textAr = (q.question_text_ar || "").toLowerCase();
      if (!text.includes(s) && !textAr.includes(s)) return false;
    }
    return true;
  });

  const stripHtml = (html: string) => {
    const doc = new DOMParser().parseFromString(html || "", "text/html");
    return doc.body.textContent || "";
  };

  const questionTypes = [
    { value: "mcq", label: "MCQ" },
    { value: "image_mcq", label: "Image MCQ" },
    { value: "true_false", label: "True/False" },
    { value: "short_answer", label: "Short Answer" },
    { value: "essay", label: "Essay" },
    { value: "fill_blank", label: "Fill Blank" },
    { value: "audio", label: "Audio" },
  ];

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <BookOpen className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">{t("Question Bank", "بنك الأسئلة")}</h1>
            <p className="text-sm text-muted-foreground">{t(`${questions.length} questions total`, `${questions.length} سؤال إجمالي`)}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs mb-1 block">{t("Search", "بحث")}</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder={t("Search questions...", "البحث في الأسئلة...")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="w-40">
              <Label className="text-xs mb-1 block">{t("Type", "النوع")}</Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("All Types", "جميع الأنواع")}</SelectItem>
                  {questionTypes.map((qt) => (
                    <SelectItem key={qt.value} value={qt.value}>{qt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-36">
              <Label className="text-xs mb-1 block">{t("Difficulty", "الصعوبة")}</Label>
              <Select value={difficultyFilter} onValueChange={setDifficultyFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("All Levels", "جميع المستويات")}</SelectItem>
                  <SelectItem value="easy">{t("Easy", "سهل")}</SelectItem>
                  <SelectItem value="medium">{t("Medium", "متوسط")}</SelectItem>
                  <SelectItem value="hard">{t("Hard", "صعب")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-48">
              <Label className="text-xs mb-1 block">{t("Exam", "الامتحان")}</Label>
              <Select value={examFilter} onValueChange={setExamFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("All Exams", "جميع الامتحانات")}</SelectItem>
                  {exams.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{language === "ar" ? e.title_ar || e.title : e.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t("No questions found matching your filters.", "لم يتم العثور على أسئلة مطابقة لمرشحاتك.")}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>{t("Question", "السؤال")}</TableHead>
                  <TableHead className="w-28">{t("Type", "النوع")}</TableHead>
                  <TableHead className="w-24">{t("Difficulty", "الصعوبة")}</TableHead>
                  <TableHead className="w-16">{t("Points", "نقاط")}</TableHead>
                  <TableHead className="w-40">{t("Exam", "الامتحان")}</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((q, i) => (
                  <TableRow key={q.id}>
                    <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                    <TableCell>
                      <div className="max-w-md truncate text-sm" dir="auto">
                        {stripHtml(language === "ar" ? q.question_text_ar || q.question_text : q.question_text)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs capitalize">{q.question_type?.replace("_", " ")}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={q.difficulty === "hard" ? "destructive" : q.difficulty === "easy" ? "default" : "secondary"} className="text-xs capitalize">
                        {q.difficulty}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{q.points}</TableCell>
                    <TableCell className="text-xs text-muted-foreground truncate max-w-[140px]">
                      {language === "ar" ? q.exams?.title_ar || q.exams?.title : q.exams?.title}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPreviewQuestion(q)}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="border-t px-4 py-2 text-xs text-muted-foreground">
            {t(`Showing ${filtered.length} of ${questions.length} questions`, `عرض ${filtered.length} من ${questions.length} سؤال`)}
          </div>
        </Card>
      )}

      {/* Preview Dialog */}
      <Dialog open={!!previewQuestion} onOpenChange={(open) => !open && setPreviewQuestion(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("Question Preview", "معاينة السؤال")}</DialogTitle>
          </DialogHeader>
          {previewQuestion && (
            <div className="space-y-3">
              <div className="flex gap-2 flex-wrap">
                <Badge variant="secondary">{previewQuestion.question_type?.replace("_", " ")}</Badge>
                <Badge variant="outline">{previewQuestion.points} {t("pts", "نقاط")}</Badge>
                <Badge variant={previewQuestion.difficulty === "hard" ? "destructive" : "default"}>{previewQuestion.difficulty}</Badge>
              </div>
              <div
                className="prose prose-sm max-w-none"
                dir="auto"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(previewQuestion.question_text || "") }}
              />
              {previewQuestion.question_text_ar && previewQuestion.question_text_ar !== previewQuestion.question_text && (
                <div
                  className="prose prose-sm max-w-none text-muted-foreground"
                  dir="rtl"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(previewQuestion.question_text_ar) }}
                />
              )}
              {(previewQuestion.question_type === "mcq" || previewQuestion.question_type === "image_mcq") && previewQuestion.options && (
                <div className="space-y-1.5">
                  {(previewQuestion.options as any[]).map((opt: any, oi: number) => (
                    <div key={opt.id} className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${opt.is_correct ? "border-primary bg-primary/10 font-medium" : ""}`}>
                      <span className="font-mono text-xs w-5">{String.fromCharCode(65 + oi)}.</span>
                      <span>{opt.text}</span>
                      {opt.is_correct && <Badge className="ml-auto text-xs">✓</Badge>}
                    </div>
                  ))}
                </div>
              )}
              {previewQuestion.correct_answer && (
                <p className="text-sm text-primary"><strong>{t("Answer", "الإجابة")}:</strong> {previewQuestion.correct_answer}</p>
              )}
              {previewQuestion.explanation && (
                <p className="text-xs text-muted-foreground">💡 {previewQuestion.explanation}</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default QuestionBank;
