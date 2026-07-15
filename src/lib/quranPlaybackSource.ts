// src/lib/quranPlaybackSource.ts
import { audioUrl } from "@/components/hifdh/surahData";
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
  }

  // Default: individual per-ayah files from everyayah.com
  const segments: AyahSegment[] = [];
  for (let a = 1; a <= verseCount; a++) {
    segments.push({ ayah: a, src: audioUrl(surahNumber, a, reciterId), start: 0, end: null });
  }
  return segments;
}
