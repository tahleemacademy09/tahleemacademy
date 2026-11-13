// src/pages/admin/HifdhModelTest.tsx
// ADMIN ONLY — Model testing lab for the Hifdh transcription models.
//   • Upload an audio file (or pick a real student recording) and run it through ONE, TWO or ALL THREE models
//   • See what each model heard, how long it took, a word-by-word grade against a reference (Quran page / pasted text),
//     the combined result, and the words every model gets wrong → what to improve
//   • Choose which models are live for students (same switches as Admin Settings → Hifdh)
//   • Download any student recording (or the uploaded file) to re-use it for model testing
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Upload, Play, Download, FlaskConical, Cloud, Smartphone, Zap, Check, Copy, FileDown, Mic, Search, RotateCcw,
} from "lucide-react";
import { useAsrSettings, saveAsrSetting, type AsrModel } from "@/lib/asrSettings";
import { whisperTranscribe } from "@/lib/whisperCloud";
import { tarteelEngine, type TarteelProgress } from "@/lib/tarteelOnDevice";
import { ctcEngine, type CtcStatusState, type CtcCheckProgress } from "@/lib/ctcEngine";
import { gradeFromCtc } from "@/lib/ctcGrading";
import type { CtcWordScore } from "@/lib/ctcAlign";
import { analyzeRecitation, refTokens, scoreOf, type WordResult, type Grade } from "@/lib/recitationCompare";
import { getPageText } from "@/lib/quranTextApi";
import { resolveStaffAudioUrl } from "@/lib/hifdhAudio";
import { loadTestState, saveTestAudio, saveTestMeta, clearTestState, trimToMinutes } from "@/lib/modelTestStore";
import { downloadAudio, fetchAudioBlob, saveBlob } from "@/lib/downloadAudio";

const G = "#064E3B", GM = "#075E54", GOLD = "#C9A84C", W = "#fff";
const PASS = "#16A34A", AMBER = "#D97706", FAIL = "#DC2626";

const MODELS: { id: AsrModel; label: string; short: string; sub: string; icon: React.ReactNode }[] = [
  { id: "whisper_cf", label: "Whisper-large-v3-turbo", short: "Whisper", sub: "Cloud · Cloudflare Workers AI", icon: <Cloud size={14} /> },
  { id: "tarteel", label: "Tarteel Whisper-base", short: "Tarteel", sub: "On this device · ~100 MB first load", icon: <Smartphone size={14} /> },
  { id: "ctc", label: "CTC skipped-word check", short: "CTC", sub: "On this device · ~132 MB first load · needs reference", icon: <Zap size={14} /> },
];

type RunStatus = "idle" | "running" | "done" | "error" | "skipped";
interface ModelRun { status: RunStatus; text: string; ms: number; note?: string; words?: WordResult[]; score?: number }
type Runs = Record<AsrModel, ModelRun>;
const emptyRuns = (): Runs => ({
  whisper_cf: { status: "idle", text: "", ms: 0 }, tarteel: { status: "idle", text: "", ms: 0 }, ctc: { status: "idle", text: "", ms: 0 },
});

interface SessionOpt { id: string; label: string; date: string; secs?: number | null; sd: any; pages: number[] }

const gradeColor = (g: Grade) => g === "ok" ? PASS : g === "close" ? AMBER : FAIL;
const gradeBg = (g: Grade) => g === "ok" ? "#DCFCE7" : g === "close" ? "#FEF3C7" : "#FEE2E2";
const fmtMs = (ms: number) => ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
const errText = (e?: string) => ({
  not_configured: "Cloud Whisper is not configured in this build (VITE_RECITATION_CHECK_URL).",
  auth: "Not signed in.", timeout: "Timed out.",
} as Record<string, string>)[e || ""] || (e || "Failed");

/** Parse "562", "562-565" or "562, 570" into page numbers (1-604). */
function parsePages(s: string): number[] {
  const out: number[] = [];
  for (const part of s.split(/[,\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d+)\s*[-–]\s*(\d+)$/);
    if (m) { for (let p = +m[1]; p <= Math.min(+m[2], +m[1] + 10); p++) out.push(p); }
    else if (/^\d+$/.test(part)) out.push(+part);
  }
  return [...new Set(out)].filter((p) => p >= 1 && p <= 604);
}

function Tog({ label, sub, checked, onChange, disabled }: { label: string; sub?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid #F3F4F6", opacity: disabled ? .5 : 1 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#374151" }}>{label}</p>
        {sub && <p style={{ margin: "2px 0 0", fontSize: 10.5, color: "#9CA3AF", lineHeight: 1.4 }}>{sub}</p>}
      </div>
      <button disabled={disabled} onClick={() => onChange(!checked)} aria-pressed={checked} style={{
        width: 46, height: 26, borderRadius: 13, border: "none", cursor: disabled ? "not-allowed" : "pointer", flexShrink: 0,
        background: checked ? PASS : "#D1D5DB", position: "relative", transition: "background .15s",
      }}>
        <span style={{ position: "absolute", top: 3, left: checked ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: W, transition: "left .15s" }} />
      </button>
    </div>
  );
}

const Card = ({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) => (
  <div style={{ background: W, borderRadius: 16, border: "1.5px solid #E5E7EB", padding: "14px 14px 16px", boxShadow: "0 1px 6px rgba(0,0,0,.04)" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
      <h2 style={{ margin: 0, flex: 1, fontSize: 14, fontWeight: 800, color: G }}>{title}</h2>{right}
    </div>
    {children}
  </div>
);

function WordChips({ words }: { words: WordResult[] }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, direction: "rtl", fontFamily: "'Amiri',serif" }}>
      {words.map((w, i) => (
        <span key={i} title={w.heard ? `heard: ${w.heard}` : w.grade} style={{
          padding: "2px 7px", borderRadius: 6, fontSize: 17, lineHeight: 1.7,
          background: gradeBg(w.grade), color: gradeColor(w.grade), border: `1px solid ${gradeColor(w.grade)}33`,
        }}>{w.word}</span>
      ))}
    </div>
  );
}

export default function HifdhModelTest() {
  const { toast } = useToast();
  const asr = useAsrSettings();
  const [adminId, setAdminId] = useState<string | undefined>();
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setAdminId(data.user?.id)); }, []);

  /* models used in THIS test */
  const [use, setUse] = useState<Record<AsrModel, boolean>>({ whisper_cf: true, tarteel: true, ctc: true });
  /* audio under test */
  const [blob, setBlob] = useState<Blob | null>(null);
  const [audioName, setAudioName] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  /* reference */
  const [pageInput, setPageInput] = useState("");
  const [refText, setRefText] = useState("");
  const [loadingRef, setLoadingRef] = useState(false);
  /* results */
  const [runs, setRuns] = useState<Runs>(emptyRuns());
  const [running, setRunning] = useState(false);
  const [tProg, setTProg] = useState<TarteelProgress>({ status: "idle" });
  useEffect(() => tarteelEngine.subscribe(setTProg), []);
  const [ctcState, setCtcState] = useState<CtcStatusState>(ctcEngine.state);
  const [ctcProg, setCtcProg] = useState<CtcCheckProgress | null>(null);
  useEffect(() => ctcEngine.subscribe(setCtcState), []);
  useEffect(() => ctcEngine.subscribeProgress(setCtcProg), []);
  /* speed + persistence */
  const [limitMin, setLimitMin] = useState(0);            // 0 = whole recording
  const [ready, setReady] = useState(false);              // saved test loaded from the browser
  const [resumeIds, setResumeIds] = useState<AsrModel[] | null>(null);
  const [restored, setRestored] = useState<string | null>(null);
  const startedAt = useRef<Record<string, number>>({});
  /* CTC strictness: the last raw CTC scores are kept so the cut-offs can be moved and the grid re-graded instantly */
  const [ctcRaw, setCtcRaw] = useState<{ words: CtcWordScore[]; heard?: string[]; ref: string[] } | null>(null);
  const [thr, setThr] = useState({ ok: -1, bad: -3 });
  const thrRef = useRef(thr);
  thrRef.current = thr;
  const [, setTick] = useState(0);
  /* student recordings */
  const [sessions, setSessions] = useState<SessionOpt[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [sessSearch, setSessSearch] = useState("");
  const [showSessions, setShowSessions] = useState(false);
  const [loadingAudio, setLoadingAudio] = useState<string | null>(null);

  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);

  /* ── restore the last test after a refresh ── */
  useEffect(() => {
    let alive = true;
    loadTestState().then(({ meta, audio }) => {
      if (!alive) return;
      if (meta) {
        setPageInput(meta.pageInput || ""); setRefText(meta.refText || "");
        if (meta.use) setUse((u) => ({ ...u, ...meta.use }));
        setLimitMin(meta.limitMin || 0);
        setRuns({ ...emptyRuns(), ...meta.runs });
        if (audio) {
          setBlob(audio); setAudioName(meta.audioName || "saved-audio"); setAudioUrl(URL.createObjectURL(audio));
          const interrupted = (Object.keys(meta.runs || {}) as AsrModel[]).filter((id) => meta.use?.[id] && meta.runs[id]?.status === "running");
          if (meta.pending && interrupted.length) { setResumeIds(interrupted); setRestored("Your test was interrupted by the refresh — resuming the unfinished models. Finished results were kept."); }
          else setRestored("Your last test was restored.");
        }
      }
      setReady(true);
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {   // the audio file itself is stored once, when it changes
    if (ready) void saveTestAudio(blob);
  }, [ready, blob]);

  useEffect(() => {   // everything else, saved as it changes (so every finished model is kept at once)
    if (!ready) return;
    const t = setTimeout(() => {
      void saveTestMeta({ audioName, pageInput, refText, use, runs, limitMin, pending: running, savedAt: Date.now() });
    }, 300);
    return () => clearTimeout(t);
  }, [ready, audioName, pageInput, refText, use, runs, limitMin, running]);

  useEffect(() => {   // live "elapsed" counter while models work
    if (!running) return;
    const i = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(i);
  }, [running]);

  const setAudio = (b: Blob, name: string) => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setBlob(b); setAudioName(name); setAudioUrl(URL.createObjectURL(b)); setRuns(emptyRuns());
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = "";
    if (f) setAudio(f, f.name);
  };

  const loadRefPages = async (pages: number[]) => {
    if (!pages.length) { toast({ title: "Enter a page number (1–604), e.g. 562 or 562-565", variant: "destructive" }); return; }
    setLoadingRef(true);
    try {
      const texts: string[] = [];
      for (const p of pages) {
        const verses = await getPageText(p, false);
        texts.push(verses.map((v) => v.text).join(" "));
      }
      setRefText(texts.join(" "));
      setPageInput(pages.length > 1 ? `${pages[0]}-${pages[pages.length - 1]}` : String(pages[0]));
    } catch (e: any) {
      toast({ title: "Could not load the page text", description: e?.message, variant: "destructive" });
    }
    setLoadingRef(false);
  };

  /* ── load recent student recordings ── */
  const openSessions = async () => {
    setShowSessions((v) => !v);
    if (sessions.length || loadingSessions) return;
    setLoadingSessions(true);
    try {
      const { data: logs } = await (supabase as any).from("hifdh_daily_logs").select("id,student_id,log_date,duration_secs,session_data")
        .order("log_date", { ascending: false }).limit(120);
      const withAudio = (logs || []).map((l: any) => ({ ...l, sd: typeof l.session_data === "string" ? JSON.parse(l.session_data) : l.session_data }))
        .filter((l: any) => l.sd?.audio_path || l.sd?.audio_url).slice(0, 60);
      const ids = [...new Set(withAudio.map((l: any) => l.student_id))];
      const { data: profs } = ids.length ? await (supabase as any).from("profiles").select("user_id,full_name").in("user_id", ids) : { data: [] };
      const names: Record<string, string> = {};
      (profs || []).forEach((p: any) => { names[p.user_id] = p.full_name || "Student"; });
      setSessions(withAudio.map((l: any) => ({
        id: l.id, label: names[l.student_id] || "Student", date: l.log_date, secs: l.duration_secs, sd: l.sd,
        pages: Array.isArray(l.sd?.pages_done) ? l.sd.pages_done : (l.sd?.page_results || []).map((p: any) => p.pageNum).filter(Boolean),
      })));
    } catch (e) { console.error(e); }
    setLoadingSessions(false);
  };

  const pickSession = async (s: SessionOpt) => {
    setLoadingAudio(s.id);
    try {
      const url = await resolveStaffAudioUrl(s.sd);
      if (!url) throw new Error("No playable recording for this session");
      const b = await fetchAudioBlob(url);
      setAudio(b, `${s.label}-${s.date}`);
      if (s.pages.length) await loadRefPages(s.pages.slice(0, 5));
      setShowSessions(false);
    } catch (e: any) {
      toast({ title: "Could not load recording", description: e?.message, variant: "destructive" });
    }
    setLoadingAudio(null);
  };

  const downloadSession = async (s: SessionOpt) => {
    const url = await resolveStaffAudioUrl(s.sd);
    if (!url) { toast({ title: "No recording for this session", variant: "destructive" }); return; }
    await downloadAudio(url, `${s.label}-${s.date}`);
  };

  /* ── run the selected models ── */
  const selected = (MODELS.map((m) => m.id) as AsrModel[]).filter((id) => use[id]);
  const refWordsArr = useMemo(() => (refText.trim() ? refTokens(refText) : []), [refText]);

  const patch = (id: AsrModel, p: Partial<ModelRun>) => setRuns((r) => ({ ...r, [id]: { ...r[id], ...p } }));

  const gradeText = (id: AsrModel, text: string, ms: number) => {
    if (!refText.trim() || !text.trim()) { patch(id, { status: "done", text, ms }); return; }
    const words = analyzeRecitation(refText, text).words;
    patch(id, { status: "done", text, ms, words, score: scoreOf(words) });
  };

  const runOne = async (id: AsrModel, input: Blob) => {
    const t0 = performance.now();
    startedAt.current[id] = t0;
    try {
      if (id === "whisper_cf") {
        const r = await whisperTranscribe(input);
        if (r.error) patch(id, { status: "error", ms: r.ms, note: errText(r.error) });
        else gradeText(id, r.text, r.ms);
      } else if (id === "tarteel") {
        const r = await tarteelEngine.transcribeBlob(input);
        if (r.error) patch(id, { status: "error", ms: Math.round(performance.now() - t0), note: errText(r.error) });
        else gradeText(id, r.text, r.ms ?? Math.round(performance.now() - t0));
      } else {
        if (!refWordsArr.length) { patch(id, { status: "skipped", note: "CTC checks each reference word, so it needs a reference — load a Quran page or paste the text." }); return; }
        const r = await ctcEngine.check(input, refWordsArr, { basmalah: "auto" });
        setCtcRaw({ words: r.words, heard: r.heard, ref: refWordsArr });
        const words = gradeFromCtc(refWordsArr, r.words, r.heard, thrRef.current.ok, thrRef.current.bad);
        patch(id, { status: "done", text: r.greedy || "", ms: r.ms ?? Math.round(performance.now() - t0), words, score: scoreOf(words),
          note: r.partial ? `Audio shorter than the text — only the first ${r.covered} words were graded.` : undefined });
      }
    } catch (e: any) {
      patch(id, { status: "error", ms: Math.round(performance.now() - t0), note: String(e?.message ?? e).slice(0, 160) });
    }
  };

  /** Run the chosen models. Cloud Whisper runs AT THE SAME TIME as the on-device models (they use different hardware);
   *  the two on-device models run one after the other so a phone is not overloaded. `only` = resume just those. */
  const run = async (only?: AsrModel[]) => {
    if (!blob) { toast({ title: "Add an audio file first", variant: "destructive" }); return; }
    const ids = only ?? selected;
    if (!ids.length) { toast({ title: "Select at least one model", variant: "destructive" }); return; }
    setRunning(true);
    setRestored(only ? restored : null);
    setRuns((r) => {
      const n = only ? { ...r } : emptyRuns();
      ids.forEach((id) => { n[id] = { status: "running", text: "", ms: 0 }; });
      return n;
    });
    let input: Blob = blob;
    if (limitMin > 0) {
      try { input = await trimToMinutes(blob, limitMin); } catch { input = blob; }
    }
    const cloud = ids.includes("whisper_cf") ? runOne("whisper_cf", input) : Promise.resolve();
    const local = (async () => { for (const id of ids.filter((i) => i !== "whisper_cf")) await runOne(id, input); })();
    await Promise.all([cloud, local]);
    setRunning(false);
  };

  // moving the CTC cut-offs re-grades the last CTC result on the spot
  useEffect(() => {
    if (!ctcRaw) return;
    const words = gradeFromCtc(ctcRaw.ref, ctcRaw.words, ctcRaw.heard, thr.ok, thr.bad);
    setRuns((r) => (r.ctc.status === "done" ? { ...r, ctc: { ...r.ctc, words, score: scoreOf(words) } } : r));
  }, [thr, ctcRaw]);

  // resume after a refresh
  useEffect(() => {
    if (!ready || !resumeIds || !blob) return;
    const ids = resumeIds; setResumeIds(null);
    void run(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, resumeIds, blob]);

  /* ── combine ── */
  const doneWithWords = selected.filter((id) => runs[id].status === "done" && runs[id].words?.length === refWordsArr.length && refWordsArr.length > 0);
  const combined = useMemo(() => {
    if (doneWithWords.length < 2) return null;
    const n = refWordsArr.length;
    const lenient: WordResult[] = [], strict: WordResult[] = [];
    const rank: Grade[] = ["missed", "wrong", "close", "ok"];
    for (let i = 0; i < n; i++) {
      const gs = doneWithWords.map((id) => runs[id].words![i]);
      const best = gs.reduce((a, b) => rank.indexOf(b.grade) > rank.indexOf(a.grade) ? b : a);
      const worst = gs.reduce((a, b) => rank.indexOf(b.grade) < rank.indexOf(a.grade) ? b : a);
      lenient.push(best); strict.push(worst);
    }
    return { lenient, strict };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs, refWordsArr.length]);

  /* ── what to improve ── */
  const insights = useMemo(() => {
    if (!doneWithWords.length) return null;
    const n = refWordsArr.length;
    const allMiss: string[] = [], disagree: { word: string; by: string }[] = [];
    for (let i = 0; i < n; i++) {
      const gs = doneWithWords.map((id) => runs[id].words![i].grade);
      const word = runs[doneWithWords[0]].words![i].word;
      if (gs.every((g) => g !== "ok")) allMiss.push(word);
      else if (doneWithWords.length > 1 && gs.some((g) => g !== "ok")) {
        disagree.push({ word, by: doneWithWords.filter((id, k) => gs[k] !== "ok").map((id) => MODELS.find((m) => m.id === id)!.short).join(", ") });
      }
    }
    return { allMiss, disagree };
  }, [runs, refWordsArr.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const reportText = () => {
    const lines = [`Model test — ${audioName || "audio"} — ${new Date().toLocaleString()}`, `Reference words: ${refWordsArr.length}`, ""];
    selected.forEach((id) => {
      const r = runs[id], m = MODELS.find((x) => x.id === id)!;
      lines.push(`## ${m.label} — ${r.status}${r.score != null ? ` — ${r.score}%` : ""}${r.ms ? ` — ${fmtMs(r.ms)}` : ""}`);
      if (r.note) lines.push(r.note);
      if (r.text) lines.push(r.text);
      if (r.words) {
        const bad = r.words.filter((w) => w.grade !== "ok");
        if (bad.length) lines.push("Not OK: " + bad.map((w) => `${w.word} [${w.grade}${w.heard ? `, heard ${w.heard}` : ""}]`).join(" · "));
      }
      lines.push("");
    });
    if (combined) {
      lines.push(`## Combined (${doneWithWords.map((id) => MODELS.find((m) => m.id === id)!.short).join(" + ")})`);
      lines.push(`Lenient (any model OK): ${scoreOf(combined.lenient)}%  ·  Strict (all models OK): ${scoreOf(combined.strict)}%`);
    }
    if (insights?.allMiss.length) lines.push("", "Missed by every model: " + insights.allMiss.join(" · "));
    return lines.join("\n");
  };

  const copyReport = async () => { try { await navigator.clipboard.writeText(reportText()); toast({ title: "Report copied" }); } catch { toast({ title: "Could not copy", variant: "destructive" }); } };
  const downloadReport = () => saveBlob(new Blob([reportText()], { type: "text/plain" }), `model-test-${Date.now()}`, "txt");

  const toggleLive = async (id: AsrModel, on: boolean) => {
    const { error } = await saveAsrSetting(id, on, adminId);
    if (error) toast({ title: "Could not save", description: error, variant: "destructive" });
    else toast({ title: `${MODELS.find((m) => m.id === id)!.short} ${on ? "enabled" : "disabled"} for students` });
  };
  const liveFlags: Record<AsrModel, boolean> = { whisper_cf: asr.whisper_cf, tarteel: asr.tarteel, ctc: asr.ctc };
  const liveCount = (Object.values(liveFlags) as boolean[]).filter(Boolean).length;

  const filteredSessions = sessions.filter((s) => !sessSearch || s.label.toLowerCase().includes(sessSearch.toLowerCase()));
  const liveNote = (id: AsrModel): string => {
    const el = startedAt.current[id] ? Math.round((performance.now() - startedAt.current[id]) / 1000) : 0;
    const t = `${el}s`;
    if (id === "whisper_cf") return `Converting + uploading audio, then the cloud model transcribes… ${t}`;
    if (id === "tarteel") return tProg.status === "loading"
      ? `Downloading the model (first time only, then it is cached)… ${tProg.loadedMB?.toFixed(0) ?? 0}/${tProg.totalMB?.toFixed(0) || "?"} MB · ${t}`
      : `Listening on this device… ${t}`;
    if (ctcState.status === "loading") return `Downloading the model (first time only, then it is cached)… ${ctcState.loadedMB?.toFixed(0) ?? 0}/${ctcState.totalMB?.toFixed(0) || "?"} MB · ${t}`;
    if (ctcProg) return `${ctcProg.stage}… ${ctcProg.total ? Math.round((ctcProg.done / ctcProg.total) * 100) + "% · " : ""}${t}`;
    return `Working on this device… ${t}`;
  };
  const tarteelStatus = tProg.status === "loading" ? `Loading Tarteel… ${tProg.loadedMB?.toFixed(0) ?? 0}/${tProg.totalMB?.toFixed(0) || "?"} MB` : null;

  return (
    <div style={{ minHeight: "100vh", background: "#F3F4F6", fontFamily: "system-ui,sans-serif" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ background: `linear-gradient(135deg,${G},${GM})`, padding: "20px 18px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <FlaskConical size={22} color={GOLD} />
          <h1 style={{ margin: 0, fontSize: 19, fontWeight: 900, color: W }}>Model Testing — Admin</h1>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,.7)" }}>
          Test the transcription models on any audio, compare them, and choose which ones students use
        </p>
      </div>

      <div style={{ maxWidth: 920, margin: "14px auto", padding: "0 14px 48px", display: "flex", flexDirection: "column", gap: 12 }}>

        {restored && (
          <div style={{ padding: "10px 14px", borderRadius: 12, background: "#ECFDF5", border: "1.5px solid #6EE7B7", fontSize: 12, fontWeight: 600, color: G, display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ flex: 1 }}>💾 {restored}</span>
            <button onClick={() => setRestored(null)} style={{ ...iconBtn, width: 26, height: 26 }} aria-label="Dismiss">✕</button>
          </div>
        )}

        {/* 1 — AUDIO */}
        <Card title="1 · Audio">
          <input ref={fileRef} type="file" accept="audio/*,video/webm,video/mp4,.m4a,.mp3,.wav,.ogg,.webm,.aac" onChange={onFile} style={{ display: "none" }} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => fileRef.current?.click()} style={btn(true)}><Upload size={14} />Upload audio</button>
            <button onClick={openSessions} style={btn(false)}><Mic size={14} />Student recordings</button>
          </div>

          {showSessions && (
            <div style={{ marginTop: 10, border: "1.5px solid #E5E7EB", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ position: "relative", borderBottom: "1px solid #E5E7EB" }}>
                <Search size={12} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
                <input value={sessSearch} onChange={(e) => setSessSearch(e.target.value)} placeholder="Search student…"
                  style={{ width: "100%", boxSizing: "border-box", padding: "9px 10px 9px 28px", border: "none", outline: "none", fontSize: 12 }} />
              </div>
              <div style={{ maxHeight: 280, overflowY: "auto" }}>
                {loadingSessions ? <p style={{ padding: 14, margin: 0, fontSize: 12, color: "#9CA3AF" }}>Loading…</p>
                  : filteredSessions.length === 0 ? <p style={{ padding: 14, margin: 0, fontSize: 12, color: "#9CA3AF" }}>No recordings found</p>
                  : filteredSessions.map((s) => (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderBottom: "1px solid #F3F4F6" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: "#1F2937", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.label}</div>
                        <div style={{ fontSize: 10.5, color: "#9CA3AF" }}>{s.date}{s.secs ? ` · ${Math.floor(s.secs / 60)}m ${s.secs % 60}s` : ""}{s.pages.length ? ` · p.${s.pages.join(", ")}` : ""}</div>
                      </div>
                      <button onClick={() => downloadSession(s)} title="Download" style={iconBtn}><Download size={14} /></button>
                      <button onClick={() => pickSession(s)} disabled={loadingAudio === s.id} style={{ ...btn(true), padding: "7px 12px", fontSize: 11 }}>
                        {loadingAudio === s.id ? <Loader2 size={12} style={{ animation: "spin .8s linear infinite" }} /> : "Use"}
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {blob && audioUrl && (
            <div style={{ marginTop: 12, padding: 10, borderRadius: 12, background: "#F9FAFB", border: "1px solid #E5E7EB" }}>
              <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 700, color: G, wordBreak: "break-all" }}>🎙 {audioName} <span style={{ color: "#9CA3AF", fontWeight: 500 }}>· {(blob.size / 1048576).toFixed(1)} MB</span></p>
              <audio src={audioUrl} controls style={{ width: "100%", height: 38 }} />
              <button onClick={() => saveBlob(blob, audioName.replace(/\.[^.]+$/, ""))} style={{ ...btn(false), marginTop: 8, padding: "7px 12px", fontSize: 11 }}><Download size={12} />Download this audio</button>
              <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: "#374151" }}>Test only the first</label>
                <input type="number" min={0} step={1} value={limitMin || ""} placeholder="all"
                  onChange={(e) => setLimitMin(Math.max(0, Number(e.target.value) || 0))}
                  style={{ width: 64, padding: "6px 8px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 13, outline: "none" }} />
                <span style={{ fontSize: 11.5, color: "#6B7280" }}>minutes (faster — leave empty for the whole recording)</span>
              </div>
              {ctcRaw && (
                <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: "#fff", border: "1px solid #E5E7EB" }}>
                  <p style={{ margin: "0 0 6px", fontSize: 11.5, fontWeight: 700, color: "#374151" }}>CTC strictness (this test only)</p>
                  <label style={{ display: "block", fontSize: 11, color: "#6B7280" }}>Green from {thr.ok.toFixed(1)} and above
                    <input type="range" min={-4} max={0} step={0.1} value={thr.ok}
                      onChange={(e) => { const v = Number(e.target.value); setThr((t) => ({ ok: v, bad: Math.min(t.bad, v - 0.1) })); }}
                      style={{ width: "100%" }} />
                  </label>
                  <label style={{ display: "block", fontSize: 11, color: "#6B7280", marginTop: 4 }}>Red below {thr.bad.toFixed(1)}
                    <input type="range" min={-10} max={-1} step={0.1} value={thr.bad}
                      onChange={(e) => { const v = Number(e.target.value); setThr((t) => ({ ok: Math.max(t.ok, v + 0.1), bad: v })); }}
                      style={{ width: "100%" }} />
                  </label>
                  <p style={{ margin: "4px 0 0", fontSize: 10.5, color: "#9CA3AF" }}>Yellow sits between the two. Lower values are more forgiving. The app uses green ≥ -1.0 and red < -3.0. Lost on refresh: run CTC again.</p>
                  <button onClick={() => setThr({ ok: -1, bad: -3 })} style={{ ...btn(false), marginTop: 6, padding: "5px 10px", fontSize: 10.5 }}>Reset to app values</button>
                </div>
              )}
              <button onClick={async () => { await clearTestState(); if (audioUrl) URL.revokeObjectURL(audioUrl); setBlob(null); setAudioUrl(null); setAudioName(""); setRuns(emptyRuns()); setCtcRaw(null); setRefText(""); setPageInput(""); setLimitMin(0); setRestored(null); }}
                style={{ ...btn(false), marginTop: 8, padding: "7px 12px", fontSize: 11, color: FAIL, borderColor: "#FECACA" }}>Clear saved test</button>
            </div>
          )}
        </Card>

        {/* 2 — REFERENCE */}
        <Card title="2 · Reference (optional)">
          <p style={{ margin: "0 0 8px", fontSize: 11, color: "#6B7280", lineHeight: 1.5 }}>
            With a reference, every model is graded word-by-word and CTC can run. Without one you only get the raw transcripts.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={pageInput} onChange={(e) => setPageInput(e.target.value)} placeholder="Quran page e.g. 562 or 562-565" inputMode="numeric"
              style={{ flex: 1, minWidth: 0, padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E5E7EB", fontSize: 13, outline: "none" }} />
            <button onClick={() => loadRefPages(parsePages(pageInput))} disabled={loadingRef} style={btn(false)}>
              {loadingRef ? <Loader2 size={13} style={{ animation: "spin .8s linear infinite" }} /> : "Load"}
            </button>
          </div>
          <textarea value={refText} onChange={(e) => setRefText(e.target.value)} placeholder="…or paste the Arabic text that was recited"
            dir="rtl" rows={4} style={{ width: "100%", boxSizing: "border-box", marginTop: 8, padding: 10, borderRadius: 10, border: "1.5px solid #E5E7EB",
              fontSize: 17, fontFamily: "'Amiri',serif", outline: "none", resize: "vertical" }} />
          {refWordsArr.length > 0 && <p style={{ margin: "4px 0 0", fontSize: 10.5, color: "#9CA3AF" }}>{refWordsArr.length} words</p>}
        </Card>

        {/* 3 — MODELS */}
        <Card title="3 · Models to test">
          <p style={{ margin: "0 0 6px", fontSize: 11, color: "#6B7280" }}>Tick one, two or all three. Results show side by side and combined.</p>
          {MODELS.map((m) => {
            const unavailable = m.id === "whisper_cf" && !asr.whisperConfigured;
            return (
              <label key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid #F3F4F6", opacity: unavailable ? .5 : 1 }}>
                <input type="checkbox" checked={use[m.id] && !unavailable} disabled={unavailable} onChange={(e) => setUse((u) => ({ ...u, [m.id]: e.target.checked }))}
                  style={{ width: 20, height: 20, accentColor: G }} />
                <span style={{ color: G, display: "flex" }}>{m.icon}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#374151" }}>{m.label}</span>
                  <span style={{ display: "block", fontSize: 10.5, color: "#9CA3AF" }}>{unavailable ? "Not configured in this build" : m.sub}</span>
                </span>
              </label>
            );
          })}
          <button onClick={() => run()} disabled={running || !blob || !selected.length} style={{ ...btn(true), width: "100%", justifyContent: "center", marginTop: 12, padding: "12px", fontSize: 13,
            opacity: running || !blob || !selected.length ? .55 : 1 }}>
            {running ? <><Loader2 size={15} style={{ animation: "spin .8s linear infinite" }} />Running…</> : <><Play size={15} />Run test ({selected.length} model{selected.length !== 1 ? "s" : ""})</>}
          </button>
          {tarteelStatus && <p style={{ margin: "8px 0 0", fontSize: 11, color: AMBER, fontWeight: 600 }}>{tarteelStatus}</p>}
        </Card>

        {/* RESULTS */}
        {selected.some((id) => runs[id].status !== "idle") && (
          <Card title="Results" right={
            <>
              <button onClick={copyReport} style={iconBtn} title="Copy report"><Copy size={14} /></button>
              <button onClick={downloadReport} style={iconBtn} title="Download report"><FileDown size={14} /></button>
              <button onClick={() => setRuns(emptyRuns())} style={iconBtn} title="Clear"><RotateCcw size={14} /></button>
            </>}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {selected.map((id) => {
                const r = runs[id], m = MODELS.find((x) => x.id === id)!;
                return (
                  <div key={id} style={{ border: "1.5px solid #E5E7EB", borderRadius: 12, overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: `${G}08` }}>
                      <span style={{ color: G, display: "flex" }}>{m.icon}</span>
                      <b style={{ flex: 1, fontSize: 13, color: G }}>{m.short}</b>
                      {r.status === "running" && <Loader2 size={14} color={GOLD} style={{ animation: "spin .8s linear infinite" }} />}
                      {r.ms > 0 && <span style={{ fontSize: 11, color: "#6B7280" }}>{fmtMs(r.ms)}</span>}
                      {r.score != null && <span style={{ fontWeight: 900, fontSize: 15, color: r.score >= 70 ? PASS : r.score >= 50 ? AMBER : FAIL }}>{r.score}%</span>}
                    </div>
                    <div style={{ padding: "10px 12px" }}>
                      {r.status === "running" && <p style={{ margin: 0, fontSize: 12, color: "#9CA3AF" }}>{liveNote(id)}</p>}
                      {r.status === "error" && <p style={{ margin: 0, fontSize: 12, color: FAIL, fontWeight: 600 }}>⚠️ {r.note}</p>}
                      {r.status === "skipped" && <p style={{ margin: 0, fontSize: 12, color: AMBER, fontWeight: 600 }}>{r.note}</p>}
                      {r.status === "done" && (
                        <>
                          {r.words && r.words.length > 0 ? <WordChips words={r.words} /> : null}
                          <p style={{ margin: r.words ? "10px 0 3px" : "0 0 3px", fontSize: 10, fontWeight: 800, color: "#6B7280", textTransform: "uppercase", letterSpacing: .4 }}>What it heard</p>
                          <p dir="rtl" style={{ margin: 0, fontSize: 16, lineHeight: 1.9, fontFamily: "'Amiri',serif", color: "#374151", background: "#F9FAFB", borderRadius: 8, padding: "6px 10px" }}>
                            {r.text || <i style={{ color: "#9CA3AF", fontFamily: "system-ui", fontSize: 12 }}>Nothing heard</i>}
                          </p>
                          {r.note && <p style={{ margin: "6px 0 0", fontSize: 11, color: AMBER }}>{r.note}</p>}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}

              {combined && (
                <div style={{ border: `2px solid ${GOLD}88`, borderRadius: 12, padding: "10px 12px", background: `${GOLD}10` }}>
                  <b style={{ fontSize: 13, color: G }}>Combined · {doneWithWords.map((id) => MODELS.find((m) => m.id === id)!.short).join(" + ")}</b>
                  <div style={{ display: "flex", gap: 8, margin: "8px 0" }}>
                    <div style={statBox}><div style={{ fontSize: 20, fontWeight: 900, color: PASS }}>{scoreOf(combined.lenient)}%</div><div style={statLbl}>Lenient · any model OK</div></div>
                    <div style={statBox}><div style={{ fontSize: 20, fontWeight: 900, color: AMBER }}>{scoreOf(combined.strict)}%</div><div style={statLbl}>Strict · all models OK</div></div>
                  </div>
                  <WordChips words={combined.lenient} />
                </div>
              )}

              {insights && (
                <div style={{ border: "1.5px solid #E5E7EB", borderRadius: 12, padding: "10px 12px", background: W }}>
                  <b style={{ fontSize: 13, color: G }}>🔧 What to improve</b>
                  <p style={{ margin: "8px 0 3px", fontSize: 10, fontWeight: 800, color: FAIL, textTransform: "uppercase" }}>Missed / wrong in every model ({insights.allMiss.length})</p>
                  {insights.allMiss.length ? (
                    <p dir="rtl" style={{ margin: 0, fontSize: 17, fontFamily: "'Amiri',serif", lineHeight: 1.9, color: "#374151" }}>{insights.allMiss.join(" · ")}</p>
                  ) : <p style={{ margin: 0, fontSize: 12, color: "#9CA3AF" }}>None — no word failed in all models.</p>}
                  {insights.disagree.length > 0 && (
                    <>
                      <p style={{ margin: "10px 0 3px", fontSize: 10, fontWeight: 800, color: AMBER, textTransform: "uppercase" }}>Models disagree ({insights.disagree.length})</p>
                      <div dir="rtl" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {insights.disagree.map((d, i) => (
                          <span key={i} style={{ fontFamily: "'Amiri',serif", fontSize: 16, padding: "1px 8px", borderRadius: 6, background: "#FEF3C7" }}>
                            {d.word} <small dir="ltr" style={{ fontFamily: "system-ui", fontSize: 9, color: "#92400E" }}>({d.by} not OK)</small>
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </Card>
        )}

        {/* 4 — LIVE */}
        <Card title="Models live for students">
          <p style={{ margin: "0 0 4px", fontSize: 11, color: "#6B7280", lineHeight: 1.5 }}>
            Choose which models the Hifdh daily revision uses — all three, any two, or just one. Saves immediately (same switches as Admin Settings → Hifdh).
            Whisper runs first; if it is off or fails, the on-device models take over.
          </p>
          {MODELS.map((m) => (
            <Tog key={m.id} label={`${m.short} — ${m.label}`} sub={m.sub} checked={liveFlags[m.id]} onChange={(v) => toggleLive(m.id, v)}
              disabled={m.id === "whisper_cf" && !asr.whisperConfigured} />
          ))}
          <p style={{ margin: "8px 0 0", fontSize: 11, fontWeight: 700, color: liveCount === 0 ? FAIL : G }}>
            {liveCount === 0 ? "⚠️ All models are off — students will not get transcription." : <><Check size={11} style={{ verticalAlign: "-1px" }} /> {liveCount} model{liveCount !== 1 ? "s" : ""} active for students</>}
          </p>
        </Card>
      </div>
    </div>
  );
}

const btn = (primary: boolean): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: 10, cursor: "pointer", fontSize: 12.5, fontWeight: 800,
  border: primary ? "none" : `1.5px solid ${G}44`, background: primary ? `linear-gradient(135deg,${G},${GM})` : W, color: primary ? W : G,
});
const iconBtn: React.CSSProperties = { width: 32, height: 32, borderRadius: 8, border: "1.5px solid #E5E7EB", background: W, color: G, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" };
const statBox: React.CSSProperties = { flex: 1, background: W, borderRadius: 10, padding: "8px 10px", textAlign: "center", border: "1px solid #E5E7EB" };
const statLbl: React.CSSProperties = { fontSize: 9.5, color: "#6B7280", fontWeight: 700, textTransform: "uppercase" };
