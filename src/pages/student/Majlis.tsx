import { useEffect, useState, useRef, useCallback } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Send, MessageCircle, Reply, CheckCheck, Mic, MicOff,
  Image, Paperclip, Smile, ArrowLeft, FileText, Trash2, Info,
  X, Pin, Search, Star, Ban, Volume2, VolumeX, MoreVertical,
  Copy, Lock, Plus, Megaphone, AlertTriangle, Camera, Check,
  Forward, Download, ChevronDown
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

const WA_GREEN    = "#075E54";
const WA_LIGHT    = "#128C7E";
const WA_BUBBLE_ME = "#DCF8C6";
const WA_BG      = "#FAFAF5";
const WA_PATTERN = `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none'%3E%3Cg fill='%23064E3B' fill-opacity='0.03'%3E%3Cpath d='M30 0l30 30-30 30L0 30z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`;

const Majlis = ({ adminMode = false, onBroadcast, onCreateChannel }: MajlisProps) => {
  const { t, language } = useLanguage();
  const { user, profile, hasRole } = useAuth();
  const { toast } = useToast();

  const [channels, setChannels]               = useState<ChatChannel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [messages, setMessages]               = useState<ChatMessage[]>([]);
  const [profiles, setProfiles]               = useState<Record<string, UserProfile>>({});
  const [unreadCounts, setUnreadCounts]       = useState<Record<string, number>>({});
  const [reactions, setReactions]             = useState<Record<string, Record<string, string[]>>>({});
  const [pinnedMessages, setPinnedMessages]   = useState<ChatMessage[]>([]);
  const [typingUsers, setTypingUsers]         = useState<string[]>([]);
  const [starredMessages, setStarredMessages] = useState<Set<string>>(new Set());
  const [mutedMembers, setMutedMembers]       = useState<Set<string>>(new Set());
  const [channelLocked, setChannelLocked]     = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const [input, setInput]                     = useState("");
  const [replyTo, setReplyTo]                 = useState<ChatMessage | null>(null);
  const [isRecording, setIsRecording]         = useState(false);
  const [recordingTime, setRecordingTime]     = useState(0);
  const [mobileShowChat, setMobileShowChat]   = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showBrowseChannels, setShowBrowseChannels] = useState(false);
  const [showGroupInfo, setShowGroupInfo]     = useState(false);
  const [selectedMember, setSelectedMember]   = useState<any>(null);
  const [showStudentProfile, setShowStudentProfile] = useState(false);
  const [showSearch, setShowSearch]           = useState(false);
  const [searchQuery, setSearchQuery]         = useState("");
  const [showMessageMenu, setShowMessageMenu] = useState<string | null>(null);
  const [showDeleteSheet, setShowDeleteSheet] = useState<string | null>(null);
  const [showPinnedBar, setShowPinnedBar]     = useState(true);
  const [showEmojiBar, setShowEmojiBar]       = useState(false);
  const [editingChannel, setEditingChannel]   = useState(false);
  const [editName, setEditName]               = useState("");
  const [editDesc, setEditDesc]               = useState("");
  const [showHeaderMenu, setShowHeaderMenu]   = useState(false);

  // Profile edit
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [editProfileName, setEditProfileName] = useState("");
  const [editProfileAr, setEditProfileAr]     = useState("");
  const [savingProfile, setSavingProfile]     = useState(false);

  const mediaRecorderRef  = useRef<MediaRecorder | null>(null);
  const chunksRef         = useRef<Blob[]>([]);
  const scrollRef         = useRef<HTMLDivElement>(null);
  const inputRef          = useRef<HTMLInputElement>(null);
  const fileInputRef      = useRef<HTMLInputElement>(null);
  const imageInputRef     = useRef<HTMLInputElement>(null);
  const avatarInputRef    = useRef<HTMLInputElement>(null);
  const profileAvatarRef  = useRef<HTMLInputElement>(null);
  const recordingTimerRef = useRef<any>(null);
  const typingTimerRef    = useRef<any>(null);

  const isAdmin    = hasRole("admin");
  const isTeacher  = hasRole("teacher");
  const canModerate = isAdmin || isTeacher || adminMode;
  const activeChannel = channels.find(c => c.id === activeChannelId) || null;

  // ── Load channels ──────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data: memberData } = await supabase.from("chat_members" as any).select("channel_id").eq("user_id", user.id);
      const ids = (memberData || []).map((m: any) => m.channel_id);
      const { data: pub }  = await supabase.from("chat_channels" as any).select("*").eq("is_private", false);
      const { data: priv } = ids.length > 0 ? await supabase.from("chat_channels" as any).select("*").in("id", ids) : { data: [] };
      const all = Array.from(new Map([...(priv||[]), ...(pub||[])].map((c:any) => [c.id, c])).values()) as unknown as ChatChannel[];
      setChannels(all);
      await autoJoinLevel(user.id, profile?.level);
      await autoJoinDefaults(user.id, all);
      if (!activeChannelId && all.length > 0) setActiveChannelId(all[0].id);
    };
    load();
  }, [user, profile?.level]);

  const autoJoinLevel = async (uid: string, level: string | null) => {
    if (!level) return;
    const { data } = await supabase.from("chat_channels" as any).select("id").eq("type","level").eq("level",level);
    for (const ch of (data||[]) as any[]) await supabase.from("chat_members" as any).upsert({ channel_id:ch.id, user_id:uid, role:"member" }, { onConflict:"channel_id,user_id" });
  };
  const autoJoinDefaults = async (uid: string, all: ChatChannel[]) => {
    const defs = all.filter(c => (c.type==="group" && c.name==="General") || c.type==="announcement");
    for (const ch of defs) await supabase.from("chat_members" as any).upsert({ channel_id:ch.id, user_id:uid, role:"member" }, { onConflict:"channel_id,user_id" });
  };

  // ── Load messages (fast: limit 80, newest first then reverse) ──
  useEffect(() => {
    if (!activeChannelId) return;
    setLoadingMessages(true);
    setMessages([]);
    const load = async () => {
      const { data } = await supabase.from("chat_messages").select("*")
        .eq("channel_id", activeChannelId)
        .order("created_at", { ascending: false })
        .limit(80);
      const msgs = ((data || []) as unknown as ChatMessage[]).reverse();
      setMessages(msgs);

      // Load profiles
      const uids = [...new Set(msgs.map(m => m.user_id))];
      if (uids.length > 0) {
        const { data: profs } = await supabase.from("profiles")
          .select("user_id,full_name,full_name_ar,avatar_url,level,email,student_id")
          .in("user_id", uids);
        const map: Record<string, UserProfile> = {};
        (profs||[]).forEach((p:any) => { map[p.user_id] = p; });
        setProfiles(prev => ({ ...prev, ...map }));
      }

      // Mark read
      if (user) await supabase.from("chat_members" as any).update({ last_read_at: new Date().toISOString() }).eq("channel_id", activeChannelId).eq("user_id", user.id);

      // Reactions
      const ids = msgs.map(m => m.id);
      if (ids.length > 0) {
        const { data: rd } = await supabase.from("message_reactions" as any).select("message_id,user_id,emoji").in("message_id", ids);
        const rm: Record<string, Record<string, string[]>> = {};
        (rd||[]).forEach((r:any) => { if(!rm[r.message_id]) rm[r.message_id]={}; if(!rm[r.message_id][r.emoji]) rm[r.message_id][r.emoji]=[]; rm[r.message_id][r.emoji].push(r.user_id); });
        setReactions(rm);
      }
      setPinnedMessages(msgs.filter(m => m.is_pinned));
      setLoadingMessages(false);
    };
    load();

    // Realtime subscription
    const ch = supabase.channel(`majlis-${activeChannelId}`)
      .on("postgres_changes", { event:"*", schema:"public", table:"chat_messages", filter:`channel_id=eq.${activeChannelId}` }, (p) => {
        if (p.eventType === "INSERT") {
          const nm = p.new as unknown as ChatMessage;
          setMessages(prev => {
            if (prev.find(m => m.id === nm.id)) return prev; // dedupe optimistic
            return [...prev, nm];
          });
          if (!profiles[nm.user_id]) {
            supabase.from("profiles").select("user_id,full_name,full_name_ar,avatar_url,level").eq("user_id", nm.user_id).maybeSingle()
              .then(({ data }) => { if (data) setProfiles(prev => ({ ...prev, [(data as any).user_id]: data as unknown as UserProfile })); });
          }
        } else if (p.eventType === "UPDATE") {
          setMessages(prev => prev.map(m => m.id === (p.new as any).id ? p.new as unknown as ChatMessage : m));
        } else if (p.eventType === "DELETE") {
          setMessages(prev => prev.filter(m => m.id !== (p.old as any).id));
        }
      })
      .on("broadcast", { event:"typing" }, (p) => {
        if (p.payload.userId !== user?.id) {
          setTypingUsers(prev => [...new Set([...prev, p.payload.name])]);
          clearTimeout(typingTimerRef.current);
          typingTimerRef.current = setTimeout(() => setTypingUsers([]), 3000);
        }
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeChannelId]);

  // Auto scroll to bottom
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleTyping = () => {
    if (!activeChannelId || !user) return;
    supabase.channel(`majlis-${activeChannelId}`).send({ type:"broadcast", event:"typing", payload:{ userId:user.id, name:profile?.full_name || "Someone" } });
  };

  // ── Send message with optimistic UI ───────────────────────
  const sendMessage = async (contentType = "text", mediaPath?: string) => {
    if (!user || !activeChannelId) return;
    if (contentType === "text" && !input.trim() && !mediaPath) return;
    if (channelLocked && !canModerate) { toast({ title:"Channel is locked", variant:"destructive" }); return; }
    if (activeChannel?.type === "announcement" && !canModerate) { toast({ title:"Only admins can post here", variant:"destructive" }); return; }

    const text = input.trim();
    const tempId = `temp-${Date.now()}`;
    const optimistic: ChatMessage = {
      id: tempId, channel_id: activeChannelId, user_id: user.id,
      content_type: contentType, text: contentType==="text" ? text : (text||null),
      media_path: mediaPath||null, created_at: new Date().toISOString(),
      is_pinned: false, reply_to_id: replyTo?.id||null, reply_preview: replyTo ? (replyTo.text||"").slice(0,100) : null,
    } as any;

    setInput(""); setReplyTo(null); setShowEmojiBar(false);
    setMessages(prev => [...prev, optimistic]); // optimistic add

    const msgData: any = {
      class_level_id: activeChannelId, channel_id: activeChannelId, user_id: user.id,
      content_type: contentType, text: contentType==="text" ? text : (text||null),
      media_path: mediaPath||null,
    };
    if (replyTo) { msgData.reply_to_id = replyTo.id; msgData.reply_preview = (replyTo.text||"").slice(0,100); }

    const { data: inserted, error } = await supabase.from("chat_messages").insert(msgData as any).select().single();
    if (error) {
      setMessages(prev => prev.filter(m => m.id !== tempId)); // rollback
      toast({ title:"Error sending", variant:"destructive" });
    } else {
      // Replace optimistic with real
      setMessages(prev => prev.map(m => m.id === tempId ? inserted as unknown as ChatMessage : m));
      await supabase.from("chat_channels" as any).update({ last_message: contentType==="text" ? text.slice(0,100) : contentType, last_message_at: new Date().toISOString() }).eq("id", activeChannelId);
    }
    inputRef.current?.focus();
  };

  // ── Delete ─────────────────────────────────────────────────
  const deleteForMe    = (id: string) => { setMessages(prev => prev.filter(m => m.id !== id)); setShowDeleteSheet(null); };
  const deleteForAll   = async (id: string) => { await supabase.from("chat_messages").delete().eq("id",id); setMessages(prev => prev.filter(m => m.id !== id)); setShowDeleteSheet(null); };

  // ── Pin / Star / Copy ──────────────────────────────────────
  const pinMessage  = async (m: ChatMessage) => {
    const ip = !m.is_pinned;
    await supabase.from("chat_messages").update({ is_pinned:ip } as any).eq("id",m.id);
    setMessages(prev => prev.map(x => x.id===m.id ? {...x,is_pinned:ip} : x));
    setPinnedMessages(prev => ip ? [...prev,m] : prev.filter(x=>x.id!==m.id));
    setShowMessageMenu(null);
    toast({ title: ip?"Pinned":"Unpinned" });
  };
  const starMessage = (id: string) => { setStarredMessages(prev => { const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); return n; }); setShowMessageMenu(null); };
  const copyMessage = (text: string) => { navigator.clipboard?.writeText(text); setShowMessageMenu(null); toast({ title:"Copied!" }); };

  // ── Mute / Ban ─────────────────────────────────────────────
  const muteMember = async (uid: string) => {
    const im = !mutedMembers.has(uid);
    im ? setMutedMembers(prev => new Set([...prev,uid])) : setMutedMembers(prev => { const n=new Set(prev); n.delete(uid); return n; });
    await supabase.from("chat_members" as any).update({ role: im?"muted":"member" }).eq("channel_id",activeChannelId).eq("user_id",uid);
  };
  const banMember = async (uid: string) => { await supabase.from("chat_members" as any).delete().eq("channel_id",activeChannelId).eq("user_id",uid); setMessages(prev=>prev.filter(m=>m.user_id!==uid)); };

  // ── Reactions reload ───────────────────────────────────────
  const reloadReactions = async () => {
    if (!messages.length) return;
    const ids = messages.map(m=>m.id);
    const { data } = await supabase.from("message_reactions" as any).select("message_id,user_id,emoji").in("message_id",ids);
    const rm: Record<string,Record<string,string[]>> = {};
    (data||[]).forEach((r:any) => { if(!rm[r.message_id]) rm[r.message_id]={}; if(!rm[r.message_id][r.emoji]) rm[r.message_id][r.emoji]=[]; rm[r.message_id][r.emoji].push(r.user_id); });
    setReactions(rm);
  };

  // ── File / Image upload ────────────────────────────────────
  const handleFileUpload = async (file: File, type: "image"|"file") => {
    if (!activeChannelId || !user) return;
    const ext  = file.name.split(".").pop();
    const path = `${type}s/${activeChannelId}/${user.id}/${Date.now()}.${ext}`;
    // Try public bucket first, fallback to base64 for images
    const { error } = await supabase.storage.from("majlis-media").upload(path, file, { upsert:true });
    if (!error) {
      await sendMessage(type, path);
    } else if (type === "image") {
      // Store as base64 in message text as fallback
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        const msg: any = { class_level_id:activeChannelId, channel_id:activeChannelId, user_id:user.id, content_type:"image", text:base64 };
        await supabase.from("chat_messages").insert(msg);
      };
      reader.readAsDataURL(file);
    } else {
      toast({ title:"Upload failed. Check storage permissions.", variant:"destructive" });
    }
  };

  // ── Avatar upload ──────────────────────────────────────────
  const handleAvatarUpload = async (file: File) => {
    if (!activeChannelId || !canModerate) return;
    const path = `avatars/${activeChannelId}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("majlis-media").upload(path, file, { upsert:true });
    if (!error) {
      const { data } = supabase.storage.from("majlis-media").getPublicUrl(path);
      await supabase.from("chat_channels" as any).update({ avatar: data.publicUrl }).eq("id",activeChannelId);
      setChannels(prev => prev.map(c => c.id===activeChannelId ? {...c, avatar:data.publicUrl} as any : c));
      toast({ title:"Group photo updated!" });
    } else {
      toast({ title:"Upload failed", variant:"destructive" });
    }
  };

  // ── Profile picture upload ────────────────────────────────
  const handleProfileAvatarUpload = async (file: File) => {
    if (!user) return;
    setSavingProfile(true);
    try {
      // Try storage first
      const path = `profiles/${user.id}/${Date.now()}.${file.name.split(".").pop()}`;
      const { error } = await supabase.storage.from("majlis-media").upload(path, file, { upsert:true });
      let avatarUrl = "";
      if (!error) {
        const { data } = supabase.storage.from("majlis-media").getPublicUrl(path);
        avatarUrl = data.publicUrl;
      } else {
        // Fallback: base64
        avatarUrl = await new Promise(res => {
          const r = new FileReader();
          r.onloadend = () => res(r.result as string);
          r.readAsDataURL(file);
        });
      }
      await supabase.from("profiles").update({ avatar_url: avatarUrl }).eq("user_id", user.id);
      setProfiles(prev => ({ ...prev, [user.id]: { ...prev[user.id], avatar_url: avatarUrl } }));
      toast({ title:"Profile photo updated!" });
    } catch(_) {}
    setSavingProfile(false);
  };

  // ── Save profile edit ─────────────────────────────────────
  const saveProfileEdit = async () => {
    if (!user) return;
    setSavingProfile(true);
    await supabase.from("profiles").update({ full_name: editProfileName, full_name_ar: editProfileAr }).eq("user_id", user.id);
    setProfiles(prev => ({ ...prev, [user.id]: { ...prev[user.id], full_name: editProfileName, full_name_ar: editProfileAr } }));
    setShowProfileEdit(false);
    setSavingProfile(false);
    toast({ title:"Profile updated!" });
  };

  // ── Voice recording ────────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio:true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = e => chunksRef.current.push(e.data);
      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type:"audio/webm" });
        stream.getTracks().forEach(t => t.stop());
        clearInterval(recordingTimerRef.current); setRecordingTime(0);
        const path = `voice/${activeChannelId}/${user!.id}/${Date.now()}.webm`;
        const { error } = await supabase.storage.from("majlis-media").upload(path, blob);
        if (!error) await sendMessage("audio", path);
      };
      mr.start(); mediaRecorderRef.current = mr;
      setIsRecording(true);
      recordingTimerRef.current = setInterval(() => setRecordingTime(t => t+1), 1000);
    } catch { toast({ title:"Microphone denied", variant:"destructive" }); }
  };
  const stopRecording = () => { mediaRecorderRef.current?.stop(); setIsRecording(false); };

  // ── Group save ─────────────────────────────────────────────
  const saveChannelEdit = async () => {
    if (!activeChannelId) return;
    await supabase.from("chat_channels" as any).update({ name:editName, description:editDesc }).eq("id",activeChannelId);
    setChannels(prev => prev.map(c => c.id===activeChannelId ? {...c,name:editName,description:editDesc} : c));
    setEditingChannel(false);
    toast({ title:"Group updated!" });
  };

  const deleteGroup = async () => {
    if (!activeChannelId || !canModerate || !confirm("Delete this group permanently?")) return;
    await supabase.from("chat_messages").delete().eq("channel_id",activeChannelId);
    await supabase.from("chat_members" as any).delete().eq("channel_id",activeChannelId);
    await supabase.from("chat_channels" as any).delete().eq("id",activeChannelId);
    setChannels(prev => prev.filter(c => c.id!==activeChannelId));
    setActiveChannelId(channels[0]?.id||null);
    toast({ title:"Group deleted" });
  };

  const selectChannel = (id: string) => { setActiveChannelId(id); setMobileShowChat(true); setEditingChannel(false); };
  const handleChannelCreated = async (id: string) => {
    const { data } = await supabase.from("chat_channels" as any).select("*").eq("id",id).single();
    if (data) setChannels(prev => prev.find(c=>c.id===id) ? prev : [data as unknown as ChatChannel, ...prev]);
    setActiveChannelId(id); setMobileShowChat(true);
  };

  const ft  = (d: string) => new Date(d).toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
  const fr  = (s: number) => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
  const getCN = (ch: ChatChannel) => language==="ar" ? (ch.name_ar||ch.name||"") : (ch.name||"");
  const canSend = () => { if (!activeChannel||(channelLocked&&!canModerate)) return false; if (activeChannel.type==="announcement") return canModerate; return true; };
  const filtered = searchQuery ? messages.filter(m=>(m.text||"").toLowerCase().includes(searchQuery.toLowerCase())) : messages;

  // ── Sub-components ─────────────────────────────────────────
  const AudioMsg = ({ path }: { path:string }) => {
    const [url, setUrl] = useState<string|null>(null);
    useEffect(() => { supabase.storage.from("majlis-media").createSignedUrl(path,3600).then(({ data }) => { if(data?.signedUrl) setUrl(data.signedUrl); }); },[path]);
    if (!url) return <span style={{ fontSize:11, opacity:.6 }}>Loading audio…</span>;
    return (
      <div style={{ display:"flex", alignItems:"center", gap:8, minWidth:180 }}>
        <div style={{ width:30, height:30, borderRadius:"50%", background:WA_GREEN, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <Mic style={{ width:14, height:14, color:"#fff" }} />
        </div>
        <audio controls src={url} style={{ height:30, flex:1, maxWidth:160 }} />
      </div>
    );
  };

  const ImageMsg = ({ path, text }: { path:string; text?:string|null }) => {
    // Support both storage path and base64
    const [url, setUrl] = useState<string|null>(null);
    useEffect(() => {
      if (!path) return;
      if (path.startsWith("data:") || path.startsWith("http")) { setUrl(path); return; }
      supabase.storage.from("majlis-media").createSignedUrl(path,3600).then(({ data }) => { if(data?.signedUrl) setUrl(data.signedUrl); });
      // Also check text for base64
      if (text?.startsWith("data:image")) setUrl(text);
    },[path, text]);
    if (!url) return <span style={{ fontSize:11, opacity:.6 }}>Loading image…</span>;
    return <img src={url} style={{ maxWidth:200, borderRadius:8, cursor:"pointer", display:"block" }} alt="" loading="lazy" onClick={() => window.open(url,"_blank")} />;
  };

  const FileMsg = ({ path, text }: { path:string; text:string|null }) => {
    const open = async () => { const { data } = await supabase.storage.from("majlis-media").createSignedUrl(path,300); if(data?.signedUrl) window.open(data.signedUrl,"_blank"); };
    return (
      <button onClick={open} style={{ display:"flex", alignItems:"center", gap:8, background:"none", border:"none", cursor:"pointer", padding:0 }}>
        <div style={{ width:30, height:30, borderRadius:8, background:"rgba(255,255,255,0.2)", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <FileText style={{ width:14, height:14 }} />
        </div>
        <span style={{ fontSize:12, textDecoration:"underline" }}>{text || path.split("/").pop()}</span>
      </button>
    );
  };

  // ── Message Bubble ─────────────────────────────────────────
  const MsgBubble = ({ m, idx }: { m:ChatMessage; idx:number }) => {
    const isMe    = m.user_id === user?.id;
    const sp      = profiles[m.user_id];
    const name    = sp?.full_name || (isMe ? profile?.full_name : "Student") || "Student";
    const prev    = messages[idx-1];
    const next    = messages[idx+1];
    const sameAs  = (a: ChatMessage, b?: ChatMessage) => b && b.user_id===a.user_id;
    const isFirst = !sameAs(m, prev);
    const isLast  = !sameAs(m, next);
    const mr      = reactions[m.id] || {};
    const isStar  = starredMessages.has(m.id);
    const rMsg    = m.reply_to_id ? messages.find(x => x.id===m.reply_to_id) : null;
    const hl      = searchQuery && (m.text||"").toLowerCase().includes(searchQuery.toLowerCase());
    const canDel  = isMe || canModerate;
    const isTemp  = m.id.startsWith("temp-");

    // Color coding for different users
    const userColors = ["#075E54","#2196F3","#9C27B0","#FF5722","#009688","#795548"];
    const colorIdx   = name.charCodeAt(0) % userColors.length;
    const nameColor  = userColors[colorIdx];

    return (
      <div
        style={{ display:"flex", justifyContent:isMe?"flex-end":"flex-start", marginBottom: isLast?8:2, padding:"0 10px" }}
        onTouchStart={() => {}}
      >
        {/* Avatar — only for others, only on last in group */}
        {!isMe && (
          <div style={{ width:32, flexShrink:0, alignSelf:"flex-end", marginRight:4, marginBottom:4 }}>
            {isLast && (
              <button onClick={() => { setSelectedMember({ user_id:m.user_id, full_name:sp?.full_name||null, avatar_url:sp?.avatar_url||null, level:sp?.level||null, student_id:(sp as any)?.student_id||null, is_online:false, last_seen:null }); setShowStudentProfile(true); }} style={{ background:"none", border:"none", padding:0 }}>
                <div style={{ width:30, height:30, borderRadius:"50%", overflow:"hidden", background:WA_GREEN, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, color:"#fff", fontWeight:700 }}>
                  {sp?.avatar_url ? <img src={sp.avatar_url} style={{ width:"100%", height:"100%", objectFit:"cover" }} alt="" /> : (name[0]||"S").toUpperCase()}
                </div>
              </button>
            )}
          </div>
        )}

        <div style={{ display:"flex", flexDirection:"column", maxWidth:"74%", alignItems:isMe?"flex-end":"flex-start" }}>
          {/* Bubble */}
          <div
            onClick={e => { e.stopPropagation(); setShowMessageMenu(sm => sm===m.id ? null : m.id); setShowDeleteSheet(null); }}
            style={{
              position:"relative", padding:"6px 10px 4px",
              background: isMe ? WA_BUBBLE_ME : "#FFFFFF",
              borderRadius: isMe
                ? isFirst&&isLast?"12px 12px 2px 12px" : isFirst?"12px 12px 12px 12px" : isLast?"12px 12px 2px 12px":"12px"
                : isFirst&&isLast?"12px 12px 12px 2px" : isFirst?"12px 12px 12px 12px" : isLast?"12px 12px 12px 2px":"12px",
              boxShadow:"0 1px 1px rgba(0,0,0,.1)",
              outline: hl?"2px solid #f6d860":"none",
              marginTop: isFirst?4:1,
              opacity: isTemp?0.7:1,
            }}
          >
            {/* Sender name — show for others on first msg in group */}
            {!isMe && isFirst && (
              <div style={{ fontSize:11, fontWeight:700, color:nameColor, marginBottom:2 }}>{name}</div>
            )}

            {/* Pinned indicator */}
            {m.is_pinned && (
              <div style={{ display:"flex", alignItems:"center", gap:3, marginBottom:2 }}>
                <Pin style={{ width:9, height:9, color:"#b7791f" }} />
                <span style={{ fontSize:8, color:"#b7791f" }}>Pinned</span>
              </div>
            )}

            {/* Reply preview */}
            {rMsg && (
              <div style={{ marginBottom:4, padding:"3px 8px", borderRadius:6, borderLeft:"3px solid #075E54", background:"rgba(0,0,0,0.06)" }}>
                <div style={{ fontSize:9, fontWeight:700, color:"#075E54", opacity:.8 }}>{profiles[rMsg.user_id]?.full_name || "User"}</div>
                <div style={{ fontSize:10, opacity:.6, overflow:"hidden", whiteSpace:"nowrap", textOverflow:"ellipsis", maxWidth:160 }}>{rMsg.text || "📎 Media"}</div>
              </div>
            )}

            {/* Content */}
            <div style={{ fontSize:14, color:"#111", lineHeight:1.45, wordBreak:"break-word" }} dir="auto">
              {m.content_type==="audio" && m.media_path ? <AudioMsg path={m.media_path} />
               : m.content_type==="image" ? <ImageMsg path={m.media_path||""} text={m.text} />
               : m.content_type==="file" && m.media_path ? <FileMsg path={m.media_path} text={m.text} />
               : <span style={{ whiteSpace:"pre-wrap" }}>{m.text}</span>}
            </div>

            {/* Time + status */}
            <div style={{ display:"flex", alignItems:"center", gap:3, justifyContent:"flex-end", marginTop:2 }}>
              {isStar && <Star style={{ width:9, height:9, color:"#b7791f", fill:"#b7791f" }} />}
              <span style={{ fontSize:9, color:"rgba(0,0,0,0.45)", whiteSpace:"nowrap" }}>{ft(m.created_at)}</span>
              {isMe && (
                isTemp
                  ? <Check style={{ width:11, height:11, color:"rgba(0,0,0,.3)" }} />
                  : <CheckCheck style={{ width:11, height:11, color:"#53BDEB" }} />
              )}
            </div>

            {/* Quick reaction row — appears on tap/hover */}
            {showMessageMenu === m.id && (
              <div
                style={{ position:"absolute", top:-38, right:isMe?0:"auto", left:isMe?"auto":0, background:"#fff", borderRadius:24, boxShadow:"0 2px 16px rgba(0,0,0,.2)", display:"flex", alignItems:"center", gap:2, padding:"4px 8px", zIndex:30 }}
                onClick={e => e.stopPropagation()}
              >
                {["❤️","👍","😂","😮","😢","🙏"].map(e => (
                  <button key={e} onClick={async ev => { ev.stopPropagation(); await supabase.from("message_reactions" as any).upsert({ message_id:m.id, user_id:user?.id, emoji:e }); reloadReactions(); setShowMessageMenu(null); }}
                    style={{ fontSize:20, background:"none", border:"none", cursor:"pointer", padding:"2px 4px", lineHeight:1 }}
                  >{e}</button>
                ))}
                <div style={{ width:1, height:24, background:"#e0e0e0", margin:"0 2px" }} />
                {/* More options */}
                <button onClick={ev => { ev.stopPropagation(); setShowMessageMenu(null); setTimeout(()=>setShowMessageMenu(`menu-${m.id}`),10); }}
                  style={{ background:"none", border:"none", cursor:"pointer", padding:"2px 6px" }}>
                  <MoreVertical style={{ width:16, height:16, color:"#666" }} />
                </button>
              </div>
            )}
          </div>

          {/* Context menu (WhatsApp action list) */}
          {showMessageMenu === `menu-${m.id}` && (
            <div
              style={{ background:"#fff", borderRadius:12, boxShadow:"0 4px 24px rgba(0,0,0,.15)", minWidth:180, overflow:"hidden", zIndex:40, marginTop:4 }}
              onClick={e => e.stopPropagation()}
            >
              {[
                { icon:Copy,    label:"Copy",                   action:()=>copyMessage(m.text||""),                             color:"#111" },
                { icon:Reply,   label:"Reply",                   action:()=>{ setReplyTo(m); setShowMessageMenu(null); inputRef.current?.focus(); }, color:"#111" },
                { icon:Star,    label:isStar?"Unstar":"Star",   action:()=>starMessage(m.id),                                   color:"#111" },
                ...(canModerate ? [{ icon:Pin, label:m.is_pinned?"Unpin":"Pin", action:()=>pinMessage(m), color:"#2196F3" }] : []),
                { icon:Trash2,  label:"Delete",                  action:()=>{ setShowDeleteSheet(m.id); setShowMessageMenu(null); }, color:"#EF4444" },
                ...(canModerate&&!isMe ? [
                  { icon:mutedMembers.has(m.user_id)?Volume2:VolumeX, label:mutedMembers.has(m.user_id)?"Unmute":"Mute", action:()=>muteMember(m.user_id), color:"#FF9800" },
                  { icon:Ban, label:"Ban", action:()=>banMember(m.user_id), color:"#EF4444" },
                ] : []),
              ].map((item,i) => (
                <button key={i} onClick={item.action}
                  style={{ width:"100%", display:"flex", alignItems:"center", gap:12, padding:"12px 16px", background:"none", border:"none", cursor:"pointer", fontSize:14, color:item.color, fontFamily:"'Cairo',sans-serif", borderTop:i>0?"1px solid #f0f0f0":"none", textAlign:"left" as const }}>
                  <item.icon style={{ width:16, height:16 }} />
                  {item.label}
                </button>
              ))}
            </div>
          )}

          {/* Reactions */}
          <MessageReactions messageId={m.id} reactions={mr} onReactionUpdate={reloadReactions} />
        </div>
      </div>
    );
  };

  // ── DELETE BOTTOM SHEET (WhatsApp style) ──────────────────
  const DeleteSheet = ({ msgId }: { msgId:string }) => {
    const m   = messages.find(x => x.id===msgId);
    const isMe = m?.user_id === user?.id;
    return (
      <div style={{ position:"fixed", inset:0, zIndex:100, display:"flex", flexDirection:"column", justifyContent:"flex-end" }}>
        {/* Backdrop */}
        <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.5)" }} onClick={() => setShowDeleteSheet(null)} />
        {/* Sheet */}
        <div style={{ position:"relative", background:"#fff", borderRadius:"20px 20px 0 0", padding:"12px 0 32px", zIndex:101 }}>
          {/* Handle */}
          <div style={{ width:36, height:4, borderRadius:2, background:"#ddd", margin:"0 auto 16px" }} />
          <div style={{ padding:"0 20px 12px", borderBottom:"1px solid #f0f0f0" }}>
            <div style={{ fontSize:13, fontWeight:700, color:"#333" }}>Delete message?</div>
          </div>
          {/* Options */}
          {(isMe||canModerate) && (
            <button onClick={() => deleteForAll(msgId)}
              style={{ width:"100%", padding:"16px 20px", background:"none", border:"none", cursor:"pointer", textAlign:"left" as const, fontSize:16, color:"#EF4444", display:"flex", alignItems:"center", gap:14, fontFamily:"'Cairo',sans-serif" }}>
              <div style={{ width:40, height:40, borderRadius:"50%", background:"#FEE2E2", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <Trash2 style={{ width:18, height:18, color:"#EF4444" }} />
              </div>
              Delete for everyone
            </button>
          )}
          <button onClick={() => deleteForMe(msgId)}
            style={{ width:"100%", padding:"16px 20px", background:"none", border:"none", cursor:"pointer", textAlign:"left" as const, fontSize:16, color:"#333", display:"flex", alignItems:"center", gap:14, fontFamily:"'Cairo',sans-serif" }}>
            <div style={{ width:40, height:40, borderRadius:"50%", background:"#f0f4f0", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <Trash2 style={{ width:18, height:18, color:"#666" }} />
            </div>
            Delete for me
          </button>
          <button onClick={() => setShowDeleteSheet(null)}
            style={{ width:"100%", padding:"16px 20px", background:"none", border:"none", cursor:"pointer", textAlign:"left" as const, fontSize:16, color:"#075E54", fontWeight:700, display:"flex", alignItems:"center", gap:14, fontFamily:"'Cairo',sans-serif", borderTop:"1px solid #f0f0f0", marginTop:4 }}>
            <div style={{ width:40, height:40, borderRadius:"50%", background:"#e8f5e9", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <X style={{ width:18, height:18, color:"#075E54" }} />
            </div>
            Cancel
          </button>
        </div>
      </div>
    );
  };

  // ── Profile Edit Modal ────────────────────────────────────
  const ProfileEditModal = () => (
    <div style={{ position:"fixed", inset:0, zIndex:100, display:"flex", flexDirection:"column", justifyContent:"flex-end" }}>
      <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.5)" }} onClick={() => setShowProfileEdit(false)} />
      <div style={{ position:"relative", background:"#fff", borderRadius:"20px 20px 0 0", padding:"20px 20px 40px", zIndex:101 }}>
        <div style={{ width:36, height:4, borderRadius:2, background:"#ddd", margin:"0 auto 20px" }} />
        <div style={{ fontSize:16, fontWeight:700, color:"#333", marginBottom:20 }}>Edit Profile · تعديل الملف</div>

        {/* Avatar */}
        <div style={{ display:"flex", justifyContent:"center", marginBottom:20 }}>
          <div style={{ position:"relative" }}>
            <div style={{ width:80, height:80, borderRadius:"50%", overflow:"hidden", background:WA_GREEN, display:"flex", alignItems:"center", justifyContent:"center", fontSize:28, color:"#fff" }}>
              {profiles[user?.id||""]?.avatar_url
                ? <img src={profiles[user?.id||""]?.avatar_url} style={{ width:"100%", height:"100%", objectFit:"cover" }} alt="" />
                : (profile?.full_name?.[0]||"S").toUpperCase()}
            </div>
            <button onClick={() => profileAvatarRef.current?.click()}
              style={{ position:"absolute", bottom:0, right:0, width:26, height:26, borderRadius:"50%", background:WA_GREEN, border:"2px solid #fff", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" }}>
              <Camera style={{ width:12, height:12, color:"#fff" }} />
            </button>
            <input ref={profileAvatarRef} type="file" accept="image/*" style={{ display:"none" }} onChange={e => { if(e.target.files?.[0]) handleProfileAvatarUpload(e.target.files[0]); }} />
          </div>
        </div>

        {/* Name */}
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:11, fontWeight:600, color:"#999", marginBottom:5 }}>Your Name</div>
          <input value={editProfileName} onChange={e => setEditProfileName(e.target.value)}
            style={{ width:"100%", border:"none", borderBottom:"2px solid #075E54", padding:"8px 0", fontSize:15, outline:"none", color:"#333" }}
            placeholder="Enter your name…" />
        </div>
        <div style={{ marginBottom:24 }}>
          <div style={{ fontSize:11, fontWeight:600, color:"#999", marginBottom:5 }}>Arabic Name (اختياري)</div>
          <input value={editProfileAr} onChange={e => setEditProfileAr(e.target.value)} dir="rtl"
            style={{ width:"100%", border:"none", borderBottom:"2px solid #075E54", padding:"8px 0", fontSize:15, outline:"none", color:"#333" }}
            placeholder="الاسم بالعربية…" />
        </div>

        <button onClick={saveProfileEdit} disabled={savingProfile}
          style={{ width:"100%", padding:"14px 0", borderRadius:12, background:WA_GREEN, border:"none", color:"#fff", fontSize:15, fontWeight:700, cursor:"pointer" }}>
          {savingProfile ? "Saving…" : "Save · حفظ"}
        </button>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────
  return (
    <div style={{ display:"flex", height:"100%", overflow:"hidden", fontFamily:"'Cairo',sans-serif", position:"relative" }}
      onClick={() => { setShowMessageMenu(null); setShowHeaderMenu(false); }}>

      {/* Delete sheet */}
      {showDeleteSheet && <DeleteSheet msgId={showDeleteSheet} />}

      {/* Profile edit */}
      {showProfileEdit && <ProfileEditModal />}

      {/* ── Sidebar ── */}
      <div style={{ display: mobileShowChat ? "none" : "flex", width:"100%", maxWidth:360, flexDirection:"column", borderRight:"1px solid #e0e0e0" }} className="md:flex">
        <MajlisSidebar channels={channels} activeChannelId={activeChannelId} onSelectChannel={selectChannel}
          onNewChat={() => { if(canModerate&&onCreateChannel) onCreateChannel(); else setShowCreateDialog(true); }}
          onBrowseChannels={() => setShowBrowseChannels(true)}
          profiles={profiles} unreadCounts={unreadCounts} userId={user?.id||""} />
      </div>

      {/* ── Chat View ── */}
      <div style={{ display: mobileShowChat ? "flex" : "none", flex:1, flexDirection:"column", minWidth:0, overflow:"hidden", height:"100%" }} className="md:flex">
        {!activeChannel ? (
          <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", background:"#F0ECE3" }}>
            <MessageCircle style={{ width:56, height:56, color:"#ccc", marginBottom:12 }} />
            <p style={{ fontSize:13, color:"#999" }}>Select a chat to start messaging</p>
          </div>
        ) : editingChannel ? (
          /* ── Edit Group ── */
          <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>
            <div style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 16px", background:WA_GREEN }}>
              <button onClick={() => setEditingChannel(false)} style={{ background:"none", border:"none", color:"#fff", cursor:"pointer", padding:4 }}><ArrowLeft style={{ width:20, height:20 }} /></button>
              <span style={{ color:"#fff", fontWeight:700, fontSize:16, flex:1 }}>Edit Group</span>
              <button onClick={saveChannelEdit} style={{ background:"#b8962e", border:"none", color:"#fff", fontWeight:700, fontSize:13, padding:"6px 16px", borderRadius:20, cursor:"pointer" }}>Save</button>
            </div>
            <div style={{ flex:1, overflowY:"auto", background:"#f5f0e8", padding:"0 0 20px" }}>
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", padding:"30px 20px" }}>
                <div style={{ position:"relative" }}>
                  <div style={{ width:96, height:96, borderRadius:"50%", overflow:"hidden", background:WA_GREEN, border:"4px solid #fff", boxShadow:"0 2px 8px rgba(0,0,0,.15)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:36, color:"#fff" }}>
                    {(activeChannel as any).avatar ? <img src={(activeChannel as any).avatar} style={{ width:"100%", height:"100%", objectFit:"cover" }} alt="" /> : getCN(activeChannel)[0]?.toUpperCase()}
                  </div>
                  <button onClick={() => avatarInputRef.current?.click()} style={{ position:"absolute", bottom:0, right:0, width:32, height:32, borderRadius:"50%", background:"#b8962e", border:"3px solid #fff", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" }}>
                    <Camera style={{ width:14, height:14, color:"#fff" }} />
                  </button>
                  <input ref={avatarInputRef} type="file" accept="image/*" style={{ display:"none" }} onChange={e => { if(e.target.files?.[0]) handleAvatarUpload(e.target.files[0]); }} />
                </div>
                <p style={{ fontSize:12, color:"#999", marginTop:8 }}>Tap camera to change photo</p>
              </div>
              {[{label:"GROUP NAME",val:editName,set:setEditName,ph:"Group name…"},{label:"DESCRIPTION",val:editDesc,set:setEditDesc,ph:"Add a description…"}].map((f,i)=>(
                <div key={i} style={{ margin:"0 16px 12px", background:"#fff", borderRadius:16, overflow:"hidden", boxShadow:"0 1px 4px rgba(0,0,0,.06)" }}>
                  <div style={{ padding:"8px 16px 4px", borderBottom:"1px solid #f0f0f0" }}><p style={{ fontSize:10, fontWeight:700, color:"#999", letterSpacing:1 }}>{f.label}</p></div>
                  <input value={f.val} onChange={e=>f.set(e.target.value)} placeholder={f.ph} style={{ width:"100%", padding:"10px 16px", border:"none", outline:"none", fontSize:14, background:"#fff", boxSizing:"border-box" as const }} />
                </div>
              ))}
              {canModerate && (
                <div style={{ margin:"0 16px", background:"#fff", borderRadius:16, overflow:"hidden" }}>
                  <button onClick={deleteGroup} style={{ width:"100%", display:"flex", alignItems:"center", gap:12, padding:"14px 16px", background:"none", border:"none", cursor:"pointer", color:"#EF4444", fontSize:14, fontFamily:"'Cairo',sans-serif" }}>
                    <Trash2 style={{ width:16, height:16 }} /> Delete Group
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ── Normal Chat ── */
          <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>

            {/* ── Header ── */}
            <div style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", background:WA_GREEN, flexShrink:0, zIndex:10 }}>
              {/* Back */}
              <button onClick={() => setMobileShowChat(false)} style={{ background:"none", border:"none", color:"#fff", cursor:"pointer", padding:"4px 2px", marginRight:2 }} className="md:hidden">
                <ArrowLeft style={{ width:20, height:20 }} />
              </button>
              {/* Avatar + Name */}
              <button onClick={() => setShowGroupInfo(true)} style={{ display:"flex", alignItems:"center", gap:10, flex:1, background:"none", border:"none", cursor:"pointer", textAlign:"left" as const, minWidth:0 }}>
                <div style={{ width:36, height:36, borderRadius:"50%", overflow:"hidden", background:"#b8962e", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, color:"#fff", fontWeight:700, flexShrink:0 }}>
                  {(activeChannel as any).avatar ? <img src={(activeChannel as any).avatar} style={{ width:"100%", height:"100%", objectFit:"cover" }} alt="" /> : (activeChannel.type==="announcement"?"📢":getCN(activeChannel)[0]?.toUpperCase())}
                </div>
                <div style={{ minWidth:0 }}>
                  <p style={{ color:"#fff", fontWeight:700, fontSize:14, margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{getCN(activeChannel)}</p>
                  <p style={{ color:"rgba(255,255,255,0.6)", fontSize:10, margin:0 }}>
                    {typingUsers.length > 0
                      ? <span style={{ color:"#90EE90" }}>{typingUsers[0]} typing…</span>
                      : `${activeChannel.member_count||0} members`}
                  </p>
                </div>
              </button>

              {/* ── THREE ICONS: Search, Video call placeholder, Three-dot menu ── */}
              <button onClick={() => setShowSearch(s=>!s)} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.8)", cursor:"pointer", padding:6 }}>
                <Search style={{ width:18, height:18 }} />
              </button>

              {/* Three-dot menu */}
              <div style={{ position:"relative" }}>
                <button onClick={e => { e.stopPropagation(); setShowHeaderMenu(v=>!v); }}
                  style={{ background:"none", border:"none", color:"rgba(255,255,255,0.8)", cursor:"pointer", padding:6 }}>
                  <MoreVertical style={{ width:18, height:18 }} />
                </button>
                {showHeaderMenu && (
                  <div style={{ position:"absolute", top:"100%", right:0, background:"#fff", borderRadius:8, boxShadow:"0 4px 20px rgba(0,0,0,.2)", minWidth:190, zIndex:50, overflow:"hidden" }}
                    onClick={e => e.stopPropagation()}>
                    {[
                      { label:"Group Info", action:()=>{ setShowGroupInfo(true); setShowHeaderMenu(false); } },
                      { label:"Search Messages", action:()=>{ setShowSearch(true); setShowHeaderMenu(false); } },
                      ...(canModerate ? [
                        { label:channelLocked?"🔓 Unlock Channel":"🔒 Lock Channel", action:()=>{ setChannelLocked(v=>!v); setShowHeaderMenu(false); } },
                        { label:"✏️ Edit Group", action:()=>{ setEditName(getCN(activeChannel)); setEditDesc((activeChannel as any).description||""); setEditingChannel(true); setShowHeaderMenu(false); } },
                        ...(onBroadcast ? [{ label:"📢 Broadcast", action:()=>{ onBroadcast(); setShowHeaderMenu(false); } }] : []),
                        ...(onCreateChannel ? [{ label:"➕ New Group", action:()=>{ onCreateChannel(); setShowHeaderMenu(false); } }] : []),
                      ] : []),
                      { label:"👤 Edit My Profile", action:()=>{ setEditProfileName(profile?.full_name||""); setEditProfileAr((profile as any)?.full_name_ar||""); setShowProfileEdit(true); setShowHeaderMenu(false); } },
                    ].map((item,i) => (
                      <button key={i} onClick={item.action}
                        style={{ width:"100%", padding:"13px 16px", background:"none", border:"none", cursor:"pointer", textAlign:"left" as const, fontSize:14, color:"#333", fontFamily:"'Cairo',sans-serif", borderTop:i>0?"1px solid #f5f5f5":"none" }}>
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Search bar */}
            {showSearch && (
              <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 12px", background:"#f5f0e8", borderBottom:"1px solid #e0e0e0", flexShrink:0 }}>
                <Search style={{ width:14, height:14, color:"#999" }} />
                <input autoFocus value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="Search messages…"
                  style={{ flex:1, background:"none", border:"none", outline:"none", fontSize:13, color:"#333" }} />
                <button onClick={()=>{ setShowSearch(false); setSearchQuery(""); }} style={{ background:"none", border:"none", cursor:"pointer" }}>
                  <X style={{ width:14, height:14, color:"#999" }} />
                </button>
              </div>
            )}

            {/* Admin bar */}
            {canModerate && (
              <div style={{ display:"flex", alignItems:"center", gap:8, padding:"4px 12px", background:"#f5f0e8", borderBottom:"1px solid #e8e0d0", flexShrink:0 }}>
                <span style={{ fontSize:10, color:"#999", flex:1 }}>👑 Admin</span>
                <button onClick={()=>setChannelLocked(v=>!v)} style={{ fontSize:10, padding:"2px 8px", borderRadius:10, color:"#fff", background:channelLocked?"#EF4444":"#9e9e9e", border:"none", cursor:"pointer" }}>
                  {channelLocked?"🔒 Locked":"🔓 Open"}
                </button>
              </div>
            )}

            {/* Pinned */}
            {pinnedMessages.length > 0 && showPinnedBar && (
              <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 12px", background:"#f0f7f4", borderBottom:"1px solid #ddd", cursor:"pointer", flexShrink:0 }}
                onClick={()=>{ const el=document.getElementById(`msg-${pinnedMessages[0].id}`); el?.scrollIntoView({behavior:"smooth"}); }}>
                <div style={{ width:3, height:28, background:WA_GREEN, borderRadius:2, flexShrink:0 }} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:10, fontWeight:700, color:WA_GREEN }}>Pinned Message</div>
                  <div style={{ fontSize:12, color:"#666", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{pinnedMessages[0].text}</div>
                </div>
                <button onClick={e=>{ e.stopPropagation(); setShowPinnedBar(false); }} style={{ background:"none", border:"none", cursor:"pointer" }}>
                  <X style={{ width:14, height:14, color:"#999" }} />
                </button>
              </div>
            )}

            {/* Messages area */}
            <div ref={scrollRef} style={{ flex:1, overflowY:"auto", background:WA_BG, backgroundImage:WA_PATTERN, padding:"8px 0", minHeight:0 }}>
              {loadingMessages && (
                <div style={{ textAlign:"center", padding:"20px", color:"#999", fontSize:12 }}>Loading messages…</div>
              )}
              {!loadingMessages && filtered.length === 0 && (
                <div style={{ textAlign:"center", padding:"40px 20px", color:"#999", fontSize:13 }}>
                  {searchQuery ? "No messages found" : "No messages yet. Say hello! 👋"}
                </div>
              )}
              {filtered.map((m,i) => <div id={`msg-${m.id}`} key={m.id}><MsgBubble m={m} idx={i} /></div>)}

              {/* Typing indicator */}
              {typingUsers.length > 0 && (
                <div style={{ display:"flex", alignItems:"center", gap:8, padding:"4px 14px" }}>
                  <div style={{ background:"#fff", borderRadius:"12px 12px 12px 2px", padding:"8px 14px", boxShadow:"0 1px 2px rgba(0,0,0,.1)", display:"flex", gap:4 }}>
                    {[0,1,2].map(i => <div key={i} style={{ width:7, height:7, borderRadius:"50%", background:"#999", animation:`bounce 1.2s ease-in-out ${i*0.2}s infinite` }} />)}
                  </div>
                  <span style={{ fontSize:10, color:"#999" }}>{typingUsers[0]} typing…</span>
                </div>
              )}
            </div>

            {/* Reply preview */}
            {replyTo && (
              <div style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 14px", background:"#f0f2f5", borderTop:"1px solid #e0e0e0", flexShrink:0 }}>
                <div style={{ width:3, height:36, background:WA_GREEN, borderRadius:2 }} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:WA_GREEN }}>{profiles[replyTo.user_id]?.full_name || "User"}</div>
                  <div style={{ fontSize:12, color:"#666", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{replyTo.text || "📎 Media"}</div>
                </div>
                <button onClick={()=>setReplyTo(null)} style={{ background:"none", border:"none", cursor:"pointer" }}>
                  <X style={{ width:16, height:16, color:"#999" }} />
                </button>
              </div>
            )}

            {/* Recording bar */}
            {isRecording && (
              <div style={{ display:"flex", alignItems:"center", gap:12, padding:"8px 16px", background:"#FEE2E2", flexShrink:0 }}>
                <div style={{ width:10, height:10, borderRadius:"50%", background:"#EF4444", animation:"pulse 1s infinite" }} />
                <span style={{ fontSize:13, color:"#b91c1c", flex:1 }}>🎙️ {fr(recordingTime)}</span>
                <button onClick={stopRecording} style={{ fontSize:12, color:"#b91c1c", border:"1px solid #fca5a5", borderRadius:20, padding:"4px 12px", background:"none", cursor:"pointer", display:"flex", alignItems:"center", gap:4 }}>
                  <MicOff style={{ width:12, height:12 }} /> Stop
                </button>
              </div>
            )}

            {/* Emoji picker */}
            {showEmojiBar && (
              <div style={{ padding:"8px 12px", display:"flex", flexWrap:"wrap" as const, gap:8, borderTop:"1px solid #e0e0e0", background:"#f0f2f5", flexShrink:0 }}>
                {["😊","❤️","😂","😮","😢","🙏","👍","👎","🔥","🎉","🤲","💯","✅","📖","🌙","🕌","🤍","😍","🫂","☝️"].map(e=>(
                  <button key={e} onClick={()=>setInput(p=>p+e)} style={{ fontSize:22, background:"none", border:"none", cursor:"pointer", lineHeight:1 }}>{e}</button>
                ))}
              </div>
            )}

            {/* ── Input bar ── */}
            {canSend() ? (
              <div style={{ display:"flex", alignItems:"flex-end", gap:6, padding:"6px 8px", background:"#f0f2f5", flexShrink:0 }}>
                <input ref={imageInputRef} type="file" accept="image/*" style={{ display:"none" }} onChange={e=>{ if(e.target.files?.[0]) handleFileUpload(e.target.files[0],"image"); }} />
                <input ref={fileInputRef}  type="file" accept=".pdf,.doc,.docx,.xlsx,.pptx,.txt" style={{ display:"none" }} onChange={e=>{ if(e.target.files?.[0]) handleFileUpload(e.target.files[0],"file"); }} />

                {/* Emoji */}
                <button onClick={()=>setShowEmojiBar(v=>!v)} style={{ background:"none", border:"none", cursor:"pointer", padding:6, color:"#666", flexShrink:0 }}>
                  <Smile style={{ width:22, height:22 }} />
                </button>

                {/* Text input */}
                <div style={{ display:"flex", alignItems:"center", background:"#fff", borderRadius:24, flex:1, padding:"0 12px", boxShadow:"0 1px 2px rgba(0,0,0,.1)", minWidth:0 }}>
                  <input ref={inputRef} value={input}
                    onChange={e=>{ setInput(e.target.value); handleTyping(); }}
                    onKeyDown={e=>{ if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); sendMessage(); } }}
                    placeholder={channelLocked&&!canModerate?"Channel is locked":"Type a message…"}
                    dir="auto"
                    style={{ flex:1, border:"none", outline:"none", fontSize:14, background:"transparent", padding:"9px 0", color:"#333", minWidth:0 }} />
                  {/* Attachment + Image inside input */}
                  <button onClick={()=>imageInputRef.current?.click()} style={{ background:"none", border:"none", cursor:"pointer", color:"#999", padding:"0 4px", flexShrink:0 }}>
                    <Image style={{ width:20, height:20 }} />
                  </button>
                  <button onClick={()=>fileInputRef.current?.click()} style={{ background:"none", border:"none", cursor:"pointer", color:"#999", padding:"0 4px", flexShrink:0 }}>
                    <Paperclip style={{ width:20, height:20 }} />
                  </button>
                </div>

                {/* Send / Mic button — ALWAYS outside, never hidden */}
                <button
                  onClick={input.trim() ? ()=>sendMessage() : (isRecording ? stopRecording : startRecording)}
                  style={{ width:44, height:44, borderRadius:"50%", background:isRecording?"#EF4444":WA_GREEN, border:"none", color:"#fff", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, boxShadow:"0 2px 6px rgba(0,0,0,.25)" }}
                >
                  {input.trim()
                    ? <Send style={{ width:18, height:18 }} />
                    : isRecording
                    ? <MicOff style={{ width:18, height:18 }} />
                    : <Mic style={{ width:18, height:18 }} />}
                </button>
              </div>
            ) : (
              <div style={{ padding:"12px 16px", textAlign:"center", fontSize:13, color:"#999", background:"#f0f2f5", flexShrink:0 }}>
                {channelLocked ? "🔒 Channel is locked" : "Only admins can post here"}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <CreateChannelDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} mode="menu" onCreated={handleChannelCreated} />
      <BrowseChannelsDialog open={showBrowseChannels} onOpenChange={setShowBrowseChannels} myChannelIds={channels.map(c=>c.id)} onJoined={(id)=>{ handleChannelCreated(id); setShowBrowseChannels(false); }} />
      <GroupInfoPanel open={showGroupInfo} onOpenChange={setShowGroupInfo} channel={activeChannel}
        onUpdated={()=>{ if(activeChannelId) supabase.from("chat_channels" as any).select("*").eq("id",activeChannelId).single().then(({data})=>{ if(data) setChannels(prev=>prev.map(c=>c.id===activeChannelId?data as unknown as ChatChannel:c)); }); }}
        onMemberTap={(member)=>{ setSelectedMember(member); setShowStudentProfile(true); }} />
      <StudentProfileSheet open={showStudentProfile} onOpenChange={setShowStudentProfile} member={selectedMember} />

      <style>{`
        @keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-6px)} }
        @keyframes pulse  { 0%,100%{opacity:1} 50%{opacity:0.5} }
      `}</style>
    </div>
  );
};

export default Majlis;
