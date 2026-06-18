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
// the user was doing (login, a live class, an exam — no awareness either
// way). Now: a genuine update (new worker installed while one already
// controls this page) is surfaced as a dismissable "update available" event
// for the UI to show; nothing is applied until the user asks for it, or —
// as a convenience — the tab is hidden while it's safe to do so. Even then,
// the actual reload is gated on isReloadSafe() so it can never land mid-class
// or mid-exam.
if ("serviceWorker" in navigator) {
  let waitingWorker: ServiceWorker | null = null;
  let userRequestedUpdate = false;
  let pendingReload = false;

  function applyUpdate() {
    if (!waitingWorker) return;
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
  }

  // If the user (or the idle-and-safe path below) has asked for the update
  // but it wasn't safe at the time, apply it the moment all locks clear.
  onReloadSafe(() => {
    if (userRequestedUpdate && waitingWorker) applyUpdate();
    if (pendingReload && document.visibilityState === "visible") {
      pendingReload = false;
      window.location.replace(window.location.href);
    }
  });

  // Public hook for the UpdateAvailableBanner component.
  window.addEventListener("ta:apply-update", () => {
    userRequestedUpdate = true;
    if (isReloadSafe()) applyUpdate();
    // else: deferred — onReloadSafe above will apply it once safe, and the
    // banner can reflect "will update once you're done" in the meantime.
  });

  document.addEventListener("visibilitychange", () => {
    // Opportunistic: if the tab is hidden, there's an update waiting, and
    // nothing sensitive is in progress, go ahead and apply it quietly so
    // it's ready next time the tab is opened — still gated on isReloadSafe().
    if (document.visibilityState === "hidden" && waitingWorker && isReloadSafe()) {
      applyUpdate();
    }
    if (document.visibilityState === "visible" && pendingReload && isReloadSafe()) {
      pendingReload = false;
      window.location.replace(window.location.href);
    }
  });

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
      if (document.visibilityState === "visible" && isReloadSafe()) {
        window.location.replace(window.location.href);
      } else {
        // Tab is hidden, or something sensitive is in progress — reload once
        // it's both visible and safe (handled by the listeners above).
        pendingReload = true;
      }
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
