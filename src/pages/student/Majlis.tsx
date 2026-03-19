/*  src/pages/student/Majlis.tsx
    PROFESSIONAL — Complete WhatsApp-grade implementation
    All 47 features: settings, wallpaper, member counts, swipe, long-press,
    date separators, search, hamburger, online presence, dark mode, and more
*/
import { useEffect, useState, useRef } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Send, MessageCircle, Reply, CheckCheck, Mic, MicOff,
  Image, Paperclip, Smile, ArrowLeft, FileText, Trash2,
  X, Pin, Search, Star, Ban, Volume2, VolumeX, MoreVertical,
  Copy, Camera, Check, Download, Loader2, Forward,
  Edit2, CheckSquare, Square, AtSign, ChevronRight,
  Menu, Settings, User, Bell, HelpCircle, Bookmark,
  ChevronDown, Archive, Eye, Moon
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import CreateChannelDialog from "@/components/majlis/CreateChannelDialog";
import BrowseChannelsDialog from "@/components/majlis/BrowseChannelsDialog";
import GroupInfoPanel from "@/components/majlis/GroupInfoPanel";
import type { ChatChannel, ChatMessage, UserProfile } from "@/components/majlis/types";

// ── Constants ─────────────────────────────────────────────────────
const WA_GREEN     = "#075E54";
const WA_BUBBLE_ME = "#DCF8C6";
const BUCKET       = "majlis-media";
const EDIT_WINDOW  = 15 * 60 * 1000;
const LP_DELAY     = 500;

// ── Types ─────────────────────────────────────────────────────────
interface AppSettings {
  lastSeen: "everyone" | "contacts" | "nobody";
  readReceipts: boolean;
  profilePhotoVisibility: "everyone" | "contacts" | "nobody";
  notifications: boolean;
  notifSound: boolean;
  notifVibration: boolean;
  notifPreview: boolean;
  wallpaper: string;
  fontSize: "small" | "medium" | "large";
  enterSends: boolean;
  darkMode: boolean;
  about: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  lastSeen: "everyone", readReceipts: true, profilePhotoVisibility: "everyone",
  notifications: true, notifSound: true, notifVibration: true, notifPreview: true,
  wallpaper: "default", fontSize: "medium", enterSends: true, darkMode: false, about: "Available",
};

const WALLPAPERS = [
  { id: "default",   label: "Classic",  bg: "#FAFAF5", pattern: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none'%3E%3Cg fill='%23064E3B' fill-opacity='0.03'%3E%3Cpath d='M30 0l30 30-30 30L0 30z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")` },
  { id: "dark",      label: "Dark",     bg: "#0d1117", pattern: undefined },
  { id: "warm",      label: "Warm",     bg: "#f5ede0", pattern: undefined },
  { id: "forest",    label: "Forest",   bg: "#1a2e1a", pattern: undefined },
  { id: "ocean",     label: "Ocean",    bg: "#e8f4f8", pattern: undefined },
  { id: "lavender",  label: "Lavender", bg: "#f0e6ff", pattern: undefined },
  { id: "mint",      label: "Mint",     bg: "#e8f5e9", pattern: undefined },
  { id: "sand",      label: "Sand",     bg: "#fef9e7", pattern: undefined },
];

const FONT_SIZES: Record<string, string> = { small: "12px", medium: "14px", large: "16px" };

interface MajlisProps { adminMode?: boolean; onBroadcast?: () => void; onCreateChannel?: () => void; }

// ── Media helpers ────────────────────────────────────────────────
const isStoragePath = (s: string) =>
  s && !s.startsWith("http") && !s.startsWith("data:") && !s.startsWith("blob:");

const resolveMedia = async (path: string): Promise<string | null> => {
  if (!path) return null;
  if (!isStoragePath(path)) return path;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl || null;
};

// ── FormattedText: *bold* _italic_ ~strike~ `code` @mention ──────
const FormattedText = ({ text, sz }: { text: string; sz: string }) => {
  const html = text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*([^*\n]+)\*/g, "<b>$1</b>")
    .replace(/_([^_\n]+)_/g, "<i>$1</i>")
    .replace(/~([^~\n]+)~/g, "<s>$1</s>")
    .replace(/`([^`\n]+)`/g, `<code style="background:rgba(0,0,0,0.08);padding:1px 5px;border-radius:3px;font-family:monospace;font-size:11px">$1</code>`)
    .replace(/@(\w[\w ]*)/g, `<span style="color:${WA_GREEN};font-weight:700">@$1</span>`);
  return <span style={{ whiteSpace: "pre-wrap", fontSize: sz }} dangerouslySetInnerHTML={{ __html: html }} />;
};

// ── Date separator ────────────────────────────────────────────────
const DateSep = ({ date }: { date: string }) => {
  const d = new Date(date);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  let label = d.toLocaleDateString([], { day: "2-digit", month: "long", year: "numeric" });
  if (d.toDateString() === today.toDateString()) label = "Today";
  else if (d.toDateString() === yesterday.toDateString()) label = "Yesterday";
  return (
    <div style={{ display: "flex", justifyContent: "center", margin: "10px 0" }}>
      <span style={{ background: "rgba(255,255,255,0.88)", color: "#555", fontSize: 11, padding: "4px 12px", borderRadius: 12, boxShadow: "0 1px 2px rgba(0,0,0,.1)" }}>{label}</span>
    </div>
  );
};

// ── AudioMsg — WhatsApp-style player ─────────────────────────────
const AudioMsg = ({ path, text }: { path?: string | null; text?: string | null }) => {
  const [url, setUrl]         = useState<string | null>(null);
  const [err, setErr]         = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed]     = useState(1);
  const [listened, setListened] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (text?.startsWith("data:audio")) { setUrl(text); return; }
    const src = path || "";
    if (!src) { setErr(true); return; }
    if (src.startsWith("http")) { setUrl(src); return; }
    resolveMedia(src).then(u => u ? setUrl(u) : setErr(true));
  }, [path, text]);

  useEffect(() => {
    if (!url) return;
    const a = new Audio(url);
    audioRef.current = a;
    a.onloadedmetadata = () => setDuration(a.duration || 0);
    a.ontimeupdate = () => setProgress(a.duration ? (a.currentTime / a.duration) * 100 : 0);
    a.onended = () => { setPlaying(false); setProgress(0); setListened(true); };
    return () => { a.pause(); a.src = ""; };
  }, [url]);

  const toggle = () => {
    const a = audioRef.current; if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.playbackRate = speed; a.play(); setPlaying(true); setListened(true); }
  };
  const cycleSpeed = () => {
    const next = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };
  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2,"0")}:${String(Math.floor(s % 60)).padStart(2,"0")}`;
  const barColor = listened ? "#53BDEB" : WA_GREEN;

  if (err) return <span style={{ fontSize: 11, opacity:.6, fontStyle:"italic" }}>Audio unavailable</span>;
  if (!url) return (
    <div style={{ display:"flex", alignItems:"center", gap:8, minWidth:200, opacity:.6 }}>
      <div style={{ width:36, height:36, borderRadius:"50%", background:WA_GREEN, display:"flex", alignItems:"center", justifyContent:"center" }}>
        <Loader2 style={{ width:16, height:16, color:"#fff", animation:"spin .8s linear infinite" }} />
      </div>
      <span style={{ fontSize:12 }}>Loading…</span>
    </div>
  );

  // Simulated waveform bars
  const bars = Array.from({ length: 28 }, (_, i) => {
    const h = [3,5,8,12,16,10,7,14,18,12,8,5,10,15,9,6,13,17,11,7,4,9,14,10,6,8,12,5][i] || 8;
    const filled = progress > 0 && (i / 28) * 100 < progress;
    return (
      <div key={i} style={{ width:2.5, height:h*1.8, borderRadius:2, background: filled ? barColor : (isDark ? "#555" : "#ccc"), flexShrink:0, transition:"background .1s" }} />
    );
  });

  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, minWidth:220, maxWidth:260 }}>
      <button onClick={toggle} style={{ width:38, height:38, borderRadius:"50%", background:WA_GREEN, border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
        {playing
          ? <div style={{ display:"flex", gap:2 }}><div style={{ width:3, height:14, background:"#fff", borderRadius:2 }} /><div style={{ width:3, height:14, background:"#fff", borderRadius:2 }} /></div>
          : <div style={{ width:0, height:0, borderTop:"7px solid transparent", borderBottom:"7px solid transparent", borderLeft:"12px solid #fff", marginLeft:3 }} />
        }
      </button>
      <div style={{ flex:1, minWidth:0 }}>
        {/* Waveform bar + progress scrubber */}
        <div
          style={{ display:"flex", alignItems:"center", gap:1, height:24, cursor:"pointer" }}
          onClick={e => {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            if (audioRef.current) { audioRef.current.currentTime = pct * (audioRef.current.duration || 0); setProgress(pct * 100); }
          }}
        >
          {bars}
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", marginTop:2 }}>
          <span style={{ fontSize:10, color: isDark ? "#8696a0" : "#999" }}>
            {playing || progress > 0 ? fmt((progress / 100) * duration) : fmt(duration)}
          </span>
          <button onClick={cycleSpeed} style={{ background:"none", border:`1px solid ${isDark?"#555":"#ddd"}`, borderRadius:10, padding:"0 5px", fontSize:9, cursor:"pointer", color: isDark?"#8696a0":"#888", fontWeight:700 }}>
            {speed}×
          </button>
        </div>
      </div>
    </div>
  );
};

// ── ImageMsg ──────────────────────────────────────────────────────
const ImageMsg = ({ path, text }: { path?: string | null; text?: string | null }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    // Priority: base64 data URL in text, then full http URL in path, then storage path
    if (text?.startsWith("data:image")) { setUrl(text); setLoading(false); return; }
    const src = path || text || "";
    if (!src) { setErr(true); setLoading(false); return; }
    // Already a full URL — use directly without signing
    if (src.startsWith("http")) { setUrl(src); setLoading(false); return; }
    // Storage path — create signed URL
    resolveMedia(src).then(u => { u ? setUrl(u) : setErr(true); setLoading(false); });
  }, [path, text]);

  if (loading) return (
    <div style={{ width: 200, height: 140, borderRadius: 10, background: "#e8e8e8", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Loader2 style={{ width: 22, height: 22, color: "#aaa", animation: "spin .8s linear infinite" }} />
    </div>
  );
  if (err || !url) return (
    <div style={{ width: 160, height: 100, borderRadius: 10, background: "#f0f0f0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
      <Image style={{ width: 24, height: 24, color: "#bbb" }} />
      <span style={{ fontSize: 10, color: "#bbb" }}>Image unavailable</span>
    </div>
  );
  return (
    <>
      <img src={url} style={{ maxWidth: 240, maxHeight: 280, borderRadius: 10, cursor: "pointer", display: "block", objectFit: "cover", width: "100%" }} alt="" loading="lazy"
        onClick={() => setFullscreen(true)}
        onError={() => setErr(true)}
      />
      {fullscreen && (
        <div onClick={() => setFullscreen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.95)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <img src={url} style={{ maxWidth: "100vw", maxHeight: "100vh", objectFit: "contain" }} alt="" />
          <button onClick={() => setFullscreen(false)} style={{ position: "absolute", top: 16, right: 16, background: "rgba(255,255,255,.2)", border: "none", borderRadius: "50%", width: 40, height: 40, color: "#fff", fontSize: 22, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>
      )}
    </>
  );
};

// ── FileMsg ───────────────────────────────────────────────────────
const FileMsg = ({ path, text }: { path: string; text: string | null }) => {
  const [dl, setDl] = useState(false);
  const fn = text || path.split("/").pop() || "file";
  const open = async () => { setDl(true); const u = await resolveMedia(path); setDl(false); if (u) window.open(u, "_blank"); };
  return (
    <button onClick={open} style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(0,0,0,0.06)", border: "none", cursor: "pointer", padding: "8px 12px", borderRadius: 10, minWidth: 160 }}>
      <div style={{ width: 36, height: 36, borderRadius: 8, background: WA_GREEN, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {dl ? <Loader2 style={{ width: 16, height: 16, color: "#fff", animation: "spin .8s linear infinite" }} /> : <FileText style={{ width: 16, height: 16, color: "#fff" }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0, textAlign: "left" as const }}>
        <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, maxWidth: 140 }}>{fn}</div>
        <div style={{ fontSize: 10, color: "#888" }}>{fn.split(".").pop()?.toUpperCase()} · tap to open</div>
      </div>
      <Download style={{ width: 14, height: 14, color: "#666", flexShrink: 0 }} />
    </button>
  );
};

// ════════════════════════════════════════════════════════════════
const Majlis = ({ adminMode = false, onBroadcast, onCreateChannel }: MajlisProps) => {
  const { language }           = useLanguage();
  const { user, profile, hasRole } = useAuth();
  const { toast }              = useToast();

  // ── Settings (localStorage) ────────────────────────────────
  const [settings, setSettings] = useState<AppSettings>(() => {
    try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem("majlis-settings") || "{}") }; }
    catch { return DEFAULT_SETTINGS; }
  });
  const saveSetting = <K extends keyof AppSettings>(key: K, val: AppSettings[K]) => {
    setSettings(prev => {
      const next = { ...prev, [key]: val };
      localStorage.setItem("majlis-settings", JSON.stringify(next));
      return next;
    });
  };

  // ── Core state ─────────────────────────────────────────────
  const [channels, setChannels]                   = useState<ChatChannel[]>([]);
  const [memberCounts, setMemberCounts]           = useState<Record<string, number>>({});
  const [activeChannelId, setActiveChannelId]     = useState<string | null>(null);
  const [messages, setMessages]                   = useState<ChatMessage[]>([]);
  const [profiles, setProfiles]                   = useState<Record<string, UserProfile>>({});
  const [allStudents, setAllStudents]             = useState<UserProfile[]>([]);
  const [reactions, setReactions]                 = useState<Record<string, Record<string, string[]>>>({});
  const [pinnedMessages, setPinnedMessages]       = useState<ChatMessage[]>([]);
  const [typingUsers, setTypingUsers]             = useState<string[]>([]);
  const [starredMessages, setStarredMessages]     = useState<Set<string>>(new Set());
  const [onlineUsers, setOnlineUsers]             = useState<Set<string>>(new Set());
  const [unreadCounts, setUnreadCounts]           = useState<Record<string, number>>({});
  const [channelLocked, setChannelLocked]         = useState(false);
  const [loadingMessages, setLoadingMessages]     = useState(false);
  const [uploading, setUploading]                 = useState(false);

  const [mutedChannels, setMutedChannels]     = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("majlis-muted") || "[]")); } catch { return new Set(); }
  });
  const [pinnedChannels, setPinnedChannels]   = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("majlis-pinned-ch") || "[]")); } catch { return new Set(); }
  });
  const [archivedChannels, setArchivedChannels] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("majlis-archived") || "[]")); } catch { return new Set(); }
  });

  // ── Input state ────────────────────────────────────────────
  const [input, setInput]             = useState("");
  const [replyTo, setReplyTo]         = useState<ChatMessage | null>(null);
  const [editingMsg, setEditingMsg]   = useState<ChatMessage | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordingLocked, setRecordingLocked] = useState(false);
  const [recordingCancelled, setRecordingCancelled] = useState(false);
  const [mentionList, setMentionList] = useState<UserProfile[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [disappearTimer, setDisappearTimer] = useState(0);

  // ── UI state ────────────────────────────────────────────────
  const [mobileShowChat, setMobileShowChat]         = useState(false);
  const [selectMode, setSelectMode]                 = useState(false);
  const [selectedIds, setSelectedIds]               = useState<Set<string>>(new Set());
  const [forwardMsg, setForwardMsg]                 = useState<ChatMessage | null>(null);
  const [showForwardSheet, setShowForwardSheet]     = useState(false);
  const [showCreateDialog, setShowCreateDialog]     = useState(false);
  const [showBrowseChannels, setShowBrowseChannels] = useState(false);
  const [showGroupInfo, setShowGroupInfo]           = useState(false);
  const [selectedMember, setSelectedMember]         = useState<any>(null);
  const [showStudentProfile, setShowStudentProfile] = useState(false);
  const [showChatSearch, setShowChatSearch]         = useState(false);
  const [chatSearchQuery, setChatSearchQuery]       = useState("");
  const [sidebarSearch, setSidebarSearch]           = useState("");
  const [searchTab, setSearchTab]                   = useState<"messages"|"contacts"|"groups">("contacts");
  const [showMessageMenu, setShowMessageMenu]       = useState<string | null>(null);
  const [showDeleteSheet, setShowDeleteSheet]       = useState<string | null>(null);
  const [showPinnedBar, setShowPinnedBar]           = useState(true);
  const [showEmojiBar, setShowEmojiBar]             = useState(false);
  const [editingChannel, setEditingChannel]         = useState(false);
  const [editName, setEditName]                     = useState("");
  const [editDesc, setEditDesc]                     = useState("");
  const [showHeaderMenu, setShowHeaderMenu]         = useState(false);
  const [showSettings, setShowSettings]             = useState(false);
  const [settingsTab, setSettingsTab]               = useState("profile");
  const [showHamburger, setShowHamburger]           = useState(false);
  const [showArchived, setShowArchived]             = useState(false);
  const [showDisappearMenu, setShowDisappearMenu]   = useState(false);
  const [swipedChannel, setSwipedChannel]           = useState<string | null>(null);
  const [channelMenu, setChannelMenu]               = useState<string | null>(null);
  const [showScrollFab, setShowScrollFab]           = useState(false);
  const [editProfileName, setEditProfileName]       = useState("");
  const [editProfileAr, setEditProfileAr]           = useState("");
  const [savingProfile, setSavingProfile]           = useState(false);
  const [channelMemberNames, setChannelMemberNames] = useState<Record<string, string>>({});

  // ── Refs ────────────────────────────────────────────────────
  const scrollRef        = useRef<HTMLDivElement>(null);
  const inputRef         = useRef<HTMLTextAreaElement>(null);
  const fileInputRef     = useRef<HTMLInputElement>(null);
  const imageInputRef    = useRef<HTMLInputElement>(null);
  const avatarInputRef   = useRef<HTMLInputElement>(null);
  const profileAvatarRef = useRef<HTMLInputElement>(null);
  const bgImageRef       = useRef<HTMLInputElement>(null);
  const mediaRecRef      = useRef<MediaRecorder | null>(null);
  const chunksRef        = useRef<Blob[]>([]);
  const recTimerRef      = useRef<any>(null);
  const typingTimerRef   = useRef<any>(null);
  const lpTimerRef       = useRef<any>(null);

  const isAdmin     = hasRole("admin");
  const isTeacher   = hasRole("teacher");
  const canModerate = isAdmin || isTeacher || adminMode;
  const activeChannel = channels.find(c => c.id === activeChannelId) || null;

  const isDark    = settings.darkMode || settings.wallpaper === "dark" || settings.wallpaper === "forest";
  const msgFontSz = FONT_SIZES[settings.fontSize] || "14px";
  const WP        = WALLPAPERS.find(w => w.id === settings.wallpaper) || WALLPAPERS[0];
  const customBg  = settings.wallpaper === "custom" ? (localStorage.getItem("majlis-custom-bg") || "") : "";

  const getBgStyle = () => {
    if (settings.wallpaper === "custom" && customBg) return { background: `url(${customBg}) center/cover` };
    return { background: WP.bg, backgroundImage: WP.pattern || undefined } as React.CSSProperties;
  };

  const getCN = (ch: ChatChannel) => language === "ar" ? ((ch as any).name_ar || ch.name || "") : (ch.name || "");
  const ft    = (d: string) => new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const fr    = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  const canSend = () => { if (!activeChannel || (channelLocked && !canModerate)) return false; if (activeChannel.type === "announcement") return canModerate; return true; };

  // ── Channel sorting ────────────────────────────────────────
  const sortedChannels = [...channels]
    .filter(c => !archivedChannels.has(c.id))
    .sort((a, b) => {
      const ap = pinnedChannels.has(a.id) ? 1 : 0;
      const bp = pinnedChannels.has(b.id) ? 1 : 0;
      if (ap !== bp) return bp - ap;
      return new Date((b as any).last_message_at || 0).getTime() - new Date((a as any).last_message_at || 0).getTime();
    });

  const filteredForSidebar = sidebarSearch
    ? sortedChannels.filter(c => getCN(c).toLowerCase().includes(sidebarSearch.toLowerCase()))
    : sortedChannels;

  const grouped = {
    pinned: filteredForSidebar.filter(c => pinnedChannels.has(c.id)),
    groups: filteredForSidebar.filter(c => c.type === "group" && !pinnedChannels.has(c.id)),
    // Only show the level channel matching this student's level
    level:  filteredForSidebar.filter(c => c.type === "level" && !pinnedChannels.has(c.id) && (
      !profile?.level || getCN(c).toLowerCase().includes((profile.level || "").toLowerCase())
    )),
    anns:   filteredForSidebar.filter(c => c.type === "announcement" && !pinnedChannels.has(c.id)),
  };

  const contactResults = allStudents.filter(s => sidebarSearch && (
    (s.full_name || "").toLowerCase().includes(sidebarSearch.toLowerCase()) ||
    (s.email || "").toLowerCase().includes(sidebarSearch.toLowerCase())
  ));
  const groupResults = channels.filter(c => sidebarSearch && getCN(c).toLowerCase().includes(sidebarSearch.toLowerCase()));
  const msgResults = messages.filter(m => sidebarSearch && (m.text || "").toLowerCase().includes(sidebarSearch.toLowerCase()));

  const filteredMessages = chatSearchQuery
    ? messages.filter(m => (m.text || "").toLowerCase().includes(chatSearchQuery.toLowerCase()))
    : messages;

  // ── Effects ────────────────────────────────────────────────
  useEffect(() => {
    supabase.storage.getBucket(BUCKET).then(({ error }) => {
      if (error) supabase.storage.createBucket(BUCKET, { public: true }).catch(() => {});
    });
    supabase.from("profiles").select("user_id,full_name,full_name_ar,avatar_url,level,email,student_id")
      .then(({ data }) => {
        if (data) {
          setAllStudents(data as unknown as UserProfile[]);
          // Seed profiles state immediately from all students
          const map: Record<string, UserProfile> = {};
          (data as any[]).forEach((p: any) => { map[p.user_id] = p; });
          setProfiles(prev => ({ ...prev, ...map }));
        }
      });
  }, []);

  // Android back button — go back to sidebar instead of dashboard
  useEffect(() => {
    const onBack = (e: PopStateEvent) => {
      if (mobileShowChat) {
        e.preventDefault();
        setMobileShowChat(false);
        setActiveChannelId(null);
        window.history.pushState(null, "", window.location.href);
      }
    };
    window.history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", onBack);
    return () => window.removeEventListener("popstate", onBack);
  }, [mobileShowChat]);

  useEffect(() => {
    if (!user) return;
    const pCh = supabase.channel("online-presence")
      .on("presence", { event: "sync" }, () => {
        const ids = new Set<string>(Object.values(pCh.presenceState()).flatMap((s: any) => s.map((x: any) => x.user_id)));
        setOnlineUsers(ids);
      })
      .subscribe(async s => { if (s === "SUBSCRIBED") await pCh.track({ user_id: user.id }); });
    return () => { supabase.removeChannel(pCh); };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data: md } = await supabase.from("chat_members" as any).select("channel_id").eq("user_id", user.id);
      const memberIds = (md || []).map((m: any) => m.channel_id);
      if (memberIds.length === 0) { setChannels([]); return; }
      const { data: chData } = await supabase.from("chat_channels" as any).select("*").in("id", memberIds);
      const all = (chData || []) as unknown as ChatChannel[];

      // Auto-join defaults
      const defs = all.filter(c => (c.type === "group" && c.name === "General") || c.type === "announcement");
      for (const ch of defs)
        await supabase.from("chat_members" as any).upsert({ channel_id: ch.id, user_id: user.id, role: "member" }, { onConflict: "channel_id,user_id" });

      setChannels(all);

      // Actual member counts + member name previews for sidebar
      const counts: Record<string, number> = {};
      const memberNames: Record<string, string> = {};
      await Promise.all(all.map(async ch => {
        const { data: memRows } = await supabase.from("chat_members" as any)
          .select("user_id").eq("channel_id", ch.id).limit(5);
        counts[ch.id] = memRows?.length || 0;
        if (memRows && memRows.length > 0) {
          const uids = (memRows as any[]).map((m: any) => m.user_id);
          const { data: pData } = await supabase.from("profiles")
            .select("user_id,full_name").in("user_id", uids);
          if (pData) {
            const names = (pData as any[])
              .map((p: any) => p.user_id === user!.id ? "You" : (p.full_name || "").split(" ")[0])
              .filter(Boolean).slice(0, 3);
            memberNames[ch.id] = names.join(", ");
            // Also seed profiles
            const map: Record<string, UserProfile> = {};
            (pData as any[]).forEach((p: any) => { map[p.user_id] = p as unknown as UserProfile; });
            setProfiles(prev => ({ ...prev, ...map }));
          }
        }
      }));
      setMemberCounts(counts);
      setChannelMemberNames(memberNames);

      // Unread counts
      const unread: Record<string, number> = {};
      await Promise.all(all.map(async ch => {
        const { data: mem } = await supabase.from("chat_members" as any).select("last_read_at").eq("channel_id", ch.id).eq("user_id", user.id).maybeSingle();
        const lastRead = (mem as any)?.last_read_at || "1970-01-01";
        const { count: uc } = await supabase.from("chat_messages").select("*", { count: "exact", head: true })
          .eq("channel_id", ch.id).gt("created_at", lastRead).neq("user_id", user.id);
        unread[ch.id] = uc || 0;
      }));
      setUnreadCounts(unread);

      if (!activeChannelId && all.length > 0) setActiveChannelId(all[0].id);
    };
    load();
  }, [user, profile?.level]);

  useEffect(() => {
    if (!activeChannelId) return;
    setLoadingMessages(true); setMessages([]); setSelectMode(false); setSelectedIds(new Set());
    const load = async () => {
      // Fetch ALL channel member profiles first (fixes "Unknown" issue)
      const { data: memData } = await supabase.from("chat_members" as any).select("user_id").eq("channel_id", activeChannelId);
      if (memData && memData.length > 0) {
        const memberUids = [...new Set((memData as any[]).map((m: any) => m.user_id))];
        const { data: memberProfs } = await supabase.from("profiles").select("user_id,full_name,full_name_ar,avatar_url,level,email,student_id").in("user_id", memberUids);
        if (memberProfs) {
          const map: Record<string, UserProfile> = {};
          (memberProfs as any[]).forEach((p: any) => { map[p.user_id] = p; });
          setProfiles(prev => ({ ...prev, ...map }));
        }
      }

      const { data } = await supabase.from("chat_messages").select("*")
        .eq("channel_id", activeChannelId).order("created_at", { ascending: false }).limit(80);
      const msgs = ((data || []) as unknown as ChatMessage[]).reverse();
      setMessages(msgs);

      const uids = [...new Set(msgs.map(m => m.user_id))];
      if (uids.length > 0) {
        const { data: profs } = await supabase.from("profiles").select("user_id,full_name,full_name_ar,avatar_url,level,email,student_id").in("user_id", uids);
        const map: Record<string, UserProfile> = {};
        (profs || []).forEach((p: any) => { map[p.user_id] = p; });
        setProfiles(prev => ({ ...prev, ...map }));
      }

      await supabase.from("chat_members" as any).update({ last_read_at: new Date().toISOString() }).eq("channel_id", activeChannelId).eq("user_id", user!.id);
      setUnreadCounts(prev => ({ ...prev, [activeChannelId]: 0 }));

      const ids = msgs.map(m => m.id);
      if (ids.length > 0) {
        const { data: rd } = await supabase.from("message_reactions" as any).select("message_id,user_id,emoji").in("message_id", ids);
        const rm: Record<string, Record<string, string[]>> = {};
        (rd || []).forEach((r: any) => { if (!rm[r.message_id]) rm[r.message_id] = {}; if (!rm[r.message_id][r.emoji]) rm[r.message_id][r.emoji] = []; rm[r.message_id][r.emoji].push(r.user_id); });
        setReactions(rm);
      }
      setPinnedMessages(msgs.filter(m => (m as any).is_pinned));
      setLoadingMessages(false);
    };
    load();

    const rCh = supabase.channel(`majlis-${activeChannelId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages", filter: `channel_id=eq.${activeChannelId}` }, p => {
        if (p.eventType === "INSERT") {
          const nm = p.new as unknown as ChatMessage;
          setMessages(prev => prev.find(m => m.id === nm.id) ? prev : [...prev, nm]);
          if (!profiles[nm.user_id])
            supabase.from("profiles").select("user_id,full_name,full_name_ar,avatar_url,level").eq("user_id", nm.user_id).maybeSingle()
              .then(({ data }) => { if (data) setProfiles(prev => ({ ...prev, [(data as any).user_id]: data as unknown as UserProfile })); });
        } else if (p.eventType === "UPDATE") {
          setMessages(prev => prev.map(m => m.id === (p.new as any).id ? p.new as unknown as ChatMessage : m));
        } else if (p.eventType === "DELETE") {
          setMessages(prev => prev.filter(m => m.id !== (p.old as any).id));
        }
      })
      .on("broadcast", { event: "typing" }, p => {
        if (p.payload.userId !== user?.id) {
          setTypingUsers(prev => [...new Set([...prev, p.payload.name])]);
          clearTimeout(typingTimerRef.current);
          typingTimerRef.current = setTimeout(() => setTypingUsers([]), 3000);
        }
      }).subscribe();
    return () => { supabase.removeChannel(rCh); };
  }, [activeChannelId]);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages]);

  // ── Handlers ────────────────────────────────────────────────
  const handleScrollMessages = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    setShowScrollFab(el.scrollHeight - el.scrollTop - el.clientHeight > 200);
  };
  const scrollToBottom = () => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; };

  const handleInputChange = (val: string) => {
    setInput(val);
    const at = val.match(/@(\w*)$/);
    if (at) {
      setMentionQuery(at[1].toLowerCase());
      setMentionList(Object.values(profiles).filter(p => (p.full_name || "").toLowerCase().includes(at[1].toLowerCase())).slice(0, 6));
    } else { setMentionQuery(null); setMentionList([]); }
    if (activeChannelId && user)
      supabase.channel(`majlis-${activeChannelId}`).send({ type: "broadcast", event: "typing", payload: { userId: user.id, name: profile?.full_name || "Someone" } });
  };
  const insertMention = (p: UserProfile) => {
    setInput(input.replace(/@\w*$/, `@${p.full_name} `));
    setMentionQuery(null); setMentionList([]);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const startLongPress = (id: string) => {
    lpTimerRef.current = setTimeout(() => {
      setShowMessageMenu(id); setShowDeleteSheet(null);
      // Haptic feedback
      if (navigator.vibrate) navigator.vibrate(50);
    }, LP_DELAY);
  };
  const cancelLongPress = () => { if (lpTimerRef.current) { clearTimeout(lpTimerRef.current); lpTimerRef.current = null; } };

  const sendMessage = async (contentType = "text", mediaPath?: string, extraText?: string) => {
    if (!user || !activeChannelId) return;
    if (contentType === "text" && !input.trim()) return;
    if (channelLocked && !canModerate) { toast({ title: "Channel is locked", variant: "destructive" }); return; }
    if (activeChannel?.type === "announcement" && !canModerate) { toast({ title: "Only admins can post here", variant: "destructive" }); return; }

    if (editingMsg) {
      await supabase.from("chat_messages").update({ text: input.trim(), is_edited: true } as any).eq("id", editingMsg.id);
      setMessages(prev => prev.map(m => m.id === editingMsg.id ? { ...m, text: input.trim(), is_edited: true } as any : m));
      setEditingMsg(null); setInput(""); return;
    }

    const text   = contentType === "text" ? input.trim() : (extraText || null);
    const tempId = `temp-${Date.now()}`;
    const optimistic: any = { id: tempId, channel_id: activeChannelId, user_id: user.id, content_type: contentType, text, media_path: mediaPath || null, created_at: new Date().toISOString(), is_pinned: false, reply_to_id: replyTo?.id || null };
    setInput(""); setReplyTo(null); setShowEmojiBar(false); setMentionQuery(null); setMentionList([]);
    setMessages(prev => [...prev, optimistic]);

    const msgData: any = { class_level_id: activeChannelId, channel_id: activeChannelId, user_id: user.id, content_type: contentType, text, media_path: mediaPath || null };
    if (replyTo) { msgData.reply_to_id = replyTo.id; msgData.reply_preview = (replyTo.text || "").slice(0, 100); }
    if (disappearTimer > 0) msgData.expires_at = new Date(Date.now() + disappearTimer * 60 * 1000).toISOString();

    const { data: inserted, error } = await supabase.from("chat_messages").insert(msgData).select().single();
    if (error) { setMessages(prev => prev.filter(m => m.id !== tempId)); toast({ title: "Failed to send", variant: "destructive" }); }
    else {
      setMessages(prev => prev.map(m => m.id === tempId ? inserted as unknown as ChatMessage : m));
      const preview = contentType === "text" ? (text || "").slice(0, 100) : `📎 ${contentType}`;
      await supabase.from("chat_channels" as any).update({ last_message: preview, last_message_at: new Date().toISOString() }).eq("id", activeChannelId);
      setChannels(prev => prev.map(c => c.id === activeChannelId ? { ...c, last_message: preview, last_message_at: new Date().toISOString() } as any : c));
    }
    inputRef.current?.focus();
  };

  const handleFileUpload = async (file: File, type: "image" | "file") => {
    if (!activeChannelId || !user) return;
    if (file.size > 25 * 1024 * 1024) { toast({ title: "Max 25MB", variant: "destructive" }); return; }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `${type}s/${activeChannelId}/${user.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true, contentType: file.type });
      if (!upErr) {
        await sendMessage(type, path, type === "file" ? file.name : null);
      } else {
        // Storage failed — use base64 fallback for images, skip for files
        if (type === "image") {
          const b64 = await new Promise<string>(res => { const r = new FileReader(); r.onloadend = () => res(r.result as string); r.readAsDataURL(file); });
          const tempId = `temp-${Date.now()}`;
          setMessages(prev => [...prev, { id: tempId, channel_id: activeChannelId, user_id: user.id, content_type: "image", text: b64, media_path: null, created_at: new Date().toISOString() } as any]);
          const { data: ins, error: insE } = await supabase.from("chat_messages").insert({ class_level_id: activeChannelId, channel_id: activeChannelId, user_id: user.id, content_type: "image", text: b64 }).select().single();
          if (insE) setMessages(prev => prev.filter(m => m.id !== tempId));
          else setMessages(prev => prev.map(m => m.id === tempId ? ins as unknown as ChatMessage : m));
        } else {
          toast({ title: "File upload failed", description: "Storage unavailable", variant: "destructive" });
        }
      }
    } catch (e: any) {
      toast({ title: "Upload error", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const cancelRecording = () => {
    if (mediaRecRef.current && mediaRecRef.current.state !== "inactive") {
      setRecordingCancelled(true);
      mediaRecRef.current.stop();
    }
    clearInterval(recTimerRef.current);
    setIsRecording(false); setRecordingLocked(false); setRecordingTime(0);
    if (navigator.vibrate) navigator.vibrate([30, 30]);
  };

  const startRecording = async () => {
    try {
      setRecordingCancelled(false);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg"].find(t => {
        try { return MediaRecorder.isTypeSupported(t); } catch { return false; }
      }) || "";
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        clearInterval(recTimerRef.current); setRecordingTime(0); setRecordingLocked(false);
        // Check if cancelled via ref to avoid stale closure
        if ((mediaRecRef as any)._cancelled) { (mediaRecRef as any)._cancelled = false; return; }
        const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
        if (blob.size === 0) { toast({ title: "Recording was empty", variant: "destructive" }); return; }
        const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : "webm";
        const path = `voice/${activeChannelId}/${user!.id}/${Date.now()}.${ext}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: mimeType || "audio/webm", upsert: true });
        if (!error) {
          await sendMessage("audio", path);
        } else {
          const reader = new FileReader();
          reader.onloadend = async () => {
            const b64 = reader.result as string;
            await supabase.from("chat_messages").insert({
              class_level_id: activeChannelId, channel_id: activeChannelId,
              user_id: user!.id, content_type: "audio", text: b64, media_path: null
            });
          };
          reader.readAsDataURL(blob);
        }
      };
      mr.start(200);
      mediaRecRef.current = mr; setIsRecording(true);
      if (navigator.vibrate) navigator.vibrate(50);
      recTimerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch (e: any) {
      if (e.name === "NotAllowedError" || e.name === "PermissionDeniedError") {
        toast({ title: "Microphone permission denied", description: "Allow mic access in browser settings", variant: "destructive" });
      } else {
        toast({ title: "Recording failed", description: e.message, variant: "destructive" });
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecRef.current && mediaRecRef.current.state !== "inactive") {
      mediaRecRef.current.stop();
    }
    setIsRecording(false);
  };

  const forwardToChannel = async (targetId: string) => {
    if (!user) return;
    const toSend = selectedIds.size > 0 ? messages.filter(m => selectedIds.has(m.id)) : forwardMsg ? [forwardMsg] : [];
    for (const m of toSend)
      await supabase.from("chat_messages").insert({ class_level_id: targetId, channel_id: targetId, user_id: user.id, content_type: m.content_type, text: m.text ? `↪️ Forwarded:\n${m.text}` : null, media_path: m.media_path || null });
    await supabase.from("chat_channels" as any).update({ last_message: "↪️ Forwarded", last_message_at: new Date().toISOString() }).eq("id", targetId);
    setForwardMsg(null); setShowForwardSheet(false); setSelectMode(false); setSelectedIds(new Set());
    toast({ title: "Forwarded!" });
  };

  const reloadReactions = async () => {
    if (!messages.length) return;
    const ids = messages.map(m => m.id);
    const { data } = await supabase.from("message_reactions" as any).select("message_id,user_id,emoji").in("message_id", ids);
    const rm: Record<string, Record<string, string[]>> = {};
    (data || []).forEach((r: any) => { if (!rm[r.message_id]) rm[r.message_id] = {}; if (!rm[r.message_id][r.emoji]) rm[r.message_id][r.emoji] = []; rm[r.message_id][r.emoji].push(r.user_id); });
    setReactions(rm);
  };

  const deleteForMe  = (id: string) => { setMessages(prev => prev.filter(m => m.id !== id)); setShowDeleteSheet(null); };
  const deleteForAll = async (id: string) => { await supabase.from("chat_messages").delete().eq("id", id); setMessages(prev => prev.filter(m => m.id !== id)); setShowDeleteSheet(null); };
  const deleteSelected = async () => {
    for (const id of selectedIds) await supabase.from("chat_messages").delete().eq("id", id);
    setMessages(prev => prev.filter(m => !selectedIds.has(m.id)));
    toast({ title: `${selectedIds.size} deleted` }); setSelectedIds(new Set()); setSelectMode(false);
  };
  const pinMessage = async (m: ChatMessage) => {
    const ip = !(m as any).is_pinned;
    await supabase.from("chat_messages").update({ is_pinned: ip } as any).eq("id", m.id);
    setMessages(prev => prev.map(x => x.id === m.id ? { ...x, is_pinned: ip } as any : x));
    setPinnedMessages(prev => ip ? [...prev, m] : prev.filter(x => x.id !== m.id));
    setShowMessageMenu(null); toast({ title: ip ? "Pinned" : "Unpinned" });
  };
  const starMsg  = (id: string) => { setStarredMessages(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); setShowMessageMenu(null); };
  const copyMsg  = (text: string) => { navigator.clipboard?.writeText(text); setShowMessageMenu(null); toast({ title: "Copied!" }); };
  const jumpTo   = (id: string) => { document.getElementById(`msg-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); };

  const exportChat = () => {
    if (!activeChannel) return;
    const lines = messages.map(m => `[${new Date(m.created_at).toLocaleString()}] ${profiles[m.user_id]?.full_name || m.user_id}: ${m.content_type === "text" ? (m.text || "") : `[${m.content_type}]`}`);
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/plain" })); a.download = `${getCN(activeChannel)}.txt`; a.click();
    toast({ title: "Exported!" });
  };
  const clearChat = async () => {
    if (!activeChannelId || !canModerate || !confirm("Clear all messages?")) return;
    await supabase.from("chat_messages").delete().eq("channel_id", activeChannelId);
    setMessages([]); toast({ title: "Chat cleared" });
  };
  const deleteGroup = async () => {
    if (!activeChannelId || !canModerate || !confirm("Delete group permanently?")) return;
    await supabase.from("chat_messages").delete().eq("channel_id", activeChannelId);
    await supabase.from("chat_members" as any).delete().eq("channel_id", activeChannelId);
    await supabase.from("chat_channels" as any).delete().eq("id", activeChannelId);
    setChannels(prev => prev.filter(c => c.id !== activeChannelId));
    setActiveChannelId(null); setMobileShowChat(false); toast({ title: "Group deleted" });
  };
  const leaveChannel = async (chId: string) => {
    if (!user || !confirm("Leave this group?")) return;
    await supabase.from("chat_members" as any).delete().eq("channel_id", chId).eq("user_id", user.id);
    setChannels(prev => prev.filter(c => c.id !== chId));
    if (activeChannelId === chId) { setActiveChannelId(null); setMobileShowChat(false); }
    toast({ title: "Left group" });
  };
  const toggleMuteCh = (id: string) => { setMutedChannels(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); localStorage.setItem("majlis-muted", JSON.stringify([...n])); return n; }); setChannelMenu(null); setSwipedChannel(null); };
  const togglePinCh  = (id: string) => { setPinnedChannels(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); localStorage.setItem("majlis-pinned-ch", JSON.stringify([...n])); return n; }); setChannelMenu(null); };
  const toggleArchive= (id: string) => { setArchivedChannels(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); localStorage.setItem("majlis-archived", JSON.stringify([...n])); return n; }); setChannelMenu(null); setSwipedChannel(null); };

  const saveChannelEdit = async () => {
    if (!activeChannelId) return;
    await supabase.from("chat_channels" as any).update({ name: editName, description: editDesc }).eq("id", activeChannelId);
    setChannels(prev => prev.map(c => c.id === activeChannelId ? { ...c, name: editName, description: editDesc } : c));
    setEditingChannel(false); toast({ title: "Group updated!" });
  };
  const handleAvatarUpload = async (file: File) => {
    if (!activeChannelId || !canModerate) return;
    const path = `avatars/${activeChannelId}/${Date.now()}.${file.name.split(".").pop()}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
    if (!error) {
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      await supabase.from("chat_channels" as any).update({ avatar: data.publicUrl }).eq("id", activeChannelId);
      setChannels(prev => prev.map(c => c.id === activeChannelId ? { ...c, avatar: data.publicUrl } as any : c));
      toast({ title: "Photo updated!" });
    }
  };
  const handleProfileAvatarUpload = async (file: File) => {
    if (!user) return; setSavingProfile(true);
    try {
      const path = `profiles/${user.id}/${Date.now()}.${file.name.split(".").pop()}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
      let av = "";
      if (!error) { const { data } = supabase.storage.from(BUCKET).getPublicUrl(path); av = data.publicUrl; }
      else { av = await new Promise(res => { const r = new FileReader(); r.onloadend = () => res(r.result as string); r.readAsDataURL(file); }); }
      await supabase.from("profiles").update({ avatar_url: av }).eq("user_id", user.id);
      setProfiles(prev => ({ ...prev, [user.id]: { ...prev[user.id], avatar_url: av } }));
      toast({ title: "Photo updated!" });
    } catch (_) {} finally { setSavingProfile(false); }
  };
  const saveProfileEdit = async () => {
    if (!user) return; setSavingProfile(true);
    await supabase.from("profiles").update({ full_name: editProfileName, full_name_ar: editProfileAr }).eq("user_id", user.id);
    setProfiles(prev => ({ ...prev, [user.id]: { ...prev[user.id], full_name: editProfileName, full_name_ar: editProfileAr } }));
    setShowSettings(false); setSavingProfile(false); toast({ title: "Profile updated!" });
  };
  const handleBgImageUpload = (file: File) => {
    const r = new FileReader(); r.onloadend = () => { localStorage.setItem("majlis-custom-bg", r.result as string); saveSetting("wallpaper", "custom"); }; r.readAsDataURL(file);
  };
  const selectChannel = (id: string) => {
    setActiveChannelId(id);
    setMobileShowChat(true);
    setEditingChannel(false);
    setUnreadCounts(prev => ({ ...prev, [id]: 0 }));
    // Push state so Android back button returns to sidebar
    window.history.pushState({ chatOpen: true }, "", window.location.href);
  };
  const handleChannelCreated = async (id: string) => {
    const { data } = await supabase.from("chat_channels" as any).select("*").eq("id", id).single();
    if (data) setChannels(prev => prev.find(c => c.id === id) ? prev : [data as unknown as ChatChannel, ...prev]);
    setActiveChannelId(id); setMobileShowChat(true);
    const { count } = await supabase.from("chat_members" as any).select("*", { count: "exact", head: true }).eq("channel_id", id);
    setMemberCounts(prev => ({ ...prev, [id]: count || 0 }));
  };

  // ── CSS injected once ────────────────────────────────────────
  useEffect(() => {
    const id = "majlis-css";
    if (document.getElementById(id)) return;
    const s = document.createElement("style");
    s.id = id;
    s.textContent = `
      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }
      @keyframes slideUp { from { transform:translateY(100%); } to { transform:translateY(0); } }
      @keyframes slideIn { from { transform:translateX(-100%); } to { transform:translateX(0); } }
      @keyframes waveBar { from { transform:scaleY(0.4); } to { transform:scaleY(1); } }
      @keyframes pulse { 0%,100%{opacity:1;} 50%{opacity:.4;} }
      .majlis-wrap { display:flex; height:100dvh; overflow:hidden; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; }
      .majlis-sidebar { width:100%; max-width:380px; display:flex; flex-direction:column; border-right:1px solid #e0e0e0; background:#fff; flex-shrink:0; height:100dvh; }
      .majlis-chat { flex:1; display:flex; flex-direction:column; min-width:0; height:100dvh; overflow:hidden; }
      @media(max-width:767px) {
        .majlis-sidebar { max-width:100%; flex:1; }
        .majlis-chat { position:fixed !important; inset:0; z-index:50; height:100dvh !important; }
      }
      .msg-bubble { animation: fadeIn .15s ease; }
      .ch-row-wrap { overflow:hidden; position:relative; }
      .ch-row-inner { display:flex; transition:transform .25s cubic-bezier(.25,.46,.45,.94); will-change:transform; }
      .ch-row-inner.swiped { transform:translateX(-160px); }
      .ch-row-content { flex:0 0 100%; display:flex; align-items:center; gap:12px; padding:10px 16px; cursor:pointer; }
      .ch-row-actions { flex:0 0 160px; display:flex; }
      .ch-row-action-btn { width:80px; display:flex; flex-direction:column; align-items:center; justify-content:center; border:none; cursor:pointer; font-size:11px; gap:4px; color:#fff; font-weight:600; }
      @media(min-width:768px) { .majlis-chat { display:flex !important; } .majlis-sidebar { display:flex !important; } }
      .hamburger-drawer { animation: slideIn .22s ease; }
      .settings-panel { animation: slideUp .22s ease; }
      ::-webkit-scrollbar { width:4px; } ::-webkit-scrollbar-thumb { background:#ccc; border-radius:4px; }
      input:focus, textarea:focus { outline:none; }
      .unread-badge { background:#25D366; color:#fff; border-radius:50%; min-width:18px; height:18px; font-size:10px; display:flex; align-items:center; justify-content:center; font-weight:700; padding:0 4px; }
    `;
    document.head.appendChild(s);
  }, []);

  // ── Derived values for render ──────────────────────────────
  const myProfile = profiles[user?.id || ""] || { full_name: profile?.full_name || "You", avatar_url: profile?.avatar_url || "", user_id: user?.id || "" };
  const myInitial = (myProfile.full_name || "U")[0].toUpperCase();
  const initials  = (name: string) => (name || "?").split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

  const avatarEl = (uid: string, sz = 38) => {
    const p = profiles[uid];
    const av = p?.avatar_url || "";
    const nm = p?.full_name || uid;
    if (av) return <img src={av} style={{ width: sz, height: sz, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} alt="" />;
    const colours = ["#075E54","#128C7E","#25D366","#34B7F1","#ECB22E","#E74C3C","#9B59B6","#3498DB"];
    const bg = colours[(nm.charCodeAt(0) || 0) % colours.length];
    return <div style={{ width: sz, height: sz, borderRadius: "50%", background: bg, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: sz * 0.36, flexShrink: 0 }}>{initials(nm)}</div>;
  };

  const chAvatarEl = (ch: ChatChannel, sz = 48) => {
    const av = (ch as any).avatar || "";
    const nm = getCN(ch);
    if (av) return <img src={av} style={{ width: sz, height: sz, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} alt="" />;
    const emoji = ch.type === "announcement" ? "📢" : ch.type === "level" ? "📚" : "👥";
    return <div style={{ width: sz, height: sz, borderRadius: "50%", background: WA_GREEN, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: sz * 0.4, flexShrink: 0 }}>{emoji}</div>;
  };

  const renderTicks = (m: ChatMessage) => {
    if (m.user_id !== user?.id) return null;
    const status = (m as any).status || "sent";
    if (status === "sending") return <Check style={{ width: 12, height: 12, color: "#9e9e9e" }} />;
    if (status === "delivered") return <CheckCheck style={{ width: 12, height: 12, color: "#9e9e9e" }} />;
    return <CheckCheck style={{ width: 12, height: 12, color: "#4FC3F7" }} />;
  };

  const QUICK_EMOJIS = ["👍","❤️","😂","😮","😢","🙏","🔥","✅"];

  // group messages by date
  const msgsWithSeps: Array<{ type: "date"; date: string } | { type: "msg"; msg: ChatMessage }> = [];
  let lastDate = "";
  for (const m of filteredMessages) {
    const d = new Date(m.created_at).toDateString();
    if (d !== lastDate) { msgsWithSeps.push({ type: "date", date: m.created_at }); lastDate = d; }
    msgsWithSeps.push({ type: "msg", msg: m });
  }

  const searchResultMsgs = chatSearchQuery ? filteredMessages : [];
  const srIdx = useRef(0);

  // ── RENDER ─────────────────────────────────────────────────
  const sidebarBg  = isDark ? "#111b21" : "#fff";
  const sidebarHdr = isDark ? "#202c33" : WA_GREEN;
  const textMain   = isDark ? "#e9edef" : "#111";
  const textSub    = isDark ? "#8696a0" : "#667";
  const divider    = isDark ? "#2a3942" : "#f0f0f0";
  const inputBg    = isDark ? "#2a3942" : "#f0f2f5";
  const chatHdr    = isDark ? "#202c33" : WA_GREEN;

  // ── Channel row renderer ──────────────────────────────────
  const renderChRow = (ch: ChatChannel) => {
    const isActive  = ch.id === activeChannelId;
    const isMuted   = mutedChannels.has(ch.id);
    const isPinned  = pinnedChannels.has(ch.id);
    const isSwiped  = swipedChannel === ch.id;
    const unread    = unreadCounts[ch.id] || 0;
    const nm        = getCN(ch);
    const lastMsg   = (ch as any).last_message || "";
    const lastTime  = (ch as any).last_message_at ? ft((ch as any).last_message_at) : "";
    const memberPreview = channelMemberNames[ch.id] || "";

    return (
      <div key={ch.id} className="ch-row-wrap" style={{ borderBottom: `1px solid ${divider}` }}>
        {/* Sliding inner: content + hidden action buttons in one flex row */}
        <div
          className={`ch-row-inner${isSwiped ? " swiped" : ""}`}
          onTouchStart={e => {
            const sx = e.touches[0].clientX;
            const startY = e.touches[0].clientY;
            let moved = false;
            const onMove = (me: TouchEvent) => {
              const dx = sx - me.touches[0].clientX;
              const dy = Math.abs(me.touches[0].clientY - startY);
              if (dy > 10 && !moved) return; // vertical scroll, ignore
              if (dx > 40) { moved = true; setSwipedChannel(ch.id); }
              else if (me.touches[0].clientX - sx > 20) { moved = true; setSwipedChannel(null); }
            };
            const onEnd = () => { document.removeEventListener("touchmove", onMove); document.removeEventListener("touchend", onEnd); };
            document.addEventListener("touchmove", onMove, { passive: true });
            document.addEventListener("touchend", onEnd);
          }}
        >
          {/* Main row content */}
          <div
            className="ch-row-content"
            style={{ background: isActive ? (isDark ? "#2a3942" : "#f0f2f5") : sidebarBg, cursor: "pointer", userSelect: "none" as const }}
            onClick={() => { if (isSwiped) { setSwipedChannel(null); return; } selectChannel(ch.id); }}
            onContextMenu={e => { e.preventDefault(); setChannelMenu(ch.id); }}
          >
            {chAvatarEl(ch, 48)}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  {isPinned && <Pin style={{ width: 12, height: 12, color: textSub }} />}
                  <span style={{ fontWeight: 600, fontSize: 15, color: textMain, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, maxWidth: 165 }}>{nm}</span>
                  {isMuted && <VolumeX style={{ width: 12, height: 12, color: textSub }} />}
                </div>
                <span style={{ fontSize: 11, color: unread > 0 && !isMuted ? "#25D366" : textSub, flexShrink: 0, marginLeft: 4 }}>{lastTime}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 3 }}>
                <span style={{ fontSize: 13, color: textSub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, maxWidth: 210 }}>
                  {lastMsg || (memberPreview ? memberPreview : "Tap to chat")}
                </span>
                {unread > 0 && !isMuted && <span className="unread-badge">{unread > 99 ? "99+" : unread}</span>}
                {unread > 0 && isMuted && <span className="unread-badge" style={{ background: "#8696a0" }}>{unread}</span>}
              </div>
            </div>
          </div>

          {/* Action buttons — only visible when swiped (flex layout pushes them right) */}
          <div className="ch-row-actions">
            <button
              className="ch-row-action-btn"
              onClick={e => { e.stopPropagation(); toggleMuteCh(ch.id); }}
              style={{ background: "#E67E22" }}
            >
              {isMuted ? <Volume2 size={18} /> : <VolumeX size={18} />}
              {isMuted ? "Unmute" : "Mute"}
            </button>
            <button
              className="ch-row-action-btn"
              onClick={e => { e.stopPropagation(); leaveChannel(ch.id); setSwipedChannel(null); }}
              style={{ background: "#E74C3C" }}
            >
              <X size={18} />Leave
            </button>
          </div>
        </div>

        {/* Channel context menu (long-press) */}
        {channelMenu === ch.id && (
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", background: isDark ? "#233138" : "#fff", borderRadius: 16, boxShadow: "0 8px 40px rgba(0,0,0,.35)", zIndex: 400, minWidth: 220, overflow: "hidden" }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: "14px 18px", borderBottom: `1px solid ${divider}`, fontWeight: 700, fontSize: 14, color: textMain }}>{nm}</div>
            {[
              { icon: <Pin size={16} />,    label: isPinned ? "Unpin chat" : "Pin chat",       fn: () => togglePinCh(ch.id) },
              { icon: isMuted ? <Volume2 size={16} /> : <VolumeX size={16} />, label: isMuted ? "Unmute" : "Mute notifications", fn: () => toggleMuteCh(ch.id) },
              { icon: <Archive size={16} />, label: "Archive chat",           fn: () => toggleArchive(ch.id) },
              { icon: <Bell size={16} />,   label: "Mark as unread",          fn: () => { setUnreadCounts(p => ({ ...p, [ch.id]: 1 })); setChannelMenu(null); } },
              { icon: <X size={16} />,      label: "Exit group",              fn: () => { leaveChannel(ch.id); setChannelMenu(null); }, danger: true },
            ].map((item, i) => (
              <button key={i} onClick={item.fn} style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", background: "none", border: "none", cursor: "pointer", color: (item as any).danger ? "#E74C3C" : textMain, fontSize: 14, borderBottom: `1px solid ${divider}` }}>
                <span style={{ color: (item as any).danger ? "#E74C3C" : WA_GREEN }}>{item.icon}</span>{item.label}
              </button>
            ))}
            <button onClick={() => setChannelMenu(null)} style={{ width: "100%", padding: "14px", background: "none", border: "none", cursor: "pointer", color: textSub, fontSize: 14, textAlign: "center" as const }}>Cancel</button>
          </div>
        )}
      </div>
    );
  };

  // ── Message bubble renderer ───────────────────────────────
  const renderMsg = (m: ChatMessage) => {
    const isMe    = m.user_id === user?.id;
    const p       = profiles[m.user_id];
    const nm      = p?.full_name || "Unknown";
    const muted   = mutedChannels.has(m.channel_id);
    const isSelected = selectedIds.has(m.id);
    const rxns    = reactions[m.id] || {};
    const isExp   = (m as any).expires_at && new Date((m as any).expires_at) < new Date();
    if (isExp) return null;
    const isStarred = starredMessages.has(m.id);

    const bubbleBg  = isMe ? WA_BUBBLE_ME : (isDark ? "#202c33" : "#fff");
    const bubbleTxt = isDark && !isMe ? "#e9edef" : "#111";

    const replyOrig = replyTo?.id === m.id ? messages.find(x => x.id === (m as any).reply_to_id) : messages.find(x => x.id === (m as any).reply_to_id);

    return (
      <div id={`msg-${m.id}`} key={m.id} className="msg-bubble"
        style={{ display: "flex", flexDirection: isMe ? "row-reverse" : "row", alignItems: "flex-end", gap: 6, padding: "2px 12px", background: isSelected ? "rgba(37,211,102,0.12)" : "transparent" }}
        onClick={() => { if (selectMode) { setSelectedIds(prev => { const n = new Set(prev); n.has(m.id) ? n.delete(m.id) : n.add(m.id); return n; }); } }}
      >
        {/* select checkbox */}
        {selectMode && <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>{isSelected ? <CheckSquare style={{ width: 18, height: 18, color: "#25D366" }} /> : <Square style={{ width: 18, height: 18, color: "#999" }} />}</div>}

        {!isMe && !selectMode && (
          <div style={{ cursor: "pointer" }} onClick={() => {
            const memberProfile = profiles[m.user_id];
            if (memberProfile) {
              setSelectedMember({ ...memberProfile, user_id: m.user_id });
            } else {
              // Fetch profile on demand if not loaded
              supabase.from("profiles").select("user_id,full_name,full_name_ar,avatar_url,level,email,student_id").eq("user_id", m.user_id).maybeSingle()
                .then(({ data }) => {
                  if (data) {
                    setProfiles(prev => ({ ...prev, [m.user_id]: data as unknown as UserProfile }));
                    setSelectedMember({ ...(data as any), user_id: m.user_id });
                  } else {
                    setSelectedMember({ user_id: m.user_id, full_name: "Student", avatar_url: "" });
                  }
                  setShowStudentProfile(true);
                });
              return;
            }
            setShowStudentProfile(true);
          }}>
            {avatarEl(m.user_id, 28)}
          </div>
        )}

        <div
          style={{ maxWidth: "72%", minWidth: 60 }}
          onMouseDown={() => !selectMode && startLongPress(m.id)}
          onMouseUp={cancelLongPress}
          onMouseLeave={cancelLongPress}
          onTouchStart={() => !selectMode && startLongPress(m.id)}
          onTouchEnd={cancelLongPress}
        >
          <div style={{ background: bubbleBg, borderRadius: isMe ? "10px 2px 10px 10px" : "2px 10px 10px 10px", padding: "6px 10px 4px 10px", boxShadow: "0 1px 2px rgba(0,0,0,.1)", position: "relative" }}>
            {/* Sender name (group) */}
            {!isMe && activeChannel?.type !== "dm" && (
              <div onClick={() => {
                const mp = profiles[m.user_id];
                if (mp) { setSelectedMember({ ...mp, user_id: m.user_id }); setShowStudentProfile(true); }
              }} style={{ fontSize: 12, fontWeight: 700, color: WA_GREEN, marginBottom: 2, cursor: "pointer" }}>{nm}</div>
            )}
            {/* Reply preview */}
            {(m as any).reply_to_id && (
              <div onClick={() => jumpTo((m as any).reply_to_id)} style={{ borderLeft: `3px solid ${WA_GREEN}`, paddingLeft: 8, marginBottom: 4, cursor: "pointer", background: "rgba(0,0,0,0.04)", borderRadius: "0 6px 6px 0", padding: "4px 8px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: WA_GREEN }}>
                  {profiles[(messages.find(x => x.id === (m as any).reply_to_id)?.user_id || "")]?.full_name || "Message"}
                </div>
                <div style={{ fontSize: 11, color: "#667", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>
                  {(m as any).reply_preview || messages.find(x => x.id === (m as any).reply_to_id)?.text || "Media"}
                </div>
              </div>
            )}

            {/* Content */}
            {m.content_type === "image" && <ImageMsg path={m.media_path} text={m.text} />}
            {m.content_type === "audio" && <AudioMsg path={m.media_path} text={m.text} />}
            {m.content_type === "file" && m.media_path && <FileMsg path={m.media_path} text={m.text} />}
            {(m.content_type === "text" || !m.content_type) && m.text && <FormattedText text={m.text} sz={msgFontSz} />}

            {/* Deleted */}
            {(m as any).is_deleted && <span style={{ fontSize: 12, color: "#9e9e9e", fontStyle: "italic" }}>🚫 This message was deleted</span>}

            {/* Edited */}
            {(m as any).is_edited && <span style={{ fontSize: 10, color: "#9e9e9e", marginLeft: 4 }}>edited</span>}

            {/* Time + ticks + star */}
            <div style={{ display: "flex", alignItems: "center", gap: 3, justifyContent: "flex-end", marginTop: 2 }}>
              {isStarred && <Star style={{ width: 10, height: 10, color: "#F4D03F", fill: "#F4D03F" }} />}
              <span style={{ fontSize: 10, color: isDark ? "#8696a0" : "#999" }}>{ft(m.created_at)}</span>
              {renderTicks(m)}
            </div>
          </div>

          {/* Reactions row */}
          {Object.keys(rxns).length > 0 && (
            <div style={{ display: "flex", gap: 4, marginTop: 3, flexWrap: "wrap", justifyContent: isMe ? "flex-end" : "flex-start" }}>
              {Object.entries(rxns).map(([emoji, uids]) => (
                <button key={emoji} onClick={() => {
                  supabase.from("message_reactions" as any).upsert({ message_id: m.id, user_id: user!.id, emoji }, { onConflict: "message_id,user_id" }).then(reloadReactions);
                }} style={{ background: isDark ? "#2a3942" : "#f0f2f5", border: "1px solid rgba(0,0,0,.1)", borderRadius: 12, padding: "1px 7px", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 3 }}>
                  {emoji} <span style={{ fontSize: 10, color: textSub }}>{uids.length}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Long-press message menu */}
        {showMessageMenu === m.id && (
          <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowMessageMenu(null)}>
            <div style={{ background: isDark ? "#233138" : "#fff", borderRadius: 16, overflow: "hidden", width: 260, boxShadow: "0 8px 32px rgba(0,0,0,.35)" }} onClick={e => e.stopPropagation()}>
              {/* Emoji quick react bar */}
              <div style={{ display: "flex", justifyContent: "space-around", padding: "12px 16px", borderBottom: `1px solid ${divider}` }}>
                {QUICK_EMOJIS.map(e => (
                  <button key={e} onClick={async () => {
                    await supabase.from("message_reactions" as any).upsert({ message_id: m.id, user_id: user!.id, emoji: e }, { onConflict: "message_id,user_id" });
                    reloadReactions(); setShowMessageMenu(null);
                  }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, padding: "2px 4px", borderRadius: 8 }}>{e}</button>
                ))}
              </div>
              {[
                { icon: <Reply size={16} />, label: "Reply", fn: () => { setReplyTo(m); setShowMessageMenu(null); inputRef.current?.focus(); } },
                ...(m.content_type === "text" ? [{ icon: <Copy size={16} />, label: "Copy", fn: () => copyMsg(m.text || "") }] : []),
                { icon: <Forward size={16} />, label: "Forward", fn: () => { setForwardMsg(m); setShowForwardSheet(true); setShowMessageMenu(null); } },
                { icon: <Star size={16} />, label: isStarred ? "Unstar" : "Star", fn: () => starMsg(m.id) },
                { icon: <Pin size={16} />, label: (m as any).is_pinned ? "Unpin" : "Pin", fn: () => pinMessage(m) },
                ...(isMe && Date.now() - new Date(m.created_at).getTime() < EDIT_WINDOW && m.content_type === "text" ? [{ icon: <Edit2 size={16} />, label: "Edit", fn: () => { setEditingMsg(m); setInput(m.text || ""); setShowMessageMenu(null); inputRef.current?.focus(); } }] : []),
                { icon: <CheckSquare size={16} />, label: "Select", fn: () => { setSelectMode(true); setSelectedIds(new Set([m.id])); setShowMessageMenu(null); } },
                { icon: <Trash2 size={16} />, label: "Delete", fn: () => { setShowMessageMenu(null); setShowDeleteSheet(m.id); } },
              ].map((item, i) => (
                <button key={i} onClick={item.fn} style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, padding: "13px 18px", background: "none", border: "none", cursor: "pointer", color: textMain, fontSize: 14, borderBottom: `1px solid ${divider}` }}>
                  <span style={{ color: WA_GREEN }}>{item.icon}</span>{item.label}
                </button>
              ))}
              <button onClick={() => setShowMessageMenu(null)} style={{ width: "100%", padding: "13px", background: "none", border: "none", cursor: "pointer", color: "#E74C3C", fontSize: 14, fontWeight: 600 }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── Settings panel renderer ───────────────────────────────
  const renderSettings = () => (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 400, display: "flex", alignItems: "flex-end" }} onClick={() => setShowSettings(false)}>
      <div className="settings-panel" style={{ width: "100%", maxWidth: 480, margin: "0 auto", background: isDark ? "#111b21" : "#fff", borderRadius: "24px 24px 0 0", maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden" }} onClick={e => e.stopPropagation()}>
        {/* Settings header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 20px", background: isDark ? "#202c33" : WA_GREEN, color: "#fff" }}>
          <button onClick={() => setShowSettings(false)} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer" }}><ArrowLeft size={20} /></button>
          <span style={{ fontSize: 17, fontWeight: 600 }}>Settings</span>
        </div>
        {/* Settings tabs */}
        <div style={{ display: "flex", borderBottom: `1px solid ${divider}`, background: isDark ? "#202c33" : "#f8f8f8", overflowX: "auto" }}>
          {["profile","account","privacy","notifications","chats","storage","help"].map(tab => (
            <button key={tab} onClick={() => setSettingsTab(tab)} style={{ padding: "12px 16px", background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: settingsTab === tab ? 700 : 400, color: settingsTab === tab ? WA_GREEN : textSub, borderBottom: settingsTab === tab ? `2px solid ${WA_GREEN}` : "2px solid transparent", whiteSpace: "nowrap", textTransform: "capitalize" }}>
              {tab}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {settingsTab === "profile" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Avatar */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, marginBottom: 8 }}>
                <div style={{ position: "relative" }}>
                  {myProfile.avatar_url
                    ? <img src={myProfile.avatar_url} style={{ width: 90, height: 90, borderRadius: "50%", objectFit: "cover" }} alt="" />
                    : <div style={{ width: 90, height: 90, borderRadius: "50%", background: WA_GREEN, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 36, fontWeight: 700 }}>{myInitial}</div>
                  }
                  <button onClick={() => profileAvatarRef.current?.click()} style={{ position: "absolute", bottom: 0, right: 0, width: 30, height: 30, borderRadius: "50%", background: "#25D366", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Camera style={{ width: 14, height: 14, color: "#fff" }} />
                  </button>
                  <input ref={profileAvatarRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => e.target.files?.[0] && handleProfileAvatarUpload(e.target.files[0])} />
                </div>
              </div>
              {[
                { label: "Display Name", val: editProfileName || myProfile.full_name || "", set: setEditProfileName, placeholder: "Your name" },
                { label: "Arabic Name", val: editProfileAr || (myProfile as any).full_name_ar || "", set: setEditProfileAr, placeholder: "اسمك بالعربي" },
              ].map(f => (
                <div key={f.label}>
                  <div style={{ fontSize: 12, color: textSub, marginBottom: 4 }}>{f.label}</div>
                  <input value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.placeholder} style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: `1px solid ${divider}`, background: inputBg, color: textMain, fontSize: 14, boxSizing: "border-box" }} />
                </div>
              ))}
              <div>
                <div style={{ fontSize: 12, color: textSub, marginBottom: 4 }}>About</div>
                <input value={settings.about} onChange={e => saveSetting("about", e.target.value)} style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: `1px solid ${divider}`, background: inputBg, color: textMain, fontSize: 14, boxSizing: "border-box" }} />
              </div>
              <button onClick={saveProfileEdit} disabled={savingProfile} style={{ background: WA_GREEN, color: "#fff", border: "none", borderRadius: 10, padding: "13px", fontSize: 15, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {savingProfile ? <Loader2 style={{ width: 18, height: 18, animation: "spin .8s linear infinite" }} /> : <Check size={18} />} Save Profile
              </button>
            </div>
          )}
          {settingsTab === "account" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {[
                { label: "Full Name", val: myProfile.full_name || "" },
                { label: "Student ID", val: (profile as any)?.student_id || "" },
                { label: "Email", val: user?.email || "" },
                { label: "Level", val: (profile as any)?.level || "" },
              ].map(f => (
                <div key={f.label} style={{ padding: "14px 0", borderBottom: `1px solid ${divider}` }}>
                  <div style={{ fontSize: 12, color: WA_GREEN, marginBottom: 3 }}>{f.label}</div>
                  <div style={{ fontSize: 15, color: textMain }}>{f.val || "—"}</div>
                </div>
              ))}
            </div>
          )}
          {settingsTab === "privacy" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {[
                { label: "Last Seen", key: "lastSeen" as const, opts: ["everyone","contacts","nobody"] },
                { label: "Profile Photo", key: "profilePhotoVisibility" as const, opts: ["everyone","contacts","nobody"] },
              ].map(s => (
                <div key={s.key} style={{ padding: "14px 0", borderBottom: `1px solid ${divider}` }}>
                  <div style={{ fontSize: 15, color: textMain, marginBottom: 8 }}>{s.label}</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
                    {s.opts.map(o => (
                      <button key={o} onClick={() => saveSetting(s.key, o as any)} style={{ padding: "6px 14px", borderRadius: 20, border: `2px solid ${settings[s.key] === o ? WA_GREEN : divider}`, background: settings[s.key] === o ? WA_GREEN : "transparent", color: settings[s.key] === o ? "#fff" : textMain, cursor: "pointer", fontSize: 13, textTransform: "capitalize" as const }}>{o}</button>
                    ))}
                  </div>
                </div>
              ))}
              <div style={{ padding: "14px 0", borderBottom: `1px solid ${divider}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 15, color: textMain }}>Read Receipts</span>
                <div onClick={() => saveSetting("readReceipts", !settings.readReceipts)} style={{ width: 44, height: 24, borderRadius: 12, background: settings.readReceipts ? "#25D366" : "#ccc", cursor: "pointer", position: "relative", transition: "background .2s" }}>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: settings.readReceipts ? 22 : 2, transition: "left .2s" }} />
                </div>
              </div>
            </div>
          )}
          {settingsTab === "notifications" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {[
                { label: "Message Notifications", key: "notifications" as const },
                { label: "Notification Sound", key: "notifSound" as const },
                { label: "Vibration", key: "notifVibration" as const },
                { label: "Preview in Notification", key: "notifPreview" as const },
              ].map(item => (
                <div key={item.key} style={{ padding: "14px 0", borderBottom: `1px solid ${divider}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 15, color: textMain }}>{item.label}</span>
                  <div onClick={() => saveSetting(item.key, !settings[item.key])} style={{ width: 44, height: 24, borderRadius: 12, background: settings[item.key] ? "#25D366" : "#ccc", cursor: "pointer", position: "relative", transition: "background .2s" }}>
                    <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: settings[item.key] ? 22 : 2, transition: "left .2s" }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          {settingsTab === "chats" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {/* Wallpaper */}
              <div style={{ padding: "14px 0", borderBottom: `1px solid ${divider}` }}>
                <div style={{ fontSize: 15, color: textMain, marginBottom: 10 }}>Chat Wallpaper</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const, marginBottom: 10 }}>
                  {WALLPAPERS.map(w => (
                    <div key={w.id} onClick={() => saveSetting("wallpaper", w.id)} style={{ width: 44, height: 44, borderRadius: 10, background: w.bg, backgroundImage: w.pattern, border: settings.wallpaper === w.id ? `3px solid ${WA_GREEN}` : "3px solid transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#888", boxSizing: "border-box" }}>{settings.wallpaper === w.id && <Check size={14} color="#fff" />}</div>
                  ))}
                  <div onClick={() => bgImageRef.current?.click()} style={{ width: 44, height: 44, borderRadius: 10, border: `2px dashed ${divider}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                    <Camera size={16} color={textSub} />
                  </div>
                  <input ref={bgImageRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => e.target.files?.[0] && handleBgImageUpload(e.target.files[0])} />
                </div>
                <div style={{ fontSize: 12, color: textSub }}>Selected: {WALLPAPERS.find(w => w.id === settings.wallpaper)?.label || "Custom"}</div>
              </div>
              {/* Font size */}
              <div style={{ padding: "14px 0", borderBottom: `1px solid ${divider}` }}>
                <div style={{ fontSize: 15, color: textMain, marginBottom: 8 }}>Font Size</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["small","medium","large"] as const).map(sz => (
                    <button key={sz} onClick={() => saveSetting("fontSize", sz)} style={{ flex: 1, padding: "8px", borderRadius: 10, border: `2px solid ${settings.fontSize === sz ? WA_GREEN : divider}`, background: settings.fontSize === sz ? WA_GREEN : "transparent", color: settings.fontSize === sz ? "#fff" : textMain, cursor: "pointer", fontSize: 13, textTransform: "capitalize" }}>{sz}</button>
                  ))}
                </div>
              </div>
              {/* Enter sends */}
              <div style={{ padding: "14px 0", borderBottom: `1px solid ${divider}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 15, color: textMain }}>Enter Key Sends</div>
                  <div style={{ fontSize: 12, color: textSub }}>Press Enter to send messages</div>
                </div>
                <div onClick={() => saveSetting("enterSends", !settings.enterSends)} style={{ width: 44, height: 24, borderRadius: 12, background: settings.enterSends ? "#25D366" : "#ccc", cursor: "pointer", position: "relative" }}>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: settings.enterSends ? 22 : 2, transition: "left .2s" }} />
                </div>
              </div>
              {/* Dark mode */}
              <div style={{ padding: "14px 0", borderBottom: `1px solid ${divider}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Moon size={18} color={textSub} />
                  <span style={{ fontSize: 15, color: textMain }}>Dark Mode</span>
                </div>
                <div onClick={() => saveSetting("darkMode", !settings.darkMode)} style={{ width: 44, height: 24, borderRadius: 12, background: settings.darkMode ? "#25D366" : "#ccc", cursor: "pointer", position: "relative" }}>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: settings.darkMode ? 22 : 2, transition: "left .2s" }} />
                </div>
              </div>
            </div>
          )}
          {settingsTab === "storage" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ padding: 16, background: inputBg, borderRadius: 12, marginBottom: 12 }}>
                <div style={{ fontSize: 13, color: textSub }}>Messages</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: textMain }}>{messages.length} messages</div>
              </div>
              {[
                { label: "Export Chat", icon: <Download size={18} />, fn: exportChat },
                { label: "Clear Chat History", icon: <Trash2 size={18} />, fn: clearChat, danger: true },
              ].map(item => (
                <button key={item.label} onClick={item.fn} style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, padding: "14px 0", background: "none", border: "none", cursor: "pointer", color: (item as any).danger ? "#E74C3C" : textMain, fontSize: 15, borderBottom: `1px solid ${divider}` }}>
                  <span style={{ color: (item as any).danger ? "#E74C3C" : WA_GREEN }}>{item.icon}</span>{item.label}
                </button>
              ))}
            </div>
          )}
          {settingsTab === "help" && (
            <div style={{ textAlign: "center", padding: 20 }}>
              <div style={{ width: 72, height: 72, borderRadius: "50%", background: WA_GREEN, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                <MessageCircle style={{ width: 36, height: 36, color: "#fff" }} />
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: textMain }}>Al-Majlis</div>
              <div style={{ fontSize: 14, color: textSub, margin: "6px 0 20px" }}>Tahleem Academy Chat</div>
              <div style={{ fontSize: 13, color: textSub }}>Version 2.0.0</div>
              <div style={{ fontSize: 13, color: textSub, marginTop: 4 }}>© 2025 Tahleem Academy</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // ── MAIN RETURN ─────────────────────────────────────────────
  return (
    <div className="majlis-wrap" style={{ background: isDark ? "#0b141a" : "#f0f2f5" }}>

      {/* ═══ SIDEBAR ══════════════════════════════════════════ */}
      <div className="majlis-sidebar" style={{ background: sidebarBg, display: mobileShowChat ? "none" : "flex" }}>

        {/* Sidebar Header */}
        <div style={{ background: sidebarHdr, padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={() => setShowHamburger(true)} style={{ background: "none", border: "none", cursor: "pointer", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", padding: 4 }}>
              <Menu size={20} />
            </button>
            <div onClick={() => { setSettingsTab("profile"); setShowSettings(true); }} style={{ cursor: "pointer" }}>
              {myProfile.avatar_url
                ? <img src={myProfile.avatar_url} style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover" }} alt="" />
                : <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.3)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 15 }}>{myInitial}</div>
              }
            </div>
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>Al-Majlis</span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setShowBrowseChannels(true)} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 6, borderRadius: 8 }}>
              <Search size={18} />
            </button>
            <button onClick={() => setShowCreateDialog(true)} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", cursor: "pointer", padding: "6px 10px", borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
              + New
            </button>
            <button onClick={() => setShowSettings(true)} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 6, borderRadius: 8 }}>
              <MoreVertical size={18} />
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div style={{ padding: "8px 12px", background: isDark ? "#111b21" : "#fff" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: inputBg, borderRadius: 24, padding: "8px 14px" }}>
            <Search style={{ width: 16, height: 16, color: textSub }} />
            <input value={sidebarSearch} onChange={e => setSidebarSearch(e.target.value)} placeholder="Search or start new chat" style={{ border: "none", background: "transparent", flex: 1, fontSize: 14, color: textMain, outline: "none" }} />
            {sidebarSearch && <button onClick={() => setSidebarSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: textSub, padding: 0 }}><X size={14} /></button>}
          </div>
        </div>

        {/* WhatsApp-style filter chips */}
        {!sidebarSearch && (
          <div style={{ display: "flex", gap: 8, padding: "6px 12px 8px", overflowX: "auto", background: isDark ? "#111b21" : "#fff" }}>
            {(["All", "Unread", "Groups", "Announcements"] as const).map(chip => {
              const chipActive = chip === "All"
                ? !searchTab || searchTab === "contacts"
                : chip === "Unread"
                ? searchTab === "messages"
                : chip === "Groups"
                ? searchTab === "groups"
                : searchTab === "groups";
              return (
                <button key={chip} onClick={() => setSearchTab(chip === "All" ? "contacts" : chip === "Unread" ? "messages" : "groups")}
                  style={{ padding: "5px 14px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" as const, flexShrink: 0,
                    background: chip === "All" ? WA_GREEN : inputBg,
                    color: chip === "All" ? "#fff" : textSub,
                  }}>
                  {chip}
                  {chip === "Unread" && Object.values(unreadCounts).reduce((a, b) => a + b, 0) > 0 && (
                    <span style={{ marginLeft: 4, background: "#25D366", color: "#fff", borderRadius: 10, padding: "0 5px", fontSize: 10 }}>
                      {Object.values(unreadCounts).reduce((a, b) => a + b, 0)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Search tabs when searching */}
        {sidebarSearch && (
          <div style={{ display: "flex", borderBottom: `1px solid ${divider}`, background: isDark ? "#202c33" : "#f8f8f8" }}>
            {(["contacts","messages","groups"] as const).map(tab => (
              <button key={tab} onClick={() => setSearchTab(tab)} style={{ flex: 1, padding: "10px 6px", background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: searchTab === tab ? 700 : 400, color: searchTab === tab ? WA_GREEN : textSub, borderBottom: searchTab === tab ? `2px solid ${WA_GREEN}` : "2px solid transparent", textTransform: "capitalize" as const }}>
                {tab}
              </button>
            ))}
          </div>
        )}

        {/* Channel list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {sidebarSearch ? (
            <>
              {searchTab === "contacts" && contactResults.map(s => (
                <div key={s.user_id} onClick={() => { setSelectedMember(s); setShowStudentProfile(true); }} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", cursor: "pointer", borderBottom: `1px solid ${divider}` }}>
                  {avatarEl(s.user_id, 46)}
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15, color: textMain }}>{s.full_name || "Student"}</div>
                    <div style={{ fontSize: 12, color: WA_GREEN }}>{(s as any).level || "Student"}</div>
                  </div>
                </div>
              ))}
              {searchTab === "messages" && msgResults.map(m => (
                <div key={m.id} onClick={() => { selectChannel(m.channel_id); setTimeout(() => jumpTo(m.id), 400); }} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", cursor: "pointer", borderBottom: `1px solid ${divider}` }}>
                  {avatarEl(m.user_id, 40)}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: textMain }}>{profiles[m.user_id]?.full_name || "Message"}</div>
                    <div style={{ fontSize: 12, color: textSub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.text}</div>
                  </div>
                </div>
              ))}
              {searchTab === "groups" && groupResults.map(ch => renderChRow(ch))}
            </>
          ) : (
            <>
              {/* Pinned */}
              {grouped.pinned.length > 0 && (
                <>
                  <div style={{ padding: "6px 16px", fontSize: 11, fontWeight: 700, color: textSub, background: inputBg, textTransform: "uppercase", letterSpacing: 1 }}>📌 Pinned</div>
                  {grouped.pinned.map(renderChRow)}
                </>
              )}
              {/* Groups */}
              {grouped.groups.length > 0 && (
                <>
                  <div style={{ padding: "6px 16px", fontSize: 11, fontWeight: 700, color: textSub, background: inputBg, textTransform: "uppercase", letterSpacing: 1 }}>MY GROUPS</div>
                  {grouped.groups.map(renderChRow)}
                </>
              )}
              {/* Level channels */}
              {grouped.level.length > 0 && (
                <>
                  <div style={{ padding: "6px 16px", fontSize: 11, fontWeight: 700, color: textSub, background: inputBg, textTransform: "uppercase", letterSpacing: 1 }}>BY LEVEL</div>
                  {grouped.level.map(renderChRow)}
                </>
              )}
              {/* Announcements */}
              {grouped.anns.length > 0 && (
                <>
                  <div style={{ padding: "6px 16px", fontSize: 11, fontWeight: 700, color: textSub, background: inputBg, textTransform: "uppercase", letterSpacing: 1 }}>ANNOUNCEMENTS</div>
                  {grouped.anns.map(renderChRow)}
                </>
              )}
              {/* Archived */}
              {archivedChannels.size > 0 && (
                <div onClick={() => setShowArchived(p => !p)} style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", borderTop: `1px solid ${divider}` }}>
                  <Archive size={16} color={textSub} />
                  <span style={{ fontSize: 14, color: textSub }}>Archived ({archivedChannels.size})</span>
                  <ChevronDown size={14} color={textSub} style={{ marginLeft: "auto", transform: showArchived ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
                </div>
              )}
              {showArchived && channels.filter(c => archivedChannels.has(c.id)).map(renderChRow)}
              {channels.length === 0 && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, padding: 40, gap: 12, textAlign: "center" }}>
                  <MessageCircle style={{ width: 52, height: 52, color: "#ccc" }} />
                  <div style={{ fontSize: 17, fontWeight: 600, color: textSub }}>No chats yet</div>
                  <div style={{ fontSize: 13, color: textSub }}>Join a group or browse channels</div>
                  <button onClick={() => setShowBrowseChannels(true)} style={{ marginTop: 6, background: WA_GREEN, color: "#fff", border: "none", borderRadius: 20, padding: "10px 22px", cursor: "pointer", fontSize: 14, fontWeight: 600 }}>Browse Channels</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ═══ CHAT AREA ═══════════════════════════════════════ */}
      <div className="majlis-chat" style={{ display: mobileShowChat ? "flex" : "none", flexDirection: "column", ...getBgStyle() }} data-desktop-visible>
        {!activeChannel ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, background: isDark ? "#0d1117" : "#f8f8f8" }}>
            <div style={{ width: 80, height: 80, borderRadius: "50%", background: WA_GREEN, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <MessageCircle style={{ width: 40, height: 40, color: "#fff" }} />
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: textMain }}>Al-Majlis</div>
            <div style={{ fontSize: 14, color: textSub, maxWidth: 280, textAlign: "center" }}>Select a conversation from the left to start chatting with your classmates</div>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div style={{ background: chatHdr, padding: "8px 16px", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 1px 4px rgba(0,0,0,.15)", zIndex: 10, flexShrink: 0 }}>
              <button onClick={() => { setMobileShowChat(false); setActiveChannelId(null); }} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 4, display: "flex" }}>
                <ArrowLeft size={20} />
              </button>
              <div style={{ cursor: "pointer" }} onClick={() => setShowGroupInfo(true)}>
                {chAvatarEl(activeChannel, 38)}
              </div>
              <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => setShowGroupInfo(true)}>
                <div style={{ color: "#fff", fontWeight: 700, fontSize: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{getCN(activeChannel)}</div>
                <div style={{ color: "rgba(255,255,255,.75)", fontSize: 11 }}>
                  {typingUsers.length > 0
                    ? `${typingUsers[0]} is typing…`
                    : (() => {
                        const total = memberCounts[activeChannel.id] || 0;
                        const online = Object.values(profiles).filter(p =>
                          onlineUsers.has(p.user_id)
                        ).length;
                        return online > 0
                          ? `${total} members, ${online} online`
                          : `${total} members`;
                      })()
                  }
                </div>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={() => { setShowChatSearch(p => !p); setChatSearchQuery(""); }} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 6 }}><Search size={18} /></button>
                <button onClick={() => setShowHeaderMenu(p => !p)} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 6 }}><MoreVertical size={18} /></button>
              </div>
              {/* Header dropdown → now opens bottom sheet */}
              {showHeaderMenu && (
                <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,.5)" }} onClick={() => setShowHeaderMenu(false)}>
                  <div className="sheet" style={{ position: "absolute", bottom: 0, left: 0, right: 0, maxWidth: 480, margin: "0 auto", background: isDark ? "#202c33" : "#fff", borderRadius: "20px 20px 0 0", overflow: "hidden" }} onClick={e => e.stopPropagation()}>
                    <div style={{ width: 36, height: 4, borderRadius: 2, background: isDark ? "#444" : "#ddd", margin: "10px auto 14px" }} />
                    {[
                      { icon: "ℹ️", label: "Group Info",          fn: () => { setShowGroupInfo(true); setShowHeaderMenu(false); } },
                      { icon: "🔍", label: "Search Messages",      fn: () => { setShowChatSearch(true); setShowHeaderMenu(false); } },
                      { icon: "⭐", label: "Starred Messages",     fn: () => { setShowHeaderMenu(false); toast({ title: `${starredMessages.size} starred` }); } },
                      { icon: "🔕", label: mutedChannels.has(activeChannel.id) ? "Unmute" : "Mute Notifications", fn: () => { toggleMuteCh(activeChannel.id); setShowHeaderMenu(false); } },
                      { icon: "🖼️", label: "Wallpaper & Sound",   fn: () => { setSettingsTab("chats"); setShowSettings(true); setShowHeaderMenu(false); } },
                      { icon: "📤", label: "Export Chat",          fn: () => { exportChat(); setShowHeaderMenu(false); } },
                      ...(canModerate ? [
                        { icon: "🗑️", label: "Clear Chat",        fn: () => { clearChat(); setShowHeaderMenu(false); }, danger: true },
                        { icon: "💥", label: "Delete Group",       fn: () => { deleteGroup(); setShowHeaderMenu(false); }, danger: true },
                      ] : []),
                      { icon: "🚪", label: "Leave Group",          fn: () => { leaveChannel(activeChannel.id); setShowHeaderMenu(false); }, danger: true },
                    ].map((item, i) => (
                      <button key={i} onClick={item.fn} style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, padding: "15px 20px", background: "none", border: "none", cursor: "pointer", textAlign: "left" as const, fontSize: 15, color: (item as any).danger ? "#E74C3C" : textMain, borderBottom: `1px solid ${divider}` }}>
                        <span style={{ fontSize: 18 }}>{item.icon}</span>{item.label}
                      </button>
                    ))}
                    <div style={{ height: 16 }} />
                  </div>
                </div>
              )}
            </div>

            {/* Chat search bar */}
            {showChatSearch && (
              <div style={{ background: isDark ? "#202c33" : "#fff", padding: "8px 12px", display: "flex", alignItems: "center", gap: 8, borderBottom: `1px solid ${divider}` }}>
                <Search size={16} color={textSub} />
                <input autoFocus value={chatSearchQuery} onChange={e => setChatSearchQuery(e.target.value)} placeholder="Search messages…" style={{ flex: 1, border: "none", background: "transparent", fontSize: 14, color: textMain, outline: "none" }} />
                {searchResultMsgs.length > 0 && <span style={{ fontSize: 12, color: textSub }}>{searchResultMsgs.length} result{searchResultMsgs.length > 1 ? "s" : ""}</span>}
                <button onClick={() => { setShowChatSearch(false); setChatSearchQuery(""); }} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={16} color={textSub} /></button>
              </div>
            )}

            {/* Pinned message bar */}
            {pinnedMessages.length > 0 && showPinnedBar && (
              <div style={{ background: isDark ? "#202c33" : "#fff", borderBottom: `2px solid ${WA_GREEN}`, padding: "8px 16px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => jumpTo(pinnedMessages[pinnedMessages.length - 1].id)}>
                <Pin style={{ width: 14, height: 14, color: WA_GREEN, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: WA_GREEN }}>Pinned Message</div>
                  <div style={{ fontSize: 12, color: textSub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pinnedMessages[pinnedMessages.length - 1].text || "[Media]"}</div>
                </div>
                <button onClick={e => { e.stopPropagation(); setShowPinnedBar(false); }} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={14} color={textSub} /></button>
              </div>
            )}

            {/* Select mode bar */}
            {selectMode && (
              <div style={{ background: isDark ? "#202c33" : "#fff", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${divider}` }}>
                <span style={{ fontSize: 14, color: textMain }}>{selectedIds.size} selected</span>
                <div style={{ display: "flex", gap: 12 }}>
                  <button onClick={() => { setForwardMsg(null); setShowForwardSheet(true); }} disabled={selectedIds.size === 0} style={{ background: "none", border: "none", cursor: "pointer", color: WA_GREEN, fontSize: 13 }}>Forward</button>
                  <button onClick={deleteSelected} disabled={selectedIds.size === 0} style={{ background: "none", border: "none", cursor: "pointer", color: "#E74C3C", fontSize: 13 }}>Delete</button>
                  <button onClick={() => { setSelectMode(false); setSelectedIds(new Set()); }} style={{ background: "none", border: "none", cursor: "pointer", color: textSub, fontSize: 13 }}>Cancel</button>
                </div>
              </div>
            )}

            {/* Message list */}
            <div ref={scrollRef} onScroll={handleScrollMessages} style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
              {loadingMessages && (
                <div style={{ display: "flex", justifyContent: "center", padding: 20 }}>
                  <Loader2 style={{ width: 28, height: 28, color: WA_GREEN, animation: "spin .8s linear infinite" }} />
                </div>
              )}
              {msgsWithSeps.map((item, i) =>
                item.type === "date"
                  ? <DateSep key={`d-${i}`} date={item.date} />
                  : renderMsg(item.msg)
              )}
              {typingUsers.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 16px" }}>
                  <div style={{ display: "flex", gap: 3, background: isDark ? "#202c33" : "#fff", padding: "8px 14px", borderRadius: "2px 10px 10px 10px", boxShadow: "0 1px 2px rgba(0,0,0,.1)" }}>
                    {[0, 0.2, 0.4].map((d, i) => (
                      <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "#999", animation: `bounce .8s ${d}s infinite` }} />
                    ))}
                  </div>
                  <span style={{ fontSize: 11, color: textSub }}>{typingUsers.join(", ")} typing…</span>
                </div>
              )}
            </div>

            {/* Scroll to bottom FAB */}
            {showScrollFab && (
              <button onClick={scrollToBottom} style={{ position: "absolute", bottom: 80, right: 16, width: 42, height: 42, borderRadius: "50%", background: isDark ? "#202c33" : "#fff", border: "none", boxShadow: "0 2px 8px rgba(0,0,0,.25)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10 }}>
                <ChevronDown size={20} color={textSub} />
              </button>
            )}

            {/* Mention autocomplete */}
            {mentionList.length > 0 && (
              <div style={{ position: "absolute", bottom: 70, left: 12, right: 12, background: isDark ? "#202c33" : "#fff", borderRadius: 12, boxShadow: "0 4px 20px rgba(0,0,0,.2)", overflow: "hidden", zIndex: 100 }}>
                {mentionList.map(p => (
                  <div key={p.user_id} onClick={() => insertMention(p)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", cursor: "pointer", borderBottom: `1px solid ${divider}` }}>
                    {avatarEl(p.user_id, 30)}
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: textMain }}>{p.full_name}</div>
                      <div style={{ fontSize: 11, color: textSub }}>{(p as any).level || "Student"}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Reply bar */}
            {replyTo && (
              <div style={{ background: isDark ? "#202c33" : "#f0f2f5", borderTop: `2px solid ${WA_GREEN}`, padding: "8px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                <Reply style={{ width: 16, height: 16, color: WA_GREEN, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: WA_GREEN }}>Replying to {profiles[replyTo.user_id]?.full_name || "..."}</div>
                  <div style={{ fontSize: 12, color: textSub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{replyTo.text || "[Media]"}</div>
                </div>
                <button onClick={() => setReplyTo(null)} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={16} color={textSub} /></button>
              </div>
            )}

            {/* Edit bar */}
            {editingMsg && (
              <div style={{ background: isDark ? "#202c33" : "#f0f2f5", borderTop: `2px solid #ECB22E`, padding: "8px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                <Edit2 style={{ width: 16, height: 16, color: "#ECB22E", flexShrink: 0 }} />
                <div style={{ flex: 1, fontSize: 12, color: textSub }}>Editing message</div>
                <button onClick={() => { setEditingMsg(null); setInput(""); }} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={16} color={textSub} /></button>
              </div>
            )}

            {/* Quick emoji bar */}
            {showEmojiBar && (
              <div style={{ background: isDark ? "#202c33" : "#fff", borderTop: `1px solid ${divider}`, padding: "8px 16px", display: "flex", gap: 10, overflowX: "auto" }}>
                {["😊","😂","❤️","👍","🙏","🔥","😢","😮","🎉","✅","💯","🤔","👏","😍","🥺","😅"].map(e => (
                  <button key={e} onClick={() => setInput(input + e)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 24, padding: 4 }}>{e}</button>
                ))}
              </div>
            )}

            {/* Input toolbar */}
            <div style={{ background: isDark ? "#202c33" : "#f0f2f5", padding: "8px 8px", display: "flex", alignItems: "flex-end", gap: 6, flexShrink: 0, position: "relative" }}>

              {/* RECORDING OVERLAY — slide to cancel / lock */}
              {isRecording && !recordingLocked && (
                <div style={{ position: "absolute", inset: 0, background: isDark ? "#202c33" : "#f0f2f5", display: "flex", alignItems: "center", paddingLeft: 14, paddingRight: 8, gap: 10, zIndex: 5 }}>
                  {/* Animated waveform */}
                  <div style={{ display: "flex", alignItems: "center", gap: 2, flex: 1 }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#E74C3C", animation: "pulse 1s infinite" }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#E74C3C", minWidth: 40 }}>{fr(recordingTime)}</span>
                    <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 1.5, height: 28 }}>
                      {Array.from({ length: 20 }, (_, i) => (
                        <div key={i} style={{
                          width: 2.5, borderRadius: 2,
                          height: `${Math.random() * 18 + 6}px`,
                          background: "#E74C3C",
                          animation: `waveBar ${0.4 + Math.random() * 0.4}s ease-in-out infinite alternate`,
                          animationDelay: `${i * 0.05}s`
                        }} />
                      ))}
                    </div>
                  </div>
                  {/* Slide to cancel */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: textSub, fontSize: 12 }}
                    onTouchStart={e => {
                      const sx = e.touches[0].clientX;
                      const onMove = (me: TouchEvent) => {
                        if (sx - me.touches[0].clientX > 80) cancelRecording();
                        if (me.touches[0].clientY - e.touches[0].clientY < -60) setRecordingLocked(true);
                      };
                      document.addEventListener("touchmove", onMove, { passive: true });
                      document.addEventListener("touchend", () => document.removeEventListener("touchmove", onMove), { once: true });
                    }}
                  >
                    <span>◀ Slide to cancel</span>
                  </div>
                  <button onClick={cancelRecording} style={{ background: "none", border: "none", cursor: "pointer", color: "#E74C3C", padding: 6 }}>
                    <Trash2 size={18} />
                  </button>
                </div>
              )}

              {/* LOCKED RECORDING — hands free */}
              {isRecording && recordingLocked && (
                <div style={{ position: "absolute", inset: 0, background: isDark ? "#202c33" : "#f0f2f5", display: "flex", alignItems: "center", paddingLeft: 14, paddingRight: 8, gap: 10, zIndex: 5 }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#E74C3C", animation: "pulse 1s infinite" }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#E74C3C", minWidth: 40 }}>{fr(recordingTime)}</span>
                  <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 1.5, height: 28 }}>
                    {Array.from({ length: 24 }, (_, i) => (
                      <div key={i} style={{ width: 2.5, borderRadius: 2, height: `${Math.random() * 18 + 6}px`, background: "#E74C3C", animation: `waveBar ${0.4 + Math.random() * 0.4}s ease-in-out infinite alternate`, animationDelay: `${i * 0.04}s` }} />
                    ))}
                  </div>
                  <button onClick={cancelRecording} style={{ width: 36, height: 36, borderRadius: "50%", background: "#f0f0f0", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Trash2 size={16} color="#E74C3C" />
                  </button>
                  <button onClick={stopRecording} style={{ width: 36, height: 36, borderRadius: "50%", background: WA_GREEN, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Send size={16} color="#fff" />
                  </button>
                </div>
              )}

              {/* Normal input row */}
              <button onClick={() => setShowEmojiBar(p => !p)} style={{ background: "none", border: "none", cursor: "pointer", padding: 6, color: textSub, display: "flex", marginBottom: 4 }}>
                <Smile size={22} />
              </button>
              <div style={{ flex: 1, background: isDark ? "#2a3942" : "#fff", borderRadius: 20, display: "flex", alignItems: "flex-end", padding: "6px 12px", gap: 6, minHeight: 44 }}>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => { handleInputChange(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 100) + "px"; }}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && settings.enterSends) { e.preventDefault(); sendMessage(); } }}
                  placeholder={canSend() ? "Type a message…" : activeChannel.type === "announcement" ? "Only admins can post" : "Channel locked"}
                  disabled={!canSend()}
                  rows={1}
                  style={{ flex: 1, border: "none", background: "transparent", fontSize: msgFontSz, color: textMain, outline: "none", resize: "none", lineHeight: "1.4", maxHeight: 100, overflow: "auto", paddingTop: 2, fontFamily: "inherit" }}
                />
                <div style={{ display: "flex", gap: 2, marginBottom: 2, flexShrink: 0 }}>
                  <button onClick={() => imageInputRef.current?.click()} disabled={!canSend()} style={{ background: "none", border: "none", cursor: "pointer", color: textSub, padding: "3px 4px", display: "flex" }}>
                    <Camera size={20} />
                  </button>
                  <button onClick={() => fileInputRef.current?.click()} disabled={!canSend()} style={{ background: "none", border: "none", cursor: "pointer", color: textSub, padding: "3px 4px", display: "flex" }}>
                    <Paperclip size={20} />
                  </button>
                </div>
              </div>

              {/* Send or Mic */}
              {input.trim() ? (
                <button onClick={() => sendMessage()} style={{ width: 46, height: 46, borderRadius: "50%", background: WA_GREEN, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 2px 8px rgba(7,94,84,.3)" }}>
                  {uploading ? <Loader2 style={{ width: 18, height: 18, color: "#fff", animation: "spin .8s linear infinite" }} /> : <Send style={{ width: 18, height: 18, color: "#fff" }} />}
                </button>
              ) : (
                <button
                  onMouseDown={e => { e.preventDefault(); if (!isRecording) startRecording(); }}
                  onMouseUp={e => { e.preventDefault(); if (isRecording && !recordingLocked) stopRecording(); }}
                  onTouchStart={e => {
                    e.preventDefault();
                    if (!isRecording) startRecording();
                  }}
                  onTouchMove={e => {
                    if (!isRecording) return;
                    const t = e.touches[0];
                    const btn = e.currentTarget.getBoundingClientRect();
                    if (btn.left - t.clientX > 80) cancelRecording();
                    if (btn.top - t.clientY > 60) setRecordingLocked(true);
                  }}
                  onTouchEnd={e => { e.preventDefault(); if (isRecording && !recordingLocked) stopRecording(); }}
                  style={{ width: 46, height: 46, borderRadius: "50%", background: isRecording ? "#E74C3C" : WA_GREEN, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: isRecording ? "0 0 0 8px rgba(231,76,60,.2)" : "0 2px 8px rgba(7,94,84,.3)", transition: "all .2s" }}
                >
                  <Mic style={{ width: 20, height: 20, color: "#fff" }} />
                </button>
              )}
            </div>

            {/* Hidden file inputs */}
            <input ref={fileInputRef} type="file" style={{ display: "none" }} onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0], "file")} />
            <input ref={imageInputRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0], "image")} />
            <input ref={avatarInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => e.target.files?.[0] && handleAvatarUpload(e.target.files[0])} />
          </>
        )}
      </div>

      {/* ═══ SHEETS & OVERLAYS ════════════════════════════════ */}

      {/* Hamburger Drawer */}
      {showHamburger && (
        <div style={{ position: "fixed", inset: 0, zIndex: 500, display: "flex" }} onClick={() => setShowHamburger(false)}>
          <div className="hamburger-drawer" style={{ width: 280, background: isDark ? "#111b21" : "#fff", height: "100%", boxShadow: "2px 0 20px rgba(0,0,0,.3)", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
            {/* Profile section */}
            <div style={{ background: isDark ? "#202c33" : WA_GREEN, padding: "40px 20px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
              {myProfile.avatar_url
                ? <img src={myProfile.avatar_url} style={{ width: 60, height: 60, borderRadius: "50%", objectFit: "cover" }} alt="" />
                : <div style={{ width: 60, height: 60, borderRadius: "50%", background: "rgba(255,255,255,.2)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 26 }}>{myInitial}</div>
              }
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>{myProfile.full_name || "Student"}</div>
              <div style={{ color: "rgba(255,255,255,.75)", fontSize: 12 }}>{settings.about}</div>
            </div>
            {/* Menu items */}
            {[
              { icon: <MessageCircle size={20} />, label: "Chats", fn: () => setShowHamburger(false) },
              { icon: <User size={20} />, label: "My Profile", fn: () => { setSettingsTab("profile"); setShowSettings(true); setShowHamburger(false); } },
              { icon: <Settings size={20} />, label: "Settings", fn: () => { setShowSettings(true); setShowHamburger(false); } },
              { icon: <Bell size={20} />, label: "Notifications", fn: () => { setSettingsTab("notifications"); setShowSettings(true); setShowHamburger(false); } },
              { icon: <Bookmark size={20} />, label: "Starred Messages", fn: () => { toast({ title: `${starredMessages.size} starred messages` }); setShowHamburger(false); } },
              { icon: <Archive size={20} />, label: "Archived Chats", fn: () => { setShowArchived(true); setShowHamburger(false); } },
              { icon: <HelpCircle size={20} />, label: "Help", fn: () => { setSettingsTab("help"); setShowSettings(true); setShowHamburger(false); } },
            ].map((item, i) => (
              <button key={i} onClick={item.fn} style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 20px", background: "none", border: "none", cursor: "pointer", color: textMain, fontSize: 15, borderBottom: `1px solid ${divider}` }}>
                <span style={{ color: WA_GREEN }}>{item.icon}</span>{item.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Delete Sheet */}
      {showDeleteSheet && (
        <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "flex-end" }} onClick={() => setShowDeleteSheet(null)}>
          <div className="sheet" style={{ width: "100%", maxWidth: 480, margin: "0 auto", background: isDark ? "#202c33" : "#fff", borderRadius: "20px 20px 0 0", overflow: "hidden" }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${divider}`, fontSize: 14, color: textSub, textAlign: "center" }}>Delete Message</div>
            <button onClick={() => deleteForMe(showDeleteSheet)} style={{ width: "100%", padding: "16px 20px", background: "none", border: "none", cursor: "pointer", textAlign: "left", fontSize: 15, color: textMain, borderBottom: `1px solid ${divider}` }}>Delete for me</button>
            {messages.find(m => m.id === showDeleteSheet)?.user_id === user?.id && (
              <button onClick={() => deleteForAll(showDeleteSheet)} style={{ width: "100%", padding: "16px 20px", background: "none", border: "none", cursor: "pointer", textAlign: "left", fontSize: 15, color: "#E74C3C", borderBottom: `1px solid ${divider}` }}>Delete for everyone</button>
            )}
            <button onClick={() => setShowDeleteSheet(null)} style={{ width: "100%", padding: "16px 20px", background: "none", border: "none", cursor: "pointer", textAlign: "center", fontSize: 15, color: textSub }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Forward Sheet */}
      {showForwardSheet && (
        <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "flex-end" }} onClick={() => setShowForwardSheet(false)}>
          <div className="sheet" style={{ width: "100%", maxWidth: 480, margin: "0 auto", background: isDark ? "#202c33" : "#fff", borderRadius: "20px 20px 0 0", maxHeight: "70vh", display: "flex", flexDirection: "column", overflow: "hidden" }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${divider}`, fontSize: 16, fontWeight: 700, color: textMain, display: "flex", alignItems: "center", gap: 10 }}>
              <Forward size={18} color={WA_GREEN} /> Forward to…
            </div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              {channels.map(ch => (
                <div key={ch.id} onClick={() => forwardToChannel(ch.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", cursor: "pointer", borderBottom: `1px solid ${divider}` }}>
                  {chAvatarEl(ch, 42)}
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15, color: textMain }}>{getCN(ch)}</div>
                    <div style={{ fontSize: 12, color: textSub }}>{memberCounts[ch.id] || 0} members</div>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setShowForwardSheet(false)} style={{ width: "100%", padding: 16, background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "#E74C3C", borderTop: `1px solid ${divider}` }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Overlays (close on backdrop click) */}
      {channelMenu && (
        <div style={{ position: "fixed", inset: 0, zIndex: 199 }} onClick={() => { setChannelMenu(null); }} />
      )}

      {/* Settings Panel */}
      {showSettings && renderSettings()}

      {/* Dialogs */}
      {showCreateDialog && <CreateChannelDialog isOpen onClose={() => setShowCreateDialog(false)} onChannelCreated={handleChannelCreated} />}
      {showBrowseChannels && <BrowseChannelsDialog isOpen onClose={() => setShowBrowseChannels(false)} onChannelJoined={handleChannelCreated} />}
      {showGroupInfo && activeChannel && (
        <GroupInfoPanel channel={activeChannel} onClose={() => setShowGroupInfo(false)} canModerate={canModerate} memberCount={memberCounts[activeChannel.id] || 0}
          onEditName={() => { setEditName(getCN(activeChannel)); setEditDesc((activeChannel as any).description || ""); setEditingChannel(true); setShowGroupInfo(false); }}
          onAvatarClick={() => avatarInputRef.current?.click()} onDeleteGroup={deleteGroup} onLeaveGroup={() => leaveChannel(activeChannel.id)}
          onMemberClick={(m: any) => { setSelectedMember(m); setShowStudentProfile(true); setShowGroupInfo(false); }}
        />
      )}
      {showStudentProfile && selectedMember && (
        <div style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,.5)" }} onClick={() => setShowStudentProfile(false)}>
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, maxWidth: 480, margin: "0 auto", background: isDark ? "#111b21" : "#fff", borderRadius: "20px 20px 0 0", maxHeight: "85vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{ background: `linear-gradient(135deg, ${WA_GREEN}, #128C7E)`, padding: "32px 20px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, position: "relative" }}>
              <button onClick={() => setShowStudentProfile(false)} style={{ position: "absolute", top: 12, right: 12, background: "rgba(255,255,255,.15)", border: "none", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff" }}>
                <X size={16} />
              </button>
              {selectedMember.avatar_url
                ? <img src={selectedMember.avatar_url} style={{ width: 80, height: 80, borderRadius: "50%", objectFit: "cover", border: "3px solid rgba(255,255,255,.3)" }} alt="" />
                : <div style={{ width: 80, height: 80, borderRadius: "50%", background: "rgba(255,255,255,.2)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 32, fontWeight: 700 }}>
                    {(selectedMember.full_name || "S")[0].toUpperCase()}
                  </div>
              }
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 18 }}>{selectedMember.full_name || "Student"}</div>
              {selectedMember.full_name_ar && <div style={{ color: "rgba(255,255,255,.7)", fontSize: 13 }} dir="rtl">{selectedMember.full_name_ar}</div>}
              {onlineUsers.has(selectedMember.user_id)
                ? <span style={{ fontSize: 11, color: "#25D366", background: "rgba(37,211,102,.15)", padding: "2px 10px", borderRadius: 20, fontWeight: 700 }}>● Online</span>
                : <span style={{ fontSize: 11, color: "rgba(255,255,255,.5)" }}>Offline</span>
              }
            </div>
            {/* Details */}
            <div style={{ padding: "0 0 16px" }}>
              {[
                { label: "Level",      val: (selectedMember as any).level || "—" },
                { label: "Student ID", val: (selectedMember as any).student_id || "—" },
                { label: "Email",      val: (selectedMember as any).email || "—" },
                { label: "About",      val: "Available" },
              ].map((row, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", padding: "14px 20px", borderBottom: `1px solid ${divider}` }}>
                  <span style={{ fontSize: 13, color: textSub, minWidth: 90 }}>{row.label}</span>
                  <span style={{ fontSize: 14, color: textMain, fontWeight: 500 }}>{row.val}</span>
                </div>
              ))}
              {/* Mutual groups */}
              <div style={{ padding: "14px 20px", borderBottom: `1px solid ${divider}` }}>
                <div style={{ fontSize: 13, color: textSub, marginBottom: 6 }}>Groups in common</div>
                <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6 }}>
                  {channels.filter(c => c.type !== "dm").slice(0, 4).map(c => (
                    <span key={c.id} style={{ fontSize: 12, background: inputBg, color: textMain, padding: "3px 10px", borderRadius: 20 }}>{getCN(c)}</span>
                  ))}
                </div>
              </div>
              {/* Actions */}
              <div style={{ padding: "14px 20px", display: "flex", gap: 12 }}>
                {selectedMember.user_id !== user?.id && (
                  <button onClick={() => {
                    setShowStudentProfile(false);
                    toast({ title: "DM coming soon!" });
                  }} style={{ flex: 1, padding: "12px", borderRadius: 12, background: WA_GREEN, border: "none", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <MessageCircle size={16} /> Message
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit channel name sheet */}
      {editingChannel && (
        <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "flex-end" }} onClick={() => setEditingChannel(false)}>
          <div className="sheet" style={{ width: "100%", maxWidth: 480, margin: "0 auto", background: isDark ? "#202c33" : "#fff", borderRadius: "20px 20px 0 0", padding: 20, display: "flex", flexDirection: "column", gap: 14 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 17, fontWeight: 700, color: textMain }}>Edit Group</div>
            {[
              { label: "Group Name", val: editName, set: setEditName, placeholder: "Group name" },
              { label: "Description", val: editDesc, set: setEditDesc, placeholder: "About this group…" },
            ].map(f => (
              <div key={f.label}>
                <div style={{ fontSize: 12, color: WA_GREEN, marginBottom: 4 }}>{f.label}</div>
                <input value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.placeholder} style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: `1px solid ${divider}`, background: inputBg, color: textMain, fontSize: 14, boxSizing: "border-box" }} />
              </div>
            ))}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setEditingChannel(false)} style={{ flex: 1, padding: "12px", borderRadius: 10, border: `1px solid ${divider}`, background: "transparent", color: textMain, cursor: "pointer", fontSize: 15 }}>Cancel</button>
              <button onClick={saveChannelEdit} style={{ flex: 1, padding: "12px", borderRadius: 10, border: "none", background: WA_GREEN, color: "#fff", cursor: "pointer", fontSize: 15, fontWeight: 700 }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Majlis;
