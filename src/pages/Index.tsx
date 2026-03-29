import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const Index = () => {
  const navigate = useNavigate();
  const [liveClass, setLiveClass] = useState<{ title: string; room_code: string } | null>(null);
  const [showEnrollGuide, setShowEnrollGuide] = useState(false);

  useEffect(() => {
    supabase.from("public_classes").select("title, room_code").eq("status", "live").eq("is_featured", true).limit(1).then(({ data }) => {
      if (data && data.length > 0) setLiveClass(data[0] as { title: string; room_code: string });
    });
  }, []);

  useEffect(() => {
    // Inject Google Fonts
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=Cairo:wght@400;600;700&family=Amiri:wght@400;700&display=swap";
    document.head.appendChild(link);

    // Inject CSS
    const style = document.createElement("style");
    style.innerHTML = `
      .ta-root * { margin:0; padding:0; box-sizing:border-box; }
      .ta-root {
        font-family: 'Cairo', sans-serif;
        background: #fdf8f0;
        color: #1a1a1a;
        overflow-x: hidden;
      }
      @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }

      /* HERO */
      .ta-hero { min-height:100vh; position:relative; display:flex; align-items:center; overflow:hidden; }
      .ta-hero-bg {
        position:absolute; inset:0;
        background-image:url('https://images.unsplash.com/photo-1609599006353-e629aaabfeae?w=1600&q=90');
        background-size:cover; background-position:center top; filter:brightness(0.55);
      }
      .ta-hero-overlay {
        position:absolute; inset:0;
        background:linear-gradient(160deg, rgba(10,30,20,0.72) 0%, rgba(15,49,34,0.55) 40%, rgba(10,20,15,0.65) 100%);
      }
      .ta-hero-pattern {
        position:absolute; inset:0; opacity:0.06;
        background-image:url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c9973a' fill-opacity='1'%3E%3Cpath d='M30 0l8.66 5v10L30 20l-8.66-5V5zM0 17.32l8.66 5v10L0 37.32l-8.66-5v-10zM60 17.32l8.66 5v10L60 37.32l-8.66-5v-10zM30 34.64l8.66 5v10L30 54.64l-8.66-5v-10z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
      }
      .ta-hero-content {
        position:relative; z-index:2;
        max-width:1200px; margin:0 auto; padding:60px 40px 80px; text-align:center;
        display:grid; grid-template-columns:1fr 1fr; gap:60px; align-items:center; width:100%;
      }
      .ta-hero-badge {
        display:inline-flex; align-items:center; gap:8px;
        background:rgba(201,151,58,0.15); border:1px solid rgba(201,151,58,0.4);
        color:#e8c070; padding:6px 16px; border-radius:30px;
        font-size:12px; letter-spacing:1px; text-transform:uppercase; margin-bottom:24px;
      }
      .ta-hero-arabic {
        font-family:'Amiri',serif; font-size:34px; color:#fff;
        text-shadow:0 0 30px rgba(201,151,58,1), 0 2px 12px rgba(0,0,0,1);
        background:rgba(0,0,0,0.45); display:inline-block;
        padding:8px 22px; border-radius:10px;
        border-left:4px solid #c9973a; border-right:4px solid #c9973a;
        direction:rtl; margin-bottom:12px;
      }
      .ta-hero-title {
        font-family:'Cormorant Garamond',serif;
        font-size:clamp(38px,5vw,62px); font-weight:700;
        color:#fff; line-height:1.15; margin-bottom:20px;
      }
      .ta-hero-title em { color:#c9973a; font-style:normal; display:block; }
      .ta-hero-subtitle { color:rgba(255,255,255,0.75); font-size:16px; line-height:1.7; max-width:480px; margin:0 auto 36px; }
      .ta-hero-buttons { display:flex; gap:14px; flex-wrap:wrap; justify-content:center; }
      .ta-hero-btn-primary {
        padding:14px 32px; background:#c9973a; color:#fff;
        border:none; border-radius:8px; font-family:'Cairo',sans-serif;
        font-size:15px; font-weight:700; cursor:pointer; transition:0.25s;
      }
      .ta-hero-btn-primary:hover { background:#e8c070; transform:translateY(-2px); box-shadow:0 8px 24px rgba(201,151,58,0.4); }
      .ta-hero-btn-secondary {
        padding:14px 32px; background:transparent;
        border:2px solid rgba(255,255,255,0.4); color:#fff;
        border-radius:8px; font-family:'Cairo',sans-serif; font-size:15px; cursor:pointer; transition:0.25s;
      }
      .ta-hero-btn-secondary:hover { border-color:#fff; background:rgba(255,255,255,0.1); }
      .ta-hero-right { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
      .ta-hero-card { border-radius:16px; overflow:hidden; position:relative; box-shadow:0 20px 60px rgba(0,0,0,0.5); }
      .ta-hero-card:first-child { grid-column:span 2; height:220px; }
      .ta-hero-card:not(:first-child) { height:160px; }
      .ta-hero-card img { width:100%; height:100%; object-fit:cover; transition:0.4s; }
      .ta-hero-card:hover img { transform:scale(1.05); }
      .ta-hero-card-label {
        position:absolute; bottom:0; left:0; right:0;
        background:linear-gradient(transparent, rgba(0,0,0,0.7));
        color:#fff; padding:20px 16px 12px; font-size:13px; font-weight:600;
      }

      /* FEATURES STRIP */
      .ta-features-strip { background:#0f3122; padding:20px 40px; display:flex; justify-content:center; gap:60px; flex-wrap:wrap; }
      .ta-feature-item { display:flex; align-items:center; gap:10px; color:rgba(255,255,255,0.85); font-size:14px; }
      .ta-dot { width:8px; height:8px; background:#c9973a; border-radius:50%; display:inline-block; }

      /* AYAH BANNER */
      .ta-ayah-section { position:relative; padding:90px 40px; overflow:hidden; background:#0f3122; text-align:center; }
      .ta-ayah-bg {
        position:absolute; inset:0;
        background-image:url('https://images.unsplash.com/photo-1519817650390-64a93db51149?w=1600&q=80');
        background-size:cover; background-position:center 30%;
        filter:brightness(0.15) saturate(0.5);
      }
      .ta-ayah-geometric {
        position:absolute; inset:0; opacity:0.07;
        background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Cpolygon points='40,4 76,20 76,60 40,76 4,60 4,20' fill='none' stroke='%23c9973a' stroke-width='1'/%3E%3Cpolygon points='40,14 66,26 66,54 40,66 14,54 14,26' fill='none' stroke='%23c9973a' stroke-width='0.5'/%3E%3Ccircle cx='40' cy='40' r='10' fill='none' stroke='%23c9973a' stroke-width='0.5'/%3E%3C/svg%3E");
      }
      .ta-ayah-content { position:relative; z-index:2; max-width:860px; margin:0 auto; }
      .ta-ayah-ornament { font-size:32px; color:#c9973a; opacity:0.6; margin-bottom:20px; display:block; }
      .ta-ayah-divider { display:flex; align-items:center; gap:16px; justify-content:center; margin:18px 0; }
      .ta-ayah-divider-line { display:block; height:1px; width:120px; background:linear-gradient(to right, transparent, #c9973a, transparent); }
      .ta-ayah-diamond { color:#c9973a; font-size:10px; }
      .ta-ayah-main { font-family:'Amiri',serif; font-size:clamp(28px,5vw,52px); color:#fff; line-height:1.7; direction:rtl; letter-spacing:2px; text-shadow:0 2px 20px rgba(201,151,58,0.3); }
      .ta-ayah-translation { font-family:'Cormorant Garamond',serif; font-size:clamp(16px,2.5vw,22px); color:#e8c070; font-style:italic; margin-top:10px; letter-spacing:0.5px; }
      .ta-ayah-ref { margin-top:14px; font-size:13px; color:rgba(255,255,255,0.45); letter-spacing:1px; }

      /* WHY SECTION */
      .ta-why-outer { padding:90px 40px; }
      .ta-why-inner { max-width:1200px; margin:0 auto; text-align:center; }
      .ta-section-tag { color:#c9973a; font-size:12px; text-transform:uppercase; letter-spacing:2px; font-weight:700; margin-bottom:12px; }
      .ta-section-title { font-family:'Cormorant Garamond',serif; font-size:42px; font-weight:700; color:#0f3122; margin-bottom:16px; line-height:1.2; }
      .ta-section-subtitle { color:#555; font-size:16px; line-height:1.7; max-width:560px; margin:0 auto 52px; }
      .ta-why-grid { display:grid; grid-template-columns:1fr 1fr; gap:24px; }
      .ta-why-card { position:relative; border-radius:20px; overflow:hidden; height:300px; cursor:pointer; box-shadow:0 10px 40px rgba(0,0,0,0.12); }
      .ta-why-card img { width:100%; height:100%; object-fit:cover; transition:0.5s; }
      .ta-why-card:hover img { transform:scale(1.08); }
      .ta-why-card-body {
        position:absolute; inset:0;
        background:linear-gradient(0deg, rgba(15,49,34,0.92) 0%, rgba(15,49,34,0.3) 60%, transparent 100%);
        display:flex; flex-direction:column; justify-content:flex-end; padding:28px;
      }
      .ta-why-card-icon { font-size:28px; margin-bottom:10px; }
      .ta-why-card-title { font-family:'Cormorant Garamond',serif; font-size:22px; font-weight:700; color:#fff; margin-bottom:6px; }
      .ta-why-card-text { color:rgba(255,255,255,0.75); font-size:13px; line-height:1.6; }
      .ta-why-card-large { grid-row:span 2; height:100%; min-height:624px; }

      /* COURSES */
      .ta-courses-section { background:#0f3122; padding:90px 40px; }
      .ta-courses-inner { max-width:1200px; margin:0 auto; }
      .ta-courses-section .ta-section-title { color:#fff; }
      .ta-courses-section .ta-section-subtitle { color:rgba(255,255,255,0.65); }
      .ta-courses-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:24px; }
      .ta-course-card { background:rgba(255,255,255,0.06); border:1px solid rgba(201,151,58,0.2); border-radius:16px; overflow:hidden; transition:0.3s; }
      .ta-course-card:hover { transform:translateY(-6px); border-color:#c9973a; background:rgba(255,255,255,0.1); }
      .ta-course-img { height:180px; overflow:hidden; position:relative; }
      .ta-course-img img { width:100%; height:100%; object-fit:cover; transition:0.4s; }
      .ta-course-card:hover .ta-course-img img { transform:scale(1.06); }
      .ta-course-badge { position:absolute; top:12px; right:12px; background:#c9973a; color:#fff; font-size:11px; font-weight:700; padding:4px 10px; border-radius:20px; }
      .ta-course-body { padding:20px; }
      .ta-course-arabic { font-family:'Amiri',serif; font-size:16px; color:#e8c070; direction:rtl; margin-bottom:4px; }
      .ta-course-title { color:#fff; font-size:16px; font-weight:700; margin-bottom:8px; }
      .ta-course-desc { color:rgba(255,255,255,0.6); font-size:13px; line-height:1.6; margin-bottom:16px; }
      .ta-course-footer { display:flex; justify-content:space-between; align-items:center; }
      .ta-course-level { font-size:12px; color:#e8c070; }
      .ta-course-btn { padding:7px 18px; background:#c9973a; color:#fff; border:none; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer; font-family:'Cairo',sans-serif; }

      /* STATS */
      .ta-stats-section {
        padding:70px 40px;
        background:url('https://images.unsplash.com/photo-1585036156171-384164a8c675?w=1600&q=80') center/cover no-repeat;
        position:relative;
      }
      .ta-stats-section::before { content:''; position:absolute; inset:0; background:rgba(15,49,34,0.88); }
      .ta-stats-inner { position:relative; z-index:1; max-width:1000px; margin:0 auto; text-align:center; }
      .ta-stats-arabic { font-family:'Amiri',serif; font-size:22px; color:#e8c070; margin-bottom:8px; }
      .ta-stats-title { font-family:'Cormorant Garamond',serif; font-size:38px; color:#fff; margin-bottom:50px; }
      .ta-stats-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:30px; }
      .ta-stat-number { font-family:'Cormorant Garamond',serif; font-size:52px; color:#c9973a; font-weight:700; line-height:1; }
      .ta-stat-label { color:rgba(255,255,255,0.7); font-size:14px; margin-top:8px; }

      /* CTA */
      .ta-cta-section { padding:90px 40px; text-align:center; background:#fdf8f0; }
      .ta-cta-inner { max-width:650px; margin:0 auto; }
      .ta-cta-arabic { font-family:'Amiri',serif; font-size:26px; color:#c9973a; margin-bottom:16px; }
      .ta-cta-title { font-family:'Cormorant Garamond',serif; font-size:42px; color:#0f3122; font-weight:700; margin-bottom:16px; }
      .ta-cta-text { color:#666; font-size:16px; margin-bottom:36px; line-height:1.7; }
      .ta-cta-btn { padding:16px 48px; background:#0f3122; color:#fff; border:none; border-radius:10px; font-family:'Cairo',sans-serif; font-size:16px; font-weight:700; cursor:pointer; transition:0.25s; }
      .ta-cta-btn:hover { background:#1a4d35; transform:translateY(-2px); box-shadow:0 12px 30px rgba(15,49,34,0.3); }

      /* WHY TAHLEEM 6 CARDS */
      .ta-why6-section { background:#fff; padding:80px 20px; }
      .ta-why6-inner { max-width:1100px; margin:0 auto; text-align:center; }
      .ta-why6-tag { display:inline-block; background:rgba(15,49,34,0.08); color:#0f3122; border:1px solid rgba(15,49,34,0.2); padding:5px 18px; border-radius:30px; font-family:'Amiri',serif; font-size:14px; margin-bottom:14px; }
      .ta-why6-title { font-family:'Cormorant Garamond',serif; font-size:38px; font-weight:700; color:#0f3122; margin-bottom:16px; }
      .ta-why6-subtitle { font-size:16px; color:#555; max-width:680px; margin:0 auto 50px; line-height:1.8; }
      .ta-why6-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:24px; }
      .ta-why6-card { background:#fdf8f0; border:1px solid #e8e0d0; border-radius:14px; padding:28px 24px; text-align:left; transition:0.3s; border-bottom:3px solid transparent; }
      .ta-why6-card:hover { transform:translateY(-4px); box-shadow:0 8px 28px rgba(0,0,0,0.08); border-bottom-color:#c9973a; }
      .ta-why6-icon { font-size:32px; margin-bottom:14px; }
      .ta-why6-card h3 { font-size:16px; font-weight:700; color:#0f3122; margin-bottom:8px; }
      .ta-why6-card p { font-size:13.5px; color:#666; line-height:1.7; }

      /* FOOTER */
      .ta-footer { background:#0a1e14; color:#ccc; padding:60px 20px 0; }
      .ta-footer-top { max-width:1100px; margin:0 auto; display:grid; grid-template-columns:2fr 1fr 1fr 1.5fr; gap:40px; padding-bottom:50px; }
      .ta-footer-logo { display:flex; align-items:center; gap:12px; margin-bottom:16px; }
      .ta-footer-logo-icon { width:44px; height:44px; background:#c9973a; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:22px; }
      .ta-footer-logo-name { font-family:'Cormorant Garamond',serif; font-size:20px; font-weight:700; color:#fff; }
      .ta-footer-logo-ar { font-family:'Amiri',serif; font-size:14px; color:#c9973a; }
      .ta-footer-tagline { font-size:13.5px; line-height:1.8; color:rgba(255,255,255,0.55); margin-bottom:20px; max-width:300px; }
      .ta-footer-social { display:flex; gap:10px; flex-wrap:wrap; }
      .ta-social-btn { display:inline-block; padding:7px 16px; border:1px solid rgba(201,151,58,0.4); color:#c9973a; border-radius:6px; font-size:12px; text-decoration:none; transition:0.2s; }
      .ta-social-btn:hover { background:#c9973a; color:#fff; }
      .ta-footer-heading { font-size:14px; font-weight:700; color:#fff; margin-bottom:18px; padding-bottom:8px; border-bottom:1px solid rgba(201,151,58,0.3); text-transform:uppercase; letter-spacing:0.5px; }
      .ta-footer-links { list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:10px; }
      .ta-footer-links a { color:rgba(255,255,255,0.55); text-decoration:none; font-size:13.5px; transition:0.2s; }
      .ta-footer-links a:hover { color:#c9973a; }
      .ta-footer-contact { list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:12px; }
      .ta-footer-contact li { display:flex; align-items:flex-start; gap:10px; font-size:13px; }
      .ta-contact-icon { font-size:15px; margin-top:1px; }
      .ta-footer-contact a { color:rgba(255,255,255,0.6); text-decoration:none; transition:0.2s; word-break:break-all; }
      .ta-footer-contact a:hover { color:#c9973a; }
      .ta-footer-divider { max-width:1100px; margin:0 auto; border:none; border-top:1px solid rgba(255,255,255,0.08); }
      .ta-footer-bottom { max-width:1100px; margin:0 auto; padding:20px 0 24px; display:flex; flex-direction:column; align-items:center; gap:6px; text-align:center; }
      .ta-footer-bottom-arabic { font-family:'Amiri',serif; font-size:18px; color:#c9973a; }
      .ta-footer-copy { font-size:12px; color:rgba(255,255,255,0.35); }

      /* RESPONSIVE */
      @media(max-width:768px){
        .ta-hero-content { grid-template-columns:1fr; padding:60px 20px 60px; }
        .ta-hero-right { display:none; }
        .ta-why-grid, .ta-courses-grid, .ta-why6-grid { grid-template-columns:1fr; }
        .ta-stats-grid { grid-template-columns:1fr 1fr; }
        .ta-features-strip { gap:20px; }
        .ta-why-outer, .ta-cta-section { padding:60px 20px; }
        .ta-footer-top { grid-template-columns:1fr; gap:30px; }
        .ta-why6-title { font-size:28px; }
        .ta-why-card-large { min-height:300px; }
      }
    `;
    document.head.appendChild(style);

    return () => {
      document.head.removeChild(link);
      document.head.removeChild(style);
    };
  }, []);

  return (
    <div className="ta-root">

      {/* LIVE NOW BANNER */}
      {liveClass && (
        <div onClick={() => navigate(`/live/${liveClass.room_code}`)} style={{
          background: "linear-gradient(90deg, #0f3122, #1a5c3a)",
          borderBottom: "2px solid #c9973a",
          padding: "12px 24px",
          display: "flex", alignItems: "center", justifyContent: "center", gap: "12px",
          cursor: "pointer",
        }}>
          <span style={{ width: "10px", height: "10px", background: "#ef4444", borderRadius: "50%", animation: "pulse 1.5s infinite" }} />
          <span style={{ color: "white", fontWeight: 600, fontSize: "14px" }}>
            🔴 LIVE NOW: {liveClass.title} — Join Free →
          </span>
        </div>
      )}

      {/* HERO */}
      <section className="ta-hero">
        <div className="ta-hero-bg"></div>
        <div className="ta-hero-overlay"></div>
        <div className="ta-hero-pattern"></div>
        <div className="ta-hero-content">
          <div className="ta-hero-left">
            <div className="ta-hero-badge">✦ Arabic Learning Excellence ✦</div>
            <div className="ta-hero-arabic">بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ</div>
            <h1 className="ta-hero-title">
              Master Arabic &amp;
              <em>Islamic Sciences</em>
            </h1>
            <p className="ta-hero-subtitle">
              Learn Quran, Tajweed, Arabic Language and Islamic Studies with qualified scholars — live, interactive, and designed for every level.
            </p>
            <div className="ta-hero-buttons" style={{ flexDirection: "column", alignItems: "flex-start", gap: 10 }}>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <button
                  className="ta-hero-btn-primary"
                  onClick={() => navigate("/register")}
                  style={{ borderRadius: 8, minWidth: 160 }}
                >
                  Enroll Now
                </button>
                <button
                  onClick={() => setShowEnrollGuide(v => !v)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "14px 22px", background: "transparent",
                    border: "2px solid rgba(255,255,255,0.35)", color: "#fff",
                    borderRadius: 8, fontSize: 15, cursor: "pointer",
                    fontFamily: "'Cairo',sans-serif", transition: "0.25s",
                  }}
                >
                  How to Enroll {showEnrollGuide ? "▲" : "▼"}
                </button>
              </div>
              {/* Expandable enrollment guide */}
              {showEnrollGuide && (
                <div style={{
                  background: "rgba(0,0,0,0.55)", backdropFilter: "blur(12px)",
                  border: "1px solid rgba(201,168,76,0.3)", borderRadius: 14,
                  padding: "20px 22px", maxWidth: 420, animation: "fadeUp .3s ease",
                }}>
                  <p style={{ fontSize: 13, fontWeight: 800, color: "#c9a84c", margin: "0 0 14px", letterSpacing: 0.5 }}>📋 ENROLLMENT STEPS</p>
                  {[
                    { n: "1", icon: "👤", title: "Create Your Account", desc: "Register with your name, email and password" },
                    { n: "2", icon: "💳", title: "Complete Payment", desc: "Pay the one-time registration fee (if enabled)" },
                    { n: "3", icon: "📝", title: "Fill Onboarding Form", desc: "Tell us about your background and goals" },
                    { n: "4", icon: "📖", title: "Take Entrance Exam", desc: "Written assessment with full proctoring" },
                    { n: "5", icon: "🎤", title: "Recitation Test", desc: "Audio evaluation of your Quran recitation" },
                    { n: "6", icon: "✅", title: "Admin Approval", desc: "Admin reviews results and assigns your level" },
                    { n: "7", icon: "🚀", title: "Access Dashboard", desc: "Start your learning journey!" },
                  ].map(s => (
                    <div key={s.n} style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 10 }}>
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#c9a84c", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{s.n}</div>
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 700, color: "#fff", margin: 0 }}>{s.icon} {s.title}</p>
                        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", margin: 0 }}>{s.desc}</p>
                      </div>
                    </div>
                  ))}
                  <button onClick={() => navigate("/register")}
                    style={{ width: "100%", marginTop: 8, padding: "11px", borderRadius: 10, border: "none", background: "#c9a84c", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
                    Enroll Now →
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="ta-hero-right">
            <div className="ta-hero-card">
              <img src="https://images.unsplash.com/photo-1609599006353-e629aaabfeae?w=800&q=80" alt="Islamic study" />
              <div className="ta-hero-card-label">📖 Live Quranic Classes</div>
            </div>
            <div className="ta-hero-card">
              <img src="https://images.unsplash.com/photo-1519817650390-64a93db51149?w=400&q=80" alt="Mosque" />
              <div className="ta-hero-card-label">🕌 Expert Scholars</div>
            </div>
            <div className="ta-hero-card">
              <img src="https://images.unsplash.com/photo-1585036156171-384164a8c675?w=400&q=80" alt="Arabic" />
              <div className="ta-hero-card-label">🌙 Certified Exams</div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES STRIP */}
      <div className="ta-features-strip">
        {["Structured Curriculum by Scholars","Live Interactive Classes","Bilingual Arabic & English","Certificates Upon Completion","Recorded Sessions"].map((f) => (
          <div className="ta-feature-item" key={f}><span className="ta-dot"></span> {f}</div>
        ))}
      </div>

      {/* AYAH BANNER */}
      <section className="ta-ayah-section">
        <div className="ta-ayah-bg"></div>
        <div className="ta-ayah-geometric"></div>
        <div className="ta-ayah-content">
          <span className="ta-ayah-ornament">❧</span>
          <div className="ta-ayah-divider">
            <span className="ta-ayah-divider-line"></span>
            <span className="ta-ayah-diamond">◆</span>
            <span className="ta-ayah-divider-line"></span>
          </div>
          <div className="ta-ayah-main">وَتَوَكَّلْ عَلَى اللَّهِ ۚ وَكَفَىٰ بِاللَّهِ وَكِيلًا</div>
          <div className="ta-ayah-divider">
            <span className="ta-ayah-divider-line"></span>
            <span className="ta-ayah-diamond">◆</span>
            <span className="ta-ayah-divider-line"></span>
          </div>
          <div className="ta-ayah-translation">"And put your trust in Allah — and Allah is sufficient as a Disposer of affairs."</div>
          <div className="ta-ayah-ref">سورة الأحزاب — Surah Al-Ahzab, Ayah 3</div>
        </div>
      </section>

      {/* WHY SECTION — 3 IMAGE CARDS */}
      <section className="ta-why-outer">
        <div className="ta-why-inner">
          <div className="ta-section-tag" style={{direction:"rtl", fontFamily:"'Amiri',serif", fontSize:"20px", letterSpacing:"0", textTransform:"none"}}>وَفَوْقَ كُلِّ ذِي عِلْمٍ عَلِيمٌ</div>
          <div style={{color:"#c9973a", fontSize:"13px", letterSpacing:"2px", textTransform:"uppercase", fontWeight:700, marginBottom:"12px"}}>Above Every Knower Is One More Knowing</div>
          <h2 className="ta-section-title">Seeking Knowledge Is<br />An Act of Worship</h2>
          <p className="ta-section-subtitle">
            The Prophet ﷺ said: <strong style={{color:"#0f3122"}}>
              "Seeking knowledge is an obligation upon every Muslim."
            </strong>
            <br />At Tahleem Academy, we honour this sacred duty — nurturing every student's mind, heart and soul through authentic Islamic education.
          </p>
        </div>
      </section>

      {/* COURSES */}
      <section className="ta-courses-section">
        <div className="ta-courses-inner">
          <div className="ta-section-tag" style={{color:"#e8c070"}}>Our Programs</div>
          <h2 className="ta-section-title" style={{color:"#fff"}}>Explore Our Courses</h2>
          <p className="ta-section-subtitle" style={{color:"rgba(255,255,255,0.65)",marginBottom:"40px"}}>
            Each course is carefully structured with live sessions, assignments, and certified exams.
          </p>
          <div className="ta-courses-grid">
            {[
              { img: "/images/quran-tajweed.jpeg", badge:"Most Popular", ar:"القرآن والتجويد", en:"Quran & Tajweed", desc:"Perfect your recitation with certified Huffadh — from beginner Qaida to advanced Tajweed rules.", level:"⭐ All Levels" },
              { img: "/images/arabic-language.jpeg", badge:"New", ar:"اللغة العربية", en:"Arabic Language", desc:"From beginner to advanced — reading, writing, grammar and spoken Arabic.", level:"⭐ Beginner Friendly" },
              { img:"https://images.unsplash.com/photo-1519817650390-64a93db51149?w=600&q=80", badge:"Certified", ar:"العلوم الإسلامية", en:"Islamic Sciences", desc:"Fiqh, Aqeedah, Seerah — comprehensive Islamic education with qualified scholars.", level:"⭐ Intermediate" },
            ].map((c) => (
              <div className="ta-course-card" key={c.en}>
                <div className="ta-course-img">
                  <img src={c.img} alt={c.en} />
                  <div className="ta-course-badge">{c.badge}</div>
                </div>
                <div className="ta-course-body">
                  <div className="ta-course-arabic">{c.ar}</div>
                  <div className="ta-course-title">{c.en}</div>
                  <div className="ta-course-desc">{c.desc}</div>
                  <div className="ta-course-footer">
                    <span className="ta-course-level">{c.level}</span>
                    <button className="ta-course-btn" onClick={() => navigate("/register")}>Enroll Now</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* STATS */}
      <section className="ta-stats-section">
        <div className="ta-stats-inner">
          <div className="ta-stats-arabic">الحمد لله على نعمة العلم</div>
          <h2 className="ta-stats-title">Growing Together in Knowledge</h2>
          <div className="ta-stats-grid">
            {[["500+","Lessons Delivered"],["3","Certified Scholars"],["95%","Student Satisfaction"],["4","Core Programs"]].map(([n,l]) => (
              <div key={l}>
                <div className="ta-stat-number">{n}</div>
                <div className="ta-stat-label">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="ta-cta-section">
        <div className="ta-cta-inner">
          <div className="ta-cta-arabic">اطلبوا العلم من المهد إلى اللحد</div>
          <h2 className="ta-cta-title">Begin Your Journey Today</h2>
          <p className="ta-cta-text">Join Tahleem Academy and take your first step towards mastering Arabic and Islamic knowledge — guided by qualified scholars.</p>
          <button className="ta-cta-btn" onClick={() => navigate("/register")}>Enroll Now →</button>
        </div>
      </section>

      {/* WHY TAHLEEM — 6 CARDS */}
      <section className="ta-why6-section">
        <div className="ta-why6-inner">
          <div className="ta-why6-tag">لماذا أكاديمية التعليم؟</div>
          <h2 className="ta-why6-title">Why Tahleem Academy?</h2>
          <p className="ta-why6-subtitle">Dedicated to nurturing the next generation of Muslims through comprehensive Islamic education that combines traditional values with modern teaching excellence.</p>
          <div className="ta-why6-grid">
            {[
              {icon:"🕌",title:"Traditional Foundation",text:"Our curriculum is rooted in authentic Islamic scholarship — the same knowledge passed down through generations of scholars."},
              {icon:"💻",title:"Modern Platform",text:"Live classes, recorded sessions, interactive exams and progress tracking — all in one place, accessible anywhere."},
              {icon:"👨‍🏫",title:"Qualified Teachers",text:"Learn from certified Islamic scholars and Arabic language specialists who are passionate about your growth."},
              {icon:"📊",title:"Track Your Progress",text:"Detailed transcripts, term results and performance reports help students and parents stay informed at every stage."},
              {icon:"🤲",title:"Inclusive Community",text:"Group classes and one-on-one private sessions available — tailored learning for every student's needs and pace."},
              {icon:"🏆",title:"Certified Programmes",text:"Earn recognised certificates in Arabic Language, Tajweed, Quran Memorisation and Islamic Sciences."},
            ].map((c) => (
              <div className="ta-why6-card" key={c.title}>
                <div className="ta-why6-icon">{c.icon}</div>
                <h3>{c.title}</h3>
                <p>{c.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="ta-footer">
        <div className="ta-footer-top">
          <div>
            <div className="ta-footer-logo">
              <div className="ta-footer-logo-icon">📖</div>
              <div>
                <div className="ta-footer-logo-name">Tahleem Academy</div>
                <div className="ta-footer-logo-ar">أكاديمية التعليم</div>
              </div>
            </div>
            <p className="ta-footer-tagline">Empowering students to master Arabic and Islamic knowledge through structured learning and certified excellence.</p>
            <div className="ta-footer-social">
              <a href="mailto:Tahleemacademy09@gmail.com" className="ta-social-btn">✉️ Email Us</a>
              <a href="https://wa.me/2348163310471" className="ta-social-btn">💬 WhatsApp</a>
            </div>
          </div>
          <div>
            <h4 className="ta-footer-heading">Quick Links</h4>
            <ul className="ta-footer-links">
              {[
                {label:"🏠 Home", path:"/"},
                {label:"📚 Courses", path:"/courses"},
                {label:"ℹ️ About Us", path:"/about"},
                {label:"📞 Contact", path:"/contact"},
              ].map(l=><li key={l.label}><a onClick={() => navigate(l.path)} style={{cursor:"pointer"}}>{l.label}</a></li>)}
            </ul>
          </div>
          <div>
            <h4 className="ta-footer-heading">Programs</h4>
            <ul className="ta-footer-links">
              {["🔤 Arabic Language","🎵 Tajweed","📖 Quran Memorisation","⚖️ Islamic Fiqh","🕌 Islamic Sciences"].map(l=><li key={l}><a href="#">{l}</a></li>)}
            </ul>
          </div>
          <div>
            <h4 className="ta-footer-heading">Contact Us</h4>
            <ul className="ta-footer-contact">
              <li><span className="ta-contact-icon">✉️</span><a href="mailto:Tahleemacademy09@gmail.com">Tahleemacademy09@gmail.com</a></li>
              <li><span className="ta-contact-icon">📱</span><a href="tel:+2348163310471">+234 816 331 0471</a></li>
              <li><span className="ta-contact-icon">💬</span><a href="https://wa.me/2348163310471">WhatsApp Us</a></li>
              <li><span className="ta-contact-icon">🌐</span><a href="https://tahleemacademy.lovable.app">tahleemacademy.lovable.app</a></li>
            </ul>
          </div>
        </div>
        <div className="ta-footer-divider"></div>
        <div className="ta-footer-bottom">
          <div className="ta-footer-bottom-arabic">وَقُل رَّبِّ زِدْنِي عِلْمًا</div>
          <div className="ta-footer-copy">© 2026 Tahleem Academy. All Rights Reserved. Built with ❤️ for the Ummah.</div>
        </div>
      </footer>

    </div>
  );
};

export default Index;