import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  Search, Plus, MessageCircle, Users, GraduationCap, Megaphone,
  Hash, Globe, ChevronDown, ChevronRight, BarChart3
} from "lucide-react";
import type { ChatChannel, UserProfile } from "./types";

interface MajlisSidebarProps {
  channels: ChatChannel[];
  activeChannelId: string | null;
  onSelectChannel: (id: string) => void;
  onNewChat: () => void;
  onBrowseChannels: () => void;
  profiles: Record<string, UserProfile>;
  unreadCounts: Record<string, number>;
  userId: string;
  onBroadcast?: () => void;
  onAdminDashboard?: () => void;
}

const MajlisSidebar = ({
  channels, activeChannelId, onSelectChannel, onNewChat,
  onBrowseChannels, profiles, unreadCounts, userId,
  onBroadcast, onAdminDashboard
}: MajlisSidebarProps) => {
  const { t, language } = useLanguage();
  const { hasRole } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    dms: true, groups: true, levels: true, announcements: true
  });

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const directChannels = channels.filter(c => c.type === "direct");
  const groupChannels = channels.filter(c => c.type === "group");
  const levelChannels = channels.filter(c => c.type === "level");
  const announcementChannels = channels.filter(c => c.type === "announcement");

  const filtered = searchQuery.trim()
    ? channels.filter(c =>
        (c.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.name_ar || "").toLowerCase().includes(searchQuery.toLowerCase())
      )
    : null;

  const getChannelDisplayName = (channel: ChatChannel) => {
    if (channel.type === "direct") {
      // For DMs, show the other person's name
      const otherName = channel.name; // We store the other person's name
      return language === "ar" ? (channel.name_ar || otherName || t("Direct Message", "رسالة خاصة")) : (otherName || t("Direct Message", "رسالة خاصة"));
    }
    return language === "ar" ? (channel.name_ar || channel.name || "") : (channel.name || "");
  };

  const getChannelIcon = (channel: ChatChannel) => {
    switch (channel.type) {
      case "direct": return <MessageCircle className="h-4 w-4" />;
      case "group": return <Users className="h-4 w-4" />;
      case "level": return <GraduationCap className="h-4 w-4" />;
      case "announcement": return <Megaphone className="h-4 w-4" />;
      default: return <Hash className="h-4 w-4" />;
    }
  };

  const getLevelBadgeColor = (level: string | null) => {
    switch (level) {
      case "beginner": return "bg-green-500";
      case "intermediate": return "bg-yellow-500";
      case "advanced": return "bg-red-500";
      default: return "bg-gray-500";
    }
  };

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 86400000) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (diff < 604800000) return d.toLocaleDateString([], { weekday: "short" });
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const ChannelRow = ({ channel }: { channel: ChatChannel }) => {
    const unread = unreadCounts[channel.id] || 0;
    const isActive = activeChannelId === channel.id;

    return (
      <button
        onClick={() => onSelectChannel(channel.id)}
        className={`w-full flex items-center gap-3 px-4 py-3 transition-colors border-b hover:bg-accent/30 ${
          isActive ? "bg-accent/40" : ""
        }`}
        style={{ borderColor: "hsl(var(--border))" }}
      >
        <Avatar className="h-11 w-11 shrink-0">
          {channel.avatar ? (
            <AvatarImage src={channel.avatar} />
          ) : null}
          <AvatarFallback
            className="text-sm font-bold text-white"
            style={{ backgroundColor: channel.type === "announcement" ? "#c9973a" : "#064E3B" }}
          >
            {channel.type === "announcement" ? "📢" : getChannelDisplayName(channel).charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0 text-start">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-sm truncate text-foreground" dir="auto">
              {getChannelDisplayName(channel)}
            </span>
            {channel.last_message_at && (
              <span className={`text-[11px] shrink-0 ms-2 ${unread > 0 ? "text-green-600 font-semibold" : "text-muted-foreground"}`}>
                {formatTime(channel.last_message_at)}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between mt-0.5">
            <p className="text-xs text-muted-foreground truncate" dir="auto">
              {channel.last_message || t("Tap to open", "اضغط لفتح")}
            </p>
            {unread > 0 && (
              <span
                className="shrink-0 ms-2 h-5 min-w-[20px] px-1 rounded-full text-[11px] font-bold text-white flex items-center justify-center"
                style={{ backgroundColor: "#25D366" }}
              >
                {unread}
              </span>
            )}
          </div>
        </div>
      </button>
    );
  };

  const SectionHeader = ({ title, titleAr, section, count }: { title: string; titleAr: string; section: string; count: number }) => (
    <button
      onClick={() => toggleSection(section)}
      className="w-full flex items-center justify-between px-4 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
      style={{ backgroundColor: "rgba(0,0,0,0.02)" }}
    >
      <span dir="auto">
        {language === "ar" ? titleAr : title} ({count})
      </span>
      {expandedSections[section] ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
    </button>
  );

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: "#FAFAF8" }}>
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: "#064E3B" }}>
        <h1
          className="text-lg font-bold text-white"
          style={{ fontFamily: language === "ar" ? "'Amiri', serif" : "'Playfair Display', serif" }}
        >
          {t("Al-Majlis", "المجلس")}
        </h1>
        <div className="flex items-center gap-1">
          <button
            onClick={onBrowseChannels}
            className="text-white/80 hover:text-white p-1.5 rounded-full hover:bg-white/10 transition-colors"
            title={t("Browse Channels", "تصفح القنوات")}
          >
            <Globe className="h-5 w-5" />
          </button>
          <button
            onClick={onNewChat}
            className="text-white/80 hover:text-white p-1.5 rounded-full hover:bg-white/10 transition-colors"
            title={t("New Chat", "محادثة جديدة")}
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b" style={{ borderColor: "hsl(var(--border))" }}>
        <div className="relative">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("Search channels & users...", "بحث في القنوات والمستخدمين...")}
            className="h-9 text-sm ps-9 rounded-full bg-white"
            dir="auto"
          />
        </div>
      </div>

      {/* Channel list */}
      <div className="flex-1 overflow-y-auto">
        {filtered ? (
          // Search results
          filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground p-6 text-center" dir="auto">
              {t("No results found", "لم يتم العثور على نتائج")}
            </p>
          ) : (
            filtered.map(ch => <ChannelRow key={ch.id} channel={ch} />)
          )
        ) : (
          <>
            {/* Direct Messages */}
            {directChannels.length > 0 && (
              <>
                <SectionHeader title="Direct Messages" titleAr="الرسائل الخاصة" section="dms" count={directChannels.length} />
                {expandedSections.dms && directChannels.map(ch => <ChannelRow key={ch.id} channel={ch} />)}
              </>
            )}

            {/* Groups */}
            <SectionHeader title="My Groups" titleAr="مجموعاتي" section="groups" count={groupChannels.length} />
            {expandedSections.groups && groupChannels.map(ch => <ChannelRow key={ch.id} channel={ch} />)}

            {/* Level Channels */}
            {levelChannels.length > 0 && (
              <>
                <SectionHeader title="By Level" titleAr="حسب المستوى" section="levels" count={levelChannels.length} />
                {expandedSections.levels && levelChannels.map(ch => (
                  <ChannelRow key={ch.id} channel={ch} />
                ))}
              </>
            )}

            {/* Announcements */}
            {announcementChannels.length > 0 && (
              <>
                <SectionHeader title="Announcements" titleAr="الإعلانات" section="announcements" count={announcementChannels.length} />
                {expandedSections.announcements && announcementChannels.map(ch => <ChannelRow key={ch.id} channel={ch} />)}
              </>
            )}

            {channels.length === 0 && (
              <p className="text-sm text-muted-foreground p-6 text-center" dir="auto">
                {t("No channels yet. Create one or browse!", "لا توجد قنوات بعد. أنشئ واحدة أو تصفح!")}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default MajlisSidebar;
