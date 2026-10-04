// Shared LiveKit room options tuned for low heat and battery use on phones,
// while keeping audio quality high (this is a Qur'an class: clear audio first).
//
// What drives heat/battery on a phone in a video call:
//   1. Encoding the phone's own camera (resolution x fps x codec)
//   2. Decoding other people's video (how many streams, at what resolution)
//   3. Anything that keeps streams alive when nobody can see them
// These defaults cut all three without touching audio.

export const isMobileDevice = (): boolean => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const touch = typeof window !== "undefined" && "ontouchstart" in window && window.innerWidth < 900;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || touch;
};

export const getLiveKitRoomOptions = (mobile: boolean = isMobileDevice()) => ({
  // Only receive the video resolution each tile actually needs, and pause
  // video for tiles that are hidden or when the tab is in the background.
  // pixelDensity 1 on phones: a high-DPI phone otherwise asks for 3x the
  // pixels (a 720p stream for a 390px tile).
  adaptiveStream: { pixelDensity: mobile ? 1 : ("screen" as const) },
  // Stop encoding video layers that nobody is subscribed to.
  dynacast: true,
  disconnectOnPageLeave: false,
  audioCaptureDefaults: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
  },
  publishDefaults: {
    audioPreset: { maxBitrate: 64_000 },
    // DTX off on purpose: it can clip the first syllable after a pause,
    // which matters for tajweed correction.
    dtx: false,
    red: true,
    stopMicTrackOnMute: false,
    simulcast: true,
    videoEncoding: mobile
      ? { maxBitrate: 450_000, maxFramerate: 20 }
      : { maxBitrate: 1_200_000, maxFramerate: 30 },
  },
  videoCaptureDefaults: mobile
    ? { resolution: { width: 640, height: 360, frameRate: 20 }, facingMode: "user" as const }
    : { resolution: { width: 1280, height: 720, frameRate: 30 }, facingMode: "user" as const },
});
