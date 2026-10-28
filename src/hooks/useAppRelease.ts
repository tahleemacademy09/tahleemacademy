/*
  src/hooks/useAppRelease.ts — Tahleem Academy
  ─────────────────────────────────────────────
  Works for logged-out visitors too: the APK is public. Who has what is
  remembered per device (localStorage) and, when signed in, in the database.

  Single source of truth for the Android app release state. Used by the
  sidebar star, the update banner, the install sheet and the "Get the App"
  page, so they always agree.

  "Update available" means:
    • inside the native app  → latest published versionCode > installed build
    • Android in the browser → the person already downloaded an older release
                               and hasn't downloaded the latest one yet
  (First-time visitors who never downloaded anything are invited by the
  install sheet instead — that's not an "update".)

  NOTE: new tables aren't in the generated types.ts yet, so this file talks to
  Supabase through an untyped handle. Once types are regenerated you can drop
  the `as any`.
*/
import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { inAppInstallSupported, runInAppUpdate, useUpdaterState } from "@/lib/apkUpdater";

const db = supabase as any;

export interface AppRelease {
  id: string;
  platform: "android";
  version_name: string;
  version_code: number;
  release_notes: string | null;
  file_path: string;
  file_name: string;
  file_size: number | null;
  is_published: boolean;
  created_at: string;
}

export const isNativeApp = () => Capacitor.isNativePlatform();

/** True on the Android app and on Android browsers. */
export const isAndroidDevice = () =>
  isNativeApp()
    ? Capacitor.getPlatform() === "android"
    : typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);

const LS_DL = "tahleem_app_downloaded_code";
const readLocalDl = (): number | null => {
  try { const n = parseInt(localStorage.getItem(LS_DL) || "", 10); return Number.isFinite(n) ? n : null; }
  catch { return null; }
};
const writeLocalDl = (code: number) => {
  try { const cur = readLocalDl() ?? 0; if (code > cur) localStorage.setItem(LS_DL, String(code)); } catch { /* ignore */ }
};

export const formatBytes = (n?: number | null) => {
  if (!n) return "";
  const mb = n / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(mb >= 100 ? 0 : 1)} MB` : `${Math.round(n / 1024)} KB`;
};

/** Asks the edge function for a signed download URL. */
export async function signReleaseUrl(release: AppRelease): Promise<string> {
  const { data, error } = await supabase.functions.invoke("app-release-url", {
    body: { path: release.file_path, action: "sign", downloadName: release.file_name },
  });
  if (error || !data?.url) throw new Error(error?.message || data?.error || "Could not get the download link");
  return data.url as string;
}

/** Browser / old-APK fallback: hands the download to the system browser. */
export async function startReleaseDownload(release: AppRelease): Promise<void> {
  const url = await signReleaseUrl(release);
  if (isNativeApp()) {
    window.open(url, "_system");
  } else {
    window.location.href = url;
  }
}

export function useAppRelease(enabled = true) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const uid = user?.id;
  const on = enabled;

  const latestQ = useQuery({
    queryKey: ["app-release", "latest"],
    enabled: on,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<AppRelease | null> => {
      const { data, error } = await db
        .from("app_releases")
        .select("*")
        .eq("platform", "android")
        .eq("is_published", true)
        .order("version_code", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as AppRelease) ?? null;
    },
  });

  const installedQ = useQuery({
    queryKey: ["app-release", "installed"],
    enabled: on && isNativeApp(),
    staleTime: Infinity,
    queryFn: async (): Promise<number | null> => {
      try {
        const info = await CapApp.getInfo();
        const n = parseInt(info.build, 10);
        return Number.isFinite(n) ? n : null;
      } catch {
        return null;
      }
    },
  });

  const downloadedQ = useQuery({
    queryKey: ["app-release", "my-downloads", uid],
    enabled: on && !!uid,
    staleTime: 60_000,
    queryFn: async (): Promise<number | null> => {
      const { data } = await db
        .from("app_release_downloads")
        .select("version_code")
        .eq("user_id", uid)
        .order("version_code", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data?.version_code ?? null;
    },
  });

  const latest = latestQ.data ?? null;
  const installedBuild = installedQ.data ?? null;
  const dbMax = downloadedQ.data ?? null;
  const localMax = readLocalDl();
  const maxDownloaded =
    dbMax == null && localMax == null ? null : Math.max(dbMax ?? 0, localMax ?? 0);
  const native = isNativeApp();
  const android = isAndroidDevice();
  const updater = useUpdaterState();

  const upToDate = !latest
    ? true
    : native
      ? installedBuild != null && installedBuild >= latest.version_code
      : maxDownloaded != null && maxDownloaded >= latest.version_code;

  const hasUpdate =
    !!latest &&
    android &&
    (native
      ? installedBuild != null && latest.version_code > installedBuild
      : maxDownloaded != null && latest.version_code > maxDownloaded);

  const recordDownload = useCallback(async (release: AppRelease) => {
    writeLocalDl(release.version_code);
    if (uid) {
      await db
        .from("app_release_downloads")
        .upsert(
          { user_id: uid, release_id: release.id, version_code: release.version_code },
          { onConflict: "user_id,release_id", ignoreDuplicates: true },
        );
      qc.invalidateQueries({ queryKey: ["app-release", "my-downloads", uid] });
    }
    qc.invalidateQueries({ queryKey: ["app-release"] });
  }, [uid, qc]);

  const download = useCallback(async () => {
    if (!latest) return;
    if (inAppInstallSupported()) {
      // Downloads inside the app with progress, then opens Android's installer.
      await runInAppUpdate(latest, () => signReleaseUrl(latest), () => recordDownload(latest));
      return;
    }
    await startReleaseDownload(latest);
    await recordDownload(latest);
  }, [latest, recordDownload]);

  const refresh = useCallback(
    () => qc.invalidateQueries({ queryKey: ["app-release"] }),
    [qc],
  );

  return {
    latest,
    installedBuild,
    isNative: native,
    isAndroid: android,
    hasUpdate,
    upToDate,
    loading: latestQ.isLoading,
    fetched: latestQ.isSuccess,
    inApp: inAppInstallSupported(),
    updater,
    download,
    refresh,
  };
}
