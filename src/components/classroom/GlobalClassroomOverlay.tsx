/*
  GlobalClassroomOverlay.tsx — Tahleem Academy
  ─────────────────────────────────────────────
  The classroom is a position:fixed overlay (z-8000) that sits on top of
  whatever page React Router is currently rendering.

  Key insight: we NEVER navigate() during a class. The page underneath
  the fixed overlay is always whatever route was active — it renders
  normally. We just slide the classroom on/off screen with translateX.

  Minimize / background behaviour (simplified):
    • Minimize button                → translateX(-200%)   + "Return to Class" banner shown
    • Phone home / recents button   → visibilitychange hidden → translateX(-200%)
    • Back button                   → popstate (handled by LiveClassContext) → translateX(-200%)
    • Tapping "Return to Class"     → translateX(0) + banner hidden
    • Returning to tab              → auto-restore (banner never needed)

  NO canvas PiP. NO browser PiP. NO video element hacks.

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
import { useEffect, useRef, useCallback } from "react";

/* ════════════════════════════════════════════════════════════════════ */
export default function GlobalClassroomOverlay() {
  const {
    activeSubject, inCall, minimized, autoJoin,
    leaveClass, setMinimized,
    micEnabled,
    hasConnected,
    restoreMicFnRef,
  } = useLiveClass();

  const title = activeSubject?.title ?? "Live Class";

  // Track whether the user explicitly minimized (button/back) vs tab-switched
  const userMinimizedRef = useRef(false);

  // FIX: snapshot mic state the moment the tab goes to background so we
  // restore exactly that state — not whatever micEnabled happens to be when
  // the effect re-runs later.
  const micEnabledRef = useRef(micEnabled);
  useEffect(() => { micEnabledRef.current = micEnabled; }, [micEnabled]);

  // handleReturn: slide the classroom back — no navigate() needed.
  const handleReturn = useCallback(() => {
    userMinimizedRef.current = false;
    setMinimized(false);
  }, [setMinimized]);

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

  // ── Native foreground service: keeps audio alive when phone home button pressed ──
  // On Android native (Capacitor), startBackgroundAudio() also starts the
  // Android foreground service via @capacitor/background-audio (if installed).
  // The useEffect above already calls startBackgroundAudio, so this block only
  // handles the Capacitor app lifecycle events.
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !hasConnected) return;
    let backHandle: any = null;
    let stateHandle: any = null;

    CapApp.addListener("backButton", () => {
      if (!minimized) setMinimized(true);
    }).then(h => { backHandle = h; });

    // appStateChange fires when app goes to background/foreground on Android.
    // More reliable than visibilitychange in Android WebView.
    CapApp.addListener("appStateChange", ({ isActive }: { isActive: boolean }) => {
      if (!isActive) {
        // App went to background — minimize UI but keep LiveKit alive.
        if (!userMinimizedRef.current) setMinimized(true);
      } else {
        // App came back to foreground — restore if user didn't explicitly minimize.
        if (!userMinimizedRef.current) setMinimized(false);
        // Restore mic after background (Android suspends mic track during screen lock)
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

      {/* ── "Return to Class" floating banner — shown when minimized ── */}
      {minimized && (
        <div
          onClick={handleReturn}
          style={{
            position:       "fixed",
            bottom:         "env(safe-area-inset-bottom, 16px)",
            left:           "50%",
            transform:      "translateX(-50%)",
            zIndex:         9000,
            display:        "flex",
            alignItems:     "center",
            gap:            "10px",
            background:     "linear-gradient(135deg, #0c1f12 0%, #14290f 100%)",
            border:         "1.5px solid #c9a84c",
            borderRadius:   "999px",
            padding:        "10px 20px 10px 14px",
            cursor:         "pointer",
            boxShadow:      "0 4px 24px rgba(0,0,0,0.45), 0 0 0 1px rgba(201,168,76,0.15)",
            userSelect:     "none",
            WebkitUserSelect: "none",
            whiteSpace:     "nowrap",
          }}
        >
          {/* Pulsing live dot */}
          <span style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: 10, height: 10 }}>
            <span style={{
              position:     "absolute",
              width:        "100%",
              height:       "100%",
              borderRadius: "50%",
              background:   "#ef4444",
              opacity:      0.6,
              animation:    "tahleem-ping 1.4s cubic-bezier(0,0,0.2,1) infinite",
            }} />
            <span style={{
              position:     "relative",
              width:        8,
              height:       8,
              borderRadius: "50%",
              background:   "#ef4444",
              display:      "block",
            }} />
          </span>

          {/* Subject name */}
          <span style={{
            color:      "#f5f0e8",
            fontSize:   "13px",
            fontWeight: 600,
            maxWidth:   "160px",
            overflow:   "hidden",
            textOverflow: "ellipsis",
          }}>
            {title}
          </span>

          {/* Divider */}
          <span style={{ width: 1, height: 14, background: "rgba(201,168,76,0.35)" }} />

          {/* CTA */}
          <span style={{
            color:       "#c9a84c",
            fontSize:    "12px",
            fontWeight:  700,
            letterSpacing: "0.02em",
            textTransform: "uppercase",
          }}>
            Return to Class
          </span>

          {/* Chevron */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
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
