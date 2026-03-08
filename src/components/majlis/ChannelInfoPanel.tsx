import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Users, Shield, Crown, LogOut, Trash2, UserPlus, BellOff, Bell
} from "lucide-react";
import type { ChatChannel, ChatMember, UserProfile } from "./types";

interface ChannelInfoPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channel: ChatChannel | null;
  onLeave: () => void;
  onDelete: () => void;
}

const ChannelInfoPanel = ({ open, onOpenChange, channel, onLeave, onDelete }: ChannelInfoPanelProps) => {
  const { t, language } = useLanguage();
  const { user, hasRole } = useAuth();
  const { toast } = useToast();
  const [members, setMembers] = useState<(ChatMember & { profile?: UserProfile })[]>([]);
  const [myMembership, setMyMembership] = useState<ChatMember | null>(null);
  const [isMuted, setIsMuted] = useState(false);

  const isAdmin = hasRole("admin") || hasRole("teacher");
  const isChannelAdmin = myMembership?.role === "admin";
  const canManage = isAdmin || isChannelAdmin;

  useEffect(() => {
    if (!open || !channel || !user) return;
    const load = async () => {
      const { data: memberData } = await supabase
        .from("chat_members" as any)
        .select("*")
        .eq("channel_id", channel.id);

      const memberList = (memberData || []) as unknown as ChatMember[];
      const mine = memberList.find(m => m.user_id === user.id);
      setMyMembership(mine || null);
      setIsMuted(mine?.is_muted || false);

      // Fetch profiles for all members
      const userIds = memberList.map(m => m.user_id);
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name, full_name_ar, avatar_url, level, email")
          .in("user_id", userIds);

        const profileMap: Record<string, UserProfile> = {};
        (profiles || []).forEach((p: any) => { profileMap[p.user_id] = p; });

        setMembers(memberList.map(m => ({ ...m, profile: profileMap[m.user_id] })));
      } else {
        setMembers([]);
      }
    };
    load();
  }, [open, channel?.id, user?.id]);

  const toggleMute = async () => {
    if (!myMembership) return;
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    await supabase.from("chat_members" as any).update({ is_muted: newMuted }).eq("id", myMembership.id);
  };

  const removeMember = async (memberId: string, memberUserId: string) => {
    await supabase.from("chat_members" as any).delete().eq("id", memberId);
    setMembers(prev => prev.filter(m => m.id !== memberId));
    toast({ title: t("Member removed", "تم إزالة العضو") });
  };

  const promoteMember = async (memberId: string, newRole: string) => {
    await supabase.from("chat_members" as any).update({ role: newRole }).eq("id", memberId);
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole } : m));
    toast({ title: t("Role updated", "تم تحديث الدور") });
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "admin": return <Badge className="text-[10px] px-1.5 py-0 bg-amber-500 text-white">Admin</Badge>;
      case "moderator": return <Badge className="text-[10px] px-1.5 py-0 bg-blue-500 text-white">Mod</Badge>;
      default: return null;
    }
  };

  const getLevelBadge = (level: string | null) => {
    switch (level) {
      case "beginner": return <span className="text-xs">🟢</span>;
      case "intermediate": return <span className="text-xs">🟡</span>;
      case "advanced": return <span className="text-xs">🔴</span>;
      default: return null;
    }
  };

  if (!channel) return null;

  const displayName = language === "ar" ? (channel.name_ar || channel.name) : channel.name;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-80 sm:w-96 p-0 flex flex-col">
        <SheetHeader className="p-6 pb-4 text-center">
          <Avatar className="h-20 w-20 mx-auto mb-3">
            <AvatarFallback className="text-2xl font-bold text-white" style={{ backgroundColor: "#064E3B" }}>
              {(displayName || "G").charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <SheetTitle className="text-lg" dir="auto">{displayName}</SheetTitle>
          {channel.description && (
            <p className="text-sm text-muted-foreground" dir="auto">{channel.description}</p>
          )}
          <div className="flex items-center justify-center gap-2 mt-1">
            {channel.type === "level" && channel.level && (
              <Badge variant="outline" className="capitalize text-xs">{channel.level}</Badge>
            )}
            <Badge variant="secondary" className="text-xs">
              <Users className="h-3 w-3 mr-1" />
              {members.length} {t("members", "عضو")}
            </Badge>
          </div>
        </SheetHeader>

        <Separator />

        {/* Actions */}
        <div className="px-4 py-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isMuted ? <BellOff className="h-4 w-4 text-muted-foreground" /> : <Bell className="h-4 w-4" />}
              <Label dir="auto">{t("Mute Notifications", "كتم الإشعارات")}</Label>
            </div>
            <Switch checked={isMuted} onCheckedChange={toggleMute} />
          </div>
        </div>

        <Separator />

        {/* Members */}
        <div className="px-4 py-2">
          <h3 className="text-sm font-semibold text-muted-foreground mb-2" dir="auto">
            {t("Members", "الأعضاء")} ({members.length})
          </h3>
        </div>
        <ScrollArea className="flex-1 px-4">
          <div className="space-y-1 pb-4">
            {members.map(m => (
              <div key={m.id} className="flex items-center gap-3 py-2 rounded-lg px-2 hover:bg-accent/30">
                <Avatar className="h-9 w-9">
                  {m.profile?.avatar_url && <AvatarImage src={m.profile.avatar_url} />}
                  <AvatarFallback className="text-xs font-bold text-white" style={{ backgroundColor: "#064E3B" }}>
                    {(m.profile?.full_name || "?").charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium truncate">
                      {m.profile?.full_name || "User"}
                    </span>
                    {getRoleBadge(m.role)}
                    {getLevelBadge(m.profile?.level || null)}
                    {m.user_id === user?.id && (
                      <span className="text-[10px] text-muted-foreground">{t("(You)", "(أنت)")}</span>
                    )}
                  </div>
                </div>
                {canManage && m.user_id !== user?.id && (
                  <div className="flex items-center gap-1">
                    {m.role !== "admin" && (
                      <button
                        onClick={() => promoteMember(m.id, "admin")}
                        className="p-1 rounded text-muted-foreground hover:text-amber-600"
                        title={t("Make Admin", "جعل مشرف")}
                      >
                        <Crown className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => removeMember(m.id, m.user_id)}
                      className="p-1 rounded text-muted-foreground hover:text-destructive"
                      title={t("Remove", "إزالة")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>

        <Separator />

        {/* Footer actions */}
        <div className="p-4 space-y-2">
          {channel.type !== "level" && channel.type !== "announcement" && (
            <Button
              variant="outline"
              className="w-full text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={onLeave}
            >
              <LogOut className="h-4 w-4 mr-2" />
              {t("Leave Group", "مغادرة المجموعة")}
            </Button>
          )}
          {canManage && channel.type === "group" && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-full">
                  <Trash2 className="h-4 w-4 mr-2" />
                  {t("Delete Group", "حذف المجموعة")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle dir="auto">{t("Delete this group?", "حذف هذه المجموعة؟")}</AlertDialogTitle>
                  <AlertDialogDescription dir="auto">
                    {t("This action cannot be undone. All messages will be lost.", "لا يمكن التراجع عن هذا الإجراء. سيتم فقدان جميع الرسائل.")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("Cancel", "إلغاء")}</AlertDialogCancel>
                  <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground">
                    {t("Delete", "حذف")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ChannelInfoPanel;
