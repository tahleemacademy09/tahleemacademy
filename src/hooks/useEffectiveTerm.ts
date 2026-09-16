/*
  src/hooks/useEffectiveTerm.ts — Tahleem Academy
  ─────────────────────────────────────────────────
  Single source of truth for "which term's content am I looking at?"
  used by syllabus + materials everywhere (admin, teacher, student).

  Two different audiences, two different defaults:
  • Student  → `profiles.active_term_id` (set via TermSwitcher in Settings),
    falling back to the academy's current term if they've never switched.
    Read-only here — students don't get a picker, they use TermSwitcher.
  • Admin/Teacher → no profile field for this (staff manage every term, not
    just their own). Defaults to the academy's current term, but exposes
    `setManagedTermId` so SyllabusManager / MaterialsManagement can offer a
    term picker and let staff build out Term 2 content ahead of time. The
    choice is remembered per-browser via localStorage so it survives a
    refresh while staff are mid-build on a future term.

  Content rows (subject_syllabus / subject_materials) are matched with
  `term_id = effectiveTermId OR term_id IS NULL` — NULL means "evergreen,
  shown in every term" (e.g. content nobody has bothered to scope yet).
  ─────────────────────────────────────────────────
*/
import { useEffect, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useVisibleRealtime } from "@/hooks/useVisibleRealtime";

export interface AcademicTerm {
  id: string;
  academic_year_id: string;
  term_number: number;
  name: string;
  name_ar: string | null;
  start_date: string;
  end_date: string;
  is_current: boolean;
}

const TERMS_QUERY_KEY = ["academic_terms"] as const;
const STAFF_TERM_STORAGE_KEY = "tahleem_admin_managed_term_id";

async function fetchTerms(): Promise<AcademicTerm[]> {
  const { data, error } = await supabase
    .from("academic_terms")
    .select("*")
    .order("term_number", { ascending: true });
  if (error) throw error;
  return (data ?? []) as AcademicTerm[];
}

/** All terms, shared cache, realtime-synced. Used by any term picker. */
export function useAcademicTerms() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: TERMS_QUERY_KEY,
    queryFn: fetchTerms,
    staleTime: 5 * 60 * 1000,
  });

  useVisibleRealtime(
    () =>
      supabase
        .channel("academic_terms_realtime")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "academic_terms" },
          () => qc.invalidateQueries({ queryKey: TERMS_QUERY_KEY }),
        )
        .subscribe(),
    [qc],
    () => qc.invalidateQueries({ queryKey: TERMS_QUERY_KEY }),
  );

  return query;
}

/**
 * Student-facing: the term whose syllabus/materials snapshot they should see.
 * Falls back to the academy's current term until they explicitly switch.
 */
export function useStudentEffectiveTerm() {
  const { profile } = useAuth();
  const { data: terms = [], isLoading } = useAcademicTerms();
  const currentTerm = terms.find((t) => t.is_current) ?? null;
  const activeTermId = profile?.active_term_id as string | undefined;
  const activeTerm = activeTermId
    ? terms.find((t) => t.id === activeTermId) ?? currentTerm
    : currentTerm;

  return {
    termId: activeTerm?.id ?? null,
    term: activeTerm,
    terms,
    isLoading,
  };
}

/**
 * Admin/Teacher-facing: which term's content they're currently managing.
 * Defaults to the academy's current term; `setManagedTermId` lets a
 * SyllabusManager/MaterialsManagement-style page switch to build out a
 * future term (e.g. Term 2) ahead of time. Persisted in localStorage.
 */
export function useManagedTerm() {
  const { data: terms = [], isLoading } = useAcademicTerms();
  const currentTerm = terms.find((t) => t.is_current) ?? null;
  const [managedTermId, setManagedTermIdState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STAFF_TERM_STORAGE_KEY);
    } catch {
      return null;
    }
  });

  // Once terms load, make sure a stored/blank id still refers to a real term.
  useEffect(() => {
    if (isLoading || terms.length === 0) return;
    const stillValid = managedTermId && terms.some((t) => t.id === managedTermId);
    if (!stillValid) {
      const fallback = currentTerm?.id ?? terms[0]?.id ?? null;
      setManagedTermIdState(fallback);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, terms]);

  const setManagedTermId = useCallback((id: string) => {
    setManagedTermIdState(id);
    try {
      localStorage.setItem(STAFF_TERM_STORAGE_KEY, id);
    } catch {
      /* ignore — non-critical persistence */
    }
  }, []);

  const managedTerm = terms.find((t) => t.id === managedTermId) ?? currentTerm ?? null;

  return {
    termId: managedTerm?.id ?? null,
    term: managedTerm,
    terms,
    isLoading,
    setManagedTermId,
  };
}

/**
 * Supabase `.or()` filter fragment for "belongs to this term, or is
 * evergreen (term_id is null)". Use on any query against subject_syllabus
 * or subject_materials once you have an effective/managed term id.
 *   supabase.from("subject_syllabus").select("*").eq("subject_id", id)
 *     .or(termOrEvergreenFilter(termId))
 */
export function termOrEvergreenFilter(termId: string | null): string {
  return termId ? `term_id.eq.${termId},term_id.is.null` : `term_id.is.null`;
}
