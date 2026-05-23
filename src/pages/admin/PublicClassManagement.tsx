/* src/pages/admin/PublicClassManagement.tsx — mobile-first + edit support */
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Plus, Copy, Share2, QrCode, Trash2, Radio, Calendar, Users,
  Mail, Bell, BellOff, Send, Globe, Lock, Video, Loader2,
  Download, Phone, AtSign, CheckCircle, X, Search, RefreshCw,
  Pencil, MoreHorizontal, ExternalLink, Archive, BarChart2, CopyPlus
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

const G    = "#064E3B";
const GOLD = "#C9A84C";

const REMINDER_OPTIONS = [
  { label: "15 min before",  value: 15   },
  { label: "30 min before",  value: 30   },
  { label: "1 hour before",  value: 60   },
  { label: "3 hours before", value: 180  },
  { label: "1 day before",   value: 1440 },
];

const generateRoomCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
};

interface PublicClass {
  id: string; title: string; title_ar: string | null; description: string | null;
  description_ar: string | null; room_code: string; status: string;
  scheduled_at: string | null; max_guests: number; guest_count: number;
  password_enabled: boolean; password: string | null; chat_enabled: boolean;
  raise_hand_enabled: boolean; recording_enabled: boolean; is_featured: boolean;
  require_name: boolean; allow_guest_camera: boolean; allow_guest_mic: boolean;
  host_id: string; livekit_room_name: string | null; created_at: string;
}

interface Registration {
  id: string; name: string; email: string | null; phone: string | null;
  registered_at: string | null; class_id: string | null; class_title?: string;
}

interface ReminderConfig { enabled: boolean; minutesBefore: number; lastSentAt?: string; }

/* ─── blank form shared by create & edit ─── */
const blankForm = {
  title:"", title_ar:"", description:"", description_ar:"",
  scheduled_at:"", password_enabled:false, password:"",
  max_guests:100, require_name:true, allow_guest_camera:false,
  allow_guest_mic:false, chat_enabled:true, raise_hand_enabled:true,
  recording_enabled:false, is_featured:false,
};

const PublicClassManagement = () => {
  const { user }  = useAuth();
  const navigate  = useNavigate();

  const [classes,     setClasses]    = useState<PublicClass[]>([]);
  const [loading,     setLoading]    = useState(true);
  const [saving,      setSaving]     = useState(false);

  /* dialogs */
  const [createOpen,  setCreateOpen] = useState(false);
  const [editTarget,  setEditTarget] = useState<PublicClass | null>(null);
  const [shareClass,  setShareClass] = useState<PublicClass | null>(null);
  const [regDialog,   setRegDialog]  = useState<PublicClass | null>(null);
  const [reminderDlg, setReminderDlg]= useState<PublicClass | null>(null);
  const [emailDialog, setEmailDialog]= useState(false);
  const [moreMenu,    setMoreMenu]   = useState<string | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<PublicClass | null>(null);
  const [rescheduleDate,   setRescheduleDate]   = useState("");
  const [statsTarget,      setStatsTarget]      = useState<PublicClass | null>(null);
  const [deleteTarget,     setDeleteTarget]     = useState<PublicClass | null>(null);
  const [deleting,         setDeleting]         = useState(false);
  const [showArchived,     setShowArchived]     = useState(false);

  /* form (create + edit share the same) */
  const [form, setForm] = useState(blankForm);

  /* filter */
  const [filterTab, setFilterTab] = useState<"all"|"live"|"scheduled"|"ended"|"contacts">("all");

  /* registrants */
  const [registrants,  setRegistrants] = useState<Registration[]>([]);
  const [regLoading,   setRegLoading]  = useState(false);
  const [regSearch,    setRegSearch]   = useState("");

  /* all contacts */
  const [allContacts,      setAllContacts]     = useState<Registration[]>([]);
  const [contactsLoading,  setContactsLoading] = useState(false);
  const [contactSearch,    setContactSearch]   = useState("");

  /* email blast */
  const [emailTarget,  setEmailTarget]  = useState<"class"|"all">("class");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody,    setEmailBody]    = useState("");
  const [sending,      setSending]      = useState(false);
  const [sentCount,    setSentCount]    = useState<number | null>(null);

  /* reminders */
  const [reminderConfig, setReminderConfig] = useState<Record<string, ReminderConfig>>({});

  /* ── boot ── */
  useEffect(() => {
    fetchClasses();
    try {
      const s = localStorage.getItem("tahleem_reminder_configs");
      if (s) setReminderConfig(JSON.parse(s));
    } catch {}
  }, []);

  useEffect(() => { if (filterTab === "contacts") fetchAllContacts(); }, [filterTab]);

  /* close more-menu on outside click */
  useEffect(() => {
    const h = () => setMoreMenu(null);
    if (moreMenu) window.addEventListener("click", h);
    return () => window.removeEventListener("click", h);
  }, [moreMenu]);

  /* ── data ── */
  const fetchClasses = async () => {
    setLoading(true);
    const { data } = await supabase.from("public_classes").select("*").order("created_at", { ascending: false });
    setClasses((data as PublicClass[]) || []);
    setLoading(false);
  };

  const fetchRegistrants = useCallback(async (classId: string) => {
    setRegLoading(true);
    const { data } = await supabase
      .from("public_class_registrations").select("*")
      .eq("class_id", classId).order("registered_at", { ascending: false });
    setRegistrants((data as Registration[]) || []);
    setRegLoading(false);
  }, []);

  const fetchAllContacts = useCallback(async () => {
    setContactsLoading(true);
    const { data } = await supabase
      .from("public_class_registrations")
      .select("*, public_classes(title)")
      .order("registered_at", { ascending: false });
    if (data) setAllContacts(data.map((r: any) => ({ ...r, class_title: r.public_classes?.title ?? "Unknown" })) as Registration[]);
    setContactsLoading(false);
  }, []);

  const saveReminderConfig = (u: Record<string, ReminderConfig>) => {
    setReminderConfig(u);
    localStorage.setItem("tahleem_reminder_configs", JSON.stringify(u));
  };

  /* ── create ── */
  const handleCreate = async () => {
    if (!form.title.trim()) { toast.error("Title required"); return; }
    setSaving(true);
    const roomCode = generateRoomCode();
    const { error } = await supabase.from("public_classes").insert({
      title: form.title, title_ar: form.title_ar || null,
      description: form.description || null, description_ar: form.description_ar || null,
      scheduled_at: form.scheduled_at || null, room_code: roomCode,
      livekit_room_name: `public-${roomCode}`,
      join_url: `${window.location.origin}/live/${roomCode}`,
      host_id: user!.id, password_enabled: form.password_enabled,
      password: form.password_enabled ? form.password : null,
      max_guests: form.max_guests, require_name: form.require_name,
      allow_guest_camera: form.allow_guest_camera, allow_guest_mic: form.allow_guest_mic,
      chat_enabled: form.chat_enabled, raise_hand_enabled: form.raise_hand_enabled,
      recording_enabled: form.recording_enabled, is_featured: form.is_featured,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Class created!");
    setCreateOpen(false); setForm(blankForm); fetchClasses();
  };

  /* ── edit ── */
  const openEdit = (cls: PublicClass) => {
    setForm({
      title:            cls.title,
      title_ar:         cls.title_ar         ?? "",
      description:      cls.description      ?? "",
      description_ar:   cls.description_ar   ?? "",
      scheduled_at:     cls.scheduled_at
        ? new Date(cls.scheduled_at).toISOString().slice(0, 16)
        : "",
      password_enabled: cls.password_enabled ?? false,
      password:         cls.password         ?? "",
      max_guests:       cls.max_guests       ?? 100,
      require_name:     cls.require_name     ?? true,
      allow_guest_camera: cls.allow_guest_camera ?? false,
      allow_guest_mic:    cls.allow_guest_mic    ?? false,
      chat_enabled:       cls.chat_enabled       ?? true,
      raise_hand_enabled: cls.raise_hand_enabled ?? true,
      recording_enabled:  cls.recording_enabled  ?? false,
      is_featured:        cls.is_featured         ?? false,
    });
    setEditTarget(cls);
  };

  const handleUpdate = async () => {
    if (!editTarget) return;
    if (!form.title.trim()) { toast.error("Title required"); return; }
    setSaving(true);
    const { error } = await supabase.from("public_classes").update({
      title:           form.title,
      title_ar:        form.title_ar        || null,
      description:     form.description     || null,
      description_ar:  form.description_ar  || null,
      scheduled_at:    form.scheduled_at    || null,
      password_enabled:form.password_enabled,
      password:        form.password_enabled ? form.password : null,
      max_guests:      form.max_guests,
      require_name:    form.require_name,
      allow_guest_camera: form.allow_guest_camera,
      allow_guest_mic:    form.allow_guest_mic,
      chat_enabled:       form.chat_enabled,
      raise_hand_enabled: form.raise_hand_enabled,
      recording_enabled:  form.recording_enabled,
      is_featured:        form.is_featured,
    }).eq("id", editTarget.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Class updated!");
    setEditTarget(null); setForm(blankForm); fetchClasses();
  };

  /* ── go live / end / delete ── */
  const goLive = async (cls: PublicClass) => {
    await supabase.from("public_classes").update({ status: "live", actual_start_time: new Date().toISOString() }).eq("id", cls.id);
    try {
      const session = await supabase.auth.getSession();
      const token   = session.data.session?.access_token;
      const url     = import.meta.env.VITE_SUPABASE_URL || "https://wvqeubhupkddtkcdwqcm.supabase.co";
      const res     = await fetch(`${url}/functions/v1/public-class-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ room_code: cls.room_code, guest_name: user?.user_metadata?.full_name || "Teacher" }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Failed"); return; }
      navigate(`/live/${cls.room_code}/classroom`, {
        state: { token: data.token, url: data.url, room: data.room, guestName: data.participant_name, classTitle: cls.title, classTitleAr: cls.title_ar, isHost: true, classId: cls.id }
      });
    } catch { toast.error("Connection failed"); }
  };

  const endClass = async (id: string) => {
    await supabase.from("public_classes").update({ status: "ended", actual_end_time: new Date().toISOString() }).eq("id", id);
    toast.success("Class ended"); fetchClasses();
  };

  const rescheduleClass = async (cls: PublicClass, newDate: string) => {
    const update: Record<string, any> = {
      status: "scheduled",
      actual_end_time: null,
      actual_start_time: null,
    };
    if (newDate) update.scheduled_at = new Date(newDate).toISOString();
    await supabase.from("public_classes").update(update).eq("id", cls.id);
    toast.success("Class rescheduled — same link still works!");
    setRescheduleTarget(null);
    setRescheduleDate("");
    fetchClasses();
  };

  const deleteClass = async (cls: PublicClass) => {
    setDeleting(true);
    try {
      // Delete child records first to avoid FK constraint violations
      await supabase.from("public_class_registrations").delete().eq("class_id", cls.id);
      const { error } = await supabase.from("public_classes").delete().eq("id", cls.id);
      if (error) throw error;
      toast.success("Class deleted");
      setDeleteTarget(null);
      fetchClasses();
    } catch (e: any) {
      toast.error(e?.message || "Delete failed — try again");
    } finally {
      setDeleting(false);
    }
  };

  const archiveClass = async (id: string) => {
    await supabase.from("public_classes").update({ status: "archived" }).eq("id", id);
    toast.success("Class archived — hidden from lists but data is kept");
    setMoreMenu(null);
    fetchClasses();
  };

  const duplicateClass = async (cls: PublicClass) => {
    const { error } = await supabase.from("public_classes").insert({
      title:        cls.title + " (Copy)",
      title_ar:     cls.title_ar,
      description:  cls.description,
      description_ar: cls.description_ar,
      room_code:    generateRoomCode(),
      max_guests:   cls.max_guests,
      password:     cls.password,
      is_featured:  false,
      status:       "scheduled",
      scheduled_at: null,
    });
    if (error) { toast.error("Duplicate failed"); return; }
    toast.success("Class duplicated — edit it to set a new date");
    setMoreMenu(null);
    fetchClasses();
  };

  /* ── email blast ── */
  const openEmailBlast = (target: "class"|"all", cls?: PublicClass) => {
    const title     = cls?.title ?? "an upcoming class";
    const joinUrl   = cls ? `${window.location.origin}/live/${cls.room_code}` : "";
    const scheduled = cls?.scheduled_at ? format(new Date(cls.scheduled_at), "EEEE, MMMM d 'at' h:mm a") : "";
    setEmailTarget(target);
    setEmailSubject(`📚 Reminder: ${title} — Join Link Inside`);
    setEmailBody(
      `Assalamu Alaikum,\n\nWe wanted to remind you about the upcoming class you registered for:\n\n` +
      `📖 *${title}*\n${scheduled ? `📅 ${scheduled}\n` : ""}${joinUrl ? `🔗 Join here: ${joinUrl}\n` : ""}\n` +
      `Room Code: ${cls?.room_code ?? ""}\n\nWe look forward to having you with us.\n\n— Tahleem Academy\nبارك الله فيكم`
    );
    setSentCount(null); setEmailDialog(true);
  };

  const handleSendEmail = async () => {
    if (!emailSubject.trim() || !emailBody.trim()) { toast.error("Subject and body required"); return; }
    setSending(true);
    try {
      const supaUrl = import.meta.env.VITE_SUPABASE_URL || "https://wvqeubhupkddtkcdwqcm.supabase.co";
      const session = await supabase.auth.getSession();
      const tkn     = session.data.session?.access_token;
      const payload: any = { subject: emailSubject, body_text: emailBody };
      if (emailTarget === "class" && regDialog) payload.class_id = regDialog.id;
      else payload.all_contacts = true;
      const res  = await fetch(`${supaUrl}/functions/v1/send-guest-email-reminder`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "", "Authorization": `Bearer ${tkn}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Send failed");
      setSentCount(data.sent ?? 0);
      toast.success(`✅ Sent to ${data.sent} registrant${data.sent !== 1 ? "s" : ""}`);
    } catch (e: any) { toast.error(e.message); }
    setSending(false);
  };

  /* ── share helpers ── */
  const shareWhatsApp = (cls: PublicClass) => {
    const msg = encodeURIComponent(
      `Assalamu Alaikum! 🌙\n\nYou're invited to a FREE live Islamic class!\n\n📚 ${cls.title}\n` +
      (cls.scheduled_at ? `📅 ${format(new Date(cls.scheduled_at), "MMM d, yyyy 'at' h:mm a")}\n` : "") +
      `\nJoin here:\n${window.location.origin}/live/${cls.room_code}\n\nRoom Code: ${cls.room_code}\n\n🤲 Share with others!`
    );
    window.open(`https://wa.me/?text=${msg}`, "_blank");
  };
  const copyLink    = (cls: PublicClass) => { navigator.clipboard.writeText(`${window.location.origin}/live/${cls.room_code}`); toast.success("Link copied!"); };
  const copyEmails  = (regs: Registration[]) => { const e = regs.filter(r=>r.email).map(r=>r.email).join(", "); if(!e){toast.error("No emails");return;} navigator.clipboard.writeText(e); toast.success(`Copied ${regs.filter(r=>r.email).length} emails`); };
  const exportCSV   = (regs: Registration[], fname: string) => {
    const rows = [["Name","Email","Phone","Registered At","Class"], ...regs.map(r=>[r.name,r.email||"",r.phone||"",r.registered_at?format(new Date(r.registered_at),"dd/MM/yyyy HH:mm"):"",r.class_title||""])];
    const blob = new Blob([rows.map(r=>r.map(c=>`"${c}"`).join(",")).join("\n")],{type:"text/csv"});
    const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=fname; a.click();
  };

  /* ── derived ── */
  const visibleClasses = showArchived ? classes : classes.filter(c => c.status !== "archived");
  const displayed      = filterTab==="contacts" ? [] : visibleClasses.filter(c => filterTab==="all" || c.status===filterTab);
  const liveCount      = visibleClasses.filter(c=>c.status==="live").length;
  const scheduledCount = visibleClasses.filter(c=>c.status==="scheduled").length;
  const endedCount     = visibleClasses.filter(c=>c.status==="ended").length;
  const archivedCount  = classes.filter(c=>c.status==="archived").length;
  const withEmail      = allContacts.filter(r=>r.email).length;

  const filteredRegs  = registrants.filter(r => r.name.toLowerCase().includes(regSearch.toLowerCase()) || (r.email||"").toLowerCase().includes(regSearch.toLowerCase()));
  const filteredConts = allContacts.filter(r => r.name.toLowerCase().includes(contactSearch.toLowerCase()) || (r.email||"").toLowerCase().includes(contactSearch.toLowerCase()) || (r.class_title||"").toLowerCase().includes(contactSearch.toLowerCase()));

  /* ── shared sub-components ── */
  const TR = ({ label, sub, checked, onChange }: any) => (
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid #F3F4F6"}}>
      <div><p style={{fontSize:13,fontWeight:600,color:"#374151",margin:0}}>{label}</p>{sub&&<p style={{fontSize:11,color:"#9CA3AF",margin:0}}>{sub}</p>}</div>
      <Switch checked={checked} onCheckedChange={onChange}/>
    </div>
  );

  const RegRow = ({ r }: { r: Registration }) => (
    <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:"1px solid #F3F4F6"}}>
      <div style={{width:36,height:36,borderRadius:"50%",background:`${G}18`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
        <span style={{fontSize:14,fontWeight:800,color:G}}>{r.name.charAt(0).toUpperCase()}</span>
      </div>
      <div style={{flex:1,minWidth:0}}>
        <p style={{fontSize:13,fontWeight:700,color:"#111",margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name}</p>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:1}}>
          {r.email && <span style={{fontSize:11,color:"#6B7280",display:"flex",alignItems:"center",gap:2}}><AtSign size={9}/>{r.email}</span>}
          {r.phone && <span style={{fontSize:11,color:"#6B7280",display:"flex",alignItems:"center",gap:2}}><Phone size={9}/>{r.phone}</span>}
          {r.class_title && <span style={{fontSize:10,padding:"1px 6px",borderRadius:10,background:`${G}15`,color:G,fontWeight:600}}>{r.class_title}</span>}
        </div>
      </div>
      <div style={{flexShrink:0,textAlign:"right"}}>
        <span style={{fontSize:10,padding:"2px 6px",borderRadius:10,background:r.email?"#DCFCE7":"#FEE2E2",color:r.email?"#166534":"#991B1B",fontWeight:600}}>
          {r.email ? "✓ email" : "no email"}
        </span>
        {r.registered_at && <p style={{fontSize:10,color:"#9CA3AF",margin:"2px 0 0"}}>{format(new Date(r.registered_at),"dd MMM, h:mm a")}</p>}
      </div>
    </div>
  );

  /* ── shared form fields (create & edit) ── */
  const ClassForm = () => (
    <div style={{padding:16,display:"flex",flexDirection:"column",gap:14}}>
      <div>
        <label style={{fontSize:12,fontWeight:700,color:"#6B7280",display:"block",marginBottom:5}}>Title (English) *</label>
        <Input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="e.g. Al-Udhiyyah" style={{borderRadius:10}}/>
      </div>
      <div>
        <label style={{fontSize:12,fontWeight:700,color:"#6B7280",display:"block",marginBottom:5}}>العنوان (عربي)</label>
        <Input dir="rtl" value={form.title_ar} onChange={e=>setForm(f=>({...f,title_ar:e.target.value}))} style={{borderRadius:10}}/>
      </div>
      <div>
        <label style={{fontSize:12,fontWeight:700,color:"#6B7280",display:"block",marginBottom:5}}>Description</label>
        <Textarea value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} rows={3} style={{borderRadius:10}}/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div>
          <label style={{fontSize:12,fontWeight:700,color:"#6B7280",display:"block",marginBottom:5}}>Date & Time</label>
          <Input type="datetime-local" value={form.scheduled_at} onChange={e=>setForm(f=>({...f,scheduled_at:e.target.value}))} style={{borderRadius:10}}/>
        </div>
        <div>
          <label style={{fontSize:12,fontWeight:700,color:"#6B7280",display:"block",marginBottom:5}}>Max Guests</label>
          <Input type="number" value={form.max_guests} onChange={e=>setForm(f=>({...f,max_guests:parseInt(e.target.value)||100}))} style={{borderRadius:10}}/>
        </div>
      </div>
      <div style={{background:"#F9FAFB",borderRadius:12,padding:"4px 14px"}}>
        <TR label="Password Protection" sub="Restrict with a password" checked={form.password_enabled} onChange={(v:boolean)=>setForm(f=>({...f,password_enabled:v}))}/>
        {form.password_enabled && <Input value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))} placeholder="Set class password" style={{borderRadius:9,marginBottom:10}}/>}
        <TR label="Require Name"         checked={form.require_name}       onChange={(v:boolean)=>setForm(f=>({...f,require_name:v}))}/>
        <TR label="Enable Chat"          checked={form.chat_enabled}       onChange={(v:boolean)=>setForm(f=>({...f,chat_enabled:v}))}/>
        <TR label="Raise Hand"           checked={form.raise_hand_enabled} onChange={(v:boolean)=>setForm(f=>({...f,raise_hand_enabled:v}))}/>
        <TR label="Allow Guest Camera"   checked={form.allow_guest_camera} onChange={(v:boolean)=>setForm(f=>({...f,allow_guest_camera:v}))}/>
        <TR label="Allow Guest Mic"      checked={form.allow_guest_mic}    onChange={(v:boolean)=>setForm(f=>({...f,allow_guest_mic:v}))}/>
        <TR label="Record Class"         checked={form.recording_enabled}  onChange={(v:boolean)=>setForm(f=>({...f,recording_enabled:v}))}/>
        <TR label="Feature on Homepage"  checked={form.is_featured}        onChange={(v:boolean)=>setForm(f=>({...f,is_featured:v}))} sub="Pin to the homepage"/>
      </div>
    </div>
  );

  /* ════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════ */
  return (
    <div style={{minHeight:"100vh",background:"#F3F4F6"}}>

      {/* ── Header ── */}
      <div style={{background:"#fff",borderBottom:"1px solid #E5E7EB",padding:"14px 16px",position:"sticky",top:0,zIndex:10}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:38,height:38,borderRadius:10,background:"#FFF7ED",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <Globe size={18} color={GOLD}/>
            </div>
            <div>
              <h1 style={{fontSize:17,fontWeight:800,color:"#111",margin:0}}>Public Classes</h1>
              <p style={{fontSize:11,color:"#6B7280",margin:0}}>{visibleClasses.length} classes · {liveCount>0?`🔴 ${liveCount} live`:`${scheduledCount} scheduled`}</p>
            </div>
          </div>
          <button onClick={()=>{setForm(blankForm);setCreateOpen(true);}}
            style={{display:"flex",alignItems:"center",gap:6,padding:"9px 14px",borderRadius:10,border:"none",background:GOLD,color:"#fff",cursor:"pointer",fontWeight:700,fontSize:13,flexShrink:0}}>
            <Plus size={15}/> New Class
          </button>
        </div>
      </div>

      <div style={{padding:"12px 14px",maxWidth:680,margin:"0 auto"}}>

        {/* ── Stats 2×2 grid ── */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
          {[
            {v:liveCount,      l:"Live Now",   icon:"🔴",bg:"#FEF2F2",c:"#DC2626"},
            {v:scheduledCount, l:"Scheduled",  icon:"📅",bg:"#EFF6FF",c:"#1D4ED8"},
            {v:endedCount,     l:"Completed",  icon:"✅",bg:"#F0FDF4",c:"#166534"},
            {v:allContacts.filter(r=>r.email).length||0, l:"With Email", icon:"📧",bg:"#FFF7ED",c:"#C2410C"},
          ].map((s,i)=>(
            <div key={i} style={{background:s.bg,borderRadius:12,padding:"12px 14px",display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:22}}>{s.icon}</span>
              <div>
                <div style={{fontSize:22,fontWeight:900,color:s.c,lineHeight:1}}>{s.v}</div>
                <div style={{fontSize:11,color:s.c,opacity:.75,fontWeight:600}}>{s.l}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Filter tabs — horizontal scroll ── */}
        <div style={{overflowX:"auto",marginBottom:12,WebkitOverflowScrolling:"touch"}}>
          <div style={{display:"flex",gap:6,background:"#fff",borderRadius:12,padding:5,border:"1px solid #E5E7EB",width:"max-content",minWidth:"100%"}}>
            {(["all","live","scheduled","ended","contacts"] as const).map(tab=>(
              <button key={tab} onClick={()=>setFilterTab(tab)}
                style={{padding:"7px 14px",borderRadius:8,border:"none",cursor:"pointer",fontWeight:700,fontSize:12,whiteSpace:"nowrap",
                  background:filterTab===tab?G:"transparent",color:filterTab===tab?"#fff":"#6B7280"}}>
                {tab==="live"?"🔴 ":tab==="scheduled"?"📅 ":tab==="ended"?"✅ ":tab==="contacts"?"👥 ":""}
                {tab.charAt(0).toUpperCase()+tab.slice(1)}
                {tab!=="contacts"&&` (${tab==="all"?visibleClasses.length:visibleClasses.filter(c=>c.status===tab).length})`}
              </button>
            ))}
          </div>
          {/* Archived toggle */}
          {archivedCount > 0 && (
            <button onClick={()=>setShowArchived(v=>!v)}
              style={{display:"flex",alignItems:"center",gap:5,padding:"6px 12px",borderRadius:8,border:`1.5px solid ${showArchived?"#C9A84C":"#E5E7EB"}`,background:showArchived?"#FFFBEB":"#fff",color:showArchived?"#92400E":"#6B7280",fontSize:12,fontWeight:600,cursor:"pointer",marginTop:8,alignSelf:"flex-start"}}>
              <Archive size={12}/> {showArchived ? "Hide" : "Show"} Archived ({archivedCount})
            </button>
          )}
        </div>

        {/* ══════════════════════════════════
            CONTACTS TAB
        ══════════════════════════════════ */}
        {filterTab==="contacts" && (
          <div style={{background:"#fff",borderRadius:16,border:"1px solid #E5E7EB",overflow:"hidden"}}>
            <div style={{padding:"14px 16px",borderBottom:"1px solid #F3F4F6"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                <div>
                  <h2 style={{fontSize:15,fontWeight:800,color:"#111",margin:0}}>All Contacts</h2>
                  <p style={{fontSize:11,color:"#6B7280",margin:0}}>{allContacts.length} total · {allContacts.filter(r=>r.email).length} with email</p>
                </div>
                <button onClick={fetchAllContacts} style={{padding:"7px 10px",borderRadius:9,border:"1.5px solid #E5E7EB",background:"#fff",cursor:"pointer"}}>
                  <RefreshCw size={14} color="#6B7280"/>
                </button>
              </div>
              {/* Action buttons — scrollable row */}
              <div style={{display:"flex",gap:6,overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
                {[
                  {label:"Copy Emails", icon:<Copy size={12}/>,   action:()=>copyEmails(allContacts)},
                  {label:"Export CSV",  icon:<Download size={12}/>,action:()=>exportCSV(allContacts,"tahleem-contacts.csv")},
                  {label:"Email All",   icon:<Mail size={12}/>,   action:()=>openEmailBlast("all"), gold:true},
                ].map((b,i)=>(
                  <button key={i} onClick={b.action}
                    style={{display:"flex",alignItems:"center",gap:5,padding:"8px 12px",borderRadius:9,border:`1.5px solid ${(b as any).gold?GOLD:"#E5E7EB"}`,background:(b as any).gold?GOLD:"#fff",color:(b as any).gold?"#fff":"#374151",cursor:"pointer",fontWeight:600,fontSize:12,whiteSpace:"nowrap",flexShrink:0}}>
                    {b.icon}{b.label}
                  </button>
                ))}
              </div>
            </div>
            {/* Search */}
            <div style={{padding:"10px 16px",borderBottom:"1px solid #F3F4F6"}}>
              <div style={{position:"relative"}}>
                <Search size={13} style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",color:"#9CA3AF"}}/>
                <input value={contactSearch} onChange={e=>setContactSearch(e.target.value)} placeholder="Search name, email or class…"
                  style={{width:"100%",padding:"8px 10px 8px 28px",borderRadius:8,border:"1.5px solid #E5E7EB",fontSize:12,outline:"none",boxSizing:"border-box"}}/>
              </div>
            </div>
            <div style={{maxHeight:460,overflowY:"auto",padding:"0 16px"}}>
              {contactsLoading
                ? <div style={{textAlign:"center",padding:32}}><Loader2 size={22} style={{animation:"spin .8s linear infinite",color:G}}/></div>
                : filteredConts.length===0
                  ? <div style={{textAlign:"center",padding:32,color:"#9CA3AF"}}><Users size={28} style={{margin:"0 auto 8px",opacity:.3}}/><p style={{fontSize:13}}>No contacts yet.</p></div>
                  : filteredConts.map(r=><RegRow key={r.id} r={r}/>)
              }
            </div>
          </div>
        )}

        {/* ══════════════════════════════════
            CLASS CARDS
        ══════════════════════════════════ */}
        {filterTab!=="contacts" && (
          loading
            ? <div style={{textAlign:"center",padding:48}}><Loader2 size={28} style={{animation:"spin .8s linear infinite",color:G}}/></div>
            : displayed.length===0
              ? <div style={{textAlign:"center",padding:"40px 20px",background:"#fff",borderRadius:16,border:"2px dashed #E5E7EB"}}>
                  <Globe size={38} color="#D1D5DB" style={{margin:"0 auto 10px"}}/>
                  <p style={{fontWeight:700,color:"#374151"}}>No classes here yet</p>
                  <button onClick={()=>{setForm(blankForm);setCreateOpen(true);}} style={{marginTop:10,padding:"9px 18px",borderRadius:10,border:"none",background:GOLD,color:"#fff",cursor:"pointer",fontWeight:700,fontSize:13}}>+ Create one</button>
                </div>
              : <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {displayed.map(cls=>{
                    const isScheduled = cls.status==="scheduled";
                    const reminder    = reminderConfig[cls.id];
                    return (
                      <div key={cls.id} style={{background:"#fff",borderRadius:16,
                        border:`2px solid ${cls.status==="live"?"#FECACA":cls.is_featured?"#FDE68A":"#E5E7EB"}`,
                        overflow:"hidden"}}>

                        {/* ── Card top: title + badges + edit/more ── */}
                        <div style={{padding:"14px 14px 0"}}>
                          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8}}>
                            <div style={{flex:1,minWidth:0}}>
                              {/* Badges row */}
                              <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:5}}>
                                {cls.status==="live"      && <span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:"#FEE2E2",color:"#DC2626",fontWeight:700,display:"flex",alignItems:"center",gap:3}}><Radio size={8}/> LIVE</span>}
                                {cls.status==="scheduled" && <span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:"#DBEAFE",color:"#1D4ED8",fontWeight:700}}>Scheduled</span>}
                                {cls.status==="ended"     && <span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:"#F3F4F6",color:"#6B7280",fontWeight:600}}>Ended</span>}
                                {cls.is_featured          && <span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:"#FEF9C3",color:"#854D0E",fontWeight:700}}>⭐ Featured</span>}
                                {reminder?.enabled        && <span style={{fontSize:10,padding:"2px 7px",borderRadius:20,background:"#FFFBEB",color:GOLD,fontWeight:600,display:"flex",alignItems:"center",gap:2}}><Bell size={8}/> Auto-remind</span>}
                              </div>
                              <p style={{fontWeight:800,fontSize:15,color:"#111",margin:0}}>{cls.title}</p>
                              {cls.title_ar && <p style={{fontSize:12,color:"#9CA3AF",margin:"2px 0 0",fontFamily:"'Amiri',serif",direction:"rtl"}}>{cls.title_ar}</p>}
                            </div>
                            {/* Edit + more menu */}
                            <div style={{display:"flex",gap:5,flexShrink:0}}>
                              <button onClick={()=>openEdit(cls)}
                                style={{padding:"7px 9px",borderRadius:9,border:"1.5px solid #E5E7EB",background:"#fff",cursor:"pointer",display:"flex",alignItems:"center",gap:4,fontSize:12,fontWeight:600,color:"#374151"}}>
                                <Pencil size={13} color={GOLD}/> Edit
                              </button>
                              <div style={{position:"relative"}}>
                                <button onClick={e=>{e.stopPropagation();setMoreMenu(moreMenu===cls.id?null:cls.id);}}
                                  style={{padding:"7px 9px",borderRadius:9,border:"1.5px solid #E5E7EB",background:"#fff",cursor:"pointer"}}>
                                  <MoreHorizontal size={15} color="#6B7280"/>
                                </button>
                                {moreMenu===cls.id && (
                                  <div onClick={e=>e.stopPropagation()}
                                    style={{position:"absolute",right:0,top:"calc(100% + 5px)",background:"#fff",borderRadius:12,border:"1.5px solid #E5E7EB",boxShadow:"0 8px 24px rgba(0,0,0,.12)",zIndex:50,minWidth:180,overflow:"hidden"}}>
                                    {[
                                      {label:"Copy Link",    icon:<Copy size={13}/>,        action:()=>{copyLink(cls);setMoreMenu(null);}},
                                      {label:"Share",        icon:<Share2 size={13}/>,       action:()=>{setShareClass(cls);setMoreMenu(null);}},
                                      {label:"Open Preview", icon:<ExternalLink size={13}/>, action:()=>{window.open(`/live/${cls.room_code}`,"_blank");setMoreMenu(null);}},
                                      {label:"QR Code",      icon:<QrCode size={13}/>,       action:()=>{window.open(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(window.location.origin+"/live/"+cls.room_code)}`,"_blank");setMoreMenu(null);}},
                                      {label:"Duplicate",    icon:<CopyPlus size={13}/>,     action:()=>duplicateClass(cls)},
                                      ...(cls.status==="ended"||cls.status==="archived" ? [{label:"View Stats", icon:<BarChart2 size={13}/>, action:()=>{setStatsTarget(cls);setMoreMenu(null);}}] : []),
                                      ...(cls.status!=="archived" ? [{label:"Archive",  icon:<Archive size={13}/>, action:()=>archiveClass(cls.id)}] : [{label:"Unarchive", icon:<Archive size={13}/>, action:async()=>{await supabase.from("public_classes").update({status:"ended"}).eq("id",cls.id);toast.success("Unarchived");setMoreMenu(null);fetchClasses();}}]),
                                    ].map((item,i)=>(
                                      <button key={i} onClick={item.action}
                                        style={{width:"100%",padding:"11px 14px",border:"none",background:"#fff",cursor:"pointer",display:"flex",alignItems:"center",gap:9,fontSize:13,fontWeight:600,color:"#374151",textAlign:"left",borderBottom:"1px solid #F3F4F6"}}>
                                        {item.icon}{item.label}
                                      </button>
                                    ))}
                                    <button onClick={()=>{setDeleteTarget(cls);setMoreMenu(null);}}
                                      style={{width:"100%",padding:"11px 14px",border:"none",background:"#FEF2F2",cursor:"pointer",display:"flex",alignItems:"center",gap:9,fontSize:13,fontWeight:600,color:"#DC2626",textAlign:"left"}}>
                                      <Trash2 size={13}/>Delete Permanently
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* ── Meta row ── */}
                          <div style={{display:"flex",gap:12,flexWrap:"wrap",margin:"8px 0"}}>
                            <span style={{fontSize:12,color:"#6B7280",display:"flex",alignItems:"center",gap:3}}>
                              <Calendar size={11}/>{cls.scheduled_at?format(new Date(cls.scheduled_at),"MMM d, h:mm a"):"No date"}
                            </span>
                            <span style={{fontSize:12,color:"#6B7280",display:"flex",alignItems:"center",gap:3}}>
                              <Users size={11}/>{cls.guest_count}/{cls.max_guests} guests
                            </span>
                            <span style={{fontSize:12,color:"#6B7280"}}>
                              Code: <code style={{fontFamily:"monospace",fontWeight:800,color:"#374151"}}>{cls.room_code}</code>
                            </span>
                          </div>
                        </div>

                        {/* ── Action bar ── */}
                        <div style={{padding:"10px 14px 14px",display:"flex",gap:7,overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
                          {/* Primary action */}
                          {(cls.status==="scheduled"||cls.status==="live") && (
                            <button onClick={()=>goLive(cls)}
                              style={{display:"flex",alignItems:"center",gap:5,padding:"9px 16px",borderRadius:10,border:"none",background:"#16A34A",color:"#fff",cursor:"pointer",fontSize:13,fontWeight:700,flexShrink:0}}>
                              <Video size={13}/>{cls.status==="live"?"Rejoin":"Go Live"}
                            </button>
                          )}
                          {cls.status==="live" && (
                            <button onClick={()=>endClass(cls.id)}
                              style={{padding:"9px 14px",borderRadius:10,border:"none",background:"#DC2626",color:"#fff",cursor:"pointer",fontSize:13,fontWeight:700,flexShrink:0}}>
                              End
                            </button>
                          )}
                          {/* Reschedule button for ended classes */}
                          {cls.status==="ended" && (
                            <button onClick={()=>{ setRescheduleTarget(cls); setRescheduleDate(cls.scheduled_at ? new Date(cls.scheduled_at).toISOString().slice(0,16) : ""); }}
                              style={{display:"flex",alignItems:"center",gap:5,padding:"9px 16px",borderRadius:10,border:"none",background:"#16A34A",color:"#fff",cursor:"pointer",fontSize:13,fontWeight:700,flexShrink:0}}>
                              <Calendar size={13}/> Reschedule
                            </button>
                          )}
                          {/* Secondary actions — icon+label buttons */}
                          {isScheduled && (
                            <button onClick={()=>{setRegDialog(cls);fetchRegistrants(cls.id);setRegSearch("");}}
                              style={{display:"flex",alignItems:"center",gap:5,padding:"9px 13px",borderRadius:10,border:"1.5px solid #E5E7EB",background:"#fff",cursor:"pointer",fontSize:12,fontWeight:600,color:"#374151",flexShrink:0}}>
                              <Users size={13} color={G}/> Registrants
                            </button>
                          )}
                          {isScheduled && (
                            <button onClick={()=>setReminderDlg(cls)}
                              style={{display:"flex",alignItems:"center",gap:5,padding:"9px 13px",borderRadius:10,border:`1.5px solid ${reminder?.enabled?GOLD:"#E5E7EB"}`,background:reminder?.enabled?"#FFFBEB":"#fff",cursor:"pointer",fontSize:12,fontWeight:600,color:reminder?.enabled?GOLD:"#374151",flexShrink:0}}>
                              {reminder?.enabled?<Bell size={13}/>:<BellOff size={13}/>} Remind
                            </button>
                          )}
                          <button onClick={()=>setShareClass(cls)}
                            style={{display:"flex",alignItems:"center",gap:5,padding:"9px 13px",borderRadius:10,border:"1.5px solid #E5E7EB",background:"#fff",cursor:"pointer",fontSize:12,fontWeight:600,color:"#374151",flexShrink:0}}>
                            <Share2 size={13}/> Share
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
        )}
      </div>

      {/* ════════════════════════════════════
          CREATE DIALOG
      ════════════════════════════════════ */}
      <Dialog open={createOpen} onOpenChange={v=>{if(!v){setCreateOpen(false);setForm(blankForm);}}}>
        <DialogContent style={{maxWidth:500,borderRadius:20,padding:0,maxHeight:"92vh",display:"flex",flexDirection:"column"}}>
          <div style={{background:GOLD,padding:"16px 18px",borderRadius:"20px 20px 0 0",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}><Globe size={18} color="#fff"/><h2 style={{fontWeight:800,fontSize:15,color:"#fff",margin:0}}>New Public Class</h2></div>
            <button onClick={()=>setCreateOpen(false)} style={{background:"rgba(255,255,255,.2)",border:"none",borderRadius:7,padding:"5px 7px",cursor:"pointer",color:"#fff"}}><X size={15}/></button>
          </div>
          <div style={{flex:1,overflowY:"auto"}}><ClassForm/></div>
          <div style={{padding:"12px 16px",borderTop:"1px solid #E5E7EB",flexShrink:0}}>
            <button onClick={handleCreate} disabled={!form.title||saving}
              style={{width:"100%",padding:"12px 0",borderRadius:12,border:"none",background:!form.title||saving?"#E5E7EB":GOLD,color:!form.title||saving?"#9CA3AF":"#fff",cursor:"pointer",fontWeight:700,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
              {saving?<><Loader2 size={15} style={{animation:"spin .8s linear infinite"}}/>Creating…</>:"Create Public Class"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════
          EDIT DIALOG
      ════════════════════════════════════ */}
      <Dialog open={!!editTarget} onOpenChange={v=>{if(!v){setEditTarget(null);setForm(blankForm);}}}>
        <DialogContent style={{maxWidth:500,borderRadius:20,padding:0,maxHeight:"92vh",display:"flex",flexDirection:"column"}}>
          <div style={{background:G,padding:"16px 18px",borderRadius:"20px 20px 0 0",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <Pencil size={16} color={GOLD}/>
              <div>
                <h2 style={{fontWeight:800,fontSize:15,color:"#fff",margin:0}}>Edit Class</h2>
                <p style={{fontSize:11,color:"rgba(255,255,255,.65)",margin:0}}>{editTarget?.title}</p>
              </div>
            </div>
            <button onClick={()=>setEditTarget(null)} style={{background:"rgba(255,255,255,.15)",border:"none",borderRadius:7,padding:"5px 7px",cursor:"pointer",color:"#fff"}}><X size={15}/></button>
          </div>
          <div style={{flex:1,overflowY:"auto"}}><ClassForm/></div>
          <div style={{padding:"12px 16px",borderTop:"1px solid #E5E7EB",flexShrink:0,display:"flex",gap:8}}>
            <button onClick={()=>{setEditTarget(null);setForm(blankForm);}}
              style={{flex:1,padding:"12px 0",borderRadius:12,border:"1.5px solid #E5E7EB",background:"#fff",cursor:"pointer",fontWeight:600,fontSize:14,color:"#374151"}}>
              Cancel
            </button>
            <button onClick={handleUpdate} disabled={!form.title||saving}
              style={{flex:2,padding:"12px 0",borderRadius:12,border:"none",background:!form.title||saving?"#E5E7EB":G,color:!form.title||saving?"#9CA3AF":"#fff",cursor:"pointer",fontWeight:700,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
              {saving?<><Loader2 size={15} style={{animation:"spin .8s linear infinite"}}/>Saving…</>:"Save Changes"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════
          REGISTRANTS DIALOG
      ════════════════════════════════════ */}
      <Dialog open={!!regDialog} onOpenChange={v=>!v&&setRegDialog(null)}>
        <DialogContent style={{maxWidth:500,borderRadius:20,padding:0,maxHeight:"90vh",display:"flex",flexDirection:"column"}}>
          <div style={{background:G,padding:"16px 18px",borderRadius:"20px 20px 0 0",flexShrink:0}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div><h2 style={{fontWeight:800,fontSize:15,color:"#fff",margin:0}}>Pre-Registered Waitlist</h2><p style={{fontSize:11,color:"rgba(255,255,255,.65)",margin:0}}>{regDialog?.title}</p></div>
              <button onClick={()=>setRegDialog(null)} style={{background:"rgba(255,255,255,.15)",border:"none",borderRadius:7,padding:"5px 7px",cursor:"pointer",color:"#fff"}}><X size={15}/></button>
            </div>
          </div>
          {/* Stats bar */}
          <div style={{padding:"10px 16px",background:"#F9FAFB",borderBottom:"1px solid #E5E7EB",display:"flex",gap:16,alignItems:"center",flexShrink:0}}>
            {[{v:registrants.length,l:"Total",c:G},{v:registrants.filter(r=>r.email).length,l:"With Email",c:"#16A34A"},{v:registrants.filter(r=>!r.email).length,l:"No Email",c:"#DC2626"}].map((s,i)=>(
              <div key={i} style={{textAlign:"center"}}>
                <p style={{fontSize:18,fontWeight:900,color:s.c,margin:0}}>{s.v}</p>
                <p style={{fontSize:10,color:"#6B7280",margin:0}}>{s.l}</p>
              </div>
            ))}
            <div style={{marginLeft:"auto",display:"flex",gap:6}}>
              <button onClick={()=>copyEmails(registrants)} style={{padding:"6px 9px",borderRadius:8,border:"1.5px solid #E5E7EB",background:"#fff",cursor:"pointer",display:"flex",alignItems:"center",gap:3,fontSize:11,fontWeight:600}}><Copy size={11}/>Emails</button>
              <button onClick={()=>exportCSV(registrants,`regs-${regDialog?.room_code}.csv`)} style={{padding:"6px 9px",borderRadius:8,border:"1.5px solid #E5E7EB",background:"#fff",cursor:"pointer",display:"flex",alignItems:"center",gap:3,fontSize:11,fontWeight:600}}><Download size={11}/>CSV</button>
            </div>
          </div>
          {/* Search */}
          <div style={{padding:"10px 16px",borderBottom:"1px solid #F3F4F6",flexShrink:0}}>
            <div style={{position:"relative"}}><Search size={13} style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",color:"#9CA3AF"}}/><input value={regSearch} onChange={e=>setRegSearch(e.target.value)} placeholder="Search name or email…" style={{width:"100%",padding:"7px 10px 7px 28px",borderRadius:8,border:"1.5px solid #E5E7EB",fontSize:12,outline:"none",boxSizing:"border-box"}}/></div>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:"0 16px"}}>
            {regLoading
              ? <div style={{textAlign:"center",padding:32}}><Loader2 size={22} style={{animation:"spin .8s linear infinite",color:G}}/></div>
              : filteredRegs.length===0
                ? <div style={{textAlign:"center",padding:32,color:"#9CA3AF"}}><Users size={28} style={{margin:"0 auto 8px",opacity:.3}}/><p style={{fontSize:13}}>{registrants.length===0?"No one has pre-registered yet.":"No results."}</p></div>
                : filteredRegs.map(r=><RegRow key={r.id} r={r}/>)
            }
          </div>
          <div style={{padding:"12px 16px",borderTop:"1px solid #E5E7EB",background:"#FAFAFA",flexShrink:0}}>
            <button onClick={()=>openEmailBlast("class",regDialog!)}
              disabled={registrants.filter(r=>r.email).length===0}
              style={{width:"100%",padding:"11px 0",borderRadius:12,border:"none",background:registrants.filter(r=>r.email).length>0?GOLD:"#E5E7EB",color:registrants.filter(r=>r.email).length>0?"#fff":"#9CA3AF",cursor:registrants.filter(r=>r.email).length>0?"pointer":"not-allowed",fontWeight:700,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
              <Mail size={15}/>{registrants.filter(r=>r.email).length>0?`Email ${registrants.filter(r=>r.email).length} Registrant${registrants.filter(r=>r.email).length!==1?"s":""}` :"No emails to send to"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════
          REMINDER DIALOG
      ════════════════════════════════════ */}
      <Dialog open={!!reminderDlg} onOpenChange={v=>!v&&setReminderDlg(null)}>
        <DialogContent style={{maxWidth:400,borderRadius:20,padding:0}}>
          <div style={{background:GOLD,padding:"16px 18px",borderRadius:"20px 20px 0 0",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div><h2 style={{fontWeight:800,fontSize:15,color:"#fff",margin:0}}>📧 Reminder Settings</h2><p style={{fontSize:11,color:"rgba(255,255,255,.8)",margin:0}}>{reminderDlg?.title}</p></div>
            <button onClick={()=>setReminderDlg(null)} style={{background:"rgba(255,255,255,.2)",border:"none",borderRadius:7,padding:"5px 7px",cursor:"pointer",color:"#fff"}}><X size={15}/></button>
          </div>
          {reminderDlg&&(()=>{
            const cfg = reminderConfig[reminderDlg.id]||{enabled:false,minutesBefore:60};
            return (
              <div style={{padding:18}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 14px",background:"#F9FAFB",borderRadius:12,marginBottom:14}}>
                  <div><p style={{fontWeight:700,fontSize:14,color:"#111",margin:0}}>Auto-send reminder</p><p style={{fontSize:12,color:"#6B7280",margin:0}}>Emails all registrants before class</p></div>
                  <Switch checked={cfg.enabled} onCheckedChange={v=>saveReminderConfig({...reminderConfig,[reminderDlg.id]:{...cfg,enabled:v}})}/>
                </div>
                <div style={{marginBottom:14}}>
                  <label style={{fontSize:12,fontWeight:700,color:"#6B7280",display:"block",marginBottom:8}}>When to send</label>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                    {REMINDER_OPTIONS.map(opt=>(
                      <button key={opt.value} onClick={()=>saveReminderConfig({...reminderConfig,[reminderDlg.id]:{...cfg,minutesBefore:opt.value}})}
                        style={{padding:"9px 10px",borderRadius:10,border:`2px solid ${cfg.minutesBefore===opt.value?GOLD:"#E5E7EB"}`,background:cfg.minutesBefore===opt.value?"#FFFBEB":"#fff",color:cfg.minutesBefore===opt.value?GOLD:"#374151",cursor:"pointer",fontWeight:600,fontSize:12}}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                {cfg.lastSentAt&&<p style={{fontSize:11,color:"#9CA3AF",textAlign:"center",marginBottom:12}}>Last sent: {format(new Date(cfg.lastSentAt),"MMM d 'at' h:mm a")}</p>}
                <button onClick={()=>{openEmailBlast("class",reminderDlg);setReminderDlg(null);}}
                  style={{width:"100%",padding:"11px 0",borderRadius:12,border:"none",background:G,color:"#fff",cursor:"pointer",fontWeight:700,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                  <Send size={14}/>Compose & Send Now
                </button>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════
          EMAIL COMPOSER DIALOG
      ════════════════════════════════════ */}
      <Dialog open={emailDialog} onOpenChange={v=>!v&&setEmailDialog(false)}>
        <DialogContent style={{maxWidth:520,borderRadius:20,padding:0,maxHeight:"92vh",display:"flex",flexDirection:"column"}}>
          <div style={{background:emailTarget==="all"?G:GOLD,padding:"16px 18px",borderRadius:"20px 20px 0 0",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div><h2 style={{fontWeight:800,fontSize:15,color:"#fff",margin:0}}>{emailTarget==="all"?"📧 Email All Contacts":"📧 Email Registrants"}</h2><p style={{fontSize:11,color:"rgba(255,255,255,.8)",margin:0}}>{emailTarget==="all"?`${allContacts.filter(r=>r.email).length} contacts`:`${registrants.filter(r=>r.email).length} registrants`} with email</p></div>
            <button onClick={()=>setEmailDialog(false)} style={{background:"rgba(255,255,255,.2)",border:"none",borderRadius:7,padding:"5px 7px",cursor:"pointer",color:"#fff"}}><X size={15}/></button>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:16,display:"flex",flexDirection:"column",gap:12}}>
            <div><label style={{fontSize:12,fontWeight:700,color:"#6B7280",display:"block",marginBottom:5}}>Subject Line</label><Input value={emailSubject} onChange={e=>setEmailSubject(e.target.value)} placeholder="Email subject…" style={{borderRadius:10}}/></div>
            <div><label style={{fontSize:12,fontWeight:700,color:"#6B7280",display:"block",marginBottom:5}}>Email Body</label><Textarea value={emailBody} onChange={e=>setEmailBody(e.target.value)} rows={9} style={{borderRadius:10,fontFamily:"inherit",resize:"vertical"}}/></div>
            <div style={{padding:"10px 12px",borderRadius:10,background:"#F0FDF4",border:"1px solid #BBF7D0"}}>
              <p style={{fontSize:13,fontWeight:700,color:"#166534",margin:0}}>✅ Sending to: {emailTarget==="all"?allContacts.filter(r=>r.email).length:registrants.filter(r=>r.email).length} email addresses</p>
            </div>
            {sentCount!==null&&(
              <div style={{padding:"10px 12px",borderRadius:10,background:"#DBEAFE",border:"1px solid #93C5FD",display:"flex",alignItems:"center",gap:8}}>
                <CheckCircle size={16} color="#1D4ED8"/>
                <p style={{fontSize:13,fontWeight:700,color:"#1D4ED8",margin:0}}>Sent to {sentCount} recipient{sentCount!==1?"s":""}!</p>
              </div>
            )}
          </div>
          <div style={{padding:"12px 16px",borderTop:"1px solid #E5E7EB",background:"#FAFAFA",flexShrink:0,display:"flex",gap:8}}>
            <button onClick={()=>setEmailDialog(false)} style={{flex:1,padding:"11px 0",borderRadius:12,border:"1.5px solid #E5E7EB",background:"#fff",cursor:"pointer",fontWeight:600,fontSize:14,color:"#374151"}}>Cancel</button>
            <button onClick={handleSendEmail} disabled={sending||!emailSubject.trim()||!emailBody.trim()}
              style={{flex:2,padding:"11px 0",borderRadius:12,border:"none",background:sending||!emailSubject.trim()||!emailBody.trim()?"#E5E7EB":GOLD,color:sending||!emailSubject.trim()||!emailBody.trim()?"#9CA3AF":"#fff",cursor:"pointer",fontWeight:700,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
              {sending?<><Loader2 size={14} style={{animation:"spin .8s linear infinite"}}/>Sending…</>:<><Send size={14}/>Send Email</>}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════
          SHARE DIALOG
      ════════════════════════════════════ */}
      <Dialog open={!!shareClass} onOpenChange={v=>!v&&setShareClass(null)}>
        <DialogContent style={{maxWidth:380,borderRadius:20,padding:0}}>
          <div style={{background:G,padding:"16px 18px",borderRadius:"20px 20px 0 0",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div><h2 style={{fontWeight:800,fontSize:15,color:"#fff",margin:0}}>Share Class</h2><p style={{fontSize:11,color:"rgba(255,255,255,.65)",margin:0}}>{shareClass?.title}</p></div>
            <button onClick={()=>setShareClass(null)} style={{background:"rgba(255,255,255,.15)",border:"none",borderRadius:7,padding:"5px 7px",cursor:"pointer",color:"#fff"}}><X size={15}/></button>
          </div>
          {shareClass&&(
            <div style={{padding:18}}>
              <div style={{background:"#F9FAFB",borderRadius:12,padding:14,textAlign:"center",marginBottom:14}}>
                <p style={{fontSize:11,color:"#9CA3AF",margin:"0 0 4px"}}>Public Join Link</p>
                <p style={{fontFamily:"monospace",fontWeight:700,fontSize:12,color:"#374151",margin:"0 0 8px",wordBreak:"break-all"}}>{window.location.origin}/live/{shareClass.room_code}</p>
                <div style={{display:"inline-flex",alignItems:"center",gap:6,padding:"5px 14px",borderRadius:20,background:`${G}12`}}>
                  <span style={{fontSize:12,color:"#6B7280"}}>Code:</span>
                  <code style={{fontSize:20,fontWeight:900,color:G,letterSpacing:3}}>{shareClass.room_code}</code>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
                {[
                  {label:"Copy Link", icon:<Copy size={14}/>,  action:()=>copyLink(shareClass!)},
                  {label:"WhatsApp",  icon:<Send size={14}/>,  action:()=>shareWhatsApp(shareClass!)},
                  {label:"Email",     icon:"📧",               action:()=>window.open(`mailto:?subject=${encodeURIComponent("Join: "+shareClass!.title)}&body=${encodeURIComponent(window.location.origin+"/live/"+shareClass!.room_code)}`)},
                  {label:"QR Code",   icon:<QrCode size={14}/>,action:()=>window.open(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(window.location.origin+"/live/"+shareClass!.room_code)}`,"_blank")},
                ].map((b,i)=>(
                  <button key={i} onClick={b.action as any}
                    style={{padding:"11px 12px",borderRadius:11,border:"1.5px solid #E5E7EB",background:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:7,fontWeight:600,fontSize:13,color:"#374151"}}>
                    {b.icon}{b.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════
          RESCHEDULE DIALOG
      ════════════════════════════════════ */}
      <Dialog open={!!rescheduleTarget} onOpenChange={v=>{ if(!v){ setRescheduleTarget(null); setRescheduleDate(""); } }}>
        <DialogContent style={{maxWidth:420,borderRadius:20,padding:0,overflow:"hidden"}}>
          <div style={{background:G,padding:"20px 22px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div>
              <h2 style={{fontWeight:800,fontSize:15,color:"#fff",margin:0}}>Reschedule Class</h2>
              <p style={{fontSize:11,color:"rgba(255,255,255,.65)",margin:0}}>{rescheduleTarget?.title}</p>
            </div>
            <button onClick={()=>setRescheduleTarget(null)} style={{background:"rgba(255,255,255,.15)",border:"none",borderRadius:7,padding:"5px 7px",cursor:"pointer",color:"#fff"}}><X size={15}/></button>
          </div>
          {rescheduleTarget && (
            <div style={{padding:"20px 22px 24px"}}>
              {/* Same link notice */}
              <div style={{background:"#F0FDF4",border:"1px solid #BBF7D0",borderRadius:10,padding:"10px 14px",marginBottom:18,display:"flex",alignItems:"flex-start",gap:8}}>
                <span style={{fontSize:16,flexShrink:0}}>🔗</span>
                <div>
                  <p style={{margin:0,fontSize:13,fontWeight:700,color:"#166534"}}>Same link — no need to reshare</p>
                  <p style={{margin:"2px 0 0",fontSize:12,color:"#166534",opacity:.8}}>
                    Everyone who has <code style={{fontFamily:"monospace",fontWeight:800}}>/live/{rescheduleTarget.room_code}</code> can still join with the same link.
                  </p>
                </div>
              </div>

              {/* New date/time */}
              <label style={{fontSize:13,fontWeight:700,color:"#374151",display:"block",marginBottom:6}}>
                New date & time <span style={{fontWeight:400,color:"#9CA3AF"}}>(optional)</span>
              </label>
              <input
                type="datetime-local"
                value={rescheduleDate}
                onChange={e=>setRescheduleDate(e.target.value)}
                style={{width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid #E5E7EB",fontSize:14,color:"#111827",outline:"none",boxSizing:"border-box",marginBottom:20}}
              />

              <div style={{display:"flex",gap:8}}>
                <button
                  onClick={()=>rescheduleClass(rescheduleTarget, rescheduleDate)}
                  style={{flex:1,padding:"11px 0",borderRadius:10,border:"none",background:G,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer"}}
                >
                  ✅ Reschedule
                </button>
                <button
                  onClick={()=>{ setRescheduleTarget(null); setRescheduleDate(""); }}
                  style={{padding:"11px 16px",borderRadius:10,border:"1.5px solid #E5E7EB",background:"#fff",color:"#374151",fontSize:14,fontWeight:600,cursor:"pointer"}}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════
          DELETE CONFIRM DIALOG
      ════════════════════════════════════ */}
      <Dialog open={!!deleteTarget} onOpenChange={v=>{ if(!v) setDeleteTarget(null); }}>
        <DialogContent style={{maxWidth:380,borderRadius:20,padding:0,overflow:"hidden"}}>
          <div style={{padding:"28px 24px 24px",textAlign:"center"}}>
            <div style={{width:56,height:56,borderRadius:"50%",background:"#FEF2F2",border:"1px solid #FECACA",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px"}}>
              <Trash2 size={22} color="#DC2626"/>
            </div>
            <h2 style={{fontSize:18,fontWeight:700,color:"#111",marginBottom:6}}>Delete permanently?</h2>
            <p style={{fontSize:13,color:"#6B7280",marginBottom:4}}>
              <strong style={{color:"#111"}}>{deleteTarget?.title}</strong>
            </p>
            <p style={{fontSize:13,color:"#6B7280",marginBottom:24,lineHeight:1.6}}>
              This will delete the class and all its registrant data. This cannot be undone.
              <br/><br/>
              <span style={{color:"#16A34A",fontWeight:600}}>💡 Tip: Use Archive instead to keep the data hidden but safe.</span>
            </p>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>deleteTarget && deleteClass(deleteTarget)} disabled={deleting}
                style={{flex:1,padding:"11px 0",borderRadius:10,border:"none",background:"#DC2626",color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",opacity:deleting?.5:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                {deleting ? <><Loader2 size={14} style={{animation:"spin .7s linear infinite"}}/>Deleting…</> : <><Trash2 size={14}/>Delete</>}
              </button>
              <button onClick={()=>deleteTarget && archiveClass(deleteTarget.id)}
                style={{flex:1,padding:"11px 0",borderRadius:10,border:"1.5px solid #E5E7EB",background:"#fff",color:"#374151",fontSize:14,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                <Archive size={14}/>Archive Instead
              </button>
            </div>
            <button onClick={()=>setDeleteTarget(null)} style={{marginTop:10,width:"100%",padding:"10px 0",borderRadius:10,border:"none",background:"transparent",color:"#9CA3AF",fontSize:13,cursor:"pointer"}}>Cancel</button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════
          STATS DIALOG
      ════════════════════════════════════ */}
      <Dialog open={!!statsTarget} onOpenChange={v=>{ if(!v) setStatsTarget(null); }}>
        <DialogContent style={{maxWidth:420,borderRadius:20,padding:0,overflow:"hidden"}}>
          <div style={{background:G,padding:"20px 22px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div>
              <h2 style={{fontWeight:800,fontSize:15,color:"#fff",margin:0}}>Class Stats</h2>
              <p style={{fontSize:11,color:"rgba(255,255,255,.65)",margin:0}}>{statsTarget?.title}</p>
            </div>
            <button onClick={()=>setStatsTarget(null)} style={{background:"rgba(255,255,255,.15)",border:"none",borderRadius:7,padding:"5px 7px",cursor:"pointer",color:"#fff"}}><X size={15}/></button>
          </div>
          {statsTarget && (
            <div style={{padding:"20px 22px 24px"}}>
              {[
                {label:"Total Guests Joined", value:`${statsTarget.guest_count} / ${statsTarget.max_guests}`, icon:"👥"},
                {label:"Room Code",           value:statsTarget.room_code,                                    icon:"🔑"},
                {label:"Scheduled",           value:statsTarget.scheduled_at ? format(new Date(statsTarget.scheduled_at),"EEE d MMM yyyy, h:mm a") : "No date set", icon:"📅"},
                {label:"Started",             value:statsTarget.actual_start_time ? format(new Date(statsTarget.actual_start_time),"EEE d MMM yyyy, h:mm a") : "—", icon:"▶️"},
                {label:"Ended",               value:statsTarget.actual_end_time   ? format(new Date(statsTarget.actual_end_time),  "EEE d MMM yyyy, h:mm a") : "—", icon:"⏹️"},
                {label:"Duration", value: statsTarget.actual_start_time && statsTarget.actual_end_time
                  ? `${Math.round((new Date(statsTarget.actual_end_time).getTime() - new Date(statsTarget.actual_start_time).getTime()) / 60000)} minutes`
                  : "—", icon:"⏱️"},
              ].map((s,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 0",borderBottom:i<5?"1px solid #F3F4F6":"none"}}>
                  <span style={{fontSize:18,width:26,textAlign:"center",flexShrink:0}}>{s.icon}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <p style={{margin:0,fontSize:11,color:"#9CA3AF",fontWeight:600}}>{s.label}</p>
                    <p style={{margin:0,fontSize:14,fontWeight:700,color:"#111",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.value}</p>
                  </div>
                </div>
              ))}
              <button onClick={()=>{setRegDialog(statsTarget);setStatsTarget(null);fetchRegistrants(statsTarget.id);setRegSearch("");}}
                style={{marginTop:16,width:"100%",padding:"11px 0",borderRadius:10,border:"none",background:G,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                <Users size={14}/> View All Registrants
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
};

export default PublicClassManagement;
