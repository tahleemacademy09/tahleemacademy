/*
  src/components/levels/LevelSelect.tsx
  ─────────────────────────────────────
  Drop-in replacement for the dozens of hardcoded
    <option value="beginner">Beginner</option>
    <option value="intermediate">Intermediate</option>
    <option value="advanced">Advanced</option>
  blocks scattered across the codebase.

  Pulls levels live from the `academic_levels` table via useAcademicLevels.
  Renders both Arabic and English labels (RTL-friendly).

  Usage:
    <LevelSelect value={level} onChange={setLevel} placeholder="Select level…" />
*/
import { useAcademicLevels } from "@/hooks/useAcademicLevels";

interface LevelSelectProps {
  value: string | null | undefined;
  onChange: (slug: string) => void;
  placeholder?: string;
  disabled?: boolean;
  includeAllOption?: boolean;
  allOptionLabel?: string;
  className?: string;
  /** When true, render as native <select>. Default true (lightweight, no shadcn dep). */
  native?: boolean;
  id?: string;
  name?: string;
}

export function LevelSelect({
  value,
  onChange,
  placeholder = "Select level…",
  disabled,
  includeAllOption,
  allOptionLabel = "All levels",
  className,
  id,
  name,
}: LevelSelectProps) {
  const { data: levels, isLoading } = useAcademicLevels();

  return (
    <select
      id={id}
      name={name}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled || isLoading}
      className={
        className ??
        "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 disabled:bg-gray-50 disabled:text-gray-400"
      }
    >
      <option value="" disabled={!includeAllOption}>
        {isLoading ? "Loading levels…" : placeholder}
      </option>
      {includeAllOption && <option value="">{allOptionLabel}</option>}
      {levels?.map((lvl) => (
        <option key={lvl.id} value={lvl.slug}>
          {lvl.name_en} — {lvl.name_ar}
        </option>
      ))}
    </select>
  );
}

export default LevelSelect;