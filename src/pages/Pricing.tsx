/*  src/pages/Pricing.tsx
    Public Pricing Page — Tahleem Academy
    Shows registration fee, monthly & term fees per level,
    what's included, FAQ, and CTA to register
*/
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2, Star, BookOpen, Mic, Video, MessageCircle,
  FileText, GraduationCap, Shield, ChevronDown, ChevronUp,
  ArrowRight, Sparkles, Clock, Users, Trophy
} from "lucide-react";

const G      = "#064E3B";
const GM     = "#075E54";
const LIGHT  = "#F0FDF4";
const GOLD   = "#D4A843";
const GOLDBG = "#FFFBEB";

const fmt = (n: number) => `₦${n.toLocaleString()}`;

const LEVELS = [
  {
    id:      "beginner",
    name:    "Beginner",
    nameAr:  "المبتدئ",
    color:   "#16A34A",
    bg:      "#F0FDF4",
    border:  "#86EFAC",
    monthly: 5000,
    term:    15000,
    badge:   null,
    desc:    "Perfect for those starting their Quran & Islamic studies journey",
    suits:   "New students, ages 8+",
    includes: [
      "Quran reading from scratch (Noorani Qaida)",
      "Basic Tajweed rules",
      "Arabic alphabet & beginner vocabulary",
      "Foundational Islamic Studies",
      "Weekly live class sessions",
      "Al-Majlis group chat",
      "Course materials & recordings",
    ],
  },
  {
    id:      "intermediate",
    name:    "Intermediate",
    nameAr:  "المتوسط",
    color:   "#2563EB",
    bg:      "#EFF6FF",
    border:  "#93C5FD",
    monthly: 6000,
    term:    18000,
    badge:   "Most Popular",
    desc:    "For students who can read Quran and want to deepen their knowledge",
    suits:   "Students who completed beginner or equivalent",
    includes: [
      "Full Tajweed rules with practice",
      "Surah memorization (Al-Hifdh)",
      "Arabic grammar (Nahw & Sarf basics)",
      "Fiqh & Aqeedah studies",
      "Bi-weekly live sessions",
      "Al-Majlis group chat",
      "Assignments & progress tracking",
      "Access to recordings library",
    ],
  },
  {
    id:      "advanced",
    name:    "Advanced",
    nameAr:  "المتقدم",
    color:   "#7C3AED",
    bg:      "#F5F3FF",
    border:  "#C4B5FD",
    monthly: 7000,
    term:    21000,
    badge:   "Full Program",
    desc:    "Comprehensive program for serious students of Islamic knowledge",
    suits:   "Students with strong Quran & Arabic foundation",
    includes: [
      "Advanced Tajweed & Qira'at",
      "Full Quran memorization program",
      "Advanced Arabic language & literature",
      "Detailed Fiqh, Aqeedah & Tafseer",
      "Weekly live sessions + private sessions",
      "Al-Majlis group chat + direct teacher access",
      "Transcripts & certificates",
      "All recordings & materials",
      "Priority exam & assessment slots",
    ],
  },
];

const FAQS = [
  {
    q: "What is the registration fee for?",
    a: "The one-time ₦5,000 registration fee covers your account setup, the entrance examination, and the 3-stage recitation proficiency test. Once you pass and are assigned a level, your monthly or term subscription begins."
  },
  {
    q: "How is my level determined?",
    a: "Your level is determined through a 3-stage process: (1) You submit an audio recording of your Quran recitation, (2) our AI system scores your accuracy, (3) a teacher conducts a short live session to evaluate your Tajweed. The admin then assigns you to the appropriate level based on all three stages."
  },
  {
    q: "Can I switch levels?",
    a: "Yes. After each term, the admin reviews your progress and can promote you to the next level. Your fees will be adjusted accordingly."
  },
  {
    q: "What payment methods are accepted?",
    a: "We accept all major debit/credit cards and bank transfers through Paystack. All payments are secured and encrypted."
  },
  {
    q: "What is the difference between monthly and term payment?",
    a: "Monthly payment gives you access for one month. Term payment (3 months) gives you the same access for the full term — the fee is simply 3× the monthly rate. There is no discount, but it avoids re-paying every month."
  },
  {
    q: "Is there a free trial?",
    a: "New students get a 7-day grace period after registration before needing to make their first subscription payment. This allows you to explore the platform after your entrance exam."
  },
  {
    q: "What happens if I miss a payment?",
    a: "After the grace period, access to courses, Al-Majlis chat, and other features will be restricted until payment is completed. You can pay anytime from the Enrollment & Payment page in your dashboard."
  },
];

const Pricing = () => {
  const navigate = useNavigate();
  const [billing, setBilling] = useState<"monthly"|"term">("monthly");
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", background: "#fff", minHeight: "100vh" }}>
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(18px); } to { opacity:1; transform:none; } }
        @keyframes shimmer { 0%,100%{opacity:.7} 50%{opacity:1} }
        .price-card { transition: transform .2s, box-shadow .2s; }
        .price-card:hover { transform: translateY(-4px); box-shadow: 0 20px 48px rgba(0,0,0,.12) !important; }
        .faq-item { border-bottom: 1px solid #e5e7eb; }
        .reg-glow { box-shadow: 0 0 0 4px rgba(212,168,67,.25), 0 8px 32px rgba(212,168,67,.2); }
      `}</style>

      {/* ── HERO ─────────────────────────────────────────────── */}
      <div style={{ background: `linear-gradient(135deg, ${G} 0%, ${GM} 60%, #047857 100%)`, padding: "80px 20px 60px", textAlign: "center", position: "relative", overflow: "hidden" }}>
        {/* Islamic pattern overlay */}
        <div style={{ position: "absolute", inset: 0, opacity: .04, backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23fff'%3E%3Cpath d='M30 0l30 30-30 30L0 30z'/%3E%3C/g%3E%3C/svg%3E")`, backgroundSize: "60px 60px" }} />
        <div style={{ position: "relative", maxWidth: 620, margin: "0 auto" }}>
          <div style={{ fontSize: 15, color: "rgba(255,255,255,.6)", fontFamily: "serif", marginBottom: 12 }}>بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</div>
          <h1 style={{ fontSize: 36, fontWeight: 900, color: "#fff", margin: "0 0 14px", lineHeight: 1.15 }}>
            Simple, Transparent Pricing
          </h1>
          <p style={{ fontSize: 17, color: "rgba(255,255,255,.75)", margin: "0 0 32px", lineHeight: 1.6 }}>
            One registration fee. Then choose the plan that fits your level and commitment.
          </p>
          {/* Billing toggle */}
          <div style={{ display: "inline-flex", background: "rgba(255,255,255,.12)", borderRadius: 40, padding: 4, gap: 2 }}>
            {(["monthly","term"] as const).map(b => (
              <button key={b} onClick={() => setBilling(b)}
                style={{ padding: "10px 28px", borderRadius: 36, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 700, transition: "all .2s",
                  background: billing === b ? "#fff" : "transparent",
                  color: billing === b ? G : "rgba(255,255,255,.75)",
                }}>
                {b === "monthly" ? "Monthly" : "Per Term (3 months)"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── REGISTRATION FEE BANNER ───────────────────────────── */}
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "28px 20px 0" }}>
        <div className="reg-glow" style={{ background: GOLDBG, border: `2px solid ${GOLD}`, borderRadius: 18, padding: "20px 24px", display: "flex", flexWrap: "wrap" as const, alignItems: "center", gap: 16, animation: "fadeUp .4s ease" }}>
          <div style={{ width: 50, height: 50, borderRadius: "50%", background: GOLD, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Star style={{ width: 24, height: 24, color: "#fff", fill: "#fff" }} />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 800, fontSize: 17, color: "#92400E" }}>One-Time Registration Fee — {fmt(5000)}</div>
            <div style={{ fontSize: 13, color: "#A16207", marginTop: 3, lineHeight: 1.5 }}>
              Covers your entrance exam + 3-stage recitation proficiency test + account setup. Paid once before your first subscription.
            </div>
          </div>
          <button onClick={() => navigate("/register")} style={{ background: GOLD, color: "#fff", border: "none", borderRadius: 12, padding: "12px 22px", fontWeight: 800, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            Register & Pay ₦5,000 <ArrowRight size={16} />
          </button>
        </div>
      </div>

      {/* ── LEVEL CARDS ──────────────────────────────────────── */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 20px 20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20 }}>
          {LEVELS.map((lv, i) => (
            <div key={lv.id} className="price-card"
              style={{ border: `2px solid ${lv.id === "intermediate" ? lv.color : lv.border}`, borderRadius: 20, overflow: "hidden", background: "#fff", boxShadow: lv.id === "intermediate" ? `0 12px 40px rgba(37,99,235,.15)` : "0 2px 12px rgba(0,0,0,.06)", position: "relative", animation: `fadeUp ${.3 + i * .1}s ease` }}>
              {/* Badge */}
              {lv.badge && (
                <div style={{ position: "absolute", top: 16, right: 16, background: lv.color, color: "#fff", fontSize: 11, fontWeight: 800, padding: "4px 12px", borderRadius: 20 }}>
                  {lv.badge}
                </div>
              )}
              {/* Header */}
              <div style={{ background: lv.bg, padding: "24px 24px 20px", borderBottom: `1px solid ${lv.border}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <GraduationCap style={{ width: 22, height: 22, color: lv.color }} />
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 20, color: G }}>{lv.name}</div>
                    <div style={{ fontSize: 13, color: lv.color, fontFamily: "serif" }} dir="rtl">{lv.nameAr}</div>
                  </div>
                </div>
                <p style={{ fontSize: 13, color: "#555", lineHeight: 1.5, margin: "0 0 16px" }}>{lv.desc}</p>
                {/* Price */}
                <div style={{ display: "flex", alignItems: "flex-end", gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 38, fontWeight: 900, color: G, lineHeight: 1 }}>
                    {fmt(billing === "monthly" ? lv.monthly : lv.term)}
                  </span>
                  <span style={{ fontSize: 14, color: "#888", marginBottom: 6 }}>
                    /{billing === "monthly" ? "month" : "term"}
                  </span>
                </div>
                {billing === "term" && (
                  <div style={{ fontSize: 12, color: "#888" }}>
                    = {fmt(lv.monthly)}/month × 3 months
                  </div>
                )}
                <div style={{ marginTop: 8, fontSize: 12, color: "#666", display: "flex", alignItems: "center", gap: 5 }}>
                  <Users size={12} /> Suits: {lv.suits}
                </div>
              </div>
              {/* Includes */}
              <div style={{ padding: "20px 24px 24px" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#999", textTransform: "uppercase" as const, letterSpacing: .5, marginBottom: 12 }}>What's Included</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                  {lv.includes.map((item, j) => (
                    <div key={j} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <CheckCircle2 style={{ width: 16, height: 16, color: lv.color, flexShrink: 0, marginTop: 1 }} />
                      <span style={{ fontSize: 13, color: "#374151", lineHeight: 1.4 }}>{item}</span>
                    </div>
                  ))}
                </div>
                <button onClick={() => navigate("/register")}
                  style={{ marginTop: 24, width: "100%", padding: "13px", borderRadius: 12, border: `2px solid ${lv.color}`, background: lv.id === "intermediate" ? lv.color : "transparent", color: lv.id === "intermediate" ? "#fff" : lv.color, fontWeight: 700, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all .2s" }}>
                  Register & Pay ₦5,000 <ArrowRight size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── HOW IT WORKS ─────────────────────────────────────── */}
      <div style={{ background: LIGHT, padding: "52px 20px", marginTop: 20 }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <h2 style={{ fontSize: 28, fontWeight: 900, color: G, textAlign: "center", marginBottom: 8 }}>How Enrolment Works</h2>
          <p style={{ textAlign: "center", color: "#666", fontSize: 15, marginBottom: 36 }}>From registration to your first class in 4 steps</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 20 }}>
            {[
              { icon: <Shield size={26} color={GM} />, step: "1", title: "Pay Registration", desc: "One-time ₦5,000 to unlock your entrance process", color: GOLD },
              { icon: <FileText size={26} color={GM} />, step: "2", title: "Fill Form & Exam", desc: "Complete onboarding form + written entrance exam", color: "#3B82F6" },
              { icon: <Mic size={26} color={GM} />, step: "3", title: "Recitation Test", desc: "3-stage proficiency test: audio → AI score → live session", color: "#8B5CF6" },
              { icon: <Trophy size={26} color={GM} />, step: "4", title: "Level Assigned", desc: "Admin reviews all results and assigns your level", color: "#16A34A" },
            ].map((s, i) => (
              <div key={i} style={{ background: "#fff", borderRadius: 16, padding: "22px 18px", textAlign: "center", border: "1px solid #e5e7eb", boxShadow: "0 2px 8px rgba(0,0,0,.05)", animation: `fadeUp ${.3 + i * .1}s ease` }}>
                <div style={{ width: 52, height: 52, borderRadius: "50%", background: LIGHT, border: `2px solid ${s.color}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                  {s.icon}
                </div>
                <div style={{ fontSize: 11, fontWeight: 800, color: s.color, marginBottom: 6, textTransform: "uppercase" as const, letterSpacing: 1 }}>Step {s.step}</div>
                <div style={{ fontWeight: 700, fontSize: 15, color: G, marginBottom: 6 }}>{s.title}</div>
                <div style={{ fontSize: 12, color: "#666", lineHeight: 1.5 }}>{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── RECITATION TEST STAGES ───────────────────────────── */}
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "52px 20px" }}>
        <h2 style={{ fontSize: 28, fontWeight: 900, color: G, textAlign: "center", marginBottom: 8 }}>3-Stage Recitation Test</h2>
        <p style={{ textAlign: "center", color: "#666", fontSize: 15, marginBottom: 36 }}>
          Our unique proficiency evaluation ensures every student is placed at the right level
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {[
            {
              stage: "Stage 1",
              icon: <Mic size={22} color="#fff" />,
              bg:   "#7C3AED",
              title: "Audio Submission",
              desc:  "You record yourself reciting Surah Al-Fatiha (or assigned Surah). The audio is uploaded securely to our system for evaluation.",
              time:  "Takes ~5 minutes",
            },
            {
              stage: "Stage 2",
              icon: <Sparkles size={22} color="#fff" />,
              bg:   "#2563EB",
              title: "AI Accuracy Score",
              desc:  "Our AI (Groq Whisper) automatically transcribes your recitation and compares it to the correct text. You receive an instant word-accuracy percentage score.",
              time:  "Instant result",
            },
            {
              stage: "Stage 3",
              icon: <Video size={22} color="#fff" />,
              bg:   "#16A34A",
              title: "Live Teacher Session",
              desc:  "A teacher schedules a short 10–15 minute live session with you to evaluate Tajweed, Makharij, and fluency in real time. This is the most important stage.",
              time:  "Scheduled within 48hrs",
            },
          ].map((s, i) => (
            <div key={i} style={{ display: "flex", gap: 16, background: "#fff", borderRadius: 16, padding: "20px", border: "1px solid #e5e7eb", boxShadow: "0 2px 8px rgba(0,0,0,.05)" }}>
              <div style={{ width: 46, height: 46, borderRadius: "50%", background: s.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {s.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: s.bg, textTransform: "uppercase" as const, letterSpacing: 1 }}>{s.stage}</span>
                  <span style={{ fontSize: 11, color: "#999", display: "flex", alignItems: "center", gap: 4 }}><Clock size={11} />{s.time}</span>
                </div>
                <div style={{ fontWeight: 700, fontSize: 16, color: G, marginBottom: 4 }}>{s.title}</div>
                <div style={{ fontSize: 13, color: "#555", lineHeight: 1.6 }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
        {/* Final scoring breakdown */}
        <div style={{ marginTop: 20, background: LIGHT, borderRadius: 16, padding: "18px 20px", border: `1px solid #86EFAC` }}>
          <div style={{ fontWeight: 700, color: G, fontSize: 14, marginBottom: 10 }}>Final Level Score Breakdown</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" as const }}>
            {[
              { label: "Entrance Exam", pct: "40%", color: GOLD },
              { label: "AI Accuracy",   pct: "20%", color: "#2563EB" },
              { label: "Teacher Eval",  pct: "40%", color: "#16A34A" },
            ].map(s => (
              <div key={s.label} style={{ flex: 1, minWidth: 120, background: "#fff", borderRadius: 10, padding: "12px 14px", textAlign: "center", border: "1px solid #e5e7eb" }}>
                <div style={{ fontSize: 24, fontWeight: 900, color: s.color }}>{s.pct}</div>
                <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: "#666", marginTop: 10 }}>+ Admin final approval to confirm level assignment</div>
        </div>
      </div>

      {/* ── FAQ ──────────────────────────────────────────────── */}
      <div style={{ background: LIGHT, padding: "52px 20px" }}>
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          <h2 style={{ fontSize: 28, fontWeight: 900, color: G, textAlign: "center", marginBottom: 32 }}>Frequently Asked Questions</h2>
          {FAQS.map((faq, i) => (
            <div key={i} className="faq-item">
              <button onClick={() => setOpenFaq(openFaq === i ? null : i)}
                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 0", background: "none", border: "none", cursor: "pointer", textAlign: "left" as const }}>
                <span style={{ fontWeight: 700, fontSize: 15, color: G, flex: 1, paddingRight: 16 }}>{faq.q}</span>
                {openFaq === i ? <ChevronUp size={18} color={GM} /> : <ChevronDown size={18} color="#999" />}
              </button>
              {openFaq === i && (
                <div style={{ paddingBottom: 18, fontSize: 14, color: "#555", lineHeight: 1.7 }}>
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── BOTTOM CTA ───────────────────────────────────────── */}
      <div style={{ background: `linear-gradient(135deg, ${G}, ${GM})`, padding: "60px 20px", textAlign: "center" }}>
        <div style={{ maxWidth: 520, margin: "0 auto" }}>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,.6)", fontFamily: "serif", marginBottom: 10 }}>اطلبوا العلم من المهد إلى اللحد</div>
          <h2 style={{ fontSize: 28, fontWeight: 900, color: "#fff", marginBottom: 12 }}>
            Begin Your Learning Journey Today
          </h2>
          <p style={{ color: "rgba(255,255,255,.75)", fontSize: 15, marginBottom: 28, lineHeight: 1.6 }}>
            Join Tahleem Academy — where authentic Islamic education meets modern learning.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" as const }}>
            <button onClick={() => navigate("/register")}
              style={{ background: GOLD, color: "#fff", border: "none", borderRadius: 14, padding: "14px 28px", fontWeight: 800, fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
              Register & Pay ₦5,000 Registration Fee <ArrowRight size={17} />
            </button>
            <button onClick={() => navigate("/login")}
              style={{ background: "rgba(255,255,255,.12)", color: "#fff", border: "2px solid rgba(255,255,255,.3)", borderRadius: 14, padding: "14px 28px", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
              Already enrolled? Login
            </button>
          </div>
          <div style={{ marginTop: 20, display: "flex", justifyContent: "center", gap: 24, flexWrap: "wrap" as const }}>
            {[
              { icon: <Shield size={14} />, label: "Secure Paystack payment" },
              { icon: <CheckCircle2 size={14} />, label: "7-day grace period" },
              { icon: <BookOpen size={14} />, label: "Certified teachers" },
            ].map((t, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,.6)", fontSize: 12 }}>
                {t.icon} {t.label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Pricing;
