// src/lib/asrSettings.ts
// Admin on/off switches for the three Quran transcription models used on the Hifdh daily revision page.
//   whisper_cf → Whisper-large-v3-turbo on Cloudflare Workers AI (cloud, runs FIRST when on)
//   tarteel    → Tarteel Whisper-base, on the student's device
//   ctc        → FastConformer-Quran CTC skipped-word check, on the student's device
// Stored in academy_settings (key/value, readable by every signed-in user, writable by admins):
//   asr_whisper_cf_enabled · asr_tarteel_enabled · asr_ctc_enabled   ("true" | "false"; a missing row means ON)
// The values are cached in memory + localStorage so they can be read synchronously from anywhere (e.g. ctcEnabled()).
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AsrModel = "whisper_cf" | "tarteel" | "ctc";

export const ASR_KEYS: Record<AsrModel, string> = {
  whisper_cf: "asr_whisper_cf_enabled",
  tarteel: "asr_tarteel_enabled",
  ctc: "asr_ctc_enabled",
};

/** The Cloudflare worker that runs Whisper-large-v3-turbo (same one the Ramadan checker uses). */
export const WHISPER_ENDPOINT = (import.meta.env.VITE_RECITATION_CHECK_URL as string | undefined) || "";

type Flags = Record<AsrModel, boolean>;
const DEFAULTS: Flags = { whisper_cf: true, tarteel: true, ctc: true };
const LS_KEY = "asr_models_cache_v1";

function readCache(): Flags {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { /* private mode / bad JSON → defaults */ }
  return { ...DEFAULTS };
}

let flags: Flags = readCache();
const listeners = new Set<() => void>();

function setFlags(next: Flags) {
  flags = next;
  try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* noop */ }
  listeners.forEach((l) => l());
}

/** Is this model switched on by the admin? (Does not say whether the device can actually run it.) */
export const asrEnabled = (m: AsrModel): boolean => flags[m];

/** Cloud Whisper is switched on AND the worker URL is configured in this build. */
export const whisperCloudAvailable = (): boolean => flags.whisper_cf && !!WHISPER_ENDPOINT;

/** Pull the three switches from the database (a missing row = ON). Never throws. */
export async function refreshAsrSettings(): Promise<void> {
  try {
    const { data, error } = await supabase
      .from("academy_settings" as any)
      .select("key, value")
      .in("key", Object.values(ASR_KEYS));
    if (error || !data) return;
    const next: Flags = { ...DEFAULTS };
    (data as any[]).forEach((r) => {
      const m = (Object.keys(ASR_KEYS) as AsrModel[]).find((k) => ASR_KEYS[k] === r.key);
      if (m) next[m] = String(r.value ?? "true").toLowerCase() !== "false";
    });
    setFlags(next);
  } catch { /* offline → keep the cached values */ }
}

/** Admin: switch a model on/off. Takes effect for students the next time they open / focus the page. */
export async function saveAsrSetting(model: AsrModel, on: boolean, adminId?: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("academy_settings" as any).upsert(
    { key: ASR_KEYS[model], value: String(on), updated_by: adminId, updated_at: new Date().toISOString() } as any,
    { onConflict: "key" },
  );
  if (error) return { error: error.message };
  setFlags({ ...flags, [model]: on });
  return {};
}

/** React hook: current switches (re-renders on change) + refreshes from the database on mount and when the tab regains focus. */
export function useAsrSettings() {
  const [, bump] = useState(0);
  useEffect(() => {
    const l = () => bump((n) => n + 1);
    listeners.add(l);
    void refreshAsrSettings();
    const onFocus = () => { void refreshAsrSettings(); };
    window.addEventListener("focus", onFocus);
    return () => { listeners.delete(l); window.removeEventListener("focus", onFocus); };
  }, []);
  return { ...flags, whisperConfigured: !!WHISPER_ENDPOINT };
}
