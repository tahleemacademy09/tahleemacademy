// src/lib/quranPlaybackSource.ts
import { audioUrl, DEFAULT_RECITER } from "@/components/hifdh/surahData";
import { CustomRecitation, getRecitationAudioUrl } from "@/lib/quranRecitations";
import { AyahSegment } from "@/hooks/useQuranAudioEngine";

export const CUSTOM_RECITER_PREFIX = "custom:";

// Builds the ordered per-ayah playback list for a surah.
// `reciterId` is either an everyayah.com reciter id, or `custom:<recitationId>`
// to point at one of the admin-recorded recitations for this surah.
export function buildAyahSegments(
  surahNumber: number,
  verseCount: number,
  reciterId: string,
  customRecitations: CustomRecitation[]
): AyahSegment[] {
  if (reciterId.startsWith(CUSTOM_RECITER_PREFIX)) {
    const id = reciterId.slice(CUSTOM_RECITER_PREFIX.length);
    const rec = customRecitations.find(r => r.id === id);
    if (rec) {
      const src = getRecitationAudioUrl(rec.audio_path);
      return rec.ayah_timings
        .slice()
        .sort((a, b) => a.ayah - b.ayah)
        .map(t => ({ ayah: t.ayah, src, start: t.start, end: t.end }));
    }
    // The selected custom recitation doesn't exist for THIS surah (common in
    // continuous-scroll mode: a custom reciter picked while reading one surah
    // won't have a recording for the next one). Fall back to the default CDN
    // reciter rather than treating "custom:<id>" itself as a reciter code —
    // that would build a URL like everyayah.com/data/custom:xyz/..., which is
    // just a 404.
    reciterId = DEFAULT_RECITER;
  }

  // Default: individual per-ayah files from everyayah.com
  const segments: AyahSegment[] = [];
  for (let a = 1; a <= verseCount; a++) {
    segments.push({ ayah: a, src: audioUrl(surahNumber, a, reciterId), start: 0, end: null });
  }
  return segments;
}