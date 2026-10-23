/*
  src/components/musabaqah/BigCountdown.tsx
  ─────────────────────────────────────────────────────────────
  A large, millisecond-precision countdown used on the student
  Register page, student Waiting Room, and admin Event Detail —
  same component everywhere so the number always looks and
  behaves identically. Ticks every 30ms (smooth ms display
  without hammering the render loop) and fires onArrive exactly
  once the instant it reaches zero.
*/
import { useEffect, useRef, useState } from "react";
import { formatCountdownBig } from "@/lib/musabaqahTiming";

export default function BigCountdown({
  targetMs,
  onArrive,
  color = "#c9a84c",
  label,
}: {
  targetMs: number;
  onArrive?: () => void;
  color?: string;
  label?: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  const firedRef = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!firedRef.current && now >= targetMs) {
      firedRef.current = true;
      onArrive?.();
    }
  }, [now, targetMs, onArrive]);

  const remaining = targetMs - now;

  return (
    <div style={{ textAlign: "center" }}>
      {label && <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, margin: "0 0 6px" }}>{label}</p>}
      <p
        style={{
          color,
          fontWeight: 900,
          margin: 0,
          fontFamily: "monospace",
          fontSize: "clamp(28px, 8vw, 56px)",
          letterSpacing: 1,
          lineHeight: 1.1,
        }}
      >
        {formatCountdownBig(remaining)}
      </p>
    </div>
  );
}
