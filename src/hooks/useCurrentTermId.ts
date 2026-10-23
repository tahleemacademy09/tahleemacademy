/*  src/hooks/useCurrentTermId.ts

    Resolves academic_terms.id for the term that is currently live
    (academic_terms.is_current = true, kept in sync with the "Current Term"
    dropdown in Admin Settings > Academy by a DB trigger -- see migration
    term_autostamp_and_sync).

    useCurrentTermId()  -> just the live term's id (what admins/teachers
                            manage against -- they always see/edit the
                            live term).
    useViewingTermId()  -> the id a STUDENT should see: their own
                            profiles.active_term_id if they've switched to
                            look at a past term (see TermSwitcher in
                            Settings), otherwise the live term. Pass the
                            student's profile row (or null/undefined).
    useStaffTermId()    -> the term STAFF-side screens should read/write.
                            Teachers follow their own switcher choice
                            (profiles.active_term_id, set in Teacher Settings
                            or by an admin on the Teachers tab) and fall back
                            to the live term. Admins always manage the live term.
*/
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useCurrentTermId() {
  const { data: currentTermId } = useQuery({
    queryKey: ["current-term-id"],
    queryFn: async () => {
      const { data } = await supabase
        .from("academic_terms")
        .select("id")
        .eq("is_current", true)
        .maybeSingle();
      return data?.id as string | undefined;
    },
    staleTime: 60_000,
  });
  return currentTermId;
}

export function useViewingTermId(profile?: { active_term_id?: string | null } | null) {
  const currentTermId = useCurrentTermId();
  return profile?.active_term_id || currentTermId;
}

/** Term that staff-side screens (materials, assignments, timetable...) work in. */
export function useStaffTermId() {
  const { profile, roles } = useAuth() as any;
  const currentTermId = useCurrentTermId();
  const isAdmin = Array.isArray(roles) && roles.includes("admin");
  const isTeacher = Array.isArray(roles) && roles.includes("teacher");
  if (isTeacher && !isAdmin) return (profile?.active_term_id as string | null | undefined) || currentTermId;
  return currentTermId;
}

/** True when a teacher is looking at a term other than the live one. */
export function useIsViewingPastTerm() {
  const { profile, roles } = useAuth() as any;
  const currentTermId = useCurrentTermId();
  const isAdmin = Array.isArray(roles) && roles.includes("admin");
  const isTeacher = Array.isArray(roles) && roles.includes("teacher");
  return !!(isTeacher && !isAdmin && profile?.active_term_id && currentTermId && profile.active_term_id !== currentTermId);
}

/** academic_terms row for the term staff are working in (for names/dates/term_number). */
export function useStaffTermRow() {
  const termId = useStaffTermId();
  const { data } = useQuery({
    queryKey: ["academic-term-row", termId],
    enabled: !!termId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("academic_terms").select("*").eq("id", termId as string).maybeSingle();
      return data as any;
    },
  });
  return data as { id: string; term_number: number; name: string; name_ar: string | null; start_date: string; end_date: string; is_current: boolean } | null | undefined;
}

/** "first" | "second" | "third" -- the legacy exams.term key matching the staff term. */
export function useStaffTermKey(): "first" | "second" | "third" | undefined {
  const row = useStaffTermRow();
  if (!row) return undefined;
  return (["first", "second", "third"] as const)[Math.max(0, Math.min(2, (row.term_number || 1) - 1))];
}
