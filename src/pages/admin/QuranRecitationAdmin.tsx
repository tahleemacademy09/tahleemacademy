// src/pages/admin/QuranRecitationAdmin.tsx
// Admin tool for recording a full-surah recitation and having it
// automatically split into per-ayah segments. The admin uploads ONE audio
// file of the whole surah; a silence-detection pass proposes verse breaks,
// which the admin can then nudge and test-play before publishing. Students
// then see this reciter as an option in the Al-Qur'an reader, with the
// single file sliced live at playback time (no server-side audio splitting
// needed).
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Search, Upload, Play, Pause, Trash2, CheckCircle2, Circle, Loader2, Wand2, Save } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { SURAHS } from "@/components/hifdh/surahData";
import {
  CustomRecitation, AyahTiming, listRecitationsForSurah, getRecitationAudioUrl,
  saveRecitation, deleteRecitation, analyzeAudioFile, analyzeAudioUrl,
  detectVerseBoundariesFromEnvelope, boundariesToTimings, AudioEnvelope,
} from "@/lib/quranRecitations";

const GREEN = "#0f2d1f";
const GOLD = "#C9A84C";
const BORDER = "#e5e0d0";

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

  useEffect(() => {
    const a = new Audio();
    audioRef.current = a;
    return () => { a.pause(); };
  }, []);

  const refreshExisting = useCallback(() => {
    setLoadingExisting(true);
    listRecitationsForSurah(surahNumber).then(setExisting).finally(() => setLoadingExisting(false));
  }, [surahNumber]);

  useEffect(() => { refreshExisting(); resetForm(); }, [surahNumber]); // eslint-disable-line react-hooks/exhaustive-deps

  function resetForm() {
    setEditingId(null);
    setReciterName(""); setReciterNameAr(""); setIsPublished(true);
    setFile(null); setExistingAudioPath(undefined); setPreviewUrl(undefined);
    setEnvelope(null); setBoundaries([]);
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
    setAnalyzing(true);
    try { setEnvelope(await analyzeAudioUrl(url)); } catch { /* waveform optional */ }
    setAnalyzing(false);
  };

  const onFileChosen = async (f: File) => {
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setAnalyzing(true);
    try {
      const env = await analyzeAudioFile(f);
      setEnvelope(env);
      setBoundaries(detectVerseBoundariesFromEnvelope(env, surah.verses));
    } catch (e) {
      alert("Could not analyze this audio file. It may be an unsupported format.");
    } finally {
      setAnalyzing(false);
    }
  };

  const redetect = () => {
    if (envelope) setBoundaries(detectVerseBoundariesFromEnvelope(envelope, surah.verses));
  };

  const timings: AyahTiming[] = useMemo(
    () => (envelope ? boundariesToTimings(boundaries, envelope.duration) : []),
    [boundaries, envelope]
  );

  // ── Waveform canvas ──────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !envelope) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#faf8f2";
    ctx.fillRect(0, 0, w, h);

    const n = envelope.values.length;
    const barW = w / n;
    ctx.fillStyle = GREEN;
    for (let i = 0; i < n; i++) {
      const amp = envelope.values[i];
      const barH = Math.max(1, amp * (h - 4));
      ctx.fillRect(i * barW, (h - barH) / 2, Math.max(0.6, barW), barH);
    }

    ctx.strokeStyle = GOLD;
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
      await saveRecitation({
        id: editingId !== "new" ? (editingId ?? undefined) : undefined,
        surahNumber, reciterName: reciterName.trim(), reciterNameAr: reciterNameAr.trim() || undefined,
        file: file ?? undefined, existingAudioPath, timings, isPublished, userId: user.id,
      });
      resetForm();
      refreshExisting();
    } catch (e: any) {
      alert("Failed to save: " + (e?.message ?? "unknown error"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (rec: CustomRecitation) => {
    if (!confirm(`Delete the recitation by ${rec.reciter_name} for ${surah.name}? This cannot be undone.`)) return;
    await deleteRecitation(rec.id, rec.audio_path);
    refreshExisting();
    if (editingId === rec.id) resetForm();
  };

  const filteredSurahs = SURAHS.filter(s =>
    !surahQuery.trim() || s.name.toLowerCase().includes(surahQuery.toLowerCase()) || String(s.num).includes(surahQuery)
  );

  return (
    <div style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, color: GREEN, marginBottom: 4 }}>Qur'an Recitations</h1>
      <p style={{ fontSize: 13, color: "#6b6350", marginBottom: 16 }}>
        Upload a full-surah recording; verse breaks are detected automatically from pauses in the recitation, and you
        can fine-tune every break before publishing.
      </p>

      {/* Surah picker */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 260px" }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: 10, color: "#999" }} />
          <input value={surahQuery} onChange={e => setSurahQuery(e.target.value)} placeholder="Search surah by name or number…"
            style={{ width: "100%", padding: "8px 10px 8px 30px", borderRadius: 8, border: `1px solid ${BORDER}`, fontSize: 13 }} />
        </div>
        <select value={surahNumber} onChange={e => setSurahNumber(Number(e.target.value))}
          style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${BORDER}`, fontSize: 13, minWidth: 220 }}>
          {filteredSurahs.map(s => <option key={s.num} value={s.num}>{s.num}. {s.name} ({s.verses} verses)</option>)}
        </select>
      </div>

      {/* Existing recitations for this surah */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Existing recitations for {surah.name}</h2>
        {loadingExisting ? (
          <p style={{ fontSize: 13, color: "#999" }}>Loading…</p>
        ) : existing.length === 0 ? (
          <p style={{ fontSize: 13, color: "#999" }}>None yet — students will hear the standard per-ayah reciters until you add one.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {existing.map(rec => (
              <div key={rec.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: `1px solid ${BORDER}`, borderRadius: 10 }}>
                {rec.is_published ? <CheckCircle2 size={16} color="#2f8f4e" /> : <Circle size={16} color="#c99" />}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{rec.reciter_name}</div>
                  <div style={{ fontSize: 11, color: "#888" }}>{rec.ayah_timings.length} segments · {rec.is_published ? "Published" : "Draft (hidden from students)"}</div>
                </div>
                <button onClick={() => startEdit(rec)} style={smallBtnStyle()}>Edit</button>
                <button onClick={() => handleDelete(rec)} style={smallBtnStyle(true)}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        )}
        {editingId === null && (
          <button onClick={startNew} style={{ ...smallBtnStyle(), marginTop: 10 }}>+ Add recitation for {surah.name}</button>
        )}
      </div>

      {/* Editor */}
      {editingId !== null && (
        <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
            {editingId === "new" ? `New recitation — ${surah.name}` : `Editing recitation — ${surah.name}`}
          </h3>

          <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            <input value={reciterName} onChange={e => setReciterName(e.target.value)} placeholder="Reciter name (e.g. Ustadh Ahmad)"
              style={inputStyle()} />
            <input value={reciterNameAr} onChange={e => setReciterNameAr(e.target.value)} placeholder="اسم القارئ (اختياري)" dir="rtl"
              style={inputStyle()} />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 14px", border: `1.5px dashed ${GOLD}`, borderRadius: 10, cursor: "pointer", fontSize: 13 }}>
              <Upload size={15} />
              {file ? file.name : existingAudioPath ? "Replace audio file…" : "Choose full-surah audio file…"}
              <input type="file" accept="audio/*" style={{ display: "none" }} onChange={e => e.target.files?.[0] && onFileChosen(e.target.files[0])} />
            </label>
            <span style={{ fontSize: 11, color: "#999", marginLeft: 8 }}>The admin reads the whole surah in one recording — we split it automatically.</span>
          </div>

          {analyzing && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#666", fontSize: 13, padding: 20 }}>
              <Loader2 size={16} className="animate-spin" /> Analyzing audio for pauses between verses…
            </div>
          )}

          {envelope && !analyzing && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: "#666" }}>Drag the gold lines to adjust where each verse ends ({boundaries.length + 1} of {surah.verses} segments)</span>
                <button onClick={redetect} style={smallBtnStyle()}><Wand2 size={12} /> Re-detect</button>
              </div>
              <canvas
                ref={canvasRef} width={800} height={90}
                style={{ width: "100%", height: 90, borderRadius: 8, border: `1px solid ${BORDER}`, touchAction: "none", cursor: dragIdx !== null ? "grabbing" : "pointer" }}
                onPointerDown={onCanvasDown} onPointerMove={onCanvasMove} onPointerUp={onCanvasUp} onPointerLeave={onCanvasUp}
              />

              <div style={{ marginTop: 14, maxHeight: 320, overflowY: "auto", border: `1px solid ${BORDER}`, borderRadius: 8 }}>
                {timings.map(t => (
                  <div key={t.ayah} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderBottom: `1px solid ${BORDER}` }}>
                    <span style={{ width: 40, fontSize: 12, fontWeight: 600, color: GREEN }}>Ayah {t.ayah}</span>
                    <span style={{ fontSize: 11, color: "#888", width: 130 }}>{fmt(t.start)} – {fmt(t.end)}</span>
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
                ))}
              </div>
            </>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <input type="checkbox" checked={isPublished} onChange={e => setIsPublished(e.target.checked)} />
              Publish (visible to students immediately)
            </label>
            <div style={{ flex: 1 }} />
            <button onClick={resetForm} style={smallBtnStyle()}>Cancel</button>
            <button onClick={handleSave} disabled={saving || !envelope} style={{ ...smallBtnStyle(), background: GREEN, color: "#fff", borderColor: GREEN }}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save recitation
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1).padStart(4, "0");
  return `${m}:${sec}`;
}

function inputStyle(): CSSProperties {
  return { flex: "1 1 220px", padding: "8px 10px", borderRadius: 8, border: `1px solid ${BORDER}`, fontSize: 13 };
}
function smallBtnStyle(danger = false): CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 8,
    border: `1px solid ${danger ? "#e0a0a0" : BORDER}`, background: danger ? "#fff5f5" : "#fff",
    color: danger ? "#a33" : "#333", fontSize: 12, cursor: "pointer",
  };
}
