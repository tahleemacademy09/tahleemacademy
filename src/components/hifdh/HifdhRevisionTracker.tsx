// src/components/hifdh/HifdhRevisionTracker.tsx
// Teacher / Admin panel — two tabs:
//   1. "Assign"  — assign a revision plan to a student
//   2. "Activity" — see all students' completed pages, scores, transcripts + Acknowledge

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Users, BookOpen, CheckCircle2, Clock, BadgeCheck,
  ChevronDown, ChevronUp, Search, Calendar, Loader2,
  Star, StickyNote, RefreshCcw, Send, X, AlertTriangle,
  BarChart3, Award, Mic, Eye, EyeOff,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ── constants ────────────────────────────────────────────────────────────────
const GOLD       = "#c9a84c";
const DG         = "#0f2d1f";
const DG2        = "#1a4030";
const LIGHT_TEXT = "#d4c9a8";
const W          = "#ffffff";

type SelectMode = "juz" | "hizb" | "surah";

const SURAHS_AR: Record<number, string> = {
  1:"الفاتحة",2:"البقرة",3:"آل عمران",4:"النساء",5:"المائدة",
  6:"الأنعام",7:"الأعراف",8:"الأنفال",9:"التوبة",10:"يونس",
  11:"هود",12:"يوسف",13:"الرعد",14:"إبراهيم",15:"الحجر",
  16:"النحل",17:"الإسراء",18:"الكهف",19:"مريم",20:"طه",
  21:"الأنبياء",22:"الحج",23:"المؤمنون",24:"النور",25:"الفرقان",
  26:"الشعراء",27:"النمل",28:"القصص",29:"العنكبوت",30:"الروم",
  31:"لقمان",32:"السجدة",33:"الأحزاب",34:"سبأ",35:"فاطر",
  36:"يس",37:"الصافات",38:"ص",39:"الزمر",40:"غافر",
  41:"فصلت",42:"الشورى",43:"الزخرف",44:"الدخان",45:"الجاثية",
  46:"الأحقاف",47:"محمد",48:"الفتح",49:"الحجرات",50:"ق",
  51:"الذاريات",52:"الطور",53:"النجم",54:"القمر",55:"الرحمن",
  56:"الواقعة",57:"الحديد",58:"المجادلة",59:"الحشر",60:"الممتحنة",
  61:"الصف",62:"الجمعة",63:"المنافقون",64:"التغابن",65:"الطلاق",
  66:"التحريم",67:"الملك",68:"القلم",69:"الحاقة",70:"المعارج",
  71:"نوح",72:"الجن",73:"المزمل",74:"المدثر",75:"القيامة",
  76:"الإنسان",77:"المرسلات",78:"النبأ",79:"النازعات",80:"عبس",
  81:"التكوير",82:"الانفطار",83:"المطففين",84:"الانشقاق",85:"البروج",
  86:"الطارق",87:"الأعلى",88:"الغاشية",89:"الفجر",90:"البلد",
  91:"الشمس",92:"الليل",93:"الضحى",94:"الشرح",95:"التين",
  96:"العلق",97:"القدر",98:"البينة",99:"الزلزلة",100:"العاديات",
  101:"القارعة",102:"التكاثر",103:"العصر",104:"الهمزة",105:"الفيل",
  106:"قريش",107:"الماعون",108:"الكوثر",109:"الكافرون",110:"النصر",
  111:"المسد",112:"الإخلاص",113:"الفلق",114:"الناس",
};

const toAr = (n: number) =>
  String(n).replace(/[0-9]/g, d => "٠١٢٣٤٥٦٧٨٩"[+d]);

const scoreColor = (s: number) => {
  if (s >= 85) return { bg: "#dcfce7", text: "#166534", border: "#16a34a" };
  if (s >= 70) return { bg: "#fef9c3", text: "#854d0e", border: "#ca8a04" };
  if (s >= 50) return { bg: "#ffedd5", text: "#9a3412", border: "#ea580c" };
  return { bg: "#fee2e2", text: "#991b1b", border: "#dc2626" };
};

// ── types ────────────────────────────────────────────────────────────────────
interface StudentProfile {
  user_id: string;
  full_name: string;
  email: string;
  memorized_surahs: string[] | null;
}

interface Assignment {
  id: string;
  student_id: string;
  mode: SelectMode;
  selected: number[];
  daily_pages: number;
  reciter: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
}

interface PageLog {
  id: string;
  student_id: string;
  date: string;
  page_number: number;
  score: number | null;
  exercise_score: number | null;
  attempts: number | null;
  error_count: number | null;
  duration_seconds: number | null;
  transcript: string | null;
  status: string;
  teacher_acknowledged: boolean;
  teacher_id: string | null;
  acknowledged_at: string | null;
  teacher_feedback: string | null;
  created_at: string;
  // joined
  student_name?: string;
  student_email?: string;
}

interface StudentGroup {
  student_id: string;
  student_name: string;
  student_email: string;
  assignment: Assignment | null;
  logs: PageLog[];
  todayCount: number;
  unacknowledged: number;
  avgScore: number;
}

const RECITERS = [
  { id: "Alafasy_128kbps",               name: "مشاري العفاسي"    },
  { id: "Abdurrahmaan_As-Sudais_192kbps", name: "السديس"            },
  { id: "Husary_128kbps",                 name: "الحصري"            },
  { id: "Minshawy_Murattal_128kbps",      name: "المنشاوي"          },
  { id: "Abu_Bakr_Ash-Shaatree_128kbps",  name: "أبو بكر الشاطري"  },
  { id: "AbdulSamad_128kbps",             name: "عبد الباسط"        },
];

const DAILY_OPTS = [
  { val: 0.5, en: "½ page"  },
  { val: 1,   en: "1 page"  },
  { val: 2,   en: "2 pages" },
  { val: 3,   en: "3 pages" },
  { val: 5,   en: "5 pages" },
  { val: 7,   en: "7 pages" },
  { val: 10,  en: "10 pages"},
];

// ═══════════════════════════════════════════════════════════════════════
//  COMPONENT
// ═══════════════════════════════════════════════════════════════════════
export default function HifdhRevisionTracker({ role = "teacher" }: { role?: "teacher" | "admin" }) {
  const { toast } = useToast();
  const [tab, setTab]             = useState<"activity" | "assign">("activity");
  const [myId, setMyId]           = useState<string | null>(null);

  // ── Activity tab state ─────────────────────────────────────────────
  const [groups, setGroups]       = useState<StudentGroup[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split("T")[0]);
  const [expanded, setExpanded]   = useState<string | null>(null);
  const [feedbacks, setFeedbacks] = useState<Record<string, string>>({});
  const [saving, setSaving]       = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState<string | null>(null);

  // ── Assign tab state ───────────────────────────────────────────────
  const [students, setStudents]   = useState<StudentProfile[]>([]);
  const [assignments, setAssignments] = useState<Record<string, Assignment>>({});
  const [selectedStudent, setSelectedStudent] = useState<StudentProfile | null>(null);
  const [assignMode, setAssignMode] = useState<SelectMode>("juz");
  const [assignSelected, setAssignSelected] = useState<number[]>([]);
  const [assignPages, setAssignPages] = useState<number>(1);
  const [assignReciter, setAssignReciter] = useState("Alafasy_128kbps");
  const [assignNotes, setAssignNotes] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");

  // ── Load teacher ID ────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setMyId(data.user.id);
    });
  }, []);

  // ═══ Load activity feed ════════════════════════════════════════════
  const loadActivity = useCallback(async () => {
    setLoading(true);

    // Fetch page logs for the selected date
    let q = (supabase as any)
      .from("hifdh_page_logs")
      .select("*")
      .eq("date", dateFilter)
      .order("created_at", { ascending: false })
      .limit(500);

    const { data: logData } = await q;
    const logs: PageLog[] = logData ?? [];

    // Fetch active assignments
    const { data: asgnData } = await (supabase as any)
      .from("hifdh_assignments")
      .select("*")
      .eq("active", true);
    const asgnMap: Record<string, Assignment> = {};
    (asgnData ?? []).forEach((a: Assignment) => { asgnMap[a.student_id] = a; });
    setAssignments(asgnMap);

    // Collect unique student IDs from both sources
    const logIds  = logs.map(l => l.student_id);
    const asgnIds = (asgnData ?? []).map((a: Assignment) => a.student_id);
    const allIds  = [...new Set([...logIds, ...asgnIds])];

    if (allIds.length === 0) { setGroups([]); setLoading(false); return; }

    // Fetch student profiles
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id,full_name,email")
      .in("user_id", allIds);

    const pmap: Record<string, { name: string; email: string }> = {};
    (profiles ?? []).forEach((p: any) => {
      pmap[p.user_id] = { name: p.full_name ?? "Student", email: p.email ?? "" };
    });

    // Group logs by student
    const byStudent: Record<string, PageLog[]> = {};
    logs.forEach(l => {
      const enriched = { ...l, student_name: pmap[l.student_id]?.name, student_email: pmap[l.student_id]?.email };
      if (!byStudent[l.student_id]) byStudent[l.student_id] = [];
      byStudent[l.student_id].push(enriched);
    });

    // Build groups (include students with assignments but no logs today)
    const grouped: StudentGroup[] = allIds.map(sid => {
      const sLogs = byStudent[sid] ?? [];
      const scores = sLogs.map(l => l.score ?? 0).filter(s => s > 0);
      return {
        student_id:     sid,
        student_name:   pmap[sid]?.name   ?? "Student",
        student_email:  pmap[sid]?.email  ?? "",
        assignment:     asgnMap[sid]       ?? null,
        logs:           sLogs,
        todayCount:     sLogs.length,
        unacknowledged: sLogs.filter(l => !l.teacher_acknowledged).length,
        avgScore:       scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
      };
    });

    // Sort: unacknowledged first, then active today, then assigned-only
    grouped.sort((a, b) =>
      b.unacknowledged - a.unacknowledged ||
      b.todayCount - a.todayCount ||
      a.student_name.localeCompare(b.student_name)
    );

    setGroups(grouped);

    // Pre-fill feedback map
    const fb: Record<string, string> = {};
    logs.forEach(l => { fb[l.id] = l.teacher_feedback ?? ""; });
    setFeedbacks(fb);

    setLoading(false);
  }, [dateFilter]);

  useEffect(() => { loadActivity(); }, [loadActivity]);

  // ═══ Load students for Assign tab ══════════════════════════════════
  const loadStudents = useCallback(async () => {
    const { data } = await supabase
      .from("profiles")
      .select("user_id,full_name,email,memorized_surahs")
      .eq("role", "student")
      .order("full_name");
    setStudents((data as StudentProfile[]) ?? []);
  }, []);

  useEffect(() => { if (tab === "assign") loadStudents(); }, [tab, loadStudents]);

  // ═══ Acknowledge a single log ══════════════════════════════════════
  const acknowledge = async (log: PageLog) => {
    if (!myId) return;
    setSaving(log.id);
    const { error } = await (supabase as any)
      .from("hifdh_page_logs")
      .update({
        teacher_acknowledged: true,
        teacher_id:           myId,
        acknowledged_at:      new Date().toISOString(),
        teacher_feedback:     feedbacks[log.id] ?? null,
      })
      .eq("id", log.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Acknowledged ✅", description: `Page ${log.page_number} acknowledged.` });
      setGroups(prev => prev.map(g => ({
        ...g,
        logs: g.logs.map(l => l.id === log.id ? { ...l, teacher_acknowledged: true } : l),
        unacknowledged: g.logs.filter(l => l.id !== log.id && !l.teacher_acknowledged).length,
      })));
    }
    setSaving(null);
  };

  // ═══ Acknowledge all unreviewed logs for a student ═════════════════
  const acknowledgeAll = async (group: StudentGroup) => {
    if (!myId) return;
    const ids = group.logs.filter(l => !l.teacher_acknowledged).map(l => l.id);
    if (!ids.length) return;
    setSaving(group.student_id);
    const { error } = await (supabase as any)
      .from("hifdh_page_logs")
      .update({ teacher_acknowledged: true, teacher_id: myId, acknowledged_at: new Date().toISOString() })
      .in("id", ids);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "All acknowledged ✅", description: `${group.student_name}'s pages reviewed.` });
      await loadActivity();
    }
    setSaving(null);
  };

  // ═══ Save / update assignment ══════════════════════════════════════
  const saveAssignment = async () => {
    if (!selectedStudent || assignSelected.length === 0 || !myId) return;
    setAssigning(true);

    // Deactivate existing assignment first
    await (supabase as any)
      .from("hifdh_assignments")
      .update({ active: false })
      .eq("student_id", selectedStudent.user_id)
      .eq("active", true);

    const { error } = await (supabase as any)
      .from("hifdh_assignments")
      .insert({
        student_id:  selectedStudent.user_id,
        assigned_by: myId,
        mode:        assignMode,
        selected:    assignSelected,
        daily_pages: assignPages,
        reciter:     assignReciter,
        notes:       assignNotes.trim() || null,
        active:      true,
      });

    if (error) {
      toast({ title: "Error saving assignment", description: error.message, variant: "destructive" });
    } else {
      toast({
        title: "Assignment saved! 📖",
        description: `${selectedStudent.full_name}'s revision plan updated.`,
      });
      setSelectedStudent(null);
      setAssignSelected([]);
      setAssignNotes("");
      loadStudents();
      // Also refresh assignments map
      const { data } = await (supabase as any)
        .from("hifdh_assignments")
        .select("*")
        .eq("active", true);
      const map: Record<string, Assignment> = {};
      (data ?? []).forEach((a: Assignment) => { map[a.student_id] = a; });
      setAssignments(map);
    }
    setAssigning(false);
  };

  // ═══ Remove assignment ══════════════════════════════════════════════
  const removeAssignment = async (studentId: string, studentName: string) => {
    if (!confirm(`Remove ${studentName}'s active revision assignment?`)) return;
    await (supabase as any)
      .from("hifdh_assignments")
      .update({ active: false })
      .eq("student_id", studentId)
      .eq("active", true);
    toast({ title: "Assignment removed", description: `${studentName}'s plan has been cleared.` });
    loadStudents();
    setAssignments(prev => { const n = { ...prev }; delete n[studentId]; return n; });
  };

  // ── Stats ─────────────────────────────────────────────────────────
  const totalStudents  = groups.length;
  const activeToday    = groups.filter(g => g.todayCount > 0).length;
  const totalPages     = groups.reduce((s, g) => s + g.todayCount, 0);
  const totalUnack     = groups.reduce((s, g) => s + g.unacknowledged, 0);
  const assignedCount  = Object.keys(assignments).length;

  const filteredGroups = groups.filter(g =>
    !search ||
    g.student_name.toLowerCase().includes(search.toLowerCase()) ||
    g.student_email.toLowerCase().includes(search.toLowerCase())
  );

  const filteredStudents = students.filter(s =>
    !studentSearch ||
    s.full_name?.toLowerCase().includes(studentSearch.toLowerCase()) ||
    s.email?.toLowerCase().includes(studentSearch.toLowerCase())
  );

  // ═══════════════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════════════
  return (
    <div
      style={{
        minHeight: "100vh",
        background: `linear-gradient(160deg, ${DG} 0%, #0d1a0f 60%, #111008 100%)`,
        paddingBottom: 80,
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          position: "sticky", top: 0, zIndex: 20,
          background: DG, borderBottom: `1px solid ${GOLD}22`,
          padding: "14px 16px 0",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: GOLD, letterSpacing: 1 }}>متابعة الحفظ</p>
            <h2 style={{ fontSize: 18, fontWeight: 900, color: W, margin: 0 }}>Hifdh Tracker</h2>
          </div>
          <button
            onClick={loadActivity}
            disabled={loading}
            style={{ padding: 8, borderRadius: 10, background: "#1a3a25", border: "none", cursor: "pointer" }}
          >
            <RefreshCcw size={16} style={{ color: GOLD, animation: loading ? "spin 1s linear infinite" : "none" }} />
          </button>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 4 }}>
          {(["activity", "assign"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1, padding: "10px 4px", border: "none", cursor: "pointer",
                fontWeight: 800, fontSize: 13, borderRadius: "10px 10px 0 0",
                background: tab === t ? "#0a2d1a" : "transparent",
                color: tab === t ? GOLD : "#5a8a6a",
                borderBottom: tab === t ? `2px solid ${GOLD}` : "2px solid transparent",
                transition: "all .2s",
              }}
            >
              {t === "activity" ? "📋 Activity" : "✍️ Assign"}
            </button>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          TAB: ACTIVITY
      ══════════════════════════════════════════════════════════ */}
      {tab === "activity" && (
        <div style={{ padding: "14px 16px" }}>

          {/* Summary strip */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
            {[
              { icon: Users,        label: "Active",    value: `${activeToday}/${totalStudents}`, color: GOLD        },
              { icon: BookOpen,     label: "Pages",     value: String(totalPages),                color: "#60a5fa"   },
              { icon: CheckCircle2, label: "Assigned",  value: String(assignedCount),             color: "#22c55e"   },
              { icon: AlertTriangle,label: "Unack",     value: String(totalUnack),                color: "#f59e0b"   },
            ].map(s => (
              <div key={s.label}
                style={{ background: "#0a2d1a", borderRadius: 10, padding: "10px 6px", textAlign: "center" }}
              >
                <s.icon size={14} style={{ color: s.color, margin: "0 auto 3px" }} />
                <p style={{ fontSize: 14, fontWeight: 900, color: s.color, margin: 0 }}>{s.value}</p>
                <p style={{ fontSize: 10, color: LIGHT_TEXT, margin: 0 }}>{s.label}</p>
              </div>
            ))}
          </div>

          {/* Date + search */}
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <div style={{ flex: 1, position: "relative" }}>
              <Calendar size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: GOLD }} />
              <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
                style={{ width: "100%", paddingLeft: 32, paddingRight: 10, paddingTop: 9, paddingBottom: 9,
                  borderRadius: 10, background: "#0a2010", border: `1px solid ${GOLD}33`,
                  color: W, fontSize: 13, outline: "none", boxSizing: "border-box" as const }} />
            </div>
            <div style={{ flex: 1, position: "relative" }}>
              <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: GOLD }} />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search student..."
                style={{ width: "100%", paddingLeft: 32, paddingRight: 10, paddingTop: 9, paddingBottom: 9,
                  borderRadius: 10, background: "#0a2010", border: `1px solid ${GOLD}33`,
                  color: W, fontSize: 13, outline: "none", boxSizing: "border-box" as const }} />
            </div>
          </div>

          {/* Student groups */}
          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
              <Loader2 size={30} style={{ color: GOLD, animation: "spin 1s linear infinite" }} />
            </div>
          ) : filteredGroups.length === 0 ? (
            <div style={{ textAlign: "center", padding: 48, color: LIGHT_TEXT }}>
              <BookOpen size={40} style={{ color: GOLD, margin: "0 auto 12px" }} />
              <p style={{ fontWeight: 700, color: W, margin: "0 0 6px" }}>No activity found</p>
              <p style={{ fontSize: 13 }}>No students have completed pages for this date yet.</p>
            </div>
          ) : filteredGroups.map(group => {
            const isOpen   = expanded === group.student_id;
            const asgn     = group.assignment;
            const sc       = group.avgScore > 0 ? scoreColor(group.avgScore) : null;
            const isSaving = saving === group.student_id;

            return (
              <div key={group.student_id}
                style={{
                  borderRadius: 14, overflow: "hidden", marginBottom: 10,
                  background: "#0a2d1a",
                  border: `1px solid ${group.unacknowledged > 0 ? GOLD + "66" : "#1a3a2555"}`,
                }}
              >
                {/* Student header */}
                <button
                  onClick={() => setExpanded(isOpen ? null : group.student_id)}
                  style={{ width: "100%", background: "none", border: "none", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 12, padding: 14, textAlign: "left" as const }}
                >
                  {/* Avatar */}
                  <div style={{
                    width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
                    background: `${GOLD}22`, color: GOLD, fontWeight: 900, fontSize: 16,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {group.student_name[0]?.toUpperCase()}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" as const }}>
                      <span style={{ fontWeight: 700, color: W, fontSize: 14 }}>{group.student_name}</span>
                      {group.unacknowledged > 0 && (
                        <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 999,
                          background: `${GOLD}33`, color: GOLD }}>
                          {group.unacknowledged} to review
                        </span>
                      )}
                      {group.todayCount > 0 && group.unacknowledged === 0 && (
                        <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 999,
                          background: "#22c55e22", color: "#22c55e", display: "flex", alignItems: "center", gap: 3 }}>
                          <BadgeCheck size={10} /> All reviewed
                        </span>
                      )}
                      {!asgn && (
                        <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 999,
                          background: "#55555522", color: "#888" }}>
                          No plan
                        </span>
                      )}
                    </div>

                    <div style={{ display: "flex", gap: 12, marginTop: 4, fontSize: 11, color: LIGHT_TEXT }}>
                      {asgn && (
                        <span>
                          📖 {asgn.mode === "juz" ? `Juz ${asgn.selected.join(",")}` :
                               asgn.mode === "hizb" ? `Hizb ${asgn.selected.join(",")}` :
                               `${asgn.selected.length} surah(s)`}
                          {" · "}{asgn.daily_pages}pg/day
                        </span>
                      )}
                      {group.todayCount > 0 ? (
                        <span style={{ color: sc?.text }}>
                          {group.todayCount} page{group.todayCount !== 1 ? "s" : ""} · avg {group.avgScore}%
                        </span>
                      ) : (
                        <span style={{ color: "#555" }}>No pages today</span>
                      )}
                    </div>
                  </div>

                  {/* Ack all button */}
                  {group.unacknowledged > 0 && (
                    <button
                      onClick={e => { e.stopPropagation(); acknowledgeAll(group); }}
                      disabled={!!saving}
                      style={{ flexShrink: 0, padding: "5px 10px", borderRadius: 8,
                        background: GOLD, color: DG, fontWeight: 800, fontSize: 11,
                        border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                    >
                      {isSaving ? <Loader2 size={11} /> : <CheckCircle2 size={11} />}
                      Ack All
                    </button>
                  )}

                  <span style={{ color: LIGHT_TEXT }}>
                    {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </span>
                </button>

                {/* Expanded logs */}
                {isOpen && (
                  <div style={{ padding: "0 14px 14px", borderTop: `1px solid ${GOLD}22` }}>
                    {group.logs.length === 0 ? (
                      <p style={{ fontSize: 12, color: "#555", textAlign: "center" as const, padding: "12px 0" }}>
                        No pages logged for this date.
                      </p>
                    ) : group.logs.map(log => {
                      const lsc = log.score != null ? scoreColor(log.score) : null;
                      const esc = log.exercise_score != null ? scoreColor(log.exercise_score) : null;
                      const showTx = showTranscript === log.id;
                      const isAck = log.teacher_acknowledged;

                      return (
                        <div key={log.id}
                          style={{
                            borderRadius: 12, padding: 12, marginTop: 10,
                            background: isAck ? "#052e1644" : "#0a1a10",
                            border: `1px solid ${isAck ? "#22c55e33" : GOLD + "33"}`,
                          }}
                        >
                          {/* Log header */}
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" as const }}>
                                <span style={{ fontWeight: 700, color: W, fontSize: 13 }}>
                                  Page {log.page_number}
                                </span>
                                {isAck && <BadgeCheck size={13} style={{ color: "#22c55e" }} />}
                                {log.score != null && (
                                  <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 6,
                                    background: lsc?.bg, color: lsc?.text, fontWeight: 700 }}>
                                    {log.score}% recit.
                                  </span>
                                )}
                                {log.exercise_score != null && (
                                  <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 6,
                                    background: esc?.bg, color: esc?.text, fontWeight: 700 }}>
                                    {log.exercise_score}% ex.
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: 10, color: LIGHT_TEXT, marginTop: 3, display: "flex", gap: 10 }}>
                                {log.attempts && <span>🔄 {log.attempts} attempt{log.attempts !== 1 ? "s" : ""}</span>}
                                {log.error_count != null && <span>⚠️ {log.error_count} errors</span>}
                                {log.duration_seconds && (
                                  <span>⏱ {Math.floor(log.duration_seconds / 60)}m {log.duration_seconds % 60}s</span>
                                )}
                                <span style={{ color: "#555" }}>
                                  {new Date(log.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                                </span>
                              </div>
                            </div>

                            {/* Transcript toggle */}
                            {log.transcript && (
                              <button
                                onClick={() => setShowTranscript(showTx ? null : log.id)}
                                style={{ padding: "4px 8px", borderRadius: 6, background: "#1a3a25",
                                  border: `1px solid ${GOLD}22`, color: GOLD, fontSize: 10,
                                  cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                              >
                                {showTx ? <EyeOff size={11} /> : <Eye size={11} />}
                                {showTx ? "Hide" : "Transcript"}
                              </button>
                            )}
                          </div>

                          {/* Transcript */}
                          {showTx && log.transcript && (
                            <div style={{ borderRadius: 8, padding: "10px 12px", marginBottom: 10,
                              background: "#050e08", border: `1px solid ${GOLD}22`,
                              fontFamily: "'Amiri',serif", direction: "rtl" as const,
                              fontSize: 14, color: LIGHT_TEXT, lineHeight: 2 }}>
                              {log.transcript}
                            </div>
                          )}

                          {/* Already acknowledged feedback */}
                          {isAck && log.teacher_feedback && (
                            <div style={{ borderRadius: 8, padding: "8px 10px", marginBottom: 8,
                              background: "#052e16", color: "#86efac", fontSize: 11,
                              border: "1px solid #22c55e22" }}>
                              <BadgeCheck size={10} style={{ display: "inline", marginRight: 4 }} />
                              {log.teacher_feedback}
                            </div>
                          )}

                          {/* Acknowledge section */}
                          {!isAck && (
                            <div style={{ marginTop: 8, display: "flex", flexDirection: "column" as const, gap: 8 }}>
                              <textarea
                                rows={2}
                                value={feedbacks[log.id] ?? ""}
                                onChange={e => setFeedbacks(prev => ({ ...prev, [log.id]: e.target.value }))}
                                placeholder="Feedback for student (optional)..."
                                style={{ width: "100%", borderRadius: 8, padding: "8px 10px", fontSize: 12,
                                  background: "#0a2010", border: `1px solid ${GOLD}33`, color: W,
                                  resize: "none" as const, outline: "none", boxSizing: "border-box" as const }}
                              />
                              <button
                                onClick={() => acknowledge(log)}
                                disabled={saving === log.id}
                                style={{ padding: "8px 14px", borderRadius: 8, background: GOLD, color: DG,
                                  fontWeight: 800, fontSize: 12, border: "none", cursor: "pointer",
                                  display: "flex", alignItems: "center", gap: 6, alignSelf: "flex-start" as const }}
                              >
                                {saving === log.id
                                  ? <Loader2 size={12} />
                                  : <BadgeCheck size={12} />
                                }
                                Acknowledge
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          TAB: ASSIGN
      ══════════════════════════════════════════════════════════ */}
      {tab === "assign" && (
        <div style={{ padding: "14px 16px" }}>

          {/* Student picker */}
          {!selectedStudent ? (
            <>
              <p style={{ fontSize: 11, color: LIGHT_TEXT, marginBottom: 10 }}>
                Select a student to assign or update their revision plan:
              </p>

              {/* Search */}
              <div style={{ position: "relative", marginBottom: 12 }}>
                <Search size={13} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: GOLD }} />
                <input
                  type="text" value={studentSearch} onChange={e => setStudentSearch(e.target.value)}
                  placeholder="Search students..."
                  style={{ width: "100%", paddingLeft: 34, paddingRight: 12, paddingTop: 10, paddingBottom: 10,
                    borderRadius: 10, background: "#0a2010", border: `1px solid ${GOLD}33`,
                    color: W, fontSize: 13, outline: "none", boxSizing: "border-box" as const }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
                {filteredStudents.map(s => {
                  const asgn = assignments[s.user_id];
                  return (
                    <button key={s.user_id}
                      onClick={() => {
                        setSelectedStudent(s);
                        if (asgn) {
                          setAssignMode(asgn.mode);
                          setAssignSelected(asgn.selected);
                          setAssignPages(asgn.daily_pages);
                          setAssignReciter(asgn.reciter ?? "Alafasy_128kbps");
                          setAssignNotes(asgn.notes ?? "");
                        } else {
                          setAssignMode("juz");
                          setAssignSelected([]);
                          setAssignPages(1);
                          setAssignReciter("Alafasy_128kbps");
                          setAssignNotes("");
                        }
                      }}
                      style={{ background: "#0a2d1a", border: `1px solid ${asgn ? GOLD + "44" : "#1a3a2555"}`,
                        borderRadius: 12, padding: "12px 14px", cursor: "pointer", textAlign: "left" as const,
                        display: "flex", alignItems: "center", gap: 12 }}
                    >
                      <div style={{ width: 36, height: 36, borderRadius: "50%", background: `${GOLD}22`,
                        color: GOLD, fontWeight: 900, fontSize: 15,
                        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {s.full_name?.[0]?.toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontWeight: 700, color: W, margin: 0, fontSize: 14 }}>{s.full_name}</p>
                        <p style={{ fontSize: 11, color: LIGHT_TEXT, margin: "2px 0 0" }}>{s.email}</p>
                        {asgn && (
                          <p style={{ fontSize: 10, color: GOLD, margin: "3px 0 0" }}>
                            📖 {asgn.mode === "juz" ? `Juz ${asgn.selected.join(",")}` :
                                 asgn.mode === "hizb" ? `Hizb ${asgn.selected.join(",")}` :
                                 `${asgn.selected.length} surah(s)`}
                            {" · "}{asgn.daily_pages}pg/day
                          </p>
                        )}
                      </div>
                      {asgn && <BadgeCheck size={16} style={{ color: GOLD, flexShrink: 0 }} />}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            /* ── Assignment Form ── */
            <div>
              {/* Back + student name */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <button onClick={() => setSelectedStudent(null)}
                  style={{ background: "#1a3a25", border: "none", borderRadius: 8, padding: "6px 10px",
                    color: GOLD, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                  ← Back
                </button>
                <div>
                  <p style={{ fontWeight: 800, color: W, margin: 0, fontSize: 15 }}>{selectedStudent.full_name}</p>
                  <p style={{ fontSize: 11, color: LIGHT_TEXT, margin: 0 }}>
                    {assignments[selectedStudent.user_id] ? "Update plan" : "New plan"}
                  </p>
                </div>
              </div>

              {/* Mode selector */}
              <div style={{ background: "#0a2d1a", borderRadius: 14, padding: 14, marginBottom: 12 }}>
                <p style={{ fontSize: 11, fontWeight: 800, color: GOLD, marginBottom: 10, letterSpacing: 1 }}>
                  REVISION SCOPE
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                  {(["juz","hizb","surah"] as SelectMode[]).map(m => (
                    <button key={m}
                      onClick={() => { setAssignMode(m); setAssignSelected([]); }}
                      style={{
                        padding: "10px 4px", borderRadius: 10, border: `2px solid ${assignMode === m ? DG : "#1a3a25"}`,
                        background: assignMode === m ? DG : "#0a1a10", color: assignMode === m ? W : "#5a8a6a",
                        fontWeight: 800, fontSize: 12, cursor: "pointer",
                        boxShadow: assignMode === m ? `0 2px 8px ${DG}55` : "none",
                      }}>
                      <div style={{ fontFamily: "'Amiri',serif", fontSize: 14, color: assignMode === m ? GOLD : DG }}>
                        {m === "juz" ? "بالجزء" : m === "hizb" ? "بالحزب" : "بالسورة"}
                      </div>
                      <div style={{ fontSize: 9, marginTop: 2 }}>
                        {m === "juz" ? "Juz" : m === "hizb" ? "Hizb" : "Surah"}
                      </div>
                    </button>
                  ))}
                </div>

                {/* Picker grid */}
                <div style={{ maxHeight: 220, overflowY: "auto" as const, borderRadius: 10,
                  background: "#0a1a10", border: `1px solid ${GOLD}22`, padding: 10 }}>
                  {assignMode === "juz" && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 6 }}>
                      {Array.from({ length: 30 }, (_, i) => i + 1).map(j => (
                        <button key={j}
                          onClick={() => setAssignSelected(p => p.includes(j) ? p.filter(x => x !== j) : [...p, j])}
                          style={{
                            aspectRatio: "1", borderRadius: 8, border: `1.5px solid ${assignSelected.includes(j) ? GOLD : "#1a3a25"}`,
                            background: assignSelected.includes(j) ? DG : "#0a2010",
                            color: assignSelected.includes(j) ? GOLD : "#5a8a6a",
                            fontFamily: "'Amiri',serif", fontWeight: 800, fontSize: 13, cursor: "pointer",
                          }}>
                          {toAr(j)}
                        </button>
                      ))}
                    </div>
                  )}
                  {assignMode === "hizb" && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 6 }}>
                      {Array.from({ length: 60 }, (_, i) => i + 1).map(h => (
                        <button key={h}
                          onClick={() => setAssignSelected(p => p.includes(h) ? p.filter(x => x !== h) : [...p, h])}
                          style={{
                            aspectRatio: "1", borderRadius: 8, border: `1.5px solid ${assignSelected.includes(h) ? GOLD : "#1a3a25"}`,
                            background: assignSelected.includes(h) ? DG : "#0a2010",
                            color: assignSelected.includes(h) ? GOLD : "#5a8a6a",
                            fontFamily: "'Amiri',serif", fontWeight: 800, fontSize: 11, cursor: "pointer",
                          }}>
                          {toAr(h)}
                        </button>
                      ))}
                    </div>
                  )}
                  {assignMode === "surah" && (
                    <div style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
                      {Object.entries(SURAHS_AR).map(([num, name]) => {
                        const n = Number(num);
                        const sel = assignSelected.includes(n);
                        return (
                          <button key={n}
                            onClick={() => setAssignSelected(p => p.includes(n) ? p.filter(x => x !== n) : [...p, n])}
                            style={{
                              display: "flex", justifyContent: "space-between", alignItems: "center",
                              padding: "8px 12px", borderRadius: 8, cursor: "pointer",
                              border: `1.5px solid ${sel ? GOLD : "#1a3a25"}`,
                              background: sel ? `${DG}0d` : "#0a1a10",
                            }}>
                            <span style={{ fontFamily: "'Amiri',serif", fontSize: 14, fontWeight: 700,
                              color: sel ? W : "#7a9a7a" }}>{name}</span>
                            {sel && <CheckCircle2 size={14} style={{ color: GOLD }} />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {assignSelected.length > 0 && (
                  <p style={{ fontSize: 11, color: GOLD, marginTop: 8, fontWeight: 700 }}>
                    ✓ {assignSelected.length} {assignMode}(s) selected
                  </p>
                )}
              </div>

              {/* Daily pages */}
              <div style={{ background: "#0a2d1a", borderRadius: 14, padding: 14, marginBottom: 12 }}>
                <p style={{ fontSize: 11, fontWeight: 800, color: GOLD, marginBottom: 10, letterSpacing: 1 }}>
                  DAILY PAGE TARGET
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
                  {DAILY_OPTS.map(o => (
                    <button key={o.val}
                      onClick={() => setAssignPages(o.val)}
                      style={{
                        padding: "10px 4px", borderRadius: 10, border: `2px solid ${assignPages === o.val ? DG : "#1a3a25"}`,
                        background: assignPages === o.val ? DG : "#0a1a10",
                        color: assignPages === o.val ? GOLD : "#5a8a6a",
                        fontWeight: 800, fontSize: 12, cursor: "pointer",
                      }}>
                      {o.en}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reciter */}
              <div style={{ background: "#0a2d1a", borderRadius: 14, padding: 14, marginBottom: 12 }}>
                <p style={{ fontSize: 11, fontWeight: 800, color: GOLD, marginBottom: 10, letterSpacing: 1 }}>
                  PREFERRED RECITER
                </p>
                <select value={assignReciter} onChange={e => setAssignReciter(e.target.value)}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 10,
                    background: "#0a1a10", border: `1px solid ${GOLD}33`,
                    color: W, fontSize: 14, fontFamily: "'Amiri',serif", outline: "none",
                    appearance: "none" as const }}>
                  {RECITERS.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>

              {/* Notes */}
              <div style={{ background: "#0a2d1a", borderRadius: 14, padding: 14, marginBottom: 16 }}>
                <p style={{ fontSize: 11, fontWeight: 800, color: GOLD, marginBottom: 10, letterSpacing: 1 }}>
                  NOTES FOR STUDENT <span style={{ fontWeight: 400, color: LIGHT_TEXT }}>(optional)</span>
                </p>
                <textarea rows={3} value={assignNotes} onChange={e => setAssignNotes(e.target.value)}
                  placeholder="e.g. Focus on Juz 1 first — pay attention to Surah Al-Baqarah."
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 10,
                    background: "#0a1a10", border: `1px solid ${GOLD}33`,
                    color: W, fontSize: 13, resize: "none" as const, outline: "none",
                    boxSizing: "border-box" as const }} />
              </div>

              {/* Save + remove */}
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={saveAssignment}
                  disabled={assigning || assignSelected.length === 0}
                  style={{
                    flex: 1, padding: "15px 0", borderRadius: 14, border: "none",
                    background: assignSelected.length > 0
                      ? `linear-gradient(135deg, ${DG}, ${DG2})`
                      : "#1a2a1a",
                    color: assignSelected.length > 0 ? W : "#555",
                    fontWeight: 900, fontSize: 15, cursor: assignSelected.length > 0 ? "pointer" : "not-allowed",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    boxShadow: assignSelected.length > 0 ? `0 4px 16px ${DG}44` : "none",
                  }}
                >
                  {assigning ? <Loader2 size={18} /> : <Send size={16} />}
                  {assigning ? "Saving…" : "Save Assignment"}
                </button>

                {assignments[selectedStudent.user_id] && (
                  <button
                    onClick={() => removeAssignment(selectedStudent.user_id, selectedStudent.full_name)}
                    style={{ padding: "15px 16px", borderRadius: 14, background: "#1a0a0a",
                      border: "1px solid #dc262633", color: "#dc2626", cursor: "pointer", fontSize: 12, fontWeight: 700 }}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* CSS spin keyframe */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
