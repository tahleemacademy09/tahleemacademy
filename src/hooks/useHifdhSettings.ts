/* src/hooks/useHifdhSettings.ts
Loads and saves Hifdh test configuration from academy_settings table.
All settings are stored as key-value rows with prefix "hifdh_"
*/
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface HifdhSettings {
  // Proctoring
  violation_limit: number;  // how many face violations before auto-submit (default 5)
  // Pass mark (%) required for a Hifdh recitation / test to be marked as passed.
  pass_mark: number;
  // "Hifdh Proctoring" — when enabled, applies focused-mode protections
  // (tab-switch detection, copy/paste/right-click blocking, screen-stay-on)
  // across the daily revision recitation AND the Hifdh questions/test phase,
  // not just the proctored quiz section. Admin-controlled on/off switch.
  proctoring_enabled: boolean;
}

export const DEFAULT_HIFDH_SETTINGS: HifdhSettings = {
  violation_limit: 5,
  pass_mark: 55,
  proctoring_enabled: false,
};

export const useHifdhSettings = () => {
  const [settings, setSettings] = useState<HifdhSettings>(DEFAULT_HIFDH_SETTINGS);
  const [loading, setLoading]   = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("academy_settings" as any)
      .select("key, value")
      .like("key" as any, "hifdh_%");

    if (data && (data as any[]).length > 0) {
      const map: Record<string, string> = {};
      (data as any[]).forEach((r: any) => {
        const shortKey = r.key.replace("hifdh_", "");
        map[shortKey] = r.value ?? "";
      });
      setSettings(prev => ({
        ...prev,
        violation_limit: map.violation_limit !== undefined
          ? Number(map.violation_limit)
          : prev.violation_limit,
        pass_mark: map.pass_mark !== undefined
          ? Number(map.pass_mark)
          : prev.pass_mark,
        proctoring_enabled: map.proctoring_enabled !== undefined
          ? map.proctoring_enabled === "true"
          : prev.proctoring_enabled,
      }));
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const save = async (updates: Partial<HifdhSettings>, adminId?: string) => {
    const promises = Object.entries(updates).map(([key, value]) =>
      supabase.from("academy_settings" as any).upsert({
        key:        `hifdh_${key}`,
        value:      String(value),
        updated_by: adminId,
        updated_at: new Date().toISOString(),
      } as any, { onConflict: "key" })
    );
    await Promise.all(promises);
    setSettings(prev => ({ ...prev, ...updates } as HifdhSettings));
  };

  return { settings, loading, save, refetch: fetch };
};
