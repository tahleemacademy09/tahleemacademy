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
*/
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
