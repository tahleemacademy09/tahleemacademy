// src/pages/admin/HifdhProgramAdmin.tsx
// Admin control room for the Hifdh Program: Students · Groups · Fines · Settings.
// Uses the hifdh_program / hifdh_read_groups / hifdh_fines / hifdh_settings / hifdh_levels tables.
// (supabase is cast to `any` until types.ts is regenerated from the live schema.)

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useHifdhSettings, DEFAULT_HIFDH_SETTINGS, HifdhSettings } from "@/hooks/useHifdhSettings";
import { Loader2, Users, Layers, Wallet, Settings as Cog, Plus, Trash2, RotateCcw, ChevronLeft, ChevronRight, Send } from "lucide-react";

const hpDb = supabase as any;

const HP_GREEN = "#064E3B";
const HP_GOLD = "#C9A84C";
const HP_INK = "#1a1a2e";
const HP_MUTED = "#6b7a72";
const HP_LINE = "#e3e9e5";
const HP_BG = "#f6f8f6";
const HP_RED = "#DC2626";
const HP_OK = "#16A34A";
const HP_AMBER = "#D97706";

const HP_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]; // ISO 1..7

type HpTab = "students" | "groups" | "fines" | "settings";

const hpIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hpMonday = (d = new Date()) => {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return hpIso(x);
};
const hpShift = (iso: string, weeks: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  return hpMonday(new Date(y, m - 1, d + 7 * weeks));
};
const hpPretty = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

/* ───────── tiny UI helpers ───────── */
const HpCard = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <div style={{ background: "#fff", border: `1px solid ${HP_LINE}`, borderRadius: 14, padding: 14, ...style }}>{children}</div>
);
const HpPill = ({ text, color }: { text: string; color: string }) => (
  <span style={{ background: color + "1a", color, fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 99 }}>{text}</span>
);
const HpBtn = ({ children, onClick, kind = "primary", disabled, small }: {
  children: React.ReactNode; onClick?: () => void; kind?: "primary" | "ghost" | "danger"; disabled?: boolean; small?: boolean;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      display: "inline-flex", alignItems: "center", gap: 6, cursor: disabled ? "default" : "pointer",
      opacity: disabled ? 0.5 : 1, border: kind === "ghost" ? `1px solid ${HP_LINE}` : "none", borderRadius: 10,
      padding: small ? "6px 10px" : "10px 14px", fontSize: small ? 12 : 13, fontWeight: 700,
      background: kind === "primary" ? HP_GREEN : kind === "danger" ? HP_RED : "#fff",
      color: kind === "ghost" ? HP_INK : "#fff",
    }}
  >
    {children}
  </button>
);
const HpInput = (p: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input {...p} style={{ border: `1px solid ${HP_LINE}`, borderRadius: 10, padding: "8px 10px", fontSize: 13, width: "100%", boxSizing: "border-box", ...(p.style || {}) }} />
);
const HpSelect = (p: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...p} style={{ border: `1px solid ${HP_LINE}`, borderRadius: 10, padding: "8px 10px", fontSize: 13, background: "#fff", maxWidth: "100%", ...(p.style || {}) }} />
);

const HpToggle = ({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 0" }}>
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: HP_INK }}>{label}</div>
      {hint && <div style={{ fontSize: 11, color: HP_MUTED, marginTop: 2 }}>{hint}</div>}
    </div>
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      style={{ flexShrink: 0, width: 44, height: 26, borderRadius: 99, border: "none", cursor: "pointer", position: "relative", background: on ? HP_GREEN : "#cbd5d0", transition: "background .15s" }}>
      <span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .15s", boxShadow: "0 1px 2px rgba(0,0,0,.25)" }} />
    </button>
  </div>
);
const HpSection = ({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) => (
  <HpCard>
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: hint ? 2 : 8 }}>
      <span style={{ width: 24, height: 24, borderRadius: "50%", background: HP_GREEN, color: "#fff", fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{n}</span>
      <div style={{ fontWeight: 800, color: HP_INK, fontSize: 14 }}>{title}</div>
    </div>
    {hint && <div style={{ fontSize: 11, color: HP_MUTED, margin: "0 0 8px 34px" }}>{hint}</div>}
    {children}
  </HpCard>
);
const HpRow = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "9px 0", borderTop: `1px solid ${HP_LINE}` }}>
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: HP_INK }}>{label}</div>
      {hint && <div style={{ fontSize: 11, color: HP_MUTED, marginTop: 2 }}>{hint}</div>}
    </div>
    <div style={{ flexShrink: 0 }}>{children}</div>
  </div>
);

export default function HifdhProgramAdmin() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { settings: acadSettings, loading: acadLoading, save: saveAcad } = useHifdhSettings();
  const [hd, setHd] = useState<HifdhSettings>(DEFAULT_HIFDH_SETTINGS);
  useEffect(() => { if (!acadLoading) setHd(acadSettings); }, [acadLoading, acadSettings]);
  const [tab, setTab] = useState<HpTab>("students");
  const [week, setWeek] = useState(hpMonday());
  const [term, setTerm] = useState(() => localStorage.getItem("hifdh_term") || `${new Date().getFullYear()}-T1`);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [names, setNames] = useState<Record<string, string>>({});
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [teachers, setTeachers] = useState<{ id: string; name: string }[]>([]);
  const [program, setProgram] = useState<any[]>([]);
  const [levels, setLevels] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<{ id: string; title: string }[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [groups, setGroups] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [fines, setFines] = useState<any[]>([]);
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  const nameOf = useCallback((id: string) => names[id] || "Student", [names]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const { data: roles } = await hpDb.from("user_roles").select("user_id,role").in("role", ["student", "teacher"]);
    const ids = Array.from(new Set<string>((roles || []).map((r: any) => r.user_id)));
    const { data: profs } = ids.length
      ? await hpDb.from("profiles").select("user_id,full_name").in("user_id", ids)
      : { data: [] };
    const map: Record<string, string> = {};
    (profs || []).forEach((p: any) => (map[p.user_id] = p.full_name || "Unnamed"));
    setNames(map);
    setStudentIds((roles || []).filter((r: any) => r.role === "student").map((r: any) => r.user_id));
    setTeachers((roles || []).filter((r: any) => r.role === "teacher").map((r: any) => ({ id: r.user_id, name: map[r.user_id] || "Ustadh" })));

    const sj = await hpDb.from("subjects").select("id,title").order("title");
    setSubjects(sj.data || []);
    const [pg, lv, st, gr, mm, fn] = await Promise.all([
      hpDb.from("hifdh_program").select("*").eq("term", term).order("current_page"),
      hpDb.from("hifdh_levels").select("*").order("sort_order"),
      hpDb.from("hifdh_settings").select("*").eq("id", true).maybeSingle(),
      hpDb.from("hifdh_read_groups").select("*").eq("week_start", week).order("name"),
      hpDb.from("hifdh_read_group_members").select("*").eq("week_start", week),
      hpDb.from("hifdh_fines").select("*").order("created_at", { ascending: false }).limit(200),
    ]);
    setProgram(pg.data || []);
    setLevels(lv.data || []);
    setSettings(st.data || null);
    setGroups(gr.data || []);
    setMembers(mm.data || []);
    setFines(fn.data || []);
    setLoading(false);
  }, [term, week]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { localStorage.setItem("hifdh_term", term); }, [term]);

  const run = async (fn: () => Promise<any>, okMsg?: string) => {
    setBusy(true);
    try {
      const res = await fn();
      if (res?.error) throw res.error;
      if (okMsg) toast({ title: okMsg });
      await loadAll();
      return res;
    } catch (e: any) {
      toast({ title: "Something went wrong", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const enrolled = useMemo(() => new Set(program.map((p) => p.student_id)), [program]);
  const notEnrolled = useMemo(
    () => studentIds.filter((id) => !enrolled.has(id)).sort((a, b) => nameOf(a).localeCompare(nameOf(b))),
    [studentIds, enrolled, nameOf],
  );
  const suspended = program.filter((p) => p.status === "suspended");

  /* ───────── Students ───────── */
  const enroll = () =>
    run(async () => {
      const rows = picked.map((id) => ({ student_id: id, term }));
      const r = await hpDb.from("hifdh_program").insert(rows);
      if (!r.error) { setPicked([]); setPicking(false); }
      return r;
    }, `${picked.length} student(s) enrolled`);

  const patchProgram = (id: string, patch: any) => run(() => hpDb.from("hifdh_program").update(patch).eq("id", id));

  const StudentsTab = (
    <div style={{ display: "grid", gap: 10 }}>
      <HpCard>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontSize: 12, color: HP_MUTED, fontWeight: 700 }}>Term</div>
          <HpInput value={term} onChange={(e) => setTerm(e.target.value)} style={{ width: 130 }} />
          <div style={{ flex: 1 }} />
          <HpBtn onClick={() => setPicking(!picking)}><Plus size={14} /> Enroll students</HpBtn>
        </div>
        {picking && (
          <div style={{ marginTop: 12 }}>
            {notEnrolled.length === 0 ? (
              <div style={{ fontSize: 13, color: HP_MUTED }}>Every student is already enrolled for this term.</div>
            ) : (
              <>
                <div style={{ maxHeight: 220, overflowY: "auto", border: `1px solid ${HP_LINE}`, borderRadius: 10 }}>
                  {notEnrolled.map((id) => (
                    <label key={id} style={{ display: "flex", gap: 10, padding: "9px 12px", borderBottom: `1px solid ${HP_LINE}`, fontSize: 13 }}>
                      <input type="checkbox" checked={picked.includes(id)}
                        onChange={() => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))} />
                      {nameOf(id)}
                    </label>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <HpBtn small kind="ghost" onClick={() => setPicked(notEnrolled)}>Select all</HpBtn>
                  <HpBtn small disabled={!picked.length || busy} onClick={enroll}>Enroll {picked.length || ""}</HpBtn>
                </div>
              </>
            )}
          </div>
        )}
      </HpCard>

      {program.length === 0 && <HpCard><div style={{ color: HP_MUTED, fontSize: 13 }}>No students enrolled for {term} yet.</div></HpCard>}

      {program.map((p) => (
        <HpCard key={p.id}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <div style={{ fontWeight: 700, color: HP_INK, fontSize: 14 }}>{nameOf(p.student_id)}</div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {p.miss_streak > 0 && <HpPill text={`${p.miss_streak} miss${p.miss_streak > 1 ? "es" : ""}`} color={HP_AMBER} />}
              <HpPill text={p.status} color={p.status === "active" ? HP_OK : p.status === "suspended" ? HP_RED : HP_MUTED} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
            <div>
              <div style={{ fontSize: 11, color: HP_MUTED, marginBottom: 3 }}>Hifdh level</div>
              <HpSelect style={{ width: "100%" }} value={p.level_id || ""} onChange={(e) => patchProgram(p.id, { level_id: e.target.value || null })}>
                <option value="">— not set —</option>
                {levels.filter((l) => l.is_active).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </HpSelect>
            </div>
            <div>
              <div style={{ fontSize: 11, color: HP_MUTED, marginBottom: 3 }}>Current page (1–604)</div>
              <HpInput type="number" min={1} max={604} defaultValue={p.current_page}
                onBlur={(e) => {
                  const v = Math.min(604, Math.max(1, Number(e.target.value) || 1));
                  if (v !== p.current_page) patchProgram(p.id, { current_page: v });
                }} />
            </div>
          </div>
        </HpCard>
      ))}
    </div>
  );

  /* ───────── Weekly portions → student home ───────── */
  // The student's "This Week's Memorization" card reads hifdh_memorization_tasks
  // for the current week. Rows are created here (or by the ustadh when marking a
  // read-along), so this fills in a portion per session for every active student.
  const insertPortions = async () => {
    const memDays: number[] = settings?.memorization_days || [];
    const slots = Math.min(2, Math.max(1, memDays.length || 2));
    const active = program.filter((p) => p.status === "active");
    if (active.length === 0) { toast({ title: "No active students enrolled", variant: "destructive" }); return null; }
    const rows: any[] = [];
    active.forEach((p) => {
      const daily = Number(levels.find((l) => l.id === p.level_id)?.daily_pages ?? 0.5);
      const n = Math.max(1, Math.ceil((daily * 7) / slots));
      for (let s = 1; s <= slots; s++) {
        const from = Math.min(604, (p.current_page || 1) + (s - 1) * n);
        rows.push({ student_id: p.student_id, week_start: week, slot: s, page_from: from, page_to: Math.min(604, from + n - 1), status: "pending" });
      }
    });
    const r = await hpDb.from("hifdh_memorization_tasks").upsert(rows, { onConflict: "student_id,week_start,slot", ignoreDuplicates: true });
    if (!r.error) toast({ title: `Portions published for ${active.length} student(s)`, description: "Existing portions were left as they were." });
    return r;
  };
  const publishPortions = () => run(insertPortions);

  /* ───────── Groups ───────── */
  const membersOf = (gid: string) => members.filter((m) => m.group_id === gid);

  const GroupsTab = (
    <div style={{ display: "grid", gap: 10 }}>
      <HpCard>
        <div style={{ fontSize: 13, color: HP_MUTED, marginBottom: 10 }}>
          Students who are close in their hifdh are grouped automatically. You can move anyone or change a group's ustadh.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <HpBtn disabled={busy} onClick={() => run(async () => {
            const r = await hpDb.rpc("hifdh_build_read_groups", { p_week_start: week });
            if (!r.error) {
              toast({ title: r.data ? `${r.data} group(s) created` : "Everyone is already in a group" });
              if (hd.auto_assign_portions) await insertPortions();
            }
            return r;
          })}>
            <Layers size={14} /> Auto-group this week
          </HpBtn>
          <HpBtn kind="ghost" disabled={busy} onClick={publishPortions}>
            <Send size={14} /> Publish portions to students
          </HpBtn>
        </div>
        <div style={{ fontSize: 11, color: HP_MUTED, marginTop: 8 }}>
          Publishing puts each active student's pages for the week on their Hifdh home. Portions the ustadh already set are never overwritten.
        </div>
      </HpCard>

      {groups.length === 0 && <HpCard><div style={{ color: HP_MUTED, fontSize: 13 }}>No groups for this week yet.</div></HpCard>}

      {groups.map((g) => {
        const ms = membersOf(g.id);
        const pages = ms.map((m) => program.find((p) => p.student_id === m.student_id)?.current_page).filter(Boolean) as number[];
        return (
          <HpCard key={g.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 800, color: HP_GREEN }}>{g.name}</div>
              <div style={{ fontSize: 12, color: HP_MUTED }}>
                {ms.length} student{ms.length === 1 ? "" : "s"}{pages.length ? ` · pages ${Math.min(...pages)}–${Math.max(...pages)}` : ""}
              </div>
            </div>
            <div style={{ margin: "10px 0 6px", fontSize: 11, color: HP_MUTED }}>Ustadh</div>
            <HpSelect style={{ width: "100%" }} value={g.ustadh_id || ""}
              onChange={(e) => run(() => hpDb.from("hifdh_read_groups").update({ ustadh_id: e.target.value || null }).eq("id", g.id))}>
              <option value="">— unassigned —</option>
              {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </HpSelect>
            <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
              {ms.map((m) => (
                <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: 13 }}>
                  <span>{nameOf(m.student_id)}</span>
                  <HpSelect value={g.id} style={{ fontSize: 12, padding: "5px 8px" }}
                    onChange={(e) => run(() => hpDb.from("hifdh_read_group_members").update({ group_id: e.target.value }).eq("id", m.id))}>
                    {groups.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </HpSelect>
                </div>
              ))}
            </div>
            {ms.length === 0 && (
              <div style={{ marginTop: 10 }}>
                <HpBtn small kind="ghost" onClick={() => run(() => hpDb.from("hifdh_read_groups").delete().eq("id", g.id))}>
                  <Trash2 size={12} /> Delete empty group
                </HpBtn>
              </div>
            )}
          </HpCard>
        );
      })}
    </div>
  );

  /* ───────── Fines & suspensions ───────── */
  const closeWeek = () => {
    if (!window.confirm(`Close the week of ${hpPretty(week)}? Fines and suspensions will be applied now.`)) return;
    run(async () => {
      const r = await hpDb.rpc("hifdh_close_week", { p_week_start: week });
      if (!r.error) {
        const rows: any[] = r.data || [];
        const c = (o: string) => rows.filter((x) => x.outcome === o).length;
        toast({ title: "Week closed", description: `${c("pass")} passed · ${c("missed")} fined · ${c("suspended")} suspended · ${c("awaiting_review")} awaiting review` });
      }
      return r;
    });
  };

  const FinesTab = (
    <div style={{ display: "grid", gap: 10 }}>
      <HpCard>
        <div style={{ fontSize: 13, color: HP_MUTED, marginBottom: 10 }}>
          After the ustadhs have graded the week (Fri–Sun), close it. Misses become fines and streaks update.
        </div>
        <HpBtn kind="danger" disabled={busy} onClick={closeWeek}>Close week of {hpPretty(week)}</HpBtn>
      </HpCard>

      {suspended.length > 0 && (
        <HpCard>
          <div style={{ fontWeight: 800, color: HP_RED, marginBottom: 8 }}>Suspended from Hifdh</div>
          {suspended.map((p) => (
            <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", fontSize: 13 }}>
              <span>{nameOf(p.student_id)}</span>
              <HpBtn small kind="ghost" disabled={busy} onClick={() => run(() => hpDb.rpc("hifdh_reinstate", { p_student: p.student_id }), "Reinstated")}>
                <RotateCcw size={12} /> Reinstate
              </HpBtn>
            </div>
          ))}
        </HpCard>
      )}

      <HpCard>
        <div style={{ fontWeight: 800, color: HP_INK, marginBottom: 8 }}>Fines</div>
        {fines.length === 0 && <div style={{ fontSize: 13, color: HP_MUTED }}>No fines yet.</div>}
        {fines.map((f) => (
          <div key={f.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "8px 0", borderTop: `1px solid ${HP_LINE}`, fontSize: 13 }}>
            <div>
              <div style={{ fontWeight: 600 }}>{nameOf(f.student_id)}</div>
              <div style={{ fontSize: 11, color: HP_MUTED }}>Week of {hpPretty(f.week_start)} · {Number(f.amount).toLocaleString()} {f.currency}</div>
            </div>
            {f.status === "unpaid" ? (
              <div style={{ display: "flex", gap: 6 }}>
                <HpBtn small disabled={busy} onClick={() => run(() => hpDb.from("hifdh_fines").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", f.id))}>Paid</HpBtn>
                <HpBtn small kind="ghost" disabled={busy} onClick={() => run(() => hpDb.from("hifdh_fines").update({ status: "waived" }).eq("id", f.id))}>Waive</HpBtn>
              </div>
            ) : (
              <HpPill text={f.status} color={f.status === "paid" ? HP_OK : HP_MUTED} />
            )}
          </div>
        ))}
      </HpCard>
    </div>
  );

  /* ───────── Settings & levels ───────── */
  const setS = (patch: any) => setSettings((s: any) => ({ ...s, ...patch }));
  const setH = (patch: Partial<HifdhSettings>) => setHd((h) => ({ ...h, ...patch }));
  const toggleDay = (key: "memorization_days" | "review_days", d: number) => {
    const cur: number[] = settings[key] || [];
    setS({ [key]: cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort() });
  };
  const saveSettings = () =>
    run(async () => {
      const r = await hpDb.from("hifdh_settings").update({
        memorization_days: settings.memorization_days, review_days: settings.review_days,
        fine_amount: Number(settings.fine_amount) || 0, streak_limit: Number(settings.streak_limit) || 3,
        revision_mode: settings.revision_mode, group_max_size: Number(settings.group_max_size) || 6,
        readalong_subject_id: settings.readalong_subject_id || null,
        updated_at: new Date().toISOString(),
      }).eq("id", true);
      if (r.error) return r;
      await saveAcad({
        auto_assign_portions: hd.auto_assign_portions,
        proctoring_enabled: hd.proctoring_enabled,
        violation_limit: Number(hd.violation_limit) || 5,
        pass_mark: Math.min(100, Math.max(0, Number(hd.pass_mark) || 0)),
      }, user?.id);
      return r;
    }, "Settings saved");

  const DayChips = ({ k }: { k: "memorization_days" | "review_days" }) => (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {HP_DAYS.map((d, i) => {
        const on = (settings[k] || []).includes(i + 1);
        return (
          <button key={d} onClick={() => toggleDay(k, i + 1)} style={{
            border: `1px solid ${on ? HP_GREEN : HP_LINE}`, background: on ? HP_GREEN : "#fff", color: on ? "#fff" : HP_INK,
            borderRadius: 99, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}>{d}</button>
        );
      })}
    </div>
  );

  const Seg = ({ value, options, onChange }: { value: string; options: { v: string; l: string }[]; onChange: (v: string) => void }) => (
    <div style={{ display: "inline-flex", background: HP_BG, border: `1px solid ${HP_LINE}`, borderRadius: 10, padding: 3 }}>
      {options.map((o) => (
        <button key={o.v} onClick={() => onChange(o.v)} style={{
          border: "none", cursor: "pointer", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700,
          background: value === o.v ? HP_GREEN : "transparent", color: value === o.v ? "#fff" : HP_MUTED,
        }}>{o.l}</button>
      ))}
    </div>
  );
  const Num = ({ value, onChange, suffix }: { value: any; onChange: (v: string) => void; suffix?: string }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <HpInput type="number" value={value} onChange={(e) => onChange(e.target.value)} style={{ width: 84, textAlign: "center" }} />
      {suffix && <span style={{ fontSize: 12, color: HP_MUTED }}>{suffix}</span>}
    </div>
  );

  const SettingsTab = settings ? (
    <div style={{ display: "grid", gap: 10 }}>
      <HpSection n={1} title="Weekly schedule" hint="Which days the programme runs each week.">
        <div style={{ fontSize: 12, fontWeight: 700, color: HP_MUTED, margin: "6px 0" }}>Memorization days (new portions + read-along)</div>
        <DayChips k="memorization_days" />
        <div style={{ fontSize: 12, fontWeight: 700, color: HP_MUTED, margin: "14px 0 6px" }}>Ustadh review days (weekly grading window)</div>
        <DayChips k="review_days" />
      </HpSection>

      <HpSection n={2} title="Weekly memorization" hint="How this week's portions reach the student.">
        <HpToggle on={hd.auto_assign_portions} onChange={(v) => setH({ auto_assign_portions: v })}
          label="Publish portions automatically"
          hint="When you auto-group a week, every active student's pages appear on their Hifdh home straight away." />
        <div style={{ borderTop: `1px solid ${HP_LINE}`, paddingTop: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: HP_INK, marginBottom: 6 }}>Read-along class subject</div>
          <HpSelect style={{ width: "100%" }} value={settings.readalong_subject_id || ""} onChange={(e) => setS({ readalong_subject_id: e.target.value || null })}>
            <option value="">— choose the Hifdh subject —</option>
            {subjects.map((sb) => <option key={sb.id} value={sb.id}>{sb.title}</option>)}
          </HpSelect>
        </div>
      </HpSection>

      <HpSection n={3} title="Read-along groups">
        <HpRow label="Max students per group" hint="Auto-grouping starts a new group after this many.">
          <Num value={settings.group_max_size} onChange={(v) => setS({ group_max_size: v })} />
        </HpRow>
      </HpSection>

      <HpSection n={4} title="Daily revision" hint="Applies to the student's daily revision recitation.">
        <HpRow label="Revision portions set by">
          <Seg value={settings.revision_mode} onChange={(v) => setS({ revision_mode: v })}
            options={[{ v: "auto", l: "Automatic" }, { v: "ustadh", l: "Ustadh" }]} />
        </HpRow>
        <HpRow label="Pass mark" hint="Score needed for a recitation to count as passed.">
          <Num value={hd.pass_mark} onChange={(v) => setH({ pass_mark: v as any })} suffix="%" />
        </HpRow>
        <div style={{ borderTop: `1px solid ${HP_LINE}` }}>
          <HpToggle on={hd.proctoring_enabled} onChange={(v) => setH({ proctoring_enabled: v })}
            label="Proctoring"
            hint="Tab-switch detection and copy/paste/right-click blocking during revision and the test phase." />
        </div>
        {hd.proctoring_enabled && (
          <HpRow label="Violations before auto-submit">
            <Num value={hd.violation_limit} onChange={(v) => setH({ violation_limit: v as any })} />
          </HpRow>
        )}
      </HpSection>

      <HpSection n={5} title="Fines & suspension" hint="Applied when the week is closed. Set the fine to 0 for no fines.">
        <HpRow label="Fine per missed week">
          <Num value={settings.fine_amount} onChange={(v) => setS({ fine_amount: v })} suffix="₦" />
        </HpRow>
        <HpRow label="Suspend after" hint="Consecutive missed weeks.">
          <Num value={settings.streak_limit} onChange={(v) => setS({ streak_limit: v })} suffix="misses" />
        </HpRow>
      </HpSection>

      <div><HpBtn disabled={busy} onClick={saveSettings}>Save settings</HpBtn></div>

      <HpCard>
        <div style={{ fontWeight: 800, color: HP_INK, marginBottom: 8 }}>Hifdh levels</div>
        {levels.map((l) => (
          <div key={l.id} style={{ display: "grid", gridTemplateColumns: "1fr 90px 36px", gap: 8, marginBottom: 8, alignItems: "center" }}>
            <HpInput defaultValue={l.name} onBlur={(e) => e.target.value !== l.name && run(() => hpDb.from("hifdh_levels").update({ name: e.target.value }).eq("id", l.id))} />
            <HpInput type="number" step="0.25" defaultValue={l.daily_pages} title="Pages per day"
              onBlur={(e) => Number(e.target.value) !== Number(l.daily_pages) && run(() => hpDb.from("hifdh_levels").update({ daily_pages: Number(e.target.value) || 0.5 }).eq("id", l.id))} />
            <button aria-label="Delete level" onClick={() => window.confirm(`Delete "${l.name}"?`) && run(() => hpDb.from("hifdh_levels").delete().eq("id", l.id))}
              style={{ border: "none", background: "none", cursor: "pointer", color: HP_RED }}><Trash2 size={16} /></button>
          </div>
        ))}
        <div style={{ fontSize: 11, color: HP_MUTED, marginBottom: 8 }}>Name · pages per day</div>
        <HpBtn small kind="ghost" onClick={() => run(() => hpDb.from("hifdh_levels").insert({ name: `Level ${levels.length + 1}`, daily_pages: 0.5, sort_order: levels.length }))}>
          <Plus size={12} /> Add level
        </HpBtn>
      </HpCard>
    </div>
  ) : null;

  const TABS: { id: HpTab; label: string; icon: React.ReactNode }[] = [
    { id: "students", label: "Students", icon: <Users size={14} /> },
    { id: "groups", label: "Groups", icon: <Layers size={14} /> },
    { id: "fines", label: "Fines", icon: <Wallet size={14} /> },
    { id: "settings", label: "Settings", icon: <Cog size={14} /> },
  ];

  return (
    <div style={{ background: HP_BG, minHeight: "100%", padding: 14, maxWidth: 720, margin: "0 auto" }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: HP_GREEN }}>Hifdh Program</div>
      </div>

      {(tab === "groups" || tab === "fines") && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 12 }}>
          <button aria-label="Previous week" onClick={() => setWeek(hpShift(week, -1))} style={{ border: "none", background: "none", cursor: "pointer" }}><ChevronLeft /></button>
          <div style={{ fontWeight: 700, fontSize: 13, color: HP_INK }}>Week of {hpPretty(week)}{week === hpMonday() ? " (this week)" : ""}</div>
          <button aria-label="Next week" onClick={() => setWeek(hpShift(week, 1))} style={{ border: "none", background: "none", cursor: "pointer" }}><ChevronRight /></button>
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: 12, background: "#fff", padding: 4, borderRadius: 12, border: `1px solid ${HP_LINE}` }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "9px 4px", borderRadius: 9, border: "none", cursor: "pointer",
            fontSize: 12, fontWeight: 700, background: tab === t.id ? HP_GREEN : "transparent", color: tab === t.id ? "#fff" : HP_MUTED,
          }}>{t.icon}{t.label}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><Loader2 className="animate-spin" color={HP_GOLD} /></div>
      ) : tab === "students" ? StudentsTab : tab === "groups" ? GroupsTab : tab === "fines" ? FinesTab : SettingsTab}
    </div>
  );
}
