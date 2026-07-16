// src/lib/theme.ts
// Shared dark-mode bootstrap. Previously this logic lived only inside
// student/ProfileSettings.tsx (and duplicated inline in TeacherSettings.tsx),
// which meant dark mode only ever applied once a user had visited Settings in
// that session — every other page, and a fresh app launch on any other route,
// stayed light-mode even if the preference was saved. Calling bootstrapTheme()
// from main.tsx fixes that by applying the persisted preference on first
// paint, on every page.

export const DM_KEY = "tahleem_dark_mode";

export function applyDark(enabled: boolean) {
  // index.css defines dark-mode CSS variables under a `.dark` class selector
  // (Tailwind/shadcn convention). We also set `data-theme` for any custom CSS
  // keyed off it.
  if (enabled) {
    document.documentElement.classList.add("dark");
    document.documentElement.setAttribute("data-theme", "dark");
    document.documentElement.style.colorScheme = "dark";
  } else {
    document.documentElement.classList.remove("dark");
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.style.colorScheme = "light";
  }
}

export function isDarkModeEnabled(): boolean {
  return localStorage.getItem(DM_KEY) === "true";
}

export function bootstrapTheme() {
  applyDark(isDarkModeEnabled());
}
