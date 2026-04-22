import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { storageSupabase, getSignedUrl, removeStorageFile } from "@/integrations/supabase/storageClient";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Video, Play, Search, Clock, User, CheckCircle, Trash2, Edit, Save, Pause, Volume2, VolumeX, Download, Minimize2, ChevronUp } from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { toast } from "@/hooks/use-toast";

const G      = "#0f2d1f";
const GM     = "#1a4731";
const GOLD   = "#c9a84c";
const BORDER = "rgba(15,45,31,0.1)";

// ── Position persistence ──────────────────────────────────────
const POS_KEY = (id: string) => `tahleem-rec-pos-${id}`;
const savePos = (id: string, t: number) => {
  try { localStorage.setItem(POS_KEY(id), String(t)); } catch {}
};
const readPos = (id: string): number => {
  try { return parseFloat(localStorage.getItem(POS_KEY(id)) || "0") || 0; } catch { return 0; }
};

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

// ── Floating Mini Player (persists across tab switches) ───────
interface MiniPlayerProps {
  title: string;
  playing: boolean;
  currentTime: number;
  totalDur: number;
  speed: number;
  onToggle: () => void;
  onRestore: () => void;
  onClose: () => void;
}

const MiniPlayer = ({ title, playing, currentTime, totalDur, speed, onToggle, onRestore, onClose }: MiniPlayerProps) => {
  const pct = totalDur > 0 ? (currentTime / totalDur) * 100 : 0;
  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9999,
      background: "#111", borderTop: `2px solid ${GOLD}`,
      padding: "10px 16px", display: "flex", alignItems: "center", gap: 12,
      boxShadow: "0 -4px 20px rgba(0,0,0,.4)", fontFamily: "'Cairo',sans-serif",
    }}>
      {/* Progress line */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "rgba(255,255,255,.1)" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: GOLD, transition: "width .5s linear" }} />
      </div>

      {/* Icon */}
      <div style={{ width: 36, height: 36, borderRadius: 8, background: GM, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Video style={{ width: 16, height: 16, color: GOLD }} />
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={onRestore}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
        <div style={{ fontSize: 10, color: "#888" }}>{fmt(currentTime)} / {fmt(totalDur)} • {speed}x</div>
      </div>

      {/* Controls */}
      <button onClick={onToggle} style={{ width: 36, height: 36, borderRadius: "50%", background: GOLD, border: "none", color: G, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {playing ? <Pause style={{ width: 16, height: 16 }} /> : <Play style={{ width: 16, height: 16, marginLeft: 2 }} />}
      </button>
      <button onClick={onRestore} style={{ background: "none", border: "none", color: "#aaa", cursor: "pointer", padding: 4 }}>
        <ChevronUp style={{ width: 18, height: 18 }} />
      </button>
      <button onClick={onClose} style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 18, padding: "0 4px", lineHeight: 1 }}>×</button>
    </div>
  );
};

// ── Full Inline Player ────────────────────────────────────────
const InlinePlayer = ({ recordingId, fileUrl, duration, title, onClose, onMinimize }: {
  recordingId: string; fileUrl: string; duration: number; title: string;
  onClose: () => void; onMinimize: () => void;
}) => {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [playing, setPlaying]     = useState(false);
  const [currentTime, setCurrent] = useState(0);
  const [totalDur, setTotalDur]   = useState(duration || 0);
  const [volume, setVolume]       = useState(1);
  const [muted, setMuted]         = useState(false);
  const [isVideo, setIsVideo]     = useState(false);
  const [speed, setSpeed]         = useState(1);
  const [showSpeeds, setShowSpeeds] = useState(false);
  const [resumed, setResumed]     = useState(false);
  const mediaRef = useRef<HTMLAudioElement & HTMLVideoElement>(null);
  const saveTimer = useRef<number | null>(null);

  // Load signed URL
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    getSignedUrl(fileUrl, 7200).then(url => {
      if (cancelled) return;
      if (url) {
        setSignedUrl(url);
        setIsVideo(
          fileUrl.includes("video") || fileUrl.endsWith(".mp4") || fileUrl.endsWith(".webm") ||
          url.includes(".mp4") || url.includes(".webm")
        );
      } else {
        setError("Could not load recording.");
      }
      setLoading(false);
    }).catch(err => {
      if (!cancelled) { setError("Failed to load: " + (err?.message || "Unknown")); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [fileUrl]);

  // Resume position after metadata loads
  const handleMetadata = useCallback(() => {
    const el = mediaRef.current;
    if (!el) return;
    setTotalDur(el.duration || duration);
    if (!resumed) {
      const saved = readPos(recordingId);
      if (saved > 5 && saved < (el.duration - 5)) {
        el.currentTime = saved;
        setCurrent(saved);
      }
      setResumed(true);
    }
  }, [recordingId, duration, resumed]);

  // Save position periodically
  const handleTimeUpdate = useCallback(() => {
    const t = mediaRef.current?.currentTime || 0;
    setCurrent(t);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => savePos(recordingId, t), 2000);
  }, [recordingId]);

  // MediaSession for lock-screen / background controls
  useEffect(() => {
    if (!signedUrl || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: title || "Tahleem Recording",
      artist: "Tahleem Academy",
      album: "Recorded Lesson",
    });
    navigator.mediaSession.setActionHandler("play",  () => { mediaRef.current?.play(); setPlaying(true); });
    navigator.mediaSession.setActionHandler("pause", () => { mediaRef.current?.pause(); setPlaying(false); });
    navigator.mediaSession.setActionHandler("seekbackward", () => skip(-10));
    navigator.mediaSession.setActionHandler("seekforward",  () => skip(10));
  }, [signedUrl, title]);

  // Apply speed to element
  useEffect(() => {
    if (mediaRef.current) mediaRef.current.playbackRate = speed;
  }, [speed]);

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  const togglePlay = () => {
    if (!mediaRef.current) return;
    if (playing) { mediaRef.current.pause(); setPlaying(false); }
    else { mediaRef.current.play().catch(() => {}); setPlaying(true); }
  };

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = parseFloat(e.target.value);
    if (mediaRef.current) { mediaRef.current.currentTime = t; setCurrent(t); savePos(recordingId, t); }
  };

  const skip = (sec: number) => {
    if (!mediaRef.current) return;
    const t = Math.max(0, Math.min(totalDur, (mediaRef.current.currentTime || 0) + sec));
    mediaRef.current.currentTime = t; setCurrent(t);
  };

  const changeVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVolume(v); setMuted(v === 0);
    if (mediaRef.current) mediaRef.current.volume = v;
  };

  const handleEnded = () => {
    setPlaying(false);
    savePos(recordingId, 0); // Reset so next play starts fresh
  };

  const pct = totalDur > 0 ? (currentTime / totalDur) * 100 : 0;

  return (
    <div style={{ background: "#0a0a0a", borderRadius: 16, overflow: "hidden", marginBottom: 16 }}>
      {loading ? (
        <div style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center", color: "#999", fontSize: 13 }}>
          Loading recording…
        </div>
      ) : error ? (
        <div style={{ padding: 20, textAlign: "center", color: "#EF4444", fontSize: 13 }}>
          <div style={{ marginBottom: 8 }}>⚠️ {error}</div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,.1)", border: "none", color: "#fff", cursor: "pointer", padding: "4px 12px", borderRadius: 8, fontSize: 12 }}>Close</button>
        </div>
      ) : signedUrl ? (
        <>
          {/* Media element — always mounted so audio continues in background */}
          {isVideo ? (
            <video ref={mediaRef as any} src={signedUrl} style={{ width: "100%", maxHeight: 280, background: "#000" }}
              onTimeUpdate={handleTimeUpdate} onLoadedMetadata={handleMetadata} onEnded={handleEnded} />
          ) : (
            <audio ref={mediaRef as any} src={signedUrl}
              onTimeUpdate={handleTimeUpdate} onLoadedMetadata={handleMetadata} onEnded={handleEnded} />
          )}

          {/* Controls panel */}
          <div style={{ padding: "14px 16px", background: "#111" }}>
            {/* Progress bar */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ position: "relative", height: 6, background: "rgba(255,255,255,.12)", borderRadius: 4, marginBottom: 6, cursor: "pointer" }}>
                <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${pct}%`, background: GOLD, borderRadius: 4, transition: "width .3s linear", pointerEvents: "none" }} />
                <input type="range" min={0} max={totalDur || 100} step={0.5} value={currentTime}
                  onChange={seek}
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer", margin: 0 }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#666" }}>
                <span>{fmt(currentTime)}</span>
                <span>{fmt(totalDur)}</span>
              </div>
            </div>

            {/* Playback row */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {/* Skip back */}
              <button onClick={() => skip(-10)}
                style={{ background: "none", border: "none", color: "#aaa", cursor: "pointer", fontSize: 10, display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                <span style={{ fontSize: 15 }}>⟪</span><span>10s</span>
              </button>

              {/* Play/Pause */}
              <button onClick={togglePlay}
                style={{ width: 52, height: 52, borderRadius: "50%", background: GOLD, border: "none", color: G, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 2px 12px rgba(201,168,76,.4)" }}>
                {playing ? <Pause style={{ width: 22, height: 22 }} /> : <Play style={{ width: 22, height: 22, marginLeft: 2 }} />}
              </button>

              {/* Skip forward */}
              <button onClick={() => skip(10)}
                style={{ background: "none", border: "none", color: "#aaa", cursor: "pointer", fontSize: 10, display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                <span style={{ fontSize: 15 }}>⟫</span><span>10s</span>
              </button>

              {/* Speed control */}
              <div style={{ position: "relative" }}>
                <button onClick={() => setShowSpeeds(s => !s)}
                  style={{ padding: "5px 10px", borderRadius: 8, background: "rgba(201,168,76,.15)", border: `1px solid ${GOLD}`, color: GOLD, fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "'Cairo',sans-serif" }}>
                  {speed}×
                </button>
                {showSpeeds && (
                  <div style={{ position: "absolute", bottom: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)", background: "#1a1a1a", border: "1px solid #333", borderRadius: 10, overflow: "hidden", minWidth: 80, zIndex: 10 }}>
                    {SPEEDS.map(s => (
                      <button key={s} onClick={() => { setSpeed(s); setShowSpeeds(false); if (mediaRef.current) mediaRef.current.playbackRate = s; }}
                        style={{ display: "block", width: "100%", padding: "8px 14px", background: s === speed ? "rgba(201,168,76,.2)" : "none", border: "none", color: s === speed ? GOLD : "#ccc", fontSize: 12, fontWeight: s === speed ? 800 : 500, cursor: "pointer", textAlign: "center", fontFamily: "'Cairo',sans-serif" }}>
                        {s}×
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Volume */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
                <button onClick={() => { const next = !muted; setMuted(next); if (mediaRef.current) mediaRef.current.muted = next; }}
                  style={{ background: "none", border: "none", color: "#aaa", cursor: "pointer", padding: 0, flexShrink: 0 }}>
                  {muted || volume === 0 ? <VolumeX style={{ width: 16, height: 16 }} /> : <Volume2 style={{ width: 16, height: 16 }} />}
                </button>
                <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume}
                  onChange={changeVolume}
                  style={{ flex: 1, accentColor: GOLD, height: 3, cursor: "pointer" }} />
              </div>

              {/* Minimize — audio keeps playing */}
              <button onClick={onMinimize} title="Play in background"
                style={{ background: "rgba(255,255,255,.08)", border: "none", color: "#aaa", cursor: "pointer", padding: "5px 8px", borderRadius: 8, display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}>
                <Minimize2 style={{ width: 14, height: 14 }} />
              </button>

              {/* Download */}
              <a href={signedUrl} download target="_blank" rel="noreferrer"
                style={{ color: "#555", display: "flex", alignItems: "center" }}>
                <Download style={{ width: 15, height: 15 }} />
              </a>

              {/* Stop & Close */}
              <button onClick={() => { mediaRef.current?.pause(); savePos(recordingId, currentTime); onClose(); }}
                style={{ background: "rgba(255,255,255,.08)", border: "none", color: "#fff", cursor: "pointer", padding: "4px 10px", borderRadius: 8, fontSize: 11 }}>
                Stop
              </button>
            </div>

            {/* Resume hint */}
            {readPos(recordingId) > 5 && currentTime < 3 && (
              <div style={{ marginTop: 10, fontSize: 11, color: "#888", textAlign: "center" }}>
                ▶ Resumed from where you left off
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────
const SubjectRecordings = ({ subjectId }: { subjectId: string }) => {
  const { t } = useLanguage();
  const { user, hasRole } = useAuth();
  const qc         = useQueryClient();
  const [search, setSearch]       = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm]   = useState({ teacher_name: "", duration_seconds: 0 });
  const [deleteId, setDeleteId]   = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [minimized, setMinimized] = useState(false);
  // Live state for mini player
  const [miniTime, setMiniTime]   = useState(0);
  const [miniPlaying, setMiniPlaying] = useState(false);
  const [miniSpeed, setMiniSpeed] = useState(1);
  const miniRef = useRef<{ toggle: () => void } | null>(null);

  const isPrivileged = hasRole("admin") || hasRole("teacher");

  const { data: recordings, isLoading } = useQuery({
    queryKey: ["recordings", subjectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("session_recordings").select("*").eq("subject_id", subjectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: progressMap } = useQuery({
    queryKey: ["recording-progress", subjectId, user?.id],
    enabled: !!user && !!recordings?.length,
    queryFn: async () => {
      const ids = recordings?.map(r => r.id) || [];
      if (!ids.length) return {};
      const { data } = await supabase
        .from("recording_watch_progress" as any).select("*")
        .eq("student_id", user!.id).in("recording_id", ids);
      const map: Record<string, any> = {};
      (data || []).forEach((p: any) => { map[p.recording_id] = p; });
      return map;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, teacher_name, duration_seconds }: any) => {
      const { error } = await supabase.from("session_recordings").update({ teacher_name, duration_seconds }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["recordings", subjectId] }); setEditingId(null); toast({ title: t("Updated", "تم التحديث") }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const rec = recordings?.find(r => r.id === id);
      if (rec?.file_url) await removeStorageFile(rec.file_url).catch(err => console.warn("[SubjectRecordings] storage remove failed:", err?.message));
      const { error } = await supabase.from("session_recordings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["recordings", subjectId] }); setDeleteId(null); toast({ title: t("Deleted", "تم الحذف") }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const filtered = recordings?.filter(r =>
    (r.teacher_name || "").toLowerCase().includes(search.toLowerCase()) ||
    new Date(r.created_at!).toLocaleDateString().includes(search)
  );

  const fmt = (s: number) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m} min`;
  };

  const playingRec = recordings?.find(r => r.id === playingId);

  if (isLoading) return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "16px" }}>
      {[1, 2].map(i => (
        <div key={i} style={{ height: 100, borderRadius: 14, background: "#f0f4f0", animation: "pulse 1.5s infinite" }} />
      ))}
    </div>
  );

  return (
    <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 14, fontFamily: "'Cairo',sans-serif", paddingBottom: minimized ? 80 : 16 }}>
      {/* Search */}
      <div style={{ position: "relative" }}>
        <Search style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 15, height: 15, color: "#7a9e88" }} />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder={t("Search recordings…", "بحث في التسجيلات…")}
          style={{ width: "100%", paddingLeft: 36, paddingRight: 14, paddingTop: 10, paddingBottom: 10, borderRadius: 12, border: `1px solid ${BORDER}`, background: "#fff", fontSize: 13, outline: "none", color: G, fontFamily: "'Cairo',sans-serif", boxSizing: "border-box" as const }} />
      </div>

      {/* Empty state */}
      {!filtered?.length && (
        <div style={{ textAlign: "center", padding: "40px 20px", background: "#fff", borderRadius: 16, border: `1px solid ${BORDER}` }}>
          <Video style={{ width: 40, height: 40, color: "#cbd5e0", margin: "0 auto 12px" }} />
          <div style={{ fontSize: 15, fontWeight: 700, color: G, marginBottom: 4 }}>{t("No recordings yet", "لا توجد تسجيلات بعد")}</div>
          <div style={{ fontSize: 12, color: "#7a9e88" }}>{t("Recordings will appear here after class", "ستظهر التسجيلات هنا بعد الحصة")}</div>
        </div>
      )}

      {/* Recording cards */}
      {filtered?.map(r => {
        const prog      = progressMap?.[r.id];
        const pct       = prog && r.duration_seconds ? Math.min(100, Math.round((prog.progress_seconds / r.duration_seconds) * 100)) : 0;
        const completed = prog?.completed;
        const started   = prog && prog.progress_seconds > 0;
        const isPlaying = playingId === r.id && !minimized;
        const isMinimizedPlaying = playingId === r.id && minimized;
        const dateStr   = new Date(r.created_at!).toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" });
        const savedPos  = readPos(r.id);
        const hasSaved  = savedPos > 5;

        return (
          <div key={r.id} style={{ background: "#fff", borderRadius: 16, border: `1px solid ${BORDER}`, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
            {/* Inline full player */}
            {isPlaying && r.file_url && (
              <InlinePlayer
                recordingId={r.id}
                fileUrl={r.file_url}
                duration={r.duration_seconds || 0}
                title={dateStr}
                onClose={() => { setPlayingId(null); setMinimized(false); }}
                onMinimize={() => setMinimized(true)}
              />
            )}

            {/* Card body */}
            <div style={{ display: "flex", gap: 14, padding: "14px 14px", alignItems: "flex-start" }}>
              {/* Thumbnail */}
              <div style={{ width: 72, height: 56, borderRadius: 10, background: `linear-gradient(135deg,${G},${GM})`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, position: "relative", cursor: "pointer" }}
                onClick={() => { setPlayingId(isPlaying || isMinimizedPlaying ? null : r.id); setMinimized(false); }}>
                {r.thumbnail_url
                  ? <img src={r.thumbnail_url} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 10 }} alt="" />
                  : <Play style={{ width: 22, height: 22, color: "rgba(255,255,255,.8)", marginLeft: 2 }} />}
                {/* Progress bar */}
                {started && (
                  <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, background: "rgba(255,255,255,.2)", borderRadius: "0 0 10px 10px" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: completed ? "#22c55e" : GOLD, borderRadius: 3 }} />
                  </div>
                )}
                {completed && (
                  <div style={{ position: "absolute", top: 4, right: 4, width: 18, height: 18, borderRadius: "50%", background: "#22c55e", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <CheckCircle style={{ width: 12, height: 12, color: "#fff" }} />
                  </div>
                )}
                {isMinimizedPlaying && (
                  <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.5)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: GOLD, animation: "pulse 1s infinite" }} />
                  </div>
                )}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: G, marginBottom: 5, whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" }}>{dateStr}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" as const }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#7a9e88" }}>
                    <User style={{ width: 12, height: 12 }} />{r.teacher_name || "Teacher"}
                  </span>
                  {r.duration_seconds != null && r.duration_seconds > 0 && (
                    <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#7a9e88" }}>
                      <Clock style={{ width: 12, height: 12 }} />{fmt(r.duration_seconds)}
                    </span>
                  )}
                  {hasSaved && !completed && (
                    <span style={{ fontSize: 10, color: GOLD, fontWeight: 700 }}>
                      ↩ {Math.floor(savedPos / 60)}m saved
                    </span>
                  )}
                  {started && !completed && <span style={{ fontSize: 11, fontWeight: 700, color: GOLD }}>{pct}% watched</span>}
                  {completed && <span style={{ fontSize: 11, fontWeight: 700, color: "#22c55e" }}>✓ Completed</span>}
                  {isMinimizedPlaying && <span style={{ fontSize: 11, fontWeight: 700, color: GOLD }}>● Playing in background</span>}
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                <button onClick={() => {
                    if (isMinimizedPlaying) { setMinimized(false); return; }
                    setPlayingId(isPlaying ? null : r.id);
                    setMinimized(false);
                  }}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, background: (isPlaying || isMinimizedPlaying) ? "#f0f4f0" : G, border: "none", color: (isPlaying || isMinimizedPlaying) ? G : "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Cairo',sans-serif" }}>
                  {isMinimizedPlaying ? <ChevronUp style={{ width: 13, height: 13 }} /> : isPlaying ? <Pause style={{ width: 13, height: 13 }} /> : <Play style={{ width: 13, height: 13 }} />}
                  {isMinimizedPlaying ? "Expand" : isPlaying ? "Close" : completed ? t("Rewatch", "إعادة") : hasSaved ? t("Continue", "متابعة") : t("Play", "تشغيل")}
                </button>

                {isPrivileged && (
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => { setEditForm({ teacher_name: r.teacher_name || "", duration_seconds: r.duration_seconds || 0 }); setEditingId(r.id); }}
                      style={{ flex: 1, padding: "6px 0", borderRadius: 8, background: "#f8fafb", border: `1px solid ${BORDER}`, color: "#7a9e88", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Edit style={{ width: 13, height: 13 }} />
                    </button>
                    <button onClick={() => setDeleteId(r.id)}
                      style={{ flex: 1, padding: "6px 0", borderRadius: 8, background: "#fff5f5", border: "1px solid #fca5a5", color: "#EF4444", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Trash2 style={{ width: 13, height: 13 }} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* Floating mini player — audio keeps playing in background */}
      {minimized && playingRec && (
        <MiniPlayer
          title={new Date(playingRec.created_at!).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
          playing={miniPlaying}
          currentTime={miniTime}
          totalDur={playingRec.duration_seconds || 0}
          speed={miniSpeed}
          onToggle={() => {}} // controlled by the mounted InlinePlayer below
          onRestore={() => setMinimized(false)}
          onClose={() => { setPlayingId(null); setMinimized(false); }}
        />
      )}

      {/* Hidden InlinePlayer stays mounted when minimized so audio plays on */}
      {minimized && playingId && playingRec?.file_url && (
        <div style={{ position: "fixed", width: 1, height: 1, opacity: 0, pointerEvents: "none", overflow: "hidden", left: -9999 }}>
          <InlinePlayer
            recordingId={playingId}
            fileUrl={playingRec.file_url}
            duration={playingRec.duration_seconds || 0}
            title={new Date(playingRec.created_at!).toLocaleDateString()}
            onClose={() => { setPlayingId(null); setMinimized(false); }}
            onMinimize={() => {}}
          />
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingId} onOpenChange={v => !v && setEditingId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("Edit Recording", "تعديل التسجيل")}</DialogTitle></DialogHeader>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: G, display: "block", marginBottom: 4 }}>{t("Teacher Name", "اسم المعلم")}</label>
              <input value={editForm.teacher_name} onChange={e => setEditForm({ ...editForm, teacher_name: e.target.value })}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: `1px solid ${BORDER}`, outline: "none", fontSize: 14, color: G, boxSizing: "border-box" as const }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: G, display: "block", marginBottom: 4 }}>{t("Duration (seconds)", "المدة (ثواني)")}</label>
              <input type="number" value={editForm.duration_seconds} onChange={e => setEditForm({ ...editForm, duration_seconds: parseInt(e.target.value) || 0 })}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: `1px solid ${BORDER}`, outline: "none", fontSize: 14, color: G, boxSizing: "border-box" as const }} />
            </div>
            <button onClick={() => editingId && updateMutation.mutate({ id: editingId, ...editForm })} disabled={updateMutation.isPending}
              style={{ width: "100%", padding: "11px 0", borderRadius: 12, background: G, border: "none", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "'Cairo',sans-serif" }}>
              <Save style={{ width: 15, height: 15 }} />
              {updateMutation.isPending ? "Saving…" : t("Save Changes", "حفظ التغييرات")}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Delete Recording?", "حذف التسجيل؟")}</AlertDialogTitle>
            <AlertDialogDescription>{t("This cannot be undone.", "لا يمكن التراجع عن هذا.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancel", "إلغاء")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)} className="bg-destructive text-destructive-foreground">
              {deleteMutation.isPending ? "Deleting…" : t("Delete", "حذف")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
    </div>
  );
};

export default SubjectRecordings;
