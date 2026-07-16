// src/pages/admin/QuranRecitationAdmin.tsx
// Admin tool for recording a full-surah recitation and having it
// automatically split into per-ayah segments. The admin uploads/records ONE
// audio file of the whole surah; verse breaks are detected from the actual
// recited words (not just pauses — see the detection note below), which the
// admin can review against the real Qur'an text, nudge, and test-play before
// publishing. Students then see this reciter as an option in the Al-Qur'an
// reader, with the single file sliced live at playback time (no server-side
// audio splitting needed).
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Search, Upload, Play, Pause, Trash2, CheckCircle2, Circle, Loader2, Wand2,
  Save, Mic, Square, AlertTriangle, Sparkles, BookOpenText, ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { SURAHS } from "@/components/hifdh/surahData";
import { getSurahText, QuranVerse } from "@/lib/quranTextApi";
import {
  CustomRecitation, AyahTiming, listRecitationsForSurah, getRecitationAudioUrl,
  saveRecitation, deleteRecitation, analyzeAudioFile, analyzeAudioUrl,
  detectVerseBoundariesFromEnvelope, boundariesToTimings, AudioEnvelope,
  detectVerseBoundariesFromTranscription,
} from "@/lib/quranRecitations";
import {
  Q_GREEN, Q_GREEN_MID, Q_GOLD, Q_GOLD_DARK, Q_PARCHMENT, Q_PARCH_ALT,
  Q_INK, Q_BORDER, Q_MUTED, Q_ARABIC_FONT,
} from "@/components/quran/quranReaderTokens";

const AR_NUMERALS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
const toArabicNum = (n: number) => String(n).split("").map(d => AR_NUMERALS[Number(d)] ?? d).join("");

type DetectionMethod = "verse-text" | "pause" | null;

export default function QuranRecitationAdmin() {
  const { user } = useAuth();
  const [surahQuery, setSurahQuery] = useState("");
  const [surahNumber, setSurahNumber] = useState(1);
  const surah = SURAHS.find(s => s.num === surahNumber)!;

  const [existing, setExisting] = useState<CustomRecitation[]>([]);
  const [loadingExisting, setLoadingExisting] = useState(true);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);

  const [reciterName, setReciterName] = useState("");
  const [reciterNameAr, setReciterNameAr] = useState("");
  const [isPublished, setIsPublished] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [existingAudioPath, setExistingAudioPath] = useState<string | undefined>(undefined);
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(undefined);

  const [envelope, setEnvelope] = useState<AudioEnvelope | null>(null);
  const [boundaries, setBoundaries] = useState<number[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingSegment, setPlayingSegment] = useState<number | null>(null);

  // ── In-app recording (mic, instead of upload-only) ──────────────────
  const [audioSource, setAudioSource] = useState<"upload" | "record">("upload");
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const recordTimerRef = useRef<number | null>(null);

  // ── Transcription-assisted sync ──────────────────────────────────────
  const [syncingTranscription, setSyncingTranscription] = useState(false);
  const [lowConfidenceAyahs, setLowConfidenceAyahs] = useState<number[]>([]);
  const [detectionMethod, setDetectionMethod] = useState<DetectionMethod>(null);

  // ── Qur'an text view — lets the admin see exactly which words fall in
  // each segment, instead of trusting a timestamp alone. ──────────────────
  const [ayahTexts, setAyahTexts] = useState<QuranVerse[]>([]);
  const [loadingAyahTexts, setLoadingAyahTexts] = useState(true);
  const ayahRefs = useRef<Record<number, HTMLSpanElement | null>>({});

  useEffect(() => {
    const a = new Audio();
    audioRef.current = a;
    return () => {
      a.pause();
      if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
      recordStreamRef.current?.getTracks().forEach(tr => tr.stop());
    };
  }, []);

  const refreshExisting = useCallback(() => {
    setLoadingExisting(true);
    listRecitationsForSurah(surahNumber).then(setExisting).finally(() => setLoadingExisting(false));
  }, [surahNumber]);

  useEffect(() => {
    refreshExisting();
    resetForm();
    setLoadingAyahTexts(true);
    getSurahText(surahNumber, false).then(setAyahTexts).finally(() => setLoadingAyahTexts(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surahNumber]);

  // While dragging a boundary, bring the two ayahs it sits between into view
  // in the Qur'an text panel below, so the admin can read exactly where the
  // cut currently falls without hunting for it.
  useEffect(() => {
    if (dragIdx === null) return;
    ayahRefs.current[dragIdx + 1]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [dragIdx]);

  function stopRecording(discard = false) {
    if (recordTimerRef.current) { window.clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") {
      if (discard) mr.onstop = null; // suppress the finalize handler below
      mr.stop();
    }
    recordStreamRef.current?.getTracks().forEach(tr => tr.stop());
    recordStreamRef.current = null;
    mediaRecorderRef.current = null;
    setRecording(false);
    setRecordSeconds(0);
    if (discard) recordedChunksRef.current = [];
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordStreamRef.current = stream;
      recordedChunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      mr.ondataavailable = e => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: mr.mimeType || "audio/webm" });
        const ext = (mr.mimeType || "audio/webm").includes("mp4") ? "mp4" : "webm";
        const recordedFile = new File([blob], `recording-${Date.now()}.${ext}`, { type: blob.type });
        onFileChosen(recordedFile);
        recordStreamRef.current?.getTracks().forEach(tr => tr.stop());
        recordStreamRef.current = null;
      };
      mr.start();
      setRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = window.setInterval(() => setRecordSeconds(s => s + 1), 1000);
    } catch {
      alert("Could not access the microphone. Please allow microphone access and try again.");
    }
  }

  function resetForm() {
    setEditingId(null);
    setReciterName(""); setReciterNameAr(""); setIsPublished(true);
    setFile(null); setExistingAudioPath(undefined); setPreviewUrl(undefined);
    setEnvelope(null); setBoundaries([]);
    setAudioSource("upload"); setLowConfidenceAyahs([]); setDetectionMethod(null);
    stopRecording(true);
  }

  const startNew = () => { resetForm(); setEditingId("new"); };

  const startEdit = async (rec: CustomRecitation) => {
    resetForm();
    setEditingId(rec.id);
    setReciterName(rec.reciter_name);
    setReciterNameAr(rec.reciter_name_ar || "");
    setIsPublished(rec.is_published);
    setExistingAudioPath(rec.audio_path);
    const url = getRecitationAudioUrl(rec.audio_path);
    setPreviewUrl(url);
    setBoundaries(rec.ayah_timings.slice().sort((a, b) => a.ayah - b.ayah).slice(0, -1).map(t => t.end));
    setDetectionMethod("verse-text"); // saved recitations were already cut to the text
    setAnalyzing(true);
    try { setEnvelope(await analyzeAudioUrl(url)); } catch { /* waveform optional */ }
    setAnalyzing(false);
  };

  // Placing verse breaks strictly from the actual recited words (not from
  // pauses) so a reciter resting mid-verse to catch their breath never gets
  // mistaken for a verse end. This runs automatically the moment audio is
  // chosen/recorded — see detectVerseBoundariesFromTranscription for how the
  // transcript is aligned word-by-word against the real ayah text.
  const runTranscriptionDetection = async (audioFile: File) => {
    setSyncingTranscription(true);
    setLowConfidenceAyahs([]);
    try {
      const result = await detectVerseBoundariesFromTranscription(audioFile, surahNumber, surah.verses);
      setBoundaries(result.boundaries);
      setLowConfidenceAyahs(result.lowConfidenceAyahs);
      setDetectionMethod("verse-text");
    } catch (e: any) {
      // Keep the pause-based placeholder already on screen and say why —
      // every cut is still reviewable/draggable regardless of which method
      // produced it.
      console.warn("Automatic verse-text detection failed, keeping pause-based estimate:", e);
      setDetectionMethod("pause");
    } finally {
      setSyncingTranscription(false);
    }
  };

  const onFileChosen = async (f: File) => {
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setLowConfidenceAyahs([]);
    setAnalyzing(true);
    let env: AudioEnvelope | null = null;
    try {
      env = await analyzeAudioFile(f);
      setEnvelope(env);
      // Instant placeholder from pauses alone (client-side, no network) —
      // replaced automatically below by word-accurate cuts.
      setBoundaries(detectVerseBoundariesFromEnvelope(env, surah.verses));
      setDetectionMethod("pause");
    } catch (e) {
      alert("Could not analyze this audio file. It may be an unsupported format.");
    } finally {
      setAnalyzing(false);
    }
    if (env) await runTranscriptionDetection(f);
  };

  const redetect = () => {
    if (envelope) { setBoundaries(detectVerseBoundariesFromEnvelope(envelope, surah.verses)); setDetectionMethod("pause"); }
  };

  const syncWithTranscription = async () => {
    let audioFile = file;
    if (!audioFile && previewUrl) {
      try {
        const res = await fetch(previewUrl);
        const blob = await res.blob();
        audioFile = new File([blob], "existing-audio", { type: blob.type || "audio/mpeg" });
      } catch {
        alert("Could not load the existing audio file for transcription.");
        return;
      }
    }
    if (!audioFile) { alert("Choose or record audio first."); return; }
    await runTranscriptionDetection(audioFile);
    if (lowConfidenceAyahs.length) {
      alert(`Synced. Please double-check the cuts around ayah(s) ${lowConfidenceAyahs.join(", ")} — the transcript match was weaker there.`);
    }
  };

  const timings: AyahTiming[] = useMemo(
    () => (envelope ? boundariesToTimings(boundaries, envelope.duration) : []),
    [boundaries, envelope]
  );

  const ayahTextByNumber = useMemo(() => {
    const map = new Map<number, string>();
    for (const v of ayahTexts) map.set(v.ayah, v.text);
    return map;
  }, [ayahTexts]);

  // ── Waveform canvas ──────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !envelope) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = Q_PARCHMENT;
    ctx.fillRect(0, 0, w, h);

    const n = envelope.values.length;
    const barW = w / n;
    ctx.fillStyle = Q_GREEN;
    for (let i = 0; i < n; i++) {
      const amp = envelope.values[i];
      const barH = Math.max(1, amp * (h - 4));
      ctx.fillRect(i * barW, (h - barH) / 2, Math.max(0.6, barW), barH);
    }

    ctx.strokeStyle = Q_GOLD;
    ctx.lineWidth = 2;
    for (const b of boundaries) {
      const x = (b / envelope.duration) * w;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
  }, [envelope, boundaries]);

  const timeFromEvent = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
    return (x / rect.width) * (envelope?.duration ?? 0);
  };

  const onCanvasDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!envelope) return;
    const t = timeFromEvent(e);
    let closest = -1, closestDist = Infinity;
    boundaries.forEach((b, i) => { const d = Math.abs(b - t); if (d < closestDist) { closestDist = d; closest = i; } });
    if (closestDist < envelope.duration * 0.02) setDragIdx(closest);
  };
  const onCanvasMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (dragIdx === null || !envelope) return;
    const t = timeFromEvent(e);
    const lo = dragIdx === 0 ? 0.1 : boundaries[dragIdx - 1] + 0.1;
    const hi = dragIdx === boundaries.length - 1 ? envelope.duration - 0.1 : boundaries[dragIdx + 1] - 0.1;
    const clamped = Math.min(Math.max(t, lo), hi);
    setBoundaries(prev => prev.map((b, i) => i === dragIdx ? Math.round(clamped * 100) / 100 : b));
  };
  const onCanvasUp = () => setDragIdx(null);

  const playTokenRef = useRef(0);
  const testPlaySegment = (ayah: number) => {
    const audio = audioRef.current;
    const seg = timings.find(t => t.ayah === ayah);
    if (!audio || !seg || !previewUrl) return;
    const token = ++playTokenRef.current;
    if (audio.src !== previewUrl) audio.src = previewUrl;
    audio.currentTime = seg.start;
    audio.play().then(() => setPlayingSegment(ayah)).catch(() => {});
    const stopAt = Math.max(50, (seg.end - seg.start) * 1000);
    window.setTimeout(() => {
      if (playTokenRef.current === token) { audio.pause(); setPlayingSegment(null); }
    }, stopAt);
    ayahRefs.current[ayah]?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const nudge = (idx: number, delta: number) => {
    setBoundaries(prev => prev.map((b, i) => i === idx ? Math.round((b + delta) * 100) / 100 : b));
  };

  const handleSave = async () => {
    if (!user) return;
    if (!reciterName.trim()) { alert("Please enter a reciter name."); return; }
    if (!file && !existingAudioPath) { alert("Please choose an audio file."); return; }
    if (timings.length !== surah.verses) { alert(`Expected ${surah.verses} verse segments, got ${timings.length}.`); return; }
    setSaving(true);
    try {
      const saved = await saveRecitation({
        id: editingId !== "new" ? (editingId ?? undefined) : undefined,
        surahNumber, reciterName: reciterName.trim(), reciterNameAr: reciterNameAr.trim() || undefined,
        file: file ?? undefined, existingAudioPath, timings, isPublished, userId: user.id,
      });
      // The write returns the persisted row directly, so the list updates
      // immediately — no second "list" round-trip standing between pressing
      // Save and seeing it saved.
      setExisting(prev => {
        const idx = prev.findIndex(r => r.id === saved.id);
        if (idx === -1) return [...prev, saved];
        const next = prev.slice();
        next[idx] = saved;
        return next;
      });
      resetForm();
    } catch (e: any) {
      alert("Failed to save: " + (e?.message ?? "unknown error"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (rec: CustomRecitation) => {
    if (!confirm(`Delete the recitation by ${rec.reciter_name} for ${surah.name}? This cannot be undone.`)) return;
    await deleteRecitation(rec.id, rec.audio_path);
    setExisting(prev => prev.filter(r => r.id !== rec.id));
    if (editingId === rec.id) resetForm();
  };

  const filteredSurahs = SURAHS.filter(s =>
    !surahQuery.trim() || s.name.toLowerCase().includes(surahQuery.toLowerCase()) || String(s.num).includes(surahQuery)
  );

  // Ayah pair currently framed by a dragged boundary — boundaries[i] is the
  // end of ayah (i+1) and the start of ayah (i+2).
  const draggingAyahPair = dragIdx !== null ? [dragIdx + 1, dragIdx + 2] : null;

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 0 60px" }}>
      {/* ── Hero header ── */}
      <div style={{
        background: `linear-gradient(135deg, ${Q_GREEN} 0%, ${Q_GREEN_MID} 100%)`,
        borderRadius: 18, padding: "22px 22px 20px", marginBottom: 18, position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", inset: 0, opacity: 0.08, background: `radial-gradient(circle at 85% 20%, ${Q_GOLD} 0%, transparent 55%)` }} />
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <BookOpenText size={22} color={Q_GOLD} />
          </div>
          <div>
            <h1 style={{ fontSize: 19, fontWeight: 700, color: "#fff", margin: 0 }}>Qur'an Recitations</h1>
            <p style={{ fontSize: 12.5, color: "rgba(255,255,255,0.75)", margin: "3px 0 0", maxWidth: 560 }}>
              Record or upload a full surah once — verse breaks are placed using the words actually recited, not
              pauses, so a mid-verse breath never gets mistaken for a verse end. Review every cut against the real
              text below, then publish.
            </p>
          </div>
        </div>
      </div>

      {/* ── Surah picker ── */}
      <div style={cardStyle()}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: "1 1 260px" }}>
            <Search size={14} style={{ position: "absolute", left: 12, top: 12, color: Q_MUTED }} />
            <input value={surahQuery} onChange={e => setSurahQuery(e.target.value)} placeholder="Search surah by name or number…"
              style={{ ...inputStyle(), width: "100%", paddingLeft: 32 }} />
          </div>
          <select value={surahNumber} onChange={e => setSurahNumber(Number(e.target.value))}
            style={{ ...inputStyle(), minWidth: 240, flex: "0 0 auto" }}>
            {filteredSurahs.map(s => <option key={s.num} value={s.num}>{s.num}. {s.name} ({s.verses} verses)</option>)}
          </select>
        </div>
      </div>

      {/* ── Existing recitations for this surah ── */}
      <div style={{ ...cardStyle(), marginTop: 14 }}>
        <SectionLabel>Existing recitations for {surah.name}</SectionLabel>
        {loadingExisting ? (
          <p style={{ fontSize: 13, color: Q_MUTED, padding: "6px 2px" }}>Loading…</p>
        ) : existing.length === 0 ? (
          <p style={{ fontSize: 13, color: Q_MUTED, padding: "6px 2px" }}>
            None yet — students will hear the standard per-ayah reciters until you add one.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {existing.map(rec => (
              <div key={rec.id} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "12px 14px",
                border: `1px solid ${Q_BORDER}`, borderRadius: 12, background: Q_PARCHMENT,
              }}>
                {rec.is_published
                  ? <CheckCircle2 size={17} color="#2f8f4e" style={{ flexShrink: 0 }} />
                  : <Circle size={17} color="#c99" style={{ flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: Q_INK }}>{rec.reciter_name}</div>
                  <div style={{ fontSize: 11, color: Q_MUTED, marginTop: 1 }}>
                    {rec.ayah_timings.length} segments · {rec.is_published ? "Published" : "Draft (hidden from students)"}
                  </div>
                </div>
                <button onClick={() => startEdit(rec)} style={smallBtnStyle()}>Edit</button>
                <button onClick={() => handleDelete(rec)} style={smallBtnStyle(true)}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        )}
        {editingId === null && (
          <button onClick={startNew} style={{ ...primaryBtnStyle(), marginTop: 12 }}>+ Add recitation for {surah.name}</button>
        )}
      </div>

      {/* ── Editor ── */}
      {editingId !== null && (
        <div style={{ ...cardStyle(), marginTop: 14, border: `1.5px solid ${Q_GOLD}`, background: "#fff" }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, color: Q_GREEN }}>
            {editingId === "new" ? `New recitation — ${surah.name}` : `Editing recitation — ${surah.name}`}
          </h3>

          <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            <input value={reciterName} onChange={e => setReciterName(e.target.value)} placeholder="Reciter name (e.g. Ustadh Ahmad)"
              style={inputStyle()} />
            <input value={reciterNameAr} onChange={e => setReciterNameAr(e.target.value)} placeholder="اسم القارئ (اختياري)" dir="rtl"
              style={{ ...inputStyle(), fontFamily: Q_ARABIC_FONT }} />
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <button onClick={() => { if (!recording) setAudioSource("upload"); }} style={toggleBtnStyle(audioSource === "upload")}>
                <Upload size={12} /> Upload file
              </button>
              <button onClick={() => setAudioSource("record")} style={toggleBtnStyle(audioSource === "record")}>
                <Mic size={12} /> Record now
              </button>
            </div>

            {audioSource === "upload" ? (
              <>
                <label style={{
                  display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 14px",
                  border: `1.5px dashed ${Q_GOLD}`, borderRadius: 10, cursor: "pointer", fontSize: 13, background: Q_PARCH_ALT,
                }}>
                  <Upload size={15} color={Q_GOLD_DARK} />
                  {file ? file.name : existingAudioPath ? "Replace audio file…" : "Choose full-surah audio file…"}
                  <input type="file" accept="audio/*" style={{ display: "none" }} onChange={e => e.target.files?.[0] && onFileChosen(e.target.files[0])} />
                </label>
                <span style={{ fontSize: 11, color: Q_MUTED, marginLeft: 8 }}>The admin reads the whole surah in one recording — we split it automatically.</span>
              </>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", border: `1.5px dashed ${recording ? "#c0392b" : Q_GOLD}`, borderRadius: 10, background: Q_PARCH_ALT }}>
                {!recording ? (
                  <button onClick={startRecording} style={primaryBtnStyle(true)}>
                    <Mic size={13} /> Start recording
                  </button>
                ) : (
                  <button onClick={() => stopRecording(false)} style={smallBtnStyle(true)}>
                    <Square size={12} /> Stop ({fmt(recordSeconds)})
                  </button>
                )}
                <span style={{ fontSize: 12, color: recording ? "#c0392b" : Q_MUTED }}>
                  {recording ? "Recording… read the whole surah, then tap Stop." : file ? `Recorded: ${file.name}` : "Records straight from this device's microphone — no upload needed."}
                </span>
              </div>
            )}
          </div>

          {analyzing && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: Q_MUTED, fontSize: 13, padding: 20 }}>
              <Loader2 size={16} className="animate-spin" /> Analyzing audio for pauses between verses…
            </div>
          )}

          {syncingTranscription && !analyzing && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: Q_GREEN, fontSize: 13, padding: "10px 2px", fontWeight: 600 }}>
              <Loader2 size={16} className="animate-spin" /> Matching the recording against the actual verse text…
            </div>
          )}

          {envelope && !analyzing && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
                <span style={{ fontSize: 12, color: Q_MUTED }}>
                  Drag the gold lines to adjust where each verse ends ({boundaries.length + 1} of {surah.verses} segments)
                </span>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {detectionMethod && !syncingTranscription && (
                    detectionMethod === "verse-text" ? (
                      <span style={pillStyle("#2f8f4e", "#eaf7ee")}><ShieldCheck size={12} /> Verse-accurate cuts</span>
                    ) : (
                      <span style={pillStyle("#a66a1f", "#fff8ec")}><AlertTriangle size={12} /> Pause-based estimate — review below</span>
                    )
                  )}
                  <button onClick={redetect} style={smallBtnStyle()}><Wand2 size={12} /> Re-detect (pause estimate)</button>
                  <button onClick={syncWithTranscription} disabled={syncingTranscription} style={primaryBtnStyle(true)}>
                    {syncingTranscription ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                    {syncingTranscription ? "Matching…" : "Re-sync with verse text"}
                  </button>
                </div>
              </div>
              {lowConfidenceAyahs.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#a66a1f", background: "#fff8ec", border: "1px solid #f0d9a8", borderRadius: 8, padding: "8px 10px", marginBottom: 8 }}>
                  <AlertTriangle size={13} /> Weaker match around ayah(s) {lowConfidenceAyahs.join(", ")} — double-check those cuts below.
                </div>
              )}
              <canvas
                ref={canvasRef} width={800} height={90}
                style={{ width: "100%", height: 90, borderRadius: 10, border: `1px solid ${Q_BORDER}`, touchAction: "none", cursor: dragIdx !== null ? "grabbing" : "pointer" }}
                onPointerDown={onCanvasDown} onPointerMove={onCanvasMove} onPointerUp={onCanvasUp} onPointerLeave={onCanvasUp}
              />

              {/* ── Qur'an text view — read the real verses while checking cuts ── */}
              <div style={{ marginTop: 14 }}>
                <SectionLabel icon={<BookOpenText size={13} />}>Qur'an text — tap any ayah to hear its segment</SectionLabel>
                {loadingAyahTexts ? (
                  <p style={{ fontSize: 12, color: Q_MUTED, padding: "8px 2px" }}>Loading verse text…</p>
                ) : (
                  <div style={{
                    marginTop: 6, maxHeight: 220, overflowY: "auto", border: `1px solid ${Q_BORDER}`,
                    borderRadius: 10, padding: "16px 18px", background: Q_PARCHMENT,
                  }}>
                    <div dir="rtl" lang="ar" style={{ fontFamily: Q_ARABIC_FONT, fontSize: 21, lineHeight: 2.3, color: Q_INK, textAlign: "justify" }}>
                      {ayahTexts.map(v => {
                        const isPlaying = playingSegment === v.ayah;
                        const isDragFocus = draggingAyahPair?.includes(v.ayah) ?? false;
                        return (
                          <span
                            key={v.ayah}
                            ref={el => { ayahRefs.current[v.ayah] = el; }}
                            onClick={() => testPlaySegment(v.ayah)}
                            style={{
                              cursor: "pointer", borderRadius: 6, padding: "2px 1px",
                              background: isPlaying ? Q_GOLD : isDragFocus ? Q_PARCH_ALT : "transparent",
                              transition: "background .2s",
                            }}
                          >
                            {v.text}
                            <span style={{ fontSize: "0.7em", color: Q_GOLD_DARK, margin: "0 3px" }}>﴿{toArabicNum(v.ayah)}﴾</span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Per-segment review list ── */}
              <div style={{ marginTop: 14, maxHeight: 340, overflowY: "auto", border: `1px solid ${Q_BORDER}`, borderRadius: 10 }}>
                {timings.map(t => (
                  <div key={t.ayah} style={{
                    padding: "10px 12px", borderBottom: `1px solid ${Q_BORDER}`,
                    background: lowConfidenceAyahs.includes(t.ayah) ? "#fff8ec" : playingSegment === t.ayah ? Q_PARCH_ALT : "transparent",
                  }}>
                    <div
                      dir="rtl" lang="ar"
                      onClick={() => ayahRefs.current[t.ayah]?.scrollIntoView({ behavior: "smooth", block: "center" })}
                      style={{
                        fontFamily: Q_ARABIC_FONT, fontSize: 16, color: Q_INK, marginBottom: 6, cursor: "pointer",
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}
                    >
                      {ayahTextByNumber.get(t.ayah) ?? "…"}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 50, fontSize: 12, fontWeight: 700, color: Q_GREEN, flexShrink: 0 }}>Ayah {t.ayah}</span>
                      <span style={{ fontSize: 11, color: Q_MUTED, width: 130, flexShrink: 0 }}>{fmt(t.start)} – {fmt(t.end)}</span>
                      <button onClick={() => testPlaySegment(t.ayah)} style={smallBtnStyle()}>
                        {playingSegment === t.ayah ? <Pause size={12} /> : <Play size={12} />} Test
                      </button>
                      {t.ayah < surah.verses && (
                        <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: "auto" }}>
                          <button onClick={() => nudge(t.ayah - 1, -0.1)} style={smallBtnStyle()}>−0.1s</button>
                          <button onClick={() => nudge(t.ayah - 1, 0.1)} style={smallBtnStyle()}>+0.1s</button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 18, flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: Q_INK }}>
              <input type="checkbox" checked={isPublished} onChange={e => setIsPublished(e.target.checked)} />
              Publish (visible to students immediately)
            </label>
            <div style={{ flex: 1 }} />
            <button onClick={resetForm} style={smallBtnStyle()}>Cancel</button>
            <button onClick={handleSave} disabled={saving || !envelope} style={primaryBtnStyle()}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              {saving ? (file ? "Uploading & saving…" : "Saving…") : "Save recitation"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: Q_GREEN }}>
      {icon}{children}
    </div>
  );
}

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1).padStart(4, "0");
  return `${m}:${sec}`;
}

function cardStyle(): CSSProperties {
  return {
    background: "#fff", border: `1px solid ${Q_BORDER}`, borderRadius: 16,
    padding: 16, boxShadow: "0 1px 3px rgba(15,45,31,0.06)",
  };
}

function inputStyle(): CSSProperties {
  return { flex: "1 1 220px", padding: "9px 11px", borderRadius: 9, border: `1px solid ${Q_BORDER}`, fontSize: 13, color: Q_INK, background: "#fff" };
}

function smallBtnStyle(danger = false): CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 8,
    border: `1px solid ${danger ? "#e0a0a0" : Q_BORDER}`, background: danger ? "#fff5f5" : "#fff",
    color: danger ? "#a33" : Q_INK, fontSize: 12, cursor: "pointer",
  };
}

function primaryBtnStyle(small = false): CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", gap: 6, padding: small ? "6px 10px" : "9px 16px",
    borderRadius: 9, border: `1px solid ${Q_GREEN}`, background: Q_GREEN, color: "#fff",
    fontSize: small ? 12 : 13, fontWeight: 600, cursor: "pointer",
  };
}

function toggleBtnStyle(active: boolean): CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 8,
    border: `1px solid ${active ? Q_GREEN : Q_BORDER}`, background: active ? Q_GREEN : "#fff",
    color: active ? "#fff" : Q_INK, fontSize: 12, cursor: "pointer",
  };
}

function pillStyle(color: string, bg: string): CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 999,
    background: bg, color, fontSize: 11, fontWeight: 700,
  };
}
