import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Search, Users, MessageCircle, X, Loader2 } from "lucide-react";
import type { UserProfile } from "./types";

interface CreateChannelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "group" | "dm" | "menu";
  onCreated: (channelId: string) => void;
}

const CreateChannelDialog = ({ open, onOpenChange, mode: initialMode, onCreated }: CreateChannelDialogProps) => {
  const { t, language } = useLanguage();
  const { user, hasRole } = useAuth();
  const { toast } = useToast();
  const [mode, setMode] = useState(initialMode);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  // Group form
  const [groupName, setGroupName] = useState("");
  const [groupNameAr, setGroupNameAr] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (!open) return;
    const loadUsers = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("profiles")
        .select("user_id, full_name, full_name_ar, avatar_url, level, email")
        .neq("user_id", user?.id || "");
      setAllUsers((data || []) as UserProfile[]);
      setLoading(false);
    };
    loadUsers();
  }, [open, user?.id]);

  const resetForm = () => {
    setGroupName("");
    setGroupNameAr("");
    setDescription("");
    setIsPrivate(false);
    setSelectedMembers([]);
    setSearch("");
  };

  const filteredUsers = allUsers.filter(u =>
    (u.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
    (u.full_name_ar || "").toLowerCase().includes(search.toLowerCase()) ||
    (u.email || "").toLowerCase().includes(search.toLowerCase())
  );

  const toggleMember = (userId: string) => {
    setSelectedMembers(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const getLevelEmoji = (level: string | null) => {
    switch (level) {
      case "beginner": return "🟢";
      case "intermediate": return "🟡";
      case "advanced": return "🔴";
      default: return "⚪";
    }
  };

  const createGroup = async () => {
    if (!groupName.trim() || !user) return;
    setCreating(true);
    try {
      const { data: channel, error } = await supabase
        .from("chat_channels" as any)
        .insert({
          name: groupName.trim(),
          name_ar: groupNameAr.trim() || null,
          description: description.trim() || null,
          type: "group",
          created_by: user.id,
          is_private: isPrivate,
          member_count: selectedMembers.length + 1,
        })
        .select()
        .single();

      if (error) throw error;

      // Add creator as admin
      const members = [
        { channel_id: (channel as any).id, user_id: user.id, role: "admin" },
        ...selectedMembers.map(uid => ({ channel_id: (channel as any).id, user_id: uid, role: "member" }))
      ];

      await supabase.from("chat_members" as any).insert(members);

      toast({ title: t("Group created!", "تم إنشاء المجموعة!") });
      onCreated((channel as any).id);
      resetForm();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: t("Error creating group", "خطأ في إنشاء المجموعة"), description: e.message, variant: "destructive" });
    }
    setCreating(false);
  };

  const createDM = async (otherUserId: string) => {
    if (!user) return;
    setCreating(true);
    try {
      // Check if DM already exists
      const { data: existingChannels } = await supabase
        .from("chat_channels" as any)
        .select("id, chat_members!inner(user_id)")
        .eq("type", "direct");

      // Find a direct channel where both users are members
      let existingDmId: string | null = null;
      if (existingChannels) {
        for (const ch of existingChannels as any[]) {
          const { data: members } = await supabase
            .from("chat_members" as any)
            .select("user_id")
            .eq("channel_id", ch.id);
          const memberIds = (members || []).map((m: any) => m.user_id);
          if (memberIds.includes(user.id) && memberIds.includes(otherUserId) && memberIds.length === 2) {
            existingDmId = ch.id;
            break;
          }
        }
      }

      if (existingDmId) {
        onCreated(existingDmId);
        onOpenChange(false);
        setCreating(false);
        return;
      }

      // Create new DM channel
      const otherUser = allUsers.find(u => u.user_id === otherUserId);
      const otherName = otherUser?.full_name || "User";
      const otherNameAr = otherUser?.full_name_ar || otherName;

      const { data: channel, error } = await supabase
        .from("chat_channels" as any)
        .insert({
          name: otherName,
          name_ar: otherNameAr,
          type: "direct",
          is_private: true,
          member_count: 2,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      await supabase.from("chat_members" as any).insert([
        { channel_id: (channel as any).id, user_id: user.id, role: "member" },
        { channel_id: (channel as any).id, user_id: otherUserId, role: "member" },
      ]);

      onCreated((channel as any).id);
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: t("Error", "خطأ"), description: e.message, variant: "destructive" });
    }
    setCreating(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
        {mode === "menu" ? (
          <>
            <DialogHeader>
              <DialogTitle dir="auto">{t("New Chat", "محادثة جديدة")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-4">
              <button
                onClick={() => setMode("group")}
                className="w-full flex items-center gap-4 p-4 rounded-xl border hover:bg-accent/50 transition-colors"
              >
                <div className="h-12 w-12 rounded-full flex items-center justify-center" style={{ backgroundColor: "#064E3B" }}>
                  <Users className="h-6 w-6 text-white" />
                </div>
                <div className="text-start">
                  <p className="font-semibold" dir="auto">{t("New Group Chat", "مجموعة جديدة")}</p>
                  <p className="text-xs text-muted-foreground" dir="auto">
                    {t("Create a group with multiple members", "أنشئ مجموعة مع عدة أعضاء")}
                  </p>
                </div>
              </button>
              <button
                onClick={() => setMode("dm")}
                className="w-full flex items-center gap-4 p-4 rounded-xl border hover:bg-accent/50 transition-colors"
              >
                <div className="h-12 w-12 rounded-full flex items-center justify-center" style={{ backgroundColor: "#25D366" }}>
                  <MessageCircle className="h-6 w-6 text-white" />
                </div>
                <div className="text-start">
                  <p className="font-semibold" dir="auto">{t("New Direct Message", "رسالة خاصة جديدة")}</p>
                  <p className="text-xs text-muted-foreground" dir="auto">
                    {t("Start a 1-on-1 conversation", "ابدأ محادثة فردية")}
                  </p>
                </div>
              </button>
            </div>
          </>
        ) : mode === "dm" ? (
          <>
            <DialogHeader>
              <DialogTitle dir="auto">{t("New Direct Message", "رسالة خاصة جديدة")}</DialogTitle>
            </DialogHeader>
            <div className="relative mb-2">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("Search by name...", "بحث بالاسم...")}
                className="ps-9"
                dir="auto"
              />
            </div>
            <ScrollArea className="flex-1 max-h-[50vh]">
              {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : filteredUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8" dir="auto">
                  {t("No users found", "لم يتم العثور على مستخدمين")}
                </p>
              ) : (
                <div className="space-y-1">
                  {filteredUsers.map(u => (
                    <button
                      key={u.user_id}
                      onClick={() => createDM(u.user_id)}
                      disabled={creating}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-accent/50 transition-colors"
                    >
                      <Avatar className="h-10 w-10">
                        {u.avatar_url && <AvatarImage src={u.avatar_url} />}
                        <AvatarFallback className="text-sm font-bold text-white" style={{ backgroundColor: "#064E3B" }}>
                          {(u.full_name || "?").charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0 text-start">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">{u.full_name || u.email}</span>
                          <span className="text-xs">{getLevelEmoji(u.level)}</span>
                        </div>
                        {u.level && (
                          <span className="text-[11px] text-muted-foreground capitalize">{u.level}</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </>
        ) : (
          // Group creation form
          <>
            <DialogHeader>
              <DialogTitle dir="auto">{t("Create Group Chat", "إنشاء مجموعة")}</DialogTitle>
            </DialogHeader>
            <ScrollArea className="flex-1 max-h-[60vh]">
              <div className="space-y-4 px-1">
                <div>
                  <Label dir="auto">{t("Group Name", "اسم المجموعة")} *</Label>
                  <Input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="e.g., Tajweed Study Group" />
                </div>
                <div>
                  <Label dir="auto">{t("Arabic Name", "الاسم بالعربية")}</Label>
                  <Input value={groupNameAr} onChange={(e) => setGroupNameAr(e.target.value)} placeholder="مثال: مجموعة دراسة التجويد" dir="rtl" />
                </div>
                <div>
                  <Label dir="auto">{t("Description", "الوصف")}</Label>
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("What is this group about?", "عن ماذا هذه المجموعة؟")} rows={2} />
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={isPrivate} onCheckedChange={setIsPrivate} />
                  <Label dir="auto">{t("Private (invite only)", "خاصة (بدعوة فقط)")}</Label>
                </div>

                {/* Member picker */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label dir="auto">{t("Add Members", "إضافة أعضاء")}</Label>
                    <Badge variant="secondary" className="text-xs">
                      {selectedMembers.length} {t("selected", "محدد")}
                    </Badge>
                  </div>
                  <div className="relative mb-2">
                    <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={t("Search members...", "بحث عن أعضاء...")}
                      className="ps-9 h-9"
                      dir="auto"
                    />
                  </div>

                  {/* Selected chips */}
                  {selectedMembers.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {selectedMembers.map(uid => {
                        const u = allUsers.find(p => p.user_id === uid);
                        return (
                          <Badge key={uid} variant="secondary" className="gap-1 text-xs py-0.5">
                            {u?.full_name || "User"}
                            <button onClick={() => toggleMember(uid)} className="ml-0.5 hover:text-destructive">
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        );
                      })}
                    </div>
                  )}

                  {/* Select all */}
                  <button
                    onClick={() => {
                      if (selectedMembers.length === filteredUsers.length) setSelectedMembers([]);
                      else setSelectedMembers(filteredUsers.map(u => u.user_id));
                    }}
                    className="text-xs text-primary hover:underline mb-2"
                  >
                    {selectedMembers.length === filteredUsers.length
                      ? t("Deselect All", "إلغاء تحديد الكل")
                      : t("Select All", "تحديد الكل")}
                  </button>

                  <div className="max-h-48 overflow-y-auto space-y-1 border rounded-lg p-1">
                    {loading ? (
                      <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
                    ) : filteredUsers.map(u => (
                      <button
                        key={u.user_id}
                        onClick={() => toggleMember(u.user_id)}
                        className={`w-full flex items-center gap-3 px-2 py-2 rounded-md hover:bg-accent/50 transition-colors ${
                          selectedMembers.includes(u.user_id) ? "bg-accent/30" : ""
                        }`}
                      >
                        <Checkbox checked={selectedMembers.includes(u.user_id)} />
                        <Avatar className="h-8 w-8">
                          {u.avatar_url && <AvatarImage src={u.avatar_url} />}
                          <AvatarFallback className="text-xs font-bold text-white" style={{ backgroundColor: "#064E3B" }}>
                            {(u.full_name || "?").charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0 text-start">
                          <span className="text-sm font-medium truncate block">{u.full_name || u.email}</span>
                        </div>
                        <span className="text-xs">{getLevelEmoji(u.level)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </ScrollArea>
            <Button
              onClick={createGroup}
              disabled={!groupName.trim() || creating}
              className="w-full mt-3 text-white"
              style={{ backgroundColor: "#064E3B" }}
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Users className="h-4 w-4 mr-2" />}
              {t("Create Group", "إنشاء المجموعة")}
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CreateChannelDialog;
