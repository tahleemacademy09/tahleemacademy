// src/hooks/useCourseRegistrationSettings.ts
// Reads/writes the COURSE registration portal toggle from academy_settings.
// This is deliberately separate from useRegistrationSettings (which gates
// new-student sign-up / Tasjeel). This one gates whether *existing* students
// can register (enroll) into individual courses at the exam/course platform.
//
// Storage: same academy_settings key/value table, distinct keys prefixed
// "course_registration_".
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CourseRegistrationConfig {
  course_registration_open: boolean;   // master gate — if false, students can't register for any course
  course_registration_message: string;
  course_registration_message_ar: string;
  course_registration_closed_message: string;
  course_registration_closed_message_ar: string;
}

const DEFAULTS: CourseRegistrationConfig = {
  course_registration_open: false,
  course_registration_message: "Course registration is open. Pick the courses you'd like to take this term.",
  course_registration_message_ar: "التسجيل في الدورات مفتوح. اختر الدورات التي ترغب في دراستها هذا الفصل.",
  course_registration_closed_message: "Course registration is currently closed. Please check back once the admin opens it.",
  course_registration_closed_message_ar: "التسجيل في الدورات مغلق حالياً. يرجى المراجعة لاحقاً بعد فتحه من قبل الإدارة.",
};

export function useCourseRegistrationSettings() {
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
          "course_registration_open",
          "course_registration_message",
          "course_registration_message_ar",
          "course_registration_closed_message",
          "course_registration_closed_message_ar",
        ]);

      const { data } = await Promise.race([queryPromise, timeoutPromise]);

      if (data) {
        const map: Record<string, string> = {};
        (data as any[]).forEach((r: any) => { if (r.value !== null) map[r.key] = r.value; });

        setConfig({
          course_registration_open:              map.course_registration_open === "true",
          course_registration_message:           map.course_registration_message || DEFAULTS.course_registration_message,
          course_registration_message_ar:        map.course_registration_message_ar || DEFAULTS.course_registration_message_ar,
          course_registration_closed_message:    map.course_registration_closed_message || DEFAULTS.course_registration_closed_message,
          course_registration_closed_message_ar: map.course_registration_closed_message_ar || DEFAULTS.course_registration_closed_message_ar,
        });
      }
    } catch {
      // Network error — DEFAULTS already set, unblock loading
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const saveAll = async (c: CourseRegistrationConfig, updatedBy?: string) => {
    const entries: [string, string][] = [
      ["course_registration_open",              String(c.course_registration_open)],
      ["course_registration_message",           c.course_registration_message],
      ["course_registration_message_ar",        c.course_registration_message_ar],
      ["course_registration_closed_message",    c.course_registration_closed_message],
      ["course_registration_closed_message_ar", c.course_registration_closed_message_ar],
    ];
    await Promise.all(entries.map(([key, value]) =>
      supabase.from("academy_settings" as any).upsert(
        { key, value, updated_by: updatedBy, updated_at: new Date().toISOString() } as any,
        { onConflict: "key" }
      )
    ));
    setConfig(c);
  };

  return { config, loading, fetch, saveAll };
}
