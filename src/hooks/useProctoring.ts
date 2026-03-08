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
  record_audio?: boolean;
}

interface ProctoringState {
  violations: number;
  warnings: number;
  strikes: number;
  maxStrikes: number;
  integrityScore: number;
  suspicionLevel: string;
  fullscreenActive: boolean;
  shouldAutoSubmit: boolean;
  cameraReady: boolean;
  faceDetected: boolean;
  audioMonitoring: boolean;
  lastWarningType: string | null;
}

const randomInterval = (minSec: number, maxSec: number) =>
  (Math.floor(Math.random() * (maxSec - minSec + 1)) + minSec) * 1000;

const MAX_UPLOAD_RETRIES = 3;

export const useProctoring = (config: ProctoringConfig, enabled: boolean, onAutoSubmit?: () => void) => {
  const [state, setState] = useState<ProctoringState>({
    violations: 0,
    warnings: 0,
    strikes: 0,
    maxStrikes: config.max_warnings || 3,
    integrityScore: 100,
    suspicionLevel: "low",
    fullscreenActive: false,
    shouldAutoSubmit: false,
    cameraReady: false,
    faceDetected: true,
    audioMonitoring: false,
    lastWarningType: null,
  });

  const sessionId = useRef<string | null>(null);
  const violationCount = useRef(0);
  const warningCount = useRef(0);
  const strikeCount = useRef(0);
  const webcamTimeout = useRef<ReturnType<typeof setTimeout>>();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioMonitorRef = useRef<ReturnType<typeof setInterval>>();
  const cameraReadyRef = useRef(false);
  const enabledRef = useRef(enabled);
  const faceAbsentTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const tabAwayTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const tabAwayStartRef = useRef<number | null>(null);

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
      const scale = Math.min(1, 480 / Math.max(w, h));
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.65)
      );
      if (!blob) return;
      if (blob.size > 600_000) return;

      const timestamp = Date.now();
      const filePath = `${config.userId}/${config.attemptId}/face_${timestamp}.jpg`;

      const uploaded = await uploadWithRetry(filePath, blob);
      if (!uploaded) return;

      await supabase.from("proctoring_media").insert({
        attempt_id: config.attemptId,
        file_type: "face_snapshot",
        file_url: filePath,
        file_name: `face_${timestamp}.jpg`,
        file_size: blob.size,
        metadata: { timestamp: new Date(timestamp).toISOString(), type: triggerType },
      });
    } catch (e) {
      logger.warn("[Proctoring] Face capture error");
    }
  }, [config.attemptId, config.userId, uploadWithRetry]);

  // Add a strike — HIGH RISK violations count as 2
  const addStrike = useCallback((count: number = 1) => {
    strikeCount.current += count;
    const maxStrikes = config.max_warnings || 3;
    setState(prev => ({ ...prev, strikes: strikeCount.current, maxStrikes }));

    if (config.auto_submit_on_violation && strikeCount.current >= maxStrikes) {
      setState(prev => ({ ...prev, shouldAutoSubmit: true }));
      onAutoSubmit?.();
    }
  }, [config.max_warnings, config.auto_submit_on_violation, onAutoSubmit]);

  const logViolation = useCallback(async (type: string, severity: number, details?: string, screenshotUrl?: string) => {
    if (!config.attemptId) return;
    violationCount.current += 1;
    const newCount = violationCount.current;

    const newSuspicion = calcSuspicion(newCount);
    const newIntegrity = calcIntegrity(newCount);

    setState(prev => ({
      ...prev,
      violations: newCount,
      integrityScore: newIntegrity,
      suspicionLevel: newSuspicion,
      lastWarningType: type,
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
        integrity_score: newIntegrity,
        suspicion_level: newSuspicion,
        updated_at: new Date().toISOString(),
      }).eq("id", sessionId.current);
    }

    await supabase.from("exam_attempts").update({
      suspicion_level: newSuspicion,
      integrity_score: newIntegrity,
    }).eq("id", config.attemptId);

    // Capture face snapshot on violations (severity >= 2)
    if (severity >= 2 && cameraReadyRef.current) {
      captureWebcamSnapshot(`violation_${type}`);
    }

    // Strike system: severity >= 2 = 1 strike, HIGH RISK (multiple_faces, phone_detected) = 2 strikes
    if (severity >= 2) {
      warningCount.current += 1;
      setState(prev => ({ ...prev, warnings: warningCount.current }));

      if (sessionId.current) {
        await supabase.from("proctoring_sessions").update({
          warnings_issued: warningCount.current,
        }).eq("id", sessionId.current);
      }

      const isHighRisk = ["multiple_faces", "phone_detected"].includes(type);
      addStrike(isHighRisk ? 2 : 1);
    }
  }, [config.attemptId, config.auto_submit_on_violation, captureWebcamSnapshot, addStrike]);

  // Get video element for external camera preview
  const getVideoElement = useCallback(() => videoRef.current, []);
  const getStream = useCallback(() => streamRef.current, []);

  // Initialize webcam with mobile front camera priority and retry
  const initCamera = useCallback(async (retryCount = 0): Promise<boolean> => {
    const maxRetries = 3;
    try {
      const isMobile = /mobile|android|iphone/i.test(navigator.userAgent);
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: "user",
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

      await new Promise<void>((resolve, reject) => {
        video.onloadeddata = () => resolve();
        video.onerror = () => reject(new Error("Video load error"));
        setTimeout(() => reject(new Error("Video load timeout")), 10000);
        video.play().catch(reject);
      });

      videoRef.current = video;
      cameraReadyRef.current = true;
      setState(prev => ({ ...prev, cameraReady: true, faceDetected: true }));
      logger.log("[Proctoring] Camera initialized successfully");

      const track = stream.getVideoTracks()[0];
      if (track) {
        track.onended = () => {
          logger.warn("[Proctoring] Camera track ended, attempting reconnect");
          cameraReadyRef.current = false;
          setState(prev => ({ ...prev, cameraReady: false, faceDetected: false }));
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

  // Initialize audio monitoring
  const initAudioMonitoring = useCallback(async () => {
    if (!config.record_audio) return;
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = audioStream;

      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(audioStream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let highNoiseCount = 0;

      audioMonitorRef.current = setInterval(() => {
        if (!enabledRef.current || !analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        const normalized = (avg / 128) * 100;

        // Threshold: sustained noise above 40% for multiple checks
        if (normalized > 40) {
          highNoiseCount++;
          if (highNoiseCount >= 3) {
            logViolation("unusual_audio", 2, `Sustained background noise detected (level: ${Math.round(normalized)}%)`);
            highNoiseCount = 0; // Reset after logging
          }
        } else {
          highNoiseCount = Math.max(0, highNoiseCount - 1);
        }
      }, 2000);

      setState(prev => ({ ...prev, audioMonitoring: true }));
      logger.log("[Proctoring] Audio monitoring initialized");
    } catch (e) {
      logger.warn("[Proctoring] Audio monitoring init failed");
    }
  }, [config.record_audio, logViolation]);

  // Initialize proctoring session + webcam + audio
  useEffect(() => {
    if (!enabled || !config.attemptId) return;

    const init = async () => {
      const { data } = await supabase.from("proctoring_sessions").insert({
        attempt_id: config.attemptId,
        webcam_enabled: true,
        microphone_enabled: config.record_audio || false,
        fullscreen_active: false,
        max_warnings: config.max_warnings || 3,
      }).select("id").single();

      if (data) {
        sessionId.current = data.id;
        logger.log("[Proctoring] Session created");
      }

      await initCamera();
      await initAudioMonitoring();
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
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(t => t.stop());
        audioStreamRef.current = null;
      }
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close().catch(() => {});
      }
      if (audioMonitorRef.current) clearInterval(audioMonitorRef.current);
      cameraReadyRef.current = false;
      videoRef.current = null;
    };
  }, [enabled, config.attemptId]);

  // Random-interval face capture
  useEffect(() => {
    if (!enabled || !config.attemptId) return;

    let cancelled = false;

    const startCaptures = async () => {
      for (let i = 0; i < 30; i++) {
        if (cancelled) return;
        if (cameraReadyRef.current) break;
        await new Promise(r => setTimeout(r, 500));
      }

      if (!cameraReadyRef.current) return;

      if (!cancelled) await captureWebcamSnapshot("initial_capture");

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

  // Tab switch detection with timing
  useEffect(() => {
    if (!enabled) return;
    const handler = () => {
      if (document.hidden) {
        tabAwayStartRef.current = Date.now();
        logViolation("tab_switch", 2, "Tab/window switch detected");
      } else if (tabAwayStartRef.current) {
        const awayDuration = Math.round((Date.now() - tabAwayStartRef.current) / 1000);
        tabAwayStartRef.current = null;
        if (awayDuration > 2) {
          logViolation("tab_switch_return", 1, `Returned after ${awayDuration}s away`);
        }
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
        cameraReadyRef.current = false;
        setState(prev => ({ ...prev, cameraReady: false, faceDetected: false }));
        logger.warn("[Proctoring] Stream lost, attempting reconnect");
        initCamera();
      }
    }, 10000);

    return () => clearInterval(checkStream);
  }, [enabled, logViolation, initCamera]);

  // Face detection using skin-tone pixel analysis
  useEffect(() => {
    if (!enabled || !config.webcam_required) return;

    let cancelled = false;
    let consecutiveAbsent = 0;
    const ABSENT_THRESHOLD = 3; // 3 consecutive fails = no face

    const detectFace = () => {
      if (cancelled || !videoRef.current || !cameraReadyRef.current) return;
      const video = videoRef.current;
      if (video.readyState < 2) return;

      try {
        const canvas = document.createElement("canvas");
        const w = 160; // small for perf
        const h = 120;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, w, h);
        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;
        const totalPixels = w * h;

        let skinPixels = 0;
        let motionPixels = 0;

        for (let i = 0; i < data.length; i += 16) { // sample every 4th pixel
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];

          // Skin-tone detection across diverse skin colors
          // Wide range: R > 60, G > 30, B > 15, R > G, R > B, |R-G| < 100
          const isSkin = r > 60 && g > 30 && b > 15 &&
            r > g && r > b &&
            Math.abs(r - g) < 100 &&
            (r - b) > 15;

          if (isSkin) skinPixels++;
        }

        const sampledTotal = Math.ceil(totalPixels / 4);
        const skinRatio = skinPixels / sampledTotal;

        // A face typically covers 5-60% of the frame as skin pixels
        const facePresent = skinRatio > 0.04;

        if (facePresent) {
          consecutiveAbsent = 0;
          if (!state.faceDetected) {
            setState(prev => ({ ...prev, faceDetected: true }));
          }
          // Clear any pending absence timer
          if (faceAbsentTimerRef.current) {
            clearTimeout(faceAbsentTimerRef.current);
            faceAbsentTimerRef.current = undefined;
          }
        } else {
          consecutiveAbsent++;
          if (consecutiveAbsent >= ABSENT_THRESHOLD) {
            setState(prev => ({ ...prev, faceDetected: false }));
            // Only log violation after sustained absence (not already timed)
            if (!faceAbsentTimerRef.current) {
              faceAbsentTimerRef.current = setTimeout(() => {
                if (!cancelled && consecutiveAbsent >= ABSENT_THRESHOLD) {
                  logViolation("face_not_detected", 2, "Face not visible in camera for extended period");
                  captureWebcamSnapshot("face_absent");
                }
                faceAbsentTimerRef.current = undefined;
              }, 5000);
            }
          }
        }
      } catch (e) {
        // Silently fail
      }
    };

    // Wait for camera, then start detection every 2s
    const startDetection = async () => {
      for (let i = 0; i < 30; i++) {
        if (cancelled) return;
        if (cameraReadyRef.current) break;
        await new Promise(r => setTimeout(r, 500));
      }

      const interval = setInterval(() => {
        if (!cancelled) detectFace();
      }, 2000);

      return () => clearInterval(interval);
    };

    let cleanupFn: (() => void) | undefined;
    startDetection().then(fn => { cleanupFn = fn; });

    return () => {
      cancelled = true;
      cleanupFn?.();
      if (faceAbsentTimerRef.current) {
        clearTimeout(faceAbsentTimerRef.current);
        faceAbsentTimerRef.current = undefined;
      }
    };
  }, [enabled, config.webcam_required, logViolation, captureWebcamSnapshot]);

  // Fetch recent violations for activity feed
  const [recentViolations, setRecentViolations] = useState<Array<{ type: string; time: string; details: string }>>([]);

  useEffect(() => {
    if (!enabled || !config.attemptId) return;

    const fetchViolations = async () => {
      const { data } = await (supabase as any)
        .from("violations")
        .select("violation_type, created_at, details")
        .eq("attempt_id", config.attemptId)
        .order("created_at", { ascending: false })
        .limit(10);

      if (data) {
        setRecentViolations((data as any[]).map((v: any) => ({
          type: v.violation_type,
          time: new Date(v.created_at).toLocaleTimeString(),
          details: v.details || "",
        })));
      }
    };

    fetchViolations();
    const interval = setInterval(fetchViolations, 10000);
    return () => clearInterval(interval);
  }, [enabled, config.attemptId, state.violations]);

  return {
    ...state,
    recentViolations,
    logViolation,
    sessionId: sessionId.current,
    getVideoElement,
    getStream,
  };
};
