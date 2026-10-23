// src/pages/admin/LetterAudioRecorder.tsx
//
// Lets a teacher/admin either record their own voice, or generate a Google
// Cloud TTS pronunciation, for each of the 28 Qaidah letters used in the
// "Letter Recognition, by Shape-Family" lesson. Files are uploaded to the
// public `letter-audio` bucket at <unicode-codepoint-hex>.mp3 — exactly what
// the lesson's playLetterAudio() looks for, so nothing else needs to change
// once a file lands here.
//
// NOTE: AI generation is appropriate for naming a single letter correctly —
// it is not a substitute for a qualified reciter when lessons move on to
// actual Qur'an verse recitation with tajweed rules.
import { useEffect, useMemo, useState } from "react";
import { Mic, Square, Play, Pause, Sparkles, CheckCircle2, Loader2, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import AudioRecorder from "@/components/exam/AudioRecorder";

const BUCKET = "letter-audio";

interface LetterDef { ar: string; name: string; arName: string; family: string; }

const LETTERS: LetterDef[] = [
  { ar: "ب", name: "baa",   arName: "باء",  family: "Group 1" },
  { ar: "ت", name: "taa",   arName: "تاء",  family: "Group 1" },
  { ar: "ث", name: "thaa",  arName: "ثاء",  family: "Group 1" },
  { ar: "ج", name: "jeem",  arName: "جيم",  family: "Group 2" },
  { ar: "ح", name: "ḥaa",   arName: "حاء",  family: "Group 2" },
  { ar: "خ", name: "khaa",  arName: "خاء",  family: "Group 2" },
  { ar: "د", name: "daal",  arName: "دال",  family: "Group 3" },
  { ar: "ذ", name: "dhaal", arName: "ذال",  family: "Group 3" },
  { ar: "ر", name: "raa",   arName: "راء",  family: "Group 4" },
  { ar: "ز", name: "zaay",  arName: "زاي",  family: "Group 4" },
  { ar: "س", name: "seen",  arName: "سين",  family: "Group 5" },
  { ar: "ش", name: "sheen", arName: "شين",  family: "Group 5" },
  { ar: "ص", name: "ṣaad",  arName: "صاد",  family: "Group 6" },
  { ar: "ض", name: "ḍaad",  arName: "ضاد",  family: "Group 6" },
  { ar: "ط", name: "ṭaa",   arName: "طاء",  family: "Group 7" },
  { ar: "ظ", name: "ẓaa",   arName: "ظاء",  family: "Group 7" },
  { ar: "ع", name: "'ayn",  arName: "عين",  family: "Group 8" },
  { ar: "غ", name: "ghayn", arName: "غين",  family: "Group 8" },
  { ar: "ف", name: "faa",   arName: "فاء",  family: "Group 9" },
  { ar: "ق", name: "qaaf",  arName: "قاف",  family: "Group 9" },
  { ar: "ا", name: "alif",  arName: "ألف",  family: "Standalone" },
  { ar: "ل", name: "laam",  arName: "لام",  family: "Standalone" },
  { ar: "م", name: "meem",  arName: "ميم",  family: "Standalone" },
  { ar: "ن", name: "noon",  arName: "نون",  family: "Standalone" },
  { ar: "ه", name: "haa",   arName: "هاء",  family: "Standalone" },
  { ar: "و", name: "waw",   arName: "واو",  family: "Standalone" },
  { ar: "ي", name: "yaa",   arName: "ياء",  family: "Standalone" },
  { ar: "ك", name: "kaaf",  arName: "كاف",  family: "Standalone" },
];

const hexFor = (ar: string) => ar.codePointAt(0)!.toString(16);

const EXT_BY_MIME: Record<string, string> = {
  "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/aac": "m4a",
  "audio/webm": "webm", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav",
};
const extFor = (mime: string) => EXT_BY_MIME[mime.split(";")[0]] ?? "webm";

type FileStatus = { exists: boolean; url?: string };

export default function LetterAudioRecorder() {
  const [statusByHex, setStatusByHex] = useState<Record<string, FileStatus>>({});
  const [loadingList, setLoadingList] = useState(true);
  const [activeHex, setActiveHex] = useState<string | null>(null);   // which letter's recorder is open
  const [uploadingHex, setUploadingHex] = useState<string | null>(null);
  const [generatingHex, setGeneratingHex] = useState<string | null>(null);
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });
  const [toast, setToast] = useState<string | null>(null);

  const refreshList = async () => {
    setLoadingList(true);
    const { data, error } = await supabase.storage.from(BUCKET).list("", { limit: 200 });
    const map: Record<string, FileStatus> = {};
    if (!error && data) {
      for (const f of data) {
        const hex = f.name.split(".")[0];
        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(f.name);
        map[hex] = { exists: true, url: pub.publicUrl };
      }
    }
    setStatusByHex(map);
    setLoadingList(false);
  };

  useEffect(() => { refreshList(); }, []);

  const grouped = useMemo(() => {
    const g: Record<string, LetterDef[]> = {};
    for (const l of LETTERS) (g[l.family] ??= []).push(l);
    return g;
  }, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3500); };

  const uploadBlob = async (letter: LetterDef, blob: Blob) => {
    const hex = hexFor(letter.ar);
    setUploadingHex(hex);
    const path = `${hex}.${extFor(blob.type)}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
      contentType: blob.type || "audio/webm",
      upsert: true,
    });
    setUploadingHex(null);
    if (error) {
      showToast(`Upload failed for ${letter.name}: ${error.message}`);
      return;
    }
    setActiveHex(null);
    await refreshList();
  };

  const generateOne = async (letter: LetterDef) => {
    const hex = hexFor(letter.ar);
    setGeneratingHex(hex);
    const { data, error } = await supabase.functions.invoke("generate-letter-audio", {
      body: { letters: [{ hex, arName: letter.arName }] },
    });
    setGeneratingHex(null);
    if (error) { showToast(`AI generation failed: ${error.message}`); return; }
    const r = data?.results?.[hex];
    if (!r?.ok) { showToast(`AI generation failed for ${letter.name}: ${r?.error ?? "unknown error"}`); return; }
    await refreshList();
  };

  const generateAll = async () => {
    setBulkGenerating(true);
    const missing = LETTERS.filter(l => !statusByHex[hexFor(l.ar)]?.exists);
    const targets = missing.length ? missing : LETTERS; // if all exist, offer to regenerate all
    setBulkProgress({ done: 0, total: targets.length });
    const payload = targets.map(l => ({ hex: hexFor(l.ar), arName: l.arName }));
    const { data, error } = await supabase.functions.invoke("generate-letter-audio", {
      body: { letters: payload },
    });
    setBulkGenerating(false);
    if (error) { showToast(`Bulk generation failed: ${error.message}`); return; }
    const results = data?.results ?? {};
    const failed = Object.entries(results).filter(([, r]: any) => !r.ok);
    if (failed.length) showToast(`${failed.length} of ${targets.length} letters failed — check console for details.`);
    else showToast(`Generated ${targets.length} letters successfully.`);
    if (failed.length) console.error("[LetterAudioRecorder] generation failures:", failed);
    await refreshList();
  };

  const recordedCount = LETTERS.filter(l => statusByHex[hexFor(l.ar)]?.exists).length;

  return (
    <div style={{ maxWidth: 880, margin: "0 auto", padding: "24px 18px 60px", fontFamily: "Inter, sans-serif" }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1b3d2e", margin: 0 }}>Letter Recognition — Audio Library</h1>
        <p style={{ fontSize: 13.5, color: "#6b7a72", marginTop: 6, lineHeight: 1.55, maxWidth: 640 }}>
          Each of the 28 letters needs one short recording of its name (e.g. "باء" for ب).
          Record your own voice, or generate one instantly with AI — either way, once a file
          is here the lesson plays it automatically instead of falling back to the phone's
          own text-to-speech.
        </p>
        <p style={{ fontSize: 12, color: "#9a8a5a", marginTop: 6 }}>
          AI voices are fine for naming a letter, but a real qualified reciter is still needed for actual Qur'an recitation lessons.
        </p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#1b3d2e", background: "#f0f4f0", padding: "7px 14px", borderRadius: 20 }}>
          {loadingList ? "Loading…" : `${recordedCount} / ${LETTERS.length} recorded`}
        </div>
        <button
          onClick={generateAll}
          disabled={bulkGenerating}
          style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 18px", borderRadius: 20, background: "#b8860b", border: "none", color: "#fff", fontSize: 13, fontWeight: 700, cursor: bulkGenerating ? "default" : "pointer", opacity: bulkGenerating ? 0.7 : 1 }}
        >
          {bulkGenerating
            ? <><Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> Generating {bulkProgress.total ? `(${bulkProgress.total} letters)` : "…"}</>
            : <><Sparkles style={{ width: 14, height: 14 }} /> Generate all missing with AI</>}
        </button>
      </div>

      {toast && (
        <div style={{ position: "fixed", left: "50%", bottom: 20, transform: "translateX(-50%)", background: "#1b3d2e", color: "#fff", fontSize: 13, padding: "10px 18px", borderRadius: 100, boxShadow: "0 8px 20px rgba(0,0,0,.25)", zIndex: 999, maxWidth: "90vw", textAlign: "center" }}>
          {toast}
        </div>
      )}

      {Object.entries(grouped).map(([family, letters]) => (
        <div key={family} style={{ marginBottom: 26 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: "#8a7a4a", textTransform: "uppercase", letterSpacing: ".04em", margin: "0 0 10px" }}>{family}</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {letters.map(letter => {
              const hex = hexFor(letter.ar);
              const status = statusByHex[hex];
              const isOpen = activeHex === hex;
              const isGenerating = generatingHex === hex;
              const isUploading = uploadingHex === hex;
              return (
                <div key={hex} style={{ background: "#fff", border: "1px solid #eee6d8", borderRadius: 14, padding: "12px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ fontSize: 30, fontWeight: 600, color: "#1b3d2e", width: 44, textAlign: "center", flexShrink: 0 }}>{letter.ar}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: "#1b3d2e" }}>{letter.name} <span style={{ color: "#9a8a5a", fontWeight: 400 }}>· {letter.arName}</span></div>
                      <div style={{ fontSize: 11.5, color: status?.exists ? "#2f9e5c" : "#b08a3a", marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
                        {status?.exists ? <><CheckCircle2 style={{ width: 12, height: 12 }} /> Recorded</> : "Not recorded yet"}
                      </div>
                    </div>

                    {status?.exists && (
                      <button
                        onClick={() => new Audio(status.url).play()}
                        title="Preview"
                        style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: "50%", background: "#f0f4f0", border: "none", cursor: "pointer", flexShrink: 0 }}>
                        <Play style={{ width: 14, height: 14, color: "#1b3d2e" }} />
                      </button>
                    )}

                    <button
                      onClick={() => generateOne(letter)}
                      disabled={isGenerating || bulkGenerating}
                      title="Generate with AI"
                      style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: "50%", background: "#fdf3e0", border: "none", cursor: "pointer", flexShrink: 0, opacity: isGenerating ? 0.5 : 1 }}>
                      {isGenerating ? <Loader2 style={{ width: 14, height: 14, color: "#b8860b" }} className="animate-spin" /> : <Sparkles style={{ width: 14, height: 14, color: "#b8860b" }} />}
                    </button>

                    <button
                      onClick={() => setActiveHex(isOpen ? null : hex)}
                      title={status?.exists ? "Re-record" : "Record"}
                      style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: "50%", background: isOpen ? "#1b3d2e" : "#f0f4f0", border: "none", cursor: "pointer", flexShrink: 0 }}>
                      {status?.exists
                        ? <RotateCcw style={{ width: 14, height: 14, color: isOpen ? "#fff" : "#1b3d2e" }} />
                        : <Mic style={{ width: 14, height: 14, color: isOpen ? "#fff" : "#1b3d2e" }} />}
                    </button>
                  </div>

                  {isOpen && (
                    <div style={{ marginTop: 12 }}>
                      <AudioRecorder
                        onRecordingComplete={(blob) => uploadBlob(letter, blob)}
                      />
                      {isUploading && <p style={{ fontSize: 12, color: "#9a8a5a", marginTop: 6 }}>Uploading…</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
