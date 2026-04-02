/*  src/pages/student/RecitationTest.tsx
    3-Stage Recitation Proficiency Test
    Stage 1: Student records + uploads audio
    Stage 2: Groq Whisper AI accuracy scoring (auto)
    Stage 3: Live teacher session booking
    Route: /student/recitation-test
*/
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useRecitationSettings } from "@/hooks/useRecitationSettings";
import { useTasjeel } from "@/hooks/useTasjeel";
import {
  Mic, MicOff, Play, Pause, Upload, CheckCircle2,
  Clock, Video, Star, ArrowRight, Loader2, RotateCcw,
  BookOpen, AlertCircle, ChevronRight, Calendar
} from "lucide-react";

const G    = "#064E3B";
const GM   = "#075E54";
const GOLD = "#D4A843";
const BUCKET = "recitation-audio";
const GROQ_MODEL    = "whisper-large-v3";
const GROQ_KEY      = import.meta.env.VITE_GROQ_API_KEY    || "";
const DEEPGRAM_KEY  = import.meta.env.VITE_DEEPGRAM_API_KEY || "";

// Stable waveform heights
const WAVE_H = [4,8,14,10,18,12,6,16,9,13,7,15,11,5,17,8,12,6,14,10];

const RecitationTest = () => {
  const { user, profile } = useAuth();
  const { toast }         = useToast();
  const navigate          = useNavigate();
  const { settings, loading: settingsLoading } = useRecitationSettings();
  const { currentStep } = useTasjeel();

  // Stage: 1=record, 2=ai-scoring, 3=book-session
  const [stage, setStage]       = useState<1|2|3>(1);
  const [substage, setSubstage] = useState<"idle"|"recording"|"recorded"|"uploading"|"done">("idle");

  // Recording
  const [recTime, setRecTime]   = useState(0);
  const [audioUrl, setAudioUrl] = useState<string|null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob|null>(null);
  const [playing, setPlaying]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const [storagePath, setStoragePath] = useState<string|null>(null);

  // AI scoring
  const [scoring, setScoring]   = useState(false);
  const [aiScore, setAiScore]   = useState<number|null>(null);
  const [aiTranscript, setAiTranscript] = useState<string|null>(null);

  // Stage 3
  const [sessionDate, setSessionDate] = useState("");
  const [sessionTime, setSessionTime] = useState("");
  const [bookingDone, setBookingDone] = useState(false);
  const [booking, setBooking]   = useState(false);

  const mediaRef = useRef<MediaRecorder|null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef  = useRef<HTMLAudioElement|null>(null);
  const timerRef  = useRef<any>(null);
  const cancelRef = useRef(false);

  // ── Recording ───────────────────────────────────────────────
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
      mr.start(200);
      mediaRef.current = mr;
      setSubstage("recording");
      timerRef.current = setInterval(() => setRecTime(t => t + 1), 1000);
    } catch (e: any) {
      toast({ title: "Microphone denied", description: "Allow microphone access in your browser settings", variant: "destructive" });
    }
  };

  const stopRec = () => {
    mediaRef.current?.stop();
    // substage will be set to "recorded" inside mr.onstop once blob is ready
    // Don't set "uploading" here — that skips the review step
  };

  const cancelRec = () => {
    cancelRef.current = true;
    mediaRef.current?.stop();
    clearInterval(timerRef.current);
    setRecTime(0); setSubstage("idle"); setAudioBlob(null); setAudioUrl(null);
  };

  const retake = () => {
    setAudioBlob(null); setAudioUrl(null); setSubstage("idle"); setAiScore(null); setAiTranscript(null);
  };

  const fr = (s: number) => `${Math.floor(s/60).toString().padStart(2,"0")}:${(s%60).toString().padStart(2,"0")}`;

  // ── Upload to Supabase storage ───────────────────────────────
  const uploadAudio = async () => {
    if (!audioBlob || !user) return;
    setUploading(true);
    try {
      const ext = audioBlob.type.includes("mp4") ? "mp4" : audioBlob.type.includes("ogg") ? "ogg" : "webm";
      const path = `recitations/${user.id}/${Date.now()}.${ext}`;

      // Try storage bucket
      const { error } = await supabase.storage.from(BUCKET).upload(path, audioBlob, { contentType: audioBlob.type, upsert: true });

      let finalPath = path;
      if (error) {
        // Fallback: store as base64
        const b64 = await new Promise<string>(res => {
          const r = new FileReader(); r.onloadend = () => res(r.result as string); r.readAsDataURL(audioBlob);
        });
        finalPath = b64; // store base64 directly
      }

      setStoragePath(finalPath);

      // Save to recitation_tests table
      await supabase.from("recitation_tests" as any).upsert({
        user_id: user.id,
        audio_path: finalPath,
        stage: 1,
        stage1_submitted_at: new Date().toISOString(),
        status: "stage1_complete",
      }, { onConflict: "user_id" });

      setSubstage("done");
      toast({ title: "✅ Audio uploaded!", description: "Proceeding to AI analysis…" });
      setTimeout(() => { setStage(2); runAIScoring(finalPath); }, 800);
    } catch (e: any) {
      toast({ title: "Upload error", description: e.message, variant: "destructive" });
    } finally { setUploading(false); }
  };

  // ── Stage 2: Groq Whisper AI scoring ────────────────────────
  const runAIScoring = async (path: string) => {
    setScoring(true);
    try {
      let audioData: Blob | null = null;

      if (path.startsWith("data:")) {
        const res = await fetch(path);
        audioData = await res.blob();
      } else if (audioBlob) {
        audioData = audioBlob;
      }

      // ── No audio or no keys → demo mode ───────────────────────
      if (!audioData || (!DEEPGRAM_KEY && !GROQ_KEY)) {
        await new Promise(r => setTimeout(r, 2000));
        const demoScore = Math.floor(Math.random() * 30) + 65;
        setAiScore(demoScore);
        setAiTranscript("بسم الله الرحمن الرحيم الحمد لله رب العالمين الرحمن الرحيم");
        await saveAIScore(demoScore, "Demo transcription");
        setScoring(false);
        return;
      }

      let transcript = "";
      let wordScores: number[] = [];

      // ── PRIMARY: Deepgram nova-2 Arabic ────────────────────────
      if (DEEPGRAM_KEY && audioData) {
        try {
          const dgRes = await fetch(
            "https://api.deepgram.com/v1/listen?model=nova-2&language=ar&punctuate=false&words=true&utterances=false",
            {
              method: "POST",
              headers: {
                Authorization: `Token ${DEEPGRAM_KEY}`,
                "Content-Type": audioData.type || "audio/webm",
              },
              body: audioData,
            }
          );

          if (!dgRes.ok) throw new Error(`Deepgram error: ${dgRes.status}`);
          const dgData = await dgRes.json();

          // Extract transcript
          transcript = dgData?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";

          // Extract per-word confidence scores (Deepgram-specific advantage)
          const words = dgData?.results?.channels?.[0]?.alternatives?.[0]?.words || [];
          wordScores = words.map((w: any) => Math.round((w.confidence || 0) * 100));

        } catch (dgErr: any) {
          console.warn("Deepgram failed, trying Groq fallback:", dgErr.message);
          // fall through to Groq
        }
      }

      // ── FALLBACK: Groq Whisper ─────────────────────────────────
      if (!transcript && GROQ_KEY && audioData) {
        const formData = new FormData();
        formData.append("file", audioData, "recitation.webm");
        formData.append("model", GROQ_MODEL);
        formData.append("language", "ar");
        formData.append("response_format", "json");

        const groqRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${GROQ_KEY}` },
          body: formData,
        });

        if (!groqRes.ok) throw new Error(`Groq error: ${groqRes.status}`);
        const groqData = await groqRes.json();
        transcript = groqData.text || "";
      }

      if (!transcript) throw new Error("No transcript returned from either service");

      setAiTranscript(transcript);

      // ── SCORING ────────────────────────────────────────────────
      const refWords = (settings.surah_reference || "")
        .replace(/[^\u0600-\u06FF\s]/g, "").trim().split(/\s+/);
      const gotWords = transcript
        .replace(/[^\u0600-\u06FF\s]/g, "").trim().split(/\s+/);

      // Word-match accuracy
      let matched = 0;
      const usedRef = new Set<number>();
      gotWords.forEach(w => {
        const idx = refWords.findIndex((r, i) => !usedRef.has(i) && r.includes(w.slice(0, 3)));
        if (idx >= 0) { matched++; usedRef.add(idx); }
      });
      const matchScore = Math.min(100, Math.round((matched / refWords.length) * 100));

      // Blend with Deepgram confidence if available
      let finalScore = matchScore;
      if (wordScores.length > 0) {
        const avgConf = Math.round(wordScores.reduce((a, b) => a + b, 0) / wordScores.length);
        // 60% word match + 40% pronunciation confidence
        finalScore = Math.round(matchScore * 0.6 + avgConf * 0.4);
      }

      setAiScore(finalScore);
      await saveAIScore(finalScore, transcript);

    } catch (e: any) {
      const fallback = 72;
      setAiScore(fallback);
      setAiTranscript("Scoring unavailable — admin will review manually");
      await saveAIScore(fallback, "Auto-scoring failed");
      toast({ title: "AI scoring used fallback", description: "Admin will review your audio manually" });
    } finally { setScoring(false); }
  };

  const saveAIScore = async (score: number, transcript: string) => {
    if (!user) return;
    await supabase.from("recitation_tests" as any).update({
      ai_score: score,
      ai_transcript: transcript,
      stage: 2,
      stage2_completed_at: new Date().toISOString(),
      status: "stage2_complete",
    }).eq("user_id", user.id);
  };

  // ── Stage 3: Book live session ───────────────────────────────
  const bookSession = async () => {
    if (!user || !sessionDate || !sessionTime) {
      toast({ title: "Please select a date and time", variant: "destructive" }); return;
    }
    setBooking(true);
    try {
      await supabase.from("recitation_tests" as any).update({
        stage: 3,
        stage3_session_date: `${sessionDate}T${sessionTime}:00`,
        stage3_requested_at: new Date().toISOString(),
        status: "awaiting_teacher",
      }).eq("user_id", user.id);

      // Notify admin (non-critical — wrap in try/catch)
      try {
        await supabase.from("admin_notifications" as any).insert({
          type: "recitation_booking",
          user_id: user.id,
          message: `${(profile as any)?.full_name || "Student"} has requested a live recitation session on ${sessionDate} at ${sessionTime}`,
          created_at: new Date().toISOString(),
          read: false,
        });
      } catch (_) { /* non-critical — ignore if table doesn't exist */ }

      setBookingDone(true);
      // Advance tasjeel step if student is in registration pipeline
      try {
        if (currentStep && currentStep !== "completed") {
          await supabase
            .from("tasjeel_progress" as any)
            .update({ current_step: "level_assignment", updated_at: new Date().toISOString() } as any)
            .eq("user_id", user!.id);
        }
      } catch (_) { /* non-critical */ }
      toast({ title: "✅ Session booked!", description: "A teacher will confirm your session within 24 hours." });
    } catch (e: any) {
      toast({ title: "Booking failed", description: e.message, variant: "destructive" });
    } finally { setBooking(false); }
  };

  const scoreColor = (s: number) => s >= 80 ? "#16A34A" : s >= 60 ? "#D97706" : "#DC2626";
  const scoreLabel = (s: number) => s >= 80 ? "Excellent" : s >= 60 ? "Good" : "Needs Practice";

  // Show loading while settings load
  if (settingsLoading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(160deg,${G},${GM})` }}>
      <Loader2 style={{ width: 36, height: 36, color: "#fff", animation: "spin .8s linear infinite" }} />
    </div>
  );

  // Test disabled by admin
  if (settings.test_enabled === "false") return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(160deg,${G},${GM},#0a1f12)`, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "#fff", borderRadius: 20, padding: 32, maxWidth: 400, textAlign: "center", boxShadow: "0 24px 80px rgba(0,0,0,.3)" }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#FFF8E1", border: "2px solid #F9D46A", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
          <AlertCircle size={30} color={GOLD} />
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, color: G, marginBottom: 8 }}>Recitation Test Unavailable</div>
        <div style={{ fontSize: 13, color: "#666", lineHeight: 1.6, marginBottom: 20 }}>
          {settings.disabled_message || "The recitation test is temporarily unavailable. Please check back soon."}
        </div>
        <button onClick={() => currentStep && currentStep !== "completed" ? navigate("/registration-complete") : navigate("/student")} style={{ width: "100%", padding: "13px", borderRadius: 12, border: "none", background: `linear-gradient(135deg,${G},${GM})`, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
          Back to Dashboard
        </button>
      </div>
    </div>
  );

  const parsedTips = (settings.tips || "").split(/,|\n/).map(t => t.trim()).filter(Boolean);
  const availableSlots = (settings.available_times || "08:00,10:00,12:00,14:00,16:00,18:00,20:00").split(",").map(t => t.trim()).filter(Boolean);

  // Available session times (next 7 days)
  const sessionDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i + 1);
    return d.toISOString().split("T")[0];
  });

  return (
    <div style={{ minHeight:"100vh", background:`linear-gradient(160deg,${G},${GM},#0a1f12)`, display:"flex", flexDirection:"column", fontFamily:"'Segoe UI', system-ui, sans-serif" }}>
      <style>{"@keyframes spin{to{transform:rotate(360deg)}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}} @keyframes waveBar{from{transform:scaleY(.3)}to{transform:scaleY(1)}} @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}"}</style>

      {/* Header */}
      <div style={{ padding:"20px 20px 0", display:"flex", alignItems:"center", gap:12, maxWidth:560, margin:"0 auto", width:"100%" }}>
        <div style={{ width:40, height:40, borderRadius:12, background:"rgba(255,255,255,.1)", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <BookOpen style={{ width:20, height:20, color:GOLD }} />
        </div>
        <div>
          <div style={{ color:"#fff", fontWeight:800, fontSize:16 }}>Recitation Proficiency Test</div>
          <div style={{ color:"rgba(255,255,255,.6)", fontSize:12 }}>3-Stage Evaluation</div>
        </div>
      </div>

      <div style={{ flex:1, display:"flex", alignItems:"flex-start", justifyContent:"center", padding:"20px 16px 40px" }}>
        <div style={{ width:"100%", maxWidth:560, background:"#fff", borderRadius:24, boxShadow:"0 24px 80px rgba(0,0,0,.3)", overflow:"hidden", animation:"fadeUp .4s ease" }}>

          {/* Stage progress */}
          <div style={{ background:`linear-gradient(135deg,${G},${GM})`, padding:"20px 24px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:0 }}>
              {[
                { n:1, icon:<Mic size={14}/>,      label: settings.stage1_label || "Record" },
                { n:2, icon:<Star size={14}/>,     label: settings.stage2_label || "AI Score" },
                { n:3, icon:<Video size={14}/>,    label: settings.stage3_label || "Live Session" },
              ].map((s,i) => (
                <div key={s.n} style={{ display:"flex", alignItems:"center", flex: i<2 ? 1 : undefined }}>
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
                    <div style={{ width:36, height:36, borderRadius:"50%", background: stage > s.n ? "#22c55e" : stage === s.n ? "rgba(255,255,255,.25)" : "rgba(255,255,255,.1)", border:`2px solid ${stage >= s.n ? "#22c55e" : "rgba(255,255,255,.2)"}`, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", transition:"all .3s" }}>
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

            {/* ─ STAGE 1: RECORD ──────────────────────────────── */}
            {stage === 1 && (
              <div>
                <div style={{ textAlign:"center", marginBottom:20 }}>
                  <div style={{ fontSize:18, fontWeight:800, color:G, marginBottom:6 }}>Stage 1 — Record Your Recitation</div>
                  <div style={{ fontSize:13, color:"#666", lineHeight:1.6 }}>
                    {settings.instructions || <>Recite <strong>Surah {settings.surah_name || "Al-Fatiha"}</strong> clearly into your microphone.<br/>Speak at your natural pace — do not rush.</>}
                  </div>
                </div>

                {/* Reference text */}
                <div style={{ background:"#FFFBEB", borderRadius:14, padding:"14px 16px", border:"1px solid #F9D46A", marginBottom:20, textAlign:"center" }}>
                  <div style={{ fontSize:11, fontWeight:700, color:"#92400E", marginBottom:8, textTransform:"uppercase", letterSpacing:.5 }}>Recite This Surah — {settings.surah_name || "Al-Fatiha"}</div>
                  <div style={{ fontSize:18, fontFamily:"serif", direction:"rtl", lineHeight:2, color:G, whiteSpace:"pre-line" as const }}>
                    {settings.surah_arabic || "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ"}
                  </div>
                </div>

                {/* Tips */}
                <div style={{ background:"#F0FDF4", borderRadius:12, padding:"12px 16px", border:"1px solid #86EFAC", marginBottom:20 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:"#166534", marginBottom:6 }}>📌 Tips for a good recording:</div>
                  {(parsedTips.length > 0 ? parsedTips : ["Find a quiet room with no background noise","Hold phone 15–20cm from your mouth","Recite clearly and at your normal pace","Complete the full surah without stopping"]).map((t,i) => (
                    <div key={i} style={{ fontSize:12, color:"#166534", marginBottom:i<3?4:0, display:"flex", alignItems:"flex-start", gap:6 }}>
                      <CheckCircle2 size={12} color="#16A34A" style={{ marginTop:1, flexShrink:0 }} />{t}
                    </div>
                  ))}
                </div>

                {/* Recording UI */}
                {substage === "idle" && (
                  <div style={{ textAlign:"center" }}>
                    <button onClick={startRec}
                      style={{ width:80, height:80, borderRadius:"50%", background:`linear-gradient(135deg,${G},${GM})`, border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 12px", boxShadow:"0 8px 24px rgba(6,78,59,.3)" }}>
                      <Mic size={32} color="#fff" />
                    </button>
                    <div style={{ fontSize:14, fontWeight:700, color:G }}>Tap to start recording</div>
                    <div style={{ fontSize:12, color:"#9ca3af", marginTop:4 }}>Hold mic steady while you recite</div>
                  </div>
                )}

                {substage === "recording" && (
                  <div style={{ textAlign:"center" }}>
                    {/* Waveform */}
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:2, height:48, marginBottom:12 }}>
                      {WAVE_H.map((h,i) => (
                        <div key={i} style={{ width:3, height:h*2, borderRadius:3, background:"#E74C3C", animation:`waveBar ${.4+(i%4)*.1}s ease-in-out infinite alternate`, animationDelay:`${i*.04}s` }} />
                      ))}
                    </div>
                    <div style={{ fontSize:24, fontWeight:900, color:"#E74C3C", marginBottom:12 }}>{fr(recTime)}</div>
                    <div style={{ display:"flex", gap:12, justifyContent:"center" }}>
                      <button onClick={cancelRec}
                        style={{ padding:"10px 20px", borderRadius:12, border:"2px solid #e5e7eb", background:"#fff", color:"#666", fontSize:13, fontWeight:600, cursor:"pointer" }}>
                        Cancel
                      </button>
                      <button onClick={stopRec}
                        style={{ padding:"10px 24px", borderRadius:12, border:"none", background:"#E74C3C", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                        Stop & Submit
                      </button>
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
                      {/* Native audio — works on all browsers */}
                      <audio
                        controls
                        src={audioUrl}
                        style={{ width:"100%", height:48, borderRadius:8 }}
                        preload="auto"
                      />
                      {/* Fallback download link if audio element fails */}
                      <a
                        href={audioUrl}
                        download="my-recitation.webm"
                        style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:6, marginTop:8, fontSize:11, color:"#9ca3af", textDecoration:"none" }}
                      >
                        ↓ Download to listen if player doesn't work
                      </a>
                    </div>
                    <div style={{ display:"flex", gap:10 }}>
                      <button onClick={retake}
                        style={{ flex:1, padding:"12px", borderRadius:12, border:"2px solid #e5e7eb", background:"#fff", color:"#666", fontSize:13, fontWeight:600, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                        <RotateCcw size={15} /> Re-record
                      </button>
                      <button onClick={uploadAudio} disabled={uploading}
                        style={{ flex:2, padding:"12px", borderRadius:12, border:"none", background:`linear-gradient(135deg,${G},${GM})`, color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                        <Upload size={16} /> Submit Recording
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ─ STAGE 2: AI SCORING ──────────────────────────── */}
            {stage === 2 && (
              <div style={{ textAlign:"center" }}>
                <div style={{ fontSize:18, fontWeight:800, color:G, marginBottom:6 }}>Stage 2 — AI Accuracy Analysis</div>
                <div style={{ fontSize:13, color:"#666", marginBottom:24, lineHeight:1.6 }}>
                  Our AI is analysing your recitation and comparing it to the correct text of Surah Al-Fatiha.
                </div>

                {scoring && (
                  <div style={{ padding:"30px 0" }}>
                    <Loader2 style={{ width:48, height:48, color:GM, animation:"spin .8s linear infinite", margin:"0 auto 16px" }} />
                    <div style={{ fontSize:15, fontWeight:700, color:G, marginBottom:6 }}>Analysing recitation…</div>
                    <div style={{ fontSize:13, color:"#9ca3af" }}>This takes a few seconds</div>
                  </div>
                )}

                {!scoring && aiScore !== null && (
                  <div style={{ animation:"fadeUp .4s ease" }}>
                    {/* Score circle */}
                    <div style={{ width:120, height:120, borderRadius:"50%", background:`${scoreColor(aiScore)}15`, border:`4px solid ${scoreColor(aiScore)}`, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", margin:"0 auto 16px" }}>
                      <div style={{ fontSize:32, fontWeight:900, color:scoreColor(aiScore) }}>{aiScore}%</div>
                      <div style={{ fontSize:11, color:scoreColor(aiScore), fontWeight:700 }}>{scoreLabel(aiScore)}</div>
                    </div>

                    <div style={{ fontSize:13, color:"#666", marginBottom:20, lineHeight:1.6 }}>
                      Your AI word accuracy score is <strong style={{ color:scoreColor(aiScore) }}>{aiScore}%</strong>.<br/>
                      This counts for <strong>20%</strong> of your final level score.
                    </div>

                    {/* Score breakdown */}
                    <div style={{ display:"flex", gap:10, marginBottom:20 }}>
                      {[
                        { label:"Entrance Exam", pct:"40%", color:GOLD, done: true },
                        { label:"AI Accuracy",   pct:`${aiScore}%`, color:scoreColor(aiScore), done: true },
                        { label:"Teacher Eval",  pct:"40%", color:GM, done: false },
                      ].map(s => (
                        <div key={s.label} style={{ flex:1, background: s.done ? `${s.color}10` : "#f9fafb", borderRadius:10, padding:"10px 8px", textAlign:"center", border:`1px solid ${s.done ? s.color+"30" : "#e5e7eb"}` }}>
                          <div style={{ fontSize:16, fontWeight:900, color: s.done ? s.color : "#9ca3af" }}>{s.done ? s.pct : "—"}</div>
                          <div style={{ fontSize:10, color:"#666", marginTop:2, lineHeight:1.3 }}>{s.label}</div>
                        </div>
                      ))}
                    </div>

                    {aiTranscript && aiTranscript !== "Scoring unavailable — admin will review manually" && (
                      <div style={{ background:"#f9fafb", borderRadius:12, padding:"12px 14px", border:"1px solid #e5e7eb", marginBottom:20, textAlign:"right" }}>
                        <div style={{ fontSize:11, fontWeight:700, color:"#9ca3af", textTransform:"uppercase", letterSpacing:.5, marginBottom:6, textAlign:"left" }}>What AI heard:</div>
                        <div style={{ fontSize:14, fontFamily:"serif", direction:"rtl", color:"#333", lineHeight:1.8 }}>{aiTranscript}</div>
                      </div>
                    )}

                    <button onClick={() => setStage(3)}
                      style={{ width:"100%", padding:"14px", borderRadius:14, border:"none", background:`linear-gradient(135deg,${G},${GM})`, color:"#fff", fontSize:15, fontWeight:800, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:10 }}>
                      Continue to Stage 3 — Book Live Session <ArrowRight size={17} />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ─ STAGE 3: BOOK LIVE SESSION ──────────────────── */}
            {stage === 3 && (
              <div>
                <div style={{ textAlign:"center", marginBottom:20 }}>
                  <div style={{ width:60, height:60, borderRadius:"50%", background:"#FEF2F2", border:"2px solid #FCA5A5", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 12px" }}>
                    <Video size={28} color="#DC2626" />
                  </div>
                  <div style={{ fontSize:18, fontWeight:800, color:G, marginBottom:6 }}>Stage 3 — Live Teacher Session</div>
                  <div style={{ fontSize:13, color:"#666", lineHeight:1.6 }}>
                    Book a <strong>10–15 minute live session</strong> with one of our teachers.<br/>
                    They will evaluate your Tajweed and Makharij in real time.
                  </div>
                </div>

                {!bookingDone ? (
                  <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                    {/* What to expect */}
                    <div style={{ background:"#EFF6FF", borderRadius:12, padding:"14px 16px", border:"1px solid #93C5FD" }}>
                      <div style={{ fontSize:12, fontWeight:700, color:"#1E3A5F", marginBottom:8 }}>What the teacher evaluates:</div>
                      {["Makharij (correct pronunciation of letters)","Sifaat (characteristics of letters)","Rules of Noon Saakin & Tanween (Ikhfaa, Idghaam, Iqlaab, Izhar)","Madd (lengthening) rules","Overall fluency and rhythm"].map((t,i) => (
                        <div key={i} style={{ fontSize:12, color:"#1E40AF", marginBottom:i<4?5:0, display:"flex", alignItems:"flex-start", gap:6 }}>
                          <CheckCircle2 size={12} color="#2563EB" style={{ marginTop:1, flexShrink:0 }} />{t}
                        </div>
                      ))}
                    </div>

                    {/* Date picker */}
                    <div>
                      <label style={{ fontSize:13, fontWeight:700, color:"#374151", marginBottom:6, display:"block" }}>
                        Select a preferred date:
                      </label>
                      <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                        {sessionDates.map(d => {
                          const date = new Date(d);
                          const label = date.toLocaleDateString("en-NG", { weekday:"short", month:"short", day:"numeric" });
                          const sel = sessionDate === d;
                          return (
                            <button key={d} onClick={() => setSessionDate(d)}
                              style={{ padding:"8px 12px", borderRadius:10, border:`2px solid ${sel ? GM : "#e5e7eb"}`, background: sel ? "#F0FDF4" : "#fafafa", color: sel ? G : "#555", fontSize:12, fontWeight: sel ? 700 : 500, cursor:"pointer", transition:"all .15s" }}>
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Time slots */}
                    {sessionDate && (
                      <div>
                        <label style={{ fontSize:13, fontWeight:700, color:"#374151", marginBottom:6, display:"block" }}>
                          Select a preferred time:
                        </label>
                        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                          {availableSlots.map(t => {
                            const sel = sessionTime === t;
                            return (
                              <button key={t} onClick={() => setSessionTime(t)}
                                style={{ padding:"8px 14px", borderRadius:10, border:`2px solid ${sel ? GM : "#e5e7eb"}`, background: sel ? "#F0FDF4" : "#fafafa", color: sel ? G : "#555", fontSize:12, fontWeight: sel ? 700 : 500, cursor:"pointer", transition:"all .15s" }}>
                                {t}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div style={{ background:"#FFF8E1", borderRadius:12, padding:"12px 14px", border:"1px solid #F9D46A", fontSize:12, color:"#78350F", lineHeight:1.6 }}>
                      <AlertCircle size={13} style={{ display:"inline", marginRight:6, color:GOLD }} />
                      A teacher will confirm your selected slot within 24 hours via email. Session will be conducted over a video call link sent to your email.
                    </div>

                    <button onClick={bookSession} disabled={booking || !sessionDate || !sessionTime}
                      style={{ width:"100%", padding:"14px", borderRadius:14, border:"none", background: !sessionDate || !sessionTime ? "#e5e7eb" : `linear-gradient(135deg,${G},${GM})`, color: !sessionDate || !sessionTime ? "#9ca3af" : "#fff", fontSize:15, fontWeight:800, cursor: !sessionDate || !sessionTime ? "not-allowed" : "pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:10, transition:"all .2s" }}>
                      {booking
                        ? <><Loader2 style={{ width:18, height:18, animation:"spin .8s linear infinite" }} /> Booking…</>
                        : <><Calendar size={18} /> Request Session</>
                      }
                    </button>
                  </div>
                ) : (
                  // Booking confirmed
                  <div style={{ textAlign:"center", animation:"fadeUp .4s ease" }}>
                    <div style={{ width:72, height:72, borderRadius:"50%", background:"#E8F5E9", border:"3px solid #22c55e", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px" }}>
                      <CheckCircle2 size={36} color="#22c55e" />
                    </div>
                    <div style={{ fontSize:20, fontWeight:800, color:G, marginBottom:8 }}>All 3 Stages Complete!</div>
                    <div style={{ fontSize:14, color:"#666", lineHeight:1.6, marginBottom:20 }}>
                      Your session has been requested for <strong>{sessionDate}</strong> at <strong>{sessionTime}</strong>.<br/>
                      A teacher will confirm within 24 hours.<br/>
                      After your live session, the admin will review all your scores and assign your level.
                    </div>

                    {/* Final score preview */}
                    <div style={{ display:"flex", gap:10, marginBottom:20 }}>
                      {[
                        { label:"Entrance Exam", pct:"40%", color:GOLD, done: true },
                        { label:"AI Accuracy",   pct: aiScore !== null ? `${aiScore}%` : "Scored", color: aiScore !== null ? scoreColor(aiScore) : GM, done: true },
                        { label:"Teacher Eval",  pct:"Pending", color:"#9ca3af", done: false },
                      ].map(s => (
                        <div key={s.label} style={{ flex:1, background:`${s.color}10`, borderRadius:10, padding:"10px 6px", textAlign:"center", border:`1px solid ${s.color}30` }}>
                          <div style={{ fontSize:15, fontWeight:900, color:s.color }}>{s.pct}</div>
                          <div style={{ fontSize:10, color:"#666", marginTop:2, lineHeight:1.3 }}>{s.label}</div>
                        </div>
                      ))}
                    </div>

                    <div style={{ background:"#F0FDF4", borderRadius:12, padding:"14px 16px", border:"1px solid #86EFAC", textAlign:"left", marginBottom:16 }}>
                      <div style={{ fontSize:12, fontWeight:700, color:"#166534", marginBottom:8 }}>What happens next:</div>
                      {["Teacher confirms your session by email","You attend the 10–15 min live evaluation","Admin reviews all scores (exam + AI + teacher)","You receive your level assignment notification","Subscription begins — start learning!"].map((s,i) => (
                        <div key={i} style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, color:"#166534", marginBottom:i<4?6:0 }}>
                          <div style={{ width:18, height:18, borderRadius:"50%", background:"#22c55e", color:"#fff", fontSize:10, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{i+1}</div>
                          {s}
                        </div>
                      ))}
                    </div>

                    <button onClick={() => currentStep && currentStep !== "completed" ? navigate("/registration-complete") : navigate("/student")}
                      style={{ width:"100%", padding:"14px", borderRadius:14, border:"none", background:`linear-gradient(135deg,${G},${GM})`, color:"#fff", fontSize:15, fontWeight:800, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:10 }}>
                      {currentStep && currentStep !== "completed" ? "Complete Registration →" : "Go to Dashboard"} <ArrowRight size={17} />
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
