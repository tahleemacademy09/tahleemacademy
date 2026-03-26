/*
  src/pages/student/HifdhRevision.tsx
  Al-Hifdh Centre — 5 tabs: Overview · Recitation · Memorization · Exercise · Test
*/
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import HifdhDashboard    from "@/components/hifdh/HifdhDashboard";
import HifdhRecitation   from "@/components/hifdh/HifdhRecitation";
import HifdhMemorization from "@/components/hifdh/HifdhMemorization";
import HifdhExercise     from "@/components/hifdh/HifdhExercise";
import HifdhTest         from "@/components/hifdh/HifdhTest";

type Tab = "overview" | "recitation" | "memorization" | "exercise" | "test";

const TABS = [
  { key: "overview"     as Tab, icon: "📊", en: "Overview",     ar: "لوحة"   },
  { key: "recitation"   as Tab, icon: "📖", en: "Recitation",   ar: "تلاوة"  },
  { key: "memorization" as Tab, icon: "🧠", en: "Memorization", ar: "حفظ"    },
  { key: "exercise"     as Tab, icon: "🎯", en: "Exercise",     ar: "تمرين"  },
  { key: "test"         as Tab, icon: "✍️", en: "Test",         ar: "اختبار" },
];

export default function HifdhRevision() {
  const [tab, setTab]               = useState<Tab>("overview");
  const [userId, setUserId]         = useState<string | null>(null);
  const [studentName, setStudentName] = useState("Student");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data?.user) return;
      setUserId(data.user.id);
      supabase.from("profiles").select("full_name").eq("id", data.user.id).single()
        .then(({ data: p }) => { if (p?.full_name) setStudentName(p.full_name); });
    });
  }, []);

  return (
    <div style={{ fontFamily: "'Cairo',sans-serif", background: "#f8fafb", minHeight: "100vh" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Amiri+Quran&family=Amiri:wght@400;700&family=Cairo:wght@300;400;600;700;900&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
        @keyframes pulse{0%,100%{opacity:.6}50%{opacity:1}}
        button{font-family:'Cairo',sans-serif;cursor:pointer}
        input,select,textarea{font-family:'Cairo',sans-serif;outline:none}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-thumb{background:#d4e8d4;border-radius:2px}
      `}</style>

      {/* Header */}
      <div style={{ background:"linear-gradient(135deg,#1a3d24,#276749)", color:"#fff", position:"sticky", top:0, zIndex:50 }}>
        <div style={{ maxWidth:720, margin:"0 auto", padding:"14px 18px 0" }}>
          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:14 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:40, height:40, borderRadius:12, background:"rgba(255,255,255,.15)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22 }}>🕌</div>
              <div>
                <h1 style={{ fontFamily:"'Amiri',serif", fontSize:24, fontWeight:700, lineHeight:1 }}>Al-Hifdh Centre</h1>
                <p style={{ fontFamily:"'Amiri',serif", fontSize:12, color:"rgba(255,255,255,.7)", fontStyle:"italic", marginTop:2 }}>مركز الحفظ الذكي</p>
              </div>
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontSize:10, color:"rgba(255,255,255,.65)" }}>Welcome back</div>
              <div style={{ fontSize:13, fontWeight:700 }}>{studentName}</div>
            </div>
          </div>

          <div style={{ display:"flex", gap:2, overflowX:"auto" }}>
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                style={{ flex:"0 0 auto", minWidth:64, padding:"8px 6px 12px", border:"none", background:"none",
                  color: tab===t.key ? "#fff" : "rgba(255,255,255,.55)",
                  borderBottom: tab===t.key ? "2.5px solid #b7791f" : "2.5px solid transparent",
                  fontWeight: tab===t.key ? 700 : 400, transition:"all .2s" }}>
                <div style={{ fontSize:18, marginBottom:2 }}>{t.icon}</div>
                <div style={{ fontSize:10, fontWeight:700 }}>{t.en}</div>
                <div style={{ fontSize:9, color: tab===t.key ? "rgba(255,220,100,.9)" : "rgba(255,255,255,.4)", marginTop:1 }}>{t.ar}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div key={tab} style={{ maxWidth:720, margin:"0 auto", animation:"fadeUp .3s ease", paddingBottom:32 }}>
        {tab==="overview"     && <HifdhDashboard userId={userId} studentName={studentName} onNavigate={t => setTab(t==="recitation"?"recitation":t==="review"?"test":"overview")} />}
        {tab==="recitation"   && <HifdhRecitation />}
        {tab==="memorization" && <HifdhMemorization />}
        {tab==="exercise"     && <HifdhExercise />}
        {tab==="test"         && <HifdhTest />}
      </div>
    </div>
  );
}
