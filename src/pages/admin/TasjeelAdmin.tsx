// src/pages/admin/TasjeelAdmin.tsx
// TASJEEL ADMIN CONTROL PANEL
// Sections: Settings | Student Progress | Proctoring | Exam Config | Level Assignment

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useRegistrationSettings } from "@/hooks/useRegistrationSettings";
import {
  Settings, Users, Shield, BookOpen, GraduationCap,
  Mic, ToggleLeft, ToggleRight, Loader2, ChevronRight,
  CheckCircle, XCircle, Clock, Search, Eye, Send,
  RefreshCw, AlertTriangle, Lock, Unlock, BarChart2
} from "lucide-react";

const G    = "#064E3B";
const GOLD = "#C9A84C";

type Tab = "settings" | "progress" | "proctoring" | "reviews";

const STEPS = ["enrollment","payment","onboarding","exam","review","level_assignment","completed"] as const;
const STEP_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  enrollment:       { label: "Enrollment",      icon: "📝", color: "#6366f1" },
  payment:          { label: "Payment",         icon: "💳", color: "#0ea5e9" },
  onboarding:       { label: "Onboarding",      icon: "📋", color: "#8b5cf6" },
  exam:             { label: "Entrance Exam",   icon: "📖", color: "#f59e0b" },
  review:           { label: "Under Review",   icon: "🔍", color: "#ef4444" },
  level_assignment: { label: "Awaiting Level", icon: "⏳", color: "#f97316" },
  completed:        { label: "Completed",       icon: "✅", color: "#22c55e" },
};

const Toggle = ({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid #F3F4F6" }}>
    <span style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>{label}</span>
    <button onClick={onToggle} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ width: 44, height: 24, borderRadius: 12, background: on ? G : "#D1D5DB", transition: "background .2s", position: "relative" }}>
        <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: on ? 23 : 3, transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: on ? G : "#9CA3AF" }}>{on ? "ON" : "OFF"}</span>
    </button>
  </div>
);

export default function TasjeelAdmin() {
  const { toast } = useToast();
  const navigate  = useNavigate();
  const { config, loading: configLoading, saveAll } = useRegistrationSettings();
  const [tab, setTab]         = useState<Tab>("settings");
  const [draft, setDraft]     = useState<any>(null);
  const [saving, setSaving]   = useState(false);
  const [students, setStudents] = useState<any[]>([]);
  const [stdLoading, setStdLoading] = useState(false);
  const [search, setSearch]   = useState("");
  const [stepFilter, setStepFilter] = useState("all");
  const [procStats, setProcStats] = useState<any>({});

  useEffect(() => {
    if (!configLoading && config) setDraft({ ...config });
  }, [configLoading, config]);

  useEffect(() => {
    if (tab === "progress") loadStudents();
    if (tab === "reviews")  loadReviews();
    if (tab === "proctoring") loadProcStats();
  }, [tab]);

  const loadStudents = async () => {
    setStdLoading(true);
    const { data } = await supabase
      .from("tasjeel_progress" as any)
      .select("*, profiles:user_id(full_name, email, level, avatar_url)")
      .order("updated_at", { ascending: false });
    setStudents(data || []);
    setStdLoading(false);
  };

  const loadReviews = async () => {
    setStdLoading(true);
    const { data } = await supabase
      .from("tasjeel_progress" as any)
      .select("*, profiles:user_id(full_name, email, level)")
      .eq("current_step", "review")
      .order("updated_at", { ascending: false });
    setStudents(data || []);
    setStdLoading(false);
  };

  const loadProcStats = async () => {
    const [vsRes, sessRes] = await Promise.all([
      supabase.from("violations" as any).select("violation_type").limit(1000),
      supabase.from("proctoring_sessions" as any).select("integrity_score, suspicion_level").limit(200),
    ]);
    const typeCounts: Record<string, number> = {};
    (vsRes.data || []).forEach((v: any) => { typeCounts[v.violation_type] = (typeCounts[v.violation_type] || 0) + 1; });
    const sessions = sessRes.data || [];
    const avgInteg = sessions.length ? Math.round(sessions.reduce((s: number, v: any) => s + (v.integrity_score || 100), 0) / sessions.length) : 100;
    setProcStats({ typeCounts, total: Object.values(typeCounts).reduce((a: any, b: any) => a + b, 0), avgIntegrity: avgInteg, sessions: sessions.length });
  };

  const saveDraft = async () => {
    if (!draft) return;
    setSaving(true);
    await saveAll(draft);
    toast({ title: "✅ Settings saved!" });
    setSaving(false);
  };

  const approveAndAssignLevel = async (progress: any, level: string) => {
    if (!level) { toast({ title: "Select a level first", variant: "destructive" }); return; }
    // Assign level in profiles
    await supabase.from("profiles").update({ level, course_level: level }).eq("user_id", progress.user_id);
    // Advance Tasjeel step
    await supabase.from("tasjeel_progress" as any).update({
      current_step: "completed",
      level_assigned: level,
      level_assigned_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("user_id", progress.user_id);
    // Notify student
    await supabase.from("notifications" as any).insert({
      user_id: progress.user_id,
      title: "🎉 Your level has been assigned!",
      message: `Congratulations! You have been placed in the ${level} level. Your dashboard is now accessible. Welcome to Tahleem Academy!`,
      type: "level_assigned", is_read: false,
    });
    toast({ title: `✅ Level "${level}" assigned — dashboard unlocked!` });
    loadReviews();
  };

  const filteredStudents = students.filter(s => {
    const name = (s.profiles as any)?.full_name || "";
    const email = (s.profiles as any)?.email || "";
    const matchSearch = !search || name.toLowerCase().includes(search.toLowerCase()) || email.toLowerCase().includes(search.toLowerCase());
    const matchStep = stepFilter === "all" || s.current_step === stepFilter;
    return matchSearch && matchStep;
  });

  const stepCounts = students.reduce((acc: any, s) => {
    acc[s.current_step] = (acc[s.current_step] || 0) + 1;
    return acc;
  }, {});

  const inp: React.CSSProperties = { width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E5E7EB", fontSize: 13, outline: "none", background: "#FAFAFA", boxSizing: "border-box" as const };

  if (configLoading || !draft) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
      <Loader2 size={28} style={{ animation: "spin .8s linear infinite", color: G }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#F8F9FA" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", padding: "18px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: "#F0FDF4", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 22 }}>🎓</span>
            </div>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 900, color: "#111", margin: 0 }}>Tasjeel Control Panel</h1>
              <p style={{ fontSize: 12, color: "#6B7280", margin: 0, fontFamily: "'Amiri',serif" }}>لوحة التسجيل — Admission Management System</p>
            </div>
          </div>
          <button onClick={saveDraft} disabled={saving}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", borderRadius: 12, border: "none", background: G, color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
            {saving ? <><Loader2 size={14} style={{ animation: "spin .8s linear infinite" }}/> Saving…</> : <><CheckCircle size={14}/> Save Settings</>}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", padding: "0 20px", display: "flex", gap: 0, overflowX: "auto" }}>
        {([
          { id: "settings",  label: "⚙️ Settings",       },
          { id: "progress",  label: "📊 Student Progress" },
          { id: "reviews",   label: "🔍 Reviews",         },
          { id: "proctoring",label: "🛡️ Proctoring",      },
        ] as { id: Tab; label: string }[]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: "14px 20px", border: "none", borderBottom: `3px solid ${tab === t.id ? G : "transparent"}`, background: "transparent", cursor: "pointer", fontWeight: tab === t.id ? 800 : 600, fontSize: 13, color: tab === t.id ? G : "#6B7280", whiteSpace: "nowrap" }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding: "20px", maxWidth: 1000, margin: "0 auto" }}>

        {/* ── SETTINGS TAB ── */}
        {tab === "settings" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

            {/* Registration */}
            <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB", padding: 20 }}>
              <h3 style={{ fontWeight: 800, fontSize: 14, color: G, margin: "0 0 4px" }}>📝 Registration</h3>
              <p style={{ fontSize: 12, color: "#9CA3AF", margin: "0 0 16px" }}>Control who can register</p>
              <Toggle on={draft.registration_open ?? true} onToggle={() => setDraft((d: any) => ({ ...d, registration_open: !d.registration_open }))} label="Registration Open" />
              <Toggle on={draft.entrance_exam_required ?? true} onToggle={() => setDraft((d: any) => ({ ...d, entrance_exam_required: !d.entrance_exam_required }))} label="Entrance Exam Required" />
              <Toggle on={draft.recitation_test_required ?? true} onToggle={() => setDraft((d: any) => ({ ...d, recitation_test_required: !d.recitation_test_required }))} label="Recitation Test Required" />
              <Toggle on={draft.onboarding_required ?? true} onToggle={() => setDraft((d: any) => ({ ...d, onboarding_required: !d.onboarding_required }))} label="Onboarding Form Required" />
              <div style={{ marginTop: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 6 }}>Max Daily Registrations (0 = unlimited)</label>
                <input type="number" min={0} value={draft.max_daily_registrations || 0}
                  onChange={e => setDraft((d: any) => ({ ...d, max_daily_registrations: +e.target.value }))} style={{ ...inp, width: "auto" }} />
              </div>
            </div>

            {/* Payment */}
            <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB", padding: 20 }}>
              <h3 style={{ fontWeight: 800, fontSize: 14, color: G, margin: "0 0 4px" }}>💳 Payment (Paystack)</h3>
              <p style={{ fontSize: 12, color: "#9CA3AF", margin: "0 0 16px" }}>If OFF — payment step is skipped</p>
              <Toggle on={draft.entrance_fee_enabled ?? false} onToggle={() => setDraft((d: any) => ({ ...d, entrance_fee_enabled: !d.entrance_fee_enabled }))} label="Payment Required" />
              {draft.entrance_fee_enabled && (
                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 5 }}>Amount</label>
                    <input type="number" value={draft.entrance_fee_amount || 0}
                      onChange={e => setDraft((d: any) => ({ ...d, entrance_fee_amount: +e.target.value }))} style={inp} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 5 }}>Currency</label>
                    <select value={draft.entrance_fee_currency || "NGN"} onChange={e => setDraft((d: any) => ({ ...d, entrance_fee_currency: e.target.value }))} style={inp}>
                      {["NGN","USD","GBP","EUR","KES","GHS","ZAR"].map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Proctoring settings */}
            <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB", padding: 20 }}>
              <h3 style={{ fontWeight: 800, fontSize: 14, color: G, margin: "0 0 4px" }}>🛡️ Proctoring Settings</h3>
              <p style={{ fontSize: 12, color: "#9CA3AF", margin: "0 0 16px" }}>Applied to entrance exam</p>
              <Toggle on={draft.proctoring_enabled ?? false} onToggle={() => setDraft((d: any) => ({ ...d, proctoring_enabled: !d.proctoring_enabled }))} label="Enable Proctoring" />
              <Toggle on={draft.prevent_tab_switch ?? false} onToggle={() => setDraft((d: any) => ({ ...d, prevent_tab_switch: !d.prevent_tab_switch }))} label="Detect Tab Switching" />
              <Toggle on={draft.prevent_copy_paste ?? false} onToggle={() => setDraft((d: any) => ({ ...d, prevent_copy_paste: !d.prevent_copy_paste }))} label="Block Copy/Paste" />
              <Toggle on={draft.fullscreen_required ?? false} onToggle={() => setDraft((d: any) => ({ ...d, fullscreen_required: !d.fullscreen_required }))} label="Fullscreen Required" />
              <Toggle on={draft.camera_monitoring ?? false} onToggle={() => setDraft((d: any) => ({ ...d, camera_monitoring: !d.camera_monitoring }))} label="Camera Monitoring" />
              <Toggle on={draft.auto_submit_on_violation ?? false} onToggle={() => setDraft((d: any) => ({ ...d, auto_submit_on_violation: !d.auto_submit_on_violation }))} label="Auto-Submit on Violations" />
              <div style={{ marginTop: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 5 }}>Max Warnings Before Auto-Submit</label>
                <input type="number" min={1} max={20} value={draft.max_warnings || 3}
                  onChange={e => setDraft((d: any) => ({ ...d, max_warnings: +e.target.value }))} style={{ ...inp, width: "auto" }} />
              </div>
            </div>

            {/* Messages */}
            <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB", padding: 20 }}>
              <h3 style={{ fontWeight: 800, fontSize: 14, color: G, margin: "0 0 16px" }}>📢 Messaging</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 5 }}>Registration Closed Message (EN)</label>
                  <textarea value={draft.closed_message || ""} rows={3} onChange={e => setDraft((d: any) => ({ ...d, closed_message: e.target.value }))} style={{ ...inp, resize: "none" }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 5 }}>Registration Closed Message (AR)</label>
                  <textarea value={draft.closed_message_ar || ""} rows={3} dir="rtl" onChange={e => setDraft((d: any) => ({ ...d, closed_message_ar: e.target.value }))} style={{ ...inp, resize: "none", fontFamily: "'Amiri',serif" }} />
                </div>
              </div>
            </div>

            {/* Quick links */}
            <div style={{ gridColumn: "span 2", background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB", padding: 20 }}>
              <h3 style={{ fontWeight: 800, fontSize: 14, color: G, margin: "0 0 16px" }}>🔗 Quick Links</h3>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {[
                  { label: "Exam Manager", path: "/admin/exams" },
                  { label: "Entrance Exam Admin", path: "/admin/entrance-exam" },
                  { label: "Grading", path: "/admin/grading" },
                  { label: "Proctoring Dashboard", path: "/admin/proctoring" },
                  { label: "Level Assignment", path: "/admin/level-assignment" },
                  { label: "Recitation Review", path: "/admin/recitation-review" },
                  { label: "Student Management", path: "/admin/students" },
                ].map(l => (
                  <button key={l.label} onClick={() => navigate(l.path)}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, border: "1.5px solid #E5E7EB", background: "#F9FAFB", cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#374151" }}>
                    <ChevronRight size={12} color={G} /> {l.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── STUDENT PROGRESS TAB ── */}
        {tab === "progress" && (
          <>
            {/* Step counts */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16, overflowX: "auto", paddingBottom: 4 }}>
              {STEPS.map(s => {
                const cfg = STEP_LABELS[s];
                return (
                  <button key={s} onClick={() => setStepFilter(s === stepFilter ? "all" : s)}
                    style={{ flexShrink: 0, padding: "8px 14px", borderRadius: 10, border: `1.5px solid ${stepFilter === s ? cfg.color : "#E5E7EB"}`, background: stepFilter === s ? cfg.color + "18" : "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700, color: stepFilter === s ? cfg.color : "#6B7280" }}>
                    {cfg.icon} {cfg.label} ({stepCounts[s] || 0})
                  </button>
                );
              })}
              {stepFilter !== "all" && (
                <button onClick={() => setStepFilter("all")} style={{ flexShrink: 0, padding: "8px 14px", borderRadius: 10, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#374151" }}>
                  All ({students.length})
                </button>
              )}
            </div>

            {/* Search */}
            <div style={{ position: "relative", marginBottom: 14 }}>
              <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search students…"
                style={{ ...inp, paddingLeft: 32 }} />
            </div>

            {stdLoading ? (
              <div style={{ textAlign: "center", padding: 48 }}><Loader2 size={28} style={{ animation: "spin .8s linear infinite", color: G }} /></div>
            ) : filteredStudents.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px", background: "#fff", borderRadius: 16, border: "2px dashed #E5E7EB" }}>
                <p style={{ fontSize: 36, marginBottom: 8 }}>📊</p>
                <p style={{ fontWeight: 700, color: "#374151" }}>No students found</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {filteredStudents.map(s => {
                  const prof = s.profiles as any;
                  const step = STEP_LABELS[s.current_step] || { label: s.current_step, icon: "?", color: "#9CA3AF" };
                  return (
                    <div key={s.user_id} style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #E5E7EB", padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 38, height: 38, borderRadius: 10, background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 16, fontWeight: 800, color: "#1D4ED8" }}>
                        {(prof?.full_name || "?")[0]}
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontWeight: 700, fontSize: 14, color: "#111", margin: 0 }}>{prof?.full_name || "Unknown"}</p>
                        <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>{prof?.email}</p>
                      </div>
                      <div style={{ padding: "4px 12px", borderRadius: 20, background: step.color + "18", border: `1px solid ${step.color}33`, fontSize: 11, fontWeight: 700, color: step.color }}>
                        {step.icon} {step.label}
                      </div>
                      <button onClick={() => navigate(`/admin/view-as-student/${s.user_id}`)}
                        style={{ padding: "7px 10px", borderRadius: 8, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer" }}>
                        <Eye size={13} color="#6B7280" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── REVIEWS TAB ── */}
        {tab === "reviews" && (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <h2 style={{ fontWeight: 800, fontSize: 16, color: "#111", margin: 0 }}>🔍 Students Awaiting Review</h2>
                <p style={{ fontSize: 12, color: "#6B7280", margin: 0 }}>Approve results and assign levels to unlock dashboards</p>
              </div>
              <button onClick={loadReviews} style={{ padding: "8px 14px", borderRadius: 10, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "#374151" }}>
                <RefreshCw size={13} /> Refresh
              </button>
            </div>

            {stdLoading ? (
              <div style={{ textAlign: "center", padding: 48 }}><Loader2 size={28} style={{ animation: "spin .8s linear infinite", color: G }} /></div>
            ) : students.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px", background: "#fff", borderRadius: 16, border: "2px dashed #E5E7EB" }}>
                <p style={{ fontSize: 40, marginBottom: 10 }}>✅</p>
                <p style={{ fontWeight: 700, color: "#374151" }}>No pending reviews</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {students.map(s => {
                  const prof = s.profiles as any;
                  const [selLevel, setSelLevel] = useState("");
                  return (
                    <div key={s.user_id} style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #E5E7EB", padding: 16 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, color: "#1D4ED8" }}>
                          {(prof?.full_name || "?")[0]}
                        </div>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontWeight: 800, fontSize: 14, color: "#111", margin: 0 }}>{prof?.full_name || "Unknown"}</p>
                          <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>{prof?.email}</p>
                        </div>
                        <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, background: "#FFF7ED", color: "#C2410C", fontWeight: 700 }}>🔍 Under Review</span>
                      </div>

                      {/* Info row */}
                      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
                        {[
                          { l: "Exam Completed", v: s.exam_completed_at ? new Date(s.exam_completed_at).toLocaleDateString() : "—" },
                          { l: "Payment", v: s.payment_status || "n/a" },
                          { l: "Onboarding", v: s.onboarding_completed_at ? "✓" : "—" },
                        ].map(i => (
                          <div key={i.l} style={{ padding: "6px 12px", borderRadius: 8, background: "#F9FAFB", border: "1px solid #F3F4F6", fontSize: 11 }}>
                            <span style={{ color: "#9CA3AF" }}>{i.l}: </span>
                            <strong style={{ color: "#374151" }}>{i.v}</strong>
                          </div>
                        ))}
                      </div>

                      {/* Level assignment */}
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <select value={selLevel} onChange={e => setSelLevel(e.target.value)}
                          style={{ flex: 1, padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E5E7EB", fontSize: 13, outline: "none" }}>
                          <option value="">Select level to assign…</option>
                          <option value="beginner">🟢 Beginner / مبتدئ</option>
                          <option value="intermediate">🟡 Intermediate / متوسط</option>
                          <option value="advanced">🔴 Advanced / متقدم</option>
                        </select>
                        <button onClick={() => approveAndAssignLevel(s, selLevel)} disabled={!selLevel}
                          style={{ padding: "9px 18px", borderRadius: 10, border: "none", background: selLevel ? G : "#9CA3AF", color: "#fff", cursor: selLevel ? "pointer" : "not-allowed", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", gap: 7 }}>
                          <CheckCircle size={14} /> Approve & Assign
                        </button>
                        <button onClick={() => navigate(`/admin/view-as-student/${s.user_id}`)}
                          style={{ padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer" }}>
                          <Eye size={14} color="#6B7280" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── PROCTORING TAB ── */}
        {tab === "proctoring" && (
          <>
            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 20 }}>
              {[
                { v: procStats.sessions || 0, l: "Total Sessions", bg: "#EFF6FF", c: "#1D4ED8" },
                { v: procStats.total || 0, l: "Total Violations", bg: "#FEF2F2", c: "#DC2626" },
                { v: `${procStats.avgIntegrity || 100}%`, l: "Avg Integrity", bg: "#F0FDF4", c: "#166534" },
              ].map((s, i) => (
                <div key={i} style={{ background: s.bg, borderRadius: 14, padding: "16px" }}>
                  <p style={{ fontSize: 28, fontWeight: 900, color: s.c, margin: 0 }}>{s.v}</p>
                  <p style={{ fontSize: 12, color: s.c, opacity: .7, margin: 0, fontWeight: 700 }}>{s.l}</p>
                </div>
              ))}
            </div>

            {/* Violation types */}
            <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB", padding: 20 }}>
              <h3 style={{ fontWeight: 800, fontSize: 14, color: G, margin: "0 0 16px" }}>📋 Violation Breakdown</h3>
              {Object.entries(procStats.typeCounts || {}).sort(([,a]: any, [,b]: any) => b - a).map(([type, count]: any) => (
                <div key={type} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #F9FAFB" }}>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#374151" }}>{type.replace(/_/g, " ")}</span>
                  <div style={{ width: 120, height: 6, background: "#F3F4F6", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(100, (count / Math.max(1, procStats.total)) * 100)}%`, background: "#DC2626", borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 800, color: "#DC2626", minWidth: 30, textAlign: "right" }}>{count}</span>
                </div>
              ))}
              {Object.keys(procStats.typeCounts || {}).length === 0 && (
                <p style={{ fontSize: 13, color: "#9CA3AF", textAlign: "center", padding: "20px 0" }}>No violations recorded yet</p>
              )}
            </div>

            <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
              <button onClick={() => navigate("/admin/proctoring")}
                style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: G, color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
                Full Proctoring Dashboard →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
