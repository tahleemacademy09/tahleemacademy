// src/components/hifdh/hifdhTokens.ts
// Single source of truth for all colour/design tokens used across the
// Al-Hifdh module (HifdhPage, HifdhDashboard, HifdhRevision / QuranRevisionHub,
// HifdhTest, HifdhMemorization).
//
// WHY THIS FILE EXISTS
// --------------------
// Rollup bundles all five of those files into one chunk (because HifdhPage
// imports them all directly). Each file previously declared its own
//   const G = "...", const GOLD = "...", const GM = "..."
// at module level. When Rollup scope-hoists them together it renames
// duplicates to short names (le, ne, re …) and the initialization ORDER
// isn't guaranteed — causing "Cannot access 'le' before initialization"
// (TDZ crash) in the production bundle.
// Centralising here gives Rollup exactly ONE declaration of each name,
// eliminating the collision entirely.

// ── Primary greens ──────────────────────────────────────────────────
export const H_G   = "#1a3d24";   // dark green  (was G / DG)
export const H_GM  = "#276749";   // mid green   (was GM / DG2)
export const H_GM2 = "#0f2d1f";   // deep green  (was DG in Revision)

// ── Golds ───────────────────────────────────────────────────────────
export const H_GOLD   = "#b7791f";   // primary gold (Dashboard / Memorization / Test)
export const H_GOLD2  = "#c9a84c";   // recitation gold (Revision)
export const H_GOLD_L = "#e8c97a";   // light gold
export const H_GOLD_L2= "#fef9ee";   // very light gold (Memorization bg)
export const H_GOLD_L3= "#e8c96b";   // Dashboard accent

// ── Neutrals / parchment ────────────────────────────────────────────
export const H_INK      = "#1a1007";   // Revision ink (dark brown)
export const H_INK2     = "#1a3d24";   // Dashboard ink (dark green)
export const H_PARCHMENT= "#fffdf6";   // Revision page bg
export const H_PARCH2   = "#f9f2dc";   // Revision secondary parchment
export const H_PARCH3   = "#faf6ec";   // Memorization parchment
export const H_PARCH4   = "#f3ead8";   // Memorization secondary
export const H_LIGHT    = "#f0fff4";   // Test / Memorization light green bg
export const H_BORDER   = "#d4e8d4";   // Test / Memorization border
