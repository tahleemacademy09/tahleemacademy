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

initNativeApp();

// ── PWA Service Worker Registration ──────────────────────────────────────────
if ("serviceWorker" in navigator) {
  let pendingSwUpdate = false;

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && pendingSwUpdate) {
      pendingSwUpdate = false;
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
              newWorker.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });
      })
      .catch((err) => console.warn("[Tahleem SW] Registration failed:", err));

    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      if (document.visibilityState === "visible") {
        window.location.replace(window.location.href);
      } else {
        pendingSwUpdate = true;
        refreshing = false;
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
