/*
  src/data/adhkaarAudio.ts — Tahleem Academy
  ─────────────────────────────────────────────────────────────
  Recitation audio for the Adhkaar page.

  HOW TO ADD AUDIO (no code change needed)
  1. Record or export an mp3 for a dhikr.
  2. Name it after the dhikr id:  m1.mp3, e3.mp3, d-daily-2.mp3 …
  3. Put it in  public/audio/adhkar/  and deploy.
  The Listen button plays the file and highlights each word as it is
  recited. If no file exists for a dhikr, it falls back to the phone's
  built-in Arabic voice.

  OPTIONAL
  • ADHKAAR_AUDIO_OVERRIDES — point an id at a different URL
    (for example a Supabase Storage public URL) instead of the default path.
  • ADHKAAR_WORD_TIMINGS — exact start time (in seconds) of every Arabic
    word, in order. Without it the highlight is estimated from the
    audio length, which is close but not perfect. Give one number per
    word, e.g.  m1: [0, 0.6, 1.1, ...]
*/

// ── ONLINE AUDIO (streams from the internet, nothing to host) ──────
// Qur'anic adhkar stream verse-by-verse from EveryAyah (Mishary Alafasy).
// File names are surah(3 digits) + ayah(3 digits), e.g. 002255 = 2:255.
const QURAN_AUDIO = "https://everyayah.com/data/Alafasy_128kbps";
const ayah = (surah: number, a: number) =>
  `${QURAN_AUDIO}/${String(surah).padStart(3, "0")}${String(a).padStart(3, "0")}.mp3`;
const range = (surah: number, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => ayah(surah, from + i));

const AYAT_AL_KURSI = [ayah(2, 255)];
const THREE_QULS = [...range(112, 1, 4), ...range(113, 1, 5), ...range(114, 1, 6)];

// A dhikr can map to one URL or a list that plays one after another.
export const ADHKAAR_AUDIO_OVERRIDES: Record<string, string | string[]> = {
  m1: AYAT_AL_KURSI, e1: AYAT_AL_KURSI,   // Ayat al-Kursi
  m2: THREE_QULS,    e2: THREE_QULS,      // Ikhlas, Falaq, Nas
  // m3: "https://YOUR-PROJECT.supabase.co/storage/v1/object/public/adhkar/m3.mp3",
};

// Words at the start of the text that the recording does NOT recite
// (the "A'oodhu billah…" line before Ayat al-Kursi is 4 words).
export const ADHKAAR_LEAD_WORDS: Record<string, number> = { m1: 4, e1: 4 };

export const ADHKAAR_WORD_TIMINGS: Record<string, number[]> = {
  // m1: [0, 0.6, 1.1],
};

/** Every audio file to play, in order, for one dhikr. */
export const adhkaarAudioUrls = (id: string): string[] => {
  const o = ADHKAAR_AUDIO_OVERRIDES[id];
  if (!o) return [`/audio/adhkar/${id}.mp3`];
  return Array.isArray(o) ? o : [o];
};

/** Index of the word being recited at `time`, or -1 before it starts. */
export function currentWordIndex(
  time: number,
  duration: number,
  words: string[],
  timings?: number[],
  lead = 0,
): number {
  if (timings && timings.length === words.length) {
    let idx = -1;
    for (let i = 0; i < timings.length; i++) {
      if (time >= timings[i]) idx = i; else break;
    }
    return idx;
  }
  if (!isFinite(duration) || duration <= 0 || words.length === 0) return -1;
  // Estimate: each word gets time in proportion to its letter count
  // (words before `lead` are not in the recording, so they are skipped)
  const body = words.slice(lead);
  if (body.length === 0) return -1;
  const weights = body.map(w => w.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "").length || 1);
  const total = weights.reduce((a, b) => a + b, 0);
  const target = Math.min(0.999, time / duration) * total;
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i];
    if (target < acc) return i + lead;
  }
  return words.length - 1;
}
