/*
  src/pages/admin/LevelManagement.tsx — Tahleem Academy
  ─────────────────────────────────────────────────────
  Admin CRUD for the academic_levels table.

  • Add new levels (slug + Arabic + English + ordering).
  • Edit display names and descriptions inline.
  • Activate / deactivate levels (soft-disable instead of delete to preserve
    referential integrity with existing student profiles).
  • Reorder via sort_order.

  Realtime: every change broadcasts via Supabase Realtime so the
  useAcademicLevels hook updates every dropdown across the platform within ~1s.
*/
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAllAcademicLevels, type AcademicLevel } from "@/hooks/useAcademicLevels";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Save, Trash2, Eye, EyeOff, GripVertical, Layers } from "lucide-react";

const G    = "#064E3B";
const GOLD = "#D4A843";

interface DraftLevel {
  slug: string;
  name_ar: string;
  name_en: string;
  description_ar: string;
  description_en: string;
  sort_order: number;
}

const EMPTY_DRAFT: DraftLevel = {
  slug: "",
  name_ar: "",
  name_en: "",
  description_ar: "",
  description_en: "",
  sort_order: 99,
};

export default function LevelManagement() {
  const { data: levels, isLoading } = useAllAcademicLevels();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState<DraftLevel>(EMPTY_DRAFT);
  const [edits, setEdits] = useState<Record<string, Partial<AcademicLevel>>>({});

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["academic_levels"] });

  // ── Create ───────────────────────────────────────────────────────────
  const createMut = useMutation({
    mutationFn: async (d: DraftLevel) => {
      if (!d.slug.trim() || !d.name_ar.trim() || !d.name_en.trim()) {
        throw new Error("Slug, Arabic name, and English name are required.");
      }
      const { error } = await supabase.from("academic_levels" as any).insert({
        slug: d.slug.trim().toLowerCase(),
        name_ar: d.name_ar.trim(),
        name_en: d.name_en.trim(),
        description_ar: d.description_ar.trim() || null,
        description_en: d.description_en.trim() || null,
        sort_order: d.sort_order,
        is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Level created" });
      setDraft(EMPTY_DRAFT);
      setShowAdd(false);
      invalidate();
    },
    onError: (err: Error) =>
      toast({ title: "Could not create level", description: err.message, variant: "destructive" }),
  });

  // ── Update (single row) ──────────────────────────────────────────────
  const updateMut = useMutation({
    mutationFn: async (payload: { id: string; patch: Partial<AcademicLevel> }) => {
      const { error } = await supabase
        .from("academic_levels" as any)
        .update(payload.patch)
        .eq("id", payload.id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      toast({ title: "Saved" });
      setEdits((prev) => {
        const next = { ...prev };
        delete next[vars.id];
        return next;
      });
      invalidate();
    },
    onError: (err: Error) =>
      toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  // ── Toggle active ────────────────────────────────────────────────────
  const toggleMut = useMutation({
    mutationFn: async (lvl: AcademicLevel) => {
      const { error } = await supabase
        .from("academic_levels" as any)
        .update({ is_active: !lvl.is_active })
        .eq("id", lvl.id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (err: Error) =>
      toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  // ── Delete (HARD) — only allowed if no profile references the slug ───
  const deleteMut = useMutation({
    mutationFn: async (lvl: AcademicLevel) => {
      // Safety check: refuse delete if any student is on this level
      const { count, error: countErr } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("level", lvl.slug);
      if (countErr) throw countErr;
      if ((count ?? 0) > 0) {
        throw new Error(
          `Cannot delete: ${count} student(s) are currently assigned to this level. ` +
          `Reassign them first or simply deactivate the level.`,
        );
      }
      const { error } = await supabase
        .from("academic_levels" as any)
        .delete()
        .eq("id", lvl.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Level deleted" });
      invalidate();
    },
    onError: (err: Error) =>
      toast({ title: "Delete blocked", description: err.message, variant: "destructive" }),
  });

  const handleEdit = (id: string, field: keyof AcademicLevel, value: any) =>
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));

  const handleSave = (lvl: AcademicLevel) => {
    const patch = edits[lvl.id];
    if (!patch || Object.keys(patch).length === 0) return;
    updateMut.mutate({ id: lvl.id, patch });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: G }} />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6" dir="ltr">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2" style={{ color: G }}>
            <Layers className="w-7 h-7" style={{ color: GOLD }} />
            Academic Levels
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Manage the levels students can be assigned to. Changes propagate live to every dropdown across the platform.
          </p>
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white font-medium shadow-sm hover:opacity-95"
          style={{ background: G }}
        >
          <Plus className="w-4 h-4" />
          Add Level
        </button>
      </div>

      {/* Create form */}
      {showAdd && (
        <div className="bg-white border-2 border-emerald-700 rounded-xl p-4 sm:p-5 space-y-3 shadow-sm">
          <h2 className="font-semibold text-lg" style={{ color: G }}>New Level</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Slug (lowercase, unique)" required>
              <input
                value={draft.slug}
                onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
                placeholder="e.g. ihsan"
                className="input"
              />
            </Field>
            <Field label="Sort order">
              <input
                type="number"
                value={draft.sort_order}
                onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) || 0 })}
                className="input"
              />
            </Field>
            <Field label="Arabic name" required>
              <input
                value={draft.name_ar}
                onChange={(e) => setDraft({ ...draft, name_ar: e.target.value })}
                dir="rtl"
                className="input text-right"
                placeholder="المستوى …"
              />
            </Field>
            <Field label="English name" required>
              <input
                value={draft.name_en}
                onChange={(e) => setDraft({ ...draft, name_en: e.target.value })}
                className="input"
              />
            </Field>
            <Field label="Arabic description (optional)">
              <textarea
                value={draft.description_ar}
                onChange={(e) => setDraft({ ...draft, description_ar: e.target.value })}
                dir="rtl"
                rows={2}
                className="input text-right"
              />
            </Field>
            <Field label="English description (optional)">
              <textarea
                value={draft.description_en}
                onChange={(e) => setDraft({ ...draft, description_en: e.target.value })}
                rows={2}
                className="input"
              />
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => { setShowAdd(false); setDraft(EMPTY_DRAFT); }}
              className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={() => createMut.mutate(draft)}
              disabled={createMut.isPending}
              className="px-4 py-2 rounded-lg text-white font-medium hover:opacity-95 disabled:opacity-60 inline-flex items-center gap-2"
              style={{ background: G }}
            >
              {createMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Create
            </button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="space-y-3">
        {(levels ?? []).map((lvl) => {
          const merged = { ...lvl, ...edits[lvl.id] };
          const dirty = !!edits[lvl.id] && Object.keys(edits[lvl.id]).length > 0;
          return (
            <div
              key={lvl.id}
              className={`bg-white border rounded-xl p-4 sm:p-5 shadow-sm transition ${
                lvl.is_active ? "border-gray-200" : "border-amber-300 bg-amber-50/40 opacity-80"
              }`}
            >
              <div className="flex items-start gap-3">
                <GripVertical className="w-5 h-5 text-gray-300 mt-2 flex-none" />
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Slug">
                    <input value={lvl.slug} disabled className="input bg-gray-50 text-gray-500" />
                  </Field>
                  <Field label="Sort order">
                    <input
                      type="number"
                      value={merged.sort_order}
                      onChange={(e) => handleEdit(lvl.id, "sort_order", Number(e.target.value) || 0)}
                      className="input"
                    />
                  </Field>
                  <Field label="Arabic name">
                    <input
                      value={merged.name_ar}
                      onChange={(e) => handleEdit(lvl.id, "name_ar", e.target.value)}
                      dir="rtl"
                      className="input text-right"
                    />
                  </Field>
                  <Field label="English name">
                    <input
                      value={merged.name_en}
                      onChange={(e) => handleEdit(lvl.id, "name_en", e.target.value)}
                      className="input"
                    />
                  </Field>
                  <Field label="Arabic description">
                    <textarea
                      value={merged.description_ar ?? ""}
                      onChange={(e) => handleEdit(lvl.id, "description_ar", e.target.value)}
                      dir="rtl"
                      rows={2}
                      className="input text-right"
                    />
                  </Field>
                  <Field label="English description">
                    <textarea
                      value={merged.description_en ?? ""}
                      onChange={(e) => handleEdit(lvl.id, "description_en", e.target.value)}
                      rows={2}
                      className="input"
                    />
                  </Field>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 mt-4 pt-3 border-t border-gray-100">
                <button
                  onClick={() => toggleMut.mutate(lvl)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-sm hover:bg-gray-50"
                >
                  {lvl.is_active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  {lvl.is_active ? "Deactivate" : "Activate"}
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Permanently delete "${lvl.name_en}"? This is only allowed if no student is on this level.`)) {
                      deleteMut.mutate(lvl);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-300 text-sm text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
                <button
                  onClick={() => handleSave(lvl)}
                  disabled={!dirty || updateMut.isPending}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-white text-sm font-medium hover:opacity-95 disabled:opacity-40"
                  style={{ background: G }}
                >
                  <Save className="w-4 h-4" />
                  Save changes
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        .input {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-size: 14px;
          background: white;
          outline: none;
        }
        .input:focus {
          border-color: ${G};
          box-shadow: 0 0 0 3px ${G}22;
        }
      `}</style>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-600 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
    </label>
  );
}