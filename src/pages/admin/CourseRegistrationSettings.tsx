// src/pages/admin/CourseRegistrationSettings.tsx
// Admin toggle for the COURSE registration portal — separate from
// /admin/registration-settings (which controls new-student sign-up).
// When open, students can browse and register for courses at their
// class/level on /student/register-courses. When closed, that page shows
// the closed message instead.
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useCourseRegistrationSettings, CourseRegistrationConfig } from "@/hooks/useCourseRegistrationSettings";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { BookOpen, Lock, Unlock, AlertTriangle, Loader2, Bell } from "lucide-react";

const G = "#064E3B";

const Sec = ({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) => (
  <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB", overflow: "hidden", marginBottom: 14 }}>
    <div style={{ padding: "11px 16px", background: "#F9FAFB", borderBottom: "1px solid #E5E7EB", display: "flex", alignItems: "center", gap: 8 }}>
      {icon}<p style={{ fontWeight: 800, fontSize: 12, color: "#374151", margin: 0, textTransform: "uppercase" as const, letterSpacing: .5 }}>{title}</p>
    </div>
    <div style={{ padding: "14px 16px" }}>{children}</div>
  </div>
);

export default function CourseRegistrationSettings() {
  const { user }  = useAuth();
  const { toast } = useToast();
  const { config: serverConfig, loading, saveAll } = useCourseRegistrationSettings();

  const [draft, setDraft]             = useState<CourseRegistrationConfig | null>(null);
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
  const set = (patch: Partial<CourseRegistrationConfig>) => setDraft(prev => prev ? { ...prev, ...patch } : prev);

  const handleToggleOpen = (v: boolean) => { setPendingOpen(v); setShowConfirm(true); };

  const confirmToggle = async () => {
    if (pendingOpen === null) return;
    const newDraft = { ...d, course_registration_open: pendingOpen };
    setDraft(newDraft);
    setShowConfirm(false);
    setSaving(true);
    await saveAll(newDraft, user?.id);
    setSaving(false);
    toast({ title: pendingOpen ? "✅ Course registration is now OPEN" : "✅ Course registration is now CLOSED" });
    setPendingOpen(null);
  };

  const handleSaveAll = async () => {
    setSaving(true);
    await saveAll(d, user?.id);
    setSaving(false);
    toast({ title: "✅ Course registration settings saved" });
  };

  const inp: React.CSSProperties = { width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E5E7EB", fontSize: 13, outline: "none", background: "#FAFAFA", boxSizing: "border-box" as const };

  return (
    <div style={{ minHeight: "100vh", background: "#F3F4F6" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <div style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: d.course_registration_open ? "#F0FDF4" : "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {d.course_registration_open ? <Unlock size={22} color="#16A34A" /> : <Lock size={22} color="#DC2626" />}
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 18, fontWeight: 800, color: "#111", margin: 0 }}>Course Registration Portal</h1>
            <p style={{ fontSize: 12, color: "#6B7280", margin: 0 }}>Controls whether students can register for courses at their level</p>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "16px" }}>
        <Sec title="Master Gate" icon={<BookOpen size={14} color={G} />}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0" }}>
            <div>
              <p style={{ fontWeight: 700, fontSize: 14, color: "#111", margin: 0 }}>
                {d.course_registration_open ? "Portal is OPEN" : "Portal is CLOSED"}
              </p>
              <p style={{ fontSize: 12, color: "#9CA3AF", margin: 0 }}>
                {d.course_registration_open
                  ? "Students can browse and register for courses at their class/level right now."
                  : "Students see a closed message and cannot register for any course."}
              </p>
            </div>
            <Switch checked={d.course_registration_open} onCheckedChange={handleToggleOpen} />
          </div>
          <p style={{ fontSize: 11.5, color: "#9CA3AF", marginTop: 10, lineHeight: 1.6 }}>
            Only courses matching a student's own level/class are ever shown to them — this toggle just controls
            whether the registration step itself is available. Once a student registers for a course, any test or
            exam a teacher sets for that course will appear for them; students who haven't registered for a course
            won't see its tests or exams, whether the teacher assigned them individually, by level, or the student
            self-registered for an open exam.
          </p>
        </Sec>

        <Sec title="Website Messages" icon={<Bell size={14} color={G} />}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>Open Message</label>
            <textarea rows={2} style={{ ...inp, resize: "none" }} value={d.course_registration_message}
              onChange={e => set({ course_registration_message: e.target.value })} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>رسالة الفتح (العربية)</label>
            <textarea rows={2} style={{ ...inp, resize: "none", direction: "rtl" }} value={d.course_registration_message_ar}
              onChange={e => set({ course_registration_message_ar: e.target.value })} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>Closed Message</label>
            <textarea rows={2} style={{ ...inp, resize: "none" }} value={d.course_registration_closed_message}
              onChange={e => set({ course_registration_closed_message: e.target.value })} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>رسالة الإغلاق (العربية)</label>
            <textarea rows={2} style={{ ...inp, resize: "none", direction: "rtl" }} value={d.course_registration_closed_message_ar}
              onChange={e => set({ course_registration_closed_message_ar: e.target.value })} />
          </div>
        </Sec>

        <button onClick={handleSaveAll} disabled={saving}
          style={{ width: "100%", padding: "14px 0", borderRadius: 13, border: "none", cursor: saving ? "not-allowed" : "pointer", fontWeight: 800, fontSize: 15, color: "#fff", background: saving ? "#9CA3AF" : G, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 24 }}>
          {saving ? <><Loader2 size={16} style={{ animation: "spin .8s linear infinite" }} /> Saving…</> : "Save Messages"}
        </button>
      </div>

      <Dialog open={showConfirm} onOpenChange={v => !v && setShowConfirm(false)}>
        <DialogContent style={{ maxWidth: 380, borderRadius: 20, padding: 28, textAlign: "center" }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", background: pendingOpen ? "#F0FDF4" : "#FEF2F2" }}>
            <AlertTriangle size={26} color={pendingOpen ? "#16A34A" : "#DC2626"} />
          </div>
          <h3 style={{ fontWeight: 800, fontSize: 17, marginBottom: 8 }}>
            {pendingOpen ? "Open Course Registration?" : "Close Course Registration?"}
          </h3>
          <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 20, lineHeight: 1.6 }}>
            {pendingOpen
              ? "Students will immediately be able to register for courses matching their level."
              : "Students will no longer be able to register for new courses. Existing registrations are unaffected."}
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
