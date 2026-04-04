/*  src/hooks/useRecitationSettings.ts
Loads and saves recitation test configuration from academy_settings table.
All settings are stored as key-value rows with prefix "recitation_"
*/
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
export interface RecitationSettings {
// Which surah to recite
surah_name:        string;   // e.g.  "Al-Fatiha "
surah_arabic:      string;   // Full Arabic text shown to student
surah_reference:   string;   // Plain Arabic for AI scoring (no diacritics)
surah_translation: string;   // Engl ish translation (optional display)
// Instructions shown to student
instructions:      string;
tips:              string;   // comma-separated tips
// Limits
min_duration_sec:  num ber;   // minimum recording length
max_duration_sec:  number;   // maximum recording length (0 = no limit)
// Session time slots (comma-separated)
available_times:   string;   // e .g.  "08:00,10:00,12:00,14:00,16:00,18:00,20:00 "
// Stage labels
stage1_label:      string;
stage2_label:      string;
stage3_label:      string;
// Toggle features
ai_scoring_enabled: string;  //  "true " |  "false "
test_enabled:       string;  //  "true " |  "false " — disable whole test
disabled_message:   string;  // message when test is disabled
}
export const DEFAULT_RECITATION_SETTINGS: RecitationSettings = {
surah_name:         "Al-Fatiha ",
surah_arabic:       "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ ﴿١﴾\nالْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ ﴿٢﴾\nالرَّحْمَٰنِ الرَّحِيمِ ﴿٣﴾\nمَالِكِ يَوْمِ الدِّينِ ﴿٤﴾\nإِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْت َعِينُ ﴿٥﴾\nاهْدِنَا الصِّرَاطَ الْمُسْتَقِيمِ ﴿٦﴾\nصِرَاطَ الَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ الْمَغْضُوبِ عَلَيْهِمْ وَلَا الضَّالِّينَ ﴿٧﴾ ",
surah_reference:    "بسم الله الرحمن الرحيم الحمد لله رب العالمين الرحمن الرحيم مالك يوم الدين إياك نعبد وإياك نستعين اهدنا الصراط المستقيم صراط الذين أنعمت عليهم غير المغضوب عليهم ولا الضالين ",
surah_translation:  "In the name of Allah, the Most Gracious, the Most Merciful... ",
instructions:       "Recite the surah clearly into your microphone. Speak at your natural pace — do not rush. ",
tips:               "Find a quiet room with no background noise,Hold phone 15–20cm from your mouth,Recite clearly and at your normal pace,Complete the full surah without stopping ",
min_duration_sec:   "10 " as any,
max_duration_sec:   "120 " as any,
available_times:    "08:00,10:00,12:00,14:00,16:00,18:00,20:00,21:00 ",
stage1_label:       "Record ",
stage2_label:       "AI Score ",
stage3_label:       "Live Session ",
ai_scoring_enabled:  "true ",
test_enabled:        "true ",
disabled_message:    "The recitation test is temporarily unavailable. Please check back soon. ",
};
export const useRecitationSettings = () => {
const [settings, setSettings] = useState(DEFAULT_RECITATION_SETTINGS);
const [loading, setLoading]   = useState(true);
const fetch = useCallback(async () => {
setLoading(true);
const { data } = await supabase
.from("academy_settings" as any)
.select("key, value")
.like("key" as any, "recitation_%");
if (data && (data as any[]).length > 0) {
  const map: Record<string, string> = {};
  (data as any[]).forEach((r: any) => {
    const shortKey = r.key.replace("recitation_", "");
    map[shortKey] = r.value ?? "";
  });
  setSettings(prev => ({ ...prev, ...map } as RecitationSettings));
}
setLoading(false);
}, []);
useEffect(() => { fetch(); }, [fetch]);
const save = async (updates: Partial, adminId?: string) => {
const promises = Object.entries(updates).map(([key, value]) =>
supabase.from("academy_settings" as any).upsert({
key:        `recitation_${key}`,
value:      String(value),
updated_by: adminId,
updated_at: new Date().toISOString(),
} as any, { onConflict: "key" })
);
await Promise.all(promises);
setSettings(prev => ({ ...prev, ...updates } as RecitationSettings));
};
return { settings, loading, save, refetch: fetch };
};