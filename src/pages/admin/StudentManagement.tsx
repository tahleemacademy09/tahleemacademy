// src/pages/admin/StudentManagement.tsx
// ADDED: Create User (admin generates account + passcode for student/teacher)
// FIXED: Permanent delete now calls admin-delete-user edge function (service role)
//        which calls auth.admin.deleteUser() — cascades to ALL related data.

import { useEffect, useState, useMemo, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAcademicLevels, getLevelConfig, getLevelDisplay } from "@/hooks/useAcademicLevels";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import {
  Search, User, Users, Eye, Edit2,
  Bell, Trash2, Filter, Plus, X, RefreshCw, AlertTriangle,
  Send, Loader2, Copy, CheckCheck, ShieldCheck, Clock, Activity,
  BookOpen,
} from "lucide-react";

const G      = "#064E3B";
const ROLES  = ["student", "teacher", "admin"] as const;
const STUDENT_TYPES = ["general", "private"] as const;

const studentTypeColor: Record<string, { bg: string; text: string; border: string; icon: string }> = {
  general: { bg: "#F0FDF4", text: "#166534", border: "#86EFAC", icon: "👥" },
  private: { bg: "#FDF4FF", text: "#7C3AED", border: "#D8B4FE", icon: "🔒" },
};

const roleColor: Record<string, { bg: string; text: string; border: string }> = {
  student: { bg: "#EFF6FF", text: "#1D4ED8", border: "#93C5FD" },
  teacher: { bg: "#F0FDF4", text: "#166534", border: "#86EFAC" },
  admin:   { bg: "#FDF4FF", text: "#7C3AED", border: "#D8B4FE" },
};

const inp: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #E5E7EB",
  fontSize: 13, outline: "none", background: "#FAFAFA", boxSizing: "border-box" as const, fontFamily: "inherit",
};

// ─── Passcode display after creation ────────────────────────────────────────
function PasscodeModal({ data, onClose }: { data: { passcode: string; student_id: string; email: string }; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const text = `Tahleem Academy Login\nEmail: ${data.email}\nTemporary Passcode: ${data.passcode}\nStudent ID: ${data.student_id}\n\nLogin at: ${window.location.origin}/login\nYou will be asked to set a new password on first login.`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 24, width: "100%", maxWidth: 420, overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,.2)" }}>
        <div style={{ background: `linear-gradient(135deg, ${G}, #075E54)`, padding: "24px 24px 20px", textAlign: "center" }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: "rgba(255,255,255,.15)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
            <ShieldCheck size={28} color="#fff" />
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 900, color: "#fff", margin: "0 0 4px" }}>Account Created! 🎉</h2>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,.75)", margin: 0 }}>Share these credentials with the user</p>
        </div>

        <div style={{ padding: "20px 24px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Credentials */}
          <div style={{ background: "#F0FDF4", border: "1.5px solid #86EFAC", borderRadius: 14, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <p style={{ fontSize: 10, fontWeight: 800, color: "#6B7280", margin: "0 0 3px", textTransform: "uppercase", letterSpacing: ".07em" }}>Email</p>
              <p style={{ fontSize: 14, fontWeight: 700, color: "#111", margin: 0, wordBreak: "break-all" }}>{data.email}</p>
            </div>
            <div>
              <p style={{ fontSize: 10, fontWeight: 800, color: "#6B7280", margin: "0 0 3px", textTransform: "uppercase", letterSpacing: ".07em" }}>Temporary Passcode</p>
              <p style={{ fontSize: 22, fontWeight: 900, color: G, margin: 0, letterSpacing: ".12em", fontFamily: "monospace" }}>{data.passcode}</p>
            </div>
            <div>
              <p style={{ fontSize: 10, fontWeight: 800, color: "#6B7280", margin: "0 0 3px", textTransform: "uppercase", letterSpacing: ".07em" }}>Student ID</p>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#374151", margin: 0 }}>{data.student_id}</p>
            </div>
          </div>

          <div style={{ padding: "10px 14px", borderRadius: 10, background: "#FFFBEB", border: "1px solid #FDE68A", fontSize: 12, color: "#92400E", lineHeight: 1.5 }}>
            ⚠️ The user will be prompted to set a new password on first login. This passcode is shown only once.
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={copy} style={{ flex: 2, padding: "12px", borderRadius: 12, border: "none", background: copied ? "#D1FAE5" : `linear-gradient(135deg,${G},#075E54)`, color: copied ? "#065F46" : "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all .2s" }}>
              {copied ? <><CheckCheck size={15} /> Copied!</> : <><Copy size={15} /> Copy Credentials</>}
            </button>
            <button onClick={onClose} style={{ flex: 1, padding: "12px", borderRadius: 12, border: "1.5px solid #E5E7EB", background: "#fff", color: "#374151", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Create User Dialog ───────────────────────────────────────────────────────
function CreateUserDialog({ session, onCreated, onClose }: { session: any; onCreated: (d: any) => void; onClose: () => void }) {
  const { data: academicLevels = [] } = useAcademicLevels();
  const LEVELS = academicLevels.map(l => l.slug);
  const { toast } = useToast();
  const [form, setForm]     = useState({ email: "", full_name: "", full_name_ar: "", role: "student" as string, level: "", student_type: "general" as string });
  const [creating, setCreating] = useState(false);

  const create = async () => {
    if (!form.email.trim() || !form.full_name.trim()) {
      toast({ title: "Email and full name are required", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-create-user", {
        body: {
          email:        form.email.trim().toLowerCase(),
          full_name:    form.full_name.trim(),
          full_name_ar: form.full_name_ar.trim() || undefined,
          role:         form.role,
          level:        form.level || undefined,
          student_type: form.role === "student" ? (form.student_type || "general") : undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      onCreated({ ...data, email: form.email.trim().toLowerCase() });
    } catch (e: any) {
      toast({ title: "Failed to create user", description: e.message, variant: "destructive" });
    }
    setCreating(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 460, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #E5E7EB", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: "#111", margin: 0 }}>Create New User</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#9CA3AF" }}>×</button>
        </div>

        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ padding: "12px 14px", borderRadius: 10, background: "#EFF6FF", border: "1px solid #93C5FD", fontSize: 12, color: "#1D4ED8", lineHeight: 1.5 }}>
            ℹ️ A temporary passcode will be generated. The user must set a new password on first login.
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 5 }}>Email Address *</label>
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="user@example.com" style={inp} />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 5 }}>Full Name (English) *</label>
            <input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="e.g. Aisha Muhammad" style={inp} />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 5 }}>Full Name (Arabic)</label>
            <input value={form.full_name_ar} onChange={e => setForm(f => ({ ...f, full_name_ar: e.target.value }))} placeholder="مثال: عائشة محمد" style={{ ...inp, direction: "rtl", fontFamily: "'Amiri', serif" }} />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>Role *</label>
            <div style={{ display: "flex", gap: 8 }}>
              {ROLES.map(r => {
                const rc = roleColor[r]; const sel = form.role === r;
                return (
                  <button key={r} onClick={() => setForm(f => ({ ...f, role: r }))} style={{ flex: 1, padding: "9px 6px", borderRadius: 10, border: `2px solid ${sel ? rc.border : "#E5E7EB"}`, background: sel ? rc.bg : "#fff", color: rc.text, fontWeight: sel ? 800 : 500, fontSize: 12, cursor: "pointer", transition: "all .15s" }}>
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 5 }}>Level</label>
            <select value={form.level} onChange={e => setForm(f => ({ ...f, level: e.target.value }))} style={inp}>
              <option value="">— Not assigned —</option>
              {LEVELS.map(l => { const al = academicLevels.find(a => a.slug === l); return <option key={l} value={l}>{al?.name_en || l}</option>; })}
            </select>
          </div>

          {form.role === "student" && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>Student Type</label>
              <div style={{ display: "flex", gap: 10 }}>
                {STUDENT_TYPES.map(t => {
                  const sc = studentTypeColor[t]; const sel = form.student_type === t;
                  return (
                    <button key={t} onClick={() => setForm(f => ({ ...f, student_type: t }))} style={{ flex: 1, padding: "11px 10px", borderRadius: 12, border: `2px solid ${sel ? sc.border : "#E5E7EB"}`, background: sel ? sc.bg : "#fff", color: sel ? sc.text : "#6B7280", fontWeight: sel ? 800 : 500, fontSize: 13, cursor: "pointer", transition: "all .15s", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: 20 }}>{sc.icon}</span>
                      <span>{t.charAt(0).toUpperCase() + t.slice(1)}</span>
                      <span style={{ fontSize: 10, fontWeight: 400, color: "#9CA3AF" }}>{t === "private" ? "Separate data, 1-on-1" : "Standard group access"}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <button
            onClick={create}
            disabled={creating || !form.email.trim() || !form.full_name.trim()}
            style={{
              padding: "13px", borderRadius: 12, border: "none",
              background: creating || !form.email.trim() || !form.full_name.trim() ? "#E5E7EB" : `linear-gradient(135deg,${G},#075E54)`,
              color: creating || !form.email.trim() || !form.full_name.trim() ? "#9CA3AF" : "#fff",
              fontWeight: 800, fontSize: 15, cursor: creating || !form.email.trim() || !form.full_name.trim() ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            {creating ? <><Loader2 size={15} style={{ animation: "spin .8s linear infinite" }} /> Creating…</> : "✨ Create Account & Generate Passcode"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function StudentManagement() {
  const { user: currentUser, session } = useAuth();
  const { data: academicLevels = [] } = useAcademicLevels();
  const LEVELS = academicLevels.map(l => l.slug);
  const { toast }  = useToast();
  const navigate   = useNavigate();

  const [users,       setUsers]       = useState<any[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState("");
  const [roleFilter,  setRoleFilter]  = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");
  const [typeFilter,  setTypeFilter]  = useState("all");

  // Dialogs
  const [editUser,      setEditUser]      = useState<any | null>(null);
  const [editForm,      setEditForm]      = useState<any>({});
  const [allSubjects,   setAllSubjects]   = useState<any[]>([]);
  const [assignedSubjectIds, setAssignedSubjectIds] = useState<Set<string>>(new Set());
  const [subjectSaving, setSubjectSaving] = useState(false);
  const [notifDialog,   setNotifDialog]   = useState(false);
  const [notifMsg,      setNotifMsg]      = useState("");
  const [notifTitle,    setNotifTitle]    = useState("");
  const [notifTarget,   setNotifTarget]   = useState<string[]>([]);
  const [saving,        setSaving]        = useState(false);
  const [sending,       setSending]       = useState(false);
  const [deleting,      setDeleting]      = useState<string | null>(null);
  const [deleteDialog,  setDeleteDialog]  = useState<any | null>(null);
  const [createDialog,  setCreateDialog]  = useState(false);
  const [newUserData,   setNewUserData]   = useState<any | null>(null);

  // ── Load users ──────────────────────────────────────────────────────────
  const loadUsers = async () => {
    setLoading(true);
    try {
      const { data: profiles } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
      const { data: roles }    = await supabase.from("user_roles").select("user_id,role");
      // Fetch last sign-in via RPC (reads auth.users safely)
      let loginMap: Record<string, string> = {};
      try {
        const { data: loginData } = await supabase.rpc("get_users_last_login" as any);
        if (loginData) loginData.forEach((r: any) => { loginMap[r.user_id] = r.last_sign_in_at; });
      } catch { /* RPC may not exist yet — graceful fallback */ }
      const roleMap: Record<string, string[]> = {};
      (roles || []).forEach((r: any) => { if (!roleMap[r.user_id]) roleMap[r.user_id] = []; roleMap[r.user_id].push(r.role); });
      setUsers((profiles || []).map((p: any) => ({ ...p, roles: roleMap[p.user_id] || ["student"], last_sign_in_at: loginMap[p.user_id] || null })));
    } catch { toast({ title: "Error loading users", variant: "destructive" }); }
    setLoading(false);
  };

  useEffect(() => { loadUsers(); }, []);

  const filtered = useMemo(() => users.filter(u => {
    const q = search.toLowerCase();
    const matchSearch = !q || u.full_name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.student_id?.includes(q);
    const matchRole   = roleFilter  === "all" || u.roles.includes(roleFilter);
    const matchLevel  = levelFilter === "all" || u.level === levelFilter || u.course_level === levelFilter;
    const studentTypeVal = u.student_type || "general";
    const matchType   = typeFilter === "all" || studentTypeVal === typeFilter;
    return matchSearch && matchRole && matchLevel && matchType;
  }), [users, search, roleFilter, levelFilter, typeFilter]);

  // ── Save edit ────────────────────────────────────────────────────────────
  const openEdit = useCallback(async (u: any) => {
    setEditUser(u);
    setEditForm({ full_name: u.full_name || "", full_name_ar: u.full_name_ar || "", level: u.level || u.course_level || "", phone: u.phone || "", country: u.country || "", roles: [...u.roles], student_type: u.student_type || "general", allow_general_access: u.allow_general_access ?? false });
    // Load all active subjects
    const { data: subs } = await supabase.from("subjects").select("id, title, title_ar, levels").eq("is_active", true).order("title");
    setAllSubjects(subs || []);
    // Load already-assigned subjects for this student
    if (u.student_type === "private" || true) {
      const { data: existing } = await supabase.from("private_student_subjects" as any).select("subject_id").eq("student_id", u.user_id);
      setAssignedSubjectIds(new Set((existing || []).map((r: any) => r.subject_id)));
    }
  }, []);

  const toggleSubjectAssignment = async (subjectId: string, studentId: string) => {
    setSubjectSaving(true);
    const isAssigned = assignedSubjectIds.has(subjectId);
    if (isAssigned) {
      await supabase.from("private_student_subjects" as any).delete().eq("student_id", studentId).eq("subject_id", subjectId);
      setAssignedSubjectIds(prev => { const next = new Set(prev); next.delete(subjectId); return next; });
    } else {
      await supabase.from("private_student_subjects" as any).insert({ student_id: studentId, subject_id: subjectId, assigned_by: user?.id } as any);
      setAssignedSubjectIds(prev => new Set([...prev, subjectId]));
    }
    setSubjectSaving(false);
  };

  const saveEdit = async () => {
    if (!editUser) return;
    setSaving(true);
    try {
      await supabase.from("profiles").update({
        full_name:    editForm.full_name,
        full_name_ar: editForm.full_name_ar || null,
        level:        editForm.level        || null,
        course_level: editForm.level        || null,
        phone:        editForm.phone        || null,
        country:      editForm.country      || null,
        student_type: editForm.student_type || null,
        allow_general_access: editForm.allow_general_access ?? false,
        updated_at:   new Date().toISOString(),
      }).eq("user_id", editUser.user_id);

      const desiredRoles: string[] = editForm.roles || ["student"];
      const currentRoles: string[] = editUser.roles || ["student"];
      const toAdd    = desiredRoles.filter((r: string) => !currentRoles.includes(r));
      const toRemove = currentRoles.filter((r: string) => !desiredRoles.includes(r));
      for (const r of toAdd)    await supabase.from("user_roles").insert({ user_id: editUser.user_id, role: r } as any);
      for (const r of toRemove) await supabase.from("user_roles").delete().eq("user_id", editUser.user_id).eq("role", r as any);

      toast({ title: "✅ User updated" }); setEditUser(null); await loadUsers();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    setSaving(false);
  };

  // ── Send notification ────────────────────────────────────────────────────
  const sendNotification = async () => {
    if (!notifTitle || !notifMsg) { toast({ title: "Title and message required", variant: "destructive" }); return; }
    setSending(true);
    try {
      const targets = notifTarget.length > 0 ? notifTarget : filtered.map(u => u.user_id);
      await supabase.from("notifications" as any).insert(
        targets.map(uid => ({ user_id: uid, title: notifTitle, message: notifMsg, type: "admin_announcement", is_read: false, created_at: new Date().toISOString() }))
      );
      toast({ title: `✅ Sent to ${targets.length} user${targets.length !== 1 ? "s" : ""}` });
      setNotifDialog(false); setNotifTitle(""); setNotifMsg(""); setNotifTarget([]);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    setSending(false);
  };

  // ── PERMANENT DELETE — calls edge function (service role) ────────────────
  const deleteAccount = async (user: any) => {
    setDeleting(user.user_id);
    try {
      const { data, error } = await supabase.functions.invoke("admin-delete-user", {
        body: { target_user_id: user.user_id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: `✅ Account deleted`,
        description: `"${user.full_name || user.email}" has been permanently removed. They can re-register with the same email.`,
      });
      setDeleteDialog(null);
      await loadUsers();
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    }
    setDeleting(null);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#F3F4F6" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <h1 style={{ fontSize: 17, fontWeight: 800, color: "#111", margin: 0 }}>User Management</h1>
            <p style={{ fontSize: 11, color: "#6B7280", margin: 0 }}>{users.length} total · {filtered.length} shown</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {/* Create User */}
            <button
              onClick={() => setCreateDialog(true)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, border: "none", background: `linear-gradient(135deg,${G},#075E54)`, color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer" }}
            >
              <Plus size={13} /> Create User
            </button>
            <button onClick={() => setNotifDialog(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, border: "1.5px solid #E5E7EB", background: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", color: "#374151" }}>
              <Bell size={13} /> Notify
            </button>
            <button onClick={loadUsers} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 10, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer" }}>
              <RefreshCw size={14} color="#6B7280" />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
            <Search size={13} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email, ID…" style={{ ...inp, paddingLeft: 28 }} />
          </div>
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={{ ...inp, width: "auto", minWidth: 110 }}>
            <option value="all">All Roles</option>
            {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
          </select>
          <select value={levelFilter} onChange={e => setLevelFilter(e.target.value)} style={{ ...inp, width: "auto", minWidth: 130 }}>
            <option value="all">All Levels</option>
            {academicLevels.map(l => <option key={l.slug} value={l.slug}>{l.name_en}</option>)}
          </select>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ ...inp, width: "auto", minWidth: 130 }}>
            <option value="all">All Types</option>
            <option value="general">👥 General</option>
            <option value="private">🔒 Private</option>
          </select>
        </div>
      </div>

      <div style={{ padding: 16, maxWidth: 800, margin: "0 auto" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 60 }}><Loader2 size={28} style={{ animation: "spin .8s linear infinite", color: G }} /></div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: "#9CA3AF" }}>
            <Users size={48} style={{ margin: "0 auto 12px", display: "block" }} />
            <p>No users found</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.map(u => (
              <div key={u.user_id} style={{ background: "#fff", borderRadius: 14, border: "1px solid #E5E7EB", padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                {u.avatar_url ? (
                  <img src={u.avatar_url} style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 44, height: 44, borderRadius: "50%", background: G, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: 18, fontWeight: 900, color: "#fff" }}>{(u.full_name || u.email || "U")[0].toUpperCase()}</span>
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 800, fontSize: 13, color: "#111", margin: "0 0 2px" }}>{u.full_name || "—"}</p>
                  <p style={{ fontSize: 11, color: "#9CA3AF", margin: "0 0 5px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email} · ID: {u.student_id || "—"}</p>
                  {u.last_sign_in_at && (
                    <p style={{ fontSize: 10, color: "#059669", margin: "0 0 5px", display:"flex", alignItems:"center", gap:3 }}>
                      <Activity size={9} /> Last login: {new Date(u.last_sign_in_at).toLocaleString()}
                    </p>
                  )}
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {(u.roles || ["student"]).map((r: string) => {
                      const rc = roleColor[r] || { bg: "#F3F4F6", text: "#374151", border: "#D1D5DB" };
                      return <span key={r} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, background: rc.bg, color: rc.text, border: `1px solid ${rc.border}`, fontWeight: 700 }}>{r}</span>;
                    })}
                    {(u.level || u.course_level) && (
                      <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, background: "#FFFBEB", color: "#92400E", border: "1px solid #FDE68A", fontWeight: 700 }}>
                        {u.level || u.course_level}
                      </span>
                    )}
                    {u.roles.includes("student") && (() => {
                      const st = u.student_type || "general";
                      const sc = studentTypeColor[st] || studentTypeColor.general;
                      return (
                        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: sc.bg, color: sc.text, border: `1px solid ${sc.border}`, fontWeight: 700 }}>
                          {sc.icon} {st.charAt(0).toUpperCase() + st.slice(1)}
                        </span>
                      );
                    })()}
                    {u.country && <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, background: "#F3F4F6", color: "#6B7280" }}>{u.country}</span>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button onClick={() => navigate(`/admin/students/${u.user_id}/view`)} title="View as student" style={{ padding: "7px 9px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", cursor: "pointer" }}>
                    <Eye size={13} color="#6B7280" />
                  </button>
                  <button onClick={() => openEdit(u)} style={{ padding: "7px 9px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", cursor: "pointer" }}>
                    <Edit2 size={13} color={G} />
                  </button>
                  <button onClick={() => { setNotifTarget([u.user_id]); setNotifDialog(true); }} style={{ padding: "7px 9px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", cursor: "pointer" }}>
                    <Bell size={13} color="#6B7280" />
                  </button>
                  {u.user_id !== currentUser?.id && (
                    <button onClick={() => setDeleteDialog(u)} style={{ padding: "7px 9px", borderRadius: 8, border: "1px solid #FEE2E2", background: "#FEF2F2", cursor: "pointer" }}>
                      <Trash2 size={13} color="#DC2626" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══ CREATE USER DIALOG ═════════════════════════════════════════ */}
      {createDialog && (
        <CreateUserDialog
          session={session}
          onClose={() => setCreateDialog(false)}
          onCreated={(data) => { setCreateDialog(false); setNewUserData(data); loadUsers(); }}
        />
      )}

      {/* ═══ PASSCODE DISPLAY ═══════════════════════════════════════════ */}
      {newUserData && (
        <PasscodeModal data={newUserData} onClose={() => setNewUserData(null)} />
      )}

      {/* ═══ EDIT USER DIALOG ══════════════════════════════════════════ */}
      {editUser && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 460, maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #E5E7EB", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: 15, fontWeight: 800, color: "#111", margin: 0 }}>Edit User</h2>
              <button onClick={() => setEditUser(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#9CA3AF" }}>×</button>
            </div>
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
              <div><label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>Full Name</label>
                <input value={editForm.full_name} onChange={e => setEditForm((f: any) => ({ ...f, full_name: e.target.value }))} style={inp} /></div>
              <div><label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>Full Name (Arabic)</label>
                <input value={editForm.full_name_ar} onChange={e => setEditForm((f: any) => ({ ...f, full_name_ar: e.target.value }))} style={{ ...inp, direction: "rtl", fontFamily: "'Amiri',serif" }} /></div>
              <div><label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>Phone</label>
                <input value={editForm.phone} onChange={e => setEditForm((f: any) => ({ ...f, phone: e.target.value }))} style={inp} /></div>
              <div><label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>Country</label>
                <input value={editForm.country} onChange={e => setEditForm((f: any) => ({ ...f, country: e.target.value }))} style={inp} /></div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>Level</label>
                <select value={editForm.level} onChange={e => setEditForm((f: any) => ({ ...f, level: e.target.value }))} style={inp}>
                  <option value="">— Not assigned —</option>
                  {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>Roles</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {ROLES.map(r => {
                    const rc = roleColor[r]; const sel = (editForm.roles || []).includes(r);
                    return (
                      <button key={r} onClick={() => {
                        const cur = editForm.roles || [];
                        setEditForm((f: any) => ({ ...f, roles: sel ? cur.filter((x: string) => x !== r) : [...cur, r] }));
                      }} style={{ flex: 1, padding: "8px 6px", borderRadius: 10, border: `2px solid ${sel ? rc.border : "#E5E7EB"}`, background: sel ? rc.bg : "#fff", color: rc.text, fontWeight: sel ? 800 : 500, fontSize: 11, cursor: "pointer" }}>
                        {r}
                      </button>
                    );
                  })}
                </div>
              </div>
              {(editForm.roles || []).includes("student") && (
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>Student Type</label>
                  <div style={{ display: "flex", gap: 10 }}>
                    {STUDENT_TYPES.map(t => {
                      const sc = studentTypeColor[t]; const sel = (editForm.student_type || "general") === t;
                      return (
                        <button key={t} onClick={() => setEditForm((f: any) => ({ ...f, student_type: t }))} style={{ flex: 1, padding: "11px 8px", borderRadius: 12, border: `2px solid ${sel ? sc.border : "#E5E7EB"}`, background: sel ? sc.bg : "#fff", color: sel ? sc.text : "#6B7280", fontWeight: sel ? 800 : 500, fontSize: 12, cursor: "pointer", transition: "all .15s", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                          <span style={{ fontSize: 18 }}>{sc.icon}</span>
                          <span>{t.charAt(0).toUpperCase() + t.slice(1)}</span>
                          <span style={{ fontSize: 10, fontWeight: 400, color: "#9CA3AF" }}>{t === "private" ? "1-on-1, separate data" : "Standard group"}</span>
                        </button>
                      );
                    })}
                  </div>
                  {editForm.student_type === "private" && (editForm.student_type !== (editUser?.student_type || "general")) && (
                    <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, background: "#FDF4FF", border: "1px solid #D8B4FE", fontSize: 11, color: "#7C3AED", lineHeight: 1.5 }}>
                      🔒 Changing to <strong>Private</strong> will move this student's data to the private pool. Their assigned teacher should be set separately.
                    </div>
                  )}
                  {/* allow_general_access toggle — only for private students */}
                  {(editForm.student_type || "general") === "private" && (
                    <div style={{ marginTop: 10, padding: "12px 14px", borderRadius: 12, background: "#FAFAFA", border: "1.5px solid #E5E7EB" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div>
                          <p style={{ fontSize: 12, fontWeight: 800, color: "#374151", margin: "0 0 2px" }}>Allow General Class Access</p>
                          <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>Let this private student also see the general timetable, live classes and subjects.</p>
                        </div>
                        <button
                          onClick={() => setEditForm((f: any) => ({ ...f, allow_general_access: !f.allow_general_access }))}
                          style={{
                            width: 48, height: 26, borderRadius: 13, border: "none", cursor: "pointer", flexShrink: 0, marginLeft: 12,
                            background: editForm.allow_general_access ? "#7C3AED" : "#D1D5DB",
                            position: "relative", transition: "background .2s",
                          }}
                        >
                          <span style={{
                            position: "absolute", top: 3, left: editForm.allow_general_access ? 25 : 3,
                            width: 20, height: 20, borderRadius: "50%", background: "#fff",
                            boxShadow: "0 1px 3px rgba(0,0,0,.2)", transition: "left .2s",
                          }} />
                        </button>
                      </div>
                      {editForm.allow_general_access && (
                        <p style={{ fontSize: 10, color: "#7C3AED", margin: "8px 0 0", fontWeight: 700 }}>
                          🔓 This student will see the general schedule in addition to their private sessions.
                        </p>
                      )}
                    </div>
                  )}

                  {/* ── Subject Assignment (private students) ── */}
                  {(editForm.student_type || "general") === "private" && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                        <div>
                          <p style={{ fontSize: 12, fontWeight: 800, color: "#374151", margin: "0 0 1px", display: "flex", alignItems: "center", gap: 6 }}>
                            <BookOpen style={{ width: 13, height: 13, color: "#7C3AED" }} />
                            Assigned Subjects
                          </p>
                          <p style={{ fontSize: 10, color: "#9CA3AF", margin: 0 }}>
                            {assignedSubjectIds.size} subject{assignedSubjectIds.size !== 1 ? "s" : ""} assigned — student sees only these
                          </p>
                        </div>
                        {subjectSaving && <Loader2 style={{ width: 14, height: 14, color: "#7C3AED", animation: "spin 1s linear infinite" }} />}
                      </div>

                      {allSubjects.length === 0 ? (
                        <div style={{ padding: "12px", borderRadius: 10, background: "#F9FAFB", border: "1px solid #E5E7EB", fontSize: 11, color: "#9CA3AF", textAlign: "center" }}>
                          No active subjects found
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 240, overflowY: "auto", paddingRight: 2 }}>
                          {allSubjects.map((sub: any) => {
                            const isAssigned = assignedSubjectIds.has(sub.id);
                            return (
                              <button key={sub.id}
                                onClick={() => editUser && toggleSubjectAssignment(sub.id, editUser.user_id)}
                                style={{
                                  display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                                  borderRadius: 10, border: `1.5px solid ${isAssigned ? "#D8B4FE" : "#E5E7EB"}`,
                                  background: isAssigned ? "#F3E8FF" : "#fff",
                                  cursor: "pointer", textAlign: "left", width: "100%", transition: "all .12s",
                                }}>
                                {/* Checkbox */}
                                <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${isAssigned ? "#7C3AED" : "#D1D5DB"}`, background: isAssigned ? "#7C3AED" : "#fff", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                  {isAssigned && <span style={{ color: "#fff", fontSize: 11, lineHeight: 1 }}>✓</span>}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <p style={{ fontSize: 12, fontWeight: isAssigned ? 800 : 500, color: isAssigned ? "#7C3AED" : "#374151", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {sub.title}
                                  </p>
                                  {sub.title_ar && (
                                    <p dir="rtl" style={{ fontSize: 10, color: "#9CA3AF", margin: "1px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      {sub.title_ar}
                                    </p>
                                  )}
                                </div>
                                {isAssigned && (
                                  <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 9, background: "#7C3AED", color: "#fff", fontWeight: 800, flexShrink: 0 }}>
                                    Assigned
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              <button onClick={saveEdit} disabled={saving} style={{ padding: "12px", borderRadius: 12, border: "none", background: saving ? "#e5e7eb" : `linear-gradient(135deg,${G},#075E54)`, color: saving ? "#9ca3af" : "#fff", fontWeight: 800, cursor: saving ? "not-allowed" : "pointer" }}>
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ NOTIFICATION DIALOG ══════════════════════════════════════ */}
      {notifDialog && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 440 }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #E5E7EB", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: 15, fontWeight: 800, color: "#111", margin: 0 }}>Send Notification</h2>
              <button onClick={() => { setNotifDialog(false); setNotifTarget([]); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#9CA3AF" }}>×</button>
            </div>
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ padding: "10px 14px", borderRadius: 10, background: "#F0FDF4", border: "1px solid #86EFAC", fontSize: 12, color: G }}>
                {notifTarget.length > 0 ? `Sending to ${notifTarget.length} selected user${notifTarget.length !== 1 ? "s" : ""}` : `Sending to all ${filtered.length} filtered users`}
              </div>
              <div><label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>Title</label>
                <input value={notifTitle} onChange={e => setNotifTitle(e.target.value)} style={inp} placeholder="Notification title…" /></div>
              <div><label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>Message</label>
                <textarea value={notifMsg} onChange={e => setNotifMsg(e.target.value)} rows={4} style={{ ...inp, resize: "vertical" as const }} placeholder="Type your message…" /></div>
              <button onClick={sendNotification} disabled={sending || !notifTitle || !notifMsg} style={{ padding: "12px", borderRadius: 12, border: "none", background: sending || !notifTitle || !notifMsg ? "#e5e7eb" : `linear-gradient(135deg,${G},#075E54)`, color: sending || !notifTitle || !notifMsg ? "#9ca3af" : "#fff", fontWeight: 800, cursor: sending || !notifTitle || !notifMsg ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <Send size={14} /> {sending ? "Sending…" : "Send Notification"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ DELETE CONFIRM DIALOG ════════════════════════════════════ */}
      {deleteDialog && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 420, padding: "28px 24px", textAlign: "center" }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#FEF2F2", border: "2px solid #FECACA", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <AlertTriangle size={30} color="#DC2626" />
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 900, color: "#DC2626", margin: "0 0 8px" }}>Delete Account?</h2>
            <p style={{ fontSize: 14, color: "#374151", margin: "0 0 6px", fontWeight: 700 }}>{deleteDialog.full_name || deleteDialog.email}</p>
            <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 20px", lineHeight: 1.6 }}>
              This will <strong>permanently delete ALL data</strong> for this account — exams, recitation, progress, and profile.
              <br /><br />
              <span style={{ color: "#16a34a", fontWeight: 700 }}>✓ They can re-register with the same email address.</span>
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setDeleteDialog(null)} style={{ flex: 1, padding: "12px", borderRadius: 12, border: "1.5px solid #E5E7EB", background: "#fff", color: "#374151", fontWeight: 700, cursor: "pointer" }}>
                Cancel
              </button>
              <button
                onClick={() => deleteAccount(deleteDialog)}
                disabled={deleting === deleteDialog?.user_id}
                style={{ flex: 1, padding: "12px", borderRadius: 12, border: "none", background: "#DC2626", color: "#fff", fontWeight: 800, cursor: deleting ? "not-allowed" : "pointer", opacity: deleting ? .5 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
              >
                {deleting === deleteDialog?.user_id
                  ? <><Loader2 size={14} style={{ animation: "spin .8s linear infinite" }} />Deleting…</>
                  : <><Trash2 size={14} />Delete Permanently</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

