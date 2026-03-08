import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Reply, Star, Copy, Forward, Pencil, Trash2, Pin, Flag,
  User, VolumeX, Ban, BarChart3, X
} from "lucide-react";
import type { ChatMessage, UserProfile } from "./types";

interface AdminMessageMenuProps {
  message: ChatMessage;
  senderProfile: UserProfile | null;
  isMe: boolean;
  position: { x: number; y: number };
  onClose: () => void;
  onReply: () => void;
  onDelete: (msgId: string) => void;
  onEditComplete: (msgId: string, newText: string) => void;
  onViewProfile: (userId: string) => void;
}

const AdminMessageMenu = ({
  message, senderProfile, isMe, position, onClose,
  onReply, onDelete, onEditComplete, onViewProfile
}: AdminMessageMenuProps) => {
  const { t } = useLanguage();
  const { user, hasRole } = useAuth();
  const { toast } = useToast();
  const isAdmin = hasRole("admin");
  const [showEdit, setShowEdit] = useState(false);
  const [editText, setEditText] = useState(message.text || "");
  const [showMuteOptions, setShowMuteOptions] = useState(false);
  const [showBanConfirm, setShowBanConfirm] = useState(false);
  const [banReason, setBanReason] = useState("");

  const logAudit = async (action: string, details: any) => {
    if (!user) return;
    await supabase.from("majlis_audit_log" as any).insert({
      admin_id: user.id,
      action,
      details,
    });
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(message.text || "");
    toast({ title: t("Copied", "تم النسخ") });
    onClose();
  };

  const handleStar = async () => {
    await supabase.from("chat_messages").update({ is_starred: true } as any).eq("id", message.id);
    toast({ title: t("⭐ Starred", "⭐ تم التمييز") });
    onClose();
  };

  const handlePin = async () => {
    await supabase.from("chat_messages").update({ is_pinned: true } as any).eq("id", message.id);
    await logAudit("pin_message", { message_id: message.id, channel_id: message.channel_id });
    toast({ title: t("📌 Pinned", "📌 تم التثبيت") });
    onClose();
  };

  const handleFlag = async () => {
    await supabase.from("chat_messages").update({ is_flagged: true } as any).eq("id", message.id);
    await logAudit("flag_message", { message_id: message.id, sender: message.user_id });
    toast({ title: t("🚨 Flagged for review", "🚨 تم الإبلاغ للمراجعة") });
    onClose();
  };

  const handleEdit = async () => {
    if (!editText.trim()) return;
    // Save original text
    await supabase.from("chat_messages").update({
      text: editText.trim(),
      edited_at: new Date().toISOString(),
      edited_by: user?.id,
      original_text: message.text,
    } as any).eq("id", message.id);
    await logAudit("edit_message", { message_id: message.id, original: message.text, new_text: editText.trim() });
    onEditComplete(message.id, editText.trim());
    setShowEdit(false);
    onClose();
  };

  const handleDeleteForAll = async (silent: boolean) => {
    if (silent) {
      await supabase.from("chat_messages").delete().eq("id", message.id);
    } else {
      await supabase.from("chat_messages").update({
        text: null,
        content_type: "deleted",
        deleted_by: user?.id,
        media_path: null,
      } as any).eq("id", message.id);
    }
    await logAudit("delete_message", { message_id: message.id, silent, original: message.text });
    onDelete(message.id);
    onClose();
  };

  const handleMute = async (hours: number | null) => {
    if (!user) return;
    await supabase.from("majlis_banned_users" as any).upsert({
      user_id: message.user_id,
      banned_by: user.id,
      channel_id: message.channel_id,
      reason: `Muted for ${hours ? hours + " hours" : "permanently"}`,
      expires_at: hours ? new Date(Date.now() + hours * 3600000).toISOString() : null,
      is_permanent: !hours,
      is_active: true,
    }, { onConflict: "user_id,channel_id" });
    await logAudit("mute_user", { target: message.user_id, hours, channel: message.channel_id });
    toast({ title: t("🔇 User muted", "🔇 تم كتم المستخدم") });
    setShowMuteOptions(false);
    onClose();
  };

  const handleBan = async () => {
    if (!user) return;
    // Ban from platform (null channel_id = platform-wide)
    await supabase.from("majlis_banned_users" as any).insert({
      user_id: message.user_id,
      banned_by: user.id,
      channel_id: null,
      reason: banReason || "Banned by admin",
      is_permanent: true,
      is_active: true,
    });
    // Remove from all channels
    await supabase.from("chat_members" as any).delete().eq("user_id", message.user_id);
    await logAudit("ban_user", { target: message.user_id, reason: banReason });
    toast({ title: t("🚫 User banned", "🚫 تم حظر المستخدم") });
    setShowBanConfirm(false);
    onClose();
  };

  // Position menu
  const menuStyle: React.CSSProperties = {
    position: "fixed",
    top: Math.min(position.y, window.innerHeight - 400),
    left: Math.min(position.x, window.innerWidth - 220),
    zIndex: 100,
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[99]" onClick={onClose} />

      {/* Menu */}
      <div style={menuStyle} className="z-[100] w-52 rounded-xl bg-card border shadow-2xl py-1.5 animate-in fade-in zoom-in-95 duration-150">
        {/* Standard options */}
        <MenuItem icon={<Reply className="h-4 w-4" />} label={t("Reply", "رد")} onClick={() => { onReply(); onClose(); }} />
        <MenuItem icon={<Star className="h-4 w-4 text-amber-500" />} label={t("Star", "تمييز")} onClick={handleStar} />
        <MenuItem icon={<Copy className="h-4 w-4" />} label={t("Copy", "نسخ")} onClick={handleCopy} />

        {/* Admin exclusive */}
        {isAdmin && (
          <>
            <div className="h-px bg-border mx-2 my-1" />
            <MenuItem icon={<Pencil className="h-4 w-4 text-blue-500" />} label={t("Edit Message", "تعديل الرسالة")} onClick={() => setShowEdit(true)} />
            <MenuItem icon={<Trash2 className="h-4 w-4 text-destructive" />} label={t("Delete for All", "حذف للجميع")} onClick={() => handleDeleteForAll(false)} />
            <MenuItem icon={<X className="h-4 w-4 text-destructive/70" />} label={t("Delete Silently", "حذف بصمت")} onClick={() => handleDeleteForAll(true)} />
            <MenuItem icon={<Pin className="h-4 w-4 text-orange-500" />} label={t("Pin Message", "تثبيت الرسالة")} onClick={handlePin} />
            <MenuItem icon={<Flag className="h-4 w-4 text-red-500" />} label={t("Flag Message", "إبلاغ عن الرسالة")} onClick={handleFlag} />

            {!isMe && (
              <>
                <div className="h-px bg-border mx-2 my-1" />
                <MenuItem icon={<User className="h-4 w-4" />} label={t("View Profile", "عرض الملف")} onClick={() => { onViewProfile(message.user_id); onClose(); }} />
                <MenuItem icon={<VolumeX className="h-4 w-4 text-amber-600" />} label={t("Mute Sender", "كتم المرسل")} onClick={() => setShowMuteOptions(true)} />
                <MenuItem icon={<Ban className="h-4 w-4 text-destructive" />} label={t("Ban Sender", "حظر المرسل")} onClick={() => setShowBanConfirm(true)} />
              </>
            )}
          </>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent>
          <DialogHeader><DialogTitle dir="auto">{t("Edit Message", "تعديل الرسالة")}</DialogTitle></DialogHeader>
          <Textarea value={editText} onChange={e => setEditText(e.target.value)} dir="auto" rows={4} />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setShowEdit(false)}>{t("Cancel", "إلغاء")}</Button>
            <Button onClick={handleEdit}>{t("Save", "حفظ")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Mute Options Dialog */}
      <Dialog open={showMuteOptions} onOpenChange={setShowMuteOptions}>
        <DialogContent>
          <DialogHeader><DialogTitle dir="auto">{t("Mute User", "كتم المستخدم")}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground" dir="auto">
            {t("Mute", "كتم")} <strong>{senderProfile?.full_name || "User"}</strong>
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => handleMute(1)}>1 {t("hour", "ساعة")}</Button>
            <Button variant="outline" onClick={() => handleMute(24)}>24 {t("hours", "ساعة")}</Button>
            <Button variant="outline" onClick={() => handleMute(168)}>1 {t("week", "أسبوع")}</Button>
            <Button variant="destructive" onClick={() => handleMute(null)}>{t("Permanent", "دائم")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Ban Confirm Dialog */}
      <Dialog open={showBanConfirm} onOpenChange={setShowBanConfirm}>
        <DialogContent>
          <DialogHeader><DialogTitle dir="auto">{t("Ban User", "حظر المستخدم")}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground" dir="auto">
            {t("Ban", "حظر")} <strong>{senderProfile?.full_name || "User"}</strong> {t("from all Majlis channels?", "من جميع قنوات المجلس؟")}
          </p>
          <Input
            placeholder={t("Reason (optional)", "السبب (اختياري)")}
            value={banReason}
            onChange={e => setBanReason(e.target.value)}
            dir="auto"
          />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setShowBanConfirm(false)}>{t("Cancel", "إلغاء")}</Button>
            <Button variant="destructive" onClick={handleBan}>🚫 {t("Ban User", "حظر المستخدم")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

const MenuItem = ({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) => (
  <button
    onClick={onClick}
    className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-accent/50 transition-colors"
    dir="auto"
  >
    {icon}
    <span>{label}</span>
  </button>
);

export default AdminMessageMenu;
