// src/components/hifdh/SurahBanner.tsx
// The surah title banner: a long illuminated strip like the ones printed in Qur'an copies — purple end panels full of
// yellow vines, green leaves and red / white flowers, and a pale-green pointed cartouche in the middle that holds
// the name ("سُورَةُ …"). Pure SVG (sharp at any width / screen density), no images.
import type { CSSProperties } from "react";

const PURPLE = "#3a2a8c", PURPLE2 = "#4d2a8a", BLUE = "#2b5db0";
const GREEN = "#2f9a3e", GREEN2 = "#1f7a33";
const YELLOW = "#f2c318", RED = "#d9332b", WHITE = "#ffffff";
const EDGE = "#e0603a";          // orange-red outline
const FILL = "#e7f3de";          // cartouche
const INK = "#1c2a1a";           // name

const VB_W = 600, VB_H = 100, CY = 50;

/** four-petal flower: white petals, red heart, yellow dot */
function Flower({ x, y, s = 1, petal = WHITE, heart = RED }: { x: number; y: number; s?: number; petal?: string; heart?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {[0, 90, 180, 270].map((a) => (
        <ellipse key={a} cx={0} cy={-5.2} rx={2.7} ry={4.6} fill={petal} stroke={GREEN2} strokeWidth={0.5} transform={`rotate(${a})`} />
      ))}
      <circle r={2.6} fill={heart} />
      <circle r={1} fill={YELLOW} />
    </g>
  );
}

function Leaf({ x, y, r, s = 1, c = GREEN }: { x: number; y: number; r: number; s?: number; c?: string }) {
  return <ellipse cx={0} cy={0} rx={8 * s} ry={3.4 * s} fill={c} transform={`translate(${x} ${y}) rotate(${r})`} />;
}

/** one curling vine with two leaves and a bud — the repeating motif of the end panels */
function Scroll({ x, y, s = 1, fx = 1, fy = 1 }: { x: number; y: number; s?: number; fx?: number; fy?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s * fx} ${s * fy})`}>
      <path d="M0,0 C12,-20 38,-20 42,-4 C45,9 31,15 25,7 C21,1 27,-4 32,-1" fill="none" stroke={YELLOW} strokeWidth={2.2} strokeLinecap="round" />
      <Leaf x={13} y={-14} r={-35} />
      <Leaf x={31} y={-15} r={25} c={GREEN2} />
      <circle cx={32} cy={-1} r={2.6} fill={RED} />
      <circle cx={24} cy={9} r={1.8} fill={YELLOW} />
    </g>
  );
}

/** the whole end panel, drawn for the LEFT end (the right end is its mirror image) */
function Panel() {
  return (
    <svg x={0} y={8} width={170} height={84} viewBox="0 8 170 84" overflow="hidden">   {/* a nested svg clips its drawing to the strip */}
      <rect x={0} y={8} width={170} height={84} fill={PURPLE} />
      <circle cx={30} cy={20} r={26} fill={BLUE} opacity={0.35} />
      <circle cx={34} cy={84} r={24} fill={PURPLE2} opacity={0.7} />
      <circle cx={112} cy={50} r={30} fill={BLUE} opacity={0.25} />
      {/* vines */}
      <Scroll x={8} y={52} />
      <Scroll x={8} y={48} fy={-1} />
      <Scroll x={62} y={30} fx={1} fy={-1} s={0.9} />
      <Scroll x={62} y={70} s={0.9} />
      <Scroll x={104} y={50} s={0.95} fy={-1} />
      <Scroll x={104} y={50} s={0.95} />
      {/* leaves between the vines */}
      <Leaf x={48} y={50} r={0} s={1.1} />
      <Leaf x={86} y={20} r={-20} />
      <Leaf x={86} y={80} r={20} />
      <Leaf x={20} y={16} r={20} s={0.9} c={GREEN2} />
      <Leaf x={20} y={84} r={-20} s={0.9} c={GREEN2} />
      {/* flowers */}
      <Flower x={28} y={50} s={1.35} />
      <Flower x={76} y={50} s={1} petal={YELLOW} heart={RED} />
      <Flower x={52} y={20} s={0.8} />
      <Flower x={52} y={80} s={0.8} />
      <Flower x={128} y={24} s={0.8} petal={YELLOW} />
      <Flower x={128} y={76} s={0.8} petal={YELLOW} />
      <Flower x={12} y={20} s={0.65} petal={YELLOW} />
      <Flower x={12} y={80} s={0.65} petal={YELLOW} />
    </svg>
  );
}

/** the pointed cartouche: flat top / bottom, pointed ogee ends */
const CARTOUCHE =
  "M190,17 L410,17 C428,17 436,27 446,35 C454,41 462,45 470,50 C462,55 454,59 446,65 C436,73 428,83 410,83 L190,83 " +
  "C172,83 164,73 154,65 C146,59 138,55 130,50 C138,45 146,41 154,35 C164,27 172,17 190,17 Z";

export default function SurahBanner({ name, style }: {
  /** surah name WITHOUT the word "سورة" (e.g. "الحديد") */
  name: string;
  style?: CSSProperties;
}) {
  const fs = name.length > 12 ? 24 : name.length > 8 ? 29 : 33;
  return (
    <svg viewBox={`0 0 ${VB_W} ${VB_H}`} role="img" aria-label={`سورة ${name}`} preserveAspectRatio="xMidYMid meet"
      style={{ display: "block", width: "100%", height: "100%", ...style }}>
      <rect x={0} y={8} width={VB_W} height={84} fill={FILL} />
      <Panel />
      <g transform={`translate(${VB_W} 0) scale(-1 1)`}><Panel /></g>
      {/* strip outline */}
      <rect x={1.5} y={9.5} width={VB_W - 3} height={81} fill="none" stroke={EDGE} strokeWidth={3} />
      {/* cartouche with its double outline */}
      <path d={CARTOUCHE} fill={FILL} stroke={EDGE} strokeWidth={3.4} strokeLinejoin="round" />
      <path d={CARTOUCHE} fill="none" stroke={EDGE} strokeWidth={1}
        transform={`translate(${VB_W / 2} ${CY}) scale(0.94 0.86) translate(${-VB_W / 2} ${-CY})`} />
      {/* the name */}
      <text x={VB_W / 2} y={CY + 1} textAnchor="middle" dominantBaseline="central" direction="rtl"
        style={{ fontFamily: "'Amiri Quran','Amiri','Noto Naskh Arabic',serif", fontSize: fs, fill: INK }}>
        سُورَةُ {name}
      </text>
    </svg>
  );
}
