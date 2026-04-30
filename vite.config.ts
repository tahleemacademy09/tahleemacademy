import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import type { Plugin } from "vite";

// ── iOS chunk-load recovery ───────────────────────────────────────────────────
// When iOS Safari has a stale index.html cached (from a previous deploy),
// dynamic import() calls for the new hashed chunk filenames fail silently
// and produce a blank screen. This plugin injects a tiny error handler into
// the built index.html that detects "Failed to fetch dynamically imported module"
// / "Load failed" errors and forces a hard reload — clearing the stale cache
// and fetching the real current index.html (which is now no-store in Vercel).
function chunkLoadRecoveryPlugin(): Plugin {
  return {
    name: "chunk-load-recovery",
    transformIndexHtml(html) {
      const script = `
<script>
  window.addEventListener('error', function(e) {
    var msg = (e.message || '') + (e.filename || '');
    if (msg.match(/dynamically imported|chunk|Load failed|Failed to fetch/i)) {
      if (!sessionStorage.getItem('_chunkReload')) {
        sessionStorage.setItem('_chunkReload', '1');
        window.location.reload(true);
      }
    }
  }, true);
  window.addEventListener('unhandledrejection', function(e) {
    var msg = String((e.reason && e.reason.message) || e.reason || '');
    if (msg.match(/dynamically imported|chunk|Load failed|Failed to fetch/i)) {
      if (!sessionStorage.getItem('_chunkReload')) {
        sessionStorage.setItem('_chunkReload', '1');
        window.location.reload(true);
      }
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
        manualChunks: {
          // LiveKit WebRTC — heavy, only needed inside classroom sessions
          "vendor-livekit": [
            "livekit-client",
            "@livekit/components-react",
            "@livekit/components-styles",
          ],
          // Framer Motion — animation library, not needed at first paint
          "vendor-motion": ["framer-motion"],
          // Recharts — charting, only used in dashboards
          "vendor-charts": ["recharts"],
          // PDF / spreadsheet utilities — only used in specific admin pages
          "vendor-docs": ["jspdf", "xlsx"],
          // Supabase client — shared but large, isolate for long-term caching
          "vendor-supabase": ["@supabase/supabase-js"],
        },
      },
    },
  },
}));
