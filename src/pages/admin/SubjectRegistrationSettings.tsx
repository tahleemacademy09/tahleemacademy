// src/pages/admin/SubjectRegistrationSettings.tsx
// Admin toggle for the SUBJECT registration portal — separate from
// /admin/registration-settings (which controls new-student sign-up).
// When open (and before any deadline), students can browse and register for
// subjects (classes) at their class/level on /student/register-subjects.
// When closed — manually, or because the deadline has passed — that page
// shows the closed message instead.
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useSubjectRegistrationSettings, SubjectRegistrationConfig } from "@/hooks/useSubjectRegistrationSettings";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { BookOpen, Lock, Unlock, AlertTriangle, Loader2, Bell, CalendarClock, X } from "lucide-react";

const G = "#064E3B";

const Sec = ({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) => (
  <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB", overflow: "hidden", marginBottom: 14 }}>
    <div style={{ padding: "11px 16px", background: "#F9FAFB", borderBottom: "1px solid #E5E7EB", display: "flex", alignItems: "center", gap: 8 }}>
      {icon}<p style={{ fontWeight: 800, fontSize: 12, color: "#374151", margin: 0, textTransform: "uppercase" as const, letterSpacing: .5 }}>{title}</p>
    </div>
    <div style={{ padding: "14px 16px" }}>{children}</div>
  </div>
);

// datetime-local inputs need "YYYY-MM-DDTHH:mm" in local time, no timezone.
const isoToLocalInput = (iso: string): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const localInputToIso = (local: string): string => {
  if (!local) return "";
  const d = new Date(local);
  return isNaN(d.getTime()) ? "" : d.toISOString();
};

export default function SubjectRegistrationSettings() {
  const { user }  = useAuth();
  const { toast } = useToast();
  const { config: serverConfig, loading, saveAll } = useSubjectRegistrationSettings();

  const [draft, setDraft]             = useState<SubjectRegistrationConfig | null>(null);
  const [saving, setSaving]           = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingOpen, setPendingOpen] = useState<boolean | null>(null);

  useEffect(() => {
    if (!loading && serverConfig) setDraft({ ...serverConfig });
  }, [loading, serverConfig]);

  if (loading || !draft) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
      <Loader2 size={28} style={{ animation: "spin .8s linear infinite", color: G }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const d = draft;
  const set = (patch: Partial<SubjectRegistrationConfig>) => setDraft(prev => prev ? { ...prev, ...patch } : prev);

  const deadlinePassed = !!d.subject_registration_deadline && new Date(d.subject_registration_deadline).getTime() < Date.now();
  const effectivelyOpen = d.subject_registration_open && !deadlinePassed;

  const handleToggleOpen = (v: boolean) => { setPendingOpen(v); setShowConfirm(true); };

  const confirmToggle = async () => {
    if (pendingOpen === null) return;
    const newDraft = { ...d, subject_registration_open: pendingOpen };
    setDraft(newDraft);
    setShowConfirm(false);
    setSaving(true);
    await saveAll(newDraft, user?.id);
    setSaving(false);
    toast({ title: pendingOpen ? "✅ Subject registration is now OPEN" : "✅ Subject registration is now CLOSED" });
    setPendingOpen(null);
  };

  const handleSaveAll = async () => {
    setSaving(true);
    await saveAll(d, user?.id);
    setSaving(false);
    toast({ title: "✅ Subject registration settings saved" });
  };

  const extendDeadline = async (newIso: string) => {
    const newDraft = { ...d, subject_registration_deadline: newIso };
    setDraft(newDraft);
    setSaving(true);
    await saveAll(newDraft, user?.id);
    setSaving(false);
    toast({ title: newIso ? "✅ Deadline updated" : "✅ Deadline removed" });
  };

  const inp: React.CSSProperties = { width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E5E7EB", fontSize: 13, outline: "none", background: "#FAFAFA", boxSizing: "border-box" as const };

  return (
    <div style={{ minHeight: "100vh", background: "#F3F4F6" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <div style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: effectivelyOpen ? "#F0FDF4" : "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {effectivelyOpen ? <Unlock size={22} color="#16A34A" /> : <Lock size={22} color="#DC2626" />}
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 18, fontWeight: 800, color: "#111", margin: 0 }}>Subject Registration Portal</h1>
            <p style={{ fontSize: 12, color: "#6B7280", margin: 0 }}>Controls whether students can register for subjects (classes) at their level</p>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "16px" }}>

        {deadlinePassed && d.subject_registration_open && (
          <div style={{ background: "#FEF3C7", border: "1px solid #FCD34D", borderRadius: 14, padding: "12px 14px", marginBottom: 14, display: "flex", gap: 10, alignItems: "flex-start" }}>
            <CalendarClock size={18} color="#92400E" style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <p style={{ fontWeight: 700, fontSize: 13, color: "#92400E", margin: 0 }}>Deadline has passed</p>
              <p style={{ fontSize: 12, color: "#92400E", margin: "2px 0 0" }}>
                The portal is showing CLOSED to students even though the manual toggle is still on. Extend the deadline below, or clear it, to reopen.
              </p>
            </div>
          </div>
        )}

        <Sec title="Master Gate" icon={<BookOpen size={14} color={G} />}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0" }}>
            <div>
              <p style={{ fontWeight: 700, fontSize: 14, color: "#111", margin: 0 }}>
                {effectivelyOpen ? "Portal is OPEN" : "Portal is CLOSED"}
              </p>
              <p style={{ fontSize: 12, color: "#9CA3AF", margin: 0 }}>
                {effectivelyOpen
                  ? "Students can browse and register for subjects at their class/level right now."
                  : deadlinePassed && d.subject_registration_open
                    ? "Closed automatically — the registration deadline has passed."
                    : "Students see a closed message and cannot register for any subject."}
              </p>
            </div>
            <Switch checked={d.subject_registration_open} onCheckedChange={handleToggleOpen} />
          </div>
          <p style={{ fontSize: 11.5, color: "#9CA3AF", marginTop: 10, lineHeight: 1.6 }}>
            Only subjects matching a student's own level/class are ever shown to them — this toggle just controls
            whether the registration step itself is available. Once a student registers for a subject, any test or
            exam a teacher creates for that subject (set in the Subject field on the exam editor) will appear for
            them; students who haven't registered for a subject won't see its tests or exams, whether the teacher
            assigned them individually, by level, or the student self-registered for an open exam. Exams left
            without a subject stay visible to everyone at the matching level, as before.
          </p>
        </Sec>

        <Sec title="Registration Deadline" icon={<CalendarClock size={14} color={G} />}>
          <p style={{ fontSize: 12, color: "#6B7280", margin: "0 0 10px", lineHeight: 1.6 }}>
            Optional. Once this passes, the portal auto-closes even if the toggle above stays on — no need to
            remember to switch it off. To extend registration, push this date forward. Leave empty for no deadline.
          </p>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" as const }}>
            <input
              type="datetime-local"
              value={isoToLocalInput(d.subject_registration_deadline)}
              onChange={e => set({ subject_registration_deadline: localInputToIso(e.target.value) })}
              style={{ ...inp, flex: "1 1 220px" }}
            />
            {d.subject_registration_deadline && (
              <button onClick={() => extendDeadline("")} title="Clear deadline"
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer", fontSize: 12.5, fontWeight: 700, color: "#6B7280" }}>
                <X size={13} /> Clear
              </button>
            )}
            <button onClick={() => extendDeadline(d.subject_registration_deadline)} disabled={saving}
              style={{ padding: "9px 14px", borderRadius: 10, border: "none", background: G, color: "#fff", cursor: saving ? "not-allowed" : "pointer", fontSize: 12.5, fontWeight: 700 }}>
              {saving ? "Saving…" : "Save Deadline"}
            </button>
          </div>
          {d.subject_registration_deadline && (
            <p style={{ fontSize: 11.5, marginTop: 8, color: deadlinePassed ? "#DC2626" : "#16A34A", fontWeight: 700 }}>
              {deadlinePassed ? "⏰ This deadline has already passed." : `⏳ Closes ${new Date(d.subject_registration_deadline).toLocaleString()}`}
            </p>
          )}
        </Sec>

        <Sec title="Website Messages" icon={<Bell size={14} color={G} />}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>Open Message</label>
            <textarea rows={2} style={{ ...inp, resize: "none" }} value={d.subject_registration_message}
              onChange={e => set({ subject_registration_message: e.target.value })} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>رسالة الفتح (العربية)</label>
            <textarea rows={2} style={{ ...inp, resize: "none", direction: "rtl" }} value={d.subject_registration_message_ar}
              onChange={e => set({ subject_registration_message_ar: e.target.value })} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>Closed Message</label>
            <textarea rows={2} style={{ ...inp, resize: "none" }} value={d.subject_registration_closed_message}
              onChange={e => set({ subject_registration_closed_message: e.target.value })} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>رسالة الإغلاق (العربية)</label>
            <textarea rows={2} style={{ ...inp, resize: "none", direction: "rtl" }} value={d.subject_registration_closed_message_ar}
              onChange={e => set({ subject_registration_closed_message_ar: e.target.value })} />
          </div>
        </Sec>

        <button onClick={handleSaveAll} disabled={saving}
          style={{ width: "100%", padding: "14px 0", borderRadius: 13, border: "none", cursor: saving ? "not-allowed" : "pointer", fontWeight: 800, fontSize: 15, color: "#fff", background: saving ? "#9CA3AF" : G, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 24 }}>
          {saving ? <><Loader2 size={16} style={{ animation: "spin .8s linear infinite" }} /> Saving…</> : "Save All Settings"}
        </button>
      </div>

      <Dialog open={showConfirm} onOpenChange={v => !v && setShowConfirm(false)}>
        <DialogContent style={{ maxWidth: 380, borderRadius: 20, padding: 28, textAlign: "center" }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", background: pendingOpen ? "#F0FDF4" : "#FEF2F2" }}>
            <AlertTriangle size={26} color={pendingOpen ? "#16A34A" : "#DC2626"} />
          </div>
          <h3 style={{ fontWeight: 800, fontSize: 17, marginBottom: 8 }}>
            {pendingOpen ? "Open Subject Registration?" : "Close Subject Registration?"}
          </h3>
          <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 20, lineHeight: 1.6 }}>
            {pendingOpen
              ? "Students will immediately be able to register for subjects matching their level (unless a past deadline is still set)."
              : "Students will no longer be able to register for new subjects. Existing registrations are unaffected."}
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setShowConfirm(false)}
              style={{ flex: 1, padding: 12, borderRadius: 12, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>Cancel</button>
            <button onClick={confirmToggle}
              style={{ flex: 1, padding: 12, borderRadius: 12, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13, color: "#fff", background: pendingOpen ? "#16A34A" : "#DC2626" }}>
              {pendingOpen ? "Open Now" : "Close Now"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
