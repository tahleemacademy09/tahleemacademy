import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Bell, Plus, Send, Search, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const NotificationManagement = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSend, setShowSend] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ title: "", message: "", target: "all", target_id: "", level: "" });

  const fetchData = async () => {
    const [{ data: notifs }, { data: studs }] = await Promise.all([
      supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("profiles").select("user_id, full_name, email, level").order("full_name"),
    ]);
    setNotifications(notifs || []);
    setStudents(studs || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleSend = async () => {
    if (!form.title || !form.message) return;

    let targetUserIds: string[] = [];
    if (form.target === "all") {
      targetUserIds = students.map(s => s.user_id);
    } else if (form.target === "level") {
      targetUserIds = students.filter(s => s.level === form.level).map(s => s.user_id);
    } else if (form.target === "student" && form.target_id) {
      targetUserIds = [form.target_id];
    }

    if (targetUserIds.length === 0) {
      toast({ title: t("No recipients", "لا يوجد مستلمين"), variant: "destructive" });
      return;
    }

    const records = targetUserIds.map(uid => ({
      user_id: uid,
      title: form.title,
      message: form.message,
      type: "admin",
    }));

    // Insert in batches of 100
    for (let i = 0; i < records.length; i += 100) {
      await supabase.from("notifications").insert(records.slice(i, i + 100));
    }

    setShowSend(false);
    setForm({ title: "", message: "", target: "all", target_id: "", level: "" });
    fetchData();
    toast({ title: t(`Notification sent to ${targetUserIds.length} students`, `تم إرسال الإشعار إلى ${targetUserIds.length} طالب`) });
  };

  const handleDelete = async (id: string) => {
    await supabase.from("notifications").delete().eq("id", id);
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const filtered = notifications.filter(n => {
    if (!search) return true;
    return n.title.toLowerCase().includes(search.toLowerCase()) || n.message.toLowerCase().includes(search.toLowerCase());
  });

  // Group by student for history view
  const studentMap = new Map<string, any>();
  students.forEach(s => studentMap.set(s.user_id, s));

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">{t("Notification Management", "إدارة الإشعارات")}</h1>
        <Button onClick={() => setShowSend(true)}><Plus className="h-4 w-4 me-2" />{t("Send Notification", "إرسال إشعار")}</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{notifications.length}</p>
            <p className="text-sm text-muted-foreground">{t("Total Sent", "إجمالي المرسل")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{notifications.filter(n => n.is_read).length}</p>
            <p className="text-sm text-muted-foreground">{t("Read", "مقروءة")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{notifications.filter(n => !n.is_read).length}</p>
            <p className="text-sm text-muted-foreground">{t("Unread", "غير مقروءة")}</p>
          </CardContent>
        </Card>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder={t("Search notifications...", "ابحث عن الإشعارات...")} value={search} onChange={e => setSearch(e.target.value)} className="ps-9" />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>{t("Title", "العنوان")}</TableHead>
              <TableHead>{t("Message", "الرسالة")}</TableHead>
              <TableHead>{t("Recipient", "المستلم")}</TableHead>
              <TableHead>{t("Status", "الحالة")}</TableHead>
              <TableHead>{t("Date", "التاريخ")}</TableHead>
              <TableHead>{t("Actions", "الإجراءات")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.slice(0, 50).map(n => (
                <TableRow key={n.id}>
                  <TableCell className="font-medium">{n.title}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{n.message}</TableCell>
                  <TableCell>{studentMap.get(n.user_id)?.full_name || n.user_id.slice(0, 8)}</TableCell>
                  <TableCell><Badge variant={n.is_read ? "outline" : "default"}>{n.is_read ? t("Read", "مقروء") : t("Unread", "غير مقروء")}</Badge></TableCell>
                  <TableCell className="text-xs">{new Date(n.created_at).toLocaleDateString()}</TableCell>
                  <TableCell><Button size="icon" variant="ghost" onClick={() => handleDelete(n.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{t("No notifications", "لا توجد إشعارات")}</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Send Dialog */}
      <Dialog open={showSend} onOpenChange={setShowSend}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("Send Notification", "إرسال إشعار")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>{t("Title", "العنوان")}</Label><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
            <div><Label>{t("Message", "الرسالة")}</Label><Textarea value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} /></div>
            <div><Label>{t("Target", "الهدف")}</Label>
              <Select value={form.target} onValueChange={v => setForm({ ...form, target: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("All Students", "كل الطلاب")}</SelectItem>
                  <SelectItem value="level">{t("By Level", "حسب المستوى")}</SelectItem>
                  <SelectItem value="student">{t("Specific Student", "طالب محدد")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.target === "level" && (
              <Select value={form.level} onValueChange={v => setForm({ ...form, level: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="beginner">{t("Beginner", "مبتدئ")}</SelectItem>
                  <SelectItem value="intermediate">{t("Intermediate", "متوسط")}</SelectItem>
                  <SelectItem value="advanced">{t("Advanced", "متقدم")}</SelectItem>
                </SelectContent>
              </Select>
            )}
            {form.target === "student" && (
              <Select value={form.target_id} onValueChange={v => setForm({ ...form, target_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{students.map(s => <SelectItem key={s.user_id} value={s.user_id}>{s.full_name || s.email}</SelectItem>)}</SelectContent>
              </Select>
            )}
            <Button onClick={handleSend} className="w-full"><Send className="h-4 w-4 me-2" />{t("Send", "إرسال")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default NotificationManagement;
