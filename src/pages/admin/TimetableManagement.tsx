/*
  src/pages/admin/TimetableManagement.tsx — Tahleem Academy
  ──────────────────────────────────────────────────────────
  Admin page: create / edit / delete timetable slots.
  Each slot links a Subject → Teacher → Day/Time → Level(s).
*/

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "@/hooks/use-toast";
import {
  BookOpen, Clock, Edit2, Trash2, Plus, X, Users,
  Calendar, Video, ChevronDown, ChevronUp, Save,
} from "lucide-react";

const G    = "#0f2d1f";
const GM   = "#1a4731";
const GOLD = "#c9a84c";

const DAYS = [
  { index: 0, en: "Sunday",    ar: "الأحد" },
  { index: 1, en: "Monday",    ar: "الاثنين" },
  { index: 2, en: "Tuesday",   ar: "الثلاثاء" },
  { index: 3, en: "Wednesday", ar: "الأربعاء" },
  { index: 4, en: "Thursday",  ar: "الخميس" },
  { index: 5, en: "Friday",    ar: "الجمعة" },
  { index: 6, en: "Saturday",  ar: "السبت" },
];

const LEVELS = [
  { value: "beginner",     label: "Beginner",     ar: "مبتدئ" },
  { value: "intermediate", label: "Intermediate", ar: "متوسط" },
  { value: "advanced",     label: "Advanced",     ar: "متقدم" },
];

const levelColors: Record<string, string> = {
  beginner:     "#22c55e",
  intermediate: "#f59e0b",
  advanced:     "#8b5cf6",
};

interface SlotForm {
  subject_id: string;
  teacher_ids: string[];  // multiple teachers
  day_of_week: number;
  start_time: string;
  end_time: string;
  levels: string[];
  live_url: string;
  notes: string;
  is_active: boolean;
}

const EMPTY: SlotForm = {
  subject_id: "",
  teacher_ids: [],
  day_of_week: 1,
  start_time: "09:00",
  end_time: "10:00",
  levels: [],
  live_url: "",
  notes: "",
  is_active: true,
};

export default function TimetableManagement() {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const qc = useQueryClient();

  const [showForm, setShowForm]   = useState(false);
  const [editId, setEditId]       = useState<string | null>(null);
  const [form, setForm]           = useState<SlotForm>(EMPTY);
  const [expandedDays, setExpanded] = useState<Record<number, boolean>>({ 1: true });

  // ── Data queries ─────────────────────────────────────────────────────────

  const { data: slots, isLoading } = useQuery({
    queryKey: ["timetable-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subject_timetable")
        .select(`
          *,
          subjects(id, title, title_ar),
          teacher:profiles!subject_timetable_teacher_id_fkey(user_id, full_name)
        `)
        .order("day_of_week")
        .order("start_time");
      if (error) {
        // Fallback without join if FK alias fails
        const { data: d2 } = await supabase
          .from("subject_timetable")
          .select("*, subjects(id, title, title_ar)")
          .order("day_of_week")
          .order("start_time");
        return d2 || [];
      }
      return data || [];
    },
  });

  const { data: subjects } = useQuery({
    queryKey: ["subjects-active"],
    queryFn: async () => {
      const { data } = await supabase
        .from("subjects")
        .select("id, title, title_ar, course_id")
        .eq("is_active", true)
        .order("title");
      return data || [];
    },
  });

  const { data: teachers } = useQuery({
    queryKey: ["teachers-list"],
    queryFn: async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["teacher", "admin"]);
      if (!roles?.length) return [];
      const ids = roles.map((r: any) => r.user_id);
      const { data } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", ids);
      return data || [];
    },
  });

  // ── Mutations ─────────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: async (values: SlotForm) => {
      const payload = {
        subject_id:  values.subject_id,
        teacher_ids: values.teacher_ids.length > 0 ? values.teacher_ids : null,
        teacher_id:  values.teacher_ids[0] || null,  // keep backward compat
        day_of_week: values.day_of_week,
        start_time:  values.start_time,
        end_time:    values.end_time,
        levels:      values.levels,
        live_url:    values.live_url || null,
        notes:       values.notes || null,
        is_active:   values.is_active,
        created_by:  user?.id,
        updated_at:  new Date().toISOString(),
      };
      if (editId) {
        const { error } = await supabase
          .from("subject_timetable")
          .update(payload)
          .eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("subject_timetable")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["timetable-admin"] });
      qc.invalidateQueries({ queryKey: ["timetable-student"] });
      setShowForm(false);
      setEditId(null);
      setForm(EMPTY);
      toast({ title: t("Timetable saved ✅", "تم حفظ الجدول ✅") });
    },
    onError: (e: any) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("subject_timetable")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["timetable-admin"] });
      toast({ title: t("Slot deleted", "تم حذف الحصة") });
    },
    onError: (e: any) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ── Helpers ───────────────────────────────────────────────────────────────

  const openEdit = (slot: any) => {
    setEditId(slot.id);
    setForm({
      subject_id:  slot.subject_id,
      teacher_ids: slot.teacher_ids || (slot.teacher_id ? [slot.teacher_id] : []),
      day_of_week: slot.day_of_week,
      start_time:  slot.start_time?.slice(0, 5) || "09:00",
      end_time:    slot.end_time?.slice(0, 5)   || "10:00",
      levels:      slot.levels || [],
      live_url:    slot.live_url || "",
      notes:       slot.notes || "",
      is_active:   slot.is_active !== false,
    });
    setShowForm(true);
  };

  const toggleLevel = (lv: string) => {
    setForm(f => ({
      ...f,
      levels: f.levels.includes(lv)
        ? f.levels.filter(x => x !== lv)
        : [...f.levels, lv],
    }));
  };

  const slotsByDay = DAYS.map(d => ({
    ...d,
    slots: (slots || []).filter((s: any) => s.day_of_week === d.index),
  }));

  const totalSlots = (slots || []).length;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: "'Cairo', sans-serif", background: "#f8fafb", minHeight: "100vh" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');`}</style>

      {/* ── Header ── */}
      <div style={{ background: `linear-gradient(135deg,${G},${GM})`, padding: "20px 20px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <Calendar style={{ width: 22, height: 22, color: GOLD }} />
              <h1 style={{ fontSize: 20, fontWeight: 900, color: "#fff", margin: 0 }}>
                {t("Timetable Management", "إدارة الجدول الدراسي")}
              </h1>
            </div>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,.55)", margin: 0 }}>
              {totalSlots} {t("scheduled slots", "حصص مجدولة")}
            </p>
          </div>
          <button
            onClick={() => { setEditId(null); setForm(EMPTY); setShowForm(true); }}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 12, background: GOLD, border: "none", color: G, fontSize: 13, fontWeight: 900, cursor: "pointer" }}
          >
            <Plus style={{ width: 16, height: 16 }} />
            {t("Add Slot", "إضافة حصة")}
          </button>
        </div>
      </div>

      {/* ── Form Modal ── */}
      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={() => setShowForm(false)}>
          <div style={{ background: "#fff", borderRadius: 20, padding: 24, width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h2 style={{ fontSize: 17, fontWeight: 800, color: G, margin: 0 }}>
                {editId ? t("Edit Slot", "تعديل الحصة") : t("New Timetable Slot", "حصة جديدة")}
              </h2>
              <button onClick={() => setShowForm(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af" }}>
                <X style={{ width: 20, height: 20 }} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              {/* Subject */}
              <div>
                <label style={labelStyle}>{t("Subject", "المادة")} *</label>
                <select style={inputStyle} value={form.subject_id}
                  onChange={e => setForm(f => ({ ...f, subject_id: e.target.value }))}>
                  <option value="">{t("Select subject…", "اختر المادة…")}</option>
                  {(subjects || []).map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {language === "ar" ? s.title_ar || s.title : s.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Teachers — multi-select */}
              <div>
                <label style={labelStyle}>{t("Teachers (select multiple)", "المعلمون (يمكن اختيار أكثر من معلم)")}</label>
                <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:160, overflowY:"auto", padding:"6px 0" }}>
                  {(teachers || []).map((tc: any) => {
                    const selected = form.teacher_ids.includes(tc.user_id);
                    return (
                      <button key={tc.user_id} type="button"
                        onClick={() => setForm(f => ({
                          ...f,
                          teacher_ids: selected
                            ? f.teacher_ids.filter(id => id !== tc.user_id)
                            : [...f.teacher_ids, tc.user_id]
                        }))}
                        style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", borderRadius:10, border:`1.5px solid ${selected?"#064E3B":"#E5E7EB"}`, background:selected?"#F0FDF4":"#fff", cursor:"pointer", textAlign:"left" }}>
                        <div style={{ width:20, height:20, borderRadius:6, border:`2px solid ${selected?"#064E3B":"#D1D5DB"}`, background:selected?"#064E3B":"#fff", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                          {selected && <Save style={{ width:11, height:11, color:"#fff" }} />}
                        </div>
                        <span style={{ fontSize:13, fontWeight:selected?700:400, color:selected?"#064E3B":"#374151" }}>
                          {tc.full_name || tc.user_id}
                        </span>
                      </button>
                    );
                  })}
                  {(teachers || []).length === 0 && (
                    <p style={{ fontSize:12, color:"#9CA3AF", padding:"8px 0" }}>No teachers found</p>
                  )}
                </div>
                {form.teacher_ids.length > 0 && (
                  <p style={{ fontSize:11, color:"#064E3B", marginTop:4, fontWeight:600 }}>
                    ✓ {form.teacher_ids.length} teacher{form.teacher_ids.length > 1 ? "s" : ""} selected
                  </p>
                )}
              </div>

              {/* Day */}
              <div>
                <label style={labelStyle}>{t("Day", "اليوم")} *</label>
                <select style={inputStyle} value={form.day_of_week}
                  onChange={e => setForm(f => ({ ...f, day_of_week: Number(e.target.value) }))}>
                  {DAYS.map(d => (
                    <option key={d.index} value={d.index}>
                      {language === "ar" ? d.ar : d.en}
                    </option>
                  ))}
                </select>
              </div>

              {/* Time row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={labelStyle}>{t("Start Time", "وقت البدء")} *</label>
                  <input type="time" style={inputStyle} value={form.start_time}
                    onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>{t("End Time", "وقت الانتهاء")} *</label>
                  <input type="time" style={inputStyle} value={form.end_time}
                    onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} />
                </div>
              </div>

              {/* Levels */}
              <div>
                <label style={labelStyle}>
                  {t("Levels (empty = all levels)", "المستويات (فارغ = جميع المستويات)")}
                </label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                  {LEVELS.map(lv => {
                    const active = form.levels.includes(lv.value);
                    return (
                      <button key={lv.value} type="button"
                        onClick={() => toggleLevel(lv.value)}
                        style={{
                          padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                          cursor: "pointer", border: `2px solid ${levelColors[lv.value]}`,
                          background: active ? levelColors[lv.value] : "transparent",
                          color: active ? "#fff" : levelColors[lv.value],
                          fontFamily: "'Cairo', sans-serif",
                        }}>
                        {language === "ar" ? lv.ar : lv.label}
                      </button>
                    );
                  })}
                </div>
                {form.levels.length === 0 && (
                  <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 5 }}>
                    {t("No levels selected → visible to all students", "لم يتم اختيار مستوى → مرئي لجميع الطلاب")}
                  </p>
                )}
              </div>

              {/* Live URL */}
              <div>
                <label style={labelStyle}>{t("Live Class URL (optional)", "رابط الفصل المباشر (اختياري)")}</label>
                <input type="url" style={inputStyle} placeholder="https://meet.google.com/…"
                  value={form.live_url}
                  onChange={e => setForm(f => ({ ...f, live_url: e.target.value }))} />
              </div>

              {/* Notes */}
              <div>
                <label style={labelStyle}>{t("Notes", "ملاحظات")}</label>
                <textarea style={{ ...inputStyle, height: 70, resize: "vertical" as const }}
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>

              {/* Active toggle */}
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <div onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                  style={{ width: 40, height: 22, borderRadius: 11, background: form.is_active ? GM : "#d1d5db", position: "relative", cursor: "pointer", transition: "background .2s" }}>
                  <div style={{ position: "absolute", top: 2, left: form.is_active ? 20 : 2, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
                </div>
                <span style={{ fontSize: 13, color: G, fontWeight: 600 }}>
                  {t("Active", "نشط")}
                </span>
              </label>

              {/* Submit */}
              <button
                disabled={!form.subject_id || !form.start_time || !form.end_time || saveMutation.isPending}
                onClick={() => saveMutation.mutate(form)}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px", borderRadius: 12, background: G, border: "none", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", marginTop: 4, opacity: (!form.subject_id) ? .5 : 1, fontFamily: "'Cairo', sans-serif" }}>
                <Save style={{ width: 16, height: 16 }} />
                {saveMutation.isPending ? t("Saving…", "جارٍ الحفظ…") : t("Save Slot", "حفظ الحصة")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Day Groups ── */}
      <div style={{ padding: "16px", maxWidth: 860, margin: "0 auto" }}>
        {isLoading ? (
          <div style={{ textAlign: "center", padding: 60, color: "#9ca3af" }}>Loading…</div>
        ) : (
          slotsByDay.map(day => (
            <div key={day.index} style={{ marginBottom: 12 }}>
              {/* Day header */}
              <button
                onClick={() => setExpanded(p => ({ ...p, [day.index]: !p[day.index] }))}
                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderRadius: 14, background: day.slots.length > 0 ? G : "#f0f4f0", border: "none", cursor: "pointer", fontFamily: "'Cairo', sans-serif" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Calendar style={{ width: 16, height: 16, color: day.slots.length > 0 ? GOLD : "#9ca3af" }} />
                  <span style={{ fontSize: 14, fontWeight: 800, color: day.slots.length > 0 ? "#fff" : "#6b7280" }}>
                    {language === "ar" ? day.ar : day.en}
                  </span>
                  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, background: day.slots.length > 0 ? "rgba(255,255,255,.2)" : "#e5e7eb", color: day.slots.length > 0 ? "#fff" : "#9ca3af", fontWeight: 700 }}>
                    {day.slots.length}
                  </span>
                </div>
                {expandedDays[day.index]
                  ? <ChevronUp style={{ width: 16, height: 16, color: day.slots.length > 0 ? "rgba(255,255,255,.6)" : "#9ca3af" }} />
                  : <ChevronDown style={{ width: 16, height: 16, color: day.slots.length > 0 ? "rgba(255,255,255,.6)" : "#9ca3af" }} />}
              </button>

              {/* Slots */}
              {expandedDays[day.index] && (
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                  {day.slots.length === 0 ? (
                    <div style={{ padding: "20px 16px", textAlign: "center", background: "#fff", borderRadius: 12, border: "1px dashed #e5e7eb", color: "#d1d5db", fontSize: 13 }}>
                      {t("No classes scheduled", "لا توجد حصص")}
                    </div>
                  ) : (
                    day.slots.map((slot: any) => {
                      const sTitle = language === "ar"
                        ? slot.subjects?.title_ar || slot.subjects?.title
                        : slot.subjects?.title;
                      const slotLevels: string[] = slot.levels || [];

                      return (
                        <div key={slot.id}
                          style={{ background: "#fff", borderRadius: 14, border: `1px solid ${slot.is_active ? "#e5e7eb" : "#fde8e8"}`, padding: "14px 16px", display: "flex", alignItems: "flex-start", gap: 14 }}>
                          {/* Time column */}
                          <div style={{ textAlign: "center", minWidth: 64, flexShrink: 0 }}>
                            <div style={{ fontSize: 15, fontWeight: 900, color: G }}>
                              {slot.start_time?.slice(0, 5)}
                            </div>
                            <div style={{ fontSize: 10, color: "#9ca3af", margin: "1px 0" }}>to</div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "#6b7280" }}>
                              {slot.end_time?.slice(0, 5)}
                            </div>
                          </div>

                          {/* Info */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 14, fontWeight: 800, color: G }}>{sTitle}</span>
                              {!slot.is_active && (
                                <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 9, background: "#fef2f2", color: "#ef4444", fontWeight: 700, border: "1px solid #fecaca" }}>
                                  Inactive
                                </span>
                              )}
                            </div>

                            {/* Show all assigned teachers */}
                            {(slot.teacher_ids && slot.teacher_ids.length > 0) ? (
                              <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4, color: "#6b7280", fontSize: 12, flexWrap:"wrap" }}>
                                <Users style={{ width: 11, height: 11 }} />
                                {slot.teacher_ids.map((tid: string, i: number) => {
                                  const tc = (teachers || []).find((t:any) => t.user_id === tid);
                                  return <span key={tid}>{tc?.full_name || "Teacher"}{i < slot.teacher_ids.length - 1 ? ", " : ""}</span>;
                                })}
                              </div>
                            ) : slot.teacher && (
                              <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4, color: "#6b7280", fontSize: 12 }}>
                                <Users style={{ width: 11, height: 11 }} />
                                {slot.teacher.full_name}
                              </div>
                            )}

                            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 6 }}>
                              {slotLevels.length === 0 ? (
                                <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 9, background: "#f0fff4", color: "#22c55e", fontWeight: 700 }}>
                                  All Levels
                                </span>
                              ) : slotLevels.map(lv => (
                                <span key={lv} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 9, fontWeight: 700, background: `${levelColors[lv]}18`, color: levelColors[lv] }}>
                                  {lv}
                                </span>
                              ))}
                              {slot.live_url && (
                                <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 9, background: "#eff6ff", color: "#3b82f6", fontWeight: 700, display: "flex", alignItems: "center", gap: 3 }}>
                                  <Video style={{ width: 9, height: 9 }} /> Live Link
                                </span>
                              )}
                            </div>

                            {slot.notes && (
                              <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 5, margin: "5px 0 0" }}>{slot.notes}</p>
                            )}
                          </div>

                          {/* Actions */}
                          <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                            <button onClick={() => openEdit(slot)}
                              style={{ width: 32, height: 32, borderRadius: 8, background: "#f0f4f0", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: G }}>
                              <Edit2 style={{ width: 13, height: 13 }} />
                            </button>
                            <button
                              onClick={() => {
                                if (confirm(t("Delete this slot?", "حذف هذه الحصة؟"))) {
                                  deleteMutation.mutate(slot.id);
                                }
                              }}
                              style={{ width: 32, height: 32, borderRadius: 8, background: "#fef2f2", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#ef4444" }}>
                              <Trash2 style={{ width: 13, height: 13 }} />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}

                  {/* Quick add for this day */}
                  <button
                    onClick={() => { setEditId(null); setForm({ ...EMPTY, day_of_week: day.index }); setShowForm(true); }}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 10, background: "transparent", border: `1.5px dashed ${GOLD}`, color: GOLD, fontSize: 12, fontWeight: 700, cursor: "pointer", width: "fit-content", fontFamily: "'Cairo', sans-serif" }}>
                    <Plus style={{ width: 14, height: 14 }} />
                    {t(`Add to ${day.en}`, `إضافة إلى ${day.ar}`)}
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 5,
};
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #e5e7eb",
  fontSize: 13, fontFamily: "'Cairo', sans-serif", color: "#111827", background: "#fafafa",
  outline: "none", boxSizing: "border-box",
};
