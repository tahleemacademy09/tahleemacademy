// src/components/hifdh/HifdhMemorizationPanel.tsx
// Ustadh tool INSIDE the Hifdh read-along live class.
// Flow: the ustadh reads the portion, students repeat after him and read it back. When he is satisfied he taps
//   "Allow to memorize" — for one student, or for a whole group reading the same place at once. The student then
//   memorizes on their own and submits; the ustadh marks "Memorized" (student moves to the next page) or "Repeat".
// ☰ Students → list by level → students grouped by the page they read → tap a student to see the Quran page.
// Uses only the tables/RPCs the Hifdh Program screen already uses — no schema changes.

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useParticipants } from "@livekit/components-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import MushafPageView from "@/components/hifdh/MushafPageView";
import { hpUnit, hpFromUnit, hpUnitsFor, hpUnitsOf, hpPortionFromUnits, hpPortionLabel, hpPagesOf, hpSegmentFor, HP_AMOUNTS } from "@/lib/hifdhPortion";
import { Menu, X, ChevronLeft, ChevronRight, ChevronDown, Check, CheckCheck, RotateCcw, Search, Loader2, Settings2, Minimize2, Maximize2, Radio } from "lucide-react";

const db = supabase as any;
const G = "#064E3B", GOLD = "#C9A84C", INK = "#1a1a2e", MUTED = "#6b7a72", LINE = "#e3e9e5", OK = "#16A34A", AMBER = "#D97706", RED = "#DC2626";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const monday = () => { const x = new Date(); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return iso(x); };

// simple, human status words
const ST: Record<string, { text: string; color: string }> = {
  none: { text: "Waiting", color: MUTED },
  pending: { text: "Waiting", color: MUTED },
  read_cleared: { text: "Allowed ✓", color: OK },
  submitted: { text: "Ready to hear", color: G },
  passed: { text: "Memorized ✓", color: OK },
  failed: { text: "Repeat", color: RED },
};
const ALLOWED = ["read_cleared", "submitted", "passed"];

const Pill = ({ text, color }: { text: string; color: string }) => (
  <span style={{ background: color + "1a", color, fontSize: 10.5, fontWeight: 800, padding: "3px 8px", borderRadius: 99, whiteSpace: "nowrap" }}>{text}</span>
);

export default function HifdhMemorizationPanel({ subject }: { subject: any }) {
  const { user, hasRole } = useAuth();
  const isAdmin = hasRole ? hasRole("admin") : false;
  const isStaff = !!hasRole && (hasRole("admin") || hasRole("teacher"));
  const participants = useParticipants();

  const [isMemClass, setIsMemClass] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [slot, setSlot] = useState<1 | 2>(1);
  const [pg, setPg] = useState<number | null>(null);
  const [qSize, setQSize] = useState(26);
  const [adjust, setAdjust] = useState(false);
  const [q, setQ] = useState("");
  const [roomOnly, setRoomOnly] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [loading, setLoading] = useState(false);

  const [programs, setPrograms] = useState<Record<string, any>>({});
  const [levels, setLevels] = useState<Record<string, any>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [tasks, setTasks] = useState<any[]>([]);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [groupMemberIds, setGroupMemberIds] = useState<string[]>([]);
  const [edit, setEdit] = useState<Record<string, { start: number; units: number }>>({});

  const [mini, setMini] = useState(false);   // sheet shrunk to a small bar so the class controls (mic, camera…) are reachable
  const [sync, setSync] = useState(true);     // students in the room see the page you are showing
  const [chReady, setChReady] = useState(false);
  const bc = useRef<any>(null);
  const selRef = useRef<string | null>(null);
  selRef.current = sel;

  const week = useMemo(() => monday(), []);
  const flash = (text: string, ok = true) => { setMsg({ text, ok }); window.setTimeout(() => setMsg((m) => (m?.text === text ? null : m)), 3500); };

  // only the Hifdh read-along subject gets this panel
  useEffect(() => {
    let live = true;
    db.from("hifdh_settings").select("readalong_subject_id").eq("id", true).maybeSingle()
      .then(({ data }: any) => { if (live) setIsMemClass(!!data?.readalong_subject_id && data.readalong_subject_id === subject?.id); });
    return () => { live = false; };
  }, [subject?.id]);

  const loadTasks = useCallback(async (sids: string[]) => {
    if (!sids.length) { setTasks([]); return; }
    const { data } = await db.from("hifdh_memorization_tasks").select("*").in("student_id", sids).eq("week_start", week);
    setTasks(data || []);
  }, [week]);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const [lv, ap] = await Promise.all([
      db.from("hifdh_levels").select("*"),
      db.from("hifdh_program").select("*").eq("status", "active").order("created_at", { ascending: false }),
    ]);
    const lm: Record<string, any> = {};
    (lv.data || []).forEach((l: any) => (lm[l.id] = l));
    setLevels(lm);
    const pm: Record<string, any> = {};
    (ap.data || []).forEach((p: any) => { if (!pm[p.student_id]) pm[p.student_id] = p; });
    setPrograms(pm);
    const sids = Object.keys(pm);

    if (!isAdmin) {
      const { data: gs } = await db.from("hifdh_read_groups").select("id").eq("week_start", week).eq("ustadh_id", user.id);
      const gids: string[] = (gs || []).map((g: any) => g.id);
      setGroupIds(gids);
      if (gids.length) {
        const { data: ms } = await db.from("hifdh_read_group_members").select("student_id").in("group_id", gids);
        setGroupMemberIds((ms || []).map((m: any) => m.student_id));
      } else setGroupMemberIds([]);
    }
    if (sids.length) {
      const { data: pf } = await db.from("profiles").select("user_id,full_name").in("user_id", sids);
      const nm: Record<string, string> = {};
      (pf || []).forEach((p: any) => (nm[p.user_id] = p.full_name || "Unnamed"));
      setNames(nm);
    }
    await loadTasks(sids);
    setLoading(false);
  }, [user?.id, isAdmin, week, loadTasks]);

  useEffect(() => { if (isMemClass && isStaff) load(); }, [isMemClass, isStaff, load]);

  // students submitting while you teach → list refreshes by itself
  const timer = useRef<any>(null);
  useEffect(() => {
    if (!isMemClass || !isStaff) return;
    const ch = supabase.channel(`hifdh-readalong-${subject?.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "hifdh_memorization_tasks" }, () => {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => loadTasks(Object.keys(programs)), 400);
      }).subscribe();
    return () => { clearTimeout(timer.current); supabase.removeChannel(ch); };
  }, [isMemClass, isStaff, subject?.id, programs, loadTasks]);

  // While the list or a student sheet is open the page behind must not move or show through
  const locked = isMemClass && isStaff && (drawer || (!!sel && !mini));
  useEffect(() => {
    if (!locked) return;
    const y = window.scrollY;
    const b = document.body, h = document.documentElement;
    const prev = { pos: b.style.position, top: b.style.top, left: b.style.left, right: b.style.right, w: b.style.width, ov: b.style.overflow, ob: h.style.overscrollBehavior };
    b.style.position = "fixed"; b.style.top = `-${y}px`; b.style.left = "0"; b.style.right = "0"; b.style.width = "100%"; b.style.overflow = "hidden";
    h.style.overscrollBehavior = "none";
    return () => {
      b.style.position = prev.pos; b.style.top = prev.top; b.style.left = prev.left; b.style.right = prev.right; b.style.width = prev.w; b.style.overflow = prev.ov;
      h.style.overscrollBehavior = prev.ob;
      window.scrollTo(0, y);
    };
  }, [locked]);

  const present = useMemo(() => {
    const out = new Set<string>();
    participants.forEach((p) => {
      if (p.identity.includes("::screen") || p.isLocal) return;
      let role = "";
      try { role = JSON.parse(p.metadata || "{}").role || ""; } catch { /* ignore */ }
      if (role && role !== "student") return;
      out.add(p.identity);
    });
    return out;
  }, [participants]);

  const nameOf = (id: string) => names[id] || "Student";
  const taskFor = (sid: string, s: number) => tasks.find((t) => t.student_id === sid && t.slot === s);

  // portion for a student: existing task, else the level's daily amount starting where they are
  const suggest = (sid: string, s: number): { start: number; units: number } => {
    const ex = taskFor(sid, s);
    if (ex) { const u = hpUnitsOf(ex); return { start: u.start, units: u.end - u.start + 1 }; }
    const prog = programs[sid];
    const units = hpUnitsFor(levels[prog?.level_id]?.daily_pages ?? 0.5);
    return { start: hpUnit(prog?.current_page ?? 1, prog?.current_half ?? 0), units };
  };
  const rangeOf = (sid: string, s: number) => edit[`${sid}:${s}`] || suggest(sid, s);

  /* ───── sync: broadcast the page being shown so students can follow along ───── */
  const fRg = sel ? rangeOf(sel, slot) : null;
  const fPortion = fRg ? hpPortionFromUnits(fRg.start, fRg.units) : null;
  const fPages = fPortion ? hpPagesOf(fPortion) : [];
  const fCur = fPortion ? (pg && fPages.includes(pg) ? pg : fPages[0]) : null;
  const fKey = JSON.stringify([sync, fPortion, fCur]);
  const sendFollow = () => {
    const ch = bc.current; if (!ch) return;
    const on = sync && !!fPortion && !!fCur;
    ch.send({ type: "broadcast", event: "follow", payload: on ? { on: true, portion: fPortion, cur: fCur } : { on: false } });
  };
  useEffect(() => {
    if (!isMemClass || !isStaff || !subject?.id) return;
    const ch = supabase.channel(`hifdh-follow-${subject.id}`);
    ch.subscribe((st: string) => { if (st === "SUBSCRIBED") { bc.current = ch; setChReady(true); } });
    return () => {
      try { ch.send({ type: "broadcast", event: "follow", payload: { on: false } }); } catch { /* ignore */ }
      bc.current = null; setChReady(false); supabase.removeChannel(ch);
    };
  }, [isMemClass, isStaff, subject?.id]);
  useEffect(() => {
    sendFollow();
    if (!(sync && fPortion)) return;
    const id = window.setInterval(sendFollow, 5000);   // so a student who joins late catches up
    return () => window.clearInterval(id);
  }, [fKey, chReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const scopeIds = useMemo(() => {
    const all = Object.keys(programs);
    if (isAdmin) return all;
    const mine = new Set([...groupMemberIds, ...Array.from(present)]);
    return all.filter((id) => mine.has(id));
  }, [programs, isAdmin, groupMemberIds, present]);

  // level → "same place" groups → students
  const levelsView = useMemo(() => {
    const s = q.trim().toLowerCase();
    const ids = scopeIds.filter((id) => (!s || nameOf(id).toLowerCase().includes(s)) && (!roomOnly || present.has(id)));
    const byLevel = new Map<string, string[]>();
    ids.forEach((id) => { const l = programs[id]?.level_id || "none"; (byLevel.get(l) || byLevel.set(l, []).get(l)!).push(id); });
    const order = (l: string) => (l === "none" ? 9999 : Number(levels[l]?.sort_order ?? 500));
    return Array.from(byLevel.entries())
      .sort((a, b) => order(a[0]) - order(b[0]) || String(levels[a[0]]?.name || "").localeCompare(String(levels[b[0]]?.name || "")))
      .map(([lid, list]) => {
        const places = new Map<string, string[]>();
        list.forEach((id) => { const r = rangeOf(id, slot); const k = `${r.start}:${r.units}`; (places.get(k) || places.set(k, []).get(k)!).push(id); });
        return {
          lid, name: lid === "none" ? "No level" : levels[lid]?.name || "Level",
          places: Array.from(places.entries()).sort((a, b) => Number(a[0].split(":")[0]) - Number(b[0].split(":")[0])).map(([k, pids]) => {
            const [st, un] = k.split(":").map(Number);
            return { key: k, label: hpPortionLabel(hpPortionFromUnits(st, un)), ids: pids.sort((a, b) => Number(present.has(b)) - Number(present.has(a)) || nameOf(a).localeCompare(nameOf(b))) };
          }),
        };
      });
  }, [scopeIds, q, roomOnly, present, programs, levels, names, tasks, edit, slot]); // eslint-disable-line react-hooks/exhaustive-deps

  const flat = useMemo(() => levelsView.flatMap((l) => l.places.flatMap((p) => p.ids)), [levelsView]);
  const readyCount = tasks.filter((t) => t.slot === slot && t.status === "submitted" && scopeIds.includes(t.student_id)).length;

  const openStudent = (sid: string) => { setSel(sid); setDrawer(false); setPg(null); setAdjust(false); setMsg(null); };
  const step = (d: number) => {
    if (!sel || flat.length < 2) return;
    const n = flat[(flat.indexOf(sel) + d + flat.length) % flat.length];
    if (n) openStudent(n);
  };

  // the student after `id` in the list as it is NOW (taken before the list re-groups)
  const nextAfter = (id: string): string | null => {
    if (flat.length < 2) return null;
    const i = flat.indexOf(id);
    const n = flat[(i + 1) % flat.length];
    return n && n !== id ? n : null;
  };
  // show the new state for a moment, then move on to the next student (only if the ustadh is still on this one)
  const goNext = (from: string, to: string | null) => {
    if (!to) return;
    window.setTimeout(() => { if (selRef.current === from) openStudent(to); }, 900);
  };

  const guard = async (fn: () => Promise<any>) => {
    setBusy(true);
    try {
      const res = await fn();
      if (res?.error) throw res.error;
      await loadTasks(Object.keys(programs));
      return true;
    } catch (e: any) { flash(e?.message || "Something went wrong", false); return false; }
    finally { setBusy(false); }
  };

  /* ───── actions ───── */
  const canAllow = (sid: string, s: number): string | null => {
    const ex = taskFor(sid, s);
    if (!isAdmin && ex && ["submitted", "passed"].includes(ex.status)) return "already submitted";
    const first = taskFor(sid, 1);
    if (!isAdmin && s === 2 && first && first.status !== "passed") return "Session 1 isn't memorized yet";
    return null;
  };

  // allow one OR many students to go and memorize (same write the Read-Along tab does, in one go)
  const allow = async (sids: string[]) => {
    const ok: string[] = []; let skipped = 0; let why = "";
    sids.forEach((id) => { const e = canAllow(id, slot); if (e) { skipped++; why = e; } else ok.push(id); });
    if (!ok.length) return flash(skipped ? `Can't allow: ${why}` : "Nobody to allow", false);
    const now = new Date().toISOString();
    const rows = ok.map((id) => ({
      student_id: id, week_start: week, slot, ...hpPortionFromUnits(rangeOf(id, slot).start, rangeOf(id, slot).units),
      status: "read_cleared", read_cleared_at: now, read_cleared_by: user!.id,
    }));
    const done = await guard(async () => {
      const up = await db.from("hifdh_memorization_tasks").upsert(rows, { onConflict: "student_id,week_start,slot" });
      if (up.error) return up;
      if (groupIds.length) {
        for (const r of rows) {
          const { student_id, page_from, page_to, half_from, half_to } = r as any;
          await db.from("hifdh_read_group_members").update({ read_status: "passed", marked_by: user!.id, marked_at: now, page_from, page_to, half_from, half_to })
            .eq("student_id", student_id).in("group_id", groupIds);
        }
      }
      return {};
    });
    if (done) flash(ok.length === 1 ? `${nameOf(ok[0])} can go and memorize` : `${ok.length} students can go and memorize${skipped ? ` (${skipped} skipped)` : ""}`);
    return done;
  };

  const readAgain = async (sid: string) => {
    const e = canAllow(sid, slot);
    if (e === "already submitted") return flash("Already submitted", false);
    const r = hpPortionFromUnits(rangeOf(sid, slot).start, rangeOf(sid, slot).units);
    const ok = await guard(async () => {
      const up = await db.from("hifdh_memorization_tasks").upsert({
        student_id: sid, week_start: week, slot, ...r, status: "pending", read_cleared_at: null, read_cleared_by: null,
      }, { onConflict: "student_id,week_start,slot" });
      if (up.error) return up;
      if (groupIds.length) await db.from("hifdh_read_group_members").update({ read_status: "repeat", marked_by: user!.id, marked_at: new Date().toISOString(), ...r }).eq("student_id", sid).in("group_id", groupIds);
      return {};
    });
    if (ok) flash(`${nameOf(sid)} will read again`);
  };

  const mark = async (sid: string, result: "passed" | "repeat") => {
    const t = taskFor(sid, slot);
    if (!t) return;
    const nx = result === "passed" ? nextAfter(sid) : null;
    const ok = await guard(() => db.rpc("hifdh_mark_memorized", { p_task: t.id, p_result: result }));
    if (!ok) return;
    if (result === "passed") {
      const { data } = await db.from("hifdh_program").select("*").eq("student_id", sid).eq("status", "active").order("created_at", { ascending: false }).limit(1);
      if (data?.[0]) setPrograms((p) => ({ ...p, [sid]: data[0] }));
      setEdit((e) => { const n = { ...e }; delete n[`${sid}:${slot}`]; return n; });
      flash(`${nameOf(sid)} memorized ✓ — moves to the next page`);
      goNext(sid, nx);
    } else flash(`${nameOf(sid)} will repeat`);
  };

  if (!isMemClass || !isStaff) return null;

  /* ───── open student ───── */
  const rg = sel ? rangeOf(sel, slot) : null;
  const portion = rg ? hpPortionFromUnits(rg.start, rg.units) : null;
  const pages = portion ? hpPagesOf(portion) : [];
  const cur = pg && pages.includes(pg) ? pg : pages[0];
  const seg = portion && cur ? hpSegmentFor(cur, portion) : null;
  const partial = !!seg && !(seg[0] === 0 && seg[1] === 1);
  const t = sel ? taskFor(sel, slot) : null;
  const status = t?.status || "none";
  const waiting = !t || status === "pending";
  const lockedEdit = !isAdmin && !!t && ["submitted", "passed"].includes(status);
  const setRange = (patch: Partial<{ start: number; units: number }>) => rg && setEdit({ ...edit, [`${sel}:${slot}`]: { ...rg, ...patch } });

  const big = (bg: string, ghost = false): CSSProperties => ({
    flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "15px 8px", borderRadius: 14,
    fontSize: 15, fontWeight: 800, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
    border: ghost ? `2px solid ${bg}` : "none", background: ghost ? "#fff" : bg, color: ghost ? bg : "#fff",
  });
  const slotTabs = (onDark: boolean) => (
    <div style={{ display: "flex", gap: 6 }}>
      {[1, 2].map((s) => {
        const on = slot === s;
        return (
          <button key={s} onClick={() => { setSlot(s as 1 | 2); setPg(null); setAdjust(false); }} aria-pressed={on} style={{
            flex: 1, padding: "9px 0", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: "pointer",
            border: `1.5px solid ${on ? GOLD : onDark ? "#ffffff44" : LINE}`,
            background: on ? GOLD : onDark ? "transparent" : "#fff",
            color: on ? "#1a1a2e" : onDark ? "#fff" : INK,
          }}>Session {s}</button>
        );
      })}
    </div>
  );
  const closeBtn = (dark: boolean): CSSProperties => ({
    width: 38, height: 38, flexShrink: 0, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center",
    borderRadius: 10, border: "none", cursor: "pointer", lineHeight: 0,
    background: dark ? "#ffffff26" : "#eef3f0", color: dark ? "#fff" : INK,
  });

  return (
    <>
      {!(sel && mini) && <button onClick={() => setDrawer(true)} aria-label="Students" style={{
        position: "fixed", left: 12, top: "calc(env(safe-area-inset-top, 0px) + 70px)", zIndex: 5000, display: "flex", alignItems: "center", gap: 6,
        padding: "10px 14px", borderRadius: 99, border: `1px solid ${GOLD}`, background: G, color: "#fff", fontWeight: 800, fontSize: 13,
        cursor: "pointer", boxShadow: "0 4px 14px rgba(0,0,0,.3)",
      }}>
        <Menu size={17} color={GOLD} /> Students
        {readyCount > 0 && <span style={{ background: RED, color: "#fff", borderRadius: 99, minWidth: 18, height: 18, padding: "0 5px", fontSize: 11, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{readyCount}</span>}
      </button>}

      {/* ☰ list */}
      {drawer && (
        <div style={{ position: "fixed", inset: 0, zIndex: 5002, background: "rgba(0,0,0,.45)", overscrollBehavior: "contain", touchAction: "none" }} onClick={() => setDrawer(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "min(92vw, 380px)", height: "100dvh", touchAction: "auto", background: "#f6f8f6", display: "flex", flexDirection: "column", fontFamily: "system-ui, sans-serif", color: INK }}>
            <div style={{ padding: "calc(12px + env(safe-area-inset-top, 0px)) 14px 12px", background: G, color: "#fff", display: "grid", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, fontWeight: 800, fontSize: 16 }}>Students</div>
                <button onClick={() => setDrawer(false)} aria-label="Close" style={closeBtn(true)}><X size={20} strokeWidth={2.6} /></button>
              </div>
              {slotTabs(true)}
            </div>
            <div style={{ padding: 10, display: "flex", gap: 8, background: "#fff", borderBottom: `1px solid ${LINE}` }}>
              <div style={{ position: "relative", flex: 1 }}>
                <Search size={14} color={MUTED} style={{ position: "absolute", left: 10, top: 12 }} />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search"
                  style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${LINE}`, borderRadius: 10, padding: "10px 10px 10px 30px", fontSize: 14 }} />
              </div>
              <button onClick={() => setRoomOnly(!roomOnly)} style={{
                padding: "0 12px", borderRadius: 10, fontSize: 12, fontWeight: 800, cursor: "pointer",
                border: `1px solid ${roomOnly ? G : LINE}`, background: roomOnly ? G : "#fff", color: roomOnly ? "#fff" : INK,
              }}>In room</button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain", padding: 10, display: "grid", gap: 10, alignContent: "start" }}>
              {loading && <div style={{ display: "flex", justifyContent: "center", padding: 20 }}><Loader2 className="animate-spin" color={GOLD} /></div>}
              {!loading && levelsView.length === 0 && <div style={{ color: MUTED, fontSize: 14, padding: 8 }}>No students to show.</div>}
              {levelsView.map((lv) => {
                const shut = collapsed[lv.lid];
                return (
                  <div key={lv.lid} style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14, overflow: "hidden" }}>
                    <button onClick={() => setCollapsed({ ...collapsed, [lv.lid]: !shut })} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "12px", border: "none", background: "#f0f5f2", cursor: "pointer", textAlign: "left" }}>
                      <ChevronDown size={16} color={G} style={{ transform: shut ? "rotate(-90deg)" : "none", transition: "transform .15s" }} />
                      <span style={{ flex: 1, fontWeight: 800, fontSize: 14, color: G }}>{lv.name}</span>
                    </button>
                    {!shut && lv.places.map((pl) => {
                      const todo = pl.ids.filter((id) => present.has(id) && !ALLOWED.includes(taskFor(id, slot)?.status || ""));
                      return (
                        <div key={pl.key} style={{ borderTop: `1px solid ${LINE}` }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "#fffdf5" }}>
                            <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 800, color: INK }}>{pl.label}<span style={{ color: MUTED, fontWeight: 600 }}> · {pl.ids.length}</span></div>
                            {todo.length > 0 && (
                              <button disabled={busy} onClick={() => allow(todo)} style={{ padding: "8px 11px", borderRadius: 10, border: "none", background: OK, color: "#fff", fontSize: 12.5, fontWeight: 800, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
                                <Check size={13} style={{ verticalAlign: -2 }} /> Allow all in room ({todo.length})
                              </button>
                            )}
                          </div>
                          {pl.ids.map((id) => {
                            const x = taskFor(id, slot); const lb = ST[x?.status || "none"];
                            return (
                              <button key={id} onClick={() => openStudent(id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px", border: "none", borderTop: `1px solid ${LINE}`, background: "#fff", cursor: "pointer", textAlign: "left" }}>
                                <span style={{ width: 9, height: 9, borderRadius: "50%", background: present.has(id) ? OK : "#cbd5d0", flexShrink: 0 }} />
                                <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nameOf(id)}</span>
                                <Pill text={lb.text} color={lb.color} />
                                <ChevronRight size={15} color={MUTED} />
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* student sheet */}
      {sel && portion && !mini && (
        <div style={{ position: "fixed", inset: 0, zIndex: 5001, background: "#f6f8f6", display: "flex", justifyContent: "center", overscrollBehavior: "contain", touchAction: "none" }}>
          <div style={{ width: "100%", maxWidth: 640, height: "100dvh", background: "#f6f8f6", display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "system-ui, sans-serif", color: INK, touchAction: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "calc(10px + env(safe-area-inset-top, 0px)) 10px 10px", background: "#fff", borderBottom: `1px solid ${LINE}` }}>
              <button onClick={() => setDrawer(true)} aria-label="Student list" style={{ ...closeBtn(false), color: G }}><Menu size={20} strokeWidth={2.4} /></button>
              <button onClick={() => step(-1)} aria-label="Previous student" style={{ border: "none", background: "none", cursor: "pointer", padding: 2 }}><ChevronLeft size={22} /></button>
              <div style={{ flex: 1, minWidth: 0, textAlign: "center" }}>
                <div style={{ fontWeight: 800, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nameOf(sel)}</div>
                <div style={{ fontSize: 11.5, color: MUTED }}>{hpPortionLabel(portion)}</div>
              </div>
              <button onClick={() => step(1)} aria-label="Next student" style={{ border: "none", background: "none", cursor: "pointer", padding: 2 }}><ChevronRight size={22} /></button>
              <button onClick={() => setMini(true)} aria-label="Minimize" title="Minimize — use mic / camera" style={{ ...closeBtn(false), marginLeft: 2 }}><Minimize2 size={19} strokeWidth={2.4} /></button>
              <button onClick={() => { setSel(null); setMini(false); }} aria-label="Close" style={closeBtn(false)}><X size={20} strokeWidth={2.6} /></button>
            </div>

            <button onClick={() => setSync(!sync)} aria-pressed={sync} style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "7px 10px", border: "none", borderBottom: `1px solid ${LINE}`, cursor: "pointer",
              background: sync ? OK + "16" : "#f3f4f3", color: sync ? OK : MUTED, fontSize: 12.5, fontWeight: 800,
            }}>
              <Radio size={15} strokeWidth={2.5} /> {sync ? "Sync ON — students see this page and follow along" : "Sync OFF — students can't see this page"}
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "#fffdf5", borderBottom: `1px solid ${LINE}` }}>
              <div style={{ flex: 1 }}>{slotTabs(false)}</div>
              <button onClick={() => setQSize(Math.max(18, qSize - 2))} aria-label="Smaller" style={{ border: `1px solid ${LINE}`, background: "#fff", borderRadius: 8, padding: "7px 10px", fontWeight: 800, cursor: "pointer" }}>A−</button>
              <button onClick={() => setQSize(Math.min(40, qSize + 2))} aria-label="Larger" style={{ border: `1px solid ${LINE}`, background: "#fff", borderRadius: 8, padding: "7px 10px", fontWeight: 800, cursor: "pointer" }}>A+</button>
              {!lockedEdit && waiting && <button onClick={() => setAdjust(!adjust)} aria-label="Change page" style={{ border: `1px solid ${adjust ? G : LINE}`, background: adjust ? "#eef6f1" : "#fff", borderRadius: 8, padding: "8px 9px", cursor: "pointer" }}><Settings2 size={16} color={G} /></button>}
            </div>

            {adjust && waiting && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "8px 12px", background: "#fff", borderBottom: `1px solid ${LINE}`, fontSize: 12, color: MUTED }}>
                <div>
                  <div style={{ marginBottom: 3 }}>Starts at page</div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <input type="number" min={1} max={604} value={hpFromUnit(rg!.start).page}
                      onChange={(e) => setRange({ start: hpUnit(Math.min(604, Math.max(1, Number(e.target.value) || 1)), hpFromUnit(rg!.start).half) })}
                      style={{ width: 64, border: `1px solid ${LINE}`, borderRadius: 8, padding: "7px 6px", fontSize: 13, textAlign: "center" }} />
                    <select value={hpFromUnit(rg!.start).half} onChange={(e) => setRange({ start: hpUnit(hpFromUnit(rg!.start).page, Number(e.target.value)) })}
                      style={{ border: `1px solid ${LINE}`, borderRadius: 8, fontSize: 12, padding: "6px 4px", background: "#fff", flex: 1, minWidth: 0 }}>
                      <option value={0}>1st half</option><option value={1}>2nd half</option>
                    </select>
                  </div>
                </div>
                <div>
                  <div style={{ marginBottom: 3 }}>Amount</div>
                  <select value={rg!.units} onChange={(e) => setRange({ units: Number(e.target.value) })}
                    style={{ border: `1px solid ${LINE}`, borderRadius: 8, fontSize: 12, padding: "7px 4px", background: "#fff", width: "100%" }}>
                    {(HP_AMOUNTS.some((a) => a.units === rg!.units) ? HP_AMOUNTS : [...HP_AMOUNTS, { units: rg!.units, label: `${rg!.units / 2} pages` }]).map((a) => <option key={a.units} value={a.units}>{a.label}</option>)}
                  </select>
                </div>
              </div>
            )}

            {pages.length > 1 && (
              <div style={{ display: "flex", gap: 6, padding: "8px 12px 0", overflowX: "auto" }}>
                {pages.map((p) => (
                  <button key={p} onClick={() => setPg(p)} style={{ padding: "6px 13px", borderRadius: 99, fontSize: 12.5, fontWeight: 800, cursor: "pointer", flexShrink: 0, border: `1px solid ${p === cur ? GOLD : LINE}`, background: p === cur ? "#fbf3da" : "#fff", color: INK }}>Page {p}</button>
                ))}
              </div>
            )}

            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", padding: "8px 8px 10px", background: "#fdf8ee" }}>
              {partial && seg && (
                <div style={{ margin: "0 0 8px", padding: "6px 10px", borderRadius: 10, background: "#fbf3da", border: `1px solid ${GOLD}88`, color: "#78350F", fontSize: 12.5, fontWeight: 700 }}>
                  Portion: the {seg[0] === 0 ? "top" : "bottom"} half of this page
                </div>
              )}
              {cur && <MushafPageView key={`${cur}-${partial ? seg!.join("") : "f"}`} page={cur} fontSize={qSize} halves={partial ? seg! : undefined} hidePortionChip />}
            </div>

            <div style={{ background: "#fff", borderTop: `1px solid ${LINE}`, padding: 10, paddingBottom: "calc(10px + env(safe-area-inset-bottom, 0px))", display: "grid", gap: 8 }}>
              {msg && <div style={{ fontSize: 13, fontWeight: 700, textAlign: "center", color: msg.ok ? OK : RED }}>{msg.text}</div>}
              {status === "passed" ? (
                <div style={{ textAlign: "center", fontSize: 14, fontWeight: 800, color: OK, padding: "8px 0", display: "grid", gap: 8 }}><Check size={16} style={{ verticalAlign: -3 }} /> Memorized — moves to the next page
                  {isAdmin && <button disabled={busy} onClick={() => mark(sel, "repeat")} style={{ ...big(AMBER, true), flex: "none", padding: "10px 8px", fontSize: 13 }}><RotateCcw size={14} /> Admin: send back to repeat</button>}
                </div>
              ) : waiting ? (
                <div style={{ display: "flex", gap: 8 }}>
                  <button disabled={busy} onClick={async () => { const nx = nextAfter(sel); if (await allow([sel])) goNext(sel, nx); }} style={big(OK)}><Check size={18} /> Allow to memorize</button>
                  <button disabled={busy} onClick={() => readAgain(sel)} style={{ ...big(AMBER, true), flex: "0 0 36%" }}><RotateCcw size={16} /> Read again</button>
                </div>
              ) : (
                <>
                  {status === "read_cleared" && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "12px 8px", borderRadius: 14, background: OK + "1a", color: OK, fontSize: 15, fontWeight: 800 }}>
                      <Check size={18} strokeWidth={3} /> Allowed
                    </div>
                  )}
                  <div style={{ textAlign: "center", fontSize: 12.5, color: MUTED, fontWeight: 600 }}>
                    {status === "submitted" ? "The student says they memorized it — hear them, then choose." : status === "read_cleared" ? "Memorizing on their own. When you hear them recite:" : "Hear them recite, then choose:"}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button disabled={busy} onClick={() => mark(sel, "passed")} style={big(G)}><CheckCheck size={18} /> Memorized</button>
                    <button disabled={busy} onClick={() => mark(sel, "repeat")} style={{ ...big(AMBER, true), flex: "0 0 36%" }}><RotateCcw size={16} /> Repeat</button>
                  </div>
                  {isAdmin && <button disabled={busy} onClick={() => readAgain(sel)} style={{ ...big(MUTED, true), flex: "none", padding: "9px 8px", fontSize: 13 }}>Admin: undo — back to "Read again"</button>}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* minimized: a small bar at the top, so the class controls at the bottom (mic, camera…) stay usable */}
      {sel && portion && mini && (
        <div style={{
          position: "fixed", left: 8, right: 8, top: "calc(env(safe-area-inset-top, 0px) + 70px)", zIndex: 5001, display: "flex", alignItems: "center", gap: 8,
          padding: 8, borderRadius: 16, background: "#fff", border: `1.5px solid ${GOLD}`, boxShadow: "0 6px 22px rgba(0,0,0,.35)", fontFamily: "system-ui, sans-serif", color: INK,
        }}>
          <button onClick={() => setMini(false)} aria-label="Open" style={{ ...closeBtn(false), background: G, color: GOLD }}><Maximize2 size={18} strokeWidth={2.4} /></button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nameOf(sel)}</div>
            <div style={{ fontSize: 11.5, color: MUTED, display: "flex", alignItems: "center", gap: 5 }}>
              {sync && <Radio size={12} color={OK} strokeWidth={2.6} />}{hpPortionLabel(portion)}
            </div>
          </div>
          {status === "passed" ? (
            <span style={{ color: OK, fontWeight: 800, fontSize: 13 }}><Check size={15} style={{ verticalAlign: -3 }} /> Memorized</span>
          ) : waiting ? (
            <button disabled={busy} onClick={async () => { const nx = nextAfter(sel); if (await allow([sel])) goNext(sel, nx); }} style={{ ...big(OK), flex: "none", padding: "10px 12px", fontSize: 13 }}><Check size={15} /> Allow</button>
          ) : (
            <button disabled={busy} onClick={() => mark(sel, "passed")} style={{ ...big(G), flex: "none", padding: "10px 12px", fontSize: 13 }}><CheckCheck size={15} /> Memorized</button>
          )}
          <button onClick={() => { setSel(null); setMini(false); }} aria-label="Close" style={closeBtn(false)}><X size={20} strokeWidth={2.6} /></button>
        </div>
      )}
    </>
  );
}
