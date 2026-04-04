// src/pages/admin/StudentManagement.tsx
// Enhanced user management: view all users, change roles, levels, send notifications
// ADDED: Complete account deletion (all data wiped — person can re-register with same email)

import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import {
  Search, User, Users, Eye, Edit2, ShieldCheck, GraduationCap,
  Bell, Trash2, ChevronRight, Filter, UserCheck, BookOpen,
  Send, Loader2, Plus, X, Mail, RefreshCw, AlertTriangle,
} from "lucide-react";

const G    = "#064E3B";
const ROLES  = ["student","teacher","admin"] as const;
const LEVELS = ["beginner","intermediate","advanced"];

const roleColor: Record<string,{bg:string;text:string;border:string}> = {
  student: { bg:"#EFF6FF", text:"#1D4ED8", border:"#93C5FD" },
  teacher: { bg:"#F0FDF4", text:"#166534", border:"#86EFAC" },
  admin:   { bg:"#FDF4FF", text:"#7C3AED", border:"#D8B4FE" },
};

const inp: React.CSSProperties = {
  width:"100%", padding:"10px 12px", borderRadius:10, border:"1.5px solid #E5E7EB",
  fontSize:13, outline:"none", background:"#FAFAFA", boxSizing:"border-box" as const, fontFamily:"inherit",
};

export default function StudentManagement() {
  const { user: currentUser, hasRole } = useAuth();
  const { toast } = useToast();
  const navigate  = useNavigate();

  const [users,       setUsers]       = useState<any[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState("");
  const [roleFilter,  setRoleFilter]  = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");

  // Dialogs
  const [editUser,     setEditUser]     = useState<any|null>(null);
  const [editForm,     setEditForm]     = useState<any>({});
  const [notifDialog,  setNotifDialog]  = useState(false);
  const [notifMsg,     setNotifMsg]     = useState("");
  const [notifTitle,   setNotifTitle]   = useState("");
  const [notifTarget,  setNotifTarget]  = useState<string[]>([]);
  const [saving,       setSaving]       = useState(false);
  const [sending,      setSending]      = useState(false);
  const [deleting,     setDeleting]     = useState<string|null>(null);
  const [deleteDialog, setDeleteDialog] = useState<any|null>(null);

  // ── Load users ─────────────────────────────────────────────────────────
  const loadUsers = async () => {
    setLoading(true);
    try {
      const { data: profiles } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
      const { data: roles }    = await supabase.from("user_roles").select("user_id,role");
      const roleMap: Record<string,string[]> = {};
      (roles || []).forEach((r: any) => { if (!roleMap[r.user_id]) roleMap[r.user_id]=[]; roleMap[r.user_id].push(r.role); });
      const combined = (profiles || []).map((p: any) => ({ ...p, roles: roleMap[p.user_id] || ["student"] }));
      setUsers(combined);
    } catch { toast({ title:"Error loading users", variant:"destructive" }); }
    setLoading(false);
  };

  useEffect(() => { loadUsers(); }, []);

  // ── Filtered users ─────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return users.filter(u => {
      const q = search.toLowerCase();
      const matchSearch = !q || u.full_name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.student_id?.includes(q);
      const matchRole  = roleFilter  === "all" || u.roles.includes(roleFilter);
      const matchLevel = levelFilter === "all" || u.level === levelFilter || u.course_level === levelFilter;
      return matchSearch && matchRole && matchLevel;
    });
  }, [users, search, roleFilter, levelFilter]);

  // ── Save user edit ────────────────────────────────────────────────────
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
        updated_at:   new Date().toISOString(),
      }).eq("user_id", editUser.user_id);

      // Sync roles
      const desiredRoles: string[] = editForm.roles || ["student"];
      const currentRoles: string[] = editUser.roles || ["student"];
      const toAdd    = desiredRoles.filter((r: string) => !currentRoles.includes(r));
      const toRemove = currentRoles.filter((r: string) => !desiredRoles.includes(r));
      for (const r of toAdd)    await supabase.from("user_roles").insert({ user_id: editUser.user_id, role: r } as any);
      for (const r of toRemove) await supabase.from("user_roles").delete().eq("user_id", editUser.user_id).eq("role", r as any);

      toast({ title:"✅ User updated" }); setEditUser(null); await loadUsers();
    } catch (e: any) { toast({ title:"Error", description:e.message, variant:"destructive" }); }
    setSaving(false);
  };

  // ── Send notification ─────────────────────────────────────────────────
  const sendNotification = async () => {
    if (!notifTitle || !notifMsg) { toast({ title:"Title and message required", variant:"destructive" }); return; }
    setSending(true);
    try {
      const targets = notifTarget.length > 0 ? notifTarget : filtered.map(u => u.user_id);
      await supabase.from("notifications" as any).insert(
        targets.map(uid => ({ user_id: uid, title: notifTitle, message: notifMsg, type: "admin_announcement", is_read: false, created_at: new Date().toISOString() }))
      );
      toast({ title:`✅ Notification sent to ${targets.length} user${targets.length!==1?"s":""}` });
      setNotifDialog(false); setNotifTitle(""); setNotifMsg(""); setNotifTarget([]);
    } catch (e: any) { toast({ title:"Error", description:e.message, variant:"destructive" }); }
    setSending(false);
  };

  // ── DELETE ACCOUNT COMPLETELY ─────────────────────────────────────────
  const deleteAccount = async (user: any) => {
    setDeleting(user.user_id);
    try {
      // Delete in order (FK constraints)
      await supabase.from("notifications" as any).delete().eq("user_id", user.user_id);

      const { data: attempts } = await supabase.from("exam_attempts").select("id").eq("user_id", user.user_id);
      if (attempts?.length) {
        await supabase.from("exam_answers").delete().in("attempt_id", attempts.map((a:any)=>a.id));
      }
      await supabase.from("exam_attempts").delete().eq("user_id", user.user_id);
      await supabase.from("tasjeel_progress" as any).delete().eq("user_id", user.user_id);
      await (supabase as any).from("recitation_tests").delete().eq("user_id", user.user_id);
      await (supabase as any).from("onboarding_forms").delete().eq("user_id", user.user_id);
      await supabase.from("user_roles" as any).delete().eq("user_id", user.user_id);
      await (supabase as any).from("student_enrollments").delete().eq("user_id", user.user_id);
      await supabase.from("lesson_progress").delete().eq("user_id", user.user_id);
      await supabase.from("profiles").delete().eq("user_id", user.user_id);

      toast({ title:`✅ Account for "${user.full_name || user.email}" deleted`, description:"They can now re-register with the same email address." });
      setDeleteDialog(null);
      await loadUsers();
    } catch (e: any) {
      toast({ title:"Delete failed", description:e.message, variant:"destructive" });
    }
    setDeleting(null);
  };

  return (
    <div style={{ minHeight:"100vh", background:"#F3F4F6" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Header */}
      <div style={{ background:"#fff", borderBottom:"1px solid #E5E7EB", padding:"14px 16px" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
          <div>
            <h1 style={{ fontSize:17, fontWeight:800, color:"#111", margin:0 }}>User Management</h1>
            <p style={{ fontSize:11, color:"#6B7280", margin:0 }}>{users.length} total users · {filtered.length} shown</p>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={() => setNotifDialog(true)} style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 14px", borderRadius:10, border:"1.5px solid #E5E7EB", background:"#fff", fontSize:12, fontWeight:700, cursor:"pointer", color:"#374151" }}>
              <Bell size={13} /> Notify
            </button>
            <button onClick={loadUsers} style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 12px", borderRadius:10, border:"1.5px solid #E5E7EB", background:"#fff", cursor:"pointer" }}>
              <RefreshCw size={14} color="#6B7280" />
            </button>
          </div>
        </div>

        {/* Search + filters */}
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          <div style={{ position:"relative", flex:1, minWidth:180 }}>
            <Search size={13} style={{ position:"absolute", left:9, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF" }} />
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, email, ID…" style={{ ...inp, paddingLeft:28 }} />
          </div>
          <select value={roleFilter} onChange={e=>setRoleFilter(e.target.value)} style={{ ...inp, width:"auto", minWidth:110 }}>
            <option value="all">All Roles</option>
            {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
          </select>
          <select value={levelFilter} onChange={e=>setLevelFilter(e.target.value)} style={{ ...inp, width:"auto", minWidth:130 }}>
            <option value="all">All Levels</option>
            {LEVELS.map(l => <option key={l} value={l}>{l.charAt(0).toUpperCase()+l.slice(1)}</option>)}
          </select>
        </div>
      </div>

      <div style={{ padding:16, maxWidth:800, margin:"0 auto" }}>
        {loading ? (
          <div style={{ textAlign:"center", padding:60 }}><Loader2 size={28} style={{ animation:"spin .8s linear infinite", color:G }} /></div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign:"center", padding:60, color:"#9CA3AF" }}>
            <Users size={48} style={{ margin:"0 auto 12px", display:"block" }} />
            <p>No users found</p>
          </div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {filtered.map(u => (
              <div key={u.user_id} style={{ background:"#fff", borderRadius:14, border:"1px solid #E5E7EB", padding:"14px 16px", display:"flex", alignItems:"center", gap:12 }}>
                {u.avatar_url ? (
                  <img src={u.avatar_url} style={{ width:44, height:44, borderRadius:"50%", objectFit:"cover", flexShrink:0 }} />
                ) : (
                  <div style={{ width:44, height:44, borderRadius:"50%", background:G, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    <span style={{ fontSize:18, fontWeight:900, color:"#fff" }}>{(u.full_name||u.email||"U")[0].toUpperCase()}</span>
                  </div>
                )}
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontWeight:800, fontSize:13, color:"#111", margin:"0 0 2px" }}>{u.full_name || "—"}</p>
                  <p style={{ fontSize:11, color:"#9CA3AF", margin:"0 0 5px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{u.email} · ID: {u.student_id||"—"}</p>
                  <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                    {(u.roles||["student"]).map((r: string) => {
                      const rc = roleColor[r] || { bg:"#F3F4F6", text:"#374151", border:"#D1D5DB" };
                      return <span key={r} style={{ fontSize:10, padding:"2px 7px", borderRadius:20, background:rc.bg, color:rc.text, border:`1px solid ${rc.border}`, fontWeight:700 }}>{r}</span>;
                    })}
                    {(u.level || u.course_level) && (
                      <span style={{ fontSize:10, padding:"2px 7px", borderRadius:20, background:"#FFFBEB", color:"#92400E", border:"1px solid #FDE68A", fontWeight:700 }}>
                        {u.level || u.course_level}
                      </span>
                    )}
                    {u.country && <span style={{ fontSize:10, padding:"2px 7px", borderRadius:20, background:"#F3F4F6", color:"#6B7280" }}>{u.country}</span>}
                  </div>
                </div>
                <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                  <button onClick={() => navigate(`/admin/students/${u.user_id}/view`)} title="View as student" style={{ padding:"7px 9px", borderRadius:8, border:"1px solid #E5E7EB", background:"#fff", cursor:"pointer" }}>
                    <Eye size={13} color="#6B7280" />
                  </button>
                  <button onClick={() => { setEditUser(u); setEditForm({ full_name:u.full_name||"", full_name_ar:u.full_name_ar||"", level:u.level||u.course_level||"", phone:u.phone||"", country:u.country||"", roles:[...u.roles] }); }} style={{ padding:"7px 9px", borderRadius:8, border:"1px solid #E5E7EB", background:"#fff", cursor:"pointer" }}>
                    <Edit2 size={13} color={G} />
                  </button>
                  <button onClick={() => { setNotifTarget([u.user_id]); setNotifDialog(true); }} style={{ padding:"7px 9px", borderRadius:8, border:"1px solid #E5E7EB", background:"#fff", cursor:"pointer" }}>
                    <Bell size={13} color="#6B7280" />
                  </button>
                  {u.user_id !== currentUser?.id && (
                    <button onClick={() => setDeleteDialog(u)} style={{ padding:"7px 9px", borderRadius:8, border:"1px solid #FEE2E2", background:"#FEF2F2", cursor:"pointer" }}>
                      <Trash2 size={13} color="#DC2626" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══ EDIT USER DIALOG ══════════════════════════════════════════ */}
      {editUser && (
        <div style={{ position:"fixed", inset:0, zIndex:50, background:"rgba(0,0,0,.6)", display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
          <div style={{ background:"#fff", borderRadius:20, width:"100%", maxWidth:460, maxHeight:"90vh", overflowY:"auto" }}>
            <div style={{ padding:"16px 20px", borderBottom:"1px solid #E5E7EB", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <h2 style={{ fontSize:15, fontWeight:800, color:"#111", margin:0 }}>Edit User</h2>
              <button onClick={() => setEditUser(null)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:20, color:"#9CA3AF" }}>×</button>
            </div>
            <div style={{ padding:20, display:"flex", flexDirection:"column", gap:12 }}>
              <div><label style={{ fontSize:11, fontWeight:700, color:"#374151", display:"block", marginBottom:4 }}>Full Name</label>
                <input value={editForm.full_name} onChange={e=>setEditForm((f:any)=>({...f,full_name:e.target.value}))} style={inp} /></div>
              <div><label style={{ fontSize:11, fontWeight:700, color:"#374151", display:"block", marginBottom:4 }}>Full Name (Arabic)</label>
                <input value={editForm.full_name_ar} onChange={e=>setEditForm((f:any)=>({...f,full_name_ar:e.target.value}))} style={{...inp,direction:"rtl",fontFamily:"'Amiri',serif"}} /></div>
              <div><label style={{ fontSize:11, fontWeight:700, color:"#374151", display:"block", marginBottom:4 }}>Phone</label>
                <input value={editForm.phone} onChange={e=>setEditForm((f:any)=>({...f,phone:e.target.value}))} style={inp} /></div>
              <div><label style={{ fontSize:11, fontWeight:700, color:"#374151", display:"block", marginBottom:4 }}>Country</label>
                <input value={editForm.country} onChange={e=>setEditForm((f:any)=>({...f,country:e.target.value}))} style={inp} /></div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:"#374151", display:"block", marginBottom:4 }}>Level</label>
                <select value={editForm.level} onChange={e=>setEditForm((f:any)=>({...f,level:e.target.value}))} style={inp}>
                  <option value="">— Not assigned —</option>
                  {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:"#374151", display:"block", marginBottom:6 }}>Roles</label>
                <div style={{ display:"flex", gap:8 }}>
                  {ROLES.map(r => {
                    const rc = roleColor[r];
                    const sel = (editForm.roles||[]).includes(r);
                    return (
                      <button key={r} onClick={() => {
                        const cur = editForm.roles || [];
                        setEditForm((f:any) => ({ ...f, roles: sel ? cur.filter((x:string)=>x!==r) : [...cur,r] }));
                      }} style={{ flex:1, padding:"8px 6px", borderRadius:10, border:`2px solid ${sel?rc.border:"#E5E7EB"}`, background:sel?rc.bg:"#fff", color:rc.text, fontWeight:sel?800:500, fontSize:11, cursor:"pointer" }}>
                        {r}
                      </button>
                    );
                  })}
                </div>
              </div>
              <button onClick={saveEdit} disabled={saving} style={{ padding:"12px", borderRadius:12, border:"none", background:saving?"#e5e7eb":`linear-gradient(135deg,${G},#075E54)`, color:saving?"#9ca3af":"#fff", fontWeight:800, cursor:saving?"not-allowed":"pointer" }}>
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ NOTIFICATION DIALOG ══════════════════════════════════════ */}
      {notifDialog && (
        <div style={{ position:"fixed", inset:0, zIndex:50, background:"rgba(0,0,0,.6)", display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
          <div style={{ background:"#fff", borderRadius:20, width:"100%", maxWidth:440 }}>
            <div style={{ padding:"16px 20px", borderBottom:"1px solid #E5E7EB", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <h2 style={{ fontSize:15, fontWeight:800, color:"#111", margin:0 }}>Send Notification</h2>
              <button onClick={() => { setNotifDialog(false); setNotifTarget([]); }} style={{ background:"none", border:"none", cursor:"pointer", fontSize:20, color:"#9CA3AF" }}>×</button>
            </div>
            <div style={{ padding:20, display:"flex", flexDirection:"column", gap:12 }}>
              <div style={{ padding:"10px 14px", borderRadius:10, background:"#F0FDF4", border:"1px solid #86EFAC", fontSize:12, color:G }}>
                {notifTarget.length > 0 ? `Sending to ${notifTarget.length} selected user${notifTarget.length!==1?"s":""}` : `Sending to all ${filtered.length} filtered users`}
              </div>
              <div><label style={{ fontSize:11, fontWeight:700, color:"#374151", display:"block", marginBottom:4 }}>Title</label>
                <input value={notifTitle} onChange={e=>setNotifTitle(e.target.value)} style={inp} placeholder="Notification title…" /></div>
              <div><label style={{ fontSize:11, fontWeight:700, color:"#374151", display:"block", marginBottom:4 }}>Message</label>
                <textarea value={notifMsg} onChange={e=>setNotifMsg(e.target.value)} rows={4} style={{ ...inp, resize:"vertical" as const }} placeholder="Type your message…" /></div>
              <button onClick={sendNotification} disabled={sending || !notifTitle || !notifMsg} style={{ padding:"12px", borderRadius:12, border:"none", background: sending||!notifTitle||!notifMsg ? "#e5e7eb" : `linear-gradient(135deg,${G},#075E54)`, color: sending||!notifTitle||!notifMsg ? "#9ca3af" : "#fff", fontWeight:800, cursor: sending||!notifTitle||!notifMsg ? "not-allowed" : "pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                <Send size={14} /> {sending ? "Sending…" : "Send Notification"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ DELETE CONFIRM DIALOG ════════════════════════════════════ */}
      {deleteDialog && (
        <div style={{ position:"fixed", inset:0, zIndex:50, background:"rgba(0,0,0,.7)", display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
          <div style={{ background:"#fff", borderRadius:20, width:"100%", maxWidth:420, padding:"28px 24px", textAlign:"center" }}>
            <div style={{ width:64, height:64, borderRadius:"50%", background:"#FEF2F2", border:"2px solid #FECACA", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px" }}>
              <AlertTriangle size={30} color="#DC2626" />
            </div>
            <h2 style={{ fontSize:18, fontWeight:900, color:"#DC2626", margin:"0 0 8px" }}>Delete Account?</h2>
            <p style={{ fontSize:14, color:"#374151", margin:"0 0 6px", fontWeight:700 }}>{deleteDialog.full_name || deleteDialog.email}</p>
            <p style={{ fontSize:13, color:"#6B7280", margin:"0 0 20px", lineHeight:1.6 }}>
              This will <strong>permanently delete ALL data</strong> for this account — exams, recitation, progress, and profile.
              <br/><br/>
              <span style={{ color:"#16a34a", fontWeight:700 }}>✓ They can re-register with the same email address.</span>
            </p>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => setDeleteDialog(null)} style={{ flex:1, padding:"12px", borderRadius:12, border:"1.5px solid #E5E7EB", background:"#fff", color:"#374151", fontWeight:700, cursor:"pointer" }}>
                Cancel
              </button>
              <button onClick={() => deleteAccount(deleteDialog)} disabled={deleting === deleteDialog?.user_id} style={{ flex:1, padding:"12px", borderRadius:12, border:"none", background:"#DC2626", color:"#fff", fontWeight:800, cursor:deleting?"not-allowed":"pointer", opacity:deleting?.5:1, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                {deleting === deleteDialog?.user_id ? <><Loader2 size={14} style={{ animation:"spin .8s linear infinite" }} />Deleting…</> : <><Trash2 size={14} />Delete Permanently</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}