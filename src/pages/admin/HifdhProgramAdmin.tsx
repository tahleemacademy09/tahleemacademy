// src/pages/admin/HifdhProgramAdmin.tsx
// Admin control room for the Hifdh Program: Students · Groups · Fines · Settings.
// Uses the hifdh_program / hifdh_read_groups / hifdh_fines / hifdh_settings / hifdh_levels tables.
// (supabase is cast to `any` until types.ts is regenerated from the live schema.)

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import MushafPageView from "@/components/hifdh/MushafPageView";
import { SURAHS } from "@/components/hifdh/surahData";
import { Loader2, Users, Layers, Wallet, Settings as Cog, Plus, Trash2, RotateCcw, ChevronLeft, ChevronRight, BookOpen, X } from "lucide-react";

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

/* Real-Quran labels instead of bare page numbers */
const hpSurahOf = (page: number) => {
  let hit: any = SURAHS[0];
  for (const sr of SURAHS as any[]) { if (sr.page <= page) hit = sr; else break; }
  return hit;
};
const hpJuz = (page: number) => (page <= 21 ? 1 : Math.min(30, Math.floor((page - 2) / 20) + 1));
const HpPageTag = ({ page, onView }: { page: number; onView: (p: number) => void }) => {
  const sr = hpSurahOf(page);
  return (
    <button onClick={() => onView(page)} style={{
      display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${HP_LINE}`, background: "#fdf8ee", borderRadius: 10,
      padding: "5px 9px", cursor: "pointer", fontSize: 12, color: HP_INK,
    }}>
      <BookOpen size={12} color={HP_GOLD} />
      <span style={{ fontFamily: "'Amiri Quran','Amiri',serif", fontSize: 15 }}>{sr.arabicName || sr.nameAr}</span>
      <span style={{ color: HP_MUTED }}>· Juz {hpJuz(page)}</span>
    </button>
  );
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

export default function HifdhProgramAdmin() {
  const { toast } = useToast();
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
  const [viewPage, setViewPage] = useState<number | null>(null);
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(155px,1fr))", gap: 10 }}>
        {program.map((p) => (
          <HpCard key={p.id} style={{ padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <div style={{ fontWeight: 800, color: HP_INK, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nameOf(p.student_id)}</div>
              <HpPill text={p.status} color={p.status === "active" ? HP_OK : p.status === "suspended" ? HP_RED : HP_MUTED} />
            </div>
            <HpPageTag page={p.current_page} onView={setViewPage} />
            {p.miss_streak > 0 && <div style={{ marginTop: 8 }}><HpPill text={`${p.miss_streak} miss${p.miss_streak > 1 ? "es" : ""} in a row`} color={HP_AMBER} /></div>}
            <div style={{ fontSize: 11, color: HP_MUTED, margin: "10px 0 3px" }}>Hifdh level</div>
            <HpSelect style={{ width: "100%" }} value={p.level_id || ""} onChange={(e) => patchProgram(p.id, { level_id: e.target.value || null })}>
              <option value="">— not set —</option>
              {levels.filter((l) => l.is_active).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </HpSelect>
            <div style={{ fontSize: 11, color: HP_MUTED, margin: "10px 0 3px" }}>Current page (1–604)</div>
            <HpInput type="number" min={1} max={604} defaultValue={p.current_page}
              onBlur={(e) => {
                const v = Math.min(604, Math.max(1, Number(e.target.value) || 1));
                if (v !== p.current_page) patchProgram(p.id, { current_page: v });
              }} />
            <HpSelect style={{ width: "100%", marginTop: 6 }} value={p.current_half ?? 0} onChange={(e) => patchProgram(p.id, { current_half: Number(e.target.value) })}>
              <option value={0}>Starts at the top of the page</option>
              <option value={1}>Starts at the 2nd half</option>
            </HpSelect>
          </HpCard>
        ))}
      </div>
    </div>
  );

  /* ───────── Groups ───────── */
  const membersOf = (gid: string) => members.filter((m) => m.group_id === gid);

  const GroupsTab = (
    <div style={{ display: "grid", gap: 10 }}>
      <HpCard>
        <div style={{ fontSize: 13, color: HP_MUTED, marginBottom: 10 }}>
          Students who are close in their hifdh are grouped automatically. You can move anyone or change a group's ustadh.
        </div>
        <HpBtn disabled={busy} onClick={() => run(async () => {
          const r = await hpDb.rpc("hifdh_build_read_groups", { p_week_start: week });
          if (!r.error) toast({ title: r.data ? `${r.data} group(s) created` : "Everyone is already in a group" });
          return r;
        })}>
          <Layers size={14} /> Auto-group this week
        </HpBtn>
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
                {ms.length} student{ms.length === 1 ? "" : "s"}{pages.length ? ` · ${hpSurahOf(Math.min(...pages)).arabicName} → ${hpSurahOf(Math.max(...pages)).arabicName}` : ""}
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
                  <div style={{ display: "grid", gap: 4 }}>
                    <span style={{ fontWeight: 600 }}>{nameOf(m.student_id)}</span>
                    {program.find((p) => p.student_id === m.student_id) && (
                      <HpPageTag page={program.find((p) => p.student_id === m.student_id).current_page} onView={setViewPage} />
                    )}
                  </div>
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
  const toggleDay = (key: "memorization_days" | "review_days", d: number) => {
    const cur: number[] = settings[key] || [];
    setS({ [key]: cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort() });
  };
  const saveSettings = () =>
    run(() => hpDb.from("hifdh_settings").update({
      memorization_days: settings.memorization_days, review_days: settings.review_days,
      fine_amount: Number(settings.fine_amount) || 0, streak_limit: Number(settings.streak_limit) || 3,
      revision_mode: settings.revision_mode, group_max_size: Number(settings.group_max_size) || 6,
      readalong_subject_id: settings.readalong_subject_id || null,
      updated_at: new Date().toISOString(),
    }).eq("id", true), "Settings saved");

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

  const Label = ({ t }: { t: string }) => <div style={{ fontSize: 12, fontWeight: 700, color: HP_MUTED, margin: "12px 0 6px" }}>{t}</div>;

  const SettingsTab = settings ? (
    <div style={{ display: "grid", gap: 10 }}>
      <HpCard>
        <Label t="Memorization days (new portions + read-along)" />
        <DayChips k="memorization_days" />
        <Label t="Ustadh review days (weekly grading window)" />
        <DayChips k="review_days" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div><Label t="Fine amount (₦)" /><HpInput type="number" value={settings.fine_amount} onChange={(e) => setS({ fine_amount: e.target.value })} /></div>
          <div><Label t="Suspend after N misses" /><HpInput type="number" value={settings.streak_limit} onChange={(e) => setS({ streak_limit: e.target.value })} /></div>
          <div><Label t="Max students per group" /><HpInput type="number" value={settings.group_max_size} onChange={(e) => setS({ group_max_size: e.target.value })} /></div>
          <div>
            <Label t="Revision portions set by" />
            <HpSelect style={{ width: "100%" }} value={settings.revision_mode} onChange={(e) => setS({ revision_mode: e.target.value })}>
              <option value="auto">Automatic</option>
              <option value="ustadh">Ustadh</option>
            </HpSelect>
          </div>
        </div>
        <Label t="Subject used for read-along live classes" />
        <HpSelect style={{ width: "100%" }} value={settings.readalong_subject_id || ""} onChange={(e) => setS({ readalong_subject_id: e.target.value || null })}>
          <option value="">— choose the Hifdh subject —</option>
          {subjects.map((sb) => <option key={sb.id} value={sb.id}>{sb.title}</option>)}
        </HpSelect>
        <div style={{ marginTop: 14 }}><HpBtn disabled={busy} onClick={saveSettings}>Save settings</HpBtn></div>
      </HpCard>

      <HpCard>
        <div style={{ fontWeight: 800, color: HP_INK, marginBottom: 8 }}>Hifdh levels</div>
        {levels.map((l) => (
          <div key={l.id} style={{ display: "grid", gridTemplateColumns: "1fr 90px 36px", gap: 8, marginBottom: 8, alignItems: "center" }}>
            <HpInput defaultValue={l.name} onBlur={(e) => e.target.value !== l.name && run(() => hpDb.from("hifdh_levels").update({ name: e.target.value }).eq("id", l.id))} />
            <HpInput type="number" step="0.5" min="0.5" defaultValue={l.daily_pages} title="Pages per memorization day"
              onBlur={(e) => Number(e.target.value) !== Number(l.daily_pages) && run(() => hpDb.from("hifdh_levels").update({ daily_pages: Number(e.target.value) || 0.5 }).eq("id", l.id))} />
            <button aria-label="Delete level" onClick={() => window.confirm(`Delete "${l.name}"?`) && run(() => hpDb.from("hifdh_levels").delete().eq("id", l.id))}
              style={{ border: "none", background: "none", cursor: "pointer", color: HP_RED }}><Trash2 size={16} /></button>
          </div>
        ))}
        <div style={{ fontSize: 11, color: HP_MUTED, marginBottom: 8 }}>Name · pages per memorization day (0.5 = half a page)</div>
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
      <div style={{ display: "flex", gap: 8, marginBottom: 12, background: "linear-gradient(160deg,#0f2e1f,#14402c)", padding: 10, borderRadius: 16 }}>
        {[
          { v: program.length, l: "ENROLLED", c: "#fff" },
          { v: program.filter((p) => p.status === "active").length, l: "ACTIVE", c: "#4ade80" },
          { v: suspended.length, l: "SUSPENDED", c: suspended.length ? "#f87171" : "#ffffffaa" },
          { v: fines.filter((f) => f.status === "unpaid").length, l: "UNPAID", c: fines.some((f) => f.status === "unpaid") ? HP_GOLD : "#ffffffaa" },
        ].map((t) => (
          <div key={t.l} style={{ flex: 1, background: "#ffffff12", border: "1px solid #ffffff22", borderRadius: 12, padding: "10px 2px", textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: t.c, lineHeight: 1.1 }}>{t.v}</div>
            <div style={{ fontSize: 9, letterSpacing: 0.6, color: "#ffffffaa", marginTop: 3 }}>{t.l}</div>
          </div>
        ))}
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

      {viewPage !== null && (
        <div onClick={() => setViewPage(null)} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: HP_BG, width: "100%", maxWidth: 560, maxHeight: "92vh", overflowY: "auto", borderRadius: "20px 20px 0 0", padding: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <button aria-label="Previous page" disabled={viewPage <= 1} onClick={() => setViewPage(viewPage - 1)} style={{ border: "none", background: "none", cursor: "pointer", opacity: viewPage <= 1 ? 0.3 : 1 }}><ChevronLeft /></button>
              <div style={{ fontWeight: 800, color: HP_INK, fontSize: 14 }}>
                <span style={{ fontFamily: "'Amiri Quran','Amiri',serif", fontSize: 17 }}>{hpSurahOf(viewPage).arabicName}</span> · Juz {hpJuz(viewPage)}
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button aria-label="Next page" disabled={viewPage >= 604} onClick={() => setViewPage(viewPage + 1)} style={{ border: "none", background: "none", cursor: "pointer", opacity: viewPage >= 604 ? 0.3 : 1 }}><ChevronRight /></button>
                <button aria-label="Close" onClick={() => setViewPage(null)} style={{ border: "none", background: "none", cursor: "pointer" }}><X size={18} /></button>
              </div>
            </div>
            <MushafPageView page={viewPage} />
          </div>
        </div>
      )}
    </div>
  );
}
