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
//
// FIXED: original code would also fire when the page was hidden (PWA minimize).
// Guard added: only reload if document.visibilityState === "visible".
function chunkLoadRecoveryPlugin(): Plugin {
  return {
    name: "chunk-load-recovery",
    transformIndexHtml(html) {
      const script = `
<script>
  function _chunkReload() {
    // Never reload while the PWA is backgrounded — that causes a
    // jarring full-refresh when the user returns from minimize.
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
        // ── TDZ FIX (PRIMARY) ─────────────────────────────────────────────
        // The app has 60+ files each declaring `const G`, `const GOLD`,
        // `const GM` etc. at module level. When Rollup scope-hoists these
        // into a single chunk it renames duplicates (e.g. to `le`, `ne`,
        // `re`) but the initialization ORDER can put a usage before the
        // declaration → "Cannot access 'le' before initialization".
        //
        // `generatedCode.constBindings: false` tells Rollup to emit `var`
        // instead of `const`/`let` for module-level bindings in the output.
        // `var` is hoisted to function scope, so there is NO TDZ — the
        // variable exists (as undefined) from the start of the chunk's
        // execution, and is assigned when the initializer runs.
        // This is the canonical Rollup fix for this exact class of error.
        generatedCode: {
          constBindings: false,
        },
        // ── TDZ FIX (SECONDARY) ──────────────────────────────────────────
        // Prevents Rollup from reordering transitive imports across chunks.
        // Works together with constBindings:false for belt-and-suspenders
        // coverage of both intra-chunk and cross-chunk TDZ scenarios.
        hoistTransitiveImports: false,
        manualChunks(id) {
          // ── React core — MUST be its own chunk so it is fully initialized
          // before any other vendor chunk (e.g. recharts) calls React.forwardRef
          // at module-init time. Without this, vendor-charts can load before
          // React exists → "Cannot read properties of undefined (reading 'forwardRef')".
          if (id.includes("node_modules/react/") ||
              id.includes("node_modules/react-dom/") ||
              id.includes("node_modules/react-is/") ||
              id.includes("node_modules/scheduler/")) {
            return "vendor-react";
          }

          // ── Vendor libraries — always isolated ──────────────────────────
          if (id.includes("node_modules/livekit-client") ||
              id.includes("node_modules/@livekit")) {
            return "vendor-livekit";
          }
          if (id.includes("node_modules/framer-motion")) {
            return "vendor-motion";
          }
          // Recharts + ALL its d3 sub-dependencies in one chunk.
          // Using the function form ensures nothing else leaks in.
          if (id.includes("node_modules/recharts") ||
              id.includes("node_modules/d3-") ||
              id.includes("node_modules/victory-vendor") ||
              id.includes("node_modules/d3")) {
            return "vendor-charts";
          }
          if (id.includes("node_modules/jspdf") ||
              id.includes("node_modules/xlsx")) {
            return "vendor-docs";
          }
          if (id.includes("node_modules/@supabase")) {
            return "vendor-supabase";
          }

          // ── Pages that import recharts — force into their own chunks ────
          // This prevents Rollup from co-bundling them with StudentDashboard,
          // which was causing "se.map is not a function" when recharts code
          // inside Transcripts/ExamResults ran before their data was ready.
          if (id.includes("src/pages/student/Transcripts")) {
            return "page-transcripts";
          }
          if (id.includes("src/pages/student/ExamResults")) {
            return "page-exam-results";
          }
          if (id.includes("src/pages/admin/TranscriptManagement")) {
            return "page-transcript-mgmt";
          }
        },
      },
    },
  },
}));
