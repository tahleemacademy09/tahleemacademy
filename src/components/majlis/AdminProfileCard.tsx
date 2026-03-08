import { useState, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  MessageCircle, Eye, BarChart3, StickyNote, VolumeX,
  Ban, Settings, X
} from "lucide-react";
import type { UserProfile } from "./types";

interface AdminProfileCardProps {
  userId: string;
  open: boolean;
  onClose: () => void;
  onStartDM: (userId: string) => void;
}

const AdminProfileCard = ({ userId, open, onClose, onStartDM }: AdminProfileCardProps) => {
  const { t } = useLanguage();
  const { user, hasRole } = useAuth();
  const { toast } = useToast();
  const isAdmin = hasRole("admin");
  const [profile, setProfile] = useState<any>(null);
  const [notes, setNotes] = useState<any[]>([]);
  const [newNote, setNewNote] = useState("");
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [showMute, setShowMute] = useState(false);
  const [showBan, setShowBan] = useState(false);
  const [banReason, setBanReason] = useState("");
  const [msgCount, setMsgCount] = useState(0);

  useEffect(() => {
    if (!open || !userId) return;
    const load = async () => {
      const [profRes, notesRes, msgRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
        isAdmin ? supabase.from("majlis_admin_notes" as any).select("*").eq("user_id", userId).order("created_at", { ascending: false }) : { data: [] },
        supabase.from("chat_messages").select("id", { count: "exact", head: true }).eq("user_id", userId),
      ]);
      setProfile(profRes.data);
      setNotes(notesRes.data || []);
      setMsgCount(msgRes.count || 0);
    };
    load();
  }, [open, userId]);

  const addNote = async () => {
    if (!newNote.trim() || !user) return;
    const { data } = await supabase.from("majlis_admin_notes" as any).insert({
      admin_id: user.id,
      user_id: userId,
      note: newNote.trim(),
    }).select().single();
    if (data) setNotes(prev => [data, ...prev]);
    setNewNote("");
    setShowNoteInput(false);
    toast({ title: t("Note added", "تمت إضافة الملاحظة") });
  };

  const handleMute = async (hours: number | null) => {
    if (!user) return;
    await supabase.from("majlis_banned_users" as any).insert({
      user_id: userId,
      banned_by: user.id,
      channel_id: null,
      reason: `Muted ${hours ? hours + "h" : "permanently"} from all channels`,
      expires_at: hours ? new Date(Date.now() + hours * 3600000).toISOString() : null,
      is_permanent: !hours,
      is_active: true,
    });
    toast({ title: t("🔇 User muted from all channels", "🔇 تم كتم المستخدم من جميع القنوات") });
    setShowMute(false);
  };

  const handleBan = async () => {
    if (!user) return;
    await supabase.from("majlis_banned_users" as any).insert({
      user_id: userId,
      banned_by: user.id,
      reason: banReason || "Banned by admin",
      is_permanent: true,
      is_active: true,
    });
    await supabase.from("chat_members" as any).delete().eq("user_id", userId);
    await supabase.from("majlis_audit_log" as any).insert({
      admin_id: user.id,
      action: "ban_user",
      details: { target: userId, reason: banReason },
    });
    toast({ title: t("🚫 User banned from platform", "🚫 تم حظر المستخدم") });
    setShowBan(false);
    onClose();
  };

  const getLevelInfo = (level: string | null) => {
    switch (level) {
      case "beginner": return { emoji: "🟢", label: "Beginner", labelAr: "مبتدئ" };
      case "intermediate": return { emoji: "🟡", label: "Intermediate", labelAr: "متوسط" };
      case "advanced": return { emoji: "🔴", label: "Advanced", labelAr: "متقدم" };
      default: return { emoji: "⚪", label: "Unknown", labelAr: "غير محدد" };
    }
  };

  if (!open) return null;

  const levelInfo = getLevelInfo(profile?.level);

  return (
    <>
      <Dialog open={open} onOpenChange={v => !v && onClose()}>
        <DialogContent className="max-w-sm">
          <div className="text-center space-y-3">
            {/* Profile Photo */}
            <Avatar className="h-20 w-20 mx-auto ring-4 ring-amber-400/30">
              {profile?.avatar_url && <AvatarImage src={profile.avatar_url} />}
              <AvatarFallback className="text-2xl font-bold text-white" style={{ backgroundColor: "#064E3B" }}>
                {(profile?.full_name || "?").charAt(0)}
              </AvatarFallback>
            </Avatar>

            <div>
              <h3 className="font-bold text-lg">{profile?.full_name || "User"}</h3>
              {profile?.full_name_ar && <p className="text-sm text-muted-foreground" dir="rtl">{profile.full_name_ar}</p>}
            </div>

            <div className="flex items-center justify-center gap-3 text-sm">
              <span>{levelInfo.emoji} {t(levelInfo.label, levelInfo.labelAr)}</span>
              {profile?.enrollment_date && (
                <span className="text-muted-foreground">
                  {t("Joined", "انضم")} {new Date(profile.enrollment_date).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
                </span>
              )}
            </div>

            <div className="text-xs text-muted-foreground">
              💬 {msgCount} {t("total messages", "إجمالي الرسائل")}
            </div>

            {/* Quick Actions */}
            <div className="flex gap-2 justify-center">
              <Button size="sm" onClick={() => { onStartDM(userId); onClose(); }}>
                <MessageCircle className="h-4 w-4 me-1" />{t("Message", "رسالة")}
              </Button>
            </div>

            {/* Admin Controls */}
            {isAdmin && (
              <>
                <div className="border-t pt-3 mt-3">
                  <p className="text-xs font-bold text-muted-foreground mb-2" dir="auto">
                    ─── {t("ADMIN CONTROLS", "تحكم المشرف")} ───
                  </p>
                  <div className="grid grid-cols-1 gap-1.5">
                    <AdminAction icon={<StickyNote className="h-4 w-4" />} label={t("Add Note", "إضافة ملاحظة")} onClick={() => setShowNoteInput(!showNoteInput)} />
                    <AdminAction icon={<VolumeX className="h-4 w-4 text-amber-600" />} label={t("Mute in all channels", "كتم في جميع القنوات")} onClick={() => setShowMute(true)} />
                    <AdminAction icon={<Ban className="h-4 w-4 text-destructive" />} label={t("Ban from platform", "حظر من المنصة")} onClick={() => setShowBan(true)} />
                  </div>
                </div>

                {/* Note input */}
                {showNoteInput && (
                  <div className="space-y-2">
                    <Textarea value={newNote} onChange={e => setNewNote(e.target.value)} placeholder={t("Private admin note...", "ملاحظة خاصة...")} rows={2} dir="auto" />
                    <Button size="sm" onClick={addNote} disabled={!newNote.trim()}>{t("Save Note", "حفظ الملاحظة")}</Button>
                  </div>
                )}

                {/* Existing notes */}
                {notes.length > 0 && (
                  <div className="space-y-1.5 mt-2">
                    <p className="text-[10px] font-bold text-muted-foreground">{t("Admin Notes", "ملاحظات المشرف")}</p>
                    {notes.map((n: any) => (
                      <div key={n.id} className="text-start border rounded-lg p-2 text-xs bg-amber-50">
                        <p dir="auto">{n.note}</p>
                        <p className="text-[9px] text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Mute dialog */}
      <Dialog open={showMute} onOpenChange={setShowMute}>
        <DialogContent>
          <DialogHeader><DialogTitle dir="auto">{t("Mute User from All Channels", "كتم المستخدم من جميع القنوات")}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => handleMute(1)}>1 {t("hour", "ساعة")}</Button>
            <Button variant="outline" onClick={() => handleMute(24)}>24 {t("hours", "ساعة")}</Button>
            <Button variant="outline" onClick={() => handleMute(168)}>1 {t("week", "أسبوع")}</Button>
            <Button variant="destructive" onClick={() => handleMute(null)}>{t("Permanent", "دائم")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Ban dialog */}
      <Dialog open={showBan} onOpenChange={setShowBan}>
        <DialogContent>
          <DialogHeader><DialogTitle dir="auto">{t("Ban User from Platform", "حظر المستخدم من المنصة")}</DialogTitle></DialogHeader>
          <Input placeholder={t("Reason", "السبب")} value={banReason} onChange={e => setBanReason(e.target.value)} dir="auto" />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setShowBan(false)}>{t("Cancel", "إلغاء")}</Button>
            <Button variant="destructive" onClick={handleBan}>🚫 {t("Ban", "حظر")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

const AdminAction = ({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) => (
  <button
    onClick={onClick}
    className="flex items-center gap-3 px-3 py-2 rounded-lg border text-sm hover:bg-accent/50 transition-colors text-start"
    dir="auto"
  >
    {icon}
    <span>{label}</span>
  </button>
);

export default AdminProfileCard;
