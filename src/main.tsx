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

// ── PWA Service Worker Registration ──────────────────────────────────────────
// Registers /sw.js which handles:
//   • Offline caching (app shell + visited pages)
//   • Push notifications (class reminders)
//   • Foreground notifications (via postMessage)
if ("serviceWorker" in navigator) {
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

    // Reload page when a new SW takes control (to load fresh assets)
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  });
}

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);
