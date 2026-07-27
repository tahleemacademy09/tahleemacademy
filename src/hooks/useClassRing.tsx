// src/hooks/useClassRing.ts
// ════════════════════════════════════════════════════════════════════════
// Listens for CLASS_RING postMessages from the service worker and
// from Supabase Realtime (live_sessions INSERT with status=live).
//
// When a ring is detected:
//   1. Shows a full-screen in-app overlay with Join/Dismiss buttons
//   2. Plays a ring tone (Web Audio API — no external file needed)
//   3. Automatically dismisses after 60 seconds
//
// Usage: mount once in DashboardLayout or StudentDashboard:
//   const { ringOverlay } = useClassRing();
//   return <>{ringOverlay}{/* rest of layout */}</>;
// ════════════════════════════════════════════════════════════════════════

import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import ReactDOM from "react-dom";

interface RingInfo {
  class_id:     string;
  class_title:  string;
  teacher_name: string;
  join_url:     string;
  ring_id:      string;
}

const G    = "#064E3B";
const GOLD = "#c9a84c";

// ── Simple ring tone via Web Audio API ───────────────────────────────────────
function playRingTone(audioCtx: AudioContext): () => void {
  let stopped = false;
  let timeout: any;

  const ring = () => {
    if (stopped || audioCtx.state === "closed") return;

    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.type = "sine";
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);

    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.4);

    timeout = setTimeout(() => {
      if (!stopped) ring();
    }, 1400);
  };

  ring();
  return () => { stopped = true; if (timeout) clearTimeout(timeout); };
}

// ── Overlay component (rendered via portal) ───────────────────────────────────
function RingOverlay({
  info,
  onJoin,
  onDismiss,
  secondsLeft,
}: {
  info: RingInfo;
  onJoin: () => void;
  onDismiss: () => void;
  secondsLeft: number;
}) {
  return ReactDOM.createPortal(
    <div style={{
      position:  "fixed", inset: 0, zIndex: 99999,
      background: "rgba(0,0,0,.75)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24, fontFamily: "'Cairo', system-ui, sans-serif",
      animation: "ringFadeIn .3s ease",
    }}>
      <style>{`
        @keyframes ringFadeIn { from { opacity:0; transform:scale(.92); } to { opacity:1; transform:none; } }
        @keyframes ringPulse  { 0%,100%{ transform:scale(1); } 50%{ transform:scale(1.08); } }
        @keyframes spin        { to { transform:rotate(360deg); } }
      `}</style>
      <div style={{
        background: "#fff", borderRadius: 24, padding: "36px 28px",
        maxWidth: 360, width: "100%", textAlign: "center",
        boxShadow: "0 24px 64px rgba(0,0,0,.4)",
      }}>
        {/* Pulsing ring icon */}
        <div style={{
          width: 84, height: 84, borderRadius: "50%",
          background: `linear-gradient(135deg, ${G}, #075E54)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 20px",
          animation: "ringPulse 1.2s ease-in-out infinite",
          boxShadow: `0 0 0 12px ${G}20, 0 0 0 24px ${G}10`,
        }}>
          <span style={{ fontSize: 38 }}>📹</span>
        </div>

        <h2 style={{ fontSize: 20, fontWeight: 900, color: G, margin: "0 0 6px" }}>
          Class Starting Now!
        </h2>
        <p style={{ fontSize: 16, fontWeight: 800, color: "#111", margin: "0 0 4px" }}>
          {info.class_title}
        </p>
        <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 24px" }}>
          {info.teacher_name} is waiting for you
        </p>

        {/* Countdown */}
        <div style={{
          fontSize: 11, color: "#9CA3AF", marginBottom: 24,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        }}>
          <div style={{
            width: 14, height: 14, borderRadius: "50%",
            border: "2px solid #E5E7EB", borderTopColor: G,
            animation: "spin 1s linear infinite",
          }} />
          Auto-dismisses in {secondsLeft}s
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onDismiss}
            style={{
              flex: 1, padding: "13px", borderRadius: 12,
              border: "1.5px solid #E5E7EB", background: "#F9FAFB",
              color: "#6B7280", fontSize: 14, fontWeight: 700, cursor: "pointer",
            }}
          >
            Dismiss
          </button>
          <button
            onClick={onJoin}
            style={{
              flex: 2, padding: "13px", borderRadius: 12, border: "none",
              background: `linear-gradient(135deg, ${G}, #075E54)`,
              color: "#fff", fontSize: 15, fontWeight: 900, cursor: "pointer",
              boxShadow: `0 4px 16px ${G}40`,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            📹 Join Now
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useClassRing() {
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();

  const [ringInfo,    setRingInfo]    = useState<RingInfo | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(60);

  const audioCtxRef  = useRef<AudioContext | null>(null);
  const stopRingRef  = useRef<(() => void) | null>(null);
  const seenRingsRef = useRef<Set<string>>(new Set());
  const countdownRef = useRef<any>(null);
  const dismissTimer = useRef<any>(null);

  const isStudent = user && !hasRole("admin") && !hasRole("teacher");

  const dismiss = useCallback(() => {
    stopRingRef.current?.();
    stopRingRef.current = null;
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    setRingInfo(null);
    setSecondsLeft(60);
  }, []);

  const triggerRing = useCallback((info: RingInfo) => {
    if (!isStudent) return;
    if (seenRingsRef.current.has(info.ring_id)) return;
    seenRingsRef.current.add(info.ring_id);

    // Start audio
    try {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      stopRingRef.current = playRingTone(audioCtxRef.current);
    } catch {}

    setRingInfo(info);
    setSecondsLeft(60);

    // Countdown
    countdownRef.current = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) { dismiss(); return 60; }
        return s - 1;
      });
    }, 1000);

    // Auto-dismiss after 60s
    dismissTimer.current = setTimeout(dismiss, 60_000);
  }, [isStudent, dismiss]);

  // ── Listen: Service Worker postMessage ────────────────────────────────────
  useEffect(() => {
    if (!isStudent || !("serviceWorker" in navigator)) return;

    const handler = (event: MessageEvent) => {
      if (event.data?.type !== "CLASS_RING") return;
      triggerRing({
        class_id:     event.data.class_id,
        class_title:  event.data.class_title,
        teacher_name: event.data.teacher_name,
        join_url:     event.data.join_url,
        ring_id:      event.data.ring_id || `sw-${Date.now()}`,
      });
    };

    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, [isStudent, triggerRing]);

  // ── Listen: Supabase Realtime — live_sessions going live ─────────────────
  //
  // FIX (background-eviction): this channel used to stay open on every page,
  // for the whole session, all the time — an always-on WebSocket connection
  // that made mobile Chrome/Safari far more aggressive about killing the tab
  // the instant it was backgrounded (even for a few seconds), since browsers
  // specifically target tabs holding live network connections for reclaiming
  // memory. Push notifications (usePushNotifications/sw.js) already deliver
  // the ring while we're backgrounded or the tab is dead — so the realtime
  // channel here only needs to exist while the tab is actually visible in the
  // foreground. We tear it down on hidden and rebuild it on visible.
  useEffect(() => {
    if (!isStudent || !user) return;

    const channelRef: { current: ReturnType<typeof supabase.channel> | null } = { current: null };

    const handleLiveSession = async (payload: any) => {
      const session = payload.new;
      if (session?.status !== "live") return;
      if (payload.old?.status === "live") return; // already live

      // Get subject info
      const { data: subject } = await supabase
        .from("subjects")
        .select("title, title_ar, levels, level, teacher_id")
        .eq("id", session.subject_id)
        .maybeSingle();

      // Check this student should see this class
      const { data: profile } = await supabase
        .from("profiles")
        .select("level, student_type")
        .eq("user_id", user.id)
        .maybeSingle();

      const subjectLevels: string[] = (subject as any)?.levels ||
        ((subject as any)?.level ? [(subject as any).level] : []);
      const studentLevel = (profile as any)?.level;

      // Level filter
      if (subjectLevels.length > 0 && studentLevel && !subjectLevels.includes(studentLevel)) {
        return; // this class isn't for this student's level
      }

      // Get teacher name
      let teacherName = "Your teacher";
      if ((subject as any)?.teacher_id) {
        const { data: tp } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("user_id", (subject as any).teacher_id)
          .maybeSingle();
        teacherName = (tp as any)?.full_name || teacherName;
      }

      triggerRing({
        class_id:     session.id,
        class_title:  (subject as any)?.title || "Class",
        teacher_name: teacherName,
        join_url:     `/student/live-classes?subject=${session.subject_id}`,
        ring_id:      `realtime-${session.id}`,
      });
    };

    const subscribe = () => {
      if (channelRef.current) return; // already subscribed
      channelRef.current = supabase
        .channel("live-class-ring")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "live_sessions" },
          handleLiveSession
        )
        .subscribe();
    };

    const unsubscribe = () => {
      if (!channelRef.current) return;
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    };

    // Catch up on anything that went live while we were unsubscribed —
    // push notifications already alerted the user, this just avoids
    // completely missing the in-app overlay for a session that's still live.
    const catchUp = async () => {
      const { data } = await supabase
        .from("live_sessions")
        .select("id, subject_id, status, started_at")
        .eq("status", "live")
        .order("started_at", { ascending: false })
        .limit(1);
      const session = data?.[0];
      if (session) await handleLiveSession({ new: session, old: { status: "scheduled" } });
    };

    if (document.visibilityState === "visible") subscribe();

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        subscribe();
        catchUp();
      } else {
        unsubscribe();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      unsubscribe();
    };
  }, [isStudent, user, triggerRing]);

  const handleJoin = () => {
    if (!ringInfo) return;
    dismiss();
    const url = ringInfo.join_url;
    if (url.startsWith("http")) {
      window.open(url, "_blank", "noopener");
    } else {
      navigate(url);
    }
  };

  const ringOverlay = ringInfo ? (
    <RingOverlay
      info={ringInfo}
      onJoin={handleJoin}
      onDismiss={dismiss}
      secondsLeft={secondsLeft}
    />
  ) : null;

  return { ringOverlay, isRinging: !!ringInfo };
}
