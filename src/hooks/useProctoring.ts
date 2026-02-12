import { useEffect, useRef, useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface ProctoringConfig {
  attemptId: string;
  userId: string;
  proctoring_enabled?: boolean;
  fullscreen_required?: boolean;
  tab_switch_limit?: number;
  screenshot_interval_seconds?: number;
  max_warnings?: number;
  auto_submit_on_violation?: boolean;
  webcam_required?: boolean;
}

interface ProctoringState {
  violations: number;
  warnings: number;
  integrityScore: number;
  suspicionLevel: string;
  fullscreenActive: boolean;
  shouldAutoSubmit: boolean;
}

export const useProctoring = (config: ProctoringConfig, enabled: boolean, onAutoSubmit?: () => void) => {
  const [state, setState] = useState<ProctoringState>({
    violations: 0,
    warnings: 0,
    integrityScore: 100,
    suspicionLevel: "low",
    fullscreenActive: false,
    shouldAutoSubmit: false,
  });

  const sessionId = useRef<string | null>(null);
  const violationCount = useRef(0);
  const warningCount = useRef(0);
  const screenshotInterval = useRef<NodeJS.Timeout>();
  const stateRef = useRef(state);

  useEffect(() => { stateRef.current = state; }, [state]);

  const calcSuspicion = (v: number): string => {
    if (v >= 10) return "critical";
    if (v >= 5) return "high";
    if (v >= 2) return "medium";
    return "low";
  };

  const calcIntegrity = (v: number): number => Math.max(0, 100 - v * 8);

  const logViolation = useCallback(async (type: string, severity: number, details?: string, screenshotUrl?: string) => {
    if (!config.attemptId) return;
    violationCount.current += 1;
    const newCount = violationCount.current;

    setState(prev => ({
      ...prev,
      violations: newCount,
      integrityScore: calcIntegrity(newCount),
      suspicionLevel: calcSuspicion(newCount),
    }));

    // Insert violation record
    await supabase.from("violations").insert({
      attempt_id: config.attemptId,
      violation_type: type,
      severity_score: severity,
      details,
      screenshot_url: screenshotUrl || null,
    });

    // Update proctoring session
    if (sessionId.current) {
      await supabase.from("proctoring_sessions").update({
        total_violations: newCount,
        integrity_score: calcIntegrity(newCount),
        suspicion_level: calcSuspicion(newCount),
        updated_at: new Date().toISOString(),
      }).eq("id", sessionId.current);
    }

    // Update attempt integrity
    await supabase.from("exam_attempts").update({
      suspicion_level: calcSuspicion(newCount),
      integrity_score: calcIntegrity(newCount),
    }).eq("id", config.attemptId);

    // Check if should auto-submit
    const maxWarnings = config.max_warnings || 3;
    if (severity >= 2) {
      warningCount.current += 1;
      setState(prev => ({ ...prev, warnings: warningCount.current }));

      if (sessionId.current) {
        await supabase.from("proctoring_sessions").update({
          warnings_issued: warningCount.current,
        }).eq("id", sessionId.current);
      }
    }

    if (config.auto_submit_on_violation && warningCount.current >= maxWarnings) {
      setState(prev => ({ ...prev, shouldAutoSubmit: true }));
      onAutoSubmit?.();
    }
  }, [config.attemptId, config.max_warnings, config.auto_submit_on_violation, onAutoSubmit]);

  // Initialize proctoring session
  useEffect(() => {
    if (!enabled || !config.attemptId) return;

    const init = async () => {
      // Create proctoring session
      const { data } = await supabase.from("proctoring_sessions").insert({
        attempt_id: config.attemptId,
        webcam_enabled: config.webcam_required || false,
        microphone_enabled: false,
        fullscreen_active: false,
        max_warnings: config.max_warnings || 3,
      }).select("id").single();

      if (data) sessionId.current = data.id;

      // Log device info
      const ua = navigator.userAgent;
      const deviceType = /mobile/i.test(ua) ? "mobile" : /tablet/i.test(ua) ? "tablet" : "desktop";
      const browser = /chrome/i.test(ua) ? "Chrome" : /firefox/i.test(ua) ? "Firefox" : /safari/i.test(ua) ? "Safari" : /edge/i.test(ua) ? "Edge" : "Other";

      await supabase.from("device_logs").insert({
        attempt_id: config.attemptId,
        device_type: deviceType,
        browser,
        user_agent: ua,
        screen_resolution: `${screen.width}x${screen.height}`,
        ip_address: null, // Would need server-side detection
        vpn_detected: false,
      });
    };

    init();

    return () => {
      // End session
      if (sessionId.current) {
        supabase.from("proctoring_sessions").update({
          ended_at: new Date().toISOString(),
          fullscreen_active: false,
        }).eq("id", sessionId.current);
      }
    };
  }, [enabled, config.attemptId]);

  // Fullscreen enforcement
  useEffect(() => {
    if (!enabled || !config.fullscreen_required) return;

    const enterFullscreen = async () => {
      try {
        await document.documentElement.requestFullscreen();
        setState(prev => ({ ...prev, fullscreenActive: true }));
        if (sessionId.current) {
          supabase.from("proctoring_sessions").update({ fullscreen_active: true }).eq("id", sessionId.current);
        }
      } catch (e) {
        console.warn("Fullscreen request failed:", e);
      }
    };

    enterFullscreen();

    const handler = () => {
      const isFullscreen = !!document.fullscreenElement;
      setState(prev => ({ ...prev, fullscreenActive: isFullscreen }));
      if (!isFullscreen) {
        logViolation("fullscreen_exit", 2, "Student exited fullscreen mode");
      }
    };

    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, [enabled, config.fullscreen_required, logViolation]);

  // Copy/paste detection
  useEffect(() => {
    if (!enabled) return;
    const onCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      logViolation("copy_paste", 2, "Copy attempt detected");
    };
    const onPaste = (e: ClipboardEvent) => {
      logViolation("copy_paste", 1, "Paste attempt detected");
    };
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      logViolation("right_click", 1, "Right-click/context menu attempt");
    };

    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    document.addEventListener("contextmenu", onContextMenu);

    return () => {
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("contextmenu", onContextMenu);
    };
  }, [enabled, logViolation]);

  // Dev tools detection (basic)
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "F12" || (e.ctrlKey && e.shiftKey && (e.key === "I" || e.key === "J" || e.key === "C"))) {
        e.preventDefault();
        logViolation("dev_tools", 3, "Developer tools shortcut detected");
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [enabled, logViolation]);

  // Enhanced tab switch detection (logs to violations table)
  useEffect(() => {
    if (!enabled) return;
    const handler = () => {
      if (document.hidden) {
        logViolation("tab_switch", 2, "Tab/window switch detected");
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [enabled, logViolation]);

  // Periodic screenshot capture
  useEffect(() => {
    if (!enabled || !config.screenshot_interval_seconds) return;
    // Note: actual screenshot requires canvas-based capture which has limitations
    // For now we log the event; real implementation would use html2canvas
    const interval = config.screenshot_interval_seconds * 1000;
    screenshotInterval.current = setInterval(async () => {
      // Placeholder - in production you'd capture via html2canvas and upload
      await supabase.from("proctoring_media").insert({
        attempt_id: config.attemptId,
        file_type: "screenshot_event",
        file_url: "periodic_check",
        metadata: { timestamp: new Date().toISOString(), type: "periodic_check" },
      });
    }, interval);

    return () => clearInterval(screenshotInterval.current);
  }, [enabled, config.screenshot_interval_seconds, config.attemptId]);

  return {
    ...state,
    logViolation,
    sessionId: sessionId.current,
  };
};
