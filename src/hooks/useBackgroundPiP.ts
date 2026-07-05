// src/hooks/useBackgroundPiP.ts
// ─────────────────────────────────────────────────────────────────────────
// EXPERIMENTAL: a second, additional keep-alive layer for the PWA/browser
// case, alongside (NOT replacing) the existing audio keep-alive in
// useBackgroundAudio.ts.
//
// WHY THIS EXISTS:
// Chrome suspends live microphone capture (getUserMedia audio) the moment
// document.visibilityState becomes "hidden" — this is a hard privacy rule
// and cannot be worked around with silent audio tricks (those only grant
// *playback* focus, which is a completely different, unrestricted
// permission from *capture*).
//
// Real system Picture-in-Picture is a genuine, OS-level exception: while a
// video element is in PiP, Android keeps that content visibly on-screen in
// a floating window, and Chrome does NOT flip document.visibilityState to
// "hidden" for that tab. The hope is that this also keeps the mic capture
// pipeline alive, since it's tied to the same visibility signal.
//
// THIS IS UNPROVEN for the mic-survival case specifically — it's a real,
// sanctioned browser mechanism, but whether it actually keeps getUserMedia
// audio alive on every Android/OEM combination has not been confirmed.
// Test it directly on-device.
//
// HARD LIMITATION: requestPictureInPicture() only succeeds when called
// from inside a genuine user-gesture handler (a tap/click). It will be
// rejected if triggered from visibilitychange, appStateChange, or any other
// lifecycle/background event. That means this only has a chance to engage
// when the user taps the in-app "Minimize" button — NOT when they press the
// phone's physical home button or switch apps another way.

const LOGO_URL = "/icons/icon-512x512.png";
const LOGO_BG = "#064E3B"; // Tahleem dark green

let videoEl: HTMLVideoElement | null = null;
let canvasEl: HTMLCanvasElement | null = null;
let canvasStream: MediaStream | null = null;
let logoImg: HTMLImageElement | null = null;
let rafId: number | null = null;
let currentMode: "camera" | "logo" | null = null;

function ensureElements() {
  if (!videoEl) {
    videoEl = document.createElement("video");
    videoEl.muted = true;
    videoEl.playsInline = true;
    videoEl.setAttribute("playsinline", "true");
    videoEl.setAttribute("aria-hidden", "true");
    // Tapping the PiP window brings the browser/app to the foreground, but
    // does NOT know anything about the classroom's own minimized state —
    // it just fires this native event. Reuse the same restore signal the
    // foreground-service notification tap already uses, so tapping the PiP
    // window reliably brings the user back into the live class instead of
    // just whatever page happens to be underneath.
    videoEl.addEventListener("leavepictureinpicture", () => {
      window.dispatchEvent(new CustomEvent("tahleem:live-class-return"));
    });
    // NOT display:none — PiP requires the element to be an actual rendering
    // video, not a hidden one. Tucked off-screen instead, near-invisible.
    // Deliberately a modest, non-trivial size rather than near-zero (2px).
    // Chrome tends to base the initial floating PiP window size on this
    // element's rendered box, so a tiny box can cause Android to fall back
    // to an oversized default. Still positioned off-screen so it's never
    // actually visible in the page itself.
    videoEl.width = 120;
    videoEl.height = 120;
    Object.assign(videoEl.style, {
      position: "fixed",
      width: "120px",
      height: "120px",
      opacity: "0.01",
      pointerEvents: "none",
      left: "-9999px",
      top: "-9999px",
    });
    document.body.appendChild(videoEl);
  }
  if (!canvasEl) {
    canvasEl = document.createElement("canvas");
    canvasEl.width = 160;
    canvasEl.height = 160;
  }
  if (!logoImg) {
    logoImg = new Image();
    logoImg.src = LOGO_URL;
  }
}

function drawLogoFrame() {
  if (!canvasEl) return;
  const ctx = canvasEl.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = LOGO_BG;
  ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);
  if (logoImg && logoImg.complete && logoImg.naturalWidth > 0) {
    const size = 100;
    const x = (canvasEl.width - size) / 2;
    const y = (canvasEl.height - size) / 2;
    ctx.drawImage(logoImg, x, y, size, size);
  }
}

function startLogoLoop() {
  stopLogoLoop();
  const loop = () => {
    drawLogoFrame();
    rafId = requestAnimationFrame(loop);
  };
  loop();
}

function stopLogoLoop() {
  if (rafId != null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

/** Point the hidden PiP video at either the live camera track (video on) or
 *  a static school-logo canvas feed (audio only). Safe to call any time —
 *  before, during, or after PiP is active; the floating window updates
 *  live, so toggling the camera mid-call while minimized just switches
 *  what's showing in the PiP window without needing to re-request PiP. */
export function setPiPSource(cameraTrack: MediaStreamTrack | null) {
  ensureElements();
  if (!videoEl) return;

  if (cameraTrack && cameraTrack.readyState === "live") {
    if (currentMode === "camera") return;
    stopLogoLoop();
    videoEl.srcObject = new MediaStream([cameraTrack]);
    videoEl.play().catch(() => {});
    currentMode = "camera";
  } else {
    if (currentMode === "logo") return;
    if (!canvasStream && canvasEl) {
      canvasStream = canvasEl.captureStream(2); // 2 fps — plenty for a static logo
    }
    startLogoLoop();
    videoEl.srcObject = canvasStream;
    videoEl.play().catch(() => {});
    currentMode = "logo";
  }
}

/** MUST be called synchronously from within a real user-gesture handler
 *  (e.g. the Minimize button's onClick). Returns true if PiP was entered. */
export async function enterPiPKeepAlive(cameraTrack: MediaStreamTrack | null): Promise<boolean> {
  if (typeof document === "undefined") return false;
  if (!("pictureInPictureEnabled" in document) || !document.pictureInPictureEnabled) return false;

  ensureElements();
  setPiPSource(cameraTrack);

  // Already showing — some Android WebView versions treat a repeat
  // requestPictureInPicture() call on an already-active element as a
  // toggle-off rather than a no-op, which was closing the window on a
  // second back-press. Just refresh the content and stop here.
  if (document.pictureInPictureElement === videoEl) return true;

  try {
    await videoEl!.play().catch(() => {});
    if (document.pictureInPictureElement && document.pictureInPictureElement !== videoEl) {
      await document.exitPictureInPicture().catch(() => {});
    }
    await videoEl!.requestPictureInPicture();
    return true;
  } catch (e) {
    console.warn("[BackgroundPiP] requestPictureInPicture failed:", e);
    return false;
  }
}

export async function exitPiPKeepAlive(): Promise<void> {
  try {
    if (document.pictureInPictureElement === videoEl) {
      await document.exitPictureInPicture();
    }
  } catch {}
  stopLogoLoop();
  currentMode = null;
}

export const isPiPActive = () =>
  typeof document !== "undefined" && document.pictureInPictureElement === videoEl;
