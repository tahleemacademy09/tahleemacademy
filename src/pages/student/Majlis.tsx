/*  src/pages/student/Majlis.tsx
    ADVANCED \u2014 Edit messages, forward, multi-select, text formatting,
    @mentions, online presence, clear chat, export chat, disappearing msgs
*/
import { useEffect, useState, useRef, useCallback } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Send, MessageCircle, Reply, CheckCheck, Mic, MicOff,
  Image, Paperclip, Smile, ArrowLeft, FileText, Trash2,
  X, Pin, Search, Star, Ban, Volume2, VolumeX, MoreVertical,
  Copy, Camera, Check, Download, Loader2, Forward,
  Edit2, CheckSquare, Square, Share2, Clock, FileDown,
  AtSign, Eraser, ChevronRight
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import MajlisSidebar from "@/components/majlis/MajlisSidebar";
import CreateChannelDialog from "@/components/majlis/CreateChannelDialog";
import BrowseChannelsDialog from "@/components/majlis/BrowseChannelsDialog";
import GroupInfoPanel from "@/components/majlis/GroupInfoPanel";
import StudentProfileSheet from "@/components/majlis/StudentProfileSheet";
import MessageReactions from "@/components/majlis/MessageReactions";
import type { ChatChannel, ChatMessage, UserProfile } from "@/components/majlis/types";

const WA_GREEN     = "#075E54";
const WA_BUBBLE_ME = "#DCF8C6";
const WA_BG        = "#FAFAF5";
const WA_PATTERN   = `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none'%3E%3Cg fill='%23064E3B' fill-opacity='0.03'%3E%3Cpath d='M30 0l30 30-30 30L0 30z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`;
const BUCKET       = "majlis-media";
// Edit window: 15 minutes
const EDIT_WINDOW_MS = 15 * 60 * 1000;

interface MajlisProps { adminMode?: boolean; onBroadcast?: () => void; onCreateChannel?: () => void; }

const isStoragePath = (s: string) =>
  s && !s.startsWith("http") && !s.startsWith("data:") && !s.startsWith("blob:");

const resolveMedia = async (path: string): Promise<string | null> => {
  if (!path) return null;
  if (!isStoragePath(path)) return path;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl || null;
};

// \u2500\u2500 Text formatter: *bold* _italic_ ~strike~ `mono` \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
const FormattedText = ({ text }: { text: string }) => {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  const patterns: [RegExp, string][] = [
    [/\*([^*]+)\*/g, "bold"],
    [/_([^_]+)_/g, "italic"],
    [/~([^~]+)~/g, "strike"],
    [/`([^`]+)`/g, "mono"],
  ];

  // Simple sequential rendering using regex replace
  const rendered = remaining
    .replace(/\*([^*\n]+)\*/g, `<b>$1</b>`)
    .replace(/_([^_\n]+)_/g, `<i>$1</i>`)
    .replace(/~([^~\n]+)~/g, `<s>$1</s>`)
    .replace(/`([^`\n]+)`/g, `<code style="background:rgba(0,0,0,0.08);padding:1px 4px;border-radius:3px;font-family:monospace;font-size:12px">$1</code>`);

  return (
    <span
      style={{ whiteSpace: "pre-wrap" }}
      dangerouslySetInnerHTML={{ __html: rendered }}
    />
  );
};

// \u2500\u2500 Audio message component \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
const AudioMsg = ({ path }: { path: string }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => { resolveMedia(path).then(u => { if (u) setUrl(u); else setErr(true); }); }, [path]);
  if (err)  return <span style={{ fontSize: 11, opacity: .6 }}>Audio unavailable</span>;
  if (!url) return <span style={{ fontSize: 11, opacity: .6 }}>Loading\u2026</span>;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 180 }}>
      <div style={{ width: 30, height: 30, borderRadius: "50%", background: WA_GREEN, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Mic style={{ width: 14, height: 14, color: "#fff" }} />
      </div>
      <audio controls src={url} style={{ height: 30, flex: 1, maxWidth: 160 }} />
    </div>
  );
};

// \u2500\u2500 Image message component \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
const ImageMsg = ({ path, text }: { path?: string | null; text?: string | null }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true); setErr(false);
    const src = path || text || "";
    if (!src) { setErr(true); setLoading(false); return; }
    resolveMedia(src).then(u => {
      if (u) setUrl(u);
      else if (text?.startsWith("data:image")) setUrl(text);
      else setErr(true);
      setLoading(false);
    });
  }, [path, text]);
  if (loading) return <div style={{ width: 180, height: 120, borderRadius: 8, background: "#e0e0e0", display: "flex", alignItems: "center", justifyContent: "center" }}><Loader2 style={{ width: 20, height: 20, color: "#999", animation: "spin .8s linear infinite" }} /></div>;
  if (err || !url) return <div style={{ width: 140, height: 80, borderRadius: 8, background: "#f0f0f0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}><Image style={{ width: 20, height: 20, color: "#bbb" }} /><span style={{ fontSize: 10, color: "#bbb" }}>Unavailable</span></div>;
  return <img src={url} style={{ maxWidth: 220, maxHeight: 260, borderRadius: 8, cursor: "pointer", display: "block", objectFit: "cover" }} alt="shared" loading="lazy" onClick={() => window.open(url, "_blank")} />;
};

// \u2500\u2500 File message component \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
const FileMsg = ({ path, text }: { path: string; text: string | null }) => {
  const [dl, setDl] = useState(false);
  const open = async () => { setDl(true); const url = await resolveMedia(path); setDl(false); if (url) window.open(url, "_blank"); };
  const fn = text || path.split("/").pop() || "file";
  const ext = fn.split(".").pop()?.toUpperCase() || "FILE";
  return (
    <button onClick={open} style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(0,0,0,0.06)", border: "none", cursor: "pointer", padding: "8px 12px", borderRadius: 10, minWidth: 160 }}>
      <div style={{ width: 36, height: 36, borderRadius: 8, background: WA_GREEN, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {dl ? <Loader2 style={{ width: 16, height: 16, color: "#fff", animation: "spin .8s linear infinite" }} /> : <FileText style={{ width: 16, height: 16, color: "#fff" }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0, textAlign: "left" as const }}>
        <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, maxWidth: 140 }}>{fn}</div>
        <div style={{ fontSize: 10, color: "#888", marginTop: 1 }}>{ext} \u00b7 tap to open</div>
      </div>
      <Download style={{ width: 14, height: 14, color: "#666", flexShrink: 0 }} />
    </button>
  );
};

// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
const Majlis = ({ adminMode = false, onBroadcast, onCreateChannel }: MajlisProps) => {
  const { t, language }            = useLanguage();
  const { user, profile, hasRole } = useAuth();
  const { toast }                  = useToast();

  // Core state
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
  const [uploading, setUploading]             = useState(false);
  const [onlineUsers, setOnlineUsers]         = useState<Set<string>>(new Set());

  // Input state
  const [input, setInput]           = useState("");
  const [replyTo, setReplyTo]       = useState<ChatMessage | null>(null);
  const [editingMsg, setEditingMsg] = useState<ChatMessage | null>(null);
  const [isRecording, setIsRecording]   = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  // NEW: multi-select
  const [selectMode, setSelectMode]         = useState(false);
  const [selectedIds, setSelectedIds]       = useState<Set<string>>(new Set());

  // NEW: forward
  const [forwardMsg, setForwardMsg]         = useState<ChatMessage | null>(null);
  const [showForwardSheet, setShowForwardSheet] = useState(false);

  // NEW: @mention
  const [mentionQuery, setMentionQuery]     = useState<string | null>(null);
  const [mentionList, setMentionList]       = useState<UserProfile[]>([]);

  // NEW: disappearing messages (in minutes, 0 = off)
  const [disappearTimer, setDisappearTimer] = useState(0);
  const [showDisappearMenu, setShowDisappearMenu] = useState(false);

  // UI state
  const [mobileShowChat, setMobileShowChat]         = useState(false);
  const [showCreateDialog, setShowCreateDialog]     = useState(false);
  const [showBrowseChannels, setShowBrowseChannels] = useState(false);
  const [showGroupInfo, setShowGroupInfo]           = useState(false);
  const [selectedMember, setSelectedMember]         = useState<any>(null);
  const [showStudentProfile, setShowStudentProfile] = useState(false);
  const [showSearch, setShowSearch]                 = useState(false);
  const [searchQuery, setSearchQuery]               = useState("");
  const [showMessageMenu, setShowMessageMenu]       = useState<string | null>(null);
  const [showDeleteSheet, setShowDeleteSheet]       = useState<string | null>(null);
  const [showPinnedBar, setShowPinnedBar]           = useState(true);
  const [showEmojiBar, setShowEmojiBar]             = useState(false);
  const [editingChannel, setEditingChannel]         = useState(false);
  const [editName, setEditName]                     = useState("");
  const [editDesc, setEditDesc]                     = useState("");
  const [showHeaderMenu, setShowHeaderMenu]         = useState(false);
  const [showProfileEdit, setShowProfileEdit]       = useState(false);
  const [editProfileName, setEditProfileName]       = useState("");
  const [editProfileAr, setEditProfileAr]           = useState("");
  const [savingProfile, setSavingProfile]           = useState(false);

  const scrollRef         = useRef<HTMLDivElement>(null);
  const inputRef          = useRef<HTMLInputElement>(null);
  const fileInputRef      = useRef<HTMLInputElement>(null);
  const imageInputRef     = useRef<HTMLInputElement>(null);
  const avatarInputRef    = useRef<HTMLInputElement>(null);
  const profileAvatarRef  = useRef<HTMLInputElement>(null);
  const mediaRecorderRef  = useRef<MediaRecorder | null>(null);
  const chunksRef         = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);
  const typingTimerRef    = useRef<any>(null);

  const isAdmin     = hasRole("admin");
  const isTeacher   = hasRole("teacher");
  const canModerate = isAdmin || isTeacher || adminMode;
  const activeChannel = channels.find(c => c.id === activeChannelId) || null;

  // \u2500\u2500 Init bucket \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  useEffect(() => {
    supabase.storage.getBucket(BUCKET).then(({ error }) => {
      if (error) supabase.storage.createBucket(BUCKET, { public: false }).catch(() => {});
    });
  }, []);

  // \u2500\u2500 Online presence tracking \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  useEffect(() => {
    if (!user) return;
    const presenceCh = supabase.channel("online-presence")
      .on("presence", { event: "sync" }, () => {
        const state = presenceCh.presenceState();
        const ids = new Set<string>(
          Object.values(state).flatMap((s: any) => s.map((x: any) => x.user_id))
        );
        setOnlineUsers(ids);
      })
      .subscribe(async status => {
        if (status === "SUBSCRIBED") {
          await presenceCh.track({ user_id: user.id });
        }
      });
    return () => { supabase.removeChannel(presenceCh); };
  }, [user]);

  // \u2500\u2500 Load channels \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data: memberData } = await supabase.from("chat_members" as any).select("channel_id").eq("user_id", user.id);
      const ids = (memberData || []).map((m: any) => m.channel_id);
      const { data: pub  } = await supabase.from("chat_channels" as any).select("*").eq("is_private", false);
      const { data: priv } = ids.length > 0 ? await supabase.from("chat_channels" as any).select("*").in("id", ids) : { data: [] };
      const all = Array.from(new Map([...(priv || []), ...(pub || [])].map((c: any) => [c.id, c])).values()) as unknown as ChatChannel[];
      setChannels(all);
      await autoJoinLevel(user.id, profile?.level);
      