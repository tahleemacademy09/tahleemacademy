/*  src/hooks/useProctoring.ts — SMART PROCTORING v3
    ✅ Face detection every 800ms (was 3s)
    ✅ Eye/gaze analysis via canvas brightness zones
    ✅ Camera covered detection (too dark)
    ✅ Auto-submit on beforeunload/pagehide/visibilityhidden
    ✅ No face for 4s → warning; 8s → strike
    ✅ Eyes not visible / not concentrating detected separately
*/
import { useEffect, useRef, useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { storageSupabase } from "../integrations/supabase/storageClient";
import { logger } from "@/lib/logger";

interface ProctoringConfig {
  attemptId: string; userId: string;
  proctoring_enabled?: boolean; fullscreen_required?: boolean;
  tab_switch_limit?: number; screenshot_interval_seconds?: number;
  max_warnings?: number; auto_submit_on_violation?: boolean;
  webcam_required?: boolean; record_audio?: boolean;
  /** 'exam' (default) or 'hifdh' — stored in proctoring_sessions for dashboard filtering */
  sessionType?: "exam" | "hifdh";
  /** Human-readable label, e.g. "Hifdh Test: Al-Baqarah" */
  contextLabel?: string;
  /** Exam ID — when set, enables the live-video grid: this student's camera is
   *  published to LiveKit ONLY while an admin actually has the live monitor
   *  grid open (via presence), never continuously. Omit to keep snapshot-only
   *  behaviour (e.g. Hifdh sessions, which don't have an admin live grid). */
  examId?: string;
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
  const faceDetectIv    = useRef<ReturnType<typeof setInterval>>();
  const tabAwayStart    = useRef<number | null>(null);
  const reconnecting    = useRef(false);
  const snapshotCount   = useRef(0);
  const noiseCount      = useRef(0);
  // Face absence tracking
  const faceAbsStart    = useRef<number | null>(null);
  const lastViolTime    = useRef<Record<string, number>>({});
  const fdInstance      = useRef<any>(null);
  // Continuous-condition violations should log ONCE per episode (when they
  // start), then go silent until the condition is corrected and happens
  // again — not repeatedly for as long as the condition persists.
  const faceWarnFired   = useRef(false);
  const faceStrikeFired = useRef(false);
  const lookingAwayActive     = useRef(false);
  const eyesNotVisibleActive  = useRef(false);
  const cameraCoveredActive   = useRef(false);
  const multipleFacesActive   = useRef(false);
  // Sustained-duration tracking — "looking away" / "eyes not visible" only
  // count once they've held for 3s straight (avoids flagging a quick glance),
  // then log ONCE for that episode (paired with the *Active flags above).
  const lookingAwayStart      = useRef<number | null>(null);
  const eyesNotVisibleStart   = useRef<number | null>(null);

  // Hidden video element attached to DOM — prevents Android killing stream
  const videoElRef = useRef<HTMLVideoElement | null>(null);

  // ── Live grid publishing (LiveKit) — gated by admin presence ───────
  const lkRoomRef        = useRef<any>(null);
  const lkTrackRef       = useRef<any>(null);
  const lkConnectingRef  = useRef(false);
  const presenceChanRef  = useRef<any>(null);
  const adminWatchingRef = useRef(false);

  useEffect(() => { enabledRef.current = enabled; }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const el = document.createElement("video");
    el.setAttribute("playsinline", "true");
    el.muted = true; el.autoplay = true;
    el.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;top:0;left:0;pointer-events:none;z-index:-1;";
    document.body.appendChild(el);
    videoElRef.current = el;
    // Init FaceDetector once
    if ("FaceDetector" in window) {
      try { fdInstance.current = new (window as any).FaceDetector({ maxDetectedFaces: 4, fastMode: false }); } catch (_) {}
    }
    return () => {
      try { document.body.removeChild(el); } catch (_) {}
      videoElRef.current = null;
    };
  }, [enabled]);

  const calcSuspicion = (v: number) =>
    v >= 10 ? "critical" : v >= 5 ? "high" : v >= 2 ? "medium" : "low";
  const calcIntegrity = (v: number) => Math.max(0, 100 - v * 8);

  const uploadWithRetry = useCallback(async (path: string, blob: Blob): Promise<boolean> => {
    for (let i = 0; i < 3; i++) {
      const { error } = await storageSupabase.storage.from("proctoring-media")
        .upload(path, blob, { contentType: "image/jpeg", upsert: true });
      if (!error) return true;
      await new Promise(r => setTimeout(r, 1500 * (i + 1)));
    }
    return false;
  }, []);

  const captureSnapshot = useCallback(async (trigger = "periodic") => {
    const video = videoElRef.current;
    if (!video || !cameraReadyRef.current || video.readyState < 2) return;
    if (!config.attemptId || !config.userId) return;
    try {
      const canvas = document.createElement("canvas");
      const W = video.videoWidth || 320, H = video.videoHeight || 240;
      const scale = Math.min(1, 480 / Math.max(W, H));
      canvas.width = Math.round(W * scale); canvas.height = Math.round(H * scale);
      const ctx = canvas.getContext("2d"); if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, "image/jpeg", 0.7));
      if (!blob || blob.size < 500 || blob.size > 800_000) return;
      const ts = Date.now();
      const path = `${config.userId}/${config.attemptId}/face_${trigger}_${ts}.jpg`;
      const ok = await uploadWithRetry(path, blob);
      if (!ok) return;
      snapshotCount.current++;
      await supabase.from("proctoring_media").insert({
        attempt_id: config.attemptId, file_type: "face_snapshot",
        file_url: path, file_name: `face_${trigger}_${ts}.jpg`,
        file_size: blob.size,
        metadata: { timestamp: new Date(ts).toISOString(), type: trigger, seq: snapshotCount.current },
      });
    } catch (_) {}
  }, [config.attemptId, config.userId, uploadWithRetry]);

  const logViolation = useCallback(async (type: string, severity: number, details?: string) => {
    if (!config.attemptId) return;
    // Per-type cooldown to avoid spam
    const cooldowns: Record<string, number> = {
      face_not_detected: 2500, eyes_not_visible: 4000, looking_away: 4000,
      camera_covered: 3000, tab_switch: 3000, fullscreen_exit: 4000,
    };
    const cooldown = cooldowns[type] || 6000;
    const now = Date.now();
    if (lastViolTime.current[type] && now - lastViolTime.current[type] < cooldown) return;
    lastViolTime.current[type] = now;

    violationCount.current++;
    const newCount = violationCount.current;
    const newSusp  = calcSuspicion(newCount);
    const newInteg = calcIntegrity(newCount);

    setState(prev => ({ ...prev, violations: newCount, integrityScore: newInteg, suspicionLevel: newSusp, lastWarningType: type }));

    try {
      await (supabase as any).from("violations").insert({
        attempt_id: config.attemptId, violation_type: type,
        severity_score: severity, details,
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

    if (severity >= 2 && cameraReadyRef.current) captureSnapshot(`violation_${type}`);

    if (severity >= 2) {
      warningCount.current++;
      setState(prev => ({ ...prev, warnings: warningCount.current }));
      const isHighRisk = ["multiple_faces","phone_detected","webcam_disabled","dev_tools","camera_covered"].includes(type);
      strikeCount.current += isHighRisk ? 2 : 1;
      const maxStrikes = config.max_warnings || 3;
      setState(prev => ({ ...prev, strikes: strikeCount.current, maxStrikes }));
      if (config.auto_submit_on_violation && strikeCount.current >= maxStrikes) {
        setState(prev => ({ ...prev, shouldAutoSubmit: true }));
        onAutoSubmit?.();
      }
    }

    try {
      const { data } = await (supabase as any).from("violations")
        .select("violation_type,created_at,details")
        .eq("attempt_id", config.attemptId)
        .order("created_at", { ascending: false }).limit(15);
      if (data) setRecentViolations((data as any[]).map((v: any) => ({
        type: v.violation_type, time: new Date(v.created_at).toLocaleTimeString(), details: v.details || "",
      })));
    } catch (_) {}
  }, [config.attemptId, config.max_warnings, config.auto_submit_on_violation, onAutoSubmit, captureSnapshot]);

  // ── Smart face / eye / concentration analysis ────────────────────
  const analyzeFrame = useCallback(async () => {
    const video = videoElRef.current;
    if (!video || !cameraReadyRef.current || video.readyState < 2) return;

    const W = 160, H = 120;
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.drawImage(video, 0, 0, W, H);
    const { data } = ctx.getImageData(0, 0, W, H);

    // ── 1. Camera covered? (frame is too dark overall) ──────────────
    let totalBrightness = 0;
    for (let i = 0; i < data.length; i += 4) totalBrightness += (data[i] + data[i+1] + data[i+2]) / 3;
    const avgBrightness = totalBrightness / (data.length / 4);
    if (avgBrightness < 15) {
      setState(prev => ({ ...prev, faceDetected: false }));
      if (!cameraCoveredActive.current) {
        cameraCoveredActive.current = true;
        logViolation("camera_covered", 3, `Frame too dark: avg brightness ${avgBrightness.toFixed(1)}`);
      }
      faceAbsStart.current = null;
      return;
    }
    cameraCoveredActive.current = false; // recovered — next cover is a new episode

    // ── 2. Face detection ────────────────────────────────────────────
    let facePresent = false, faceCount = 0;

    // Method A: FaceDetector API (most accurate)
    if (fdInstance.current) {
      try {
        const faces = await fdInstance.current.detect(video);
        faceCount = faces.length;
        facePresent = faceCount >= 1;

        // ── 3. Eye/gaze analysis from FaceDetector bounding box ──────
        if (facePresent && faces[0]) {
          const face = faces[0];
          const fx = face.boundingBox.x, fy = face.boundingBox.y;
          const fw = face.boundingBox.width, fh = face.boundingBox.height;

          // Check if face is in an unusual position (looking away / down)
          const faceCenterX = fx + fw / 2;
          const faceCenterY = fy + fh / 2;
          const frameW = video.videoWidth || W;
          const frameH = video.videoHeight || H;

          // Face too far to the side = looking away
          const xRatio = faceCenterX / frameW;
          const yRatio = faceCenterY / frameH;
          // Tightened from 0.25/0.75 & 0.15/0.85 — catches a real head turn
          // sooner, while the 3s sustain requirement below (not an instant
          // trigger) keeps a quick glance from counting.
          if (xRatio < 0.32 || xRatio > 0.68 || yRatio < 0.20 || yRatio > 0.80) {
            if (!lookingAwayStart.current) lookingAwayStart.current = Date.now();
            if (Date.now() - lookingAwayStart.current >= 3000 && !lookingAwayActive.current) {
              lookingAwayActive.current = true;
              logViolation("looking_away", 1, `Sustained off-center 3s+: ${xRatio.toFixed(2)}, ${yRatio.toFixed(2)}`);
            }
          } else {
            lookingAwayStart.current = null;
            lookingAwayActive.current = false; // back on-center — next drift is a new episode
          }

          // Eye region brightness analysis
          // Eyes are roughly in the top 40% of the face bounding box
          const eyeRegionY = Math.round((fy * H / frameH));
          const eyeRegionH = Math.round((fh * 0.4 * H / frameH));
          const eyeRegionX = Math.round((fx * W / frameW));
          const eyeRegionW = Math.round((fw * W / frameW));

          if (eyeRegionH > 3 && eyeRegionW > 5) {
            const eyeData = ctx.getImageData(eyeRegionX, eyeRegionY, eyeRegionW, eyeRegionH);
            let darkPixels = 0;
            for (let i = 0; i < eyeData.data.length; i += 4) {
              const lum = (eyeData.data[i] + eyeData.data[i+1] + eyeData.data[i+2]) / 3;
              if (lum < 60) darkPixels++;
            }
            const darkRatio = darkPixels / (eyeData.data.length / 4);
            // If eye region is mostly dark, eyes might be closed or looking down.
            // Lowered from 0.60 → 0.55 (more sensitive) and now requires 3s
            // sustained before logging, same reasoning as looking_away above.
            if (darkRatio > 0.55) {
              if (!eyesNotVisibleStart.current) eyesNotVisibleStart.current = Date.now();
              if (Date.now() - eyesNotVisibleStart.current >= 3000 && !eyesNotVisibleActive.current) {
                eyesNotVisibleActive.current = true;
                logViolation("eyes_not_visible", 1, `Eye region ${(darkRatio * 100).toFixed(0)}% dark for 3s+ — eyes closed or looking down`);
              }
            } else {
              eyesNotVisibleStart.current = null;
              eyesNotVisibleActive.current = false; // eyes visible again — next occurrence is a new episode
            }
          }
        }
      } catch (_) { fdInstance.current = null; }
    }

    // Method B: Skin-tone canvas fallback
    if (!fdInstance.current) {
      let skinPixels = 0;
      // Focus on center 60% of frame where face should be
      const startX = Math.round(W * 0.2), endX = Math.round(W * 0.8);
      const startY = Math.round(H * 0.1), endY = Math.round(H * 0.9);
      const totalCenter = (endX - startX) * (endY - startY);
      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          const i = (y * W + x) * 4;
          const r = data[i], g = data[i+1], b = data[i+2];
          if (r > 60 && g > 30 && b > 15 && r > g && r > b &&
              Math.abs(r - g) < 120 && (r - b) > 12 && r < 250) skinPixels++;
        }
      }
      facePresent = (skinPixels / totalCenter) > 0.03; // 3% skin = face present (more sensitive)
      faceCount = facePresent ? 1 : 0;

      // Simple looking-away: check if skin is concentrated off-center
      if (!facePresent) {
        let skinLeft = 0, skinRight = 0;
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W / 2; x++) {
            const i = (y * W + x) * 4;
            const r = data[i], g = data[i+1], b = data[i+2];
            if (r > 60 && g > 30 && b > 15 && r > g && r > b) skinLeft++;
          }
          for (let x = W / 2; x < W; x++) {
            const i = (y * W + x) * 4;
            const r = data[i], g = data[i+1], b = data[i+2];
            if (r > 60 && g > 30 && b > 15 && r > g && r > b) skinRight++;
          }
        }
        if ((skinLeft > 600 || skinRight > 600) && Math.abs(skinLeft - skinRight) > 300) {
          facePresent = true; // face is there but off-center
          faceCount = 1;
          if (!lookingAwayStart.current) lookingAwayStart.current = Date.now();
          if (Date.now() - lookingAwayStart.current >= 3000 && !lookingAwayActive.current) {
            lookingAwayActive.current = true;
            logViolation("looking_away", 1, `Sustained off-center 3s+ L:${skinLeft} R:${skinRight}`);
          }
        } else {
          lookingAwayStart.current = null;
          lookingAwayActive.current = false;
        }
      }
    }

    setState(prev => ({ ...prev, faceDetected: facePresent }));

    if (!facePresent) {
      if (!faceAbsStart.current) faceAbsStart.current = Date.now();
      const absTime = Date.now() - faceAbsStart.current;
      // Face is gone entirely — any in-progress "looking away"/"eyes not
      // visible" timers are meaningless without a face to measure; reset
      // them so a later reappearance starts a clean 3s window, not a
      // stale one carried over from before the face disappeared.
      lookingAwayStart.current = null;
      eyesNotVisibleStart.current = null;
      lookingAwayActive.current = false;
      eyesNotVisibleActive.current = false;

      if (absTime >= 1500 && absTime < 4000 && !faceWarnFired.current) {
        // 1.5s absent → immediate warning (logged once for this absence episode)
        faceWarnFired.current = true;
        logViolation("face_not_detected", 1, `Face absent ${Math.round(absTime/1000)}s`);
      } else if (absTime >= 4000 && !faceStrikeFired.current) {
        // 4s absent → strike + snapshot (logged once — no longer repeats every 4s
        // while the student stays out of frame; correcting it resets both flags)
        faceStrikeFired.current = true;
        logViolation("face_not_detected", 2, `Face absent ${Math.round(absTime/1000)}s — possible cheating`);
        captureSnapshot("face_absent_extended");
      }
    } else {
      faceAbsStart.current = null; // reset timer
      faceWarnFired.current = false;
      faceStrikeFired.current = false; // face is back — next absence is a new episode
      if (faceCount > 1) {
        if (!multipleFacesActive.current) {
          multipleFacesActive.current = true;
          logViolation("multiple_faces", 3, `${faceCount} faces detected in frame`);
          captureSnapshot("multiple_faces");
        }
      } else {
        multipleFacesActive.current = false; // back to one face — next occurrence is a new episode
      }
    }
  }, [logViolation, captureSnapshot]);

  const initCamera = useCallback(async (retry = 0): Promise<boolean> => {
    if (reconnecting.current && retry === 0) return false;
    reconnecting.current = true;
    const isMobile = /mobile|android|iphone/i.test(navigator.userAgent);
    try {
      if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: isMobile ? 320 : 640 }, height: { ideal: isMobile ? 240 : 480 } },
      });
      streamRef.current = stream;
      const video = videoElRef.current;
      if (video) {
        video.srcObject = stream;
        await new Promise<void>((res, rej) => {
          const timeout = setTimeout(() => rej(new Error("timeout")), 8000);
          video.onloadeddata = () => { clearTimeout(timeout); res(); };
          video.onerror = () => { clearTimeout(timeout); rej(new Error("error")); };
          video.play().catch(rej);
        });
      }
      cameraReadyRef.current = true;
      reconnecting.current = false;
      setState(prev => ({ ...prev, cameraReady: true, faceDetected: true }));
      // Attach to display element with retry — Android needs extra time
      const attachDisplay = (retries = 0) => {
        const displayEl = document.getElementById("proctor-display-video") as HTMLVideoElement;
        if (displayEl) {
          displayEl.srcObject = stream;
          displayEl.muted = true;
          displayEl.setAttribute("playsinline", "true");
          displayEl.play().catch(() => {});
        } else if (retries < 5) {
          setTimeout(() => attachDisplay(retries + 1), 500);
        }
      };
      attachDisplay();
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        cameraReadyRef.current = false;
        setState(prev => ({ ...prev, cameraReady: false, faceDetected: false }));
        reconnecting.current = false;
        if (enabledRef.current) { setTimeout(() => initCamera(), 2000); logViolation("webcam_disabled", 3, "Camera ended"); }
      });
      return true;
    } catch (e: any) {
      const isPermission = e.name === "NotAllowedError" || e.name === "PermissionDeniedError";
      if (isPermission) {
        // Permission denied — don't retry, just log and report gracefully
        reconnecting.current = false;
        console.warn("Camera permission denied:", e.message);
        setState(prev => ({ ...prev, cameraReady: false }));
        return false;
      }
      if (retry < 3) {
        // Exponential backoff: 1s, 2s, 4s
        await new Promise(r => setTimeout(r, Math.pow(2, retry) * 1000));
        return initCamera(retry + 1);
      }
      reconnecting.current = false;
      logViolation("webcam_disabled", 3, `Camera failed after ${retry} retries: ${e.message}`);
      return false;
    }
  }, [logViolation]);

  const scheduleSnapshot = useCallback(() => {
    if (snapshotTimer.current) clearTimeout(snapshotTimer.current);
    const base = config.screenshot_interval_seconds || 30;
    const delay = rndInterval(Math.max(10, Math.floor(base * 0.6)), Math.floor(base * 1.4));
    snapshotTimer.current = setTimeout(async () => {
      if (!enabledRef.current) return;
      if (cameraReadyRef.current) await captureSnapshot("periodic");
      scheduleSnapshot();
    }, delay);
  }, [config.screenshot_interval_seconds, captureSnapshot]);

  // ── Main init ─────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !config.attemptId) return;
    (async () => {
      try {
        const { data } = await supabase.from("proctoring_sessions").insert({
          attempt_id: config.attemptId, webcam_enabled: true,
          microphone_enabled: config.record_audio || false,
          fullscreen_active: false, max_warnings: config.max_warnings || 3,
          session_type: config.sessionType || "exam",
          context_label: config.contextLabel || null,
          student_id: config.userId || null,
        }).select("id").single();
        if (data) sessionId.current = data.id;
      } catch (_) {}

      const camOk = await initCamera();
      if (camOk) {
        setTimeout(() => captureSnapshot("initial_capture"), 1000);
        scheduleSnapshot();
      }

      if (config.record_audio) {
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          audioStreamRef.current = audioStream;
          const ctx = new AudioContext();
          const src = ctx.createMediaStreamSource(audioStream);
          const ana = ctx.createAnalyser(); ana.fftSize = 256;
          src.connect(ana);
          audioCtxRef.current = ctx; analyserRef.current = ana;
          const buf = new Uint8Array(ana.frequencyBinCount);
          audioMonRef.current = setInterval(() => {
            if (!enabledRef.current || !analyserRef.current) return;
            analyserRef.current.getByteFrequencyData(buf);
            const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
            if ((avg / 128) * 100 > 40) {
              noiseCount.current++;
              if (noiseCount.current >= 3) { logViolation("unusual_audio", 2, `Noise: ${Math.round((avg/128)*100)}%`); noiseCount.current = 0; }
            } else { noiseCount.current = Math.max(0, noiseCount.current - 1); }
          }, 2000);
          setState(prev => ({ ...prev, audioMonitoring: true }));
        } catch (_) {}
      }
    })();

    return () => {
      if (sessionId.current) supabase.from("proctoring_sessions").update({ ended_at: new Date().toISOString() }).eq("id", sessionId.current).then(() => {});
      streamRef.current?.getTracks().forEach(t => t.stop());
      audioStreamRef.current?.getTracks().forEach(t => t.stop());
      if (audioCtxRef.current?.state !== "closed") audioCtxRef.current?.close().catch(() => {});
      if (audioMonRef.current)  clearInterval(audioMonRef.current);
      if (snapshotTimer.current) clearTimeout(snapshotTimer.current);
      if (faceDetectIv.current)  clearInterval(faceDetectIv.current);
      cameraReadyRef.current = false;
    };
  }, [enabled, config.attemptId]);

  // ── Fast face/eye detection — 800ms ──────────────────────────
  useEffect(() => {
    if (!enabled) return;
    faceDetectIv.current = setInterval(analyzeFrame, 400); // 400ms — fast enough to catch blinks
    return () => { if (faceDetectIv.current) clearInterval(faceDetectIv.current); };
  }, [enabled, analyzeFrame]);

  // ── Camera health monitor ──────────────────────────────────
  useEffect(() => {
    if (!enabled) return;
    const iv = setInterval(() => {
      if (!enabledRef.current) return;
      if (!streamRef.current || streamRef.current.getVideoTracks()[0]?.readyState === "ended") {
        cameraReadyRef.current = false;
        setState(prev => ({ ...prev, cameraReady: false }));
        reconnecting.current = false;
        initCamera();
      }
    }, 5000);
    return () => clearInterval(iv);
  }, [enabled, initCamera]);

  // ── Live grid publishing — connect to LiveKit ONLY while an admin has ──
  // the live monitor grid open (tracked via Supabase Presence), so idle
  // exams never pay for a live video connection. Video only, no audio,
  // low bitrate/framerate since this is just for cheating detection.
  useEffect(() => {
    if (!enabled || !config.examId || !config.attemptId || !config.userId) return;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const teardownLive = () => {
      if (retryTimer) clearTimeout(retryTimer);
      try { lkTrackRef.current?.stop(); } catch (_) {}
      try { lkRoomRef.current?.disconnect(); } catch (_) {}
      lkRoomRef.current = null;
      lkTrackRef.current = null;
      lkConnectingRef.current = false;
    };

    const publishLive = async () => {
      if (cancelled || lkRoomRef.current || lkConnectingRef.current) return;
      if (!cameraReadyRef.current || !streamRef.current) {
        retryTimer = setTimeout(publishLive, 1000);
        return;
      }
      lkConnectingRef.current = true;
      try {
        const [{ data }, lk] = await Promise.all([
          supabase.functions.invoke("livekit-token", { body: { room_name: `exam-proctor-${config.examId}` } }),
          import("livekit-client"),
        ]);
        if (cancelled || !adminWatchingRef.current || !data?.token || !data?.url) { lkConnectingRef.current = false; return; }
        const { Room, LocalVideoTrack, Track } = lk;
        const room = new Room({ adaptiveStream: false, dynacast: false });
        await room.connect(data.url, data.token);
        if (cancelled || !adminWatchingRef.current) { room.disconnect(); lkConnectingRef.current = false; return; }
        const videoTrack = streamRef.current.getVideoTracks()[0];
        if (!videoTrack) { room.disconnect(); lkConnectingRef.current = false; return; }
        const localTrack = new LocalVideoTrack(videoTrack);
        await room.localParticipant.publishTrack(localTrack, {
          name: "proctor-cam",
          source: Track.Source.Camera,
          simulcast: false,
          videoEncoding: { maxBitrate: 150_000, maxFramerate: 8 },
        });
        lkRoomRef.current = room;
        lkTrackRef.current = localTrack;
      } catch (_) {
        // Silent — live grid is a bonus view; snapshots keep working regardless.
      } finally {
        lkConnectingRef.current = false;
      }
    };

    const channel = supabase.channel(`exam-proctor-presence-${config.examId}`, {
      config: { presence: { key: `student-${config.userId}` } },
    });
    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState() as Record<string, any[]>;
      const adminWatching = Object.values(state).some(list =>
        list.some((p: any) => p.role === "admin_watching")
      );
      adminWatchingRef.current = adminWatching;
      if (adminWatching) publishLive(); else teardownLive();
    });
    channel.subscribe();
    presenceChanRef.current = channel;

    return () => {
      cancelled = true;
      teardownLive();
      try { channel.unsubscribe(); } catch (_) {}
      presenceChanRef.current = null;
    };
  }, [enabled, config.examId, config.attemptId, config.userId]);

  // ── Auto-submit on page close/hide ───────────────────────────
  // Uses sendBeacon for guaranteed delivery even on page unload
  // sendBeacon cannot call Supabase SDK directly — uses the REST API URL
  useEffect(() => {
    if (!enabled || !config.attemptId) return;

    const SUPA_URL = import.meta.env.VITE_SUPABASE_URL as string;
    const SUPA_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY) as string;

    // sendBeacon — guaranteed to fire even when page is closing
    const beaconSubmit = () => {
      if (!SUPA_URL || !SUPA_KEY) return;
      const payload = JSON.stringify({
        status: "submitted",
        submitted_at: new Date().toISOString(),
        notes: "Auto-submitted: exam window closed",
        suspicion_level: "window_closed",
      });
      const url = `${SUPA_URL}/rest/v1/exam_attempts?id=eq.${config.attemptId}`;
      navigator.sendBeacon(url,
        new Blob([payload], { type: "application/json" })
      );
      // Also log the violation via beacon
      const vPayload = JSON.stringify({
        attempt_id: config.attemptId,
        violation_type: "window_closed",
        severity_score: 3,
        details: "Student closed exam window or navigated away",
      });
      navigator.sendBeacon(
        `${SUPA_URL}/rest/v1/violations`,
        new Blob([vPayload], { type: "application/json" })
      );
    };

    // Async submit for cases where we have time (visibility hidden)
    const asyncSubmit = async () => {
      try {
        await supabase.from("exam_attempts").update({
          status: "submitted",
          submitted_at: new Date().toISOString(),
          notes: "Auto-submitted: exam window closed",
        }).eq("id", config.attemptId).eq("status", "in_progress"); // only if still in progress
      } catch (_) {}
    };

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "Your exam will be auto-submitted if you leave!";
      beaconSubmit(); // synchronous, guaranteed
    };

    const onPageHide = (e: PageTransitionEvent) => {
      if (!e.persisted) beaconSubmit(); // only if not entering bfcache
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        // Delayed async — if they come back quickly it cancels
        const t = setTimeout(asyncSubmit, 30000); // 30s away = auto-submit
        const cancel = () => { clearTimeout(t); document.removeEventListener("visibilitychange", cancel); };
        document.addEventListener("visibilitychange", cancel, { once: true });
      }
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, config.attemptId]);

  // ── Fullscreen ───────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !config.fullscreen_required) return;
    document.documentElement.requestFullscreen().catch(() => {});
    const h = () => {
      const isFS = !!document.fullscreenElement;
      setState(prev => ({ ...prev, fullscreenActive: isFS }));
      if (!isFS) logViolation("fullscreen_exit", 2, "Exited fullscreen");
      else if (!cameraReadyRef.current) setTimeout(() => initCamera(), 500);
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
    document.addEventListener("copy",        onCopy);
    document.addEventListener("paste",       onPaste);
    document.addEventListener("contextmenu", onRC);
    return () => {
      document.removeEventListener("copy",        onCopy);
      document.removeEventListener("paste",       onPaste);
      document.removeEventListener("contextmenu", onRC);
    };
  }, [enabled, logViolation]);

  // ── Dev tools ─────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "F12" || (e.ctrlKey && e.shiftKey && "IJC".includes(e.key))) {
        e.preventDefault(); logViolation("dev_tools", 3, "DevTools shortcut");
      }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [enabled, logViolation]);

  const getStream = useCallback(() => streamRef.current, []);

  return { ...state, recentViolations, logViolation, sessionId: sessionId.current, getStream };
};