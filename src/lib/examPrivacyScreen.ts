/*  src/lib/examPrivacyScreen.ts
    Native screenshot / screen-recording block for the mobile app.

    Browsers give JS no way to block the OS-level screenshot gesture, so
    on the web build this is a no-op — the tab-switch lockdown and the
    print-screen deterrent in ProctoringOverlay are the best available
    web-side mitigations. On the Capacitor (Android/iOS) app, this sets
    FLAG_SECURE on Android (screenshots come back solid black, exam
    content never appears in Recents) and hides the WebView behind a
    cover in the iOS app switcher / on screenshot.

    Call enableExamPrivacyScreen() when an attempt starts and
    disableExamPrivacyScreen() when it ends/unmounts — don't leave it on
    app-wide, since it would also block screenshots on non-exam screens.
*/
import { Capacitor } from "@capacitor/core";

let cached: any = null;
async function getPlugin() {
  if (!Capacitor.isNativePlatform()) return null;
  if (cached) return cached;
  try {
    const mod = await import("@capacitor/privacy-screen");
    cached = mod.PrivacyScreen;
    return cached;
  } catch {
    return null;
  }
}

export async function enableExamPrivacyScreen() {
  const plugin = await getPlugin();
  try { await plugin?.enable(); } catch { /* not fatal — web/unsupported */ }
}

export async function disableExamPrivacyScreen() {
  const plugin = await getPlugin();
  try { await plugin?.disable(); } catch { /* not fatal */ }
}
