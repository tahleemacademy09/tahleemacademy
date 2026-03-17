/*
  src/pages/student/HifdhRevision.tsx
  ─────────────────────────────────────────────────────────
  Main AI-Hifdh page — top tab navigation
  Tabs: Dashboard · Recitation · Listen · Review
*/

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import HifdhDashboard from "@/components/hifdh/HifdhDashboard";
import RecitationMic  from "@/components/hifdh/RecitationMic";
import AudioPlayer    from "@/components/hifdh/AudioPlayer";
import ReviewSection  from "@/components/hifdh/ReviewSection";

type Tab = "dashboard" | "recitation" | "audio" | "review";

export default function HifdhRevision() {
  const [tab, setTab]               = useState<Tab>("dashboard");
  const [userId, setUserId]         = useState<string | null>(null);
  const [studentName, setStudentName] = useState("Student");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data?.user) return;
      setUserId(data.user.id);
      supabase
        .from("profiles")
        .select("full_name")
        .eq("id", data.user.id)
        .single()
        .then(({ data: p }) => { if (p?.full_name) setStudentName(p.full_name); });
    });
  }, []);

  const TABS: { key: Tab; icon: string; en: string; ar: string }[] = [
    { key: "dashboard",  icon: "📊", en: "Dashboard",  ar: "لوحة" },
    { key: "recitation", icon: "🎙️", en: "Recitation", ar: "تلاوة" },
    { key: "audio",      icon: "🎧", en: "Listen",     ar: "استماع" },
    { key: "review",     icon: "🔄", en: "Review",     ar: "مراجعة" },
  ];

  return (
    <div style={{ fontFamily: "'Cairo',sans-serif", background: "#fff", minHeight: "100vh", color: "#1a202c" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Amiri+Quran&family=Amiri:wght@400;700&family=Cairo:wght@300;400;600;700;900&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes fadeUp   { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
        @keyframes fadeIn   { from{opacity:0} to{opacity:1} }
        @keyframes pulse    { 0%,100%{opacity:.6} 50%{opacity:1} }
        @keyframes wave     { 0%,100%{transform:scaleY(.3)} 50%{transform:scaleY(1)} }
        @keyframes countdown{ from{stroke-dashoffset:0} to{stroke-dashoffset:100} }
        button { font-family:'Cairo',sans-serif; cursor:pointer; }
        input,select,textarea { font-family:'Cairo',sans-serif; outline:none; }
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-thumb{background:#d4e8d4;border-radius:2px}
      `}</style>

      {/* ── Header ── */}
      <div style={{ background:"#fff", borderBottom:"1px solid #e8f0eb" }}>
        <div style={{ maxWidth:720, margin:"0 auto", padding:"20px 18px 0" }}>
          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:12 }}>
            <div>
              <h1 style={{ fontFamily:"'Amiri',serif", fontSize:28, fontWeight:700, color:"#1a3d24", letterSpacing:"-.3px" }}>
                AI-Hifdh Centre
              </h1>
              <p style={{ fontFamily:"'Amiri',serif", fontSize:13, color:"#b7791f", fontStyle:"italic", marginTop:2 }}>
                الحِفظ الذكي يُثبِّت القلب
              </p>
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontSize:12, color:"#7a9e88" }}>Welcome back</div>
              <div style={{ fontSize:14, fontWeight:700, color:"#1a3d24" }}>{studentName}</div>
            </div>
          </div>

          {/* Tab Bar */}
          <div style={{ display:"flex" }}>
            {TABS.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)}
                style={{ flex:1, padding:"10px 4px 12px", border:"none", background:"none",
                  borderBottom: tab===t.key ? "2.5px solid #1a3d24" : "2.5px solid transparent",
                  color: tab===t.key ? "#1a3d24" : "#7a9e88",
                  fontWeight: tab===t.key ? 700 : 400, fontSize:11, transition:"all .2s",
                }}>
                <div style={{ fontSize:19, marginBottom:3 }}>{t.icon}</div>
                <div style={{ fontSize:12 }}>{t.en}</div>
                <div style={{ fontSize:10, color: tab===t.key ? "#b7791f" : "#aac4aa" }}>{t.ar}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div key={tab} style={{ maxWidth:720, margin:"0 auto", animation:"fadeUp .3s ease" }}>
        {tab === "dashboard"  && <HifdhDashboard userId={userId} studentName={studentName} />}
        {tab === "recitation" && <RecitationMic  userId={userId} />}
        {tab === "audio"      && <AudioPlayer    userId={userId} />}
        {tab === "review"     && <ReviewSection  userId={userId} />}
      </div>
    </div>
  );
}
