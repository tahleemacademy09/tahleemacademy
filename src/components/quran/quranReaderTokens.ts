// src/components/quran/quranReaderTokens.ts
// Single source of truth for colours used across the Al-Qur'an reader
// (QuranPage + its sub-components) and the admin recitation-recording tool.
// Centralised for the same Rollup scope-hoisting reason documented in
// hifdhTokens.ts — avoid duplicate module-level const names colliding.

export const Q_GREEN      = "#0f2d1f";   // deep green (headers, active state)
export const Q_GREEN_MID  = "#1a3d24";   // mid green
export const Q_GOLD       = "#C9A84C";   // primary gold accent
export const Q_GOLD_DARK  = "#b7911f";   // pressed / active gold
export const Q_PARCHMENT  = "#fffdf6";   // page background (mushaf paper)
export const Q_PARCH_ALT  = "#f9f2dc";   // verse row alternate / active bg
export const Q_INK        = "#1a1007";   // Arabic ink colour
export const Q_BORDER     = "#e8dcb8";   // hairline borders on parchment
export const Q_MUTED      = "#8a7a52";   // secondary text on parchment

// "Amiri Quran" specifically reproduces the bold Madinah-mushaf letterforms
// (the look in the physical Mushaf reference image), unlike plain "Amiri"
// which is a lighter general-purpose Arabic text face. It must come first.
export const Q_ARABIC_FONT = "'Amiri Quran', 'Amiri', 'Scheherazade New', serif";
