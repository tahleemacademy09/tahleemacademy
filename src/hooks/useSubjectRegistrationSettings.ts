// src/hooks/useSubjectRegistrationSettings.ts
// Reads/writes the SUBJECT registration portal toggle from academy_settings.
// Separate from useRegistrationSettings (new-student sign-up / Tasjeel).
// This one gates whether existing students can register for individual
// subjects (the actual classes teachers run) on the exam/course platform.
//
// Includes an optional deadline: once it passes, the portal is treated as
// CLOSED even if the manual "open" toggle is still true — the admin doesn't
// need to remember to flip it off. To extend registration, the admin pushes
// the deadline forward (or clears it for "no deadline").
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface SubjectRegistrationConfig {
  subject_registration_open: boolean;
  subject_registration_deadline: string; // ISO datetime string, or "" for no deadline
  subject_registration_message: string;
  subject_registration_message_ar: string;
  subject_registration_closed_message: string;
  subject_registration_closed_message_ar: string;
}

const DEFAULTS: SubjectRegistrationConfig = {
  subject_registration_open: false,
  subject_registration_deadline: "",
  subject_registration_message: "Subject registration is open. Pick the classes you'd like to take this term.",
  subject_registration_message_ar: "التسجيل في المواد مفتوح. اختر المواد التي ترغب في دراستها هذا الفصل.",
  subject_registration_closed_message: "Subject registration is currently closed. Please check back once the admin opens it.",
  subject_registration_closed_message_ar: "التسجيل في المواد مغلق حالياً. يرجى المراجعة لاحقاً بعد فتحه من قبل الإدارة.",
};

export function useSubjectRegistrationSettings() {
  const [config, setConfig]   = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const timeoutPromise = new Promise<{ data: null }>((resolve) =>
        setTimeout(() => resolve({ data: null }), 6000)
      );
      const queryPromise = supabase
        .from("academy_settings" as any)
        .select("key, value")
        .in("key", [
          "subject_registration_open",
          "subject_registration_deadline",
          "subject_registration_message",
          "subject_registration_message_ar",
          "subject_registration_closed_message",
          "subject_registration_closed_message_ar",
        ]);

      const { data } = await Promise.race([queryPromise, timeoutPromise]);

      if (data) {
        const map: Record<string, string> = {};
        (data as any[]).forEach((r: any) => { if (r.value !== null) map[r.key] = r.value; });

        setConfig({
          subject_registration_open:              map.subject_registration_open === "true",
          subject_registration_deadline:          map.subject_registration_deadline || "",
          subject_registration_message:           map.subject_registration_message || DEFAULTS.subject_registration_message,
          subject_registration_message_ar:        map.subject_registration_message_ar || DEFAULTS.subject_registration_message_ar,
          subject_registration_closed_message:    map.subject_registration_closed_message || DEFAULTS.subject_registration_closed_message,
          subject_registration_closed_message_ar: map.subject_registration_closed_message_ar || DEFAULTS.subject_registration_closed_message_ar,
        });
      }
    } catch {
      // Network error — DEFAULTS already set, unblock loading
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const saveAll = async (c: SubjectRegistrationConfig, updatedBy?: string) => {
    const entries: [string, string][] = [
      ["subject_registration_open",              String(c.subject_registration_open)],
      ["subject_registration_deadline",          c.subject_registration_deadline || ""],
      ["subject_registration_message",           c.subject_registration_message],
      ["subject_registration_message_ar",        c.subject_registration_message_ar],
      ["subject_registration_closed_message",    c.subject_registration_closed_message],
      ["subject_registration_closed_message_ar", c.subject_registration_closed_message_ar],
    ];
    await Promise.all(entries.map(([key, value]) =>
      supabase.from("academy_settings" as any).upsert(
        { key, value, updated_by: updatedBy, updated_at: new Date().toISOString() } as any,
        { onConflict: "key" }
      )
    ));
    setConfig(c);
  };

  // Deadline passed? Portal is effectively closed even if the manual toggle
  // is still "open" — this is what student-facing pages should check.
  const deadlinePassed = !!config.subject_registration_deadline &&
    new Date(config.subject_registration_deadline).getTime() < Date.now();

  const isEffectivelyOpen = config.subject_registration_open && !deadlinePassed;

  return { config, loading, fetch, saveAll, deadlinePassed, isEffectivelyOpen };
}
