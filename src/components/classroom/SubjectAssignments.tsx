/*  src/components/classroom/SubjectAssignments.tsx
    Assignments panel embedded inside a subject's tabs (admin / teacher / student).

    ─────────────────────────────────────────────────────────────────────────
    Role-aware:
    • Admin / Teacher → AssignmentManager: create/edit/delete assignments for
      this subject, see submission stats, open a roster to grade each student.
    • Student         → StudentAssignmentList: browse + submit assignments,
      with a hard deadline lock — once the deadline passes, an assignment can
      no longer be opened or submitted to (server-side trigger backs this up:
      see enforce_assignment_deadline() in the migrations).

    Previously this file only ever rendered the student view (to everyone,
    including admin/teacher tabs), and ignored the `subjectId` prop entirely,
    loading assignments from ALL of the student's subjects instead of just
    the one being viewed. Both are fixed here.
    ─────────────────────────────────────────────────────────────────────────
*/

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStaffTermId, useViewingTermId } from "@/hooks/useCurrentTermId";
import { useLanguage } from "@/contexts/LanguageContext";
import { uploadStorageFile, getSignedUrl } from "@/integrations/supabase/storageClient";
import {
  ClipboardList, Clock, CheckCircle, AlertTriangle, Upload, Mic,
  FileText, BookOpen, ChevronRight, X, Send, Star,
  Play, Pause, RotateCcw, Paperclip, MessageSquare, Calendar,
  Search, ArrowLeft, StopCircle, Download,
  TrendingUp, Award, Loader2, Plus, Pencil, Trash2, Users, Lock,
  GraduationCap, Save, MoreVertical, Cast,
} from "lucide-react";

/* ── Design tokens ─────────────────────────────────────── */
const G      = "#0f2d1f";
const MG     = "#1a4731";
const GOLD   = "#c9a84c";
const GOLDF  = "#e4c36a";
const CREAM  = "#faf6ee";
const BORDER = "rgba(15,45,31,0.1)";
const TXT    = "#0f2d1f";
const TMID   = "#4a7c59";
const TLIT   = "#7a9e88";

/* ── Helpers ───────────────────────────────────────────── */
const card: React.CSSProperties = {
  background: "#fff", border: `1px solid ${BORDER}`,
  borderRadius: 18, boxShadow: "0 2px 12px rgba(0,0,0,.06)", overflow: "hidden",
};

const fmtDate = (s?: string | null) => {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const isOverdue = (d?: string | null) => d ? new Date(d) < new Date() : false;
const daysLeft  = (d?: string | null) => {
  if (!d) return null;
  const diff = new Date(d).getTime() - Date.now();
  const days = Math.ceil(diff / 86_400_000);
  return days;
};

/* Students aren't individually "enrolled" per subject — the `enrollments`
   table only tracks course_id, not subject_id, so filtering it by
   subject_id silently returns nothing. Real access is level-based: a
   student with a matching level is auto-assigned to every subject open to
   that level, plus any course-enrollments and any admin-assigned private
   students. Mirrors the roster logic in TeacherStudents.tsx. */
async function fetchSubjectRoster(subjectId: string): Promise<any[]> {
  const { data: subj } = await supabase
    .from("subjects").select("level, levels").eq("id", subjectId).single();
  const subjectLevels: string[] = (subj as any)?.levels?.length
    ? (subj as any).levels
    : ((subj as any)?.level ? [(subj as any).level] : []);

  const { data: courses } = await supabase.from("courses").select("id").eq("subject_id", subjectId);
  const courseIds = (courses || []).map((c: any) => c.id);
  let enrolledUserIds: string[] = [];
  if (courseIds.length > 0) {
    const { data: enrData } = await supabase.from("enrollments").select("user_id").in("course_id", courseIds);
    enrolledUserIds = [...new Set((enrData || []).map((e: any) => e.user_id))];
  }

  let levelUserIds: string[] = [];
  if (subjectLevels.length > 0) {
    const { data: lvlStudents } = await supabase
      .from("profiles").select("user_id")
      .eq("role", "student")
      .neq("student_type", "private")
      .in("level", subjectLevels);
    levelUserIds = (lvlStudents || []).map((p: any) => p.user_id);
  }

  const { data: pss } = await supabase
    .from("private_student_subjects").select("student_id").eq("subject_id", subjectId);
  const privateIds = [...new Set((pss || []).map((row: any) => row.student_id))];

  const allUserIds = [...new Set([...enrolledUserIds, ...levelUserIds, ...privateIds])];
  if (allUserIds.length === 0) return [];

  const { data: profiles } = await supabase
    .from("profiles").select("user_id, full_name, avatar_url").in("user_id", allUserIds).eq("role", "student");
  return profiles || [];
}

type AStatus = "all" | "pending" | "submitted" | "graded" | "overdue";

/* ═══════════════════════════════════════════════════════════════
   Entry point — branches by role
   ═══════════════════════════════════════════════════════════════ */
export default function SubjectAssignments({ subjectId, onSyncWork }: { subjectId?: string; onSyncWork?: (payload: any | null) => boolean | void }) {
  const { hasRole } = useAuth();
  const isStaff = hasRole("admin") || hasRole("teacher");
  return isStaff
    ? <AssignmentManager subjectId={subjectId} onSyncWork={onSyncWork} />
    : <StudentAssignmentList subjectId={subjectId} />;
}

/* ═══════════════════════════════════════════════════════════════
   STAFF VIEW — create, edit, delete, grade
   Two kinds of work live here:
     • Assignment — homework with a deadline.
     • Classwork  — done in the live class, no deadline. Uploads are OFF
       until the teacher switches them on from the ⋮ menu.
   ═══════════════════════════════════════════════════════════════ */
type WorkKind = "assignment" | "classwork";
type SyncTarget = { assignmentId: string; userId: string; name: string } | null;
type SyncFn = (payload: any | null) => boolean | void;

const kindOf = (a: any): WorkKind => (a?.kind === "classwork" ? "classwork" : "assignment");

/* Bottom sheet used for the ⋮ menu and the New chooser */
type SheetItem = {
  key: string; label: string; sub?: string; icon: React.ReactNode;
  onClick: () => void; danger?: boolean; right?: React.ReactNode;
};
function ActionSheet({ title, subtitle, onClose, items }: { title: string; subtitle?: string; onClose: () => void; items: SheetItem[] }) {
  // Portal to <body> + very high z-index so the sheet sits above the live-class control bar
  // (the classroom overlay uses z-index up to 9500 and traps anything rendered inside it).
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 20000, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div style={{ width: "100%", maxWidth: 520, background: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: "max(14px, env(safe-area-inset-bottom))", maxHeight: "86vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 2px" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "#ddd" }} />
        </div>
        <div style={{ padding: "8px 20px 10px" }}>
          <p style={{ fontSize: 16, fontWeight: 900, color: TXT, margin: 0, lineHeight: 1.35, wordBreak: "break-word" }}>{title}</p>
          {subtitle && <p style={{ fontSize: 12, color: TLIT, margin: "3px 0 0" }}>{subtitle}</p>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", padding: "0 10px" }}>
          {items.map(it => (
            <button key={it.key} onClick={it.onClick} className="asm-btn"
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 12px", minHeight: 54, border: "none", background: "transparent", borderRadius: 12, cursor: "pointer", textAlign: "left", color: it.danger ? "#b91c1c" : TXT }}>
              <span style={{ width: 36, height: 36, borderRadius: 11, background: it.danger ? "#fef2f2" : `${G}0d`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{it.icon}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 14, fontWeight: 800, lineHeight: 1.3 }}>{it.label}</span>
                {it.sub && <span style={{ display: "block", fontSize: 11.5, color: TLIT, marginTop: 2, lineHeight: 1.35, fontWeight: 600 }}>{it.sub}</span>}
              </span>
              {it.right}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}

function Switch({ on }: { on: boolean }) {
  return (
    <span style={{ width: 42, height: 24, borderRadius: 12, background: on ? "#16a34a" : "#cbd5e1", position: "relative", flexShrink: 0, transition: "background .15s" }}>
      <span style={{ position: "absolute", top: 2, left: on ? 20 : 2, width: 20, height: 20, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.3)", transition: "left .15s" }} />
    </span>
  );
}

function AssignmentManager({ subjectId, onSyncWork }: { subjectId?: string; onSyncWork?: SyncFn }) {
  const { user } = useAuth();
  const liveTermId = useStaffTermId(); // admins: live term; teachers: the term chosen in their settings (plus legacy rows with no term)
  const { t, language } = useLanguage();

  const [assignments, setAssignments] = useState<any[]>([]);
  const [stats, setStats]             = useState<Record<string, { submitted: number; graded: number }>>({});
  const [rosterCount, setRosterCount] = useState(0);
  const [loading, setLoading]         = useState(true);
  const [chooser, setChooser]         = useState(false);
  const [showForm, setShowForm]       = useState(false);
  const [formKind, setFormKind]       = useState<WorkKind>("assignment");
  const [editing, setEditing]         = useState<any | null>(null);
  const [deleting, setDeleting]       = useState<any | null>(null);
  const [deleteBusy, setDeleteBusy]   = useState(false);
  const [tab, setTab]                 = useState<WorkKind>("assignment");
  const [menuFor, setMenuFor]         = useState<any | null>(null);
  const [openTask, setOpenTask]       = useState<any | null>(null);
  const [syncing, setSyncing]         = useState<SyncTarget>(null);

  // Keep the latest sync state/callback for the unmount cleanup below.
  const syncingRef = useRef<SyncTarget>(null);
  const onSyncRef  = useRef<SyncFn | undefined>(onSyncWork);
  useEffect(() => { syncingRef.current = syncing; }, [syncing]);
  useEffect(() => { onSyncRef.current = onSyncWork; }, [onSyncWork]);
  // If the teacher closes this panel while sharing, stop showing it to the class,
  // so they can never be left with no way to switch it off.
  useEffect(() => () => { if (syncingRef.current) onSyncRef.current?.(null); }, []);

  const load = useCallback(async (silent = false) => {
    if (!subjectId) { setLoading(false); return; }
    if (!silent) setLoading(true);
    try {
      let aq = supabase
        .from("subject_assignments")
        .select("*")
        .eq("subject_id", subjectId);
      if (liveTermId) aq = aq.or(`term_id.eq.${liveTermId},term_id.is.null`);
      const { data: asgn } = await aq.order("created_at", { ascending: false });
      setAssignments(asgn || []);

      const roster = await fetchSubjectRoster(subjectId);
      setRosterCount(roster.length);

      if (asgn && asgn.length > 0) {
        const ids = asgn.map((a: any) => a.id);
        const { data: subs } = await supabase
          .from("assignment_submissions").select("assignment_id, status").in("assignment_id", ids);
        const s: Record<string, { submitted: number; graded: number }> = {};
        (subs || []).forEach((row: any) => {
          if (!s[row.assignment_id]) s[row.assignment_id] = { submitted: 0, graded: 0 };
          s[row.assignment_id].submitted += 1;
          if (row.status === "graded") s[row.assignment_id].graded += 1;
        });
        setStats(s);
      } else {
        setStats({});
      }
    } catch (err) {
      console.error("Failed to load assignments:", err);
    }
    setLoading(false);
  }, [subjectId, liveTermId]);

  useEffect(() => { load(); }, [load]);

  // Live sync: a student's upload bumps the counts the moment it lands.
  useEffect(() => {
    if (!subjectId) return;
    const ch = supabase.channel(`mgr-asg-${subjectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "assignment_submissions" }, () => { load(true); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [subjectId, load]);

  const setUploads = async (id: string, open: boolean) => {
    setAssignments(prev => prev.map(x => x.id === id ? { ...x, submissions_open: open } : x));
    await supabase.from("subject_assignments").update({ submissions_open: open } as any).eq("id", id);
  };

  // Draft tasks are hidden from students until published here.
  const setStatus = async (id: string, status: "draft" | "open") => {
    await supabase.from("subject_assignments").update({ status }).eq("id", id);
    await load(true);
  };

  const moveTo = async (a: any, kind: WorkKind) => {
    await supabase.from("subject_assignments").update({ kind } as any).eq("id", a.id);
    setTab(kind);
    await load(true);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    await supabase.from("subject_assignments").delete().eq("id", deleting.id);
    setDeleteBusy(false);
    setDeleting(null);
    await load(true);
  };

  const startNew = (kind: WorkKind) => { setChooser(false); setEditing(null); setFormKind(kind); setShowForm(true); };

  const startSync = (payload: any): boolean => {
    const ok = onSyncWork?.(payload);
    if (ok === false) return false;
    setSyncing({ assignmentId: payload.assignmentId, userId: payload.studentId, name: payload.studentName });
    return true;
  };
  const stopSync = () => { onSyncWork?.(null); setSyncing(null); };

  if (!subjectId) {
    return (
      <div style={{ ...card, padding: "40px 20px", textAlign: "center" }}>
        <ClipboardList style={{ width: 40, height: 40, color: TLIT, margin: "0 auto 10px", opacity: .4 }} />
        <p style={{ fontSize: 14, color: TLIT, margin: 0 }}>{t("Select a subject to manage its assignments.", "اختر مادة لإدارة واجباتها.")}</p>
      </div>
    );
  }

  const styles = (
    <style>{`
      .asm-card { transition: box-shadow .18s, transform .18s; }
      .asm-card:hover { box-shadow: 0 8px 32px rgba(15,45,31,0.13) !important; transform: translateY(-1px); }
      .asm-btn { transition: opacity .15s, transform .12s; }
      .asm-btn:active { transform: scale(0.96); }
      .asm-icon-btn:hover { background: #f4f4f4 !important; }
      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes asmPulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
    `}</style>
  );

  /* ── Drill-in: one task → its students → one student's work (all inline, no popup) ── */
  if (openTask) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {styles}
        <SubmissionsView
          assignment={openTask}
          subjectId={subjectId}
          language={language}
          t={t}
          onBack={() => { setOpenTask(null); load(true); }}
          onGraded={() => load(true)}
          canSync={!!onSyncWork}
          syncing={syncing}
          onStartSync={startSync}
          onStopSync={stopSync}
        />
      </div>
    );
  }

  const shown = assignments.filter(a => kindOf(a) === tab);
  const countOf = (k: WorkKind) => assignments.filter(a => kindOf(a) === k).length;

  const menuItems = (a: any): SheetItem[] => {
    const isCw = kindOf(a) === "classwork";
    const uploadsOn = a.submissions_open !== false;
    return [
      {
        key: "uploads",
        label: t("Student uploads", "رفع الطلاب"),
        sub: uploadsOn
          ? t("On — students can upload text, files or audio.", "مفعّل — يمكن للطلاب رفع نص أو ملفات أو صوت.")
          : t("Off — students can only read it.", "متوقف — يمكن للطلاب قراءته فقط."),
        icon: <Upload style={{ width: 17, height: 17, color: uploadsOn ? "#16a34a" : TLIT }} />,
        right: <Switch on={uploadsOn} />,
        onClick: () => { setUploads(a.id, !uploadsOn); setMenuFor({ ...a, submissions_open: !uploadsOn }); },
      },
      {
        key: "publish",
        label: a.status === "draft" ? t("Publish to students", "نشر للطلاب") : t("Hide from students (draft)", "إخفاء عن الطلاب (مسودة)"),
        sub: a.status === "draft" ? t("Currently hidden from students.", "مخفي حالياً عن الطلاب.") : t("Currently visible to students.", "ظاهر حالياً للطلاب."),
        icon: <Send style={{ width: 17, height: 17, color: TMID }} />,
        onClick: () => { setStatus(a.id, a.status === "draft" ? "open" : "draft"); setMenuFor(null); },
      },
      {
        key: "edit",
        label: isCw ? t("Edit classwork", "تعديل العمل الصفّي") : t("Edit assignment", "تعديل الواجب"),
        icon: <Pencil style={{ width: 17, height: 17, color: TMID }} />,
        onClick: () => { setMenuFor(null); setEditing(a); setFormKind(kindOf(a)); setShowForm(true); },
      },
      {
        key: "move",
        label: isCw ? t("Move to Assignments", "نقل إلى الواجبات") : t("Move to Classwork", "نقل إلى العمل الصفّي"),
        icon: <RotateCcw style={{ width: 17, height: 17, color: TMID }} />,
        onClick: () => { setMenuFor(null); moveTo(a, isCw ? "assignment" : "classwork"); },
      },
      {
        key: "delete",
        label: t("Delete", "حذف"),
        icon: <Trash2 style={{ width: 17, height: 17, color: "#b91c1c" }} />,
        danger: true,
        onClick: () => { setMenuFor(null); setDeleting(a); },
      },
    ];
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {styles}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontSize: 17, fontWeight: 900, color: TXT, margin: 0 }}>{t("Assignments", "الواجبات")}</h2>
          <p style={{ fontSize: 12, color: TLIT, margin: "2px 0 0", display: "flex", alignItems: "center", gap: 5 }}>
            <Users style={{ width: 12, height: 12 }} />
            {t(`${rosterCount} enrolled student${rosterCount === 1 ? "" : "s"}`, `${rosterCount} طالب مسجل`)}
          </p>
        </div>
        <button onClick={() => setChooser(true)} className="asm-btn"
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: 12, border: "none", background: `linear-gradient(135deg, ${G}, ${MG})`, color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
          <Plus style={{ width: 15, height: 15 }} />
          {t("New", "جديد")}
        </button>
      </div>

      {/* Sharing banner — visible from any screen while a student's work is on the class's screens */}
      {syncing && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 14, background: "#fef2f2", border: "1px solid #fecaca" }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#dc2626", animation: "asmPulse 1.2s ease-in-out infinite", flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 800, color: "#991b1b", lineHeight: 1.35 }}>
            {t(`Showing ${syncing.name}'s work to the class`, `يتم عرض عمل ${syncing.name} للصف`)}
          </span>
          <button onClick={stopSync} className="asm-btn"
            style={{ padding: "7px 12px", borderRadius: 10, border: "none", background: "#dc2626", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", flexShrink: 0 }}>
            {t("Stop", "إيقاف")}
          </button>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6 }}>
        {([["assignment", t(`Assignments (${countOf("assignment")})`, `الواجبات (${countOf("assignment")})`)], ["classwork", t(`Classwork (${countOf("classwork")})`, `العمل الصفّي (${countOf("classwork")})`)]] as const).map(([k, lb]) => (
          <button key={k} onClick={() => setTab(k)} className="asm-btn"
            style={{ flex: 1, padding: "9px 0", borderRadius: 10, border: `1px solid ${tab === k ? G : BORDER}`, background: tab === k ? G : "#fff", color: tab === k ? "#fff" : TXT, fontSize: 13, fontWeight: 800, cursor: "pointer" }}>{lb}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 50 }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", border: `3px solid ${G}`, borderTopColor: "transparent", animation: "spin .7s linear infinite" }} />
        </div>
      ) : shown.length === 0 ? (
        <div style={{ ...card, padding: "40px 20px", textAlign: "center" }}>
          <ClipboardList style={{ width: 44, height: 44, color: TLIT, margin: "0 auto 10px", opacity: .4 }} />
          <p style={{ fontSize: 15, fontWeight: 700, color: TXT, margin: "0 0 4px" }}>
            {tab === "classwork" ? t("No classwork yet", "لا يوجد عمل صفّي بعد") : t("No assignments yet", "لا توجد واجبات بعد")}
          </p>
          <p style={{ fontSize: 13, color: TLIT, margin: 0 }}>{t("Tap New to create one for this subject.", "اضغط جديد لإنشاء واحد لهذه المادة.")}</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {shown.map(a => {
            const isCw = kindOf(a) === "classwork";
            const title = language === "ar" ? (a.title_ar || a.title) : a.title;
            const s = stats[a.id] || { submitted: 0, graded: 0 };
            const locked = !isCw && isOverdue(a.deadline);
            const uploadsOn = a.submissions_open !== false;
            const chip = (label: string, color: string, bg: string, border: string, icon?: React.ReactNode) => (
              <span style={{ fontSize: 10.5, fontWeight: 800, color, background: bg, border: `1px solid ${border}`, borderRadius: 20, padding: "3px 9px", display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>{icon}{label}</span>
            );
            return (
              <div key={a.id} className="asm-card" style={{ ...card, padding: "14px 14px 12px", cursor: "pointer" }} onClick={() => setOpenTask(a)}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: `${G}10`, border: `1px solid ${G}20`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <ClipboardList style={{ width: 19, height: 19, color: G }} />
                  </div>
                  {/* Title gets the whole row — it wraps naturally instead of being squeezed by buttons */}
                  <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: TXT, lineHeight: 1.4, wordBreak: "break-word", overflowWrap: "anywhere" }}>{title}</div>
                  </div>
                  <button onClick={e => { e.stopPropagation(); setMenuFor(a); }} className="asm-icon-btn" aria-label={t("More options", "المزيد")}
                    style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${BORDER}`, background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <MoreVertical style={{ width: 17, height: 17, color: TMID }} />
                  </button>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                  {isCw
                    ? (uploadsOn
                        ? chip(t("Uploads on", "الرفع مفعّل"), "#166534", "#dcfce7", "#86efac", <Upload style={{ width: 10, height: 10 }} />)
                        : chip(t("Uploads off", "الرفع متوقف"), "#64748b", "#f1f5f9", "#cbd5e1", <Upload style={{ width: 10, height: 10 }} />))
                    : (locked
                        ? chip(t("Closed", "مغلق"), "#c0392b", "#fff5f5", "#fca5a5", <Lock style={{ width: 10, height: 10 }} />)
                        : chip(t("Open", "مفتوح"), TMID, "#f0fdf4", "#86efac", <Clock style={{ width: 10, height: 10 }} />))}
                  {a.status === "draft" && chip(t("Draft", "مسودة"), "#92400e", "#fef3c7", "#fde68a")}
                  {!isCw && a.submissions_open === false && chip(t("Uploads off", "الرفع متوقف"), "#64748b", "#f1f5f9", "#cbd5e1")}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
                  {!isCw && a.deadline && (
                    <span style={{ fontSize: 11, color: locked ? "#c0392b" : TLIT, display: "flex", alignItems: "center", gap: 4 }}>
                      <Calendar style={{ width: 11, height: 11 }} />{fmtDate(a.deadline)}
                    </span>
                  )}
                  <span style={{ fontSize: 11, color: TMID, fontWeight: 700 }}>
                    {t(`${s.submitted}/${rosterCount} submitted`, `${s.submitted}/${rosterCount} تم التسليم`)}
                  </span>
                  <span style={{ fontSize: 11, color: "#276749", fontWeight: 700 }}>
                    {t(`${s.graded} graded`, `${s.graded} مصحح`)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {chooser && (
        <ActionSheet
          title={t("What do you want to add?", "ماذا تريد أن تضيف؟")}
          onClose={() => setChooser(false)}
          items={[
            {
              key: "assignment",
              label: t("New assignment", "واجب جديد"),
              sub: t("Homework with a deadline. Students upload when it suits them.", "واجب بموعد نهائي. يرفع الطلاب إجاباتهم في الوقت المناسب."),
              icon: <ClipboardList style={{ width: 18, height: 18, color: G }} />,
              onClick: () => startNew("assignment"),
            },
            {
              key: "classwork",
              label: t("New classwork", "عمل صفّي جديد"),
              sub: t("Done during the class. Turn on uploads from the ⋮ menu when you want students to submit.", "يُنجز أثناء الحصة. فعّل الرفع من قائمة ⋮ عندما تريد من الطلاب التسليم."),
              icon: <GraduationCap style={{ width: 18, height: 18, color: G }} />,
              onClick: () => startNew("classwork"),
            },
          ]}
        />
      )}

      {menuFor && (
        <ActionSheet
          title={language === "ar" ? (menuFor.title_ar || menuFor.title) : menuFor.title}
          subtitle={kindOf(menuFor) === "classwork" ? t("Classwork", "عمل صفّي") : t("Assignment", "واجب")}
          onClose={() => setMenuFor(null)}
          items={menuItems(menuFor)}
        />
      )}

      {showForm && (
        <AssignmentFormModal
          subjectId={subjectId}
          assignment={editing}
          kind={formKind}
          userId={user!.id}
          onClose={() => setShowForm(false)}
          onSaved={async () => { setShowForm(false); setTab(formKind); await load(true); }}
        />
      )}

      {deleting && (
        <div style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={() => !deleteBusy && setDeleting(null)}>
          <div style={{ background: "#fff", borderRadius: 18, padding: 22, maxWidth: 340, width: "100%" }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontWeight: 800, fontSize: 16, marginBottom: 8, color: TXT }}>{t("Delete this?", "حذف هذا العنصر؟")}</h3>
            <p style={{ fontSize: 13, color: TLIT, marginBottom: 18 }}>
              {t("This permanently deletes it and every student's submission for it. This can't be undone.", "سيؤدي هذا إلى حذفه وجميع تسليمات الطلاب له نهائياً. لا يمكن التراجع عن هذا.")}
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setDeleting(null)} disabled={deleteBusy}
                style={{ flex: 1, padding: 11, borderRadius: 11, border: `1.5px solid ${BORDER}`, background: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 13, color: TXT }}>
                {t("Cancel", "إلغاء")}
              </button>
              <button onClick={confirmDelete} disabled={deleteBusy}
                style={{ flex: 1, padding: 11, borderRadius: 11, border: "none", background: deleteBusy ? "#9CA3AF" : "#DC2626", color: "#fff", cursor: deleteBusy ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                {deleteBusy ? <Loader2 style={{ width: 14, height: 14, animation: "spin .8s linear infinite" }} /> : <Trash2 style={{ width: 14, height: 14 }} />}
                {t("Delete", "حذف")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Create / Edit assignment form ────────────────────────────── */
export function AssignmentFormModal({
  subjectId, assignment, userId, kind: kindProp, onClose, onSaved,
}: { subjectId: string; assignment: any | null; userId: string; kind?: "assignment" | "classwork"; onClose: () => void; onSaved: () => void }) {
  const { t } = useLanguage();
  const staffTermId = useStaffTermId();
  const isEdit = !!assignment;
  // Classwork = done in the live class (no deadline; uploads are switched on later from the ⋮ menu).
  const kind: "assignment" | "classwork" = assignment ? (assignment.kind === "classwork" ? "classwork" : "assignment") : (kindProp || "assignment");
  const isClasswork = kind === "classwork";
  const [title, setTitle]           = useState(assignment?.title || "");
  const [titleAr, setTitleAr]       = useState(assignment?.title_ar || "");
  const [desc, setDesc]             = useState(assignment?.description || "");
  const [descAr, setDescAr]         = useState(assignment?.description_ar || "");
  const [question, setQuestion]     = useState(assignment?.question || "");
  const [questionAr, setQuestionAr] = useState(assignment?.question_ar || "");
  const [deadline, setDeadline]     = useState(assignment?.deadline ? toLocalInput(assignment.deadline) : "");
  const [maxScore, setMaxScore]     = useState(String(assignment?.max_score ?? 100));
  const [allowText, setAllowText]   = useState(assignment?.allow_text !== false);
  const [allowFile, setAllowFile]   = useState(assignment?.allow_file !== false);
  const [allowAudio, setAllowAudio] = useState(assignment?.allow_audio !== false);
  const [file, setFile]             = useState<File | null>(null);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function toLocalInput(iso: string) {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  const handleSave = async () => {
    if (!title.trim()) { setError(t("Please give the assignment a title.", "يرجى إعطاء الواجب عنواناً.")); return; }
    if (!isClasswork && !deadline) { setError(t("Please set a deadline.", "يرجى تحديد موعد نهائي.")); return; }
    if (!allowText && !allowFile && !allowAudio) { setError(t("Allow at least one submission type.", "اسمح بنوع تسليم واحد على الأقل.")); return; }
    setSaving(true);
    setError(null);
    try {
      let file_url = assignment?.file_url || null;
      if (file) {
        const ext  = file.name.split(".").pop();
        const path = `assignments/${subjectId}/${Date.now()}.${ext}`;
        const res  = await uploadStorageFile("subject-materials" as any, path, file, { upsert: true });
        if (!res.success) { setError(res.error || "Upload failed"); setSaving(false); return; }
        file_url = res.path!;
      }

      const payload: any = {
        subject_id: subjectId,
        title: title.trim(),
        title_ar: titleAr.trim() || null,
        description: desc.trim() || null,
        description_ar: descAr.trim() || null,
        question: question.trim() || null,
        question_ar: questionAr.trim() || null,
        deadline: isClasswork ? null : new Date(deadline).toISOString(),
        kind,
        max_score: Number(maxScore) || 100,
        allow_text: allowText,
        allow_file: allowFile,
        allow_audio: allowAudio,
        file_url,
      };

      if (isEdit) {
        const { error: upErr } = await supabase.from("subject_assignments").update(payload).eq("id", assignment.id);
        if (upErr) throw upErr;
      } else {
        // Stamp the assignment with whichever academic term is currently
        // "live" for the school, so it only shows up for students viewing
        // that term (see StudentAssignments.tsx / StudentDashboard.tsx) —
        // not every term, forever.
        const { data: currentTerm } = await supabase
          .from("academic_terms")
          .select("id")
          .eq("is_current", true)
          .maybeSingle();
        const { error: inErr } = await supabase
          .from("subject_assignments")
          .insert({
            ...payload,
            // Student uploads are controlled from the ⋮ menu on the card. Homework starts open;
            // classwork starts closed until the teacher is ready to collect it.
            submissions_open: !isClasswork,
            term_id: staffTermId ?? currentTerm?.id ?? null, created_by: userId, status: "open",
          });
        if (inErr) throw inErr;
      }
      onSaved();
    } catch (err: any) {
      setError(err.message || "Save failed");
    }
    setSaving(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,.5)", backdropFilter: "blur(6px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={onClose}>
      <div style={{ width: "100%", maxWidth: 600, background: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden" }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "#ddd" }} />
        </div>
        <div style={{ padding: "12px 20px 14px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <p style={{ fontSize: 18, fontWeight: 900, color: TXT, margin: 0 }}>
            {isClasswork
              ? (isEdit ? t("Edit Classwork", "تعديل العمل الصفّي") : t("New Classwork", "عمل صفّي جديد"))
              : (isEdit ? t("Edit Assignment", "تعديل الواجب") : t("New Assignment", "واجب جديد"))}
          </p>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 10, border: `1px solid ${BORDER}`, background: "#f4f4f4", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X style={{ width: 15, height: 15, color: "#888" }} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label={t("Title", "العنوان")}>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder={isClasswork ? t("e.g. Khat and imla class exercise", "مثال: تمرين الخط والإملاء") : t("e.g. Tajweed Chapter 3 Exercises", "مثال: تمارين التجويد الفصل 3")} style={inputStyle} />
          </Field>
          <Field label={t("Title (Arabic, optional)", "العنوان (عربي، اختياري)")}>
            <input value={titleAr} onChange={e => setTitleAr(e.target.value)} dir="rtl" style={inputStyle} />
          </Field>
          <Field label={t("Instructions", "التعليمات")}>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={4} style={{ ...inputStyle, height: "auto", resize: "vertical" }} />
          </Field>
          <Field label={t("Instructions (Arabic, optional)", "التعليمات (عربي، اختياري)")}>
            <textarea value={descAr} onChange={e => setDescAr(e.target.value)} dir="rtl" rows={3} style={{ ...inputStyle, height: "auto", resize: "vertical" }} />
          </Field>

          <Field label={t("Question", "السؤال")}>
            <textarea value={question} onChange={e => setQuestion(e.target.value)} rows={4} placeholder={t("What should the student answer?", "ما الذي يجب على الطالب الإجابة عنه؟")} style={{ ...inputStyle, height: "auto", resize: "vertical" }} />
          </Field>
          <Field label={t("Question (Arabic, optional)", "السؤال (عربي، اختياري)")}>
            <textarea value={questionAr} onChange={e => setQuestionAr(e.target.value)} dir="rtl" rows={3} style={{ ...inputStyle, height: "auto", resize: "vertical" }} />
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: isClasswork ? "1fr" : "1fr 1fr", gap: 12 }}>
            {!isClasswork && (
              <Field label={t("Deadline", "الموعد النهائي")}>
                <input type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} style={inputStyle} />
              </Field>
            )}
            <Field label={t("Max Score", "أعلى درجة")}>
              <input type="number" value={maxScore} onChange={e => setMaxScore(e.target.value)} min={1} style={inputStyle} />
            </Field>
          </div>

          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: TLIT, marginBottom: 8 }}>{t("Accepted submission types", "أنواع التسليم المقبولة")}</p>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              {[
                { label: t("Text", "نص"), val: allowText, set: setAllowText },
                { label: t("File", "ملف"), val: allowFile, set: setAllowFile },
                { label: t("Audio", "صوت"), val: allowAudio, set: setAllowAudio },
              ].map(o => (
                <label key={o.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: TXT, cursor: "pointer" }}>
                  <input type="checkbox" checked={o.val} onChange={e => o.set(e.target.checked)} />
                  {o.label}
                </label>
              ))}
            </div>
          </div>

          <Field label={t("Attachment (optional)", "مرفق (اختياري)")}>
            <input type="file" ref={fileRef} onChange={e => setFile(e.target.files?.[0] || null)} style={{ display: "none" }} />
            <button onClick={() => fileRef.current?.click()} type="button"
              style={{ width: "100%", padding: 11, borderRadius: 12, border: `2px dashed ${BORDER}`, background: "#f8fafb", cursor: "pointer", fontSize: 13, fontWeight: 700, color: TMID, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <Upload style={{ width: 15, height: 15 }} />
              {file ? file.name : assignment?.file_url ? t("Replace attachment", "استبدال المرفق") : t("Choose file", "اختر ملفاً")}
            </button>
          </Field>

          {error && (
            <div style={{ background: "#fff5f5", border: "1px solid #fca5a5", borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8 }}>
              <AlertTriangle style={{ width: 14, height: 14, color: "#c0392b" }} />
              <p style={{ fontSize: 13, color: "#c0392b", margin: 0 }}>{error}</p>
            </div>
          )}

          <button onClick={handleSave} disabled={saving} className="asm-btn"
            style={{ width: "100%", padding: 14, borderRadius: 14, border: "none", background: saving ? "#ccc" : `linear-gradient(135deg, ${G}, ${MG})`, color: "#fff", fontSize: 14, fontWeight: 800, cursor: saving ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            {saving ? <Loader2 style={{ width: 16, height: 16, animation: "spin .7s linear infinite" }} /> : <Save style={{ width: 15, height: 15 }} />}
            {saving ? t("Saving…", "جارٍ الحفظ…") : isEdit ? t("Save Changes", "حفظ التغييرات") : isClasswork ? t("Create Classwork", "إنشاء العمل الصفّي") : t("Create Assignment", "إنشاء الواجب")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 700, color: TLIT, display: "block", marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", borderRadius: 12, border: `1px solid ${BORDER}`, padding: "11px 14px",
  fontSize: 14, color: TXT, outline: "none", fontFamily: "'Cairo', sans-serif",
  background: "#fff", boxSizing: "border-box", height: 44,
};

/* ── Submissions — students of one task, then ONE student's work ───────────
   Everything renders inline inside the same panel (no popup, no roster accordion).
   Tapping a student shows only that student's work, with Sync at the top. */
function SubmissionsView({
  assignment: a, subjectId, language, t, onBack, onGraded, canSync, syncing, onStartSync, onStopSync,
}: {
  assignment: any; subjectId: string; language: string; t: (en: string, ar: string) => string;
  onBack: () => void; onGraded: () => void; canSync: boolean;
  syncing: SyncTarget; onStartSync: (payload: any) => boolean; onStopSync: () => void;
}) {
  const [roster, setRoster]   = useState<any[]>([]);
  const [subs, setSubs]       = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  const title = language === "ar" ? (a.title_ar || a.title) : a.title;
  const isCw = kindOf(a) === "classwork";

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const profiles = await fetchSubjectRoster(subjectId);
    setRoster(profiles);
    const { data: submissions } = await supabase.from("assignment_submissions").select("*").eq("assignment_id", a.id);
    const map: Record<string, any> = {};
    (submissions || []).forEach((s: any) => { map[s.user_id] = s; });
    setSubs(map);
    setLoading(false);
  }, [subjectId, a.id]);

  useEffect(() => { load(); }, [load]);

  // Live: new uploads / re-uploads appear without reopening.
  useEffect(() => {
    const ch = supabase.channel(`grading-${a.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "assignment_submissions", filter: `assignment_id=eq.${a.id}` }, () => { load(true); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [a.id, load]);

  const rank = (s: any) => {
    const sub = subs[s.user_id];
    if (!sub) return 2;
    return sub.grade == null ? 0 : 1; // needs grading → graded → not submitted
  };
  const sorted = [...roster].sort((x, y) => rank(x) - rank(y) || (x.full_name || "").localeCompare(y.full_name || ""));
  const submittedCount = roster.filter(s => subs[s.user_id]).length;

  /* ───── ONE student's work ───── */
  if (studentId) {
    const student = roster.find(s => s.user_id === studentId);
    const sub = subs[studentId];
    const name = student?.full_name || t("Student", "طالب");
    const isSharingThis = !!syncing && syncing.assignmentId === a.id && syncing.userId === studentId;

    const share = async () => {
      if (!sub || sharing) return;
      setSharing(true);
      try {
        const paths: string[] = (sub.file_urls && sub.file_urls.length > 0) ? sub.file_urls : (sub.file_url ? [sub.file_url] : []);
        const files: { url: string; name: string }[] = [];
        for (const p of paths.slice(0, 4)) {
          const u = await getSignedUrl(p, 3600);
          if (u) files.push({ url: u, name: decodeURIComponent((p.split("?")[0].split("/").pop() || "file")) });
        }
        const audio = sub.audio_url ? await getSignedUrl(sub.audio_url, 3600) : null;
        onStartSync({
          assignmentId: a.id,
          title: a.title,
          titleAr: a.title_ar || null,
          studentId,
          studentName: name,
          text: sub.text_response || "",
          files,
          audio: audio || null,
          at: Date.now(),
        });
      } finally {
        setSharing(false);
      }
    };

    return (
      <>
        {/* Top bar: back · name · Sync */}
        <div style={{ position: "sticky", top: 0, zIndex: 5, padding: "8px 0", background: "#f5f2ea", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => setStudentId(null)} className="asm-btn" aria-label={t("Back", "رجوع")}
            style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${BORDER}`, background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <ArrowLeft style={{ width: 16, height: 16, color: TXT }} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: TXT, lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
            <div style={{ fontSize: 11, color: TLIT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
          </div>
          {canSync && sub && (
            isSharingThis ? (
              <button onClick={onStopSync} className="asm-btn"
                style={{ height: 36, padding: "0 12px", borderRadius: 10, border: "none", background: "#dc2626", color: "#fff", fontSize: 12.5, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#fff", animation: "asmPulse 1.2s ease-in-out infinite" }} />
                {t("Stop", "إيقاف")}
              </button>
            ) : (
              <button onClick={share} disabled={sharing} className="asm-btn"
                style={{ height: 36, padding: "0 14px", borderRadius: 10, border: "none", background: sharing ? "#9ca3af" : `linear-gradient(135deg, ${G}, ${MG})`, color: "#fff", fontSize: 12.5, fontWeight: 800, cursor: sharing ? "wait" : "pointer", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                {sharing ? <Loader2 style={{ width: 14, height: 14, animation: "spin .8s linear infinite" }} /> : <Cast style={{ width: 14, height: 14 }} />}
                {t("Sync", "مزامنة")}
              </button>
            )
          )}
        </div>
        {isSharingThis && (
          <p style={{ fontSize: 12, color: "#991b1b", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "8px 12px", margin: 0, fontWeight: 700 }}>
            {t("Everyone in the class can see this work right now.", "يرى جميع من في الحصة هذا العمل الآن.")}
          </p>
        )}
        {sub ? (
          <StudentWorkDetail
            key={sub.id}
            assignment={a}
            submission={sub}
            t={t}
            onGraded={async () => { await load(true); onGraded(); }}
          />
        ) : (
          <div style={{ ...card, padding: "28px 18px", textAlign: "center", color: TLIT, fontSize: 13 }}>
            {t("This student hasn't submitted yet.", "لم يسلّم هذا الطالب بعد.")}
          </div>
        )}
      </>
    );
  }

  /* ───── Students of this task ───── */
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={onBack} className="asm-btn" aria-label={t("Back", "رجوع")}
          style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${BORDER}`, background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <ArrowLeft style={{ width: 16, height: 16, color: TXT }} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 11, color: TMID, margin: "0 0 2px", fontWeight: 700 }}>{isCw ? t("Classwork", "عمل صفّي") : t("Assignment", "واجب")}</p>
          <p style={{ fontSize: 15, fontWeight: 900, color: TXT, margin: 0, lineHeight: 1.35, wordBreak: "break-word" }}>{title}</p>
        </div>
      </div>
      <p style={{ fontSize: 12, color: TLIT, margin: 0, fontWeight: 700 }}>
        {t(`${submittedCount} of ${roster.length} submitted`, `${submittedCount} من ${roster.length} سلّموا`)}
      </p>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
          <Loader2 style={{ width: 28, height: 28, color: G, animation: "spin .7s linear infinite" }} />
        </div>
      ) : roster.length === 0 ? (
        <p style={{ textAlign: "center", color: TLIT, fontSize: 13, padding: 30 }}>{t("No students enrolled in this subject yet.", "لا يوجد طلاب مسجلون في هذه المادة بعد.")}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {sorted.map(student => {
            const sub = subs[student.user_id];
            const graded = sub?.grade != null;
            const st = !sub
              ? { label: t("Not submitted", "لم يُسلَّم"), color: TLIT, bg: "#f4f4f4" }
              : graded
                ? { label: `${sub.grade}/${a.max_score ?? 100}`, color: "#276749", bg: "#f0fdf4" }
                : { label: t("Needs grading", "بانتظار التصحيح") + (sub.is_late ? ` · ${t("late", "متأخر")}` : ""), color: "#1d4ed8", bg: "#eff6ff" };
            return (
              <div key={student.user_id} onClick={sub ? () => setStudentId(student.user_id) : undefined} className={sub ? "asm-card" : undefined}
                style={{ ...card, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, cursor: sub ? "pointer" : "default", opacity: sub ? 1 : 0.65 }}>
                <div style={{ width: 34, height: 34, borderRadius: "50%", background: `${G}12`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: G }}>{(student.full_name || "?")[0]?.toUpperCase()}</span>
                </div>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, color: TXT, lineHeight: 1.3, wordBreak: "break-word" }}>{student.full_name || t("Unnamed student", "طالب بدون اسم")}</span>
                <span style={{ fontSize: 10.5, fontWeight: 800, color: st.color, background: st.bg, borderRadius: 20, padding: "3px 9px", whiteSpace: "nowrap" }}>{st.label}</span>
                {sub && <ChevronRight style={{ width: 14, height: 14, color: TLIT, flexShrink: 0 }} />}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/* One student's submission + grading form (always open — no accordion) */
function StudentWorkDetail({
  assignment: a, submission: sub, t, onGraded,
}: { assignment: any; submission: any; t: (en: string, ar: string) => string; onGraded: () => void }) {
  const [grade, setGrade]       = useState(sub?.grade != null ? String(sub.grade) : "");
  const [feedback, setFeedback] = useState(sub?.feedback || "");
  const [saving, setSaving]     = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    if (sub?.audio_url) getSignedUrl(sub.audio_url, 3600).then(u => setAudioUrl(u));
  }, [sub?.audio_url]);

  const saveGrade = async () => {
    const n = Number(grade);
    if (grade !== "" && (isNaN(n) || n < 0 || n > (a.max_score ?? 100))) return;
    setSaving(true);
    const { data: authData } = await supabase.auth.getUser();
    await supabase.from("assignment_submissions").update({
      grade: grade === "" ? null : n,
      feedback: feedback.trim() || null,
      status: grade !== "" ? "graded" : sub.status,
      graded_by: authData.user?.id,
      graded_at: new Date().toISOString(),
    }).eq("id", sub.id);
    setSaving(false);
    onGraded();
  };

  const files: string[] = (sub.file_urls && sub.file_urls.length > 0) ? sub.file_urls : (sub.file_url ? [sub.file_url] : []);
  const empty = !sub.text_response && files.length === 0 && !sub.audio_url;

  return (
    <div style={{ ...card, padding: 14, display: "flex", flexDirection: "column", gap: 12, overflow: "visible" }}>
      {sub.is_late && (
        <span style={{ alignSelf: "flex-start", fontSize: 10.5, fontWeight: 800, color: "#b45309", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 20, padding: "3px 9px" }}>{t("Submitted late", "سُلّم متأخراً")}</span>
      )}
      {empty && <p style={{ fontSize: 13, color: TLIT, margin: 0 }}>{t("Nothing attached to this submission.", "لا يوجد محتوى في هذا التسليم.")}</p>}
      {sub.text_response && (
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, color: TLIT, margin: "0 0 4px", textTransform: "uppercase" }}>{t("Text answer", "الإجابة النصية")}</p>
          <p dir="auto" style={{ fontSize: 14, color: TXT, margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.6, background: "#f8fafb", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "10px 12px", wordBreak: "break-word" }}>{sub.text_response}</p>
        </div>
      )}
      {files.map((url, i, arr) => (
        <AttachmentRow key={url} url={url} label={arr.length > 1 ? t(`Attached file ${i + 1}`, `الملف المرفق ${i + 1}`) : t("Attached file", "الملف المرفق")} />
      ))}
      {audioUrl && <audio controls src={audioUrl} style={{ width: "100%", height: 40 }} />}

      <div style={{ display: "grid", gridTemplateColumns: "96px 1fr", gap: 10, alignItems: "flex-start" }}>
        <div>
          <label style={{ fontSize: 10, fontWeight: 700, color: TLIT, display: "block", marginBottom: 4 }}>{t("Score", "الدرجة")}</label>
          <input type="number" inputMode="decimal" value={grade} onChange={e => setGrade(e.target.value)} min={0} max={a.max_score ?? 100}
            placeholder={`/${a.max_score ?? 100}`}
            style={{ width: "100%", height: 40, borderRadius: 10, border: `1px solid ${BORDER}`, padding: "0 10px", fontSize: 14, boxSizing: "border-box" }} />
        </div>
        <div>
          <label style={{ fontSize: 10, fontWeight: 700, color: TLIT, display: "block", marginBottom: 4 }}>{t("Feedback", "الملاحظات")}</label>
          <input value={feedback} onChange={e => setFeedback(e.target.value)} placeholder={t("Optional note to the student…", "ملاحظة اختيارية للطالب…")}
            style={{ width: "100%", height: 40, borderRadius: 10, border: `1px solid ${BORDER}`, padding: "0 10px", fontSize: 14, boxSizing: "border-box" }} />
        </div>
      </div>

      <button onClick={saveGrade} disabled={saving} className="asm-btn"
        style={{ padding: "12px", borderRadius: 12, border: "none", background: saving ? "#ccc" : G, color: "#fff", fontSize: 13.5, fontWeight: 800, cursor: saving ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
        {saving ? <Loader2 style={{ width: 14, height: 14, animation: "spin .8s linear infinite" }} /> : <Save style={{ width: 13, height: 13 }} />}
        {t("Save grade", "حفظ الدرجة")}
      </button>
    </div>
  );
}

/* ── What students see while the teacher has Sync on ─────────────────────
   Rendered by ClassroomView on every student's screen. The teacher's side
   puts the content (text + short-lived file links) into the live message,
   so students never need permission to read another student's row. */
export function SharedWorkOverlay({ work, onClose }: { work: any; onClose: () => void }) {
  const { language } = useLanguage();
  const isAr = language === "ar";
  const title = isAr ? (work.titleAr || work.title) : work.title;
  const files: { url: string; name: string }[] = Array.isArray(work.files) ? work.files : [];
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 57, background: "#f5f2ea", display: "flex", flexDirection: "column", fontFamily: "'Cairo', sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: G, flexShrink: 0 }}>
        <Cast style={{ width: 16, height: 16, color: GOLDF, flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 13.5, fontWeight: 800, color: "#fff", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {isAr ? "يعرض المعلم عملاً" : "Your teacher is showing work"}
        </span>
        <button onClick={onClose} aria-label="Close"
          style={{ width: 32, height: 32, borderRadius: 9, border: "none", background: "rgba(255,255,255,.14)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <X style={{ width: 15, height: 15, color: "#fff" }} />
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12, WebkitOverflowScrolling: "touch" as any }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: TMID, margin: "0 0 2px" }}>{title}</p>
          <p style={{ fontSize: 18, fontWeight: 900, color: TXT, margin: 0, lineHeight: 1.35, wordBreak: "break-word" }}>{work.studentName}</p>
        </div>
        {work.text && (
          <p dir="auto" style={{ fontSize: 16, color: TXT, margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.8, background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 14, padding: "14px 16px", wordBreak: "break-word" }}>{work.text}</p>
        )}
        {files.map((f, i) => {
          const isImg = IMAGE_EXTS.includes(getExt(f.name));
          return isImg ? (
            <img key={i} src={f.url} alt={f.name} style={{ width: "100%", borderRadius: 14, background: "#000", objectFit: "contain", maxHeight: "70vh" }} />
          ) : (
            <a key={i} href={f.url} target="_blank" rel="noreferrer"
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 12, background: "#eff6ff", border: "1px solid #93c5fd", color: "#1d4ed8", fontSize: 13, fontWeight: 700, textDecoration: "none", wordBreak: "break-all" }}>
              <Download style={{ width: 15, height: 15, flexShrink: 0 }} />{f.name}
            </a>
          );
        })}
        {work.audio && <audio controls src={work.audio} style={{ width: "100%", height: 44 }} />}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   STUDENT VIEW — browse + submit, locked once overdue
   ═══════════════════════════════════════════════════════════════ */
function StudentAssignmentList({ subjectId }: { subjectId?: string }) {
  const { user, profile } = useAuth() as any;
  const termFilterId = useViewingTermId(profile);
  const { t, language } = useLanguage();
  const navigate = useNavigate();

  const [assignments, setAssignments]   = useState<any[]>([]);
  const [submissions, setSubmissions]   = useState<Record<string, any>>({});
  const [loading, setLoading]           = useState(true);
  const [filter, setFilter]             = useState<AStatus>("all");
  const [search, setSearch]             = useState("");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [subjects, setSubjects]         = useState<any[]>([]);
  const [selected, setSelected]         = useState<any | null>(null);
  const [showSubmit, setShowSubmit]     = useState(false);

  const embedded = !!subjectId;

  /* ── Load data ─────────────────────────────────────────── */
  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      let list: any[] = [];

      if (subjectId) {
        // Scoped to a single subject tab — the common case.
        let sq = supabase
          .from("subject_assignments")
          .select("*, subjects(id, title, title_ar, level, levels)")
          .eq("subject_id", subjectId)
          .neq("status", "draft");
        if (termFilterId) sq = sq.or(`term_id.eq.${termFilterId},term_id.is.null`);
        const { data: asgn } = await sq.order("deadline", { ascending: true });
        list = asgn || [];
      } else {
        // Legacy standalone use — every assignment across enrolled subjects.
        const { data: profileData } = await supabase
          .from("profiles").select("level").eq("user_id", user.id).single();
        const studentLevel: string | null = (profileData as any)?.level || null;

        // NOTE: enrollments.course_id (not subject_id) is the real column —
        // every other query against this table filters/selects by course_id.
        // The subject_id version was returning a 400 from PostgREST every time.
        const { data: enrollments } = await supabase
          .from("enrollments").select("course_id").eq("user_id", user.id);
        const subjectIds = (enrollments || []).map((e: any) => e.course_id).filter(Boolean);

        const { data: ttSlots } = await supabase
          .from("subject_timetable" as any).select("subject_id, levels").eq("is_active", true);
        const ttSubjectIds = (ttSlots || [])
          .filter((s: any) => {
            if (!s.levels || s.levels.length === 0) return true;
            if (!studentLevel) return false;
            return s.levels.includes(studentLevel);
          })
          .map((s: any) => s.subject_id)
          .filter(Boolean);

        const allSubjectIds = [...new Set([...subjectIds, ...ttSubjectIds])];
        if (allSubjectIds.length === 0) { setAssignments([]); setLoading(false); return; }

        let aq2 = supabase
          .from("subject_assignments")
          .select("*, subjects(id, title, title_ar, level, levels)")
          .in("subject_id", allSubjectIds)
          .neq("status", "draft");
        if (termFilterId) aq2 = aq2.or(`term_id.eq.${termFilterId},term_id.is.null`);
        const { data: asgn } = await aq2.order("deadline", { ascending: true });

        list = (asgn || []).filter((a: any) => {
          const subj = a.subjects;
          if (!subj) return true;
          const subjLevels: string[] = subj.levels || (subj.level ? [subj.level] : []);
          if (subjLevels.length === 0) return true;
          if (!studentLevel) return false;
          return subjLevels.includes(studentLevel);
        });
      }

      setAssignments(list);

      const uniqueSubjects = Object.values(
        list.reduce((acc: any, a: any) => {
          if (a.subjects) acc[a.subjects.id] = a.subjects;
          return acc;
        }, {})
      );
      setSubjects(uniqueSubjects as any[]);

      if (list.length > 0) {
        const assignmentIds = list.map((a: any) => a.id);
        const { data: subs } = await supabase
          .from("assignment_submissions")
          .select("*")
          .eq("user_id", user.id)
          .in("assignment_id", assignmentIds);

        const subMap: Record<string, any> = {};
        (subs || []).forEach((s: any) => { subMap[s.assignment_id] = s; });
        setSubmissions(subMap);
      } else {
        setSubmissions({});
      }
    } catch (err) {
      console.error("Failed to load assignments:", err);
    }
    setLoading(false);
  }, [user, subjectId, termFilterId]);

  useEffect(() => { load(); }, [load]);

  // Live sync: scores, corrections and the teacher's uploads on/off switch appear instantly.
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`stu-asg-${user.id}-${subjectId || "all"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "assignment_submissions", filter: `user_id=eq.${user.id}` }, () => { load(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "subject_assignments" }, () => { load(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, subjectId, load]);

  /* ── Derived filtered list ─────────────────────────── */
  const filtered = assignments.filter(a => {
    const sub = submissions[a.id];
    const status = sub ? (sub.status === "graded" ? "graded" : "submitted")
      : isOverdue(a.deadline) ? "overdue" : "pending";

    if (filter !== "all" && filter !== status) return false;
    if (subjectFilter !== "all" && a.subject_id !== subjectFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const title = language === "ar" ? (a.title_ar || a.title) : a.title;
      if (!title?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  /* ── Stats ─────────────────────────────────────────── */
  const total     = assignments.length;
  const pending   = assignments.filter(a => !submissions[a.id] && !isOverdue(a.deadline)).length;
  const submitted = assignments.filter(a => submissions[a.id] && submissions[a.id].status !== "graded").length;
  const graded    = assignments.filter(a => submissions[a.id]?.status === "graded").length;
  const overdue   = assignments.filter(a => !submissions[a.id] && isOverdue(a.deadline)).length;

  const avgScore = (() => {
    const gradedSubs = Object.values(submissions).filter((s: any) => s.grade != null);
    if (!gradedSubs.length) return null;
    return Math.round(gradedSubs.reduce((sum: number, s: any) => sum + Number(s.grade), 0) / gradedSubs.length);
  })();

  /* ── Status chip helper ────────────────────────────── */
  const statusChip = (a: any) => {
    const sub = submissions[a.id];
    // Fully locked only when nothing was ever submitted. If the student did
    // submit before the deadline, they keep read-only access to it (and to
    // their grade/feedback) even after the deadline passes.
    const locked = isOverdue(a.deadline) && !sub;
    if (sub?.status === "graded") return { label: t("Graded", "مُصحَّح"), color: "#276749", bg: "#dcfce7", border: "#9ae6b4", icon: Award };
    if (locked) return { label: t("Locked — deadline passed", "مغلق — انتهى الموعد"), color: "#c0392b", bg: "#fff5f5", border: "#fca5a5", icon: Lock };
    if (sub) return { label: t("Submitted", "مُرسَل"), color: "#1d4ed8", bg: "#eff6ff", border: "#93c5fd", icon: CheckCircle };
    if (a.kind === "classwork") {
      return a.submissions_open === false
        ? { label: t("Classwork · in class", "عمل صفّي · داخل الحصة"), color: TMID, bg: "#f0fdf4", border: "#86efac", icon: ClipboardList }
        : { label: t("Classwork · upload open", "عمل صفّي · الرفع مفتوح"), color: "#1d4ed8", bg: "#eff6ff", border: "#93c5fd", icon: Upload };
    }
    const dl = daysLeft(a.deadline);
    if (dl !== null && dl <= 2) return { label: t(`Due in ${dl}d`, `باقي ${dl} يوم`), color: "#b45309", bg: "#fffbeb", border: "#fde68a", icon: Clock };
    return { label: t("Pending", "قيد الانتظار"), color: TMID, bg: "#f0fdf4", border: "#86efac", icon: ClipboardList };
  };

  /* ─── Main render ──────────────────────────────────── */
  return (
    <div style={{ background: embedded ? "transparent" : CREAM, minHeight: embedded ? "auto" : "100vh", fontFamily: "'Cairo', sans-serif" }}>
      {!embedded && (
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&family=Playfair+Display:wght@500;700&display=swap');`}</style>
      )}
      <style>{`
        .asm-card { transition: box-shadow .18s, transform .18s; }
        .asm-card:hover { box-shadow: 0 8px 32px rgba(15,45,31,0.13) !important; transform: translateY(-1px); }
        .asm-card.locked:hover { transform: none; }
        .asm-btn { transition: opacity .15s, transform .12s; }
        .asm-btn:active { transform: scale(0.96); }
        .asm-tab { transition: background .15s, color .15s; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ maxWidth: embedded ? "100%" : 720, margin: "0 auto", padding: embedded ? 0 : "20px 16px 48px", display: "flex", flexDirection: "column", gap: 18 }}>

        {/* ── Header (only on the standalone page) ── */}
        {!embedded && (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={() => navigate("/student")} style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${BORDER}`, background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ArrowLeft style={{ width: 16, height: 16, color: TXT }} />
            </button>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 900, color: TXT, margin: 0, fontFamily: "'Playfair Display', serif" }}>
                {t("My Assignments", "واجباتي")}
              </h1>
              <p style={{ fontSize: 12, color: TLIT, margin: "2px 0 0" }}>
                {t("All assignments from your classes", "جميع الواجبات من دروسك")}
              </p>
            </div>
          </div>
        )}

        {/* ── Stats row ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
          {[
            { label: t("Pending", "قيد الانتظار"),  value: pending,   color: TMID,     icon: ClipboardList,  status: "pending" as AStatus },
            { label: t("Submitted", "مُرسَل"),        value: submitted, color: "#1d4ed8", icon: CheckCircle,    status: "submitted" as AStatus },
            { label: t("Graded", "مُصحَّح"),          value: graded,    color: "#276749", icon: Award,          status: "graded" as AStatus },
            { label: t("Overdue", "متأخر"),           value: overdue,   color: "#c0392b", icon: AlertTriangle,  status: "overdue" as AStatus },
          ].map(s => (
            <div key={s.status} onClick={() => setFilter(filter === s.status ? "all" : s.status)}
              className="asm-btn"
              style={{ ...card, padding: "12px 10px", textAlign: "center", cursor: "pointer", border: `1px solid ${filter === s.status ? s.color + "55" : BORDER}`, background: filter === s.status ? s.color + "08" : "#fff" }}>
              <s.icon style={{ width: 18, height: 18, color: s.color, marginBottom: 4 }} />
              <div style={{ fontSize: 20, fontWeight: 900, color: TXT }}>{s.value}</div>
              <div style={{ fontSize: 10, fontWeight: 600, color: TLIT, lineHeight: 1.2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Avg score pill */}
        {avgScore !== null && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", background: `linear-gradient(135deg, ${G}, ${MG})`, borderRadius: 14 }}>
            <TrendingUp style={{ width: 16, height: 16, color: GOLD }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{t("Average score across graded assignments:", "متوسط درجاتك في الواجبات:")}</span>
            <span style={{ fontSize: 16, fontWeight: 900, color: GOLD }}>{avgScore}%</span>
          </div>
        )}

        {/* ── Search + Filters ── */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 180, position: "relative" }}>
            <Search style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: TLIT }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder={t("Search assignments…", "ابحث عن واجب…")}
              style={{ width: "100%", paddingLeft: 36, paddingRight: 12, height: 38, borderRadius: 10, border: `1px solid ${BORDER}`, background: "#fff", fontSize: 13, color: TXT, outline: "none", boxSizing: "border-box" }}
            />
          </div>
          {!embedded && (
            <select
              value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)}
              style={{ height: 38, borderRadius: 10, border: `1px solid ${BORDER}`, background: "#fff", fontSize: 13, color: TXT, padding: "0 12px", cursor: "pointer", outline: "none" }}>
              <option value="all">{t("All Subjects", "جميع المواد")}</option>
              {subjects.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {language === "ar" ? (s.title_ar || s.title) : s.title}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* ── Assignment list ── */}
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", border: `3px solid ${G}`, borderTopColor: "transparent", animation: "spin .7s linear infinite" }} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ ...card, padding: "48px 20px", textAlign: "center" }}>
            <ClipboardList style={{ width: 48, height: 48, color: TLIT, margin: "0 auto 12px", opacity: .4 }} />
            <p style={{ fontSize: 16, fontWeight: 700, color: TXT, margin: "0 0 4px" }}>{t("No assignments found", "لا توجد واجبات")}</p>
            <p style={{ fontSize: 13, color: TLIT, margin: 0 }}>{t("You're all caught up!", "أنت منتهٍ من كل شيء!")}</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {filtered.map(a => {
              const sub  = submissions[a.id];
              const chip = statusChip(a);
              // Once the deadline has passed with nothing submitted, the
              // assignment is fully locked — it can no longer be opened to
              // view or to submit (the DB trigger backs up the submit side).
              // If the student already submitted, they keep read-only access
              // to their work and grade/feedback after the deadline too.
              const locked = isOverdue(a.deadline) && !sub;
              const title = language === "ar" ? (a.title_ar || a.title) : a.title;
              const subjTitle = language === "ar" ? (a.subjects?.title_ar || a.subjects?.title) : a.subjects?.title;
              return (
                <div key={a.id} className={`asm-card ${locked ? "locked" : ""}`}
                  style={{ ...card, cursor: locked ? "not-allowed" : "pointer", opacity: locked ? 0.72 : 1 }}
                  onClick={() => { if (locked) return; setSelected(a); setShowSubmit(false); }}>
                  <div style={{ padding: "16px 18px" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                      {/* Icon */}
                      <div style={{ width: 44, height: 44, borderRadius: 13, background: `${G}10`, border: `1px solid ${G}20`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {locked ? <Lock style={{ width: 20, height: 20, color: "#c0392b" }} /> : <ClipboardList style={{ width: 20, height: 20, color: G }} />}
                      </div>
                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                          <span style={{ fontSize: 15, fontWeight: 800, color: TXT }}>{title}</span>
                          <span style={{ fontSize: 10, fontWeight: 800, color: chip.color, background: chip.bg, border: `1px solid ${chip.border}`, borderRadius: 20, padding: "2px 9px", display: "flex", alignItems: "center", gap: 4 }}>
                            <chip.icon style={{ width: 10, height: 10 }} />
                            {chip.label}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                          {!embedded && (
                            <span style={{ fontSize: 11, color: TMID, display: "flex", alignItems: "center", gap: 4 }}>
                              <BookOpen style={{ width: 11, height: 11 }} />{subjTitle}
                            </span>
                          )}
                          {a.deadline && (
                            <span style={{ fontSize: 11, color: isOverdue(a.deadline) ? "#c0392b" : TLIT, display: "flex", alignItems: "center", gap: 4 }}>
                              <Calendar style={{ width: 11, height: 11 }} />
                              {fmtDate(a.deadline)}
                            </span>
                          )}
                          {sub?.grade != null && (
                            <span style={{ fontSize: 11, fontWeight: 800, color: "#276749", display: "flex", alignItems: "center", gap: 4 }}>
                              <Star style={{ width: 11, height: 11, fill: GOLD, color: GOLD }} />
                              {sub.grade}/{a.max_score ?? 100}
                            </span>
                          )}
                        </div>
                      </div>
                      {!locked && <ChevronRight style={{ width: 16, height: 16, color: TLIT, flexShrink: 0 }} />}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Detail / Submit Modal ──
          Blocked entirely if overdue with nothing submitted (fully locked).
          If overdue but already submitted, it opens read-only. */}
      {selected && (!isOverdue(selected.deadline) || !!submissions[selected.id]) && (
        <AssignmentModal
          assignment={selected}
          submission={submissions[selected.id]}
          userId={user!.id}
          language={language}
          t={t}
          readOnly={isOverdue(selected.deadline) || selected.submissions_open === false}
          onClose={() => setSelected(null)}
          onSubmitted={async () => { await load(); setSelected(null); }}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   AssignmentModal — full-featured submission modal
   ═══════════════════════════════════════════════════════════════ */
function AssignmentModal({
  assignment: a, submission: existingSub, userId,
  language, t, onClose, onSubmitted, readOnly = false,
}: {
  assignment: any; submission: any; userId: string;
  language: string; t: (en: string, ar: string) => string;
  onClose: () => void; onSubmitted: () => void; readOnly?: boolean;
}) {
  const [activeTab, setActiveTab]   = useState<"details" | "submit" | "feedback">(readOnly && existingSub ? "feedback" : "details");
  const [textInput, setTextInput]   = useState(existingSub?.text_response || "");
  const [files, setFiles]           = useState<File[]>([]);
  const existingFileUrls: string[] = (existingSub?.file_urls && existingSub.file_urls.length > 0)
    ? existingSub.file_urls
    : (existingSub?.file_url ? [existingSub.file_url] : []);
  const [uploading, setUploading]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [comments, setComments]     = useState<any[]>([]);
  const [commentText, setCommentText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  /* Audio recorder */
  const [recording, setRecording]       = useState(false);
  const [audioBlob, setAudioBlob]       = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl]         = useState<string | null>(null);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const mediaRecRef  = useRef<MediaRecorder | null>(null);
  const chunksRef    = useRef<BlobEvent["data"][]>([]);
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const [playing, setPlaying]           = useState(false);
  const audioRef     = useRef<HTMLAudioElement | null>(null);

  const title = language === "ar" ? (a.title_ar || a.title) : a.title;
  const desc  = language === "ar" ? (a.description_ar || a.description) : a.description;
  const question = language === "ar" ? (a.question_ar || a.question) : a.question;
  const subjTitle = language === "ar" ? (a.subjects?.title_ar || a.subjects?.title) : a.subjects?.title;
  const isGraded  = existingSub?.status === "graded";
  const submitted = !!existingSub && !["draft"].includes(existingSub?.status);
  // The deadline lock is enforced one level up (the modal is only mounted
  // for non-overdue assignments), but "closed" is kept for the explicit
  // status field a staff member can also set manually.
  const closed    = a.status === "closed";

  // Load comments
  useEffect(() => {
    if (!existingSub?.id) return;
    supabase.from("assignment_comments" as any)
      .select("*, profiles(full_name, role)")
      .eq("submission_id", existingSub.id)
      .order("created_at")
      .then(({ data }) => { if (data) setComments(data); });
  }, [existingSub?.id]);

  /* ── Audio recording ───────────────────────────────── */
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach(t => t.stop());
      };
      mr.start();
      mediaRecRef.current = mr;
      setRecording(true);
      setRecordSeconds(0);
      timerRef.current = setInterval(() => setRecordSeconds(s => s + 1), 1000);
    } catch {
      setError(t("Microphone access denied.", "تم رفض الوصول إلى الميكروفون."));
    }
  };

  const stopRecording = () => {
    mediaRecRef.current?.stop();
    setRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const clearAudio = () => {
    setAudioBlob(null);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setRecordSeconds(0);
    setPlaying(false);
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { audioRef.current.play(); setPlaying(true); }
  };

  const fmtSecs = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  /* ── File upload ───────────────────────────────────── */
  const [keptExistingUrls, setKeptExistingUrls] = useState<string[]>(existingFileUrls);
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    const tooBig = picked.filter(f => f.size > CLASSWORK_MAX_MB * 1024 * 1024);
    const ok = picked.filter(f => f.size <= CLASSWORK_MAX_MB * 1024 * 1024);
    if (ok.length) setFiles(prev => [...prev, ...ok]);
    if (tooBig.length) setError(t(`${tooBig.map(f => f.name).join(", ")} is larger than ${CLASSWORK_MAX_MB} MB. Please send a smaller file.`, `الملف أكبر من ${CLASSWORK_MAX_MB} ميجابايت. يرجى إرسال ملف أصغر.`));
    else if (ok.length) setError(null);
    e.target.value = "";
  };
  const removeNewFile = (idx: number) => setFiles(prev => prev.filter((_, i) => i !== idx));
  const removeExistingFileUrl = (url: string) => setKeptExistingUrls(prev => prev.filter(u => u !== url));

  /* ── Submit ────────────────────────────────────────── */
  const handleSubmit = async () => {
    if (a.submissions_open === false) {
      setError(t("Your teacher has switched uploads off for this assignment.", "أوقف المعلم رفع الإجابات لهذا الواجب."));
      return;
    }
    if (isOverdue(a.deadline)) {
      setError(t("The deadline for this assignment has passed. Submissions are no longer accepted.", "لقد انتهى الموعد النهائي لهذا الواجب. لم يعد التسليم مقبولاً."));
      return;
    }
    if (!textInput.trim() && files.length === 0 && keptExistingUrls.length === 0 && !audioBlob) {
      setError(t("Please provide a text answer, file, or voice recording.", "يرجى تقديم إجابة نصية أو ملف أو تسجيل صوتي."));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      let uploadedFileUrls: string[] = [...keptExistingUrls];
      let uploadedAudioUrl: string | null = existingSub?.audio_url || null;

      // Upload files (multiple)
      if (files.length > 0) {
        setUploading(true);
        for (const f of files) {
          const ext  = f.name.split(".").pop();
          const path = `${userId}/${a.id}/file_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
          const res  = await uploadStorageFile("subject-materials" as any, path, f, { upsert: true, contentType: contentTypeForClasswork(f) });
          if (!res.success) { setError(res.error || "Upload failed"); setSubmitting(false); setUploading(false); return; }
          uploadedFileUrls.push(res.path!);
        }
        setUploading(false);
      }

      // Upload audio
      if (audioBlob) {
        setUploading(true);
        const path = `${userId}/${a.id}/audio_${Date.now()}.webm`;
        const res  = await uploadStorageFile("subject-materials" as any, path, audioBlob, { upsert: true, contentType: "audio/webm" });
        if (!res.success) { setError(res.error || "Audio upload failed"); setSubmitting(false); setUploading(false); return; }
        uploadedAudioUrl = res.path!;
        setUploading(false);
      }

      const payload: any = {
        assignment_id:  a.id,
        user_id:        userId,
        text_response:  textInput || null,
        file_url:       uploadedFileUrls[0] || null,
        file_urls:      uploadedFileUrls.length > 0 ? uploadedFileUrls : null,
        audio_url:      uploadedAudioUrl,
        status:         "submitted",
        is_late:        isOverdue(a.deadline),
        submitted_at:   new Date().toISOString(),
        updated_at:     new Date().toISOString(),
      };

      let dbError: any = null;
      if (existingSub?.id) {
        const { error: upErr } = await supabase.from("assignment_submissions").update(payload).eq("id", existingSub.id);
        dbError = upErr;
      } else {
        const { error: inErr } = await supabase.from("assignment_submissions").insert(payload);
        dbError = inErr;
      }
      // The database also enforces the deadline (in case it passed while this
      // modal was open), so surface that error clearly if it comes back.
      if (dbError) {
        setError(dbError.message?.includes("deadline")
          ? t("The deadline for this assignment has passed. Submissions are no longer accepted.", "لقد انتهى الموعد النهائي لهذا الواجب. لم يعد التسليم مقبولاً.")
          : dbError.message || "Submission failed");
        setSubmitting(false);
        return;
      }
      onSubmitted();
    } catch (err: any) {
      setError(err.message || "Submission failed");
    }
    setSubmitting(false);
  };

  /* ── Post comment ──────────────────────────────────── */
  const postComment = async () => {
    if (!commentText.trim() || !existingSub?.id) return;
    const { data: inserted } = await supabase
      .from("assignment_comments" as any)
      .insert({ submission_id: existingSub.id, author_id: userId, body: commentText.trim() })
      .select("*, profiles(full_name, role)")
      .single();
    if (inserted) setComments(prev => [...prev, inserted]);
    setCommentText("");
  };

  /* ── Tabs ─────────────────────────────────────────── */
  const tabs: { key: typeof activeTab; label: string }[] = [
    { key: "details", label: t("Details", "التفاصيل") },
    ...(!readOnly ? [{ key: "submit" as const, label: submitted ? t("My Submission", "إجابتي") : t("Submit", "إرسال") }] : []),
    ...(existingSub ? [{ key: "feedback" as const, label: t("Feedback", "التغذية الراجعة") }] : []),
  ];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.5)", backdropFilter: "blur(6px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={onClose}>
      <div style={{ width: "100%", maxWidth: 600, background: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden" }}
        onClick={e => e.stopPropagation()}>

        {/* Drag handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "#ddd" }} />
        </div>

        {/* Header */}
        <div style={{ padding: "12px 20px 14px", borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 11, color: TMID, margin: "0 0 2px", fontWeight: 700 }}>{subjTitle}</p>
              <p style={{ fontSize: 18, fontWeight: 900, color: TXT, margin: 0, lineHeight: 1.2 }}>{title}</p>
              {a.deadline && (
                <p style={{ fontSize: 11, color: isOverdue(a.deadline) ? "#c0392b" : TLIT, margin: "4px 0 0", display: "flex", alignItems: "center", gap: 4 }}>
                  <Calendar style={{ width: 11, height: 11 }} />
                  {t("Due:", "الموعد النهائي:")} {fmtDate(a.deadline)}
                </p>
              )}
            </div>
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 10, border: `1px solid ${BORDER}`, background: "#f4f4f4", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <X style={{ width: 15, height: 15, color: "#888" }} />
            </button>
          </div>

          {/* Score badge */}
          {existingSub?.grade != null && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, background: `${GOLD}18`, border: `1px solid ${GOLD}44`, borderRadius: 20, padding: "4px 12px" }}>
              <Star style={{ width: 13, height: 13, fill: GOLD, color: GOLD }} />
              <span style={{ fontSize: 13, fontWeight: 800, color: G }}>{existingSub.grade} / {a.max_score ?? 100}</span>
              <span style={{ fontSize: 11, color: TMID }}>pts</span>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className="asm-tab"
              style={{ flex: 1, padding: "12px 8px", border: "none", background: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, color: activeTab === tab.key ? G : TLIT, borderBottom: `2px solid ${activeTab === tab.key ? G : "transparent"}` }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>

          {/* ─── DETAILS tab ─────────────────────────────── */}
          {activeTab === "details" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {readOnly && (
                <div style={{ background: "#fff5f5", border: "1px solid #fca5a5", borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                  <Lock style={{ width: 16, height: 16, color: "#c0392b", flexShrink: 0 }} />
                  <p style={{ fontSize: 13, fontWeight: 700, color: "#c0392b", margin: 0 }}>
                    {t("The deadline has passed — you can view your submission but can no longer change it.", "لقد انتهى الموعد النهائي — يمكنك مشاهدة إجابتك لكن لا يمكنك تغييرها بعد الآن.")}
                  </p>
                </div>
              )}
              {desc && (
                <div style={{ background: "#f8fafb", border: `1px solid ${BORDER}`, borderRadius: 14, padding: "14px 16px" }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: TLIT, margin: "0 0 6px", textTransform: "uppercase", letterSpacing: ".5px" }}>{t("Instructions", "التعليمات")}</p>
                  <p style={{ fontSize: 14, color: TXT, margin: 0, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{desc}</p>
                </div>
              )}
              {question && (
                <div style={{ background: `${G}08`, border: `1px solid ${G}20`, borderRadius: 14, padding: "14px 16px" }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: G, margin: "0 0 6px", textTransform: "uppercase", letterSpacing: ".5px" }}>{t("Question", "السؤال")}</p>
                  <p style={{ fontSize: 14, color: TXT, margin: 0, lineHeight: 1.65, whiteSpace: "pre-wrap", fontWeight: 600 }}>{question}</p>
                </div>
              )}
              {/* Attachment from teacher */}
              {a.file_url && (
                <AttachmentRow url={a.file_url} label={t("Teacher's Attachment", "مرفق المعلم")} />
              )}
              {/* Meta info */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  { label: t("Max Score", "أعلى درجة"),  value: `${a.max_score ?? 100} pts` },
                  { label: t("Subject", "المادة"),        value: subjTitle || "—" },
                  { label: t("Deadline", "الموعد"),       value: a.deadline ? fmtDate(a.deadline) : t("No deadline", "بدون موعد") },
                  { label: t("Allows", "يقبل"),           value: [a.allow_text !== false && t("Text","نص"), a.allow_file !== false && t("File","ملف"), a.allow_audio !== false && t("Audio","صوت")].filter(Boolean).join(" · ") },
                ].map((m, i) => (
                  <div key={i} style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "10px 14px" }}>
                    <p style={{ fontSize: 10, color: TLIT, margin: "0 0 3px", fontWeight: 700 }}>{m.label}</p>
                    <p style={{ fontSize: 13, color: TXT, margin: 0, fontWeight: 700 }}>{m.value}</p>
                  </div>
                ))}
              </div>
              {!submitted && !closed && !readOnly && (
                <button onClick={() => setActiveTab("submit")}
                  className="asm-btn"
                  style={{ width: "100%", padding: "14px", borderRadius: 14, border: "none", background: `linear-gradient(135deg, ${G}, ${MG})`, color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
                  {t("Start Submission →", "ابدأ التسليم →")}
                </button>
              )}
            </div>
          )}

          {/* ─── SUBMIT tab ──────────────────────────────── */}
          {activeTab === "submit" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {submitted && !isGraded && (
                <div style={{ background: "#eff6ff", border: "1px solid #93c5fd", borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                  <CheckCircle style={{ width: 16, height: 16, color: "#1d4ed8" }} />
                  <p style={{ fontSize: 13, fontWeight: 700, color: "#1d4ed8", margin: 0 }}>{t("Submitted! You can still update your answer.", "تم التسليم! يمكنك تحديث إجابتك.")}</p>
                </div>
              )}
              {isGraded && (
                <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                  <Award style={{ width: 16, height: 16, color: "#276749" }} />
                  <p style={{ fontSize: 13, fontWeight: 700, color: "#276749", margin: 0 }}>{t("This assignment has been graded.", "تم تصحيح هذا الواجب.")}</p>
                </div>
              )}

              {/* Text response */}
              {a.allow_text !== false && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: TLIT, display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <FileText style={{ width: 13, height: 13 }} />{t("Text Answer", "الإجابة النصية")}
                  </label>
                  <textarea
                    value={textInput}
                    onChange={e => setTextInput(e.target.value)}
                    disabled={isGraded}
                    placeholder={t("Write your answer here…", "اكتب إجابتك هنا…")}
                    rows={6}
                    style={{ width: "100%", borderRadius: 12, border: `1px solid ${BORDER}`, padding: "12px 14px", fontSize: 14, color: TXT, resize: "vertical", outline: "none", fontFamily: "'Cairo', sans-serif", background: isGraded ? "#f8f8f8" : "#fff", boxSizing: "border-box" }}
                  />
                </div>
              )}

              {/* File upload */}
              {a.allow_file !== false && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: TLIT, display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <Paperclip style={{ width: 13, height: 13 }} />{t("Attach Files", "إرفاق ملفات")}
                  </label>
                  <input type="file" multiple ref={fileRef} onChange={handleFileChange} style={{ display: "none" }} accept={CLASSWORK_ACCEPT} />
                  {keptExistingUrls.map((url, i) => (
                    <div key={url} style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ flex: 1 }}>
                        <AttachmentRow url={url} label={t(`Your submitted file ${i + 1}`, `الملف الذي أرسلته ${i + 1}`)} />
                      </div>
                      {!isGraded && (
                        <button onClick={() => removeExistingFileUrl(url)} type="button"
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#888", padding: 4 }}>
                          <X style={{ width: 13, height: 13 }} />
                        </button>
                      )}
                    </div>
                  ))}
                  {files.map((f, i) => (
                    <div key={`${f.name}-${i}`} style={{ background: "#eff6ff", border: "1px solid #93c5fd", borderRadius: 10, padding: "10px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                      <Paperclip style={{ width: 14, height: 14, color: "#1d4ed8" }} />
                      <span style={{ fontSize: 12, color: "#1d4ed8", fontWeight: 700, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                      <button onClick={() => removeNewFile(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "#888", padding: 0 }}><X style={{ width: 13, height: 13 }} /></button>
                    </div>
                  ))}
                  {!isGraded && (
                    <button onClick={() => fileRef.current?.click()}
                      style={{ width: "100%", padding: "11px", borderRadius: 12, border: `2px dashed ${BORDER}`, background: "#f8fafb", cursor: "pointer", fontSize: 13, fontWeight: 700, color: TMID, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                      <Upload style={{ width: 15, height: 15 }} />
                      {t("Choose file(s)", "اختر ملفاً/ملفات")}
                    </button>
                  )}
                </div>
              )}

              {/* Audio recorder */}
              {a.allow_audio !== false && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: TLIT, display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    <Mic style={{ width: 13, height: 13 }} />{t("Voice Recording", "التسجيل الصوتي")}
                  </label>

                  {/* Existing audio */}
                  {existingSub?.audio_url && !audioBlob && (
                    <ExistingAudioPlayer url={existingSub.audio_url} label={t("Your recorded answer", "تسجيلك الصوتي")} />
                  )}

                  {/* New recording UI */}
                  {!isGraded && (
                    <div style={{ background: "#f8fafb", border: `1px solid ${BORDER}`, borderRadius: 14, padding: "16px" }}>
                      {!recording && !audioBlob && (
                        <button onClick={startRecording}
                          style={{ width: "100%", padding: "13px", borderRadius: 12, border: "none", background: `linear-gradient(135deg, #c0392b, #e74c3c)`, color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                          <Mic style={{ width: 16, height: 16 }} />
                          {t("Start Recording", "ابدأ التسجيل")}
                        </button>
                      )}
                      {recording && (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                          <div style={{ width: 60, height: 60, borderRadius: "50%", background: "rgba(192,57,43,0.1)", border: "2px solid #c0392b", display: "flex", alignItems: "center", justifyContent: "center", animation: "livePulse 1.2s infinite" }}>
                            <Mic style={{ width: 26, height: 26, color: "#c0392b" }} />
                          </div>
                          <p style={{ fontSize: 22, fontWeight: 900, color: "#c0392b", margin: 0, fontVariantNumeric: "tabular-nums" }}>{fmtSecs(recordSeconds)}</p>
                          <p style={{ fontSize: 12, color: TLIT, margin: 0 }}>{t("Recording…", "جارٍ التسجيل…")}</p>
                          <button onClick={stopRecording}
                            style={{ padding: "10px 24px", borderRadius: 12, border: "none", background: "#111", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                            <StopCircle style={{ width: 15, height: 15 }} />{t("Stop", "إيقاف")}
                          </button>
                        </div>
                      )}
                      {audioBlob && audioUrl && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          <audio ref={audioRef} src={audioUrl} onEnded={() => setPlaying(false)} style={{ display: "none" }} />
                          <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", borderRadius: 12, padding: "10px 14px", border: `1px solid ${BORDER}` }}>
                            <button onClick={togglePlay} style={{ width: 36, height: 36, borderRadius: "50%", background: G, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              {playing ? <Pause style={{ width: 15, height: 15, color: "#fff" }} /> : <Play style={{ width: 15, height: 15, color: "#fff" }} />}
                            </button>
                            <div style={{ flex: 1 }}>
                              <p style={{ fontSize: 12, fontWeight: 700, color: TXT, margin: 0 }}>{t("Recording ready", "التسجيل جاهز")}</p>
                              <p style={{ fontSize: 11, color: TLIT, margin: 0 }}>{fmtSecs(recordSeconds)}</p>
                            </div>
                            <button onClick={clearAudio} style={{ background: "none", border: "none", cursor: "pointer", color: "#999", padding: 4 }}>
                              <RotateCcw style={{ width: 14, height: 14 }} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Error */}
              {error && (
                <div style={{ background: "#fff5f5", border: "1px solid #fca5a5", borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8 }}>
                  <AlertTriangle style={{ width: 14, height: 14, color: "#c0392b" }} />
                  <p style={{ fontSize: 13, color: "#c0392b", margin: 0 }}>{error}</p>
                </div>
              )}

              {/* Submit button */}
              {!isGraded && (
                <button onClick={handleSubmit} disabled={submitting || uploading}
                  className="asm-btn"
                  style={{ width: "100%", padding: "14px", borderRadius: 14, border: "none", background: submitting ? "#ccc" : `linear-gradient(135deg, ${G}, ${MG})`, color: "#fff", fontSize: 14, fontWeight: 800, cursor: submitting ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  {submitting ? <Loader2 style={{ width: 16, height: 16, animation: "spin .7s linear infinite" }} /> : <Send style={{ width: 15, height: 15 }} />}
                  {uploading ? t("Uploading…", "جارٍ الرفع…") : submitting ? t("Submitting…", "جارٍ الإرسال…") : submitted ? t("Update Submission", "تحديث الإجابة") : t("Submit Assignment", "إرسال الواجب")}
                </button>
              )}
            </div>
          )}

          {/* ─── FEEDBACK tab ──────────────────────────── */}
          {activeTab === "feedback" && existingSub && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Grade */}
              {existingSub.grade != null && (
                <div style={{ background: `linear-gradient(135deg, ${G}, ${MG})`, borderRadius: 16, padding: "16px 20px", display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ width: 56, height: 56, borderRadius: "50%", background: GOLD, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: 18, fontWeight: 900, color: G }}>{existingSub.grade}</span>
                  </div>
                  <div>
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,.6)", margin: "0 0 2px" }}>{t("Your Score", "درجتك")}</p>
                    <p style={{ fontSize: 20, fontWeight: 900, color: "#fff", margin: 0 }}>{existingSub.grade} / {a.max_score ?? 100}</p>
                    <p style={{ fontSize: 11, color: GOLDF, margin: "2px 0 0" }}>
                      {Math.round((existingSub.grade / (a.max_score ?? 100)) * 100)}%
                    </p>
                  </div>
                </div>
              )}

              {/* Written feedback */}
              {existingSub.feedback && (
                <div style={{ background: "#f8fafb", border: `1px solid ${BORDER}`, borderRadius: 14, padding: "14px 16px" }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: TLIT, margin: "0 0 6px", textTransform: "uppercase" }}>{t("Teacher's Feedback", "ملاحظات المعلم")}</p>
                  <p style={{ fontSize: 14, color: TXT, margin: 0, lineHeight: 1.65 }}>{existingSub.feedback}</p>
                  {existingSub.graded_at && (
                    <p style={{ fontSize: 11, color: TLIT, margin: "8px 0 0" }}>{fmtDate(existingSub.graded_at)}</p>
                  )}
                </div>
              )}

              {/* Comments thread */}
              <div>
                <p style={{ fontSize: 13, fontWeight: 800, color: TXT, margin: "0 0 10px", display: "flex", alignItems: "center", gap: 6 }}>
                  <MessageSquare style={{ width: 14, height: 14, color: TMID }} />{t("Comments", "التعليقات")}
                </p>
                {comments.length === 0 ? (
                  <p style={{ fontSize: 13, color: TLIT, textAlign: "center", padding: "16px 0" }}>{t("No comments yet.", "لا توجد تعليقات بعد.")}</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {comments.map((c: any) => {
                      const isMe = c.author_id === existingSub.user_id;
                      return (
                        <div key={c.id} style={{ display: "flex", gap: 8, flexDirection: isMe ? "row-reverse" : "row" }}>
                          <div style={{ width: 28, height: 28, borderRadius: "50%", background: isMe ? G : "#f0f0f0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <span style={{ fontSize: 11, fontWeight: 800, color: isMe ? "#fff" : TXT }}>
                              {(c.profiles?.full_name || "?")[0].toUpperCase()}
                            </span>
                          </div>
                          <div style={{ maxWidth: "75%" }}>
                            <div style={{ background: isMe ? G : "#f4f4f4", borderRadius: isMe ? "14px 4px 14px 14px" : "4px 14px 14px 14px", padding: "8px 12px" }}>
                              <p style={{ fontSize: 13, color: isMe ? "#fff" : TXT, margin: 0, lineHeight: 1.5 }}>{c.body}</p>
                            </div>
                            <p style={{ fontSize: 10, color: TLIT, margin: "3px 4px 0", textAlign: isMe ? "right" : "left" }}>
                              {c.profiles?.full_name || "?"} · {fmtDate(c.created_at)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Comment input */}
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); postComment(); } }}
                  placeholder={t("Ask a question or leave a comment…", "اسأل أو اترك تعليقاً…")}
                  style={{ flex: 1, height: 40, borderRadius: 12, border: `1px solid ${BORDER}`, padding: "0 14px", fontSize: 13, color: TXT, outline: "none" }}
                />
                <button onClick={postComment} disabled={!commentText.trim()}
                  style={{ width: 40, height: 40, borderRadius: 12, border: "none", background: commentText.trim() ? G : "#ddd", cursor: commentText.trim() ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Send style={{ width: 15, height: 15, color: "#fff" }} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Small helper components ─────────────────────────── */
/* Shows an attachment inline (image / PDF preview in-place) instead of
   sending the person to another browser tab. Other file types (docx, etc.)
   can't be previewed by the browser either way, so those fall back to a
   direct download — still no new tab. */
/* Every format a student may upload as classwork (the storage bucket itself accepts any type, 50 MB max). */
export const CLASSWORK_ACCEPT = [
  "image/*", "video/*", "audio/*", ".pdf",
  ".doc", ".docx", ".odt", ".rtf", ".txt", ".md",
  ".xls", ".xlsx", ".ods", ".csv", ".ppt", ".pptx", ".odp",
  ".zip", ".rar", ".7z", ".json", ".html", ".htm", ".epub",
  ".heic", ".heif", ".webp", ".svg", ".m4a", ".mp3", ".wav", ".ogg", ".opus", ".aac", ".mp4", ".mov", ".webm", ".mkv",
  "application/*", "text/*",
].join(",");
export const CLASSWORK_MAX_MB = 50;
const contentTypeForClasswork = (f: File): string => {
  const ext = (f.name.split(".").pop() || "").toLowerCase();
  const m: Record<string, string> = {
    pdf: "application/pdf", doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    csv: "text/csv", txt: "text/plain", md: "text/markdown", json: "application/json", zip: "application/zip",
    heic: "image/heic", heif: "image/heif", m4a: "audio/mp4", opus: "audio/ogg",
  };
  return f.type || m[ext] || "application/octet-stream";
};

function getExt(url: string) {
  return (url.split("?")[0].split(".").pop() || "").toLowerCase();
}
const IMAGE_EXTS = ["png", "jpg", "jpeg", "gif", "webp", "svg"];

function AttachmentRow({ url, label }: { url: string; label: string }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => { getSignedUrl(url, 3600).then(u => setSignedUrl(u)); }, [url]);
  if (!signedUrl) return null;
  const ext = getExt(url);
  const isImage = IMAGE_EXTS.includes(ext);
  const isPdf = ext === "pdf";
  const previewable = isImage || isPdf;

  return (
    <div style={{ border: "1px solid #93c5fd", borderRadius: 12, overflow: "hidden", background: "#eff6ff" }}>
      <button onClick={() => previewable && setExpanded(v => !v)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "none", border: "none", cursor: previewable ? "pointer" : "default", textAlign: "left" }}>
        <Download style={{ width: 15, height: 15, color: "#1d4ed8", flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: "#1d4ed8", flex: 1 }}>{label}</span>
        {(!previewable || imgFailed) && (
          <a href={signedUrl} download onClick={e => e.stopPropagation()}
            style={{ fontSize: 11, fontWeight: 700, color: "#1d4ed8", textDecoration: "underline" }}>
            Download
          </a>
        )}
      </button>
      {previewable && expanded && (
        isImage
          ? (imgFailed
              ? <div style={{ padding: "14px", fontSize: 12, color: "#b91c1c", background: "#fef2f2", borderTop: "1px solid #fecaca" }}>
                  Couldn't load this image — the file link may be broken. Use Download above instead.
                </div>
              : <img src={signedUrl} alt={label} onError={() => setImgFailed(true)} style={{ width: "100%", display: "block", maxHeight: 420, objectFit: "contain", background: "#000" }} />)
          : <iframe src={signedUrl} title={label} style={{ width: "100%", height: 420, border: "none", display: "block" }} />
      )}
    </div>
  );
}

function ExistingAudioPlayer({ url, label }: { url: string; label: string }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const ref = useRef<HTMLAudioElement | null>(null);
  useEffect(() => { getSignedUrl(url, 3600).then(u => setSignedUrl(u)); }, [url]);
  if (!signedUrl) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 12, padding: "10px 14px", marginBottom: 8 }}>
      <audio ref={ref} src={signedUrl} onEnded={() => setPlaying(false)} style={{ display: "none" }} />
      <button onClick={() => { if (playing) { ref.current?.pause(); setPlaying(false); } else { ref.current?.play(); setPlaying(true); } }}
        style={{ width: 34, height: 34, borderRadius: "50%", background: "#276749", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {playing ? <Pause style={{ width: 14, height: 14, color: "#fff" }} /> : <Play style={{ width: 14, height: 14, color: "#fff" }} />}
      </button>
      <span style={{ fontSize: 12, fontWeight: 700, color: "#276749" }}>{label}</span>
    </div>
  );
}
