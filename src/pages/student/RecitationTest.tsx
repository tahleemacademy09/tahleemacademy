/*  src/pages/admin/RecitationTestAdmin.tsx
    Admin control panel for the student Recitation Test.
    Controls: surah, reference text, instructions, tips,
    recording limits, session time slots, AI scoring toggle,
    and ability to enable/disable the test entirely.
    Also shows all pending student submissions for review.
*/
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useRecitationSettings, DEFAULT_RECITATION_SETTINGS } from "@/hooks/useRecitationSettings";
import {
  Mic, Save, RefreshCw, CheckCircle2, XCircle, Clock,
  Settings, Users, Eye, Play, Pause, ToggleLeft, ToggleRight,
  AlertCircle, BookOpen, Loader2, ChevronDown, ChevronUp
} from "lucide-react";

const G    = "#064E3B";
const GM   = "#075E54";
const GOLD = "#D4A843";

// ── Tab button ─────────────────────────────────────────────────────
const Tab = ({ active, onClick, icon, label, count }: any) => (
  <button onClick={onClick} style={{
    padding: "10px 18px", border: "none", cursor: "pointer", fontWeight: 700,
    fontSize: 13, borderBottom: `3px solid ${active ? GM : "transparent"}`,
    color: active ? GM : "#888", background: "none", display: "flex",
    alignItems: "center", gap: 6, transition: "all .2s",
  }}>
    {icon}
    {label}
    {count !== undefined && (
      <span style={{ background: active ? GM : "#e5e7eb", color: active ? "#fff" : "#666", borderRadius: 20, padding: "1px 7px", fontSize: 11 }}>
        {count}
      </span>
    )}
  </button>
);

// ── Input helpers ──────────────────────────────────────────────────
const Label = ({ children }: any) => (
  <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6, textTransform: "uppercase" as const, letterSpacing: .4 }}>
    {children}
  </div>
);

const TextInput = ({ value, onChange, placeholder, type = "text" }: any) => (
  <input
    type={type} value={value} onChange={e => onChange(e.target.value)}
    placeholder={placeholder}
    style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #e5e7eb", fontSize: 13, outline: "none", color: "#111", background: "#fafafa", boxSizing: "border-box" as const, fontFamily: "inherit" }}
  />
);

const TextArea = ({ value, onChange, placeholder, rows = 4, dir = "ltr" }: any) => (
  <textarea
    value={value} onChange={e => onChange(e.target.value)}
    placeholder={placeholder} rows={rows}
    style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #e5e7eb", fontSize: 13, outline: "none", color: "#111", background: "#fafafa", resize: "vertical" as const, boxSizing: "border-box" as const, fontFamily: "inherit", direction: dir as any, lineHeight: 1.8 }}
  />
);

const Toggle = ({ on, onToggle, label, desc }: any) => (
  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "14px 0", borderBottom: "1px solid #f0f0f0" }}>
    <div>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{label}</div>
      {desc && <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{desc}</div>}
    </div>
    <button onClick={onToggle} style={{ background: "none", border: "none", cursor: "pointer", flexShrink: 0, marginLeft: 16 }}>
      {on
        ? <ToggleRight size={32} color={GM} />
        : <ToggleLeft size={32} color="#d1d5db" />}
    </button>
  </div>
);

// ── MAIN COMPONENT ─────────────────────────────────────────────────
const RecitationTestAdmin = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { settings, loading, save, refetch } = useRecitationSettings();

  const [tab, setTab]       = useState<"settings" | "submissions">("settings");
  const [saving, setSaving] = useState(false);
  const [subs, setSubs]     = useState<any[]>([]);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [playingId, setPlayingId]     = useState<string | null>(null);
  const [audioEl, setAudioEl]         = useState<HTMLAudioElement | null>(null);
  const [expandedId, setExpandedId]   = useState<string | null>(null);

  // Local editable state — mirrors settings
  const [surahName,        setSurahName]        = useState("");
  const [surahArabic,      setSurahArabic]      = useState("");
  const [surahReference,   setSurahReference]   = useState("");
  const [instructions,     setInstructions]     = useState("");
  const [tips,             setTips]             = useState("");
  const [minDur,           setMinDur]           = useState("10");
  const [maxDur,           setMaxDur]           = useState("120");
  const [availTimes,       setAvailTimes]       = useState("");
  const [aiEnabled,        setAiEnabled]        = useState(true);
  const [testEnabled,      setTestEnabled]      = useState(true);
  const [disabledMsg,      setDisabledMsg]      = useState("");
  const [stage1Label,      setStage1Label]      = useState("Record");
  const [stage2Label,      setStage2Label]      = useState("AI Score");
  const [stage3Label,      setStage3Label]      = useState("Live Session");

  // Sync local state when settings load
  useEffect(() => {
    if (loading) return;
    setSurahName(settings.surah_name || DEFAULT_RECITATION_SETTINGS.surah_name);
    setSurahArabic(settings.surah_arabic || DEFAULT_RECITATION_SETTINGS.surah_arabic);
    setSurahReference(settings.surah_reference || DEFAULT_RECITATION_SETTINGS.surah_reference);
    setInstructions(settings.instructions || DEFAULT_RECITATION_SETTINGS.instructions);
    setTips(settings.tips || DEFAULT_RECITATION_SETTINGS.tips);
    setMinDur(String(settings.min_duration_sec ?? 10));
    setMaxDur(String(settings.max_duration_sec ?? 120));
    setAvailTimes(settings.available_times || DEFAULT_RECITATION_SETTINGS.available_times);
    setAiEnabled(settings.ai_scoring_enabled !== "false");
    setTestEnabled(settings.test_enabled !== "false");
    setDisabledMsg(settings.disabled_message || DEFAULT_RECITATION_SETTINGS.disabled_message);
    setStage1Label(settings.stage1_label || "Record");
    setStage2Label(settings.stage2_label || "AI Score");
    setStage3Label(settings.stage3_label || "Live Session");
  }, [loading, settings]);

  // Load submissions
  const loadSubs = async () => {
    setLoadingSubs(true);
    const { data } = await supabase
      .from("recitation_tests" as any)
      .select("*")
      .order("stage1_submitted_at", { ascending: false })
      .limit(100);

    if (data) {
      const ids = [...new Set((data as any[]).map((r: any) => r.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email, student_id")
        .in("user_id", ids as any);
      const pmap: Record<string, any> = {};
      (profiles || []).forEach((p: any) => { pmap[p.user_id] = p; });
      setSubs((data as any[]).map((r: any) => ({ ...r, profile: pmap[r.user_id] })));
    }
    setLoadingSubs(false);
  };

  useEffect(() => { if (tab === "submissions") loadSubs(); }, [tab]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await save({
        surah_name:         surahName,
        surah_arabic:       surahArabic,
        surah_reference:    surahReference,
        instructions,
        tips,
        min_duration_sec:   Number(minDur) as any,
        max_duration_sec:   Number(maxDur) as any,
        available_times:    availTimes,
        ai_scoring_enabled: String(aiEnabled),
        test_enabled:       String(testEnabled),
        disabled_message:   disabledMsg,
        stage1_label:       stage1Label,
        stage2_label:       stage2Label,
        stage3_label:       stage3Label,
      }, user?.id);
      toast({ title: "✅ Settings saved!" });
    } catch (e: any) {
      toast({ title: "Error saving", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const resetToDefaults = () => {
    const d = DEFAULT_RECITATION_SETTINGS;
    setSurahName(d.surah_name); setSurahArabic(d.surah_arabic);
    setSurahReference(d.surah_reference); setInstructions(d.instructions);
    setTips(d.tips); setMinDur("10"); setMaxDur("120");
    setAvailTimes(d.available_times); setAiEnabled(true); setTestEnabled(true);
    setDisabledMsg(d.disabled_message);
    setStage1Label("Record"); setStage2Label("AI Score"); setStage3Label("Live Session");
    toast({ title: "Reset to defaults — click Save to apply" });
  };

  const playAudio = (id: string, url: string) => {
    if (playingId === id) { audioEl?.pause(); setPlayingId(null); return; }
    audioEl?.pause();
    const el = new Audio(url);
    el.onended = () => setPlayingId(null);
    el.play();
    setAudioEl(el);
    setPlayingId(id);
  };

  const updateStatus = async (id: string, status: string) => {
    await supabase.from("recitation_tests" as any).update({ status } as any).eq("id", id);
    setSubs(prev => prev.map(s => s.id === id ? { ...s, status } : s));
    toast({ title: `Status updated to: ${status}` });
  };

  const statusColor = (s: string) => ({
    stage1_complete: { bg: "#EFF6FF", color: "#1D4ED8" },
    stage2_complete: { bg: "#F5F3FF", color: "#7C3AED" },
    awaiting_teacher: { bg: "#FFF8E1", color: "#92400E" },
    completed:        { bg: "#E8F5E9", color: "#2E7D32" },
    failed:           { bg: "#FFEBEE", color: "#C62828" },
  }[s] || { bg: "#F3F4F6", color: "#6B7280" });

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300, gap: 12 }}>
      <Loader2 size={24} color={GM} style={{ animation: "spin .8s linear infinite" }} />
      <span style={{ color: "#666" }}>Loading settings…</span>
    </div>
  );

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 0 40px", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: G, margin: 0 }}>Recitation Test Settings</h1>
          <p style={{ fontSize: 13, color: "#888", marginTop: 4 }}>Configure what students see and do during the recitation evaluation</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={resetToDefaults} style={{ padding: "9px 16px", borderRadius: 10, border: "1.5px solid #e5e7eb", background: "#fff", color: "#555", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <RefreshCw size={14} /> Reset
          </button>
          <button onClick={handleSave} disabled={saving} style={{ padding: "9px 20px", borderRadius: 10, border: "none", background: saving ? "#9ca3af" : `linear-gradient(135deg,${G},${GM})`, color: "#fff", fontSize: 13, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            {saving ? <Loader2 size={14} style={{ animation: "spin .8s linear infinite" }} /> : <Save size={14} />}
            {saving ? "Saving…" : "Save Settings"}
          </button>
        </div>
      </div>

      {/* Test status banner */}
      {!testEnabled && (
        <div style={{ background: "#FFEBEE", border: "1.5px solid #EF9A9A", borderRadius: 12, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
          <AlertCircle size={18} color="#C62828" />
          <span style={{ fontSize: 13, color: "#C62828", fontWeight: 600 }}>Recitation test is currently DISABLED — students will see your message below</span>
        </div>
      )}

      {/* Tabs */}
      <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,.07)", overflow: "hidden" }}>
        <div style={{ display: "flex", borderBottom: "1px solid #f0f0f0", padding: "0 8px" }}>
          <Tab active={tab === "settings"} onClick={() => setTab("settings")} icon={<Settings size={14} />} label="Test Settings" />
          <Tab active={tab === "submissions"} onClick={() => setTab("submissions")} icon={<Users size={14} />} label="Student Submissions" count={subs.filter(s => s.status === "awaiting_teacher").length || undefined} />
        </div>

        {/* ── SETTINGS TAB ─────────────────────────────────────── */}
        {tab === "settings" && (
          <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 28 }}>

            {/* Global toggles */}
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: G, marginBottom: 4 }}>Global Controls</div>
              <Toggle
                on={testEnabled}
                onToggle={() => setTestEnabled(v => !v)}
                label="Recitation Test Enabled"
                desc="Turn off to prevent students from accessing the recitation test"
              />
              <Toggle
                on={aiEnabled}
                onToggle={() => setAiEnabled(v => !v)}
                label="AI Scoring Enabled"
                desc="Uses Groq Whisper to auto-score word accuracy. Disable to rely on teacher scoring only"
              />
              {!testEnabled && (
                <div style={{ marginTop: 12 }}>
                  <Label>Message shown to students when test is disabled</Label>
                  <TextInput value={disabledMsg} onChange={setDisabledMsg} placeholder="e.g. The recitation test is temporarily unavailable…" />
                </div>
              )}
            </div>

            {/* Surah settings */}
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: G, marginBottom: 12 }}>Surah to Recite</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <Label>Surah Name (English)</Label>
                  <TextInput value={surahName} onChange={setSurahName} placeholder="e.g. Al-Fatiha" />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <Label>Min Recording (seconds)</Label>
                    <TextInput value={minDur} onChange={setMinDur} type="number" placeholder="10" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <Label>Max Recording (seconds)</Label>
                    <TextInput value={maxDur} onChange={setMaxDur} type="number" placeholder="120" />
                  </div>
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <Label>Arabic Text (shown to student with diacritics)</Label>
                <TextArea value={surahArabic} onChange={setSurahArabic} dir="rtl" rows={5} placeholder="Arabic text with tashkeel shown in the exam card…" />
              </div>
              <div>
                <Label>Reference Text for AI Scoring (plain Arabic, no diacritics)</Label>
                <TextArea value={surahReference} onChange={setSurahReference} dir="rtl" rows={3} placeholder="Plain Arabic text used to compare with AI transcription…" />
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>This is what the AI compares the student's recitation against. Remove all tashkeel/diacritics.</div>
              </div>
            </div>

            {/* Instructions */}
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: G, marginBottom: 12 }}>Student Instructions</div>
              <div style={{ marginBottom: 12 }}>
                <Label>Main Instruction</Label>
                <TextArea value={instructions} onChange={setInstructions} rows={2} placeholder="e.g. Recite the surah clearly into your microphone…" />
              </div>
              <div>
                <Label>Tips (one per line or comma-separated)</Label>
                <TextArea value={tips} onChange={setTips} rows={4} placeholder="Find a quiet room,Hold phone 15-20cm from your mouth,Recite clearly…" />
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>Shown as a checklist to students before recording. Separate each tip with a comma or new line.</div>
              </div>
            </div>

            {/* Stage labels */}
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: G, marginBottom: 12 }}>Stage Labels (shown in progress bar)</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                {[
                  { label: "Stage 1 Label", val: stage1Label, set: setStage1Label },
                  { label: "Stage 2 Label", val: stage2Label, set: setStage2Label },
                  { label: "Stage 3 Label", val: stage3Label, set: setStage3Label },
                ].map((s, i) => (
                  <div key={i}>
                    <Label>{s.label}</Label>
                    <TextInput value={s.val} onChange={s.set} placeholder={s.label} />
                  </div>
                ))}
              </div>
            </div>

            {/* Session time slots */}
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: G, marginBottom: 4 }}>Available Session Time Slots</div>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 10 }}>
                Students pick from these times when booking their live teacher session (Stage 3). Comma-separated, 24h format (e.g. 08:00,10:00,14:00).
              </div>
              <TextInput value={availTimes} onChange={setAvailTimes} placeholder="08:00,10:00,12:00,14:00,16:00,18:00,20:00" />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                {availTimes.split(",").filter(Boolean).map(t => (
                  <span key={t} style={{ background: "#F0FDF4", border: "1px solid #86EFAC", borderRadius: 20, padding: "4px 12px", fontSize: 12, color: G, fontWeight: 600 }}>{t.trim()}</span>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* ── SUBMISSIONS TAB ──────────────────────────────────── */}
        {tab === "submissions" && (
          <div style={{ padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#333" }}>{subs.length} submission{subs.length !== 1 ? "s" : ""}</div>
              <button onClick={loadSubs} style={{ background: "none", border: "none", cursor: "pointer", color: GM, display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600 }}>
                <RefreshCw size={13} /> Refresh
              </button>
            </div>

            {loadingSubs && (
              <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
                <Loader2 size={24} color={GM} style={{ animation: "spin .8s linear infinite" }} />
              </div>
            )}

            {!loadingSubs && subs.length === 0 && (
              <div style={{ textAlign: "center", padding: 48, color: "#9ca3af" }}>
                <Mic size={40} style={{ margin: "0 auto 12px", display: "block", color: "#e5e7eb" }} />
                <div style={{ fontSize: 14 }}>No recitation submissions yet</div>
              </div>
            )}

            {!loadingSubs && subs.map(sub => {
              const sc = statusColor(sub.status);
              const isExpanded = expandedId === sub.id;
              return (
                <div key={sub.id} style={{ border: "1.5px solid #f0f0f0", borderRadius: 14, marginBottom: 10, overflow: "hidden" }}>
                  {/* Row header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", cursor: "pointer", background: "#fafafa" }} onClick={() => setExpandedId(isExpanded ? null : sub.id)}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: G, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, flexShrink: 0 }}>
                      {(sub.profile?.full_name || "S")[0]}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "#111" }}>{sub.profile?.full_name || "Unknown Student"}</div>
                      <div style={{ fontSize: 11, color: "#9ca3af" }}>{sub.profile?.email} · {sub.profile?.student_id || "—"}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ background: sc.bg, color: sc.color, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>
                        {sub.status?.replace(/_/g, " ")}
                      </span>
                      {sub.ai_score !== null && sub.ai_score !== undefined && (
                        <span style={{ background: "#F5F3FF", color: "#7C3AED", borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>
                          AI: {sub.ai_score}%
                        </span>
                      )}
                      {isExpanded ? <ChevronUp size={16} color="#9ca3af" /> : <ChevronDown size={16} color="#9ca3af" />}
                    </div>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div style={{ padding: "16px", borderTop: "1px solid #f0f0f0", display: "flex", flexDirection: "column", gap: 14 }}>

                      {/* Audio player */}
                      {sub.audio_path && !sub.audio_path.startsWith("data:") && (
                        <div>
                          <Label>Recorded Audio</Label>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#F0FDF4", borderRadius: 10, padding: "10px 14px", border: "1px solid #86EFAC" }}>
                            <button onClick={() => playAudio(sub.id, sub.audio_path)} style={{ width: 36, height: 36, borderRadius: "50%", background: GM, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              {playingId === sub.id ? <Pause size={16} color="#fff" /> : <Play size={16} color="#fff" />}
                            </button>
                            <span style={{ fontSize: 12, color: "#166534" }}>
                              {playingId === sub.id ? "Playing…" : "Click to play student's recitation"}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* AI transcript */}
                      {sub.ai_transcript && (
                        <div>
                          <Label>AI Transcript</Label>
                          <div style={{ background: "#FAFAFA", borderRadius: 10, padding: "10px 14px", border: "1px solid #e5e7eb", fontSize: 14, direction: "rtl", lineHeight: 1.8, color: "#333" }}>
                            {sub.ai_transcript}
                          </div>
                        </div>
                      )}

                      {/* Session booking */}
                      {sub.stage3_session_date && (
                        <div style={{ background: "#FFF8E1", borderRadius: 10, padding: "10px 14px", border: "1px solid #F9D46A", display: "flex", alignItems: "center", gap: 8 }}>
                          <Clock size={15} color="#D97706" />
                          <span style={{ fontSize: 13, color: "#92400E", fontWeight: 600 }}>
                            Session requested: {new Date(sub.stage3_session_date).toLocaleString("en-NG", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      )}

                      {/* Status controls */}
                      <div>
                        <Label>Update Status</Label>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {[
                            { v: "awaiting_teacher", label: "Awaiting Teacher", color: "#92400E", bg: "#FFF8E1" },
                            { v: "completed",        label: "✓ Completed",      color: "#2E7D32", bg: "#E8F5E9" },
                            { v: "failed",           label: "✗ Failed",         color: "#C62828", bg: "#FFEBEE" },
                          ].map(opt => (
                            <button key={opt.v} onClick={() => updateStatus(sub.id, opt.v)}
                              style={{ padding: "7px 14px", borderRadius: 10, border: `1.5px solid ${sub.status === opt.v ? opt.color : "#e5e7eb"}`, background: sub.status === opt.v ? opt.bg : "#fff", color: sub.status === opt.v ? opt.color : "#555", fontSize: 12, fontWeight: sub.status === opt.v ? 700 : 500, cursor: "pointer" }}>
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default RecitationTestAdmin;
