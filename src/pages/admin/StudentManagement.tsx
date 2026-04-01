/* src/pages/admin/StudentManagement.tsx — Enhanced User Role Management + View as Student */
import { useEffect, useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import {
  Search, User, Users, Eye, Edit, ShieldCheck, GraduationCap,
  Bell, Trash2, ChevronRight, Filter, UserCheck, BookOpen,
  Send, Loader2, Plus, X, Mail
} from "lucide-react";

const G = "#064E3B";
const ROLES = ["student","teacher","admin"] as const;
const LEVELS = ["beginner","intermediate","advanced"];

const roleColor: Record<string,{bg:string;text:string}> = {
  student:  { bg:"#EFF6FF", text:"#1D4ED8" },
  teacher:  { bg:"#F0FDF4", text:"#166534" },
  admin:    { bg:"#FDF4FF", text:"#7C3AED" },
};

const StudentManagement = () => {
  const { t, language } = useLanguage();
  const { user: currentUser, hasRole } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const isAdmin = hasRole("admin");

  const [users, setUsers]         = useState<any[]>([]);
  const [subjects, setSubjects]   = useState<any[]>([]);
  const [exams, setExams]         = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<"users"|"roles">("users");

  // Dialogs
  const [editUser, setEditUser]   = useState<any|null>(null);
  const [editForm, setEditForm]   = useState<any>({});
  const [notifDialog, setNotifDialog] = useState(false);
  const [notifMsg, setNotifMsg]   = useState("");
  const [notifTitle, setNotifTitle] = useState("");
  const [sending, setSending]     = useState(false);
  const [saving, setSaving]       = useState(false);

  // ── Create Student Account ──────────────────────────────────────────────
  const [createDialog, setCreateDialog] = useState(false);
  const [createForm, setCreateForm]     = useState({ full_name: "", email: "", password: "" });
  const [creating, setCreating]         = useState(false);

  const genPassword = () => {
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#";
    return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  };

  const createStudent = async () => {
    if (!createForm.full_name || !createForm.email) {
      toast({ title: "Name and email are required", variant: "destructive" }); return;
    }
    setCreating(true);
    try {
      const pwd = createForm.password || genPassword();
      // Use Supabase admin API via service role — falls back to signUp if no admin key
      const { data, error } = await supabase.auth.signUp({
        email: createForm.email,
        password: pwd,
        options: { data: { full_name: createForm.full_name } },
      });
      if (error) throw error;
      const uid = data.user?.id;
      if (uid) {
        // Ensure student role
        await supabase.from("user_roles" as any).insert({ user_id: uid, role: "student" });
        // Ensure profile exists
        await supabase.from("profiles").upsert({
          user_id: uid, full_name: createForm.full_name, email: createForm.email,
          onboarding_complete: false, payment_status: "pending",
        } as any, { onConflict: "user_id" });
        // Notify the student
        await supabase.from("notifications" as any).insert({
          user_id: uid,
          title: "🎉 Account Created",
          message: `Welcome to Tahleem Academy! Your account has been created by the admin. Your temporary password is: ${pwd}. Please log in and change your password.`,
          type: "admin_message", is_read: false,
        });
      }
      toast({ title: `✅ Account created! Password: ${pwd}`, description: "Share this password with the student securely." });
      setCreateDialog(false);
      setCreateForm({ full_name: "", email: "", password: "" });
      fetchData();
    } catch (e: any) {
      toast({ title: "Failed to create account", description: e.message, variant: "destructive" });
    } finally { setCreating(false); }
  };

  // ── Login as Student (Admin Impersonation) ──────────────────────────────
  // NOTE: True session impersonation requires a Supabase Edge Function with service_role key.
  // This implementation stores admin info and navigates to the student view page,
  // while also allowing direct navigation to the student dashboard in read-only preview.
  const loginAsStudent = async (studentUser: any) => {
    // Store admin session context in sessionStorage so we can restore it
    sessionStorage.setItem("admin_impersonating", JSON.stringify({
      adminId: currentUser?.id,
      studentId: studentUser.user_id,
      studentName: studentUser.full_name,
    }));
    // Navigate to the view-as-student page which shows all student data
    navigate(`/admin/view-as-student/${studentUser.user_id}`);
    toast({ title: `👁️ Viewing as ${studentUser.full_name}`, description: "Admin Preview Mode — click Exit to return" });
  };

  const fetchData = async () => {
    setLoading(true);
    const [profilesRes, rolesRes, subjectsRes, examsRes] = await Promise.all([
      supabase.from("profiles").select("*").order("full_name"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("subjects").select("id,title,title_ar").eq("is_active",true),
      supabase.from("exams").select("id,title,title_ar").eq("is_published",true),
    ]);
    const rolesMap = new Map<string,string[]>();
    (rolesRes.data||[]).forEach((r:any)=>{ if(!rolesMap.has(r.user_id))rolesMap.set(r.user_id,[]); rolesMap.get(r.user_id)!.push(r.role); });
    setUsers((profilesRes.data||[]).map(p=>({ ...p, roles: rolesMap.get(p.user_id)||[] })));
    setSubjects(subjectsRes.data||[]);
    setExams(examsRes.data||[]);
    setLoading(false);
  };

  useEffect(()=>{ fetchData(); },[]);

  const filtered = useMemo(()=> users.filter(u=>{
    if(roleFilter!=="all" && !u.roles.includes(roleFilter)) return false;
    if(levelFilter!=="all" && u.level!==levelFilter) return false;
    if(search){
      const s=search.toLowerCase();
      if(!(u.full_name||"").toLowerCase().includes(s) && !(u.email||"").toLowerCase().includes(s)) return false;
    }
    return true;
  }),[users,roleFilter,levelFilter,search]);

  const toggleRole = async (userId: string, role: string, hasIt: boolean) => {
    if(hasIt){
      await supabase.from("user_roles").delete().eq("user_id",userId).eq("role",role as any);
    } else {
      await (supabase as any).from("user_roles").insert({ user_id: userId, role });
    }
    setUsers(prev=>prev.map(u=>{
      if(u.user_id!==userId) return u;
      const roles = hasIt ? u.roles.filter((r:string)=>r!==role) : [...u.roles,role];
      return {...u,roles};
    }));
    toast({ title:`${hasIt?"Removed":"Added"} ${role} role` });
  };

  const saveUserEdit = async () => {
    if(!editUser) return;
    setSaving(true);
    try {
      await supabase.from("profiles").update({
        full_name: editForm.full_name,
        level: editForm.level||null,
        status: editForm.status||null,
        phone: editForm.phone||null,
      }).eq("user_id", editUser.user_id);
      setUsers(prev=>prev.map(u=>u.user_id===editUser.user_id?{...u,...editForm}:u));
      toast({ title:"User updated" });
      setEditUser(null);
    } finally { setSaving(false); }
  };

  const sendNotification = async () => {
    if(!notifTitle||!notifMsg) return;
    setSending(true);
    const targets = selectedIds.size > 0 ? [...selectedIds] : filtered.map(u=>u.user_id);
    await supabase.from("notifications" as any).insert(
      targets.map(uid=>({ user_id:uid, title:notifTitle, message:notifMsg, type:"admin_message" }))
    );
    toast({ title:`✅ Notification sent to ${targets.length} users` });
    setNotifDialog(false);
    setNotifMsg(""); setNotifTitle("");
    setSending(false);
  };

  const assignExamToLevel = async (examId: string, level: string) => {
    const levelUsers = users.filter(u=>u.level===level && u.roles.includes("student")).map(u=>u.user_id);
    if(!levelUsers.length){ toast({ title:"No students in this level" }); return; }
    const { data: existing } = await supabase.from("exam_assignments").select("user_id").eq("exam_id",examId).in("user_id",levelUsers);
    const existIds = new Set((existing||[]).map((e:any)=>e.user_id));
    const newIds = levelUsers.filter(id=>!existIds.has(id));
    if(newIds.length) await supabase.from("exam_assignments").insert(newIds.map(uid=>({ exam_id:examId, user_id:uid, assigned_by:currentUser?.id })));
    await supabase.from("notifications" as any).insert(levelUsers.map(uid=>({ user_id:uid, title:"New exam assigned", message:`Exam has been assigned to your group`, type:"exam_assigned", reference_id:examId })));
    toast({ title:`Assigned to ${newIds.length} students in ${level} level` });
  };

  const tabs = ["users","roles"] as const;
  const roleCounts = ROLES.reduce((acc,r)=>({ ...acc, [r]: users.filter(u=>u.roles.includes(r)).length }),{} as Record<string,number>);

  return (
    <div style={{ minHeight:"100vh", background:"#F8F9FA" }}>
      {/* Header */}
      <div style={{ background:"#fff", borderBottom:"1px solid #E5E7EB", padding:"18px 20px" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:40, height:40, borderRadius:12, background:"#EFF6FF", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <Users size={20} color="#1D4ED8"/>
            </div>
            <div>
              <h1 style={{ fontSize:20, fontWeight:800, color:"#111", margin:0 }}>User Management</h1>
              <p style={{ fontSize:12, color:"#6B7280", margin:0 }}>{users.length} total · {roleCounts.student||0} students · {roleCounts.teacher||0} teachers</p>
            </div>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            {selectedIds.size>0&&(
              <Button onClick={()=>setNotifDialog(true)}
                style={{ background:"#7C3AED", borderRadius:12, gap:8, fontWeight:700 }}>
                <Bell size={14}/> Notify {selectedIds.size} selected
              </Button>
            )}
            <Button onClick={()=>{ setCreateForm({ full_name:"", email:"", password:genPassword() }); setCreateDialog(true); }}
              style={{ background:"#16A34A", borderRadius:12, gap:8, fontWeight:700 }}>
              <Plus size={14}/> Create Student
            </Button>
            <Button onClick={()=>setNotifDialog(true)}
              style={{ background:G, borderRadius:12, gap:8, fontWeight:700 }}>
              <Send size={14}/> Broadcast
            </Button>
          </div>
        </div>
      </div>

      <div style={{ padding:"16px", maxWidth:1100, margin:"0 auto" }}>
        {/* Stats */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))", gap:10, marginBottom:16 }}>
          {[
            { v:users.length, l:"Total Users", icon:"👥", bg:"#F3F4F6", c:"#374151" },
            { v:roleCounts.student||0, l:"Students", icon:"🎓", bg:"#EFF6FF", c:"#1D4ED8" },
            { v:roleCounts.teacher||0, l:"Teachers", icon:"👨‍🏫", bg:"#F0FDF4", c:"#166534" },
            { v:roleCounts.admin||0, l:"Admins", icon:"🛡️", bg:"#FDF4FF", c:"#7C3AED" },
          ].map((s,i)=>(
            <div key={i} style={{ background:s.bg, borderRadius:12, padding:"12px 14px" }}>
              <div style={{ fontSize:20, marginBottom:4 }}>{s.icon}</div>
              <div style={{ fontSize:22, fontWeight:900, color:s.c }}>{s.v}</div>
              <div style={{ fontSize:11, color:s.c, opacity:.7, fontWeight:600 }}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display:"flex", gap:4, marginBottom:14, background:"#fff", borderRadius:12, padding:4, border:"1px solid #E5E7EB", width:"fit-content" }}>
          {tabs.map(tab=>(
            <button key={tab} onClick={()=>setActiveTab(tab)}
              style={{ padding:"8px 18px", borderRadius:9, border:"none", cursor:"pointer", fontWeight:700, fontSize:13, background:activeTab===tab?G:"transparent", color:activeTab===tab?"#fff":"#6B7280" }}>
              {tab==="users"?"👥 Users":"🛡️ Roles & Permissions"}
            </button>
          ))}
        </div>

        {activeTab==="users" && (
          <>
            {/* Filters */}
            <div style={{ display:"flex", gap:10, marginBottom:14, flexWrap:"wrap" }}>
              <div style={{ position:"relative", flex:1, minWidth:180 }}>
                <Search size={13} style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF" }}/>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name or email…"
                  style={{ width:"100%", padding:"9px 10px 9px 30px", borderRadius:10, border:"1.5px solid #E5E7EB", fontSize:13, outline:"none", boxSizing:"border-box" as const }}/>
              </div>
              {[
                { val:roleFilter, set:setRoleFilter, opts:[["all","All Roles"],["student","Students"],["teacher","Teachers"],["admin","Admins"]] },
                { val:levelFilter, set:setLevelFilter, opts:[["all","All Levels"],["beginner","Beginner"],["intermediate","Intermediate"],["advanced","Advanced"]] },
              ].map((f,i)=>(
                <select key={i} value={f.val} onChange={e=>f.set(e.target.value)}
                  style={{ padding:"9px 12px", borderRadius:10, border:"1.5px solid #E5E7EB", fontSize:13, background:"#fff", outline:"none" }}>
                  {f.opts.map(([v,l])=><option key={v} value={v}>{l}</option>)}
                </select>
              ))}
            </div>

            {loading ? (
              <div style={{ textAlign:"center", padding:48 }}><Loader2 size={28} style={{ animation:"spin .8s linear infinite", color:G }}/></div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {filtered.map(u=>(
                  <div key={u.user_id} style={{ background:"#fff", borderRadius:14, border:"1.5px solid #E5E7EB", padding:"13px 16px", display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
                    <input type="checkbox" checked={selectedIds.has(u.user_id)}
                      onChange={e=>{ const n=new Set(selectedIds); e.target.checked?n.add(u.user_id):n.delete(u.user_id); setSelectedIds(n); }}
                      style={{ accentColor:G, width:16, height:16 }}/>
                    <div style={{ width:38, height:38, borderRadius:10, background:`hsl(${Math.abs(u.user_id.charCodeAt(0)*12)%360},60%,85%)`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontSize:14, fontWeight:800, color:"#374151" }}>
                      {(u.full_name||"?")[0]}
                    </div>
                    <div style={{ flex:1, minWidth:120 }}>
                      <p style={{ fontWeight:700, fontSize:14, color:"#111", margin:0 }}>{u.full_name||"Unknown"}</p>
                      <p style={{ fontSize:11, color:"#9CA3AF", margin:"2px 0 4px" }}>{u.email}</p>
                      <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                        {u.roles.map((r:string)=>(
                          <span key={r} style={{ fontSize:10, padding:"2px 8px", borderRadius:20, background:roleColor[r]?.bg||"#F3F4F6", color:roleColor[r]?.text||"#374151", fontWeight:700 }}>{r}</span>
                        ))}
                        {u.level&&<span style={{ fontSize:10, padding:"2px 8px", borderRadius:20, background:"#F3F4F6", color:"#6B7280", fontWeight:600 }}>{u.level}</span>}
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:6 }}>
                      <button onClick={()=>{ setEditUser(u); setEditForm({ full_name:u.full_name||"", level:u.level||"", status:u.status||"active", phone:u.phone||"" }); }}
                        style={{ padding:"7px 10px", borderRadius:8, border:"1px solid #E5E7EB", background:"#fff", cursor:"pointer" }} title="Edit"><Edit size={13} color="#6B7280"/></button>
                      {isAdmin&&(
                        <>
                          <button onClick={()=>loginAsStudent(u)}
                            style={{ display:"flex", alignItems:"center", gap:5, padding:"7px 12px", borderRadius:8, border:"none", background:"#7C3AED", color:"#fff", cursor:"pointer", fontSize:11, fontWeight:700 }} title="Login as this student">
                            <Eye size={13}/> Login as Student
                          </button>
                          <button onClick={()=>navigate(`/admin/view-as-student/${u.user_id}`)}
                            style={{ padding:"7px 10px", borderRadius:8, border:"1px solid #E5E7EB", background:"#fff", cursor:"pointer" }} title="View profile"><UserCheck size={13} color="#6B7280"/></button>
                        </>
                      )}
                      <button onClick={()=>{ setNotifMsg(""); setNotifTitle(""); setSelectedIds(new Set([u.user_id])); setNotifDialog(true); }}
                        style={{ padding:"7px 10px", borderRadius:8, border:"1px solid #E5E7EB", background:"#fff", cursor:"pointer" }} title="Send notification"><Bell size={13} color="#6B7280"/></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab==="roles" && (
          <div style={{ display:"grid", gap:16 }}>
            <div style={{ background:"#fff", borderRadius:16, border:"1px solid #E5E7EB", padding:20 }}>
              <h3 style={{ fontWeight:800, fontSize:15, color:"#111", marginBottom:16 }}>🛡️ Role Assignment</h3>
              <p style={{ fontSize:13, color:"#6B7280", marginBottom:16 }}>Toggle roles for any user. Multiple roles allowed.</p>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {users.slice(0,20).map(u=>(
                  <div key={u.user_id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", borderRadius:12, background:"#F9FAFB", flexWrap:"wrap" }}>
                    <span style={{ flex:1, fontSize:13, fontWeight:600, color:"#374151" }}>{u.full_name||u.email}</span>
                    {ROLES.map(r=>(
                      <label key={r} style={{ display:"flex", alignItems:"center", gap:5, cursor:"pointer", fontSize:12, fontWeight:600, padding:"4px 10px", borderRadius:20, background:u.roles.includes(r)?roleColor[r].bg:"#F3F4F6", color:u.roles.includes(r)?roleColor[r].text:"#9CA3AF", border:`1px solid ${u.roles.includes(r)?roleColor[r].text+"33":"#E5E7EB"}` }}>
                        <input type="checkbox" checked={u.roles.includes(r)} onChange={()=>toggleRole(u.user_id,r,u.roles.includes(r))} style={{ accentColor:G, width:12, height:12 }}/>
                        {r}
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background:"#fff", borderRadius:16, border:"1px solid #E5E7EB", padding:20 }}>
              <h3 style={{ fontWeight:800, fontSize:15, color:"#111", marginBottom:16 }}>📝 Assign Exam by Level</h3>
              <p style={{ fontSize:13, color:"#6B7280", marginBottom:14 }}>Select an exam and level — all students in that level will be assigned.</p>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                {LEVELS.map(lv=>(
                  <div key={lv} style={{ background:"#F9FAFB", borderRadius:12, padding:14, border:"1px solid #E5E7EB" }}>
                    <p style={{ fontWeight:700, fontSize:13, color:"#374151", marginBottom:8, textTransform:"capitalize" }}>🎓 {lv}</p>
                    <p style={{ fontSize:11, color:"#9CA3AF", marginBottom:8 }}>{users.filter(u=>u.level===lv&&u.roles.includes("student")).length} students</p>
                    <select defaultValue="" onChange={e=>{ if(e.target.value)assignExamToLevel(e.target.value,lv); }}
                      style={{ width:"100%", padding:"8px", borderRadius:9, border:"1px solid #E5E7EB", fontSize:12, outline:"none" }}>
                      <option value="">Assign exam…</option>
                      {exams.map(e=><option key={e.id} value={e.id}>{language==="ar"?e.title_ar||e.title:e.title}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Edit User Dialog */}
      <Dialog open={!!editUser} onOpenChange={v=>!v&&setEditUser(null)}>
        <DialogContent style={{ maxWidth:420, borderRadius:20, padding:0 }}>
          <div style={{ background:G, padding:"18px 20px", borderRadius:"20px 20px 0 0" }}>
            <h2 style={{ fontWeight:800, fontSize:16, color:"#fff", margin:0 }}>Edit User</h2>
          </div>
          <div style={{ padding:20, display:"flex", flexDirection:"column", gap:14 }}>
            <div><label style={{ fontSize:12, fontWeight:700, color:"#6B7280", display:"block", marginBottom:5 }}>Full Name</label><Input value={editForm.full_name||""} onChange={e=>setEditForm((f:any)=>({...f,full_name:e.target.value}))} style={{ borderRadius:10 }}/></div>
            <div><label style={{ fontSize:12, fontWeight:700, color:"#6B7280", display:"block", marginBottom:5 }}>Level</label>
              <select value={editForm.level||""} onChange={e=>setEditForm((f:any)=>({...f,level:e.target.value}))} style={{ width:"100%", padding:"9px 12px", borderRadius:10, border:"1.5px solid #E5E7EB", fontSize:13, outline:"none" }}>
                <option value="">No level</option>
                {LEVELS.map(l=><option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div><label style={{ fontSize:12, fontWeight:700, color:"#6B7280", display:"block", marginBottom:5 }}>Status</label>
              <select value={editForm.status||"active"} onChange={e=>setEditForm((f:any)=>({...f,status:e.target.value}))} style={{ width:"100%", padding:"9px 12px", borderRadius:10, border:"1.5px solid #E5E7EB", fontSize:13, outline:"none" }}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
            <div style={{ background:"#F0FDF4", borderRadius:12, padding:"10px 14px", border:"1px solid #86EFAC" }}>
              <p style={{ fontSize:12, fontWeight:700, color:G, margin:0 }}>👁️ Roles: {editUser?.roles.join(", ")||"none"}</p>
              <p style={{ fontSize:11, color:"#6B7280", marginTop:4 }}>Change roles from the Roles tab</p>
            </div>
            <Button onClick={saveUserEdit} disabled={saving} style={{ background:G, borderRadius:12, gap:8, fontWeight:700 }}>
              {saving?<><Loader2 size={14} style={{ animation:"spin .8s linear infinite" }}/> Saving…</>:"Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Notification Dialog */}
      <Dialog open={notifDialog} onOpenChange={v=>!v&&setNotifDialog(false)}>
        <DialogContent style={{ maxWidth:440, borderRadius:20, padding:0 }}>
          <div style={{ background:"#7C3AED", padding:"18px 20px", borderRadius:"20px 20px 0 0", display:"flex", alignItems:"center", gap:10 }}>
            <Bell size={20} color="#fff"/>
            <h2 style={{ fontWeight:800, fontSize:16, color:"#fff", margin:0 }}>
              {selectedIds.size>0?`Notify ${selectedIds.size} users`:"Broadcast to All"}
            </h2>
          </div>
          <div style={{ padding:20, display:"flex", flexDirection:"column", gap:14 }}>
            <div><label style={{ fontSize:12, fontWeight:700, color:"#6B7280", display:"block", marginBottom:5 }}>Title *</label><Input value={notifTitle} onChange={e=>setNotifTitle(e.target.value)} placeholder="e.g. Class tomorrow at 9am" style={{ borderRadius:10 }}/></div>
            <div><label style={{ fontSize:12, fontWeight:700, color:"#6B7280", display:"block", marginBottom:5 }}>Message *</label><textarea value={notifMsg} onChange={e=>setNotifMsg(e.target.value)} rows={4} placeholder="Enter your message…" style={{ width:"100%", padding:"10px 12px", borderRadius:10, border:"1.5px solid #E5E7EB", fontSize:13, outline:"none", resize:"none", boxSizing:"border-box" as const }}/></div>
            <Button onClick={sendNotification} disabled={sending||!notifTitle||!notifMsg}
              style={{ background:"#7C3AED", borderRadius:12, gap:8, fontWeight:700 }}>
              {sending?<><Loader2 size={14} style={{ animation:"spin .8s linear infinite" }}/> Sending…</>:<><Send size={14}/> Send Notification</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Create Student Dialog */}
      <Dialog open={createDialog} onOpenChange={v=>!v&&setCreateDialog(false)}>
        <DialogContent style={{ maxWidth:440, borderRadius:20, padding:0 }}>
          <div style={{ background:"#16A34A", padding:"18px 20px", borderRadius:"20px 20px 0 0" }}>
            <h2 style={{ fontWeight:800, fontSize:16, color:"#fff", margin:0 }}>➕ Create Student Account</h2>
            <p style={{ fontSize:11, color:"rgba(255,255,255,.7)", margin:"4px 0 0" }}>Student can log in and change password in profile</p>
          </div>
          <div style={{ padding:20, display:"flex", flexDirection:"column", gap:14 }}>
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:"#6B7280", display:"block", marginBottom:5 }}>Full Name *</label>
              <Input value={createForm.full_name} onChange={e=>setCreateForm(f=>({...f,full_name:e.target.value}))} placeholder="e.g. Aisha Muhammad" style={{ borderRadius:10 }}/>
            </div>
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:"#6B7280", display:"block", marginBottom:5 }}>Email Address *</label>
              <Input type="email" value={createForm.email} onChange={e=>setCreateForm(f=>({...f,email:e.target.value}))} placeholder="student@example.com" style={{ borderRadius:10 }}/>
            </div>
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:"#6B7280", display:"block", marginBottom:5 }}>Password (auto-generated)</label>
              <div style={{ display:"flex", gap:8 }}>
                <Input value={createForm.password} onChange={e=>setCreateForm(f=>({...f,password:e.target.value}))} placeholder="Auto-generated" style={{ borderRadius:10, flex:1, fontFamily:"monospace" }}/>
                <button onClick={()=>setCreateForm(f=>({...f,password:genPassword()}))}
                  style={{ padding:"0 12px", borderRadius:10, border:"1.5px solid #E5E7EB", background:"#F9FAFB", cursor:"pointer", fontSize:12, fontWeight:700, color:G, whiteSpace:"nowrap" }}>
                  🔄 New
                </button>
              </div>
              <p style={{ fontSize:11, color:"#9CA3AF", margin:"5px 0 0" }}>Share this password securely with the student</p>
            </div>
            <div style={{ background:"#FFF7ED", borderRadius:12, padding:"10px 14px", border:"1px solid #FDE68A" }}>
              <p style={{ fontSize:12, color:"#92400E", margin:0 }}>⚠️ The student will receive an in-app notification with their login details. Make sure to also share the password through a secure channel.</p>
            </div>
            <Button onClick={createStudent} disabled={creating||!createForm.full_name||!createForm.email}
              style={{ background:"#16A34A", borderRadius:12, gap:8, fontWeight:700 }}>
              {creating?<><Loader2 size={14} style={{ animation:"spin .8s linear infinite" }}/> Creating…</>:<><Plus size={14}/> Create Account</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
};

export default StudentManagement;
