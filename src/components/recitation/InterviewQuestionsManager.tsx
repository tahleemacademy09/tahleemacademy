// src/components/recitation/InterviewQuestionsManager.tsx
// ─────────────────────────────────────────────────────────────────────────
// Admin tool (tab inside Recitation Test admin) to manage the question bank
// used by the virtual interview tiles, plus the two interview settings:
//   • interview_tile_count  – how many face-down tiles the student sees
//   • interview_max_reveals – how many of them they may open
// ─────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Pencil, Check, X, Save, ListPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const G = "#064E3B";
const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 11px", borderRadius: 9, border: "1px solid #D1D5DB", fontSize: 13, boxSizing: "border-box", fontFamily: "inherit", background: "#fff" };
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 };
const card: React.CSSProperties = { background: "#fff", border: "1px solid #E5E7EB", borderRadius: 14, padding: 16, marginBottom: 14 };

interface Q { id: string; question_text: string; question_text_ar: string | null; category: string | null; is_active: boolean; sort_order: number }

const InterviewQuestionsManager = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<Q[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [tiles, setTiles] = useState("8");
  const [maxRev, setMaxRev] = useState("5");

  const [en, setEn] = useState("");
  const [ar, setAr] = useState("");
  const [cat, setCat] = useState("");
  const [bulk, setBulk] = useState("");
  const [showBulk, setShowBulk] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);
  const [editEn, setEditEn] = useState("");
  const [editAr, setEditAr] = useState("");
  const [editCat, setEditCat] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: qs, error }, { data: st }] = await Promise.all([
      (supabase as any).from("interview_questions").select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
      (supabase as any).from("academy_settings").select("key, value").in("key", ["interview_tile_count", "interview_max_reveals"]),
    ]);
    if (error) toast({ title: "Could not load questions", description: error.message, variant: "destructive" });
    setRows((qs || []) as Q[]);
    (st || []).forEach((s: any) => {
      if (s.key === "interview_tile_count") setTiles(String(s.value));
      if (s.key === "interview_max_reveals") setMaxRev(String(s.value));
    });
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const activeCount = rows.filter(r => r.is_active).length;

  const saveSettings = async () => {
    const t = Math.max(1, Math.min(20, parseInt(tiles) || 8));
    const m = Math.max(1, Math.min(t, parseInt(maxRev) || 5));
    setSaving(true);
    const now = new Date().toISOString();
    const { error } = await (supabase as any).from("academy_settings").upsert([
      { key: "interview_tile_count",  value: String(t), description: "Virtual interview: number of question tiles", updated_by: user?.id, updated_at: now },
      { key: "interview_max_reveals", value: String(m), description: "Virtual interview: max tiles a student may open", updated_by: user?.id, updated_at: now },
    ], { onConflict: "key" });
    setSaving(false);
    if (error) { toast({ title: "Could not save settings", description: error.message, variant: "destructive" }); return; }
    setTiles(String(t)); setMaxRev(String(m));
    toast({ title: "Interview settings saved" });
  };

  const addOne = async () => {
    if (!en.trim()) { toast({ title: "Enter the question text", variant: "destructive" }); return; }
    setSaving(true);
    const { error } = await (supabase as any).from("interview_questions").insert({
      question_text: en.trim(), question_text_ar: ar.trim() || null, category: cat.trim() || null,
      sort_order: rows.length ? Math.max(...rows.map(r => r.sort_order)) + 1 : 1, created_by: user?.id,
    });
    setSaving(false);
    if (error) { toast({ title: "Could not add question", description: error.message, variant: "destructive" }); return; }
    setEn(""); setAr(""); load();
  };

  // One per line. Optional Arabic after a "|" → "English question | السؤال بالعربية"
  const addBulk = async () => {
    const lines = bulk.split("\n").map(l => l.trim()).filter(Boolean);
    if (!lines.length) return;
    const start = rows.length ? Math.max(...rows.map(r => r.sort_order)) + 1 : 1;
    const payload = lines.map((l, i) => {
      const [a, b] = l.split("|").map(s => s.trim());
      return { question_text: a, question_text_ar: b || null, category: cat.trim() || null, sort_order: start + i, created_by: user?.id };
    }).filter(p => p.question_text);
    setSaving(true);
    const { error } = await (supabase as any).from("interview_questions").insert(payload);
    setSaving(false);
    if (error) { toast({ title: "Could not add questions", description: error.message, variant: "destructive" }); return; }
    setBulk(""); setShowBulk(false); toast({ title: `${payload.length} questions added` }); load();
  };

  const toggle = async (q: Q) => {
    const { error } = await (supabase as any).from("interview_questions").update({ is_active: !q.is_active }).eq("id", q.id);
    if (error) toast({ title: "Update failed", description: error.message, variant: "destructive" }); else load();
  };

  const remove = async (q: Q) => {
    if (!window.confirm("Delete this question? It is also removed from any student's revealed list.")) return;
    const { error } = await (supabase as any).from("interview_questions").delete().eq("id", q.id);
    if (error) toast({ title: "Delete failed", description: error.message, variant: "destructive" }); else load();
  };

  const startEdit = (q: Q) => { setEditId(q.id); setEditEn(q.question_text); setEditAr(q.question_text_ar || ""); setEditCat(q.category || ""); };
  const saveEdit = async () => {
    if (!editId || !editEn.trim()) return;
    const { error } = await (supabase as any).from("interview_questions")
      .update({ question_text: editEn.trim(), question_text_ar: editAr.trim() || null, category: editCat.trim() || null }).eq("id", editId);
    if (error) { toast({ title: "Update failed", description: error.message, variant: "destructive" }); return; }
    setEditId(null); load();
  };

  const tilesNum = Math.max(1, Math.min(20, parseInt(tiles) || 8));
  const warn = activeCount < Math.min(tilesNum, parseInt(maxRev) || 5);

  return (
    <div>
      <div style={card}>
        <p style={{ fontSize: 11, fontWeight: 800, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1, margin: "0 0 12px" }}>Tile settings</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div>
            <label style={labelStyle}>Number of tiles (1–20)</label>
            <input type="number" min={1} max={20} value={tiles} onChange={e => setTiles(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Questions a student may open</label>
            <input type="number" min={1} max={20} value={maxRev} onChange={e => setMaxRev(e.target.value)} style={inputStyle} />
          </div>
        </div>
        {warn && (
          <p style={{ fontSize: 12, color: "#B45309", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "8px 10px", margin: "0 0 12px" }}>
            You have {activeCount} active question{activeCount === 1 ? "" : "s"}. Add more so students never run out before their limit.
          </p>
        )}
        <button onClick={saveSettings} disabled={saving}
          style={{ padding: "9px 18px", borderRadius: 10, border: "none", background: G, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Save size={14} /> Save settings
        </button>
      </div>

      <div style={card}>
        <p style={{ fontSize: 11, fontWeight: 800, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1, margin: "0 0 12px" }}>Add a question</p>
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Question (English)</label>
          <textarea value={en} onChange={e => setEn(e.target.value)} rows={2} style={{ ...inputStyle, resize: "none" }} />
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Question (Arabic, optional)</label>
          <textarea value={ar} onChange={e => setAr(e.target.value)} rows={2} dir="rtl" style={{ ...inputStyle, resize: "none", fontFamily: "'Amiri','Cairo',serif", fontSize: 16 }} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Category (optional, e.g. Quran, Aqeedah, Goals)</label>
          <input value={cat} onChange={e => setCat(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={addOne} disabled={saving}
            style={{ padding: "9px 18px", borderRadius: 10, border: "none", background: G, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
            {saving ? <Loader2 size={14} style={{ animation: "spin .8s linear infinite" }} /> : <Plus size={14} />} Add question
          </button>
          <button onClick={() => setShowBulk(v => !v)}
            style={{ padding: "9px 18px", borderRadius: 10, border: "1px solid #D1D5DB", background: "#fff", color: "#374151", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <ListPlus size={14} /> Add many at once
          </button>
        </div>
        {showBulk && (
          <div style={{ marginTop: 12 }}>
            <label style={labelStyle}>One question per line. For Arabic, add " | " then the Arabic text. The category above is applied to all.</label>
            <textarea value={bulk} onChange={e => setBulk(e.target.value)} rows={6} style={{ ...inputStyle, resize: "vertical" }}
              placeholder={"Why do you want to join Tahleem Academy? | لماذا تريد الانضمام إلى أكاديمية تعليم؟\nWhat is your goal with the Quran?"} />
            <button onClick={addBulk} disabled={saving || !bulk.trim()}
              style={{ marginTop: 8, padding: "9px 18px", borderRadius: 10, border: "none", background: bulk.trim() ? G : "#E5E7EB", color: bulk.trim() ? "#fff" : "#9CA3AF", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              Add all
            </button>
          </div>
        )}
      </div>

      <div style={card}>
        <p style={{ fontSize: 11, fontWeight: 800, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1, margin: "0 0 12px" }}>
          Question bank ({rows.length}, {activeCount} active)
        </p>
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 24 }}><Loader2 size={22} style={{ animation: "spin .8s linear infinite", color: G }} /></div>
        ) : rows.length === 0 ? (
          <p style={{ fontSize: 13, color: "#6b7280", textAlign: "center", padding: 16 }}>No questions yet. Add some above. Students can't open tiles until there's at least one active question.</p>
        ) : rows.map(q => (
          <div key={q.id} style={{ borderTop: "1px solid #F3F4F6", padding: "12px 0", opacity: q.is_active ? 1 : .55 }}>
            {editId === q.id ? (
              <div>
                <textarea value={editEn} onChange={e => setEditEn(e.target.value)} rows={2} style={{ ...inputStyle, resize: "none", marginBottom: 8 }} />
                <textarea value={editAr} onChange={e => setEditAr(e.target.value)} rows={2} dir="rtl" style={{ ...inputStyle, resize: "none", marginBottom: 8, fontFamily: "'Amiri','Cairo',serif", fontSize: 16 }} />
                <input value={editCat} onChange={e => setEditCat(e.target.value)} placeholder="Category" style={{ ...inputStyle, marginBottom: 8 }} />
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={saveEdit} style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: G, color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}><Check size={13} /> Save</button>
                  <button onClick={() => setEditId(null)} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #D1D5DB", background: "#fff", color: "#374151", fontWeight: 700, fontSize: 12, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}><X size={13} /> Cancel</button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#111827", lineHeight: 1.5 }}>{q.question_text}</div>
                  {q.question_text_ar && <div dir="rtl" style={{ fontSize: 17, color: "#374151", fontFamily: "'Amiri','Cairo',serif", marginTop: 3 }}>{q.question_text_ar}</div>}
                  {q.category && <span style={{ display: "inline-block", marginTop: 5, fontSize: 10, fontWeight: 800, letterSpacing: .5, color: G, background: "#ECFDF5", borderRadius: 999, padding: "2px 8px" }}>{q.category.toUpperCase()}</span>}
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button onClick={() => toggle(q)} title={q.is_active ? "Deactivate" : "Activate"}
                    style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid #D1D5DB", background: q.is_active ? "#ECFDF5" : "#F3F4F6", color: q.is_active ? G : "#6b7280", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    {q.is_active ? "Active" : "Off"}
                  </button>
                  <button onClick={() => startEdit(q)} title="Edit" style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid #D1D5DB", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Pencil size={13} color="#374151" /></button>
                  <button onClick={() => remove(q)} title="Delete" style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid #FECACA", background: "#FEF2F2", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Trash2 size={13} color="#b91c1c" /></button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default InterviewQuestionsManager;
