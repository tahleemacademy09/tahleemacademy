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
    • Returning to tab / app        → AUTO-RESTORES straight back into the classroom
                                       (translateX(0)); the banner only flashes briefly
                                       for tab-switches too fast for the eye to register.
                                       No extra tap required — this matches how people
                                       actually use it (lock the phone or switch apps
                                       briefly, then come straight back to the room).

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
import { startBackgroundAudio, stopBackgroundAudio, setWakeLockActive } from "@/hooks/useBackgroundAudio";
import { enterPiPKeepAlive, exitPiPKeepAlive, setPiPSource } from "@/hooks/useBackgroundPiP";
import { App as CapApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import ClassroomView from "@/components/classroom/ClassroomView";
import { useEffect, useRef, useCallback, useState, type PointerEvent as ReactPointerEvent } from "react";
import { startForegroundService, stopForegroundService } from "@/hooks/useForegroundService";
import {
  shouldPromptBatteryOptimization,
  requestRunInBackground,
  dismissBatteryOptimizationPrompt,
} from "@/hooks/useBatteryOptimization";
import { useLocation } from "react-router-dom";
import { wasBackPressClaimed } from "@/lib/backPressClaim";

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
    restoreMicFnRef, getLocalCameraTrackRef, leaveSessionFnRef,
  } = useLiveClass();

  const title = activeSubject?.title ?? "Live Class";
  const location = useLocation();

  // Auto-leave when user navigates away from student/admin area —
  // prevents the "Return to Class" banner haunting the home/login pages.
  //
  // FIX ("reopening the app after a class was restored starts fresh instead
  // of resuming"): LiveClassContext restores inCall=true from localStorage
  // synchronously on mount so a killed/reopened app can rejoin the class it
  // was in. But on a cold start the URL briefly sits at "/" before
  // useAppStateRestore navigates back to the saved deep route — and this
  // effect also runs on that very first mount, sees inCall=true with a "/"
  // pathname that isn't in ALLOWED_ROUTE_PREFIXES, and calls leaveClass()
  // before the navigation ever happens. The restore then has nothing left
  // to resume. Skip the very first run of this check — only enforce it once
  // we've observed at least one pathname (i.e. real in-app navigation), by
  // which point the cold-start restore navigation has already landed.
  const skippedFirstRouteCheck = useRef(false);
  useEffect(() => {
    if (!inCall) return;
    if (!skippedFirstRouteCheck.current) { skippedFirstRouteCheck.current = true; return; }
    const allowed = ALLOWED_ROUTE_PREFIXES.some(p => location.pathname.startsWith(p));
    if (allowed) return;
    // FIX ("back button terminates the overlay instead of minimizing it"): a
    // phone back-press fires popstate, which React Router's own listener
    // reacts to by updating location.pathname to the previous route — that
    // can land here as a "disallowed" pathname even though LiveClassContext's
    // popstate handler is (in the same event) minimizing the call, not ending
    // it. If that handler just claimed this exact back-press, trust it and
    // skip leaveClass() — only a genuine in-app navigation (link/redirect,
    // not a back-press) should end the call here.
    if (wasBackPressClaimed()) return;
    leaveClass();
  }, [location.pathname, inCall, leaveClass]);

  // Track whether the user explicitly minimized (button/back) vs tab-switched
  const userMinimizedRef = useRef(false);

  // ── Draggable round minimized bubble (replaces the old fixed horizontal
  //    "Return to Class" bar) ─────────────────────────────────────────────
  // Position is stored as {x, y} distance from the bottom-right corner, in
  // pixels, so it stays anchored sensibly across viewport-size changes
  // (rotation, keyboard opening, etc.) instead of drifting to a stale
  // absolute screen coordinate. null = not dragged yet → default corner.
  const [bubblePos, setBubblePos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{
    dragging: boolean;
    startClientX: number; startClientY: number;
    startX: number; startY: number;
    moved: boolean;
  }>({ dragging: false, startClientX: 0, startClientY: 0, startX: 0, startY: 0, moved: false });
  const BUBBLE_SIZE = 60;
  const BUBBLE_MARGIN = 14;

  const clampBubblePos = useCallback((x: number, y: number) => {
    const maxX = window.innerWidth  - BUBBLE_SIZE - BUBBLE_MARGIN;
    const maxY = window.innerHeight - BUBBLE_SIZE - BUBBLE_MARGIN;
    return { x: Math.min(Math.max(x, BUBBLE_MARGIN), Math.max(maxX, BUBBLE_MARGIN)), y: Math.min(Math.max(y, BUBBLE_MARGIN), Math.max(maxY, BUBBLE_MARGIN)) };
  }, []);

  const handleBubblePointerDown = useCallback((e: ReactPointerEvent) => {
    const current = bubblePos ?? { x: BUBBLE_MARGIN, y: BUBBLE_MARGIN };
    dragRef.current = {
      dragging: true, moved: false,
      startClientX: e.clientX, startClientY: e.clientY,
      startX: current.x, startY: current.y,
    };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, [bubblePos]);

  const handleBubblePointerMove = useCallback((e: ReactPointerEvent) => {
    const d = dragRef.current;
    if (!d.dragging) return;
    const dx = e.clientX - d.startClientX;
    const dy = e.clientY - d.startClientY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) d.moved = true;
    // Bubble is positioned via right/bottom, so dragging right/down means
    // the distance-from-edge shrinks, hence the minus sign.
    setBubblePos(clampBubblePos(d.startX - dx, d.startY - dy));
  }, [clampBubblePos]);

  const handleBubblePointerUp = useCallback(() => {
    const wasTap = !dragRef.current.moved;
    dragRef.current.dragging = false;
    if (wasTap) handleReturn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the bubble on-screen after a rotation or keyboard-triggered resize.
  useEffect(() => {
    const onResize = () => setBubblePos(p => (p ? clampBubblePos(p.x, p.y) : p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clampBubblePos]);

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
    exitPiPKeepAlive();
    // Restore mic after a short delay so LiveKit room is foregrounded first
    if (micEnabledRef.current) {
      setTimeout(() => { restoreMicFnRef.current?.(); }, 400);
    }
  }, [setMinimized, restoreMicFnRef]);

  // Keep the PiP window's content in sync if the user toggles their camera
  // on/off while already minimized — no need to re-request PiP, the same
  // floating window just switches what it's displaying.
  useEffect(() => {
    if (!minimized) return;
    setPiPSource(camEnabled ? getLocalCameraTrackRef.current?.() ?? null : null);
  }, [camEnabled, minimized, getLocalCameraTrackRef]);

  const handleLeave = useCallback(() => {
    // Prefer the full cleanup (save recording, close out attendance, leave
    // sound) that ClassroomView's leaveSession() does — it always calls
    // leaveClass() itself at the end, so this is a strict superset. The ref
    // defaults to a no-op until ClassroomView mounts and populates it
    // (same pattern as toggleMicFnRef/restoreMicFnRef above), which always
    // happens before a user could actually trigger this.
    leaveSessionFnRef.current();
  }, [leaveSessionFnRef]);

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
      exitPiPKeepAlive();
      return;
    }
    startBackgroundAudio(title);
    return () => stopBackgroundAudio();
  }, [hasConnected, title]);

  // ── Battery: only hold the screen wake lock while the camera is on ─────
  // startBackgroundAudio() above defaults to holding the wake lock (video-
  // safe). Once connected, this keeps it in sync with the *actual* camera
  // state so an audio-only session (the common case — camera defaults off)
  // lets the screen lock normally instead of staying lit for the whole
  // class. The <audio> element + 5s heartbeat from startBackgroundAudio
  // still run regardless, which is what actually prevents the Android JS
  // throttle/disconnect — the wake lock was extra insurance mainly useful
  // when there's a camera preview on screen to keep visible.
  useEffect(() => {
    if (!hasConnected) return;
    setWakeLockActive(camEnabled);
  }, [hasConnected, camEnabled]);

  // ── OEM battery-optimization prompt (Android) ───────────────────────────
  // The foreground service above stops stock Android from killing the app,
  // but Samsung/Xiaomi/Huawei/etc. layer their own battery manager on top
  // that can still freeze it unless the user whitelists the app there too.
  // Ask once, only after they're actually in a live class (so the "why" is
  // obvious), never more than once per device.
  const [showBatteryPrompt, setShowBatteryPrompt] = useState(false);
  useEffect(() => {
    if (!hasConnected) return;
    let cancelled = false;
    shouldPromptBatteryOptimization().then(should => {
      if (!cancelled && should) setShowBatteryPrompt(true);
    });
    return () => { cancelled = true; };
  }, [hasConnected]);

  const handleAllowBackground = useCallback(() => {
    setShowBatteryPrompt(false);
    requestRunInBackground();
  }, []);

  const handleDismissBatteryPrompt = useCallback(() => {
    setShowBatteryPrompt(false);
    dismissBatteryOptimizationPrompt();
  }, []);

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
      // FIX: back should never be able to close the app while a class is in
      // progress — only the explicit "End" control should do that. Minimize
      // on the first press same as before; once already minimized, further
      // back presses are swallowed (no exitApp) so mashing back by accident
      // can't kick anyone out of a live class.
      if (!minimized) {
        setMinimized(true);
        // Attempt PiP here too for consistency. Note: this event arrives via
        // Capacitor's native bridge, not a trusted browser input event, so
        // it's less likely than the PWA popstate path to count as a genuine
        // user gesture — but costs nothing to try.
        enterPiPKeepAlive(camEnabled ? getLocalCameraTrackRef.current?.() ?? null : null);
      }
    }).then(h => { backHandle = h; });

    // appStateChange fires when app goes to background/foreground on Android.
    // More reliable than visibilitychange in Android WebView.
    CapApp.addListener("appStateChange", ({ isActive }: { isActive: boolean }) => {
      if (!isActive) {
        // App went to background — minimize UI but keep LiveKit alive via
        // the foreground service (started above). Do NOT stop audio here.
        if (!userMinimizedRef.current) setMinimized(true);
      } else {
        // FIX: app came back to foreground — jump straight back into the
        // classroom instead of leaving the person staring at the "Return to
        // Class" banner and making them tap it. That extra tap was the exact
        // complaint: minimizing (locking the phone, switching apps, etc.) and
        // coming back should land them directly in the room, not on the bubble.
        if (minimized) handleReturn();
      }
    }).then(h => { stateHandle = h; });

    return () => {
      backHandle?.remove();
      stateHandle?.remove();
    };
  }, [hasConnected, minimized, setMinimized, restoreMicFnRef, camEnabled, getLocalCameraTrackRef, handleReturn]);

  /* ── Minimize button ──
     This is the ONLY place safe to call requestPictureInPicture() — it must
     run synchronously inside a real tap/click handler. Calling it from
     visibilitychange or appStateChange (below) is rejected by the browser,
     so PiP only has a chance to engage when the user taps this button
     directly, not when they press the phone's physical home button. */
  const handleMinimize = useCallback(() => {
    userMinimizedRef.current = true;
    setMinimized(true);
    enterPiPKeepAlive(camEnabled ? getLocalCameraTrackRef.current?.() ?? null : null);
  }, [setMinimized, camEnabled, getLocalCameraTrackRef]);

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
        // FIX: tab/app regained visibility — jump straight back into the
        // classroom (handleReturn also restores the mic if it was on before
        // backgrounding). Previously this stayed minimized and made the
        // person tap the "Return to Class" banner every single time —
        // that extra tap was the actual complaint.
        handleReturn();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [hasConnected, setMinimized, handleReturn]);

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

      {/* ── Round draggable "minimized call" bubble — replaces the old fixed
         horizontal "Return to Class" bar. Tap = return to class. Drag = move
         it anywhere on screen (position persists, in px from bottom-right,
         while this component stays mounted). Pointer events give us mouse +
         touch + pen with one code path, and pointer capture means the drag
         keeps tracking even if the finger/cursor leaves the small bubble. ── */}
      {minimized && (() => {
        const pos = bubblePos ?? { x: BUBBLE_MARGIN, y: BUBBLE_MARGIN };
        return (
          <div
            onPointerDown={handleBubblePointerDown}
            onPointerMove={handleBubblePointerMove}
            onPointerUp={handleBubblePointerUp}
            onPointerCancel={handleBubblePointerUp}
            style={{
              position:      "fixed",
              right:         `calc(${pos.x}px + env(safe-area-inset-right, 0px))`,
              bottom:        `calc(${pos.y}px + env(safe-area-inset-bottom, 0px))`,
              zIndex:        9000,
              width:         BUBBLE_SIZE,
              height:        BUBBLE_SIZE,
              borderRadius:  "50%",
              background:    "linear-gradient(135deg, #0c1f12 0%, #14290f 100%)",
              border:        "2px solid #c9a84c",
              display:       "flex",
              alignItems:    "center",
              justifyContent: "center",
              cursor:        "grab",
              boxShadow:     "0 6px 20px rgba(0,0,0,0.5), 0 0 0 1px rgba(201,168,76,0.15)",
              userSelect:    "none",
              WebkitUserSelect: "none",
              touchAction:   "none", // let us handle all drag movement ourselves
            }}
            title={`${title} — tap to return, drag to move`}
          >
            {/* Pulsing live dot, top-right of the bubble */}
            <span style={{ position: "absolute", top: 4, right: 4, display: "flex", alignItems: "center", justifyContent: "center", width: 10, height: 10 }}>
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

            {/* Mic-off indicator, so a glance tells you if you're muted while minimized */}
            {!micEnabled && (
              <span style={{ position: "absolute", bottom: 3, right: 3, width: 16, height: 16, borderRadius: "50%", background: "#ef4444", display: "flex", alignItems: "center", justifyContent: "center", border: "1.5px solid #0c1f12" }}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="1" y1="1" x2="23" y2="23" />
                  <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                  <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                </svg>
              </span>
            )}

            {/* Center glyph */}
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 7l-7 5 7 5V7z" />
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
          </div>
        );
      })()}

      {/* ── "Allow background running" prompt — Android OEM battery managers ── */}
      {showBatteryPrompt && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.6)",
            zIndex: 9500,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={handleDismissBatteryPrompt}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "#1e2535",
              borderRadius: 20,
              padding: "26px 22px",
              maxWidth: 360,
              width: "100%",
              boxShadow: "0 24px 60px rgba(0,0,0,.6)",
              border: "1px solid rgba(255,255,255,.1)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 700, color: "#f5f0e8", marginBottom: 8 }}>
              Keep your call connected
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,.65)", lineHeight: 1.5, marginBottom: 20 }}>
              Your phone's battery saver can disconnect live classes when the screen locks.
              Allow Tahleem Academy to run in the background to keep your mic and connection alive — just like WhatsApp calls.
            </div>
            <button
              onClick={handleAllowBackground}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: 12,
                border: "none",
                background: "linear-gradient(135deg,#0a7c68,#064E3B)",
                color: "#fff",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
                marginBottom: 10,
              }}
            >
              Allow background running
            </button>
            <button
              onClick={handleDismissBatteryPrompt}
              style={{
                width: "100%",
                padding: "10px",
                borderRadius: 12,
                border: "none",
                background: "transparent",
                color: "rgba(255,255,255,.45)",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Not now
            </button>
          </div>
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
