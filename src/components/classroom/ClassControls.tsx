import { useState, useEffect, useCallback } from "react";
import { useRoomContext } from "@livekit/components-react";
import { Track, createLocalScreenTracks } from "livekit-client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import {
  Mic, MicOff, Video, VideoOff, Monitor, MonitorOff, Hand,
  MessageCircle, Users, MoreHorizontal, Phone, Smile,
  LogOut, BarChart3, FileText, Zap, Link2, Settings, Timer,
  MicOff as MuteAll, Lock, Eye
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";

interface ClassControlsProps {
  sessionId: string;
  onToggleChat: () => void;
  onToggleParticipants: () => void;
  onEndClass: () => void;
  onLeaveClass: () => void;
  chatUnread: number;
  onLaunchPoll: () => void;
  onLaunchQuiz: () => void;
}

const REACTION_EMOJIS = ["👏", "🤲", "❤️", "😂", "🌟", "👍"];

const ClassControls = ({
  sessionId, onToggleChat, onToggleParticipants, onEndClass, onLeaveClass,
  chatUnread, onLaunchPoll, onLaunchQuiz
}: ClassControlsProps) => {
  const room = useRoomContext();
  const { user, hasRole } = useAuth();
  const { t } = useLanguage();
  const isPrivileged = hasRole("admin") || hasRole("teacher");

  const [micEnabled, setMicEnabled] = useState(true);
  const [camEnabled, setCamEnabled] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [floatingEmoji, setFloatingEmoji] = useState<{ emoji: string; id: number } | null>(null);

  // Sync mic/cam state
  useEffect(() => {
    const lp = room.localParticipant;
    setMicEnabled(lp.isMicrophoneEnabled);
    setCamEnabled(lp.isCameraEnabled);
  }, [room]);

  const toggleMic = useCallback(async () => {
    await room.localParticipant.setMicrophoneEnabled(!micEnabled);
    setMicEnabled(!micEnabled);
  }, [room, micEnabled]);

  const toggleCam = useCallback(async () => {
    await room.localParticipant.setCameraEnabled(!camEnabled);
    setCamEnabled(!camEnabled);
  }, [room, camEnabled]);

  const toggleScreenShare = useCallback(async () => {
    if (screenSharing) {
      const pubs = Array.from(room.localParticipant.trackPublications.values())
        .filter(pub => pub.track?.source === Track.Source.ScreenShare || pub.track?.source === Track.Source.ScreenShareAudio);
      for (const pub of pubs) {
        if (pub.track) {
          await room.localParticipant.unpublishTrack(pub.track);
          pub.track.stop();
        }
      }
      setScreenSharing(false);
    } else {
      try {
        const tracks = await createLocalScreenTracks({
          audio: true,
          resolution: { width: 1280, height: 720, frameRate: 15 },
        });
        for (const track of tracks) {
          await room.localParticipant.publishTrack(track);
        }
        setScreenSharing(true);
        // Auto-stop when user stops via browser UI
        tracks.forEach(track => {
          track.mediaStreamTrack.addEventListener("ended", () => {
            room.localParticipant.unpublishTrack(track);
            setScreenSharing(false);
          });
        });
      } catch (err: any) {
        if (err?.name !== "NotAllowedError") {
          toast({ title: t("Screen share failed", "فشل مشاركة الشاشة"), variant: "destructive" });
        }
      }
    }
  }, [room, screenSharing, t]);

  const toggleHand = useCallback(async () => {
    if (!user || !sessionId) return;
    const newState = !handRaised;
    setHandRaised(newState);
    await supabase.from("class_participants")
      .update({
        hand_raised: newState,
        hand_raised_at: newState ? new Date().toISOString() : null
      })
      .eq("session_id", sessionId)
      .eq("student_id", user.id);
  }, [handRaised, user, sessionId]);

  const sendReaction = (emoji: string) => {
    setFloatingEmoji({ emoji, id: Date.now() });
    setShowReactions(false);
    // Send as chat message
    if (user) {
      supabase.from("class_chat_messages").insert({
        session_id: sessionId,
        sender_id: user.id,
        message: emoji,
        type: "emoji",
      });
    }
    setTimeout(() => setFloatingEmoji(null), 2000);
  };

  const muteAllStudents = async () => {
    await supabase.from("class_participants")
      .update({ is_muted: true })
      .eq("session_id", sessionId);
    toast({ title: t("All students muted", "تم كتم جميع الطلاب") });
  };

  return (
    <>
      {/* Floating emoji animation */}
      {floatingEmoji && (
        <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center">
          <span className="text-6xl animate-bounce opacity-80">{floatingEmoji.emoji}</span>
        </div>
      )}

      {/* Screen share banner */}
      {screenSharing && (
        <div className="bg-destructive/90 text-destructive-foreground text-center py-1 text-xs flex items-center justify-center gap-2">
          <Monitor className="h-3 w-3 animate-pulse" />
          {t("Sharing your screen", "تتم مشاركة شاشتك")}
          <Button size="sm" variant="secondary" className="h-5 text-[10px] px-2" onClick={toggleScreenShare}>
            {t("Stop", "إيقاف")}
          </Button>
        </div>
      )}

      {/* Main control bar */}
      <div className="h-16 bg-primary flex items-center justify-between px-2 md:px-4 gap-1">
        {/* Left controls */}
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            className={`rounded-full h-10 px-3 gap-1.5 text-xs font-medium ${
              micEnabled ? "bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20" : "bg-destructive text-destructive-foreground hover:bg-destructive/90"
            }`}
            onClick={toggleMic}
          >
            {micEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
            <span className="hidden sm:inline">{micEnabled ? t("Mic", "مايك") : t("Muted", "صامت")}</span>
          </Button>

          <Button
            size="sm"
            className={`rounded-full h-10 px-3 gap-1.5 text-xs font-medium ${
              camEnabled ? "bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20" : "bg-muted text-muted-foreground hover:bg-muted/90"
            }`}
            onClick={toggleCam}
          >
            {camEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
            <span className="hidden sm:inline">{camEnabled ? t("Cam", "كام") : t("Off", "مغلق")}</span>
          </Button>

          <Button
            size="sm"
            className={`rounded-full h-10 px-3 gap-1.5 text-xs font-medium ${
              screenSharing ? "bg-destructive text-destructive-foreground" : "bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20"
            }`}
            onClick={toggleScreenShare}
          >
            {screenSharing ? <MonitorOff className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
            <span className="hidden sm:inline">{screenSharing ? t("Stop", "إيقاف") : t("Share", "مشاركة")}</span>
          </Button>
        </div>

        {/* Center controls */}
        <div className="flex items-center gap-1">
          {!isPrivileged && (
            <Button
              size="sm"
              className={`rounded-full h-10 px-3 gap-1.5 text-xs font-medium ${
                handRaised ? "bg-secondary text-secondary-foreground" : "bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20"
              }`}
              onClick={toggleHand}
            >
              <Hand className="h-4 w-4" />
              <span className="hidden sm:inline">{handRaised ? t("Lower Hand", "خفض اليد") : t("Raise Hand", "رفع اليد")}</span>
            </Button>
          )}

          <div className="relative">
            <Button
              size="sm"
              className="rounded-full h-10 px-3 text-xs bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20"
              onClick={() => setShowReactions(!showReactions)}
            >
              <Smile className="h-4 w-4" />
            </Button>
            {showReactions && (
              <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-card rounded-full shadow-lg px-2 py-1 flex gap-1 z-50">
                {REACTION_EMOJIS.map(e => (
                  <button key={e} onClick={() => sendReaction(e)} className="text-lg hover:scale-125 transition-transform p-1">{e}</button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            className="rounded-full h-10 px-3 text-xs bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20 relative"
            onClick={onToggleChat}
          >
            <MessageCircle className="h-4 w-4" />
            {chatUnread > 0 && (
              <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full h-4 w-4 text-[10px] flex items-center justify-center">
                {chatUnread}
              </span>
            )}
          </Button>

          <Button
            size="sm"
            className="rounded-full h-10 px-3 text-xs bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20"
            onClick={onToggleParticipants}
          >
            <Users className="h-4 w-4" />
          </Button>

          {/* More menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="rounded-full h-10 px-3 text-xs bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {isPrivileged && (
                <>
                  <DropdownMenuItem onClick={onLaunchPoll}>
                    <BarChart3 className="h-4 w-4 mr-2" /> {t("Launch Poll", "إطلاق تصويت")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onLaunchQuiz}>
                    <Zap className="h-4 w-4 mr-2" /> {t("Live Quiz", "اختبار مباشر")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={muteAllStudents}>
                    <MuteAll className="h-4 w-4 mr-2" /> {t("Mute All Students", "كتم الجميع")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onClick={isPrivileged ? onEndClass : onLeaveClass}>
                <LogOut className="h-4 w-4 mr-2 text-destructive" />
                <span className="text-destructive">{isPrivileged ? t("End Class", "إنهاء الحصة") : t("Leave Class", "مغادرة الحصة")}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* End Class button for teacher */}
          {isPrivileged && (
            <Button
              size="sm"
              className="rounded-full h-10 px-4 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-1.5"
              onClick={onEndClass}
            >
              <Phone className="h-4 w-4 rotate-[135deg]" />
              <span className="hidden sm:inline">{t("End", "إنهاء")}</span>
            </Button>
          )}
        </div>
      </div>
    </>
  );
};

export default ClassControls;
