/*  src/pages/student/RecitationTest.tsx
    3-Stage Recitation Proficiency Test
    Stage 1: Record audio
    Stage 2: Scoring — score shown as PREVIEW only (not saved)
             User must press "Submit Score" to confirm and advance.
             Refreshing before submit = back to Stage 1 (re-record).
    Stage 3: Book virtual session with admin → advance to level_assignment
*/
import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { uploadExamAudioToR2 } from "@/lib/examAudioUpload";
import { useToast } from "@/hooks/use-toast";
import { useRecitationSettings } from "@/hooks/useRecitationSettings";
import { useTasjeel, TASJEEL_ROUTES } from "@/hooks/useTasjeel";
import MushafPageView from "@/components/hifdh/MushafPageView";
import {
  Mic, CheckCircle2, Video, Clock,
  Star, ArrowRight, Loader2, RotateCcw, BookOpen,
  AlertCircle, Calendar, Send, ChevronRight, Play, Pause,
} from "lucide-react";

const G    = "#064E3B";
const GM   = "#075E54";
const GOLD = "#D4A843";
// Recitation recordings are stored in Cloudflare R2 (via the exam-audio-url edge function).
// Transcription goes through the `groq-transcribe` edge function — the same one the
// Daily Hifdh Revision uses — so no API key ever lives in the browser.
const QURAN_STYLE_PROMPT =
  "قرآن كريم بالتشكيل الكامل. تلاوة قرآنية بالرسم العثماني. صَ ضَ طَ ظَ إِ أَ ئَ ؤَ";
const TRANSCRIBE_TIMEOUT_MS = 90_000;
const UPLOAD_TIMEOUT_MS     = 30_000;

const withTimeout = <T,>(p: Promise<T>, ms: number, label: string): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });

/** Transcribes one recording. Returns "" for silence, null if the service failed. */
async function transcribeRecitation(blob: Blob): Promise<string | null> {
  const url = (import.meta as any).env?.VITE_SUPABASE_URL;
  const key = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  const ext = blob.type.includes("mp4") ? "mp4" : blob.type.includes("ogg") ? "ogg" : "webm";
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TRANSCRIBE_TIMEOUT_MS);
    try {
      const fd = new FormData();
      fd.append("file", new File([blob], `recitation.${ext}`, { type: blob.type || "audio/webm" }));
      fd.append("prompt", QURAN_STYLE_PROMPT);
      const r = await fetch(`${url}/functions/v1/groq-transcribe`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, apikey: key },
        body: fd,
        signal: ctrl.signal,
      });
      if (r.ok) {
        const j = await r.json().catch(() => ({}));
        return String(j.text ?? "").trim();
      }
    } catch { /* retry once */ }
    finally { clearTimeout(timer); }
  }
  return null;
}

// ── Local playback (works for MediaRecorder WebM, which has no duration header) ──
function LocalAudioPlayer({ src, fallbackSecs }: { src: string; fallbackSecs: number }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(Math.max(1, fallbackSecs));
  const [err, setErr] = useState(false);

  useEffect(() => { setPlaying(false); setCur(0); setErr(false); setDur(Math.max(1, fallbackSecs)); }, [src, fallbackSecs]);

  const realDur = () => {
    const d = ref.current?.duration;
    return d && isFinite(d) && d > 0 ? d : Math.max(1, fallbackSecs);
  };
  const toggle = async () => {
    const a = ref.current; if (!a) return;
    if (a.paused) { try { setErr(false); await a.play(); } catch { setErr(true); } }
    else a.pause();
  };
  const seek = (v: number) => {
    const a = ref.current; if (!a) return;
    try { a.currentTime = v; } catch { /* noop */ }
    setCur(v);
  };
  const t = (n: number) => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, "0")}`;
  const shownCur = Math.min(cur, dur);

  return (
    <div style={{ display:"flex", alignItems:"center", gap:12, background:"#F0FDF4", border:"1px solid #BBF7D0", borderRadius:14, padding:"8px 12px", marginBottom:10 }}>
      <audio
        ref={ref} src={src} preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCur(0); }}
        onLoadedMetadata={() => setDur(realDur())}
        onTimeUpdate={e => { setCur(e.currentTarget.currentTime); const d = realDur(); if (d > dur) setDur(d); }}
        onError={() => setErr(true)}
      />
      <button onClick={toggle} aria-label={playing ? "Pause" : "Play your recording"}
        style={{ width:42, height:42, borderRadius:"50%", border:"none", background:G, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
        {playing ? <Pause size={18} fill="#fff" /> : <Play size={18} fill="#fff" style={{ marginLeft:2 }} />}
      </button>
      <div style={{ flex:1, minWidth:0 }}>
        <input type="range" min={0} max={dur} step={0.1} value={shownCur}
          onChange={e => seek(parseFloat(e.target.value))}
          style={{ width:"100%", accentColor:G, display:"block" }} />
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"#166534", fontWeight:700, marginTop:2 }}>
          <span>{t(shownCur)}</span>
          <span>{err ? "Tap play to retry" : t(dur)}</span>
        </div>
      </div>
    </div>
  );
}

const WAVE_H = [4,8,14,10,18,12,6,16,9,13,7,15,11,5,17,8,12,6,14,10];

// ── Arabic text utilities ────────────────────────────────────────────────────
function normalizeArabic(s: string): string {
  return s
    // Remove all tashkeel / diacritics
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g, "")
    // Normalize Alef variants
    .replace(/[أإآٱ]/g, "ا")
    // Normalize Ta marbuta → Ha
    .replace(/ة/g, "ه")
    // Normalize Alef maqsura → Ya
    .replace(/ى/g, "ي")
    // Normalize Waw variants
    .replace(/ؤ/g, "و")
    // Normalize Ya variants
    .replace(/ئ/g, "ي")
    // Strip non-Arabic chars (keep spaces)
    .replace(/[^\u0600-\u06FF\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  // Rolling array O(n) space
  const dp = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = i - 1;
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1]
        ? prev
        : 1 + Math.min(prev, dp[j - 1], dp[j]);
      prev = tmp;
    }
  }
  return dp[n];
}

interface ScoreBreakdown {
  total: number;
  coverage: number;   // % of reference words recited
  accuracy: number;   // precision of what was heard
  fluency: number;    // pronunciation similarity
}

/**
 * Score a recitation against a reference text.
 * Uses LCS (Longest Common Subsequence) for order-aware word matching,
 * fuzzy edit-distance fallback, and Deepgram per-word confidence for fluency.
 */
function scoreRecitation(
  transcript: string,
  reference: string,
  wordConfidences: number[] = []
): ScoreBreakdown {
  const refNorm = normalizeArabic(reference);
  const gotNorm = normalizeArabic(transcript);

  const refWords = refNorm.split(" ").filter(w => w.length >= 2);
  const gotWords = gotNorm.split(" ").filter(w => w.length >= 2);

  if (!refWords.length || !gotWords.length) {
    return { total: 0, coverage: 0, accuracy: 0, fluency: 0 };
  }

  // ── LCS with fuzzy fallback ──────────────────────────────────────────────
  // dp[i][j] = best match count for refWords[0..i-1] vs gotWords[0..j-1]
  const R = refWords.length, G2 = gotWords.length;
  // Use flat array for speed
  const dp = new Float32Array((R + 1) * (G2 + 1));
  for (let i = 1; i <= R; i++) {
    for (let j = 1; j <= G2; j++) {
      const exact = refWords[i - 1] === gotWords[j - 1];
      if (exact) {
        dp[i * (G2 + 1) + j] = dp[(i - 1) * (G2 + 1) + (j - 1)] + 1;
      } else {
        // Fuzzy: within 1 edit AND word length > 2 → 0.7 credit
        const ed = editDistance(refWords[i - 1], gotWords[j - 1]);
        const len = Math.min(refWords[i - 1].length, gotWords[j - 1].length);
        const fuzzyCredit = (ed <= 1 && len > 2) ? 0.7 : (ed <= 2 && len > 4) ? 0.4 : 0;
        const skip = Math.max(
          dp[(i - 1) * (G2 + 1) + j],
          dp[i * (G2 + 1) + (j - 1)]
        );
        dp[i * (G2 + 1) + j] = Math.max(
          skip,
          dp[(i - 1) * (G2 + 1) + (j - 1)] + fuzzyCredit
        );
      }
    }
  }

  const lcsLen = dp[R * (G2 + 1) + G2];
  const coverage  = Math.round((lcsLen / R) * 100);   // recall
  const precision = Math.round((lcsLen / G2) * 100);  // precision
  const accuracy  = Math.round(coverage * 0.65 + precision * 0.35);

  // ── Fluency score ─────────────────────────────────────────────────────────
  let fluency: number;
  if (wordConfidences.length > 0) {
    // Deepgram gives per-word confidence 0–1 → scale to 0–100
    fluency = Math.round(
      (wordConfidences.reduce((a, b) => a + b, 0) / wordConfidences.length) * 100
    );
  } else {
    // Estimate: for each recited word, find closest reference word
    // and compute 1 - (editDist / wordLen) similarity
    let simSum = 0, simCount = 0;
    gotWords.forEach(got => {
      let bestSim = 0;
      for (const ref of refWords) {
        const ed  = editDistance(got, ref);
        const len = Math.max(got.length, ref.length, 1);
        const sim = Math.max(0, 1 - ed / len);
        if (sim > bestSim) bestSim = sim;
      }
      if (bestSim > 0.4) { simSum += bestSim; simCount++; }
    });
    fluency = simCount > 0 ? Math.round((simSum / simCount) * 100) : 55;
  }

  const total = Math.round(accuracy * 0.6 + fluency * 0.4);
  return {
    total:    Math.min(100, Math.max(0, total)),
    coverage: Math.min(100, coverage),
    accuracy: Math.min(100, accuracy),
    fluency:  Math.min(100, fluency),
  };
}

const RecitationTest = () => {
  const { user, profile }  = useAuth();
  const { toast }          = useToast();
  const navigate           = useNavigate();
  const { settings, loading: settingsLoading } = useRecitationSettings();
  const { currentStep, loading: stepLoading, advanceStep } = useTasjeel();

  // ── Step guard ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (stepLoading || !currentStep) return;
    const allowed = ["recitation", "schedule_session", "completed"];
    if (!allowed.includes(currentStep) && TASJEEL_ROUTES[currentStep]) {
      navigate(TASJEEL_ROUTES[currentStep], { replace: true });
    }
  }, [stepLoading, currentStep, navigate]);

  const [stage,     setStage]     = useState<1|2|3>(1);
  const [substage,  setSubstage]  = useState<"idle"|"recording"|"recorded"|"uploading"|"done">("idle");
  const [recTime,   setRecTime]   = useState(0);
  const [audioUrl,  setAudioUrl]  = useState<string|null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob|null>(null);
  const [scoreIssue, setScoreIssue] = useState<"silent"|"failed"|null>(null);
  const [recSecs, setRecSecs] = useState(0);

  // AI analysis state — score is PREVIEW only until user presses Submit
  const [scoring,        setScoring]        = useState(false);
  const [aiScore,        setAiScore]        = useState<number|null>(null);
  const [aiTranscript,   setAiTranscript]   = useState<string|null>(null);
  const [scoreBreakdown, setScoreBreakdown] = useState<ScoreBreakdown|null>(null);
  const [submittingScore, setSubmittingScore] = useState(false);
  // Track the audio path used in this session (needed for re-score on refresh)
  const [savedAudioPath, setSavedAudioPath] = useState<string|null>(null);

  const [sessionDate, setSessionDate] = useState("");
  const [sessionTime, setSessionTime] = useState("");
  const [bookingDone, setBookingDone] = useState(false);
  const [booking,     setBooking]     = useState(false);

  const mediaRef  = useRef<MediaRecorder|null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef  = useRef<any>(null);
  const cancelRef = useRef(false);
  const recSecsRef   = useRef(0);
  const runIdRef     = useRef(0);                              // bumps on every new/discarded recording
  const uploadRef    = useRef<Promise<string|null>|null>(null); // background upload → resolves to saved path
  const quranRef     = useRef<{n:number;text:string}[]>([]);

  // ── Quran mushaf page — deterministic per user ────────────────────────────
  const [quranAyahs,   setQuranAyahs]   = useState<{n: number; text: string}[]>([]);
  const [quranMeta,    setQuranMeta]    = useState<{surahEn: string; surahAr: string; juz: number; page: number} | null>(null);
  const [loadingQuran, setLoadingQuran] = useState(false);
  const [quranReload,  setQuranReload]  = useState(0);
  const [fontPx,       setFontPx]       = useState(26);
  // The printed Madinah Mushaf page is shown by default (like the Quran reader).
  // Only if it can't load (offline / blocked) do we fall back to plain text.
  const [printedFailed, setPrintedFailed] = useState(false);
  const [winH, setWinH] = useState(() => (typeof window !== "undefined" ? window.innerHeight : 800));
  useEffect(() => {
    const on = () => setWinH(window.innerHeight);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  // Tips are shown on the instruction screen first, so the reader starts clean.
  const [showTips,     setShowTips]     = useState(false);
  // Instruction screen ("Next") shown once before the mushaf page + recorder.
  const [introDone,     setIntroDone]     = useState(false);
  // Don't render stage 1 (or the instructions) until we know whether the
  // student already submitted — otherwise it flashes then jumps to stage 3.
  const [resumeChecked, setResumeChecked] = useState(false);

  const assignedPage = useMemo(() => {
    if (!user?.id) return 1;
    let h = 0;
    for (let i = 0; i < user.id.length; i++) {
      h = Math.imul(31, h) + user.id.charCodeAt(i) | 0;
    }
    return (Math.abs(h) % 604) + 1;
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    setLoadingQuran(true);
    fetch(`https://api.alquran.cloud/v1/page/${assignedPage}/quran-uthmani`)
      .then(r => r.json())
      .then(d => {
        const ayahs = d?.data?.ayahs || [];
        if (!ayahs.length) return;
        setQuranAyahs(ayahs.map((a: any) => ({ n: a.numberInSurah, text: a.text })));
        const first = ayahs[0];
        setQuranMeta({
          surahEn: first.surah?.englishName || "",
          surahAr: first.surah?.name       || "",
          juz:     first.juz               || 1,
          page:    assignedPage,
        });
        (supabase as any).from("recitation_tests").upsert(
          { user_id: user!.id, assigned_page: assignedPage },
          { onConflict: "user_id" }
        ).then(() => {});
      })
      .catch(() => {})
      .finally(() => setLoadingQuran(false));
  }, [user?.id, assignedPage, quranReload]); // eslint-disable-line

  quranRef.current = quranAyahs;

  const fr = (s: number) => `${Math.floor(s/60).toString().padStart(2,"0")}:${(s%60).toString().padStart(2,"0")}`;

  // ── Resume state check ────────────────────────────────────────────────────
  // Rules:
  //  stage >= 3 OR status = awaiting_teacher → show stage 3 (session booked)
  //  stage === 2 AND status = stage2_complete → show stage 3 (AI scored & submitted, pending session)
  //  stage === 1 OR status = stage1_complete  → back to STAGE 1 re-record
  //  (audio was uploaded but score was never submitted — must retake)
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("recitation_tests")
        .select("stage, status, ai_score, audio_path, virtual_session_date, virtual_session_time")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!data) { setResumeChecked(true); return; }

      if (data.status === "awaiting_teacher" || data.stage >= 3) {
        // Fully submitted + session booked
        setAiScore(data.ai_score ?? null);
        setSessionDate(data.virtual_session_date || "");
        setSessionTime(data.virtual_session_time || "");
        setBookingDone(true);
        setStage(3);
        setIntroDone(true);
      } else if (data.status === "stage2_complete" || data.stage >= 2) {
        // AI score was submitted — move to session booking
        setAiScore(data.ai_score ?? null);
        setStage(3);
        setIntroDone(true);
      } else {
        // stage === 1 (audio uploaded but score NOT submitted) → force re-record
        // The user refreshed before pressing "Submit Score".
        // Reset to idle stage 1 so they must re-record.
        setStage(1);
        setSubstage("idle");
        // Only warn when a recording was really uploaded. The row is also
        // created (stage 1, "stage1_pending") the moment the page first opens,
        // which is NOT a lost recording.
        if (data.audio_path || data.status === "stage1_complete") {
          setIntroDone(true);   // they've already seen the instructions
          toast({
            title: "Recitation not submitted",
            description: "Your previous recording was not submitted. Please re-record.",
          });
        }
      }
      setResumeChecked(true);
    })();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Recording ────────────────────────────────────────────────────────────
  const startRec = async () => {
    try {
      cancelRef.current = false;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
      const mime = ["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg"].find(t => {
        try { return MediaRecorder.isTypeSupported(t); } catch { return false; }
      }) || "";
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 128000 } : { audioBitsPerSecond: 128000 });
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data?.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        clearInterval(timerRef.current);
        const secs = recSecsRef.current;
        setRecTime(0);
        if (cancelRef.current) return;
        const blob = new Blob(chunksRef.current, { type: mime || "audio/webm" });
        if (blob.size < 1000) { toast({ title: "Recording too short", description: "Please recite the page and try again.", variant: "destructive" }); setSubstage("idle"); return; }
        setRecSecs(secs);
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        setSubstage("recorded");
        // Start scoring + saving the instant recording stops — the student can
        // listen back while this runs, so the result is ready when they tap "See My Score".
        beginBackgroundWork(blob);
      };
      mr.start(200); mediaRef.current = mr;
      recSecsRef.current = 0;
      setSubstage("recording");
      timerRef.current = setInterval(() => { recSecsRef.current += 1; setRecTime(t => t + 1); }, 1000);
    } catch {
      toast({ title: "Microphone denied", description: "Allow mic access in your browser settings", variant: "destructive" });
    }
  };

  const stopRec   = () => {
    mediaRef.current?.stop();
  };
  const discardWork = () => {
    runIdRef.current += 1;          // any in-flight scoring/upload becomes stale
    uploadRef.current = null;
    setScoring(false);
    setScoreIssue(null);
  };
  const cancelRec = () => {
    cancelRef.current = true;
    mediaRef.current?.stop();
    clearInterval(timerRef.current);
    discardWork();
    setRecTime(0); setSubstage("idle"); setAudioBlob(null); setAudioUrl(null);
  };
  const retake = () => {
    discardWork();
    setAudioBlob(null); setAudioUrl(null); setSubstage("idle");
    setAiScore(null); setAiTranscript(null); setScoreBreakdown(null);
  };

  // ── Background work: score + save, started the moment recording stops ─────
  const beginBackgroundWork = (blob: Blob) => {
    const runId = ++runIdRef.current;
    setAiScore(null); setAiTranscript(null); setScoreBreakdown(null); setScoreIssue(null);
    runScoring(blob, runId);
    uploadRef.current = saveRecording(blob, runId);
  };

  // Saves the audio (R2 first, Supabase storage as fallback) and records the
  // stage-1 row. Never blocks scoring. Resolves to the stored path, or null.
  const saveRecording = async (blob: Blob, runId: number): Promise<string|null> => {
    if (!user) return null;
    const ext = blob.type.includes("mp4") ? "mp4" : blob.type.includes("ogg") ? "ogg" : "webm";
    let finalPath: string | null = null;

    // 1) Cloudflare R2
    try {
      const path = `recitation-test/${user.id}/${Date.now()}.${ext}`;
      const res = await withTimeout(uploadExamAudioToR2(path, blob), UPLOAD_TIMEOUT_MS, "R2 upload");
      if (!("error" in res)) finalPath = path;
      else console.warn("[RecitationTest] R2 upload failed:", res.error);
    } catch (e) { console.warn("[RecitationTest] R2 upload failed:", e); }

    // 2) Fallback — Supabase storage bucket used by earlier recitation tests
    if (!finalPath) {
      try {
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error } = await withTimeout(
          (supabase as any).storage.from("recitation-audio").upload(path, blob, { contentType: blob.type || "audio/webm", upsert: true }) as Promise<any>,
          UPLOAD_TIMEOUT_MS, "Storage upload",
        );
        if (!error) finalPath = path;
        else console.warn("[RecitationTest] storage fallback failed:", error.message);
      } catch (e) { console.warn("[RecitationTest] storage fallback failed:", e); }
    }

    if (runId !== runIdRef.current) return null;   // student re-recorded meanwhile
    if (!finalPath) return null;

    setSavedAudioPath(finalPath);
    try {
      await (supabase as any).from("recitation_tests").upsert({
        user_id: user.id, audio_path: finalPath, stage: 1,
        stage1_submitted_at: new Date().toISOString(), status: "stage1_complete",
      }, { onConflict: "user_id" });
    } catch { /* non-critical — submit writes audio_path again */ }
    return finalPath;
  };

  // "See My Score" — if scoring already finished this is instant.
  const goToScore = () => setStage(2);

  // ── Scoring ───────────────────────────────────────────────────────────────
  // Transcribes via the groq-transcribe edge function and scores against the
  // mushaf page shown to the student. This is a PREVIEW: nothing is written to
  // the database until the student presses "Submit Score" (handleSubmitScore).
  const runScoring = async (blob: Blob, runId: number) => {
    setScoring(true);
    const transcript = await transcribeRecitation(blob);
    if (runId !== runIdRef.current) return;          // discarded — ignore result

    if (transcript === null) {
      setScoreIssue("failed"); setScoring(false); return;
    }
    if (transcript.replace(/[^\u0600-\u06FF]/g, "").length < 3) {
      setScoreIssue("silent"); setScoring(false); return;
    }

    const refText = quranRef.current.map(a => a.text).join(" ");
    const breakdown: ScoreBreakdown = refText
      ? scoreRecitation(transcript, refText, [])
      : { total: 0, coverage: 0, accuracy: 0, fluency: 0 };

    setAiTranscript(transcript);
    setScoreBreakdown(breakdown);
    setAiScore(breakdown.total);
    setScoring(false);
  };

  // ── Submit Score (user-initiated) ─────────────────────────────────────────
  // This is the ONLY place scores are written to the database.
  const handleSubmitScore = async () => {
    if (!user || aiScore === null) return;
    setSubmittingScore(true);
    try {
      // Make sure the recording finished saving so the teacher can hear it.
      let audioPath = savedAudioPath;
      if (!audioPath && uploadRef.current) {
        try { audioPath = await withTimeout(uploadRef.current, UPLOAD_TIMEOUT_MS * 2, "Upload"); } catch { /* handled below */ }
      }
      const { error: scoreErr } = await (supabase as any).from("recitation_tests").upsert({
        user_id:               user.id,
        ...(audioPath ? { audio_path: audioPath } : {}),
        ai_score:              aiScore,
        ai_transcript:         aiTranscript || "No transcript",
        stage:                 2,
        stage2_completed_at:   new Date().toISOString(),
        status:                "stage2_complete",
      }, { onConflict: "user_id" });
      if (scoreErr) throw new Error(scoreErr.message);

      if (!audioPath) {
        toast({ title: "Score submitted", description: "Your audio could not be saved, but your score and transcript were.", });
      } else {
        toast({ title: "✅ Score submitted!" });
      }
      setStage(3);
    } catch (e: any) {
      toast({ title: "Could not save score", description: e.message, variant: "destructive" });
    } finally {
      setSubmittingScore(false);
    }
  };

  // ── Skip scoring (couldn't score) → go to booking, instructor scores live ──
  const handleSkipScore = async () => {
    if (!user) return;
    const { error } = await (supabase as any).from("recitation_tests").upsert({
      user_id: user.id, ai_score: null, ai_transcript: "No transcript — manual review",
      stage: 2, stage2_completed_at: new Date().toISOString(), status: "stage2_complete",
    }, { onConflict: "user_id" });
    if (error) {
      toast({ title: "Could not continue", description: error.message, variant: "destructive" });
      return;
    }
    setStage(3);
  };

  // ── Re-record (from stage 2 preview) ─────────────────────────────────────
  const handleReRecord = async () => {
    discardWork();
    // Clear the stage-1 DB row so resume logic doesn't redirect to stage 2
    if (user) {
      const { error: resetErr } = await (supabase as any).from("recitation_tests")
        .update({ stage: 0, status: "retake", audio_path: null })
        .eq("user_id", user.id);
      if (resetErr) {
        toast({ title: "Could not reset your recording", description: resetErr.message, variant: "destructive" });
        return;
      }
    }
    setAiScore(null);
    setAiTranscript(null);
    setScoreBreakdown(null);
    setAudioBlob(null);
    setAudioUrl(null);
    setSavedAudioPath(null);
    setSubstage("idle");
    setStage(1);
  };

  // ── Book Session ─────────────────────────────────────────────────────────
  const bookSession = async () => {
    if (!user || !sessionDate || !sessionTime) {
      toast({ title: "Please select a date and time", variant: "destructive" }); return;
    }
    // Local-time instant of the slot (device timezone) — stored as a proper timestamptz.
    const slotAt = new Date(`${sessionDate}T${sessionTime}:00`);
    if (isNaN(slotAt.getTime()) || slotAt.getTime() < Date.now() + 5 * 60_000) {
      toast({ title: "That time has passed", description: "Please pick a later slot.", variant: "destructive" });
      setSessionTime("");
      return;
    }
    setBooking(true);
    try {
      const nowIso = new Date().toISOString();
      const { error: bookErr } = await (supabase as any).from("recitation_tests").upsert({
        user_id:                   user.id,
        stage:                     3,
        virtual_session_date:      sessionDate,
        virtual_session_time:      sessionTime,
        stage3_session_date:       slotAt.toISOString(),
        virtual_session_booked_at: nowIso,
        stage3_requested_at:       nowIso,
        status:                    "awaiting_teacher",
      }, { onConflict: "user_id" });
      // Never claim success unless the booking really saved.
      if (bookErr) throw new Error(bookErr.message);

      // Notify admins (non-critical)
      try {
        const { data: adminRoles } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
        const adminIds = (adminRoles || []).map((r: any) => r.user_id);
        if (adminIds.length > 0) {
          const notifications = adminIds.map((adminId: string) => ({
            user_id:    adminId,
            title:      "📅 Virtual Recitation Session Requested",
            message:    `${(profile as any)?.full_name || "A student"} has booked a virtual recitation session for ${sessionDate} at ${sessionTime}. Go to Tasjeel → Reviews to join.`,
            type:       "recitation_booking",
            link:       "/admin/tasjeel",
            is_read:    false,
            created_at: nowIso,
          }));
          await (supabase as any).from("notifications").insert(notifications);
        }
      } catch { /* non-critical */ }

      if (currentStep && currentStep !== "completed") {
        await advanceStep("level_assignment");
      }

      setBookingDone(true);
      toast({ title: "✅ Session booked!", description: "Admin will confirm your session soon." });
    } catch (e: any) {
      toast({ title: "Booking failed", description: e.message, variant: "destructive" });
    } finally { setBooking(false); }
  };

  const scoreColor = (s: number) => s >= 80 ? "#16A34A" : s >= 60 ? "#D97706" : "#DC2626";
  const scoreLabel = (s: number) => s >= 80 ? "Excellent" : s >= 60 ? "Good" : "Needs Practice";

  const ALL_SLOTS = (() => {
    const slots: string[] = [];
    for (let h = 20; h <= 22; h++) {
      const mins = h === 20 ? [30, 45] : h === 22 ? [0] : [0, 15, 30, 45];
      mins.forEach(m => slots.push(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`));
    }
    return slots;
  })();

  const fmt12h = (t: string) => {
    const [hStr, mStr] = t.split(":");
    let h = parseInt(hStr, 10);
    const m = mStr || "00";
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${m} ${ampm}`;
  };

  // Local (device) calendar dates — NOT toISOString(), which is UTC and can be off by a day.
  const localDateStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const todayStr = localDateStr(new Date());

  // Slots still bookable on a given date (today's past slots are hidden; 15 min lead time)
  const slotsFor = (dateStr: string) =>
    ALL_SLOTS.filter(t => new Date(`${dateStr}T${t}:00`).getTime() > Date.now() + 15 * 60_000);

  // Next 3 days that still have at least one open slot
  const sessionDates = Array.from({ length: 3 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i);
    return localDateStr(d);
  }).filter(d => slotsFor(d).length > 0);
  const parsedTips = (settings.tips || "").split(/,|\n/).map(t => t.trim()).filter(Boolean);

  if (settingsLoading || !resumeChecked) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:`linear-gradient(160deg,${G},${GM})` }}>
      <Loader2 style={{ width:36, height:36, color:"#fff", animation:"spin .8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // ══ INSTRUCTIONS — shown once, student taps Next to continue ═════════════
  if (stage === 1 && !introDone) {
    const introTips = parsedTips.length > 0 ? parsedTips : [
      "Find a quiet room with no background noise",
      "Hold phone 15–20cm from your mouth",
      "Recite clearly and at your normal pace",
      "Complete the full page without stopping",
    ];
    const steps = [
      { icon: "📖", title: "Your page is assigned", desc: "You will be shown one page of the Qur'an. Recite the whole page from beginning to end." },
      { icon: "🎙️", title: "Record once, clearly", desc: "Tap Start Recording, recite at your normal pace, then tap Stop & Review." },
      { icon: "✅", title: "Submit your score", desc: "After your score appears, press Submit — a recording that is not submitted must be repeated." },
      { icon: "📅", title: "Then book a live session", desc: "Finally you will choose a time for a short live session with an ustadh, in shaa Allah." },
    ];
    return (
      <div style={{ position:"fixed", inset:0, zIndex:40, overflowY:"auto", background:"linear-gradient(160deg,#021a0e 0%,#0c2d1a 50%,#041409 100%)", display:"flex", justifyContent:"center", alignItems:"flex-start", padding:"16px 12px 32px", fontFamily:"'Cairo',system-ui,sans-serif" }}>
        <div style={{ width:"100%", maxWidth:560, background:"rgba(255,255,255,.04)", border:"1px solid rgba(201,168,76,.2)", borderRadius:20, padding:"28px 20px" }}>
          <div style={{ textAlign:"center", marginBottom:22 }}>
            <div style={{ width:70, height:70, borderRadius:"50%", margin:"0 auto 14px", background:"rgba(201,168,76,.12)", border:"2px solid rgba(201,168,76,.4)", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <Mic size={30} color={GOLD} />
            </div>
            <p style={{ fontFamily:"'Amiri',serif", fontSize:20, color:GOLD, margin:"0 0 10px", direction:"rtl" }}>بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ</p>
            <h1 style={{ fontSize:20, fontWeight:900, color:"#fff", margin:"0 0 4px" }}>Recitation Test</h1>
            <p style={{ fontSize:12, color:"rgba(201,168,76,.7)", margin:0, fontFamily:"'Amiri',serif" }}>اختبار التلاوة — Tahleem Academy</p>
            {settings.instructions && (
              <p style={{ fontSize:12, color:"rgba(255,255,255,.65)", margin:"12px 0 0", lineHeight:1.6 }}>{settings.instructions}</p>
            )}
          </div>

          <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:18 }}>
            <p style={{ fontSize:11, fontWeight:700, color:"rgba(201,168,76,.8)", margin:"0 0 6px", textTransform:"uppercase", letterSpacing:1 }}>📋 Guidance · التعليمات</p>
            {steps.map((st, i) => (
              <div key={i} style={{ display:"flex", gap:12, alignItems:"flex-start", background:"rgba(255,255,255,.04)", borderRadius:12, padding:"10px 14px", border:"1px solid rgba(255,255,255,.07)" }}>
                <span style={{ fontSize:18, flexShrink:0, marginTop:1 }}>{st.icon}</span>
                <div>
                  <p style={{ fontWeight:700, fontSize:13, color:"#fff", margin:"0 0 2px" }}>{st.title}</p>
                  <p style={{ fontSize:11, color:"rgba(255,255,255,.55)", margin:0, lineHeight:1.5 }}>{st.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div style={{ background:"rgba(34,197,94,.08)", border:"1px solid rgba(34,197,94,.25)", borderRadius:12, padding:"12px 16px", marginBottom:22 }}>
            <p style={{ fontWeight:700, fontSize:12, color:"#86EFAC", margin:"0 0 6px" }}>🎧 Before you start</p>
            {introTips.map((tip, i) => (
              <div key={i} style={{ fontSize:11.5, color:"rgba(134,239,172,.85)", marginBottom:3, display:"flex", gap:6, alignItems:"flex-start" }}>
                <CheckCircle2 size={12} color="#4ADE80" style={{ marginTop:2, flexShrink:0 }} />{tip}
              </div>
            ))}
          </div>

          <button onClick={() => setIntroDone(true)} style={{ width:"100%", padding:"16px", borderRadius:14, border:"none", background:`linear-gradient(135deg,${G},${GM})`, color:"#fff", fontSize:16, fontWeight:800, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8, boxShadow:"0 8px 32px rgba(6,78,59,.5)", minHeight:52 }}>
            Next — التالي <ChevronRight size={18} />
          </button>
        </div>
      </div>
    );
  }

  // ══ STAGE 1 — FULL-PAGE MUSHAF READER + RECORDER ══════════════════════════
  if (stage === 1) {
    const tips = parsedTips.length > 0 ? parsedTips : [
      "Find a quiet room with no background noise",
      "Hold phone 15–20cm from your mouth",
      "Recite clearly and at your normal pace",
      "Complete the full page without stopping",
    ];
    return (
      <div style={{ position:"fixed", inset:0, zIndex:40, display:"flex", flexDirection:"column", background:"#FFFEF5", fontFamily:"'Cairo',system-ui,sans-serif" }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Amiri+Quran&family=Amiri:wght@400;700&display=swap');
          @keyframes spin{to{transform:rotate(360deg)}}
          @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
          @keyframes waveBar{from{transform:scaleY(.3)}to{transform:scaleY(1)}}
        `}</style>

        {/* Top bar */}
        <div style={{ background:`linear-gradient(135deg,${G},${GM})`, padding:"calc(env(safe-area-inset-top,0px) + 12px) 16px 12px", color:"#fff", flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10 }}>
            <div style={{ minWidth:0 }}>
              <div style={{ fontWeight:800, fontSize:15 }}>Recitation Test · Step 1 of 3</div>
              <div style={{ fontSize:11, opacity:.75 }}>
                {quranMeta ? `${quranMeta.surahEn} · Juz ${quranMeta.juz} · Page ${quranMeta.page}` : "Loading your page…"}
              </div>
            </div>
            {printedFailed && (
            <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                <button onClick={() => setFontPx(f => Math.max(18, f - 2))} aria-label="Smaller text" style={{ width:34, height:34, borderRadius:10, border:"1px solid rgba(255,255,255,.3)", background:"rgba(255,255,255,.12)", color:"#fff", fontWeight:800, fontSize:12 }}>A-</button>
                <button onClick={() => setFontPx(f => Math.min(40, f + 2))} aria-label="Larger text" style={{ width:34, height:34, borderRadius:10, border:"1px solid rgba(255,255,255,.3)", background:"rgba(255,255,255,.12)", color:"#fff", fontWeight:800, fontSize:15 }}>A+</button>
              </div>
            )}
          </div>
        </div>

        {/* Page — scrolls, fills the whole screen */}
        <div style={{ flex:1, overflowY:"auto", WebkitOverflowScrolling:"touch" as any, padding:"16px 16px 24px" }}>
          <div style={{ maxWidth:720, margin:"0 auto" }}>
            {showTips && (
              <div style={{ background:"#F0FDF4", borderRadius:12, padding:"10px 14px", border:"1px solid #86EFAC", marginBottom:14 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:"#166534" }}>
                    📌 {settings.instructions || "Recite the full page below, then tap the mic."}
                  </div>
                  <button onClick={() => setShowTips(false)} style={{ border:"none", background:"transparent", color:"#166534", fontWeight:800, fontSize:16, lineHeight:1 }} aria-label="Hide tips">×</button>
                </div>
                {tips.map((tip, i) => (
                  <div key={i} style={{ fontSize:11.5, color:"#166534", marginBottom:3, display:"flex", gap:6, alignItems:"flex-start" }}>
                    <CheckCircle2 size={12} color="#16A34A" style={{ marginTop:2, flexShrink:0 }} />{tip}
                  </div>
                ))}
              </div>
            )}

            {!printedFailed ? (
              <div style={{ margin:"0 -16px" }}>
                <MushafPageView
                  page={assignedPage}
                  seamless
                  pureWhite
                  availableHeight={Math.max(300, winH - 200)}
                  maxStretch={1.4}
                  onUnavailable={() => setPrintedFailed(true)}
                />
              </div>
            ) : (
            <div style={{ border:"2px solid #E8D5A3", borderRadius:16, background:"#FFFEF5", padding:"22px 14px", direction:"rtl" as const, boxShadow:"0 2px 14px rgba(0,0,0,.05)" }}>
              {loadingQuran ? (
                <div style={{ textAlign:"center", padding:"60px 0", display:"flex", flexDirection:"column", alignItems:"center", gap:10 }}>
                  <Loader2 size={28} style={{ animation:"spin .8s linear infinite", color:"#C9A84C" }} />
                  <span style={{ fontSize:12, color:"#9CA3AF" }}>Loading page {assignedPage}…</span>
                </div>
              ) : quranAyahs.length > 0 ? (
                <div style={{ fontSize:fontPx, fontFamily:"'Amiri Quran','Amiri',serif", lineHeight:2.5, color:"#1A1A1A", textAlign:"justify" as const }}>
                  {quranAyahs.map((a, i) => (
                    <span key={i}>
                      {a.text}
                      <span style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", width:30, height:30, margin:"0 4px", fontSize:12, fontWeight:800, color:"#7D5A1E", fontFamily:"'Cairo',sans-serif", background:"#F5ECD5", borderRadius:"50%", border:"1px solid #DBC580", verticalAlign:"middle" }}>{a.n}</span>
                    </span>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign:"center", padding:"40px 12px", direction:"ltr" as const }}>
                  <div style={{ fontSize:13, color:"#9C7722", marginBottom:12 }}>Couldn't load page {assignedPage}. Check your connection and try again.</div>
                  <button onClick={() => setQuranReload(n => n + 1)} style={{ padding:"10px 22px", borderRadius:12, border:"none", background:G, color:"#fff", fontWeight:700, fontSize:13 }}>Retry</button>
                </div>
              )}
            </div>
            )}
            {quranMeta && (
              <div style={{ textAlign:"center", marginTop:10, fontSize:10, fontWeight:700, color:"#9C7722", letterSpacing:.8 }}>PAGE {quranMeta.page} · RECITE THE WHOLE PAGE</div>
            )}
          </div>
        </div>

        {/* Bottom recorder bar */}
        <div style={{ flexShrink:0, background:"#fff", borderTop:"1px solid #E8D5A3", boxShadow:"0 -6px 24px rgba(0,0,0,.08)", padding:"12px 16px calc(env(safe-area-inset-bottom,0px) + 14px)" }}>
          <div style={{ maxWidth:560, margin:"0 auto" }}>
            {substage === "idle" && (
              <button onClick={startRec} disabled={quranAyahs.length === 0}
                style={{ width:"100%", padding:"14px", borderRadius:16, border:"none", background: quranAyahs.length === 0 ? "#d1d5db" : `linear-gradient(135deg,${G},${GM})`, color:"#fff", fontSize:15, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center", gap:10, boxShadow:"0 6px 18px rgba(6,78,59,.28)" }}>
                <Mic size={22} /> Start Recording — بِسْمِ اللَّهِ
              </button>
            )}

            {substage === "recording" && (
              <div>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:2, height:34, marginBottom:6 }}>
                  {WAVE_H.map((h,i) => (
                    <div key={i} style={{ width:3, height:h*1.6, borderRadius:3, background:"#E74C3C", animation:`waveBar ${.4+(i%4)*.1}s ease-in-out infinite alternate`, animationDelay:`${i*.04}s` }} />
                  ))}
                </div>
                <div style={{ textAlign:"center", fontSize:22, fontWeight:900, color:"#E74C3C", marginBottom:8 }}>
                  ● {fr(recTime)}
                </div>
                <div style={{ display:"flex", gap:10 }}>
                  <button onClick={cancelRec} style={{ flex:1, padding:"12px", borderRadius:14, border:"2px solid #e5e7eb", background:"#fff", color:"#666", fontSize:13, fontWeight:700 }}>Cancel</button>
                  <button onClick={stopRec} style={{ flex:2, padding:"12px", borderRadius:14, border:"none", background:"#E74C3C", color:"#fff", fontSize:14, fontWeight:800 }}>Stop & Review</button>
                </div>
              </div>
            )}

            {substage === "recorded" && audioUrl && (
              <div>
                <LocalAudioPlayer src={audioUrl} fallbackSecs={recSecs} />
                <div style={{ display:"flex", gap:10 }}>
                  <button onClick={retake} style={{ flex:1, padding:"12px", borderRadius:14, border:"2px solid #e5e7eb", background:"#fff", color:"#666", fontSize:13, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
                    <RotateCcw size={15} /> Re-record
                  </button>
                  <button onClick={goToScore} style={{ flex:2, padding:"12px", borderRadius:14, border:"none", background:`linear-gradient(135deg,${G},${GM})`, color:"#fff", fontSize:14, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                    {scoring
                      ? <><Loader2 size={16} style={{ animation:"spin .8s linear infinite" }} /> Checking…</>
                      : <><Star size={16} /> See My Score</>}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight:"100vh", background:`linear-gradient(160deg,${G},${GM},#0a1f12)`, display:"flex", flexDirection:"column", fontFamily:"'Cairo',system-ui,sans-serif" }}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        @keyframes waveBar{from{transform:scaleY(.3)}to{transform:scaleY(1)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
      `}</style>

      {/* Header */}
      <div style={{ padding:"20px 20px 0", display:"flex", alignItems:"center", gap:12, maxWidth:560, margin:"0 auto", width:"100%" }}>
        <div style={{ width:40, height:40, borderRadius:12, background:"rgba(255,255,255,.1)", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <BookOpen style={{ width:20, height:20, color:GOLD }} />
        </div>
        <div>
          <div style={{ color:"#fff", fontWeight:800, fontSize:16 }}>Recitation Proficiency Test</div>
          <div style={{ color:"rgba(255,255,255,.6)", fontSize:12 }}>اختبار الإتقان — 3 Stages</div>
        </div>
      </div>

      <div style={{ flex:1, display:"flex", alignItems:"flex-start", justifyContent:"center", padding:"20px 16px 40px" }}>
        <div style={{ width:"100%", maxWidth:560, background:"#fff", borderRadius:24, boxShadow:"0 24px 80px rgba(0,0,0,.3)", overflow:"hidden", animation:"fadeUp .4s ease" }}>

          {/* Stage progress */}
          <div style={{ background:`linear-gradient(135deg,${G},${GM})`, padding:"20px 24px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:0 }}>
              {[
                { n:1, icon:<Mic size={14}/>,    label: settings.stage1_label || "Record" },
                { n:2, icon:<Star size={14}/>,   label: (settings.stage2_label && settings.stage2_label !== "AI Score") ? settings.stage2_label : "Your Score" },
                { n:3, icon:<Video size={14}/>,  label: settings.stage3_label || "Book Session" },
              ].map((s,i) => (
                <div key={s.n} style={{ display:"flex", alignItems:"center", flex: i<2 ? 1 : undefined }}>
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
                    <div style={{ width:36, height:36, borderRadius:"50%",
                      background: stage > s.n ? "#22c55e" : stage === s.n ? "rgba(255,255,255,.25)" : "rgba(255,255,255,.1)",
                      border:`2px solid ${stage >= s.n ? "#22c55e" : "rgba(255,255,255,.2)"}`,
                      display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", transition:"all .3s"
                    }}>
                      {stage > s.n ? <CheckCircle2 size={18} /> : s.icon}
                    </div>
                    <span style={{ fontSize:10, color: stage >= s.n ? "#fff" : "rgba(255,255,255,.4)", fontWeight:600 }}>{s.label}</span>
                  </div>
                  {i < 2 && <div style={{ flex:1, height:2, background: stage > s.n ? "#22c55e" : "rgba(255,255,255,.15)", marginBottom:16, transition:"background .5s" }} />}
                </div>
              ))}
            </div>
          </div>

          <div style={{ padding:"24px" }}>

            {/* ─── STAGE 2: AI SCORING (PREVIEW) ────────────────────────── */}
            {stage === 2 && (
              <div style={{ textAlign:"center" }}>
                <div style={{ fontSize:18, fontWeight:800, color:G, marginBottom:6 }}>Stage 2 — Your Recitation Score</div>
                <div style={{ fontSize:13, color:"#666", marginBottom:24, lineHeight:1.6 }}>
                  Review your score below. Submit when you're happy, or re-record to try again.
                </div>

                {scoring && (
                  <div style={{ padding:"30px 0" }}>
                    <Loader2 style={{ width:48, height:48, color:GM, animation:"spin .8s linear infinite", margin:"0 auto 16px" }} />
                    <div style={{ fontSize:15, fontWeight:700, color:G, marginBottom:6 }}>Checking your recitation…</div>
                    <div style={{ fontSize:13, color:"#9ca3af" }}>Just a few seconds</div>
                  </div>
                )}

                {!scoring && aiScore === null && (
                  <div style={{ animation:"fadeUp .4s ease", padding:"10px 0" }}>
                    <div style={{ width:64, height:64, borderRadius:"50%", background:"#FFF7ED", border:"2px solid #FCA5A5", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 14px", fontSize:28 }}>⚠️</div>
                    <div style={{ fontSize:14, fontWeight:700, color:"#7C2D12", marginBottom:6 }}>{scoreIssue === "silent" ? "We couldn't hear a clear recitation" : "We couldn't score this automatically"}</div>
                    <div style={{ fontSize:13, color:"#9ca3af", marginBottom:20, lineHeight:1.6 }}>
                      {scoreIssue === "silent"
                        ? "Move closer to the microphone and recite the page again. You can also skip, and an instructor will evaluate you live in Stage 3."
                        : "Your recording could not be scored automatically. You can re-record, or skip and an instructor will evaluate you live in Stage 3."}
                    </div>
                    <div style={{ display:"flex", gap:10, flexDirection:"column" }}>
                      <button
                        onClick={handleReRecord}
                        style={{ width:"100%", padding:"13px", borderRadius:13, border:"2px solid #064E3B", background:"#fff", color:"#064E3B", fontSize:14, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}
                      >
                        <RotateCcw size={15} /> Re-record
                      </button>
                      <button
                        onClick={handleSkipScore}
                        style={{ width:"100%", padding:"13px", borderRadius:13, border:"none", background:`linear-gradient(135deg,${G},${GM})`, color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}
                      >
                        Skip to Session Booking <ArrowRight size={16} />
                      </button>
                    </div>
                  </div>
                )}

                {!scoring && aiScore !== null && (
                  <div style={{ animation:"fadeUp .4s ease" }}>
                    {/* Score circle */}
                    <div style={{ width:130, height:130, borderRadius:"50%", background:`${scoreColor(aiScore)}15`, border:`5px solid ${scoreColor(aiScore)}`, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", margin:"0 auto 16px", boxShadow:`0 0 0 8px ${scoreColor(aiScore)}08` }}>
                      <div style={{ fontSize:36, fontWeight:900, color:scoreColor(aiScore), lineHeight:1 }}>{aiScore}%</div>
                      <div style={{ fontSize:11, color:scoreColor(aiScore), fontWeight:700, marginTop:2 }}>{scoreLabel(aiScore)}</div>
                    </div>

                    {/* Score breakdown */}
                    {scoreBreakdown && (
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:16 }}>
                        {[
                          { label:"Coverage", value:scoreBreakdown.coverage, tip:"Words recited" },
                          { label:"Accuracy", value:scoreBreakdown.accuracy, tip:"Correct words" },
                          { label:"Fluency",  value:scoreBreakdown.fluency,  tip:"Pronunciation" },
                        ].map((m,i) => (
                          <div key={i} style={{ background:"#f9fafb", borderRadius:12, padding:"10px 8px", border:"1px solid #e5e7eb", textAlign:"center" as const }}>
                            <div style={{ fontSize:18, fontWeight:900, color: m.value >= 70 ? "#16A34A" : m.value >= 50 ? "#D97706" : "#DC2626" }}>{m.value}%</div>
                            <div style={{ fontSize:10, fontWeight:700, color:"#6b7280", marginTop:2 }}>{m.label}</div>
                            <div style={{ fontSize:9, color:"#9ca3af" }}>{m.tip}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* What AI heard */}
                    {aiTranscript && (
                      <div style={{ background:"#f9fafb", borderRadius:12, padding:"12px 14px", border:"1px solid #e5e7eb", marginBottom:16, textAlign:"right" as const }}>
                        <div style={{ fontSize:11, fontWeight:700, color:"#9ca3af", textTransform:"uppercase", letterSpacing:.5, marginBottom:6, textAlign:"left" as const }}>What we heard:</div>
                        <div style={{ fontSize:14, fontFamily:"'Amiri',serif", direction:"rtl", color:"#333", lineHeight:1.8 }}>{aiTranscript}</div>
                      </div>
                    )}

                    {/* Important notice */}
                    <div style={{ background:"#FFFBEB", borderRadius:12, padding:"12px 14px", border:"1px solid #F9D46A", fontSize:12, color:"#78350F", lineHeight:1.6, display:"flex", gap:8, alignItems:"flex-start", marginBottom:20 }}>
                      <AlertCircle size={14} color={GOLD} style={{ flexShrink:0, marginTop:1 }} />
                      <span>This score is a <strong>preview only</strong>. Press "Submit Score" to confirm and proceed to session booking. If you're not satisfied, you can re-record.</span>
                    </div>

                    {/* Action buttons */}
                    <div style={{ display:"flex", gap:10, flexDirection:"column" }}>
                      <button
                        onClick={handleSubmitScore}
                        disabled={submittingScore}
                        style={{ width:"100%", padding:"15px", borderRadius:14, border:"none", background:`linear-gradient(135deg,${G},${GM})`, color:"#fff", fontSize:15, fontWeight:800, cursor: submittingScore ? "not-allowed" : "pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:10, opacity: submittingScore ? 0.7 : 1 }}
                      >
                        {submittingScore
                          ? <><Loader2 style={{ width:18, height:18, animation:"spin .8s linear infinite" }} /> Submitting…</>
                          : <><Send size={18} /> Submit Score & Book Session</>}
                      </button>
                      <button
                        onClick={handleReRecord}
                        style={{ width:"100%", padding:"12px", borderRadius:13, border:"2px solid #e5e7eb", background:"#fff", color:"#666", fontSize:13, fontWeight:600, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}
                      >
                        <RotateCcw size={15} /> Re-record
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ─── STAGE 3: BOOK SESSION ────────────────────────────────── */}
            {stage === 3 && (
              <div>
                <div style={{ textAlign:"center", marginBottom:20 }}>
                  <div style={{ width:60, height:60, borderRadius:"50%", background:"#F0FDF4", border:"2px solid #86EFAC", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 12px" }}>
                    <Video size={28} color={G} />
                  </div>
                  <div style={{ fontSize:18, fontWeight:800, color:G, marginBottom:6 }}>Stage 3 — Book Your Virtual Session</div>
                  <div style={{ fontSize:13, color:"#666", lineHeight:1.6 }}>
                    Schedule a <strong>10–15 minute live session</strong> with one of our instructors.<br/>
                    They will evaluate your Tajweed and recitation in real time.
                  </div>
                </div>

                {!bookingDone ? (
                  <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                    <div style={{ background:"#EFF6FF", borderRadius:12, padding:"14px 16px", border:"1px solid #93C5FD" }}>
                      <div style={{ fontSize:12, fontWeight:700, color:"#1E3A5F", marginBottom:8 }}>What the instructor evaluates:</div>
                      {["Makharij — correct pronunciation of letters","Sifaat — characteristics of letters","Noon Saakin & Tanween rules (Ikhfaa, Idghaam, Iqlaab)","Madd (lengthening) rules and Waqf","Overall fluency, rhythm and confidence"].map((t,i) => (
                        <div key={i} style={{ fontSize:12, color:"#1E40AF", marginBottom:i<4?5:0, display:"flex", alignItems:"flex-start", gap:6 }}>
                          <CheckCircle2 size={12} color="#2563EB" style={{ marginTop:1, flexShrink:0 }} />{t}
                        </div>
                      ))}
                    </div>

                    <div>
                      <label style={{ fontSize:13, fontWeight:700, color:"#374151", marginBottom:12, display:"block" }}>
                        <Calendar size={14} style={{ display:"inline", marginRight:6, verticalAlign:"middle" }} />
                        Select a date &amp; time:
                      </label>

                      {sessionDates.map(d => {
                        const date    = new Date(d + "T12:00:00");
                        const isToday = d === todayStr;
                        const isTomorrow = d === localDateStr(new Date(Date.now() + 86_400_000));
                        const dayLabel = (isToday ? "Today" : isTomorrow ? "Tomorrow" : "") + (isToday || isTomorrow ? " · " : "") +
                          date.toLocaleDateString("en-NG", { weekday:"short", day:"numeric", month:"short" });
                        const isDateSel = sessionDate === d;
                        return (
                          <div key={d} style={{ marginBottom:16 }}>
                            <div style={{ display:"inline-flex", alignItems:"center", gap:8, marginBottom:10, padding:"5px 14px", borderRadius:20, background: isDateSel ? G : "#F3F4F6", color: isDateSel ? "#fff" : "#374151", fontSize:13, fontWeight:800 }}>
                              {dayLabel}
                            </div>
                            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                              {slotsFor(d).map(t => {
                                const isSel = sessionDate === d && sessionTime === t;
                                return (
                                  <button key={t}
                                    onClick={() => { setSessionDate(d); setSessionTime(t); }}
                                    style={{ padding:"10px 16px", borderRadius:10, border:`2px solid ${isSel ? GM : "#E5E7EB"}`, background: isSel ? "#F0FDF4" : "#FAFAFA", color: isSel ? G : "#555", fontSize:13, fontWeight: isSel ? 800 : 500, cursor:"pointer", transition:"all .15s", minWidth:88 }}>
                                    {fmt12h(t)}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div style={{ background:"#FFFBEB", borderRadius:12, padding:"12px 14px", border:"1px solid #F9D46A", fontSize:12, color:"#78350F", lineHeight:1.6, display:"flex", gap:8, alignItems:"flex-start" }}>
                      <AlertCircle size={14} color={GOLD} style={{ flexShrink:0, marginTop:1 }} />
                      <span>Admin will confirm your slot within 24 hours. After the session, your level will be assigned and your full dashboard activated.</span>
                    </div>

                    <button onClick={bookSession} disabled={booking || !sessionDate || !sessionTime} style={{ width:"100%", padding:"14px", borderRadius:14, border:"none", background: !sessionDate || !sessionTime ? "#e5e7eb" : `linear-gradient(135deg,${G},${GM})`, color: !sessionDate || !sessionTime ? "#9ca3af" : "#fff", fontSize:15, fontWeight:800, cursor: !sessionDate || !sessionTime ? "not-allowed" : "pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:10, transition:"all .2s" }}>
                      {booking ? <><Loader2 style={{ width:18, height:18, animation:"spin .8s linear infinite" }} /> Booking…</> : <><Calendar size={18} /> Request Session</>}
                    </button>
                  </div>
                ) : (
                  <div style={{ textAlign:"center", animation:"fadeUp .4s ease" }}>
                    <div style={{ width:72, height:72, borderRadius:"50%", background:"#E8F5E9", border:"3px solid #22c55e", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px" }}>
                      <CheckCircle2 size={36} color="#22c55e" />
                    </div>
                    <div style={{ fontSize:20, fontWeight:800, color:G, marginBottom:8 }}>All 3 Stages Complete!</div>
                    <div style={{ fontSize:14, color:"#666", lineHeight:1.6, marginBottom:20 }}>
                      Session requested for <strong>{sessionDate && new Date(sessionDate + "T12:00:00").toLocaleDateString("en-NG", { weekday:"long", day:"numeric", month:"long" })}</strong> at <strong>{sessionTime ? fmt12h(sessionTime) : ""}</strong>.<br/>
                      Admin will confirm within 24 hours via notification.<br/>
                      <span style={{ fontFamily:"'Amiri',serif", fontSize:16, color:GOLD }}>جَزَاكَ اللَّهُ خَيْرًا</span>
                    </div>

                    <div style={{ background:"#F0FDF4", borderRadius:12, padding:"14px 16px", border:"1px solid #86EFAC", textAlign:"left", marginBottom:20 }}>
                      <div style={{ fontSize:12, fontWeight:700, color:"#166534", marginBottom:8 }}>What happens next:</div>
                      {["Admin confirms your session","Attend the 10–15 min live evaluation","Admin reviews all scores","You receive level assignment notification","Your full dashboard is activated!"].map((s,i) => (
                        <div key={i} style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, color:"#166534", marginBottom:i<4?6:0 }}>
                          <div style={{ width:18, height:18, borderRadius:"50%", background:"#22c55e", color:"#fff", fontSize:10, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{i+1}</div>
                          {s}
                        </div>
                      ))}
                    </div>

                    <button onClick={() => navigate("/student/awaiting-level")} style={{ width:"100%", padding:"14px", borderRadius:14, border:"none", background:`linear-gradient(135deg,${G},${GM})`, color:"#fff", fontSize:15, fontWeight:800, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:10 }}>
                      View Status <ArrowRight size={17} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RecitationTest;
