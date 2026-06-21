// src/pages/student/HifdhPage.tsx
// Tabbed shell for all Hifdh features:
//   Overview (Dashboard) | Revision (QuranRevisionHub) | Test | Memorization
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LayoutDashboard, BookOpen, ClipboardCheck, Brain } from "lucide-react";
import HifdhDashboard    from "@/components/hifdh/HifdhDashboard";
import HifdhRevision     from "@/pages/student/HifdhRevision";   // QuranRevisionHub
import HifdhTest         from "@/components/hifdh/HifdhTest";
import HifdhMemorization from "@/components/hifdh/HifdhMemorization";

type Tab = "overview" | "revision" | "test" | "memorization";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "overview",      label: "Overview",      icon: <LayoutDashboard size={16} /> },
  { id: "revision",      label: "Revision",      icon: <BookOpen        size={16} /> },
  { id: "test",          label: "Test",           icon: <ClipboardCheck  size={16} /> },
  { id: "memorization",  label: "Memorization",   icon: <Brain           size={16} /> },
];

const GOLD = "#b7791f";
const DG   = "#0f2318";

export default function HifdhPage() {
  const [tab, setTab]               = useState<Tab>("overview");
  const [userId, setUserId]         = useState<string | null>(null);
  const [studentName, setStudentName] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data?.user) return;
      setUserId(data.user.id);
      const { data: pf } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id" as any, data.user.id)
        .maybeSingle();
      if ((pf as any)?.full_name) setStudentName((pf as any).full_name);
    });
  }, []);

  return (
    <div className="flex flex-col h-full" style={{ background: DG }}>
      {/* ── Tab Bar ── */}
      <div
        className="flex items-center gap-0 shrink-0 border-b"
        style={{ background: "#0b1a12", borderColor: GOLD + "33" }}>
        {TABS.map(t => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-bold transition-all"
              style={{
                color:       active ? GOLD : "#4a6d58",
                borderBottom: active ? `2px solid ${GOLD}` : "2px solid transparent",
                background:  active ? GOLD + "0f" : "transparent",
              }}>
              {t.icon}
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── Tab Content ── */}
      <div className="flex-1 overflow-hidden">
        {tab === "overview" && (
          <div className="h-full overflow-y-auto">
            <HifdhDashboard
              userId={userId}
              studentName={studentName}
              activeTab="overview"
              onNavigate={(target) => {
                if (target === "recitation") setTab("revision");
                else if (target === "test")  setTab("test");
                else if (target === "memorize") setTab("memorization");
              }}
            />
          </div>
        )}

        {tab === "revision" && (
          <div className="h-full overflow-hidden">
            {/* HifdhRevision is QuranRevisionHub — pass userId */}
            <HifdhRevision userId={userId} />
          </div>
        )}

        {tab === "test" && (
          <div className="h-full overflow-y-auto">
            <HifdhTest />
          </div>
        )}

        {tab === "memorization" && (
          <div className="h-full overflow-y-auto">
            <HifdhMemorization />
          </div>
        )}
      </div>
    </div>
  );
}
