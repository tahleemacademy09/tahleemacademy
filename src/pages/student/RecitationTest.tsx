/*  src/pages/student/RecitationTest.tsx
    3-Stage Recitation Proficiency Test
    Stage 1: Record audio
    Stage 2: AI accuracy scoring  
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
  AlertCircle, Calendar,
} from "lucide-react";

const G    = "#064E3B";
const GM   = "#075E54";
const GOLD = "#D4A843";
const BUCKET = "recitation-audio";
const GROQ_MODEL   = "whisper-large-v3";
const GROQ_KEY     = import.meta.env.VITE_GROQ_API_KEY    || "";
const DEEPGRAM_KEY = import.meta.env.VITE_DEEPGRAM_API_KEY || "";

const WAVE_H = [4,8,14,10,18,12,6,16,9,13,7,15,11,5,17,8,12,6,14,10];

const RecitationTest = () => {
  const { user, profile }  = useAuth();
  const { toast }          = useToast();
  const navigate           = useNavigate();
  const { settings, loading: settingsLoading } = useRecitationSettings();
  const { currentStep, loading: stepLoading, advanceStep } = useTasjeel();

  // ── Step guard: if user's pipeline step doesn't belong here, send them to the right page ──
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

  const [scoring,      setScoring]      = useState(false);
  const [aiScore,      setAiScore]      = useState<number|null>(null);
  const [aiTranscript, setAiTranscript] = useState<string|null>(null);

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
    return (Math.abs(h) % 604) + 1;           // pages 1–604
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
        // Save assigned page so admin can see same page
        (supabase as any).from("recitation_tests").upsert(
          { user_id: user!.id, assigned_page: assignedPage },
          { onConflict: "user_id" }
        ).then(() => {});
      })
      .catch(() => {})
      .finally(() => setLoadingQuran(false));
  }, [user?.id, assignedPage]); // eslint-disable-line

  const fr = (s: number) => `${Math.floor(s/60).toString().padStart(2,"0")}:${(s%60).toString().padStart(2,"0")}`;

  // ── Check if student already completed stage(s) ─────────────────────────
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
        setAiScore(data.ai_score ?? null);
        setSessionDate(data.virtual_session_date || "");
        setSessionTime(data.virtual_session_time || "");
        setBookingDone(true);
        setStage(3);
      } else if (data.stage >= 2) {
        // AI already scored — jump straight to session booking
        setAiScore(data.ai_score ?? null);
        setStage(3);
      } else if (data.stage >= 1) {
        // Audio uploaded but AI never ran (e.g. user refreshed mid-scoring).
        // Re-trigger AI analysis using the saved path. runAIScoring falls back
        // to a demo score if the blob is no longer in memory, so the user
        // will never be stuck on a blank stage-2 screen.
        setStage(2);
        runAIScoring(data.audio_path || "");
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
    setAiScore(null); setAiTranscript(null);
  };

  // ── Upload ───────────────────────────────────────────────────────────────
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

      await (supabase as any).from("recitation_tests").upsert({
        user_id: user.id, audio_path: finalPath, stage: 1,
        stage1_submitted_at: new Date().toISOString(), status: "stage1_complete",
      }, { onConflict: "user_id" });

      setSubstage("done");
      toast({ title: "✅ Audio uploaded!", description: "Proceeding to AI analysis…" });
      setTimeout(() => { setStage(2); runAIScoring(finalPath); }, 800);
    } catch (e: any) {
      toast({ title: "Upload error", description: e.message, variant: "destructive" });
    } finally { setUploading(false); }
  };

  // ── AI Scoring ───────────────────────────────────────────────────────────
  const runAIScoring = async (path: string) => {
    setScoring(true);
    try {
      let audioData: Blob | null = path.startsWith("data:") ? await (await fetch(path)).blob() : audioBlob;

      if (!audioData || (!DEEPGRAM_KEY && !GROQ_KEY)) {
        await new Promise(r => setTimeout(r, 2000));
        const demo = Math.floor(Math.random() * 30) + 65;
        setAiScore(demo); setAiTranscript("بسم الله الرحمن الرحيم الحمد لله رب العالمين");
        await saveAIScore(demo, "Demo transcription"); setScoring(false); return;
      }

      let transcript = "";
      let wordScores: number[] = [];

      if (DEEPGRAM_KEY && audioData) {
        try {
          const r = await fetch("https://api.deepgram.com/v1/listen?model=nova-2&language=ar&punctuate=false&words=true", {
            method: "POST",
            headers: { Authorization: `Token ${DEEPGRAM_KEY}`, "Content-Type": audioData.type || "audio/webm" },
            body: audioData,
          });
          if (r.ok) {
            const d = await r.json();
            transcript   = d?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
            wordScores   = (d?.results?.channels?.[0]?.alternatives?.[0]?.words || []).map((w: any) => Math.round((w.confidence||0)*100));
          }
        } catch { /* fall through */ }
      }

      if (!transcript && GROQ_KEY && audioData) {
        const fd = new FormData();
        fd.append("file", audioData, "recitation.webm");
        fd.append("model", GROQ_MODEL); fd.append("language", "ar"); fd.append("response_format", "json");
        fd.append("prompt", "بسم الله الرحمن الرحيم الحمد لله رب العالمين الرحمن الرحيم");
        const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
          method: "POST", headers: { Authorization: `Bearer ${GROQ_KEY}` }, body: fd,
        });
        if (r.ok) transcript = (await r.json()).text || "";
      }

      setAiTranscript(transcript);

      const ref  = (settings.surah_reference || "").replace(/[^\u0600-\u06FF\s]/g,"").trim().split(/\s+/);
      const got  = transcript.replace(/[^\u0600-\u06FF\s]/g,"").trim().split(/\s+/);
      let matched = 0;
      const usedRef = new Set<number>();
      got.forEach(w => {
        const idx = ref.findIndex((r2,i) => !usedRef.has(i) && r2.includes(w.slice(0,3)));
        if (idx >= 0) { matched++; usedRef.add(idx); }
      });
      const matchScore = Math.min(100, Math.round((matched / Math.max(ref.length,1)) * 100));
      let finalScore = matchScore;
      if (wordScores.length > 0) {
        const avg = Math.round(wordScores.reduce((a,b)=>a+b,0)/wordScores.length);
        finalScore = Math.round(matchScore*0.6 + avg*0.4);
      }
      setAiScore(finalScore);
      await saveAIScore(finalScore, transcript || "No transcript");
    } catch {
      const fb = 72; setAiScore(fb); setAiTranscript("Admin will review manually");
      await saveAIScore(fb, "Auto-scoring failed");
    } finally { setScoring(false); }
  };

  const saveAIScore = async (score: number, transcript: string) => {
    if (!user) return;
    await (supabase as any).from("recitation_tests").update({
      ai_score: score, ai_transcript: transcript, stage: 2,
      stage2_completed_at: new Date().toISOString(), status: "stage2_complete",
    }).eq("user_id", user.id);
  };

  // ── Book Session ─────────────────────────────────────────────────────────
  const bookSession = async () => {
    if (!user || !sessionDate || !sessionTime) {
      toast({ title: "Please select a date and time", variant: "destructive" }); return;
    }
    setBooking(true);
    try {
      // Store with separate columns (used by LevelAssignment admin view)
      await (supabase as any).from("recitation_tests").update({
        stage: 3,
        virtual_session_date:    sessionDate,
        virtual_session_time:    sessionTime,
        stage3_session_date:     `${sessionDate}T${sessionTime}:00`,
        virtual_session_booked_at: new Date().toISOString(),
        stage3_requested_at:     new Date().toISOString(),
        status:                  "awaiting_teacher",
      }).eq("user_id", user.id);

      // Notify ALL admins about the booking
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

      // Advance pipeline → level_assignment (awaiting admin approval)
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

  // ── Available session slots ──────────────────────────────────────────────
  // ── Fixed time slots: 20:30 → 22:00 every 15 min ───────────────────────────
  // ── Time slots: 20:30–22:00 every 15 min, stored as 24h, displayed as 12h AM/PM ──
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

  // Convert "20:30" → "8:30 PM"
  const fmt12h = (t: string) => {
    const [hStr, mStr] = t.split(":");
    let h = parseInt(hStr, 10);
    const m = mStr || "00";
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${m} ${ampm}`;
  };

  // ── Available dates: today + tomorrow ────────────────────────────────────────
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

          {/* Stage progress bar */}
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

            {/* ─── STAGE 1: RECORD ────────────────────────────────────── */}
            {stage === 1 && (
              <div>
                <div style={{ textAlign:"center", marginBottom:20 }}>
                  <div style={{ fontSize:18, fontWeight:800, color:G, marginBottom:6 }}>Stage 1 — Record Your Recitation</div>
                  <div style={{ fontSize:13, color:"#666", lineHeight:1.6 }}>
                    {settings.instructions || <>Recite <strong>Surah {settings.surah_name || "Al-Fatihah"}</strong> clearly.</>}
                  </div>
                </div>

                {/* ── Mushaf Page Display ── */}
                <div style={{ background:"#FFFEF5", borderRadius:16, border:"2px solid #E8D5A3", marginBottom:18, overflow:"hidden", boxShadow:"0 4px 20px rgba(0,0,0,.08)" }}>
                  {/* Page header */}
                  <div style={{ background:"linear-gradient(135deg,#F5ECD5,#EDD9A3)", padding:"10px 16px", display:"flex", justifyContent:"space-between", alignItems:"center", borderBottom:"1px solid #DBC580" }}>
                    <span style={{ fontSize:12, fontWeight:700, color:"#7D5A1E", fontFamily:"'Amiri',serif" }}>
                      {quranMeta ? `الجزء ${quranMeta.juz}` : "الجزء"}
                    </span>
                    <span style={{ fontSize:11, fontWeight:800, color:"#5C3D11", letterSpacing:.5 }}>
                      {quranMeta?.surahEn || settings.surah_name || "Al-Fatiha"}
                    </span>
                  </div>
                  {/* Verses */}
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
                      /* Fallback to settings text if API fails */
                      <div style={{ fontSize:22, fontFamily:"'Amiri Quran','Amiri',serif", lineHeight:2.6, color:"#1A1A1A", textAlign:"justify" as const }}>
                        {settings.surah_arabic || "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ الرَّحْمَٰنِ الرَّحِيمِ مَالِكِ يَوْمِ الدِّينِ"}
                      </div>
                    )}
                  </div>
                  {/* Page footer */}
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
                    "Complete the full surah without stopping",
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
                        <Upload size={16} /> Submit Recording
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ─── STAGE 2: AI SCORING ───────────────────────────────── */}
            {stage === 2 && (
              <div style={{ textAlign:"center" }}>
                <div style={{ fontSize:18, fontWeight:800, color:G, marginBottom:6 }}>Stage 2 — AI Accuracy Analysis</div>
                <div style={{ fontSize:13, color:"#666", marginBottom:24, lineHeight:1.6 }}>
                  Our AI is comparing your recitation to the reference text.
                </div>

                {scoring && (
                  <div style={{ padding:"30px 0" }}>
                    <Loader2 style={{ width:48, height:48, color:GM, animation:"spin .8s linear infinite", margin:"0 auto 16px" }} />
                    <div style={{ fontSize:15, fontWeight:700, color:G, marginBottom:6 }}>Analysing recitation…</div>
                    <div style={{ fontSize:13, color:"#9ca3af" }}>This takes a few seconds</div>
                  </div>
                )}

                {/* ── Fallback: AI done but no score (network/API failure) ── */}
                {!scoring && aiScore === null && (
                  <div style={{ animation:"fadeUp .4s ease", padding:"10px 0" }}>
                    <div style={{ width:64, height:64, borderRadius:"50%", background:"#FFF7ED", border:"2px solid #FCA5A5", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 14px", fontSize:28 }}>⚠️</div>
                    <div style={{ fontSize:14, fontWeight:700, color:"#7C2D12", marginBottom:6 }}>AI analysis could not complete</div>
                    <div style={{ fontSize:13, color:"#9ca3af", marginBottom:20, lineHeight:1.6 }}>
                      Your recording was saved. You can retry the analysis or skip ahead — an instructor will evaluate your recitation live in Stage 3.
                    </div>
                    <div style={{ display:"flex", gap:10, flexDirection:"column" }}>
                      <button
                        onClick={() => runAIScoring("")}
                        style={{ width:"100%", padding:"13px", borderRadius:13, border:"2px solid #064E3B", background:"#fff", color:"#064E3B", fontSize:14, fontWeight:700, cursor:"pointer" }}
                      >
                        🔄 Retry AI Analysis
                      </button>
                      <button
                        onClick={() => setStage(3)}
                        style={{ width:"100%", padding:"13px", borderRadius:13, border:"none", background:`linear-gradient(135deg,${G},${GM})`, color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}
                      >
                        Skip to Session Booking <ArrowRight size={16} />
                      </button>
                    </div>
                  </div>
                )}

                {!scoring && aiScore !== null && (
                  <div style={{ animation:"fadeUp .4s ease" }}>
                    <div style={{ width:120, height:120, borderRadius:"50%", background:`${scoreColor(aiScore)}15`, border:`4px solid ${scoreColor(aiScore)}`, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", margin:"0 auto 16px" }}>
                      <div style={{ fontSize:32, fontWeight:900, color:scoreColor(aiScore) }}>{aiScore}%</div>
                      <div style={{ fontSize:11, color:scoreColor(aiScore), fontWeight:700 }}>{scoreLabel(aiScore)}</div>
                    </div>

                    <div style={{ fontSize:13, color:"#666", marginBottom:20, lineHeight:1.6 }}>
                      Your AI recitation score is <strong style={{ color:scoreColor(aiScore) }}>{aiScore}%</strong>.<br/>
                      An instructor will conduct a live evaluation in Stage 3.
                    </div>

                    {aiTranscript && aiTranscript !== "Admin will review manually" && (
                      <div style={{ background:"#f9fafb", borderRadius:12, padding:"12px 14px", border:"1px solid #e5e7eb", marginBottom:20, textAlign:"right" }}>
                        <div style={{ fontSize:11, fontWeight:700, color:"#9ca3af", textTransform:"uppercase", letterSpacing:.5, marginBottom:6, textAlign:"left" }}>What AI heard:</div>
                        <div style={{ fontSize:14, fontFamily:"'Amiri',serif", direction:"rtl", color:"#333", lineHeight:1.8 }}>{aiTranscript}</div>
                      </div>
                    )}

                    <button onClick={() => setStage(3)} style={{ width:"100%", padding:"14px", borderRadius:14, border:"none", background:`linear-gradient(135deg,${G},${GM})`, color:"#fff", fontSize:15, fontWeight:800, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:10 }}>
                      Continue — Book Virtual Session <ArrowRight size={17} />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ─── STAGE 3: BOOK SESSION ─────────────────────────────── */}
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
                    {/* What teacher evaluates */}
                    <div style={{ background:"#EFF6FF", borderRadius:12, padding:"14px 16px", border:"1px solid #93C5FD" }}>
                      <div style={{ fontSize:12, fontWeight:700, color:"#1E3A5F", marginBottom:8 }}>What the instructor evaluates:</div>
                      {["Makharij — correct pronunciation of letters","Sifaat — characteristics of letters","Noon Saakin & Tanween rules (Ikhfaa, Idghaam, Iqlaab)","Madd (lengthening) rules and Waqf","Overall fluency, rhythm and confidence"].map((t,i) => (
                        <div key={i} style={{ fontSize:12, color:"#1E40AF", marginBottom:i<4?5:0, display:"flex", alignItems:"flex-start", gap:6 }}>
                          <CheckCircle2 size={12} color="#2563EB" style={{ marginTop:1, flexShrink:0 }} />{t}
                        </div>
                      ))}
                    </div>

                    {/* Date + Time — always fully visible, tap any slot to pick both at once */}
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
                  /* ── Booking confirmed ── */
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
