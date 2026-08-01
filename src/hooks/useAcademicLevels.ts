/*
  src/hooks/useAcademicLevels.ts — Tahleem Academy
  ─────────────────────────────────────────────────
  Single source of truth for academic levels across the entire platform.

  • Fetches from the new `academic_levels` table (admin-managed, dynamic).
  • Cached via TanStack Query so all consumers share one network call.
  • Subscribes to Supabase Realtime so admin edits propagate instantly.
  • Provides helpers for slug → display name and ordering.

  Backwards compatibility:
  • The legacy `profiles.level` text column still stores the slug
    (`tamhidi` | `beginner` | `intermediate` | `advanced`). Any code that
    compares `profile.level === 'beginner'` continues to work unchanged.
  • The new `tamhidi` slug is purely additive.
*/
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AcademicLevel {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  description_ar: string | null;
  description_en: string | null;
  sort_order: number;
  is_active: boolean;
}

const QUERY_KEY = ["academic_levels"] as const;

/** Fetch all active levels, ordered by curriculum progression. */
async function fetchLevels(): Promise<AcademicLevel[]> {
  const { data, error } = await supabase
    .from("academic_levels" as any)
    .select("id, slug, name_ar, name_en, description_ar, description_en, sort_order, is_active")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as AcademicLevel[];
}

/** Fetch ALL levels including inactive ones — admin-only view. */
async function fetchAllLevels(): Promise<AcademicLevel[]> {
  const { data, error } = await supabase
    .from("academic_levels" as any)
    .select("id, slug, name_ar, name_en, description_ar, description_en, sort_order, is_active")
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as AcademicLevel[];
}

/**
 * Public hook used everywhere a level dropdown / badge is rendered.
 * Returns active levels only. Includes realtime invalidation so a
 * change in the admin panel propagates to every open tab in <1s.
 */
export function useAcademicLevels() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchLevels,
    staleTime: 5 * 60 * 1000, // 5 min — levels change rarely
    gcTime: 30 * 60 * 1000,
  });

  // Socket is only held open while the tab is visible — an always-on Realtime
  // connection makes Android evict the backgrounded tab, which looks like a
  // full page reload on return. Rebuild + invalidate on resume instead.
  useVisibleRealtime(
    () =>
      supabase
        .channel("academic_levels_realtime")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "academic_levels" },
          () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
        )
        .subscribe(),
    [qc],
    () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  );

  return query;
}

/** Admin-only variant — includes inactive levels for management UI. */
export function useAllAcademicLevels() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["academic_levels", "all"],
    queryFn: fetchAllLevels,
    staleTime: 60 * 1000,
  });

  useVisibleRealtime(
    () =>
      supabase
        .channel("academic_levels_admin_realtime")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "academic_levels" },
          () => qc.invalidateQueries({ queryKey: ["academic_levels"] }),
        )
        .subscribe(),
    [qc],
    () => qc.invalidateQueries({ queryKey: ["academic_levels"] }),
  );

  return query;
}

/** Helper: map a slug to its display labels. Falls back gracefully. */
export function getLevelDisplay(
  slug: string | null | undefined,
  levels: AcademicLevel[] | undefined,
): { name_ar: string; name_en: string } {
  if (!slug) return { name_ar: "—", name_en: "—" };
  const found = levels?.find((l) => l.slug === slug);
  if (found) return { name_ar: found.name_ar, name_en: found.name_en };
  // Legacy fallback for any slug that pre-dates the table
  const legacy: Record<string, { name_ar: string; name_en: string }> = {
    beginner:     { name_ar: "المستوى المبتدئ",  name_en: "Beginner" },
    intermediate: { name_ar: "المستوى المتوسط",  name_en: "Intermediate" },
    advanced:     { name_ar: "المستوى المتقدم",  name_en: "Advanced" },
    tamhidi:      { name_ar: "المرحلة التمهيدية", name_en: "Foundation" },
  };
  return legacy[slug] ?? { name_ar: slug, name_en: slug };
}
// ─── Color / emoji palette — cycles for any number of levels ───────────────
const LEVEL_PALETTE = [
  { color: "#0E7490", bg: "#ECFEFF", border: "#67E8F9", emoji: "📚", dot: "🔵" },
  { color: "#16A34A", bg: "#F0FDF4", border: "#86EFAC", emoji: "🌱", dot: "🟢" },
  { color: "#2563EB", bg: "#EFF6FF", border: "#93C5FD", emoji: "📖", dot: "🔵" },
  { color: "#7C3AED", bg: "#F5F3FF", border: "#C4B5FD", emoji: "⭐", dot: "🟣" },
  { color: "#B45309", bg: "#FFFBEB", border: "#FCD34D", emoji: "🎓", dot: "🟡" },
  { color: "#DC2626", bg: "#FEF2F2", border: "#FCA5A5", emoji: "🏆", dot: "🔴" },
];

/** Returns color/bg/border/emoji for a given slug, using sort_order index. */
export function getLevelConfig(
  slug: string | null | undefined,
  levels: AcademicLevel[] | undefined,
): { color: string; bg: string; border: string; emoji: string; dot: string } {
  const idx = levels?.findIndex((l) => l.slug === slug) ?? -1;
  if (idx >= 0) return LEVEL_PALETTE[idx % LEVEL_PALETTE.length];
  const fallback: Record<string, number> = {
    tamhidi: 0, beginner: 1, intermediate: 2, advanced: 3,
  };
  const fi = slug ? (fallback[slug] ?? 0) : 0;
  return LEVEL_PALETTE[fi % LEVEL_PALETTE.length];
}
