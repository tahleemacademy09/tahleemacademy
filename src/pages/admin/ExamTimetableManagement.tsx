/*
  src/pages/admin/ExamTimetableManagement.tsx — Tahleem Academy
  ──────────────────────────────────────────────────────────
  Admin page: create / edit / delete exam & test timetable slots.
  Unlike subject_timetable (a recurring weekly class schedule), each row
  here is a one-off dated slot (test/quiz/exam) shown to students on the
  "My Timetable" page's Exam & Test Schedule section, gated by the
  `exams_module_enabled` academy setting.
*/

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAcademicLevels, getLevelConfig } from "@/hooks/useAcademicLevels";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAcademySettings } from "@/hooks/useAcademySettings";
import { toast } from "@/hooks/use-toast";
import {
  ClipboardList, Clock, Edit2, Trash2, Plus, X, Calendar,
  Video, Save, Loader2, MapPin,
} from "lucide-react";

const G    = "#0f2d1f";
const GM   = "#1a4731";
const GOLD = "#c9a84c";

const EXAM_TYPES = [
  { value: "test",     en: "Test",      ar: "اختبار قصير" },
  { value: "quiz",      en: "Quiz",      ar: "مسابقة" },
  { value: "mid_term",  en: "Mid-Term",  ar: "امتحان منتصف الفصل" },
  { value: "final",     en: "Final",     ar: "امتحان نهائي" },
  { value: "exam",      en: "Exam",      ar: "امتحان" },
];

interface SlotForm {
  title: string;
  title_ar: string;
  subject_id: string;
  exam_type: string;
  exam_date: string;
  start_time: string;
  end_time: string;
  levels: string[];
  venue: string;
  live_url: string;
  notes: string;
  is_active: boolean;
}

const EMPTY: SlotForm = {
  title: "",
  title_ar: "",
  subject_id: "",
  exam_type: "test",
  exam_date: new Date().toISOString().split("T")[0],
  start_time: "09:00",
  end_time: "10:00",
  levels: [],
  venue: "",
  live_url: "",
  notes: "",
  is_active: true,
};

export default function ExamTimetableManagement() {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const qc = useQueryClient();
  const { data: academicLevels = [] } = useAcademicLevels();
  const LEVELS = academicLevels.map(l => ({ value: l.slug, label: l.name_en, ar: l.name_ar }));
  const { isExamsModuleEnabled, updateSetting } = useAcademySettings();

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId]     = useState<string | null>(null);
  const [form, setForm]         = useState<SlotForm>(EMPTY);

  const { data: slots, isLoading } = useQuery({
    queryKey: ["exam-timetable-admin"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("exam_timetable_slots")
        .select(`*, subjects(id, title, title_ar)`)
        .order("exam_date")
        .order("start_time");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: subjects } = useQuery({
    queryKey: ["subjects-active"],
    queryFn: async () => {
      const { data } = await supabase
        .from("subjects")
        .select("id, title, title_ar")
        .eq("is_active", true)
        .order("title");
      return data || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (values: SlotForm) => {
      const payload = {
        title:       values.title,
        title_ar:    values.title_ar || null,
        subject_id:  values.subject_id || null,
        exam_type:   values.exam_type,
        exam_date:   values.exam_date,
        start_time:  values.start_time,
        end_time:    values.end_time,
        levels:      values.levels,
        venue:       values.venue || null,
        live_url:    values.live_url || null,
        notes:       values.notes || null,
        is_active:   values.is_active,
        created_by:  user?.id,
      };
      if (editId) {
        const { error } = await (supabase as any).from("exam_timetable_slots").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("exam_timetable_slots").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exam-timetable-admin"] });
      qc.invalidateQueries({ queryKey: ["exam-timetable-student"] });
      setShowForm(false);
      setEditId(null);
      setForm(EMPTY);
      toast({ title: t("Exam schedule saved ✅", "تم حفظ جدول الامتحان ✅") });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("exam_timetable_slots").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exam-timetable-admin"] });
      toast({ title: t("Slot deleted", "تم حذف الموعد") });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openEdit = (slot: any) => {
    setEditId(slot.id);
    setForm({
      title:       slot.title || "",
      title_ar:    slot.title_ar || "",
      subject_id:  slot.subject_id || "",
      exam_type:   slot.exam_type || "test",
      exam_date:   slot.exam_date,
      start_time:  slot.start_time?.slice(0, 5) || "09:00",
      end_time:    slot.end_time?.slice(0, 5) || "10:00",
      levels:      slot.levels || [],
      venue:       slot.venue || "",
      live_url:    slot.live_url || "",
      notes:       slot.notes || "",
      is_active:   slot.is_active !== false,
    });
    setShowForm(true);
  };

  const toggleLevel = (lv: string) => {
    setForm(f => ({ ...f, levels: f.levels.includes(lv) ? f.levels.filter(x => x !== lv) : [...f.levels, lv] }));
  };

  const todayStr = new Date().toISOString().split("T")[0];
  const upcoming = (slots || []).filter((s: any) => s.exam_date >= todayStr);
  const past     = (slots || []).filter((s: any) => s.exam_date < todayStr);

  const typeLabel = (v: string) => {
    const et = EXAM_TYPES.find(e => e.value === v);
    return et ? (language === "ar" ? et.ar : et.en) : v;
  };

  const renderSlotCard = (slot: any) => (
    <div key={slot.id} style={{ background: "#fff", borderRadius: 16, border: "1px solid #e5e7eb", padding: 16, display: "flex", gap: 14, alignItems: "flex-start" }}>
      <div style={{ textAlign: "center", flexShrink: 0, minWidth: 70 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: G }}>{new Date(slot.exam_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</div>
        <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>{slot.start_time?.slice(0, 5)}–{slot.end_time?.slice(0, 5)}</div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: G }}>{slot.title}</span>
          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 9, background: "#fffbeb", color: "#b7791f", fontWeight: 700 }}>{typeLabel(slot.exam_type)}</span>
          {!slot.is_active && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 9, background: "#fef2f2", color: "#dc2626", fontWeight: 700 }}>{t("Inactive", "غير مفعل")}</span>}
        </div>
        {slot.subjects?.title && <p style={{ fontSize: 12, color: "#6b7280", margin: "4px 0 0" }}>{slot.subjects.title}</p>}
        {slot.venue && <div style={{ display: "flex", alignItems: "center", gap: 5, color: "#9ca3af", fontSize: 11, marginTop: 4 }}><MapPin style={{ width: 11, height: 11 }} /> {slot.venue}</div>}
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 7 }}>
          {(slot.levels || []).length === 0 ? <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 9, background: "#f0fff4", color: "#22c55e", fontWeight: 700 }}>{t("All Levels", "جميع المستويات")}</span>
            : (slot.levels || []).map((lv: string) => { const lc = getLevelConfig(lv, academicLevels); return <span key={lv} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 9, fontWeight: 700, background: `${lc.color}18`, color: lc.color }}>{lv}</span>; })}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button onClick={() => openEdit(slot)} style={{ width: 32, height: 32, borderRadius: 9, border: "1px solid #e5e7eb", background: "#f9fafb", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Edit2 style={{ width: 14, height: 14, color: "#6b7280" }} />
        </button>
        <button onClick={() => { if (confirm(t("Delete this slot?", "حذف هذا الموعد؟"))) deleteMutation.mutate(slot.id); }} style={{ width: 32, height: 32, borderRadius: 9, border: "1px solid #fecaca", background: "#fef2f2", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Trash2 style={{ width: 14, height: 14, color: "#dc2626" }} />
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: "'Cairo', sans-serif", background: "#f8fafb", minHeight: "100vh" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');`}</style>

      <div style={{ background: `linear-gradient(135deg,${G},${GM})`, padding: "20px 20px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <ClipboardList style={{ width: 22, height: 22, color: GOLD }} />
              <h1 style={{ fontSize: 20, fontWeight: 900, color: "#fff", margin: 0 }}>{t("Exam & Test Timetable", "جدول الامتحانات والاختبارات")}</h1>
            </div>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,.55)", margin: 0 }}>
              {(slots || []).length} {t("scheduled slots", "مواعيد مجدولة")}
              {" · "}
              {isExamsModuleEnabled
                ? <span style={{ color: "#86efac" }}>{t("Exams module is ON — students can see this", "وحدة الامتحانات مفعّلة — يراها الطلاب")}</span>
                : <span style={{ color: "#fca5a5" }}>{t("Exams module is OFF — students can't see this yet", "وحدة الامتحانات معطّلة — لا يراها الطلاب بعد")}</span>}
            </p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => updateSetting("exams_module_enabled", isExamsModuleEnabled ? "false" : "true", user?.id)}
              style={{ padding: "10px 16px", borderRadius: 12, border: `1.5px solid ${GOLD}66`, background: "transparent", color: GOLD, fontSize: 12, fontWeight: 800, cursor: "pointer" }}
            >
              {isExamsModuleEnabled ? t("Turn Module Off", "إيقاف الوحدة") : t("Turn Module On", "تفعيل الوحدة")}
            </button>
            <button
              onClick={() => { setEditId(null); setForm(EMPTY); setShowForm(true); }}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 12, background: GOLD, border: "none", color: G, fontSize: 13, fontWeight: 900, cursor: "pointer" }}
            >
              <Plus style={{ width: 16, height: 16 }} /> {t("Add Slot", "إضافة موعد")}
            </button>
          </div>
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 }} onClick={() => setShowForm(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: "20px 20px 0 0", padding: 20, width: "100%", maxWidth: 560, maxHeight: "88vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 900, color: G, margin: 0 }}>{editId ? t("Edit Slot", "تعديل الموعد") : t("New Exam/Test Slot", "موعد امتحان/اختبار جديد")}</h3>
              <button onClick={() => setShowForm(false)} style={{ border: "none", background: "none", cursor: "pointer" }}><X style={{ width: 20, height: 20, color: "#9ca3af" }} /></button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#6b7280" }}>{t("Title", "العنوان")}</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder={t("e.g. Tajweed Mid-Term Test", "مثال: امتحان التجويد منتصف الفصل")}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 13, marginTop: 4 }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#6b7280" }}>{t("Title (Arabic)", "العنوان بالعربية")}</label>
                <input dir="rtl" value={form.title_ar} onChange={e => setForm(f => ({ ...f, title_ar: e.target.value }))}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 13, marginTop: 4 }} />
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "#6b7280" }}>{t("Type", "النوع")}</label>
                  <select value={form.exam_type} onChange={e => setForm(f => ({ ...f, exam_type: e.target.value }))}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 13, marginTop: 4 }}>
                    {EXAM_TYPES.map(et => <option key={et.value} value={et.value}>{language === "ar" ? et.ar : et.en}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "#6b7280" }}>{t("Subject (optional)", "المادة (اختياري)")}</label>
                  <select value={form.subject_id} onChange={e => setForm(f => ({ ...f, subject_id: e.target.value }))}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 13, marginTop: 4 }}>
                    <option value="">{t("None", "بدون")}</option>
                    {(subjects || []).map((s: any) => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "#6b7280" }}>{t("Date", "التاريخ")}</label>
                  <input type="date" value={form.exam_date} onChange={e => setForm(f => ({ ...f, exam_date: e.target.value }))}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 13, marginTop: 4 }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "#6b7280" }}>{t("Start", "البداية")}</label>
                  <input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 13, marginTop: 4 }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "#6b7280" }}>{t("End", "النهاية")}</label>
                  <input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 13, marginTop: 4 }} />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#6b7280" }}>{t("Levels (leave empty = all levels)", "المستويات (اتركه فارغاً = كل المستويات)")}</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                  {LEVELS.map(lv => (
                    <button key={lv.value} type="button" onClick={() => toggleLevel(lv.value)}
                      style={{ padding: "6px 12px", borderRadius: 9, border: `1.5px solid ${form.levels.includes(lv.value) ? G : "#e5e7eb"}`, background: form.levels.includes(lv.value) ? G : "#fff", color: form.levels.includes(lv.value) ? "#fff" : "#6b7280", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      {lv.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#6b7280" }}>{t("Venue / Platform", "المكان / المنصة")}</label>
                <input value={form.venue} onChange={e => setForm(f => ({ ...f, venue: e.target.value }))} placeholder={t("e.g. Online — Zoom, or Hall 2", "مثال: أونلاين عبر زوم، أو قاعة 2")}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 13, marginTop: 4 }} />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#6b7280" }}>{t("Live link (optional)", "رابط البث (اختياري)")}</label>
                <input value={form.live_url} onChange={e => setForm(f => ({ ...f, live_url: e.target.value }))} placeholder="https://…"
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 13, marginTop: 4 }} />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#6b7280" }}>{t("Notes", "ملاحظات")}</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 13, marginTop: 4, fontFamily: "inherit", resize: "vertical" }} />
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#374151", cursor: "pointer" }}>
                <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
                {t("Active (visible to students when the module is on)", "مفعّل (يظهر للطلاب عند تفعيل الوحدة)")}
              </label>

              <button
                onClick={() => saveMutation.mutate(form)}
                disabled={!form.title || !form.exam_date || saveMutation.isPending}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "13px", borderRadius: 12, border: "none", background: G, color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", marginTop: 6, opacity: !form.title || !form.exam_date ? .5 : 1 }}
              >
                {saveMutation.isPending ? <Loader2 style={{ width: 16, height: 16 }} className="animate-spin" /> : <Save style={{ width: 16, height: 16 }} />}
                {t("Save", "حفظ")}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: "16px 20px", maxWidth: 760, margin: "0 auto" }}>
        {isLoading ? (
          <div style={{ textAlign: "center", padding: 50, color: "#9ca3af" }}>{t("Loading…", "جارٍ التحميل…")}</div>
        ) : (slots || []).length === 0 ? (
          <div style={{ background: "#fff", borderRadius: 18, padding: "40px 20px", textAlign: "center", border: "1px solid #e5e7eb" }}>
            <ClipboardList style={{ width: 36, height: 36, color: "#d1d5db", margin: "0 auto 10px" }} />
            <p style={{ color: "#9ca3af", fontSize: 13, margin: 0 }}>{t("No exam or test slots yet.", "لا توجد مواعيد امتحانات بعد.")}</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {upcoming.length > 0 && (
              <div>
                <h3 style={{ fontSize: 13, fontWeight: 800, color: G, margin: "0 0 10px", display: "flex", alignItems: "center", gap: 6 }}>
                  <Calendar style={{ width: 14, height: 14 }} /> {t("Upcoming", "القادمة")}
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{upcoming.map(renderSlotCard)}</div>
              </div>
            )}
            {past.length > 0 && (
              <div>
                <h3 style={{ fontSize: 13, fontWeight: 800, color: "#9ca3af", margin: "0 0 10px", display: "flex", alignItems: "center", gap: 6 }}>
                  <Clock style={{ width: 14, height: 14 }} /> {t("Past", "منتهية")}
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, opacity: .6 }}>{past.map(renderSlotCard)}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
