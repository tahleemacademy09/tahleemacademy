import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, BookOpen, Check, Lock, ChevronDown } from "lucide-react";

const SURAHS = [
  { n: 1, ar: "الفاتحة", en: "Al-Fatiha", ayahs: 7 },
  { n: 2, ar: "البقرة", en: "Al-Baqarah", ayahs: 286 },
  { n: 3, ar: "آل عمران", en: "Ali Imran", ayahs: 200 },
  { n: 36, ar: "يس", en: "Ya-Sin", ayahs: 83 },
  { n: 55, ar: "الرحمن", en: "Ar-Rahman", ayahs: 78 },
  { n: 56, ar: "الواقعة", en: "Al-Waqi'a", ayahs: 96 },
  { n: 67, ar: "الملك", en: "Al-Mulk", ayahs: 30 },
  { n: 78, ar: "النبأ", en: "An-Naba", ayahs: 40 },
  { n: 79, ar: "النازعات", en: "An-Naziat", ayahs: 46 },
  { n: 80, ar: "عبس", en: "Abasa", ayahs: 42 },
  { n: 87, ar: "الأعلى", en: "Al-Ala", ayahs: 19 },
  { n: 88, ar: "الغاشية", en: "Al-Ghashiya", ayahs: 26 },
  { n: 89, ar: "الفجر", en: "Al-Fajr", ayahs: 30 },
  { n: 93, ar: "الضحى", en: "Ad-Duha", ayahs: 11 },
  { n: 94, ar: "الشرح", en: "Ash-Sharh", ayahs: 8 },
  { n: 95, ar: "التين", en: "At-Tin", ayahs: 8 },
  { n: 96, ar: "العلق", en: "Al-Alaq", ayahs: 19 },
  { n: 97, ar: "القدر", en: "Al-Qadr", ayahs: 5 },
  { n: 98, ar: "البينة", en: "Al-Bayyina", ayahs: 8 },
  { n: 99, ar: "الزلزلة", en: "Az-Zalzala", ayahs: 8 },
  { n: 100, ar: "العاديات", en: "Al-Adiyat", ayahs: 11 },
  { n: 101, ar: "القارعة", en: "Al-Qaria", ayahs: 11 },
  { n: 102, ar: "التكاثر", en: "At-Takathur", ayahs: 8 },
  { n: 103, ar: "العصر", en: "Al-Asr", ayahs: 3 },
  { n: 104, ar: "الهمزة", en: "Al-Humaza", ayahs: 9 },
  { n: 105, ar: "الفيل", en: "Al-Fil", ayahs: 5 },
  { n: 106, ar: "قريش", en: "Quraysh", ayahs: 4 },
  { n: 107, ar: "الماعون", en: "Al-Maun", ayahs: 7 },
  { n: 108, ar: "الكوثر", en: "Al-Kawthar", ayahs: 3 },
  { n: 109, ar: "الكافرون", en: "Al-Kafirun", ayahs: 6 },
  { n: 110, ar: "النصر", en: "An-Nasr", ayahs: 3 },
  { n: 111, ar: "المسد", en: "Al-Masad", ayahs: 5 },
  { n: 112, ar: "الإخلاص", en: "Al-Ikhlas", ayahs: 4 },
  { n: 113, ar: "الفلق", en: "Al-Falaq", ayahs: 5 },
  { n: 114, ar: "الناس", en: "An-Nas", ayahs: 6 },
];

interface Plan {
  id: string;
  surah_number: number;
  ayah_start: number;
  ayah_end: number;
  daily_target_ayahs: number;
  revision_mode: string;
  difficulty: string;
  teacher_locked: boolean;
  max_ayahs_override: number;
  notes: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  plan: Plan | null;
  onSaved: (plan: Plan) => void;
}

const HifdhPlanSettings = ({ open, onClose, plan, onSaved }: Props) => {
  const { user, hasRole } = useAuth();
  const { toast } = useToast();
  const isAdmin = hasRole("admin");
  const isTeacher = hasRole("teacher");
  const canOverride = isAdmin || isTeacher;
  const isLocked = plan?.teacher_locked && !canOverride;

  const [surahNum, setSurahNum] = useState(plan?.surah_number || 114);
  const [ayahStart, setAyahStart] = useState(plan?.ayah_start || 1);
  const [ayahEnd, setAyahEnd] = useState(plan?.ayah_end || 6);
  const [dailyTarget, setDailyTarget] = useState(plan?.daily_target_ayahs || 5);
  const [mode, setMode] = useState(plan?.revision_mode || "memorize");
  const [difficulty, setDifficulty] = useState(plan?.difficulty || "beginner");
  const [locked, setLocked] = useState(plan?.teacher_locked || false);
  const [notes, setNotes] = useState(plan?.notes || "");
  const [saving, setSaving] = useState(false);
  const [surahSearch, setSurahSearch] = useState("");
  const [showSurahPicker, setShowSurahPicker] = useState(false);

  useEffect(() => {
    if (plan) {
      setSurahNum(plan.surah_number || 114);
      setAyahStart(plan.ayah_start || 1);
      setAyahEnd(plan.ayah_end || 6);
      setDailyTarget(plan.daily_target_ayahs || 5);
      setMode(plan.revision_mode || "memorize");
      setDifficulty(plan.difficulty || "beginner");
      setLocked(plan.teacher_locked || false);
      setNotes(plan.notes || "");
    }
  }, [plan]);

  const selectedSurah = SURAHS.find(s => s.n === surahNum) || SURAHS[SURAHS.length - 1];
  const maxAyahs = plan?.max_ayahs_override || 10;
  const filteredSurahs = SURAHS.filter(s =>
    s.en.toLowerCase().includes(surahSearch.toLowerCase()) ||
    s.ar.includes(surahSearch) ||
    String(s.n).includes(surahSearch)
  );

  const save = async () => {
    if (!plan || !user) return;
    setSaving(true);
    const end = Math.min(ayahEnd, selectedSurah.ayahs);
    const target = canOverride ? dailyTarget : Math.min(dailyTarget, maxAyahs);

    const updates: any = {
      surah_number: surahNum,
      ayah_start: ayahStart,
      ayah_end: end,
      daily_target_ayahs: target,
      revision_mode: mode,
      difficulty,
      notes,
      updated_at: new Date().toISOString(),
    };

    if (canOverride) {
      updates.teacher_locked = locked;
      updates.max_ayahs_override = dailyTarget;
    }

    // Update surah_rotation to reflect new selection
    updates.surah_rotation = [surahNum];

    const { error } = await supabase
      .from("hifdh_plans" as any)
      .update(updates)
      .eq("id", plan.id);

    if (error) toast({ title: "Error saving plan", variant: "destructive" });
    else {
      toast({ title: "✅ Plan saved! بارك الله فيك" });
      onSaved({ ...plan, ...updates });
      onClose();
    }
    setSaving(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-t-3xl overflow-hidden" style={{ backgroundColor: "#f5f0e8", maxHeight: "92vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>

        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-gray-300" /></div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div>
            <h2 className="font-bold text-lg" style={{ color: "#1a3a2a" }}>Hifdh Plan Settings</h2>
            <p className="text-xs text-gray-500">إعدادات خطة الحفظ</p>
          </div>
          <button onClick={onClose}><X className="h-5 w-5 text-gray-400" /></button>
        </div>

        {/* Locked notice */}
        {isLocked && (
          <div className="mx-5 mt-4 px-4 py-3 rounded-xl flex items-center gap-2" style={{ backgroundColor: "#FEF3C7" }}>
            <Lock className="h-4 w-4 text-amber-600 shrink-0" />
            <p className="text-xs text-amber-700">Your teacher has locked this plan. Contact them to make changes.</p>
          </div>
        )}

        <div className="px-5 py-4 space-y-5">

          {/* Surah Picker */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase mb-2 block">Surah</label>
            <button
              disabled={isLocked}
              onClick={() => setShowSurahPicker(!showSurahPicker)}
              className="w-full flex items-center justify-between px-4 py-3 bg-white rounded-2xl shadow-sm border"
            >
              <div className="text-left">
                <p className="font-semibold text-sm" style={{ color: "#1a3a2a" }}>{selectedSurah.en}</p>
                <p className="text-xs text-gray-400" dir="rtl">{selectedSurah.ar} — {selectedSurah.ayahs} ayahs</p>
              </div>
              <ChevronDown className="h-4 w-4 text-gray-400" />
            </button>

            {showSurahPicker && (
              <div className="mt-2 bg-white rounded-2xl shadow-lg border overflow-hidden">
                <div className="p-3 border-b">
                  <input
                    autoFocus
                    value={surahSearch}
                    onChange={e => setSurahSearch(e.target.value)}
                    placeholder="Search surah..."
                    className="w-full text-sm outline-none bg-transparent"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {filteredSurahs.map(s => (
                    <button
                      key={s.n}
                      onClick={() => { setSurahNum(s.n); setAyahStart(1); setAyahEnd(Math.min(s.ayahs, dailyTarget)); setShowSurahPicker(false); setSurahSearch(""); }}
                      className={`w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 text-sm ${surahNum === s.n ? "bg-green-50" : ""}`}
                    >
                      <div className="text-left">
                        <span className="font-medium" style={{ color: "#1a3a2a" }}>{s.en}</span>
                        <span className="text-gray-400 text-xs ml-2">({s.ayahs} ayahs)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400" dir="rtl">{s.ar}</span>
                        {surahNum === s.n && <Check className="h-3.5 w-3.5 text-green-500" />}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Ayah Range */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase mb-2 block">Ayah Range</label>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-2xl px-4 py-3 shadow-sm border">
                <p className="text-[10px] text-gray-400 mb-1">From Ayah</p>
                <input
                  type="number"
                  min={1}
                  max={selectedSurah.ayahs}
                  value={ayahStart}
                  disabled={isLocked}
                  onChange={e => setAyahStart(Math.max(1, Math.min(Number(e.target.value), selectedSurah.ayahs)))}
                  className="w-full text-xl font-bold outline-none bg-transparent"
                  style={{ color: "#1a3a2a" }}
                />
              </div>
              <div className="bg-white rounded-2xl px-4 py-3 shadow-sm border">
                <p className="text-[10px] text-gray-400 mb-1">To Ayah</p>
                <input
                  type="number"
                  min={ayahStart}
                  max={selectedSurah.ayahs}
                  value={ayahEnd}
                  disabled={isLocked}
                  onChange={e => setAyahEnd(Math.max(ayahStart, Math.min(Number(e.target.value), selectedSurah.ayahs)))}
                  className="w-full text-xl font-bold outline-none bg-transparent"
                  style={{ color: "#1a3a2a" }}
                />
              </div>
            </div>
            <p className="text-[10px] text-gray-400 mt-1.5 text-center">
              {ayahEnd - ayahStart + 1} ayahs selected out of {selectedSurah.ayahs}
              {!canOverride && ` (max ${maxAyahs} allowed)`}
            </p>
          </div>

          {/* Daily Target */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase mb-2 block">Daily Target</label>
            <div className="bg-white rounded-2xl px-4 py-3 shadow-sm border flex items-center gap-4">
              <button disabled={isLocked} onClick={() => setDailyTarget(Math.max(1, dailyTarget - 1))} className="h-8 w-8 rounded-full border flex items-center justify-center text-lg font-bold">−</button>
              <div className="flex-1 text-center">
                <p className="text-3xl font-bold" style={{ color: "#1a3a2a" }}>{dailyTarget}</p>
                <p className="text-xs text-gray-400">ayahs per day</p>
              </div>
              <button disabled={isLocked || (!canOverride && dailyTarget >= maxAyahs)} onClick={() => setDailyTarget(dailyTarget + 1)} className="h-8 w-8 rounded-full border flex items-center justify-center text-lg font-bold">+</button>
            </div>
          </div>

          {/* Revision Mode */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase mb-2 block">Revision Mode</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { val: "memorize", label: "Memorize New", icon: "📖", desc: "Learn new ayahs" },
                { val: "review", label: "Review Old", icon: "🔄", desc: "Revise memorized" },
              ].map(m => (
                <button
                  key={m.val}
                  disabled={isLocked}
                  onClick={() => setMode(m.val)}
                  className={`p-3 rounded-2xl border text-left transition-all ${mode === m.val ? "border-2 shadow-sm" : "bg-white border-gray-200"}`}
                  style={mode === m.val ? { backgroundColor: "#e8f5e9", borderColor: "#1a3a2a" } : {}}
                >
                  <p className="text-lg mb-0.5">{m.icon}</p>
                  <p className="text-sm font-semibold" style={{ color: "#1a3a2a" }}>{m.label}</p>
                  <p className="text-[10px] text-gray-400">{m.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Difficulty */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase mb-2 block">Difficulty Level</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { val: "beginner", label: "Beginner", color: "#22c55e" },
                { val: "intermediate", label: "Intermediate", color: "#b8962e" },
                { val: "advanced", label: "Advanced", color: "#ef4444" },
              ].map(d => (
                <button
                  key={d.val}
                  disabled={isLocked}
                  onClick={() => setDifficulty(d.val)}
                  className={`py-2.5 rounded-2xl border text-xs font-semibold transition-all ${difficulty === d.val ? "text-white border-transparent" : "bg-white border-gray-200 text-gray-500"}`}
                  style={difficulty === d.val ? { backgroundColor: d.color } : {}}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Teacher notes */}
          {plan?.notes && !canOverride && (
            <div className="px-4 py-3 rounded-2xl" style={{ backgroundColor: "#e8f5e9" }}>
              <p className="text-[10px] font-semibold text-green-700 mb-1">📝 Teacher's Note</p>
              <p className="text-sm text-green-800">{plan.notes}</p>
            </div>
          )}

          {/* Admin: Notes + Lock */}
          {canOverride && (
            <>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase mb-2 block">Note for Student</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Leave a note for the student..."
                  rows={2}
                  className="w-full bg-white rounded-2xl px-4 py-3 text-sm border shadow-sm outline-none resize-none"
                />
              </div>
              <div className="flex items-center justify-between bg-white rounded-2xl px-4 py-3 border shadow-sm">
                <div>
                  <p className="text-sm font-semibold" style={{ color: "#1a3a2a" }}>Lock plan for student</p>
                  <p className="text-xs text-gray-400">Student cannot change this plan</p>
                </div>
                <button
                  onClick={() => setLocked(!locked)}
                  className={`h-6 w-11 rounded-full transition-colors relative`}
                  style={{ backgroundColor: locked ? "#1a3a2a" : "#d1d5db" }}
                >
                  <div className={`h-5 w-5 bg-white rounded-full absolute top-0.5 transition-transform ${locked ? "translate-x-5" : "translate-x-0.5"}`} />
                </button>
              </div>
            </>
          )}

          {/* Save */}
          <Button
            onClick={save}
            disabled={saving || isLocked}
            className="w-full py-4 rounded-2xl text-white font-semibold text-base"
            style={{ backgroundColor: "#1a3a2a" }}
          >
            {saving ? "Saving..." : isLocked ? "🔒 Plan Locked" : "💾 Save Plan"}
          </Button>

          <div className="pb-4" />
        </div>
      </div>
    </div>
  );
};

export default HifdhPlanSettings;
