import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useAcademicLevels, getLevelConfig, getLevelDisplay } from "@/hooks/useAcademicLevels";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import Majlis from "@/pages/student/Majlis";

export const useMajlisAdmin = () => {
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  return { showBroadcast, setShowBroadcast, showCreateChannel, setShowCreateChannel };
};

const MajlisModeration = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: academicLevels = [] } = useAcademicLevels();
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [broadcastMsg, setBroadcastMsg] = useState({ title: "", message: "" });
  const [channelForm, setChannelForm] = useState({ name: "", name_ar: "", type: "group", level: "", description: "" });

  const handleBroadcast = async () => {
    if (!broadcastMsg.title || !broadcastMsg.message || !user) return;
    await supabase.from("teacher_announcements").insert({
      teacher_id: user.id,
      title: broadcastMsg.title,
      message: broadcastMsg.message,
      target_type: "all",
      priority: "important",
    });
    setShowBroadcast(false);
    setBroadcastMsg({ title: "", message: "" });
    toast({ title: "✅ Broadcast sent!" });
  };

  const handleCreateChannel = async () => {
    if (!channelForm.name || !user) return;
    const { data } = await supabase.from("chat_channels" as any).insert({
      name: channelForm.name,
      name_ar: channelForm.name_ar || null,
      type: channelForm.type,
      level: channelForm.type === "level" ? channelForm.level : null,
      description: channelForm.description || null,
      created_by: user.id,
      is_private: false,
    }).select().single();

    if (data) {
      await supabase.from("chat_members" as any).insert({ channel_id: (data as any).id, user_id: user.id, role: "admin" });
      const { data: allProfiles } = await supabase.from("profiles").select("user_id");
      if (allProfiles?.length) {
        const members = allProfiles.map((p: any) => ({ channel_id: (data as any).id, user_id: p.user_id, role: "member" }));
        await supabase.from("chat_members" as any).upsert(members, { onConflict: "channel_id,user_id" });
      }
    }
    setShowCreateChannel(false);
    setChannelForm({ name: "", name_ar: "", type: "group", level: "", description: "" });
    toast({ title: "✅ Channel created!" });
  };

  return (
    <div className="flex flex-col overflow-hidden" style={{ height: "calc(100vh - 3.5rem)" }}>
      {/* Full height Majlis — admin props passed via context */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <Majlis
          adminMode
          onBroadcast={() => setShowBroadcast(true)}
          onCreateChannel={() => setShowCreateChannel(true)}
        />
      </div>

      {/* Broadcast Dialog */}
      <Dialog open={showBroadcast} onOpenChange={setShowBroadcast}>
        <DialogContent>
          <DialogHeader><DialogTitle>📢 {t("Broadcast to All Students", "بث لجميع الطلاب")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>{t("Title", "العنوان")}</Label><Input value={broadcastMsg.title} onChange={e => setBroadcastMsg({ ...broadcastMsg, title: e.target.value })} /></div>
            <div><Label>{t("Message", "الرسالة")}</Label><Textarea value={broadcastMsg.message} onChange={e => setBroadcastMsg({ ...broadcastMsg, message: e.target.value })} rows={4} /></div>
            <Button onClick={handleBroadcast} className="w-full" style={{ backgroundColor: "#1a3a2a" }}>{t("Send to All", "إرسال للجميع")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Channel Dialog */}
      <Dialog open={showCreateChannel} onOpenChange={setShowCreateChannel}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("Create Channel", "إنشاء قناة")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>{t("Name", "الاسم")}</Label><Input value={channelForm.name} onChange={e => setChannelForm({ ...channelForm, name: e.target.value })} /></div>
            <div><Label>{t("Arabic Name", "الاسم بالعربي")}</Label><Input value={channelForm.name_ar} onChange={e => setChannelForm({ ...channelForm, name_ar: e.target.value })} dir="rtl" /></div>
            <div>
              <Label>{t("Type", "النوع")}</Label>
              <Select value={channelForm.type} onValueChange={v => setChannelForm({ ...channelForm, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="group">Group</SelectItem>
                  <SelectItem value="level">Level</SelectItem>
                  <SelectItem value="announcement">Announcement</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {channelForm.type === "level" && (
              <div>
                <Label>{t("Level", "المستوى")}</Label>
                <Select value={channelForm.level} onValueChange={v => setChannelForm({ ...channelForm, level: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {academicLevels.map(l => (
                      <SelectItem key={l.slug} value={l.slug}>{l.name_en}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div><Label>{t("Description", "الوصف")}</Label><Textarea value={channelForm.description} onChange={e => setChannelForm({ ...channelForm, description: e.target.value })} /></div>
            <Button onClick={handleCreateChannel} className="w-full" style={{ backgroundColor: "#1a3a2a" }}>{t("Create", "إنشاء")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MajlisModeration;
