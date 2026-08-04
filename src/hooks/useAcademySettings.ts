import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useVisibleRealtime } from "@/hooks/useVisibleRealtime";

export interface AcademySettings {
  academy_status: string;
  current_term: string;
  current_academic_year: string;
  resume_date: string | null;
  payment_grace_days: string;
  holiday_message: string | null;
  holiday_message_ar: string | null;
  payment_counting_started: string;
  payment_count_start_date: string | null;
  payment_enabled: string;
  payment_disabled_reason: string | null;
  payment_disabled_reason_ar: string | null;
  payment_free_access_during_off: string;
  payment_disabled_by: string | null;
  payment_disabled_at: string | null;
  payment_enabled_at: string | null;
  payment_auto_on_date: string | null;
}

const DEFAULT_SETTINGS: AcademySettings = {
  academy_status: "active",
  current_term: "first",
  current_academic_year: "2025/2026",
  resume_date: null,
  payment_grace_days: "7",
  holiday_message: null,
  holiday_message_ar: null,
  payment_counting_started: "false",
  payment_count_start_date: null,
  payment_enabled: "true",
  payment_disabled_reason: null,
  payment_disabled_reason_ar: null,
  payment_free_access_during_off: "true",
  payment_disabled_by: null,
  payment_disabled_at: null,
  payment_enabled_at: null,
  payment_auto_on_date: null,
};

export const useAcademySettings = () => {
  const [settings, setSettings] = useState<AcademySettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    const { data } = await supabase
      .from("academy_settings" as any)
      .select("key, value");

    if (data) {
      const map: Record<string, string | null> = {};
      (data as any[]).forEach((row: any) => {
        map[row.key] = row.value;
      });
      setSettings((prev) => ({ ...prev, ...map } as AcademySettings));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Live-push: the moment an admin flips academy_status (e.g. turns on
  // Maintenance), every open tab/app instance picks it up instantly —
  // no refresh or re-login needed. Follows the visibility-gated pattern
  // used elsewhere (socket only open while tab is foregrounded, with a
  // catch-up fetch on resume) so this doesn't reopen the reload/spinner
  // issue that always-open sockets caused before.
  useVisibleRealtime(
    () =>
      supabase
        .channel("academy_settings_live")
        .on(
          "postgres_changes" as any,
          { event: "*", schema: "public", table: "academy_settings" },
          () => fetchSettings()
        )
        .subscribe(),
    [],
    () => fetchSettings(),
  );

  const updateSetting = async (key: string, value: string | null, updatedBy?: string) => {
    await supabase
      .from("academy_settings" as any)
      .update({ value, updated_by: updatedBy, updated_at: new Date().toISOString() } as any)
      .eq("key", key);
    setSettings((prev) => ({ ...prev, [key]: value } as AcademySettings));
  };

  const updateMultiple = async (updates: Record<string, string | null>, updatedBy?: string) => {
    const promises = Object.entries(updates).map(([key, value]) =>
      supabase
        .from("academy_settings" as any)
        .update({ value, updated_by: updatedBy, updated_at: new Date().toISOString() } as any)
        .eq("key", key)
    );
    await Promise.all(promises);
    setSettings((prev) => ({ ...prev, ...updates } as AcademySettings));
  };

  const isPaymentEnabled = settings.payment_enabled === "true";
  const isHoliday = settings.academy_status === "holiday";
  const isActive = settings.academy_status === "active";

  return {
    settings,
    loading,
    updateSetting,
    updateMultiple,
    fetchSettings,
    isPaymentEnabled,
    isHoliday,
    isActive,
  };
};
