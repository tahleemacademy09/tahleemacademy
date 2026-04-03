import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_RECITER } from "@/components/hifdh/surahData";
import HifdhDashboard    from "@/components/hifdh/HifdhDashboard";
import HifdhRecitation   from "@/components/hifdh/HifdhRecitation";
import HifdhMemorization from "@/components/hifdh/HifdhMemorization";
import HifdhExercise     from "@/components/hifdh/HifdhExercise";
import HifdhTest         from "@/components/hifdh/HifdhTest";
import { BarChart3, Mic, Brain, Target, FileCheck } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "overview" | "recitation" | "memorization" | "exercise" | "test";

const NAV_ITEMS = [
  { id: "overview"     as Tab, en: "Overview",     ar: "لوحة",   icon: BarChart3 },
  { id: "recitation"   as Tab, en: "Recitation",   ar: "تلاوة",  icon: Mic },
  { id: "memorization" as Tab, en: "Memorization", ar: "حفظ",    icon: Brain },
  { id: "exercise"     as Tab, en: "Exercise",     ar: "تمرين",  icon: Target },
  { id: "test"         as Tab, en: "Test",         ar: "اختبار", icon: FileCheck },
];

export default function HifdhRevision() {
  const [tab, setTab]                   = useState<Tab>("overview");
  const [userId, setUserId]             = useState<string | null>(null);
  const [studentName, setStudentName]   = useState("Student");
  const [reciter, setReciter]           = useState(DEFAULT_RECITER);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data?.user) return;
      setUserId(data.user.id);
      supabase.from("profiles").select("full_name").eq("id", data.user.id).single()
        .then(({ data: p }) => { if (p?.full_name) setStudentName(p.full_name); });
    });
  }, []);

  return (
    <div style={{ fontFamily: "'Cairo',sans-serif", background: "#faf6ee", height: "100dvh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Amiri+Quran&family=Amiri:wght@400;700&family=Cairo:wght@300;400;600;700;900&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        button{font-family:'Cairo',sans-serif;cursor:pointer}
        ::-webkit-scrollbar{width:3px;height:3px}
        ::-webkit-scrollbar-thumb{background:#d4e8d4;border-radius:2px}
      `}</style>

      {/* ── CLEAN EDGE-TO-EDGE NAVIGATION BAR ──────────────────────────── */}
      <nav className="sticky top-0 z-50 w-full bg-white border-b border-gray-100 shadow-sm">
        <div className="flex items-stretch justify-between w-full px-0 py-2">
          {NAV_ITEMS.map((item) => {
            const isActive = tab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={cn(
                  "flex flex-col items-center justify-center flex-1 py-2.5 gap-0.5 transition-all duration-200",
                  isActive ? "text-[#0f2d1f]" : "text-gray-400 hover:text-gray-600"
                )}
              >
                <item.icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                <span className="text-[11px] font-semibold leading-tight">{item.en}</span>
                <span className="text-[9px] text-gray-400 leading-tight">{item.ar}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflowY: "auto", width: "100%", paddingBottom: 32 }}>
        <div key={tab} style={{ animation: "fadeUp .25s ease", minHeight: "100%" }}>
          {tab === "overview"     && <HifdhDashboard userId={userId} studentName={studentName} onNavigate={setTab} activeTab={tab} />}
          {tab === "recitation"   && <HifdhRecitation reciter={reciter} onReciterChange={setReciter} />}
          {tab === "memorization" && <HifdhMemorization />}
          {tab === "exercise"     && <HifdhExercise />}
          {tab === "test"         && <HifdhTest />}
        </div>
      </div>
    </div>
  );
}