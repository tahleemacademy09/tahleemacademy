// src/components/hifdh/SurahBanner.tsx
// The surah title banner, drawn like the one printed in the Madinah Mushaf: a long double-ruled cartouche with a
// scalloped rosette at each end, small stars beside the name, and the name ("سُورَةُ …") centred in it.
// Pure SVG (scales to any width), no images.
import type { CSSProperties } from "react";

const GOLD = "#b8913a";      // gold rules and scallops
const DEEP = "#1f6b57";      // deep green inner rules and rosette centres
const CREAM = "#fbf3d9";     // banner fill
const INK = "#2b2113";       // name

const VB_W = 600, VB_H = 84, CY = VB_H / 2;

/** n-pointed star centred on (cx, cy) */
function star(cx: number, cy: number, points: number, rOut: number, rIn: number) {
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? rOut : rIn;
    const a = (Math.PI * i) / points - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
}

/** the round ornament at each end of the banner */
function Rosette({ cx }: { cx: number }) {
  const scallops = Array.from({ length: 14 }, (_, i) => {
    const a = (Math.PI * 2 * i) / 14;
    return <circle key={i} cx={cx + 30 * Math.cos(a)} cy={CY + 30 * Math.sin(a)} r={6.2} fill={CREAM} stroke={GOLD} strokeWidth={1.6} />;
  });
  return (
    <g>
      {scallops}
      <circle cx={cx} cy={CY} r={30} fill={CREAM} stroke={GOLD} strokeWidth={1.6} />
      <circle cx={cx} cy={CY} r={25} fill="none" stroke={DEEP} strokeWidth={1} />
      <polygon points={star(cx, CY, 8, 21, 11)} fill={GOLD} stroke={DEEP} strokeWidth={0.8} strokeLinejoin="round" />
      <circle cx={cx} cy={CY} r={7.5} fill={CREAM} stroke={DEEP} strokeWidth={1} />
      <circle cx={cx} cy={CY} r={2.6} fill={DEEP} />
    </g>
  );
}

export default function SurahBanner({ name, style }: {
  /** surah name WITHOUT the word "سورة" (e.g. "الحديد") */
  name: string;
  style?: CSSProperties;
}) {
  const X1 = 58, X2 = VB_W - 58;          // frame ends (hidden behind the rosettes)
  return (
    <svg viewBox={`0 0 ${VB_W} ${VB_H}`} role="img" aria-label={`سورة ${name}`} preserveAspectRatio="xMidYMid meet"
      style={{ display: "block", width: "100%", height: "100%", ...style }}>
      {/* band */}
      <rect x={X1} y={17} width={X2 - X1} height={50} fill={CREAM} stroke={GOLD} strokeWidth={2.2} />
      <rect x={X1 + 6} y={22} width={X2 - X1 - 12} height={40} fill="none" stroke={DEEP} strokeWidth={1} />
      {/* fine gold dots along the top and bottom of the inner frame, like the printed border */}
      {Array.from({ length: 26 }, (_, i) => {
        const x = 96 + i * ((VB_W - 192) / 25);
        return (
          <g key={i}>
            <circle cx={x} cy={19.5} r={0.95} fill={GOLD} />
            <circle cx={x} cy={64.5} r={0.95} fill={GOLD} />
          </g>
        );
      })}
      {/* small stars beside the name */}
      <polygon points={star(128, CY, 8, 7.5, 3.6)} fill={GOLD} />
      <polygon points={star(VB_W - 128, CY, 8, 7.5, 3.6)} fill={GOLD} />
      <line x1={142} y1={CY} x2={168} y2={CY} stroke={GOLD} strokeWidth={1} />
      <line x1={VB_W - 168} y1={CY} x2={VB_W - 142} y2={CY} stroke={GOLD} strokeWidth={1} />
      {/* end rosettes */}
      <Rosette cx={44} />
      <Rosette cx={VB_W - 44} />
      {/* the name */}
      <text x={VB_W / 2} y={CY + 1} textAnchor="middle" dominantBaseline="central" direction="rtl"
        style={{ fontFamily: "'Amiri Quran','Amiri','Noto Naskh Arabic',serif", fontSize: 34, fill: INK }}>
        سُورَةُ {name}
      </text>
    </svg>
  );
}
