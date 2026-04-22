/*
  MusabaqahHub.tsx — Tahleem Academy
  ════════════════════════════════════════════════════════════════════
  Landing page for Al-Musābaqah section.
  Shows two options to choose from:
    1. Al-Musābaqah Quiz  → /live-quiz  (existing Kahoot-style quiz)
    2. Qur'an Recitation  → /musabaqah/recitation  (new competition)

  Renders INSIDE the DashboardLayout (student and admin both have sidebar).
  Colors: #0f2d1f green · #c9a84c gold  (Tahleem brand)
════════════════════════════════════════════════════════════════════
*/

import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Trophy, Mic, Zap, Users, Clock, Star, ChevronRight, Crown } from "lucide-react";

const G    = "#0f2d1f";
const GM   = "#163d28";
const GOLD = "#c9a84c";

/* ── Islamic geometric SVG background ─────────────────────────── */
const IslamicBg = () => (
  <svg
    style={{ position:"absolute", top:0, left:0, width:"100%", height:"100%", opacity:0.06, zIndex:0, pointerEvents:"none" }}
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <pattern id="hub-pat" x="0" y="0" width="100" height="100" patternUnits="userSpaceOnUse">
        <polygon
          points="50,5 58,35 88,35 65,54 73,84 50,65 27,84 35,54 12,35 42,35"
          fill="none" stroke={GOLD} strokeWidth="0.7"
        />
        <circle cx="50" cy="50" r="3" fill="none" stroke={GOLD} strokeWidth="0.5"/>
        <line x1="0" y1="50" x2="100" y2="50" stroke={GOLD} strokeWidth="0.2" opacity="0.5"/>
        <line x1="50" y1="0" x2="50" y2="100" stroke={GOLD} strokeWidth="0.2" opacity="0.5"/>
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#hub-pat)"/>
  </svg>
);

const MusabaqahHub = () => {
  const navigate  = useNavigate();
  const { hasRole } = useAuth();
  const isJudge   = hasRole("admin") || hasRole("teacher");

  const options = [
    {
      id:       "quiz",
      icon:     <Trophy size={40} color={GOLD}/>,
      emoji:    "🏆",
      title:    "Al-Musābaqah Quiz",
      titleAr:  "مسابقة الأسئلة",
      subtitle: "Live Islamic Quiz Arena",
      desc:     "Real-time multiple-choice quiz — compete against classmates on Tajweed, Quran, Arabic, Fiqh and more. Kahoot-style with live leaderboard.",
      stats:    [
        { icon:<Zap size={12}/>,   label:"Live MCQ" },
        { icon:<Users size={12}/>, label:"Multiplayer" },
        { icon:<Clock size={12}/>, label:"Per question timer" },
      ],
      route:    "/live-quiz",
      accent:   GOLD,
      badge:    isJudge ? "Host or Play" : "Join a Room",
      badgeBg:  "rgba(201,168,76,0.2)",
      border:   `1.5px solid rgba(201,168,76,0.35)`,
      glow:     "rgba(201,168,76,0.25)",
    },
    {
      id:       "recitation",
      icon:     <Mic size={40} color="#4ADE80"/>,
      emoji:    "📖",
      title:    "Qur'an Recitation",
      titleAr:  "مسابقة التلاوة",
      subtitle: "Virtual Musabaqah Competition",
      desc:     "A full recitation competition — participants are called by name, recite a randomly assigned Ayah, and receive AI + judge scores with word-by-word analysis.",
      stats:    [
        { icon:<Mic size={12}/>,   label:"Live mic + AI scoring" },
        { icon:<Users size={12}/>, label:"Queue system" },
        { icon:<Star size={12}/>,  label:"Judge override" },
      ],
      route:    "/musabaqah/recitation",
      accent:   "#4ADE80",
      badge:    isJudge ? "Create & Judge" : "Join Queue",
      badgeBg:  "rgba(74,222,128,0.15)",
      border:   "1.5px solid rgba(74,222,128,0.3)",
      glow:     "rgba(74,222,128,0.2)",
    },
  ];

  return (
    <div style={{
      minHeight: "100%",
      background: `linear-gradient(160deg, ${G} 0%, #0a1f12 60%, #050f09 100%)`,
      position: "relative",
      overflow: "hidden",
      fontFamily: "'Cairo', sans-serif",
      padding: "0 0 40px",
    }}>
      <IslamicBg/>

      {/* ── Header ──────────────────────────────────────────────── */}
      <div style={{
        position: "relative", zIndex: 1,
        padding: "28px 20px 0",
        textAlign: "center",
        maxWidth: 520,
        margin: "0 auto",
      }}>
        {/* Icon */}
        <div style={{
          width: 72, height: 72, borderRadius: 22,
          background: `linear-gradient(135deg, ${GOLD}, #8a6b28)`,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          marginBottom: 14,
          boxShadow: `0 8px 32px rgba(201,168,76,0.45)`,
        }}>
          <span style={{ fontSize: 36 }}>🏆</span>
        </div>

        <h1 style={{
          fontFamily: "'Playfair Display', serif",
          fontWeight: 900, fontSize: 28, color: "#fff",
          margin: "0 0 4px", letterSpacing: -0.5,
        }}>
          Al-Musābaqah
        </h1>
        <p style={{
          fontFamily: "'Amiri', serif",
          fontSize: 17, color: GOLD,
          margin: "0 0 6px", letterSpacing: 1.5,
        }}>
          المسابقة الإسلامية
        </p>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", margin: "0 0 32px" }}>
          Choose your competition mode
        </p>

        {/* Decorative divider */}
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:28 }}>
          <div style={{ flex:1, height:1, background:"rgba(201,168,76,0.15)" }}/>
          <Star size={10} color={GOLD} fill={GOLD}/>
          <Star size={12} color={GOLD} fill={GOLD}/>
          <Star size={10} color={GOLD} fill={GOLD}/>
          <div style={{ flex:1, height:1, background:"rgba(201,168,76,0.15)" }}/>
        </div>
      </div>

      {/* ── Option Cards ─────────────────────────────────────────── */}
      <div style={{
        position: "relative", zIndex: 1,
        maxWidth: 520, margin: "0 auto",
        padding: "0 16px",
        display: "flex", flexDirection: "column", gap: 16,
      }}>
        {options.map(opt => (
          <button
            key={opt.id}
            onClick={() => navigate(opt.route)}
            style={{
              width: "100%",
              background: "rgba(255,255,255,0.04)",
              backdropFilter: "blur(16px)",
              border: opt.border,
              borderRadius: 20,
              padding: "22px 20px",
              cursor: "pointer",
              textAlign: "left",
              position: "relative",
              overflow: "hidden",
              transition: "transform .15s, box-shadow .15s",
              boxShadow: `0 4px 24px ${opt.glow}`,
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)";
              (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 8px 36px ${opt.glow}`;
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
              (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 4px 24px ${opt.glow}`;
            }}
          >
            {/* Glow blob */}
            <div style={{
              position: "absolute", top: -40, right: -40,
              width: 120, height: 120, borderRadius: "50%",
              background: opt.glow,
              filter: "blur(30px)",
              pointerEvents: "none",
            }}/>

            {/* Top row: icon + badge */}
            <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:14 }}>
              <div style={{
                width: 62, height: 62, borderRadius: 18,
                background: `rgba(255,255,255,0.06)`,
                border: `1px solid rgba(255,255,255,0.1)`,
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                {opt.icon}
              </div>
              <span style={{
                fontSize: 11, fontWeight: 800,
                padding: "5px 12px", borderRadius: 20,
                background: opt.badgeBg,
                color: opt.accent,
                letterSpacing: 0.5,
                border: `1px solid ${opt.accent}44`,
              }}>
                {opt.badge}
              </span>
            </div>

            {/* Title */}
            <div style={{ marginBottom: 10 }}>
              <p style={{
                fontSize: 21, fontWeight: 900, color: "#fff",
                margin: "0 0 2px",
                fontFamily: "'Playfair Display', serif",
              }}>
                {opt.title}
              </p>
              <p style={{
                fontSize: 14, color: opt.accent,
                margin: "0 0 4px",
                fontFamily: "'Amiri', serif",
                letterSpacing: 1,
              }}>
                {opt.titleAr}
              </p>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", margin: 0, letterSpacing: 0.5 }}>
                {opt.subtitle}
              </p>
            </div>

            {/* Description */}
            <p style={{
              fontSize: 13, color: "rgba(255,255,255,0.55)",
              lineHeight: 1.65, margin: "0 0 14px",
            }}>
              {opt.desc}
            </p>

            {/* Stats chips */}
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:18 }}>
              {opt.stats.map((s, i) => (
                <span key={i} style={{
                  display: "flex", alignItems: "center", gap: 5,
                  fontSize: 11, fontWeight: 700,
                  padding: "4px 10px", borderRadius: 20,
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "rgba(255,255,255,0.6)",
                }}>
                  <span style={{ color: opt.accent }}>{s.icon}</span>
                  {s.label}
                </span>
              ))}
            </div>

            {/* CTA row */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              paddingTop: 14,
              borderTop: "1px solid rgba(255,255,255,0.07)",
            }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: opt.accent }}>
                Enter {opt.id === "quiz" ? "Quiz Arena" : "Competition"} →
              </span>
              <div style={{
                width: 34, height: 34, borderRadius: 10,
                background: opt.badgeBg,
                border: `1px solid ${opt.accent}44`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <ChevronRight size={16} color={opt.accent}/>
              </div>
            </div>
          </button>
        ))}

        {/* Admin note */}
        {isJudge && (
          <div style={{
            background: "rgba(201,168,76,0.08)",
            border: "1px solid rgba(201,168,76,0.2)",
            borderRadius: 14, padding: "12px 16px",
            display: "flex", alignItems: "flex-start", gap: 10,
          }}>
            <Crown size={16} color={GOLD} style={{ flexShrink:0, marginTop:1 }}/>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", margin: 0, lineHeight: 1.6 }}>
              <strong style={{ color: GOLD }}>Admin/Teacher mode:</strong> In the Quiz Arena you can host rooms and control questions. In the Recitation Competition you can create events, call participants, ring the bell, and judge recitations.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default MusabaqahHub;
