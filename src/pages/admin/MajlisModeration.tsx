import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Trash2, Download, Plus, MessageCircle, Pin, Ban, Megaphone, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const MajlisModeration = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const [channels, setChannels] = useState<any[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [broadcastMsg, setBroadcastMsg] = useState({ title: "", message: "" });
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [channelForm, setChannelForm] = useState({ name: "", name_ar: "", type: "group", level: "", description: "" });

  const fetchChannels = async () => {
    const { data } = await supabase.from("chat_channels").select("*").order("last_message_at", { ascending: false });
    setChannels(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchChannels(); }, []);

  const loadMessages = async (channel: any) => {
    setSelectedChannel(channel);
    const { data } = await supabase.from("chat_messages").select("*").eq("channel_id", channel.id).order("created_at", { ascending: false }).limit(100);
    setMessages(data || []);
    const userIds = [...new Set((data || []).map(m => m.user_id))];
    if (userIds.length > 0) {
      const { data: profs } = await supabase.from("profiles").select("user_id, full_name, email, level, status").in("user_id", userIds);
      const map: Record<string, any> = {};
      (profs || []).forEach(p => { map[p.user_id] = p; });
      setProfiles(prev => ({ ...prev, ...map }));
    }
  };

  const deleteMessage = async (msgId: string) => {
    await supabase.from("chat_messages").delete().eq("id", msgId);
    setMessages(prev => prev.filter(m => m.id !== msgId));
    toast({ title: t("Message deleted", "تم حذف الرسالة") });
  };

  const deleteChannel = async (channelId: string) => {
    if (!confirm(t("Delete this channel and all messages?", "حذف هذه القناة وجميع الرسائل؟"))) return;
    await supabase.from("chat_channels").delete().eq("id", channelId);
    setChannels(prev => prev.filter(c => c.id !== channelId));
    if (selectedChannel?.id === channelId) { setSelectedChannel(null); setMessages([]); }
    toast({ title: t("Channel deleted", "تم حذف القناة") });
  };

  const banStudent = async (userId: string) => {
    // Deactivate profile as a ban mechanism
    await supabase.from("profiles").update({ status: "inactive" }).eq("user_id", userId);
    // Remove from all channels
    await supabase.from("chat_members").delete().eq("user_id", userId);
    toast({ title: t("Student banned from Majlis", "تم حظر الطالب من المجلس") });
  };

  const handleBroadcast = async () => {
    if (!broadcastMsg.title || !broadcastMsg.message || !user) return;
    // Send as teacher_announcement to all
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
    const { data } = await supabase.from("chat_channels").insert({
      name: channelForm.name,
      name_ar: channelForm.name_ar || null,
      type: channelForm.type,
      level: channelForm.type === "level" ? channelForm.level : null,
      description: channelForm.description || null,
      created_by: user.id,
      is_private: false,
    }).select().single();
    if (data) {
      await supabase.from("chat_members").insert({ channel_id: data.id, user_id: user.id, role: "admin" });
      setChannels(prev => [data, ...prev]);
    }
    setShowCreateChannel(false);
    setChannelForm({ name: "", name_ar: "", type: "group", level: "", description: "" });
    toast({ title: t("Channel created", "تم إنشاء القناة") });
  };

  const exportChat = () => {
    if (!selectedChannel) return;
    const rows = [["Sender", "Message", "Type", "Time"].join(",")];
    messages.forEach(m => {
      rows.push([
        profiles[m.user_id]?.full_name || m.user_id,
        `"${(m.text || "").replace(/"/g, '""')}"`,
        m.content_type,
        new Date(m.created_at).toLocaleString(),
      ].join(","));
    });
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `chat-${selectedChannel.name}.csv`; a.click();
  };

  const filteredChannels = channels.filter(c => {
    if (!search) return true;
    return (c.name || "").toLowerCase().includes(search.toLowerCase()) || (c.name_ar || "").includes(search);
  });

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  if (selectedChannel) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => { setSelectedChannel(null); setMessages([]); }}>← {t("Back", "رجوع")}</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportChat}><Download className="h-4 w-4 me-2" />{t("Export Chat", "تصدير المحادثة")}</Button>
          </div>
        </div>
        <h1 className="text-xl font-bold">{selectedChannel.name} — {messages.length} {t("messages", "رسالة")}</h1>
        <Card>
          <CardContent className="p-0 max-h-[60vh] overflow-y-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>{t("Sender", "المرسل")}</TableHead>
                <TableHead>{t("Message", "الرسالة")}</TableHead>
                <TableHead>{t("Type", "النوع")}</TableHead>
                <TableHead>{t("Time", "الوقت")}</TableHead>
                <TableHead>{t("Actions", "الإجراءات")}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {messages.map(m => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium">{profiles[m.user_id]?.full_name || "Unknown"}</p>
                        <p className="text-xs text-muted-foreground">{profiles[m.user_id]?.level || ""}</p>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[300px] truncate">{m.text || `[${m.content_type}]`}</TableCell>
                    <TableCell><Badge variant="outline">{m.content_type}</Badge></TableCell>
                    <TableCell className="text-xs">{new Date(m.created_at).toLocaleString()}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => deleteMessage(m.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => banStudent(m.user_id)} title={t("Ban user", "حظر المستخدم")}><Ban className="h-4 w-4 text-amber-500" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">{t("Majlis Moderation", "إدارة المجلس")}</h1>
        <div className="flex gap-2">
          <Button onClick={() => setShowCreateChannel(true)}><Plus className="h-4 w-4 me-2" />{t("Create Channel", "إنشاء قناة")}</Button>
          <Button variant="secondary" onClick={() => setShowBroadcast(true)}><Megaphone className="h-4 w-4 me-2" />{t("Broadcast", "بث")}</Button>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder={t("Search channels...", "ابحث عن القنوات...")} value={search} onChange={e => setSearch(e.target.value)} className="ps-9" />
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredChannels.map(c => (
          <Card key={c.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => loadMessages(c)}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-primary" />
                  <p className="font-medium text-sm">{c.name || "Channel"}</p>
                </div>
                <Badge variant="outline">{c.type}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{c.member_count || 0} {t("members", "أعضاء")} • {c.last_message ? c.last_message.slice(0, 40) : t("No messages", "لا رسائل")}</p>
              <div className="flex gap-1 mt-2" onClick={e => e.stopPropagation()}>
                <Button size="sm" variant="ghost" onClick={() => deleteChannel(c.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Broadcast Dialog */}
      <Dialog open={showBroadcast} onOpenChange={setShowBroadcast}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("Broadcast Announcement", "بث إعلان")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>{t("Title", "العنوان")}</Label><Input value={broadcastMsg.title} onChange={e => setBroadcastMsg({ ...broadcastMsg, title: e.target.value })} /></div>
            <div><Label>{t("Message", "الرسالة")}</Label><Textarea value={broadcastMsg.message} onChange={e => setBroadcastMsg({ ...broadcastMsg, message: e.target.value })} /></div>
            <Button onClick={handleBroadcast} className="w-full">{t("Send to All", "إرسال للجميع")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Channel Dialog */}
      <Dialog open={showCreateChannel} onOpenChange={setShowCreateChannel}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("Create Channel", "إنشاء قناة")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>{t("Name", "الاسم")}</Label><Input value={channelForm.name} onChange={e => setChannelForm({ ...channelForm, name: e.target.value })} /></div>
            <div><Label>{t("Name (Arabic)", "الاسم بالعربي")}</Label><Input value={channelForm.name_ar} onChange={e => setChannelForm({ ...channelForm, name_ar: e.target.value })} dir="rtl" /></div>
            <div><Label>{t("Type", "النوع")}</Label>
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
              <div><Label>{t("Level", "المستوى")}</Label>
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
            <Button onClick={handleCreateChannel} className="w-full">{t("Create", "إنشاء")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MajlisModeration;
