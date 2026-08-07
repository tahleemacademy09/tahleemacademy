import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { Video, VideoOff, Mic, MicOff, Settings, ChevronDown, ChevronUp, Users } from "lucide-react";

interface ClassLobbyProps {
  subject: any;
  session: any;
  onStartClass: (settings: any, media?: { micOn: boolean; cameraOn: boolean }) => void;
  onJoinClass:  (media?: { micOn: boolean; cameraOn: boolean }) => void;
  onBack: () => void;
  isLive: boolean;
}

const TEAL  = "#0a7c68";
const DARK  = "#0a1a12";
const GOLD  = "#c9a84c";

const ClassLobby = ({ subject, session, onStartClass, onJoinClass, onBack, isLive }: ClassLobbyProps) => {
  const { user, hasRole } = useAuth();
  const { t } = useLanguage();
  const isPrivileged = hasRole("admin") || hasRole("teacher");

  const videoRef  = useRef<HTMLVideoElement>(null);
  const [cameraOn, setCameraOn]   = useState(false);
  const [micOn,    setMicOn]      = useState(false);
  const [stream,   setStream]     = useState<MediaStream | null>(null);
  const [micLevel, setMicLevel]   = useState(0);
  const [devices,  setDevices]    = useState<{ cameras: MediaDeviceInfo[]; mics: MediaDeviceInfo[] }>({ cameras: [], mics: [] });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [waitingStudents, setWaitingStudents] = useState<any[]>([]);
  // FIX BUG 9: State to surface permission denial to the user
  const [permError, setPermError] = useState<string | null>(null);

  const [waitingRoom,      setWaitingRoom]      = useState(false);
  const [muteOnEntry,      setMuteOnEntry]      = useState(true);
  const [chatEnabled,      setChatEnabled]      = useState(true);
  const [handRaiseEnabled, setHandRaiseEnabled] = useState(true);

  useEffect(() => {
    // FIX BUG 3: Track the stream in a local variable so it can be stopped
    // on unexpected unmount (e.g. nav away, error) — prevents camera LED staying on.
    let localStream: MediaStream | null = null;

    // BUG FIX: this rAF loop had no cancellation — every time the lobby
    // unmounted (Start Class, Join Class, or Back), the tick() loop kept
    // scheduling itself forever, calling setMicLevel on a stale/unmounted
    // component indefinitely. Over multiple lobby visits in one session,
    // these accumulate as orphaned loops silently burning CPU/battery.
    let rafId: number | null = null;
    let cancelled = false;

    const init = async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        if (cancelled) { s.getTracks().forEach(t => t.stop()); return; }
        localStream = s;
        setStream(s);
        s.getVideoTracks().forEach(t => { t.enabled = false; });
        s.getAudioTracks().forEach(t => { t.enabled = false; });
        if (videoRef.current) videoRef.current.srcObject = s;
        const devs = await navigator.mediaDevices.enumerateDevices();
        setDevices({
          cameras: devs.filter(d => d.kind === "videoinput"),
          mics:    devs.filter(d => d.kind === "audioinput"),
        });
        try {
          const ctx = new ((window as any).AudioContext || (window as any).webkitAudioContext)();
          await ctx.resume();
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          ctx.createMediaStreamSource(s).connect(analyser);
          const data = new Uint8Array(analyser.frequencyBinCount);
          const tick = () => {
            if (cancelled) return; // stop scheduling once unmounted
            analyser.getByteFrequencyData(data);
            setMicLevel(data.reduce((a, b) => a + b, 0) / data.length / 128);
            rafId = requestAnimationFrame(tick);
          };
          tick();
        } catch {}
      } catch (err: any) {
        // FIX BUG 9: Surface permission denial instead of silently swallowing it
        if (err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError") {
          setPermError("Camera/microphone access was denied. Please allow permissions in your browser settings and reload.");
        }
      }
    };
    init();

    // FIX BUG 3: Cleanup — stop all tracks if user navigates away without clicking Start/Join.
    // Without this, the camera LED stays on and the mic is held open indefinitely.
    return () => {
      cancelled = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      localStream?.getTracks().forEach(t => t.stop());
    };
  }, []);

  useEffect(() => {
    if (!stream) return;
    stream.getVideoTracks().forEach(t => { t.enabled = cameraOn; });
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [cameraOn, stream]);

  useEffect(() => {
    if (!stream) return;
    stream.getAudioTracks().forEach(t => { t.enabled = micOn; });
  }, [micOn, stream]);

  useEffect(() => {
    if (!session?.id) return;
    const load = async () => {
      const { data } = await supabase.from("class_participants")
        .select("*, profiles:student_id(full_name)")
        .eq("session_id", session.id).is("left_at", null);
      setWaitingStudents(data || []);
    };
    load();
    const ch = supabase.channel(`lobby-${session.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "class_participants", filter: `session_id=eq.${session.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [session?.id]);

  const handleStart = () => {
    stream?.getTracks().forEach(t => t.stop());
    onStartClass({
      waiting_room_enabled: waitingRoom, chat_enabled: chatEnabled,
      hand_raise_enabled: handRaiseEnabled, class_settings: { mute_on_entry: muteOnEntry },
    }, { micOn, cameraOn });
  };

  const handleJoin = () => {
    stream?.getTracks().forEach(t => t.stop());
    onJoinClass({ micOn, cameraOn });
  };

  const Toggle = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
    <button onClick={onChange} style={{
      width: 44, height: 26, borderRadius: 13, border: "none", cursor: "pointer",
      background: checked ? TEAL : "rgba(255,255,255,.15)", position: "relative", transition: ".25s",
      flexShrink: 0,
    }}>
      <div style={{
        width: 20, height: 20, borderRadius: "50%", background: "#fff",
        position: "absolute", top: 3, left: checked ? 21 : 3, transition: ".25s",
        boxShadow: "0 1px 4px rgba(0,0,0,.35)",
      }} />
    </button>
  );

  return (
    <div style={{
      height: "100dvh", display: "flex", flexDirection: "column", overflow: "hidden",
      background: "linear-gradient(160deg, #060f09 0%, #0f2a1a 50%, #0a1e12 100%)",
      fontFamily: "'Cairo', sans-serif",
    }}>
      {/* ── Header ── */}
      <div style={{ textAlign: "center", padding: "18px 20px 6px", flexShrink: 0 }}>
        <div style={{ fontFamily: "'Amiri', serif", fontSize: 17, color: GOLD, marginBottom: 5 }}>
          بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ
        </div>
        <h1 style={{ fontSize: 21, fontWeight: 800, color: "#fff", margin: "0 0 3px" }}>{subject.title}</h1>
        {subject.title_ar && (
          <p style={{ fontSize: 13, color: "rgba(255,255,255,.45)", fontFamily: "'Amiri', serif", direction: "rtl", margin: 0 }}>{subject.title_ar}</p>
        )}
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px 8px", WebkitOverflowScrolling: "touch" as any }}>

        {/* FIX BUG 9: Permission error banner */}
        {permError && (
          <div style={{ background: "rgba(239,68,68,.12)", border: "1px solid rgba(239,68,68,.35)", borderRadius: 12, padding: "10px 14px", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>⚠️</span>
            <p style={{ fontSize: 13, color: "#fca5a5", margin: 0, lineHeight: 1.5 }}>{permError}</p>
          </div>
        )}

        {/* Camera Preview */}
        <div style={{
          borderRadius: 18, overflow: "hidden",
          border: "1.5px solid rgba(201,168,76,.2)",
          background: "#000",
          marginBottom: 14,
          boxShadow: "0 12px 48px rgba(0,0,0,.6)",
        }}>
          <div style={{ position: "relative", paddingTop: "56.25%" }}>
            {/* Mirrored, matching the live classroom tile's local-preview
                fix — this is always your OWN camera here in the lobby, so
                it should feel like a mirror (raise your right hand, it
                shows on the right side of your own screen), exactly like
                the self-view you'll see once you join. Purely a local CSS
                flip — has no effect on what gets published once you're
                actually in the room. */}
            <video ref={videoRef} autoPlay playsInline muted style={{
              position: "absolute", inset: 0, width: "100%", height: "100%",
              objectFit: "cover", display: cameraOn ? "block" : "none", transform: "scaleX(-1)",
            }} />
            {!cameraOn && (
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, background: "#0a1a12" }}>
                <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(255,255,255,.07)", display: "flex", alignItems: "center", justifyContent: "center", border: "1.5px solid rgba(255,255,255,.1)" }}>
                  <VideoOff style={{ width: 24, height: 24, color: "rgba(255,255,255,.4)" }} />
                </div>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,.3)" }}>Camera is off</span>
              </div>
            )}
            {micOn && (
              <div style={{ position: "absolute", bottom: 10, left: 12, display: "flex", alignItems: "flex-end", gap: 2, height: 14 }}>
                {[.2,.4,.6,.8,1].map((threshold, i) => (
                  <div key={i} style={{
                    width: 3, borderRadius: 2, height: `${(i + 1) * 3 + 2}px`,
                    background: micLevel >= threshold ? "#22c55e" : "rgba(255,255,255,.2)",
                    transition: "background .08s",
                  }} />
                ))}
              </div>
            )}
          </div>

          {/* Mic / Cam toggles */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, padding: "12px 16px", background: "rgba(0,0,0,.4)" }}>
            <button onClick={() => setMicOn(v => !v)} style={{
              width: 50, height: 50, borderRadius: "50%", border: "none", cursor: "pointer",
              background: micOn ? "rgba(34,197,94,.15)" : "#ea4335",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: micOn ? "0 0 0 2px rgba(34,197,94,.35)" : "0 3px 14px rgba(234,67,53,.4)",
              transition: "all .2s",
            }}>
              {micOn ? <Mic style={{ width: 20, height: 20, color: "#22c55e" }} /> : <MicOff style={{ width: 20, height: 20, color: "#fff" }} />}
            </button>
            <button onClick={() => setCameraOn(v => !v)} style={{
              width: 50, height: 50, borderRadius: "50%", border: "none", cursor: "pointer",
              background: cameraOn ? "rgba(34,197,94,.15)" : "#ea4335",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: cameraOn ? "0 0 0 2px rgba(34,197,94,.35)" : "0 3px 14px rgba(234,67,53,.4)",
              transition: "all .2s",
            }}>
              {cameraOn ? <Video style={{ width: 20, height: 20, color: "#22c55e" }} /> : <VideoOff style={{ width: 20, height: 20, color: "#fff" }} />}
            </button>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,.3)", lineHeight: 1.4 }}>
              📷 {devices.cameras.length}<br />🎤 {devices.mics.length}
            </span>
          </div>
        </div>

        {/* Students: "already inside" pill */}
        {!isPrivileged && waitingStudents.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(201,168,76,.09)", borderRadius: 12, padding: "10px 14px", border: "1px solid rgba(201,168,76,.18)", marginBottom: 12 }}>
            <Users style={{ width: 14, height: 14, color: GOLD, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: "rgba(255,255,255,.65)" }}>{waitingStudents.length} participant{waitingStudents.length !== 1 ? "s" : ""} already inside</span>
          </div>
        )}

        {/* Student: live status */}
        {!isPrivileged && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: isLive ? "rgba(34,197,94,.1)" : "rgba(255,255,255,.04)", borderRadius: 12, padding: "10px 14px", border: `1px solid ${isLive ? "rgba(34,197,94,.25)" : "rgba(255,255,255,.07)"}`, marginBottom: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: isLive ? "#22c55e" : "rgba(255,255,255,.25)", flexShrink: 0, animation: isLive ? "pip-pulse 1.8s ease-in-out infinite" : "none" }} />
            <span style={{ fontSize: 13, color: isLive ? "#86efac" : "rgba(255,255,255,.5)" }}>
              {isLive ? "Class is live — join now!" : "Class hasn't started yet — you can join early"}
            </span>
          </div>
        )}

        {/* Teacher: Settings accordion */}
        {isPrivileged && (
          <div style={{ borderRadius: 16, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)", overflow: "hidden", marginBottom: 10 }}>
            <button onClick={() => setSettingsOpen(v => !v)} style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10,
              padding: "13px 16px", background: "none", border: "none", cursor: "pointer",
            }}>
              <Settings style={{ width: 15, height: 15, color: GOLD, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: "#fff", textAlign: "left" as const }}>Class Settings</span>
              {settingsOpen ? <ChevronUp style={{ width: 15, height: 15, color: "rgba(255,255,255,.4)" }} /> : <ChevronDown style={{ width: 15, height: 15, color: "rgba(255,255,255,.4)" }} />}
            </button>
            {settingsOpen && (
              <div style={{ padding: "0 16px 14px", borderTop: "1px solid rgba(255,255,255,.06)" }}>
                {[
                  { label: "Waiting Room",  checked: waitingRoom,      onChange: () => setWaitingRoom(v => !v) },
                  { label: "Mute on entry", checked: muteOnEntry,      onChange: () => setMuteOnEntry(v => !v) },
                  { label: "Enable chat",   checked: chatEnabled,      onChange: () => setChatEnabled(v => !v) },
                  { label: "Hand raising",  checked: handRaiseEnabled, onChange: () => setHandRaiseEnabled(v => !v) },
                ].map((item, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 0", borderBottom: i < 3 ? "1px solid rgba(255,255,255,.05)" : "none" }}>
                    <span style={{ fontSize: 13, color: "rgba(255,255,255,.7)" }}>{item.label}</span>
                    <Toggle checked={item.checked} onChange={item.onChange} />
                  </div>
                ))}
                {waitingStudents.length > 0 && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,.06)" }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.35)", letterSpacing: .6, textTransform: "uppercase" as const, marginBottom: 8 }}>In waiting room</p>
                    {waitingStudents.map(s => (
                      <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <div style={{ width: 26, height: 26, borderRadius: "50%", background: TEAL, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff" }}>
                          {((s as any).profiles?.full_name || "S")[0].toUpperCase()}
                        </div>
                        <span style={{ fontSize: 13, color: "rgba(255,255,255,.65)" }}>{(s as any).profiles?.full_name || "Student"}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── CTA ── */}
      <div style={{
        flexShrink: 0, padding: "12px 16px",
        paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
        borderTop: "1px solid rgba(255,255,255,.06)",
        background: "rgba(0,0,0,.25)",
        display: "flex", flexDirection: "column", gap: 8,
      }}>
        <button
          onClick={isPrivileged ? handleStart : handleJoin}
          style={{
            width: "100%", height: 52, borderRadius: 14, border: "none", cursor: "pointer",
            background: `linear-gradient(135deg, ${GOLD}, #e8c05a)`,
            color: DARK, fontSize: 15, fontWeight: 800, letterSpacing: .3,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            boxShadow: "0 6px 24px rgba(201,168,76,.4)",
          }}
        >
          <Video style={{ width: 20, height: 20 }} />
          {isPrivileged ? t("START LIVE CLASS", "\u0627\u0628\u062F\u0623 \u0627\u0644\u062F\u0631\u0633 \u0627\u0644\u0645\u0628\u0627\u0634\u0631") : isLive ? t("JOIN CLASS", "\u0627\u0646\u0636\u0645 \u0644\u0644\u0641\u0635\u0644") : t("JOIN EARLY", "\u0627\u0646\u0636\u0645 \u0645\u0628\u0643\u0631\u0627")}
        </button>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,.3)", fontSize: 13, padding: "2px 0" }}>
          \u2190 {t("Back", "\u0631\u062C\u0648\u0639")}
        </button>
      </div>
    </div>
  );
};

export default ClassLobby;
