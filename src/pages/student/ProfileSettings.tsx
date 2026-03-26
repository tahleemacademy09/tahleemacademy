/* src/pages/student/ProfileSettings.tsx — Enhanced with notification prefs, theme, study prefs, security */
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import {
  User, Camera, Save, Bell, Lock, Globe, Moon, Sun, BookOpen,
  Shield, LogOut, Trash2, Eye, EyeOff, ChevronRight, Loader2,
  Phone, Mail, GraduationCap, AlertTriangle, CheckCircle
} from "lucide-react";

const G = "#064E3B";

const TABS = [
  { id:"profile",  icon:"👤", label:"Profile" },
  { id:"notifications", icon:"🔔", label:"Notifications" },
  { id:"preferences",   icon:"⚙️", label:"Preferences" },
  { id:"security",      icon:"🔒", label:"Security" },
];

const ProfileSettings = () => {
  const { t, language, setLanguage } = useLanguage();
  const { user, profile, hasRole, signOut } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const avatarRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState("profile");
  const [saving, setSaving]         = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showPwDialog, setShowPwDialog] = useState(false);
  const [pwForm, setPwForm] = useState({ new_password:"", confirm:"" });
  const [showPw, setShowPw] = useState(false);
  const [changingPw, setChangingPw] = useState(false);

  const [form, setForm] = useState({
    full_name:"", full_name_ar:"", phone:"", whatsapp:"",
    parent_name:"", parent_phone:"", date_of_birth:"",
    bio:"", gender:"", nationality:"", country:"", city:"",
    avatar_url:"",
  });

  const [notifs, setNotifs] = useState({
    email_notifications: true,
    whatsapp_notifications: false,
    class_reminder: true,
    class_reminder_minutes: 30,
    exam_reminder: true,
    results_notification: true,
    new_recording_alert: true,
    announcement_notifications: true,
  });

  const [prefs, setPrefs] = useState({
    language: "en",
    dark_mode: false,
    autoplay_recordings: true,
    playback_speed: "1x",
    show_subtitles: false,
    default_subject_view: "grid",
    text_direction: "auto",
  });

  // Load profile data
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data: p } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
      if (p) {
        setForm({ full_name:p.full_name||"", full_name_ar:p.full_name_ar||"", phone:p.phone||"",
          whatsapp:p.whatsapp||"", parent_name:p.parent_name||"", parent_phone:p.parent_phone||"",
          date_of_birth:p.date_of_birth||"", bio:p.bio||"", gender:p.gender||"",
          nationality:p.nationality||"", country:p.country||"", city:p.city||"", avatar_url:p.avatar_url||"" });
      }
      const { data: prefsData } = await supabase.from("student_preferences" as any).select("*").eq("user_id", user.id).maybeSingle();
      if (prefsData) {
        const pd = prefsData as any;
        setNotifs(n=>({ ...n, ...(pd.notifications||{}) }));
        setPrefs(p=>({ ...p, ...(pd.preferences||{}) }));
      }
    };
    load();
  }, [user]);

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await supabase.from("profiles").update({ ...form, updated_at: new Date().toISOString() }).eq("user_id", user.id);
      toast({ title:"✅ Profile saved!" });
    } catch(e:any) { toast({ title:"Error", description:e.message, variant:"destructive" }); }
    finally { setSaving(false); }
  };

  const saveNotifs = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await supabase.from("student_preferences" as any).upsert({ user_id:user.id, notifications:notifs } as any);
      toast({ title:"✅ Notification settings saved" });
    } finally { setSaving(false); }
  };

  const savePrefs = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await supabase.from("student_preferences" as any).upsert({ user_id:user.id, preferences:prefs } as any);
      if (prefs.language !== language) setLanguage(prefs.language as any);
      toast({ title:"✅ Preferences saved" });
    } finally { setSaving(false); }
  };

  const changePassword = async () => {
    if (pwForm.new_password !== pwForm.confirm) { toast({ title:"Passwords don't match", variant:"destructive" }); return; }
    if (pwForm.new_password.length < 8) { toast({ title:"Min 8 characters", variant:"destructive" }); return; }
    setChangingPw(true);
    const { error } = await supabase.auth.updateUser({ password: pwForm.new_password });
    if (error) { toast({ title:"Error", description:error.message, variant:"destructive" }); }
    else { toast({ title:"✅ Password changed!" }); setShowPwDialog(false); setPwForm({ new_password:"", confirm:"" }); }
    setChangingPw(false);
  };

  const uploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploadingAvatar(true);
    try {
      const path = `avatars/${user?.id}.${file.name.split(".").pop()}`;
      await supabase.storage.from("avatars").upload(path, file, { upsert:true, contentType:file.type });
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      setForm(f=>({ ...f, avatar_url:data.publicUrl+"?t="+Date.now() }));
      await supabase.from("profiles").update({ avatar_url:data.publicUrl }).eq("user_id", user!.id);
      toast({ title:"✅ Photo updated!" });
    } finally { setUploadingAvatar(false); }
  };

  const Section = ({ title, children }: { title:string; children:React.ReactNode }) => (
    <div style={{ background:"#fff", borderRadius:16, border:"1px solid #E5E7EB", overflow:"hidden", marginBottom:14 }}>
      <div style={{ padding:"12px 18px", background:"#F9FAFB", borderBottom:"1px solid #E5E7EB" }}>
        <p style={{ fontWeight:700, fontSize:13, color:"#374151", margin:0 }}>{title}</p>
      </div>
      <div style={{ padding:"16px 18px" }}>{children}</div>
    </div>
  );

  const Field = ({ label, children }: { label:string; children:React.ReactNode }) => (
    <div style={{ marginBottom:14 }}>
      <label style={{ fontSize:12, fontWeight:700, color:"#6B7280", display:"block", marginBottom:5 }}>{label}</label>
      {children}
    </div>
  );

  const Toggle = ({ label, sub, checked, onChange }: any) => (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 0", borderBottom:"1px solid #F9FAFB" }}>
      <div>
        <p style={{ fontWeight:600, fontSize:13, color:"#374151", margin:0 }}>{label}</p>
        {sub&&<p style={{ fontSize:11, color:"#9CA3AF", margin:0 }}>{sub}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange}/>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:"#F8F9FA" }}>
      {/* Header */}
      <div style={{ background:G, padding:"18px 20px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          {/* Avatar */}
          <div style={{ position:"relative" }}>
            <div style={{ width:56, height:56, borderRadius:"50%", background:"rgba(255,255,255,.2)", border:"2px solid rgba(255,255,255,.3)", overflow:"hidden", display:"flex", alignItems:"center", justifyContent:"center" }}>
              {form.avatar_url
                ? <img src={form.avatar_url} style={{ width:"100%", height:"100%", objectFit:"cover" }} alt=""/>
                : <span style={{ fontSize:22, fontWeight:800, color:"#fff" }}>{(form.full_name||"?")[0]}</span>}
              {uploadingAvatar&&<div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,.5)", display:"flex", alignItems:"center", justifyContent:"center" }}><Loader2 size={18} color="#fff" style={{ animation:"spin .8s linear infinite" }}/></div>}
            </div>
            <button onClick={()=>avatarRef.current?.click()}
              style={{ position:"absolute", bottom:-2, right:-2, width:22, height:22, borderRadius:"50%", background:"#fff", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <Camera size={12} color={G}/>
            </button>
            <input ref={avatarRef} type="file" accept="image/*" style={{ display:"none" }} onChange={uploadAvatar}/>
          </div>
          <div>
            <p style={{ fontWeight:800, fontSize:17, color:"#fff", margin:0 }}>{form.full_name||"Settings"}</p>
            <p style={{ fontSize:12, color:"rgba(255,255,255,.7)", margin:0 }}>{user?.email}</p>
          </div>
        </div>
        {/* Tab bar */}
        <div style={{ display:"flex", gap:4, marginTop:14, overflowX:"auto" }}>
          {TABS.map(tab=>(
            <button key={tab.id} onClick={()=>setActiveTab(tab.id)}
              style={{ padding:"8px 14px", borderRadius:10, border:"none", cursor:"pointer", fontWeight:700, fontSize:12, whiteSpace:"nowrap",
                background:activeTab===tab.id?"#fff":"rgba(255,255,255,.12)", color:activeTab===tab.id?G:"rgba(255,255,255,.8)" }}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding:"16px", maxWidth:640, margin:"0 auto" }}>

        {/* PROFILE TAB */}
        {activeTab==="profile" && (
          <>
            <Section title="Personal Information">
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <Field label="Full Name (English)"><Input value={form.full_name} onChange={e=>setForm(f=>({...f,full_name:e.target.value}))} style={{ borderRadius:10 }}/></Field>
                <Field label="الاسم (عربي)"><Input dir="rtl" value={form.full_name_ar} onChange={e=>setForm(f=>({...f,full_name_ar:e.target.value}))} style={{ borderRadius:10 }}/></Field>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <Field label="Phone"><Input value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} style={{ borderRadius:10 }}/></Field>
                <Field label="WhatsApp"><Input value={form.whatsapp} onChange={e=>setForm(f=>({...f,whatsapp:e.target.value}))} style={{ borderRadius:10 }}/></Field>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <Field label="Date of Birth"><Input type="date" value={form.date_of_birth} onChange={e=>setForm(f=>({...f,date_of_birth:e.target.value}))} style={{ borderRadius:10 }}/></Field>
                <Field label="Gender">
                  <select value={form.gender} onChange={e=>setForm(f=>({...f,gender:e.target.value}))} style={{ width:"100%", padding:"9px 12px", borderRadius:10, border:"1.5px solid #E5E7EB", fontSize:13, outline:"none" }}>
                    <option value="">Prefer not to say</option>
                    <option value="male">Male / ذكر</option>
                    <option value="female">Female / أنثى</option>
                  </select>
                </Field>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
                <Field label="Country"><Input value={form.country} onChange={e=>setForm(f=>({...f,country:e.target.value}))} style={{ borderRadius:10 }}/></Field>
                <Field label="City"><Input value={form.city} onChange={e=>setForm(f=>({...f,city:e.target.value}))} style={{ borderRadius:10 }}/></Field>
                <Field label="Nationality"><Input value={form.nationality} onChange={e=>setForm(f=>({...f,nationality:e.target.value}))} style={{ borderRadius:10 }}/></Field>
              </div>
            </Section>
            <Section title="Parent / Guardian">
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <Field label="Parent Name"><Input value={form.parent_name} onChange={e=>setForm(f=>({...f,parent_name:e.target.value}))} style={{ borderRadius:10 }}/></Field>
                <Field label="Parent Phone"><Input value={form.parent_phone} onChange={e=>setForm(f=>({...f,parent_phone:e.target.value}))} style={{ borderRadius:10 }}/></Field>
              </div>
            </Section>
            <Button onClick={saveProfile} disabled={saving} style={{ width:"100%", background:G, borderRadius:12, height:46, gap:8, fontWeight:700, fontSize:14 }}>
              {saving?<><Loader2 size={16} style={{ animation:"spin .8s linear infinite" }}/> Saving…</>:<><Save size={16}/> Save Profile</>}
            </Button>
          </>
        )}

        {/* NOTIFICATIONS TAB */}
        {activeTab==="notifications" && (
          <>
            <Section title="Email & Messages">
              <Toggle label="Email Notifications" sub="Receive updates via email" checked={notifs.email_notifications} onChange={(v:boolean)=>setNotifs(n=>({...n,email_notifications:v}))}/>
              <Toggle label="WhatsApp Notifications" sub="Class reminders via WhatsApp" checked={notifs.whatsapp_notifications} onChange={(v:boolean)=>setNotifs(n=>({...n,whatsapp_notifications:v}))}/>
              <Toggle label="Announcement Notifications" sub="Academy-wide announcements" checked={notifs.announcement_notifications} onChange={(v:boolean)=>setNotifs(n=>({...n,announcement_notifications:v}))}/>
            </Section>
            <Section title="Class & Exam">
              <Toggle label="Class Reminders" sub="Reminder before live classes" checked={notifs.class_reminder} onChange={(v:boolean)=>setNotifs(n=>({...n,class_reminder:v}))}/>
              <Toggle label="Exam Reminders" sub="Reminder before exams" checked={notifs.exam_reminder} onChange={(v:boolean)=>setNotifs(n=>({...n,exam_reminder:v}))}/>
              <Toggle label="Results Released" sub="When your exam results are ready" checked={notifs.results_notification} onChange={(v:boolean)=>setNotifs(n=>({...n,results_notification:v}))}/>
              <Toggle label="New Recordings" sub="When class recordings are uploaded" checked={notifs.new_recording_alert} onChange={(v:boolean)=>setNotifs(n=>({...n,new_recording_alert:v}))}/>
            </Section>
            <Button onClick={saveNotifs} disabled={saving} style={{ width:"100%", background:G, borderRadius:12, height:46, gap:8, fontWeight:700 }}>
              {saving?<><Loader2 size={16} style={{ animation:"spin .8s linear infinite" }}/> Saving…</>:<><Save size={16}/> Save Preferences</>}
            </Button>
          </>
        )}

        {/* PREFERENCES TAB */}
        {activeTab==="preferences" && (
          <>
            <Section title="Language & Display">
              <Field label="Interface Language">
                <select value={prefs.language} onChange={e=>setPrefs(p=>({...p,language:e.target.value}))} style={{ width:"100%", padding:"9px 12px", borderRadius:10, border:"1.5px solid #E5E7EB", fontSize:13, outline:"none" }}>
                  <option value="en">English</option>
                  <option value="ar">العربية</option>
                </select>
              </Field>
              <Toggle label="Dark Mode" sub="Use dark theme (coming soon)" checked={prefs.dark_mode} onChange={(v:boolean)=>setPrefs(p=>({...p,dark_mode:v}))}/>
            </Section>
            <Section title="Learning Preferences">
              <Toggle label="Autoplay Recordings" sub="Auto-start video when you open it" checked={prefs.autoplay_recordings} onChange={(v:boolean)=>setPrefs(p=>({...p,autoplay_recordings:v}))}/>
              <Toggle label="Show Subtitles" sub="When available" checked={prefs.show_subtitles} onChange={(v:boolean)=>setPrefs(p=>({...p,show_subtitles:v}))}/>
              <Field label="Playback Speed">
                <select value={prefs.playback_speed} onChange={e=>setPrefs(p=>({...p,playback_speed:e.target.value}))} style={{ width:"100%", padding:"9px 12px", borderRadius:10, border:"1.5px solid #E5E7EB", fontSize:13, outline:"none" }}>
                  {["0.75x","1x","1.25x","1.5x","2x"].map(s=><option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Default Subject View">
                <select value={prefs.default_subject_view} onChange={e=>setPrefs(p=>({...p,default_subject_view:e.target.value}))} style={{ width:"100%", padding:"9px 12px", borderRadius:10, border:"1.5px solid #E5E7EB", fontSize:13, outline:"none" }}>
                  <option value="grid">Grid</option>
                  <option value="list">List</option>
                </select>
              </Field>
            </Section>
            <Button onClick={savePrefs} disabled={saving} style={{ width:"100%", background:G, borderRadius:12, height:46, gap:8, fontWeight:700 }}>
              {saving?<><Loader2 size={16} style={{ animation:"spin .8s linear infinite" }}/> Saving…</>:<><Save size={16}/> Save Preferences</>}
            </Button>
          </>
        )}

        {/* SECURITY TAB */}
        {activeTab==="security" && (
          <>
            <Section title="Account Security">
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 0", borderBottom:"1px solid #F9FAFB" }}>
                <div>
                  <p style={{ fontWeight:600, fontSize:13, color:"#374151", margin:0 }}>Password</p>
                  <p style={{ fontSize:11, color:"#9CA3AF", margin:0 }}>Last changed: unknown</p>
                </div>
                <Button onClick={()=>setShowPwDialog(true)} size="sm" variant="outline" style={{ borderRadius:9, fontSize:12 }}>
                  <Lock size={12} style={{ marginRight:5 }}/> Change
                </Button>
              </div>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 0" }}>
                <div>
                  <p style={{ fontWeight:600, fontSize:13, color:"#374151", margin:0 }}>Email</p>
                  <p style={{ fontSize:11, color:"#9CA3AF", margin:0 }}>{user?.email}</p>
                </div>
                <span style={{ fontSize:11, padding:"3px 10px", borderRadius:20, background:"#DCFCE7", color:"#166534", fontWeight:700 }}>✓ Verified</span>
              </div>
            </Section>
            <Section title="Session">
              <button onClick={async()=>{ await signOut(); navigate("/login"); }}
                style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 14px", borderRadius:12, background:"#FFF7ED", border:"1px solid #FED7AA", cursor:"pointer", width:"100%", marginBottom:8 }}>
                <LogOut size={16} color="#D97706"/>
                <div style={{ textAlign:"left" }}>
                  <p style={{ fontWeight:700, fontSize:13, color:"#D97706", margin:0 }}>Sign Out</p>
                  <p style={{ fontSize:11, color:"#9CA3AF", margin:0 }}>Sign out of this device</p>
                </div>
              </button>
              <button onClick={()=>setShowDeleteDialog(true)}
                style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 14px", borderRadius:12, background:"#FEF2F2", border:"1px solid #FECACA", cursor:"pointer", width:"100%" }}>
                <Trash2 size={16} color="#DC2626"/>
                <div style={{ textAlign:"left" }}>
                  <p style={{ fontWeight:700, fontSize:13, color:"#DC2626", margin:0 }}>Delete Account</p>
                  <p style={{ fontSize:11, color:"#9CA3AF", margin:0 }}>Permanently delete your account and data</p>
                </div>
              </button>
            </Section>
          </>
        )}
      </div>

      {/* Change Password Dialog */}
      <Dialog open={showPwDialog} onOpenChange={v=>!v&&setShowPwDialog(false)}>
        <DialogContent style={{ maxWidth:400, borderRadius:20, padding:0 }}>
          <div style={{ background:G, padding:"18px 20px", borderRadius:"20px 20px 0 0" }}>
            <h2 style={{ fontWeight:800, fontSize:16, color:"#fff", margin:0 }}>🔒 Change Password</h2>
          </div>
          <div style={{ padding:20, display:"flex", flexDirection:"column", gap:14 }}>
            <div style={{ position:"relative" }}>
              <label style={{ fontSize:12, fontWeight:700, color:"#6B7280", display:"block", marginBottom:5 }}>New Password</label>
              <Input type={showPw?"text":"password"} value={pwForm.new_password} onChange={e=>setPwForm(f=>({...f,new_password:e.target.value}))} style={{ borderRadius:10, paddingRight:40 }}/>
              <button onClick={()=>setShowPw(p=>!p)} style={{ position:"absolute", right:10, bottom:8, background:"none", border:"none", cursor:"pointer" }}>
                {showPw?<EyeOff size={16} color="#9CA3AF"/>:<Eye size={16} color="#9CA3AF"/>}
              </button>
            </div>
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:"#6B7280", display:"block", marginBottom:5 }}>Confirm Password</label>
              <Input type="password" value={pwForm.confirm} onChange={e=>setPwForm(f=>({...f,confirm:e.target.value}))} style={{ borderRadius:10 }}/>
            </div>
            {pwForm.new_password&&pwForm.confirm&&pwForm.new_password!==pwForm.confirm&&(
              <p style={{ fontSize:12, color:"#DC2626", margin:0 }}>⚠️ Passwords don't match</p>
            )}
            <Button onClick={changePassword} disabled={changingPw||!pwForm.new_password||pwForm.new_password!==pwForm.confirm}
              style={{ background:G, borderRadius:12, gap:8, fontWeight:700 }}>
              {changingPw?<><Loader2 size={14} style={{ animation:"spin .8s linear infinite" }}/> Changing…</>:"Update Password"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Account Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={v=>!v&&setShowDeleteDialog(false)}>
        <DialogContent style={{ maxWidth:380, borderRadius:20, padding:24, textAlign:"center" }}>
          <div style={{ width:56, height:56, borderRadius:"50%", background:"#FEF2F2", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 14px" }}>
            <AlertTriangle size={26} color="#DC2626"/>
          </div>
          <h3 style={{ fontWeight:800, fontSize:17, color:"#111", marginBottom:8 }}>Delete Account?</h3>
          <p style={{ fontSize:13, color:"#6B7280", marginBottom:20, lineHeight:1.6 }}>This will permanently delete your account, all your exam results, and learning progress. This cannot be undone.</p>
          <div style={{ display:"flex", gap:10 }}>
            <button onClick={()=>setShowDeleteDialog(false)} style={{ flex:1, padding:"11px", borderRadius:12, border:"1.5px solid #E5E7EB", background:"#fff", cursor:"pointer", fontWeight:600, fontSize:13 }}>Cancel</button>
            <button style={{ flex:1, padding:"11px", borderRadius:12, border:"none", background:"#DC2626", color:"#fff", cursor:"pointer", fontWeight:700, fontSize:13 }}>Delete My Account</button>
          </div>
        </DialogContent>
      </Dialog>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
};

export default ProfileSettings;
