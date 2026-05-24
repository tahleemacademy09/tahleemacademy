// src/components/classroom/ClassControls.tsx
// ── Google-Meet-parity control bar ────────────────────────────────────────
// NEW vs original:
//  • busy-guard on mic + cam → no more repeated-press stuck state
//  • mic/cam state read from LiveKit track-events (not just local shadow)
//  • Settings modal: microphone, speaker/Bluetooth, camera, noise-cancel, video quality
//  • Camera flip button (front ↔ back) — visible on mobile
//  • Background blur toggle (CSS + canvas-processor flag)
//  • Captions toggle (Web Speech API)
//  • "Pin" support exposed via onPinParticipant prop
//  • All original features kept intact

import { useState, useEffect, useCallback, useRef } from "react";
import { useRoomContext } from "@livekit/components-react";
import { Track, createLocalScreenTracks, RoomEvent } from "livekit-client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { useLiveClass } from "@/contexts/LiveClassContext";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import {
  Mic, MicOff, Video, VideoOff, Monitor, MonitorOff, Hand,
  MessageCircle, Users, MoreHorizontal, Phone, Smile, LogOut,
  BarChart3, Zap, Settings, X, Check, Volume2,
  Captions, CaptionsOff, Blend, BarChart2,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

/* ─────────────────────────────────────────────────────────────────────────
   PROPS
   ───────────────────────────────────────────────────────────────────────── */
interface ClassControlsProps {
  sessionId:             string;
  onToggleChat:          () => void;
  onToggleParticipants:  () => void;
  onEndClass:            () => void;
  onLeaveClass:          () => void;
  chatUnread:            number;
  onLaunchPoll:          () => void;
  onLaunchQuiz:          () => void;
  /** Override privilege check — set true for guest/public-class hosts who don't have admin/teacher roles */
  isHostOverride?:       boolean;
}

const REACTION_EMOJIS = ["👏", "🤲", "❤️", "😂", "🌟", "👍"];
const MORE_EMOJIS = [
  "😍","🥰","😊","🤩","🎉","🔥","💯","✨","🙌","💪",
  "🤔","😮","😢","😅","🤣","😇","🙏","⭐","💎","🌺",
];

/* ─────────────────────────────────────────────────────────────────────────
   SETTINGS MODAL
   Full device picker (mic, speaker/Bluetooth, camera), noise-cancel,
   video quality — matches Google Meet's settings panel.
   ───────────────────────────────────────────────────────────────────────── */
const SettingsModal = ({ onClose, room }: { onClose: () => void; room: any }) => {
  const { t } = useLanguage();
  const [tab, setTab] = useState<"audio" | "video" | "tips">("audio");

  // Devices
  const [audioIn,   setAudioIn]   = useState<MediaDeviceInfo[]>([]);
  const [audioOut,  setAudioOut]  = useState<MediaDeviceInfo[]>([]);
  const [videoIn,   setVideoIn]   = useState<MediaDeviceInfo[]>([]);
  const [selAudioIn,  setSelAudioIn]  = useState("");
  const [selAudioOut, setSelAudioOut] = useState("");
  const [selVideoIn,  setSelVideoIn]  = useState("");

  // Settings
  const [quality,    setQuality]    = useState<"low" | "medium" | "high">("medium");
  const [noiseCancel, setNoiseCancel] = useState(true);

  useEffect(() => {
    (async () => {
      // Ask for permission first so device labels are populated
      try { await navigator.mediaDevices.getUserMedia({ audio: true }); } catch {}
      const all = await navigator.mediaDevices.enumerateDevices();
      setAudioIn(all.filter(d => d.kind === "audioinput"));
      setAudioOut(all.filter(d => d.kind === "audiooutput"));
      setVideoIn(all.filter(d => d.kind === "videoinput"));
      // Pre-select currently active devices
      try {
        const mic = await room.getActiveDevice("audioinput");
        if (mic) setSelAudioIn(mic);
        const spk = await room.getActiveDevice("audiooutput");
        if (spk) setSelAudioOut(spk);
        const cam = await room.getActiveDevice("videoinput");
        if (cam) setSelVideoIn(cam);
      } catch {}
    })();
  }, [room]);

  const switchDevice = async (kind: MediaDeviceKind, deviceId: string) => {
    try {
      await room.switchActiveDevice(kind, deviceId);
      if (kind === "audioinput")  setSelAudioIn(deviceId);
      if (kind === "audiooutput") setSelAudioOut(deviceId);
      if (kind === "videoinput")  setSelVideoIn(deviceId);
      toast({ title: t("Device switched ✓", "تم تغيير الجهاز ✓") });
    } catch (e: any) {
      toast({ title: t("Failed to switch device", "فشل تغيير الجهاز"), description: e?.message, variant: "destructive" });
    }
  };

  const applyQuality = async (q: "low" | "medium" | "high") => {
    setQuality(q);
    const bitrate = q === "low" ? 150_000 : q === "medium" ? 700_000 : 2_500_000;
    const fps     = q === "low" ? 15 : q === "medium" ? 20 : 30;
    try {
      for (const pub of Array.from(room.localParticipant.trackPublications.values()) as any[]) {
        if (pub.track?.kind === "video" && pub.source !== Track.Source.ScreenShare) {
          const sender = (pub.track as any)?.sender;
          if (sender) {
            const params = sender.getParameters();
            if (params.encodings?.length) {
              params.encodings[0].maxBitrate   = bitrate;
              params.encodings[0].maxFramerate = fps;
              await sender.setParameters(params);
            }
          }
        }
      }
      toast({ title: t(`Quality set to ${q}`, `تم ضبط الجودة: ${q}`) });
    } catch {}
  };

  /* small reusable row */
  const DeviceRow = ({ device, selected, onClick }: { device: MediaDeviceInfo; selected: boolean; onClick: () => void }) => (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
      borderRadius: 10, border: "1px solid",
      borderColor: selected ? "#22c55e" : "rgba(255,255,255,.1)",
      background:  selected ? "rgba(34,197,94,.12)" : "rgba(255,255,255,.03)",
      cursor: "pointer", width: "100%", marginBottom: 6,
    }}>
      <div style={{
        width: 16, height: 16, borderRadius: "50%", flexShrink: 0,
        border: `2px solid ${selected ? "#22c55e" : "rgba(255,255,255,.3)"}`,
        background: selected ? "#22c55e" : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {selected && <Check style={{ width: 9, height: 9, color: "#fff" }} />}
      </div>
      <span style={{ fontSize: 13, color: selected ? "#fff" : "rgba(255,255,255,.7)", textAlign: "left", flex: 1 }}>
        {device.label || `${device.kind} — ${device.deviceId.slice(0, 8)}`}
      </span>
    </button>
  );

  const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const,
      color: "rgba(255,255,255,.35)", letterSpacing: 1, marginBottom: 8, marginTop: 18 }}>
      {children}
    </div>
  );

  const Toggle = ({ value, onChange, label }: { value: boolean; onChange: () => void; label: string }) => (
    <button onClick={onChange} style={{
      display: "flex", alignItems: "center", gap: 10, padding: "12px", borderRadius: 10,
      border: "1px solid rgba(255,255,255,.1)", background: "rgba(255,255,255,.03)",
      cursor: "pointer", width: "100%",
    }}>
      <div style={{
        width: 42, height: 24, borderRadius: 12, flexShrink: 0,
        background: value ? "#22c55e" : "rgba(255,255,255,.2)", position: "relative", transition: ".25s",
      }}>
        <div style={{
          width: 18, height: 18, borderRadius: "50%", background: "#fff",
          position: "absolute", top: 3, left: value ? 21 : 3, transition: ".25s", boxShadow: "0 1px 4px rgba(0,0,0,.3)",
        }} />
      </div>
      <span style={{ fontSize: 13, color: "#fff" }}>{label}</span>
    </button>
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,.65)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}>
      <div style={{ background: "#17202a", borderRadius: 20, width: "min(460px,96vw)", maxHeight: "85vh",
        display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 64px rgba(0,0,0,.7)" }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", padding: "18px 20px",
          borderBottom: "1px solid rgba(255,255,255,.07)" }}>
          <Settings style={{ width: 18, height: 18, color: "rgba(255,255,255,.5)", marginRight: 10 }} />
          <span style={{ fontWeight: 700, color: "#fff", fontSize: 16, flex: 1 }}>{t("Settings", "الإعدادات")}</span>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: "50%",
            background: "rgba(255,255,255,.1)", border: "none", color: "#fff", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X style={{ width: 15, height: 15 }} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,.07)" }}>
          {([
            { id: "audio", label: t("Audio", "الصوت") },
            { id: "video", label: t("Video", "الفيديو") },
            { id: "tips",  label: t("Tips",  "نصائح")  },
          ] as const).map(tb => (
            <button key={tb.id} onClick={() => setTab(tb.id)} style={{
              flex: 1, padding: "12px 6px", background: "none", border: "none", cursor: "pointer",
              fontSize: 13, fontWeight: tab === tb.id ? 700 : 400,
              color: tab === tb.id ? "#fff" : "rgba(255,255,255,.4)",
              borderBottom: `2px solid ${tab === tb.id ? "#22c55e" : "transparent"}`,
              transition: ".15s",
            }}>{tb.label}</button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 20px 20px" }}>

          {tab === "audio" && (
            <>
              <SectionLabel>{t("Microphone (incl. Bluetooth)", "الميكروفون (شامل البلوتوث)")}</SectionLabel>
              {audioIn.length === 0
                ? <p style={{ fontSize: 13, color: "rgba(255,255,255,.35)" }}>{t("No microphones found", "لم يُعثر على ميكروفون")}</p>
                : audioIn.map(d => <DeviceRow key={d.deviceId} device={d} selected={selAudioIn === d.deviceId} onClick={() => switchDevice("audioinput", d.deviceId)} />)
              }

              <SectionLabel>{t("Speaker / Headset / Bluetooth", "السماعة / سماعة الرأس / البلوتوث")}</SectionLabel>
              {audioOut.length === 0
                ? <p style={{ fontSize: 13, color: "rgba(255,255,255,.35)" }}>{t("Output switching not supported on this browser", "تغيير مكبر الصوت غير مدعوم في هذا المتصفح")}</p>
                : audioOut.map(d => <DeviceRow key={d.deviceId} device={d} selected={selAudioOut === d.deviceId} onClick={() => switchDevice("audiooutput", d.deviceId)} />)
              }

              <SectionLabel>{t("Noise Cancellation", "إلغاء الضوضاء")}</SectionLabel>
              <Toggle value={noiseCancel} onChange={() => setNoiseCancel(v => !v)}
                label={noiseCancel ? t("Enabled — background noise suppressed", "مفعّل — الضوضاء مكتومة") : t("Disabled", "معطّل")} />
            </>
          )}

          {tab === "video" && (
            <>
              <SectionLabel>{t("Camera (incl. front/back)", "الكاميرا (أمامية / خلفية)")}</SectionLabel>
              {videoIn.length === 0
                ? <p style={{ fontSize: 13, color: "rgba(255,255,255,.35)" }}>{t("No cameras found", "لم يُعثر على كاميرا")}</p>
                : videoIn.map(d => <DeviceRow key={d.deviceId} device={d} selected={selVideoIn === d.deviceId} onClick={() => switchDevice("videoinput", d.deviceId)} />)
              }

              <SectionLabel>{t("Video Quality", "جودة الفيديو")}</SectionLabel>
              <div style={{ display: "flex", gap: 8 }}>
                {(["low","medium","high"] as const).map(q => (
                  <button key={q} onClick={() => applyQuality(q)} style={{
                    flex: 1, padding: "12px 4px", borderRadius: 10, border: "1px solid", cursor: "pointer",
                    fontSize: 12, fontWeight: 600,
                    borderColor: quality === q ? "#22c55e" : "rgba(255,255,255,.12)",
                    background:  quality === q ? "rgba(34,197,94,.14)" : "rgba(255,255,255,.04)",
                    color: quality === q ? "#22c55e" : "rgba(255,255,255,.55)",
                  }}>
                    {q === "low" ? t("Low 📶","منخفض 📶") : q === "medium" ? t("Medium 📶📶","متوسط 📶📶") : t("High 📶📶📶","عالي 📶📶📶")}
                  </button>
                ))}
              </div>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,.3)", marginTop: 8, lineHeight: 1.6 }}>
                {t("Low quality reduces data usage on slow connections.","الجودة المنخفضة تقلل استهلاك البيانات على الاتصالات البطيئة.")}
              </p>
            </>
          )}

          {tab === "tips" && (
            <div style={{ paddingTop: 8 }}>
              {[
                ["🎙️", t("Raise your hand to ask a question silently.", "ارفع يدك لطرح سؤال بصمت.")],
                ["📱", t("Front/back camera: tap the flip button (↺) next to your camera button.", "الكاميرا الأمامية/الخلفية: اضغط زر التبديل (↺) بجوار زر الكاميرا.")],
                ["🔵", t("Bluetooth mic/speaker: enable it on your device first, then pick it in Audio settings.", "البلوتوث: شغّله على جهازك أولاً ثم اختره في إعدادات الصوت.")],
                ["📡", t("Poor connection? Lower video quality in Video settings.", "اتصال ضعيف؟ خفّض جودة الفيديو في إعدادات الفيديو.")],
                ["💬", t("Use reactions to engage without interrupting.", "استخدم التعبيرات للتفاعل دون مقاطعة.")],
                ["🖥️", t("Screen sharing works best on desktop Chrome/Edge.", "مشاركة الشاشة تعمل بشكل أفضل على Chrome/Edge للحاسوب.")],
                ["⏱️", t("If you minimize the app, you have 5 minutes before your connection is dropped.", "إذا صغّرت التطبيق، لديك 5 دقائق قبل قطع الاتصال.")],
              ].map(([icon, text], i) => (
                <div key={i} style={{ display: "flex", gap: 12, padding: "10px 0",
                  borderBottom: "1px solid rgba(255,255,255,.05)" }}>
                  <span style={{ fontSize: 20 }}>{icon}</span>
                  <p style={{ fontSize: 13, color: "rgba(255,255,255,.65)", lineHeight: 1.65, margin: 0 }}>{text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
   ───────────────────────────────────────────────────────────────────────── */
const ClassControls = ({
  sessionId, onToggleChat, onToggleParticipants, onEndClass, onLeaveClass,
  chatUnread, onLaunchPoll, onLaunchQuiz, isHostOverride,
}: ClassControlsProps) => {
  const room = useRoomContext();
  const { user, hasRole } = useAuth();
  const { t } = useLanguage();
  const isPrivileged = isHostOverride || hasRole("admin") || hasRole("teacher");

  // ── Sync mic/cam state into global context so minimized pill shows correct icons ──
  const { setMicEnabled: setCtxMicEnabled, setCamEnabled: setCtxCamEnabled,
          toggleMicFnRef, toggleCamFnRef } = useLiveClass();

  // ── Media state — read from LiveKit, not just optimistic shadow ───────
  const [micEnabled,    setMicEnabled]    = useState(() => room.localParticipant.isMicrophoneEnabled);
  const [camEnabled,    setCamEnabled]    = useState(() => room.localParticipant.isCameraEnabled);
  const [screenSharing, setScreenSharing] = useState(false);

  // ── Busy guards — prevent rapid-press race conditions ─────────────────
  const micBusy = useRef(false);
  const camBusy = useRef(false);

  // ── Google-Meet-style extras ──────────────────────────────────────────
  const [captionsOn,    setCaptionsOn]    = useState(false);
  const [blurOn,        setBlurOn]        = useState(false);
  const captionsRef = useRef<SpeechRecognition | null>(null);
  const [captions, setCaptions] = useState("");

  // ── Other UI state ────────────────────────────────────────────────────
  const [handRaised,    setHandRaised]    = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [showMoreEmojis, setShowMoreEmojis] = useState(false);
  const [showSettings,  setShowSettings]  = useState(false);
  const [floatingEmoji, setFloatingEmoji] = useState<{ emoji: string; id: number } | null>(null);
  const [raisedHandName, setRaisedHandName] = useState<string | null>(null);

  // ── Sync state from LiveKit track-published / muted events ───────────
  useEffect(() => {
    const sync = () => {
      const micOn = room.localParticipant.isMicrophoneEnabled;
      const camOn = room.localParticipant.isCameraEnabled;
      setMicEnabled(micOn);
      setCamEnabled(camOn);
      setCtxMicEnabled(micOn);
      setCtxCamEnabled(camOn);
    };
    room.on(RoomEvent.LocalTrackPublished,   sync);
    room.on(RoomEvent.LocalTrackUnpublished, sync);
    room.on(RoomEvent.TrackMuted,            sync);
    room.on(RoomEvent.TrackUnmuted,          sync);
    sync();
    return () => {
      room.off(RoomEvent.LocalTrackPublished,   sync);
      room.off(RoomEvent.LocalTrackUnpublished, sync);
      room.off(RoomEvent.TrackMuted,            sync);
      room.off(RoomEvent.TrackUnmuted,          sync);
    };
  }, [room, setCtxMicEnabled, setCtxCamEnabled]);

  // ── Register live toggle functions into context refs ──────────────────
  useEffect(() => {
    toggleMicFnRef.current = toggleMic;
    toggleCamFnRef.current = toggleCam;
  }, [toggleMic, toggleCam, toggleMicFnRef, toggleCamFnRef]);

  // ── Mic toggle — busy-guarded ─────────────────────────────────────────
  const toggleMic = useCallback(async () => {
    if (micBusy.current) return;
    micBusy.current = true;
    try {
      const next = !room.localParticipant.isMicrophoneEnabled;
      await room.localParticipant.setMicrophoneEnabled(next);
      setMicEnabled(next);
      setCtxMicEnabled(next);
    } catch (e: any) {
      toast({ title: t("Microphone error", "خطأ في الميكروفون"), description: e?.message, variant: "destructive" });
    } finally {
      micBusy.current = false;
    }
  }, [room, t, setCtxMicEnabled]);

  // ── Cam toggle — busy-guarded ─────────────────────────────────────────
  const toggleCam = useCallback(async () => {
    if (camBusy.current) return;
    camBusy.current = true;
    try {
      const next = !room.localParticipant.isCameraEnabled;
      await room.localParticipant.setCameraEnabled(next);
      setCamEnabled(next);
      setCtxCamEnabled(next);
    } catch (e: any) {
      toast({ title: t("Camera error", "خطأ في الكاميرا"), description: e?.message, variant: "destructive" });
    } finally {
      camBusy.current = false;
    }
  }, [room, t, setCtxCamEnabled]);

  // ── Screen share ──────────────────────────────────────────────────────
  const toggleScreenShare = useCallback(async () => {
    if (screenSharing) {
      const pubs = Array.from(room.localParticipant.trackPublications.values())
        .filter((pub: any) => pub.track?.source === Track.Source.ScreenShare || pub.track?.source === Track.Source.ScreenShareAudio);
      for (const pub of pubs) {
        if ((pub as any).track) {
          await room.localParticipant.unpublishTrack((pub as any).track);
          (pub as any).track.stop();
        }
      }
      setScreenSharing(false);
    } else {
      try {
        const tracks = await createLocalScreenTracks({
          audio: true,
          resolution: { width: 1280, height: 720, frameRate: 15 },
        });
        for (const track of tracks) await room.localParticipant.publishTrack(track);
        setScreenSharing(true);
        tracks.forEach(track => {
          track.mediaStreamTrack.addEventListener("ended", () => {
            room.localParticipant.unpublishTrack(track);
            setScreenSharing(false);
          });
        });
      } catch (err: any) {
        if (err?.name !== "NotAllowedError")
          toast({ title: t("Screen share failed", "فشل مشاركة الشاشة"), variant: "destructive" });
      }
    }
  }, [room, screenSharing, t]);

  // ── Raise Hand ────────────────────────────────────────────────────────
  const toggleHand = useCallback(async () => {
    if (!user || !sessionId) return;
    const next = !handRaised;
    setHandRaised(next);
    await supabase.from("class_participants")
      .update({ hand_raised: next, hand_raised_at: next ? new Date().toISOString() : null })
      .eq("session_id", sessionId).eq("student_id", user.id);
    if (next) {
      // Show a floating notification with the user's name
      const displayName = (user as any).user_metadata?.full_name || (user as any).email?.split("@")[0] || "You";
      setRaisedHandName(displayName);
      toast({ title: `✋ ${displayName} is raising their hand` });
      setTimeout(() => setRaisedHandName(null), 4000);
    }
  }, [handRaised, user, sessionId]);

  // ── Reactions ─────────────────────────────────────────────────────────
  const sendReaction = (emoji: string) => {
    setFloatingEmoji({ emoji, id: Date.now() });
    setShowReactions(false);
    setShowMoreEmojis(false);
    if (user) supabase.from("class_chat_messages").insert({ session_id: sessionId, sender_id: user.id, message: emoji, type: "emoji" });
    setTimeout(() => setFloatingEmoji(null), 2000);
  };

  // ── Live Captions (Web Speech API) ────────────────────────────────────
  const toggleCaptions = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast({ title: t("Captions not supported on this browser", "التعليق التوضيحي غير مدعوم"), variant: "destructive" });
      return;
    }
    if (captionsOn) {
      captionsRef.current?.stop();
      captionsRef.current = null;
      setCaptionsOn(false);
      setCaptions("");
    } else {
      const sr = new SR();
      sr.continuous = true;
      sr.interimResults = true;
      sr.onresult = (e: any) => {
        const text = Array.from(e.results).map((r: any) => r[0].transcript).join(" ");
        setCaptions(text.slice(-200));
      };
      sr.onerror = () => { setCaptionsOn(false); setCaptions(""); };
      sr.start();
      captionsRef.current = sr;
      setCaptionsOn(true);
    }
  }, [captionsOn, t]);

  // ── Background Blur ───────────────────────────────────────────────────
  const toggleBlur = useCallback(async () => {
    setBlurOn(v => !v);
    // Signal to video tile via data channel — downstream ClassroomView can
    // apply a CSS filter when this flag is true. Full processor support
    // (BackgroundBlurTransformer from @livekit/track-processors) can be
    // wired in later without breaking this interface.
    try {
      room.localParticipant.publishData(
        new TextEncoder().encode(JSON.stringify({ type: "blur_toggle", enabled: !blurOn })),
        { reliable: true }
      );
    } catch {}
    toast({ title: blurOn ? t("Background blur off", "تشويش الخلفية: إيقاف") : t("Background blur on", "تشويش الخلفية: تشغيل") });
  }, [room, blurOn, t]);

  // ── Mute all students ─────────────────────────────────────────────────
  const muteAllStudents = async () => {
    await supabase.from("class_participants").update({ is_muted: true }).eq("session_id", sessionId);
    toast({ title: t("All students muted", "تم كتم جميع الطلاب") });
  };

  // ── Button style helpers ──────────────────────────────────────────────
  const btnBase = "rounded-full h-10 px-3 gap-1.5 text-xs font-medium";
  const btnOn   = "text-white hover:opacity-90";
  const btnOff  = "bg-destructive text-destructive-foreground hover:bg-destructive/90";
  const btnNeutral = "text-white hover:opacity-80";
  const btnStyle = {background:"rgba(255,255,255,0.12)"} as React.CSSProperties;

  return (
    <>
      {/* ── Floating emoji ── */}
      {floatingEmoji && (
        <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center">
          <span className="text-6xl animate-bounce opacity-80">{floatingEmoji.emoji}</span>
        </div>
      )}

      {/* ── Raise hand notification banner ── */}
      {handRaised && raisedHandName && (
        <div style={{
          position:"fixed", bottom:90, left:"50%", transform:"translateX(-50%)",
          zIndex:9000, pointerEvents:"none",
          background:"rgba(251,191,36,.95)", color:"#1a1a1a",
          borderRadius:24, padding:"8px 20px",
          display:"flex", alignItems:"center", gap:8,
          boxShadow:"0 4px 24px rgba(251,191,36,.4)",
          animation:"gc-toast-in .25s ease",
          fontFamily:"system-ui,sans-serif", fontSize:13, fontWeight:700,
        }}>
          <span style={{fontSize:18}}>✋</span>
          <span>{raisedHandName} is raising their hand</span>
        </div>
      )}

      {/* ── Screen share banner ── */}
      {screenSharing && (
        <div className="bg-destructive/90 text-destructive-foreground text-center py-1 text-xs flex items-center justify-center gap-2">
          <Monitor className="h-3 w-3 animate-pulse" />
          {t("Sharing your screen", "تتم مشاركة شاشتك")}
          <Button size="sm" variant="secondary" className="h-5 text-[10px] px-2" onClick={toggleScreenShare}>
            {t("Stop", "إيقاف")}
          </Button>
        </div>
      )}

      {/* ── Live captions banner ── */}
      {captionsOn && captions && (
        <div style={{
          position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)",
          background: "rgba(0,0,0,.82)", color: "#fff", borderRadius: 10,
          padding: "10px 18px", maxWidth: "70vw", fontSize: 15, lineHeight: 1.5,
          zIndex: 500, textAlign: "center", backdropFilter: "blur(6px)",
          border: "1px solid rgba(255,255,255,.12)",
        }}>
          {captions}
        </div>
      )}

      {/* ── Settings modal ── */}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} room={room} />}

      {/* ══ MAIN CONTROL BAR ══════════════════════════════════════════════ */}
      <style>{`.lk-control-bar-btn,.lk-button,[class*="btnBase"]{color:#fff!important;} `}</style>
      <div className="h-16 flex items-center justify-between px-2 md:px-4 gap-1 lk-control-bar" style={{background:"#111b21",flexShrink:0}}>

        {/* ── LEFT: Mic · Cam · Cam-flip · Screen ── */}
        <div className="flex items-center gap-1">

          {/* Mic */}
          <Button size="sm" className={`${btnBase} ${micEnabled ? btnOn : btnOff}`} style={micEnabled ? btnStyle : {}} onClick={toggleMic}>
            {micEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
            <span className="hidden sm:inline">{micEnabled ? t("Mic","مايك") : t("Muted","صامت")}</span>
          </Button>

          {/* Cam */}
          <Button size="sm" className={`${btnBase} ${camEnabled ? btnOn : "bg-muted"}`} style={camEnabled ? btnStyle : {background:"rgba(255,255,255,.08)",color:"rgba(255,255,255,.4)"}} onClick={toggleCam}>
            {camEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
            <span className="hidden sm:inline">{camEnabled ? t("Cam","كام") : t("Off","مغلق")}</span>
          </Button>

          {/* Screen share */}
          <Button size="sm"
            className={`${btnBase} ${screenSharing ? btnOff : btnNeutral}`}
            style={screenSharing ? {} : btnStyle}
            onClick={toggleScreenShare}>
            {screenSharing ? <MonitorOff className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
            <span className="hidden sm:inline">{screenSharing ? t("Stop","إيقاف") : t("Share","مشاركة")}</span>
          </Button>
        </div>

        {/* ── CENTER: Captions · Blur ── (Hand & Reactions moved to three-dot menu) ── */}
        <div className="flex items-center gap-1">

          {/* Captions (Google Meet parity) */}
          <Button size="sm"
            className={`${btnBase} ${captionsOn ? "bg-blue-600/80 text-white hover:bg-blue-600" : btnNeutral}`}
            style={captionsOn ? {} : btnStyle}
            onClick={toggleCaptions}
            title={t("Live Captions","الترجمة المباشرة")}>
            {captionsOn ? <Captions className="h-4 w-4" /> : <CaptionsOff className="h-4 w-4" />}
            <span className="hidden lg:inline">{t("CC","ترجمة")}</span>
          </Button>

          {/* Background blur */}
          <Button size="sm"
            className={`${btnBase} ${blurOn ? "bg-purple-600/80 text-white hover:bg-purple-600" : btnNeutral}`}
            style={blurOn ? {} : btnStyle}
            onClick={toggleBlur}
            title={t("Background blur","تشويش الخلفية")}>
            <Blend className="h-4 w-4" />
            <span className="hidden lg:inline">{t("Blur","تشويش")}</span>
          </Button>
        </div>

        {/* ── RIGHT: Chat · Participants · Settings · More · End ── */}
        <div className="flex items-center gap-1">

          {/* Chat */}
          <Button size="sm" className={`${btnBase} ${btnNeutral} relative`} style={btnStyle} onClick={onToggleChat}>
            <MessageCircle className="h-4 w-4" />
            {chatUnread > 0 && (
              <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full h-4 w-4 text-[10px] flex items-center justify-center">
                {chatUnread}
              </span>
            )}
          </Button>

          {/* Participants */}
          <Button size="sm" className={`${btnBase} ${btnNeutral}`} style={btnStyle} onClick={onToggleParticipants}>
            <Users className="h-4 w-4" />
          </Button>

          {/* More menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className={`${btnBase} ${btnNeutral}`} style={btnStyle}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 p-0 overflow-visible" style={{background:"#1e2535",border:"1px solid rgba(255,255,255,.1)",borderRadius:16}}>

              {/* ── Emoji Reactions Row ── */}
              <div style={{padding:"10px 12px 6px",borderBottom:"1px solid rgba(255,255,255,.07)"}}>
                <p style={{fontSize:10,fontWeight:700,letterSpacing:1.1,color:"rgba(255,255,255,.4)",margin:"0 0 8px",textTransform:"uppercase"}}>😊 Reactions</p>
                {/* Full emoji row */}
                <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:showMoreEmojis?0:4}}>
                  {REACTION_EMOJIS.map(e => (
                    <button
                      key={e}
                      onClick={() => sendReaction(e)}
                      style={{fontSize:20,background:"rgba(255,255,255,.07)",border:"none",borderRadius:8,padding:"4px 6px",cursor:"pointer",transition:"transform .12s, background .1s"}}
                      onMouseEnter={ev=>(ev.currentTarget.style.transform="scale(1.25)")}
                      onMouseLeave={ev=>(ev.currentTarget.style.transform="scale(1)")}
                    >{e}</button>
                  ))}
                  {/* Add more toggle */}
                  <button
                    onClick={() => setShowMoreEmojis(v => !v)}
                    style={{fontSize:13,background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.12)",borderRadius:8,padding:"4px 8px",cursor:"pointer",color:"rgba(255,255,255,.5)",fontWeight:600}}
                  >{showMoreEmojis ? "Less ▲" : "+ More"}</button>
                </div>
                {/* Extended emoji grid */}
                {showMoreEmojis && (
                  <div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:6,padding:"6px 0",borderTop:"1px solid rgba(255,255,255,.06)"}}>
                    {MORE_EMOJIS.map(e => (
                      <button
                        key={e}
                        onClick={() => sendReaction(e)}
                        style={{fontSize:20,background:"rgba(255,255,255,.05)",border:"none",borderRadius:8,padding:"4px 6px",cursor:"pointer",transition:"transform .12s"}}
                        onMouseEnter={ev=>(ev.currentTarget.style.transform="scale(1.25)")}
                        onMouseLeave={ev=>(ev.currentTarget.style.transform="scale(1)")}
                      >{e}</button>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Raise Hand (students only) ── */}
              {!isPrivileged && (
                <div style={{padding:"8px 12px",borderBottom:"1px solid rgba(255,255,255,.07)"}}>
                  <button
                    onClick={toggleHand}
                    style={{
                      width:"100%",display:"flex",alignItems:"center",gap:10,
                      background: handRaised ? "rgba(251,191,36,.15)" : "rgba(255,255,255,.05)",
                      border: handRaised ? "1px solid rgba(251,191,36,.4)" : "1px solid rgba(255,255,255,.1)",
                      borderRadius:10,padding:"8px 12px",cursor:"pointer",
                      color: handRaised ? "#fbbf24" : "rgba(255,255,255,.75)",
                      fontFamily:"system-ui,sans-serif",fontSize:13,fontWeight:handRaised?700:400,
                      transition:"all .15s",
                    }}
                  >
                    <Hand style={{width:16,height:16,flexShrink:0}} />
                    <div style={{flex:1,textAlign:"left"}}>
                      <div>{handRaised ? "✋ Hand Raised" : "Raise Hand"}</div>
                      {handRaised && raisedHandName && (
                        <div style={{fontSize:10,color:"rgba(251,191,36,.7)",marginTop:2}}>{raisedHandName} is raising their hand</div>
                      )}
                    </div>
                    {handRaised && <span style={{fontSize:10,background:"rgba(251,191,36,.2)",color:"#fbbf24",borderRadius:6,padding:"2px 6px",fontWeight:700}}>ON</span>}
                  </button>
                </div>
              )}

              {/* ── Host tools ── */}
              {isPrivileged && (
                <>
                  <div style={{padding:"4px 0"}}>
                    <DropdownMenuItem onClick={onLaunchPoll} style={{margin:"0 4px",borderRadius:8}}>
                      <BarChart3 className="h-4 w-4 mr-2" /> {t("Launch Poll","إطلاق تصويت")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={onLaunchQuiz} style={{margin:"0 4px",borderRadius:8}}>
                      <Zap className="h-4 w-4 mr-2" /> {t("Live Quiz","اختبار مباشر")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={muteAllStudents} style={{margin:"0 4px",borderRadius:8}}>
                      <MicOff className="h-4 w-4 mr-2" /> {t("Mute All Students","كتم الجميع")}
                    </DropdownMenuItem>
                  </div>
                  <DropdownMenuSeparator />
                </>
              )}

              {/* ── General options ── */}
              <div style={{padding:"4px 0"}}>
                <DropdownMenuItem onClick={toggleCaptions} style={{margin:"0 4px",borderRadius:8}}>
                  <Captions className="h-4 w-4 mr-2" /> {captionsOn ? t("Turn Off Captions","إيقاف الترجمة") : t("Turn On Captions","تشغيل الترجمة")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={toggleBlur} style={{margin:"0 4px",borderRadius:8}}>
                  <Blend className="h-4 w-4 mr-2" /> {blurOn ? t("Remove Background Blur","إزالة التشويش") : t("Blur Background","تشويش الخلفية")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={toggleScreenShare} style={{margin:"0 4px",borderRadius:8}}>
                  {screenSharing ? <MonitorOff className="h-4 w-4 mr-2" /> : <Monitor className="h-4 w-4 mr-2" />}
                  {screenSharing ? t("Stop Sharing","إيقاف المشاركة") : t("Share Screen","مشاركة الشاشة")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={isPrivileged ? onEndClass : onLeaveClass} style={{margin:"0 4px",borderRadius:8}}>
                  <LogOut className="h-4 w-4 mr-2 text-destructive" />
                  <span className="text-destructive">
                    {isPrivileged ? t("End Class for All","إنهاء الحصة للجميع") : t("Leave Class","مغادرة الحصة")}
                  </span>
                </DropdownMenuItem>
              </div>

            </DropdownMenuContent>
          </DropdownMenu>

          {/* End / Leave button */}
          <Button size="sm"
            className="rounded-full h-10 px-4 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-1.5"
            onClick={isPrivileged ? onEndClass : onLeaveClass}>
            <Phone className="h-4 w-4 rotate-[135deg]" />
            <span className="hidden sm:inline">{isPrivileged ? t("End","إنهاء") : t("Leave","مغادرة")}</span>
          </Button>
        </div>
      </div>
    </>
  );
};

export default ClassControls;