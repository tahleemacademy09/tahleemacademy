import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Megaphone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import Majlis from "@/pages/student/Majlis";

const MajlisModeration = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [broadcastMsg, setBroadcastMsg] = useState({ title: "", message: "" });
  const [showCreateChannel, setShowCreateChannel] = useState(false);
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
    toast({ title: t("Broadcast sent", "تم إرسال البث") });
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
      if (allProfiles && allProfiles.length > 0) {
        const members = allProfiles.map((p: any) => ({ channel_id: (data as any).id, user_id: p.user_id, role: "member" }));
        await supabase.from("chat_members" as any).upsert(members, { onConflict: "channel_id,user_id" });
      }
    }
    setShowCreateChannel(false);
    setChannelForm({ name: "", name_ar: "", type: "group", level: "", description: "" });
    toast({ title: t("Channel created successfully", "تم إنشاء القناة بنجاح") });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <div className="flex items-center gap-2 px-4 py-2 border-b" style={{ backgroundColor: "#f5f0e8" }}>
        <span className="text-xs font-semibold text-gray-500 flex-1">👑 {t("Admin View", "عرض المشرف")}</span>
        <Button size="sm" onClick={() => setShowCreateChannel(true)} className="h-8 text-xs" style={{ backgroundColor: "#1a3a2a" }}>
          <Plus className="h-3.5 w-3.5 mr-1" />{t("New Channel", "قناة جديدة")}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setShowBroadcast(true)} className="h-8 text-xs border-amber-500 text-amber-600">
          <Megaphone className="h-3.5 w-3.5 mr-1" />{t("Broadcast", "بث")}
        </Button>
      </div>
      <div className="flex-1 overflow-hidden">
        <Majlis />
      </div>
      <Dialog open={showBroadcast} onOpenChange={setShowBroadcast}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("Broadcast Announcement", "بث إعلان")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>{t("Title", "العنوان")}</Label><Input value={broadcastMsg.title} onChange={e => setBroadcastMsg({ ...broadcastMsg, title: e.target.value })} /></div>
            <div><Label>{t("Message", "الرسالة")}</Label><Textarea value={broadcastMsg.message} onChange={e => setBroadcastMsg({ ...broadcastMsg, message: e.target.value })} rows={4} /></div>
            <Button onClick={handleBroadcast} className="w-full" style={{ backgroundColor: "#1a3a2a" }}>{t("Send to All", "إرسال للجميع")}</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={showCreateChannel} onOpenChange={setShowCreateChannel}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("Create Channel", "إنشاء قناة")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>{t("Name", "الاسم")}</Label><Input value={channelForm.name} onChange={e => setChannelForm({ ...channelForm, name: e.target.value })} /></div>
            <div><Label>{t("Name (Arabic)", "الاسم بالعربي")}</Label><Input value={channelForm.name_ar} onChange={e => setChannelForm({ ...channelForm, name_ar: e.target.value })} dir="rtl" /></div>
            <div>
              <Label>{t("Type", "النوع")}</Label>
              <Select value={channelForm.type} onValueChange={v => setChannelForm({ ...channelForm, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="group">{t("Group", "مجموعة")}</SelectItem>
                  <SelectItem value="level">{t("Level", "مستوى")}</SelectItem>
                  <SelectItem value="announcement">{t("Announcement", "إعلانات")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {channelForm.type === "level" && (
              <div>
                <Label>{t("Level", "المستوى")}</Label>
                <Select value={channelForm.level} onValueChange={v => setChannelForm({ ...channelForm, level: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">{t("Beginner", "مبتدئ")}</SelectItem>
                    <SelectItem value="intermediate">{t("Intermediate", "متوسط")}</SelectItem>
                    <SelectItem value="advanced">{t("Advanced", "متقدم")}</SelectItem>
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
