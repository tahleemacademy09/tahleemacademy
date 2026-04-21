import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
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
