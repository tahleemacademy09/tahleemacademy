/* src/pages/admin/PublicClassManagement.tsx — Enhanced with analytics, guest list, share panel */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Plus, Copy, Share2, QrCode, Trash2, Radio, Calendar, Users,
  ExternalLink, Video, Clock, Eye, ChevronRight, Loader2,
  Globe, Lock, MessageCircle, Mic, Camera, Star, Send
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

const G = "#064E3B";
const GOLD = "#C9A84C";

const generateRoomCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({length:6},()=>chars[Math.floor(Math.random()*chars.length)]).join("");
};

interface PublicClass {
  id:string; title:string; title_ar:string|null; description:string|null;
  description_ar:string|null; room_code:string; status:string;
  scheduled_at:string|null; max_guests:number; guest_count:number;
  password_enabled:boolean; password:string|null; chat_enabled:boolean;
  raise_hand_enabled:boolean; recording_enabled:boolean; is_featured:boolean;
  require_name:boolean; allow_guest_camera:boolean; allow_guest_mic:boolean;
  host_id:string; livekit_room_name:string|null; created_at:string;
}

const PublicClassManagement = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [classes, setClasses]   = useState<PublicClass[]>([]);
  const [loading, setLoading]   = useState(true);
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [shareClass, setShareClass] = useState<PublicClass|null>(null);
  const [filterTab, setFilterTab] = useState<"all"|"live"|"scheduled"|"ended">("all");

  const emptyForm = {
    title:"", title_ar:"", description:"", description_ar:"",
    scheduled_at:"", password_enabled:false, password:"",
    max_guests:100, require_name:true, allow_guest_camera:false,
    allow_guest_mic:false, chat_enabled:true, raise_hand_enabled:true,
    recording_enabled:false, is_featured:false,
  };
  const [form, setForm] = useState(emptyForm);

  useEffect(()=>{ fetchClasses(); },[]);

  const fetchClasses = async () => {
    const { data } = await supabase.from("public_classes").select("*").order("created_at",{ascending:false});
    setClasses((data as PublicClass[])||[]);
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!form.title.trim()) { toast.error("Title required"); return; }
    setCreating(true);
    const roomCode = generateRoomCode();
    const { error } = await supabase.from("public_classes").insert({
      title:form.title, title_ar:form.title_ar||null, description:form.description||null,
      description_ar:form.description_ar||null, scheduled_at:form.scheduled_at||null,
      room_code:roomCode, livekit_room_name:`public-${roomCode}`,
      join_url:`${window.location.origin}/live/${roomCode}`,
      host_id:user!.id, password_enabled:form.password_enabled,
      password:form.password_enabled?form.password:null,
      max_guests:form.max_guests, require_name:form.require_name,
      allow_guest_camera:form.allow_guest_camera, allow_guest_mic:form.allow_guest_mic,
      chat_enabled:form.chat_enabled, raise_hand_enabled:form.raise_hand_enabled,
      recording_enabled:form.recording_enabled, is_featured:form.is_featured,
    });
    setCreating(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Public class created!");
    setCreateOpen(false); setForm(emptyForm); fetchClasses();
  };

  const goLive = async (cls: PublicClass) => {
    await supabase.from("public_classes").update({ status:"live", actual_start_time:new Date().toISOString() }).eq("id",cls.id);
    try {
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/public-class-token`, {
        method:"POST",
        headers:{ "Content-Type":"application/json", "apikey":import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, "Authorization":`Bearer ${accessToken}` },
        body:JSON.stringify({ room_code:cls.room_code, guest_name:user?.user_metadata?.full_name||"Teacher" }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error||"Failed to connect"); return; }
      navigate(`/live/${cls.room_code}/classroom`, { state:{ token:data.token, url:data.url, room:data.room, guestName:data.participant_name, classTitle:cls.title, classTitleAr:cls.title_ar, isHost:true, classId:cls.id } });
    } catch { toast.error("Connection failed"); }
  };

  const endClass = async (id: string) => {
    await supabase.from("public_classes").update({ status:"ended", actual_end_time:new Date().toISOString() }).eq("id",id);
    toast.success("Class ended");
    fetchClasses();
  };

  const deleteClass = async (id: string) => {
    if (!confirm("Delete this public class?")) return;
    await supabase.from("public_classes").delete().eq("id",id);
    toast.success("Deleted");
    fetchClasses();
  };

  const shareWhatsApp = (cls: PublicClass) => {
    const msg = encodeURIComponent(
      `Assalamu Alaikum! 🌙\n\nYou are invited to a FREE live Islamic class with Tahleem Academy!\n\n📚 ${cls.title}\n${cls.scheduled_at?`📅 ${format(new Date(cls.scheduled_at),"MMM d, yyyy 'at' h:mm a")}`:""}\n\nJoin here (no account needed):\n${window.location.origin}/live/${cls.room_code}\n\nRoom Code: ${cls.room_code}\n\nShare with others who may benefit! 🤲`
    );
    window.open(`https://wa.me/?text=${msg}`,"_blank");
  };

  const copyLink = (cls: PublicClass) => {
    navigator.clipboard.writeText(`${window.location.origin}/live/${cls.room_code}`);
    toast.success("Link copied!");
  };

  const displayed = classes.filter(c => filterTab==="all" || c.status===filterTab);

  const liveCount = classes.filter(c=>c.status==="live").length;
  const scheduledCount = classes.filter(c=>c.status==="scheduled").length;
  const totalGuests = classes.reduce((s,c)=>s+(c.guest_count||0),0);

  const ToggleRow = ({ label, sub, checked, onChange }: any) => (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"9px 0", borderBottom:"1px solid #F9FAFB" }}>
      <div>
        <p style={{ fontSize:13, fontWeight:600, color:"#374151", margin:0 }}>{label}</p>
        {sub&&<p style={{ fontSize:11, color:"#9CA3AF", margin:0 }}>{sub}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange}/>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:"#F8F9FA" }}>
      {/* Header */}
      <div style={{ background:"#fff", borderBottom:"1px solid #E5E7EB", padding:"18px 20px" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:40, height:40, borderRadius:12, background:"#FFF7ED", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <Globe size={20} color={GOLD}/>
            </div>
            <div>
              <h1 style={{ fontSize:20, fontWeight:800, color:"#111", margin:0 }}>Public Classes</h1>
              <p style={{ fontSize:12, color:"#6B7280", margin:0 }}>{classes.length} classes · {liveCount > 0 ? `🔴 ${liveCount} live` : `${scheduledCount} scheduled`} · {totalGuests} total guests</p>
            </div>
          </div>
          <Button onClick={()=>setCreateOpen(true)}
            style={{ background:GOLD, borderRadius:12, gap:8, fontWeight:700, color:"#fff" }}>
            <Plus size={16}/> Create Public Class
          </Button>
        </div>
      </div>

      <div style={{ padding:"16px", maxWidth:1000, margin:"0 auto" }}>
        {/* Stats */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))", gap:10, marginBottom:16 }}>
          {[
            { v:liveCount,     l:"Live Now",  icon:"🔴", bg:"#FEF2F2", c:"#DC2626" },
            { v:scheduledCount,l:"Scheduled", icon:"📅", bg:"#EFF6FF", c:"#1D4ED8" },
            { v:classes.filter(c=>c.status==="ended").length, l:"Completed", icon:"✅", bg:"#F0FDF4", c:"#166534" },
            { v:totalGuests,   l:"Total Guests",icon:"👥", bg:"#FFF7ED", c:"#C2410C" },
          ].map((s,i)=>(
            <div key={i} style={{ background:s.bg, borderRadius:12, padding:"12px 14px" }}>
              <div style={{ fontSize:20, marginBottom:4 }}>{s.icon}</div>
              <div style={{ fontSize:22, fontWeight:900, color:s.c }}>{s.v}</div>
              <div style={{ fontSize:11, color:s.c, opacity:.7, fontWeight:600 }}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div style={{ display:"flex", gap:4, marginBottom:14, background:"#fff", borderRadius:12, padding:4, border:"1px solid #E5E7EB", width:"fit-content" }}>
          {(["all","live","scheduled","ended"] as const).map(tab=>(
            <button key={tab} onClick={()=>setFilterTab(tab)}
              style={{ padding:"7px 16px", borderRadius:9, border:"none", cursor:"pointer", fontWeight:700, fontSize:13,
                background:filterTab===tab?G:"transparent", color:filterTab===tab?"#fff":"#6B7280" }}>
              {tab==="live"?"🔴 ":tab==="scheduled"?"📅 ":tab==="ended"?"✅ ":""}{tab.charAt(0).toUpperCase()+tab.slice(1)} ({tab==="all"?classes.length:classes.filter(c=>c.status===tab).length})
            </button>
          ))}
        </div>

        {/* Class cards */}
        {loading ? (
          <div style={{ textAlign:"center", padding:48 }}><Loader2 size={28} style={{ animation:"spin .8s linear infinite", color:G }}/></div>
        ) : displayed.length === 0 ? (
          <div style={{ textAlign:"center", padding:"48px 24px", background:"#fff", borderRadius:16, border:"2px dashed #E5E7EB" }}>
            <Globe size={40} color="#D1D5DB" style={{ margin:"0 auto 12px" }}/>
            <p style={{ fontWeight:700, color:"#374151" }}>No classes here yet</p>
            <Button onClick={()=>setCreateOpen(true)} style={{ background:GOLD, borderRadius:10, gap:6, marginTop:12, color:"#fff" }}><Plus size={14}/> Create one</Button>
          </div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {displayed.map(cls=>(
              <div key={cls.id} style={{ background:"#fff", borderRadius:16, border:`2px solid ${cls.status==="live"?"#FECACA":cls.is_featured?"#FDE68A":"#E5E7EB"}`, padding:"16px", boxShadow:"0 1px 4px rgba(0,0,0,.04)" }}>
                <div style={{ display:"flex", alignItems:"flex-start", gap:12, flexWrap:"wrap" }}>
                  <div style={{ flex:1, minWidth:180 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4, flexWrap:"wrap" }}>
                      <p style={{ fontWeight:800, fontSize:15, color:"#111", margin:0 }}>{cls.title}</p>
                      {cls.status==="live"&&<span style={{ fontSize:11, padding:"2px 8px", borderRadius:20, background:"#FEE2E2", color:"#DC2626", fontWeight:700, display:"flex", alignItems:"center", gap:4 }}><Radio size={9}/> LIVE</span>}
                      {cls.status==="scheduled"&&<span style={{ fontSize:11, padding:"2px 8px", borderRadius:20, background:"#DBEAFE", color:"#1D4ED8", fontWeight:700 }}>Scheduled</span>}
                      {cls.status==="ended"&&<span style={{ fontSize:11, padding:"2px 8px", borderRadius:20, background:"#F3F4F6", color:"#6B7280", fontWeight:600 }}>Ended</span>}
                      {cls.is_featured&&<span style={{ fontSize:11, padding:"2px 8px", borderRadius:20, background:"#FEF9C3", color:"#854D0E", fontWeight:700 }}>⭐ Featured</span>}
                    </div>
                    {cls.title_ar&&<p style={{ fontSize:12, color:"#9CA3AF", margin:"0 0 6px", fontFamily:"'Amiri',serif", direction:"rtl" }}>{cls.title_ar}</p>}
                    <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
                      <span style={{ fontSize:12, color:"#6B7280", display:"flex", alignItems:"center", gap:3 }}>
                        <Calendar size={11}/> {cls.scheduled_at?format(new Date(cls.scheduled_at),"MMM d, h:mm a"):"No date"}
                      </span>
                      <span style={{ fontSize:12, color:"#6B7280", display:"flex", alignItems:"center", gap:3 }}>
                        <Users size={11}/> {cls.guest_count}/{cls.max_guests} guests
                      </span>
                      <span style={{ fontSize:12, color:"#6B7280", display:"flex", alignItems:"center", gap:3 }}>
                        Code: <code style={{ fontFamily:"monospace", fontWeight:800, color:"#374151" }}>{cls.room_code}</code>
                      </span>
                    </div>
                    {/* Feature pills */}
                    <div style={{ display:"flex", gap:5, marginTop:7, flexWrap:"wrap" }}>
                      {cls.chat_enabled&&<span style={{ fontSize:10, padding:"2px 7px", borderRadius:20, background:"#ECFEFF", color:"#0E7490", fontWeight:600 }}>💬 Chat</span>}
                      {cls.raise_hand_enabled&&<span style={{ fontSize:10, padding:"2px 7px", borderRadius:20, background:"#F5F3FF", color:"#6D28D9", fontWeight:600 }}>✋ Raise Hand</span>}
                      {cls.allow_guest_camera&&<span style={{ fontSize:10, padding:"2px 7px", borderRadius:20, background:"#F0FDF4", color:"#166534", fontWeight:600 }}>📷 Guest Camera</span>}
                      {cls.allow_guest_mic&&<span style={{ fontSize:10, padding:"2px 7px", borderRadius:20, background:"#FFF7ED", color:"#C2410C", fontWeight:600 }}>🎤 Guest Mic</span>}
                      {cls.recording_enabled&&<span style={{ fontSize:10, padding:"2px 7px", borderRadius:20, background:"#FEF2F2", color:"#DC2626", fontWeight:600 }}>⏺ Recording</span>}
                      {cls.password_enabled&&<span style={{ fontSize:10, padding:"2px 7px", borderRadius:20, background:"#F3F4F6", color:"#6B7280", fontWeight:600 }}><Lock size={8}/> Password</span>}
                    </div>
                  </div>
                  {/* Actions */}
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap", flexShrink:0 }}>
                    {(cls.status==="scheduled"||cls.status==="live")&&(
                      <button onClick={()=>goLive(cls)}
                        style={{ display:"flex", alignItems:"center", gap:5, padding:"8px 14px", borderRadius:10, border:"none", background:"#16A34A", color:"#fff", cursor:"pointer", fontSize:13, fontWeight:700 }}>
                        <Video size={13}/> {cls.status==="live"?"Rejoin":"Go Live"}
                      </button>
                    )}
                    {cls.status==="live"&&(
                      <button onClick={()=>endClass(cls.id)}
                        style={{ padding:"8px 12px", borderRadius:10, border:"none", background:"#DC2626", color:"#fff", cursor:"pointer", fontSize:13, fontWeight:700 }}>
                        End
                      </button>
                    )}
                    <button onClick={()=>setShareClass(cls)}
                      style={{ padding:"8px 12px", borderRadius:10, border:"1.5px solid #E5E7EB", background:"#fff", cursor:"pointer", display:"flex", alignItems:"center", gap:5, fontSize:12, fontWeight:600, color:"#374151" }}>
                      <Share2 size={13}/> Share
                    </button>
                    <button onClick={()=>copyLink(cls)}
                      style={{ padding:"8px 10px", borderRadius:10, border:"1.5px solid #E5E7EB", background:"#fff", cursor:"pointer" }}>
                      <Copy size={13} color="#6B7280"/>
                    </button>
                    <button onClick={()=>window.open(`/live/${cls.room_code}`,"_blank")}
                      style={{ padding:"8px 10px", borderRadius:10, border:"1.5px solid #E5E7EB", background:"#fff", cursor:"pointer" }}>
                      <ExternalLink size={13} color="#6B7280"/>
                    </button>
                    <button onClick={()=>deleteClass(cls.id)}
                      style={{ padding:"8px 10px", borderRadius:10, border:"1.5px solid #FECACA", background:"#FEF2F2", cursor:"pointer" }}>
                      <Trash2 size={13} color="#DC2626"/>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={v=>{if(!v){setCreateOpen(false);setForm(emptyForm);}}}>
        <DialogContent style={{ maxWidth:520, borderRadius:20, padding:0, maxHeight:"92vh", overflowY:"auto" }}>
          <div style={{ background:GOLD, padding:"18px 20px", borderRadius:"20px 20px 0 0", display:"flex", alignItems:"center", gap:10 }}>
            <Globe size={20} color="#fff"/>
            <h2 style={{ fontWeight:800, fontSize:16, color:"#fff", margin:0 }}>New Public Class</h2>
          </div>
          <div style={{ padding:20, display:"flex", flexDirection:"column", gap:14 }}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <div><label style={{ fontSize:12, fontWeight:700, color:"#6B7280", display:"block", marginBottom:5 }}>Title (English) *</label><Input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} style={{ borderRadius:10 }}/></div>
              <div><label style={{ fontSize:12, fontWeight:700, color:"#6B7280", display:"block", marginBottom:5 }}>العنوان (عربي)</label><Input dir="rtl" value={form.title_ar} onChange={e=>setForm(f=>({...f,title_ar:e.target.value}))} style={{ borderRadius:10 }}/></div>
            </div>
            <div><label style={{ fontSize:12, fontWeight:700, color:"#6B7280", display:"block", marginBottom:5 }}>Description</label><Textarea value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} rows={2} style={{ borderRadius:10 }}/></div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <div><label style={{ fontSize:12, fontWeight:700, color:"#6B7280", display:"block", marginBottom:5 }}>Date & Time</label><Input type="datetime-local" value={form.scheduled_at} onChange={e=>setForm(f=>({...f,scheduled_at:e.target.value}))} style={{ borderRadius:10 }}/></div>
              <div><label style={{ fontSize:12, fontWeight:700, color:"#6B7280", display:"block", marginBottom:5 }}>Max Guests</label><Input type="number" value={form.max_guests} onChange={e=>setForm(f=>({...f,max_guests:parseInt(e.target.value)||100}))} style={{ borderRadius:10 }}/></div>
            </div>
            <div style={{ background:"#F9FAFB", borderRadius:12, padding:"12px 14px" }}>
              <ToggleRow label="Password Protection" sub="Restrict access with a password" checked={form.password_enabled} onChange={(v:boolean)=>setForm(f=>({...f,password_enabled:v}))}/>
              {form.password_enabled&&<Input value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))} placeholder="Set class password" style={{ borderRadius:9, marginTop:8 }}/>}
              <ToggleRow label="Require Name" sub="Guests must enter their name" checked={form.require_name} onChange={(v:boolean)=>setForm(f=>({...f,require_name:v}))}/>
              <ToggleRow label="Enable Chat" checked={form.chat_enabled} onChange={(v:boolean)=>setForm(f=>({...f,chat_enabled:v}))}/>
              <ToggleRow label="Raise Hand" checked={form.raise_hand_enabled} onChange={(v:boolean)=>setForm(f=>({...f,raise_hand_enabled:v}))}/>
              <ToggleRow label="Allow Guest Camera" checked={form.allow_guest_camera} onChange={(v:boolean)=>setForm(f=>({...f,allow_guest_camera:v}))}/>
              <ToggleRow label="Allow Guest Mic" checked={form.allow_guest_mic} onChange={(v:boolean)=>setForm(f=>({...f,allow_guest_mic:v}))}/>
              <ToggleRow label="Record Class" checked={form.recording_enabled} onChange={(v:boolean)=>setForm(f=>({...f,recording_enabled:v}))}/>
              <ToggleRow label="Feature on Homepage" checked={form.is_featured} onChange={(v:boolean)=>setForm(f=>({...f,is_featured:v}))}/>
            </div>
            <Button onClick={handleCreate} disabled={!form.title||creating}
              style={{ background:GOLD, borderRadius:12, height:44, gap:8, fontWeight:700, fontSize:14, color:"#fff" }}>
              {creating?<><Loader2 size={16} style={{ animation:"spin .8s linear infinite" }}/> Creating…</>:"Create Public Class"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Share Dialog */}
      <Dialog open={!!shareClass} onOpenChange={v=>!v&&setShareClass(null)}>
        <DialogContent style={{ maxWidth:420, borderRadius:20, padding:0 }}>
          <div style={{ background:G, padding:"18px 20px", borderRadius:"20px 20px 0 0" }}>
            <h2 style={{ fontWeight:800, fontSize:16, color:"#fff", margin:0 }}>Share Class</h2>
            <p style={{ fontSize:11, color:"rgba(255,255,255,.7)", margin:0 }}>{shareClass?.title}</p>
          </div>
          {shareClass&&(
            <div style={{ padding:20 }}>
              <div style={{ background:"#F9FAFB", borderRadius:14, padding:16, textAlign:"center", marginBottom:16 }}>
                <p style={{ fontSize:11, color:"#9CA3AF", margin:"0 0 6px" }}>Public Class Link</p>
                <p style={{ fontFamily:"monospace", fontWeight:700, fontSize:13, color:"#374151", margin:"0 0 8px", wordBreak:"break-all" }}>
                  {window.location.origin}/live/{shareClass.room_code}
                </p>
                <div style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"6px 14px", borderRadius:20, background:"#064E3B15" }}>
                  <span style={{ fontSize:13, color:"#6B7280" }}>Room Code:</span>
                  <code style={{ fontSize:22, fontWeight:900, color:G, letterSpacing:3 }}>{shareClass.room_code}</code>
                </div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                {[
                  { label:"Copy Link", icon:<Copy size={14}/>, action:()=>copyLink(shareClass!) },
                  { label:"WhatsApp", icon:<Send size={14}/>, action:()=>shareWhatsApp(shareClass!) },
                  { label:"Email", icon:"📧", action:()=>window.open(`mailto:?subject=${encodeURIComponent("Join: "+shareClass!.title)}&body=${encodeURIComponent("Join free: "+window.location.origin+"/live/"+shareClass!.room_code)}`) },
                  { label:"QR Code", icon:<QrCode size={14}/>, action:()=>window.open(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(window.location.origin+"/live/"+shareClass!.room_code)}`,"_blank") },
                ].map((btn,i)=>(
                  <button key={i} onClick={btn.action as any}
                    style={{ padding:"12px 14px", borderRadius:12, border:"1.5px solid #E5E7EB", background:"#fff", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8, fontWeight:600, fontSize:13, color:"#374151" }}>
                    {btn.icon} {btn.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
};

// Helper used in create dialog
const ToggleRow = ({ label, sub, checked, onChange }: { label:string; sub?:string; checked:boolean; onChange:(v:boolean)=>void }) => (
  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"9px 0", borderBottom:"1px solid #E5E7EB" }}>
    <div>
      <p style={{ fontSize:13, fontWeight:600, color:"#374151", margin:0 }}>{label}</p>
      {sub&&<p style={{ fontSize:11, color:"#9CA3AF", margin:0 }}>{sub}</p>}
    </div>
    <Switch checked={checked} onCheckedChange={onChange}/>
  </div>
);

export default PublicClassManagement;


