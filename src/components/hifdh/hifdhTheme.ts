// src/components/hifdh/hifdhTheme.ts
// Shared constants for all Hifdh components — prevents bundler TDZ collisions
// when multiple files defining the same const name get merged into one chunk.

// ── Colours ──────────────────────────────────────────────────────────────────
export const G           = "#1a3d24";
export const GM          = "#276749";
export const GOLD        = "#b7791f";
export const GOLD_LIGHT  = "#e8c97a";
export const GOLD_L      = "#fef9ee";  // alias used by HifdhMemorization
export const DG          = "#0f2d1f";
export const DG2         = "#1a4030";
export const LIGHT       = "#f0fff4";
export const BORDER      = "#d4e8d4";
export const PARCHMENT   = "#fffdf6";
export const PARCH       = "#faf6ec";
export const PARCH2      = "#f9f2dc";
export const INK         = "#1a1007";

// ── Scoring thresholds ────────────────────────────────────────────────────────
export const PASS_SCORE    = 70;
export const EXERCISE_PASS = 65;

// ── Arabic numeral helper ─────────────────────────────────────────────────────
export const toAr = (n: number): string =>
  String(n).replace(/[0-9]/g, d => "٠١٢٣٤٥٦٧٨٩"[+d]);

// ── Time formatter (mm:ss) ────────────────────────────────────────────────────
export const fmtTime = (s: number): string =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
