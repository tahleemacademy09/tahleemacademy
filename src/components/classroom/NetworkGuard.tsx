/*
  NetworkGuard.tsx — Tahleem Academy
  ──────────────────────────────────
  Lives INSIDE <LiveKitRoom>. Solves "on a poor network I can't tell whether they hear me":

  1. TELLS YOU. A banner appears the moment YOUR connection is weak/lost ("others may not hear
     you"), and — for teachers/admins — when a STUDENT's connection is weak/lost ("Ahmad may not
     hear you"). A short "connection restored" message confirms recovery.

  2. PROTECTS THE VOICE. While the connection is weak we cut everything that isn't voice:
       • own camera is paused (auto audio-only; restored automatically when the network recovers)
       • other people's camera feeds are unsubscribed (download freed for the audio streams)
       • own mic is re-prioritised (high network priority) — the bitrate drop to a lean ~24 kbps
         voice stream is done by AudioOnlyBridge, which this component triggers via onAutoAudioOnly.
     Screen-share / materials are left alone. Nothing is touched while the network is fine.

  It never fights the user: if they manually leave audio-only while we auto-enabled it, we back off
  for a minute. A teacher-forced audio-only is never changed.
*/

import { useEffect, useRef, useState } from "react";
import { useRoomContext } from "@livekit/components-react";
import { ConnectionQuality, RoomEvent, Track } from "livekit-client";
import { useLanguage } from "@/contexts/LanguageContext";

type Level = "ok" | "poor" | "lost";

const toLevel = (q: ConnectionQuality | undefined | null): Level | null => {
  if (q === ConnectionQuality.Poor) return "poor";
  if (q === ConnectionQuality.Lost) return "lost";
  if (q === ConnectionQuality.Excellent || q === ConnectionQuality.Good) return "ok";
  return null; // Unknown — don't react
};

const POOR_AFTER_MS = 3_000;     // must stay weak this long before we act (ignore blips)
const RECOVER_AFTER_MS = 10_000; // must stay healthy this long before we restore video
const BACKOFF_MS = 60_000;       // after a manual override, leave the user alone this long

interface Props {
  isPrivileged: boolean;
  /** current audio-only state owned by ClassroomView */
  audioOnlyActive: boolean;
  /** true when the teacher forced audio-only for everyone — we never change it */
  forcedAudioOnly: boolean;
  /** ask ClassroomView to switch audio-only on/off (drives AudioOnlyBridge) */
  onAutoAudioOnly: (on: boolean) => void;
}

export default function NetworkGuard({ isPrivileged, audioOnlyActive, forcedAudioOnly, onAutoAudioOnly }: Props) {
  const room = useRoomContext();
  const { t } = useLanguage();

  const [myLevel, setMyLevel] = useState<Level>("ok");
  const [offline, setOffline] = useState(typeof navigator !== "undefined" ? !navigator.onLine : false);
  const [roomUp, setRoomUp] = useState(true); // false while LiveKit is reconnecting (ConnectionStateBanner owns that message)
  const [weakPeers, setWeakPeers] = useState<{ id: string; name: string; level: Level }[]>([]);
  const [restoredFlash, setRestoredFlash] = useState(false);

  const autoSetRef = useRef(false);          // we turned audio-only on
  const backoffUntilRef = useRef(0);
  const unsubscribedRef = useRef<Set<any>>(new Set()); // remote camera pubs we unsubscribed
  const poorTimer = useRef<number | null>(null);
  const okTimer = useRef<number | null>(null);
  const wasDegradedRef = useRef(false);
  const audioOnlyRef = useRef(audioOnlyActive);
  const forcedRef = useRef(forcedAudioOnly);
  const degradedRef = useRef(false);

  // Detect a MANUAL exit from audio-only while we had auto-enabled it → back off.
  useEffect(() => {
    if (audioOnlyRef.current && !audioOnlyActive && autoSetRef.current) {
      autoSetRef.current = false;
      backoffUntilRef.current = Date.now() + BACKOFF_MS;
    }
    audioOnlyRef.current = audioOnlyActive;
  }, [audioOnlyActive]);
  useEffect(() => { forcedRef.current = forcedAudioOnly; }, [forcedAudioOnly]);

  /* ── helpers ─────────────────────────────────────────────────────────── */
  const eachRemoteCamera = (fn: (pub: any) => void) => {
    try {
      room.remoteParticipants.forEach((p: any) => {
        p.getTrackPublications?.().forEach((pub: any) => { if (pub.source === Track.Source.Camera) fn(pub); });
      });
    } catch { /* room torn down */ }
  };

  const prioritiseMic = async () => {
    try {
      const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
      const sender = (pub?.track as any)?.sender as RTCRtpSender | undefined;
      if (!sender) return;
      const params = sender.getParameters();
      if (params.encodings?.[0]) {
        (params.encodings[0] as any).networkPriority = "high";
        (params.encodings[0] as any).priority = "high";
        await sender.setParameters(params);
      }
    } catch { /* browser doesn't support priority hints — harmless */ }
  };

  const enterLowData = () => {
    if (degradedRef.current) return;
    degradedRef.current = true;
    // 1) free the download for audio: drop other people's camera video
    eachRemoteCamera((pub) => {
      try { if (pub.isSubscribed) { pub.setSubscribed(false); unsubscribedRef.current.add(pub); } } catch {}
    });
    // 2) free the upload for audio: pause own camera (AudioOnlyBridge also trims mic bitrate)
    if (!audioOnlyRef.current && !forcedRef.current && Date.now() >= backoffUntilRef.current) {
      autoSetRef.current = true;
      onAutoAudioOnly(true);
    }
    void prioritiseMic();
  };

  const exitLowData = () => {
    if (!degradedRef.current) return;
    degradedRef.current = false;
    unsubscribedRef.current.forEach((pub) => { try { pub.setSubscribed(true); } catch {} });
    unsubscribedRef.current.clear();
    if (autoSetRef.current && !forcedRef.current) {
      autoSetRef.current = false;
      onAutoAudioOnly(false);
    }
  };

  /* ── my own connection quality + browser online/offline ──────────────── */
  useEffect(() => {
    if (!room) return;
    const lp = room.localParticipant;

    const apply = (lvl: Level) => {
      setMyLevel(lvl);
      if (lvl === "ok") {
        if (poorTimer.current) { clearTimeout(poorTimer.current); poorTimer.current = null; }
        if (degradedRef.current && !okTimer.current) {
          okTimer.current = window.setTimeout(() => {
            okTimer.current = null;
            exitLowData();
          }, RECOVER_AFTER_MS);
        }
      } else {
        if (okTimer.current) { clearTimeout(okTimer.current); okTimer.current = null; }
        if (!degradedRef.current && !poorTimer.current) {
          poorTimer.current = window.setTimeout(() => { poorTimer.current = null; enterLowData(); }, POOR_AFTER_MS);
        }
      }
    };

    const initial = toLevel((lp as any)?.connectionQuality);
    if (initial) apply(initial);

    const onQuality = (q: ConnectionQuality, participant: any) => {
      if (participant?.identity !== lp.identity) return;
      const lvl = toLevel(q);
      if (lvl) apply(lvl);
    };
    const onOffline = () => { setOffline(true); apply("lost"); };
    const onOnline = () => setOffline(false);
    const onReconnecting = () => setRoomUp(false);
    const onReconnected = () => setRoomUp(true);
    const onDisconnected = () => setRoomUp(false);

    room.on(RoomEvent.ConnectionQualityChanged, onQuality);
    room.on(RoomEvent.Reconnecting, onReconnecting);
    room.on(RoomEvent.Reconnected, onReconnected);
    room.on(RoomEvent.Disconnected, onDisconnected);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      room.off(RoomEvent.ConnectionQualityChanged, onQuality);
      room.off(RoomEvent.Reconnecting, onReconnecting);
      room.off(RoomEvent.Reconnected, onReconnected);
      room.off(RoomEvent.Disconnected, onDisconnected);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      if (poorTimer.current) clearTimeout(poorTimer.current);
      if (okTimer.current) clearTimeout(okTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  // New camera tracks that appear while we're in low-data mode must not eat the audio bandwidth.
  useEffect(() => {
    if (!room) return;
    const onPublished = (pub: any) => {
      if (degradedRef.current && pub?.source === Track.Source.Camera) {
        try { pub.setSubscribed(false); unsubscribedRef.current.add(pub); } catch {}
      }
    };
    room.on(RoomEvent.TrackPublished, onPublished);
    return () => { room.off(RoomEvent.TrackPublished, onPublished); };
  }, [room]);

  /* ── other people's connection (teachers/admins need to know who can't hear them) ── */
  useEffect(() => {
    if (!room || !isPrivileged) return;
    const onQuality = (q: ConnectionQuality, participant: any) => {
      if (!participant || participant.identity === room.localParticipant.identity) return;
      if (String(participant.identity).includes("::screen")) return;
      const lvl = toLevel(q);
      if (!lvl) return;
      setWeakPeers((prev) => {
        const rest = prev.filter((p) => p.id !== participant.identity);
        return lvl === "ok" ? rest : [...rest, { id: participant.identity, name: participant.name || "A participant", level: lvl }];
      });
    };
    const onLeft = (participant: any) => setWeakPeers((prev) => prev.filter((p) => p.id !== participant?.identity));
    room.on(RoomEvent.ConnectionQualityChanged, onQuality);
    room.on(RoomEvent.ParticipantDisconnected, onLeft);
    return () => {
      room.off(RoomEvent.ConnectionQualityChanged, onQuality);
      room.off(RoomEvent.ParticipantDisconnected, onLeft);
    };
  }, [room, isPrivileged]);

  /* ── "Connection restored" flash ─────────────────────────────────────── */
  const degraded = offline || myLevel !== "ok";
  useEffect(() => {
    if (degraded) { wasDegradedRef.current = true; return; }
    if (wasDegradedRef.current) {
      wasDegradedRef.current = false;
      setRestoredFlash(true);
      const id = window.setTimeout(() => setRestoredFlash(false), 3500);
      return () => clearTimeout(id);
    }
  }, [degraded]);

  /* ── render ──────────────────────────────────────────────────────────── */
  if (!roomUp) return null; // ConnectionStateBanner already says "Reconnecting…"

  let bg = "";
  let msg = "";
  if (offline || myLevel === "lost") {
    bg = "rgba(220,38,38,.94)";
    msg = t("⚠ No internet — nobody can hear you right now.", "⚠ لا يوجد اتصال — لا أحد يسمعك الآن.");
  } else if (myLevel === "poor") {
    bg = "rgba(217,119,6,.95)";
    msg = t(
      "⚠ Your network is weak — others may not hear you clearly. Video paused to keep your voice clear.",
      "⚠ شبكتك ضعيفة — قد لا يسمعك الآخرون بوضوح. تم إيقاف الفيديو للحفاظ على وضوح صوتك."
    );
  } else if (weakPeers.length > 0) {
    const lost = weakPeers.some((p) => p.level === "lost");
    bg = lost ? "rgba(220,38,38,.92)" : "rgba(217,119,6,.92)";
    const names = weakPeers.slice(0, 2).map((p) => p.name).join(", ") + (weakPeers.length > 2 ? ` +${weakPeers.length - 2}` : "");
    msg = lost
      ? t(`⚠ ${names}: connection lost — they can't hear you.`, `⚠ ${names}: انقطع الاتصال — لا يسمعونك.`)
      : t(`⚠ ${names}: weak network — they may not hear you well.`, `⚠ ${names}: شبكة ضعيفة — قد لا يسمعونك جيدًا.`);
  } else if (restoredFlash) {
    bg = "rgba(22,163,74,.94)";
    msg = t("✓ Connection restored", "✓ عاد الاتصال");
  } else {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "absolute", top: 0, left: 0, right: 0, zIndex: 198, pointerEvents: "none",
        background: bg, backdropFilter: "blur(8px)", padding: "6px 14px",
        display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center",
        animation: "slide-down .2s ease",
      }}
    >
      <span style={{ color: "#fff", fontSize: 12, fontWeight: 600, fontFamily: "'Google Sans',sans-serif", lineHeight: 1.35 }}>{msg}</span>
    </div>
  );
}
