// ── Polyfill: crypto.randomUUID() ────────────────────────────────────────
if (typeof crypto !== "undefined" && !crypto.randomUUID) {
  (crypto as any).randomUUID = function(): string {
    return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c: any) =>
      (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)
    ) as `${string}-${string}-${string}-${string}-${string}`;
  };
}

import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";
import { initNativeApp } from "./lib/nativeApp";
import { isReloadSafe, onReloadSafe } from "./lib/reloadGuard";

initNativeApp();

// ── PWA Service Worker Registration ──────────────────────────────────────────
//
// v6 change: this used to auto-postMessage SKIP_WAITING the instant a new
// worker reached "installed", which forced an immediate reload of whatever
// the user was doing (login, a live class, an exam). Now: a genuine update
// (new worker installed while one already controls this page) just dispatches
// "ta:update-available" for the UI to show a banner. NOTHING is ever applied
// automatically in the background or while the tab is hidden — an update is
// only ever applied (and the resulting reload only ever fires) at a moment
// the user is actually looking at the app AND nothing sensitive is locked.
// This is intentional: applying while hidden and reloading later on return
// is what caused the v6.0 regression (reload-on-resume on every page).
if ("serviceWorker" in navigator) {
  let waitingWorker: ServiceWorker | null = null;
  let updateRequested = false;
  let reloading = false;

  function tryApplyUpdate() {
    if (!updateRequested || !waitingWorker || reloading) return;
    if (!isReloadSafe()) return;                          // mid-class/mid-exam — wait
    if (document.visibilityState !== "visible") return;    // never touch anything while hidden
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
  }

  // Public hook for the UpdateAvailableBanner component.
  window.addEventListener("ta:apply-update", () => {
    updateRequested = true;
    tryApplyUpdate(); // applies now if already safe+visible; otherwise the listeners below retry
  });

  onReloadSafe(tryApplyUpdate);
  document.addEventListener("visibilitychange", tryApplyUpdate);

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        registration.update();
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              // A real update (page is already controlled by a previous SW) —
              // do NOT auto-skip-waiting. Just let the rest of the app know.
              waitingWorker = newWorker;
              window.dispatchEvent(new Event("ta:update-available"));
            }
            // If there's no existing controller, this is a first install —
            // the browser activates it on its own; nothing for us to do.
          });
        });
      })
      .catch((err) => console.warn("[Tahleem SW] Registration failed:", err));

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading) return;
      reloading = true;
      // This can only fire as a direct result of tryApplyUpdate() above, which
      // is itself gated on visible+safe — so reloading immediately here is
      // always the expected, already-consented-to outcome, never a surprise.
      window.location.replace(window.location.href);
    });
  });
}

// ── Mount React ───────────────────────────────────────────────────────────────
const root = createRoot(document.getElementById("root")!);
root.render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);

// ── Signal splash screen to dismiss ──────────────────────────────────────────
// Dispatched after React renders so index.html knows to fade out the splash.
// requestIdleCallback (or rAF fallback) ensures the first React paint has
// actually flushed to screen before we fade — avoids a flash of unstyled content.
const dismissSplash = () => {
  window.dispatchEvent(new Event("ta-app-ready"));
};
if ("requestIdleCallback" in window) {
  requestIdleCallback(dismissSplash, { timeout: 1500 });
} else {
  requestAnimationFrame(() => requestAnimationFrame(dismissSplash));
}
