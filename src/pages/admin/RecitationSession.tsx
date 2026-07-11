// src/pages/admin/RecitationSession.tsx
// ─────────────────────────────────────────────────────────────────────────
// Admin/instructor-side destination for "Join Live Session with <student>"
// buttons in TasjeelAdmin.tsx and LevelAssignment.tsx. Previously these
// navigated to `/admin/live-classes` (the generic LiveClassManagement page),
// which never read the `room`/`type` query params, so admins never actually
// landed in the student's recitation room.
//
// This page:
//  1. Joins the SAME LiveKit room as the student (`recitation-eval-<uid>`),
//     using the existing livekit-token edge function (admins get elevated
//     roomAdmin/roomRecord claims automatically).
//  2. Gives the admin an editable settings panel right next to the call —
//     reschedule the session, confirm it, and assign the student's final
//     level — without needing to leave the call to go find the record in
//     Level Assignment / Tasjeel Admin.
// ─────────────────────────────────────────────────────────────────────────
import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { ChevronLeft, Video, CheckCircle2, GraduationCap, Loader2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAcademicLevels } from "@/hooks/useAcademicLevels";
import RecitationCallRoom from "@/components/recitation/RecitationCallRoom";

const G = "#064E3B";
const GM = "#075E54";

interface StudentInfo {
  full_name: string | null;
  email: string | null;
}

interface RecRow {
  id: string;
  virtual_session_date: string | null;
  virtual_session_time: string | null;
  ai_score: number | null;
  admin_approved: boolean | null;
  admin_notes: string | null;
  final_level: string | null;
}

const AdminRecitationSession = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: levels } = useAcademicLevels();

  const roomName = searchParams.get("room");
  const studentId = searchParams.get("studentId") || roomName?.replace("recitation-eval-", "") || null;

  const [student, setStudent] = useState<StudentInfo | null>(null);
  const [rec, setRec] = useState<RecRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [level, setLevel] = useState("");

  const goBack = () => navigate("/admin/level-assignment", { replace: true });

  const load = useCallback(async () => {
    if (!studentId) { setLoading(false); return; }
    setLoading(true);
    const [{ data: prof }, { data: recData }] = await Promise.all([
      supabase.from("profiles").select("full_name, email").eq("user_id", studentId).maybeSingle(),
      (supabase as any).from("recitation_tests")
        .select("id, virtual_session_date, virtual_session_time, ai_score, admin_approved, admin_notes, final_level")
        .eq("user_id", studentId).maybeSingle(),
    ]);
    setStudent(prof as StudentInfo | null);
    setRec(recData as RecRow | null);
    setDate(recData?.virtual_session_date || "");
    setTime(recData?.virtual_session_time || "");
    setNotes(recData?.admin_notes || "");
    setLevel(recData?.final_level || "");
    setLoading(false);
  }, [studentId]);

  useEffect(() => { load(); }, [load]);

  // ── Reschedule / save admin notes ──────────────────────────────────────
  const saveSettings = async () => {
    if (!studentId) return;
    setSaving(true);
    try {
      await (supabase as any).from("recitation_tests").update({
        virtual_session_date: date || null,
        virtual_session_time: time || null,
        admin_notes: notes || null,
      }).eq("user_id", studentId);
      toast({ title: "✅ Session settings saved" });
      await load();
    } catch (e: any) {
      toast({ title: "Error saving settings", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  // ── Confirm session (mirrors LevelAssignment.acceptSession) ────────────
  const confirmSession = async () => {
    if (!studentId) return;
    setSaving(true);
    try {
      await (supabase as any).from("recitation_tests").update({
        admin_approved: true,
        admin_approved_at: new Date().toISOString(),
        status: "session_confirmed",
      }).eq("user_id", studentId);
      await (supabase as any).from("notifications").insert({
        user_id: studentId,
        title: "✅ Virtual Session Confirmed!",
        message: `Your virtual recitation session on ${date} at ${time || "—"} has been confirmed by your instructor. A Join button will appear on your screen 15 minutes before.`,
        type: "session_confirmed",
        is_read: false,
        created_at: new Date().toISOString(),
      });
      toast({ title: "✅ Session confirmed — student notified" });
      await load();
    } catch (e: any) {
      toast({ title: "Error confirming session", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  // ── Assign level & complete tasjeel (mirrors LevelAssignment.assignLevel) ─
  const assignLevel = async () => {
    if (!studentId || !level) return;
    setSaving(true);
    try {
      await supabase.from("profiles").update({ level, course_level: level } as any).eq("user_id", studentId);
      await (supabase as any).from("recitation_tests").update({
        final_level: level, admin_approved: true,
        admin_approved_at: new Date().toISOString(), status: "approved",
      }).eq("user_id", studentId);
      await (supabase as any).from("tasjeel_progress").upsert({
        user_id: studentId,
        current_step: "completed",
        level_assigned: level,
        level_assigned_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      await (supabase as any).from("notifications").insert({
        user_id: studentId,
        title: "🎓 Level Assigned!",
        message: `Your level has been assigned. Your dashboard is now unlocked.`,
        type: "level_assigned",
        is_read: false,
        created_at: new Date().toISOString(),
      });
      toast({ title: "✅ Level assigned — student's dashboard is unlocked" });
      await load();
    } catch (e: any) {
      toast({ title: "Error assigning level", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  if (!roomName) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
        <p style={{ color: "#6b7280", fontSize: 14 }}>No session link was provided.</p>
        <button onClick={goBack} style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: G, color: "#fff", fontWeight: 700, cursor: "pointer" }}>
          Back to Level Assignment
        </button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F9FAFB", fontFamily: "'Cairo',sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", background: "#0b0f0e", color: "#fff" }}>
        <button onClick={goBack} style={{ background: "rgba(255,255,255,.08)", border: "none", borderRadius: 10, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", cursor: "pointer" }}>
          <ChevronLeft size={18} />
        </button>
        <Video size={18} color="#86EFAC" />
        <span style={{ fontWeight: 700, fontSize: 14 }}>
          Virtual Recitation Session {student?.full_name ? `— ${student.full_name}` : ""}
        </span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, padding: 16 }}>
        {/* ── Call ── */}
        <div style={{ flex: "2 1 480px", minWidth: 320, minHeight: 480, background: "#0b0f0e", borderRadius: 16 }}>
          <RecitationCallRoom roomName={roomName} onLeave={goBack} />
        </div>

        {/* ── Admin settings panel ── */}
        <div style={{ flex: "1 1 320px", minWidth: 280, background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB", padding: 18, height: "fit-content" }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1, margin: "0 0 14px" }}>
            Session Settings
          </p>

          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
              <Loader2 size={22} style={{ animation: "spin .8s linear infinite", color: G }} />
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Session Date</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #D1D5DB", fontSize: 13, boxSizing: "border-box" as const }} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Session Time</label>
                <input type="time" value={time} onChange={e => setTime(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #D1D5DB", fontSize: 13, boxSizing: "border-box" as const }} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Admin Notes</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #D1D5DB", fontSize: 13, resize: "none", boxSizing: "border-box" as const, fontFamily: "inherit" }} />
              </div>

              <button onClick={saveSettings} disabled={saving}
                style={{ width: "100%", padding: "10px", borderRadius: 10, border: "none", background: "#374151", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 16 }}>
                <Save size={14} /> Save Settings
              </button>

              {rec?.ai_score !== null && rec?.ai_score !== undefined && (
                <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "10px 12px", marginBottom: 16, fontSize: 12, color: "#92400E" }}>
                  🎙️ Recitation AI Score: <strong>{rec.ai_score}%</strong>
                </div>
              )}

              {!rec?.admin_approved && (
                <button onClick={confirmSession} disabled={saving}
                  style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#D97706,#B45309)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 16 }}>
                  <CheckCircle2 size={15} /> Confirm Session
                </button>
              )}

              <div style={{ borderTop: "1px solid #E5E7EB", paddingTop: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: G, display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <GraduationCap size={15} /> Assign Level
                </label>
                <select value={level} onChange={e => setLevel(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #D1D5DB", fontSize: 13, marginBottom: 10, boxSizing: "border-box" as const }}>
                  <option value="">Select a level…</option>
                  {(levels || []).map(l => (
                    <option key={l.slug} value={l.slug}>{l.name_en}</option>
                  ))}
                </select>
                <button onClick={assignLevel} disabled={saving || !level}
                  style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", background: level ? `linear-gradient(135deg,${G},${GM})` : "#E5E7EB", color: level ? "#fff" : "#9CA3AF", fontWeight: 800, fontSize: 13, cursor: level ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  {saving ? <Loader2 size={14} style={{ animation: "spin .8s linear infinite" }} /> : <CheckCircle2 size={14} />}
                  Assign & Complete Registration
                </button>
                {rec?.final_level && (
                  <p style={{ fontSize: 11, color: "#16a34a", marginTop: 8, textAlign: "center" as const }}>
                    Currently assigned: <strong>{rec.final_level}</strong>
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminRecitationSession;
