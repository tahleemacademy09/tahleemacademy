import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Search, Users, Loader2, LogIn } from "lucide-react";
import type { ChatChannel } from "./types";

interface BrowseChannelsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  myChannelIds: string[];
  onJoined: (channelId: string) => void;
}

const BrowseChannelsDialog = ({ open, onOpenChange, myChannelIds, onJoined }: BrowseChannelsDialogProps) => {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("chat_channels" as any)
        .select("*")
        .eq("is_private", false)
        .in("type", ["group", "level"])
        .order("created_at", { ascending: false });
      setChannels((data || []) as unknown as ChatChannel[]);
      setLoading(false);
    };
    load();
  }, [open]);

  const filtered = channels.filter(c =>
    (c.name || "").toLowerCase().includes(search.toLowerCase()) ||
    (c.name_ar || "").toLowerCase().includes(search.toLowerCase()) ||
    (c.description || "").toLowerCase().includes(search.toLowerCase())
  );

  const joinChannel = async (channelId: string) => {
    if (!user) return;
    setJoining(channelId);
    try {
      await supabase.from("chat_members" as any).insert({
        channel_id: channelId,
        user_id: user.id,
        role: "member",
      });
      // Update member count
      const ch = channels.find(c => c.id === channelId);
      if (ch) {
        await supabase.from("chat_channels" as any).update({ member_count: ch.member_count + 1 }).eq("id", channelId);
      }
      toast({ title: t("Joined!", "تم الانضمام!") });
      onJoined(channelId);
    } catch (e: any) {
      toast({ title: t("Error joining", "خطأ في الانضمام"), description: e.message, variant: "destructive" });
    }
    setJoining(null);
  };

  const getName = (ch: ChatChannel) => language === "ar" ? (ch.name_ar || ch.name) : ch.name;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle dir="auto">{t("Browse Channels", "تصفح القنوات")}</DialogTitle>
        </DialogHeader>
        <div className="relative mb-2">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("Search channels...", "بحث في القنوات...")}
            className="ps-9"
            dir="auto"
          />
        </div>
        <ScrollArea className="flex-1 max-h-[55vh]">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8" dir="auto">
              {t("No public channels found", "لم يتم العثور على قنوات عامة")}
            </p>
          ) : (
            <div className="space-y-2">
              {filtered.map(ch => {
                const isMember = myChannelIds.includes(ch.id);
                return (
                  <div key={ch.id} className="flex items-start gap-3 p-3 rounded-xl border hover:bg-accent/30 transition-colors">
                    <div
                      className="h-11 w-11 rounded-full flex items-center justify-center shrink-0 text-white font-bold"
                      style={{ backgroundColor: ch.type === "level" ? "#1a5c3a" : "#064E3B" }}
                    >
                      {(getName(ch) || "C").charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm" dir="auto">{getName(ch)}</span>
                        {ch.level && <Badge variant="outline" className="text-[10px] capitalize">{ch.level}</Badge>}
                      </div>
                      {ch.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2" dir="auto">{ch.description}</p>
                      )}
                      <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                        <Users className="h-3 w-3" />
                        {ch.member_count} {t("members", "عضو")}
                      </div>
                    </div>
                    {isMember ? (
                      <Badge variant="secondary" className="text-xs shrink-0 mt-1">
                        {t("Joined", "منضم")}
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => joinChannel(ch.id)}
                        disabled={joining === ch.id}
                        className="shrink-0 mt-1 text-white"
                        style={{ backgroundColor: "#064E3B" }}
                      >
                        {joining === ch.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogIn className="h-3 w-3 mr-1" />}
                        {t("Join", "انضم")}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default BrowseChannelsDialog;
