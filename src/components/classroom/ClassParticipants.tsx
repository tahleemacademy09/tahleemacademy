import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Hand, Mic, MicOff, Video, VideoOff, Crown, Wifi, WifiOff, UserMinus } from "lucide-react";

interface ClassParticipantsProps {
  sessionId: string;
  onMuteStudent?: (studentId: string) => void;
  onRemoveStudent?: (studentId: string) => void;
}

const ClassParticipants = ({ sessionId, onMuteStudent, onRemoveStudent }: ClassParticipantsProps) => {
  const { t } = useLanguage();
  const { hasRole } = useAuth();
  const isPrivileged = hasRole("admin") || hasRole("teacher");
  const [participants, setParticipants] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      if (!sessionId) return;
      const { data } = await supabase
        .from("class_participants")
        .select("*, profiles:student_id(full_name, avatar_url, level)")
        .eq("session_id", sessionId)
        .is("left_at", null)   // actively in session
        .order("joined_at");
      setParticipants(data || []);
    };
    load();

    const channel = supabase.channel(`participants-${sessionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "class_participants", filter: `session_id=eq.${sessionId}` },
        () => load())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [sessionId]);

  const handRaised = participants.filter(p => p.hand_raised);

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          {t("Participants", "المشاركون")}
          <Badge variant="secondary" className="text-xs">{participants.length}</Badge>
        </h3>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {participants.map(p => {
            const profile = (p as any).profiles;
            const name = profile?.full_name || "Student";
            const initial = name[0]?.toUpperCase() || "S";

            return (
              <div
                key={p.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 group"
              >
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="text-xs bg-primary/10 text-primary">{initial}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{name}</p>
                  {profile?.level && (
                    <p className="text-[10px] text-muted-foreground capitalize">{profile.level}</p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {p.hand_raised && (
                    <span className="text-secondary animate-bounce">
                      <Hand className="h-3.5 w-3.5" />
                    </span>
                  )}
                  {p.is_muted ? (
                    <MicOff className="h-3 w-3 text-destructive/60" />
                  ) : (
                    <Mic className="h-3 w-3 text-green-500" />
                  )}
                  {p.camera_on ? (
                    <Video className="h-3 w-3 text-green-500" />
                  ) : (
                    <VideoOff className="h-3 w-3 text-muted-foreground/40" />
                  )}
                </div>

                {/* Teacher actions */}
                {isPrivileged && (
                  <div className="hidden group-hover:flex items-center gap-0.5">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => onMuteStudent?.(p.student_id)}
                      title={t("Mute", "كتم")}
                    >
                      <MicOff className="h-3 w-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-destructive"
                      onClick={() => onRemoveStudent?.(p.student_id)}
                      title={t("Remove", "إزالة")}
                    >
                      <UserMinus className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}

          {participants.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              {t("No participants yet", "لا يوجد مشاركون بعد")}
            </p>
          )}
        </div>
      </ScrollArea>

      {/* Hand raised section */}
      {handRaised.length > 0 && isPrivileged && (
        <div className="border-t p-2">
          <p className="text-xs font-medium text-secondary mb-1 flex items-center gap-1">
            <Hand className="h-3 w-3" /> {handRaised.length} {t("hand(s) raised", "يد مرفوعة")}
          </p>
          {handRaised.map(p => (
            <div key={p.id} className="flex items-center justify-between py-1">
              <span className="text-xs">{(p as any).profiles?.full_name}</span>
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[10px] px-2"
                onClick={async () => {
                  await supabase.from("class_participants").update({ hand_raised: false, hand_raised_at: null }).eq("id", p.id);
                }}
              >
                {t("Lower", "خفض")}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ClassParticipants;
