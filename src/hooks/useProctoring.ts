import { useEffect, useRef, useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

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
  cameraReady: boolean;
}

const randomInterval = (minSec: number, maxSec: number) =>
  (Math.floor(Math.random() * (maxSec - minSec + 1)) + minSec) * 1000;

const MAX_UPLOAD_RETRIES = 3;

export const useProctoring = (config: ProctoringConfig, enabled: boolean, onAutoSubmit?: () => void) => {
  const [state, setState] = useState<ProctoringState>({
    violations: 0,
    warnings: 0,
    integrityScore: 100,
    suspicionLevel: "low",
    fullscreenActive: false,
    shouldAutoSubmit: false,
    cameraReady: false,
  });

  const sessionId = useRef<string | null>(null);
  const violationCount = useRef(0);
  const warningCount = useRef(0);
  const webcamTimeout = useRef<ReturnType<typeof setTimeout>>();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraReadyRef = useRef(false);
  const enabledRef = useRef(enabled);

  useEffect(() => { enabledRef.current = enabled; }, [enabled]);

  const calcSuspicion = (v: number): string => {
    if (v >= 10) return "critical";
    if (v >= 5) return "high";
    if (v >= 2) return "medium";
    return "low";
  };

  const calcIntegrity = (v: number): number => Math.max(0, 100 - v * 8);

  // Upload with retry
  const uploadWithRetry = useCallback(async (path: string, blob: Blob, retries = MAX_UPLOAD_RETRIES): Promise<boolean> => {
    for (let i = 0; i < retries; i++) {
      const { error } = await supabase.storage
        .from("proctoring-media")
        .upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (!error) return true;
      logger.warn(`Upload retry ${i + 1}/${retries}:`, error.message);
      if (i < retries - 1) await new Promise(r => setTimeout(r, 2000 * (i + 1)));
    }
    return false;
  }, []);

  // Capture a webcam face snapshot and upload
  const captureWebcamSnapshot = useCallback(async (triggerType: string = "periodic_face_capture") => {
    if (!videoRef.current || !config.attemptId || !cameraReadyRef.current) {
      logger.log("[Proctoring] Skip capture: camera not ready");
      return;
    }

    const video = videoRef.current;
    if (video.readyState < 2) {
      logger.log("[Proctoring] Skip capture: video not ready");
      return;
    }

    try {
      const canvas = document.createElement("canvas");
      const w = video.videoWidth || 640;
      const h = video.videoHeight || 480;
      // Compress: max 480p for face snapshots
      const scale = Math.min(1, 480 / Math.max(w, h));
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.65)
      );
      if (!blob) {
        logger.warn("[Proctoring] Failed to create blob from canvas");
        return;
      }

      // Limit to ~500KB
      if (blob.size > 600_000) {
        logger.warn("[Proctoring] Snapshot too large, skipping");
        return;
      }

      const timestamp = Date.now();
      const filePath = `${config.userId}/${config.attemptId}/face_${timestamp}.jpg`;

      logger.log("[Proctoring] Uploading face snapshot");

      const uploaded = await uploadWithRetry(filePath, blob);
      if (!uploaded) {
        logger.warn("[Proctoring] Face capture upload failed after retries");
        return;
      }

      const { error: dbError } = await supabase.from("proctoring_media").insert({
        attempt_id: config.attemptId,
        file_type: "face_snapshot",
        file_url: filePath,
        file_name: `face_${timestamp}.jpg`,
        file_size: blob.size,
        metadata: { timestamp: new Date(timestamp).toISOString(), type: triggerType },
      });

      if (dbError) {
        logger.warn("[Proctoring] DB insert error");
      } else {
        logger.log("[Proctoring] Face snapshot saved successfully");
      }
    } catch (e) {
      logger.warn("[Proctoring] Face capture error");
    }
  }, [config.attemptId, uploadWithRetry]);

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

    // Capture face snapshot on violations (severity >= 2)
    if (severity >= 2 && cameraReadyRef.current) {
      captureWebcamSnapshot(`violation_${type}`);
    }

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
  }, [config.attemptId, config.max_warnings, config.auto_submit_on_violation, onAutoSubmit, captureWebcamSnapshot]);

  // Initialize webcam with mobile front camera priority and retry
  const initCamera = useCallback(async (retryCount = 0): Promise<boolean> => {
    const maxRetries = 3;
    try {
      const isMobile = /mobile|android|iphone/i.test(navigator.userAgent);
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: "user", // front camera priority
          width: { ideal: isMobile ? 320 : 640 },
          height: { ideal: isMobile ? 240 : 480 },
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      const video = document.createElement("video");
      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      video.muted = true;

      // Wait for video to actually be ready
      await new Promise<void>((resolve, reject) => {
        video.onloadeddata = () => resolve();
        video.onerror = () => reject(new Error("Video load error"));
        setTimeout(() => reject(new Error("Video load timeout")), 10000);
        video.play().catch(reject);
      });

      videoRef.current = video;
      cameraReadyRef.current = true;
      setState(prev => ({ ...prev, cameraReady: true }));
      logger.log("[Proctoring] Camera initialized successfully");

      // Monitor track for unexpected end
      const track = stream.getVideoTracks()[0];
      if (track) {
        track.onended = () => {
          logger.warn("[Proctoring] Camera track ended, attempting reconnect");
          cameraReadyRef.current = false;
          setState(prev => ({ ...prev, cameraReady: false }));
          if (enabledRef.current) {
            setTimeout(() => initCamera(), 2000);
            logViolation("webcam_disabled", 3, "Camera stream ended unexpectedly");
          }
        };
      }

      return true;
    } catch (e: any) {
      logger.warn(`[Proctoring] Camera init failed (attempt ${retryCount + 1})`);
      if (retryCount < maxRetries - 1) {
        await new Promise(r => setTimeout(r, 2000));
        return initCamera(retryCount + 1);
      }
      logViolation("webcam_disabled", 3, `Camera access failed: ${e.message}`);
      return false;
    }
  }, [logViolation]);

  // Initialize proctoring session + webcam
  useEffect(() => {
    if (!enabled || !config.attemptId) return;

    const init = async () => {
      // Create proctoring session
      const { data } = await supabase.from("proctoring_sessions").insert({
        attempt_id: config.attemptId,
        webcam_enabled: true,
        microphone_enabled: false,
        fullscreen_active: false,
        max_warnings: config.max_warnings || 3,
      }).select("id").single();

      if (data) {
        sessionId.current = data.id;
        logger.log("[Proctoring] Session created");
      }

      // Init camera
      await initCamera();
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
      cameraReadyRef.current = false;
      videoRef.current = null;
    };
  }, [enabled, config.attemptId]);

  // Random-interval face capture — waits for camera to be ready
  useEffect(() => {
    if (!enabled || !config.attemptId) return;

    let cancelled = false;

    const startCaptures = async () => {
      // Wait up to 15s for camera to be ready
      for (let i = 0; i < 30; i++) {
        if (cancelled) return;
        if (cameraReadyRef.current) break;
        await new Promise(r => setTimeout(r, 500));
      }

      if (!cameraReadyRef.current) {
        logger.warn("[Proctoring] Camera never became ready, skipping periodic captures");
        return;
      }

      // Initial capture
      if (!cancelled) {
        logger.log("[Proctoring] Starting initial face capture");
        await captureWebcamSnapshot("initial_capture");
      }

      // Schedule recurring random captures
      const scheduleNext = () => {
        if (cancelled) return;
        const baseInterval = config.screenshot_interval_seconds || 30;
        const minSec = Math.max(10, Math.floor(baseInterval * 0.5));
        const maxSec = Math.floor(baseInterval * 1.5);
        const delay = randomInterval(minSec, maxSec);

        webcamTimeout.current = setTimeout(async () => {
          if (!cancelled && cameraReadyRef.current) {
            await captureWebcamSnapshot();
          }
          scheduleNext();
        }, delay);
      };

      scheduleNext();
    };

    startCaptures();

    return () => {
      cancelled = true;
      if (webcamTimeout.current) clearTimeout(webcamTimeout.current);
    };
  }, [enabled, config.attemptId, captureWebcamSnapshot, config.screenshot_interval_seconds]);

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
        logger.warn("Fullscreen request failed");
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

  // Webcam stream health monitoring
  useEffect(() => {
    if (!enabled) return;

    const checkStream = setInterval(() => {
      if (streamRef.current) {
        const videoTrack = streamRef.current.getVideoTracks()[0];
        if (videoTrack && !videoTrack.enabled) {
          logViolation("webcam_disabled", 3, "Webcam was disabled during exam");
        }
      } else if (cameraReadyRef.current) {
        // Stream was lost
        cameraReadyRef.current = false;
        setState(prev => ({ ...prev, cameraReady: false }));
        logger.warn("[Proctoring] Stream lost, attempting reconnect");
        initCamera();
      }
    }, 10000);

    return () => clearInterval(checkStream);
  }, [enabled, logViolation, initCamera]);

  return {
    ...state,
    logViolation,
    sessionId: sessionId.current,
  };
};
