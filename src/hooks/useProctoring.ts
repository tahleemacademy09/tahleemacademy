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

// Random interval between min and max seconds
const randomInterval = (minSec: number, maxSec: number) =>
  (Math.floor(Math.random() * (maxSec - minSec + 1)) + minSec) * 1000;

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
  const webcamTimeout = useRef<NodeJS.Timeout>();
  const screenTimeout = useRef<NodeJS.Timeout>();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
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

    await supabase.from("violations").insert({
      attempt_id: config.attemptId,
      violation_type: type,
      severity_score: severity,
      details,
      screenshot_url: screenshotUrl || null,
    });

    if (sessionId.current) {
      await supabase.from("proctoring_sessions").update({
        total_violations: newCount,
        integrity_score: calcIntegrity(newCount),
        suspicion_level: calcSuspicion(newCount),
        updated_at: new Date().toISOString(),
      }).eq("id", sessionId.current);
    }

    await supabase.from("exam_attempts").update({
      suspicion_level: calcSuspicion(newCount),
      integrity_score: calcIntegrity(newCount),
    }).eq("id", config.attemptId);

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

  // Capture a webcam face snapshot and upload
  const captureWebcamSnapshot = useCallback(async () => {
    if (!videoRef.current || !config.attemptId) return;
    const video = videoRef.current;
    if (video.readyState < 2) return;

    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.7)
      );
      if (!blob) return;

      const timestamp = Date.now();
      const filePath = `${config.attemptId}/face_${timestamp}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from("proctoring-media")
        .upload(filePath, blob, { contentType: "image/jpeg", upsert: false });

      if (uploadError) {
        console.warn("Face capture upload failed:", uploadError.message);
        return;
      }

      await supabase.from("proctoring_media").insert({
        attempt_id: config.attemptId,
        file_type: "face_snapshot",
        file_url: filePath,
        file_name: `face_${timestamp}.jpg`,
        file_size: blob.size,
        metadata: { timestamp: new Date(timestamp).toISOString(), type: "periodic_face_capture" },
      });
    } catch (e) {
      console.warn("Face capture error:", e);
    }
  }, [config.attemptId]);

  // Capture screen screenshot using getDisplayMedia snapshot
  const captureScreenshot = useCallback(async () => {
    if (!config.attemptId) return;
    try {
      // Use canvas to capture current page as screenshot
      const canvas = document.createElement("canvas");
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Use html2canvas-like approach: draw a simple representation
      // For a real screenshot we attempt getDisplayMedia with a quick capture
      let blob: Blob | null = null;

      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: "browser" } as any });
        const track = screenStream.getVideoTracks()[0];
        // @ts-ignore - ImageCapture API
        if (typeof ImageCapture !== "undefined") {
          // @ts-ignore
          const imageCapture = new ImageCapture(track);
          const bitmap = await imageCapture.grabFrame();
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          ctx.drawImage(bitmap, 0, 0);
          blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.6));
          bitmap.close();
        }
        track.stop();
        screenStream.getTracks().forEach(t => t.stop());
      } catch {
        // getDisplayMedia may fail silently or user may deny — log violation
        console.warn("Screen capture not available");
        return;
      }

      if (!blob) return;

      const timestamp = Date.now();
      const filePath = `${config.attemptId}/screen_${timestamp}.jpg`;

      const { error } = await supabase.storage
        .from("proctoring-media")
        .upload(filePath, blob, { contentType: "image/jpeg", upsert: false });

      if (error) {
        console.warn("Screen capture upload failed:", error.message);
        return;
      }

      await supabase.from("proctoring_media").insert({
        attempt_id: config.attemptId,
        file_type: "screen_capture",
        file_url: filePath,
        file_name: `screen_${timestamp}.jpg`,
        file_size: blob.size,
        metadata: { timestamp: new Date(timestamp).toISOString(), type: "periodic_screen_capture" },
      });
    } catch (e) {
      console.warn("Screen capture error:", e);
    }
  }, [config.attemptId]);

  // Schedule next random face capture
  const scheduleNextFaceCapture = useCallback(() => {
    const baseInterval = config.screenshot_interval_seconds || 30;
    const minSec = Math.max(10, Math.floor(baseInterval * 0.5));
    const maxSec = Math.floor(baseInterval * 1.5);
    const delay = randomInterval(minSec, maxSec);

    webcamTimeout.current = setTimeout(async () => {
      await captureWebcamSnapshot();
      scheduleNextFaceCapture(); // schedule next
    }, delay);
  }, [captureWebcamSnapshot, config.screenshot_interval_seconds]);

  // Schedule next random screen capture (every 45-90s)
  const scheduleNextScreenCapture = useCallback(() => {
    const delay = randomInterval(45, 90);
    screenTimeout.current = setTimeout(async () => {
      await captureScreenshot();
      scheduleNextScreenCapture();
    }, delay);
  }, [captureScreenshot]);

  // Initialize proctoring session + webcam
  useEffect(() => {
    if (!enabled || !config.attemptId) return;

    const init = async () => {
      const { data } = await supabase.from("proctoring_sessions").insert({
        attempt_id: config.attemptId,
        webcam_enabled: config.webcam_required || false,
        microphone_enabled: false,
        fullscreen_active: false,
        max_warnings: config.max_warnings || 3,
      }).select("id").single();

      if (data) sessionId.current = data.id;

      const ua = navigator.userAgent;
      const deviceType = /mobile/i.test(ua) ? "mobile" : /tablet/i.test(ua) ? "tablet" : "desktop";
      const browser = /chrome/i.test(ua) ? "Chrome" : /firefox/i.test(ua) ? "Firefox" : /safari/i.test(ua) ? "Safari" : /edge/i.test(ua) ? "Edge" : "Other";

      await supabase.from("device_logs").insert({
        attempt_id: config.attemptId,
        device_type: deviceType,
        browser,
        user_agent: ua,
        screen_resolution: `${screen.width}x${screen.height}`,
        ip_address: null,
        vpn_detected: false,
      });

      // Start webcam for periodic face capture
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640, height: 480 } });
        streamRef.current = stream;
        const video = document.createElement("video");
        video.srcObject = stream;
        video.setAttribute("playsinline", "true");
        video.muted = true;
        await video.play();
        videoRef.current = video;
      } catch (e) {
        console.warn("Webcam access failed for proctoring capture:", e);
        logViolation("webcam_disabled", 3, "Webcam access denied during exam");
      }
    };

    init();

    return () => {
      if (sessionId.current) {
        supabase.from("proctoring_sessions").update({
          ended_at: new Date().toISOString(),
          fullscreen_active: false,
        }).eq("id", sessionId.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      videoRef.current = null;
    };
  }, [enabled, config.attemptId]);

  // Random-interval face capture
  useEffect(() => {
    if (!enabled || !config.attemptId) return;

    // Initial capture after 5s warmup, then random intervals
    const initialTimeout = setTimeout(() => {
      captureWebcamSnapshot();
      scheduleNextFaceCapture();
    }, 5000);

    return () => {
      clearTimeout(initialTimeout);
      if (webcamTimeout.current) clearTimeout(webcamTimeout.current);
    };
  }, [enabled, config.attemptId, captureWebcamSnapshot, scheduleNextFaceCapture]);

  // Periodic screen capture (start after 15s)
  useEffect(() => {
    if (!enabled || !config.attemptId) return;

    const initialTimeout = setTimeout(() => {
      scheduleNextScreenCapture();
    }, 15000);

    return () => {
      clearTimeout(initialTimeout);
      if (screenTimeout.current) clearTimeout(screenTimeout.current);
    };
  }, [enabled, config.attemptId, scheduleNextScreenCapture]);

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

  // Dev tools detection
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

  // Tab switch detection
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

  // Webcam/mic stream monitoring — detect if disabled during exam
  useEffect(() => {
    if (!enabled || !config.webcam_required) return;

    const checkStream = setInterval(() => {
      if (streamRef.current) {
        const videoTrack = streamRef.current.getVideoTracks()[0];
        if (videoTrack && !videoTrack.enabled) {
          logViolation("webcam_disabled", 3, "Webcam was disabled during exam");
        }
        if (videoTrack && videoTrack.readyState === "ended") {
          logViolation("webcam_disabled", 3, "Webcam stream ended unexpectedly");
        }
      }
    }, 10000);

    return () => clearInterval(checkStream);
  }, [enabled, config.webcam_required, logViolation]);

  return {
    ...state,
    logViolation,
    sessionId: sessionId.current,
  };
};
