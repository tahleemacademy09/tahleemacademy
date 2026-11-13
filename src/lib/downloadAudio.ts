// src/lib/downloadAudio.ts
// Reliable "Download recording" for staff. A plain <a download> is ignored by browsers when the file lives on another
// origin (R2 / Supabase signed links) — it just opens or plays the file. This fetches the bytes and saves a real file.

const EXT_BY_MIME: Record<string, string> = {
  "audio/webm": "webm", "video/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "video/mp4": "m4a",
  "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/aac": "aac", "audio/x-m4a": "m4a",
};

export const safeFileName = (s: string) =>
  (s || "recitation").replace(/[^\p{L}\p{N}_-]+/gu, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "recitation";

/** Save a Blob to the device. */
export function saveBlob(blob: Blob, baseName: string, ext?: string) {
  ext = ext || EXT_BY_MIME[(blob.type || "").split(";")[0]] || "webm";
  const a = document.createElement("a");
  const href = URL.createObjectURL(blob);
  a.href = href;
  a.download = `${safeFileName(baseName)}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

/** Fetch a recording URL and save it as a file. Returns false if it had to fall back to opening the link. */
export async function downloadAudio(url: string, baseName: string): Promise<boolean> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    saveBlob(await res.blob(), baseName);
    return true;
  } catch {
    window.open(url, "_blank", "noopener");
    return false;
  }
}

/** Fetch a recording URL as a Blob (for feeding it to the model test). */
export async function fetchAudioBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load audio (${res.status})`);
  return res.blob();
}
