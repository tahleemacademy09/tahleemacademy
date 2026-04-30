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

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);
