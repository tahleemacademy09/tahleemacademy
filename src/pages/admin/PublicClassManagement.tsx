import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Copy, Share2, QrCode, Trash2, Radio, Calendar, Users, ExternalLink, Video } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface PublicClass {
  id: string;
  title: string;
  title_ar: string | null;
  description: string | null;
  description_ar: string | null;
  room_code: string;
  status: string;
  scheduled_at: string | null;
  max_guests: number;
  guest_count: number;
  password_enabled: boolean;
  password: string | null;
  chat_enabled: boolean;
  raise_hand_enabled: boolean;
  recording_enabled: boolean;
  is_featured: boolean;
  require_name: boolean;
  allow_guest_camera: boolean;
  allow_guest_mic: boolean;
  host_id: string;
  livekit_room_name: string | null;
  created_at: string;
}

const generateRoomCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
};

const PublicClassManagement = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [classes, setClasses] = useState<PublicClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState<PublicClass | null>(null);

  // Create form state
  const [form, setForm] = useState({
    title: "", title_ar: "", description: "", description_ar: "",
    scheduled_at: "", password_enabled: false, password: "",
    max_guests: 100, require_name: true, allow_guest_camera: false,
    allow_guest_mic: false, chat_enabled: true, raise_hand_enabled: true,
    recording_enabled: false, is_featured: false,
  });

  useEffect(() => { fetchClasses(); }, []);

  const fetchClasses = async () => {
    const { data } = await supabase.from("public_classes").select("*").order("created_at", { ascending: false });
    setClasses((data as PublicClass[]) || []);
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    const roomCode = generateRoomCode();
    const livekitRoom = `public-${roomCode}`;

    const { error } = await supabase.from("public_classes").insert({
      title: form.title,
      title_ar: form.title_ar || null,
      description: form.description || null,
      description_ar: form.description_ar || null,
      scheduled_at: form.scheduled_at || null,
      room_code: roomCode,
      livekit_room_name: livekitRoom,
      join_url: `${window.location.origin}/live/${roomCode}`,
      host_id: user!.id,
      password_enabled: form.password_enabled,
      password: form.password_enabled ? form.password : null,
      max_guests: form.max_guests,
      require_name: form.require_name,
      allow_guest_camera: form.allow_guest_camera,
      allow_guest_mic: form.allow_guest_mic,
      chat_enabled: form.chat_enabled,
      raise_hand_enabled: form.raise_hand_enabled,
      recording_enabled: form.recording_enabled,
      is_featured: form.is_featured,
    });

    if (error) { toast.error(error.message); return; }
    toast.success("Public class created!");
    setCreateOpen(false);
    setForm({ title: "", title_ar: "", description: "", description_ar: "", scheduled_at: "",
      password_enabled: false, password: "", max_guests: 100, require_name: true,
      allow_guest_camera: false, allow_guest_mic: false, chat_enabled: true,
      raise_hand_enabled: true, recording_enabled: false, is_featured: false });
    fetchClasses();
  };

  const updateStatus = async (id: string, status: string) => {
    const updates: Record<string, unknown> = { status };
    if (status === "live") updates.actual_start_time = new Date().toISOString();
    if (status === "ended") updates.actual_end_time = new Date().toISOString();
    await supabase.from("public_classes").update(updates).eq("id", id);
    toast.success(`Class ${status}`);
    fetchClasses();
  };

  const goLiveAndJoin = async (cls: PublicClass) => {
    // Set class to live
    await supabase.from("public_classes").update({
      status: "live",
      actual_start_time: new Date().toISOString(),
    }).eq("id", cls.id);

    // Get LiveKit token as host
    try {
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;

      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/public-class-token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          "Authorization": `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          room_code: cls.room_code,
          guest_name: user?.user_metadata?.full_name || "Teacher",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to get classroom token");
        return;
      }

      navigate(`/live/${cls.room_code}/classroom`, {
        state: {
          token: data.token,
          url: data.url,
          room: data.room,
          guestName: data.participant_name,
          classTitle: cls.title,
          classTitleAr: cls.title_ar,
          isHost: true,
          classId: cls.id,
        },
      });
    } catch {
      toast.error("Failed to connect to classroom");
    }
  };

  const deleteClass = async (id: string) => {
    if (!confirm("Delete this public class?")) return;
    await supabase.from("public_classes").delete().eq("id", id);
    toast.success("Deleted");
    fetchClasses();
  };

  const showLinks = (cls: PublicClass) => {
    setSelectedClass(cls);
    setLinkDialogOpen(true);
  };

  const shareWhatsApp = (cls: PublicClass) => {
    const msg = encodeURIComponent(
      `Assalamu Alaikum! 🌙\n\nYou are invited to a FREE live Islamic class with Tahleem Academy!\n\n📚 ${cls.title}\n${cls.scheduled_at ? `📅 ${format(new Date(cls.scheduled_at), "MMM d, yyyy 'at' h:mm a")}` : ""}\n\nJoin here (no account needed):\n${window.location.origin}/live/${cls.room_code}\n\nRoom Code: ${cls.room_code}\n\nShare with others who may benefit! 🤲\nوَمَنْ دَلَّ عَلَى خَيْرٍ فَلَهُ مِثْلُ أَجْرِ فَاعِلِهِ`
    );
    window.open(`https://wa.me/?text=${msg}`, "_blank");
  };

  const liveCount = classes.filter(c => c.status === "live").length;
  const scheduledCount = classes.filter(c => c.status === "scheduled").length;
  const endedCount = classes.filter(c => c.status === "ended").length;
  const totalGuests = classes.reduce((sum, c) => sum + (c.guest_count || 0), 0);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("Public Classes", "الدروس العامة")}</h1>
          <p className="text-sm text-muted-foreground">{t("Create and manage public live classes anyone can join", "إنشاء وإدارة الدروس المباشرة العامة")}</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button style={{ background: "#c9973a" }} className="text-white"><Plus className="h-4 w-4 mr-2" /> {t("Create Public Class", "إنشاء درس عام")}</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("Create Public Class", "إنشاء درس عام جديد")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div><Label>Title (English) *</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
              <div><Label>Title (Arabic)</Label><Input value={form.title_ar} onChange={e => setForm(f => ({ ...f, title_ar: e.target.value }))} dir="rtl" /></div>
              <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} /></div>
              <div><Label>Description (Arabic)</Label><Textarea value={form.description_ar} onChange={e => setForm(f => ({ ...f, description_ar: e.target.value }))} rows={2} dir="rtl" /></div>
              <div><Label>Scheduled Date & Time</Label><Input type="datetime-local" value={form.scheduled_at} onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))} /></div>
              <div><Label>Max Guests</Label><Input type="number" value={form.max_guests} onChange={e => setForm(f => ({ ...f, max_guests: parseInt(e.target.value) || 100 }))} /></div>

              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between"><Label>Password Protection</Label><Switch checked={form.password_enabled} onCheckedChange={v => setForm(f => ({ ...f, password_enabled: v }))} /></div>
                {form.password_enabled && <Input placeholder="Class password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />}
                <div className="flex items-center justify-between"><Label>Require Name</Label><Switch checked={form.require_name} onCheckedChange={v => setForm(f => ({ ...f, require_name: v }))} /></div>
                <div className="flex items-center justify-between"><Label>Allow Guest Camera</Label><Switch checked={form.allow_guest_camera} onCheckedChange={v => setForm(f => ({ ...f, allow_guest_camera: v }))} /></div>
                <div className="flex items-center justify-between"><Label>Allow Guest Mic</Label><Switch checked={form.allow_guest_mic} onCheckedChange={v => setForm(f => ({ ...f, allow_guest_mic: v }))} /></div>
                <div className="flex items-center justify-between"><Label>Enable Chat</Label><Switch checked={form.chat_enabled} onCheckedChange={v => setForm(f => ({ ...f, chat_enabled: v }))} /></div>
                <div className="flex items-center justify-between"><Label>Enable Hand Raising</Label><Switch checked={form.raise_hand_enabled} onCheckedChange={v => setForm(f => ({ ...f, raise_hand_enabled: v }))} /></div>
                <div className="flex items-center justify-between"><Label>Record Class</Label><Switch checked={form.recording_enabled} onCheckedChange={v => setForm(f => ({ ...f, recording_enabled: v }))} /></div>
                <div className="flex items-center justify-between"><Label>Featured (Homepage)</Label><Switch checked={form.is_featured} onCheckedChange={v => setForm(f => ({ ...f, is_featured: v }))} /></div>
              </div>

              <Button onClick={handleCreate} className="w-full" style={{ background: "#c9973a" }}>Create Class</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4 text-center"><div className="text-2xl font-bold text-red-500">{liveCount}</div><p className="text-xs text-muted-foreground">Live Now</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><div className="text-2xl font-bold text-blue-500">{scheduledCount}</div><p className="text-xs text-muted-foreground">Scheduled</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><div className="text-2xl font-bold text-muted-foreground">{endedCount}</div><p className="text-xs text-muted-foreground">Completed</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><div className="text-2xl font-bold" style={{ color: "#c9973a" }}>{totalGuests}</div><p className="text-xs text-muted-foreground">Total Guests</p></CardContent></Card>
      </div>

      {/* Class list */}
      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="live">Live</TabsTrigger>
          <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
          <TabsTrigger value="ended">Ended</TabsTrigger>
        </TabsList>
        {["all", "live", "scheduled", "ended"].map(tab => (
          <TabsContent key={tab} value={tab} className="space-y-3">
            {loading ? <p>Loading...</p> :
              classes.filter(c => tab === "all" || c.status === tab).length === 0 ?
                <p className="text-center text-muted-foreground py-8">No classes</p> :
                classes.filter(c => tab === "all" || c.status === tab).map(cls => (
                  <Card key={cls.id}>
                    <CardContent className="p-4">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-bold">{cls.title}</h3>
                            <Badge variant={cls.status === "live" ? "destructive" : cls.status === "scheduled" ? "default" : "secondary"}>
                              {cls.status === "live" && "🔴 "}{cls.status}
                            </Badge>
                            {cls.is_featured && <Badge style={{ background: "#c9973a" }} className="text-white text-xs">Featured</Badge>}
                          </div>
                          {cls.title_ar && <p className="text-sm text-muted-foreground" style={{ fontFamily: "'Amiri', serif" }}>{cls.title_ar}</p>}
                          <div className="flex gap-4 text-xs text-muted-foreground mt-1">
                            <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{cls.scheduled_at ? format(new Date(cls.scheduled_at), "MMM d, h:mm a") : "No date"}</span>
                            <span className="flex items-center gap-1"><Users className="h-3 w-3" />{cls.guest_count}/{cls.max_guests}</span>
                            <span>Code: <code className="font-mono font-bold">{cls.room_code}</code></span>
                          </div>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          {cls.status === "scheduled" && (
                            <Button size="sm" onClick={() => goLiveAndJoin(cls)} className="bg-green-600 text-white hover:bg-green-700">
                              <Video className="h-3 w-3 mr-1" /> Go Live & Join
                            </Button>
                          )}
                          {cls.status === "live" && (
                            <>
                              <Button size="sm" onClick={() => goLiveAndJoin(cls)} className="bg-green-600 text-white hover:bg-green-700">
                                <Video className="h-3 w-3 mr-1" /> Join Classroom
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => updateStatus(cls.id, "ended")}>End Class</Button>
                            </>
                          )}
                          <Button size="sm" variant="outline" onClick={() => showLinks(cls)}><Share2 className="h-3 w-3 mr-1" /> Share</Button>
                          <Button size="sm" variant="outline" onClick={() => window.open(`/live/${cls.room_code}`, "_blank")}><ExternalLink className="h-3 w-3" /></Button>
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteClass(cls.id)}><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
            }
          </TabsContent>
        ))}
      </Tabs>

      {/* Share Links Dialog */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Share Class Link</DialogTitle></DialogHeader>
          {selectedClass && (
            <div className="space-y-4">
              <div className="rounded-lg p-4 bg-muted text-center">
                <p className="text-sm text-muted-foreground mb-1">Your Public Class Link:</p>
                <p className="font-mono font-bold text-lg break-all">{window.location.origin}/live/{selectedClass.room_code}</p>
                <p className="text-sm text-muted-foreground mt-2">Room Code: <code className="font-bold text-lg">{selectedClass.room_code}</code></p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/live/${selectedClass.room_code}`); toast.success("Copied!"); }}>
                  <Copy className="h-4 w-4 mr-2" /> Copy Link
                </Button>
                <Button variant="outline" onClick={() => shareWhatsApp(selectedClass)}>
                  <Share2 className="h-4 w-4 mr-2" /> WhatsApp
                </Button>
                <Button variant="outline" onClick={() => { const mailTo = `mailto:?subject=${encodeURIComponent(`Join: ${selectedClass.title}`)}&body=${encodeURIComponent(`Join free: ${window.location.origin}/live/${selectedClass.room_code}`)}`; window.open(mailTo); }}>
                  📧 Email
                </Button>
                <Button variant="outline" onClick={() => { window.open(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(`${window.location.origin}/live/${selectedClass.room_code}`)}`, "_blank"); }}>
                  <QrCode className="h-4 w-4 mr-2" /> QR Code
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PublicClassManagement;
