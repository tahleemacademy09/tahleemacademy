// src/components/recitation/InterviewRoom.tsx
// ─────────────────────────────────────────────────────────────────────────
// The virtual-interview call room. It is built from the SAME pieces as the
// live classroom (ClassroomView): same full-bleed VideoGrid, same Meet-style
// top bar, same ClassControls bottom bar (mic, camera, share screen, reactions,
// settings, leave), same reconnect handling and styles.
//
// Differences from the classroom: no subject/session records, lobby or
// attendance. The side panel (the chat button in the control bar) holds the
// interview "Questions" panel(s) passed in by the page:
//   • student → InterviewQuestionTiles (pick a tile, reveal a question)
//   • admin   → InterviewRevealedPanel + the session settings
//
// Both sides pass the SAME roomName (`recitation-eval-<studentUserId>`) and get
// a token from the existing `livekit-token` edge function (Mode A).
// ─────────────────────────────────────────────────────────────────────────
import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { LiveKitRoom, RoomAudioRenderer, StartAudio, useParticipants, useRoomContext } from "@livekit/components-react";
// @ts-ignore
import "@livekit/components-styles";
import { RoomEvent } from "livekit-client";
import { Loader2, AlertTriangle, HelpCircle, Users, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "@/hooks/use-toast";
import { getLiveKitRoomOptions } from "@/lib/livekitOptions";
import { startBackgroundAudio, stopBackgroundAudio, setWakeLockActive } from "@/hooks/useBackgroundAudio";
import { startForegroundService, stopForegroundService } from "@/hooks/useForegroundService";
import ClassControls from "@/components/classroom/ClassControls";
import {
  CSS, VideoGrid, MediaAutoPublish, ReconnectMonitor, ReconnectingOverlay, ConnectionStateBanner,
  TEAL, BAR_H,
} from "@/components/classroom/classroomComponents";

export interface InterviewPanel {
  id: string;
  label: string;
  node: ReactNode;
  /** light background for panels that use light-themed content (e.g. admin forms) */
  light?: boolean;
}

interface Props {
  roomName: string;
  title?: string;
  panels: InterviewPanel[];
  /** Called when the user leaves (or is disconnected for good). */
  onLeave: () => void;
}

const MAX_RECONNECTS = 5;

// ── small helpers that live INSIDE <LiveKitRoom> ────────────────────────
const ParticipantCount = () => {
  const n = useParticipants().length;
  return (
    <div className="gm-badge" style={{ background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.12)", color: "#fff", flexShrink: 0 }}>
      <Users style={{ width: 13, height: 13 }} />
      <span style={{ fontSize: 12, fontWeight: 600, fontFamily: "'Google Sans',sans-serif" }}>{n}</span>
    </div>
  );
};

const ElapsedTimer = () => {
  const [s, setS] = useState(0);
  useEffect(() => { const t = setInterval(() => setS(v => v + 1), 1000); return () => clearInterval(t); }, []);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,.75)", fontVariantNumeric: "tabular-nums", fontFamily: "'Google Sans',sans-serif" }}>{mm}:{ss}</span>;
};

// Student side: the interviewer ended the session
const InterviewEndListener = ({ onEnded }: { onEnded: () => void }) => {
  const room = useRoomContext();
  useEffect(() => {
    const h = (payload: Uint8Array) => {
      try { if (JSON.parse(new TextDecoder().decode(payload)).type === "interview_ended") onEnded(); } catch { /* ignore */ }
    };
    room.on(RoomEvent.DataReceived, h);
    return () => { room.off(RoomEvent.DataReceived, h); };
  }, [room, onEnded]);
  return null;
};

// Interviewer side: tell the student the session is over, then leave
const EndSessionButtonBridge = ({ trigger, onDone }: { trigger: number; onDone: () => void }) => {
  const room = useRoomContext();
  useEffect(() => {
    if (!trigger) return;
    try {
      room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify({ type: "interview_ended" })), { reliable: true });
    } catch { /* leaving anyway */ }
    const t = setTimeout(onDone, 250);
    return () => clearTimeout(t);
  }, [trigger]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
};

const Confirm = ({ title, body, confirmLabel, danger, onConfirm, onCancel }: {
  title: string; body: string; confirmLabel: string; danger?: boolean; onConfirm: () => void; onCancel: () => void;
}) => (
  <div style={{ position: "fixed", inset: 0, zIndex: 9600, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onCancel}>
    <div onClick={e => e.stopPropagation()} style={{ background: "#202124", color: "#fff", borderRadius: 18, padding: 22, width: "100%", maxWidth: 340, border: "1px solid rgba(255,255,255,.1)", fontFamily: "'Google Sans','Cairo',sans-serif" }}>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,.65)", lineHeight: 1.5, marginBottom: 18 }}>{body}</div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button onClick={onCancel} style={{ padding: "9px 16px", borderRadius: 999, border: "1px solid rgba(255,255,255,.2)", background: "transparent", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Stay</button>
        <button onClick={onConfirm} style={{ padding: "9px 16px", borderRadius: 999, border: "none", background: danger ? "#ea4335" : TEAL, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{confirmLabel}</button>
      </div>
    </div>
  </div>
);

const InterviewRoom = ({ roomName, title = "Virtual Interview", panels, onLeave }: Props) => {
  const { hasRole } = useAuth();
  const isStaff = hasRole("admin") || hasRole("teacher");
  const isMobile = useIsMobile();

  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [tokenData, setTokenData] = useState<{ token: string; url: string } | null>(null);
  const [error, setError] = useState("");
  const [roomKey, setRoomKey] = useState(0);
  const [reconnecting, setReconnecting] = useState(false);

  const reconnectCount = useRef(0);
  const reconnectingRef = useRef(false);
  const firstJoin = useRef(true);
  const leaving = useRef(false);

  const [panelOpen, setPanelOpen] = useState(true);
  const [activePanel, setActivePanel] = useState(panels[0]?.id);
  const [showLeave, setShowLeave] = useState(false);
  const [showEnd, setShowEnd] = useState(false);
  const [endTrigger, setEndTrigger] = useState(0);

  const requestToken = useCallback(async () => {
    const { data, error: fnError } = await supabase.functions.invoke("livekit-token", { body: { room_name: roomName } });
    if (fnError) throw fnError;
    if (data?.error) throw new Error(data.error);
    if (!data?.token || !data?.url) throw new Error("No token returned");
    return { token: data.token as string, url: data.url as string };
  }, [roomName]);

  const connect = useCallback(async () => {
    setPhase("loading"); setError("");
    try {
      setTokenData(await requestToken());
      setPhase("ready");
    } catch (e: any) {
      setError(e?.message || "Could not connect to the session");
      setPhase("error");
    }
  }, [requestToken]);

  useEffect(() => { connect(); }, [connect]);

  // Same idea as the classroom's autoReconnect: new token + fresh room, with backoff.
  const autoReconnect = useCallback(async () => {
    if (leaving.current || reconnectingRef.current) return;
    if (reconnectCount.current >= MAX_RECONNECTS) {
      setReconnecting(false);
      setError("The connection was lost. Please check your internet and try again.");
      setPhase("error");
      return;
    }
    reconnectingRef.current = true;
    reconnectCount.current += 1;
    setReconnecting(true);
    await new Promise(r => setTimeout(r, Math.min(400 * 2 ** reconnectCount.current, 15000)));
    if (leaving.current) return;
    try {
      setTokenData(await requestToken());
      firstJoin.current = false;
      reconnectingRef.current = false;
      setRoomKey(k => k + 1);
    } catch {
      reconnectingRef.current = false;
      autoReconnect();
    }
  }, [requestToken]);

  // Keep the screen awake / audio alive like the other live rooms
  useEffect(() => {
    if (phase !== "ready") return;
    startBackgroundAudio("Virtual Interview");
    startForegroundService({ title: "🔴 Virtual Interview", body: "Tap to return to your session", id: 3001, color: "#064E3B" });
    setWakeLockActive(true);
    return () => { stopBackgroundAudio(); stopForegroundService(); setWakeLockActive(false); };
  }, [phase]);

  const leave = useCallback(() => { leaving.current = true; onLeave(); }, [onLeave]);

  if (phase === "loading") {
    return (
      <div style={{ height: "100dvh", background: "#000", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: "rgba(255,255,255,.7)" }}>
        <Loader2 size={30} style={{ animation: "cv-spin .8s linear infinite", color: "#86efac" }} />
        <span style={{ fontSize: 14, fontWeight: 600 }}>Joining the interview…</span>
      </div>
    );
  }
  if (phase === "error" || !tokenData) {
    return (
      <div style={{ height: "100dvh", background: "#000", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 24, textAlign: "center" }}>
        <AlertTriangle size={30} color="#f87171" />
        <p style={{ fontSize: 14, color: "#fca5a5", fontWeight: 600, maxWidth: 360, margin: 0 }}>{error}</p>
        <button onClick={() => { reconnectCount.current = 0; reconnectingRef.current = false; firstJoin.current = true; connect(); }}
          style={{ padding: "10px 22px", borderRadius: 999, border: "none", background: TEAL, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Try again</button>
        <button onClick={leave} style={{ background: "none", border: "none", color: "rgba(255,255,255,.5)", fontSize: 12, textDecoration: "underline", cursor: "pointer" }}>Go back</button>
      </div>
    );
  }

  const current = panels.find(p => p.id === activePanel) || panels[0];
  const panelHeader = (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,.08)", flexShrink: 0 }}>
      <div style={{ display: "flex", gap: 6, flex: 1, overflowX: "auto" }}>
        {panels.map(p => (
          <button key={p.id} onClick={() => setActivePanel(p.id)}
            style={{ padding: "6px 14px", borderRadius: 999, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
              background: current?.id === p.id ? TEAL : "rgba(255,255,255,.08)", color: "#fff" }}>{p.label}</button>
        ))}
      </div>
      <button onClick={() => setPanelOpen(false)} aria-label="Close panel"
        style={{ width: 30, height: 30, borderRadius: "50%", border: "none", background: "rgba(255,255,255,.08)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <X size={15} />
      </button>
    </div>
  );
  const panelBody = (
    <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" as any, background: current?.light ? "#F9FAFB" : "transparent", colorScheme: current?.light ? "light" : undefined }}>
      {current?.node}
    </div>
  );

  return (
    <div data-classroom-root style={{ height: "100dvh", display: "flex", flexDirection: "column", background: "#000", overflow: "hidden" }}>
      <style>{CSS}</style>
      <LiveKitRoom
        key={roomKey}
        serverUrl={tokenData.url}
        token={tokenData.token}
        connect
        onConnected={() => { reconnectingRef.current = false; reconnectCount.current = 0; setReconnecting(false); }}
        audio={false}
        video={false}
        options={getLiveKitRoomOptions(isMobile)}
        data-lk-theme="default"
        style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, position: "relative" }}
      >
        <RoomAudioRenderer />
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 9500, display: "flex", justifyContent: "center" }}>
          <StartAudio label="🔊 Tap to enable audio" />
        </div>
        <MediaAutoPublish lobbyMic lobbyCam isFirstJoin={firstJoin.current} />
        <ReconnectMonitor
          onReconnecting={() => setReconnecting(true)}
          onReconnected={() => { reconnectingRef.current = false; reconnectCount.current = 0; setReconnecting(false); }}
          onDisconnected={autoReconnect}
        />
        {reconnecting && <ReconnectingOverlay attempt={reconnectCount.current} />}
        <ConnectionStateBanner />
        {!isStaff && <InterviewEndListener onEnded={() => { toast({ title: "The interviewer has ended the session" }); setTimeout(leave, 1500); }} />}
        {isStaff && <EndSessionButtonBridge trigger={endTrigger} onDone={leave} />}

        {/* Meet-style top bar (same look as the classroom) */}
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 60, height: 56, boxSizing: "content-box",
          background: "linear-gradient(to bottom, rgba(0,0,0,.78) 0%, rgba(0,0,0,.45) 70%, rgba(0,0,0,0) 100%)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "env(safe-area-inset-top, 0px) 14px 0 16px", gap: 8, pointerEvents: "none",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, pointerEvents: "auto" }}>
            <div className="gm-badge" style={{ background: "rgba(234,67,53,.12)", border: "1px solid rgba(234,67,53,.25)", color: "#fff", minWidth: 0 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#ea4335", display: "inline-block", flexShrink: 0, animation: "pip-pulse 1.8s ease-in-out infinite" }} />
              <span style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "'Google Sans',sans-serif" }}>{title}</span>
            </div>
            <ElapsedTimer />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, pointerEvents: "auto" }}>
            <ParticipantCount />
          </div>
        </div>

        {/* Stage + side panel */}
        <div style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden" }}>
          <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
            <div style={{ position: "absolute", inset: 0 }}>
              <div style={{ width: "100%", height: "100%", overflow: "hidden", background: "#000" }}>
                <VideoGrid layout="grid" isMobile={isMobile} />
              </div>
            </div>

            {/* Mobile: discoverable button + bottom sheet */}
            {isMobile && !panelOpen && (
              <button onClick={() => setPanelOpen(true)}
                style={{ position: "fixed", right: 14, bottom: BAR_H + 18, zIndex: 55, display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: 999, border: "none", background: TEAL, color: "#fff", fontWeight: 700, fontSize: 13, boxShadow: "0 6px 20px rgba(0,0,0,.45)", cursor: "pointer" }}>
                <HelpCircle size={16} /> {isStaff ? "Questions" : "My questions"}
              </button>
            )}
            {isMobile && panelOpen && (
              <div style={{ position: "fixed", left: 0, right: 0, bottom: BAR_H, height: "58dvh", zIndex: 55, background: "rgba(24,26,32,.98)", borderTopLeftRadius: 20, borderTopRightRadius: 20, border: "1px solid rgba(255,255,255,.1)", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 -10px 30px rgba(0,0,0,.5)" }}>
                {panelHeader}{panelBody}
              </div>
            )}
          </div>

          {!isMobile && panelOpen && (
            <aside style={{ width: 380, flexShrink: 0, background: "rgba(24,26,32,.98)", borderLeft: "1px solid rgba(255,255,255,.08)", display: "flex", flexDirection: "column", paddingTop: 56, paddingBottom: BAR_H, boxSizing: "border-box", zIndex: 50 }}>
              {panelHeader}{panelBody}
            </aside>
          )}
        </div>

        <ClassControls
          sessionId=""
          isHostOverride={isStaff}
          onToggleChat={() => setPanelOpen(v => !v)}
          onToggleParticipants={() => { /* only two people in an interview */ }}
          onEndClass={() => setShowEnd(true)}
          onLeaveClass={() => setShowLeave(true)}
          chatUnread={0}
          onLaunchPoll={() => {}}
          onLaunchQuiz={() => {}}
          handRaiseEnabled={false}
          chatButtonTitle="Questions"
          chatButtonIcon={<HelpCircle className="h-5 w-5" />}
        />
      </LiveKitRoom>

      {showLeave && (
        <Confirm title="Leave the interview?" body={isStaff ? "The student will stay in the room until they leave too." : "You can rejoin from your registration page while the session is live."}
          confirmLabel="Leave" onCancel={() => setShowLeave(false)} onConfirm={() => { setShowLeave(false); leave(); }} />
      )}
      {showEnd && (
        <Confirm title="End the interview?" body="This ends the session for the student too." confirmLabel="End interview" danger
          onCancel={() => setShowEnd(false)} onConfirm={() => { setShowEnd(false); setEndTrigger(n => n + 1); }} />
      )}
    </div>
  );
};

export default InterviewRoom;
