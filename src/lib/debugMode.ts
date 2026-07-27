// src/lib/debugMode.ts
//
// Shared "developer testing" switch. Turn it on with either:
//   • ?ta_debug=1 in the URL (works for one visit / one tab)
//   • localStorage.setItem('ta_debug', '1') in the console (persists across visits)
//
// What it does when ON:
//   1. ErrorBoundary shows the real crash + stack trace instead of
//      silently auto-reloading once.
//   2. main.tsx's PWA auto-update logic is skipped entirely — a newly
//      deployed version will NOT force a reload of your tab when you
//      minimize/return. You'll still see the "update available" banner
//      if one exists, so you can apply it manually whenever you want.
//
// This only affects YOUR tab/session (it's read from the URL/localStorage,
// nothing server-side) — real students/teachers/admins who never set this
// keep getting the normal, safe, automatic update behavior.
export function isDebugMode(): boolean {
  try {
    if (new URLSearchParams(window.location.search).get("ta_debug") === "1") return true;
  } catch {
    /* ignore */
  }
  try {
    return localStorage.getItem("ta_debug") === "1";
  } catch {
    return false;
  }
}
