// Adds the level(s) to a subject's display name so subjects that share a
// title (e.g. three "Al-Hadith" entries) can be told apart in dropdowns.
// Reads the subject's `level` text field: "beginner", "beginner,intermediate",
// "tamhidi", "all" … and skips a level that the title already mentions
// (e.g. "Arabiyyah (Tamhidi)").
import { getLevelDisplay, type AcademicLevel } from "@/hooks/useAcademicLevels";

export function subjectOptionLabel(
  s: { title?: string | null; title_ar?: string | null; level?: string | null; levels?: string[] | null },
  language: string,
  academicLevels?: AcademicLevel[],
): string {
  const ar = language === "ar";
  const base = (ar ? s.title_ar || s.title : s.title) || "";
  const raw = (s.level || (s.levels || []).join(",") || "").toLowerCase().trim();
  if (!raw) return base;

  const slugs = raw.split(",").map((x) => x.trim()).filter(Boolean);
  const names: string[] = slugs.includes("all")
    ? [ar ? "كل المستويات" : "All levels"]
    : slugs.map((slug) => {
        if (slug === "tamhidi") return ar ? "تمهيدي" : "Tamhidi";
        const d = getLevelDisplay(slug, academicLevels);
        return ar ? d.name_ar : d.name_en;
      });

  const lowerBase = base.toLowerCase();
  const fresh = names.filter((n) => n && !lowerBase.includes(n.toLowerCase()));
  return fresh.length ? `${base} (${fresh.join(", ")})` : base;
}
