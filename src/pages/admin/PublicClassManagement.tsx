/* src/pages/admin/PublicClassManagement.tsx */
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
  ExternalLink, Video, Clock, Mail, Bell, BellOff, Send,
  Globe, Lock, MessageCircle, Mic, Camera, Star, Loader2,
  Download, ChevronDown, ChevronRight, Phone, AtSign, CheckCircle,
  AlertCircle, X, Search, RefreshCw
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

const G    = "#064E3B";
const GOLD = "#C9A84C";

const REMINDER_OPTIONS = [
  { label: "15 min before",  value: 15  },
  { label: "30 min before",  value: 30  },
  { label: "1 hour before",  value: 60  },
  { label: "3 hours before", value: 180 },
  { label: "1 day before",   value: 1440},
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
  registered_at: string | null; class_id: string | null;
  class_title?: string;
}

interface ReminderConfig {
  enabled: boolean;
  minutesBefore: number;
  lastSentAt?: string;
}

const PublicClassManagement = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [classes,    setClasses]   = useState<PublicClass[]>([]);
  const [loading,    setLoading]   = useState(true);
  const [creating,   setCreating]  = useState(false);
  const [createOpen, setCreateOpen]= useState(false);
  const [shareClass, setShareClass]= useState<PublicClass | null>(null);
  const [filterTab,  setFilterTab] = useState<"all"|"live"|"scheduled"|"ended"|"contacts">("all");

  // Registrants
  const [regDialog,    setRegDialog]   = useState<PublicClass | null>(null);
  const [registrants,  setRegistrants] = useState<Registration[]>([]);
  const [regLoading,   setRegLoading]  = useState(false);
  const [regSearch,    setRegSearch]   = useState("");

  // All contacts
  const [allContacts,     setAllContacts]    = useState<Registration[]>([]);
  const [contactsLoading, setContactsLoading]= useState(false);
  const [contactSearch,   setContactSearch]  = useState("");

  // Email blast
  const [emailDialog,   setEmailDialog]  = useState(false);
  const [emailTarget,   setEmailTarget]  = useState<"class"|"all">("class");
  const [emailSubject,  setEmailSubject] = useState("");
  const [emailBody,     setEmailBody]    = useState("");
  const [sending,       setSending]      = useState(false);
  const [sentCount,     setSentCount]    = useState<number | null>(null);

  // Auto-reminder config — stored in localStorage per class
  const [reminderDialog, setReminderDialog] = useState<PublicClass | null>(null);
  const [reminderConfig, setReminderConfig] = useState<Record<string, ReminderConfig>>({});

  const emptyForm = {
    title:"", title_ar:"", description:"", description_ar:"",
    scheduled_at:"", password_enabled:false, password:"",
    max_guests:100, require_name:true, allow_guest_camera:false,
    allow_guest_mic:false, chat_enabled:true, raise_hand_enabled:true,
    recording_enabled:false, is_featured:false,
  };
  const [form, setForm] = useState(emptyForm);

  // Load reminder configs from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem("tahleem_reminder_configs");
      if (stored) setReminderConfig(JSON.parse(stored));
    } catch {}
  }, []);

  const saveReminderConfig = (updated: Record<string, ReminderConfig>) => {
    setReminderConfig(updated);
    localStorage.setItem("tahleem_reminder_configs", JSON.stringify(updated));
  };

  useEffect(() => { fetchClasses(); }, []);

  const fetchClasses = async () => {
    setLoading(true);
    const { data } = await supabase.from("public_classes").select("*").order("created_at", { ascending: false });
    setClasses((data as PublicClass[]) || []);
    setLoading(false);
  };

  const fetchRegistrants = useCallback(async (classId: string) => {
    setRegLoading(true);
    const { data } = await supabase
      .from("public_class_registrations")
      .select("*")
      .eq("class_id", classId)
      .order("registered_at", { ascending: false });
    setRegistrants((data as Registration[]) || []);
    setRegLoading(false);
  }, []);

  const fetchAllContacts = useCallback(async () => {
    setContactsLoading(true);
    const { data } = await supabase
      .from("public_class_registrations")
      .select("*, public_classes(title)")
      .order("registered_at", { ascending: false });

    if (data) {
      const enriched = data.map((r: any) => ({
        ...r,
        class_title: r.public_classes?.title ?? "Unknown class",
      }));
      setAllContacts(enriched as Registration[]);
    }
    setContactsLoading(false);
  }, []);

  useEffect(() => {
    if (filterTab === "contacts") fetchAllContacts();
  }, [filterTab, fetchAllContacts]);

  // ── Class actions ──────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!form.title.trim()) { toast.error("Title required"); return; }
    setCreating(true);
    const roomCode = generateRoomCode();
    const { error } = await supabase.from("public_classes").insert({
      title: form.title, title_ar: form.title_ar || null,
      description: form.description || null, description_ar: form.description_ar || null,
      scheduled_at: form.scheduled_at || null,
      room_code: roomCode, livekit_room_name: `public-${roomCode}`,
      join_url: `${window.location.origin}/live/${roomCode}`,
      host_id: user!.id, password_enabled: form.password_enabled,
      password: form.password_enabled ? form.password : null,
      max_guests: form.max_guests, require_name: form.require_name,
      allow_guest_camera: form.allow_guest_camera, allow_guest_mic: form.allow_guest_mic,
      chat_enabled: form.chat_enabled, raise_hand_enabled: form.raise_hand_enabled,
      recording_enabled: form.recording_enabled, is_featured: form.is_featured,
    });
    setCreating(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Public class created!");
    setCreateOpen(false); setForm(emptyForm); fetchClasses();
  };

  const goLive = async (cls: PublicClass) => {
    await supabase.from("public_classes").update({ status: "live", actual_start_time: new Date().toISOString() }).eq("id", cls.id);
    try {
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://wvqeubhupkddtkcdwqcm.supabase.co";
      const res = await fetch(`${supabaseUrl}/functions/v1/public-class-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, "Authorization": `Bearer ${accessToken}` },
        body: JSON.stringify({ room_code: cls.room_code, guest_name: user?.user_metadata?.full_name || "Teacher" }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Failed to connect"); return; }
      navigate(`/live/${cls.room_code}/classroom`, {
        state: { token: data.token, url: data.url, room: data.room, guestName: data.participant_name, classTitle: cls.title, classTitleAr: cls.title_ar, isHost: true, classId: cls.id }
      });
    } catch { toast.error("Connection failed"); }
  };

  const endClass = async (id: string) => {
    await supabase.from("public_classes").update({ status: "ended", actual_end_time: new Date().toISOString() }).eq("id", id);
    toast.success("Class ended"); fetchClasses();
  };

  const deleteClass = async (id: string) => {
    if (!confirm("Delete this public class and all its registrations?")) return;
    await supabase.from("public_classes").delete().eq("id", id);
    toast.success("Deleted"); fetchClasses();
  };

  // ── Email blast ────────────────────────────────────────────────────────────

  const openEmailBlast = (target: "class"|"all", cls?: PublicClass) => {
    const classTitle = cls?.title ?? "an upcoming class";
    const joinUrl    = cls ? `${window.location.origin}/live/${cls.room_code}` : "";
    const scheduled  = cls?.scheduled_at ? format(new Date(cls.scheduled_at), "EEEE, MMMM d 'at' h:mm a") : "";

    setEmailTarget(target);
    setEmailSubject(`📚 Reminder: ${classTitle} — Join Link Inside`);
    setEmailBody(
      `Assalamu Alaikum,\n\n` +
      `We wanted to remind you about the upcoming class you registered for:\n\n` +
      `📖 *${classTitle}*\n` +
      (scheduled ? `📅 ${scheduled}\n` : "") +
      (joinUrl   ? `🔗 Join here (no account needed): ${joinUrl}\n\n` : "\n") +
      `Room Code: ${cls?.room_code ?? ""}\n\n` +
      `We look forward to having you with us. Please share with anyone who may benefit.\n\n` +
      `— Tahleem Academy\nبارك الله فيكم`
    );
    setSentCount(null);
    setEmailDialog(true);
  };

  const handleSendEmail = async () => {
    if (!emailSubject.trim() || !emailBody.trim()) { toast.error("Subject and body required"); return; }
    setSending(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://wvqeubhupkddtkcdwqcm.supabase.co";
      const session = await supabase.auth.getSession();
      const token   = session.data.session?.access_token;

      const payload: any = {
        subject:   emailSubject,
        body_text: emailBody,
      };

      if (emailTarget === "class" && regDialog) {
        payload.class_id = regDialog.id;
      } else {
        payload.all_contacts = true;
      }

      const res  = await fetch(`${supabaseUrl}/functions/v1/send-guest-email-reminder`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "", "Authorization": `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Send failed");
      setSentCount(data.sent ?? 0);
      toast.success(`✅ Sent to ${data.sent} registrant${data.sent !== 1 ? "s" : ""}`);
    } catch (e: any) {
      toast.error(e.message);
    }
    setSending(false);
  };

  // ── Reminder config ────────────────────────────────────────────────────────

  const handleSendReminderNow = async (cls: PublicClass) => {
    toast.info("Sending reminders now…");
    await handleSendEmail();
    const updated = {
      ...reminderConfig,
      [cls.id]: { ...reminderConfig[cls.id], lastSentAt: new Date().toISOString() }
    };
    saveReminderConfig(updated);
  };

  // ── Share helpers ──────────────────────────────────────────────────────────

  const shareWhatsApp = (cls: PublicClass) => {
    const msg = encodeURIComponent(
      `Assalamu Alaikum! 🌙\n\nYou are invited to a FREE live Islamic class with Tahleem Academy!\n\n📚 ${cls.title}\n${cls.scheduled_at ? `📅 ${format(new Date(cls.scheduled_at), "MMM d, yyyy 'at' h:mm a")}` : ""}\n\nJoin here (no account needed):\n${window.location.origin}/live/${cls.room_code}\n\nRoom Code: ${cls.room_code}\n\nShare with others who may benefit! 🤲`
    );
    window.open(`https://wa.me/?text=${msg}`, "_blank");
  };
  const copyLink = (cls: PublicClass) => {
    navigator.clipboard.writeText(`${window.location.origin}/live/${cls.room_code}`);
    toast.success("Link copied!");
  };
  const copyEmails = (regs: Registration[]) => {
    const emails = regs.filter(r => r.email).map(r => r.email).join(", ");
    if (!emails) { toast.error("No emails to copy"); return; }
    navigator.clipboard.writeText(emails);
    toast.success(`Copied ${regs.filter(r=>r.email).length} email(s)`);
  };
  const exportCSV = (regs: Registration[], filename: string) => {
    const rows = [["Name","Email","Phone","Registered At","Class"]];
    regs.forEach(r => rows.push([r.name, r.email||"", r.phone||"", r.registered_at ? format(new Date(r.registered_at),"dd/MM/yyyy HH:mm") : "", r.class_title||""]));
    const csv  = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a"); a.href = url; a.download = filename; a.click();
  };

  // ── Derived ────────────────────────────────────────────────────────────────

  const displayed      = filterTab === "contacts" ? [] : classes.filter(c => filterTab === "all" || c.status === filterTab);
  const liveCount      = classes.filter(c => c.status === "live").length;
  const scheduledCount = classes.filter(c => c.status === "scheduled").length;
  const totalGuests    = classes.reduce((s, c) => s + (c.guest_count || 0), 0);

  const filteredRegistrants = registrants.filter(r =>
    r.name.toLowerCase().includes(regSearch.toLowerCase()) ||
    (r.email || "").toLowerCase().includes(regSearch.toLowerCase())
  );
  const filteredContacts = allContacts.filter(r =>
    r.name.toLowerCase().includes(contactSearch.toLowerCase()) ||
    (r.email || "").toLowerCase().includes(contactSearch.toLowerCase()) ||
    (r.class_title || "").toLowerCase().includes(contactSearch.toLowerCase())
  );

  // ── Render helpers ─────────────────────────────────────────────────────────

  const ToggleRow = ({ label, sub, checked, onChange }: any) => (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"9px 0", borderBottom:"1px solid #F9FAFB" }}>
      <div>
        <p style={{ fontSize:13, fontWeight:600, color:"#374151", margin:0 }}>{label}</p>
        {sub && <p style={{ fontSize:11, color:"#9CA3AF", margin:0 }}>{sub}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange}/>
    </div>
  );

  const RegistrantRow = ({ r }: { r: Registration }) => (
    <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 0", borderBottom:"1px solid #F3F4F6" }}>
      <div style={{ width:34, height:34, borderRadius:"50%", background:`${G}20`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
        <span style={{ fontSize:13, fontWeight:700, color:G }}>{r.name.charAt(0).toUpperCase()}</span>
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <p style={{ fontSize:13, fontWeight:700, color:"#111", margin:0, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{r.name}</p>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {r.email  && <span style={{ fontSize:11, color:"#6B7280", display:"flex", alignItems:"center", gap:2 }}><AtSign size={9}/>{r.email}</span>}
          {r.phone  && <span style={{ fontSize:11, color:"#6B7280", display:"flex", alignItems:"center", gap:2 }}><Phone  size={9}/>{r.phone}</span>}
          {r.class_title && <span style={{ fontSize:10, padding:"1px 6px", borderRadius:10, background:`${G}15`, color:G, fontWeight:600 }}>{r.class_title}</span>}
        </div>
      </div>
      <div style={{ flexShrink:0, textAlign:"right" }}>
        {r.email ? (
          <span style={{ fontSize:10, padding:"2px 6px", borderRadius:10, background:"#DCFCE7", color:"#166534", fontWeight:600 }}>✓ email</span>
        ) : (
          <span style={{ fontSize:10, padding:"2px 6px", borderRadius:10, background:"#FEF2F2", color:"#991B1B", fontWeight:600 }}>no email</span>
        )}
        {r.registered_at && (
          <p style={{ fontSize:10, color:"#9CA3AF", margin:"2px 0 0" }}>{format(new Date(r.registered_at), "dd MMM, h:mm a")}</p>
        )}
      </div>
    </div>
  );

  // ── JSX ────────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight:"100vh", background:"#F8F9FA" }}>

      {/* ── Header ── */}
      <div style={{ background:"#fff", borderBottom:"1px solid #E5E7EB", padding:"18px 20px" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:40, height:40, borderRadius:12, background:"#FFF7ED", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <Globe size={20} color={GOLD}/>
            </div>
            <div>
              <h1 style={{ fontSize:20, fontWeight:800, color:"#111", margin:0 }}>Public Classes</h1>
              <p style={{ fontSize:12, color:"#6B7280", margin:0 }}>
                {classes.length} classes · {liveCount > 0 ? `🔴 ${liveCount} live` : `${scheduledCount} scheduled`} · {totalGuests} guests · {allContacts.length || "?"} contacts
              </p>
            </div>
          </div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            <Button onClick={() => { setFilterTab("contacts"); }}
              style={{ background: filterTab === "contacts" ? G : "#fff", border:`1.5px solid ${G}`, color: filterTab === "contacts" ? "#fff" : G, borderRadius:10, gap:6, fontWeight:700 }}>
              <Users size={14}/> All Contacts
            </Button>
            <Button onClick={() => setCreateOpen(true)}
              style={{ background:GOLD, borderRadius:12, gap:8, fontWeight:700, color:"#fff" }}>
              <Plus size={16}/> Create Public Class
            </Button>
          </div>
        </div>
      </div>

      <div style={{ padding:"16px", maxWidth:1000, margin:"0 auto" }}>

        {/* ── Stats ── */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))", gap:10, marginBottom:16 }}>
          {[
            { v:liveCount,      l:"Live Now",       icon:"🔴", bg:"#FEF2F2", c:"#DC2626" },
            { v:scheduledCount, l:"Scheduled",      icon:"📅", bg:"#EFF6FF", c:"#1D4ED8" },
            { v:classes.filter(c=>c.status==="ended").length, l:"Completed", icon:"✅", bg:"#F0FDF4", c:"#166534" },
            { v:allContacts.filter(r=>r.email).length || totalGuests, l:"With Email", icon:"📧", bg:"#FFF7ED", c:"#C2410C" },
          ].map((s, i) => (
            <div key={i} style={{ background:s.bg, borderRadius:12, padding:"12px 14px" }}>
              <div style={{ fontSize:20, marginBottom:4 }}>{s.icon}</div>
              <div style={{ fontSize:22, fontWeight:900, color:s.c }}>{s.v}</div>
              <div style={{ fontSize:11, color:s.c, opacity:.7, fontWeight:600 }}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* ── Filter tabs ── */}
        <div style={{ display:"flex", gap:4, marginBottom:14, background:"#fff", borderRadius:12, padding:4, border:"1px solid #E5E7EB", width:"fit-content", flexWrap:"wrap" }}>
          {(["all","live","scheduled","ended","contacts"] as const).map(tab => (
            <button key={tab} onClick={() => setFilterTab(tab)}
              style={{ padding:"7px 16px", borderRadius:9, border:"none", cursor:"pointer", fontWeight:700, fontSize:13,
                background: filterTab === tab ? G : "transparent", color: filterTab === tab ? "#fff" : "#6B7280" }}>
              {tab==="live"?"🔴 ":tab==="scheduled"?"📅 ":tab==="ended"?"✅ ":tab==="contacts"?"👥 ":""}
              {tab.charAt(0).toUpperCase()+tab.slice(1)}
              {tab !== "contacts" && ` (${tab==="all"?classes.length:classes.filter(c=>c.status===tab).length})`}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════
            CONTACTS TAB
        ══════════════════════════════════════════════════════ */}
        {filterTab === "contacts" && (
          <div style={{ background:"#fff", borderRadius:16, border:"1px solid #E5E7EB", overflow:"hidden" }}>
            {/* Contacts header */}
            <div style={{ padding:"16px 20px", borderBottom:"1px solid #F3F4F6", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:10 }}>
              <div>
                <h2 style={{ fontSize:16, fontWeight:800, color:"#111", margin:0 }}>All Pre-Registered Contacts</h2>
                <p style={{ fontSize:12, color:"#6B7280", margin:0 }}>
                  {allContacts.length} total · {allContacts.filter(r=>r.email).length} with email · stored for future broadcasts
                </p>
              </div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                <button onClick={() => fetchAllContacts()}
                  style={{ padding:"8px 12px", borderRadius:10, border:"1.5px solid #E5E7EB", background:"#fff", cursor:"pointer", display:"flex", alignItems:"center", gap:5, fontSize:12, fontWeight:600 }}>
                  <RefreshCw size={13}/> Refresh
                </button>
                <button onClick={() => copyEmails(allContacts)}
                  style={{ padding:"8px 12px", borderRadius:10, border:"1.5px solid #E5E7EB", background:"#fff", cursor:"pointer", display:"flex", alignItems:"center", gap:5, fontSize:12, fontWeight:600 }}>
                  <Copy size={13}/> Copy All Emails
                </button>
                <button onClick={() => exportCSV(allContacts, "tahleem-contacts.csv")}
                  style={{ padding:"8px 12px", borderRadius:10, border:"1.5px solid #E5E7EB", background:"#fff", cursor:"pointer", display:"flex", alignItems:"center", gap:5, fontSize:12, fontWeight:600 }}>
                  <Download size={13}/> Export CSV
                </button>
                <button onClick={() => { setEmailTarget("all"); openEmailBlast("all"); }}
                  style={{ padding:"8px 14px", borderRadius:10, border:"none", background:GOLD, color:"#fff", cursor:"pointer", display:"flex", alignItems:"center", gap:5, fontSize:12, fontWeight:700 }}>
                  <Mail size={13}/> Email All
                </button>
              </div>
            </div>

            {/* Search */}
            <div style={{ padding:"12px 20px", borderBottom:"1px solid #F3F4F6" }}>
              <div style={{ position:"relative" }}>
                <Search size={14} style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF" }}/>
                <input value={contactSearch} onChange={e => setContactSearch(e.target.value)}
                  placeholder="Search by name, email, or class…"
                  style={{ width:"100%", padding:"8px 10px 8px 32px", borderRadius:9, border:"1.5px solid #E5E7EB", fontSize:13, outline:"none", boxSizing:"border-box" }}/>
              </div>
            </div>

            <div style={{ padding:"0 20px", maxHeight:500, overflowY:"auto" }}>
              {contactsLoading ? (
                <div style={{ textAlign:"center", padding:32 }}><Loader2 size={24} style={{ animation:"spin .8s linear infinite", color:G }}/></div>
              ) : filteredContacts.length === 0 ? (
                <div style={{ textAlign:"center", padding:32, color:"#9CA3AF" }}>
                  <Users size={32} style={{ margin:"0 auto 8px", opacity:.3 }}/>
                  <p>No contacts yet. Registrations will appear here.</p>
                </div>
              ) : (
                filteredContacts.map(r => <RegistrantRow key={r.id} r={r}/>)
              )}
            </div>

            {/* Email summary footer */}
            {allContacts.length > 0 && (
              <div style={{ padding:"12px 20px", borderTop:"1px solid #F3F4F6", background:"#FAFAFA", display:"flex", gap:16, flexWrap:"wrap" }}>
                <span style={{ fontSize:12, color:"#6B7280" }}>
                  📧 <strong style={{ color:"#111" }}>{allContacts.filter(r=>r.email).length}</strong> with email address
                </span>
                <span style={{ fontSize:12, color:"#6B7280" }}>
                  📵 <strong style={{ color:"#111" }}>{allContacts.filter(r=>!r.email).length}</strong> without email
                </span>
                <span style={{ fontSize:12, color:"#6B7280" }}>
                  🗂 <strong style={{ color:"#111" }}>{[...new Set(allContacts.map(r=>r.email).filter(Boolean))].length}</strong> unique email addresses
                </span>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            CLASS CARDS
        ══════════════════════════════════════════════════════ */}
        {filterTab !== "contacts" && (
          loading ? (
            <div style={{ textAlign:"center", padding:48 }}><Loader2 size={28} style={{ animation:"spin .8s linear infinite", color:G }}/></div>
          ) : displayed.length === 0 ? (
            <div style={{ textAlign:"center", padding:"48px 24px", background:"#fff", borderRadius:16, border:"2px dashed #E5E7EB" }}>
              <Globe size={40} color="#D1D5DB" style={{ margin:"0 auto 12px" }}/>
              <p style={{ fontWeight:700, color:"#374151" }}>No classes here yet</p>
              <Button onClick={() => setCreateOpen(true)} style={{ background:GOLD, borderRadius:10, gap:6, marginTop:12, color:"#fff" }}><Plus size={14}/> Create one</Button>
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {displayed.map(cls => {
                const reminder   = reminderConfig[cls.id];
                const isScheduled = cls.status === "scheduled";

                return (
                  <div key={cls.id} style={{ background:"#fff", borderRadius:16, border:`2px solid ${cls.status==="live"?"#FECACA":cls.is_featured?"#FDE68A":"#E5E7EB"}`, padding:"16px", boxShadow:"0 1px 4px rgba(0,0,0,.04)" }}>
                    <div style={{ display:"flex", alignItems:"flex-start", gap:12, flexWrap:"wrap" }}>
                      <div style={{ flex:1, minWidth:180 }}>
                        {/* Title row */}
                        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4, flexWrap:"wrap" }}>
                          <p style={{ fontWeight:800, fontSize:15, color:"#111", margin:0 }}>{cls.title}</p>
                          {cls.status==="live"      && <span style={{ fontSize:11, padding:"2px 8px", borderRadius:20, background:"#FEE2E2", color:"#DC2626", fontWeight:700, display:"flex", alignItems:"center", gap:4 }}><Radio size={9}/> LIVE</span>}
                          {cls.status==="scheduled" && <span style={{ fontSize:11, padding:"2px 8px", borderRadius:20, background:"#DBEAFE", color:"#1D4ED8", fontWeight:700 }}>Scheduled</span>}
                          {cls.status==="ended"     && <span style={{ fontSize:11, padding:"2px 8px", borderRadius:20, background:"#F3F4F6", color:"#6B7280", fontWeight:600 }}>Ended</span>}
                          {cls.is_featured          && <span style={{ fontSize:11, padding:"2px 8px", borderRadius:20, background:"#FEF9C3", color:"#854D0E", fontWeight:700 }}>⭐ Featured</span>}
                        </div>
                        {cls.title_ar && <p style={{ fontSize:12, color:"#9CA3AF", margin:"0 0 6px", fontFamily:"'Amiri',serif", direction:"rtl" }}>{cls.title_ar}</p>}

                        {/* Meta */}
                        <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:6 }}>
                          <span style={{ fontSize:12, color:"#6B7280", display:"flex", alignItems:"center", gap:3 }}>
                            <Calendar size={11}/> {cls.scheduled_at ? format(new Date(cls.scheduled_at), "MMM d, h:mm a") : "No date"}
                          </span>
                          <span style={{ fontSize:12, color:"#6B7280", display:"flex", alignItems:"center", gap:3 }}>
                            <Users size={11}/> {cls.guest_count}/{cls.max_guests} live guests
                          </span>
                          <span style={{ fontSize:12, color:"#6B7280" }}>
                            Code: <code style={{ fontFamily:"monospace", fontWeight:800, color:"#374151" }}>{cls.room_code}</code>
                          </span>
                        </div>

                        {/* Registrants badge — clickable */}
                        {isScheduled && (
                          <button
                            onClick={() => { setRegDialog(cls); fetchRegistrants(cls.id); setRegSearch(""); }}
                            style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"5px 10px", borderRadius:20, border:"1.5px solid #E5E7EB", background:"#F9FAFB", cursor:"pointer", fontSize:12, fontWeight:600, color:"#374151" }}>
                            <Users size={11} color={G}/> View Registrants
                            {reminder?.lastSentAt && (
                              <span style={{ marginLeft:4, fontSize:10, color:GOLD }}>• reminded {formatDistanceToNow(new Date(reminder.lastSentAt), {addSuffix:true})}</span>
                            )}
                          </button>
                        )}

                        {/* Auto-reminder badge */}
                        {isScheduled && reminder?.enabled && (
                          <span style={{ marginLeft:6, display:"inline-flex", alignItems:"center", gap:3, fontSize:10, padding:"3px 8px", borderRadius:20, background:"#FFF7ED", color:"#C2410C", fontWeight:600 }}>
                            <Bell size={9}/> Auto-remind {REMINDER_OPTIONS.find(o=>o.value===reminder.minutesBefore)?.label}
                          </span>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div style={{ display:"flex", gap:6, flexWrap:"wrap", flexShrink:0 }}>
                        {(cls.status==="scheduled"||cls.status==="live") && (
                          <button onClick={() => goLive(cls)}
                            style={{ display:"flex", alignItems:"center", gap:5, padding:"8px 14px", borderRadius:10, border:"none", background:"#16A34A", color:"#fff", cursor:"pointer", fontSize:13, fontWeight:700 }}>
                            <Video size={13}/> {cls.status==="live"?"Rejoin":"Go Live"}
                          </button>
                        )}
                        {cls.status==="live" && (
                          <button onClick={() => endClass(cls.id)}
                            style={{ padding:"8px 12px", borderRadius:10, border:"none", background:"#DC2626", color:"#fff", cursor:"pointer", fontSize:13, fontWeight:700 }}>
                            End
                          </button>
                        )}

                        {/* Registrants button */}
                        {isScheduled && (
                          <button
                            onClick={() => { setRegDialog(cls); fetchRegistrants(cls.id); setRegSearch(""); }}
                            style={{ padding:"8px 12px", borderRadius:10, border:"1.5px solid #E5E7EB", background:"#fff", cursor:"pointer", display:"flex", alignItems:"center", gap:5, fontSize:12, fontWeight:600, color:"#374151" }}>
                            <Users size={13} color={G}/> Registrants
                          </button>
                        )}

                        {/* Auto-reminder button */}
                        {isScheduled && (
                          <button
                            onClick={() => setReminderDialog(cls)}
                            style={{ padding:"8px 12px", borderRadius:10, border:`1.5px solid ${reminder?.enabled?"#FDE68A":"#E5E7EB"}`, background: reminder?.enabled?"#FFFBEB":"#fff", cursor:"pointer", display:"flex", alignItems:"center", gap:5, fontSize:12, fontWeight:600, color: reminder?.enabled?GOLD:"#374151" }}>
                            {reminder?.enabled ? <Bell size={13}/> : <BellOff size={13}/>} Remind
                          </button>
                        )}

                        <button onClick={() => setShareClass(cls)}
                          style={{ padding:"8px 12px", borderRadius:10, border:"1.5px solid #E5E7EB", background:"#fff", cursor:"pointer", display:"flex", alignItems:"center", gap:5, fontSize:12, fontWeight:600, color:"#374151" }}>
                          <Share2 size={13}/> Share
                        </button>
                        <button onClick={() => copyLink(cls)}
                          style={{ padding:"8px 10px", borderRadius:10, border:"1.5px solid #E5E7EB", background:"#fff", cursor:"pointer" }}>
                          <Copy size={13} color="#6B7280"/>
                        </button>
                        <button onClick={() => window.open(`/live/${cls.room_code}`,"_blank")}
                          style={{ padding:"8px 10px", borderRadius:10, border:"1.5px solid #E5E7EB", background:"#fff", cursor:"pointer" }}>
                          <ExternalLink size={13} color="#6B7280"/>
                        </button>
                        <button onClick={() => deleteClass(cls.id)}
                          style={{ padding:"8px 10px", borderRadius:10, border:"1.5px solid #FECACA", background:"#FEF2F2", cursor:"pointer" }}>
                          <Trash2 size={13} color="#DC2626"/>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>

      {/* ══════════════════════════════════════════════════════
          REGISTRANTS DIALOG
      ══════════════════════════════════════════════════════ */}
      <Dialog open={!!regDialog} onOpenChange={v => !v && setRegDialog(null)}>
        <DialogContent style={{ maxWidth:560, borderRadius:20, padding:0, maxHeight:"90vh", display:"flex", flexDirection:"column" }}>
          {/* Header */}
          <div style={{ background:G, padding:"18px 20px", borderRadius:"20px 20px 0 0", flexShrink:0 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div>
                <h2 style={{ fontWeight:800, fontSize:16, color:"#fff", margin:0 }}>Pre-Registered Waitlist</h2>
                <p style={{ fontSize:11, color:"rgba(255,255,255,.7)", margin:0 }}>{regDialog?.title}</p>
              </div>
              <button onClick={() => setRegDialog(null)} style={{ background:"rgba(255,255,255,.15)", border:"none", borderRadius:8, padding:"6px 8px", cursor:"pointer", color:"#fff" }}>
                <X size={16}/>
              </button>
            </div>
          </div>

          {/* Stats bar */}
          <div style={{ padding:"12px 20px", background:"#F9FAFB", borderBottom:"1px solid #E5E7EB", display:"flex", gap:20, flexShrink:0 }}>
            <div style={{ textAlign:"center" }}>
              <p style={{ fontSize:20, fontWeight:900, color:G, margin:0 }}>{registrants.length}</p>
              <p style={{ fontSize:10, color:"#6B7280", margin:0 }}>Total</p>
            </div>
            <div style={{ textAlign:"center" }}>
              <p style={{ fontSize:20, fontWeight:900, color:"#16A34A", margin:0 }}>{registrants.filter(r=>r.email).length}</p>
              <p style={{ fontSize:10, color:"#6B7280", margin:0 }}>With Email</p>
            </div>
            <div style={{ textAlign:"center" }}>
              <p style={{ fontSize:20, fontWeight:900, color:"#DC2626", margin:0 }}>{registrants.filter(r=>!r.email).length}</p>
              <p style={{ fontSize:10, color:"#6B7280", margin:0 }}>No Email</p>
            </div>
            <div style={{ marginLeft:"auto", display:"flex", gap:6, alignItems:"center" }}>
              <button onClick={() => copyEmails(registrants)}
                style={{ padding:"6px 10px", borderRadius:8, border:"1.5px solid #E5E7EB", background:"#fff", cursor:"pointer", display:"flex", alignItems:"center", gap:4, fontSize:11, fontWeight:600 }}>
                <Copy size={11}/> Copy Emails
              </button>
              <button onClick={() => exportCSV(registrants, `registrants-${regDialog?.room_code}.csv`)}
                style={{ padding:"6px 10px", borderRadius:8, border:"1.5px solid #E5E7EB", background:"#fff", cursor:"pointer", display:"flex", alignItems:"center", gap:4, fontSize:11, fontWeight:600 }}>
                <Download size={11}/> CSV
              </button>
            </div>
          </div>

          {/* Search */}
          <div style={{ padding:"10px 20px", borderBottom:"1px solid #F3F4F6", flexShrink:0 }}>
            <div style={{ position:"relative" }}>
              <Search size={13} style={{ position:"absolute", left:9, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF" }}/>
              <input value={regSearch} onChange={e => setRegSearch(e.target.value)}
                placeholder="Search name or email…"
                style={{ width:"100%", padding:"7px 10px 7px 28px", borderRadius:8, border:"1.5px solid #E5E7EB", fontSize:12, outline:"none", boxSizing:"border-box" }}/>
            </div>
          </div>

          {/* List */}
          <div style={{ flex:1, overflowY:"auto", padding:"0 20px" }}>
            {regLoading ? (
              <div style={{ textAlign:"center", padding:32 }}><Loader2 size={22} style={{ animation:"spin .8s linear infinite", color:G }}/></div>
            ) : filteredRegistrants.length === 0 ? (
              <div style={{ textAlign:"center", padding:"32px 0", color:"#9CA3AF" }}>
                <Users size={28} style={{ margin:"0 auto 8px", opacity:.3 }}/>
                <p style={{ fontSize:13 }}>{registrants.length === 0 ? "No one has pre-registered yet." : "No results match your search."}</p>
              </div>
            ) : (
              filteredRegistrants.map(r => <RegistrantRow key={r.id} r={r}/>)
            )}
          </div>

          {/* Email blast footer */}
          <div style={{ padding:"14px 20px", borderTop:"1px solid #E5E7EB", background:"#FAFAFA", flexShrink:0 }}>
            <button
              onClick={() => { openEmailBlast("class", regDialog!); }}
              disabled={registrants.filter(r=>r.email).length === 0}
              style={{ width:"100%", padding:"11px 0", borderRadius:12, border:"none", background: registrants.filter(r=>r.email).length > 0 ? GOLD : "#E5E7EB", color: registrants.filter(r=>r.email).length > 0 ? "#fff" : "#9CA3AF", cursor: registrants.filter(r=>r.email).length > 0 ? "pointer" : "not-allowed", fontWeight:700, fontSize:14, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
              <Mail size={15}/>
              {registrants.filter(r=>r.email).length > 0
                ? `📧 Email ${registrants.filter(r=>r.email).length} Registrant${registrants.filter(r=>r.email).length !== 1 ? "s" : ""}`
                : "No emails to send to"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════
          AUTO-REMINDER DIALOG
      ══════════════════════════════════════════════════════ */}
      <Dialog open={!!reminderDialog} onOpenChange={v => !v && setReminderDialog(null)}>
        <DialogContent style={{ maxWidth:420, borderRadius:20, padding:0 }}>
          <div style={{ background:GOLD, padding:"18px 20px", borderRadius:"20px 20px 0 0" }}>
            <h2 style={{ fontWeight:800, fontSize:16, color:"#fff", margin:0 }}>📧 Email Reminder Settings</h2>
            <p style={{ fontSize:11, color:"rgba(255,255,255,.8)", margin:0 }}>{reminderDialog?.title}</p>
          </div>
          {reminderDialog && (() => {
            const cfg = reminderConfig[reminderDialog.id] || { enabled:false, minutesBefore:60 };
            return (
              <div style={{ padding:20 }}>

                {/* Enable toggle */}
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 16px", background:"#F9FAFB", borderRadius:12, marginBottom:14 }}>
                  <div>
                    <p style={{ fontWeight:700, fontSize:14, color:"#111", margin:0 }}>Auto-send reminder email</p>
                    <p style={{ fontSize:12, color:"#6B7280", margin:0 }}>Automatically emails all registrants before class starts</p>
                  </div>
                  <Switch checked={cfg.enabled}
                    onCheckedChange={v => saveReminderConfig({ ...reminderConfig, [reminderDialog.id]: { ...cfg, enabled:v } })}/>
                </div>

                {/* Timing */}
                <div style={{ marginBottom:14 }}>
                  <label style={{ fontSize:12, fontWeight:700, color:"#6B7280", display:"block", marginBottom:8 }}>When to send</label>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
                    {REMINDER_OPTIONS.map(opt => (
                      <button key={opt.value}
                        onClick={() => saveReminderConfig({ ...reminderConfig, [reminderDialog.id]: { ...cfg, minutesBefore:opt.value } })}
                        style={{ padding:"9px 12px", borderRadius:10, border:`2px solid ${cfg.minutesBefore===opt.value?GOLD:"#E5E7EB"}`, background: cfg.minutesBefore===opt.value?"#FFFBEB":"#fff", color: cfg.minutesBefore===opt.value?GOLD:"#374151", cursor:"pointer", fontWeight:600, fontSize:13 }}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Note */}
                <div style={{ padding:"10px 12px", borderRadius:10, background:"#EFF6FF", marginBottom:14 }}>
                  <p style={{ fontSize:12, color:"#1D4ED8", margin:0 }}>
                    ℹ️ The auto-reminder calls the <code>send-guest-email-reminder</code> edge function.
                    Make sure <strong>RESEND_API_KEY</strong> and <strong>FROM_EMAIL</strong> are set in your Supabase Edge Function secrets.
                  </p>
                </div>

                {/* Last sent */}
                {cfg.lastSentAt && (
                  <p style={{ fontSize:11, color:"#9CA3AF", textAlign:"center", marginBottom:12 }}>
                    Last sent: {format(new Date(cfg.lastSentAt), "MMM d 'at' h:mm a")}
                  </p>
                )}

                {/* Manual send now */}
                <button
                  onClick={() => { openEmailBlast("class", reminderDialog); setReminderDialog(null); }}
                  style={{ width:"100%", padding:"11px 0", borderRadius:12, border:"none", background:G, color:"#fff", cursor:"pointer", fontWeight:700, fontSize:14, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                  <Send size={14}/> Compose & Send Now
                </button>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════
          EMAIL BLAST COMPOSER DIALOG
      ══════════════════════════════════════════════════════ */}
      <Dialog open={emailDialog} onOpenChange={v => !v && setEmailDialog(false)}>
        <DialogContent style={{ maxWidth:560, borderRadius:20, padding:0, maxHeight:"92vh", display:"flex", flexDirection:"column" }}>
          <div style={{ background: emailTarget==="all" ? G : GOLD, padding:"18px 20px", borderRadius:"20px 20px 0 0", flexShrink:0 }}>
            <h2 style={{ fontWeight:800, fontSize:16, color:"#fff", margin:0 }}>
              {emailTarget==="all" ? "📧 Email All Contacts" : `📧 Email Class Registrants`}
            </h2>
            <p style={{ fontSize:11, color:"rgba(255,255,255,.8)", margin:0 }}>
              {emailTarget==="all"
                ? `${allContacts.filter(r=>r.email).length} contacts with email addresses`
                : `${registrants.filter(r=>r.email).length} registrants with email addresses`}
            </p>
          </div>

          <div style={{ flex:1, overflowY:"auto", padding:20, display:"flex", flexDirection:"column", gap:14 }}>
            {/* Subject */}
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:"#6B7280", display:"block", marginBottom:5 }}>Subject Line</label>
              <Input value={emailSubject} onChange={e => setEmailSubject(e.target.value)}
                placeholder="Email subject…" style={{ borderRadius:10 }}/>
            </div>

            {/* Body */}
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:"#6B7280", display:"block", marginBottom:5 }}>Email Body</label>
              <Textarea value={emailBody} onChange={e => setEmailBody(e.target.value)}
                rows={10} placeholder="Write your message…"
                style={{ borderRadius:10, fontFamily:"inherit", resize:"vertical" }}/>
              <p style={{ fontSize:11, color:"#9CA3AF", marginTop:4 }}>
                Tip: The email is sent as plain text. Each recipient receives their own copy.
              </p>
            </div>

            {/* Recipient summary */}
            <div style={{ padding:"12px 14px", borderRadius:10, background:"#F0FDF4", border:"1px solid #BBF7D0" }}>
              <p style={{ fontSize:13, fontWeight:700, color:"#166534", margin:0 }}>
                ✅ Will send to: {emailTarget==="all" ? allContacts.filter(r=>r.email).length : registrants.filter(r=>r.email).length} email addresses
              </p>
              {emailTarget==="class" && registrants.filter(r=>!r.email).length > 0 && (
                <p style={{ fontSize:12, color:"#6B7280", margin:"4px 0 0" }}>
                  ⚠️ {registrants.filter(r=>!r.email).length} registrant{registrants.filter(r=>!r.email).length!==1?"s":""} without email will be skipped.
                </p>
              )}
            </div>

            {/* Sent confirmation */}
            {sentCount !== null && (
              <div style={{ padding:"12px 14px", borderRadius:10, background:"#DBEAFE", border:"1px solid #93C5FD", display:"flex", alignItems:"center", gap:8 }}>
                <CheckCircle size={16} color="#1D4ED8"/>
                <p style={{ fontSize:13, fontWeight:700, color:"#1D4ED8", margin:0 }}>
                  Successfully sent to {sentCount} recipient{sentCount!==1?"s":""}!
                </p>
              </div>
            )}
          </div>

          <div style={{ padding:"14px 20px", borderTop:"1px solid #E5E7EB", background:"#FAFAFA", flexShrink:0, display:"flex", gap:8 }}>
            <button onClick={() => setEmailDialog(false)}
              style={{ flex:1, padding:"11px 0", borderRadius:12, border:"1.5px solid #E5E7EB", background:"#fff", cursor:"pointer", fontWeight:600, fontSize:14, color:"#374151" }}>
              Cancel
            </button>
            <button onClick={handleSendEmail} disabled={sending || !emailSubject.trim() || !emailBody.trim()}
              style={{ flex:2, padding:"11px 0", borderRadius:12, border:"none", background: sending||!emailSubject.trim()||!emailBody.trim()?"#E5E7EB":GOLD, color: sending||!emailSubject.trim()||!emailBody.trim()?"#9CA3AF":"#fff", cursor: sending?"not-allowed":"pointer", fontWeight:700, fontSize:14, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
              {sending ? <><Loader2 size={15} style={{ animation:"spin .8s linear infinite" }}/> Sending…</> : <><Send size={14}/> Send Email</>}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════
          CREATE DIALOG
      ══════════════════════════════════════════════════════ */}
      <Dialog open={createOpen} onOpenChange={v => { if (!v) { setCreateOpen(false); setForm(emptyForm); } }}>
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
              {form.password_enabled && <Input value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))} placeholder="Set class password" style={{ borderRadius:9, marginTop:8 }}/>}
              <ToggleRow label="Require Name"       sub="Guests must enter their name"       checked={form.require_name}       onChange={(v:boolean)=>setForm(f=>({...f,require_name:v}))}/>
              <ToggleRow label="Enable Chat"                                                  checked={form.chat_enabled}       onChange={(v:boolean)=>setForm(f=>({...f,chat_enabled:v}))}/>
              <ToggleRow label="Raise Hand"                                                   checked={form.raise_hand_enabled} onChange={(v:boolean)=>setForm(f=>({...f,raise_hand_enabled:v}))}/>
              <ToggleRow label="Allow Guest Camera"                                           checked={form.allow_guest_camera} onChange={(v:boolean)=>setForm(f=>({...f,allow_guest_camera:v}))}/>
              <ToggleRow label="Allow Guest Mic"                                              checked={form.allow_guest_mic}    onChange={(v:boolean)=>setForm(f=>({...f,allow_guest_mic:v}))}/>
              <ToggleRow label="Record Class"                                                 checked={form.recording_enabled}  onChange={(v:boolean)=>setForm(f=>({...f,recording_enabled:v}))}/>
              <ToggleRow label="Feature on Homepage"                                          checked={form.is_featured}        onChange={(v:boolean)=>setForm(f=>({...f,is_featured:v}))}/>
            </div>
            <Button onClick={handleCreate} disabled={!form.title||creating}
              style={{ background:GOLD, borderRadius:12, height:44, gap:8, fontWeight:700, fontSize:14, color:"#fff" }}>
              {creating?<><Loader2 size={16} style={{ animation:"spin .8s linear infinite" }}/> Creating…</>:"Create Public Class"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════
          SHARE DIALOG
      ══════════════════════════════════════════════════════ */}
      <Dialog open={!!shareClass} onOpenChange={v=>!v&&setShareClass(null)}>
        <DialogContent style={{ maxWidth:420, borderRadius:20, padding:0 }}>
          <div style={{ background:G, padding:"18px 20px", borderRadius:"20px 20px 0 0" }}>
            <h2 style={{ fontWeight:800, fontSize:16, color:"#fff", margin:0 }}>Share Class</h2>
            <p style={{ fontSize:11, color:"rgba(255,255,255,.7)", margin:0 }}>{shareClass?.title}</p>
          </div>
          {shareClass && (
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
                  { label:"Copy Link", icon:<Copy size={14}/>,  action:()=>copyLink(shareClass!) },
                  { label:"WhatsApp",  icon:<Send size={14}/>,  action:()=>shareWhatsApp(shareClass!) },
                  { label:"Email",     icon:"📧",               action:()=>window.open(`mailto:?subject=${encodeURIComponent("Join: "+shareClass!.title)}&body=${encodeURIComponent("Join free: "+window.location.origin+"/live/"+shareClass!.room_code)}`) },
                  { label:"QR Code",   icon:<QrCode size={14}/>,action:()=>window.open(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(window.location.origin+"/live/"+shareClass!.room_code)}`,"_blank") },
                ].map((btn,i) => (
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

export default PublicClassManagement;
