// ── Polyfill: crypto.randomUUID() ────────────────────────────────────────
// Not available on iOS < 15.4. Used in file upload paths throughout the app.
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

// Native (Capacitor) bootstrap — no-op on web
initNativeApp();

// ── PWA Service Worker Registration ──────────────────────────────────────────
// Registers /sw.js which handles:
//   • Offline caching (app shell + visited pages)
//   • Push notifications (class reminders)
//   • Foreground notifications (via postMessage)
if ("serviceWorker" in navigator) {
  // ── CRITICAL: track whether the page was hidden when a new SW activated.
  // If controllerchange fires while the page is hidden (i.e. user minimised),
  // we must NOT reload — the user would see a jarring refresh when returning.
  // Instead we navigate on the next visibility resume so the new assets are
  // picked up without destroying in-progress UI state.
  let pendingSwUpdate = false;

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && pendingSwUpdate) {
      pendingSwUpdate = false;
      // Soft navigate to current path — replaces the history entry so the
      // back button isn't polluted, and forces React Router to re-render
      // with fresh assets already in cache.
      window.location.replace(window.location.href);
    }
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        console.log("[Tahleem SW] Registered, scope:", registration.scope);

        // Check for updates every time the app loads
        registration.update();

        // When a new SW version is waiting, activate it immediately
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              // Tell the new SW to skip waiting and take over
              newWorker.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });
      })
      .catch((err) => {
        console.warn("[Tahleem SW] Registration failed:", err);
      });

    // ── FIXED: old code did window.location.reload() unconditionally here.
    // That fired whenever ANY SW took control — including the very first
    // activation on app install, and on every minimize→resume cycle where
    // the browser re-evaluated the SW. Result: constant refreshes.
    //
    // New behaviour:
    //   • If page is visible → reload immediately (deploy update scenario)
    //   • If page is hidden  → defer until the user comes back (minimize scenario)
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;

      if (document.visibilityState === "visible") {
        // User is looking at the app — safe to reload for the new SW
        window.location.replace(window.location.href);
      } else {
        // Page is backgrounded — queue the update for next resume
        pendingSwUpdate = true;
        // Reset the guard so a future controllerchange can queue again
        refreshing = false;
      }
    });
  });
}

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);
