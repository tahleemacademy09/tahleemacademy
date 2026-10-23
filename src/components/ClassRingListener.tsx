import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

type Ring = {
  id: string;
  title: string;
  title_ar: string | null;
  message: string | null;
  link: string | null;
};

const RING_MAX_MS = 60_000;

/**
 * Mount once in the root layout (student + teacher shells).
 * Rings when a `class_ring` notification arrives (realtime), and also
 * catches one that landed in the last 2 minutes when the app is opened.
 */
export default function ClassRingListener() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const uid = user?.id;
  const [ring, setRing] = useState<Ring | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);
  const stopTimeoutRef = useRef<number | null>(null);

  const stopRinging = useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (stopTimeoutRef.current) window.clearTimeout(stopTimeoutRef.current);
    timerRef.current = null;
    stopTimeoutRef.current = null;
    try { navigator.vibrate?.(0); } catch {}
    setRing(null);
  }, []);

  const beep = useCallback(() => {
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!audioRef.current) audioRef.current = new Ctx();
      const ctx = audioRef.current!;
      if (ctx.state === "suspended") ctx.resume();
      [0, 0.25].forEach((offset) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "sine";
        o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
        g.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + offset + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.2);
        o.connect(g).connect(ctx.destination);
        o.start(ctx.currentTime + offset);
        o.stop(ctx.currentTime + offset + 0.22);
      });
      navigator.vibrate?.([200, 100, 200]);
    } catch {}
  }, []);

  const startRinging = useCallback(
    (r: Ring) => {
      setRing(r);
      beep();
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = window.setInterval(beep, 2000);
      if (stopTimeoutRef.current) window.clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = window.setTimeout(stopRinging, RING_MAX_MS);
    },
    [beep, stopRinging]
  );

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      if (!uid || cancelled) return;

      // Catch a ring that fired moments before the app was opened
      const since = new Date(Date.now() - 2 * 60_000).toISOString();
      const { data: recent } = await supabase
        .from("notifications")
        .select("id,title,title_ar,message,link")
        .eq("user_id", uid)
        .eq("type", "class_ring")
        .eq("is_read", false)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1);
      if (recent?.[0] && !cancelled) startRinging(recent[0] as Ring);

      channel = supabase
        .channel(`class-ring-${uid}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${uid}` },
          (payload) => {
            const n = payload.new as any;
            if (n?.type === "class_ring") startRinging(n as Ring);
          }
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
      stopRinging();
    };
  }, [uid, startRinging, stopRinging]);

  const join = async () => {
    if (!ring) return;
    const target = ring.link || "/student/live-classes";
    await supabase.from("notifications").update({ is_read: true }).eq("id", ring.id);
    stopRinging();
    navigate(target);
  };

  const dismiss = async () => {
    if (ring) await supabase.from("notifications").update({ is_read: true }).eq("id", ring.id);
    stopRinging();
  };

  if (!ring) return null;

  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      style={{
        position: "fixed", inset: 0, zIndex: 9999, display: "flex",
        alignItems: "center", justifyContent: "center",
        background: "rgba(40, 20, 70, 0.85)", padding: 16,
      }}
    >
      <div
        style={{
          width: "100%", maxWidth: 380, borderRadius: 20, padding: 24,
          textAlign: "center", background: "#fff", color: "#2b1850",
          boxShadow: "0 20px 60px rgba(0,0,0,.4)",
        }}
      >
        <div style={{ fontSize: 56, animation: "ring-shake .6s infinite" }}>🔔</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: "8px 0" }}>{ring.title}</h2>
        {ring.title_ar && <p dir="rtl" style={{ margin: "0 0 8px", opacity: 0.8 }}>{ring.title_ar}</p>}
        {ring.message && <p style={{ margin: "0 0 20px", opacity: 0.8 }}>{ring.message}</p>}
        <button
          onClick={join}
          style={{
            width: "100%", padding: "14px 0", borderRadius: 12, border: 0,
            fontSize: 18, fontWeight: 700, background: "#c9a227", color: "#2b1850", cursor: "pointer",
          }}
        >
          Join / انضمام
        </button>
        <button
          onClick={dismiss}
          style={{ marginTop: 10, background: "none", border: 0, color: "#6b5a8a", cursor: "pointer" }}
        >
          Not now
        </button>
      </div>
      <style>{`@keyframes ring-shake{0%,100%{transform:rotate(0)}25%{transform:rotate(-15deg)}75%{transform:rotate(15deg)}}`}</style>
    </div>
  );
}
