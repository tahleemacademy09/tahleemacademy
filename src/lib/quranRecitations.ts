// src/lib/quranRecitations.ts
// Custom (admin-recorded) surah recitations: Supabase access + the audio
// segmentation helper that turns one full-surah recording into per-ayah
// timings.
//
// NOTE ON TABLE TYPES: `quran_recitations` is a brand-new table added by the
// accompanying migration and won't exist yet in the generated
// src/integrations/supabase/types.ts until `supabase gen types` is re-run.
// We use a loosely-typed `db` handle for it (same pattern already used
// elsewhere in this codebase for freshly-added tables) so this compiles
// immediately without waiting on codegen.
import { supabase } from "@/integrations/supabase/client";
import { storageSupabase } from "@/integrations/supabase/storageClient";
const db: any = supabase;

export const RECITATION_BUCKET = "quran-recitations";

export interface AyahTiming {
  ayah: number;   // 1-indexed, within the surah
  start: number;  // seconds within the audio file
  end: number;    // seconds within the audio file
}

export interface CustomRecitation {
  id: string;
  surah_number: number;
  reciter_name: string;
  reciter_name_ar: string | null;
  audio_path: string;
  ayah_timings: AyahTiming[];
  is_published: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export async function listRecitationsForSurah(surahNumber: number): Promise<CustomRecitation[]> {
  const { data, error } = await db
    .from("quran_recitations")
    .select("*")
    .eq("surah_number", surahNumber)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as CustomRecitation[];
}

export async function listAllRecitationSurahNumbers(): Promise<number[]> {
  const { data, error } = await db
    .from("quran_recitations")
    .select("surah_number")
    .eq("is_published", true);
  if (error) throw error;
  return Array.from(new Set((data ?? []).map((r: any) => r.surah_number as number)));
}

export function getRecitationAudioUrl(path: string): string {
  const { data } = storageSupabase.storage.from(RECITATION_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function saveRecitation(params: {
  id?: string;
  surahNumber: number;
  reciterName: string;
  reciterNameAr?: string;
  file?: File;              // provide when uploading new/replacement audio
  existingAudioPath?: string;
  timings: AyahTiming[];
  isPublished: boolean;
  userId: string;
}): Promise<void> {
  let audioPath = params.existingAudioPath;

  if (params.file) {
    const safeReciter = params.reciterName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const ext = (params.file.name.split(".").pop() || "mp3").toLowerCase();
    audioPath = `${params.surahNumber}/${safeReciter}-${Date.now()}.${ext}`;
    const { error: upErr } = await storageSupabase.storage
      .from(RECITATION_BUCKET)
      .upload(audioPath, params.file, { upsert: true, contentType: params.file.type || "audio/mpeg" });
    if (upErr) throw upErr;
  }

  if (!audioPath) throw new Error("No audio file provided and no existing audio to keep.");

  const row = {
    surah_number: params.surahNumber,
    reciter_name: params.reciterName,
    reciter_name_ar: params.reciterNameAr ?? null,
    audio_path: audioPath,
    ayah_timings: params.timings,
    is_published: params.isPublished,
    created_by: params.userId,
    updated_at: new Date().toISOString(),
  };

  if (params.id) {
    const { error } = await db.from("quran_recitations").update(row).eq("id", params.id);
    if (error) throw error;
  } else {
    const { error } = await db.from("quran_recitations").insert(row);
    if (error) throw error;
  }
}

export async function deleteRecitation(id: string, audioPath: string): Promise<void> {
  const { error } = await db.from("quran_recitations").delete().eq("id", id);
  if (error) throw error;
  await storageSupabase.storage.from(RECITATION_BUCKET).remove([audioPath]);
}

// ── Automatic verse-boundary detection ───────────────────────────────────
// Decodes the recording client-side and looks for pauses (low-energy gaps)
// between verses. This is a best-guess based on silence detection, not a
// transcription — it reliably finds the biggest pauses in the recording, so
// it works well when the reciter leaves a clear breath/pause between verses.
// The admin reviews and can nudge every boundary afterwards in the UI before
// publishing, since automatic detection can occasionally misplace a verse
// break (e.g. long verses with a mid-verse breath, or a reciter who runs
// two short verses together).
export interface AudioEnvelope {
  duration: number;
  windowSeconds: number;   // duration represented by each envelope sample
  values: number[];        // normalized 0..1 amplitude per window
}

async function decodeArrayBuffer(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  const audioCtx = new AudioCtx();
  try {
    return await audioCtx.decodeAudioData(arrayBuffer);
  } finally {
    audioCtx.close().catch(() => {});
  }
}

async function analyzeAudioBuffer(audioBuffer: AudioBuffer): Promise<AudioEnvelope> {
  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const windowSize = Math.max(1, Math.floor(sampleRate * 0.05)); // ~50ms windows
  const numWindows = Math.floor(channelData.length / windowSize);

  const rms: number[] = new Array(numWindows);
  for (let i = 0; i < numWindows; i++) {
    let sum = 0;
    const start = i * windowSize;
    for (let j = 0; j < windowSize; j++) {
      const v = channelData[start + j];
      sum += v * v;
    }
    rms[i] = Math.sqrt(sum / windowSize);
  }
  const maxRms = Math.max(...rms, 1e-9);
  return { duration: audioBuffer.duration, windowSeconds: windowSize / sampleRate, values: rms.map(v => v / maxRms) };
}

export async function analyzeAudioFile(file: File): Promise<AudioEnvelope> {
  return analyzeAudioBuffer(await decodeArrayBuffer(await file.arrayBuffer()));
}

export async function analyzeAudioUrl(url: string): Promise<AudioEnvelope> {
  const res = await fetch(url);
  return analyzeAudioBuffer(await decodeArrayBuffer(await res.arrayBuffer()));
}

// Best-guess verse boundaries from an envelope — looks for the biggest pauses
// (low-energy gaps) and picks (verseCount - 1) of them. This is a heuristic,
// not a transcription: it works well when the reciter leaves a clear pause
// between verses, but the admin should review and can drag/nudge every
// boundary afterwards before publishing (long verses with a mid-verse
// breath, or two short verses run together, can occasionally be misplaced).
export function detectVerseBoundariesFromEnvelope(env: AudioEnvelope, verseCount: number): number[] {
  const SILENCE_THRESH = 0.08;
  const MIN_SILENCE_WINDOWS = 4; // ~200ms minimum pause to count as a gap

  const gaps: { start: number; end: number }[] = [];
  let runStart: number | null = null;
  for (let i = 0; i < env.values.length; i++) {
    if (env.values[i] < SILENCE_THRESH) {
      if (runStart === null) runStart = i;
    } else if (runStart !== null) {
      if (i - runStart >= MIN_SILENCE_WINDOWS) gaps.push({ start: runStart, end: i });
      runStart = null;
    }
  }
  if (runStart !== null && env.values.length - runStart >= MIN_SILENCE_WINDOWS) {
    gaps.push({ start: runStart, end: env.values.length });
  }

  const candidates = gaps.map(g => ({
    time: ((g.start + g.end) / 2) * env.windowSeconds,
    duration: (g.end - g.start) * env.windowSeconds,
  }));

  const needed = verseCount - 1;
  if (needed <= 0) return [];

  if (candidates.length < needed) {
    const even: number[] = [];
    for (let i = 1; i < verseCount; i++) even.push((env.duration / verseCount) * i);
    return even;
  }

  const chosen = [...candidates].sort((a, b) => b.duration - a.duration).slice(0, needed).sort((a, b) => a.time - b.time);
  return chosen.map(c => Math.round(c.time * 100) / 100);
}

export function boundariesToTimings(boundaries: number[], totalDuration: number): AyahTiming[] {
  const timings: AyahTiming[] = [];
  const points = [0, ...boundaries, totalDuration];
  for (let i = 0; i < points.length - 1; i++) {
    timings.push({ ayah: i + 1, start: points[i], end: points[i + 1] });
  }
  return timings;
}
