// src/hooks/useRegistrationSettings.ts
// Reads registration + payment config from academy_settings table.
// Used by Register.tsx to gate access and by RegistrationSettings.tsx admin page.
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface RegistrationConfig {
  registration_open: boolean;          // master gate — if false, nobody can register
  entrance_fee_enabled: boolean;       // if false, skip payment step entirely
  entrance_fee_amount: number;         // e.g. 5000
  entrance_fee_currency: string;       // e.g. "NGN"
  entrance_exam_required: boolean;     // show/hide exam step in stepper
  recitation_test_required: boolean;   // show/hide recitation step
  onboarding_required: boolean;        // show/hide onboarding step
  max_daily_registrations: number;     // 0 = unlimited
  registration_message: string;
  registration_message_ar: string;
  closed_message: string;
  closed_message_ar: string;
}

const DEFAULTS: RegistrationConfig = {
  registration_open: true,
  entrance_fee_enabled: true,
  entrance_fee_amount: 5000,
  entrance_fee_currency: "NGN",
  entrance_exam_required: true,
  recitation_test_required: true,
  onboarding_required: true,
  max_daily_registrations: 0,
  registration_message: "Welcome to Tahleem Academy! Complete your registration to begin your Islamic learning journey.",
  registration_message_ar: "مرحباً بك في أكاديمية التعليم! أكمل تسجيلك لبدء رحلتك التعليمية الإسلامية.",
  closed_message: "Registration is currently closed. Please check back later or contact us.",
  closed_message_ar: "التسجيل مغلق حالياً. يرجى المراجعة لاحقاً أو التواصل معنا.",
};

export function useRegistrationSettings() {
  const [config, setConfig]   = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);

    try {
      // Race the Supabase query against a 6s timeout.
      // Without this, a slow/failed network request keeps loading=true forever,
      // blocking RegisterContinue (which waits on cfgLoading) and showing an
      // infinite "Verifying your email…" spinner to all users.
      const timeoutPromise = new Promise<{ data: null }>((resolve) =>
        setTimeout(() => resolve({ data: null }), 6000)
      );
      const queryPromise = supabase
        .from("academy_settings" as any)
        .select("key, value");

      const { data } = await Promise.race([queryPromise, timeoutPromise]);

      if (data) {
        const map: Record<string, string> = {};
        (data as any[]).forEach((r: any) => {
          if (r.value !== null) map[r.key] = r.value;        });

        setConfig({
          registration_open:        map.registration_open !== "false",
          entrance_fee_enabled:     map.entrance_fee_enabled !== "false",
          entrance_fee_amount:      Number(map.entrance_fee_amount) || 5000,
          entrance_fee_currency:    map.entrance_fee_currency || "NGN",
          entrance_exam_required:   map.entrance_exam_required !== "false",
          recitation_test_required: map.recitation_test_required !== "false",
          onboarding_required:      map.onboarding_required !== "false",
          max_daily_registrations:  Number(map.max_daily_registrations) || 0,
          registration_message:     map.registration_message || DEFAULTS.registration_message,
          registration_message_ar:  map.registration_message_ar || DEFAULTS.registration_message_ar,
          closed_message:           map.closed_message || DEFAULTS.closed_message,
          closed_message_ar:        map.closed_message_ar || DEFAULTS.closed_message_ar,
        });
      }
      // If data is null (timeout or error), DEFAULTS are already set — just unblock loading
    } catch {
      // Network error — DEFAULTS are already set, unblock loading
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const saveAll = async (c: RegistrationConfig, updatedBy?: string) => {
    const entries = [
      ["registration_open",        String(c.registration_open)],
      ["entrance_fee_enabled",     String(c.entrance_fee_enabled)],
      ["entrance_fee_amount",      String(c.entrance_fee_amount)],
      ["entrance_fee_currency",    c.entrance_fee_currency],
      ["entrance_exam_required",   String(c.entrance_exam_required)],
      ["recitation_test_required", String(c.recitation_test_required)],
      ["onboarding_required",      String(c.onboarding_required)],
      ["max_daily_registrations",  String(c.max_daily_registrations)],
      ["registration_message",     c.registration_message],
      ["registration_message_ar",  c.registration_message_ar],
      ["closed_message",           c.closed_message],
      ["closed_message_ar",        c.closed_message_ar],
    ];

    await Promise.all(entries.map(([key, value]) =>
      supabase.from("academy_settings" as any).upsert(
        { key, value, updated_by: updatedBy, updated_at: new Date().toISOString() } as any,
        { onConflict: "key" }
      )
    ));
    setConfig(c);
  };

  // Currency symbol helper
  const currencySymbol = (c: string) =>
    ({ NGN: "₦", USD: "$", GBP: "£", EUR: "€", GHS: "₵" }[c] || c);
  return { config, loading, fetch, saveAll, currencySymbol };
}
