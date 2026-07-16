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
import { getSurahText } from "@/lib/quranTextApi";
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

// ── Transcription-assisted verse boundaries ─────────────────────────────
// Silence detection alone (above) only knows about *pauses* — it has no
// idea what's actually being recited, so a mid-verse breath or two verses
// read back-to-back without a gap can throw it off. This pass instead
// transcribes the recording with word-level timestamps and walks the
// transcript against the *known* text of the surah being recorded, ayah by
// ayah, so each cut is placed using what was actually said rather than a
// guess from loudness. Boundaries are placed at the midpoint between the
// last word of one ayah and the first word of the next, specifically so a
// cut never bleeds into the following ayah's audio.
export interface WordTimestamp { word: string; start: number; end: number; }

interface TranscriptionResult {
  boundaries: number[];
  /** True if the transcript-to-text match was weak for one or more verses
   *  (e.g. the reciter skipped/repeated words, or Whisper mis-heard a
   *  stretch) — the admin should double-check the waveform in that region. */
  lowConfidenceAyahs: number[];
}

const CHUNK_SECONDS = 240; // ~4 min per Whisper call — comfortably under Groq's 25MB limit

function floatTo16BitPCM(view: DataView, offset: number, input: Float32Array) {
  for (let i = 0; i < input.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
}

// Encodes a slice of a decoded AudioBuffer as a mono 16-bit PCM WAV blob —
// small, universally accepted by Whisper, and lets us chunk a long
// recording by time without re-uploading/re-encoding the original file.
function sliceToWav(buffer: AudioBuffer, startSec: number, endSec: number): Blob {
  const sampleRate = buffer.sampleRate;
  const startSample = Math.max(0, Math.floor(startSec * sampleRate));
  const endSample = Math.min(buffer.length, Math.floor(endSec * sampleRate));
  const frameCount = Math.max(0, endSample - startSample);

  // Downmix to mono
  const mono = new Float32Array(frameCount);
  const channels = buffer.numberOfChannels;
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < frameCount; i++) mono[i] += data[startSample + i] / channels;
  }

  const bytesPerSample = 2;
  const blockAlign = bytesPerSample;
  const dataSize = frameCount * bytesPerSample;
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);
  const writeStr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };

  writeStr(0, "RIFF"); view.setUint32(4, 36 + dataSize, true); writeStr(8, "WAVE");
  writeStr(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); writeStr(36, "data"); view.setUint32(40, dataSize, true);
  floatTo16BitPCM(view, 44, mono);

  return new Blob([buf], { type: "audio/wav" });
}

async function transcribeChunk(blob: Blob, prompt: string): Promise<WordTimestamp[]> {
  const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL;
  const SUPABASE_KEY =
    (import.meta as any).env?.VITE_SUPABASE_ANON_KEY ||
    (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("Supabase env vars missing — cannot reach the transcription function.");

  const fd = new FormData();
  fd.append("file", blob, "chunk.wav");
  fd.append("timestamps", "word");
  fd.append("prompt", prompt);
  const r = await fetch(`${SUPABASE_URL}/functions/v1/groq-transcribe`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SUPABASE_KEY}`, apikey: SUPABASE_KEY },
    body: fd,
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json?.error || `groq-transcribe HTTP ${r.status}`);
  return Array.isArray(json?.words) ? json.words : [];
}

// Transcribes the whole recording (in time-chunks) with word timestamps.
export async function transcribeRecordingWords(file: File, promptHint = "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ"): Promise<WordTimestamp[]> {
  const buffer = await decodeArrayBuffer(await file.arrayBuffer());
  const chunks = Math.max(1, Math.ceil(buffer.duration / CHUNK_SECONDS));
  const allWords: WordTimestamp[] = [];
  for (let i = 0; i < chunks; i++) {
    const start = i * CHUNK_SECONDS;
    const end = Math.min(buffer.duration, start + CHUNK_SECONDS);
    const wav = sliceToWav(buffer, start, end);
    const words = await transcribeChunk(wav, promptHint);
    for (const w of words) allWords.push({ word: w.word, start: w.start + start, end: w.end + start });
  }
  return allWords;
}

// Strips diacritics/tatweel and normalizes letter variants so ASR output
// (which is rarely fully-diacritized) can be compared against the Uthmani
// Qur'an text on a token-by-token basis.
function normalizeArabicWord(s: string): string {
  return s
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .replace(/\u0640/g, "")
    .replace(/[إأآٱا]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/[ىي]/g, "ي")
    .replace(/[^\u0600-\u06FF]/g, "")
    .trim();
}

// Aligns transcribed words against the surah's real ayah text, ayah by
// ayah, and returns the timestamp cut points between them. Uses a small
// sliding window (±2 words around the expected count) per ayah so minor
// ASR slips don't derail the whole alignment — if a window doesn't match
// well, we fall back to the expected word count for that ayah and flag it
// as low-confidence for the admin to review.
export async function detectVerseBoundariesFromTranscription(
  file: File, surahNumber: number, verseCount: number
): Promise<TranscriptionResult> {
  const [words, ayahTexts] = await Promise.all([
    transcribeRecordingWords(file),
    getSurahText(surahNumber, false),
  ]);
  const ayahWordLists = ayahTexts.map(a => a.text.split(/\s+/).map(normalizeArabicWord).filter(Boolean));
  const transcribedNorm = words.map(w => normalizeArabicWord(w.word)).map(w => w);

  const boundaries: number[] = [];
  const lowConfidenceAyahs: number[] = [];
  let wi = 0; // pointer into `words`

  for (let ayahIdx = 0; ayahIdx < ayahWordLists.length; ayahIdx++) {
    const expected = ayahWordLists[ayahIdx];
    const target = expected.length || 1;

    let bestScore = -1, bestLen = target;
    for (let len = Math.max(1, target - 2); len <= target + 2; len++) {
      if (wi + len > transcribedNorm.length) continue;
      let score = 0;
      for (let k = 0; k < Math.min(len, target); k++) {
        if (transcribedNorm[wi + k] && expected[k] && transcribedNorm[wi + k] === expected[k]) score++;
      }
      if (score > bestScore) { bestScore = score; bestLen = len; }
    }
    if (bestScore < 0) { bestLen = Math.min(target, Math.max(0, transcribedNorm.length - wi)); bestScore = 0; }
    if (target > 0 && bestScore / target < 0.4) lowConfidenceAyahs.push(ayahIdx + 1);

    const consumedEndIdx = wi + bestLen - 1;
    const lastWordEnd = words[consumedEndIdx]?.end ?? words[words.length - 1]?.end ?? 0;
    wi += bestLen;

    if (ayahIdx < ayahWordLists.length - 1) {
      const nextWordStart = words[wi]?.start;
      const cut = nextWordStart != null && nextWordStart > lastWordEnd
        ? (lastWordEnd + nextWordStart) / 2
        : Math.max(0, lastWordEnd - 0.03); // no gap detected — bias slightly early rather than into the next ayah
      boundaries.push(Math.round(cut * 100) / 100);
    }
  }

  return { boundaries, lowConfidenceAyahs };
}
