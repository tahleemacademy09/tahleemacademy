/*
  src/components/majlis/ProgramsAdmin.tsx — Tahleem Academy
  Admin: manage Majlis programs (Halqah, Halqatu Nisaa, Lecture…) and their weekly slots.
  Used inside admin Timetable Management. Slots appear in the student/teacher timetable "Programs" section.
*/
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layers, Plus, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAcademicLevels } from "@/hooks/useAcademicLevels";
import { useCurrentTermId } from "@/hooks/useCurrentTermId";
import { toast } from "@/hooks/use-toast";
import type { MajlisProgram, ProgramSlot } from "./ProgramsTimetableSection";

const G = "#0f2d1f", GOLD = "#c9a84c";
const DAYS = [
  { en: "Sunday", ar: "الأحد" }, { en: "Monday", ar: "الاثنين" }, { en: "Tuesday", ar: "الثلاثاء" },
  { en: "Wednesday", ar: "الأربعاء" }, { en: "Thursday", ar: "الخميس" }, { en: "Friday", ar: "الجمعة" }, { en: "Saturday", ar: "السبت" },
];
const inp: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #e5e7eb", fontSize: 13, fontFamily: "inherit", background: "#fafafa", boxSizing: "border-box", outline: "none" };
const lbl: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 5 };
const to12 = (s: string) => { const [h, m] = s.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`; };
const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `program-${Date.now()}`;

export default function ProgramsAdmin() {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const qc = useQueryClient();
  const { data: levels = [] } = useAcademicLevels();
  const termId = useCurrentTermId();
  const [showProg, setShowProg] = useState(false);
  const [pf, setPf] = useState({ name: "", name_ar: "", color: "#276749" });
  const [showSlot, setShowSlot] = useState(false);
  const [sf, setSf] = useState({ program_id: "", title: "", day_of_week: 1, start_time: "09:00", end_time: "10:00", levels: [] as string[], notes: "" });
  const [saving, setSaving] = useState(false);

  const { data: programs = [] } = useQuery({
    queryKey: ["admin-majlis-programs"],
    queryFn: async () => ((await (supabase as any).from("majlis_programs").select("*").order("sort_order").order("name")).data || []) as MajlisProgram[],
  });
  const { data: slots = [] } = useQuery({
    queryKey: ["admin-program-slots"],
    queryFn: async () => ((await (supabase as any).from("program_timetable").select("*").order("day_of_week").order("start_time")).data || []) as ProgramSlot[],
  });
  const refresh = () => {
    ["admin-majlis-programs", "admin-program-slots", "majlis-programs", "program-timetable"].forEach(k => qc.invalidateQueries({ queryKey: [k] }));
  };
  const pName = (p?: MajlisProgram) => p ? (language === "ar" ? p.name_ar || p.name : p.name) : "";

  const addProgram = async () => {
    if (!pf.name.trim()) return;
    setSaving(true);
    const { error } = await (supabase as any).from("majlis_programs").insert({
      slug: slugify(pf.name), name: pf.name.trim(), name_ar: pf.name_ar.trim() || null, color: pf.color, sort_order: programs.length + 1,
    });
    setSaving(false);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    setPf({ name: "", name_ar: "", color: "#276749" }); setShowProg(false); refresh();
  };
  const toggleProgram = async (p: MajlisProgram) => {
    await (supabase as any).from("majlis_programs").update({ is_active: !p.is_active }).eq("id", p.id); refresh();
  };
  const removeProgram = async (p: MajlisProgram) => {
    if (!window.confirm(t("Delete this program and its slots? Recordings stay but become uncategorised.", "حذف هذا البرنامج وحصصه؟ تبقى التسجيلات بدون تصنيف."))) return;
    await (supabase as any).from("majlis_programs").delete().eq("id", p.id); refresh();
  };
  const addSlot = async () => {
    if (!sf.program_id) { toast({ title: t("Choose a program", "اختر برنامجاً"), variant: "destructive" }); return; }
    if (sf.end_time <= sf.start_time) { toast({ title: t("End time must be after start", "يجب أن ينتهي بعد البدء"), variant: "destructive" }); return; }
    setSaving(true);
    const { error } = await (supabase as any).from("program_timetable").insert({
      program_id: sf.program_id, title: sf.title.trim() || null, day_of_week: sf.day_of_week,
      start_time: sf.start_time, end_time: sf.end_time, levels: sf.levels, notes: sf.notes.trim() || null,
      term_id: termId || null, created_by: user?.id,
    });
    setSaving(false);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    setShowSlot(false); setSf({ ...sf, title: "", notes: "" }); refresh();
  };
  const removeSlot = async (id: string) => {
    if (!window.confirm(t("Delete this slot?", "حذف هذه الحصة؟"))) return;
    await (supabase as any).from("program_timetable").delete().eq("id", id); refresh();
  };

  return (
    <div style={{ background: "#fff", borderRadius: 18, border: "1px solid #e5e7eb", padding: 16, marginTop: 24, fontFamily: "'Cairo', sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <Layers style={{ width: 18, height: 18, color: GOLD }} />
        <h2 style={{ fontSize: 16, fontWeight: 900, color: G, margin: 0, flex: 1 }}>{t("Programs (Majlis)", "البرامج (المجلس)")}</h2>
        <button onClick={() => setShowProg(true)} style={{ padding: "8px 12px", borderRadius: 10, border: "1.5px solid #e5e7eb", background: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
          <Plus size={13} style={{ verticalAlign: -2 }} /> {t("Program", "برنامج")}
        </button>
        <button onClick={() => { setSf(s => ({ ...s, program_id: s.program_id || programs[0]?.id || "" })); setShowSlot(true); }} style={{ padding: "8px 12px", borderRadius: 10, border: "none", background: GOLD, color: G, fontSize: 12, fontWeight: 900, cursor: "pointer", fontFamily: "inherit" }}>
          <Plus size={13} style={{ verticalAlign: -2 }} /> {t("Slot", "حصة")}
        </button>
      </div>
      <p style={{ fontSize: 11, color: "#6b7280", margin: "0 0 12px", lineHeight: 1.6 }}>
        {t("Join on these slots opens Al-Majlis Live. Recordings are grouped by program.", "الانضمام لهذه الحصص يفتح المجلس المباشر، والتسجيلات تُصنَّف حسب البرنامج.")}
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {programs.map(p => (
          <span key={p.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 20, background: `${p.color}18`, color: p.color, border: `1px solid ${p.color}40`, fontSize: 12, fontWeight: 800, opacity: p.is_active ? 1 : 0.5 }}>
            {pName(p)}
            <button onClick={() => toggleProgram(p)} title={p.is_active ? "Hide" : "Show"} style={{ border: "none", background: "none", color: "inherit", cursor: "pointer", fontSize: 10, fontWeight: 800, padding: 0 }}>{p.is_active ? t("on", "فعّال") : t("off", "متوقف")}</button>
            <button onClick={() => removeProgram(p)} style={{ border: "none", background: "none", color: "inherit", cursor: "pointer", padding: 0, display: "flex" }}><Trash2 size={12} /></button>
          </span>
        ))}
      </div>

      {slots.length === 0 ? (
        <p style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", margin: 0 }}>{t("No program slots yet", "لا توجد حصص برامج بعد")}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {slots.map(s => {
            const p = programs.find(x => x.id === s.program_id);
            return (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: "1px solid #f0f0f0", borderRadius: 12 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: G, minWidth: 74 }}>{language === "ar" ? DAYS[s.day_of_week].ar : DAYS[s.day_of_week].en}</span>
                <span style={{ fontSize: 12, color: "#374151", flex: 1 }}>
                  {to12(s.start_time)} – {to12(s.end_time)} · <strong style={{ color: p?.color }}>{pName(p)}</strong>{s.title ? ` · ${s.title}` : ""}
                </span>
                <button onClick={() => removeSlot(s.id)} style={{ border: "none", background: "none", color: "#9ca3af", cursor: "pointer", display: "flex" }}><Trash2 size={14} /></button>
              </div>
            );
          })}
        </div>
      )}

      {(showProg || showSlot) && (
        <div onClick={() => { setShowProg(false); setShowSlot(false); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 700, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", width: "100%", maxWidth: 480, borderRadius: "20px 20px 0 0", padding: 18, maxHeight: "88vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <strong style={{ color: G }}>{showProg ? t("New program", "برنامج جديد") : t("New program slot", "حصة برنامج جديدة")}</strong>
              <button onClick={() => { setShowProg(false); setShowSlot(false); }} style={{ border: "none", background: "none", cursor: "pointer" }}><X size={18} /></button>
            </div>
            {showProg ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div><label style={lbl}>{t("Name", "الاسم")}</label><input style={inp} value={pf.name} onChange={e => setPf({ ...pf, name: e.target.value })} placeholder="Halqah" /></div>
                <div><label style={lbl}>{t("Arabic name", "الاسم بالعربية")}</label><input dir="rtl" style={inp} value={pf.name_ar} onChange={e => setPf({ ...pf, name_ar: e.target.value })} /></div>
                <div><label style={lbl}>{t("Colour", "اللون")}</label><input type="color" value={pf.color} onChange={e => setPf({ ...pf, color: e.target.value })} style={{ width: 60, height: 36, border: "none", background: "none" }} /></div>
                <button disabled={saving} onClick={addProgram} style={{ padding: 12, borderRadius: 12, border: "none", background: GOLD, color: G, fontWeight: 900, cursor: "pointer", fontFamily: "inherit" }}>{t("Add program", "إضافة برنامج")}</button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div><label style={lbl}>{t("Program", "البرنامج")}</label>
                  <select style={inp} value={sf.program_id} onChange={e => setSf({ ...sf, program_id: e.target.value })}>
                    <option value="">—</option>{programs.filter(p => p.is_active).map(p => <option key={p.id} value={p.id}>{pName(p)}</option>)}
                  </select></div>
                <div><label style={lbl}>{t("Title (optional)", "العنوان (اختياري)")}</label><input style={inp} value={sf.title} onChange={e => setSf({ ...sf, title: e.target.value })} /></div>
                <div><label style={lbl}>{t("Day", "اليوم")}</label>
                  <select style={inp} value={sf.day_of_week} onChange={e => setSf({ ...sf, day_of_week: Number(e.target.value) })}>
                    {DAYS.map((d, i) => <option key={i} value={i}>{language === "ar" ? d.ar : d.en}</option>)}
                  </select></div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div><label style={lbl}>{t("Start", "البدء")}</label><input type="time" style={inp} value={sf.start_time} onChange={e => setSf({ ...sf, start_time: e.target.value })} /></div>
                  <div><label style={lbl}>{t("End", "الانتهاء")}</label><input type="time" style={inp} value={sf.end_time} onChange={e => setSf({ ...sf, end_time: e.target.value })} /></div>
                </div>
                <div><label style={lbl}>{t("Levels (none = everyone)", "المستويات (فارغ = الجميع)")}</label>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {levels.map(l => { const on = sf.levels.includes(l.slug); return (
                      <button key={l.slug} onClick={() => setSf({ ...sf, levels: on ? sf.levels.filter(x => x !== l.slug) : [...sf.levels, l.slug] })}
                        style={{ padding: "5px 11px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: `1.5px solid ${on ? G : "#e5e7eb"}`, background: on ? G : "#fff", color: on ? "#fff" : "#4b5563" }}>{l.name_en}</button>
                    ); })}
                  </div></div>
                <div><label style={lbl}>{t("Notes", "ملاحظات")}</label><input style={inp} value={sf.notes} onChange={e => setSf({ ...sf, notes: e.target.value })} /></div>
                <button disabled={saving} onClick={addSlot} style={{ padding: 12, borderRadius: 12, border: "none", background: GOLD, color: G, fontWeight: 900, cursor: "pointer", fontFamily: "inherit" }}>{t("Add slot", "إضافة حصة")}</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
