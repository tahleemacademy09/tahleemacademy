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
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Scheherazade+New:wght@400;700&family=Playfair+Display:ital,wght@0,600;0,700;0,800;1,600&family=Mulish:wght@400;500;600;700;800&family=Cairo:wght@400;600;700&display=swap";
    document.head.appendChild(link);

    const style = document.createElement("style");
    style.innerHTML = `
      .ta-root * { margin:0; padding:0; box-sizing:border-box; }
      .ta-root { font-family:'Mulish',sans-serif; background:#faf7f2; color:#1a1a1a; overflow-x:hidden; }

      @keyframes fadeUp  { from{opacity:0;transform:translateY(22px)} to{opacity:1;transform:translateY(0)} }
      @keyframes shimmer { 0%,100%{opacity:.7} 50%{opacity:1} }
      @keyframes scaleIn { from{opacity:0;transform:scale(.97)} to{opacity:1;transform:scale(1)} }
      @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:.35} }

      /* HERO */
      .ta-hero { position:relative; min-height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; overflow:hidden; }
      .ta-hero-bg { position:absolute; inset:0; background-image:url('https://images.unsplash.com/photo-1609599006353-e629aaabfeae?w=1600&q=90'); background-size:cover; background-position:center 25%; }
      .ta-hero-overlay { position:absolute; inset:0; background:linear-gradient(175deg,rgba(6,18,10,.92) 0%,rgba(11,36,22,.84) 50%,rgba(6,14,9,.94) 100%); }
      .ta-hero-tile { position:absolute; inset:0; opacity:.04; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cg fill='none' stroke='%23c9973a' stroke-width='.8'%3E%3Cpolygon points='60,6 114,33 114,87 60,114 6,87 6,33'/%3E%3Cpolygon points='60,22 98,42 98,78 60,98 22,78 22,42'/%3E%3Ccircle cx='60' cy='60' r='22'/%3E%3Cline x1='60' y1='6' x2='60' y2='22'/%3E%3Cline x1='114' y1='33' x2='98' y2='42'/%3E%3Cline x1='114' y1='87' x2='98' y2='78'/%3E%3Cline x1='60' y1='114' x2='60' y2='98'/%3E%3Cline x1='6' y1='87' x2='22' y2='78'/%3E%3Cline x1='6' y1='33' x2='22' y2='42'/%3E%3C/g%3E%3C/svg%3E"); }
      .ta-hero-arch { position:absolute; top:0; left:50%; transform:translateX(-50%); width:min(560px,92vw); height:100%; border-left:1px solid rgba(201,151,58,.16); border-right:1px solid rgba(201,151,58,.16); pointer-events:none; }
      .ta-hero-arch::before { content:''; position:absolute; top:0; left:-1px; right:-1px; height:3px; background:linear-gradient(90deg,transparent,#c9973a,transparent); }
      .ta-hero-arch::after  { content:''; position:absolute; bottom:0; left:-1px; right:-1px; height:3px; background:linear-gradient(90deg,transparent,#c9973a,transparent); }

      .ta-hero-content { position:relative; z-index:2; text-align:center; padding:0 24px; max-width:700px; width:100%; animation:scaleIn .9s ease both; }
      .ta-hero-badge { display:inline-flex; align-items:center; gap:10px; background:rgba(201,151,58,.1); border:1px solid rgba(201,151,58,.32); color:#e8c270; padding:7px 20px; border-radius:40px; font-size:11px; letter-spacing:2px; text-transform:uppercase; font-weight:800; margin-bottom:30px; animation:fadeUp .7s .1s ease both; }
      .ta-hero-bismi { font-family:'Scheherazade New',serif; font-size:clamp(24px,5vw,46px); color:#fff; line-height:1.65; direction:rtl; margin-bottom:12px; text-shadow:0 0 40px rgba(201,151,58,.45); animation:fadeUp .7s .2s ease both; }
      .ta-hero-div { display:flex; align-items:center; gap:14px; justify-content:center; margin:14px 0 20px; animation:fadeUp .7s .25s ease both; }
      .ta-hero-div-line { flex:1; max-width:100px; height:1px; background:linear-gradient(90deg,transparent,rgba(201,151,58,.55),transparent); }
      .ta-hero-title { font-family:'Playfair Display',serif; font-size:clamp(36px,6.5vw,68px); font-weight:800; color:#fff; line-height:1.1; margin-bottom:10px; animation:fadeUp .7s .3s ease both; letter-spacing:-.5px; }
      .ta-hero-title em { font-style:italic; color:#c9973a; display:block; }
      .ta-hero-sub { color:rgba(255,255,255,.68); font-size:clamp(14px,2vw,17px); line-height:1.85; max-width:520px; margin:16px auto 32px; font-weight:400; animation:fadeUp .7s .4s ease both; }
      .ta-hero-btns { display:flex; gap:12px; flex-wrap:wrap; justify-content:center; animation:fadeUp .7s .5s ease both; }
      .ta-btn-p { padding:15px 38px; background:#c9973a; color:#fff; border:none; border-radius:5px; font-family:'Mulish',sans-serif; font-size:15px; font-weight:800; cursor:pointer; transition:.25s; letter-spacing:.3px; }
      .ta-btn-p:hover { background:#dba94b; transform:translateY(-2px); box-shadow:0 12px 32px rgba(201,151,58,.42); }
      .ta-btn-s { padding:15px 38px; background:transparent; border:1.5px solid rgba(255,255,255,.28); color:#fff; border-radius:5px; font-family:'Mulish',sans-serif; font-size:15px; font-weight:600; cursor:pointer; transition:.25s; }
      .ta-btn-s:hover { border-color:rgba(255,255,255,.65); background:rgba(255,255,255,.08); }
      .ta-hero-scroll { position:absolute; bottom:28px; left:50%; transform:translateX(-50%); z-index:2; display:flex; flex-direction:column; align-items:center; gap:6px; color:rgba(255,255,255,.35); font-size:10px; letter-spacing:2px; text-transform:uppercase; animation:shimmer 2.5s infinite; }
      .ta-hero-scroll-line { width:1px; height:38px; background:linear-gradient(to bottom,rgba(201,151,58,.55),transparent); }

      /* STRIP */
      .ta-strip { background:#0c2115; border-top:1px solid rgba(201,151,58,.18); border-bottom:1px solid rgba(201,151,58,.18); padding:16px 20px; display:flex; justify-content:center; gap:0; flex-wrap:nowrap; overflow:hidden; }
      .ta-strip-item { display:flex; align-items:center; gap:8px; color:rgba(255,255,255,.72); font-size:13px; font-weight:600; padding:0 22px; border-right:1px solid rgba(201,151,58,.14); white-space:nowrap; }
      .ta-strip-item:last-child { border-right:none; }

      /* AYAH */
      .ta-ayah { position:relative; padding:80px 24px; background:#0c2115; text-align:center; overflow:hidden; }
      .ta-ayah-pat { position:absolute; inset:0; opacity:.055; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Cpolygon points='40,4 76,20 76,60 40,76 4,60 4,20' fill='none' stroke='%23c9973a' stroke-width='.75'/%3E%3Cpolygon points='40,16 64,28 64,52 40,64 16,52 16,28' fill='none' stroke='%23c9973a' stroke-width='.4'/%3E%3C/svg%3E"); }
      .ta-ayah-inner { position:relative; z-index:2; max-width:800px; margin:0 auto; }
      .ta-ayah-box { border:1px solid rgba(201,151,58,.22); border-radius:3px; padding:50px 40px; position:relative; }
      .ta-ayah-box::before { content:'✦'; position:absolute; top:-15px; left:50%; transform:translateX(-50%); font-size:22px; color:#c9973a; background:#0c2115; padding:0 14px; }
      .ta-ayah-text { font-family:'Scheherazade New',serif; font-size:clamp(28px,5vw,52px); color:#fff; direction:rtl; line-height:1.75; text-shadow:0 2px 24px rgba(201,151,58,.22); margin-bottom:22px; }
      .ta-ayah-divrow { display:flex; align-items:center; gap:14px; justify-content:center; margin:0 0 18px; }
      .ta-ayah-dline { flex:1; max-width:90px; height:1px; background:linear-gradient(90deg,transparent,rgba(201,151,58,.45),transparent); }
      .ta-ayah-trans { font-family:'Playfair Display',serif; font-style:italic; font-size:clamp(16px,2.5vw,22px); color:#e8c270; line-height:1.6; margin-bottom:12px; }
      .ta-ayah-ref { font-size:11.5px; color:rgba(255,255,255,.32); letter-spacing:1.5px; text-transform:uppercase; }

      /* SECTION UTILS */
      .ta-eyebrow { display:inline-flex; align-items:center; gap:10px; color:#c9973a; font-size:11px; letter-spacing:2.5px; text-transform:uppercase; font-weight:800; margin-bottom:14px; }
      .ta-eyebrow-line { display:block; width:30px; height:1.5px; background:#c9973a; }
      .ta-heading { font-family:'Playfair Display',serif; font-size:clamp(28px,4vw,44px); font-weight:700; color:#0c2115; line-height:1.15; margin-bottom:14px; }
      .ta-body { font-size:15.5px; color:#5a5a5a; line-height:1.85; max-width:580px; font-weight:400; }

      /* PILLARS */
      .ta-pillars { padding:88px 24px; background:#faf7f2; }
      .ta-pillars-inner { max-width:1100px; margin:0 auto; }
      .ta-pillars-hdr { display:grid; grid-template-columns:1fr 1fr; gap:48px; align-items:end; margin-bottom:56px; }
      .ta-pillars-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:2px; background:#e5ddd4; }
      .ta-pillar { background:#faf7f2; padding:34px 28px; transition:.3s; position:relative; overflow:hidden; }
      .ta-pillar::after { content:''; position:absolute; bottom:0; left:0; right:0; height:2px; background:#c9973a; transform:scaleX(0); transform-origin:left; transition:.35s ease; }
      .ta-pillar:hover::after { transform:scaleX(1); }
      .ta-pillar:hover { background:#fff; }
      .ta-pillar-n { font-family:'Playfair Display',serif; font-size:46px; font-weight:700; color:rgba(201,151,58,.13); line-height:1; margin-bottom:14px; }
      .ta-pillar-icon { font-size:26px; margin-bottom:12px; display:block; }
      .ta-pillar-title { font-size:15.5px; font-weight:800; color:#0c2115; margin-bottom:8px; }
      .ta-pillar-text { font-size:13px; color:#6a6a6a; line-height:1.8; }
      .ta-pillars-ar { font-family:'Scheherazade New',serif; font-size:22px; color:rgba(201,151,58,.55); direction:rtl; margin-bottom:12px; display:block; }

      /* COURSES */
      .ta-courses { background:#0c2115; padding:88px 24px; }
      .ta-courses-inner { max-width:1100px; margin:0 auto; }
      .ta-courses-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:20px; margin-top:48px; }
      .ta-ccard { background:rgba(255,255,255,.04); border:1px solid rgba(201,151,58,.14); border-radius:3px; overflow:hidden; transition:.3s; }
      .ta-ccard:hover { border-color:rgba(201,151,58,.48); transform:translateY(-5px); background:rgba(255,255,255,.07); }
      .ta-ccard-img { height:185px; overflow:hidden; position:relative; }
      .ta-ccard-img img { width:100%; height:100%; object-fit:cover; transition:.5s; }
      .ta-ccard:hover .ta-ccard-img img { transform:scale(1.07); }
      .ta-ccard-badge { position:absolute; top:12px; left:12px; background:#c9973a; color:#fff; font-size:10px; font-weight:800; padding:4px 12px; border-radius:2px; letter-spacing:1px; text-transform:uppercase; }
      .ta-ccard-body { padding:22px 20px; }
      .ta-ccard-ar { font-family:'Scheherazade New',serif; font-size:18px; color:#c9973a; direction:rtl; margin-bottom:6px; }
      .ta-ccard-en { color:#fff; font-size:16px; font-weight:700; margin-bottom:8px; }
      .ta-ccard-desc { color:rgba(255,255,255,.52); font-size:13px; line-height:1.7; margin-bottom:18px; }
      .ta-ccard-footer { display:flex; align-items:center; justify-content:space-between; }
      .ta-ccard-level { color:#e8c270; font-size:11px; font-weight:700; letter-spacing:.5px; text-transform:uppercase; }
      .ta-ccard-btn { padding:8px 20px; background:transparent; border:1px solid rgba(201,151,58,.45); color:#c9973a; border-radius:3px; font-size:12px; font-weight:800; cursor:pointer; font-family:'Mulish',sans-serif; transition:.2s; letter-spacing:.5px; }
      .ta-ccard-btn:hover { background:#c9973a; color:#fff; }

      /* STATS */
      .ta-stats { position:relative; padding:80px 24px; background:url('https://images.unsplash.com/photo-1585036156171-384164a8c675?w=1600&q=80') center/cover no-repeat; overflow:hidden; }
      .ta-stats::before { content:''; position:absolute; inset:0; background:rgba(6,16,10,.9); }
      .ta-stats-inner { position:relative; z-index:1; max-width:1000px; margin:0 auto; text-align:center; }
      .ta-stats-ar { font-family:'Scheherazade New',serif; font-size:24px; color:rgba(201,151,58,.65); margin-bottom:6px; display:block; }
      .ta-stats-title { font-family:'Playfair Display',serif; font-size:36px; font-weight:700; color:#fff; margin-bottom:52px; }
      .ta-stats-grid { display:grid; grid-template-columns:repeat(4,1fr); }
      .ta-stat { padding:28px 20px; border-right:1px solid rgba(201,151,58,.12); }
      .ta-stat:last-child { border-right:none; }
      .ta-stat-n { font-family:'Playfair Display',serif; font-size:52px; color:#c9973a; font-weight:700; line-height:1; }
      .ta-stat-l { color:rgba(255,255,255,.52); font-size:13px; margin-top:8px; letter-spacing:.5px; }

      /* CTA */
      .ta-cta { padding:88px 24px; text-align:center; background:#faf7f2; }
      .ta-cta-inner { max-width:620px; margin:0 auto; }
      .ta-cta-ar { font-family:'Scheherazade New',serif; font-size:28px; color:#c9973a; margin-bottom:20px; display:block; direction:rtl; }
      .ta-cta-heading { font-family:'Playfair Display',serif; font-size:clamp(26px,4vw,42px); color:#0c2115; font-weight:700; margin-bottom:14px; line-height:1.2; }
      .ta-cta-text { font-size:15.5px; color:#666; margin-bottom:36px; line-height:1.85; }
      .ta-cta-btn { display:inline-block; padding:16px 52px; background:#0c2115; color:#fff; border:none; font-family:'Mulish',sans-serif; font-size:15px; font-weight:800; cursor:pointer; transition:.25s; letter-spacing:.5px; border-radius:4px; }
      .ta-cta-btn:hover { background:#183d26; transform:translateY(-2px); box-shadow:0 12px 32px rgba(12,33,21,.3); }

      /* FOOTER */
      .ta-footer { background:#060e08; color:#aaa; padding:64px 24px 0; }
      .ta-footer-top { max-width:1100px; margin:0 auto; display:grid; grid-template-columns:2fr 1fr 1fr 1.4fr; gap:48px; padding-bottom:52px; border-bottom:1px solid rgba(255,255,255,.05); }
      .ta-footer-brand { display:flex; align-items:center; gap:12px; margin-bottom:14px; }
      .ta-footer-logo { width:44px; height:44px; background:#c9973a; border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:22px; flex-shrink:0; }
      .ta-footer-name { font-family:'Playfair Display',serif; font-size:18px; font-weight:700; color:#fff; }
      .ta-footer-name-ar { font-family:'Scheherazade New',serif; font-size:14px; color:#c9973a; direction:rtl; }
      .ta-footer-tag { font-size:13px; line-height:1.9; color:rgba(255,255,255,.38); max-width:280px; margin-bottom:22px; }
      .ta-footer-socials { display:flex; gap:8px; flex-wrap:wrap; }
      .ta-social { padding:7px 16px; border:1px solid rgba(201,151,58,.28); color:#c9973a; font-size:12px; text-decoration:none; transition:.2s; border-radius:3px; font-weight:700; }
      .ta-social:hover { background:#c9973a; color:#fff; }
      .ta-footer-hd { font-size:10.5px; font-weight:800; color:#fff; margin-bottom:20px; letter-spacing:2px; text-transform:uppercase; padding-bottom:10px; border-bottom:1px solid rgba(201,151,58,.18); }
      .ta-footer-links { list-style:none; display:flex; flex-direction:column; gap:11px; }
      .ta-footer-links a { color:rgba(255,255,255,.42); text-decoration:none; font-size:13.5px; transition:.2s; cursor:pointer; }
      .ta-footer-links a:hover { color:#c9973a; }
      .ta-footer-contacts { list-style:none; display:flex; flex-direction:column; gap:13px; }
      .ta-footer-ci { display:flex; align-items:flex-start; gap:10px; font-size:13px; }
      .ta-contact-icon { color:#c9973a; font-size:14px; flex-shrink:0; margin-top:1px; }
      .ta-footer-contacts a { color:rgba(255,255,255,.42); text-decoration:none; transition:.2s; word-break:break-all; }
      .ta-footer-contacts a:hover { color:#c9973a; }
      .ta-footer-btm { max-width:1100px; margin:0 auto; padding:22px 0 26px; display:flex; flex-direction:column; align-items:center; gap:8px; text-align:center; }
      .ta-footer-du { font-family:'Scheherazade New',serif; font-size:22px; color:rgba(201,151,58,.6); }
      .ta-footer-copy { font-size:11px; color:rgba(255,255,255,.22); letter-spacing:.3px; }

      /* ENROLL GUIDE */
      .ta-guide { background:rgba(0,0,0,.62); backdrop-filter:blur(18px); border:1px solid rgba(201,151,58,.22); border-radius:10px; padding:22px 24px; max-width:420px; width:100%; margin-top:6px; animation:fadeUp .3s ease both; text-align:left; }
      .ta-guide-title { font-size:10px; font-weight:800; color:#c9973a; letter-spacing:2px; text-transform:uppercase; margin-bottom:16px; }
      .ta-guide-step { display:flex; gap:12px; align-items:flex-start; margin-bottom:12px; }
      .ta-guide-num { width:26px; height:26px; border-radius:50%; background:#c9973a; color:#fff; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:800; flex-shrink:0; }
      .ta-guide-stitle { font-size:13px; font-weight:700; color:#fff; margin:0; }
      .ta-guide-sdesc { font-size:11px; color:rgba(255,255,255,.48); margin:2px 0 0; }
      .ta-guide-btn { width:100%; margin-top:8px; padding:12px; border-radius:6px; border:none; background:#c9973a; color:#fff; font-size:14px; font-weight:800; cursor:pointer; font-family:'Mulish',sans-serif; }

      /* RESPONSIVE */
      @media(max-width:900px) {
        .ta-pillars-hdr { grid-template-columns:1fr; gap:12px; }
        .ta-pillars-grid { grid-template-columns:1fr 1fr; }
        .ta-courses-grid { grid-template-columns:1fr; }
        .ta-stats-grid { grid-template-columns:1fr 1fr; }
        .ta-footer-top { grid-template-columns:1fr; gap:32px; }
        .ta-strip { flex-wrap:wrap; }
        .ta-strip-item { border-right:none; padding:4px 14px; }
      }
      @media(max-width:600px) {
        .ta-pillars-grid { grid-template-columns:1fr; }
        .ta-ayah-box { padding:36px 18px; }
        .ta-stat { padding:20px 10px; }
        .ta-btn-p, .ta-btn-s { padding:13px 26px; font-size:14px; }
      }
    `;
    document.head.appendChild(style);
    return () => {
      try { document.head.removeChild(link); } catch {}
      try { document.head.removeChild(style); } catch {}
    };
  }, []);

  return (
    <div className="ta-root">

      {/* LIVE BANNER */}
      {liveClass && (
        <div onClick={() => navigate(`/live/${liveClass.room_code}`)} style={{ background:"linear-gradient(90deg,#0c2115,#1a5c3a)", borderBottom:"2px solid #c9973a", padding:"11px 24px", display:"flex", alignItems:"center", justifyContent:"center", gap:12, cursor:"pointer" }}>
          <span style={{ width:9, height:9, background:"#ef4444", borderRadius:"50%", animation:"pulse 1.5s infinite", display:"inline-block" }} />
          <span style={{ color:"#fff", fontWeight:700, fontSize:14, fontFamily:"'Mulish',sans-serif" }}>
            🔴 LIVE NOW: {liveClass.title} — Join Free →
          </span>
        </div>
      )}

      {/* HERO */}
      <section className="ta-hero">
        <div className="ta-hero-bg" />
        <div className="ta-hero-overlay" />
        <div className="ta-hero-tile" />
        <div className="ta-hero-arch" />
        <div className="ta-hero-content">
          <div className="ta-hero-badge">✦ Excellence in Islamic Education ✦</div>
          <div className="ta-hero-bismi">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</div>
          <div className="ta-hero-div">
            <span className="ta-hero-div-line" />
            <span style={{ color:"#c9973a", fontSize:11 }}>◆</span>
            <span className="ta-hero-div-line" />
          </div>
          <h1 className="ta-hero-title">
            Master Arabic &amp;
            <em>Islamic Sciences</em>
          </h1>
          <p className="ta-hero-sub">
            Learn Quran, Tajweed, Arabic Language and Islamic Studies with certified scholars — live, interactive, and structured for every level.
          </p>
          <div className="ta-hero-btns" style={{ flexDirection:"column", alignItems:"center" }}>
            <div style={{ display:"flex", gap:12, flexWrap:"wrap", justifyContent:"center" }}>
              <button className="ta-btn-p" onClick={() => navigate("/register")}>Enrol Now</button>
              <button className="ta-btn-s" onClick={() => setShowEnrollGuide(v => !v)}>
                How to Enrol {showEnrollGuide ? "▲" : "▼"}
              </button>
            </div>
            {showEnrollGuide && (
              <div className="ta-guide">
                <p className="ta-guide-title">📋 Enrollment Steps</p>
                {[
                  { n:"1", icon:"👤", title:"Create Your Account", desc:"Register with your name, email and password" },
                  { n:"2", icon:"💳", title:"Complete Payment", desc:"Pay the one-time registration fee" },
                  { n:"3", icon:"📝", title:"Fill Onboarding Form", desc:"Tell us about your background and goals" },
                  { n:"4", icon:"📖", title:"Take Entrance Exam", desc:"Written assessment with full proctoring" },
                  { n:"5", icon:"🎤", title:"Recitation Test", desc:"Audio evaluation of your Quran recitation" },
                  { n:"6", icon:"✅", title:"Admin Approval", desc:"Admin reviews results and assigns your level" },
                  { n:"7", icon:"🚀", title:"Access Dashboard", desc:"Start your learning journey!" },
                ].map(s => (
                  <div className="ta-guide-step" key={s.n}>
                    <div className="ta-guide-num">{s.n}</div>
                    <div>
                      <p className="ta-guide-stitle">{s.icon} {s.title}</p>
                      <p className="ta-guide-sdesc">{s.desc}</p>
                    </div>
                  </div>
                ))}
                <button className="ta-guide-btn" onClick={() => navigate("/register")}>Enrol Now →</button>
              </div>
            )}
          </div>
        </div>
        <div className="ta-hero-scroll">
          <span>SCROLL</span>
          <div className="ta-hero-scroll-line" />
        </div>
      </section>

      {/* STRIP */}
      <div className="ta-strip">
        {[["🕌","Qualified Islamic Scholars"],["📖","Structured Quranic Curriculum"],["🌐","Bilingual Arabic & English"],["🎓","Certificates Awarded"],["🎙️","Live & Recorded Classes"]].map(([icon, label]) => (
          <div className="ta-strip-item" key={label as string}>{icon}&nbsp; {label}</div>
        ))}
      </div>

      {/* AYAH */}
      <section className="ta-ayah">
        <div className="ta-ayah-pat" />
        <div className="ta-ayah-inner">
          <div className="ta-ayah-box">
            <div className="ta-ayah-text">يَرْفَعِ اللَّهُ الَّذِينَ آمَنُوا مِنكُمْ وَالَّذِينَ أُوتُوا الْعِلْمَ دَرَجَاتٍ</div>
            <div className="ta-ayah-divrow">
              <span className="ta-ayah-dline" />
              <span style={{ color:"#c9973a", fontSize:10 }}>◆</span>
              <span className="ta-ayah-dline" />
            </div>
            <div className="ta-ayah-trans">"Allah will raise those who have believed among you and those who were given knowledge, by degrees."</div>
            <div className="ta-ayah-ref" style={{ marginTop:12 }}>سورة المجادلة — Surah Al-Mujadila, 58:11</div>
          </div>
        </div>
      </section>

      {/* PILLARS */}
      <section className="ta-pillars">
        <div className="ta-pillars-inner">
          <div className="ta-pillars-hdr">
            <div>
              <div className="ta-eyebrow"><span className="ta-eyebrow-line" />Our Foundation</div>
              <h2 className="ta-heading">Seeking Knowledge<br />Is an Act of Worship</h2>
            </div>
            <div>
              <span className="ta-pillars-ar">وَفَوْقَ كُلِّ ذِي عِلْمٍ عَلِيمٌ</span>
              <p className="ta-body">The Prophet ﷺ said: <strong style={{ color:"#0c2115" }}>"Seeking knowledge is an obligation upon every Muslim."</strong> At Tahleem Academy, we honour this sacred trust — nurturing mind, heart, and soul through authentic Islamic education.</p>
            </div>
          </div>
          <div className="ta-pillars-grid">
            {[
              { n:"01", icon:"🕌", title:"Traditional Scholarship", text:"Our curriculum is rooted in authentic Islamic scholarship — the same knowledge passed down through generations of scholars." },
              { n:"02", icon:"📖", title:"Qur'an & Tajweed", text:"Perfect your recitation with certified Huffadh — from beginner Qa'ida to advanced Tajweed rules and Hifdh support." },
              { n:"03", icon:"🌐", title:"Arabic Language", text:"From Iqra to advanced grammar — reading, writing, Nahw, Sarf and spoken Arabic in a bilingual environment." },
              { n:"04", icon:"💻", title:"Live Interactive Classes", text:"Real-time lessons with qualified teachers, shared whiteboards, recitation sessions and recorded replays for every student." },
              { n:"05", icon:"📊", title:"Progress Tracking", text:"Detailed transcripts, term results and performance reports help students and parents stay informed at every stage." },
              { n:"06", icon:"🏆", title:"Certified Programmes", text:"Earn recognised certificates in Arabic Language, Tajweed, Quran Memorisation and Islamic Sciences upon completion." },
            ].map(p => (
              <div className="ta-pillar" key={p.n}>
                <div className="ta-pillar-n">{p.n}</div>
                <span className="ta-pillar-icon">{p.icon}</span>
                <div className="ta-pillar-title">{p.title}</div>
                <p className="ta-pillar-text">{p.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* COURSES */}
      <section className="ta-courses">
        <div className="ta-courses-inner">
          <div className="ta-eyebrow" style={{ color:"#e8c270" }}><span className="ta-eyebrow-line" style={{ background:"#c9973a" }} />Our Programs</div>
          <h2 className="ta-heading" style={{ color:"#fff" }}>Explore Our Courses</h2>
          <p className="ta-body" style={{ color:"rgba(255,255,255,.58)" }}>Each course is carefully structured with live sessions, assignments, and certified assessments.</p>
          <div className="ta-courses-grid">
            {[
              { img:"/images/quran-tajweed.jpeg", badge:"Most Popular", ar:"القرآن والتجويد", en:"Quran & Tajweed", desc:"Perfect your recitation with certified Huffadh — from beginner Qa'ida to advanced Tajweed rules.", level:"All Levels" },
              { img:"/images/arabic-language.jpeg", badge:"Beginner Friendly", ar:"اللغة العربية", en:"Arabic Language", desc:"From Iqra to advanced grammar — reading, writing, Nahw, Sarf and spoken Arabic.", level:"All Levels" },
              { img:"https://images.unsplash.com/photo-1519817650390-64a93db51149?w=600&q=80", badge:"Certified", ar:"العلوم الإسلامية", en:"Islamic Sciences", desc:"Fiqh, Aqeedah, Seerah, Hadith — comprehensive Islamic education with qualified scholars.", level:"Intermediate+" },
            ].map(c => (
              <div className="ta-ccard" key={c.en}>
                <div className="ta-ccard-img">
                  <img src={c.img} alt={c.en} />
                  <div className="ta-ccard-badge">{c.badge}</div>
                </div>
                <div className="ta-ccard-body">
                  <div className="ta-ccard-ar">{c.ar}</div>
                  <div className="ta-ccard-en">{c.en}</div>
                  <div className="ta-ccard-desc">{c.desc}</div>
                  <div className="ta-ccard-footer">
                    <span className="ta-ccard-level">⭐ {c.level}</span>
                    <button className="ta-ccard-btn" onClick={() => navigate("/register")}>Enrol Now</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* STATS */}
      <section className="ta-stats">
        <div className="ta-stats-inner">
          <span className="ta-stats-ar">الحمد لله على نعمة العلم</span>
          <h2 className="ta-stats-title">Growing Together in Knowledge</h2>
          <div className="ta-stats-grid">
            {[["500+","Lessons Delivered"],["3","Certified Scholars"],["95%","Student Satisfaction"],["4","Core Programs"]].map(([n, l]) => (
              <div className="ta-stat" key={l}>
                <div className="ta-stat-n">{n}</div>
                <div className="ta-stat-l">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="ta-cta">
        <div className="ta-cta-inner">
          <span className="ta-cta-ar">اطلبوا العلم من المهد إلى اللحد</span>
          <h2 className="ta-cta-heading">Begin Your Journey Today</h2>
          <p className="ta-cta-text">Join Tahleem Academy and take your first step towards mastering Arabic and Islamic knowledge — guided by qualified scholars, supported every step of the way.</p>
          <button className="ta-cta-btn" onClick={() => navigate("/register")}>Enrol Now →</button>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="ta-footer">
        <div className="ta-footer-top">
          <div>
            <div className="ta-footer-brand">
              <div className="ta-footer-logo">📖</div>
              <div>
                <div className="ta-footer-name">Tahleem Academy</div>
                <div className="ta-footer-name-ar">أكاديمية التعليم</div>
              </div>
            </div>
            <p className="ta-footer-tag">Empowering students to master Arabic and Islamic knowledge through structured learning and certified excellence.</p>
            <div className="ta-footer-socials">
              <a href="mailto:Tahleemacademy09@gmail.com" className="ta-social">✉️ Email</a>
              <a href="https://wa.me/2348163310471" className="ta-social">💬 WhatsApp</a>
            </div>
          </div>
          <div>
            <h4 className="ta-footer-hd">Quick Links</h4>
            <ul className="ta-footer-links">
              {[{label:"🏠 Home",path:"/"},{label:"📚 Courses",path:"/courses"},{label:"ℹ️ About Us",path:"/about"},{label:"📞 Contact",path:"/contact"}].map(l => (
                <li key={l.label}><a onClick={() => navigate(l.path)}>{l.label}</a></li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="ta-footer-hd">Programs</h4>
            <ul className="ta-footer-links">
              {["🔤 Arabic Language","🎵 Tajweed","📖 Quran Memorisation","⚖️ Islamic Fiqh","🕌 Islamic Sciences"].map(l => (
                <li key={l}><a href="#">{l}</a></li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="ta-footer-hd">Contact Us</h4>
            <ul className="ta-footer-contacts">
              <li className="ta-footer-ci"><span className="ta-contact-icon">✉️</span><a href="mailto:Tahleemacademy09@gmail.com">Tahleemacademy09@gmail.com</a></li>
              <li className="ta-footer-ci"><span className="ta-contact-icon">📱</span><a href="tel:+2348163310471">+234 816 331 0471</a></li>
              <li className="ta-footer-ci"><span className="ta-contact-icon">💬</span><a href="https://wa.me/2348163310471">WhatsApp Us</a></li>
            </ul>
          </div>
        </div>
        <div className="ta-footer-btm">
          <div className="ta-footer-du">وَقُل رَّبِّ زِدْنِي عِلْمًا</div>
          <div className="ta-footer-copy">© 2026 Tahleem Academy · All Rights Reserved · Built with ❤️ for the Ummah</div>
        </div>
      </footer>

    </div>
  );
};

export default Index;
