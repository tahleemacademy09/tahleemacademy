/*  src/components/classroom/LessonBuilder.tsx
    Full-screen "Lesson Builder" for admins & teachers (opened from Subject → Materials).

    Write the lesson directly here — slide by slide, one item per line — and it is turned into the
    same interactive lesson format the students already know (tap right for the next step: Arabic first, then English; tap left to go back,
    phase tabs, numbered slides). Nothing is uploaded by hand: Save stores the finished page and adds
    (or updates) the row in subject_materials, exactly like the HTML page editor does.

    Lessons made here already speak the live-sync contract (window.__tahleemSync), so "sync with
    students" follows the teacher slide-by-slide and item-by-item with no extra work.
    The lesson's source is embedded in the saved page, so it can be re-opened and edited later.
*/

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { X, Save, Loader2, Eye, PenLine, Plus, Trash2, ChevronUp, ChevronDown, Copy, Info, Upload } from "lucide-react";
import {
  LessonDoc, LessonSlide, SlideKind, KIND_LABEL, KIND_HELP, DEFAULT_PHASES,
  defaultLesson, newSlide, buildLessonHtml, extractLessonSource, parseInlineLesson, serializeLesson,
} from "./lessonBuilder";

const G = "#0f2d1f";
const GOLD = "#c9a84c";
const BORDER = "rgba(15,45,31,0.12)";
const TMID = "#4a7c59";
const BUCKET = "subject-materials";
const KINDS = Object.keys(KIND_LABEL) as SlideKind[];

async function resolveMaterialUrl(fileUrl: string): Promise<string> {
  if (fileUrl.startsWith("http")) return fileUrl;
  const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(fileUrl, 3600);
  if (signed?.signedUrl) return signed.signedUrl;
  return supabase.storage.from(BUCKET).getPublicUrl(fileUrl).data.publicUrl;
}

/* The academy logo is embedded in the lesson once, at save time, so the page stays self-contained. */
async function loadLogo(): Promise<string | null> {
  try {
    const r = await fetch("/brand-logo.png");
    if (!r.ok) return null;
    const blob = await r.blob();
    return await new Promise<string | null>(res => {
      const fr = new FileReader();
      fr.onload = () => res(typeof fr.result === "string" ? fr.result : null);
      fr.onerror = () => res(null);
      fr.readAsDataURL(blob);
    });
  } catch { return null; }
}

interface Props {
  material?: any | null;       // existing builder lesson to edit; omit/null for a new one
  subjectId: string;
  termId?: string | null;
  onClose: () => void;
  onSaved: () => void;
}

const field: React.CSSProperties = {
  width: "100%", height: 38, borderRadius: 9, border: `1px solid ${BORDER}`, padding: "0 10px",
  fontSize: 14, color: G, background: "#fff", boxSizing: "border-box",
};
const lbl: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, color: TMID, marginBottom: 4, display: "block" };
const cardSt: React.CSSProperties = { background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 14, padding: 12 };

export default function LessonBuilder({ material, subjectId, termId, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const [title, setTitle] = useState<string>(material?.title || "");
  const [doc, setDoc] = useState<LessonDoc>(defaultLesson());
  const [loading, setLoading] = useState<boolean>(!!material);
  const [loadErr, setLoadErr] = useState("");
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [open, setOpen] = useState<number | null>(1);
  const [showHelp, setShowHelp] = useState(false);
  const [logo, setLogo] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const importRef = useRef<HTMLInputElement>(null);
  const upd = (fn: (d: LessonDoc) => LessonDoc) => { setDoc(fn); setDirty(true); };

  /* One-time import of a lesson file that was made in the builder (e.g. one converted for you). Then Save. */
  const onImport = async (f?: File) => {
    if (!f) return;
    try {
      const src = extractLessonSource(await f.text());
      if (!src) { toast({ title: "That file wasn't made in the Lesson Builder", variant: "destructive" }); return; }
      if (dirty && !window.confirm("Replace what you have written with this file?")) return;
      setDoc(src); setOpen(null); setDirty(true);
      if (!title.trim()) setTitle(src.title || "");
      toast({ title: "Lesson loaded — check it, then Save" });
    } catch (e: any) {
      toast({ title: "Could not read the file", description: e?.message || String(e), variant: "destructive" });
    }
  };
  const updSlide = (i: number, patch: Partial<LessonSlide>) =>
    upd(d => ({ ...d, slides: d.slides.map((s, k) => (k === i ? { ...s, ...patch } : s)) }));

  useEffect(() => { loadLogo().then(setLogo); }, []);

  /* ── open an existing lesson ───────────────────────────────── */
  useEffect(() => {
    if (!material) return;
    let off = false;
    // A lesson stored in the database carries its document in `content` — nothing to download.
    const inlineSrc = parseInlineLesson(material.content);
    if (inlineSrc) { setDoc(inlineSrc); setTitle(material.title || inlineSrc.title || ""); setLoading(false); return; }
    (async () => {
      try {
        const url = await resolveMaterialUrl(material.file_url || "");
        const r = await fetch(url);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const src = extractLessonSource(await r.text());
        if (off) return;
        if (!src) { setLoadErr("This page was not made in the Lesson Builder, so it can't be opened here. Use the HTML page editor for it."); }
        else { setDoc(src); setTitle(material.title || src.title || ""); }
        setLoading(false);
      } catch (e: any) {
        if (!off) { setLoadErr(e?.message || "Could not load the lesson"); setLoading(false); }
      }
    })();
    return () => { off = true; };
  }, [material]);

  const previewHtml = useMemo(
    () => (mode === "preview" ? buildLessonHtml({ ...doc, title: title.trim() || doc.title }, logo) : ""),
    [mode, doc, title, logo],
  );

  /* ── slides ────────────────────────────────────────────────── */
  const addSlide = (kind: SlideKind) => {
    const last = [...doc.slides].reverse().find(s => s.kind !== "cover");
    upd(d => ({ ...d, slides: [...d.slides, newSlide(kind, last ? last.phase : 0)] }));
    setOpen(doc.slides.length);
  };
  const moveSlide = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= doc.slides.length) return;
    upd(d => { const s = [...d.slides]; [s[i], s[j]] = [s[j], s[i]]; return { ...d, slides: s }; });
    setOpen(j);
  };
  const dupSlide = (i: number) => upd(d => { const s = [...d.slides]; s.splice(i + 1, 0, { ...d.slides[i] }); return { ...d, slides: s }; });
  const delSlide = (i: number) => {
    if (!window.confirm("Delete this slide?")) return;
    upd(d => ({ ...d, slides: d.slides.filter((_, k) => k !== i) }));
    setOpen(null);
  };

  /* ── phases (the tabs along the top) ───────────────────────── */
  const setPhase = (i: number, patch: Partial<{ n: string; c: string }>) =>
    upd(d => ({ ...d, phases: d.phases.map((p, k) => (k === i ? { ...p, ...patch } : p)) }));
  const addPhase = () =>
    upd(d => ({ ...d, phases: [...d.phases, { n: "", c: DEFAULT_PHASES[d.phases.length % DEFAULT_PHASES.length].c }] }));
  const delPhase = (i: number) =>
    upd(d => ({
      ...d,
      phases: d.phases.filter((_, k) => k !== i),
      slides: d.slides.map(s => (s.phase === i ? { ...s, phase: -1 } : s.phase > i ? { ...s, phase: s.phase - 1 } : s)),
    }));

  /* ── save ──────────────────────────────────────────────────── */
  const save = async () => {
    if (!user) return;
    if (!title.trim()) { toast({ title: "Please add a title", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const finalDoc: LessonDoc = { ...doc, title: title.trim() };
      // The lesson is saved straight into the database (its source document), no file upload.
      const content = serializeLesson(finalDoc);
      const size = new Blob([content]).size;

      if (material) {
        const { error } = await supabase.from("subject_materials")
          .update({ title: title.trim(), content, file_url: null, file_size: size })
          .eq("id", material.id);
        if (error) throw error;
        // A lesson that used to be a stored file: tidy the old file away now that the content is in the database.
        if (material.file_url && !material.file_url.startsWith("http")) {
          await supabase.storage.from(BUCKET).remove([material.file_url]);
        }
      } else {
        const { error } = await supabase.from("subject_materials").insert([{
          subject_id: subjectId, title: title.trim(), title_ar: null, description: null,
          material_type: "Document", content, file_url: null, file_size: size,
          is_downloadable: false, uploaded_by: user.id, sort_order: 999, term_id: termId ?? null,
        }]);
        if (error) throw error;
      }
      setDirty(false);
      toast({ title: "✅ Lesson saved" });
      onSaved();
    } catch (e: any) {
      toast({ title: "Save failed", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const close = () => {
    if (dirty && !window.confirm("You have unsaved changes. Close without saving?")) return;
    onClose();
  };

  const iconBtn = (onClick: () => void, label: string, child: React.ReactNode, danger = false, disabled = false) => (
    <button type="button" onClick={e => { e.stopPropagation(); if (!disabled) onClick(); }} aria-label={label} title={label}
      style={{ width: 30, height: 30, borderRadius: 8, border: "none", background: "#F3F4F6", cursor: disabled ? "default" : "pointer",
        opacity: disabled ? .35 : 1, color: danger ? "#DC2626" : G, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      {child}
    </button>
  );

  const modeBtn = (m: "write" | "preview", label: string, Icon: any) => (
    <button type="button" onClick={() => setMode(m)}
      style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 9, border: "none", cursor: "pointer",
        fontSize: 12.5, fontWeight: 700, background: mode === m ? G : "transparent", color: mode === m ? "#fff" : G }}>
      <Icon size={14} />{label}
    </button>
  );

  /* ── one slide card ────────────────────────────────────────── */
  const slideCard = (s: LessonSlide, i: number) => {
    const isOpen = open === i;
    const help = KIND_HELP[s.kind];
    const count = s.lines.split("\n").filter(l => l.trim()).length;
    return (
      <div key={i} style={{ ...cardSt, padding: 0, overflow: "hidden", borderColor: isOpen ? GOLD : BORDER }}>
        <div onClick={() => setOpen(isOpen ? null : i)}
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", cursor: "pointer" }}>
          <span style={{ minWidth: 26, height: 26, borderRadius: 8, background: G, color: "#fff", fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div dir="auto" style={{ fontSize: 13.5, fontWeight: 700, color: G, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {s.title || s.kicker || "Untitled slide"}
            </div>
            <div style={{ fontSize: 10.5, color: TMID }}>{KIND_LABEL[s.kind]}{s.kind !== "cover" ? ` · ${count} line${count === 1 ? "" : "s"}` : ""}</div>
          </div>
          {iconBtn(() => moveSlide(i, -1), "Move up", <ChevronUp size={15} />, false, i === 0)}
          {iconBtn(() => moveSlide(i, 1), "Move down", <ChevronDown size={15} />, false, i === doc.slides.length - 1)}
        </div>

        {isOpen && (
          <div style={{ padding: "4px 10px 12px", display: "flex", flexDirection: "column", gap: 10, borderTop: `1px solid ${BORDER}` }}>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={lbl}>Type</label>
                <select value={s.kind} style={field}
                  onChange={e => { const k = e.target.value as SlideKind; updSlide(i, { kind: k, ...(k === "cover" ? { phase: -1, emoji: s.emoji || "📖", hint: s.hint || "انْقُرْ لِنَبْدَأَ ←" } : {}) }); }}>
                  {KINDS.map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                </select>
              </div>
              {s.kind !== "cover" && (
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Tab</label>
                  <select value={s.phase} style={field} onChange={e => updSlide(i, { phase: +e.target.value })}>
                    <option value={-1}>— none —</option>
                    {doc.phases.map((p, k) => <option key={k} value={k}>{p.n || `Tab ${k + 1}`}</option>)}
                  </select>
                </div>
              )}
            </div>

            <div>
              <label style={lbl}>{s.kind === "cover" ? "Title" : "Slide title"}</label>
              <input dir="auto" value={s.title} onChange={e => updSlide(i, { title: e.target.value })} style={field} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 2 }}>
                <label style={lbl}>Small line above the title</label>
                <input dir="auto" value={s.kicker} onChange={e => updSlide(i, { kicker: e.target.value })} style={field} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={lbl}>Faint word</label>
                <input dir="auto" value={s.ghost} onChange={e => updSlide(i, { ghost: e.target.value })} style={field} />
              </div>
            </div>

            {s.kind === "cover" ? (
              <>
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label style={lbl}>Emoji</label>
                    <input value={s.emoji || ""} onChange={e => updSlide(i, { emoji: e.target.value })} style={field} />
                  </div>
                  <div style={{ flex: 3 }}>
                    <label style={lbl}>Subtitle</label>
                    <input dir="auto" value={s.sub || ""} onChange={e => updSlide(i, { sub: e.target.value })} style={field} />
                  </div>
                </div>
                <div>
                  <label style={lbl}>Hint under the title</label>
                  <input dir="auto" value={s.hint || ""} onChange={e => updSlide(i, { hint: e.target.value })} style={field} />
                </div>
              </>
            ) : (
              <div>
                <label style={lbl}>Content — one item per line</label>
                <textarea dir="auto" value={s.lines} onChange={e => updSlide(i, { lines: e.target.value })}
                  placeholder={help.example} rows={8}
                  style={{ ...field, height: "auto", padding: 10, lineHeight: 1.9, fontSize: 15, resize: "vertical", fontFamily: "inherit" }} />
                <div style={{ fontSize: 11.5, color: TMID, marginTop: 5, lineHeight: 1.5 }}>{help.how}</div>
              </div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              {iconBtn(() => dupSlide(i), "Duplicate slide", <Copy size={14} />)}
              {iconBtn(() => delSlide(i), "Delete slide", <Trash2 size={14} />, true)}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 90, background: "#f3f4f6", display: "flex", flexDirection: "column", fontFamily: "'Cairo',system-ui,sans-serif" }}>
      {/* Header */}
      <div style={{ background: "#fff", borderBottom: `1px solid ${BORDER}`, padding: "8px 10px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={close} aria-label="Close"
          style={{ width: 34, height: 34, borderRadius: 9, border: "none", background: "#F3F4F6", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <X size={16} />
        </button>
        <input dir="auto" value={title} onChange={e => { setTitle(e.target.value); setDirty(true); }} placeholder="Lesson title"
          style={{ flex: "1 1 140px", minWidth: 0, height: 34, borderRadius: 9, border: `1px solid ${BORDER}`, padding: "0 10px", fontSize: 14, fontWeight: 700, color: G }} />
        <div style={{ display: "flex", gap: 2, background: "#F3F4F6", borderRadius: 11, padding: 3 }}>
          {modeBtn("write", "Write", PenLine)}
          {modeBtn("preview", "Preview", Eye)}
        </div>
        <button type="button" onClick={save} disabled={saving || loading || !!loadErr}
          style={{ height: 34, padding: "0 16px", borderRadius: 10, border: "none", background: GOLD, color: G, fontWeight: 800, fontSize: 13, cursor: saving ? "default" : "pointer", display: "flex", alignItems: "center", gap: 6, opacity: saving || loading || loadErr ? .6 : 1 }}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
        </button>
      </div>

      {/* Body */}
      {loading ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: TMID }}><Loader2 className="animate-spin" /></div>
      ) : loadErr ? (
        <div style={{ margin: 16, padding: 16, borderRadius: 12, background: "#FEF2F2", color: "#B91C1C", fontSize: 13.5, fontWeight: 600 }}>{loadErr}</div>
      ) : mode === "preview" ? (
        <div style={{ flex: 1, display: "flex", justifyContent: "center", padding: 10, minHeight: 0 }}>
          <iframe title="Lesson preview" srcDoc={previewHtml} sandbox="allow-scripts allow-same-origin"
            style={{ width: "min(100%, 430px)", height: "100%", border: `1px solid ${BORDER}`, borderRadius: 14, background: "#fff" }} />
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: "auto", padding: 10, display: "flex", flexDirection: "column", gap: 10, paddingBottom: 90 }}>
          {/* Lesson settings */}
          <div style={cardSt}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: G }}>Lesson settings</span>
              <div style={{ display: "flex", gap: 6 }}>
                <input ref={importRef} type="file" accept=".html,text/html" style={{ display: "none" }}
                  onChange={e => { onImport(e.target.files?.[0]); e.target.value = ""; }} />
                <button type="button" onClick={() => importRef.current?.click()}
                  style={{ display: "flex", alignItems: "center", gap: 4, border: "none", background: "transparent", color: TMID, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  <Upload size={14} /> Import
                </button>
                <button type="button" onClick={() => setShowHelp(v => !v)}
                  style={{ display: "flex", alignItems: "center", gap: 4, border: "none", background: "transparent", color: TMID, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  <Info size={14} /> How to write
                </button>
              </div>
            </div>
            {showHelp && (
              <div style={{ background: "#FBF6E6", border: `1px dashed ${GOLD}`, borderRadius: 10, padding: 10, marginBottom: 10, fontSize: 12, color: G, lineHeight: 1.7 }}>
                {KINDS.filter(k => k !== "cover").map(k => (
                  <div key={k} style={{ marginBottom: 8 }}>
                    <b>{KIND_LABEL[k]}</b> — {KIND_HELP[k].how}
                    <pre dir="auto" style={{ margin: "4px 0 0", whiteSpace: "pre-wrap", fontFamily: "inherit", background: "#fff", borderRadius: 8, padding: "6px 8px", fontSize: 13 }}>{KIND_HELP[k].example}</pre>
                  </div>
                ))}
                Write each item the way a student should read it. In class, tap the right side to go forward — the Arabic appears first, its English on the next tap — and tap the left side to go back.
              </div>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              <div style={{ flex: "1 1 120px" }}>
                <label style={lbl}>Direction</label>
                <select value={doc.dir} style={field} onChange={e => upd(d => ({ ...d, dir: e.target.value as "rtl" | "ltr" }))}>
                  <option value="rtl">Arabic (right to left)</option>
                  <option value="ltr">English (left to right)</option>
                </select>
              </div>
              <label style={{ flex: "1 1 160px", display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: G, marginTop: 18 }}>
                <input type="checkbox" checked={doc.brandCover} onChange={e => upd(d => ({ ...d, brandCover: e.target.checked }))} />
                Academy logo as first slide
              </label>
            </div>
            <label style={lbl}>Tabs along the top</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {doc.phases.map((p, i) => (
                <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(p.c) ? p.c : "#0f6b4f"} onChange={e => setPhase(i, { c: e.target.value })}
                    style={{ width: 38, height: 38, border: `1px solid ${BORDER}`, borderRadius: 9, padding: 2, background: "#fff", flexShrink: 0 }} />
                  <input dir="auto" value={p.n} onChange={e => setPhase(i, { n: e.target.value })} placeholder={`Tab ${i + 1} name`} style={field} />
                  {iconBtn(() => delPhase(i), "Remove tab", <Trash2 size={14} />, true)}
                </div>
              ))}
              <button type="button" onClick={addPhase}
                style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 5, border: `1px dashed ${BORDER}`, background: "#fff", borderRadius: 9, padding: "6px 12px", fontSize: 12.5, fontWeight: 700, color: TMID, cursor: "pointer" }}>
                <Plus size={14} /> Add tab
              </button>
            </div>
          </div>

          {/* Slides */}
          {doc.slides.map(slideCard)}

          <div style={{ ...cardSt, display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: G }}>Add a slide</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {KINDS.map(k => (
                <button key={k} type="button" onClick={() => addSlide(k)}
                  style={{ display: "flex", alignItems: "center", gap: 5, border: `1px solid ${GOLD}`, background: "#FBF6E6", color: G, borderRadius: 10, padding: "7px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                  <Plus size={13} /> {KIND_LABEL[k]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
