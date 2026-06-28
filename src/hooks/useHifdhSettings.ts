/* src/hooks/useHifdhSettings.ts
Loads and saves Hifdh test configuration from academy_settings table.
All settings are stored as key-value rows with prefix "hifdh_"
*/
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface HifdhSettings {
  // Proctoring
  violation_limit: number;  // how many face violations before auto-submit (default 5)
  // Future: add more hifdh-specific settings here
}

export const DEFAULT_HIFDH_SETTINGS: HifdhSettings = {
  violation_limit: 5,
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
