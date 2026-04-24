/*
  MusabaqahHub.tsx — Tahleem Academy
  ════════════════════════════════════════════════════════════════════
  Landing page for Al-Musābaqah section.
  ENHANCED: Dramatic cinematic design + Admin room code generation
════════════════════════════════════════════════════════════════════
*/

import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Trophy, Mic, Zap, Users, Clock, Star,
  Crown, Plus, Copy, RefreshCw, BookOpen,
  Shield, Eye, Sparkles, ChevronRight,
} from "lucide-react";

const GOLD  = "#c9a84c";
const GOLDD = "#a8843a";
const G     = "#071a10";

/* ── Injected styles ─────────────────────────────────────────── */
const HUB_STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@400;700;900&family=Cinzel:wght@400;600;700&family=Amiri:ital,wght@0,400;0,700;1,400&family=Cairo:wght@400;600;700;900&display=swap');
*{box-sizing:border-box;}

@keyframes hubFadeUp   { from{opacity:0;transform:translateY(22px)} to{opacity:1;transform:translateY(0)} }
@keyframes hubPulse    { 0%,100%{opacity:.6;transform:scale(1)} 50%{opacity:1;transform:scale(1.04)} }
@keyframes hubGlow     { 0%,100%{filter:drop-shadow(0 0 12px rgba(201,168,76,.3))} 50%{filter:drop-shadow(0 0 30px rgba(201,168,76,.7))} }
@keyframes hubSpin     { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
@keyframes hubFloat    { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
@keyframes hubTwinkle  { 0%,100%{opacity:.15;transform:scale(1)} 50%{opacity:1;transform:scale(1.5)} }
@keyframes hubShimmer  { 0%{background-position:-200% center} 100%{background-position:200% center} }
@keyframes hubSlideIn  { from{opacity:0;transform:translateX(-12px)} to{opacity:1;transform:translateX(0)} }
@keyframes hubCard     { from{opacity:0;transform:translateY(16px) scale(.97)} to{opacity:1;transform:translateY(0) scale(1)} }
@keyframes orbDrift    { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(30px,-20px) scale(1.05)} 66%{transform:translate(-20px,15px) scale(.96)} }
@keyframes codeReveal  { from{opacity:0;transform:scale(.85) rotateY(8deg)} to{opacity:1;transform:scale(1) rotateY(0)} }

.hub-fade-up { animation: hubFadeUp .55s cubic-bezier(.22,1,.36,1) both; }
.hub-card    { animation: hubCard   .5s  cubic-bezier(.22,1,.36,1) both; }
.hub-slide   { animation: hubSlideIn .4s cubic-bezier(.22,1,.36,1) both; }

.hub-gold-btn {
  background: linear-gradient(135deg,#7B5B10,#c9a84c,#e8c96a,#c9a84c,#7B5B10);
  background-size: 300%;
  color: #071a10;
  font-family: 'Cinzel', serif;
  font-weight: 700;
  border: none;
  cursor: pointer;
  letter-spacing: .07em;
  transition: all .35s;
}
.hub-gold-btn:hover {
  background-position: 100% 50%;
  transform: translateY(-2px);
  box-shadow: 0 10px 32px rgba(201,168,76,.5);
}
.hub-gold-btn:active { transform: scale(.97); }
.hub-gold-btn:disabled { opacity: .35; cursor: not-allowed; transform: none; }

.hub-glass {
  background: rgba(11,31,18,.6);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  border: 1px solid rgba(201,168,76,.18);
}

.hub-card-hover {
  transition: transform .25s cubic-bezier(.22,1,.36,1), box-shadow .25s;
  cursor: pointer;
}
.hub-card-hover:hover {
  transform: translateY(-5px) scale(1.015);
}
.hub-card-hover:active { transform: scale(.98); }

input.hub-input {
  background: rgba(255,255,255,.04);
  border: 1.5px solid rgba(201,168,76,.35);
  border-radius: 12px;
  color: #e8c96a;
  font-family: 'Cinzel', serif;
  letter-spacing: .2em;
  transition: border-color .25s, box-shadow .25s;
  outline: none;
}
input.hub-input:focus {
  border-color: rgba(201,168,76,.75);
  box-shadow: 0 0 0 3px rgba(201,168,76,.12);
}
input.hub-input::placeholder { color: rgba(201,168,76,.3); letter-spacing:.15em; }

::-webkit-scrollbar { width:4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(201,168,76,.3); border-radius:2px; }
`;

/* ── Starfield ───────────────────────────────────────────────── */
const Starfield = () => {
  const stars = Array.from({ length: 70 }, (_, i) => ({
    x: Math.random() * 100,
    y: Math.random() * 100,
    s: Math.random() * 2.2 + 0.4,
    d: (Math.random() * 3 + 2).toFixed(1),
    dl: (Math.random() * 5).toFixed(1),
  }));
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {stars.map((st, i) => (
        <div key={i} style={{
          position: "absolute", left: `${st.x}%`, top: `${st.y}%`,
          width: st.s, height: st.s, borderRadius: "50%",
          background: "#E8C96A",
          animation: `hubTwinkle ${st.d}s ease-in-out infinite ${st.dl}s`,
        }} />
      ))}
    </div>
  );
};

/* ── Ambient orbs ────────────────────────────────────────────── */
const Orbs = () => (
  <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
    <div style={{
      position: "absolute", width: 500, height: 500,
      top: "-15%", left: "-15%",
      background: "radial-gradient(circle, rgba(201,168,76,.08) 0%, transparent 70%)",
      animation: "orbDrift 18s ease-in-out infinite",
    }} />
    <div style={{
      position: "absolute", width: 400, height: 400,
      bottom: "5%", right: "-10%",
      background: "radial-gradient(circle, rgba(34,197,94,.06) 0%, transparent 70%)",
      animation: "orbDrift 22s ease-in-out infinite 4s",
    }} />
    <div style={{
      position: "absolute", width: 300, height: 300,
      top: "40%", left: "50%",
      background: "radial-gradient(circle, rgba(201,168,76,.05) 0%, transparent 70%)",
      animation: "orbDrift 16s ease-in-out infinite 8s",
    }} />
  </div>
);

/* ── Islamic geometric pattern ───────────────────────────────── */
const GeoPat = () => (
  <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: .05, pointerEvents: "none" }}
    xmlns="http://www.w3.org/2000/svg">
    <defs>
      <pattern id="hub-geo" x="0" y="0" width="120" height="120" patternUnits="userSpaceOnUse">
        <polygon points="60,6 110,30 110,90 60,114 10,90 10,30"
          fill="none" stroke={GOLD} strokeWidth=".7" />
        <polygon points="60,22 94,40 94,80 60,98 26,80 26,40"
          fill="none" stroke={GOLD} strokeWidth=".4" />
        <circle cx="60" cy="60" r="5" fill="none" stroke={GOLD} strokeWidth=".5" />
        <line x1="60" y1="6" x2="60" y2="114" stroke={GOLD} strokeWidth=".25" opacity=".6" />
        <line x1="10" y1="30" x2="110" y2="90" stroke={GOLD} strokeWidth=".25" opacity=".6" />
        <line x1="110" y1="30" x2="10" y2="90" stroke={GOLD} strokeWidth=".25" opacity=".6" />
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#hub-geo)" />
  </svg>
);

/* ── Decorative divider ──────────────────────────────────────── */
const Divider = ({ style }: { style?: React.CSSProperties }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, ...style }}>
    <div style={{ flex: 1, height: 1, background: "linear-gradient(to right, transparent, rgba(201,168,76,.25))" }} />
    <Star size={8} color={GOLD} fill={GOLD} />
    <Star size={11} color={GOLD} fill={GOLD} />
    <Star size={8} color={GOLD} fill={GOLD} />
    <div style={{ flex: 1, height: 1, background: "linear-gradient(to left, transparent, rgba(201,168,76,.25))" }} />
  </div>
);

/* ── Generate a random room code ─────────────────────────────── */
const genCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
};

/* ══════════════════════════════════════════════════════════════
   ADMIN CODE GENERATOR PANEL
══════════════════════════════════════════════════════════════ */
const AdminCodePanel = () => {
  const { toast } = useToast();
  const [rooms, setRooms]       = useState<any[]>([]);
  const [loading, setLoading]   = useState(false);
  const [creating, setCreating] = useState(false);
  const [title, setTitle]       = useState("");
  const [desc, setDesc]         = useState("");
  const [showForm, setShowForm] = useState(false);
  const [generated, setGenerated] = useState<string | null>(null);

  const loadRooms = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("musabaqah_rooms")
      .select("id, code, title, status, created_at")
      .order("created_at", { ascending: false })
      .limit(5);
    setRooms(data || []);
    setLoading(false);
  };

  useEffect(() => { loadRooms(); }, []);

  const createRoom = async () => {
    if (!title.trim()) return;
    setCreating(true);
    const code = genCode();
    const { data, error } = await supabase
      .from("musabaqah_rooms")
      .insert({ code, title: title.trim(), description: desc.trim() || null, status: "waiting" })
      .select()
      .single();
    setCreating(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    setGenerated(data.code);
    setTitle(""); setDesc(""); setShowForm(false);
    toast({ title: "Room Created", description: `Code: ${data.code}` });
    loadRooms();
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({ title: "Copied!", description: `Code ${code} copied to clipboard` });
  };

  const statusColor = (s: string) =>
    s === "active" ? "#22c55e" : s === "ended" ? "#6b7280" : GOLD;

  return (
    <div className="hub-glass" style={{
      borderRadius: 20, padding: "22px 20px",
      border: "1px solid rgba(201,168,76,.25)",
      boxShadow: "0 8px 40px rgba(0,0,0,.5), inset 0 1px 0 rgba(201,168,76,.1)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: "linear-gradient(135deg, rgba(201,168,76,.25), rgba(201,168,76,.08))",
            border: "1px solid rgba(201,168,76,.35)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Shield size={17} color={GOLD} />
          </div>
          <div>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: 13, color: "#e8c96a", fontWeight: 700 }}>
              Admin Control
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,.35)", marginTop: 1 }}>
              Room Management
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={loadRooms} style={{
            background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)",
            borderRadius: 8, padding: "6px 8px", cursor: "pointer", color: "rgba(255,255,255,.5)",
          }}>
            <RefreshCw size={13} style={{ animation: loading ? "hubSpin 1s linear infinite" : "none" }} />
          </button>
          <button onClick={() => setShowForm(f => !f)} style={{
            background: showForm ? "rgba(201,168,76,.2)" : "rgba(255,255,255,.05)",
            border: `1px solid ${showForm ? "rgba(201,168,76,.45)" : "rgba(255,255,255,.1)"}`,
            borderRadius: 8, padding: "6px 12px", cursor: "pointer",
            color: showForm ? GOLD : "rgba(255,255,255,.5)",
            display: "flex", alignItems: "center", gap: 5,
            fontFamily: "'Cinzel', serif", fontSize: 11, fontWeight: 700,
          }}>
            <Plus size={12} />
            New Room
          </button>
        </div>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="hub-slide" style={{
          background: "rgba(0,0,0,.3)", borderRadius: 14,
          border: "1px solid rgba(201,168,76,.2)",
          padding: "16px", marginBottom: 16,
        }}>
          <div style={{ fontSize: 10, color: GOLD, fontFamily: "'Cinzel', serif", letterSpacing: ".15em", marginBottom: 12 }}>
            CREATE NEW COMPETITION ROOM
          </div>
          <input
            className="hub-input"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Room Title (e.g. Juz' Amma Round 1)"
            style={{ width: "100%", padding: "11px 14px", marginBottom: 10, fontSize: 13, letterSpacing: ".02em" }}
          />
          <input
            className="hub-input"
            value={desc}
            onChange={e => setDesc(e.target.value)}
            placeholder="Description (optional)"
            style={{ width: "100%", padding: "10px 14px", marginBottom: 14, fontSize: 12, letterSpacing: ".02em" }}
          />
          <button
            className="hub-gold-btn"
            onClick={createRoom}
            disabled={creating || !title.trim()}
            style={{ width: "100%", padding: "12px 0", borderRadius: 10, fontSize: 13 }}
          >
            {creating ? "Generating…" : "✦ Generate Room Code"}
          </button>
        </div>
      )}

      {/* Generated code spotlight */}
      {generated && (
        <div className="hub-slide" style={{
          background: "linear-gradient(135deg, rgba(201,168,76,.12), rgba(201,168,76,.05))",
          border: "1.5px solid rgba(201,168,76,.4)",
          borderRadius: 14, padding: "16px", marginBottom: 16, textAlign: "center",
          animation: "codeReveal .4s cubic-bezier(.22,1,.36,1)",
        }}>
          <div style={{ fontSize: 10, color: "rgba(201,168,76,.7)", letterSpacing: ".2em", marginBottom: 8, fontFamily: "'Cinzel', serif" }}>
            NEW ROOM GENERATED
          </div>
          <div style={{
            fontFamily: "'Cinzel Decorative', serif",
            fontSize: 32, color: "#e8c96a", letterSpacing: ".3em",
            textShadow: "0 0 30px rgba(201,168,76,.5)",
            marginBottom: 12,
          }}>
            {generated}
          </div>
          <button onClick={() => copyCode(generated)} style={{
            background: "rgba(201,168,76,.15)", border: "1px solid rgba(201,168,76,.35)",
            borderRadius: 8, padding: "7px 20px", cursor: "pointer",
            color: GOLD, fontSize: 11, fontFamily: "'Cinzel', serif",
            display: "inline-flex", alignItems: "center", gap: 6,
          }}>
            <Copy size={12} /> Copy Code
          </button>
        </div>
      )}

      {/* Recent rooms */}
      <div style={{ fontSize: 10, color: "rgba(255,255,255,.3)", letterSpacing: ".15em", marginBottom: 10, fontFamily: "'Cinzel', serif" }}>
        RECENT ROOMS
      </div>
      {rooms.length === 0 && !loading && (
        <div style={{ textAlign: "center", padding: "16px 0", color: "rgba(255,255,255,.2)", fontSize: 12 }}>
          No rooms yet — create one above
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rooms.map((room, i) => (
          <div key={room.id} className="hub-slide" style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "11px 13px", borderRadius: 11,
            background: "rgba(255,255,255,.03)",
            border: "1px solid rgba(255,255,255,.07)",
            animationDelay: `${i * 0.06}s`,
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%",
              background: statusColor(room.status),
              flexShrink: 0,
              boxShadow: `0 0 8px ${statusColor(room.status)}`,
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,.75)", fontFamily: "'Cairo', sans-serif", fontWeight: 600, truncate: true }}
                title={room.title}>
                {room.title}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                <span style={{
                  fontFamily: "'Cinzel', serif", fontSize: 13, color: GOLD,
                  letterSpacing: ".15em", fontWeight: 700,
                }}>{room.code}</span>
                <span style={{
                  fontSize: 9, padding: "2px 7px", borderRadius: 20,
                  background: `${statusColor(room.status)}18`,
                  color: statusColor(room.status),
                  border: `1px solid ${statusColor(room.status)}40`,
                  fontFamily: "'Cinzel', serif", textTransform: "uppercase",
                }}>{room.status}</span>
              </div>
            </div>
            <button onClick={() => copyCode(room.code)} style={{
              background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.09)",
              borderRadius: 7, padding: "6px 8px", cursor: "pointer",
              color: "rgba(255,255,255,.4)",
            }}>
              <Copy size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════════ */
const MusabaqahHub = () => {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin") || hasRole("teacher");

  const options = [
    {
      id: "quiz",
      icon: <Trophy size={28} color={GOLD} />,
      emoji: "🏆",
      title: "Al-Musābaqah Quiz",
      titleAr: "مسابقة الأسئلة",
      subtitle: "Live Islamic Quiz Arena",
      desc: "Real-time MCQ — compete on Tajweed, Quran, Arabic & Fiqh. Kahoot-style with live leaderboard.",
      chips: ["⚡ MCQ", "👥 Multiplayer", "⏱ Per-question timer"],
      route: "/live-quiz",
      accent: GOLD,
      bg: "linear-gradient(135deg, rgba(201,168,76,.1) 0%, rgba(201,168,76,.03) 100%)",
      border: "rgba(201,168,76,.3)",
      glow: "rgba(201,168,76,.15)",
      badge: isAdmin ? "Host or Play" : "Join a Room",
    },
    {
      id: "recitation",
      icon: <BookOpen size={28} color="#4ADE80" />,
      emoji: "📖",
      title: "Qur'an Recitation",
      titleAr: "مسابقة التلاوة",
      subtitle: "International Competition",
      desc: "Full recitation competition — AI + judge scoring, verse reveal, bell system, stage-by-stage.",
      chips: ["🎙 AI scoring", "📋 Queue system", "⭐ Judge override"],
      route: "/musabaqah/recitation",
      accent: "#4ADE80",
      bg: "linear-gradient(135deg, rgba(74,222,128,.08) 0%, rgba(74,222,128,.02) 100%)",
      border: "rgba(74,222,128,.25)",
      glow: "rgba(74,222,128,.12)",
      badge: isAdmin ? "Create & Judge" : "Join Queue",
    },
  ];

  return (
    <>
      <style>{HUB_STYLES}</style>
      <div style={{
        minHeight: "100%",
        background: `
          radial-gradient(ellipse at 20% 10%, rgba(11,61,30,.9) 0%, transparent 50%),
          radial-gradient(ellipse at 80% 90%, rgba(4,20,10,.8) 0%, transparent 50%),
          linear-gradient(170deg, #050f07 0%, #0a1f0f 40%, #060e08 100%)
        `,
        position: "relative", overflow: "hidden",
        fontFamily: "'Cairo', sans-serif",
        paddingBottom: 48,
      }}>
        <Starfield />
        <GeoPat />
        <Orbs />

        {/* ── Hero top strip ─────────────────────────────────── */}
        <div style={{
          position: "relative", zIndex: 2,
          padding: "36px 20px 0",
          maxWidth: 560, margin: "0 auto",
          textAlign: "center",
        }}>
          {/* Crown badge */}
          <div className="hub-fade-up" style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            padding: "5px 16px", borderRadius: 30,
            background: "rgba(201,168,76,.1)",
            border: "1px solid rgba(201,168,76,.28)",
            marginBottom: 18,
          }}>
            <Sparkles size={11} color={GOLD} />
            <span style={{ fontFamily: "'Cinzel', serif", fontSize: 10, color: GOLD, letterSpacing: ".18em" }}>
              TAHLEEM ACADEMY
            </span>
            <Sparkles size={11} color={GOLD} />
          </div>

          {/* Arabic title */}
          <div className="hub-fade-up" style={{ animationDelay: ".05s" }}>
            <div style={{
              fontFamily: "'Amiri', serif",
              fontSize: "clamp(22px,5vw,34px)",
              color: "rgba(201,168,76,.8)",
              letterSpacing: 3, marginBottom: 6,
              direction: "rtl",
              textShadow: "0 0 40px rgba(201,168,76,.2)",
              animation: "hubGlow 4s ease-in-out infinite",
            }}>
              المسابقة الإسلامية
            </div>
          </div>

          {/* English title */}
          <div className="hub-fade-up" style={{ animationDelay: ".1s" }}>
            <h1 style={{
              fontFamily: "'Cinzel Decorative', serif",
              fontSize: "clamp(20px,4.5vw,30px)",
              color: "#fff",
              margin: "0 0 6px",
              letterSpacing: ".04em",
              lineHeight: 1.2,
              textShadow: "0 2px 20px rgba(0,0,0,.5)",
            }}>
              Al-Musābaqah
            </h1>
            <p style={{
              fontSize: 11, color: "rgba(255,255,255,.35)",
              letterSpacing: ".25em", textTransform: "uppercase",
              margin: "0 0 28px",
              fontFamily: "'Cairo', sans-serif",
            }}>
              Islamic Competition Arena
            </p>
          </div>

          <Divider style={{ marginBottom: 32, animationDelay: ".15s" }} />
        </div>

        {/* ── Option cards ───────────────────────────────────── */}
        <div style={{
          position: "relative", zIndex: 2,
          maxWidth: 560, margin: "0 auto",
          padding: "0 18px",
          display: "flex", flexDirection: "column", gap: 16,
        }}>
          {options.map((opt, idx) => (
            <div
              key={opt.id}
              className="hub-card hub-card-hover"
              onClick={() => navigate(opt.route)}
              style={{
                background: opt.bg,
                border: `1.5px solid ${opt.border}`,
                borderRadius: 22,
                padding: "22px 20px",
                position: "relative", overflow: "hidden",
                boxShadow: `0 8px 40px ${opt.glow}, 0 2px 0 rgba(255,255,255,.04) inset`,
                animationDelay: `${0.18 + idx * 0.1}s`,
              }}
            >
              {/* Corner glow */}
              <div style={{
                position: "absolute", top: -50, right: -50,
                width: 160, height: 160, borderRadius: "50%",
                background: opt.glow, filter: "blur(40px)",
                pointerEvents: "none",
              }} />

              {/* Top row */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{
                  width: 56, height: 56, borderRadius: 16,
                  background: "rgba(255,255,255,.06)",
                  border: `1.5px solid ${opt.border}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                  boxShadow: `0 4px 16px ${opt.glow}`,
                }}>
                  {opt.icon}
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 800,
                  padding: "5px 13px", borderRadius: 30,
                  background: `${opt.accent}18`,
                  color: opt.accent,
                  border: `1px solid ${opt.accent}40`,
                  fontFamily: "'Cinzel', serif", letterSpacing: ".04em",
                }}>
                  {opt.badge}
                </span>
              </div>

              {/* Titles */}
              <p style={{
                fontFamily: "'Cinzel Decorative', serif",
                fontSize: 18, fontWeight: 900, color: "#fff",
                margin: "0 0 2px", lineHeight: 1.25,
              }}>
                {opt.title}
              </p>
              <p style={{
                fontFamily: "'Amiri', serif",
                fontSize: 14, color: opt.accent,
                margin: "0 0 3px", letterSpacing: 1.5,
              }}>
                {opt.titleAr}
              </p>
              <p style={{ fontSize: 10, color: "rgba(255,255,255,.3)", margin: "0 0 12px", letterSpacing: ".08em" }}>
                {opt.subtitle}
              </p>

              {/* Description */}
              <p style={{
                fontSize: 13, color: "rgba(255,255,255,.55)",
                lineHeight: 1.7, margin: "0 0 14px",
              }}>
                {opt.desc}
              </p>

              {/* Chips */}
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 18 }}>
                {opt.chips.map((chip, i) => (
                  <span key={i} style={{
                    fontSize: 11, fontWeight: 700,
                    padding: "4px 12px", borderRadius: 30,
                    background: "rgba(255,255,255,.05)",
                    border: "1px solid rgba(255,255,255,.09)",
                    color: "rgba(255,255,255,.55)",
                  }}>{chip}</span>
                ))}
              </div>

              {/* CTA */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                paddingTop: 14, borderTop: `1px solid ${opt.border}`,
              }}>
                <span style={{
                  fontFamily: "'Cinzel', serif", fontSize: 13,
                  fontWeight: 700, color: opt.accent,
                  letterSpacing: ".04em",
                }}>
                  Enter {opt.id === "quiz" ? "Quiz Arena" : "Competition"} →
                </span>
                <div style={{
                  width: 34, height: 34, borderRadius: 10,
                  background: `${opt.accent}18`,
                  border: `1px solid ${opt.accent}40`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <ChevronRight size={16} color={opt.accent} />
                </div>
              </div>
            </div>
          ))}

          {/* ── Admin panel ─────────────────────────────────── */}
          {isAdmin && (
            <div className="hub-card" style={{ animationDelay: ".38s" }}>
              <AdminCodePanel />
            </div>
          )}

          {/* ── Non-admin info note ──────────────────────────── */}
          {!isAdmin && (
            <div className="hub-fade-up" style={{
              display: "flex", alignItems: "flex-start", gap: 12,
              padding: "14px 18px", borderRadius: 16,
              background: "rgba(255,255,255,.03)",
              border: "1px solid rgba(255,255,255,.07)",
              animationDelay: ".35s",
            }}>
              <Eye size={15} color="rgba(255,255,255,.3)" style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{
                fontSize: 12, color: "rgba(255,255,255,.38)",
                margin: 0, lineHeight: 1.7,
              }}>
                You'll need a <strong style={{ color: "rgba(201,168,76,.7)" }}>room code</strong> from
                your moderator to enter a competition. Ask your teacher or admin for the code before joining.
              </p>
            </div>
          )}

          {/* ── Bottom hadith ────────────────────────────────── */}
          <div className="hub-fade-up" style={{
            textAlign: "center", padding: "20px 0 4px",
            animationDelay: ".45s",
          }}>
            <div style={{
              fontFamily: "'Amiri', serif", fontSize: 14,
              color: "rgba(201,168,76,.4)", direction: "rtl",
              letterSpacing: 1, lineHeight: 1.9,
            }}>
              «خَيْرُكُمْ مَنْ تَعَلَّمَ الْقُرْآنَ وَعَلَّمَهُ»
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,.18)", marginTop: 5, letterSpacing: ".1em" }}>
              "The best of you are those who learn the Quran and teach it." — Al-Bukhari
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default MusabaqahHub;
