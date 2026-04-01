/*  src/pages/Index.tsx
    Tahleem Academy — Public Landing / Home Page
    ─────────────────────────────────────────────
    FIX: Previous file was accidentally overwritten with
    supabase/functions/paystack-webhook/index.ts (Deno edge-function code),
    which caused "Deno is not defined" to crash the entire app on load.
    This is the correct React component for the "/" route.
*/

import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  BookOpen, Users, Star, GraduationCap, Mic, Video,
  CheckCircle, ArrowRight, Sparkles, Clock, Shield,
  Globe, Award, BookMarked, Heart, ChevronRight,
} from "lucide-react";

/* ── Design tokens (match Pricing / About pages) ─────────────────────────── */
const G      = "#064E3B";
const GM     = "#075E54";
const LIGHT  = "#F0FDF4";
const GOLD   = "#D4A843";
const GOLDBG = "#FFFBEB";

/* ── Framer-motion helpers ────────────────────────────────────────────────── */
const fadeUp = {
  hidden:  { opacity: 0, y: 28 },
  visible: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.1, duration: 0.55, ease: "easeOut" },
  }),
};

const stagger = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.1 } },
};

/* ── Data ─────────────────────────────────────────────────────────────────── */
const STATS = [
  { icon: <Users  size={28} color={G} />, value: "500+",  label: "Students Enrolled"    },
  { icon: <Star   size={28} color={G} />, value: "4.9★",  label: "Average Rating"       },
  { icon: <Clock  size={28} color={G} />, value: "3 yrs", label: "Years of Excellence"  },
  { icon: <Globe  size={28} color={G} />, value: "12+",   label: "Countries Reached"    },
];

const FEATURES = [
  {
    icon:  <BookOpen size={32} color={G} />,
    title: "Structured Curriculum",
    desc:  "From Noorani Qaida to advanced Tajweed — every level follows a carefully designed Islamic education pathway.",
  },
  {
    icon:  <Mic size={32} color={G} />,
    title: "Live Recitation Feedback",
    desc:  "AI-assisted and teacher-reviewed recitation assessments give you real-time corrections on your Tajweed.",
  },
  {
    icon:  <Video size={32} color={G} />,
    title: "Live Interactive Classes",
    desc:  "Attend scheduled live sessions with qualified ustadhs via our built-in virtual classroom.",
  },
  {
    icon:  <Award size={32} color={G} />,
    title: "Certified Instructors",
    desc:  "Learn from verified scholars with ijāzah chains, combining authentic knowledge with modern pedagogy.",
  },
  {
    icon:  <BookMarked size={32} color={G} />,
    title: "Al-Hifdh Centre",
    desc:  "A dedicated Quran memorization module with spaced-repetition, audio playback, and progress tracking.",
  },
  {
    icon:  <Shield size={32} color={G} />,
    title: "Secure & Proctored Exams",
    desc:  "Tamper-resistant online exams with live proctoring — your academic integrity is protected.",
  },
];

const PROGRAMS = [
  {
    level:   "Beginner",
    levelAr: "المبتدئ",
    color:   "#16A34A",
    bg:      "#F0FDF4",
    border:  "#86EFAC",
    price:   "₦5,000 / mo",
    items:   ["Noorani Qaida", "Basic Tajweed", "Arabic Alphabet", "Foundational Islamic Studies"],
  },
  {
    level:   "Intermediate",
    levelAr: "المتوسط",
    color:   "#2563EB",
    bg:      "#EFF6FF",
    border:  "#93C5FD",
    price:   "₦6,000 / mo",
    badge:   "Most Popular",
    items:   ["Full Tajweed Rules", "Surah Memorisation", "Arabic Grammar Basics", "Fiqh & Aqeedah"],
  },
  {
    level:   "Advanced",
    levelAr: "المتقدم",
    color:   "#7C3AED",
    bg:      "#F5F3FF",
    border:  "#C4B5FD",
    price:   "₦7,000 / mo",
    items:   ["Advanced Tajweed & Qirā'āt", "Full Hifdh Programme", "Advanced Arabic", "Tafseer & Hadith Sciences"],
  },
];

const HOW_IT_WORKS = [
  { step: "01", title: "Register & Pay",    desc: "Create your account and pay the one-time ₦5,000 registration fee." },
  { step: "02", title: "Entrance Exam",     desc: "Take our online written and recitation entrance assessment." },
  { step: "03", title: "Level Assignment",  desc: "An ustadh reviews your recitation and assigns your level." },
  { step: "04", title: "Start Learning",    desc: "Get full access to your level's live classes, materials, and Al-Hifdh Centre." },
];

/* ── Component ────────────────────────────────────────────────────────────── */
const Index = () => {
  const navigate = useNavigate();

  return (
    <div style={{ fontFamily: "inherit", color: "#111" }}>

      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <section
        style={{
          background: `linear-gradient(135deg, ${G} 0%, ${GM} 50%, #0F766E 100%)`,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          padding: "80px 20px 60px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Decorative pattern overlay */}
        <div
          aria-hidden
          style={{
            position: "absolute", inset: 0,
            backgroundImage: `radial-gradient(circle at 20% 50%, rgba(212,168,67,0.12) 0%, transparent 50%),
                              radial-gradient(circle at 80% 20%, rgba(255,255,255,0.06) 0%, transparent 40%)`,
          }}
        />

        <div style={{ maxWidth: 900, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 1 }}>

          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: "rgba(212,168,67,0.2)", border: `1px solid ${GOLD}`,
              borderRadius: 50, padding: "6px 16px", marginBottom: 28,
            }}
          >
            <Sparkles size={14} color={GOLD} />
            <span style={{ color: GOLD, fontSize: 13, fontWeight: 700 }}>
              Nigeria's Leading Islamic E-Learning Platform
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            style={{
              fontSize: "clamp(2rem, 6vw, 3.8rem)",
              fontWeight: 800,
              color: "#fff",
              lineHeight: 1.18,
              marginBottom: 20,
            }}
          >
            Learn Qur'an & Islamic Studies
            <br />
            <span style={{ color: GOLD }}>From Authentic Scholars</span>
          </motion.h1>

          {/* Arabic sub-headline */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25, duration: 0.5 }}
            style={{
              fontSize: "clamp(1rem, 2.5vw, 1.4rem)",
              color: "rgba(255,255,255,0.7)",
              marginBottom: 10,
              fontFamily: "serif",
              direction: "rtl",
            }}
          >
            تعلّم القرآن الكريم والعلوم الإسلامية مع علماء موثوقين
          </motion.p>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            style={{
              fontSize: "clamp(0.95rem, 2vw, 1.15rem)",
              color: "rgba(255,255,255,0.78)",
              maxWidth: 640,
              margin: "0 auto 36px",
              lineHeight: 1.7,
            }}
          >
            Structured programmes in Tajweed, Quran memorisation (Al-Hifdh), Arabic,
            Fiqh, and Aqeedah — taught live by qualified instructors with weekly sessions,
            AI recitation feedback, and certified transcripts.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}
          >
            <button
              onClick={() => navigate("/register")}
              style={{
                background: GOLD, color: "#fff",
                border: "none", borderRadius: 10,
                padding: "14px 32px", fontSize: 16, fontWeight: 700,
                cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                boxShadow: "0 4px 20px rgba(212,168,67,0.4)",
                transition: "transform 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-2px)")}
              onMouseLeave={e => (e.currentTarget.style.transform = "translateY(0)")}
            >
              Enroll Now — ₦5,000 <ArrowRight size={18} />
            </button>
            <button
              onClick={() => navigate("/courses")}
              style={{
                background: "rgba(255,255,255,0.12)",
                color: "#fff",
                border: "1.5px solid rgba(255,255,255,0.35)",
                borderRadius: 10,
                padding: "14px 32px", fontSize: 16, fontWeight: 600,
                cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                transition: "background 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.2)")}
              onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.12)")}
            >
              Explore Courses <ChevronRight size={18} />
            </button>
          </motion.div>

          {/* Trust strip */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.55 }}
            style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginTop: 22 }}
          >
            ✓ No hidden fees &nbsp;·&nbsp; ✓ Certified instructors &nbsp;·&nbsp; ✓ Cancel anytime
          </motion.p>
        </div>
      </section>

      {/* ── STATS ─────────────────────────────────────────────────────────── */}
      <section style={{ background: LIGHT, padding: "48px 20px" }}>
        <div
          style={{
            maxWidth: 900, margin: "0 auto",
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 24,
          }}
        >
          {STATS.map((s, i) => (
            <motion.div
              key={i}
              custom={i}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              style={{
                textAlign: "center", background: "#fff",
                borderRadius: 14, padding: "28px 20px",
                boxShadow: "0 2px 12px rgba(6,78,59,0.07)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>{s.icon}</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: G }}>{s.value}</div>
              <div style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>{s.label}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ──────────────────────────────────────────────────────── */}
      <section style={{ padding: "72px 20px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}
            style={{ textAlign: "center", marginBottom: 48 }}
          >
            <h2 style={{ fontSize: "clamp(1.6rem, 4vw, 2.4rem)", fontWeight: 800, color: G, marginBottom: 10 }}>
              Why Tahleem Academy?
            </h2>
            <p style={{ fontSize: 15, color: "#6B7280", maxWidth: 560, margin: "0 auto" }}>
              A complete Islamic education platform built for serious students — from total beginners to advanced scholars.
            </p>
          </motion.div>

          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: 24,
            }}
          >
            {FEATURES.map((f, i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                style={{
                  background: "#fff",
                  border: "1.5px solid #E5E7EB",
                  borderRadius: 14,
                  padding: "28px 24px",
                  transition: "box-shadow 0.2s, border-color 0.2s",
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = G;
                  (e.currentTarget as HTMLDivElement).style.boxShadow = `0 4px 20px rgba(6,78,59,0.1)`;
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = "#E5E7EB";
                  (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
                }}
              >
                <div
                  style={{
                    width: 56, height: 56, borderRadius: 14,
                    background: LIGHT, display: "flex", alignItems: "center",
                    justifyContent: "center", marginBottom: 16,
                  }}
                >
                  {f.icon}
                </div>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: "#111", marginBottom: 8 }}>{f.title}</h3>
                <p style={{ fontSize: 14, color: "#6B7280", lineHeight: 1.65 }}>{f.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── PROGRAMMES ────────────────────────────────────────────────────── */}
      <section style={{ background: LIGHT, padding: "72px 20px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}
            style={{ textAlign: "center", marginBottom: 48 }}
          >
            <h2 style={{ fontSize: "clamp(1.6rem, 4vw, 2.4rem)", fontWeight: 800, color: G, marginBottom: 10 }}>
              Choose Your Level
            </h2>
            <p style={{ fontSize: 15, color: "#6B7280", maxWidth: 520, margin: "0 auto" }}>
              Three structured programmes — your level is assigned after the entrance assessment.
            </p>
          </motion.div>

          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 24,
            }}
          >
            {PROGRAMS.map((p, i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                style={{
                  background: p.bg,
                  border: `2px solid ${p.border}`,
                  borderRadius: 16,
                  padding: "28px 24px",
                  position: "relative",
                }}
              >
                {p.badge && (
                  <div
                    style={{
                      position: "absolute", top: -12, right: 20,
                      background: GOLD, color: "#fff",
                      fontSize: 11, fontWeight: 800,
                      padding: "4px 14px", borderRadius: 50,
                      letterSpacing: 0.5,
                    }}
                  >
                    ⭐ {p.badge}
                  </div>
                )}
                <div style={{ marginBottom: 16 }}>
                  <span style={{ fontSize: 22, fontWeight: 800, color: p.color }}>{p.level}</span>
                  <span
                    style={{
                      marginLeft: 10, fontSize: 15, color: p.color,
                      fontFamily: "serif", direction: "rtl", display: "inline",
                    }}
                  >
                    {p.levelAr}
                  </span>
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, color: G, marginBottom: 18 }}>
                  {p.price}
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {p.items.map((item, j) => (
                    <li key={j} style={{ display: "flex", alignItems: "flex-start", gap: 9, marginBottom: 10 }}>
                      <CheckCircle size={16} color={p.color} style={{ marginTop: 2, flexShrink: 0 }} />
                      <span style={{ fontSize: 14, color: "#374151" }}>{item}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </motion.div>

          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}
            style={{ textAlign: "center", marginTop: 36 }}
          >
            <button
              onClick={() => navigate("/pricing")}
              style={{
                background: "transparent", color: G,
                border: `2px solid ${G}`, borderRadius: 10,
                padding: "12px 28px", fontSize: 15, fontWeight: 700,
                cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8,
              }}
            >
              View Full Pricing Details <ArrowRight size={16} />
            </button>
          </motion.div>
        </div>
      </section>

      {/* ── HOW IT WORKS ──────────────────────────────────────────────────── */}
      <section style={{ padding: "72px 20px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}
            style={{ textAlign: "center", marginBottom: 48 }}
          >
            <h2 style={{ fontSize: "clamp(1.6rem, 4vw, 2.4rem)", fontWeight: 800, color: G, marginBottom: 10 }}>
              How Enrolment Works
            </h2>
            <p style={{ fontSize: 15, color: "#6B7280", maxWidth: 480, margin: "0 auto" }}>
              A transparent 4-step process from registration to your first class.
            </p>
          </motion.div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
              gap: 24,
            }}
          >
            {HOW_IT_WORKS.map((h, i) => (
              <motion.div
                key={i}
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                style={{ textAlign: "center" }}
              >
                <div
                  style={{
                    width: 56, height: 56, borderRadius: "50%",
                    background: `linear-gradient(135deg, ${G}, ${GM})`,
                    color: "#fff", fontSize: 18, fontWeight: 800,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    margin: "0 auto 16px",
                    boxShadow: "0 4px 14px rgba(6,78,59,0.25)",
                  }}
                >
                  {h.step}
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: "#111", marginBottom: 8 }}>{h.title}</h3>
                <p style={{ fontSize: 13.5, color: "#6B7280", lineHeight: 1.6 }}>{h.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIAL / QUOTE ───────────────────────────────────────────── */}
      <section style={{ background: GOLDBG, padding: "60px 20px" }}>
        <motion.div
          initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}
          style={{ maxWidth: 700, margin: "0 auto", textAlign: "center" }}
        >
          <Heart size={32} color={GOLD} style={{ margin: "0 auto 20px" }} />
          <blockquote
            style={{
              fontSize: "clamp(1rem, 2.5vw, 1.3rem)",
              fontStyle: "italic",
              color: "#78350F",
              lineHeight: 1.75,
              marginBottom: 20,
            }}
          >
            "The best of you are those who learn the Qur'an and teach it."
          </blockquote>
          <p style={{ fontSize: 13, color: "#92400E", fontWeight: 700 }}>
            — The Prophet (peace be upon him) &mdash; Sahih al-Bukhari
          </p>
        </motion.div>
      </section>

      {/* ── FINAL CTA ─────────────────────────────────────────────────────── */}
      <section
        style={{
          background: `linear-gradient(135deg, ${G} 0%, ${GM} 100%)`,
          padding: "72px 20px",
          textAlign: "center",
        }}
      >
        <motion.div
          initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}
          style={{ maxWidth: 620, margin: "0 auto" }}
        >
          <GraduationCap size={44} color={GOLD} style={{ margin: "0 auto 20px" }} />
          <h2 style={{ fontSize: "clamp(1.6rem, 4vw, 2.4rem)", fontWeight: 800, color: "#fff", marginBottom: 14 }}>
            Begin Your Qur'anic Journey Today
          </h2>
          <p style={{ fontSize: 15, color: "rgba(255,255,255,0.75)", marginBottom: 32, lineHeight: 1.7 }}>
            Join hundreds of students across Nigeria and beyond who are memorising,
            reciting, and understanding the Qur'an with qualified scholars.
          </p>
          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              onClick={() => navigate("/register")}
              style={{
                background: GOLD, color: "#fff",
                border: "none", borderRadius: 10,
                padding: "14px 32px", fontSize: 16, fontWeight: 700,
                cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8,
                boxShadow: "0 4px 20px rgba(212,168,67,0.4)",
              }}
            >
              Register Now <ArrowRight size={18} />
            </button>
            <button
              onClick={() => navigate("/about")}
              style={{
                background: "transparent", color: "#fff",
                border: "1.5px solid rgba(255,255,255,0.4)",
                borderRadius: 10, padding: "14px 28px",
                fontSize: 15, fontWeight: 600, cursor: "pointer",
              }}
            >
              Learn About Us
            </button>
          </div>
        </motion.div>
      </section>

    </div>
  );
};

export default Index;
