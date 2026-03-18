/*  src/hooks/useProctoring.ts
    Fixed: video element appended to DOM (prevents Android killing stream)
    Fixed: snapshot loop restarts after reconnect
    Fixed: continuous face detection
    Fixed: all violation types properly detected and logged
*/
import { useEffect, useRef, useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

interface ProctoringConfig {
  attemptId: string; userId: string;
  proctoring_enabled?: boolean; fullscreen_required?: boolean;
  tab_switch_limit?: number; screenshot_interval_seconds?: number;
  max_warnings?: number; auto_submit_on_violation?: boolean;
  webcam_required?: boolean; record_audio?: boolean;
}

interface ProctoringState {
  violations: number; warnings: number; strikes: number; maxStrikes: number;
  integrityScore: number; suspicionLevel: string; fullscreenActive: boolean;
  shouldAutoSubmit: boolean; cameraReady: boolean; faceDetected: boolean;
  audioMonitoring: boolean; lastWarningType: string | null;
}

const rndInterval = (minS: number, maxS: number) =>
  (Math.floor(Math.random() * (maxS - minS + 1)) + minS) * 1000;

export const useProctoring = (
  config: ProctoringConfig,
  enabled: boolean,
  onAutoSubmit?: () => void
) => {
  const [state, setState] = useState<ProctoringState>({
    violations: 0, warnings: 0, strikes: 0,
    maxStrikes: config.max_warnings || 3,
    integrityScore: 100, suspicionLevel: "low",
    fullscreenActive: false, shouldAutoSubmit: false,
    cameraReady: false, faceDetected: true,
    audioMonitoring: false, lastWarningType: null,
  });

  const [recentViolations, setRecentViolations] = useState<
    Array<{ type: string; time: string; details: string }>
  >([]);

  const sessionId       = useRef<string | null>(null);
  const violationCount  = useRef(0);
  const warningCount    = useRef(0);
  const strikeCount     = useRef(0);
  const streamRef       = useRef<MediaStream | null>(null);
  const audioStreamRef  = useRef<MediaStream | null>(null);
  const audioCtxRef     = useRef<AudioContext | null>(null);
  const analyserRef     = useRef<AnalyserNode | null>(null);
  const audioMonRef     = useRef<ReturnType<typeof setInterval>>();
  const cameraReadyRef  = useRef(false);
  const enabledRef      = useRef(enabled);
  const snapshotTimer   = useRef<ReturnType<typeof setTimeout>>();
  const faceAbsTimer    = useRef<ReturnType<typeof setTimeout>>();
  const faceDetectIv    = useRef<ReturnType<typeof setInterval>>();
  const tabAwayStart    = useRef<number | null>(null);
  const reconnecting    = useRef(false);
  const snapshotCount   = useRef(0);
  const noiseCount      = useRef(0);

  // KEY FIX: video element stays in DOM (hidden) so Android doesn't kill stream
  const videoElRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => { enabledRef.current = enabled; }, [enabled]);

  // ── Create hidden video element attached to DOM ──────────────────
  useEffect(() => {
    if (!enabled) return;
    const el = document.createElement("video");
    el.setAttribute("playsinline", "true");
    el.setAttribute("muted", "true");
    el.muted = true;
    el.autoplay = true;
    el.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;top:0;left:0;pointer-events:none;z-index:-1;";
    document.body.appendChild(el);
    videoElRef.current = el;
    return () => {
      try { document.body.removeChild(el); } catch (_) {}
      videoElRef.current = null;
    };
  }, [enabled]);

  // ── Score helpers ──────────────────────────────────────────────
  const calcSuspicion = (v: number) =>
    v >= 10 ? "critical" : v >= 5 ? "high" : v >= 2 ? "medium" : "low";
  const calcIntegrity = (v: number) => Math.max(0, 100 - v * 8);

  // ── Upload with retry ─────────────────────────────────────────
  const uploadWithRetry = useCallback(async (path: string, blob: Blob): Promise<boolean> => {
    for (let i = 0; i < 3; i++) {
      const { error } = await supabase.storage.from("proctoring-media")
        .upload(path, blob, { contentType: "image/jpeg", upsert: true });
      if (!error) return true;
      await new Promise(r => setTimeout(r, 1500 * (i + 1)));
    }
    return false;
  }, []);

  // ── Capture snapshot ─────────────────────────────────────────
  const captureSnapshot = useCallback(async (trigger = "periodic") => {
    const video = videoElRef.current;
    if (!video || !cameraReadyRef.current || video.readyState < 2) return;
    if (!config.attemptId || !config.userId) return;

    try {
      const canvas = document.createElement("canvas");
      const W = video.videoWidth || 320;
      const H = video.videoHeight || 240;
      const scale = Math.min(1, 480 / Math.max(W, H));
      canvas.width = Math.round(W * scale);
      canvas.height = Math.round(H * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, "image/jpeg", 0.7));
      if (!blob || blob.size < 500 || blob.size > 800_000) return;

      const ts   = Date.now();
      const path = `${config.userId}/${config.attemptId}/face_${trigger}_${ts}.jpg`;
      const ok   = await uploadWithRetry(path, blob);
      if (!ok) return;

      snapshotCount.current++;
      await supabase.from("proctoring_media").insert({
        attempt_id: config.attemptId,
        file_type: "face_snapshot",
        file_url: path,
        file_name: `face_${trigger}_${ts}.jpg`,
        file_size: blob.size,
        metadata: { timestamp: new Date(ts).toISOString(), type: trigger, seq: snapshotCount.current },
      });
      logger.log(`[Proctoring] Snapshot #${snapshotCount.current} saved (${trigger})`);
    } catch (e) {
      logger.warn("[Proctoring] Snapshot error:", e);
    }
  }, [config.attemptId, config.userId, uploadWithRetry]);

  // ── Log violation ─────────────────────────────────────────────
  const logViolation = useCallback(async (
    type: string, severity: number, details?: string
  ) => {
    if (!config.attemptId) return;
    violationCount.current++;
    const newCount   = violationCount.current;
    const newSusp    = calcSuspicion(newCount);
    const newInteg   = calcIntegrity(newCount);

    setState(prev => ({
      ...prev, violations: newCount,
      integrityScore: newInteg, suspicionLevel: newSusp,
      lastWarningType: type,
    }));

    // Save to DB
    try {
      await (supabase as any).from("violations").insert({
        attempt_id: config.attemptId,
        violation_type: type, severity_score: severity,
        details, screenshot_url: null,
      });
      if (sessionId.current) {
        await supabase.from("proctoring_sessions").update({
          total_violations: newCount, integrity_score: newInteg,
          suspicion_level: newSusp, updated_at: new Date().toISOString(),
        }).eq("id", sessionId.current);
      }
      await supabase.from("exam_attempts").update({
        suspicion_level: newSusp, integrity_score: newInteg,
      }).eq("id", config.attemptId);
    } catch (_) {}

    // Capture snapshot on medium+ violations
    if (severity >= 2 && cameraReadyRef.current) {
      captureSnapshot(`violation_${type}`);
    }

    // Strikes — only severity 2+ causes strikes and point deductions
    if (severity >= 2) {
      warningCount.current++;
      setState(prev => ({ ...prev, warnings: warningCount.current }));
      const isHighRisk = ["multiple_faces", "phone_detected", "webcam_disabled", "dev_tools"].includes(type);
      strikeCount.current += isHighRisk ? 2 : 1;
      const maxStrikes = config.max_warnings || 3;
      setState(prev => ({ ...prev, strikes: strikeCount.current, maxStrikes }));
      if (config.auto_submit_on_violation && strikeCount.current >= maxStrikes) {
        setState(prev => ({ ...prev, shouldAutoSubmit: true }));
        onAutoSubmit?.();
      }
    }
    // severity 1 = warning banner shown but NO points deducted, NO strike

    // Refresh violations list
    try {
      const { data } = await (supabase as any).from("violations")
        .select("violation_type,created_at,details")
        .eq("attempt_id", config.attemptId)
        .order("created_at", { ascending: false }).limit(15);
      if (data) {
        setRecentViolations((data as any[]).map((v: any) => ({
          type: v.violation_type,
          time: new Date(v.created_at).toLocaleTimeString(),
          details: v.details || "",
        })));
      }
    } catch (_) {}
  }, [config.attemptId, config.max_warnings, config.auto_submit_on_violation, onAutoSubmit, captureSnapshot]);

  // ── Camera init — attaches to DOM video element ───────────────
  const initCamera = useCallback(async (retry = 0): Promise<boolean> => {
    if (reconnecting.current && retry === 0) return false;
    reconnecting.current = true;

    const isMobile = /mobile|android|iphone/i.test(navigator.userAgent);
    try {
      // Stop any existing stream first
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width:  { ideal: isMobile ? 320 : 640 },
          height: { ideal: isMobile ? 240 : 480 },
        },
      });

      streamRef.current = stream;

      // Attach to the DOM-attached video element
      const video = videoElRef.current;
      if (video) {
        video.srcObject = stream;
        await new Promise<void>((res, rej) => {
          const timeout = setTimeout(() => rej(new Error("Video load timeout")), 8000);
          video.onloadeddata = () => { clearTimeout(timeout); res(); };
          video.onerror = () => { clearTimeout(timeout); rej(new Error("Video load error")); };
          video.play().catch(rej);
        });
      }

      cameraReadyRef.current = true;
      reconnecting.current   = false;
      setState(prev => ({ ...prev, cameraReady: true, faceDetected: true }));
      logger.log("[Proctoring] Camera ready ✅");

      // Also attach to the visible preview element if it exists
      const displayEl = document.getElementById("proctor-display-video") as HTMLVideoElement;
      if (displayEl) { displayEl.srcObject = stream; displayEl.play().catch(() => {}); }

      // Watch for stream ending (Android kills camera when app backgrounds)
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        logger.warn("[Proctoring] Camera track ended — reconnecting");
        cameraReadyRef.current = false;
        setState(prev => ({ ...prev, cameraReady: false, faceDetected: false }));
        reconnecting.current = false;
        if (enabledRef.current) {
          setTimeout(() => initCamera(), 2000);
          logViolation("webcam_disabled", 3, "Camera stream ended unexpectedly");
        }
      });

      return true;
    } catch (e: any) {
      logger.warn(`[Proctoring] Camera failed (attempt ${retry + 1}):`, e.message);
      if (retry < 2) {
        await new Promise(r => setTimeout(r, 2000));
        return initCamera(retry + 1);
      }
      reconnecting.current = false;
      logViolation("webcam_disabled", 3, `Camera access failed: ${e.message}`);
      return false;
    }
  }, [logViolation]);

  // ── Snapshot scheduler — restarts automatically ───────────────
  const scheduleSnapshot = useCallback(() => {
    if (snapshotTimer.current) clearTimeout(snapshotTimer.current);
    const base   = (config.screenshot_interval_seconds || 30);
    const minSec = Math.max(10, Math.floor(base * 0.6));
    const maxSec = Math.floor(base * 1.4);
    const delay  = rndInterval(minSec, maxSec);

    snapshotTimer.current = setTimeout(async () => {
      if (!enabledRef.current) return;
      if (cameraReadyRef.current) await captureSnapshot("periodic");
      scheduleSnapshot(); // always reschedule
    }, delay);
  }, [config.screenshot_interval_seconds, captureSnapshot]);

  // ── Init session ──────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !config.attemptId) return;
    (async () => {
      // Create proctoring session
      try {
        const { data } = await supabase.from("proctoring_sessions").insert({
          attempt_id: config.attemptId,
          webcam_enabled: true,
          microphone_enabled: config.record_audio || false,
          fullscreen_active: false,
          max_warnings: config.max_warnings || 3,
        }).select("id").single();
        if (data) sessionId.current = data.id;
      } catch (_) {}

      // Init camera
      const camOk = await initCamera();
      if (camOk) {
        // Initial snapshot right away
        setTimeout(() => captureSnapshot("initial_capture"), 1000);
        // Start periodic snapshots
        scheduleSnapshot();
      }

      // Audio monitoring
      if (config.record_audio) {
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          audioStreamRef.current = audioStream;
          const ctx  = new AudioContext();
          const src  = ctx.createMediaStreamSource(audioStream);
          const ana  = ctx.createAnalyser();
          ana.fftSize = 256;
          src.connect(ana);
          audioCtxRef.current = ctx;
          analyserRef.current = ana;
          const buf = new Uint8Array(ana.frequencyBinCount);
          audioMonRef.current = setInterval(() => {
            if (!enabledRef.current || !analyserRef.current) return;
            analyserRef.current.getByteFrequencyData(buf);
            const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
            const pct = (avg / 128) * 100;
            if (pct > 40) { noiseCount.current++; if (noiseCount.current >= 3) { logViolation("unusual_audio", 2, `Sustained noise: ${Math.round(pct)}%`); noiseCount.current = 0; } }
            else { noiseCount.current = Math.max(0, noiseCount.current - 1); }
          }, 2000);
          setState(prev => ({ ...prev, audioMonitoring: true }));
        } catch (_) {}
      }
    })();

    return () => {
      if (sessionId.current) {
        supabase.from("proctoring_sessions").update({
          ended_at: new Date().toISOString(), fullscreen_active: false,
        }).eq("id", sessionId.current).then(() => {});
      }
      streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null;
      audioStreamRef.current?.getTracks().forEach(t => t.stop()); audioStreamRef.current = null;
      if (audioCtxRef.current?.state !== "closed") audioCtxRef.current?.close().catch(() => {});
      if (audioMonRef.current) clearInterval(audioMonRef.current);
      if (snapshotTimer.current) clearTimeout(snapshotTimer.current);
      if (faceDetectIv.current) clearInterval(faceDetectIv.current);
      if (faceAbsTimer.current) clearTimeout(faceAbsTimer.current);
      cameraReadyRef.current = false;
    };
  }, [enabled, config.attemptId]);

  // ── Face detection — 1.5s interval, warns after 2 fails (~3s) ──
  useEffect(() => {
    if (!enabled) return;
    let consecutiveAbsent = 0;
    const ABSENT_THRESHOLD = 2;   // 2 × 1.5s = 3 seconds to detect
    const WARN_COOLDOWN    = 12000; // re-warn every 12s if still absent
    let lastFaceWarn = 0;
    let fdInstance: any = null;

    // Create FaceDetector once (reuse — creating per-frame is slow)
    if ("FaceDetector" in window) {
      try { fdInstance = new (window as any).FaceDetector({ maxDetectedFaces: 4, fastMode: true }); }
      catch (_) {}
    }

    faceDetectIv.current = setInterval(async () => {
      if (!cameraReadyRef.current) return;
      const video = videoElRef.current;
      if (!video || video.readyState < 2) return;

      let facePresent = false;
      let count = 0;

      // Method 1: FaceDetector API
      if (fdInstance) {
        try {
          const faces = await fdInstance.detect(video);
          count = faces.length;
          facePresent = count >= 1;
        } catch (_) { fdInstance = null; } // fallback if crashes
      }

      // Method 2: Canvas skin-tone (fallback or combined)
      if (!fdInstance) {
        try {
          const c = document.createElement("canvas");
          c.width = 120; c.height = 90;
          const ctx = c.getContext("2d");
          if (ctx) {
            ctx.drawImage(video, 0, 0, 120, 90);
            const { data } = ctx.getImageData(0, 0, 120, 90);
            let skin = 0;
            for (let i = 0; i < data.length; i += 12) {
              const r = data[i], g = data[i+1], b = data[i+2];
              if (r > 50 && g > 20 && b > 10 && r > g && r > b &&
                  Math.abs(r-g) < 130 && (r-b) > 8) skin++;
            }
            facePresent = (skin / (120*90/3)) > 0.018;
            count = facePresent ? 1 : 0;
          }
        } catch (_) {}
      }

      setState(prev => ({ ...prev, faceDetected: facePresent }));

      if (!facePresent) {
        consecutiveAbsent++;
        if (consecutiveAbsent >= ABSENT_THRESHOLD) {
          const now = Date.now();
          if (now - lastFaceWarn > WARN_COOLDOWN) {
            lastFaceWarn = now;
            consecutiveAbsent = 0;
            logViolation("face_not_detected", 1, "Face not visible");
            captureSnapshot("face_absent");
          }
        }
      } else {
        consecutiveAbsent = 0;
        if (count > 1) {
          const now = Date.now();
          if (now - lastFaceWarn > WARN_COOLDOWN) {
            lastFaceWarn = now;
            logViolation("multiple_faces", 3, `${count} faces detected`);
            captureSnapshot("multiple_faces");
          }
        }
      }
    }, 1500); // ← 1.5 seconds — sharp and fast

    return () => { if (faceDetectIv.current) clearInterval(faceDetectIv.current); };
  }, [enabled, logViolation, captureSnapshot]);

  // ── Camera health monitor (reconnect if stream lost) ─────────
  useEffect(() => {
    if (!enabled) return;
    const iv = setInterval(() => {
      if (!enabledRef.current) return;
      if (!streamRef.current && cameraReadyRef.current) {
        cameraReadyRef.current = false;
        setState(prev => ({ ...prev, cameraReady: false }));
        initCamera();
      } else if (streamRef.current) {
        const track = streamRef.current.getVideoTracks()[0];
        if (track && track.readyState === "ended") {
          cameraReadyRef.current = false;
          setState(prev => ({ ...prev, cameraReady: false }));
          reconnecting.current = false;
          initCamera();
        }
      }
    }, 5000);
    return () => clearInterval(iv);
  }, [enabled, initCamera]);

  // ── Fullscreen enforcement ────────────────────────────────────
  useEffect(() => {
    if (!enabled || !config.fullscreen_required) return;
    document.documentElement.requestFullscreen().catch(() => {});
    const h = () => {
      const isFS = !!document.fullscreenElement;
      setState(prev => ({ ...prev, fullscreenActive: isFS }));
      if (!isFS) {
        // Exited fullscreen — log but DON'T kill camera
        logViolation("fullscreen_exit", 2, "Exited fullscreen");
      } else {
        // Re-entered fullscreen — restart camera if it died
        if (!cameraReadyRef.current) {
          setTimeout(() => initCamera(), 500);
        }
        // Re-attach stream to display video
        setTimeout(() => {
          const displayEl = document.getElementById("proctor-display-video") as HTMLVideoElement;
          if (displayEl && streamRef.current && !displayEl.srcObject) {
            displayEl.srcObject = streamRef.current;
            displayEl.play().catch(() => {});
          }
        }, 600);
      }
    };
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, [enabled, config.fullscreen_required, logViolation, initCamera]);

  // ── Tab switch ────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;
    const h = () => {
      if (document.hidden) {
        tabAwayStart.current = Date.now();
        logViolation("tab_switch", 2, "Left exam window");
      } else if (tabAwayStart.current) {
        const away = Math.round((Date.now() - tabAwayStart.current) / 1000);
        tabAwayStart.current = null;
        if (away > 2) logViolation("tab_switch_return", 1, `Away for ${away}s`);
      }
    };
    document.addEventListener("visibilitychange", h);
    return () => document.removeEventListener("visibilitychange", h);
  }, [enabled, logViolation]);

  // ── Copy/paste/right-click ────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;
    const onCopy  = (e: ClipboardEvent) => { e.preventDefault(); logViolation("copy_paste", 2, "Copy attempt"); };
    const onPaste = (e: ClipboardEvent) => { logViolation("copy_paste", 1, "Paste attempt"); };
    const onRC    = (e: MouseEvent)     => { e.preventDefault(); logViolation("right_click", 1, "Right-click"); };
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    document.addEventListener("contextmenu", onRC);
    return () => {
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("contextmenu", onRC);
    };
  }, [enabled, logViolation]);

  // ── Dev tools ────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "F12" || (e.ctrlKey && e.shiftKey && "IJC".includes(e.key))) {
        e.preventDefault();
        logViolation("dev_tools", 3, "DevTools shortcut detected");
      }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [enabled, logViolation]);

  const getStream = useCallback(() => streamRef.current, []);

  return {
    ...state, recentViolations, logViolation,
    sessionId: sessionId.current, getStream,
  };
};
