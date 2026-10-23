// src/pages/teacher/TeacherHifdhPlanBuilder.tsx
// ─────────────────────────────────────────────────────────────────────────
// "Start a Hifdh plan with a student" — the piece that was missing.
// hifdh_daily_assignments already had selected_items[]/current_position/
// auto_progress/rest_days columns, but nothing in the frontend ever read
// them (HifdhMemorization.tsx is fully manual — student free-picks surah +
// verse range every time). This creates a REAL ordered plan row and,
// together with the HifdhMemorization patch, makes that plan drive what
// the student sees as "today's Sabaq" — strictly in order, never random.
//
// Order: Mushaf order, Al-Fatiha (1) → An-Nas (114) — but NOT always
// starting at surah 1. A student joining with prior memorization (or an
// existing plan being restarted with new pace/rest-day settings) starts
// from wherever they actually are, picked here per-student.
// ─────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SURAHS } from "@/components/hifdh/surahData";
import { CheckCircle2, User, BookOpen } from "lucide-react";

interface StudentRow { user_id: string; full_name: string; hasActivePlan: boolean }
interface ExistingPlan { id: string; surahNum: number; ayahOffset: number; daysCompleted: number }

const SEQUENCE = SURAHS.map(s => s.num); // Mushaf order, 1 → 114 — fixed for every plan

export default function TeacherHifdhPlanBuilder() {
  const [teacherId, setTeacherId]     = useState<string | null>(null);
  const [students, setStudents]       = useState<StudentRow[]>([]);
  const [selected, setSelected]       = useState<string | null>(null);
  const [existing, setExisting]       = useState<ExistingPlan | null>(null);
  const [startSurah, setStartSurah]   = useState(1);   // which surah the NEW plan begins at
  const [startAyah, setStartAyah]     = useState(1);   // first ayah not yet memorized within that surah
  const [dailyAyahs, setDailyAyahs]   = useState(5);
  const [weekendOff, setWeekendOff]   = useState(true);
  const [saving, setSaving]           = useState(false);
  const [savedFor, setSavedFor]       = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data?.user) return;
      setTeacherId(data.user.id);
      const { data: rows } = await (supabase as any)
        .from("profiles").select("user_id, full_name")
        .order("full_name");
      const { data: active } = await (supabase as any)
        .from("hifdh_daily_assignments").select("student_id").eq("active", true);
      const activeIds = new Set((active || []).map((a: any) => a.student_id));
      setStudents((rows || []).map((r: any) => ({ ...r, hasActivePlan: activeIds.has(r.user_id) })));
    });
  }, []);

  // When a student is picked, load their existing plan (if any) so we default
  // the new plan's starting point to wherever they actually left off, instead
  // of silently resetting a mid-Quran student back to Al-Fatiha.
  useEffect(() => {
    setExisting(null); setSavedFor(null);
    if (!selected) { setStartSurah(1); setStartAyah(1); return; }
    (supabase as any).from("hifdh_daily_assignments").select("*")
      .eq("student_id", selected).eq("active", true).eq("mode", "surah_sequence").maybeSingle()
      .then(({ data }: any) => {
        if (data) {
          const idx = data.current_position?.item_index ?? 0;
          const surahNum = (data.selected_items || SEQUENCE)[idx] || 1;
          const ayahOffset = data.current_position?.page_offset ?? 0;
          setExisting({ id: data.id, surahNum, ayahOffset, daysCompleted: data.days_completed || 0 });
          setStartSurah(surahNum);
          setStartAyah(ayahOffset + 1);
          setDailyAyahs(data.daily_target_ayahs || 5);
        } else {
          setStartSurah(1); setStartAyah(1);
        }
      });
  }, [selected]);

  const startPlan = async () => {
    if (!selected || !teacherId) return;
    setSaving(true);
    try {
      const startIdx = SEQUENCE.findIndex(n => n === startSurah);
      const surah = SURAHS[startSurah - 1];
      const ayahOffset = Math.max(0, Math.min(startAyah - 1, (surah?.verses ?? 1) - 1));

      // Only one active Sabaq plan per student — retire any existing one first.
      await (supabase as any).from("hifdh_daily_assignments")
        .update({ active: false }).eq("student_id", selected).eq("active", true);

      await (supabase as any).from("hifdh_daily_assignments").insert({
        student_id: selected,
        assigned_by: teacherId,
        mode: "surah_sequence",
        selected_items: SEQUENCE,
        daily_target_ayahs: dailyAyahs,
        daily_pages: 1, // legacy column other code paths may still read; harmless default
        active: true,
        teacher_locked: true,
        starts_on: new Date().toISOString().slice(0, 10),
        current_position: { item_index: Math.max(startIdx, 0), page_offset: ayahOffset },
        rest_days: weekendOff ? [0, 6] : [],
        auto_progress: true,
      });
      setSavedFor(selected);
      setStudents(prev => prev.map(s => s.user_id === selected ? { ...s, hasActivePlan: true } : s));
    } finally {
      setSaving(false);
    }
  };

  const startSurahData = SURAHS[startSurah - 1];

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h1 className="text-lg font-bold mb-1 flex items-center gap-2"><BookOpen size={18} /> Start a Hifdh Plan</h1>
      <p className="text-xs text-muted-foreground mb-4">
        Assigns the Quran in Mushaf order (Al-Fatiha → An-Nas), starting wherever this student
        actually is. The Sabaq tab shows today's target automatically and advances after each
        completed portion — no manual surah picking.
      </p>

      <div className="mb-4">
        <label className="text-xs font-semibold block mb-1">Student</label>
        <select className="w-full border rounded px-2 py-2 text-sm" value={selected ?? ""}
          onChange={e => setSelected(e.target.value || null)}>
          <option value="">Select a student…</option>
          {students.map(s => (
            <option key={s.user_id} value={s.user_id}>
              {s.full_name}{s.hasActivePlan ? " (has an active plan)" : ""}
            </option>
          ))}
        </select>
      </div>

      {selected && (
        <div className="mb-4 text-[11px] p-2 rounded bg-muted">
          {existing
            ? `Currently on: Surah ${existing.surahNum}. ${SURAHS[existing.surahNum - 1]?.name}, ayah ${existing.ayahOffset + 1} — Day ${existing.daysCompleted}. Starting point below defaults to this; change it only if it's wrong.`
            : "No prior plan — defaults to starting fresh at Al-Fatiha."}
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold block mb-1">Start at surah</label>
          <select className="w-full border rounded px-2 py-2 text-sm" value={startSurah}
            onChange={e => { setStartSurah(Number(e.target.value)); setStartAyah(1); }}>
            {SURAHS.map(s => <option key={s.num} value={s.num}>{s.num}. {s.name} ({s.verses}v)</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold block mb-1">Start at ayah</label>
          <input type="number" min={1} max={startSurahData?.verses ?? 1} value={startAyah}
            onChange={e => setStartAyah(Number(e.target.value) || 1)}
            className="w-full border rounded px-2 py-2 text-sm" />
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground -mt-2 mb-4">
        Everything from here through An-Nas is queued in order — use this to skip past whatever
        the student has already memorized elsewhere, without losing their place in the sequence.
      </p>

      <div className="mb-4 flex items-center gap-3">
        <label className="text-xs font-semibold">Daily target</label>
        <input type="number" min={1} max={40} value={dailyAyahs}
          onChange={e => setDailyAyahs(Number(e.target.value) || 1)}
          className="w-20 border rounded px-2 py-1 text-sm" />
        <span className="text-xs text-muted-foreground">ayahs / day</span>
      </div>

      <label className="flex items-center gap-2 mb-4 text-xs">
        <input type="checkbox" checked={weekendOff} onChange={e => setWeekendOff(e.target.checked)} />
        No new memorization on weekends (Fri/Sat off — revision continues as usual)
      </label>

      <button disabled={!selected || saving} onClick={startPlan}
        className="px-4 py-2 rounded bg-primary text-white text-sm font-bold disabled:opacity-50 flex items-center gap-2">
        <User size={14} /> {saving ? "Starting…" : existing ? "Update Plan" : "Start Plan"}
      </button>

      {savedFor && (
        <div className="mt-4 text-xs text-green-700 flex items-center gap-1">
          <CheckCircle2 size={14} /> Plan saved — the student will see today's target next time they open Sabaq.
        </div>
      )}
    </div>
  );
}
