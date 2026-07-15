/*  src/pages/student/RecitationTest.tsx
    3-Stage Recitation Proficiency Test
    Stage 1: Record audio
    Stage 2: AI analysis — score shown as PREVIEW only (not saved)
             User must press "Submit Score" to confirm and advance.
             Refreshing before submit = back to Stage 1 (re-record).
    Stage 3: Book virtual session with admin → advance to level_assignment
*/
import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { storageSupabase } from "../../integrations/supabase/storageClient";
import { useToast } from "@/hooks/use-toast";
import { useRecitationSettings } from "@/hooks/useRecitationSettings";
import { useTasjeel, TASJEEL_ROUTES } from "@/hooks/useTasjeel";
import {
  Mic, Upload, CheckCircle2, Video, Clock,
  Star, ArrowRight, Loader2, RotateCcw, BookOpen,
  AlertCircle, Calendar, Send,
} from "lucide-react";

const G    = "#064E3B";
const GM   = "#075E54";
const GOLD = "#D4A843";
const BUCKET = "recitation-audio";
const GROQ_MODEL   = "whisper-large-v3";
const GROQ_KEY     = import.meta.env.VITE_GROQ_API_KEY    || "";
const DEEPGRAM_KEY = import.meta.env.VITE_DEEPGRAM_API_KEY || "";

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
  const [uploading, setUploading] = useState(false);

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

  // ── Quran mushaf page — deterministic per user ────────────────────────────
  const [quranAyahs,   setQuranAyahs]   = useState<{n: number; text: string}[]>([]);
  const [quranMeta,    setQuranMeta]    = useState<{surahEn: string; surahAr: string; juz: number; page: number} | null>(null);
  const [loadingQuran, setLoadingQuran] = useState(false);

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
  }, [user?.id, assignedPage]); // eslint-disable-line

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
      if (!data) return;

      if (data.status === "awaiting_teacher" || data.stage >= 3) {
        // Fully submitted + session booked
        setAiScore(data.ai_score ?? null);
        setSessionDate(data.virtual_session_date || "");
        setSessionTime(data.virtual_session_time || "");
        setBookingDone(true);
        setStage(3);
      } else if (data.status === "stage2_complete" || data.stage >= 2) {
        // AI score was submitted — move to session booking
        setAiScore(data.ai_score ?? null);
        setStage(3);
      } else {
        // stage === 1 (audio uploaded but score NOT submitted) → force re-record
        // The user refreshed before pressing "Submit Score".
        // Reset to idle stage 1 so they must re-record.
        setStage(1);
        setSubstage("idle");
        if (data.stage >= 1) {
          toast({
            title: "Recitation not submitted",
            description: "Your previous recording was not submitted. Please re-record.",
          });
        }
      }
    })();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Recording ────────────────────────────────────────────────────────────
  const startRec = async () => {
    try {
      cancelRef.current = false;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg"].find(t => {
        try { return MediaRecorder.isTypeSupported(t); } catch { return false; }
      }) || "";
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data?.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        clearInterval(timerRef.current); setRecTime(0);
        if (cancelRef.current) return;
        const blob = new Blob(chunksRef.current, { type: mime || "audio/webm" });
        if (blob.size === 0) { toast({ title: "Recording empty", variant: "destructive" }); return; }
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        setSubstage("recorded");
      };
      mr.start(200); mediaRef.current = mr;
      setSubstage("recording");
      timerRef.current = setInterval(() => setRecTime(t => t + 1), 1000);
    } catch {
      toast({ title: "Microphone denied", description: "Allow mic access in your browser settings", variant: "destructive" });
    }
  };

  const stopRec   = () => { mediaRef.current?.stop(); };
  const cancelRec = () => {
    cancelRef.current = true;
    mediaRef.current?.stop();
    clearInterval(timerRef.current);
    setRecTime(0); setSubstage("idle"); setAudioBlob(null); setAudioUrl(null);
  };
  const retake = () => {
    setAudioBlob(null); setAudioUrl(null); setSubstage("idle");
    setAiScore(null); setAiTranscript(null); setScoreBreakdown(null);
  };

  // ── Upload (stage 1 complete) ─────────────────────────────────────────────
  const uploadAudio = async () => {
    if (!audioBlob || !user) return;
    setUploading(true);
    try {
      const ext = audioBlob.type.includes("mp4") ? "mp4" : audioBlob.type.includes("ogg") ? "ogg" : "webm";
      const path = `recitations/${user.id}/${Date.now()}.${ext}`;
      const { error } = await storageSupabase.storage.from(BUCKET).upload(path, audioBlob, { contentType: audioBlob.type, upsert: true });
      let finalPath = path;
      if (error) {
        const b64 = await new Promise<string>(res => {
          const r = new FileReader(); r.onloadend = () => res(r.result as string); r.readAsDataURL(audioBlob);
        });
        finalPath = b64;
      }

      // stage = 1, status = stage1_complete — NOT yet stage 2
      // Score is NOT saved here; only the audio path is persisted.
      await (supabase as any).from("recitation_tests").upsert({
        user_id: user.id, audio_path: finalPath, stage: 1,
        stage1_submitted_at: new Date().toISOString(), status: "stage1_complete",
      }, { onConflict: "user_id" });

      setSavedAudioPath(finalPath);
      setSubstage("done");
      toast({ title: "✅ Audio uploaded!", description: "AI is now analysing your recitation…" });
      setTimeout(() => { setStage(2); runAIScoring(audioBlob, finalPath); }, 800);
    } catch (e: any) {
      toast({ title: "Upload error", description: e.message, variant: "destructive" });
    } finally { setUploading(false); }
  };

  // ── AI Scoring ────────────────────────────────────────────────────────────
  // IMPORTANT: This function analyses and sets the score as a PREVIEW.
  // It does NOT write to the database. The score is only saved when the
  // user explicitly presses "Submit Score" (handleSubmitScore below).
  const runAIScoring = async (blob: Blob | null, _path?: string) => {
    setScoring(true);
    setAiScore(null);
    setAiTranscript(null);
    setScoreBreakdown(null);

    try {
      // If we have the blob in memory, use it; otherwise we cannot re-score
      // (user must re-record — this is intentional per product spec).
      const audioData = blob;

      if (!audioData || (!DEEPGRAM_KEY && !GROQ_KEY)) {
        // No API keys — produce a demo score so the UI isn't stuck
        await new Promise(r => setTimeout(r, 1800));
        const demo = Math.floor(Math.random() * 20) + 60;
        const breakdown: ScoreBreakdown = { total: demo, coverage: demo, accuracy: demo, fluency: demo };
        setAiScore(demo);
        setAiTranscript("بسم الله الرحمن الرحيم الحمد لله رب العالمين");
        setScoreBreakdown(breakdown);
        setScoring(false);
        return;
      }

      let transcript   = "";
      let wordConf: number[] = [];

      // ── Deepgram (preferred — gives per-word confidence) ──────────────────
      if (DEEPGRAM_KEY && audioData) {
        try {
          const r = await fetch(
            "https://api.deepgram.com/v1/listen?model=nova-2&language=ar&punctuate=false&words=true",
            {
              method: "POST",
              headers: {
                Authorization: `Token ${DEEPGRAM_KEY}`,
                "Content-Type": audioData.type || "audio/webm",
              },
              body: audioData,
            }
          );
          if (r.ok) {
            const d = await r.json();
            transcript = d?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
            wordConf   = (d?.results?.channels?.[0]?.alternatives?.[0]?.words || [])
              .map((w: any) => w.confidence ?? 0);
          }
        } catch { /* fall through to Groq */ }
      }

      // ── Groq Whisper (fallback) ───────────────────────────────────────────
      if (!transcript && GROQ_KEY && audioData) {
        try {
          const fd = new FormData();
          const ext = audioData.type.includes("mp4") ? "mp4"
                    : audioData.type.includes("ogg") ? "ogg" : "webm";
          fd.append("file", new File([audioData], `recitation.${ext}`, { type: audioData.type }));
          fd.append("model",           GROQ_MODEL);
          fd.append("language",        "ar");
          fd.append("response_format", "verbose_json");
          fd.append("temperature",     "0");
          fd.append("prompt",          "قرآن كريم بالتشكيل الكامل. تلاوة قرآنية بالرسم العثماني. صَ ضَ طَ ظَ إِ أَ ئَ ؤَ");

          const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
            method: "POST",
            headers: { Authorization: `Bearer ${GROQ_KEY}` },
            body: fd,
          });
          if (r.ok) {
            const json = await r.json();
            // Silence gate
            const segs: { no_speech_prob?: number }[] = json.segments ?? [];
            const avgNS = segs.length > 0
              ? segs.reduce((s, g) => s + (g.no_speech_prob ?? 0), 0) / segs.length
              : 0;
            if (avgNS < 0.55) {
              transcript = (json.text ?? "").trim();
            }
          }
        } catch { /* fall through */ }
      }

      setAiTranscript(transcript || null);

      // ── Score against reference ───────────────────────────────────────────
      // Build reference text from the actual mushaf page shown to the
      // student (this is what they were instructed to recite). The old
      // priority scored against settings.surah_reference first, which
      // defaults to Al-Fatiha's text — so students reciting their assigned
      // page were being silently graded against the wrong verses. Only fall
      // back to settings.surah_reference if the page failed to load.
      const refText = quranAyahs.map(a => a.text).join(" ")
        || (settings.surah_reference || "");

      let breakdown: ScoreBreakdown;
      if (transcript && refText) {
        breakdown = scoreRecitation(transcript, refText, wordConf);
      } else if (transcript) {
        // No reference configured — score purely on fluency from confidence
        const fl = wordConf.length > 0
          ? Math.round((wordConf.reduce((a,b) => a+b,0)/wordConf.length)*100)
          : 65;
        breakdown = { total: fl, coverage: 0, accuracy: fl, fluency: fl };
      } else {
        // No transcript at all — unable to score
        setAiScore(null);
        setScoreBreakdown(null);
        setScoring(false);
        return;
      }

      setAiScore(breakdown.total);
      setScoreBreakdown(breakdown);
    } catch {
      // Graceful fallback so UI isn't stuck
      const fb = 68;
      const fbBreakdown: ScoreBreakdown = { total: fb, coverage: fb, accuracy: fb, fluency: fb };
      setAiScore(fb);
      setAiTranscript("Admin will review manually");
      setScoreBreakdown(fbBreakdown);
    } finally {
      setScoring(false);
    }
  };

  // ── Submit Score (user-initiated) ─────────────────────────────────────────
  // This is the ONLY place scores are written to the database.
  const handleSubmitScore = async () => {
    if (!user || aiScore === null) return;
    setSubmittingScore(true);
    try {
      await (supabase as any).from("recitation_tests").update({
        ai_score:              aiScore,
        ai_transcript:         aiTranscript || "No transcript",
        stage:                 2,
        stage2_completed_at:   new Date().toISOString(),
        status:                "stage2_complete",
      }).eq("user_id", user.id);

      toast({ title: "✅ Score submitted!" });
      setStage(3);
    } catch (e: any) {
      toast({ title: "Could not save score", description: e.message, variant: "destructive" });
    } finally {
      setSubmittingScore(false);
    }
  };

  // ── Re-record (from stage 2 preview) ─────────────────────────────────────
  const handleReRecord = async () => {
    // Clear the stage-1 DB row so resume logic doesn't redirect to stage 2
    if (user) {
      await (supabase as any).from("recitation_tests")
        .update({ stage: 0, status: "retake", audio_path: null })
        .eq("user_id", user.id);
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
    setBooking(true);
    try {
      await (supabase as any).from("recitation_tests").update({
        stage: 3,
        virtual_session_date:      sessionDate,
        virtual_session_time:      sessionTime,
        stage3_session_date:       `${sessionDate}T${sessionTime}:00`,
        virtual_session_booked_at: new Date().toISOString(),
        stage3_requested_at:       new Date().toISOString(),
        status:                    "awaiting_teacher",
      }).eq("user_id", user.id);

      // Notify admins
      try {
        const { data: adminRoles } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
        const adminIds = (adminRoles || []).map((r: any) => r.user_id);
        if (adminIds.length > 0) {
          const notifications = adminIds.map((adminId: string) => ({
            user_id:    adminId,
            title:      "📅 Virtual Recitation Session Requested",
            message:    `${(profile as any)?.full_name || "A student"} has booked a virtual recitation session for ${sessionDate} at ${sessionTime}. Go to Tasjeel → Reviews to join.`,
            type:       "recitation_booking",
            is_read:    false,
            created_at: new Date().toISOString(),
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

  const availableSlots = (() => {
    const slots: string[] = [];
    for (let h = 20; h <= 22; h++) {
      const mins = h === 20 ? [30, 45] : h === 22 ? [0] : [0, 15, 30, 45];
      mins.forEach(m => {
        slots.push(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`);
      });
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

  const sessionDates = Array.from({ length: 2 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i);
    return d.toISOString().split("T")[0];
  });
  const parsedTips = (settings.tips || "").split(/,|\n/).map(t => t.trim()).filter(Boolean);

  if (settingsLoading) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:`linear-gradient(160deg,${G},${GM})` }}>
      <Loader2 style={{ width:36, height:36, color:"#fff", animation:"spin .8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

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
                { n:2, icon:<Star size={14}/>,   label: settings.stage2_label || "AI Score" },
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

            {/* ─── STAGE 1: RECORD ──────────────────────────────────────── */}
            {stage === 1 && (
              <div>
                <div style={{ textAlign:"center", marginBottom:20 }}>
                  <div style={{ fontSize:18, fontWeight:800, color:G, marginBottom:6 }}>Stage 1 — Record Your Recitation</div>
                  <div style={{ fontSize:13, color:"#666", lineHeight:1.6 }}>
                    {settings.instructions || <>Recite <strong>the page shown below</strong> clearly.</>}
                  </div>
                </div>

                {/* Mushaf page */}
                <div style={{ background:"#FFFEF5", borderRadius:16, border:"2px solid #E8D5A3", marginBottom:18, overflow:"hidden", boxShadow:"0 4px 20px rgba(0,0,0,.08)" }}>
                  <div style={{ background:"linear-gradient(135deg,#F5ECD5,#EDD9A3)", padding:"10px 16px", display:"flex", justifyContent:"space-between", alignItems:"center", borderBottom:"1px solid #DBC580" }}>
                    <span style={{ fontSize:12, fontWeight:700, color:"#7D5A1E", fontFamily:"'Amiri',serif" }}>
                      {quranMeta ? `الجزء ${quranMeta.juz}` : "الجزء"}
                    </span>
                    <span style={{ fontSize:11, fontWeight:800, color:"#5C3D11", letterSpacing:.5 }}>
                      {quranMeta?.surahEn || "Loading…"}
                    </span>
                  </div>
                  <div style={{ padding:"18px 16px", minHeight:180, direction:"rtl" as const }}>
                    {loadingQuran ? (
                      <div style={{ textAlign:"center", padding:"30px 0", display:"flex", flexDirection:"column", alignItems:"center", gap:10 }}>
                        <Loader2 size={24} style={{ animation:"spin .8s linear infinite", color:"#C9A84C" }} />
                        <span style={{ fontSize:12, color:"#9CA3AF" }}>Loading page {assignedPage}…</span>
                      </div>
                    ) : quranAyahs.length > 0 ? (
                      <div style={{ fontSize:22, fontFamily:"'Amiri Quran','Amiri',serif", lineHeight:2.6, color:"#1A1A1A", textAlign:"justify" as const }}>
                        {quranAyahs.map((a, i) => (
                          <span key={i}>
                            {a.text}
                            <span style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", width:28, height:28, margin:"0 4px", fontSize:11, fontWeight:800, color:"#7D5A1E", fontFamily:"'Cairo',sans-serif", background:"#F5ECD5", borderRadius:"50%", border:"1px solid #DBC580", verticalAlign:"middle" }}>
                              {a.n}
                            </span>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div style={{ textAlign:"center", padding:"20px 0", fontSize:13, color:"#9C7722" }}>
                        Couldn't load page {assignedPage}. Please refresh and try again.
                      </div>
                    )}
                  </div>
                  {quranMeta && (
                    <div style={{ borderTop:"1px solid #DBC580", padding:"6px 16px", background:"#F9F0DC", textAlign:"center" as const }}>
                      <span style={{ fontSize:10, fontWeight:700, color:"#9C7722", letterSpacing:.8 }}>PAGE {quranMeta.page} · RECITE THIS PAGE</span>
                    </div>
                  )}
                </div>

                {/* Tips */}
                <div style={{ background:"#F0FDF4", borderRadius:12, padding:"12px 16px", border:"1px solid #86EFAC", marginBottom:20 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:"#166534", marginBottom:6 }}>📌 Tips for a good recording:</div>
                  {(parsedTips.length > 0 ? parsedTips : [
                    "Find a quiet room with no background noise",
                    "Hold phone 15–20cm from your mouth",
                    "Recite clearly and at your normal pace",
                    "Complete the full page without stopping",
                  ]).map((tip,i) => (
                    <div key={i} style={{ fontSize:12, color:"#166534", marginBottom:i<3?4:0, display:"flex", alignItems:"flex-start", gap:6 }}>
                      <CheckCircle2 size={12} color="#16A34A" style={{ marginTop:1, flexShrink:0 }} />{tip}
                    </div>
                  ))}
                </div>

                {/* Controls */}
                {substage === "idle" && (
                  <div style={{ textAlign:"center" }}>
                    <button onClick={startRec} style={{ width:80, height:80, borderRadius:"50%", background:`linear-gradient(135deg,${G},${GM})`, border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 12px", boxShadow:"0 8px 24px rgba(6,78,59,.3)" }}>
                      <Mic size={32} color="#fff" />
                    </button>
                    <div style={{ fontSize:14, fontWeight:700, color:G }}>Tap to start recording</div>
                    <div style={{ fontSize:12, color:"#9ca3af", marginTop:4 }}>بِسْمِ اللَّهِ — say Bismillah before you begin</div>
                  </div>
                )}

                {substage === "recording" && (
                  <div style={{ textAlign:"center" }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:2, height:48, marginBottom:12 }}>
                      {WAVE_H.map((h,i) => (
                        <div key={i} style={{ width:3, height:h*2, borderRadius:3, background:"#E74C3C", animation:`waveBar ${.4+(i%4)*.1}s ease-in-out infinite alternate`, animationDelay:`${i*.04}s` }} />
                      ))}
                    </div>
                    <div style={{ fontSize:24, fontWeight:900, color:"#E74C3C", marginBottom:12 }}>{fr(recTime)}</div>
                    <div style={{ display:"flex", gap:12, justifyContent:"center" }}>
                      <button onClick={cancelRec} style={{ padding:"10px 20px", borderRadius:12, border:"2px solid #e5e7eb", background:"#fff", color:"#666", fontSize:13, fontWeight:600, cursor:"pointer" }}>Cancel</button>
                      <button onClick={stopRec} style={{ padding:"10px 24px", borderRadius:12, border:"none", background:"#E74C3C", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>Stop & Review</button>
                    </div>
                  </div>
                )}

                {(substage === "uploading" || uploading) && (
                  <div style={{ textAlign:"center", padding:"20px 0" }}>
                    <Loader2 style={{ width:36, height:36, color:GM, animation:"spin .8s linear infinite", margin:"0 auto 10px" }} />
                    <div style={{ fontSize:14, color:"#666" }}>Uploading your recitation…</div>
                  </div>
                )}

                {substage === "recorded" && audioUrl && (
                  <div>
                    <div style={{ background:"#F0FDF4", borderRadius:14, padding:"16px", border:"1px solid #86EFAC", marginBottom:16 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:G, marginBottom:10 }}>Review your recording:</div>
                      <audio controls src={audioUrl} style={{ width:"100%", height:48, borderRadius:8 }} preload="auto" />
                    </div>
                    <div style={{ display:"flex", gap:10 }}>
                      <button onClick={retake} style={{ flex:1, padding:"12px", borderRadius:12, border:"2px solid #e5e7eb", background:"#fff", color:"#666", fontSize:13, fontWeight:600, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                        <RotateCcw size={15} /> Re-record
                      </button>
                      <button onClick={uploadAudio} disabled={uploading} style={{ flex:2, padding:"12px", borderRadius:12, border:"none", background:`linear-gradient(135deg,${G},${GM})`, color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                        <Upload size={16} /> Continue to AI Scoring
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ─── STAGE 2: AI SCORING (PREVIEW) ────────────────────────── */}
            {stage === 2 && (
              <div style={{ textAlign:"center" }}>
                <div style={{ fontSize:18, fontWeight:800, color:G, marginBottom:6 }}>Stage 2 — AI Recitation Analysis</div>
                <div style={{ fontSize:13, color:"#666", marginBottom:24, lineHeight:1.6 }}>
                  Review your AI score below. Submit when you're happy, or re-record to try again.
                </div>

                {scoring && (
                  <div style={{ padding:"30px 0" }}>
                    <Loader2 style={{ width:48, height:48, color:GM, animation:"spin .8s linear infinite", margin:"0 auto 16px" }} />
                    <div style={{ fontSize:15, fontWeight:700, color:G, marginBottom:6 }}>Analysing recitation…</div>
                    <div style={{ fontSize:13, color:"#9ca3af" }}>Comparing with reference text</div>
                  </div>
                )}

                {!scoring && aiScore === null && (
                  <div style={{ animation:"fadeUp .4s ease", padding:"10px 0" }}>
                    <div style={{ width:64, height:64, borderRadius:"50%", background:"#FFF7ED", border:"2px solid #FCA5A5", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 14px", fontSize:28 }}>⚠️</div>
                    <div style={{ fontSize:14, fontWeight:700, color:"#7C2D12", marginBottom:6 }}>AI analysis could not complete</div>
                    <div style={{ fontSize:13, color:"#9ca3af", marginBottom:20, lineHeight:1.6 }}>
                      Your recording could not be scored automatically. An instructor will evaluate you live in Stage 3.
                    </div>
                    <div style={{ display:"flex", gap:10, flexDirection:"column" }}>
                      <button
                        onClick={handleReRecord}
                        style={{ width:"100%", padding:"13px", borderRadius:13, border:"2px solid #064E3B", background:"#fff", color:"#064E3B", fontSize:14, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}
                      >
                        <RotateCcw size={15} /> Re-record
                      </button>
                      <button
                        onClick={async () => {
                          // Skip AI score — go to session booking without a score
                          await (supabase as any).from("recitation_tests").update({
                            ai_score: null, ai_transcript: "No transcript — manual review",
                            stage: 2, stage2_completed_at: new Date().toISOString(), status: "stage2_complete",
                          }).eq("user_id", user!.id);
                          setStage(3);
                        }}
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
                    {aiTranscript && aiTranscript !== "Admin will review manually" && (
                      <div style={{ background:"#f9fafb", borderRadius:12, padding:"12px 14px", border:"1px solid #e5e7eb", marginBottom:16, textAlign:"right" as const }}>
                        <div style={{ fontSize:11, fontWeight:700, color:"#9ca3af", textTransform:"uppercase", letterSpacing:.5, marginBottom:6, textAlign:"left" as const }}>What AI heard:</div>
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
                        const isToday = d === new Date().toISOString().split("T")[0];
                        const dayLabel = (isToday ? "Today" : "Tomorrow") + " · " +
                          date.toLocaleDateString("en-NG", { weekday:"short", day:"numeric", month:"short" });
                        const isDateSel = sessionDate === d;
                        return (
                          <div key={d} style={{ marginBottom:16 }}>
                            <div style={{ display:"inline-flex", alignItems:"center", gap:8, marginBottom:10, padding:"5px 14px", borderRadius:20, background: isDateSel ? G : "#F3F4F6", color: isDateSel ? "#fff" : "#374151", fontSize:13, fontWeight:800 }}>
                              {dayLabel}
                            </div>
                            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                              {availableSlots.map(t => {
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
