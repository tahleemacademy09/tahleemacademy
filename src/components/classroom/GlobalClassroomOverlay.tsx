/*
  GlobalClassroomOverlay.tsx — Tahleem Academy
  ─────────────────────────────────────────────
  The classroom is a position:fixed overlay (z-8000) that sits on top of
  whatever page React Router is currently rendering.

  Key insight: we NEVER navigate() during a class. The page underneath
  the fixed overlay is always whatever route was active — it renders
  normally. We just slide the classroom on/off screen with translateX.

  Minimize / background behaviour (simplified):
    • Minimize button                → translateX(-200%) + real browser
      Picture-in-Picture (native OS-level floating window, see startNativePiP
      in ClassroomView.tsx's BottomBar) + small draggable circular bubble
    • Phone home / recents button   → visibilitychange hidden → translateX(-200%)
    • Back button                   → popstate (handled by LiveClassContext) → translateX(-200%)
    • Tapping the bubble            → translateX(0) + bubble hidden
    • Dragging the bubble           → repositions it, does not return to class
    • Returning to tab              → auto-restore (bubble never needed)

  KEEP-ALIVE STRATEGY (all inside useBackgroundAudio):
  ──────────────────────────────────────────────────────
  • Real <audio> element (looping silence at volume 0.001) — grants Android
    audio focus, keeps JS thread alive through screen lock exactly as WhatsApp
    and Google Meet do.
  • setInterval heartbeat (20 s) — forces event-loop ticks under throttling.
  • WakeLock — prevents CPU sleep while screen is on.
  • MediaSession — shows Tahleem lock-screen media card with "Return to Class".
  • pageshow / resume / focus listeners — restart all layers after screen unlock.

  REMOVED: useSilentAudio (AudioContext oscillator at gain=0).
  Chrome (Android 9+) detects silent AudioContext and throttles the JS thread
  after ~30 s of screen lock. A real <audio> element is the correct signal.
*/

import { useLiveClass } from "@/contexts/LiveClassContext";
import { startBackgroundAudio, stopBackgroundAudio } from "@/hooks/useBackgroundAudio";
import { App as CapApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import ClassroomView from "@/components/classroom/ClassroomView";
import { useEffect, useRef, useCallback, useState } from "react";
import { startForegroundService, stopForegroundService } from "@/hooks/useForegroundService";
import { useLocation } from "react-router-dom";
import { Mic, MicOff, Video, VideoOff } from "lucide-react";

// Routes where the overlay is allowed to persist.
// Navigating to anything else (home, login, register) auto-calls leaveClass().
const ALLOWED_ROUTE_PREFIXES = [
  "/student",
  "/admin",
  "/teacher",
  "/live",
  "/public/classes",
  "/class",
];

/* ════════════════════════════════════════════════════════════════════ */
export default function GlobalClassroomOverlay() {
  const {
    activeSubject, inCall, minimized, autoJoin,
    leaveClass, setMinimized,
    micEnabled, camEnabled,
    hasConnected,
    restoreMicFnRef,
  } = useLiveClass();

  const title = activeSubject?.title ?? "Live Class";
  const location = useLocation();

  // Auto-leave when user navigates away from student/admin area —
  // prevents the "Return to Class" banner haunting the home/login pages.
  useEffect(() => {
    if (!inCall) return;
    const allowed = ALLOWED_ROUTE_PREFIXES.some(p => location.pathname.startsWith(p));
    if (!allowed) leaveClass();
  }, [location.pathname, inCall, leaveClass]);

  // Track whether the user explicitly minimized (button/back) vs tab-switched
  const userMinimizedRef = useRef(false);

  // ── Draggable bubble position (Messenger chat-head style) ────────────────
  // Defaults to bottom-right, clear of nav bars. Clamped to viewport on drag
  // so it can never be dragged fully off-screen and lost.
  const BUBBLE_SIZE = 60;
  const [bubblePos, setBubblePos] = useState(() => ({
    x: typeof window !== "undefined" ? window.innerWidth - BUBBLE_SIZE - 16 : 300,
    y: typeof window !== "undefined" ? window.innerHeight - BUBBLE_SIZE - 140 : 400,
  }));
  const dragRef = useRef({ dragging: false, moved: false, startX: 0, startY: 0, origX: 0, origY: 0 });

  const clampBubble = useCallback((x: number, y: number) => {
    const maxX = window.innerWidth - BUBBLE_SIZE - 6;
    const maxY = window.innerHeight - BUBBLE_SIZE - 6;
    return { x: Math.min(Math.max(6, x), Math.max(6, maxX)), y: Math.min(Math.max(6, y), Math.max(6, maxY)) };
  }, []);

  const onBubblePointerDown = useCallback((e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { dragging: true, moved: false, startX: e.clientX, startY: e.clientY, origX: bubblePos.x, origY: bubblePos.y };
  }, [bubblePos]);

  const onBubblePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current.dragging) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    // Small movement threshold — anything under ~6px is still treated as a
    // tap (finger jitter), not a drag, so tapping to return still works.
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) dragRef.current.moved = true;
    if (dragRef.current.moved) {
      setBubblePos(clampBubble(dragRef.current.origX + dx, dragRef.current.origY + dy));
    }
  }, [clampBubble]);

  const onBubblePointerUp = useCallback((e: React.PointerEvent) => {
    const wasMoved = dragRef.current.moved;
    dragRef.current.dragging = false;
    dragRef.current.moved = false;
    // Safe to reference handleReturn here even though it's declared further
    // down: this callback only ever RUNS on a later pointerup event (long
    // after the whole component has finished rendering), and handleReturn's
    // own identity is stable (its deps — setMinimized, restoreMicFnRef —
    // never change), so there's no stale-closure risk from the empty deps.
    if (!wasMoved) handleReturn(); // a genuine tap (no drag) — return to class
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // FIX: snapshot mic state the moment the tab goes to background so we
  // restore exactly that state — not whatever micEnabled happens to be when
  // the effect re-runs later.
  const micEnabledRef = useRef(micEnabled);
  useEffect(() => { micEnabledRef.current = micEnabled; }, [micEnabled]);

  // handleReturn: slide the classroom back — no navigate() needed.
  // Also restores mic if it was on before minimize — covers the case where
  // the user minimized via the button (not a tab-switch), so visibilitychange
  // never fired and MicKeepAlive never ran.
  const handleReturn = useCallback(() => {
    userMinimizedRef.current = false;
    setMinimized(false);
    // Restore mic after a short delay so LiveKit room is foregrounded first
    if (micEnabledRef.current) {
      setTimeout(() => { restoreMicFnRef.current?.(); }, 400);
    }
  }, [setMinimized, restoreMicFnRef]);

  const handleLeave = useCallback(() => leaveClass(), [leaveClass]);

  // ── WhatsApp-style keep-alive ─────────────────────────────────────────
  // startBackgroundAudio:
  //   • Plays a real <audio> element (looping silence) → grants Android audio focus
  //   • Sets MediaSession with "Return to Class" handlers
  //   • Acquires WakeLock
  //   • Attaches pageshow/resume/focus listeners (fires even during screen lock,
  //     unlike visibilitychange which stays "hidden" until the user unlocks)
  //
  // CRITICAL FIX vs old useSilentAudio:
  //   Old code: AudioContext with gain=0 buffer → Chrome throttles as "silent audio"
  //   New code: HTMLAudioElement at volume=0.001 → real audio focus, never throttled
  //
  // CRITICAL FIX vs old visibilitychange resume guard:
  //   Old code: if (visibilityState !== "visible") return;
  //             → never fires during screen lock (state stays "hidden")
  //   New code: pageshow + resume + focus handlers fire on lock-screen wake-up
  useEffect(() => {
    if (!hasConnected) {
      stopBackgroundAudio();
      return;
    }
    startBackgroundAudio(title);
    return () => stopBackgroundAudio();
  }, [hasConnected, title]);

  // ── Wire MediaSession "Return to Class" / "Leave" actions ────────────
  // We update the handlers whenever the callbacks change (stable refs so
  // this rarely fires). This is separate from startBackgroundAudio so that
  // the audio element is never torn down just because handleReturn changed.
  useEffect(() => {
    if (!hasConnected || !("mediaSession" in navigator)) return;
    const sa = (a: MediaSessionAction, h: MediaSessionActionHandler | null) => {
      try { navigator.mediaSession.setActionHandler(a, h); } catch {}
    };
    // "play" and "pause" both mean "user wants to interact" on the lock screen
    // (they tap the play button on the media card). Treat both as "Return to Class".
    // "stop" ends the call. We do NOT wire "pause" → leaveClass — that would
    // disconnect participants every time Android locks the screen.
    sa("play",          handleReturn);
    sa("pause",         handleReturn);
    sa("stop",          handleLeave);
    sa("previoustrack", handleReturn);
    sa("nexttrack",     handleReturn);
    return () => {
      (["play","pause","stop","previoustrack","nexttrack"] as MediaSessionAction[])
        .forEach(a => { try { navigator.mediaSession.setActionHandler(a, null); } catch {} });
    };
  }, [hasConnected, handleReturn, handleLeave]);

  // Android foreground-service notification tap → restore the classroom.
  useEffect(() => {
    const onReturn = () => handleReturn();
    window.addEventListener("tahleem:live-class-return", onReturn);
    return () => window.removeEventListener("tahleem:live-class-return", onReturn);
  }, [handleReturn]);

  // ── Native Android Foreground Service ───────────────────────────────────
  // This is the ONLY reliable way to keep a WebView process alive on Samsung
  // (and other Android OEMs) when the home button is pressed.
  //
  // On Samsung S21+ with battery optimisation, Activity.onStop() suspends the
  // WebView JS thread within 3–7 s of backgrounding — killing LiveKit heartbeat,
  // WakeLock, and the silence <audio> element simultaneously.
  //
  // A real Android Foreground Service (persistent notification) elevates the
  // process priority so the OS cannot kill it — exactly how WhatsApp, Google
  // Meet, and Zoom keep calls alive on Android.
  //
  // Plugin: npm install capacitor-plugin-foreground-service
  // (see src/hooks/useForegroundService.ts for bridge + install instructions)
  useEffect(() => {
    if (!hasConnected) {
      stopForegroundService();
      return;
    }
    // Start the foreground service immediately when joining a class
    startForegroundService({
      title: `🔴 Live Class — ${title}`,
      body:  "Tahleem Academy · Tap to return to class",
      id:    1001,
      color: "#064E3B",
    });
    return () => { stopForegroundService(); };
  }, [hasConnected, title]);

  // ── Capacitor app lifecycle (back button + foreground/background) ─────────
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !hasConnected) return;
    let backHandle: any   = null;
    let stateHandle: any  = null;

    CapApp.addListener("backButton", () => {
      if (!minimized) setMinimized(true);
    }).then(h => { backHandle = h; });

    // appStateChange fires when app goes to background/foreground on Android.
    // More reliable than visibilitychange in Android WebView.
    CapApp.addListener("appStateChange", ({ isActive }: { isActive: boolean }) => {
      if (!isActive) {
        // App went to background — minimize UI but keep LiveKit alive via
        // the foreground service (started above). Do NOT stop audio here.
        if (!userMinimizedRef.current) setMinimized(true);
      } else {
        // App came back to foreground
        if (!userMinimizedRef.current) setMinimized(false);
        // Restore mic — Android releases mic track when app backgrounds
        if (micEnabledRef.current) {
          setTimeout(() => { restoreMicFnRef.current?.(); }, 600);
        }
      }
    }).then(h => { stateHandle = h; });

    return () => {
      backHandle?.remove();
      stateHandle?.remove();
    };
  }, [hasConnected, minimized, setMinimized, restoreMicFnRef]);

  /* ── Minimize button ── */
  const handleMinimize = useCallback(() => {
    userMinimizedRef.current = true;
    setMinimized(true);
  }, [setMinimized]);

  /* ── Phone home/recent button: visibilitychange → hidden → setMinimized.
     When the user returns (visible), auto-restore if they didn't explicitly minimize.
     Also restore mic — Android suspends the mic track during screen lock.

     FIX: use restoreMicFnRef (sets mic ON only) instead of toggleMicFnRef
     (which would flip mic OFF if it was already on). Also removed micEnabled
     and toggleMicFnRef from deps to prevent the effect re-registering mid-call
     and firing the restoration a second time.

     NOTE: screen lock keeps visibilityState === "hidden" the entire time —
     the audio keep-alive (pageshow/resume handlers) handles that path.
     This listener only handles the tab-switch / home-button case. */
  useEffect(() => {
    if (!hasConnected) return;
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        // Only minimize if not already minimized — avoids a spurious re-render
        // when the user has already pressed the minimize button.
        if (!userMinimizedRef.current) setMinimized(true);
        // micEnabledRef is already up-to-date via its own effect above
      } else if (document.visibilityState === "visible") {
        if (!userMinimizedRef.current) setMinimized(false);
        // Restore mic only if it was on before backgrounding
        if (micEnabledRef.current) {
          setTimeout(() => {
            restoreMicFnRef.current?.();  // sets mic ON, never flips it OFF
          }, 400);
        }
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
    // Only hasConnected and setMinimized in deps — micEnabled/toggleMicFnRef
    // changes must NOT re-register this listener or the restore fires twice.
  }, [hasConnected, setMinimized, restoreMicFnRef]);

  if (!inCall || !activeSubject) return null;

  return (
    <>
      {/* ── Full classroom — always mounted so LiveKit stays alive.
         position:fixed overlays whatever page React Router renders.
         translateX(-200%) moves it off-screen when minimized without
         affecting the route or re-rendering the page below.

         IMPORTANT: Do NOT use visibility:hidden here. Android WebView
         treats visibility:hidden on the root element as "nothing to
         render" and suspends the JS/audio thread, killing LiveKit audio.
         translateX keeps the DOM fully active while having zero visual
         footprint. pointerEvents:none prevents phantom tap-throughs. */}
      <div style={{
        position:      "fixed",
        inset:         0,
        zIndex:        8000,
        display:       "flex",
        flexDirection: "column",
        transform:     minimized ? "translateX(-200%)" : "translateX(0)",
        // No CSS transition — instant snap avoids the 120ms flicker where
        // the classroom is partially visible during minimize/restore.
        transition:    "none",
        pointerEvents: minimized ? "none" : "all",
      }}>
        <ClassroomView
          subject={activeSubject}
          onLeave={leaveClass}
          onMinimize={handleMinimize}
          autoJoin={autoJoin}
        />
      </div>

      {/* ── Floating bubble — shown when minimized. Small circular Messenger-
         chat-head style, draggable anywhere on screen. Tap (no drag) returns
         to class; dragging just repositions it. Shows live mic/video status
         so you can tell at a glance whether you're still unmuted. ── */}
      {minimized && (
        <div
          onPointerDown={onBubblePointerDown}
          onPointerMove={onBubblePointerMove}
          onPointerUp={onBubblePointerUp}
          style={{
            position:   "fixed",
            left:       bubblePos.x,
            top:        bubblePos.y,
            width:      BUBBLE_SIZE,
            height:     BUBBLE_SIZE,
            zIndex:     9000,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #0c1f12 0%, #14290f 100%)",
            border:     "2px solid #c9a84c",
            boxShadow:  "0 4px 20px rgba(0,0,0,0.5), 0 0 0 1px rgba(201,168,76,0.15)",
            display:    "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor:     "grab",
            touchAction: "none",
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
        >
          {/* Pulsing live dot — top-right corner */}
          <span style={{ position: "absolute", top: -3, right: -3, width: 14, height: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{
              position: "absolute", width: "100%", height: "100%", borderRadius: "50%",
              background: "#ef4444", opacity: 0.6, animation: "tahleem-ping 1.4s cubic-bezier(0,0,0.2,1) infinite",
            }} />
            <span style={{ position: "relative", width: 9, height: 9, borderRadius: "50%", background: "#ef4444", border: "1.5px solid #0c1f12" }} />
          </span>

          {/* Mic status — the main glyph */}
          {micEnabled
            ? <Mic style={{ width: 22, height: 22, color: "#34d399" }} />
            : <MicOff style={{ width: 22, height: 22, color: "#ef4444" }} />
          }

          {/* Video status — small badge, bottom-right */}
          <span style={{
            position: "absolute", bottom: -2, right: -2, width: 20, height: 20, borderRadius: "50%",
            background: "#0c1f12", border: "1.5px solid #c9a84c",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {camEnabled
              ? <Video style={{ width: 11, height: 11, color: "#34d399" }} />
              : <VideoOff style={{ width: 11, height: 11, color: "rgba(255,255,255,.4)" }} />
            }
          </span>
        </div>
      )}

      {/* Keyframe for the pulsing dot */}
      <style>{`
        @keyframes tahleem-ping {
          75%, 100% { transform: scale(2.2); opacity: 0; }
        }
      `}</style>
    </>
  );
}
