/*
  src/components/shared/BackgroundRunBanner.tsx — Tahleem Academy
  ═══════════════════════════════════════════════════════════════════════
  Visible, dismissable banner that prompts the OEM "allow background
  running" / battery-whitelist flow during NORMAL browsing — not just
  live classes.

  WHY THIS EXISTS:
  useBatteryOptimization.ts / DontKillMyApp was previously only wired into
  GlobalClassroomOverlay.tsx (shown once a call is connected). That's the
  right moment to explain a call-drop, but it means students who never
  join a live class never see the prompt at all — so Samsung/Xiaomi/Huawei/
  etc.'s own battery manager stays free to kill the backgrounded WebView
  the moment they minimize to check WhatsApp, which is what actually
  shows up as "the app reloads every time I minimize it."

  This banner asks the same OS/OEM question, once, from the dashboard —
  covering the "just browsing" case the call-only prompt never reached.
  Uses the SAME localStorage flag as the call prompt (hasPromptedBatteryOptimization),
  so a student who already answered the prompt in a live class is never
  asked twice, and vice versa.

  Usage — mount once, ideally near the top of StudentDashboard (or any
  dashboard landing page):
    <BackgroundRunBanner />
  ═══════════════════════════════════════════════════════════════════════
*/
import { useEffect, useState } from "react";
import { ShieldCheck, X } from "lucide-react";
import {
  shouldPromptBatteryOptimization,
  requestRunInBackground,
  dismissBatteryOptimizationPrompt,
} from "@/hooks/useBatteryOptimization";

const BR_G  = "#064E3B";
const BR_GM = "#075E54";

export default function BackgroundRunBanner() {
  const [visible, setVisible] = useState(false);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Small delay so this never competes with the splash screen / first
    // paint / other onboarding banners for attention.
    const t = setTimeout(() => {
      shouldPromptBatteryOptimization().then((should) => {
        if (!cancelled && should) setVisible(true);
      });
    }, 2500);
    return () => { cancelled = true; clearTimeout(t); };
  }, []);

  if (!visible) return null;

  const handleAllow = async () => {
    if (requesting) return;
    setRequesting(true);
    try {
      await requestRunInBackground();
    } finally {
      setVisible(false);
    }
  };

  const handleDismiss = () => {
    dismissBatteryOptimizationPrompt();
    setVisible(false);
  };

  return (
    <div style={{
      background: `linear-gradient(135deg, ${BR_G}08, ${BR_GM}12)`,
      border: `1px solid ${BR_G}25`,
      borderRadius: 16, padding: "16px 18px",
      display: "flex", alignItems: "center", gap: 14,
      fontFamily: "'Cairo',system-ui,sans-serif",
      boxShadow: "0 2px 12px rgba(6,78,59,.08)",
      margin: "0 0 12px",
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: `linear-gradient(135deg, ${BR_G}, ${BR_GM})`,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <ShieldCheck size={22} color="#fff" />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: BR_G, marginBottom: 2 }}>
          Stop the app reloading when you minimize it
        </div>
        <div style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.5 }}>
          Your phone's battery saver can close Tahleem in the background, so it reloads
          when you come back. Whitelisting it keeps your place — just like WhatsApp.
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
        <button
          onClick={handleAllow}
          disabled={requesting}
          style={{
            padding: "8px 14px", borderRadius: 10, border: "none",
            background: requesting ? "#9CA3AF" : `linear-gradient(135deg, ${BR_G}, ${BR_GM})`,
            color: "#fff", fontSize: 12, fontWeight: 700,
            cursor: requesting ? "not-allowed" : "pointer", whiteSpace: "nowrap",
          }}
        >
          {requesting ? "Opening…" : "Allow"}
        </button>
        <button
          onClick={handleDismiss}
          style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", color: "#6B7280", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
        >
          <X size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
          Not now
        </button>
      </div>
    </div>
  );
}
