/*  src/components/layout/PublicNav.tsx
    Public navigation with hamburger menu.
    Includes full Enroll guide panel showing everything
    a new student needs to know before registering.
*/
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  BookOpen, Menu, X, CreditCard, LogIn, UserPlus,
  ChevronRight, ChevronDown, Star, FileText, GraduationCap, Mic,
  Video, CheckCircle2, ArrowRight, Globe, Home,
  Info, Phone, Clock, Shield, AlertCircle
} from "lucide-react";

const G    = "#064E3B";
const GM   = "#075E54";
const GOLD = "#D4A843";

const NAV_LINKS = [
  { to: "/",        label: "Home",    icon: <Home size={18} /> },
  { to: "/courses", label: "Courses", icon: <BookOpen size={18} /> },
  { to: "/pricing", label: "Pricing", icon: <CreditCard size={18} /> },
  { to: "/about",   label: "About",   icon: <Info size={18} /> },
  { to: "/contact", label: "Contact", icon: <Phone size={18} /> },
];

type Panel = null | "enroll" | "menu";

// ── ENROLL PANEL CONTENT (defined before PublicNav so const is in scope) ──
const EnrollPanel = ({ onClose, onRegister, mobile }: { onClose: () => void; onRegister: () => void; mobile?: boolean }) => (
  <div style={{ padding: mobile ? "0 0 4px" : undefined }}>

    {/* ⚠️ READ BEFORE YOU START */}
    <div style={{ background:"#FFF8E1", borderLeft:`4px solid ${GOLD}`, padding:"12px 16px", margin:"0 0 0" }}>
      <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
        <AlertCircle size={18} color="#D4A843" style={{ flexShrink:0, marginTop:1 }} />
        <div>
          <div style={{ fontWeight:800, fontSize:13, color:"#92400E", marginBottom:4 }}>📋 Read Before You Start</div>
          <div style={{ fontSize:12, color:"#78350F", lineHeight:1.6 }}>
            Tahleem Academy is a <strong>structured Islamic learning program</strong>. Enrolment involves a paid registration, entrance test, and level assignment — not instant access. Please read all steps below before proceeding.
          </div>
        </div>
      </div>
    </div>

    {/* Prerequisites */}
    <div style={{ padding:"14px 18px", borderBottom:"1px solid #f0f0f0" }}>
      <div style={{ fontSize:11, fontWeight:800, color:"#9ca3af", textTransform:"uppercase" as const, letterSpacing:.6, marginBottom:10 }}>✅ What You Need Before Registering</div>
      {[
        { icon:"📧", text:"A valid email address (for verification)" },
        { icon:"💳", text:"Debit/credit card or bank transfer for ₦5,000 registration fee" },
        { icon:"🎤", text:"A working microphone (for the recitation audio test)" },
        { icon:"📶", text:"Stable internet connection for the live teacher session" },
        { icon:"🕐", text:"Around 1–2 hours for the full entrance process" },
      ].map((item, i) => (
        <div key={i} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:i < 4 ? 8 : 0, fontSize:13, color:"#333" }}>
          <span style={{ fontSize:16, flexShrink:0 }}>{item.icon}</span>
          {item.text}
        </div>
      ))}
    </div>

    {/* 5-step process */}
    <div style={{ padding:"14px 18px", borderBottom:"1px solid #f0f0f0" }}>
      <div style={{ fontSize:11, fontWeight:800, color:"#9ca3af", textTransform:"uppercase" as const, letterSpacing:.6, marginBottom:12 }}>🗺️ The 5-Step Enrolment Process</div>
      {[
        {
          icon:  <Star size={15} color={GOLD} fill={GOLD} />,
          bg:    "#FEF3C7",
          step:  "Step 1",
          title: "Pay ₦5,000 Registration Fee",
          desc:  "One-time, non-refundable after exam begins. Covers your full entrance process.",
          color: "#92400E",
          time:  "~2 min",
        },
        {
          icon:  <FileText size={15} color="#2563EB" />,
          bg:    "#EFF6FF",
          step:  "Step 2",
          title: "Fill Onboarding Form",
          desc:  "Tell us about yourself — name, age, Quran background, learning goals.",
          color: "#1E3A5F",
          time:  "~5 min",
        },
        {
          icon:  <GraduationCap size={15} color="#7C3AED" />,
          bg:    "#F5F3FF",
          step:  "Step 3",
          title: "Written Entrance Exam",
          desc:  "Multiple choice questions on Tajweed rules, Arabic letters & Islamic basics. Scored automatically.",
          color: "#4C1D95",
          time:  "~15–20 min",
        },
        {
          icon:  <Mic size={15} color="#059669" />,
          bg:    "#ECFDF5",
          step:  "Step 4",
          title: "Recitation Audio Test",
          desc:  "Record yourself reciting Surah Al-Fatiha. AI scores your word accuracy instantly. Admin also reviews.",
          color: "#064E3B",
          time:  "~5 min",
        },
        {
          icon:  <Video size={15} color="#DC2626" />,
          bg:    "#FEF2F2",
          step:  "Step 5",
          title: "Live Teacher Evaluation",
          desc:  "A 10–15 min scheduled live session. Teacher evaluates your Tajweed & Makharij in real time.",
          color: "#7F1D1D",
          time:  "Scheduled within 48hrs",
        },
      ].map((s, i) => (
        <div key={i} className="enroll-step" style={{ display:"flex", gap:12, padding:"10px 8px", borderRadius:10, marginBottom:i < 4 ? 4 : 0 }}>
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center" }}>
            <div style={{ width:32, height:32, borderRadius:"50%", background:s.bg, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              {s.icon}
            </div>
            {i < 4 && <div style={{ width:1, flex:1, background:"#e5e7eb", marginTop:4, minHeight:14 }} />}
          </div>
          <div style={{ flex:1, paddingTop:4 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:2 }}>
              <span style={{ fontSize:10, fontWeight:800, color:"#9ca3af", textTransform:"uppercase" as const, letterSpacing:.5 }}>{s.step}</span>
              <span style={{ fontSize:10, color:"#9ca3af", display:"flex", alignItems:"center", gap:3 }}><Clock size={10} />{s.time}</span>
            </div>
            <div style={{ fontSize:13, fontWeight:700, color:s.color }}>{s.title}</div>
            <div style={{ fontSize:11, color:"#6b7280", lineHeight:1.5, marginTop:2 }}>{s.desc}</div>
          </div>
        </div>
      ))}
    </div>

    {/* Score breakdown */}
    <div style={{ padding:"12px 18px", borderBottom:"1px solid #f0f0f0" }}>
      <div style={{ fontSize:11, fontWeight:800, color:"#9ca3af", textTransform:"uppercase" as const, letterSpacing:.6, marginBottom:10 }}>📊 How Your Level is Determined</div>
      <div style={{ display:"flex", gap:8 }}>
        {[
          { label:"Entrance Exam", pct:"40%", color:GOLD, bg:"#FFFBEB" },
          { label:"AI Recitation", pct:"20%", color:"#2563EB", bg:"#EFF6FF" },
          { label:"Teacher Eval",  pct:"40%", color:"#059669", bg:"#ECFDF5" },
        ].map(s => (
          <div key={s.label} style={{ flex:1, background:s.bg, borderRadius:10, padding:"10px 8px", textAlign:"center" }}>
            <div style={{ fontSize:20, fontWeight:900, color:s.color }}>{s.pct}</div>
            <div style={{ fontSize:10, color:"#666", marginTop:3, lineHeight:1.3 }}>{s.label}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize:11, color:"#9ca3af", marginTop:8, textAlign:"center" }}>+ Admin final approval to assign you to Beginner / Intermediate / Advanced</div>
    </div>

    {/* Monthly fees */}
    <div style={{ padding:"12px 18px", borderBottom:"1px solid #f0f0f0" }}>
      <div style={{ fontSize:11, fontWeight:800, color:"#9ca3af", textTransform:"uppercase" as const, letterSpacing:.6, marginBottom:10 }}>💰 Monthly Subscription Fees (After Level Assignment)</div>
      {[
        { level:"Beginner",     monthly:"₦5,000", term:"₦15,000", color:"#16A34A", bg:"#F0FDF4" },
        { level:"Intermediate", monthly:"₦6,000", term:"₦18,000", color:"#2563EB", bg:"#EFF6FF" },
        { level:"Advanced",     monthly:"₦7,000", term:"₦21,000", color:"#7C3AED", bg:"#F5F3FF" },
      ].map(f => (
        <div key={f.level} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", background:f.bg, borderRadius:10, marginBottom:6 }}>
          <span style={{ fontSize:12, fontWeight:700, color:f.color, flex:1 }}>{f.level}</span>
          <span style={{ fontSize:12, color:"#333" }}>{f.monthly}<span style={{ color:"#9ca3af" }}>/mo</span></span>
          <span style={{ fontSize:11, color:"#9ca3af" }}>or {f.term}/term</span>
        </div>
      ))}
    </div>

    {/* CTA */}
    <div style={{ padding:"16px 18px" }}>
      <button onClick={onRegister}
        style={{ width:"100%", padding:"14px", borderRadius:14, border:"none", cursor:"pointer", background:`linear-gradient(135deg,${GOLD},#B8860B)`, color:"#fff", fontWeight:800, fontSize:15, display:"flex", alignItems:"center", justifyContent:"center", gap:10, boxShadow:"0 4px 16px rgba(212,168,67,.3)", fontFamily:"inherit", animation:"glow 2s infinite" }}>
        <Star size={16} fill="currentColor" /> Register & Pay ₦5,000 Now <ArrowRight size={16} />
      </button>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:6, fontSize:11, color:"#9ca3af", marginTop:8 }}>
        <Shield size={11} /> Secured by Paystack · One-time · Non-refundable after exam begins
      </div>
      <div style={{ textAlign:"center", marginTop:10 }}>
        <Link to="/pricing" onClick={onClose} style={{ fontSize:12, color:GM, fontWeight:600, textDecoration:"none" }}>
          View full pricing details →
        </Link>
      </div>
    </div>
  </div>
);

const PublicNav = () => {
  const location  = useLocation();
  const navigate  = useNavigate();
  const [panel, setPanel]           = useState<Panel>(null);
  const [enrollOpen, setEnrollOpen] = useState(false);

  const isActive = (path: string) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  const close = () => { setPanel(null); setEnrollOpen(false); };

  return (
    <>
      <style>{`
        @keyframes slideDown { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:none} }
        @keyframes slideUp   { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:none} }
        @keyframes fadeIn    { from{opacity:0} to{opacity:1} }
        @keyframes glow      { 0%,100%{box-shadow:0 0 0 0 rgba(212,168,67,.4)} 50%{box-shadow:0 0 0 10px rgba(212,168,67,0)} }
        .nav-link-desktop:hover { color:${GOLD} !important; }
        .mob-row:hover { background:rgba(6,78,59,.04) !important; }
        .enroll-step { transition: background .15s; }
        .enroll-step:hover { background: rgba(6,78,59,.03); }
        @media(min-width:769px){ .mobile-only{ display:none!important } }
        @media(max-width:768px){ .desktop-only{ display:none!important } }
      `}</style>

      <header style={{ position:"sticky", top:0, zIndex:200, background:"#fff", borderBottom:"1px solid rgba(6,78,59,.1)", boxShadow:"0 1px 8px rgba(6,78,59,.06)" }}>
        <div style={{ maxWidth:1200, margin:"0 auto", padding:"0 20px", height:64, display:"flex", alignItems:"center", justifyContent:"space-between", gap:16 }}>

          {/* Logo */}
          <Link to="/" onClick={close} style={{ textDecoration:"none", display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
            <div style={{ width:38, height:38, borderRadius:10, background:G, display:"flex", alignItems:"center", justifyContent:"center" }}>
              <BookOpen style={{ width:19, height:19, color:GOLD }} />
            </div>
            <div>
              <div style={{ fontSize:16, fontWeight:900, color:G, lineHeight:1 }}>Tahleem <span style={{ color:GOLD }}>Academy</span></div>
              <div style={{ fontSize:10, color:"#7a9e88", direction:"rtl" }}>أكاديمية تعليم</div>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="desktop-only" style={{ display:"flex", alignItems:"center", gap:2 }}>
            {NAV_LINKS.map(link => (
              <Link key={link.to} to={link.to} className="nav-link-desktop"
                style={{ padding:"6px 14px", borderRadius:8, textDecoration:"none", fontSize:14, fontWeight:isActive(link.to)?700:500, color:isActive(link.to)?G:"#555", background:isActive(link.to)?"#F0FDF4":"transparent", transition:"color .15s" }}>
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Desktop CTAs */}
          <div className="desktop-only" style={{ display:"flex", alignItems:"center", gap:8 }}>
            <button onClick={() => setPanel(p => p === "enroll" ? null : "enroll")}
              style={{ padding:"8px 18px", borderRadius:10, fontSize:13, fontWeight:700, color:"#fff", background:`linear-gradient(135deg,${GOLD},#B8860B)`, border:"none", cursor:"pointer", display:"flex", alignItems:"center", gap:6, boxShadow:"0 2px 8px rgba(212,168,67,.3)", animation:"glow 3s infinite" }}>
              <Star size={13} fill="currentColor" /> How to Enroll
            </button>
            <Link to="/login" style={{ padding:"8px 16px", borderRadius:10, textDecoration:"none", fontSize:13, fontWeight:600, color:G, border:`1.5px solid rgba(6,78,59,.2)`, display:"flex", alignItems:"center", gap:6 }}>
              <LogIn size={14} /> Sign In
            </Link>
            <Link to="/register" style={{ padding:"8px 18px", borderRadius:10, textDecoration:"none", fontSize:13, fontWeight:700, color:"#fff", background:`linear-gradient(135deg,${G},${GM})`, display:"flex", alignItems:"center", gap:6, boxShadow:"0 2px 8px rgba(6,78,59,.25)" }}>
              <UserPlus size={14} /> Register
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button className="mobile-only" onClick={() => setPanel(p => p === "menu" ? null : "menu")}
            style={{ background:"none", border:"none", cursor:"pointer", color:G, padding:6, display:"flex", alignItems:"center", justifyContent:"center" }}>
            {panel === "menu" ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* ── DESKTOP ENROLL PANEL ──────────────────────────────── */}
        {panel === "enroll" && (
          <div style={{ position:"fixed", inset:0, zIndex:300, background:"rgba(0,0,0,.5)", animation:"fadeIn .2s ease" }} onClick={close}>
            <div style={{ position:"absolute", top:64, right:20, width:380, background:"#fff", borderRadius:20, boxShadow:"0 20px 60px rgba(0,0,0,.2)", overflow:"hidden", animation:"slideDown .22s ease" }} onClick={e => e.stopPropagation()}>
              <EnrollPanel onClose={close} onRegister={() => { close(); navigate("/register"); }} />
            </div>
          </div>
        )}
      </header>

      {/* ── MOBILE DRAWER ─────────────────────────────────────── */}
      {panel === "menu" && (
        <div style={{ position:"fixed", inset:0, zIndex:190, background:"rgba(0,0,0,.5)", animation:"fadeIn .2s ease" }} onClick={close}>
          <div style={{ position:"absolute", top:64, left:0, right:0, background:"#fff", maxHeight:"calc(100vh - 64px)", overflowY:"auto", animation:"slideDown .22s ease" }} onClick={e => e.stopPropagation()}>

            {/* Nav links */}
            <div style={{ padding:"8px 0" }}>
              {NAV_LINKS.map(link => (
                <Link key={link.to} to={link.to} className="mob-row" onClick={close}
                  style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 24px", textDecoration:"none", fontSize:15, fontWeight:isActive(link.to)?700:500, color:isActive(link.to)?G:"#333", background:isActive(link.to)?"#F0FDF4":"transparent", borderBottom:"1px solid rgba(6,78,59,.06)" }}>
                  <span style={{ color:isActive(link.to)?G:"#9ca3af" }}>{link.icon}</span>
                  {link.label}
                  {isActive(link.to) && <ChevronRight size={14} color={G} style={{ marginLeft:"auto" }} />}
                </Link>
              ))}
            </div>

            {/* ── ENROLL SECTION ──────────────────────────── */}
            <div style={{ margin:"0 16px 16px", borderRadius:16, border:`2px solid ${GOLD}`, overflow:"hidden" }}>
              {/* Gold header — tap to collapse/expand */}
              <button
                onClick={() => setEnrollOpen(o => !o)}
                style={{ width:"100%", background:`linear-gradient(135deg,${GOLD},#B8860B)`, padding:"14px 18px", display:"flex", alignItems:"center", gap:10, border:"none", cursor:"pointer", textAlign:"left" }}
              >
                <div style={{ width:36, height:36, borderRadius:"50%", background:"rgba(255,255,255,.2)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  <Star size={18} color="#fff" fill="#fff" />
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ color:"#fff", fontWeight:800, fontSize:16 }}>How to Enroll</div>
                  <div style={{ color:"rgba(255,255,255,.8)", fontSize:12 }}>
                    {enrollOpen ? "Tap to collapse" : "Tap to see the full enrolment guide"}
                  </div>
                </div>
                <div style={{ width:32, height:32, borderRadius:"50%", background:"rgba(255,255,255,.15)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, transition:"transform .25s", transform: enrollOpen ? "rotate(180deg)" : "rotate(0deg)" }}>
                  <ChevronDown size={18} color="#fff" />
                </div>
              </button>

              {/* Collapsible body */}
              {enrollOpen && (
                <div style={{ animation:"slideDown .2s ease" }}>
                  <EnrollPanel onClose={close} onRegister={() => { close(); navigate("/register"); }} mobile />
                </div>
              )}
            </div>

            {/* Auth buttons */}
            <div style={{ display:"flex", flexDirection:"column", gap:10, padding:"0 16px 24px" }}>
              <Link to="/login" onClick={close}
                style={{ padding:"13px", borderRadius:12, textDecoration:"none", fontSize:14, fontWeight:600, color:G, border:`1.5px solid rgba(6,78,59,.2)`, textAlign:"center", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                <LogIn size={16} /> Sign In to Existing Account
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default PublicNav;
