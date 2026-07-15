// src/hooks/useQuranAudioEngine.ts
// Drives a single <audio> element to play either:
//   (a) individual per-ayah mp3 files (everyayah.com CDN — one URL per verse), or
//   (b) one admin-recorded full-surah file, sliced into ayah segments by
//       start/end times.
// Both are expressed as AyahSegment[] so the rest of the engine doesn't care
// which mode is active.

import { useRef, useState, useCallback, useEffect } from "react";

export interface AyahSegment {
  ayah: number;
  src: string;
  start: number;          // seconds within `src`
  end: number | null;     // null = play to the file's natural end
}

export type RepeatMode = "off" | "verse" | "surah";

interface UseQuranAudioEngineResult {
  currentAyah: number | null;
  isPlaying: boolean;
  isBuffering: boolean;
  playAyah: (ayah: number) => void;
  playFrom: (ayah: number) => void;   // continuous playback from this ayah onward
  pause: () => void;
  resume: () => void;
  stop: () => void;
  rate: number;
  setRate: (r: number) => void;
  repeatMode: RepeatMode;
  setRepeatMode: (m: RepeatMode) => void;
}

export function useQuranAudioEngine(segments: AyahSegment[]): UseQuranAudioEngineResult {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;

  const [currentAyah, setCurrentAyah] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [rate, setRateState] = useState(1);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("off");
  const continuousRef = useRef(false);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audioRef.current = audio;
    return () => { audio.pause(); audio.src = ""; };
  }, []);

  const findSegment = useCallback((ayah: number) => segmentsRef.current.find(s => s.ayah === ayah), []);

  const advance = useCallback((fromAyah: number) => {
    const list = segmentsRef.current;
    const idx = list.findIndex(s => s.ayah === fromAyah);
    if (idx === -1) { setIsPlaying(false); return; }
    const next = list[idx + 1];
    if (next) {
      playSegment(next, true);
    } else if (repeatMode === "surah" && list.length > 0) {
      playSegment(list[0], true);
    } else {
      setIsPlaying(false);
      continuousRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repeatMode]);

  const playSegment = useCallback((seg: AyahSegment, continuous: boolean) => {
    const audio = audioRef.current;
    if (!audio) return;
    continuousRef.current = continuous;
    setCurrentAyah(seg.ayah);
    setIsBuffering(true);

    const start = () => {
      audio.currentTime = seg.start;
      audio.playbackRate = rate;
      audio.play().then(() => { setIsPlaying(true); setIsBuffering(false); }).catch(() => setIsBuffering(false));
    };

    if (audio.src !== seg.src) {
      audio.src = seg.src;
      audio.oncanplay = () => { audio.oncanplay = null; start(); };
      audio.load();
    } else {
      start();
    }
  }, [rate]);

  // Watch playback position to cut off single-file segments at their `end`,
  // and to advance to the next ayah for continuous ("play surah") mode.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      const seg = currentAyah !== null ? findSegment(currentAyah) : undefined;
      if (!seg || seg.end === null) return;
      if (audio.currentTime >= seg.end - 0.02) {
        audio.pause();
        if (repeatMode === "verse") {
          playSegment(seg, continuousRef.current);
        } else if (continuousRef.current) {
          advance(seg.ayah);
        } else {
          setIsPlaying(false);
        }
      }
    };

    const onEnded = () => {
      // Natural end of file (per-ayah mode, or last verse of a single-file recitation)
      const seg = currentAyah !== null ? findSegment(currentAyah) : undefined;
      if (!seg) { setIsPlaying(false); return; }
      if (repeatMode === "verse") {
        playSegment(seg, continuousRef.current);
      } else if (continuousRef.current) {
        advance(seg.ayah);
      } else {
        setIsPlaying(false);
      }
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
    };
  }, [currentAyah, findSegment, repeatMode, advance, playSegment]);

  const playAyah = useCallback((ayah: number) => {
    const seg = findSegment(ayah);
    if (seg) playSegment(seg, false);
  }, [findSegment, playSegment]);

  const playFrom = useCallback((ayah: number) => {
    const seg = findSegment(ayah);
    if (seg) playSegment(seg, true);
  }, [findSegment, playSegment]);

  const pause = useCallback(() => { audioRef.current?.pause(); setIsPlaying(false); }, []);
  const resume = useCallback(() => { audioRef.current?.play().then(() => setIsPlaying(true)).catch(() => {}); }, []);
  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) { audio.pause(); audio.currentTime = 0; }
    continuousRef.current = false;
    setIsPlaying(false);
    setCurrentAyah(null);
  }, []);

  const setRate = useCallback((r: number) => {
    setRateState(r);
    if (audioRef.current) audioRef.current.playbackRate = r;
  }, []);

  return {
    currentAyah, isPlaying, isBuffering,
    playAyah, playFrom, pause, resume, stop,
    rate, setRate, repeatMode, setRepeatMode,
  };
}
