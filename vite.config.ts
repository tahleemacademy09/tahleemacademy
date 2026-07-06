import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import type { Plugin } from "vite";

// ── iOS chunk-load recovery ───────────────────────────────────────────────────
function chunkLoadRecoveryPlugin(): Plugin {
  return {
    name: "chunk-load-recovery",
    transformIndexHtml(html) {
      const script = `
<script>
  function _chunkReload() {
    if (document.visibilityState !== 'visible') return;
    if (!sessionStorage.getItem('_chunkReload')) {
      sessionStorage.setItem('_chunkReload', '1');
      window.location.reload(true);
    }
  }
  window.addEventListener('error', function(e) {
    var msg = (e.message || '') + (e.filename || '');
    if (msg.match(/dynamically imported|chunk|Load failed|Failed to fetch/i)) {
      _chunkReload();
    }
  }, true);
  window.addEventListener('unhandledrejection', function(e) {
    var msg = String((e.reason && e.reason.message) || e.reason || '');
    if (msg.match(/dynamically imported|chunk|Load failed|Failed to fetch/i)) {
      _chunkReload();
    }
  });
</script>`;
      return html.replace('</head>', script + '\n</head>');
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), chunkLoadRecoveryPlugin(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // ── vendor-react: React + ReactDOM + Scheduler ONLY ──────────────
          //
          // Keep this chunk minimal. Every other chunk (recharts, d3, app
          // code) statically imports from "react"/"react-dom", so Rollup's
          // own chunk-loading graph already guarantees this chunk finishes
          // executing before any chunk that depends on it runs. We do NOT
          // need to co-locate consumers with React to get correct ordering
          // — ESM import semantics already do that for free, and forcing
          // unrelated libraries into the same chunk as React (e.g. all of
          // d3's interdependent sub-packages) can itself create circular
          // -eval-order TDZ bugs, which is exactly what was happening here.
          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom/") ||
            id.includes("node_modules/react-is/") ||
            id.includes("node_modules/scheduler/")
          ) {
            return "vendor-react";
          }

          // ── vendor-charts: recharts + d3 + victory-vendor ────────────────
          if (
            id.includes("node_modules/recharts") ||
            id.includes("node_modules/d3-") ||
            id.includes("node_modules/victory-vendor") ||
            id.includes("node_modules/d3")
          ) {
            return "vendor-charts";
          }

          // ── Other vendor libraries ────────────────────────────────────────
          if (
            id.includes("node_modules/livekit-client") ||
            id.includes("node_modules/@livekit")
          ) {
            return "vendor-livekit";
          }
          if (id.includes("node_modules/framer-motion")) {
            return "vendor-motion";
          }
          if (
            id.includes("node_modules/jspdf") ||
            id.includes("node_modules/xlsx")
          ) {
            return "vendor-docs";
          }
          if (id.includes("node_modules/@supabase")) {
            return "vendor-supabase";
          }
        },
      },
    },
  },
}));
