/* src/pages/admin/QuestionBank.tsx — Enhanced mobile-first layout with edit/delete */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeHtml } from "@/lib/sanitize";
import { useToast } from "@/hooks/use-toast";
import { Search, BookOpen, Eye, Trash2, Copy, Filter, ChevronDown, ChevronUp, Loader2 } from "lucide-react";

const G = "#064E3B";

const diffColors: Record<string, { bg: string; text: string }> = {
  easy:   { bg: "#DCFCE7", text: "#166534" },
  medium: { bg: "#FEF9C3", text: "#854D0E" },
  hard:   { bg: "#FEE2E2", text: "#991B1B" },
};

const typeColors: Record<string, { bg: string; text: string }> = {
  mcq:          { bg: "#EFF6FF", text: "#1D4ED8" },
  essay:        { bg: "#F5F3FF", text: "#6D28D9" },
  true_false:   { bg: "#F0FDF4", text: "#166534" },
  short_answer: { bg: "#FFF7ED", text: "#C2410C" },
  audio:        { bg: "#FDF4FF", text: "#7E22CE" },
  image_mcq:    { bg: "#EFF6FF", text: "#1D4ED8" },
  fill_blank:   { bg: "#ECFDF5", text: "#065F46" },
};

const QuestionBank = () => {
  const { t, language } = useLanguage();
  const { toast } = useToast();

  const [questions, setQuestions] = useState<any[]>([]);
  const [exams, setExams]         = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [diffFilter, setDiffFilter] = useState("all");
  const [examFilter, setExamFilter] = useState("all");
  const [previewQ, setPreviewQ]   = useState<any>(null);
  const [expanded, setExpanded]   = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [deleting, setDeleting]   = useState<string|null>(null);

  const load = async () => {
    setLoading(true);
    const [qRes, eRes] = await Promise.all([
      supabase.from("exam_questions").select("*, exams(title, title_ar)").order("created_at", { ascending: false }),
      supabase.from("exams").select("id, title, title_ar"),
    ]);
    setQuestions(qRes.data || []);
    setExams(eRes.data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const stripHtml = (h: string) => new DOMParser().parseFromString(h||"","text/html").body.textContent||"";

  const filtered = questions.filter(q => {
    if (typeFilter !== "all" && q.question_type !== typeFilter) return false;
    if (diffFilter !== "all" && q.difficulty !== diffFilter) return false;
    if (examFilter !== "all" && q.exam_id !== examFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!q.question_text?.toLowerCase().includes(s) && !(q.question_text_ar||"").includes(search)) return false;
    }
    return true;
  });

  const deleteQ = async (id: string) => {
    if (!window.confirm("Delete this question?")) return;
    setDeleting(id);
    await supabase.from("exam_questions").delete().eq("id", id);
    setQuestions(p => p.filter(q => q.id !== id));
    toast({ title: "Question deleted" });
    setDeleting(null);
  };

  const toggleExpand = (id: string) => {
    const next = new Set(expanded);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpanded(next);
  };

  const typeCounts = questions.reduce((acc, q) => {
    acc[q.question_type] = (acc[q.question_type]||0)+1; return acc;
  }, {} as Record<string,number>);

  return (
    <div style={{ minHeight: "100vh", background: "#F8F9FA" }}>
      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", padding: "18px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: "#F5F3FF", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <BookOpen size={20} color="#6D28D9" />
            </div>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 800, color: "#111", margin: 0 }}>Question Bank</h1>
              <p style={{ fontSize: 12, color: "#6B7280", margin: 0 }}>{questions.length} questions across {exams.length} exams</p>
            </div>
          </div>
          <button onClick={() => setShowFilters(f => !f)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, border: "1.5px solid #E5E7EB", background: showFilters ? "#F5F3FF" : "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, color: showFilters ? "#6D28D9" : "#374151" }}>
            <Filter size={14} /> Filters {showFilters ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
          </button>
        </div>
      </div>

      <div style={{ padding: "16px", maxWidth: 900, margin: "0 auto" }}>

        {/* Search */}
        <div style={{ position: "relative", marginBottom: showFilters ? 12 : 16 }}>
          <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search questions…"
            style={{ width: "100%", padding: "11px 14px 11px 36px", borderRadius: 12, border: "1.5px solid #E5E7EB", fontSize: 14, outline: "none", background: "#fff", boxSizing: "border-box" as const }} />
        </div>

        {/* Filters panel */}
        {showFilters && (
          <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E5E7EB", padding: "14px 16px", marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
            {[
              { label: "Type", val: typeFilter, set: setTypeFilter, opts: [["all","All Types"],["mcq","MCQ"],["essay","Essay"],["true_false","True/False"],["short_answer","Short Answer"],["audio","Audio"],["fill_blank","Fill Blank"]] },
              { label: "Difficulty", val: diffFilter, set: setDiffFilter, opts: [["all","All Levels"],["easy","Easy"],["medium","Medium"],["hard","Hard"]] },
              { label: "Exam", val: examFilter, set: setExamFilter, opts: [["all","All Exams"], ...exams.map(e => [e.id, language==="ar"?e.title_ar||e.title:e.title])] },
            ].map((f, i) => (
              <div key={i} style={{ flex: 1, minWidth: 130 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", display: "block", marginBottom: 4 }}>{f.label}</label>
                <select value={f.val} onChange={e => f.set(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 9, border: "1.5px solid #E5E7EB", fontSize: 13, background: "#fff", outline: "none", boxSizing: "border-box" as const }}>
                  {f.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}

        {/* Type chips */}
        <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
          {Object.entries(typeCounts).map(([type, count]) => {
            const cfg = typeColors[type] || { bg: "#F3F4F6", text: "#374151" };
            return (
              <button key={type} onClick={() => setTypeFilter(typeFilter === type ? "all" : type)}
                style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: typeFilter === type ? cfg.text : cfg.bg, color: typeFilter === type ? "#fff" : cfg.text, border: "none", cursor: "pointer", fontWeight: 600 }}>
                {type.replace("_"," ")} ({count})
              </button>
            );
          })}
        </div>

        {/* Results count */}
        <p style={{ fontSize: 12, color: "#6B7280", marginBottom: 12 }}>
          Showing {filtered.length} of {questions.length} questions
          {(typeFilter !== "all" || diffFilter !== "all" || examFilter !== "all" || search) && (
            <button onClick={() => { setTypeFilter("all"); setDiffFilter("all"); setExamFilter("all"); setSearch(""); }}
              style={{ marginLeft: 8, fontSize: 11, color: "#DC2626", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>
              Clear filters
            </button>
          )}
        </p>

        {loading ? (
          <div style={{ textAlign: "center", padding: 48 }}>
            <Loader2 size={32} style={{ animation: "spin .8s linear infinite", color: "#6D28D9" }} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 24px", background: "#fff", borderRadius: 16, border: "2px dashed #E5E7EB" }}>
            <p style={{ fontWeight: 700, color: "#374151" }}>No questions found</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.map((q, i) => {
              const isExpanded = expanded.has(q.id);
              const tc = typeColors[q.question_type] || { bg: "#F3F4F6", text: "#374151" };
              const dc = diffColors[q.difficulty] || { bg: "#F3F4F6", text: "#6B7280" };
              const examTitle = language === "ar" ? q.exams?.title_ar || q.exams?.title : q.exams?.title;
              return (
                <div key={q.id} style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #E5E7EB", overflow: "hidden" }}>
                  {/* Question row */}
                  <div style={{ padding: "14px 16px", display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: "#9CA3AF", minWidth: 24, paddingTop: 2 }}>{i+1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: "#111", margin: 0, lineHeight: 1.5 }} dir="auto">
                        {stripHtml(language === "ar" ? q.question_text_ar || q.question_text : q.question_text)}
                      </p>
                      <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: tc.bg, color: tc.text, fontWeight: 600 }}>
                          {q.question_type?.replace("_", " ")}
                        </span>
                        {q.difficulty && (
                          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: dc.bg, color: dc.text, fontWeight: 600 }}>
                            {q.difficulty}
                          </span>
                        )}
                        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "#F3F4F6", color: "#6B7280", fontWeight: 600 }}>
                          {q.points} pt{q.points !== 1 ? "s" : ""}
                        </span>
                        {examTitle && (
                          <span style={{ fontSize: 10, color: "#9CA3AF", display: "flex", alignItems: "center" }}>📋 {examTitle}</span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                      <button onClick={() => setPreviewQ(q)}
                        style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Eye size={13} color="#6B7280" />
                      </button>
                      <button onClick={() => deleteQ(q.id)} disabled={deleting === q.id}
                        style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid #FECACA", background: "#FEF2F2", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {deleting === q.id ? <Loader2 size={12} style={{ animation: "spin .8s linear infinite" }} /> : <Trash2 size={13} color="#DC2626" />}
                      </button>
                      {q.question_type === "mcq" && (
                        <button onClick={() => toggleExpand(q.id)}
                          style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid #E5E7EB", background: isExpanded ? "#ECFDF5" : "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {isExpanded ? <ChevronUp size={13} color={G} /> : <ChevronDown size={13} color="#6B7280" />}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded options */}
                  {isExpanded && q.options && (
                    <div style={{ borderTop: "1px solid #F3F4F6", padding: "10px 16px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
                      {(q.options as any[]).map((opt: any, oi: number) => (
                        <div key={oi} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 9, background: opt.is_correct ? "#F0FDF4" : "#F9FAFB", border: `1px solid ${opt.is_correct ? "#86EFAC" : "#E5E7EB"}` }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: opt.is_correct ? G : "#9CA3AF", minWidth: 16 }}>
                            {String.fromCharCode(65+oi)}.
                          </span>
                          <span style={{ fontSize: 13, flex: 1, color: opt.is_correct ? G : "#374151", fontWeight: opt.is_correct ? 700 : 400 }} dir="auto">
                            {opt.text || opt.text_ar}
                          </span>
                          {opt.is_correct && <span style={{ fontSize: 11, fontWeight: 700, color: G }}>✓ Correct</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Preview Dialog */}
      <Dialog open={!!previewQ} onOpenChange={v => !v && setPreviewQ(null)}>
        <DialogContent style={{ maxWidth: 520, borderRadius: 20, padding: 0 }}>
          <div style={{ background: "#6D28D9", padding: "18px 20px", borderRadius: "20px 20px 0 0" }}>
            <h2 style={{ fontWeight: 800, fontSize: 16, color: "#fff", margin: 0 }}>Question Preview</h2>
          </div>
          {previewQ && (
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: (typeColors[previewQ.question_type]||{bg:"#F3F4F6"}).bg, color: (typeColors[previewQ.question_type]||{text:"#374151"}).text, fontWeight: 700 }}>
                  {previewQ.question_type?.replace("_"," ")}
                </span>
                {previewQ.difficulty && <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: (diffColors[previewQ.difficulty]||{bg:"#F3F4F6"}).bg, color: (diffColors[previewQ.difficulty]||{text:"#374151"}).text, fontWeight: 700 }}>{previewQ.difficulty}</span>}
                <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: "#F3F4F6", color: "#6B7280", fontWeight: 700 }}>{previewQ.points} pts</span>
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#111", lineHeight: 1.6, fontFamily: "'Amiri',serif" }} dir="auto"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(previewQ.question_text||"") }} />
              {previewQ.question_text_ar && previewQ.question_text_ar !== previewQ.question_text && (
                <div style={{ fontSize: 14, color: "#6B7280", fontFamily: "'Amiri',serif" }} dir="rtl"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(previewQ.question_text_ar) }} />
              )}
              {previewQ.options && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {(previewQ.options as any[]).map((opt: any, oi: number) => (
                    <div key={oi} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 10, background: opt.is_correct ? "#F0FDF4" : "#F9FAFB", border: `1.5px solid ${opt.is_correct ? "#86EFAC" : "#E5E7EB"}` }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: opt.is_correct ? G : "#9CA3AF", minWidth: 20 }}>{String.fromCharCode(65+oi)}.</span>
                      <span style={{ fontSize: 13, flex: 1, direction: "auto" as any }}>{opt.text || opt.text_ar}</span>
                      {opt.is_correct && <span style={{ fontSize: 12, fontWeight: 800, color: G }}>✓</span>}
                    </div>
                  ))}
                </div>
              )}
              {previewQ.correct_answer && (
                <div style={{ padding: "10px 14px", background: "#F0FDF4", borderRadius: 10, border: "1px solid #86EFAC" }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: G, margin: 0 }}>✓ Correct Answer: {previewQ.correct_answer}</p>
                </div>
              )}
              {previewQ.explanation && (
                <div style={{ padding: "10px 14px", background: "#FFFBEB", borderRadius: 10, border: "1px solid #FDE68A" }}>
                  <p style={{ fontSize: 12, color: "#92400E", margin: 0 }}>💡 {previewQ.explanation}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
};

export default QuestionBank;

