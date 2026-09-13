import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { useTeacherClasses } from "@/lib/useTeacherClasses";
import PageHeader from "@/components/admin/PageHeader";
import StatCard from "@/components/admin/StatCard";
import { scoreToGrade, scoreToRemark, suggestIslamicRemark, isAutoFilledRemark, computeTotal, guessNextClassName, TERMS, DEFAULT_SUBJECT_COMMENTS, DEFAULT_OVERALL_COMMENTS, mergeCommentBank, type CommentBank } from "@/lib/results-types";
import { Save, Loader2, LineChart, Trash2, Download, CheckCircle2, Lock, Megaphone, ClipboardList, FileText, Upload, FileSpreadsheet, Sparkles, Wand2, ChevronDown, SlidersHorizontal, Wrench, Pencil, Check } from "lucide-react";
import StudentReportModal from "@/components/admin/StudentReportModal";
import BulkResultUpload from "@/components/results/BulkResultUpload";

type ResultsSearch = { classId?: string; subjectId?: string; term?: string };

export const Route = createFileRoute("/_authenticated/admin/results")({
  validateSearch: (search: Record<string, unknown>): ResultsSearch => ({
    classId: typeof search.classId === "string" ? search.classId : undefined,
    subjectId: typeof search.subjectId === "string" ? search.subjectId : undefined,
    term: typeof search.term === "string" ? search.term : undefined,
  }),
  component: ResultsPage,
});

type SubjectRow = { id: string; name: string; beginner_order: number | null; high_order: number | null };
type StudentRow = { id: string; full_name: string; admission_no: string; class_id: string | null };
type ResultRow = {
  id: string; student_id: string; subject_id: string; term: string; session: string;
  ca_score: number | null; test_score: number | null; exam_score: number | null;
  score: number | null; grade: string | null; position: number | null; remarks: string | null;
};
type Draft = { test: string; exam: string; grade: string; position: string; remarks: string; id?: string };
type ReleaseRow = { id: string; class_id: string; term: string; session: string; released: boolean; released_at: string | null; session_text: string | null; holiday_begin: string | null; holiday_end: string | null };
type ReportDraft = { position: string; promoted_to: string; teacher_remarks: string; principal_remarks: string; id?: string };

function ResultsPage() {
  const { profile, activeProgram } = useAuth();
  const { classes: myClasses, loading: classesLoading } = useTeacherClasses();
  // A card elsewhere (e.g. an exam's "Results" link) can deep-link straight
  // into a specific class/subject/term via the URL — otherwise these just
  // start blank and get defaulted below as usual.
  const linkedSearch = Route.useSearch();
  const [classId, setClassId] = useState(() => linkedSearch.classId ?? "");
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [subjectId, setSubjectId] = useState(() => linkedSearch.subjectId ?? "");
  const [term, setTerm] = useState<string>(() => linkedSearch.term ?? TERMS[0]);
  const [session, setSession] = useState<string>("");
  const [sessionOptions, setSessionOptions] = useState<string[]>([]);
  const [subjectComments, setSubjectComments] = useState<CommentBank>(DEFAULT_SUBJECT_COMMENTS);
  const [overallComments, setOverallComments] = useState<CommentBank>(DEFAULT_OVERALL_COMMENTS);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [existing, setExisting] = useState<ResultRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [release, setRelease] = useState<ReleaseRow | null>(null);
  const [releasing, setReleasing] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [sessionText, setSessionText] = useState("");
  const [holidayBegin, setHolidayBegin] = useState("");
  const [holidayEnd, setHolidayEnd] = useState("");
  const [classTemplate, setClassTemplate] = useState<"beginner" | "high" | null>(null);
  const [allSubjects, setAllSubjects] = useState<SubjectRow[]>([]);
  const [reportDrafts, setReportDrafts] = useState<Record<string, ReportDraft>>({});
  // Every subject's result for this class/term/session (not just the subject
  // currently selected above) — used only to work out each student's overall
  // termly average, for auto-filling position and the Islamic-toned overall
  // remarks in the report card details section below.
  const [allResults, setAllResults] = useState<ResultRow[]>([]);
  const [showReportDetails, setShowReportDetails] = useState(false);
  const [showSubjectResults, setShowSubjectResults] = useState(true);
  // Rows in the subject-results table are view-only until an admin/teacher
  // taps the pencil icon — avoids accidental edits to another student's row
  // while scrolling/tapping on mobile. Each field saves itself on blur, so
  // there's no separate "confirm" step once a row is opened for editing.
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set());
  const [previewStudent, setPreviewStudent] = useState<{ id: string; name: string } | null>(null);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [generatingRemarks, setGeneratingRemarks] = useState(false);
  // Keys of the form "<studentId>:teacher" / "<studentId>:principal" for
  // remark fields that were last written by the AI (as opposed to typed by
  // hand). Kept separately from `isAutoFilledRemark` (which only recognises
  // the static suggestion bank) so that pressing "Generate remarks (AI)"
  // again is allowed to overwrite its own previous output with fresh
  // wording, while anything the admin typed by hand — even just one of the
  // two fields for a student — stays protected. A field's key is removed
  // the moment the admin edits it directly. Resets when a different
  // class/term/session is selected, since remarks are re-loaded from the
  // database at that point.
  const [aiFilledRemarkKeys, setAiFilledRemarkKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!activeProgram) return;
    supabase.from("subjects").select("id, name, beginner_order, high_order").eq("program", activeProgram).order("name").then(({ data }) => {
      setAllSubjects((data as SubjectRow[]) ?? []);
    });
  }, [activeProgram]);

  // Pull the school's current session/term and comment-suggestion banks from
  // Admin → Settings → Academic year / Report comments (school_settings),
  // and default the page to them. Also collect every session that already
  // has results recorded, so the admin can go back and view/edit a past
  // session without it ever mixing with the current one.
  useEffect(() => {
    if (!activeProgram) return;
    (async () => {
      const [{ data: settingsRow }, { data: sessionRows }] = await Promise.all([
        supabase.from("school_settings").select("data").eq("program", activeProgram).maybeSingle(),
        supabase.from("exam_results").select("session"),
      ]);
      const academic = (settingsRow?.data as any)?.academic;
      const comments = (settingsRow?.data as any)?.comments;
      setSubjectComments(mergeCommentBank(DEFAULT_SUBJECT_COMMENTS, comments?.subject));
      setOverallComments(mergeCommentBank(DEFAULT_OVERALL_COMMENTS, comments?.overall));
      const currentSession = academic?.session || "2025/2026";
      const found = new Set<string>((sessionRows ?? []).map((r: any) => r.session).filter(Boolean));
      found.add(currentSession);
      setSessionOptions(Array.from(found).sort().reverse());
      setSession((cur) => cur || currentSession);
      if (academic?.term) setTerm((cur) => (cur === TERMS[0] ? academic.term : cur));
    })();
  }, [activeProgram]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!classId) { setClassTemplate(null); return; }
    supabase.from("classes").select("result_template").eq("id", classId).maybeSingle().then(({ data }) => {
      setClassTemplate((data as any)?.result_template ?? null);
    });
  }, [classId]);

  useEffect(() => {
    const orderKey = classTemplate === "beginner" ? "beginner_order" : classTemplate === "high" ? "high_order" : null;
    const list = orderKey
      ? allSubjects.filter((s) => s[orderKey] !== null).sort((a, b) => (a[orderKey] ?? 999) - (b[orderKey] ?? 999))
      : allSubjects;
    setSubjects(list);
    setSubjectId((cur) => (list.some((s) => s.id === cur) ? cur : list[0]?.id ?? ""));
  }, [allSubjects, classTemplate]);

  useEffect(() => {
    if (classesLoading) return;
    if (myClasses.length && !myClasses.some((c) => c.id === classId)) setClassId(myClasses[0].id);
    if (myClasses.length === 0) setClassId("");
  }, [classesLoading, myClasses, classId]);

  async function loadRoster() {
    if (!classId || !subjectId || !session) return;
    setLoading(true);
    const [{ data: s, error: sErr }, { data: r, error: rErr }, { data: rel }, { data: reps }] = await Promise.all([
      supabase.from("students").select("id, full_name, admission_no, class_id").eq("class_id", classId).order("full_name"),
      supabase.from("exam_results").select("*").eq("subject_id", subjectId).eq("term", term).eq("session", session),
      supabase.from("result_releases").select("*").eq("class_id", classId).eq("term", term).eq("session", session).maybeSingle(),
      supabase.from("term_reports").select("*").eq("term", term).eq("session", session),
    ]);
    setLoading(false);
    if (sErr) { toast.error("Couldn't load students."); return; }
    if (rErr) { toast.error("Couldn't load existing results. " + rErr.message); }
    const relRow = (rel as ReleaseRow) ?? null;
    setRelease(relRow);
    setSessionText(relRow?.session_text ?? "");
    setHolidayBegin(relRow?.holiday_begin ?? "");
    setHolidayEnd(relRow?.holiday_end ?? "");
    const roster = (s as StudentRow[]) ?? [];
    setStudents(roster);
    const rosterIds = new Set(roster.map((st) => st.id));
    const rows = ((r as ResultRow[]) ?? []).filter((row) => rosterIds.has(row.student_id));
    setExisting(rows);
    const byStudent = new Map(rows.map((row) => [row.student_id, row]));

    // Pull every subject's result for this class/term/session (across all
    // subjects, not just the one selected above) so the report card section
    // can work out each student's overall termly average.
    if (roster.length > 0) {
      const { data: allRes, error: allResErr } = await supabase
        .from("exam_results")
        .select("id, student_id, subject_id, term, session, ca_score, test_score, exam_score, score, grade, position, remarks")
        .eq("term", term).eq("session", session).in("student_id", roster.map((st) => st.id));
      if (allResErr) toast.error("Couldn't load overall results. " + allResErr.message);
      setAllResults((allRes as ResultRow[]) ?? []);
    } else {
      setAllResults([]);
    }
    const next: Record<string, Draft> = {};
    for (const st of roster) {
      const ex = byStudent.get(st.id);
      next[st.id] = {
        test: ex?.test_score?.toString() ?? "",
        exam: ex?.exam_score?.toString() ?? "",
        grade: ex?.grade ?? "",
        position: ex?.position?.toString() ?? "",
        remarks: ex?.remarks ?? "",
        id: ex?.id,
      };
    }
    setDrafts(next);

    const repByStudent = new Map(((reps as any[]) ?? []).map((r) => [r.student_id, r]));
    const nextReports: Record<string, ReportDraft> = {};
    for (const st of roster) {
      const rp = repByStudent.get(st.id);
      nextReports[st.id] = {
        position: rp?.position?.toString() ?? "",
        promoted_to: rp?.promoted_to ?? "",
        teacher_remarks: rp?.class_teacher_remarks ?? "",
        principal_remarks: rp?.principal_remarks ?? "",
        id: rp?.id,
      };
    }
    setReportDrafts(nextReports);
    setAiFilledRemarkKeys(new Set());
  }
  useEffect(() => { loadRoster(); }, [classId, subjectId, term, session]); // eslint-disable-line react-hooks/exhaustive-deps

  function draftTotal(d: Draft) {
    const parts = [d.test, d.exam].filter((v) => v.trim() !== "").map(Number);
    return parts.length ? parts.reduce((a, b) => a + b, 0) : null;
  }

  function updateDraft(studentId: string, patch: Partial<Draft>) {
    setDrafts((d) => {
      const cur = d[studentId] ?? { test: "", exam: "", grade: "", position: "", remarks: "" };
      const merged = { ...cur, ...patch };
      const total = draftTotal(merged);
      if (total !== null) {
        merged.grade = scoreToGrade(total);
        // Auto-fill remarks with the plain grade word (Excellent / Very
        // Good / Good / Pass / Average / Fail), but never clobber something
        // the admin already typed in manually.
        if (!merged.remarks.trim()) merged.remarks = scoreToRemark(total);
      }
      return { ...d, [studentId]: merged };
    });
  }

  // Pull best CBT attempt scores in for this class/subject/term — matched by
  // exam.subject text against the subject name, exam.class_id, exam.term and
  // exam_type (test → Test column, examination → Exam column). Scaled to a
  // 0–100 percentage so it's ready to drop straight into Test/Exam. Admin can still edit
  // the pulled numbers before saving.
  async function pullFromCbt() {
    const subject = subjects.find((s) => s.id === subjectId);
    if (!subject || !classId) return;
    setPulling(true);
    try {
      const { data: exams, error: examErr } = await supabase
        .from("exams")
        .select("id, exam_type")
        .eq("class_id", classId)
        .eq("term", term)
        .eq("subject", subject.name);
      if (examErr) throw examErr;
      const examList = (exams as { id: string; exam_type: "test" | "examination" }[]) ?? [];
      if (examList.length === 0) {
        toast.info(`No CBT Test/Examination found for ${subject.name} · ${term} in this class.`);
        return;
      }
      const examIds = examList.map((e) => e.id);
      const { data: attempts, error: attErr } = await supabase
        .from("exam_attempts")
        .select("student_id, exam_id, score, total_marks, status")
        .in("exam_id", examIds)
        .neq("status", "in_progress");
      if (attErr) throw attErr;

      const examTypeById = new Map(examList.map((e) => [e.id, e.exam_type]));
      // Best (highest %) attempt per student per exam-type.
      const best: Record<string, { test?: number; exam?: number }> = {};
      for (const a of (attempts as any[]) ?? []) {
        const type = examTypeById.get(a.exam_id);
        const total = a.total_marks ?? 0;
        if (!type || total <= 0) continue;
        const pct = Math.round(((a.score ?? 0) / total) * 100);
        const entry = (best[a.student_id] ??= {});
        if (type === "test") entry.test = Math.max(entry.test ?? 0, pct);
        else entry.exam = Math.max(entry.exam ?? 0, pct);
      }

      let filled = 0;
      setDrafts((d) => {
        const next = { ...d };
        for (const st of students) {
          const found = best[st.id];
          if (!found) continue;
          const cur = next[st.id] ?? { test: "", exam: "", grade: "", position: "", remarks: "" };
          const merged = {
            ...cur,
            test: found.test !== undefined ? String(found.test) : cur.test,
            exam: found.exam !== undefined ? String(found.exam) : cur.exam,
          };
          const total = draftTotal(merged);
          if (total !== null) {
            merged.grade = scoreToGrade(total);
            if (!merged.remarks?.trim()) merged.remarks = scoreToRemark(total);
          }
          next[st.id] = merged;
          filled++;
        }
        return next;
      });
      toast.success(filled > 0 ? `Pulled CBT scores for ${filled} student${filled === 1 ? "" : "s"}. Review and save.` : "No matching attempts found for students in this class.");
    } catch (e: any) {
      toast.error("Couldn't pull CBT scores. " + (e?.message ?? ""));
    } finally {
      setPulling(false);
    }
  }

  // Fills in the plain grade-word remark (Excellent / Very Good / Good /
  // Pass / Average / Fail) for anyone whose subject remark still looks like
  // an untouched auto-fill (blank, a bare grade word, or an old Islamic-bank
  // line from before) rather than something the admin typed by hand.
  function fillPlainRemarks() {
    let filled = 0;
    setDrafts((d) => {
      const next = { ...d };
      for (const st of students) {
        const cur = next[st.id];
        if (!cur) continue;
        const total = draftTotal(cur);
        if (total === null) continue;
        if (!isAutoFilledRemark(cur.remarks, subjectComments)) continue;
        next[st.id] = { ...cur, remarks: scoreToRemark(total) };
        filled++;
      }
      return next;
    });
    toast.success(filled > 0 ? `Filled remarks for ${filled} student${filled === 1 ? "" : "s"}. Review and save.` : "Every remark already has something typed in — nothing to fill.");
  }

  // Each student's overall termly average across every subject recorded for
  // them this term/session (not just the subject currently selected above).
  const studentAverages = useMemo(() => {
    const byStudent = new Map<string, number[]>();
    for (const row of allResults) {
      const total = computeTotal(row);
      if (total === null) continue;
      const list = byStudent.get(row.student_id) ?? [];
      list.push(total);
      byStudent.set(row.student_id, list);
    }
    const averages = new Map<string, number>();
    for (const [studentId, totals] of byStudent) {
      averages.set(studentId, Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 10) / 10);
    }
    return averages;
  }, [allResults]);

  // Keeps the report card's position/promotion and AI remarks fresh
  // automatically as results come in, so nobody has to remember to press
  // "Auto-fill position & promotion" / "Generate remarks (AI)" — those
  // buttons still work for an on-demand re-roll, but this effect fires
  // itself whenever a result is saved, removed, or bulk-uploaded (i.e.
  // whenever `allResults` changes). Debounced so a burst of saves — a
  // whole class typed in one after another, or a bulk-upload import —
  // triggers the AI call once, not once per row. Both underlying
  // functions already refuse to overwrite anything typed in by hand, so
  // this is safe to run unattended.
  useEffect(() => {
    if (students.length === 0 || allResults.length === 0) return;
    fillPositionAndPromotion();
    const t = setTimeout(() => { generateReportRemarks(); }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allResults, students]);

  // Auto-fills just the position and (Third Term only) the promotion
  // destination in the report card section — ranked from each student's
  // overall average (standard competition ranking — tied averages share a
  // position, and the next position skips accordingly). "Promoted to" is
  // only guessed at Third Term (by incrementing the class name, e.g.
  // JSS 1 → JSS 2) since promotion isn't decided until the end of the
  // session. Never overwrites a position or destination already typed in.
  function fillPositionAndPromotion() {
    if (students.length === 0) return;
    const ranked = [...studentAverages.entries()].sort((a, b) => b[1] - a[1]);
    const positionByStudent = new Map<string, number>();
    let lastAvg: number | null = null;
    let lastRank = 0;
    ranked.forEach(([studentId, avg], idx) => {
      if (avg !== lastAvg) { lastRank = idx + 1; lastAvg = avg; }
      positionByStudent.set(studentId, lastRank);
    });

    const className = myClasses.find((c) => c.id === classId)?.name ?? "";
    const nextClassName = term === "Third Term" ? guessNextClassName(className) : null;

    let filled = 0;
    setReportDrafts((d) => {
      const next = { ...d };
      for (const s of students) {
        const cur = next[s.id] ?? { position: "", promoted_to: "", teacher_remarks: "", principal_remarks: "" };
        const patch: Partial<ReportDraft> = {};
        if (!cur.position.trim() && positionByStudent.has(s.id)) patch.position = String(positionByStudent.get(s.id));
        if (nextClassName && !cur.promoted_to.trim()) patch.promoted_to = nextClassName;
        if (Object.keys(patch).length > 0) { next[s.id] = { ...cur, ...patch }; filled++; }
      }
      return next;
    });
    toast.success(filled > 0 ? `Auto-filled position/promotion for ${filled} student${filled === 1 ? "" : "s"}. Review and save.` : "Nothing to fill — position is already entered for everyone.");
  }

  // Asks the AI (via the shared tahleem-ai edge function, which tries
  // OpenAI first, then Gemini, then Anthropic) to write each student's
  // overall remarks from their ACTUAL result this term — their average
  // and, where available, a per-subject breakdown — never from the
  // term/session itself. Two DIFFERENT remarks are generated per student:
  // one voiced as the class teacher, one voiced as the principal — each
  // Arabic first with a short English line beneath carrying the same
  // meaning. Falls back to a local Islamic-toned suggestion (picking two
  // different lines for teacher vs. principal) if the AI call fails, e.g.
  // no connection.
  //
  // Never overwrites a remark the admin typed in by hand — but DOES
  // overwrite a remark this same generator wrote earlier (tracked in
  // aiFilledRemarkKeys), so pressing the button again re-rolls fresh
  // wording for that student instead of leaving stale text in place.
  async function generateReportRemarks() {
    if (students.length === 0) return;
    const payload = students
      .map((s) => {
        const avg = studentAverages.get(s.id);
        if (avg === undefined) return null;
        const subjects = allResults
          .filter((r) => r.student_id === s.id)
          .map((r) => {
            const total = computeTotal(r);
            const subj = allSubjects.find((sub) => sub.id === r.subject_id);
            return total === null || !subj ? null : { name: subj.name, total, grade: r.grade ?? scoreToGrade(total) };
          })
          .filter((x): x is { name: string; total: number; grade: string } => x !== null);
        return { id: s.id, name: s.full_name, average: avg, grade: scoreToGrade(avg), subjects };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    if (payload.length === 0) { toast.info("No recorded results yet to generate remarks from."); return; }

    // A remark field is safe to (re)generate if it's still an untouched
    // bank placeholder, OR if this generator wrote that exact field last
    // time — either way it's not something the admin typed by hand.
    const canOverwrite = (key: string, text: string) =>
      isAutoFilledRemark(text, overallComments) || aiFilledRemarkKeys.has(key);

    setGeneratingRemarks(true);
    try {
      const { data, error } = await supabase.functions.invoke("tahleem-ai", {
        body: { action: "report_remark", context: { students: payload } },
      });
      if (error) throw error;
      const remarks = (data as any)?.remarks as
        | Record<string, { teacher: { arabic: string; english: string }; principal: { arabic: string; english: string } }>
        | undefined;
      if (!remarks) throw new Error("No remarks returned");

      let filled = 0;
      const newlyFilledKeys: string[] = [];
      setReportDrafts((d) => {
        const next = { ...d };
        for (const s of students) {
          const r = remarks[s.id];
          if (!r?.teacher && !r?.principal) continue;
          const teacherText = r.teacher ? [r.teacher.arabic, r.teacher.english].filter(Boolean).join("\n") : "";
          const principalText = r.principal ? [r.principal.arabic, r.principal.english].filter(Boolean).join("\n") : "";
          const cur = next[s.id] ?? { position: "", promoted_to: "", teacher_remarks: "", principal_remarks: "" };
          const patch: Partial<ReportDraft> = {};
          if (teacherText && canOverwrite(`${s.id}:teacher`, cur.teacher_remarks)) { patch.teacher_remarks = teacherText; newlyFilledKeys.push(`${s.id}:teacher`); }
          if (principalText && canOverwrite(`${s.id}:principal`, cur.principal_remarks)) { patch.principal_remarks = principalText; newlyFilledKeys.push(`${s.id}:principal`); }
          if (Object.keys(patch).length > 0) { next[s.id] = { ...cur, ...patch }; filled++; }
        }
        return next;
      });
      if (newlyFilledKeys.length > 0) setAiFilledRemarkKeys((prev) => new Set([...prev, ...newlyFilledKeys]));
      toast.success(filled > 0 ? `AI-generated remarks for ${filled} student${filled === 1 ? "" : "s"}. Review and save.` : "Nothing to fill — every remark here was typed by hand.");
    } catch (e: any) {
      // Offline/API fallback — same Islamic-toned bank used elsewhere, at
      // least keeps the admin moving until the AI is reachable again. Seeds
      // teacher/principal separately so the two fields don't land on the
      // exact same bank line for a given student.
      let filled = 0;
      const newlyFilledKeys: string[] = [];
      setReportDrafts((d) => {
        const next = { ...d };
        for (const p of payload) {
          const cur = next[p.id] ?? { position: "", promoted_to: "", teacher_remarks: "", principal_remarks: "" };
          const teacherFallback = suggestIslamicRemark(p.average, overallComments, `${p.id}:teacher`);
          const principalFallback = suggestIslamicRemark(p.average, overallComments, `${p.id}:principal`);
          const patch: Partial<ReportDraft> = {};
          if (canOverwrite(`${p.id}:teacher`, cur.teacher_remarks)) { patch.teacher_remarks = teacherFallback; newlyFilledKeys.push(`${p.id}:teacher`); }
          if (canOverwrite(`${p.id}:principal`, cur.principal_remarks)) { patch.principal_remarks = principalFallback; newlyFilledKeys.push(`${p.id}:principal`); }
          if (Object.keys(patch).length > 0) { next[p.id] = { ...cur, ...patch }; filled++; }
        }
        return next;
      });
      if (newlyFilledKeys.length > 0) setAiFilledRemarkKeys((prev) => new Set([...prev, ...newlyFilledKeys]));
      toast.error(`Couldn't reach the AI — filled ${filled} student${filled === 1 ? "" : "s"}' remarks from the saved suggestion bank instead. ${e?.message ?? ""}`);
    } finally {
      setGeneratingRemarks(false);
    }
  }

  // Builds a blank fill-in-and-reupload spreadsheet in the same S/N, Student
  // Name, Test/Exam-per-subject, Total/%, Position, Remark, Comment layout
  // that BulkResultUpload expects — using the exact subjects currently
  // configured for this class so every column is guaranteed to auto-match
  // on re-upload.
  function downloadTemplate() {
    if (!classId || subjects.length === 0) { toast.info("Pick a class first."); return; }
    const className = myClasses.find((c) => c.id === classId)?.name ?? "Class";
    const maxTotal = subjects.length * 100;
    const rows: any[][] = [];
    const lastCol = 1 + subjects.length * 2 + 5; // 0-indexed last column

    rows.push(["DAARUL MAQAARII LITAHFEEDHIL QUR'AN WA ULUMUL ARABIYYAH"]);
    rows.push(["180, BAMGBOSE STREET, LAGOS ISLAND. LAGOS STATE , NIGERIA"]);
    rows.push([`${sessionText || "SESSION"} ${className.toUpperCase()} STUDENTS' REPORT SHEET`]);
    rows.push([]);
    rows.push([]);

    const headerRow: any[] = ["S/N", "STUDENT NAME"];
    subjects.forEach((s) => { headerRow.push(s.name.toUpperCase()); headerRow.push(null); });
    headerRow.push(`TOTAL\n(Max ${maxTotal})`, "%", "POSITION", "REMARK", "Comment");
    rows.push(headerRow);

    const subHeaderRow: any[] = [null, null];
    subjects.forEach(() => { subHeaderRow.push("TEST\n(40)"); subHeaderRow.push("EXAM\n(60)"); });
    rows.push(subHeaderRow);

    students.forEach((s, i) => {
      const row: any[] = [i + 1, s.full_name];
      subjects.forEach(() => { row.push(null); row.push(null); });
      row.push(null, null, null, null, null);
      rows.push(row);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const headerRowIdx = 5; // 0-indexed
    const subHeaderRowIdx = 6;
    const merges: any[] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: lastCol } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: lastCol } },
      { s: { r: headerRowIdx, c: 0 }, e: { r: subHeaderRowIdx, c: 0 } },
      { s: { r: headerRowIdx, c: 1 }, e: { r: subHeaderRowIdx, c: 1 } },
    ];
    subjects.forEach((_, i) => {
      const c = 2 + i * 2;
      merges.push({ s: { r: headerRowIdx, c }, e: { r: headerRowIdx, c: c + 1 } });
    });
    const trailingStart = 2 + subjects.length * 2;
    for (let c = trailingStart; c <= lastCol; c++) {
      merges.push({ s: { r: headerRowIdx, c }, e: { r: subHeaderRowIdx, c } });
    }
    ws["!merges"] = merges;
    ws["!cols"] = [{ wch: 5 }, { wch: 22 }, ...subjects.flatMap(() => [{ wch: 9 }, { wch: 9 }]), { wch: 10 }, { wch: 8 }, { wch: 9 }, { wch: 12 }, { wch: 12 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Results");
    XLSX.writeFile(wb, `${className.replace(/\s+/g, "_")}_${term.replace(/\s+/g, "_")}_results_template.xlsx`);
  }

  async function saveAll() {
    const rows = Object.entries(drafts).filter(([, d]) => d.test.trim() !== "" || d.exam.trim() !== "");
    if (rows.length === 0) { toast.info("Enter at least one score first."); return; }
    setSaving(true);
    const payload = rows.map(([studentId, d]) => {
      const total = draftTotal(d);
      return {
        student_id: studentId,
        subject_id: subjectId,
        term,
        session,
        ca_score: null,
        test_score: d.test.trim() !== "" ? Number(d.test) : null,
        exam_score: d.exam.trim() !== "" ? Number(d.exam) : null,
        score: total,
        grade: d.grade || (total !== null ? scoreToGrade(total) : null),
        position: d.position ? Number(d.position) : null,
        remarks: d.remarks.trim() || null,
        recorded_by: profile?.id ?? null,
      };
    });
    const { error } = await supabase.from("exam_results").upsert(payload, { onConflict: "student_id,subject_id,term,session" });
    setSaving(false);
    if (error) { toast.error("Some results couldn't be saved. " + error.message); return; }
    toast.success(`Results saved for ${rows.length} student${rows.length === 1 ? "" : "s"}. ${release?.released ? "Already released — visible to students/parents." : "Release this class + term when ready for students/parents to see it."}`);
    loadRoster();
  }

  // Saves a single student's row the moment they finish editing a field
  // (on blur) — no need to hit the page-wide "Save results" button for a
  // one-off correction. Patches local state directly instead of reloading
  // the whole roster, so the row doesn't flicker or lose edit mode.
  async function saveRow(studentId: string) {
    const d = drafts[studentId];
    if (!d) return;
    if (!d.test.trim() && !d.exam.trim() && !d.grade.trim() && !d.position.trim() && !d.remarks.trim()) return;
    const total = draftTotal(d);
    const payload = {
      student_id: studentId,
      subject_id: subjectId,
      term,
      session,
      ca_score: null,
      test_score: d.test.trim() !== "" ? Number(d.test) : null,
      exam_score: d.exam.trim() !== "" ? Number(d.exam) : null,
      score: total,
      grade: d.grade || (total !== null ? scoreToGrade(total) : null),
      position: d.position ? Number(d.position) : null,
      remarks: d.remarks.trim() || null,
      recorded_by: profile?.id ?? null,
    };
    const { data, error } = await supabase.from("exam_results").upsert(payload, { onConflict: "student_id,subject_id,term,session" }).select().maybeSingle();
    if (error) { toast.error("Couldn't save. " + error.message); return; }
    const saved = data as ResultRow | null;
    if (!saved) return;
    setExisting((prev) => [...prev.filter((r) => r.student_id !== studentId), saved]);
    setDrafts((prev) => ({ ...prev, [studentId]: { ...prev[studentId], id: saved.id } }));
    // Also patch the cross-subject `allResults` set (not just this
    // subject's `existing`) so the auto-fill effect above sees the new
    // score and recomputes position/remarks right away.
    setAllResults((prev) => [...prev.filter((r) => !(r.student_id === studentId && r.subject_id === subjectId)), saved]);
  }

  function toggleEditRow(studentId: string) {
    setEditingIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  }

  async function removeResult(studentId: string) {
    const d = drafts[studentId];
    if (!d?.id) return;
    if (!confirm("Remove this result?")) return;
    const { error } = await supabase.from("exam_results").delete().eq("id", d.id);
    if (error) { toast.error("Couldn't remove result."); return; }
    loadRoster();
  }

  async function toggleRelease() {
    if (!classId) return;
    setReleasing(true);
    const nextReleased = !release?.released;
    const payload: any = { released: nextReleased, released_by: profile?.id ?? null, released_at: nextReleased ? new Date().toISOString() : null };
    const { data, error } = release?.id
      ? await supabase.from("result_releases").update(payload).eq("id", release.id).select().maybeSingle()
      : await supabase.from("result_releases").insert({ class_id: classId, term, session, session_text: sessionText || null, holiday_begin: holidayBegin || null, holiday_end: holidayEnd || null, ...payload }).select().maybeSingle();
    setReleasing(false);
    if (error) { toast.error("Couldn't update release status. " + error.message); return; }
    setRelease(data as ReleaseRow);
    toast.success(nextReleased ? `${term} results released for this class — students and parents can now see it.` : `${term} results hidden from students and parents again.`);
  }

  async function saveReleaseDetails() {
    if (!classId) return;
    setSavingDetails(true);
    const payload = { session_text: sessionText || null, holiday_begin: holidayBegin || null, holiday_end: holidayEnd || null };
    const { data, error } = release?.id
      ? await supabase.from("result_releases").update(payload).eq("id", release.id).select().maybeSingle()
      : await supabase.from("result_releases").insert({ class_id: classId, term, session, released: false, ...payload }).select().maybeSingle();
    setSavingDetails(false);
    if (error) { toast.error("Couldn't save details. " + error.message); return; }
    setRelease(data as ReleaseRow);
    toast.success("Session and holiday details saved.");
  }

  async function saveReportDetails() {
    const rows = Object.entries(reportDrafts).filter(
      ([, d]) => d.position.trim() !== "" || d.promoted_to.trim() !== "" || d.teacher_remarks.trim() !== "" || d.principal_remarks.trim() !== ""
    );
    if (rows.length === 0) { toast.info("Nothing to save yet."); return; }
    setSavingDetails(true);
    const payload = rows.map(([studentId, d]) => ({
      student_id: studentId,
      term,
      session,
      position: d.position ? Number(d.position) : null,
      promoted_to: d.promoted_to.trim() || null,
      class_teacher_remarks: d.teacher_remarks.trim() || null,
      principal_remarks: d.principal_remarks.trim() || null,
    }));
    const { error } = await supabase.from("term_reports").upsert(payload, { onConflict: "student_id,term,session" });
    setSavingDetails(false);
    if (error) { toast.error("Couldn't save report details. " + error.message); return; }
    toast.success("Report card details saved.");
    loadRoster();
  }

  const average = useMemo(() => {
    const totals = Object.values(drafts).map((d) => draftTotal(d)).filter((n): n is number => n !== null);
    return totals.length ? Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 10) / 10 : null;
  }, [drafts]);

  return (
    <div>
      <PageHeader title="Results" description="Enter Test / Exam scores per subject and term, then release the class when ready." />

      <div className="mb-6 overflow-hidden rounded-xl border border-border bg-white">
        <div className="flex items-center gap-1.5 border-b border-border bg-purple-faint px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-purple-deep">
          <SlidersHorizontal size={12} /> Viewing
        </div>
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
          <div>
            <label className="label">Class</label>
            <select className="input" value={classId} onChange={(e) => setClassId(e.target.value)}>
              {myClasses.length === 0 && <option value="">No classes assigned</option>}
              {myClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Subject</label>
            <select className="input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Term</label>
            <select className="input" value={term} onChange={(e) => setTerm(e.target.value)}>
              {TERMS.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Session</label>
            <select className="input" value={session} onChange={(e) => setSession(e.target.value)}>
              {sessionOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              {session && !sessionOptions.includes(session) && <option value={session}>{session}</option>}
            </select>
          </div>
        </div>
        <p className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">To start a new session, set it in Settings → Academic year.</p>

        <div className="flex items-center gap-1.5 border-y border-border bg-purple-faint px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-purple-deep">
          <Wrench size={12} /> Tools
        </div>
        <div className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <button className="btn-secondary w-full gap-2 text-sm" onClick={pullFromCbt} disabled={pulling}>
            {pulling ? <Loader2 size={14} className="animate-spin shrink-0" /> : <Download size={14} className="shrink-0" />} {pulling ? "Pulling…" : "Pull Test/Exam from CBT"}
          </button>
          <button className="btn-secondary w-full gap-2 text-sm" onClick={fillPlainRemarks} disabled={students.length === 0}>
            <Sparkles size={14} className="shrink-0" /> Fill remarks
          </button>
          <button className="btn-secondary w-full gap-2 text-sm" onClick={() => setShowBulkUpload(true)} disabled={!activeProgram}>
            <Upload size={14} className="shrink-0" /> Bulk upload results
          </button>
          <button className="btn-secondary w-full gap-2 text-sm" onClick={downloadTemplate} disabled={!classId || students.length === 0}>
            <FileSpreadsheet size={14} className="shrink-0" /> Download template
          </button>
        </div>
      </div>

      <div className="mb-6 rounded-xl border border-border bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            {release?.released ? (
              <span className="flex items-center gap-1.5 font-semibold text-success"><CheckCircle2 size={16} /> Released — students & parents can see {term} for this class</span>
            ) : (
              <span className="flex items-center gap-1.5 font-semibold text-muted-foreground"><Lock size={16} /> Not released yet — hidden from students & parents</span>
            )}
          </div>
          <button
            onClick={toggleRelease}
            disabled={releasing || !classId}
            className={release?.released ? "btn-secondary flex items-center gap-1.5 text-sm" : "btn-primary flex items-center gap-1.5 text-sm"}
          >
            {releasing ? <Loader2 size={14} className="animate-spin" /> : <Megaphone size={14} />}
            {release?.released ? "Unrelease" : "Release results"}
          </button>
        </div>
        <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-4">
          <div>
            <label className="label">Session text on report sheet (e.g. 1447AH / 2025-26)</label>
            <input className="input" value={sessionText} onChange={(e) => setSessionText(e.target.value)} placeholder="1447AH / 2025-2026" />
          </div>
          <div>
            <label className="label">Holiday begins</label>
            <input type="date" className="input" value={holidayBegin} onChange={(e) => setHolidayBegin(e.target.value)} />
          </div>
          <div>
            <label className="label">Holiday ends</label>
            <input type="date" className="input" value={holidayEnd} onChange={(e) => setHolidayEnd(e.target.value)} />
          </div>
          <div className="flex items-end">
            <button className="btn-secondary flex items-center gap-1.5 text-sm" onClick={saveReleaseDetails} disabled={savingDetails}>
              {savingDetails ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save session/holiday
            </button>
          </div>
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Students" value={students.length} />
        <StatCard label="Recorded" value={existing.length} />
        <StatCard label="Class average" value={average !== null ? `${average}` : "—"} />
      </div>

      {!loading && students.length > 0 && (
        <div className="mb-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowSubjectResults((v) => !v)}
            className="flex items-center gap-1.5 text-sm font-semibold text-primary"
          >
            {showSubjectResults ? "Hide" : "Show"} {subjects.find((s) => s.id === subjectId)?.name ?? "subject"} results
            <ChevronDown size={14} className={`transition-transform ${showSubjectResults ? "rotate-180" : ""}`} />
          </button>
        </div>
      )}

      {loading ? (
        <div className="card flex items-center justify-center gap-2 py-14 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" /> Loading roster…</div>
      ) : students.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 py-14 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-faint text-purple-deep"><LineChart size={22} /></span>
          <p className="font-display text-lg font-semibold text-primary">No students in this class</p>
        </div>
      ) : !showSubjectResults ? null : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="bg-purple-faint text-xs uppercase tracking-wide text-purple-deep">
              <tr>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Test</th>
                <th className="px-4 py-3">Exam</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Grade</th>
                <th className="px-4 py-3">Position</th>
                <th className="px-4 py-3">Remarks</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => {
                const d = drafts[s.id] ?? { test: "", exam: "", grade: "", position: "", remarks: "" };
                const total = draftTotal(d);
                const isEditing = editingIds.has(s.id);
                return (
                  <tr key={s.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <p className="font-medium">{s.full_name}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">{s.admission_no}</p>
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input type="number" min={0} max={100} className="input w-16" value={d.test} onChange={(e) => updateDraft(s.id, { test: e.target.value })} onBlur={() => saveRow(s.id)} />
                      ) : (
                        <span>{d.test || "—"}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input type="number" min={0} max={100} className="input w-16" value={d.exam} onChange={(e) => updateDraft(s.id, { exam: e.target.value })} onBlur={() => saveRow(s.id)} />
                      ) : (
                        <span>{d.exam || "—"}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-semibold text-primary">{total ?? "—"}</td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input className="input w-16" value={d.grade} onChange={(e) => updateDraft(s.id, { grade: e.target.value })} onBlur={() => saveRow(s.id)} />
                      ) : (
                        <span>{d.grade || "—"}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input type="number" min={1} className="input w-16" value={d.position} onChange={(e) => updateDraft(s.id, { position: e.target.value })} onBlur={() => saveRow(s.id)} />
                      ) : (
                        <span>{d.position || "—"}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <textarea
                          className="input min-w-[220px] resize-y leading-snug"
                          rows={2}
                          placeholder="Excellent, Very Good, Good…"
                          value={d.remarks}
                          onChange={(e) => updateDraft(s.id, { remarks: e.target.value })}
                          onBlur={() => saveRow(s.id)}
                          autoFocus
                        />
                      ) : (
                        <span className="text-muted-foreground">{d.remarks || "—"}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => toggleEditRow(s.id)}
                          className="rounded-md p-2 text-muted-foreground hover:bg-purple-faint hover:text-purple-deep"
                          title={isEditing ? "Done editing" : "Edit this row"}
                        >
                          {isEditing ? <Check size={14} /> : <Pencil size={14} />}
                        </button>
                        {d.id && <button onClick={() => removeResult(s.id)} className="rounded-md p-2 text-muted-foreground hover:bg-red-50 hover:text-danger" title="Remove this result"><Trash2 size={14} /></button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex justify-end border-t border-border p-4">
            <button className="btn-primary text-sm" onClick={saveAll} disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {saving ? "Saving…" : "Save results"}
            </button>
          </div>
        </div>
      )}

      <div className="mt-6 rounded-xl border border-border bg-white">
        <button
          type="button"
          onClick={() => setShowReportDetails((v) => !v)}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-primary"><ClipboardList size={16} /> Report card details — position, promotion & remarks (whole term, not per subject)</span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {showReportDetails ? "Hide" : "Show"}
            <ChevronDown size={14} className={`transition-transform ${showReportDetails ? "rotate-180" : ""}`} />
          </span>
        </button>
        {showReportDetails && students.length > 0 && (
          <div className="overflow-x-auto border-t border-border">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <button className="btn-secondary flex items-center gap-1.5 text-sm" onClick={fillPositionAndPromotion}>
                  <Sparkles size={14} /> Auto-fill position &amp; promotion
                </button>
                <button className="btn-primary flex items-center gap-1.5 text-sm" onClick={generateReportRemarks} disabled={generatingRemarks}>
                  {generatingRemarks ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} {generatingRemarks ? "Generating…" : "Generate remarks (AI)"}
                </button>
              </div>
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-purple-faint text-xs uppercase tracking-wide text-purple-deep">
                <tr>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Position</th>
                  <th className="px-4 py-3">Promoted to</th>
                  <th className="px-4 py-3">Class teacher's remarks</th>
                  <th className="px-4 py-3">Principal's remarks</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => {
                  const rd = reportDrafts[s.id] ?? { position: "", promoted_to: "", teacher_remarks: "", principal_remarks: "" };
                  const update = (patch: Partial<ReportDraft>) => setReportDrafts((d) => ({ ...d, [s.id]: { ...rd, ...patch } }));
                  // A direct edit to a remark field means it's no longer
                  // safe for "Generate remarks (AI)" to overwrite on its
                  // own — even if the AI had filled it moments ago.
                  const updateRemark = (field: "teacher_remarks" | "principal_remarks", value: string) => {
                    const kind = field === "teacher_remarks" ? "teacher" : "principal";
                    setAiFilledRemarkKeys((prev) => {
                      if (!prev.has(`${s.id}:${kind}`)) return prev;
                      const next = new Set(prev);
                      next.delete(`${s.id}:${kind}`);
                      return next;
                    });
                    update({ [field]: value } as Partial<ReportDraft>);
                  };
                  return (
                    <tr key={s.id} className="border-t border-border">
                      <td className="px-4 py-3 font-medium">{s.full_name}</td>
                      <td className="px-4 py-3"><input type="number" min={1} className="input w-16" value={rd.position} onChange={(e) => update({ position: e.target.value })} /></td>
                      <td className="px-4 py-3"><input className="input w-32" placeholder="e.g. JSS 2" value={rd.promoted_to} onChange={(e) => update({ promoted_to: e.target.value })} /></td>
                      <td className="px-4 py-3">
                        <textarea
                          className="input min-w-[200px] resize-y leading-snug"
                          rows={2}
                          placeholder="Arabic line, then English…"
                          value={rd.teacher_remarks}
                          onChange={(e) => updateRemark("teacher_remarks", e.target.value)}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <textarea
                          className="input min-w-[200px] resize-y leading-snug"
                          rows={2}
                          placeholder="Arabic line, then English…"
                          value={rd.principal_remarks}
                          onChange={(e) => updateRemark("principal_remarks", e.target.value)}
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => setPreviewStudent({ id: s.id, name: s.full_name })} className="rounded-md p-2 text-muted-foreground hover:bg-purple-faint hover:text-purple-deep" title="View report sheet">
                          <FileText size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex items-center justify-between gap-2 border-t border-border p-4">
              <button
                type="button"
                onClick={() => setShowReportDetails(false)}
                className="btn-secondary flex items-center gap-1.5 text-sm"
              >
                <ChevronDown size={14} className="rotate-180" /> Collapse
              </button>
              <button className="btn-primary text-sm" onClick={saveReportDetails} disabled={savingDetails}>
                {savingDetails ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save report details
              </button>
            </div>
          </div>
        )}
      </div>

      {previewStudent && (
        <StudentReportModal
          studentId={previewStudent.id}
          studentName={previewStudent.name}
          classId={classId}
          className={myClasses.find((c) => c.id === classId)?.name ?? ""}
          template={classTemplate}
          initialTerm={term}
          session={session}
          onClose={() => setPreviewStudent(null)}
        />
      )}

      {showBulkUpload && (
        <BulkResultUpload
          term={term}
          session={session}
          program={activeProgram ?? null}
          onClose={() => setShowBulkUpload(false)}
          onImported={loadRoster}
        />
      )}
    </div>
  );
}
