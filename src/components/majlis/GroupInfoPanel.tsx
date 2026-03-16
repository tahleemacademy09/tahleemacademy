import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle
} from "@/components/ui/sheet";
import {
  Users, Edit2, Check, X, Crown, Shield,
  UserMinus, Camera, Calendar, Info, UserPlus
} from "lucide-react";

interface Member {
  user_id: string;
  role: string;
  joined_at: string;
  full_name: string | null;
  full_name_ar: string | null;
  avatar_url: string | null;
  level: string | null;
  student_id: string | null;
  is_online: boolean | null;
  last_seen: string | null;
}

interface GroupInfoPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channel: any;
  onUpdated?: () => void;
  onMemberTap?: (member: Member) => void;
}

const GroupInfoPanel = ({ open, onOpenChange, channel, onUpdated, onMemberTap }: GroupInfoPanelProps) => {
  const { user, hasRole } = useAuth();
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const isAdmin = hasRole("admin");
  const isTeacher = hasRole("teacher");
  const canEdit = isAdmin || isTeacher;

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editNameAr, setEditNameAr] = useState("");
  const [iconUrl, setIconUrl] = useState("");
  const [allStudents, setAllStudents] = useState<any[]>([]);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [searchAdd, setSearchAdd] = useState("");

  useEffect(() => {
    if (!open || !channel) return;
    setEditName(channel.name || "");
    setEditDesc(channel.description || "");
    setEditNameAr(channel.name_ar || "");
    setIconUrl(channel.avatar || "");
    loadMembers();
  }, [open, channel]);

  const loadMembers = async () => {
    if (!channel) return;
    setLoading(true);
    const { data: memberRows } = await supabase
      .from("chat_members" as any)
      .select("user_id, role, joined_at, is_online, last_seen")
      .eq("channel_id", channel.id);

    if (!memberRows?.length) { setLoading(false); return; }

    const userIds = memberRows.map((m: any) => m.user_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name, full_name_ar, avatar_url, level, student_id")
      .in("user_id", userIds);

    const merged = memberRows.map((m: any) => {
      const p = (profiles || []).find((pr: any) => pr.user_id === m.user_id) || {};
      return { ...m, ...p };
    });

    setMembers(merged as Member[]);
    setLoading(false);
  };

  const loadAllStudents = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("user_id, full_name, avatar_url, student_id")
      .order("full_name");
    setAllStudents(data || []);
  };

  const saveChanges = async () => {
    if (!channel) return;
    const { error } = await supabase
      .from("chat_channels" as any)
      .update({
        name: editName,
        name_ar: editNameAr,
        description: editDesc,
        avatar: iconUrl,
      })
      .eq("id", channel.id);

    if (error) {
      toast({ title: "Error saving changes", variant: "destructive" });
    } else {
      toast({ title: "Group updated successfully ✅" });
      setEditing(false);
      onUpdated?.();
    }
  };

  const removeMember = async (userId: string) => {
    await supabase
      .from("chat_members" as any)
      .delete()
      .eq("channel_id", channel.id)
      .eq("user_id", userId);
    loadMembers();
    toast({ title: "Member removed" });
  };

  const promoteToAdmin = async (userId: string) => {
    await supabase
      .from("chat_members" as any)
      .update({ role: "admin" })
      .eq("channel_id", channel.id)
      .eq("user_id", userId);
    loadMembers();
    toast({ title: "Promoted to admin ✅" });
  };

  const addMember = async (userId: string) => {
    await supabase
      .from("chat_members" as any)
      .upsert(
        { channel_id: channel.id, user_id: userId, role: "member" },
        { onConflict: "channel_id,user_id" }
      );
    loadMembers();
    toast({ title: "Member added ✅" });
  };

  const filteredStudents = allStudents.filter(s =>
    !members.find(m => m.user_id === s.user_id) &&
    (s.full_name?.toLowerCase().includes(searchAdd.toLowerCase()) ||
      s.student_id?.toLowerCase().includes(searchAdd.toLowerCase()))
  );

  const roleIcon = (role: string) => {
    if (role === "admin") return <Crown className="h-3 w-3 text-yellow-500" />;
    if (role === "moderator") return <Shield className="h-3 w-3 text-blue-500" />;
    return null;
  };

  const formatLastSeen = (lastSeen: string | null) => {
    if (!lastSeen) return "";
    const diff = Date.now() - new Date(lastSeen).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return new Date(lastSeen).toLocaleDateString();
  };

  if (!channel) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:w-96 p-0 flex flex-col">

        {/* Header */}
        <div className="p-4 flex items-center gap-3" style={{ backgroundColor: "#1a3a2a" }}>
          <button onClick={() => onOpenChange(false)} className="text-white/70 hover:text-white">
            <X className="h-5 w-5" />
          </button>
          <h2 className="text-white font-semibold flex-1">
            {t("Group Info", "معلومات المجموعة")}
          </h2>
          {canEdit && !editing && (
            <button onClick={() => setEditing(true)} className="text-white/70 hover:text-white">
              <Edit2 className="h-4 w-4" />
            </button>
          )}
          {editing && (
            <div className="flex gap-2">
              <button onClick={saveChanges} className="text-green-400 hover:text-green-300">
                <Check className="h-5 w-5" />
              </button>
              <button onClick={() => setEditing(false)} className="text-red-400 hover:text-red-300">
                <X className="h-5 w-5" />
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* Group Avatar & Name */}
          <div className="flex flex-col items-center py-6 px-4" style={{ backgroundColor: "#f5f0e8" }}>
            <div className="relative">
              <Avatar className="h-24 w-24 border-4 border-white shadow-lg">
                <AvatarImage src={iconUrl || channel.avatar} />
                <AvatarFallback style={{ backgroundColor: "#1a3a2a", color: "white", fontSize: "2rem" }}>
                  {(channel.name || "G")[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {canEdit && editing && (
                <button className="absolute bottom-0 right-0 h-8 w-8 rounded-full flex items-center justify-center text-white shadow"
                  style={{ backgroundColor: "#b8962e" }}>
                  <Camera className="h-4 w-4" />
                </button>
              )}
            </div>

            {editing ? (
              <div className="w-full mt-4 space-y-2">
                <Input value={editName} onChange={e => setEditName(e.target.value)}
                  placeholder="Group name" className="text-center font-semibold" />
                <Input value={editNameAr} onChange={e => setEditNameAr(e.target.value)}
                  placeholder="اسم المجموعة بالعربية" className="text-center" dir="rtl" />
                <Input value={editDesc} onChange={e => setEditDesc(e.target.value)}
                  placeholder="Group description..." />
              </div>
            ) : (
              <div className="text-center mt-3">
                <h3 className="text-xl font-bold" style={{ color: "#1a3a2a" }}>{channel.name}</h3>
                {channel.name_ar && (
                  <p className="text-sm text-gray-500 mt-0.5" dir="rtl">{channel.name_ar}</p>
                )}
                {channel.description && (
                  <p className="text-sm text-gray-600 mt-2 max-w-xs">{channel.description}</p>
                )}
              </div>
            )}
          </div>

          {/* Group Details */}
          <div className="px-4 py-3 border-b space-y-2">
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <Users className="h-4 w-4" style={{ color: "#1a3a2a" }} />
              <span>{members.length} {t("members", "عضو")}</span>
            </div>
            {channel.created_at && (
              <div className="flex items-center gap-3 text-sm text-gray-600">
                <Calendar className="h-4 w-4" style={{ color: "#1a3a2a" }} />
                <span>{t("Created", "أُنشئت")} {new Date(channel.created_at).toLocaleDateString()}</span>
              </div>
            )}
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <Info className="h-4 w-4" style={{ color: "#1a3a2a" }} />
              <Badge variant="outline" className="text-xs capitalize">{channel.type || "group"}</Badge>
              {channel.is_private && <Badge variant="secondary" className="text-xs">Private</Badge>}
            </div>
          </div>

          {/* Members List */}
          <div className="px-4 pt-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-sm" style={{ color: "#1a3a2a" }}>
                {t("Members", "الأعضاء")} ({members.length})
              </h4>
              {canEdit && (
                <button
                  onClick={() => { setShowAddMembers(!showAddMembers); loadAllStudents(); }}
                  className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full"
                  style={{ backgroundColor: "#1a3a2a", color: "white" }}
                >
                  <UserPlus className="h-3 w-3" />
                  {t("Add", "إضافة")}
                </button>
              )}
            </div>

            {/* Add Members Search */}
            {showAddMembers && (
              <div className="mb-4 p-3 rounded-xl border" style={{ backgroundColor: "#f5f0e8" }}>
                <Input
                  value={searchAdd}
                  onChange={e => setSearchAdd(e.target.value)}
                  placeholder={t("Search students...", "ابحث عن طالب...")}
                  className="mb-2 h-8 text-sm"
                />
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {filteredStudents.slice(0, 10).map(s => (
                    <div key={s.user_id} className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-white">
                      <Avatar className="h-7 w-7">
                        <AvatarImage src={s.avatar_url} />
                        <AvatarFallback className="text-xs" style={{ backgroundColor: "#1a3a2a", color: "white" }}>
                          {(s.full_name || "S")[0]}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs flex-1">{s.full_name || "Student"}</span>
                      <button
                        onClick={() => addMember(s.user_id)}
                        className="text-xs px-2 py-0.5 rounded-full text-white"
                        style={{ backgroundColor: "#1a3a2a" }}
                      >
                        {t("Add", "أضف")}
                      </button>
                    </div>
                  ))}
                  {filteredStudents.length === 0 && (
                    <p className="text-xs text-center text-gray-500 py-2">No students found</p>
                  )}
                </div>
              </div>
            )}

            {/* Members */}
            {loading ? (
              <p className="text-sm text-center text-gray-500 py-4">Loading...</p>
            ) : (
              <div className="space-y-1 pb-4">
                {members.map(m => (
                  <div
                    key={m.user_id}
                    className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 cursor-pointer"
                    onClick={() => onMemberTap?.(m)}
                  >
                    <div className="relative shrink-0">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={m.avatar_url || ""} />
                        <AvatarFallback style={{ backgroundColor: "#1a3a2a", color: "white" }}>
                          {(m.full_name || "S")[0]}
                        </AvatarFallback>
                      </Avatar>
                      {m.is_online && (
                        <div className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 border-2 border-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium truncate">{m.full_name || "Student"}</p>
                        {roleIcon(m.role)}
                      </div>
                      <p className="text-xs text-gray-500">
                        {m.is_online ? (
                          <span className="text-green-500">{t("Online", "متصل")}</span>
                        ) : (
                          formatLastSeen(m.last_seen)
                        )}
                      </p>
                    </div>
                    {m.student_id && (
                      <span className="text-[10px] text-gray-400">{m.student_id}</span>
                    )}
                    {canEdit && m.user_id !== user?.id && (
                      <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                        {m.role !== "admin" && (
                          <button
                            onClick={() => promoteToAdmin(m.user_id)}
                            className="p-1 rounded-full hover:bg-yellow-50"
                            title="Promote to admin"
                          >
                            <Crown className="h-3.5 w-3.5 text-yellow-500" />
                          </button>
                        )}
                        <button
                          onClick={() => removeMember(m.user_id)}
                          className="p-1 rounded-full hover:bg-red-50"
                          title="Remove member"
                        >
                          <UserMinus className="h-3.5 w-3.5 text-red-400" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default GroupInfoPanel;
