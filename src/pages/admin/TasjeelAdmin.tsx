// src/pages/admin/TasjeelAdmin.tsx
// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE TRACKER — read-only.
// Shows where every new student is in the registration pipeline. It has no
// settings, proctoring, accept-session, join-session or assign-level actions;
// those live in New Registrations / Registration Settings.
// Mobile-first, same look as Daily Hifdh Revision.
// ═══════════════════════════════════════════════════════════════════════════
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Search, RefreshCw, ChevronDown } from "lucide-react";

const G0 = "#061409", G1 = "#0f2d1f", G2 = "#1a3d27", G3 = "#276749";
const GOLD = "#c9a84c";
const WARM = "#faf8f4", BRD = "#e5ddd3";

const STEP_CFG: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  enrollment:       { label: "Enrollment",       icon: "📝", color: "#6366f1", bg: "#EEF2FF" },
  payment:          { label: "Payment",          icon: "💳", color: "#0ea5e9", bg: "#F0F9FF" },
  onboarding:       { label: "Onboarding",       icon: "📋", color: "#8b5cf6", bg: "#F5F3FF" },
  exam:             { label: "Entrance Exam",    icon: "📖", color: "#f59e0b", bg: "#FFFBEB" },
  review:           { label: "Under Review",     icon: "🔍", color: "#ef4444", bg: "#FEF2F2" },
  level_assignment: { label: "Awaiting Session", icon: "📅", color: "#f97316", bg: "#FFF7ED" },
  completed:        { label: "Completed",        icon: "✅", color: "#22c55e", bg: "#F0FDF4" },
};
const STEP_ORDER = ["enrollment", "payment", "onboarding", "exam", "review", "level_assignment", "completed"];
const TIMELINE = ["enrollment", "payment", "onboarding", "exam", "level_assignment", "completed"];

const FILTERS = [
  { id: "all", label: "All" },
  { id: "level_assignment", label: "Awaiting" },
  { id: "exam", label: "Exam" },
  { id: "completed", label: "Done" },
];

const fmt = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

const Pill = ({ label, value, color = "#374151" }: { label: string; value: any; color?: string }) => (
  <div style={{ padding: "5px 10px", borderRadius: 8, background: "#fff", border: `1px solid ${BRD}`, fontSize: 11 }}>
    <span style={{ color: "#9CA3AF" }}>{label}: </span><strong style={{ color }}>{value ?? "—"}</strong>
  </div>
);

const TrackerCard = ({ s }: { s: any }) => {
  const [open, setOpen] = useState(false);
  const prof = s.profiles || {};
  const rec = s.recitation || null;
  const exam = s.exam || null;
  const pay = s.payment || null;
  const cfg = STEP_CFG[s.current_step] || { label: s.current_step, icon: "?", color: "#9CA3AF", bg: "#F9FAFB" };
  const stepIdx = STEP_ORDER.indexOf(s.current_step);
  const done = s.current_step === "completed";

  return (
    <div style={{ background: "#fff", borderRadius: 16, border: `1px solid ${BRD}`, overflow: "hidden" }}>
      <div onClick={() => setOpen(o => !o)} style={{ padding: "12px 14px", cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {prof.avatar_url
            ? <img src={prof.avatar_url} alt="" style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
            : <div style={{ width: 40, height: 40, borderRadius: "50%", background: `linear-gradient(135deg,${G2},${G3})`, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 16, flexShrink: 0 }}>
                {(prof.full_name || prof.email || "?")[0]?.toUpperCase()}
              </div>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontWeight: 800, fontSize: 14, color: G2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{prof.full_name || "New Student"}</p>
            <p style={{ margin: "1px 0 0", fontSize: 11, color: "#9CA3AF", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{prof.email}</p>
          </div>
          <ChevronDown size={16} color="#9ca3af" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s", flexShrink: 0 }} />
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10, gap: 8 }}>
          <span style={{ padding: "3px 10px", borderRadius: 20, background: cfg.bg, color: cfg.color, fontSize: 11, fontWeight: 700, border: `1px solid ${cfg.color}33` }}>
            {cfg.icon} {cfg.label}
          </span>
          <span style={{ fontSize: 10, color: "#9CA3AF" }}>Registered {fmt(s.created_at)}</span>
        </div>

        {/* Step progress strip */}
        <div style={{ display: "flex", gap: 3, marginTop: 10 }}>
          {TIMELINE.map(sid => {
            const idx = STEP_ORDER.indexOf(sid);
            const reached = done || idx < stepIdx || s.current_step === sid;
            return <div key={sid} style={{ flex: 1, height: 5, borderRadius: 3, background: reached ? (s.current_step === sid && !done ? GOLD : G3) : "#E5E7EB" }} />;
          })}
        </div>
      </div>

      {open && (
        <div style={{ padding: "0 14px 14px", borderTop: "1px solid #f3f4f6", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", paddingTop: 12 }}>
            {prof.student_id && <Pill label="ID" value={prof.student_id} />}
            {prof.country && <Pill label="Country" value={prof.country} />}
            {prof.phone && <Pill label="Phone" value={prof.phone} />}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={{ background: "#F0F9FF", borderRadius: 12, padding: 10, border: "1px solid #BAE6FD" }}>
              <p style={{ margin: 0, fontSize: 9, fontWeight: 800, color: "#0369a1", textTransform: "uppercase" }}>💳 Payment</p>
              <p style={{ margin: "4px 0 0", fontSize: 12, fontWeight: 700, color: s.payment_status === "paid" ? "#15803D" : "#374151" }}>
                {s.payment_status === "paid" ? "Paid" : s.payment_status === "exempt" ? "Exempt" : s.payment_status || "Pending"}
              </p>
              {pay?.amount ? <p style={{ margin: "2px 0 0", fontSize: 10, color: "#6B7280" }}>₦{Number(pay.amount).toLocaleString()} · {fmt(pay.paid_at)}</p> : null}
            </div>
            <div style={{ background: "#F5F3FF", borderRadius: 12, padding: 10, border: "1px solid #C4B5FD" }}>
              <p style={{ margin: 0, fontSize: 9, fontWeight: 800, color: "#6d28d9", textTransform: "uppercase" }}>📋 Onboarding</p>
              <p style={{ margin: "4px 0 0", fontSize: 12, fontWeight: 700, color: s.onboarding_completed_at ? "#15803D" : "#D97706" }}>
                {s.onboarding_completed_at ? "Completed" : "Pending"}
              </p>
              {s.onboarding_completed_at && <p style={{ margin: "2px 0 0", fontSize: 10, color: "#6B7280" }}>{fmt(s.onboarding_completed_at)}</p>}
            </div>
            <div style={{ background: "#FFFBEB", borderRadius: 12, padding: 10, border: "1px solid #FDE68A" }}>
              <p style={{ margin: 0, fontSize: 9, fontWeight: 800, color: "#b45309", textTransform: "uppercase" }}>📖 Exam</p>
              <p style={{ margin: "4px 0 0", fontSize: 12, fontWeight: 700, color: "#374151" }}>
                {exam ? `${Math.round(exam.percentage ?? 0)}%` : "Not taken"}
              </p>
              {exam && <p style={{ margin: "2px 0 0", fontSize: 10, color: "#6B7280" }}>{exam.score ?? 0}/{exam.total_points ?? 0} · {fmt(exam.submitted_at || exam.updated_at)}</p>}
            </div>
            <div style={{ background: "#F0FDF4", borderRadius: 12, padding: 10, border: "1px solid #86EFAC" }}>
              <p style={{ margin: 0, fontSize: 9, fontWeight: 800, color: "#166534", textTransform: "uppercase" }}>🎙️ Recitation</p>
              <p style={{ margin: "4px 0 0", fontSize: 12, fontWeight: 700, color: "#374151" }}>
                {rec ? (rec.ai_score != null ? `AI ${rec.ai_score}%` : rec.status || "Submitted") : "Not submitted"}
              </p>
              {rec?.virtual_session_date && <p style={{ margin: "2px 0 0", fontSize: 10, color: "#6B7280" }}>Session {rec.virtual_session_date} {rec.virtual_session_time || ""}{rec.admin_approved ? " ✓" : " ⏳"}</p>}
            </div>
          </div>
          {done && (
            <p style={{ margin: 0, fontSize: 12, color: G2, fontWeight: 700 }}>
              🎓 Level: {s.level_assigned || "—"} <span style={{ color: "#9CA3AF", fontWeight: 500 }}>· {fmt(s.level_assigned_at)}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default function TasjeelAdmin() {
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const { data: progress } = await (supabase as any).from("tasjeel_progress").select("*").order("updated_at", { ascending: false });
      if (!progress?.length) { setStudents([]); return; }
      const ids = [...new Set(progress.map((p: any) => p.user_id))];
      const [profRes, recRes, examRes, payRes] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name, email, avatar_url, student_id, phone, country").in("user_id", ids as any),
        (supabase as any).from("recitation_tests").select("*").in("user_id", ids),
        supabase.from("exam_attempts").select("user_id, score, total_points, percentage, status, submitted_at, updated_at").in("user_id", ids as any).order("submitted_at", { ascending: false }),
        (supabase as any).from("payment_history").select("user_id, amount, paid_at, status, payment_ref, payment_type").in("user_id", ids).eq("payment_type", "registration"),
      ]);
      const by = (rows: any[] | null, first = false) => {
        const m: Record<string, any> = {};
        (rows || []).forEach((r: any) => { if (!first || !m[r.user_id]) m[r.user_id] = r; });
        return m;
      };
      const pm = by(profRes.data), rm = by(recRes.data), em = by(examRes.data, true), ym = by(payRes.data, true);
      setStudents(progress.map((p: any) => ({ ...p, profiles: pm[p.user_id] || null, recitation: rm[p.user_id] || null, exam: em[p.user_id] || null, payment: ym[p.user_id] || null })));
    } catch (e) {
      console.error("[PipelineTracker] loadAll:", e);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const q = search.toLowerCase();
  const filtered = students.filter(s => {
    const p = s.profiles || {};
    const ms = !q || (p.full_name || "").toLowerCase().includes(q) || (p.email || "").toLowerCase().includes(q) || (p.student_id || "").toLowerCase().includes(q);
    return ms && (filter === "all" || s.current_step === filter);
  });

  const count = (id: string) => id === "all" ? students.length : students.filter(s => s.current_step === id).length;
  const inProgress = students.filter(s => s.current_step !== "completed").length;

  return (
    <div style={{ background: WARM, padding: "14px 14px 32px", display: "flex", flexDirection: "column", gap: 12, fontFamily: "'Cairo',sans-serif" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Hero */}
      <div style={{ borderRadius: 20, padding: "16px 14px", background: `linear-gradient(135deg,${G1},${G2})`, border: `1px solid ${GOLD}33`, boxShadow: `0 4px 24px ${G1}44` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.5)", letterSpacing: 0.6 }}>PIPELINE TRACKER</p>
            <p style={{ margin: "2px 0 0", fontWeight: 900, fontSize: 18, color: "#fff" }}>{students.length} students</p>
          </div>
          <button onClick={loadAll} disabled={loading}
            style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,.25)", background: "rgba(255,255,255,.1)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit" }}>
            <RefreshCw size={13} style={{ animation: loading ? "spin .8s linear infinite" : "none" }} /> Refresh
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {[{ v: inProgress, l: "In progress", c: GOLD }, { v: count("level_assignment"), l: "Awaiting", c: "#fdba74" }, { v: count("completed"), l: "Completed", c: "#86efac" }].map(s => (
            <div key={s.l} style={{ background: "rgba(255,255,255,.07)", borderRadius: 12, padding: "10px 6px", textAlign: "center", border: "1px solid rgba(255,255,255,.08)" }}>
              <p style={{ margin: 0, fontWeight: 900, fontSize: 18, color: s.c, lineHeight: 1 }}>{s.v}</p>
              <p style={{ margin: "4px 0 0", fontSize: 9, color: "rgba(255,255,255,.45)", fontWeight: 700, textTransform: "uppercase" }}>{s.l}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Search */}
      <div style={{ position: "relative" }}>
        <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email or student ID…"
          style={{ width: "100%", padding: "11px 12px 11px 34px", borderRadius: 12, border: `1.5px solid ${BRD}`, fontSize: 13, outline: "none", background: "#fff", boxSizing: "border-box", fontFamily: "inherit" }} />
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none" as any }}>
        {FILTERS.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            style={{ flexShrink: 0, padding: "7px 14px", borderRadius: 20, border: `1.5px solid ${filter === f.id ? G2 : BRD}`, background: filter === f.id ? G2 : "#fff", color: filter === f.id ? "#fff" : "#374151", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            {f.label} ({count(f.id)})
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 50 }}><Loader2 size={28} style={{ animation: "spin .8s linear infinite", color: G2 }} /></div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", background: "#fff", borderRadius: 16, border: `1.5px dashed ${BRD}` }}>
          <p style={{ fontSize: 36, margin: "0 0 6px" }}>📋</p>
          <p style={{ fontWeight: 700, color: "#374151", margin: 0 }}>No registrations found</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map(s => <TrackerCard key={s.user_id} s={s} />)}
        </div>
      )}
    </div>
  );
}
