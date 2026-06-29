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
        // ── TDZ FIX ───────────────────────────────────────────────────────
        // Emit var instead of const/let for module-level bindings so there
        // is no Temporal Dead Zone when Rollup reorders declarations.
        generatedCode: {
          constBindings: false,
        },
        hoistTransitiveImports: false,

        manualChunks(id) {
          // ── vendor-charts: React + recharts + d3 in ONE chunk ────────────
          //
          // recharts calls React.forwardRef / React.createContext at MODULE
          // LEVEL (outside any function). If React is in a separate chunk,
          // the browser may load vendor-charts before vendor-react finishes
          // executing → React is undefined → crash.
          //
          // Co-locating React and recharts in the SAME chunk guarantees
          // React is fully initialised before recharts module code runs —
          // they execute in declaration order within a single JS file,
          // not across asynchronous chunk boundaries.
          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom/") ||
            id.includes("node_modules/react-is/") ||
            id.includes("node_modules/scheduler/") ||
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
