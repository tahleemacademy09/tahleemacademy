// src/pages/admin/CourseManagement.tsx
// Hierarchy: Courses → Subjects → [📋 Syllabus | 📁 Materials | ▶️ Lessons]
// 
// 🔧 ALL FIXES APPLIED:
// 1. Syntax: All braces/parentheses balanced (fixes "Unexpected }" and "Expected )" errors)
// 2. Lessons query: uses "subject_id" instead of "course_id"
// 3. Subject delete cascade: uses "subject_id" instead of "course_id"
// 4. saveLesson payload: includes "content" field + uses "subject_id"
// 5. onChange handlers: proper parenthesis closure setF(m => ({ ... }))

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { storageSupabase } from "../../integrations/supabase/storageClient";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import SubjectMaterials from "@/components/classroom/SubjectMaterials";
import {
  Plus, BookOpen, Trash2, Edit2, ChevronRight, ChevronLeft,
  Loader2, EyeOff, Save, Image, Search, Layers, FolderOpen,
  FileText, Video, Music, ExternalLink, Type, FileSpreadsheet,
  Upload, Download, File, Check, Calendar, ChevronDown, ChevronUp, X, AlertCircle, Lock, Copy,
} from "lucide-react";

const G    = "#064E3B";
const GM   = "#075E54";
const GOLD = "#C9A84C";
type Level  = "all"|"beginner"|"intermediate"|"advanced";
type MatType = "PDF"|"Video"|"Audio"|"Link"|"Text"|"Image"|"Document";
type SortKey = "sort_order"|"title_asc"|"title_desc"|"level";
type ContentTab = "syllabus"|"materials"|"lessons";

const MATERIAL_TYPES: MatType[] = ["PDF","Video","Audio","Link","Text","Image","Document"];

const lvlCfg: Record<Level,{label:string;bg:string;text:string;border:string}> = {
  all:          {label:"All Levels",   bg:"#F3F4F6",text:"#374151",border:"#D1D5DB"},
  beginner:     {label:"Beginner",     bg:"#F0FDF4",text:"#166534",border:"#86EFAC"},
  intermediate: {label:"Intermediate", bg:"#EFF6FF",text:"#1E40AF",border:"#93C5FD"},
  advanced:     {label:"Advanced",     bg:"#FDF4FF",text:"#6B21A8",border:"#D8B4FE"},
};

// Safe lookup — comma-separated or unknown levels fall back to "all"
const safeLvl = (level?: string | null) =>
  lvlCfg[(level as Level)] ?? lvlCfg["all"];

const weekPalette = [
  {bg:"#EFF6FF",border:"#BFDBFE",badge:"#1D4ED8"},
  {bg:"#F0FDF4",border:"#BBF7D0",badge:"#15803D"},
  {bg:"#FDF4FF",border:"#E9D5FF",badge:"#7C3AED"},
  {bg:"#FFF7ED",border:"#FED7AA",badge:"#C2410C"},
  {bg:"#FFF1F2",border:"#FECDD3",badge:"#BE123C"},
  {bg:"#F0FDFA",border:"#99F6E4",badge:"#0F766E"},
];
const matCfg: Record<MatType,{icon:React.ElementType;bg:string;text:string;border:string}> = {
  PDF:      {icon:FileText,        bg:"#FEF2F2",text:"#DC2626",border:"#FECACA"},
  Video:    {icon:Video,           bg:"#F0FDF4",text:"#16A34A",border:"#BBF7D0"},
  Audio:    {icon:Music,           bg:"#FDF4FF",text:"#9333EA",border:"#E9D5FF"},
  Link:     {icon:ExternalLink,    bg:"#F0FDFA",text:"#0D9488",border:"#99F6E4"},
  Text:     {icon:Type,            bg:"#FFFBEB",text:"#B45309",border:"#FDE68A"},
  Image:    {icon:Image,           bg:"#EFF6FF",text:"#2563EB",border:"#BFDBFE"},
  Document: {icon:FileSpreadsheet, bg:"#EFF6FF",text:"#1D4ED8",border:"#BFDBFE"},
};

const fmtSize = (b?:number) => !b?"":b<1024?`${b}B`:b<1048576?`${(b/1024).toFixed(0)}KB`:`${(b/1048576).toFixed(1)}MB`;

const inp: React.CSSProperties = {
  width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid #E5E7EB",
  fontSize:13,outline:"none",background:"#FAFAFA",boxSizing:"border-box",fontFamily:"inherit",
};

async function resolveImg(url?:string|null):Promise<string|null> {
  if (!url||!url.trim()) return null;
  if (url.startsWith("http")) return url;
  const {data} = storageSupabase.storage.from("subject-images").getPublicUrl(url);
  return data?.publicUrl||null;
}
async function signedUrl(path:string):Promise<string> {
  if (path.startsWith("http")) return path;
  const {data} = await storageSupabase.storage.from("subject-files").createSignedUrl(path,3600);
  return data?.signedUrl||path;
}
async function uploadImg(file:File,bucket:string):Promise<string|null> {
  const ext=file.name.split(".").pop()||"jpg";
  const path=`items/${crypto.randomUUID()}.${ext}`;
  const {error} = await storageSupabase.storage.from(bucket).upload(path,file,{upsert:true,contentType:file.type});
  if (error) return null;
  const {data} = storageSupabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl||path;
}

// ── SHARED UI COMPONENTS (properly balanced) ─────────────────────────
const Thumb = ({ url, title, height = 120, bg }: { url?: string | null; title: string; height?: number; bg: string }) => {
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  
  useEffect(() => {
    resolveImg(url).then(setSrc);
  }, [url]);
  
  if (!src || err) {
    return (
      <div style={{ height, background: bg, display: "flex", alignItems: "center", justifyContent: "center" }}>        <BookOpen size={22} style={{ opacity: 0.3 }} />
      </div>
    );
  }
  return (
    <img 
      src={src} 
      alt={title} 
      style={{ width: "100%", height, objectFit: "cover", display: "block" }} 
      onError={() => setErr(true)} 
    />
  );
};

const Fld = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>
      {label}
    </label>
    {children}
  </div>
);

// ══════════════════════════════════════════════════════════════════════════
// COURSE MODAL
// ══════════════════════════════════════════════════════════════════════════
const CourseModal = React.memo(({ ed, onClose, onSave, busy, privateStudents }: { ed?: any; onClose: () => void; onSave: (p: any, assigned: Set<string>) => Promise<void>; busy: boolean; privateStudents: any[] }) => {
  const [f, setF] = useState({ title: ed?.title || "", title_ar: ed?.title_ar || "", description: ed?.description || "", level: (ed?.level || "all") as Level, is_published: ed?.is_published ?? true, image_url: ed?.image_url || "", sort_order: ed?.sort_order || 0, visibility: ((ed?.visibility || "all") as "all" | "general" | "private") });
  const [up, setUp] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  // Private student assignment
  const [privAssigned, setPrivAssigned] = useState<Set<string>>(new Set());
  const [privSaving,   setPrivSaving]   = useState(false);
  useEffect(() => {
    if (!ed?.id) { setPrivAssigned(new Set()); return; }
    supabase.from("private_student_courses" as any).select("student_id").eq("course_id", ed.id)
      .then(({ data }) => setPrivAssigned(new Set((data || []).map((r: any) => r.student_id))));
  }, [ed?.id]);

  const togglePriv = useCallback(async (studentId: string) => {
    if (!ed?.id) {
      // New course — just track locally, parent applies after save
      setPrivAssigned(prev => { const n = new Set(prev); n.has(studentId) ? n.delete(studentId) : n.add(studentId); return n; });
      return;
    }
    setPrivSaving(true);
    const isAssigned = privAssigned.has(studentId);
    if (isAssigned) {
      await supabase.from("private_student_courses" as any).delete().eq("student_id", studentId).eq("course_id", ed.id);
      setPrivAssigned(prev => { const n = new Set(prev); n.delete(studentId); return n; });
    } else {
      await supabase.from("private_student_courses" as any).insert({ student_id: studentId, course_id: ed.id } as any);
      setPrivAssigned(prev => new Set([...prev, studentId]));
    }
    setPrivSaving(false);
  }, [privAssigned, ed?.id]);
  
  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fi = e.target.files?.[0]; if (!fi) return; setUp(true);
    const url = await uploadImg(fi, "subject-files");
    if (url) setF(c => ({ ...c, image_url: url })); setUp(false);
  }, []);
  
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 500, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #E5E7EB", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "#fff" }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: "#111", margin: 0 }}>{ed ? "Edit Course" : "New Course"}</h2>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#9CA3AF" }}>×</button>
        </div>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <input ref={ref} id="cm-course-img" type="file" accept="image/*" style={{ position:"absolute",width:1,height:1,opacity:0,overflow:"hidden",pointerEvents:"none" }} onChange={handleFile} />
          <label htmlFor="cm-course-img" style={{ height: 100, borderRadius: 12, border: "2px dashed #E5E7EB", background: "#F9FAFB", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: "#9CA3AF", fontSize: 13 }}>
            {up ? <Loader2 size={20} style={{ animation: "spin .8s linear infinite" }} /> : f.image_url ? <img src={f.image_url} alt="" style={{ height: "100%", borderRadius: 10 }} /> : <><Image size={20} /> Upload thumbnail</>}
          </label>
          <Fld label="Course Title (English)"><input value={f.title} onChange={e => setF(c => ({ ...c, title: e.target.value }))} style={inp} placeholder="e.g. Quran Memorisation" autoFocus /></Fld>
          <Fld label="Course Title (Arabic)"><input value={f.title_ar} onChange={e => setF(c => ({ ...c, title_ar: e.target.value }))} style={{ ...inp, direction: "rtl", fontFamily: "'Amiri',serif" }} placeholder="مثال: حفظ القرآن" /></Fld>
          <Fld label="Description"><textarea value={f.description} onChange={e => setF(c => ({ ...c, description: e.target.value }))} rows={3} style={{ ...inp, resize: "vertical" }} /></Fld>
          <Fld label="Visible to Level">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(["all", "beginner", "intermediate", "advanced"] as Level[]).map(lv => {
                const c = lvlCfg[lv], sel = f.level === lv;
                return (
                  <button key={lv} type="button" onClick={() => setF(p => ({ ...p, level: lv }))}
                    style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 14px", borderRadius: 10, border: `2px solid ${sel ? c.border : "#E5E7EB"}`, background: sel ? c.bg : "#fff", cursor: "pointer", flex: 1, minWidth: 100 }}>
                    <div style={{ width: 16, height: 16, borderRadius: "50%", border: `2px solid ${sel ? c.border : "#D1D5DB"}`, background: sel ? c.text : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {sel && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff" }} />}
                    </div>
                    <span style={{ fontWeight: sel ? 800 : 500, fontSize: 12, color: sel ? c.text : "#374151" }}>{c.label}</span>
                  </button>
                );
              })}
            </div>
            <p style={{ fontSize: 11, color: "#6B7280", margin: "6px 0 0" }}>
              {f.level === "all" ? "✅ All students will see this course." : `⚠️ Only ${lvlCfg[f.level].label} students will see this course.`}
            </p>
          </Fld>
          <Fld label="Sort Order"><input type="number" value={f.sort_order} onChange={e => setF(c => ({ ...c, sort_order: Number(e.target.value) }))} style={inp} min={0} /></Fld>

          {/* ── Visibility ── */}
          <Fld label="Who can see this course?">
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              {([
                { value: "all",     label: "All Students",  desc: "General + Private",      color: "#22c55e", bg: "#f0fff4" },
                { value: "general", label: "Class Students", desc: "Not private students",   color: "#3b82f6", bg: "#eff6ff" },
                { value: "private", label: "Private Only",   desc: "Assigned privates only", color: "#7C3AED", bg: "#F3E8FF" },
              ] as const).map(opt => {
                const sel = f.visibility === opt.value;
                return (
                  <button key={opt.value} type="button" onClick={() => setF(c => ({ ...c, visibility: opt.value }))}
                    style={{ flex: 1, padding: "9px 4px", borderRadius: 11, cursor: "pointer", border: `2px solid ${sel ? opt.color : "#E5E7EB"}`, background: sel ? opt.bg : "#F9FAFB", textAlign: "center" as const, transition: "all .15s" }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: sel ? opt.color : "#374151" }}>{opt.label}</div>
                    <div style={{ fontSize: 10, color: sel ? opt.color + "bb" : "#9CA3AF", marginTop: 2 }}>{opt.desc}</div>
                  </button>
                );
              })}
            </div>
          </Fld>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input type="checkbox" id="cpub" checked={f.is_published} onChange={e => setF(c => ({ ...c, is_published: e.target.checked }))} />
            <label htmlFor="cpub" style={{ fontSize: 13, color: "#374151" }}>Published (visible to students)</label>
          </div>

          {/* ── Private Student Assignment ── */}
          <div style={{ borderTop: "1.5px solid #E5E7EB", paddingTop: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div>
                <p style={{ fontSize: 12, fontWeight: 800, color: "#374151", margin: "0 0 2px", display: "flex", alignItems: "center", gap: 6 }}>
                  <Lock size={13} style={{ color: "#7C3AED" }} />
                  Assign to Private Students
                </p>
                <p style={{ fontSize: 10, color: "#9CA3AF", margin: 0 }}>
                  {privAssigned.size} student{privAssigned.size !== 1 ? "s" : ""} — private students see only their assigned courses
                </p>
              </div>
              {privSaving && <Loader2 size={14} style={{ color: "#7C3AED", animation: "spin 1s linear infinite" }} />}
            </div>
            {!privateStudents?.length ? (
              <div style={{ padding: 12, borderRadius: 10, background: "#F9FAFB", border: "1px solid #E5E7EB", fontSize: 11, color: "#9CA3AF", textAlign: "center" }}>
                No private students yet
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflowY: "auto" }}>
                {privateStudents.map((st: any) => {
                  const isAssigned = privAssigned.has(st.user_id);
                  return (
                    <button key={st.user_id} type="button" onClick={() => togglePriv(st.user_id)}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, border: `1.5px solid ${isAssigned ? "#D8B4FE" : "#E5E7EB"}`, background: isAssigned ? "#F3E8FF" : "#fff", cursor: "pointer", textAlign: "left", width: "100%", transition: "all .12s" }}>
                      <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${isAssigned ? "#7C3AED" : "#D1D5DB"}`, background: isAssigned ? "#7C3AED" : "#fff", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {isAssigned && <span style={{ color: "#fff", fontSize: 11, lineHeight: 1 }}>✓</span>}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: isAssigned ? 800 : 500, color: isAssigned ? "#7C3AED" : "#374151", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {st.full_name || "Unnamed"}
                        </p>
                        {st.student_id && <p style={{ fontSize: 10, color: "#9CA3AF", margin: "1px 0 0" }}>ID: {st.student_id}</p>}
                      </div>
                      {isAssigned && <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 9, background: "#7C3AED", color: "#fff", fontWeight: 800, flexShrink: 0 }}>Assigned</span>}
                    </button>
                  );
                })}
              </div>
            )}
            {!ed?.id && privAssigned.size > 0 && (
              <p style={{ fontSize: 10, color: "#7C3AED", margin: "6px 0 0", fontWeight: 700 }}>
                ✅ {privAssigned.size} student{privAssigned.size !== 1 ? "s" : ""} will be assigned when you save.
              </p>
            )}
          </div>

          <button type="button" onClick={() => onSave(f, privAssigned)} disabled={busy || !f.title}
            style={{ padding: "12px", borderRadius: 12, border: "none", background: busy || !f.title ? "#e5e7eb" : `linear-gradient(135deg,${G},${GM})`, color: busy || !f.title ? "#9ca3af" : "#fff", fontWeight: 800, cursor: busy || !f.title ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <Save size={14} /> {busy ? "Saving…" : ed ? "Update Course" : "Create Course"}
          </button>
        </div>
      </div>
    </div>
  );
});

// ══════════════════════════════════════════════════════════════════════════
// SUBJECT MODAL
// ══════════════════════════════════════════════════════════════════════════
const SubjectModal = React.memo(({ ed, teachers, onClose, onSave, busy, privateStudents }: { ed?: any; teachers: any[]; onClose: () => void; onSave: (p: any, assigned: Set<string>) => Promise<void>; busy: boolean; privateStudents: any[] }) => {
  const LEVELS_LIST = ["beginner", "intermediate", "advanced"] as const;
  const parseStoredLevel = (stored?: string): Set<string> => {
    if (!stored || stored === "all") return new Set(["beginner", "intermediate", "advanced"]);
    return new Set(stored.split(",").map(s => s.trim()).filter(Boolean));
  };
  const [f, setF] = useState({ title: ed?.title || "", title_ar: ed?.title_ar || "", description: ed?.description || "", selectedLevels: parseStoredLevel(ed?.level), is_active: ed?.is_active ?? true, image_url: ed?.image_url || "", teacher_id: ed?.teacher_id || "", visibility: ((ed?.visibility || "all") as "all" | "general" | "private") });
  const [up, setUp] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  // Private student assignment — mirrors CourseModal exactly
  const [privAssigned, setPrivAssigned] = useState<Set<string>>(new Set());
  const [privSaving,   setPrivSaving]   = useState(false);
  useEffect(() => {
    if (!ed?.id) { setPrivAssigned(new Set()); return; }
    supabase.from("private_student_subjects" as any).select("student_id").eq("subject_id", ed.id)
      .then(({ data }) => setPrivAssigned(new Set((data || []).map((r: any) => r.student_id))));
  }, [ed?.id]);

  const togglePriv = useCallback(async (studentId: string) => {
    if (!ed?.id) {
      setPrivAssigned(prev => { const n = new Set(prev); n.has(studentId) ? n.delete(studentId) : n.add(studentId); return n; });
      return;
    }
    setPrivSaving(true);
    if (privAssigned.has(studentId)) {
      await supabase.from("private_student_subjects" as any).delete().eq("student_id", studentId).eq("subject_id", ed.id);
      setPrivAssigned(prev => { const n = new Set(prev); n.delete(studentId); return n; });
    } else {
      await supabase.from("private_student_subjects" as any).insert({ student_id: studentId, subject_id: ed.id } as any);
      setPrivAssigned(prev => new Set([...prev, studentId]));
    }
    setPrivSaving(false);
  }, [privAssigned, ed?.id]);

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fi = e.target.files?.[0]; if (!fi) return; setUp(true);
    const url = await uploadImg(fi, "subject-images");
    if (url) setF(s => ({ ...s, image_url: url })); setUp(false);
  }, []);

  const toggleLevel = (lv: string) => {
    setF(s => {
      const next = new Set(s.selectedLevels);
      next.has(lv) ? next.delete(lv) : next.add(lv);
      return { ...s, selectedLevels: next };
    });
  };

  const buildLevelValue = (): string => {
    const all = new Set(["beginner", "intermediate", "advanced"]);
    const sel = f.selectedLevels;
    if (sel.size === 0 || (sel.size === 3 && [...all].every(l => sel.has(l)))) return "all";
    if (sel.size === 1) return [...sel][0];
    return [...sel].join(",");
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 500, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #E5E7EB", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "#fff" }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: "#111", margin: 0 }}>{ed ? "Edit Subject" : "New Subject"}</h2>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#9CA3AF" }}>×</button>
        </div>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <input ref={ref} id="cm-subj-img" type="file" accept="image/*" style={{ position:"absolute",width:1,height:1,opacity:0,overflow:"hidden",pointerEvents:"none" }} onChange={handleFile} />
          <label htmlFor="cm-subj-img" style={{ height: 100, borderRadius: 12, border: "2px dashed #E5E7EB", background: "#F9FAFB", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: "#9CA3AF", fontSize: 13 }}>
            {up ? <Loader2 size={20} style={{ animation: "spin .8s linear infinite" }} /> : f.image_url ? <img src={f.image_url} alt="" style={{ height: "100%", borderRadius: 10 }} /> : <><Image size={20} /> Upload image</>}
          </label>
          <Fld label="Subject Title (English)"><input value={f.title} onChange={e => setF(s => ({ ...s, title: e.target.value }))} style={inp} placeholder="e.g. Tajweed Level 1" autoFocus /></Fld>
          <Fld label="Subject Title (Arabic)"><input value={f.title_ar} onChange={e => setF(s => ({ ...s, title_ar: e.target.value }))} style={{ ...inp, direction: "rtl", fontFamily: "'Amiri',serif" }} placeholder="مثال: التجويد المستوى الأول" /></Fld>
          <Fld label="Description"><textarea value={f.description} onChange={e => setF(s => ({ ...s, description: e.target.value }))} rows={3} style={{ ...inp, resize: "vertical" }} /></Fld>
          <Fld label="Visible to Levels (select all that apply)">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {LEVELS_LIST.map(lv => {
                const c = lvlCfg[lv], sel = f.selectedLevels.has(lv);
                return (
                  <button key={lv} type="button" onClick={() => toggleLevel(lv)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, border: `2px solid ${sel ? c.border : "#E5E7EB"}`, background: sel ? c.bg : "#fff", cursor: "pointer", textAlign: "left" as const }}>
                    <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${sel ? c.border : "#D1D5DB"}`, background: sel ? c.text : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {sel && <Check size={11} color="#fff" />}
                    </div>
                    <span style={{ fontWeight: sel ? 800 : 500, fontSize: 13, color: sel ? c.text : "#374151" }}>{c.label}</span>
                  </button>
                );
              })}
              {f.selectedLevels.size === 0 && (
                <p style={{ fontSize: 11, color: "#DC2626", margin: "2px 0 0" }}>Select at least one level</p>
              )}
            </div>
          </Fld>
          <Fld label="Assign Teacher">
            <select value={f.teacher_id} onChange={e => setF(s => ({ ...s, teacher_id: e.target.value }))} style={inp}>
              <option value="">— No teacher assigned —</option>
              {teachers.map((t: any) => <option key={t.user_id} value={t.user_id}>{t.full_name}</option>)}
            </select>
          </Fld>

          {/* ── Who can see this subject? ── */}
          <Fld label="Who can see this subject?">
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              {([
                { value: "all",     label: "All Students",  desc: "General + Private",      color: "#22c55e", bg: "#f0fff4" },
                { value: "general", label: "Class Students", desc: "Not private students",   color: "#3b82f6", bg: "#eff6ff" },
                { value: "private", label: "Private Only",   desc: "Assigned privates only", color: "#7C3AED", bg: "#F3E8FF" },
              ] as const).map(opt => {
                const sel = f.visibility === opt.value;
                return (
                  <button key={opt.value} type="button" onClick={() => setF(s => ({ ...s, visibility: opt.value }))}
                    style={{ flex: 1, padding: "9px 4px", borderRadius: 11, cursor: "pointer", border: `2px solid ${sel ? opt.color : "#E5E7EB"}`, background: sel ? opt.bg : "#F9FAFB", textAlign: "center" as const, transition: "all .15s" }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: sel ? opt.color : "#374151" }}>{opt.label}</div>
                    <div style={{ fontSize: 10, color: sel ? opt.color + "bb" : "#9CA3AF", marginTop: 2 }}>{opt.desc}</div>
                  </button>
                );
              })}
            </div>
            {f.visibility === "private" && (
              <p style={{ fontSize: 10, color: "#7C3AED", margin: "6px 0 0", display: "flex", alignItems: "center", gap: 4 }}>
                <Lock size={10} /> Assign specific students below
              </p>
            )}
          </Fld>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input type="checkbox" id="sact" checked={f.is_active} onChange={e => setF(s => ({ ...s, is_active: e.target.checked }))} />
            <label htmlFor="sact" style={{ fontSize: 13, color: "#374151" }}>Active (visible to students)</label>
          </div>

          {/* ── Assign to Private Students ── */}
          <div style={{ borderTop: "1.5px solid #E5E7EB", paddingTop: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div>
                <p style={{ fontSize: 12, fontWeight: 800, color: "#374151", margin: "0 0 2px", display: "flex", alignItems: "center", gap: 6 }}>
                  <Lock size={13} style={{ color: "#7C3AED" }} />
                  Assign to Private Students
                </p>
                <p style={{ fontSize: 10, color: "#9CA3AF", margin: 0 }}>
                  {privAssigned.size} student{privAssigned.size !== 1 ? "s" : ""} — private students see only their assigned subjects
                </p>
              </div>
              {privSaving && <Loader2 size={14} style={{ color: "#7C3AED", animation: "spin 1s linear infinite" }} />}
            </div>
            {!privateStudents?.length ? (
              <div style={{ padding: 12, borderRadius: 10, background: "#F9FAFB", border: "1px solid #E5E7EB", fontSize: 11, color: "#9CA3AF", textAlign: "center" }}>
                No private students yet
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflowY: "auto" }}>
                {privateStudents.map((st: any) => {
                  const isAssigned = privAssigned.has(st.user_id);
                  return (
                    <button key={st.user_id} type="button" onClick={() => togglePriv(st.user_id)}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, border: `1.5px solid ${isAssigned ? "#D8B4FE" : "#E5E7EB"}`, background: isAssigned ? "#F3E8FF" : "#fff", cursor: "pointer", textAlign: "left", width: "100%", transition: "all .12s" }}>
                      <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${isAssigned ? "#7C3AED" : "#D1D5DB"}`, background: isAssigned ? "#7C3AED" : "#fff", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {isAssigned && <span style={{ color: "#fff", fontSize: 11, lineHeight: 1 }}>✓</span>}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: isAssigned ? 800 : 500, color: isAssigned ? "#7C3AED" : "#374151", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {st.full_name || "Unnamed"}
                        </p>
                        {st.student_id && <p style={{ fontSize: 10, color: "#9CA3AF", margin: "1px 0 0" }}>ID: {st.student_id}</p>}
                      </div>
                      {isAssigned && <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 9, background: "#7C3AED", color: "#fff", fontWeight: 800, flexShrink: 0 }}>Assigned</span>}
                    </button>
                  );
                })}
              </div>
            )}
            {!ed?.id && privAssigned.size > 0 && (
              <p style={{ fontSize: 10, color: "#7C3AED", margin: "6px 0 0", fontWeight: 700 }}>
                ✅ {privAssigned.size} student{privAssigned.size !== 1 ? "s" : ""} will be assigned when you save.
              </p>
            )}
          </div>

          <button type="button" onClick={() => onSave({ ...f, level: buildLevelValue(), visibility: f.visibility }, privAssigned)} disabled={busy || !f.title || f.selectedLevels.size === 0}
            style={{ padding: "12px", borderRadius: 12, border: "none", background: busy || !f.title || f.selectedLevels.size === 0 ? "#e5e7eb" : `linear-gradient(135deg,${G},${GM})`, color: busy || !f.title || f.selectedLevels.size === 0 ? "#9ca3af" : "#fff", fontWeight: 800, cursor: busy || !f.title || f.selectedLevels.size === 0 ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <Save size={14} /> {busy ? "Saving…" : ed ? "Update Subject" : "Create Subject"}
          </button>
        </div>
      </div>
    </div>
  );
});

// ══════════════════════════════════════════════════════════════════════════
// LESSON MODAL
// ══════════════════════════════════════════════════════════════════════════
const LessonModal = React.memo(({ ed, onClose, onSave, busy }: { ed?: any; onClose: () => void; onSave: (p: any) => Promise<void>; busy: boolean }) => {
  const [f, setF] = useState({
    title: ed?.title || "", title_ar: ed?.title_ar || "",
    content: ed?.content || "",
    duration_minutes: ed?.duration_minutes || 0,
    sort_order: ed?.sort_order || 0,
    is_free: ed?.is_free || false,
  });
  
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #E5E7EB", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "#fff" }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: "#111", margin: 0 }}>{ed ? "Edit Lesson" : "New Lesson"}</h2>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#9CA3AF" }}>×</button>        </div>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ padding: "10px 14px", borderRadius: 12, background: "#F0FDF4", border: "1px solid #86EFAC", fontSize: 12, color: "#166534" }}>
            ℹ️ Lessons are live virtual sessions — describe what students will learn or cover in this session.
          </div>
          <Fld label="Session Title"><input value={f.title} onChange={e => setF(l => ({ ...l, title: e.target.value }))} style={inp} placeholder="e.g. Introduction to Makharij" autoFocus /></Fld>
          <Fld label="Session Title (Arabic)"><input value={f.title_ar} onChange={e => setF(l => ({ ...l, title_ar: e.target.value }))} style={{ ...inp, direction: "rtl", fontFamily: "'Amiri',serif" }} placeholder="مثال: مقدمة في المخارج" /></Fld>
          <Fld label="What students will learn / Session outline">
            <textarea value={f.content} onChange={e => setF(l => ({ ...l, content: e.target.value }))} rows={5}
              style={{ ...inp, resize: "vertical" }} placeholder={"• Rules of Noon Sakinah\n• Practice recitation of Ayat 1–7\n• Q&A session"} />
          </Fld>
          <Fld label="Estimated Duration (minutes)"><input type="number" value={f.duration_minutes} onChange={e => setF(l => ({ ...l, duration_minutes: Number(e.target.value) }))} style={inp} min={0} /></Fld>
          <Fld label="Sort Order"><input type="number" value={f.sort_order} onChange={e => setF(l => ({ ...l, sort_order: Number(e.target.value) }))} style={inp} min={0} /></Fld>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input type="checkbox" id="lfree" checked={f.is_free} onChange={e => setF(l => ({ ...l, is_free: e.target.checked }))} />
            <label htmlFor="lfree" style={{ fontSize: 13, color: "#374151" }}>Free preview (visible without enrolment)</label>
          </div>
          <button type="button" onClick={() => onSave(f)} disabled={busy || !f.title}
            style={{ padding: "12px", borderRadius: 12, border: "none", background: busy || !f.title ? "#e5e7eb" : `linear-gradient(135deg,${G},${GM})`, color: busy || !f.title ? "#9ca3af" : "#fff", fontWeight: 800, cursor: busy || !f.title ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <Save size={14} /> {busy ? "Saving…" : ed ? "Update Lesson" : "Add Lesson"}
          </button>
        </div>
      </div>
    </div>
  );
});

// ══════════════════════════════════════════════════════════════════════════
// SYLLABUS MODAL
// ══════════════════════════════════════════════════════════════════════════
const SyllabusModal = React.memo(({ ed, nextWeek, onClose, onSave, busy }: { ed?: any; nextWeek: number; onClose: () => void; onSave: (p: any) => Promise<void>; busy: boolean }) => {
  const [f, setF] = useState({ week_number: ed?.week_number || nextWeek, title: ed?.title || "", description: ed?.description || "", objectives: ed?.objectives ? (ed.objectives as string[]).join("\n") : "" });
  
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #E5E7EB", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "#fff" }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: "#111", margin: 0, display: "flex", alignItems: "center", gap: 8 }}><Calendar size={16} color={G} /> {ed ? "Edit Week" : "Add Week"}</h2>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#9CA3AF" }}>×</button>
        </div>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "76px 1fr", gap: 12 }}>
            <Fld label="Week #"><input type="number" value={f.week_number} onChange={e => setF(s => ({ ...s, week_number: parseInt(e.target.value) || 1 }))} style={inp} min={1} /></Fld>
            <Fld label="Title *"><input value={f.title} onChange={e => setF(s => ({ ...s, title: e.target.value }))} style={inp} placeholder="e.g. Surah Al-Fatiha (1–7)" autoFocus /></Fld>
          </div>
          <Fld label="Description"><textarea value={f.description} onChange={e => setF(s => ({ ...s, description: e.target.value }))} rows={3} style={{ ...inp, resize: "vertical" }} placeholder="What will students learn this week?" /></Fld>
          <Fld label="Learning Objectives (one per line)">
            <textarea value={f.objectives} onChange={e => setF(s => ({ ...s, objectives: e.target.value }))} rows={4} style={{ ...inp, resize: "vertical", fontFamily: "monospace", fontSize: 12 }} placeholder={"Listen to each ayah 5 times\nRecite each ayah 10 times\nMemorize by end of week"} />
          </Fld>
          <button type="button" onClick={() => onSave(f)} disabled={busy || !f.title}            style={{ padding: "12px", borderRadius: 12, border: "none", background: busy || !f.title ? "#e5e7eb" : `linear-gradient(135deg,${G},${GM})`, color: busy || !f.title ? "#9ca3af" : "#fff", fontWeight: 800, cursor: busy || !f.title ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <Save size={14} /> {busy ? "Saving…" : ed ? "Save Changes" : "Add Week"}
          </button>
        </div>
      </div>
    </div>
  );
});

// ══════════════════════════════════════════════════════════════════════════
// MATERIAL MODAL — Simplified for build stability
// ══════════════════════════════════════════════════════════════════════════
function autoDetectType(file: File): MatType {
  const t = file.type.toLowerCase(), e = file.name.split(".").pop()?.toLowerCase() || "";
  if (t.includes("pdf") || e === "pdf") return "PDF";
  if (t.includes("video") || ["mp4", "webm", "mov", "m4v", "avi"].includes(e)) return "Video";
  if (t.includes("audio") || ["mp3", "wav", "m4a", "aac", "ogg", "flac"].includes(e)) return "Audio";
  if (t.includes("image") || ["jpg", "jpeg", "png", "gif", "webp", "svg", "avif"].includes(e)) return "Image";
  if (["doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods"].includes(e)) return "Document";
  return "PDF";
}

const TYPE_ACCEPT: Record<MatType, string> = {
  PDF: ".pdf", Video: "video/*,.mp4,.webm,.mov", Audio: "audio/*,.mp3,.wav,.m4a",
  Image: "image/*", Document: ".doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods",
  Link: "", Text: "",
};

const MaterialModal = React.memo(({ ed, subjectId, sortOrder, onClose, onSaved }: { ed?: any; subjectId: string; sortOrder: number; onClose: () => void; onSaved: () => void }) => {
  const { user } = useAuth();
  const [f, setF] = useState({
    title: ed?.title || "",
    material_type: (ed?.material_type || "PDF") as MatType,
    file_url: ed?.file_url || "",
    content: ed?.content || "",
    is_downloadable: ed?.is_downloadable ?? true,
    sort_order: ed?.sort_order ?? sortOrder,
  });
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pct, setPct] = useState(0);
  const [phase, setPhase] = useState<"idle" | "uploading" | "saving" | "done" | "error">("idle");
  const [saveErr, setSaveErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  
  const cfg = matCfg[f.material_type];
  const Icon = cfg.icon;
  const needFile = f.material_type !== "Link" && f.material_type !== "Text";
  const needUrl = f.material_type === "Link";
  const needText = f.material_type === "Text";  const busy = phase === "uploading" || phase === "saving";

  const pickFile = useCallback((fi: File) => {
    const detected = autoDetectType(fi);
    setFile(fi);
    setF(m => ({ ...m, material_type: detected, title: m.title || fi.name.replace(/\.[^/.]+$/, "") }));
    setSaveErr("");
    if (fi.type.startsWith("image/")) {
      const r = new FileReader();
      r.onload = ev => setPreview(ev.target?.result as string);
      r.readAsDataURL(fi);
    } else {
      setPreview(null);
    }
  }, []);

  const clearFile = useCallback(() => {
    setFile(null); setPreview(null); setPct(0); setPhase("idle");
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  const doSave = async () => {
    setSaveErr("");
    if (!f.title.trim()) { setSaveErr("Title is required."); return; }
    if (needFile && !file && !f.file_url.trim()) { setSaveErr("Please select a file or paste a URL."); return; }
    if (needUrl && !f.file_url.trim()) { setSaveErr("Please enter a URL."); return; }
    if (needText && !f.content.trim()) { setSaveErr("Content cannot be empty."); return; }

    setPhase("uploading"); setPct(5);

    try {
      let fileUrl = f.file_url.trim(), fileType = "", fileSize = 0;

      if (needFile && file) {
        const ext = file.name.split(".").pop() || "bin";
        const path = `materials/${subjectId}/${crypto.randomUUID()}.${ext}`;
        
        setPct(50);
        const { error } = await supabase.storage
          .from("subject-files")
          .upload(path, file, { cacheControl: "3600", upsert: false });
        if (error) throw new Error("Storage: " + error.message);
        
        fileUrl = path;
        fileType = file.type;
        fileSize = file.size;
      }

      setPct(97); setPhase("saving");
      const payload: any = {
        subject_id: subjectId,
        title: f.title.trim(),
        material_type: f.material_type,
        file_url: fileUrl || null,
        content: needText ? f.content.trim() : null,
        is_downloadable: f.is_downloadable,
        sort_order: f.sort_order,
        ...(fileType ? { file_type: fileType } : {}),
        ...(fileSize ? { file_size: fileSize } : {}),
      };
      if (!ed?.id && user) payload.uploaded_by = user.id;

      const { error: dbErr } = ed?.id
        ? await supabase.from("subject_materials").update(payload).eq("id", ed.id)
        : await supabase.from("subject_materials").insert(payload);
      if (dbErr) throw new Error("Database: " + dbErr.message);

      setPct(100); setPhase("done");
      toast({ title: "✅ Material saved successfully" });
      setTimeout(() => onSaved(), 600);
    } catch (e: any) {
      setPhase("error"); setPct(0);
      setSaveErr(e.message || "Upload failed.");
      toast({ title: "Upload Error", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 520, maxHeight: "95vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "18px 20px", borderBottom: "1px solid #E5E7EB", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: "#111", margin: 0 }}>{ed ? "Edit Material" : "Upload Material"}</h2>
          <button type="button" onClick={onClose} disabled={busy} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#9CA3AF" }}>×</button>
        </div>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          {saveErr && <div style={{ padding: "10px 14px", borderRadius: 10, background: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626", fontSize: 12 }}>{saveErr}</div>}
          
          <Fld label="Title *"><input value={f.title} onChange={e => { setF(m => ({ ...m, title: e.target.value })); setSaveErr(""); }} style={inp} placeholder="e.g. Week 1 Worksheet" autoFocus disabled={busy} /></Fld>
          
          <Fld label="Type">
            <select value={f.material_type} onChange={e => setF(m => ({ ...m, material_type: e.target.value as MatType }))} style={inp} disabled={busy}>
              {MATERIAL_TYPES.map(mt => <option key={mt} value={mt}>{mt}</option>)}
            </select>
          </Fld>
          
          {needFile && (
            <div>
              <input ref={fileRef} id="cm-mat-file" type="file" style={{ position:"absolute",width:1,height:1,opacity:0,overflow:"hidden",pointerEvents:"none" }} accept={TYPE_ACCEPT[f.material_type] || "*/*"} onChange={e => { const fi = e.target.files?.[0]; if (fi) pickFile(fi); }} disabled={busy} />
              {file ? (                <div style={{ padding: "10px", borderRadius: 10, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
                  <p style={{ fontSize: 12, fontWeight: 600 }}>{file.name}</p>
                  <p style={{ fontSize: 11, color: "#6B7280" }}>{fmtSize(file.size)}</p>
                  <button type="button" onClick={clearFile} style={{ marginTop: 6, fontSize: 11, color: cfg.text }}>Remove</button>
                </div>
              ) : (
                <label htmlFor={busy ? undefined : "cm-mat-file"} style={{ display:"block", padding: "12px", borderRadius: 10, border: `2px dashed ${cfg.border}`, background: cfg.bg, color: cfg.text, fontSize: 12, cursor: busy ? "not-allowed" : "pointer", textAlign:"center" }}>
                  Select file
                </label>
              )}
              <div style={{ margin: "8px 0", fontSize: 11, color: "#9CA3AF" }}>or paste URL:</div>
              <input value={f.file_url} onChange={e => setF(m => ({ ...m, file_url: e.target.value }))} style={inp} placeholder="https://…" disabled={busy} />
            </div>
          )}
          
          {needUrl && <Fld label="URL *"><input value={f.file_url} onChange={e => { setF(m => ({ ...m, file_url: e.target.value })); setSaveErr(""); }} style={inp} placeholder="https://…" disabled={busy} /></Fld>}
          {needText && <Fld label="Content *"><textarea value={f.content} onChange={e => { setF(m => ({ ...m, content: e.target.value })); setSaveErr(""); }} rows={4} style={{ ...inp, resize: "vertical" }} placeholder="Type content…" disabled={busy} /></Fld>}
          
          {phase !== "idle" && (
            <div style={{ padding: "10px", borderRadius: 10, background: "#F0FDF4", border: "1px solid #BBF7D0", fontSize: 12 }}>
              {phase === "uploading" && `Uploading… ${pct}%`}
              {phase === "saving" && "Saving…"}
              {phase === "done" && "✅ Saved!"}
              {phase === "error" && "❌ Error"}
            </div>
          )}
          
          <button type="button" onClick={doSave} disabled={busy || phase === "done"}
            style={{ padding: "12px", borderRadius: 12, border: "none", background: busy || phase === "done" ? "#E5E7EB" : G, color: busy || phase === "done" ? "#9CA3AF" : "#fff", fontWeight: 700, cursor: busy || phase === "done" ? "not-allowed" : "pointer" }}>
            {busy ? "Saving…" : phase === "done" ? "Saved!" : ed ? "Save Changes" : "Upload"}
          </button>
        </div>
      </div>
    </div>
  );
});

// ══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════
export default function CourseManagement() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { subjectId: urlSubjectId } = useParams<{ subjectId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  type View = "courses" | "subjects" | "content";

  // ── URL-backed state — survives refresh ──────────────────────────────
  const viewParam    = (searchParams.get("view")    || "courses") as View;
  const courseParam  =  searchParams.get("course")  || null;
  const subjectParam =  searchParams.get("subject") || null;
  const tabParam     = (searchParams.get("tab")     || "materials") as ContentTab;

  // Initialize view from the URL so deep links / refreshes land on the right view.
  // selCourse is hydrated asynchronously below — heading guards against null.
  const [view,       setViewState]      = useState<View>(viewParam);
  const [selCourse,  setSelCourseState] = useState<any>(null);
  const [selSubject, setSelSubjectState]= useState<any>(null);
  const [tab,        setTabState]       = useState<ContentTab>(tabParam);

  // Helpers that update both React state AND the URL atomically
  const setView = (v: View) => {
    setViewState(v);
    setSearchParams(prev => { const p = new URLSearchParams(prev); p.set("view", v); return p; }, { replace: true });
  };
  const setTab = (t: ContentTab) => {
    setTabState(t);
    setSearchParams(prev => { const p = new URLSearchParams(prev); p.set("tab", t); return p; }, { replace: true });
  };
  const setSelCourse = (c: any) => {
    setSelCourseState(c);
    setSearchParams(prev => {
      const p = new URLSearchParams(prev);
      if (c) p.set("course", c.id); else p.delete("course");
      return p;
    }, { replace: true });
  };
  const setSelSubject = (s: any) => {
    setSelSubjectState(s);
    setSearchParams(prev => {
      const p = new URLSearchParams(prev);
      if (s) p.set("subject", s.id); else p.delete("subject");
      return p;
    }, { replace: true });
  };

  const [search, setSearch] = useState("");
  const [lvlFilter, setLvlFilter] = useState<Level>("all");
  const [sortBy, setSortBy] = useState<SortKey>("sort_order");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // ── Re-hydrate from URL params on first mount / refresh ──────────────
  const hydrated = useRef(false);
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;

    // URL-param subject takes precedence (direct link from notifications etc.)
    if (urlSubjectId) {
      (async () => {
        const { data: subj } = await supabase.from("subjects").select("*").eq("id", urlSubjectId).single();
        if (!subj) return;
        if (subj.course_id) {
          const { data: course } = await supabase.from("courses").select("*").eq("id", subj.course_id).single();
          if (course) setSelCourseState(course);
        }
        setSelSubjectState(subj);
        setViewState("content");
        setTabState("materials");
        setSearchParams({ view: "content", course: subj.course_id || "", subject: subj.id, tab: "materials" }, { replace: true });
      })();
      return;
    }

    // Otherwise restore from search params
    const restoreView    = (searchParams.get("view")    || "courses") as View;
    const restoreCourse  =  searchParams.get("course")  || null;
    const restoreSubject =  searchParams.get("subject") || null;
    const restoreTab     = (searchParams.get("tab")     || "materials") as ContentTab;

    if (restoreView === "courses" && !restoreCourse) return; // nothing to restore

    (async () => {
      let course = null;
      let subject = null;

      if (restoreCourse) {
        const { data } = await supabase.from("courses").select("*").eq("id", restoreCourse).single();
        course = data || null;
      }
      if (restoreSubject) {
        const { data } = await supabase.from("subjects").select("*").eq("id", restoreSubject).single();
        subject = data || null;
      }

      if (course)   setSelCourseState(course);
      else if (restoreView === "subjects") {
        // Course not found — fall back to courses list instead of broken subjects view
        setViewState("courses");
        setSearchParams(prev => { const p = new URLSearchParams(prev); p.set("view","courses"); p.delete("course"); p.delete("subject"); return p; }, { replace: true });
        return;
      }
      if (subject)  setSelSubjectState(subject);
      setViewState(restoreView);
      setTabState(restoreTab);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [showCourse, setShowCourse] = useState(false);
  const [showSubject, setShowSubject] = useState(false);
  const [showLesson, setShowLesson] = useState(false);
  const [showSyllabus, setShowSyllabus] = useState(false);
  const [showMaterial, setShowMaterial] = useState(false);
  const [edCourse, setEdCourse] = useState<any>(null);
  const [edSubject, setEdSubject] = useState<any>(null);
  const [edLesson, setEdLesson] = useState<any>(null);
  const [edSyllabus, setEdSyllabus] = useState<any>(null);
  const [edMaterial, setEdMaterial] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: courses = [], isLoading: cLoad } = useQuery({ queryKey: ["adm-courses"], queryFn: async () => { const { data } = await supabase.from("courses").select("*").order("sort_order"); return data || []; } });
  const { data: subjects = [], isLoading: sLoad } = useQuery({ queryKey: ["adm-subjects", selCourse?.id], enabled: !!selCourse?.id, queryFn: async () => { let q = supabase.from("subjects").select("*").order("title"); if (selCourse) q = q.eq("course_id", selCourse.id); const { data } = await q; return data || []; } });
  const { data: allSubjects = [] } = useQuery({ queryKey: ["adm-all-subjects"], queryFn: async () => { const { data } = await supabase.from("subjects").select("id,title,level,course_id").order("title"); return data || []; } });
  
  // 🔧 FIX #1: lessons query uses "subject_id" instead of "course_id"
  const { data: lessons = [], isLoading: lLoad } = useQuery({
    queryKey: ["adm-lessons", selSubject?.id],
    enabled: !!selSubject,
    queryFn: async () => {
      const { data } = await supabase.from("lessons").select("*").eq("subject_id", selSubject?.id || "").order("sort_order");
      return data || [];
    }
  });
  
  const { data: syllabus = [], isLoading: syllLoad } = useQuery({ queryKey: ["adm-syllabus", selSubject?.id], enabled: !!selSubject, queryFn: async () => { const { data } = await supabase.from("subject_syllabus").select("*").eq("subject_id", selSubject!.id).order("week_number"); return data || []; } });
  const { data: materials = [], isLoading: matLoad } = useQuery({ queryKey: ["adm-materials", selSubject?.id], enabled: !!selSubject, queryFn: async () => { const { data } = await supabase.from("subject_materials").select("*").eq("subject_id", selSubject!.id).order("sort_order").order("created_at", { ascending: false }); return data || []; } });
  const { data: teachers = [] } = useQuery({ queryKey: ["teachers-simple"], queryFn: async () => { const { data: roles } = await supabase.from("user_roles").select("user_id").in("role", ["teacher", "admin"]); if (!roles?.length) return []; const { data } = await supabase.from("profiles").select("user_id,full_name").in("user_id", roles.map((r: any) => r.user_id)); return data || []; } });
  const { data: privateStudents = [] } = useQuery({ queryKey: ["private-students-list"], queryFn: async () => { const { data } = await supabase.from("profiles").select("user_id, full_name, student_id").eq("student_type" as any, "private"); return data || []; } });

  // ── CRUD helpers ─────────────────────────────────────────────────────────
  const saveCourse = useCallback(async (p: any, assigned?: Set<string>) => {
    setBusy(true);
    try {
      const d = { title: p.title, title_ar: p.title_ar || null, description: p.description || null, level: (p.level || "all") as Level, is_published: p.is_published, image_url: p.image_url || null, sort_order: p.sort_order, visibility: (p.visibility || "all") as "all" | "general" | "private", updated_at: new Date().toISOString() };
      if (edCourse) {
        const { error: courseErr } = await supabase.from("courses").update(d).eq("id", edCourse.id);
        if (courseErr) throw courseErr;
        // Private assignments are handled live inside CourseModal for existing courses
      } else {
        const { data: inserted, error: courseErr } = await supabase.from("courses").insert(d).select("id").single();
        if (courseErr) throw courseErr;
        // Apply queued private assignments for new courses
        if (assigned && assigned.size > 0) {
          const rows = [...assigned].map(sid => ({ student_id: sid, course_id: inserted.id }));
          await supabase.from("private_student_courses" as any).upsert(rows as any, { onConflict: "student_id,course_id" });
        }
      }
      qc.invalidateQueries({ queryKey: ["adm-courses"] }); setShowCourse(false); setEdCourse(null);
      toast({ title: "✅ Course saved" });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    setBusy(false);
  }, [edCourse, qc]);

  const delCourse = async (id: string) => {
    if (!confirm("Delete this course?")) return;
    await supabase.from("courses").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["adm-courses"] });
    if (selCourse?.id === id) { setSelCourse(null); setView("courses"); }
    toast({ title: "Course deleted" });
  };

  const saveSubject = useCallback(async (p: any, assigned?: Set<string>) => {
    setBusy(true);
    try {
      const d: any = { title: p.title, title_ar: p.title_ar || null, description: p.description || null, level: p.level, is_active: p.is_active, image_url: p.image_url || null, teacher_id: p.teacher_id || null, course_id: selCourse?.id || null, visibility: p.visibility || "all", updated_at: new Date().toISOString() };
      if (edSubject) {
        const { error: subjErr } = await supabase.from("subjects").update(d).eq("id", edSubject.id);
        if (subjErr) throw subjErr;
        // Assignments are handled live inside the modal via togglePriv — no extra work needed here
      } else {
        const { data: newSubj, error: subjErr } = await supabase.from("subjects").insert(d).select().single();
        if (subjErr) throw subjErr;
        // For new subjects, apply any pre-selected private student assignments
        if (assigned && assigned.size > 0 && newSubj) {
          const rows = [...assigned].map(sid => ({ student_id: sid, subject_id: (newSubj as any).id }));
          await supabase.from("private_student_subjects" as any).insert(rows as any);
        }
      }
      qc.invalidateQueries({ queryKey: ["adm-subjects"] }); qc.invalidateQueries({ queryKey: ["adm-all-subjects"] });
      setShowSubject(false); setEdSubject(null); toast({ title: "✅ Subject saved" });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    setBusy(false);
  }, [edSubject, selCourse, qc]);

  const delSubject = async (id: string) => {
    if (!confirm("Delete subject and all its content?")) return;
    // 🔧 FIX #2: delete lessons by "subject_id" instead of "course_id"
    await supabase.from("lessons").delete().eq("subject_id", id);
    await supabase.from("subjects").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["adm-subjects"] });
    if (selSubject?.id === id) { setSelSubject(null); setView("subjects"); }
    toast({ title: "Subject deleted" });
  };

  const dupSubject = async (s: any) => {
    const { data, error } = await supabase.from("subjects").insert({
      title:       `${s.title} (Copy)`,
      title_ar:    s.title_ar    || null,
      description: s.description || null,
      level:       s.level       || "all",
      image_url:   s.image_url   || null,
      teacher_id:  s.teacher_id  || null,
      course_id:   s.course_id   || null,
      is_active:   s.is_active   ?? true,
      visibility:  s.visibility  || "all",
    } as any).select().single();
    if (error) { toast({ title: "Duplicate failed", description: error.message, variant: "destructive" }); return; }
    qc.invalidateQueries({ queryKey: ["adm-subjects"] });
    toast({ title: `"${s.title}" duplicated`, description: "Edit the copy to change its content." });
  };

  // 🔧 FIX #3: saveLesson payload includes "content" field + uses "subject_id"
  const saveLesson = useCallback(async (p: any) => {
    setBusy(true);
    try {
      const d = {
        title: p.title,
        title_ar: p.title_ar || null,        content: p.content || null,
        duration_minutes: p.duration_minutes,
        sort_order: p.sort_order,
        subject_id: selSubject?.id,
        is_free: p.is_free
      };
      const { error: lessonErr } = edLesson ? await supabase.from("lessons").update(d).eq("id", edLesson.id) : await supabase.from("lessons").insert(d);
      if (lessonErr) throw lessonErr;
      qc.invalidateQueries({ queryKey: ["adm-lessons", selSubject?.id] });
      setShowLesson(false); setEdLesson(null); toast({ title: "✅ Lesson saved" });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    setBusy(false);
  }, [edLesson, selSubject, qc]);

  const delLesson = async (id: string) => {
    if (!confirm("Delete this lesson?")) return;
    await supabase.from("lessons").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["adm-lessons", selSubject?.id] }); toast({ title: "Lesson deleted" });
  };

  const saveSyllabus = useCallback(async (p: any) => {
    setBusy(true);
    try {
      const d = { subject_id: selSubject!.id, week_number: p.week_number, title: p.title, description: p.description || null, objectives: p.objectives ? p.objectives.split("\n").filter(Boolean) : null };
      const { error: syllErr } = edSyllabus ? await supabase.from("subject_syllabus").update(d).eq("id", edSyllabus.id) : await supabase.from("subject_syllabus").insert(d);
      if (syllErr) throw syllErr;
      qc.invalidateQueries({ queryKey: ["adm-syllabus", selSubject!.id] }); qc.invalidateQueries({ queryKey: ["syllabus"] });
      setShowSyllabus(false); setEdSyllabus(null); toast({ title: "✅ Week saved" });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    setBusy(false);
  }, [edSyllabus, selSubject, qc]);

  const delSyllabus = async (id: string) => {
    if (!confirm("Delete this week?")) return;
    await supabase.from("subject_syllabus").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["adm-syllabus", selSubject?.id] }); toast({ title: "Week deleted" });
  };

  const delMaterial = async (mat: any) => {
    if (!confirm("Delete this material?")) return;
    if (mat.file_url && !mat.file_url.startsWith("http")) await storageSupabase.storage.from("subject-files").remove([mat.file_url]);
    await supabase.from("subject_materials").delete().eq("id", mat.id);
    qc.invalidateQueries({ queryKey: ["adm-materials", selSubject?.id] }); toast({ title: "Material deleted" });
  };

  // ── Filtering / sorting ───────────────────────────────────────────────────
  const sortList = (list: any[]) => {
    const s = [...list];
    if (sortBy === "title_asc") return s.sort((a, b) => a.title.localeCompare(b.title));
    if (sortBy === "title_desc") return s.sort((a, b) => b.title.localeCompare(a.title));    if (sortBy === "level") { const o: any = { beginner: 0, intermediate: 1, advanced: 2, all: 3 }; return s.sort((a, b) => (o[a.level] || 0) - (o[b.level] || 0)); }
    return s.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  };
  const fCourses = sortList(courses.filter((c: any) => (lvlFilter === "all" || c.level === lvlFilter || c.level === "all") && (!search || c.title.toLowerCase().includes(search.toLowerCase()))));
  const fSubjects = subjects.filter((s: any) => {
    // Prefer the TEXT[] `levels` array (set by SubjectManagement).
    // Fall back to the legacy `level` string for older rows.
    const subjectLevels: string[] =
      Array.isArray(s.levels) && s.levels.length > 0
        ? s.levels
        : s.level === "all" || !s.level
          ? ["beginner", "intermediate", "advanced"]
          : s.level.split(",").map((l: string) => l.trim());
    const levelMatch = lvlFilter === "all" || subjectLevels.includes(lvlFilter);
    return levelMatch && (!search || s.title.toLowerCase().includes(search.toLowerCase()));
  });
  const unlinked = allSubjects.filter((s: any) => !s.course_id);

  const addLabel = view === "courses" ? "Add Course" : view === "subjects" ? "Add Subject" : tab === "syllabus" ? "Add Week" : tab === "materials" ? "Upload" : "Add Lesson";
  const doAdd = () => {
    if (view === "courses") setShowCourse(true);
    else if (view === "subjects") setShowSubject(true);
    else if (tab === "syllabus") { setEdSyllabus(null); setShowSyllabus(true); }
    else if (tab === "materials") { setEdMaterial(null); setShowMaterial(true); }
    else { setEdLesson(null); setShowLesson(true); }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#F3F4F6", fontFamily: "system-ui,sans-serif" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} .chov:hover{box-shadow:0 4px 14px rgba(0,0,0,.09);transform:translateY(-1px)} .chov{transition:all .18s}`}</style>

      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", padding: "14px 16px", display: "flex", alignItems: "center", gap: 10 }}>
        {view !== "courses" && (
          <button type="button" onClick={() => { if (view === "content") { setView("subjects"); setSelSubject(null); } else { setView("courses"); setSelCourse(null); } }}
            style={{ width: 34, height: 34, borderRadius: 8, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ChevronLeft size={16} color="#6B7280" />
          </button>
        )}
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#9CA3AF", flexWrap: "wrap" }}>
            <span style={{ cursor: "pointer" }} onClick={() => { setView("courses"); setSelCourse(null); setSelSubject(null); }}>Courses</span>
            {selCourse && <><ChevronRight size={11} /><span style={{ cursor: "pointer", color: view === "subjects" ? "#111" : "#9CA3AF" }} onClick={() => { setView("subjects"); setSelSubject(null); }}>{selCourse.title}</span></>}
            {selSubject && <><ChevronRight size={11} /><span style={{ color: "#111" }}>{selSubject.title}</span></>}
          </div>
          <h1 style={{ fontSize: 16, fontWeight: 800, color: "#111", margin: 0 }}>
            {view === "courses"
              ? "Courses"
              : view === "subjects"
                ? selCourse
                  ? `${selCourse.title} — Subjects`
                  : "Loading…"
                : selSubject?.title ?? "Loading…"}
          </h1>
        </div>
        <button type="button" onClick={doAdd} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 10, border: "none", background: G, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          <Plus size={14} /> {addLabel}
        </button>
      </div>

      {/* Content tabs (only in content view) */}
      {view === "content" && (
        <div style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", padding: "0 16px", display: "flex", gap: 0 }}>
          {([
            { id: "syllabus", label: "📋 Syllabus", count: (syllabus as any[]).length },
            { id: "materials", label: "📁 Materials", count: (materials as any[]).length },            { id: "lessons", label: "📚 Sessions", count: (lessons as any[]).length },
          ] as { id: ContentTab; label: string; count: number }[]).map(t => {
            const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{ padding: "12px 16px", border: "none", background: "none", cursor: "pointer", fontSize: 13, fontWeight: active ? 800 : 500, color: active ? G : "#6B7280", borderBottom: active ? `3px solid ${G}` : "3px solid transparent", display: "flex", alignItems: "center", gap: 7 }}>
                {t.label}
                {t.count > 0 && <span style={{ background: active ? G : "#E5E7EB", color: active ? "#fff" : "#374151", borderRadius: 20, fontSize: 10, fontWeight: 700, padding: "1px 6px" }}>{t.count}</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* Filters (not content view) */}
      {view !== "content" && (
        <div style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", padding: "10px 16px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ position: "relative", minWidth: 160, flex: 1 }}>
            <Search size={13} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" style={{ ...inp, paddingLeft: 28 }} />
          </div>
          {(["all", "beginner", "intermediate", "advanced"] as Level[]).map(lv => {
            const c = lvlCfg[lv];
            return <button key={lv} onClick={() => setLvlFilter(lv)} style={{ flexShrink: 0, padding: "6px 12px", borderRadius: 20, border: `1.5px solid ${lvlFilter === lv ? c.border : "#E5E7EB"}`, background: lvlFilter === lv ? c.bg : "#fff", color: lvlFilter === lv ? c.text : "#6B7280", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{c.label}</button>;
          })}
          {view === "courses" && (
            <select value={sortBy} onChange={e => setSortBy(e.target.value as SortKey)} style={{ ...inp, width: "auto", minWidth: 130, flexShrink: 0 }}>
              <option value="sort_order">Sort: Manual</option>
              <option value="title_asc">Sort: A → Z</option>
              <option value="title_desc">Sort: Z → A</option>
              <option value="level">Sort: By Level</option>
            </select>
          )}
        </div>
      )}

      <div style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>

        {/* ═══ COURSES ═══════════════════════════════════════ */}
        {view === "courses" && (
          cLoad ? <div style={{ textAlign: "center", padding: 40 }}><Loader2 size={28} style={{ animation: "spin .8s linear infinite", color: G }} /></div>
            : fCourses.length === 0 ? <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}><FolderOpen size={48} style={{ margin: "0 auto 12px", display: "block" }} /><p>No courses yet. Create your first course above.</p></div>
              : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 14 }}>
                {fCourses.map((c: any) => {
                  const lv = lvlCfg[(c.level as Level) || "all"];
                  return (
                    <div key={c.id} className="chov" style={{ background: "#fff", borderRadius: 16, border: `1px solid ${lv.border}`, overflow: "hidden" }}>
                      <div style={{ position: "relative", cursor: "pointer" }} onClick={() => { setSelCourse(c); setView("subjects"); }}>
                        <Thumb url={c.image_url} title={c.title} height={120} bg={lv.bg} />
                        <div style={{ position: "absolute", top: 8, right: 8, padding: "3px 10px", borderRadius: 20, background: lv.bg, color: lv.text, fontSize: 10, fontWeight: 700, border: `1px solid ${lv.border}` }}>{lv.label}</div>                        {!c.is_published && <div style={{ position: "absolute", top: 8, left: 8, padding: "3px 10px", borderRadius: 20, background: "#FEF2F2", color: "#DC2626", fontSize: 10, fontWeight: 700, border: "1px solid #FECACA" }}>Draft</div>}{c.visibility === "private" && <div style={{ position: "absolute", bottom: 8, left: 8, padding: "2px 8px", borderRadius: 20, background: "#F3E8FF", color: "#7C3AED", fontSize: 10, fontWeight: 700, border: "1px solid #D8B4FE" }}>🔒 Private</div>}{c.visibility === "general" && <div style={{ position: "absolute", bottom: 8, left: 8, padding: "2px 8px", borderRadius: 20, background: "#eff6ff", color: "#3b82f6", fontSize: 10, fontWeight: 700, border: "1px solid #bfdbfe" }}>👥 Class Only</div>}
                      </div>
                      <div style={{ padding: 14 }}>
                        <p style={{ fontWeight: 800, fontSize: 14, color: "#111", margin: "0 0 2px", cursor: "pointer" }} onClick={() => { setSelCourse(c); setView("subjects"); }}>{c.title}</p>
                        {c.title_ar && <p style={{ fontWeight: 600, fontSize: 12, color: GOLD, margin: "0 0 4px", direction: "rtl", fontFamily: "'Amiri',serif" }}>{c.title_ar}</p>}
                        {c.description && <p style={{ fontSize: 12, color: "#9CA3AF", margin: "0 0 10px", lineHeight: 1.5 }}>{c.description.slice(0, 80)}{c.description.length > 80 ? "…" : ""}</p>}
                        <div style={{ display: "flex", gap: 6 }}>
                          <button type="button" onClick={() => { setSelCourse(c); setView("subjects"); }} style={{ flex: 1, padding: "7px", borderRadius: 8, border: `1px solid ${G}`, background: G, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                            <Layers size={12} /> Manage
                          </button>
                          <button type="button" onClick={() => { setEdCourse(c); setShowCourse(true); }} style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", cursor: "pointer" }}><Edit2 size={13} color={G} /></button>
                          <button type="button" onClick={() => delCourse(c.id)} style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #FEE2E2", background: "#FEF2F2", cursor: "pointer" }}><Trash2 size={13} color="#DC2626" /></button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
        )}

        {/* ═══ SUBJECTS ══════════════════════════════════════ */}
        {view === "subjects" && (() => {
          const getLevels = (s: any): string[] =>
            Array.isArray(s.levels) && s.levels.length > 0
              ? s.levels
              : s.level === "all" || !s.level
                ? ["beginner", "intermediate", "advanced"]
                : s.level.split(",").map((l: string) => l.trim());
          const sm = (s: any) => !search || s.title.toLowerCase().includes(search.toLowerCase());
          const buckets = [
            { key: "beginner",     label: "Beginner",     color: "#22c55e", items: fSubjects.filter((s: any) => getLevels(s).includes("beginner")    && s.visibility !== "private" && sm(s)) },
            { key: "intermediate", label: "Intermediate", color: "#d97706", items: fSubjects.filter((s: any) => getLevels(s).includes("intermediate") && s.visibility !== "private" && sm(s)) },
            { key: "advanced",     label: "Advanced",     color: "#7c3aed", items: fSubjects.filter((s: any) => getLevels(s).includes("advanced")     && s.visibility !== "private" && sm(s)) },
            { key: "private",      label: "Private",      color: "#7C3AED", items: fSubjects.filter((s: any) => s.visibility === "private" && sm(s)) },
          ];
          const [activeTab, setActiveTab] = React.useState<string>("beginner");
          const ab = buckets.find(b => b.key === activeTab) || buckets[0];
          if (sLoad) return <div style={{ textAlign: "center", padding: 40 }}><Loader2 size={28} style={{ animation: "spin .8s linear infinite", color: G }} /></div>;
          return (
            <>
              <div style={{ display: "flex", overflowX: "auto", scrollbarWidth: "none", marginBottom: 16, background: `linear-gradient(135deg,${G},#075E54)`, borderRadius: 16, padding: "10px 12px 0" }}>
                {buckets.map(b => { const isSel = activeTab === b.key; return (
                  <button key={b.key} type="button" onClick={() => setActiveTab(b.key)}
                    style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 16px 10px", border: "none", background: "none", cursor: "pointer", flexShrink: 0, borderBottom: isSel ? `3px solid ${b.color}` : "3px solid transparent" }}>
                    <span style={{ fontSize: 12, fontWeight: isSel ? 800 : 500, color: isSel ? "#fff" : "rgba(255,255,255,.5)", whiteSpace: "nowrap" }}>
                      {b.key === "private" ? "🔒 " : ""}{b.label}
                    </span>
                    <span style={{ fontSize: 10, marginTop: 2, padding: "1px 7px", borderRadius: 20, background: isSel ? b.color : "rgba(255,255,255,.15)", color: "#fff", fontWeight: 700 }}>
                      {b.items.length}
                    </span>
                  </button>
                );})}
              </div>
              {ab.items.length === 0 ? (
                <div style={{ textAlign: "center", padding: 48, color: "#9CA3AF", background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB" }}>
                  <BookOpen size={40} style={{ margin: "0 auto 12px", display: "block", opacity: .3 }} />
                  <p style={{ fontWeight: 600, margin: "0 0 4px", color: "#374151" }}>No {ab.label} subjects yet</p>
                  <p style={{ fontSize: 12, margin: 0 }}>Use + Add Subject to create one</p>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 14, marginBottom: 20 }}>
                  {ab.items.map((s: any) => {
                    const lv = safeLvl(s.level);
                    return (
                      <div key={s.id} className="chov" style={{ background: "#fff", borderRadius: 16, border: `1px solid ${lv.border}`, overflow: "hidden" }}>
                        <div style={{ position: "relative" }}>
                          <Thumb url={s.image_url} title={s.title} height={100} bg={lv.bg} />
                          <div style={{ position: "absolute", top: 8, right: 8, padding: "2px 8px", borderRadius: 20, background: lv.bg, color: lv.text, fontSize: 9, fontWeight: 700, border: `1px solid ${lv.border}` }}>{lv.label}</div>
                          {!s.is_active && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center" }}><EyeOff size={20} color="#fff" /></div>}
                          {s.visibility === "private" && <div style={{ position: "absolute", bottom: 8, left: 6, padding: "2px 7px", borderRadius: 20, background: "#F3E8FF", color: "#7C3AED", fontSize: 9, fontWeight: 700, border: "1px solid #D8B4FE" }}>🔒 Private</div>}
                          {s.visibility === "general" && <div style={{ position: "absolute", bottom: 8, left: 6, padding: "2px 7px", borderRadius: 20, background: "#eff6ff", color: "#3b82f6", fontSize: 9, fontWeight: 700, border: "1px solid #bfdbfe" }}>👥 Class Only</div>}
                        </div>
                        <div style={{ padding: 12 }}>
                          <p style={{ fontWeight: 800, fontSize: 13, color: "#111", margin: "0 0 2px" }}>{s.title}</p>
                          {s.title_ar && <p style={{ fontWeight: 600, fontSize: 11, color: GOLD, margin: "0 0 6px", direction: "rtl", fontFamily: "'Amiri',serif" }}>{s.title_ar}</p>}
                          {s.description && <p style={{ fontSize: 11, color: "#9CA3AF", margin: "0 0 10px", lineHeight: 1.4 }}>{s.description.slice(0, 60)}{s.description.length > 60 ? "…" : ""}</p>}
                          <div style={{ display: "flex", gap: 6 }}>
                            <button type="button" onClick={() => { setSelSubject(s); setView("content"); setTab("syllabus"); }}
                              style={{ flex: 1, padding: "7px", borderRadius: 8, border: `1px solid ${G}`, background: G, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                              <ChevronRight size={12} /> Open
                            </button>
                            <button type="button" onClick={() => { setEdSubject(s); setShowSubject(true); }} style={{ padding: "7px 9px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", cursor: "pointer" }} title="Edit"><Edit2 size={13} color={G} /></button>
                            <button type="button" onClick={() => dupSubject(s)} style={{ padding: "7px 9px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", cursor: "pointer" }} title="Duplicate"><Copy size={13} color="#6B7280" /></button>
                            <button type="button" onClick={() => delSubject(s.id)} style={{ padding: "7px 9px", borderRadius: 8, border: "1px solid #FEE2E2", background: "#FEF2F2", cursor: "pointer" }} title="Delete"><Trash2 size={13} color="#DC2626" /></button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {unlinked.length > 0 && (
                <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E5E7EB", padding: 16 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "#374151", margin: "0 0 10px" }}>📎 Link existing unlinked subjects:</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {unlinked.map((s: any) => (
                      <button key={s.id} onClick={async () => { await supabase.from("subjects").update({ course_id: selCourse?.id } as any).eq("id", s.id); qc.invalidateQueries({ queryKey: ["adm-subjects"] }); qc.invalidateQueries({ queryKey: ["adm-all-subjects"] }); toast({ title: "Subject linked" }); }}
                        style={{ padding: "6px 12px", borderRadius: 20, border: "1.5px solid #E5E7EB", background: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, color: "#374151" }}>
                        <Plus size={11} color={G} />{s.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          );
        })()}

        {/* ═══ CONTENT (Syllabus / Materials / Lessons) ══════ */}
        {view === "content" && selSubject && (
          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            {/* Subject banner */}
            <div style={{ background: "#fff", borderRadius: 16, border: `1px solid ${safeLvl(selSubject.level).border}`, padding: "16px 20px", marginBottom: 20, display: "flex", alignItems: "center", gap: 14 }}>
              {selSubject.image_url && <img src={selSubject.image_url} alt="" style={{ width: 52, height: 52, borderRadius: 12, objectFit: "cover", flexShrink: 0 }} onError={e => { (e.target as any).style.display = "none"; }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 800, fontSize: 15, color: "#111", margin: "0 0 2px" }}>{selSubject.title}</p>
                {selSubject.title_ar && <p style={{ fontWeight: 600, fontSize: 12, color: GOLD, margin: "0 0 3px", direction: "rtl", fontFamily: "'Amiri',serif" }}>{selSubject.title_ar}</p>}
                {selSubject.description && <p style={{ fontSize: 12, color: "#9CA3AF", margin: 0, lineHeight: 1.4 }}>{selSubject.description}</p>}
              </div>
              <span style={{ flexShrink: 0, padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: safeLvl(selSubject.level).bg, color: safeLvl(selSubject.level).text, border: `1px solid ${safeLvl(selSubject.level).border}` }}>
                {safeLvl(selSubject.level).label}
              </span>
            </div>

            {/* ── SYLLABUS ──────────────────────────────────── */}
            {tab === "syllabus" && (
              <div style={{ background: "#fff", borderRadius: 16, padding: 20 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                  <div><h3 style={{ fontWeight: 800, fontSize: 15, color: "#111", margin: "0 0 2px" }}>Weekly Syllabus</h3><p style={{ fontSize: 12, color: "#9CA3AF", margin: 0 }}>Week-by-week course outline</p></div>
                  <button type="button" onClick={() => { setEdSyllabus(null); setShowSyllabus(true); }} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, border: "none", background: G, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}><Plus size={13} /> Add Week</button>
                </div>
                {syllLoad ? <div style={{ textAlign: "center", padding: 40 }}><Loader2 size={24} style={{ animation: "spin .8s linear infinite", color: G }} /></div>
                  : (syllabus as any[]).length === 0 ? <div style={{ textAlign: "center", padding: 48, color: "#9CA3AF" }}><Calendar size={44} style={{ margin: "0 auto 14px", display: "block", opacity: .3 }} /><p style={{ fontWeight: 600, margin: "0 0 4px" }}>No weeks added yet</p><p style={{ fontSize: 13, margin: 0 }}>Build the weekly plan for students</p></div>
                    : <div style={{ position: "relative", paddingLeft: 28 }}>
                      <div style={{ position: "absolute", left: 21, top: 22, bottom: 22, width: 2, background: "linear-gradient(to bottom,#86EFAC,transparent)" }} />
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {(syllabus as any[]).map((s, i) => {
                          const wc = weekPalette[i % weekPalette.length], isEx = expanded.has(s.id), hasD = s.description || (s.objectives && (s.objectives as string[]).length > 0);
                          return (
                            <div key={s.id} style={{ display: "flex", gap: 12 }}>                              <div style={{ position: "relative", zIndex: 10, flexShrink: 0 }}>
                                <div style={{ width: 42, height: 42, borderRadius: "50%", background: wc.badge, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 11 }}>W{s.week_number}</div>
                              </div>
                              <div style={{ flex: 1, borderRadius: 16, border: `1.5px solid ${wc.border}`, background: wc.bg, overflow: "hidden" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 14px" }}>
                                  <div style={{ flex: 1, cursor: hasD ? "pointer" : "default" }} onClick={() => hasD && setExpanded(prev => { const n = new Set(prev); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n; })}>
                                    <p style={{ fontWeight: 700, fontSize: 13, color: wc.badge, margin: 0 }}>{s.title}</p>
                                    {!isEx && s.description && <p style={{ fontSize: 11, color: wc.badge, opacity: .65, margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.description}</p>}
                                  </div>
                                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                                    <button type="button" onClick={() => { setEdSyllabus(s); setShowSyllabus(true); }} style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: `${wc.badge}20`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Edit2 size={12} color={wc.badge} /></button>
                                    <button type="button" onClick={() => delSyllabus(s.id)} style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "#FEF2F2", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Trash2 size={12} color="#DC2626" /></button>
                                    {hasD && <button type="button" onClick={() => setExpanded(prev => { const n = new Set(prev); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n; })} style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: `${wc.badge}20`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{isEx ? <ChevronUp size={13} color={wc.badge} /> : <ChevronDown size={13} color={wc.badge} />}</button>}
                                  </div>
                                </div>
                                {isEx && hasD && (
                                  <div style={{ padding: "12px 14px 14px", borderTop: `1px solid ${wc.border}` }}>
                                    {s.description && <p style={{ fontSize: 13, color: wc.badge, opacity: .85, lineHeight: 1.6, margin: "0 0 10px" }}>{s.description}</p>}
                                    {s.objectives && (s.objectives as string[]).length > 0 && (
                                      <div>
                                        <p style={{ fontSize: 10, fontWeight: 700, color: wc.badge, textTransform: "uppercase", letterSpacing: ".06em", margin: "0 0 8px" }}>Objectives</p>
                                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                          {(s.objectives as string[]).map((obj: string, j: number) => (
                                            <div key={j} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                                              <div style={{ width: 20, height: 20, borderRadius: "50%", background: wc.badge, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 10, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>{j + 1}</div>
                                              <span style={{ fontSize: 13, color: wc.badge, opacity: .9, lineHeight: 1.5 }}>{obj}</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>}
              </div>
            )}

            {/* ── MATERIALS ─────────────────────────────────── */}
            {tab === "materials" && selSubject && (
              <SubjectMaterials
                subjectId={selSubject.id}
                subjectTitle={selSubject.title}
              />
            )}
            {/* ── LESSONS / SESSIONS ────────────────────────── */}
            {tab === "lessons" && (
              <div style={{ background: "#fff", borderRadius: 16, padding: 20 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <div><h3 style={{ fontWeight: 800, fontSize: 15, color: "#111", margin: "0 0 2px" }}>Live Sessions</h3><p style={{ fontSize: 12, color: "#9CA3AF", margin: 0 }}>What students will learn in each session</p></div>
                  <button type="button" onClick={() => { setEdLesson(null); setShowLesson(true); }} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, border: "none", background: G, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}><Plus size={13} /> Add Session</button>
                </div>
                <div style={{ padding: "10px 14px", borderRadius: 12, background: "#F0FDF4", border: "1px solid #86EFAC", fontSize: 12, color: "#166534", marginBottom: 16, display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 16 }}>ℹ️</span>
                  <span>All lessons are delivered as live virtual sessions. Each entry below describes what students will learn in that session.</span>
                </div>
                {lLoad ? <div style={{ textAlign: "center", padding: 40 }}><Loader2 size={24} style={{ animation: "spin .8s linear infinite", color: G }} /></div>
                  : (lessons as any[]).length === 0 ? <div style={{ textAlign: "center", padding: 48, color: "#9CA3AF" }}><BookOpen size={44} style={{ margin: "0 auto 14px", display: "block", opacity: .3 }} /><p style={{ fontWeight: 600, margin: "0 0 4px" }}>No sessions yet</p><p style={{ fontSize: 13, margin: 0 }}>Describe what each live session will cover</p></div>
                    : <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {(lessons as any[]).map((l: any, i: number) => (
                        <div key={l.id} style={{ background: "#F9FAFB", borderRadius: 14, border: "1px solid #E5E7EB", padding: "14px 16px", display: "flex", gap: 12 }}>
                          <div style={{ width: 34, height: 34, borderRadius: 10, background: "#F0FDF4", border: "1.5px solid #86EFAC", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: G, flexShrink: 0, marginTop: 1 }}>{i + 1}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontWeight: 700, fontSize: 13, color: "#111", margin: "0 0 2px" }}>{l.title}</p>
                            {l.title_ar && <p style={{ fontSize: 11, color: GOLD, margin: "0 0 4px", direction: "rtl", fontFamily: "'Amiri',serif" }}>{l.title_ar}</p>}
                            {l.content && (
                              <div style={{ marginTop: 6, padding: "8px 10px", borderRadius: 10, background: "#fff", border: "1px solid #E5E7EB" }}>
                                {l.content.split("\n").filter(Boolean).map((line: string, j: number) => (
                                  <p key={j} style={{ fontSize: 12, color: "#374151", margin: "2px 0", display: "flex", alignItems: "flex-start", gap: 6 }}>
                                    <span style={{ color: G, fontWeight: 700, flexShrink: 0 }}>•</span>{line.replace(/^•\s*/, "")}
                                  </p>
                                ))}
                              </div>
                            )}
                            <div style={{ display: "flex", gap: 8, fontSize: 11, color: "#9CA3AF", marginTop: 6, flexWrap: "wrap" }}>
                              {l.duration_minutes > 0 && <span>⏱ {l.duration_minutes} min</span>}
                              {l.is_free && <span style={{ color: "#16a34a", fontWeight: 700 }}>FREE</span>}
                            </div>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 5, flexShrink: 0 }}>
                            <button type="button" onClick={() => { setEdLesson(l); setShowLesson(true); }} style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Edit2 size={12} color={G} /></button>
                            <button type="button" onClick={() => delLesson(l.id)} style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid #FEE2E2", background: "#FEF2F2", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Trash2 size={12} color="#DC2626" /></button>
                          </div>
                        </div>
                      ))}
                    </div>}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {showCourse && <CourseModal ed={edCourse} onClose={() => { setShowCourse(false); setEdCourse(null); }} onSave={saveCourse} busy={busy} privateStudents={privateStudents} />}
      {showSubject && <SubjectModal ed={edSubject} teachers={teachers as any[]} onClose={() => { setShowSubject(false); setEdSubject(null); }} onSave={saveSubject} busy={busy} privateStudents={privateStudents} />}      {showLesson && <LessonModal ed={edLesson} onClose={() => { setShowLesson(false); setEdLesson(null); }} onSave={saveLesson} busy={busy} />}
      {showSyllabus && <SyllabusModal ed={edSyllabus} nextWeek={(syllabus as any[]).length + 1} onClose={() => { setShowSyllabus(false); setEdSyllabus(null); }} onSave={saveSyllabus} busy={busy} />}
      {showMaterial && selSubject && <MaterialModal ed={edMaterial} subjectId={selSubject.id} sortOrder={(materials as any[]).length} onClose={() => { setShowMaterial(false); setEdMaterial(null); }} onSaved={() => { setShowMaterial(false); setEdMaterial(null); qc.invalidateQueries({ queryKey: ["adm-materials", selSubject.id] }); }} />}
    </div>
  );
}