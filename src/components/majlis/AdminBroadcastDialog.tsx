import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Megaphone, Loader2, Eye } from "lucide-react";

interface AdminBroadcastDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const AdminBroadcastDialog = ({ open, onOpenChange }: AdminBroadcastDialogProps) => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const [sending, setSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [form, setForm] = useState({
    title: "",
    message: "",
    message_ar: "",
    target: "all",
    is_pinned: false,
    pin_days: "1",
  });

  const targets = [
    { value: "all", label: "🌍 All Users", labelAr: "🌍 جميع المستخدمين" },
    { value: "students", label: "🎓 Students Only", labelAr: "🎓 الطلاب فقط" },
    { value: "teachers", label: "👨‍🏫 Teachers Only", labelAr: "👨‍🏫 المعلمون فقط" },
    { value: "level_beginner", label: "🟢 Beginner Level", labelAr: "🟢 المستوى المبتدئ" },
    { value: "level_intermediate", label: "🟡 Intermediate Level", labelAr: "🟡 المستوى المتوسط" },
    { value: "level_advanced", label: "🔴 Advanced Level", labelAr: "🔴 المستوى المتقدم" },
  ];

  const handleSend = async () => {
    if (!form.message.trim() || !user) return;
    setSending(true);
    try {
      const pinExpiry = form.is_pinned
        ? new Date(Date.now() + parseInt(form.pin_days) * 86400000).toISOString()
        : null;

      await supabase.from("majlis_broadcast" as any).insert({
        sent_by: user.id,
        title: form.title || null,
        message: form.message,
        message_ar: form.message_ar || null,
        target: form.target,
        is_pinned: form.is_pinned,
        pin_expires_at: pinExpiry,
      });

      // Log audit
      await supabase.from("majlis_audit_log" as any).insert({
        admin_id: user.id,
        action: "broadcast_sent",
        details: { title: form.title, target: form.target },
      });

      toast({ title: t("📢 Broadcast sent!", "📢 تم إرسال البث!") });
      setForm({ title: "", message: "", message_ar: "", target: "all", is_pinned: false, pin_days: "1" });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: t("Error", "خطأ"), description: e.message, variant: "destructive" });
    }
    setSending(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" dir="auto">
            <Megaphone className="h-5 w-5 text-amber-500" />
            {t("New Broadcast", "بث جديد")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label dir="auto">{t("Title (optional)", "العنوان (اختياري)")}</Label>
            <Input
              value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })}
              placeholder={t("e.g. Holiday Notice", "مثال: إشعار عطلة")}
              dir="auto"
            />
          </div>

          <div>
            <Label dir="auto">{t("Message (English)", "الرسالة (إنجليزي)")} *</Label>
            <Textarea
              value={form.message}
              onChange={e => setForm({ ...form, message: e.target.value })}
              placeholder={t("Type your broadcast message...", "اكتب رسالة البث...")}
              rows={4}
            />
          </div>

          <div>
            <Label dir="auto">{t("Message (Arabic)", "الرسالة (عربي)")}</Label>
            <Textarea
              value={form.message_ar}
              onChange={e => setForm({ ...form, message_ar: e.target.value })}
              placeholder="اكتب الرسالة بالعربية..."
              dir="rtl"
              rows={3}
            />
          </div>

          <div>
            <Label dir="auto">{t("Target Audience", "الجمهور المستهدف")}</Label>
            <Select value={form.target} onValueChange={v => setForm({ ...form, target: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {targets.map(tgt => (
                  <SelectItem key={tgt.value} value={tgt.value}>{tgt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={form.is_pinned} onCheckedChange={v => setForm({ ...form, is_pinned: v })} />
            <Label dir="auto">{t("Pin this broadcast", "تثبيت هذا البث")}</Label>
          </div>

          {form.is_pinned && (
            <div>
              <Label dir="auto">{t("Pin Duration", "مدة التثبيت")}</Label>
              <Select value={form.pin_days} onValueChange={v => setForm({ ...form, pin_days: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 {t("day", "يوم")}</SelectItem>
                  <SelectItem value="3">3 {t("days", "أيام")}</SelectItem>
                  <SelectItem value="7">1 {t("week", "أسبوع")}</SelectItem>
                  <SelectItem value="14">2 {t("weeks", "أسبوعان")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Preview */}
          {showPreview && (
            <div className="border rounded-xl p-4 space-y-2" style={{ backgroundColor: "#FFF8E1" }}>
              <div className="flex items-center gap-2">
                <span className="text-lg">📢</span>
                <span className="text-xs font-bold text-amber-700">{t("Academy Announcement", "إعلان الأكاديمية")}</span>
              </div>
              {form.title && <p className="font-bold text-sm">{form.title}</p>}
              <p className="text-sm whitespace-pre-wrap">{form.message || t("(No message)", "(لا رسالة)")}</p>
              {form.message_ar && <p className="text-sm whitespace-pre-wrap" dir="rtl">{form.message_ar}</p>}
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowPreview(!showPreview)} className="flex-1">
              <Eye className="h-4 w-4 me-2" />
              {showPreview ? t("Hide Preview", "إخفاء المعاينة") : t("Preview", "معاينة")}
            </Button>
            <Button
              onClick={handleSend}
              disabled={!form.message.trim() || sending}
              className="flex-1 text-white font-bold"
              style={{ backgroundColor: "#c9973a" }}
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin me-2" /> : <Megaphone className="h-4 w-4 me-2" />}
              {t("Send Broadcast", "إرسال البث")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AdminBroadcastDialog;
