import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { Landmark } from "@/lib/ramadanStory";

/* ════════════════════════════════════════════════════════════════════════════════
   JourneyArt — everything drawn (no image files): landmark glyphs, the illustrated
   scene header of a story, the typewriter text and the confetti burst.
   Shared by RamadanJourney (the map) and StoryReader (the day's story).
   ════════════════════════════════════════════════════════════════════════════════ */

export const GOLD = "#fbbf24", GOLD_D = "#b45309", GREEN = "#10b981", GREEN_D = "#064e3b", NIGHT = "#071a33";
export const buzz = (ms = 12) => { try { navigator.vibrate?.(ms); } catch { /* not supported */ } };

/* ── landmark glyphs: one tiny drawing per place on the road (48×48, drawn with currentColor) ── */
export function Glyph({ kind, size = 28, className, style }: { kind: Landmark; size?: number; className?: string; style?: React.CSSProperties }) {
  const S = { stroke: "currentColor", fill: "none", strokeWidth: 4.5, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  const dark = { fill: "#000", opacity: 0.28 } as const;
  let g: React.ReactNode;
  switch (kind) {
    case "crescent": g = <path d="M31 7a17 17 0 1 0 10 30A14 14 0 0 1 31 7z" fill="currentColor" />; break;
    case "moon": g = <><circle cx="24" cy="24" r="15" fill="currentColor" /><circle cx="19" cy="19" r="3.2" {...dark} /><circle cx="30" cy="28" r="4.2" {...dark} /><circle cx="22" cy="31" r="2" {...dark} /></>; break;
    case "star": g = <polygon points="24,4 28.5,17.5 42,13 33,24 42,35 28.5,30.5 24,44 19.5,30.5 6,35 15,24 6,13 19.5,17.5" fill="currentColor" />; break;
    case "fire": g = <><path d="M24 4c1 9 12 13 12 25a12 12 0 0 1-24 0c0-6 3-9 6-13 0 4 2 6 4 7-2-6-1-13 2-19z" fill="currentColor" /><path d="M24 44a6 6 0 0 1-6-6c0-4 4-6 6-10 2 4 6 6 6 10a6 6 0 0 1-6 6z" {...dark} /></>; break;
    case "path": g = <><path d="M9 44c11-6 27-8 22-18S14 19 28 6" {...S} /><path d="M9 44c11-6 27-8 22-18S14 19 28 6" stroke="#000" opacity=".25" fill="none" strokeWidth="1.6" strokeDasharray="1 5" strokeLinecap="round" /></>; break;
    case "well": g = <><path d="M9 24h30v18H9z" fill="currentColor" /><path d="M13 24V12m22 12V12" {...S} /><path d="M7 13l17-8 17 8z" fill="currentColor" /><path d="M24 14v10" stroke="#000" opacity=".3" strokeWidth="2.5" /></>; break;
    case "palm": g = <><path d="M24 44c0-11 1-19 4-27" {...S} /><path d="M28 17c-4-9-13-9-19-4 8-1 13 1 19 4zM28 17c1-9 9-13 15-10-7 0-11 4-15 10zM28 17c7-3 12 1 13 8-5-4-9-6-13-8z" fill="currentColor" /></>; break;
    case "bridge": g = <><path d="M3 30h42" {...S} /><path d="M8 30a16 14 0 0 1 32 0" {...S} /><path d="M3 40h42" {...S} /></>; break;
    case "market": g = <><path d="M5 19l5-12h28l5 12z" fill="currentColor" /><path d="M10 19v23h28V19" {...S} strokeWidth={3.5} /><path d="M20 42V30h8v12" {...dark} /></>; break;
    case "lantern": g = <><path d="M24 3v6M17 9h14" {...S} strokeWidth={3} /><path d="M16 12h16l4 9v14l-4 6H16l-4-6V21z" fill="currentColor" /><ellipse cx="24" cy="28" rx="5" ry="8" fill="#fff" opacity=".4" /><path d="M18 44h12" {...S} strokeWidth={3} /></>; break;
    case "hill": g = <path d="M2 42L18 13l9 14 6-8 13 23z" fill="currentColor" />; break;
    case "gate": g = <><path d="M6 44V22a18 18 0 0 1 36 0v22z" fill="currentColor" /><path d="M16 44V28a8 8 0 0 1 16 0v16z" {...dark} /><path d="M24 2v6" {...S} strokeWidth={3} /></>; break;
    case "stone": g = <><path d="M6 40l5-17 13-9 15 7 4 19z" fill="currentColor" /><path d="M11 23l13 3 15-5M24 26l-2 14" stroke="#000" opacity=".25" strokeWidth="2" fill="none" /></>; break;
    case "water": g = <><path d="M4 16q5-6 10 0t10 0 10 0 10 0" {...S} /><path d="M4 26q5-6 10 0t10 0 10 0 10 0" {...S} /><path d="M4 36q5-6 10 0t10 0 10 0 10 0" {...S} /></>; break;
    case "tent": g = <><path d="M24 5L3 43h42z" fill="currentColor" /><path d="M24 21l-8 22h16z" {...dark} /></>; break;
    case "wind": g = <><path d="M5 17h24a6 6 0 1 0-6-6" {...S} /><path d="M5 27h33a6 6 0 1 1-6 6" {...S} /><path d="M5 37h13" {...S} /></>; break;
    case "garden": g = <><g fill="currentColor"><circle cx="24" cy="9" r="6" /><circle cx="14" cy="17" r="6" /><circle cx="34" cy="17" r="6" /><circle cx="24" cy="24" r="6" /></g><circle cx="24" cy="16.5" r="4" {...dark} /><path d="M24 26v18M24 36c-6 0-9-3-10-7M24 38c6 0 9-3 10-7" {...S} strokeWidth={3} /></>; break;
    case "cave": g = <><path d="M2 44C4 21 13 8 24 8s20 13 22 36z" fill="currentColor" /><path d="M14 44c0-10 4-17 10-17s10 7 10 17z" fill="#000" opacity=".4" /></>; break;
    case "tower": g = <><path d="M20 44V17h8v27z" fill="currentColor" /><path d="M17 17h14l-7-11z" fill="currentColor" /><path d="M15 26h18" {...S} strokeWidth={3.5} /><circle cx="24" cy="3.5" r="2" fill="currentColor" /></>; break;
    case "caravan": g = <><path d="M3 41h42" {...S} strokeWidth={3} /><circle cx="11" cy="27" r="4" fill="currentColor" /><circle cx="24" cy="22" r="5" fill="currentColor" /><circle cx="37" cy="27" r="4" fill="currentColor" /><path d="M6 41v-9h10v9zM18 41V30h12v11zM32 41v-9h10v9z" fill="currentColor" /></>; break;
    default: g = <circle cx="24" cy="24" r="12" fill="currentColor" />;
  }
  return <svg width={size} height={size} viewBox="0 0 48 48" className={className} style={style} aria-hidden>{g}</svg>;
}

/* ── the illustrated header of a story scene: sky of the chapter, dunes, the landmark and the traveller ── */
const SKY: Record<0 | 1 | 2, [string, string, string]> = {
  0: ["#1b1446", "#8a3a3a", "#e8932a"],      // dusk — the road begins as the sun goes down
  1: ["#08233f", "#0b4a52", "#1b7a63"],      // the valley, teal and misty
  2: ["#02081a", "#0b1e4a", "#2a2563"],      // the last ten nights, deep indigo
};
const SPARK = (() => { let s = 11; const r = () => (s = (s * 16807) % 2147483647) / 2147483647; return Array.from({ length: 34 }, () => ({ x: r() * 100, y: r() * 62, d: 1 + r() * 2, t: 2 + r() * 3 })); })();

export function SceneArt({ chapter, kind, height = 190, rounded = true }: { chapter: 0 | 1 | 2; kind: Landmark; height?: number; rounded?: boolean }) {
  const reduce = useReducedMotion();
  const [a, b, c] = SKY[chapter];
  const lit = chapter === 2;
  return (
    <div className="relative w-full overflow-hidden" style={{ height, borderRadius: rounded ? 24 : 0, background: `linear-gradient(180deg,${a} 0%,${b} 62%,${c} 100%)`, border: "1px solid rgba(255,255,255,.12)" }} aria-hidden>
      {SPARK.map((s, i) => (
        <span key={i} className="absolute rounded-full bg-white" style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.d, height: s.d, opacity: chapter === 0 ? 0.35 : 0.8, animation: reduce ? undefined : `rj-twinkle ${s.t}s ease-in-out ${(i % 6) * 0.3}s infinite`, ["--o" as any]: 0.8 }} />
      ))}
      {/* the landmark, glowing */}
      <motion.div className="absolute left-1/2 top-[26%] -translate-x-1/2"
        initial={reduce ? false : { scale: 0.6, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 140, damping: 14 }}>
        <div className="absolute inset-0 -m-6 rounded-full" style={{ background: "radial-gradient(circle,rgba(251,191,36,.45),transparent 68%)" }} />
        <Glyph kind={kind} size={78} style={{ color: "#fde68a", filter: "drop-shadow(0 0 14px rgba(251,191,36,.85))", position: "relative" }} />
      </motion.div>
      {/* dunes */}
      <svg className="absolute bottom-0 left-0 w-full" viewBox="0 0 360 90" preserveAspectRatio="none" style={{ height: "46%" }}>
        <path d="M0 52C60 26 110 30 170 50s120 14 190-12v52H0z" fill="#000" opacity=".28" />
        <path d="M0 70C70 46 140 60 210 66s100-6 150-22v46H0z" fill="#000" opacity=".5" />
      </svg>
      {/* the traveller with a lantern */}
      <svg className="absolute bottom-[10%] left-[12%]" width="44" height="64" viewBox="0 0 44 64">
        <circle cx="22" cy="12" r="8" fill="#0b1226" />
        <path d="M10 62c0-18 4-32 12-32s12 14 12 32z" fill="#0b1226" />
        <path d="M34 36l8-4" stroke="#0b1226" strokeWidth="3.5" strokeLinecap="round" />
        <circle cx="42" cy="34" r={lit ? 7 : 5} fill={GOLD} style={{ filter: "drop-shadow(0 0 8px rgba(251,191,36,1))" }} />
      </svg>
    </div>
  );
}

/* ── text that is "told" letter by letter — the story feel; tap the text to show it all ── */
export function Told({ text, speed = 15, instant = false }: { text: string; speed?: number; instant?: boolean }) {
  const reduce = useReducedMotion();
  const quick = reduce || instant;
  const [n, setN] = useState(quick ? text.length : 0);
  useEffect(() => {
    if (quick) { setN(text.length); return; }
    setN(0);
    const id = setInterval(() => setN((v) => { if (v >= text.length) { clearInterval(id); return v; } return v + 1; }), speed);
    return () => clearInterval(id);
  }, [text, speed, quick]);
  return <>{text.slice(0, n)}<span style={{ opacity: n < text.length ? 0.6 : 0 }}>▍</span></>;
}

/* ── a burst of sparkles — played when a day is completed ── */
export function Burst({ big = false }: { big?: boolean }) {
  const reduce = useReducedMotion();
  const parts = useMemo(() => Array.from({ length: big ? 46 : 26 }, (_, i) => {
    const a = (i / (big ? 46 : 26)) * Math.PI * 2 + (i % 3) * 0.3;
    const d = 90 + ((i * 37) % 120);
    return { x: Math.cos(a) * d, y: Math.sin(a) * d - 30, r: (i * 53) % 360, c: ["#fbbf24", "#34d399", "#fde68a", "#a7f3d0", "#fb7185"][i % 5], s: 6 + (i % 4) * 2 };
  }), [big]);
  if (reduce) return null;
  return (
    <div className="pointer-events-none absolute left-1/2 top-24 z-10" aria-hidden>
      {parts.map((p, i) => (
        <motion.span key={i} className="absolute block rounded-sm" style={{ width: p.s, height: p.s * 1.6, background: p.c }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0.6 }}
          animate={{ x: p.x, y: [0, p.y, p.y + 140], opacity: [1, 1, 0], rotate: p.r, scale: 1 }}
          transition={{ duration: 1.5, ease: "easeOut" }} />
      ))}
    </div>
  );
}
