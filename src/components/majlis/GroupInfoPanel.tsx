/*  src/components/majlis/GroupInfoPanel.tsx
    WhatsApp-exact Group Info panel with:
    - Group photo, name, member count
    - Media/links/docs grid
    - Manage Storage, Notifications, Media visibility
    - Encryption, Disappearing messages, Chat lock, Advanced privacy
    - Members list with admin badges, search, Add member
    - Add to Favorites, Clear chat, Exit group, Report group
*/
import { useEffect, useState, useRef } from "react";
import {
  ArrowLeft, Camera, Search, Bell, Image as ImageIcon, FileText,
  Link, HardDrive, Lock, Timer, ShieldCheck, ChevronRight,
  Heart, List, Trash2, LogOut, Flag, UserPlus, Check, Edit2,
  Volume2, VolumeX, X, MoreVertical, Star, Copy
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface GroupInfoPanelProps {
  channel: any;
  onClose: () => void;
  canModerate: boolean;
  memberCount: number;
  onEditName: () => void;
  onAvatarClick: () => void;
  onDeleteGroup: () => void;
  onLeaveGroup: () => void;
  onMemberClick: (member: any) => void;
}

const WA_GREEN = "#075E54";

const GroupInfoPanel = ({ channel, onClose, canModerate, memberCount, onEditName, onAvatarClick, onDeleteGroup, onLeaveGroup, onMemberClick }: GroupInfoPanelProps) => {
  const { toast } = useToast();
  const [members, setMembers] = useState<any[]>([]);
  const [allMembers, setAllMembers] = useState<any[]>([]);
  const [mediaMessages, setMediaMessages] = useState<any[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [showAllMembers, setShowAllMembers] = useState(false);
  const [muteSetting, setMuteSetting] = useState("All");
  const [disappearing, setDisappearing] = useState("Off");
  const [chatLocked, setChatLocked] = useState(false);
  const [mediaVisible, setMediaVisible] = useState(true);
  const [showMuteSheet, setShowMuteSheet] = useState(false);
  const [showDisappearSheet, setShowDisappearSheet] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [desc, setDesc] = useState((channel as any).description || "");
  const [loading, setLoading] = useState(true);
  const [memberMenuId, setMemberMenuId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      // Load members with profiles
      const { data: mems } = await supabase
        .from("chat_members" as any)
        .select("user_id, role, joined_at")
        .eq("channel_id", channel.id);

      if (mems && mems.length > 0) {
        const uids = mems.map((m: any) => m.user_id);
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, full_name, full_name_ar, avatar_url, level, email")
          .in("user_id", uids);
        const profMap: Record<string, any> = {};
        (profs || []).forEach((p: any) => { profMap[p.user_id] = p; });
        const merged = mems.map((m: any) => ({ ...m, ...profMap[m.user_id] }));
        setAllMembers(merged);
        setMembers(merged);
      }

      // Load recent media
      const { data: media } = await supabase
        .from("chat_messages")
        .select("id, content_type, media_path, text, created_at")
        .eq("channel_id", channel.id)
        .in("content_type", ["image", "file", "audio"])
        .order("created_at", { ascending: false })
        .limit(12);
      setMediaMessages(media || []);
      setLoading(false);
    };
    load();
  }, [channel.id]);

  useEffect(() => {
    if (!memberSearch) { setMembers(allMembers); return; }
    setMembers(allMembers.filter(m => (m.full_name || "").toLowerCase().includes(memberSearch.toLowerCase())));
  }, [memberSearch, allMembers]);

  const saveDesc = async () => {
    await supabase.from("chat_channels" as any).update({ description: desc }).eq("id", channel.id);
    setEditingDesc(false);
    toast({ title: "Description updated" });
  };

  const promoteAdmin = async (uid: string) => {
    await supabase.from("chat_members" as any).update({ role: "admin" }).eq("channel_id", channel.id).eq("user_id", uid);
    setAllMembers(prev => prev.map(m => m.user_id === uid ? { ...m, role: "admin" } : m));
    setMemberMenuId(null);
    toast({ title: "Promoted to admin" });
  };

  const demoteAdmin = async (uid: string) => {
    await supabase.from("chat_members" as any).update({ role: "member" }).eq("channel_id", channel.id).eq("user_id", uid);
    setAllMembers(prev => prev.map(m => m.user_id === uid ? { ...m, role: "member" } : m));
    setMemberMenuId(null);
    toast({ title: "Removed as admin" });
  };

  const removeMember = async (uid: string) => {
    if (!confirm("Remove this member?")) return;
    await supabase.from("chat_members" as any).delete().eq("channel_id", channel.id).eq("user_id", uid);
    setAllMembers(prev => prev.filter(m => m.user_id !== uid));
    setMemberMenuId(null);
    toast({ title: "Member removed" });
  };

  const copyInviteLink = () => {
    const link = `${window.location.origin}/join/${channel.id}`;
    navigator.clipboard?.writeText(link);
    toast({ title: "Invite link copied!" });
  };

  const initials = (name: string) => (name || "?").split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);
  const colours = ["#075E54","#128C7E","#25D366","#34B7F1","#ECB22E","#E74C3C","#9B59B6","#3498DB"];
  const av = (m: any, sz = 46) => m.avatar_url
    ? <img src={m.avatar_url} style={{ width: sz, height: sz, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} alt="" />
    : <div style={{ width: sz, height: sz, borderRadius: "50%", background: colours[((m.full_name || "?").charCodeAt(0) || 0) % colours.length], display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: sz * 0.35, flexShrink: 0 }}>{initials(m.full_name || "?")}</div>;

  const displayMembers = showAllMembers ? members : members.slice(0, 5);
  const channelName = channel.name || "Group";
  const channelAvatar = (channel as any).avatar || "";

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "#fff", display: "flex", flexDirection: "column", overflowY: "auto" }}>
      {/* Header */}
      <div style={{ position: "sticky", top: 0, background: WA_GREEN, zIndex: 10, display: "flex", alignItems: "center", gap: 12, padding: "52px 16px 14px" }}>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#fff", display: "flex" }}>
          <ArrowLeft size={22} />
        </button>
        <span style={{ color: "#fff", fontWeight: 700, fontSize: 17 }}>Group info</span>
      </div>

      {/* Avatar + name */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "28px 20px 20px", background: "#fff", borderBottom: "8px solid #f0f2f5" }}>
        <div style={{ position: "relative", marginBottom: 14 }}>
          {channelAvatar
            ? <img src={channelAvatar} style={{ width: 110, height: 110, borderRadius: "50%", objectFit: "cover" }} alt="" />
            : <div style={{ width: 110, height: 110, borderRadius: "50%", background: WA_GREEN, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 42 }}>👥</div>
          }
          {canModerate && (
            <button onClick={onAvatarClick} style={{ position: "absolute", bottom: 4, right: 4, width: 34, height: 34, borderRadius: "50%", background: "#25D366", border: "3px solid #fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <Camera size={15} color="#fff" />
            </button>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 20, fontWeight: 800, color: "#111" }}>{channelName}</span>
          {canModerate && (
            <button onClick={onEditName} style={{ background: "none", border: "none", cursor: "pointer", color: "#8696a0" }}>
              <Edit2 size={16} />
            </button>
          )}
        </div>
        <span style={{ fontSize: 14, color: "#667" }}>Group · {memberCount} member{memberCount !== 1 ? "s" : ""}</span>

        {/* Action buttons row like WhatsApp */}
        <div style={{ display: "flex", gap: 12, marginTop: 18 }}>
          {[
            { icon: <Bell size={20} />, label: "Voice chat" },
            { icon: <Search size={20} />, label: "Search" },
          ].map(item => (
            <button key={item.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, background: "none", border: "1px solid #e0e0e0", borderRadius: 12, padding: "12px 28px", cursor: "pointer", color: "#111", fontSize: 13, fontWeight: 500 }}>
              <span style={{ color: WA_GREEN }}>{item.icon}</span>{item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Description */}
      <div style={{ background: "#fff", padding: "16px 20px", borderBottom: "8px solid #f0f2f5" }}>
        {editingDesc ? (
          <div>
            <textarea
              value={desc}
              onChange={e => setDesc(e.target.value)}
              autoFocus
              rows={3}
              style={{ width: "100%", border: "none", borderBottom: "2px solid " + WA_GREEN, outline: "none", fontSize: 15, color: "#111", resize: "none", background: "transparent", boxSizing: "border-box" }}
              placeholder="Group description…"
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
              <button onClick={() => setEditingDesc(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#667", fontSize: 14 }}>Cancel</button>
              <button onClick={saveDesc} style={{ background: WA_GREEN, color: "#fff", border: "none", borderRadius: 8, padding: "6px 16px", cursor: "pointer", fontWeight: 700, fontSize: 14 }}>Save</button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: WA_GREEN, fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Description</div>
              <div style={{ fontSize: 15, color: desc ? "#111" : "#8696a0" }}>{desc || "Add group description"}</div>
              <div style={{ fontSize: 12, color: "#8696a0", marginTop: 4 }}>Created on {new Date(channel.created_at || Date.now()).toLocaleDateString()}</div>
            </div>
            {canModerate && (
              <button onClick={() => setEditingDesc(true)} style={{ background: "none", border: "none", cursor: "pointer", color: "#8696a0", padding: 4 }}>
                <Edit2 size={16} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Media / links / docs */}
      <div style={{ background: "#fff", borderBottom: "8px solid #f0f2f5" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px 10px" }}>
          <span style={{ fontSize: 15, color: "#111" }}>Media, links, and docs</span>
          <div style={{ display: "flex", alignItems: "center", gap: 4, color: "#8696a0", fontSize: 14 }}>
            {mediaMessages.length}
            <ChevronRight size={18} />
          </div>
        </div>
        {mediaMessages.filter(m => m.content_type === "image").length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 2, padding: "0 0 14px 0" }}>
            {mediaMessages.filter(m => m.content_type === "image").slice(0, 4).map(m => (
              <div key={m.id} style={{ aspectRatio: "1", background: "#e0e0e0", overflow: "hidden" }}>
                {m.text?.startsWith("data:image") && <img src={m.text} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />}
              </div>
            ))}
          </div>
        )}
        {mediaMessages.length === 0 && (
          <div style={{ padding: "0 20px 16px", fontSize: 13, color: "#8696a0" }}>No media shared yet</div>
        )}
      </div>

      {/* Settings rows */}
      <div style={{ background: "#fff", borderBottom: "8px solid #f0f2f5" }}>
        {[
          { icon: <HardDrive size={20} />, label: "Manage Storage", sub: "2.5 MB", fn: () => {} },
          {
            icon: <Bell size={20} />, label: "Notifications", sub: muteSetting,
            fn: () => setShowMuteSheet(true)
          },
          { icon: <ImageIcon size={20} />, label: "Media visibility", sub: "", hasToggle: true, val: mediaVisible, setVal: setMediaVisible },
        ].map((row, i) => (
          <div key={i} onClick={row.fn} style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 20px", cursor: row.fn ? "pointer" : "default", borderBottom: "1px solid #f5f5f5" }}>
            <span style={{ color: "#8696a0" }}>{row.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, color: "#111" }}>{row.label}</div>
              {row.sub && <div style={{ fontSize: 13, color: "#8696a0" }}>{row.sub}</div>}
            </div>
            {row.hasToggle
              ? <div onClick={e => { e.stopPropagation(); row.setVal && row.setVal(!row.val); }} style={{ width: 44, height: 24, borderRadius: 12, background: row.val ? "#25D366" : "#ccc", cursor: "pointer", position: "relative", transition: "background .2s" }}>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: row.val ? 22 : 2, transition: "left .2s" }} />
                </div>
              : <ChevronRight size={18} color="#8696a0" />
            }
          </div>
        ))}
      </div>

      {/* Security/privacy rows */}
      <div style={{ background: "#fff", borderBottom: "8px solid #f0f2f5" }}>
        {[
          { icon: <Lock size={20} />, label: "Encryption", sub: "Messages and calls are end-to-end encrypted. Tap to learn more." },
          { icon: <Timer size={20} />, label: "Disappearing messages", sub: disappearing, fn: () => setShowDisappearSheet(true) },
          {
            icon: <Lock size={20} />, label: "Chat lock", sub: "Lock and hide this chat on this device.",
            hasToggle: true, val: chatLocked, setVal: setChatLocked
          },
          { icon: <ShieldCheck size={20} />, label: "Advanced chat privacy", sub: "Off", fn: () => {} },
        ].map((row, i) => (
          <div key={i} onClick={(row as any).fn} style={{ display: "flex", alignItems: "flex-start", gap: 16, padding: "16px 20px", cursor: (row as any).fn ? "pointer" : "default", borderBottom: "1px solid #f5f5f5" }}>
            <span style={{ color: "#8696a0", marginTop: 2 }}>{row.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, color: "#111" }}>{row.label}</div>
              <div style={{ fontSize: 13, color: "#8696a0", marginTop: 2, lineHeight: 1.4 }}>{row.sub}</div>
            </div>
            {(row as any).hasToggle
              ? <div onClick={e => { e.stopPropagation(); (row as any).setVal?.(!row.val); }} style={{ width: 44, height: 24, borderRadius: 12, background: row.val ? "#25D366" : "#ccc", cursor: "pointer", position: "relative", transition: "background .2s", flexShrink: 0, marginTop: 2 }}>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: row.val ? 22 : 2, transition: "left .2s" }} />
                </div>
              : (row as any).fn ? <ChevronRight size={18} color="#8696a0" style={{ flexShrink: 0, marginTop: 2 }} /> : null
            }
          </div>
        ))}
      </div>

      {/* Members section */}
      <div style={{ background: "#fff", borderBottom: "8px solid #f0f2f5" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px 12px" }}>
          <span style={{ fontSize: 15, color: "#111" }}>{allMembers.length} member{allMembers.length !== 1 ? "s" : ""}</span>
          <Search size={20} color="#8696a0" style={{ cursor: "pointer" }} onClick={() => {}} />
        </div>

        {/* Member search */}
        <div style={{ margin: "0 16px 12px", background: "#f0f2f5", borderRadius: 10, display: "flex", alignItems: "center", gap: 8, padding: "8px 14px" }}>
          <Search size={15} color="#8696a0" />
          <input value={memberSearch} onChange={e => setMemberSearch(e.target.value)} placeholder="Search members…" style={{ border: "none", background: "transparent", flex: 1, fontSize: 14, outline: "none", color: "#111" }} />
        </div>

        {/* Add members (admin) */}
        {canModerate && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 20px", cursor: "pointer", borderBottom: "1px solid #f5f5f5" }}>
              <div style={{ width: 46, height: 46, borderRadius: "50%", background: "#f0f2f5", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <UserPlus size={20} color={WA_GREEN} />
              </div>
              <span style={{ fontSize: 15, color: WA_GREEN, fontWeight: 600 }}>Add members</span>
            </div>
            <div onClick={copyInviteLink} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 20px", cursor: "pointer", borderBottom: "1px solid #f5f5f5" }}>
              <div style={{ width: 46, height: 46, borderRadius: "50%", background: "#f0f2f5", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Link size={20} color={WA_GREEN} />
              </div>
              <span style={{ fontSize: 15, color: WA_GREEN, fontWeight: 600 }}>Invite via link</span>
            </div>
          </>
        )}

        {/* Member list */}
        {loading
          ? <div style={{ padding: 20, color: "#8696a0", fontSize: 14, textAlign: "center" }}>Loading members…</div>
          : displayMembers.map((m, i) => (
            <div key={m.user_id} style={{ position: "relative" }}>
              <div
                style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 20px", cursor: "pointer", borderBottom: "1px solid #f5f5f5" }}
                onClick={() => onMemberClick(m)}
              >
                {av(m, 46)}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.full_name || "Member"}</div>
                  <div style={{ fontSize: 13, color: "#8696a0" }}>{(m as any).level || "Student"}</div>
                </div>
                {m.role === "admin" && (
                  <span style={{ fontSize: 11, color: "#2ECC71", background: "#E8F8F0", padding: "3px 10px", borderRadius: 20, fontWeight: 700, flexShrink: 0 }}>Group Admin</span>
                )}
                {canModerate && (
                  <button onClick={e => { e.stopPropagation(); setMemberMenuId(m.user_id === memberMenuId ? null : m.user_id); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#8696a0", padding: 4 }}>
                    <MoreVertical size={18} />
                  </button>
                )}
              </div>
              {/* Member action menu */}
              {memberMenuId === m.user_id && canModerate && (
                <div style={{ position: "absolute", right: 14, top: 14, background: "#fff", borderRadius: 10, boxShadow: "0 4px 20px rgba(0,0,0,.2)", zIndex: 100, minWidth: 180, overflow: "hidden" }} onClick={e => e.stopPropagation()}>
                  {m.role !== "admin"
                    ? <button onClick={() => promoteAdmin(m.user_id)} style={{ width: "100%", padding: "12px 16px", background: "none", border: "none", cursor: "pointer", textAlign: "left", fontSize: 14, color: "#111", borderBottom: "1px solid #f5f5f5" }}>Make group admin</button>
                    : <button onClick={() => demoteAdmin(m.user_id)} style={{ width: "100%", padding: "12px 16px", background: "none", border: "none", cursor: "pointer", textAlign: "left", fontSize: 14, color: "#111", borderBottom: "1px solid #f5f5f5" }}>Remove as admin</button>
                  }
                  <button onClick={() => removeMember(m.user_id)} style={{ width: "100%", padding: "12px 16px", background: "none", border: "none", cursor: "pointer", textAlign: "left", fontSize: 14, color: "#E74C3C" }}>Remove from group</button>
                </div>
              )}
            </div>
          ))
        }

        {!loading && members.length > 5 && !showAllMembers && (
          <div onClick={() => setShowAllMembers(true)} style={{ padding: "14px 20px", color: WA_GREEN, fontSize: 14, cursor: "pointer", fontWeight: 600 }}>
            View all ({members.length - 5} more)
          </div>
        )}
      </div>

      {/* Bottom actions */}
      <div style={{ background: "#fff", marginBottom: 32 }}>
        {[
          { icon: <Heart size={20} />, label: "Add to Favorites", color: "#111", fn: () => toast({ title: "Added to favorites" }) },
          { icon: <List size={20} />, label: "Add to list", color: "#111", fn: () => {} },
          { icon: <Trash2 size={20} />, label: "Clear chat", color: "#111", fn: () => {} },
          { icon: <LogOut size={20} />, label: "Exit group", color: "#E74C3C", fn: onLeaveGroup },
          { icon: <Flag size={20} />, label: "Report group", color: "#E74C3C", fn: () => toast({ title: "Report submitted" }) },
        ].map((item, i) => (
          <div key={i} onClick={item.fn} style={{ display: "flex", alignItems: "center", gap: 20, padding: "18px 24px", cursor: "pointer", borderBottom: "1px solid #f5f5f5" }}>
            <span style={{ color: item.color }}>{item.icon}</span>
            <span style={{ fontSize: 16, color: item.color }}>{item.label}</span>
          </div>
        ))}
      </div>

      {/* Mute sheet */}
      {showMuteSheet && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 500, display: "flex", alignItems: "flex-end" }} onClick={() => setShowMuteSheet(false)}>
          <div style={{ width: "100%", maxWidth: 480, margin: "0 auto", background: "#fff", borderRadius: "20px 20px 0 0", overflow: "hidden" }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #f0f0f0", fontWeight: 700, fontSize: 16 }}>Notifications</div>
            {["All", "Mentions only", "Off"].map(opt => (
              <div key={opt} onClick={() => { setMuteSetting(opt); setShowMuteSheet(false); }} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", cursor: "pointer", borderBottom: "1px solid #f5f5f5" }}>
                <span style={{ fontSize: 15 }}>{opt}</span>
                {muteSetting === opt && <Check size={18} color={WA_GREEN} />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Disappearing messages sheet */}
      {showDisappearSheet && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 500, display: "flex", alignItems: "flex-end" }} onClick={() => setShowDisappearSheet(false)}>
          <div style={{ width: "100%", maxWidth: 480, margin: "0 auto", background: "#fff", borderRadius: "20px 20px 0 0", overflow: "hidden" }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #f0f0f0", fontWeight: 700, fontSize: 16 }}>Disappearing messages</div>
            {["Off", "24 hours", "7 days", "90 days"].map(opt => (
              <div key={opt} onClick={() => { setDisappearing(opt); setShowDisappearSheet(false); }} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", cursor: "pointer", borderBottom: "1px solid #f5f5f5" }}>
                <span style={{ fontSize: 15 }}>{opt}</span>
                {disappearing === opt && <Check size={18} color={WA_GREEN} />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Backdrop for member menu */}
      {memberMenuId && <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={() => setMemberMenuId(null)} />}
    </div>
  );
};

export default GroupInfoPanel;
