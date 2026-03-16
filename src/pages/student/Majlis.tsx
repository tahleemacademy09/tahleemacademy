import { useEffect, useState, useRef } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Send, MessageCircle, Reply, CheckCheck, Mic, MicOff,
  Image, Paperclip, Smile, ArrowLeft, FileText, Trash2, Info,
  X, Pin, Search, Star, Ban, Volume2, VolumeX, MoreVertical,
  Copy, Lock, Plus, Megaphone, AlertTriangle, Camera
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import MajlisSidebar from "@/components/majlis/MajlisSidebar";
import CreateChannelDialog from "@/components/majlis/CreateChannelDialog";
import BrowseChannelsDialog from "@/components/majlis/BrowseChannelsDialog";
import GroupInfoPanel from "@/components/majlis/GroupInfoPanel";
import StudentProfileSheet from "@/components/majlis/StudentProfileSheet";
import MessageReactions from "@/components/majlis/MessageReactions";
import type { ChatChannel, ChatMessage, UserProfile } from "@/components/majlis/types";

interface MajlisProps {
  adminMode?: boolean;
  onBroadcast?: () => void;
  onCreateChannel?: () => void;
}

const Majlis = ({ adminMode = false, onBroadcast, onCreateChannel }: MajlisProps) => {
  const { t, language } = useLanguage();
  const { user, profile, hasRole } = useAuth();
  const { toast } = useToast();

  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [reactions, setReactions] = useState<Record<string, Record<string, string[]>>>({});
  const [pinnedMessages, setPinnedMessages] = useState<ChatMessage[]>([]);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [starredMessages, setStarredMessages] = useState<Set<string>>(new Set());
  const [mutedMembers, setMutedMembers] = useState<Set<string>>(new Set());
  const [channelLocked, setChannelLocked] = useState(false);

  const [input, setInput] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showBrowseChannels, setShowBrowseChannels] = useState(false);
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [showStudentProfile, setShowStudentProfile] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showMessageMenu, setShowMessageMenu] = useState<string | null>(null);
  const [showDeleteOptions, setShowDeleteOptions] = useState<string | null>(null);
  const [showPinnedBar, setShowPinnedBar] = useState(true);
  const [showEmojiBar, setShowEmojiBar] = useState(false);
  const [editingChannel, setEditingChannel] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const recordingTimerRef = useRef<any>(null);
  const typingTimerRef = useRef<any>(null);

  const isAdmin = hasRole("admin");
  const isTeacher = hasRole("teacher");
  const canModerate = isAdmin || isTeacher || adminMode;
  const activeChannel = channels.find(c => c.id === activeChannelId) || null;

  useEffect(() => {
    if (!user) return;
    const loadChannels = async () => {
      const { data: memberData } = await supabase.from("chat_members" as any).select("channel_id").eq("user_id", user.id);
      const channelIds = (memberData || []).map((m: any) => m.channel_id);
      const { data: publicChannels } = await supabase.from("chat_channels" as any).select("*").eq("is_private", false);
      const { data: memberChannels } = channelIds.length > 0 ? await supabase.from("chat_channels" as any).select("*").in("id", channelIds) : { data: [] };
      const allChannels = [...(memberChannels || []), ...(publicChannels || [])];
      const unique = Array.from(new Map(allChannels.map((c: any) => [c.id, c])).values()) as unknown as ChatChannel[];
      setChannels(unique);
      await autoJoinLevelChannel(user.id, profile?.level);
      await autoJoinDefaultChannels(user.id, unique);
      if (!activeChannelId && unique.length > 0) setActiveChannelId(unique[0].id);
    };
    loadChannels();
  }, [user, profile?.level]);

  const autoJoinLevelChannel = async (userId: string, level: string | null) => {
    if (!level) return;
    const { data: lc } = await supabase.from("chat_channels" as any).select("id").eq("type", "level").eq("level", level);
    for (const ch of (lc || []) as any[]) await supabase.from("chat_members" as any).upsert({ channel_id: ch.id, user_id: userId, role: "member" }, { onConflict: "channel_id,user_id" });
  };

  const autoJoinDefaultChannels = async (userId: string, all: ChatChannel[]) => {
    const defaults = all.filter(c => (c.type === "group" && c.name === "General") || c.type === "announcement");
    for (const ch of defaults) await supabase.from("chat_members" as any).upsert({ channel_id: ch.id, user_id: userId, role: "member" }, { onConflict: "channel_id,user_id" });
  };

  useEffect(() => {
    if (!activeChannelId) return;
    const load = async () => {
      const { data } = await supabase.from("chat_messages").select("*").eq("channel_id", activeChannelId).order("created_at", { ascending: true }).limit(200);
      setMessages((data as unknown as ChatMessage[]) || []);
      const userIds = [...new Set((data || []).map((m: any) => m.user_id))];
      if (userIds.length > 0) {
        const { data: profs } = await supabase.from("profiles").select("user_id, full_name, full_name_ar, avatar_url, level, email, student_id").in("user_id", userIds);
        const map: Record<string, UserProfile> = {};
        (profs || []).forEach((p: any) => { map[p.user_id] = p as UserProfile; });
        setProfiles(prev => ({ ...prev, ...map }));
      }
      if (user) await supabase.from("chat_members" as any).update({ last_read_at: new Date().toISOString() }).eq("channel_id", activeChannelId).eq("user_id", user.id);
      const msgIds = (data || []).map((m: any) => m.id);
      if (msgIds.length > 0) {
        const { data: rd } = await supabase.from("message_reactions" as any).select("message_id, user_id, emoji").in("message_id", msgIds);
        const rm: Record<string, Record<string, string[]>> = {};
        (rd || []).forEach((r: any) => { if (!rm[r.message_id]) rm[r.message_id] = {}; if (!rm[r.message_id][r.emoji]) rm[r.message_id][r.emoji] = []; rm[r.message_id][r.emoji].push(r.user_id); });
        setReactions(rm);
      }
      setPinnedMessages((data || []).filter((m: any) => m.is_pinned) as unknown as ChatMessage[]);
    };
    load();
    const ch = supabase.channel(`majlis-${activeChannelId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages", filter: `channel_id=eq.${activeChannelId}` }, (payload) => {
        if (payload.eventType === "INSERT") {
          const nm = payload.new as unknown as ChatMessage;
          setMessages(prev => [...prev, nm]);
          if (!profiles[nm.user_id]) supabase.from("profiles").select("user_id, full_name, full_name_ar, avatar_url, level, email, student_id").eq("user_id", nm.user_id).maybeSingle().then(({ data }) => { if (data) setProfiles(prev => ({ ...prev, [data.user_id]: data as unknown as UserProfile })); });
        } else if (payload.eventType === "UPDATE") {
          setMessages(prev => prev.map(m => m.id === (payload.new as any).id ? payload.new as unknown as ChatMessage : m));
        } else if (payload.eventType === "DELETE") {
          setMessages(prev => prev.filter(m => m.id !== (payload.old as any).id));
        }
      })
      .on("broadcast", { event: "typing" }, (p) => {
        if (p.payload.userId !== user?.id) { setTypingUsers(prev => [...new Set([...prev, p.payload.name])]); clearTimeout(typingTimerRef.current); typingTimerRef.current = setTimeout(() => setTypingUsers([]), 3000); }
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeChannelId]);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages]);

  const reloadReactions = async () => {
    if (!messages.length) return;
    const msgIds = messages.map(m => m.id);
    const { data: rd } = await supabase.from("message_reactions" as any).select("message_id, user_id, emoji").in("message_id", msgIds);
    const rm: Record<string, Record<string, string[]>> = {};
    (rd || []).forEach((r: any) => { if (!rm[r.message_id]) rm[r.message_id] = {}; if (!rm[r.message_id][r.emoji]) rm[r.message_id][r.emoji] = []; rm[r.message_id][r.emoji].push(r.user_id); });
    setReactions(rm);
  };

  const handleTyping = () => { if (!activeChannelId || !user) return; supabase.channel(`majlis-${activeChannelId}`).send({ type: "broadcast", event: "typing", payload: { userId: user.id, name: profile?.full_name || "Someone" } }); };

  const sendMessage = async (contentType = "text", mediaPath?: string) => {
    if (!user || !activeChannelId) return;
    if (contentType === "text" && !input.trim() && !mediaPath) return;
    if (channelLocked && !canModerate) { toast({ title: "Channel is locked", variant: "destructive" }); return; }
    if (activeChannel?.type === "announcement" && !canModerate) { toast({ title: "Only admins can post here", variant: "destructive" }); return; }
    const text = input.trim();
    setInput(""); setReplyTo(null); setShowEmojiBar(false);
    const msgData: any = { class_level_id: activeChannelId, channel_id: activeChannelId, user_id: user.id, content_type: contentType, text: contentType === "text" ? text : (text || null), media_path: mediaPath || null };
    if (replyTo) { msgData.reply_to_id = replyTo.id; msgData.reply_preview = (replyTo.text || "").slice(0, 100); }
    const { error } = await supabase.from("chat_messages").insert(msgData as any);
    if (error) toast({ title: "Error sending", variant: "destructive" });
    else await supabase.from("chat_channels" as any).update({ last_message: contentType === "text" ? text.slice(0, 100) : `${contentType}`, last_message_at: new Date().toISOString() }).eq("id", activeChannelId);
    inputRef.current?.focus();
  };

  const deleteForMe = (msgId: string) => { setMessages(prev => prev.filter(m => m.id !== msgId)); setShowDeleteOptions(null); setShowMessageMenu(null); toast({ title: "Deleted for you" }); };
  const deleteForEveryone = async (msgId: string) => { await supabase.from("chat_messages").delete().eq("id", msgId); setMessages(prev => prev.filter(m => m.id !== msgId)); setShowDeleteOptions(null); setShowMessageMenu(null); toast({ title: "Deleted for everyone" }); };
  const pinMessage = async (msg: ChatMessage) => {
    const ip = !msg.is_pinned;
    await supabase.from("chat_messages").update({ is_pinned: ip } as any).eq("id", msg.id);
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, is_pinned: ip } : m));
    setPinnedMessages(prev => ip ? [...prev, msg] : prev.filter(m => m.id !== msg.id));
    setShowMessageMenu(null);
    toast({ title: ip ? "Pinned" : "Unpinned" });
  };
  const starMessage = (msgId: string) => { setStarredMessages(prev => { const n = new Set(prev); n.has(msgId) ? n.delete(msgId) : n.add(msgId); return n; }); setShowMessageMenu(null); };
  const copyMessage = (text: string) => { navigator.clipboard?.writeText(text); setShowMessageMenu(null); toast({ title: "Copied!" }); };
  const muteMember = async (userId: string) => {
    const im = !mutedMembers.has(userId);
    im ? setMutedMembers(prev => new Set([...prev, userId])) : setMutedMembers(prev => { const n = new Set(prev); n.delete(userId); return n; });
    await supabase.from("chat_members" as any).update({ role: im ? "muted" : "member" }).eq("channel_id", activeChannelId).eq("user_id", userId);
    toast({ title: im ? "Muted" : "Unmuted" });
  };
  const banMember = async (userId: string) => {
    await supabase.from("chat_members" as any).delete().eq("channel_id", activeChannelId).eq("user_id", userId);
    setMessages(prev => prev.filter(m => m.user_id !== userId));
    toast({ title: "Banned" });
  };

  const saveChannelEdit = async () => {
    if (!activeChannelId) return;
    await supabase.from("chat_channels" as any).update({ name: editName, description: editDesc }).eq("id", activeChannelId);
    setChannels(prev => prev.map(c => c.id === activeChannelId ? { ...c, name: editName, description: editDesc } : c));
    setEditingChannel(false);
    toast({ title: "Group updated!" });
  };

  const deleteGroup = async () => {
    if (!activeChannelId || !canModerate) return;
    if (!confirm("Delete this group permanently?")) return;
    await supabase.from("chat_messages").delete().eq("channel_id", activeChannelId);
    await supabase.from("chat_members" as any).delete().eq("channel_id", activeChannelId);
    await supabase.from("chat_channels" as any).delete().eq("id", activeChannelId);
    setChannels(prev => prev.filter(c => c.id !== activeChannelId));
    setActiveChannelId(channels[0]?.id || null);
    toast({ title: "Group deleted" });
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach(t => t.stop());
        clearInterval(recordingTimerRef.current); setRecordingTime(0);
        const path = `voice/${activeChannelId}/${user!.id}/${crypto.randomUUID()}.webm`;
        const { error } = await supabase.storage.from("majlis-media").upload(path, blob);
        if (!error) await sendMessage("audio", path);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      recordingTimerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch { toast({ title: "Microphone denied", variant: "destructive" }); }
  };
  const stopRecording = () => { mediaRecorderRef.current?.stop(); setIsRecording(false); };

  const handleFileUpload = async (file: File, type: "image" | "file") => {
    const path = `${type}s/${activeChannelId}/${user!.id}/${crypto.randomUUID()}-${file.name}`;
    const { error } = await supabase.storage.from("majlis-media").upload(path, file);
    if (!error) await sendMessage(type, path);
    else toast({ title: "Upload failed", variant: "destructive" });
  };

  const handleAvatarUpload = async (file: File) => {
    if (!activeChannelId || !canModerate) return;
    const path = `avatars/${activeChannelId}/${crypto.randomUUID()}-${file.name}`;
    const { error } = await supabase.storage.from("majlis-media").upload(path, file, { upsert: true });
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from("majlis-media").getPublicUrl(path);
      await supabase.from("chat_channels" as any).update({ avatar: publicUrl }).eq("id", activeChannelId);
      setChannels(prev => prev.map(c => c.id === activeChannelId ? { ...c, avatar: publicUrl } : c));
      toast({ title: "Group photo updated!" });
    }
  };

  const selectChannel = (id: string) => { setActiveChannelId(id); setMobileShowChat(true); setEditingChannel(false); };
  const handleChannelCreated = async (id: string) => {
    const { data } = await supabase.from("chat_channels" as any).select("*").eq("id", id).single();
    if (data) setChannels(prev => prev.find(c => c.id === id) ? prev : [data as unknown as ChatChannel, ...prev]);
    setActiveChannelId(id); setMobileShowChat(true);
  };
  const handleLeaveChannel = async () => {
    if (!activeChannelId || !user) return;
    await supabase.from("chat_members" as any).delete().eq("channel_id", activeChannelId).eq("user_id", user.id);
    setChannels(prev => prev.filter(c => c.id !== activeChannelId));
    setActiveChannelId(channels[0]?.id || null);
  };

  const ft = (d: string) => new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const fr = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  const getCN = (ch: ChatChannel) => language === "ar" ? (ch.name_ar || ch.name || "") : (ch.name || "");
  const canSend = () => { if (!activeChannel || (channelLocked && !canModerate)) return false; if (activeChannel.type === "announcement") return canModerate; return true; };
  const filteredMessages = searchQuery ? messages.filter(m => (m.text || "").toLowerCase().includes(searchQuery.toLowerCase())) : messages;

  const AudioMessage = ({ path }: { path: string }) => {
    const [url, setUrl] = useState<string | null>(null);
    useEffect(() => { supabase.storage.from("majlis-media").createSignedUrl(path, 3600).then(({ data }) => { if (data?.signedUrl) setUrl(data.signedUrl); }); }, [path]);
    if (!url) return <span className="text-xs opacity-60">Loading...</span>;
    return <div className="flex items-center gap-2 min-w-[170px]"><div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: "#1a3a2a" }}><Mic className="h-3.5 w-3.5 text-white" /></div><audio controls src={url} className="h-7 flex-1" style={{ maxWidth: "160px" }} /></div>;
  };

  const ImageMsg = ({ path }: { path: string }) => {
    const [url, setUrl] = useState<string | null>(null);
    useEffect(() => { supabase.storage.from("majlis-media").createSignedUrl(path, 3600).then(({ data }) => { if (data?.signedUrl) setUrl(data.signedUrl); }); }, [path]);
    return url ? <img src={url} className="max-w-[200px] rounded-xl cursor-pointer" alt="" loading="lazy" onClick={() => window.open(url, "_blank")} /> : <span className="text-xs opacity-60">Loading...</span>;
  };

  const FileMsg = ({ path, text }: { path: string; text: string | null }) => {
    const open = async () => { const { data } = await supabase.storage.from("majlis-media").createSignedUrl(path, 300); if (data?.signedUrl) window.open(data.signedUrl, "_blank"); };
    return <button onClick={open} className="flex items-center gap-2 hover:opacity-80"><div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center"><FileText className="h-3.5 w-3.5" /></div><span className="text-xs underline">{text || path.split("/").pop()}</span></button>;
  };

  const MsgBubble = ({ m, idx }: { m: ChatMessage; idx: number }) => {
    const isMe = m.user_id === user?.id;
    const sp = profiles[m.user_id];
    const name = sp?.full_name || (isMe ? profile?.full_name : "Student");
    const prev = messages[idx - 1];
    const showAv = !isMe && (!prev || prev.user_id !== m.user_id);
    const mr = reactions[m.id] || {};
    const isStar = starredMessages.has(m.id);
    const rMsg = m.reply_to_id ? messages.find(x => x.id === m.reply_to_id) : null;
    const hl = searchQuery && (m.text || "").toLowerCase().includes(searchQuery.toLowerCase());
    const canDel = isMe || canModerate;

    return (
      <div className={`flex group ${isMe ? "justify-end" : "justify-start"} mb-0.5`}>
        {!isMe && (
          <div className="w-8 shrink-0 self-end mb-1 mr-1">
            {showAv && (
              <button onClick={() => { setSelectedMember({ user_id: m.user_id, full_name: sp?.full_name || null, avatar_url: sp?.avatar_url || null, level: sp?.level || null, student_id: (sp as any)?.student_id || null, is_online: false, last_seen: null }); setShowStudentProfile(true); }}>
                <Avatar className="h-7 w-7"><AvatarImage src={sp?.avatar_url || ""} /><AvatarFallback style={{ backgroundColor: "#1a3a2a", color: "white", fontSize: "0.6rem" }}>{(name || "S")[0]}</AvatarFallback></Avatar>
              </button>
            )}
          </div>
        )}
        <div className={`flex flex-col max-w-[74%] ${isMe ? "items-end" : "items-start"}`}>
          <div className={`relative px-3 py-1.5 rounded-2xl shadow-sm ${isMe ? "rounded-tr-none" : "rounded-tl-none"} ${hl ? "ring-2 ring-yellow-400" : ""}`} style={{ backgroundColor: isMe ? "#DCF8C6" : "#FFFFFF", marginTop: showAv ? "5px" : "1px" }}>
            {m.is_pinned && <div className="flex items-center gap-1 mb-0.5"><Pin className="h-2.5 w-2.5 text-amber-500" /><span className="text-[8px] text-amber-500">Pinned</span></div>}
            {showAv && !isMe && <p className="text-[10px] font-semibold mb-0.5" style={{ color: "#1a3a2a" }}>{name}</p>}
            {rMsg && <div className="mb-1 px-2 py-0.5 rounded border-l-2 border-primary/40 bg-black/5"><p className="text-[9px] font-semibold opacity-60">{profiles[rMsg.user_id]?.full_name}</p><p className="text-[10px] opacity-50 truncate">{rMsg.text}</p></div>}
            <div className="text-sm text-gray-900" dir="auto">
              {m.content_type === "audio" && m.media_path ? <AudioMessage path={m.media_path} />
                : m.content_type === "image" && m.media_path ? <ImageMsg path={m.media_path} />
                : m.content_type === "file" && m.media_path ? <FileMsg path={m.media_path} text={m.text} />
                : <span className="whitespace-pre-wrap break-words">{m.text}</span>}
            </div>
            <div className="flex items-center gap-1 mt-0.5 justify-end">
              {isStar && <Star className="h-2.5 w-2.5 text-amber-400 fill-amber-400" />}
              <span className="text-[9px] text-gray-400">{ft(m.created_at)}</span>
              {isMe && <CheckCheck className="h-3 w-3" style={{ color: "#53BDEB" }} />}
            </div>
            {/* Hover actions */}
            <div className={`absolute -top-7 ${isMe ? "right-0" : "left-0"} opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5 bg-white rounded-full shadow-lg border px-1.5 py-0.5 z-10`}>
              {["❤️", "👍", "😂", "🤲"].map(e => (
                <button key={e} className="text-sm hover:scale-125 transition-transform" onClick={async (ev) => { ev.stopPropagation(); await supabase.from("message_reactions" as any).upsert({ message_id: m.id, user_id: user?.id, emoji: e }); reloadReactions(); }}>{e}</button>
              ))}
              <button onClick={(ev) => { ev.stopPropagation(); setReplyTo(m); inputRef.current?.focus(); }} className="p-1 text-gray-500 border-l ml-1 pl-1"><Reply className="h-3 w-3" /></button>
              <button onClick={(ev) => { ev.stopPropagation(); setShowMessageMenu(sm => sm === m.id ? null : m.id); setShowDeleteOptions(null); }} className="p-1 text-gray-500"><MoreVertical className="h-3 w-3" /></button>
            </div>
            {/* Context menu */}
            {showMessageMenu === m.id && (
              <div className={`absolute top-7 ${isMe ? "right-0" : "left-0"} bg-white rounded-2xl shadow-2xl border z-50 min-w-[170px] overflow-hidden`} onClick={e => e.stopPropagation()}>
                <button onClick={() => copyMessage(m.text || "")} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-gray-50 text-sm"><Copy className="h-3.5 w-3.5 text-gray-400" />Copy</button>
                <button onClick={() => { setReplyTo(m); setShowMessageMenu(null); inputRef.current?.focus(); }} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-gray-50 text-sm"><Reply className="h-3.5 w-3.5 text-gray-400" />Reply</button>
                <button onClick={() => starMessage(m.id)} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-gray-50 text-sm"><Star className={`h-3.5 w-3.5 ${isStar ? "text-amber-400 fill-amber-400" : "text-gray-400"}`} />{isStar ? "Unstar" : "Star"}</button>
                {canModerate && <button onClick={() => pinMessage(m)} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-gray-50 text-sm"><Pin className="h-3.5 w-3.5 text-blue-400" />{m.is_pinned ? "Unpin" : "Pin"}</button>}
                {canDel && <><div className="border-t" /><button onClick={() => { setShowDeleteOptions(m.id); setShowMessageMenu(null); }} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-red-50 text-sm text-red-500"><Trash2 className="h-3.5 w-3.5" />Delete →</button></>}
                {canModerate && !isMe && <><div className="border-t" /><button onClick={() => muteMember(m.user_id)} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-orange-50 text-sm text-orange-500">{mutedMembers.has(m.user_id) ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}{mutedMembers.has(m.user_id) ? "Unmute" : "Mute"}</button><button onClick={() => banMember(m.user_id)} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-red-50 text-sm text-red-500"><Ban className="h-3.5 w-3.5" />Ban</button></>}
              </div>
            )}
          </div>
          {/* Delete options */}
          {showDeleteOptions === m.id && (
            <div className="bg-white rounded-2xl shadow-2xl border z-50 overflow-hidden mt-1 min-w-[190px]" onClick={e => e.stopPropagation()}>
              <div className="px-4 py-1.5 bg-gray-50 border-b"><p className="text-[10px] font-semibold text-gray-400">Delete message</p></div>
              <button onClick={() => deleteForMe(m.id)} className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-gray-50 text-sm"><Trash2 className="h-3.5 w-3.5 text-gray-400" />Delete for me</button>
              {(isMe || canModerate) && <button onClick={() => deleteForEveryone(m.id)} className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-red-50 text-sm text-red-500"><AlertTriangle className="h-3.5 w-3.5" />Delete for everyone</button>}
              <button onClick={() => setShowDeleteOptions(null)} className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-gray-50 text-sm text-gray-400 border-t"><X className="h-3.5 w-3.5" />Cancel</button>
            </div>
          )}
          <MessageReactions messageId={m.id} reactions={mr} onReactionUpdate={reloadReactions} />
        </div>
      </div>
    );
  };

  return (
    <div className="flex overflow-hidden" style={{ height: "100%" }} onClick={() => { setShowMessageMenu(null); setShowDeleteOptions(null); }}>
      {/* Sidebar */}
      <div className={`${mobileShowChat ? "hidden md:flex" : "flex"} w-full md:w-80 lg:w-96 flex-col border-e`} style={{ borderColor: "hsl(var(--border))" }}>
        <MajlisSidebar channels={channels} activeChannelId={activeChannelId} onSelectChannel={selectChannel} onNewChat={() => { if (canModerate && onCreateChannel) onCreateChannel(); else setShowCreateDialog(true); }} onBrowseChannels={() => setShowBrowseChannels(true)} profiles={profiles} unreadCounts={unreadCounts} userId={user?.id || ""} />
      </div>

      {/* Chat */}
      <div className={`${mobileShowChat ? "flex" : "hidden md:flex"} flex-1 flex-col min-w-0 overflow-hidden`}>
        {!activeChannel ? (
          <div className="flex-1 flex flex-col items-center justify-center" style={{ backgroundColor: "#F0ECE3" }}>
            <MessageCircle className="h-14 w-14 text-muted-foreground opacity-25 mb-3" />
            <p className="text-muted-foreground text-sm">Select a chat to start messaging</p>
          </div>
        ) : editingChannel ? (
          /* ─── Edit Group Screen (WhatsApp style) ─── */
          <div className="flex flex-col h-full overflow-hidden">
            <div className="px-4 py-3 flex items-center gap-3 shrink-0" style={{ backgroundColor: "#064E3B" }}>
              <button onClick={() => setEditingChannel(false)} className="text-white/80 p-1"><ArrowLeft className="h-5 w-5" /></button>
              <h2 className="text-white font-semibold flex-1">Edit Group</h2>
              <button onClick={saveChannelEdit} className="text-white font-semibold text-sm px-3 py-1 rounded-full" style={{ backgroundColor: "#b8962e" }}>Save</button>
            </div>
            <div className="flex-1 overflow-y-auto" style={{ backgroundColor: "#f5f0e8" }}>
              {/* Avatar Upload */}
              <div className="flex flex-col items-center py-8">
                <div className="relative">
                  <Avatar className="h-24 w-24 border-4 border-white shadow-lg">
                    <AvatarImage src={(activeChannel as any).avatar || ""} />
                    <AvatarFallback style={{ backgroundColor: "#1a3a2a", color: "white", fontSize: "2rem" }}>{getCN(activeChannel)[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <button onClick={() => avatarInputRef.current?.click()} className="absolute bottom-0 right-0 h-8 w-8 rounded-full flex items-center justify-center shadow-md" style={{ backgroundColor: "#b8962e" }}>
                    <Camera className="h-4 w-4 text-white" />
                  </button>
                  <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={e => { if (e.target.files?.[0]) handleAvatarUpload(e.target.files[0]); }} />
                </div>
                <p className="text-xs text-gray-500 mt-2">Tap camera to change photo</p>
              </div>
              {/* Name */}
              <div className="mx-4 mb-4 bg-white rounded-2xl overflow-hidden shadow-sm">
                <div className="px-4 py-2 border-b"><p className="text-xs font-semibold text-gray-400 uppercase">Group Name</p></div>
                <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Group name..." className="w-full px-4 py-3 text-sm outline-none bg-white" />
              </div>
              {/* Description */}
              <div className="mx-4 mb-4 bg-white rounded-2xl overflow-hidden shadow-sm">
                <div className="px-4 py-2 border-b"><p className="text-xs font-semibold text-gray-400 uppercase">Description</p></div>
                <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="Add a group description..." rows={3} className="w-full px-4 py-3 text-sm outline-none bg-white resize-none" />
              </div>
              {/* Media preview */}
              <div className="mx-4 mb-4 bg-white rounded-2xl overflow-hidden shadow-sm">
                <div className="px-4 py-3 flex items-center justify-between border-b">
                  <p className="text-sm font-semibold">Media, links and docs</p>
                  <span className="text-xs text-gray-400">{messages.filter(m => m.content_type === "image" || m.content_type === "file").length}</span>
                </div>
                <div className="flex gap-1 p-2 overflow-x-auto">
                  {messages.filter(m => m.content_type === "image" && m.media_path).slice(0, 6).map(m => (
                    <div key={m.id} className="w-20 h-20 rounded-lg overflow-hidden shrink-0 bg-gray-100">
                      <ImageMsg path={m.media_path!} />
                    </div>
                  ))}
                  {messages.filter(m => m.content_type === "image").length === 0 && <p className="text-xs text-gray-400 p-2">No media yet</p>}
                </div>
              </div>
              {/* Danger zone */}
              {canModerate && (
                <div className="mx-4 mb-4 bg-white rounded-2xl overflow-hidden shadow-sm">
                  <button onClick={deleteGroup} className="w-full flex items-center gap-3 px-4 py-4 text-red-500 text-sm font-medium">
                    <Trash2 className="h-4 w-4" /> Delete Group
                  </button>
                  <button onClick={() => { setMessages([]); supabase.from("chat_messages").delete().eq("channel_id", activeChannelId); }} className="w-full flex items-center gap-3 px-4 py-4 text-orange-500 text-sm font-medium border-t">
                    <AlertTriangle className="h-4 w-4" /> Clear All Messages
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ─── Normal Chat View ─── */
          <div className="flex flex-col overflow-hidden" style={{ height: "100%" }}>
            {/* Header */}
            <div className="flex items-center gap-3 px-3 py-2.5 shrink-0 shadow-sm" style={{ backgroundColor: "#064E3B" }}>
              <button onClick={() => setMobileShowChat(false)} className="md:hidden text-white/80 p-1 shrink-0"><ArrowLeft className="h-5 w-5" /></button>
              <button className="flex items-center gap-2.5 flex-1 min-w-0 text-start" onClick={() => setShowGroupInfo(true)}>
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarImage src={(activeChannel as any).avatar || ""} />
                  <AvatarFallback style={{ backgroundColor: "#b8962e", color: "white", fontSize: "0.85rem" }}>{activeChannel.type === "announcement" ? "📢" : getCN(activeChannel)[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="text-white font-semibold text-sm truncate">{getCN(activeChannel)}</p>
                  <p className="text-white/55 text-[10px]">{typingUsers.length > 0 ? <span className="text-green-300">{typingUsers[0]} typing...</span> : `${activeChannel.member_count || 0} members`}</p>
                </div>
              </button>
              <div className="flex items-center gap-0.5 shrink-0">
                <button onClick={() => setShowSearch(!showSearch)} className="text-white/80 hover:text-white p-1.5"><Search className="h-4 w-4" /></button>
                {canModerate && (
                  <>
                    <button onClick={() => setChannelLocked(!channelLocked)} className={`p-1.5 ${channelLocked ? "text-red-400" : "text-white/80 hover:text-white"}`}><Lock className="h-4 w-4" /></button>
                    <button onClick={() => { setEditName(getCN(activeChannel)); setEditDesc((activeChannel as any).description || ""); setEditingChannel(true); }} className="text-white/80 hover:text-white p-1.5">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                    </button>
                    {onBroadcast && <button onClick={onBroadcast} className="text-white/80 hover:text-white p-1.5"><Megaphone className="h-4 w-4" /></button>}
                    {onCreateChannel && <button onClick={onCreateChannel} className="text-white/80 hover:text-white p-1.5"><Plus className="h-4 w-4" /></button>}
                  </>
                )}
                <button onClick={() => setShowGroupInfo(true)} className="text-white/80 hover:text-white p-1.5"><Info className="h-4 w-4" /></button>
              </div>
            </div>

            {/* Search */}
            {showSearch && (
              <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0" style={{ backgroundColor: "#f5f0e8" }}>
                <Search className="h-4 w-4 text-gray-400 shrink-0" />
                <input autoFocus value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search messages..." className="flex-1 bg-transparent text-sm outline-none" />
                <button onClick={() => { setShowSearch(false); setSearchQuery(""); }}><X className="h-4 w-4 text-gray-400" /></button>
              </div>
            )}

            {/* Admin bar */}
            {canModerate && (
              <div className="flex items-center gap-2 px-3 py-1 border-b shrink-0" style={{ backgroundColor: "#f5f0e8" }}>
                <span className="text-[10px] text-gray-400 flex-1">👑 Admin</span>
                <button onClick={() => setChannelLocked(!channelLocked)} className={`text-[10px] px-2 py-0.5 rounded-full text-white ${channelLocked ? "bg-red-500" : "bg-gray-400"}`}>{channelLocked ? "🔒" : "🔓"}</button>
              </div>
            )}

            {/* Pinned */}
            {pinnedMessages.length > 0 && showPinnedBar && (
              <div className="flex items-center gap-2 px-3 py-1.5 border-b cursor-pointer shrink-0" style={{ backgroundColor: "#f0f7f4" }} onClick={() => { const el = document.getElementById(`msg-${pinnedMessages[0].id}`); el?.scrollIntoView({ behavior: "smooth" }); }}>
                <Pin className="h-3 w-3 text-primary shrink-0" />
                <p className="text-xs text-gray-600 truncate flex-1">{pinnedMessages[0].text}</p>
                <button onClick={e => { e.stopPropagation(); setShowPinnedBar(false); }}><X className="h-3 w-3 text-gray-400" /></button>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-3 py-3 min-h-0" ref={scrollRef} style={{ backgroundColor: "#FAFAF8", backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none'%3E%3Cg fill='%23064E3B' fill-opacity='0.025'%3E%3Cpath d='M30 0l30 30-30 30L0 30z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")` }}>
              {filteredMessages.length === 0 && <div className="text-center py-10"><p className="text-sm text-gray-400">{searchQuery ? "No messages found" : "No messages yet. Start the conversation!"}</p></div>}
              {filteredMessages.map((m, idx) => <div id={`msg-${m.id}`} key={m.id}><MsgBubble m={m} idx={idx} /></div>)}
            </div>

            {/* Reply */}
            {replyTo && (
              <div className="flex items-center gap-2 px-4 py-2 border-t shrink-0" style={{ backgroundColor: "#F0F2F5" }}>
                <div className="w-0.5 h-9 rounded bg-primary shrink-0" />
                <div className="flex-1 min-w-0"><p className="text-[10px] font-semibold text-primary">{profiles[replyTo.user_id]?.full_name}</p><p className="text-xs text-gray-500 truncate">{replyTo.text}</p></div>
                <button onClick={() => setReplyTo(null)}><X className="h-4 w-4 text-gray-400" /></button>
              </div>
            )}

            {/* Recording */}
            {isRecording && (
              <div className="flex items-center gap-3 px-4 py-2 shrink-0" style={{ backgroundColor: "#FEE2E2" }}>
                <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-sm text-red-600 flex-1">🎙️ {fr(recordingTime)}</span>
                <button onClick={stopRecording} className="text-xs text-red-600 border border-red-300 rounded-full px-3 py-0.5 flex items-center gap-1"><MicOff className="h-3 w-3" /> Stop</button>
              </div>
            )}

            {/* Emoji bar */}
            {showEmojiBar && (
              <div className="px-3 py-2 flex flex-wrap gap-2 border-t shrink-0" style={{ backgroundColor: "#F0F2F5" }}>
                {["😊","❤️","😂","😮","😢","🙏","👍","👎","🔥","🎉","🤲","💯","✅","📖","🌙","🕌"].map(e => (
                  <button key={e} onClick={() => setInput(prev => prev + e)} className="text-xl hover:scale-125 transition-transform">{e}</button>
                ))}
              </div>
            )}

            {/* Input */}
            {canSend() ? (
              <div className="flex items-end gap-1.5 px-2 py-2 shrink-0" style={{ backgroundColor: "#F0F2F5" }}>
                <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={e => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0], "image"); }} />
                <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.xlsx,.pptx,.txt" className="hidden" onChange={e => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0], "file"); }} />
                <button onClick={() => setShowEmojiBar(!showEmojiBar)} className="p-2 text-gray-500 hover:text-gray-700 shrink-0"><Smile className="h-5 w-5" /></button>
                <button onClick={() => imageInputRef.current?.click()} className="p-2 text-gray-500 hover:text-gray-700 shrink-0"><Image className="h-5 w-5" /></button>
                <button onClick={() => fileInputRef.current?.click()} className="p-2 text-gray-500 hover:text-gray-700 shrink-0"><Paperclip className="h-5 w-5" /></button>
                <div className="flex items-center bg-white rounded-full shadow-sm flex-1 px-4 h-10">
                  <input ref={inputRef} value={input} onChange={e => { setInput(e.target.value); handleTyping(); }} onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()} placeholder={channelLocked && !canModerate ? "Channel locked" : "Type a message..."} dir="auto" className="flex-1 text-sm outline-none bg-transparent" />
                </div>
                <button
                  onClick={input.trim() ? () => sendMessage() : (isRecording ? stopRecording : startRecording)}
                  className="h-10 w-10 rounded-full flex items-center justify-center text-white shrink-0"
                  style={{ backgroundColor: isRecording ? "#EF4444" : "#1a3a2a" }}
                >
                  {input.trim() ? <Send className="h-4.5 w-4.5" /> : isRecording ? <MicOff className="h-4.5 w-4.5" /> : <Mic className="h-4.5 w-4.5" />}
                </button>
              </div>
            ) : (
              <div className="px-4 py-3 text-center text-sm text-muted-foreground shrink-0" style={{ backgroundColor: "#F0F2F5" }}>
                {channelLocked ? "🔒 Channel is locked" : "Only admins can post here"}
              </div>
            )}
          </div>
        )}
      </div>

      <CreateChannelDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} mode="menu" onCreated={handleChannelCreated} />
      <BrowseChannelsDialog open={showBrowseChannels} onOpenChange={setShowBrowseChannels} myChannelIds={channels.map(c => c.id)} onJoined={(id) => { handleChannelCreated(id); setShowBrowseChannels(false); }} />
      <GroupInfoPanel open={showGroupInfo} onOpenChange={setShowGroupInfo} channel={activeChannel}
        onUpdated={() => { if (activeChannelId) supabase.from("chat_channels" as any).select("*").eq("id", activeChannelId).single().then(({ data }) => { if (data) setChannels(prev => prev.map(c => c.id === activeChannelId ? data as unknown as ChatChannel : c)); }); }}
        onMemberTap={(member) => { setSelectedMember(member); setShowStudentProfile(true); }} />
      <StudentProfileSheet open={showStudentProfile} onOpenChange={setShowStudentProfile} member={selectedMember} />
    </div>
  );
};

export default Majlis;
