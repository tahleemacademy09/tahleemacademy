// src/lib/ttsUtils.ts — Tahleem Academy
// General-purpose text-to-speech helper, backed by the "text-to-speech"
// Supabase edge function (Google Cloud TTS server-side — the API key never
// touches the client). Arabic is the default/primary use case, but this
// works for any language Google Cloud TTS supports; pass languageCode /
// voiceName to override.
//
// This is a NETWORK-based, natural-voice alternative to the browser's
// built-in `speechSynthesis` (used in soundUtils.ts and elsewhere) — use
// this when you want a consistent, good-quality voice across every device,
// and speechSynthesis when a quick, free, no-network cue is good enough
// (e.g. short local chimes/announcements).

import { supabase } from "@/integrations/supabase/client";

export interface SpeakOptions {
  /** BCP-47 language code. Defaults to Arabic (ar-XA). */
  languageCode?: string;
  /** A specific Google Cloud TTS voice name, e.g. "ar-XA-Wavenet-C". */
  voiceName?: string;
  ssmlGender?: "MALE" | "FEMALE" | "NEUTRAL";
  /** 0.25–4.0, default 1.0 (normal speed). */
  speakingRate?: number;
  /** -20.0–20.0 semitones, default 0. */
  pitch?: number;
  /** 0–1, default 1 (full volume). */
  volume?: number;
}

// Small in-memory cache so repeating the same phrase (e.g. a fixed
// announcement like "تم بدء التسجيل") in one session doesn't re-hit the API
// and re-spend quota every time. Cleared on page reload — for a persistent
// cache across sessions, store audioContent in Supabase Storage instead.
const audioCache = new Map<string, string>(); // key -> base64 mp3

function cacheKey(text: string, opts?: SpeakOptions): string {
  return JSON.stringify([text, opts?.languageCode, opts?.voiceName, opts?.ssmlGender, opts?.speakingRate, opts?.pitch]);
}

/**
 * Fetches TTS audio for `text` and plays it. Returns the playing
 * HTMLAudioElement (or null if synthesis/playback failed) so callers can
 * stop it early, e.g. `const a = await speak(text); a?.pause();`.
 */
export async function speak(text: string, opts: SpeakOptions = {}): Promise<HTMLAudioElement | null> {
  if (!text || !text.trim()) return null;
  try {
    const key = cacheKey(text, opts);
    let audioContent = audioCache.get(key);

    if (!audioContent) {
      const { data, error } = await supabase.functions.invoke("text-to-speech", {
        body: {
          text,
          languageCode: opts.languageCode,
          voiceName: opts.voiceName,
          ssmlGender: opts.ssmlGender,
          speakingRate: opts.speakingRate,
          pitch: opts.pitch,
        },
      });
      if (error || !data?.audioContent) {
        console.error("[ttsUtils] speak() failed:", error || data?.error);
        return null;
      }
      audioContent = data.audioContent as string;
      audioCache.set(key, audioContent);
    }

    const audio = new Audio(`data:audio/mp3;base64,${audioContent}`);
    audio.volume = opts.volume ?? 1;
    await audio.play().catch((e) => console.error("[ttsUtils] playback failed:", e));
    return audio;
  } catch (e) {
    console.error("[ttsUtils] speak() error:", e);
    return null;
  }
}

/** Convenience wrapper — same as speak() but with Arabic defaults made explicit. */
export function speakArabic(text: string, opts: Omit<SpeakOptions, "languageCode"> = {}): Promise<HTMLAudioElement | null> {
  return speak(text, { languageCode: "ar-XA", ...opts });
}
