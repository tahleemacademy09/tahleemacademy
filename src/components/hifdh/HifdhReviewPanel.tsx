// src/components/hifdh/HifdhReviewPanel.tsx
// Only inside a Hifdh weekly-review live room (room name "hifdh-review-<ustadhId>") and only for the ustadh/admin.
// Lists the ustadh's review students (and anyone who has joined); tapping a student shows everything they have
// memorized in the current round of 5 pages, one swipeable page at a time.

import { useEffect, useMemo, useRef, useState } from "react";
import { useParticipants } from "@livekit/components-react";
import { supabase } from "@/integrations/supabase/client";
import MushafPageView from "@/components/hifdh/MushafPageView";
import { hpReviewRange, hpPagesOf, hpPortionLabel, hpSegmentFor, hpUnitsLabel } from "@/lib/hifdhPortion";
import { BookOpen, X, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

const db = supabase as any;
const G = "#064E3B", GOLD = "#C9A84C", INK = "#1a1a2e", MUTED = "#6b7a72", LINE = "#e3e9e5", OK = "#16A34A", AMBER = "#D97706", RED = "#DC2626";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const monday = () => { const x = new Date(); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return iso(x); };

export const isHifdhReviewRoom = (subject: any) =>
  typeof subject?.livekit_room_name === "string" && subject.livekit_room_name.startsWith("hifdh-review-");

interface Row { id: string; name: string; present: boolean }

export default function HifdhReviewPanel({ subject }: { subject: any }) {
  const participants = useParticipants();
  const ustadhId = String(subject.livekit_room_name).replace("hifdh-review-", "");
  const [open, setOpen] = useState(false);
  const [assigned, setAssigned] = useState<{ id: string; name: string }[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [passed, setPassed] = useState<Record<string, any[]>>({});
  const [loadingSel, setLoadingSel] = useState(false);
  const [idx, setIdx] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const [grades, setGrades] = useState<Record<string, { grade: string; excused: boolean; notes: string | null } | null>>({});
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // the ustadh's review students for this week
  useEffect(() => {
    let live = true;
    (async () => {
      const { data: ra } = await db.from("hifdh_review_assignments").select("student_id").eq("ustadh_id", ustadhId).eq("week_start", monday());
      const ids: string[] = (ra || []).map((r: any) => r.student_id);
      if (!ids.length) { if (live) setAssigned([]); return; }
      const { data: pf } = await db.from("profiles").select("user_id,full_name").in("user_id", ids);
      const nm: Record<string, string> = {};
      (pf || []).forEach((p: any) => (nm[p.user_id] = p.full_name || "Student"));
      if (live) setAssigned(ids.map((id) => ({ id, name: nm[id] || "Student" })));
    })();
    return () => { live = false; };
  }, [ustadhId]);

  // people currently in the room (students only)
  const present = useMemo(() => {
    const out: Record<string, string> = {};
    participants.forEach((p) => {
      if (p.identity.includes("::screen") || p.identity === ustadhId || p.isLocal) return;
      let role = "";
      try { role = JSON.parse(p.metadata || "{}").role || ""; } catch { /* ignore */ }
      if (role && role !== "student") return;
      out[p.identity] = p.name || "Student";
    });
    return out;
  }, [participants, ustadhId]);

  const rows: Row[] = useMemo(() => {
    const map = new Map<string, Row>();
    assigned.forEach((a) => map.set(a.id, { id: a.id, name: a.name, present: a.id in present }));
    Object.entries(present).forEach(([id, name]) => { if (!map.has(id)) map.set(id, { id, name, present: true }); });
    return Array.from(map.values()).sort((a, b) => Number(b.present) - Number(a.present) || a.name.localeCompare(b.name));
  }, [assigned, present]);

  // load a student's memorized portions when tapped
  useEffect(() => {
    if (!sel || passed[sel]) return;
    setLoadingSel(true);
    db.from("hifdh_memorization_tasks").select("page_from,page_to,half_from,half_to").eq("student_id", sel).eq("status", "passed")
      .then(({ data }: any) => { setPassed((p) => ({ ...p, [sel]: data || [] })); setLoadingSel(false); });
  }, [sel, passed]);

  useEffect(() => {
    if (!sel) return;
    setErr("");
    db.from("hifdh_weekly_reviews").select("grade,excused,notes").eq("student_id", sel).eq("week_start", monday()).maybeSingle()
      .then(({ data }: any) => { setGrades((g) => ({ ...g, [sel]: data || null })); setNote(data?.notes || ""); });
  }, [sel]);

  const grade = async (g: "pass" | "repeat") => {
    if (!sel) return;
    setSaving(true); setErr("");
    const { error } = await db.rpc("hifdh_grade_week", { p_student: sel, p_week: monday(), p_grade: g, p_excused: false, p_notes: note.trim() || null });
    setSaving(false);
    if (error) return setErr(error.message || "Couldn't save the grade");
    setGrades((x) => ({ ...x, [sel]: { grade: g, excused: false, notes: note.trim() || null } }));
  };
  const cur = sel ? grades[sel] : null;
  const curGrade = cur ? (cur.excused ? "excused" : cur.grade) : null;

  const range = sel && passed[sel] ? hpReviewRange(passed[sel]) : null;
  const pages = useMemo(() => (range ? hpPagesOf(range) : []), [range]);
  useEffect(() => { setIdx(0); if (scroller.current) scroller.current.scrollTo({ left: 0 }); }, [sel, pages.length]);

  const go = (d: number) => {
    const el = scroller.current; if (!el) return;
    const n = Math.min(pages.length - 1, Math.max(0, idx + d));
    el.scrollTo({ left: n * el.clientWidth, behavior: "smooth" });
  };
  const selRow = rows.find((r) => r.id === sel);

  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Student memorization" style={{
        position: "fixed", right: 12, top: "calc(env(safe-area-inset-top, 0px) + 70px)", zIndex: 5000,
        display: "flex", alignItems: "center", gap: 6, padding: "9px 13px", borderRadius: 99, border: `1px solid ${GOLD}`,
        background: G, color: "#fff", fontWeight: 800, fontSize: 12, cursor: "pointer", boxShadow: "0 4px 14px rgba(0,0,0,.3)",
      }}><BookOpen size={15} color={GOLD} /> Memorization</button>

      {open && (
        <div style={{ position: "fixed", inset: 0, zIndex: 5001, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "flex-end" }} onClick={() => setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{
            width: "100%", maxWidth: 640, margin: "0 auto", height: "88dvh", background: "#f6f8f6", borderRadius: "20px 20px 0 0",
            display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "system-ui, sans-serif", color: INK,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px", background: "#fff", borderBottom: `1px solid ${LINE}` }}>
              {sel && <button onClick={() => setSel(null)} aria-label="Back" style={{ border: "none", background: "none", cursor: "pointer", padding: 4 }}><ChevronLeft size={20} /></button>}
              <div style={{ flex: 1, fontWeight: 800, fontSize: 15 }}>{sel ? selRow?.name || "Student" : "Students · memorization"}</div>
              {sel && curGrade && (
                <span style={{ fontSize: 11, fontWeight: 800, padding: "3px 9px", borderRadius: 99,
                  background: (curGrade === "pass" ? OK : curGrade === "repeat" ? AMBER : curGrade === "fail" ? RED : MUTED) + "1a",
                  color: curGrade === "pass" ? OK : curGrade === "repeat" ? AMBER : curGrade === "fail" ? RED : MUTED }}>
                  {curGrade === "pass" ? "Passed" : curGrade === "repeat" ? "Repeat" : curGrade === "fail" ? "Failed" : "Excused"}
                </span>
              )}
              <button onClick={() => setOpen(false)} aria-label="Close" style={{ border: "none", background: "none", cursor: "pointer", padding: 4 }}><X size={20} /></button>
            </div>

            {!sel && (
              <div style={{ overflowY: "auto", padding: 12, display: "grid", gap: 8, alignContent: "start" }}>
                {rows.length === 0 && <div style={{ color: MUTED, fontSize: 13, padding: 8 }}>No students assigned to this room this week yet.</div>}
                {rows.map((r) => (
                  <button key={r.id} onClick={() => setSel(r.id)} style={{
                    display: "flex", alignItems: "center", gap: 10, textAlign: "left", background: "#fff", border: `1px solid ${LINE}`,
                    borderRadius: 14, padding: "12px 14px", cursor: "pointer", fontSize: 14, fontWeight: 700, color: INK,
                  }}>
                    <span style={{ width: 9, height: 9, borderRadius: "50%", background: r.present ? OK : "#cbd5d0", flexShrink: 0 }} />
                    <span style={{ flex: 1 }}>{r.name}</span>
                    <span style={{ fontSize: 11, color: r.present ? OK : MUTED, fontWeight: 700 }}>{r.present ? "In room" : "Not joined"}</span>
                    <ChevronRight size={16} color={MUTED} />
                  </button>
                ))}
              </div>
            )}

            {sel && (
              <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                {loadingSel || !passed[sel] ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><Loader2 className="animate-spin" color={GOLD} /></div>
                ) : !range ? (
                  <div style={{ padding: 20, color: MUTED, fontSize: 14 }}>This student has no memorized portions yet.</div>
                ) : (
                  <>
                    <div style={{ padding: "10px 14px", background: "#fff", borderBottom: `1px solid ${LINE}` }}>
                      <div style={{ fontWeight: 800, fontSize: 14 }}>{hpPortionLabel(range)}</div>
                      <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>Round {range.round} · {hpUnitsLabel(range.units)} of 5 pages memorized</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "8px 0" }}>
                      <button onClick={() => go(-1)} disabled={idx === 0} aria-label="Previous page" style={{ border: "none", background: "none", opacity: idx === 0 ? 0.3 : 1, cursor: "pointer" }}><ChevronLeft size={20} /></button>
                      <div style={{ display: "flex", gap: 6 }}>
                        {pages.map((p, i) => (
                          <span key={p} style={{ width: i === idx ? 18 : 8, height: 8, borderRadius: 99, background: i === idx ? GOLD : "#cfd6d2", transition: "width .2s" }} />
                        ))}
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: MUTED }}>Page {pages[idx]} · {idx + 1}/{pages.length}</span>
                      <button onClick={() => go(1)} disabled={idx >= pages.length - 1} aria-label="Next page" style={{ border: "none", background: "none", opacity: idx >= pages.length - 1 ? 0.3 : 1, cursor: "pointer" }}><ChevronRight size={20} /></button>
                    </div>
                    {/* swipe left / right between the memorized pages */}
                    <div ref={scroller} dir="ltr"
                      onScroll={(e) => { const el = e.currentTarget; setIdx(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))); }}
                      style={{ flex: 1, minHeight: 0, display: "flex", overflowX: "auto", scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch" }}>
                      {pages.map((p, i) => {
                        const [a, b] = hpSegmentFor(p, range);
                        const partial = !(a === 0 && b === 1);
                        return (
                          <div key={p} style={{ flex: "0 0 100%", scrollSnapAlign: "start", overflowY: "auto", padding: "0 8px 16px", boxSizing: "border-box" }}>
                            {partial && (
                              <div style={{ margin: "0 0 8px", padding: "6px 10px", borderRadius: 10, background: "#fbf3da", border: `1px solid ${GOLD}88`, color: "#78350F", fontSize: 12, fontWeight: 700 }}>
                                Memorized: the {a === 0 ? "top" : "bottom"} half of this page
                              </div>
                            )}
                            {Math.abs(i - idx) <= 1 ? <MushafPageView page={p} fontSize={26} /> : <div style={{ minHeight: 400 }} />}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
                <div style={{ background: "#fff", borderTop: `1px solid ${LINE}`, padding: 12, paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))", display: "grid", gap: 8 }}>
                  <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the student (optional)"
                    style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${LINE}`, borderRadius: 10, padding: "9px 10px", fontSize: 13 }} />
                  {err && <div style={{ fontSize: 12, color: RED }}>{err}</div>}
                  <div style={{ display: "flex", gap: 8 }}>
                    {([["pass", "Pass", OK], ["repeat", "Repeat", AMBER]] as const).map(([v, label, color]) => (
                      <button key={v} disabled={saving} onClick={() => grade(v)} style={{
                        flex: 1, padding: "12px 4px", borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: saving ? "default" : "pointer",
                        border: `1.5px solid ${color}`, background: curGrade === v ? color : "#fff", color: curGrade === v ? "#fff" : color, opacity: saving ? 0.6 : 1,
                      }}>{label}</button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
