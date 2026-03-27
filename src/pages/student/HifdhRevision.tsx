/*
  src/pages/student/HifdhRevision.tsx
  Al-Hifdh Centre — header auto-hides on scroll, global reciter selector,
  custom voice upload pending admin approval
*/
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RECITERS, DEFAULT_RECITER } from "@/components/hifdh/surahData";
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

const G = "#1a3d24"; const GOLD = "#b7791f";

export default function HifdhRevision() {
  const [tab, setTab]                   = useState<Tab>("overview");
  const [userId, setUserId]             = useState<string | null>(null);
  const [studentName, setStudentName]   = useState("Student");
  const [reciter, setReciter]           = useState(DEFAULT_RECITER);
  const [showReciter, setShowReciter]   = useState(false);
  const [headerVisible, setHeaderVisible] = useState(true);
  const [headerPinned, setHeaderPinned]   = useState(false); // manual pin/hide
  const [showVoiceUpload, setShowVoiceUpload] = useState(false);
  const [uploadStatus, setUploadStatus]   = useState<"idle"|"uploading"|"pending"|"approved"|"rejected">("idle");
  const [uploadName, setUploadName]       = useState("");
  const [uploadFile, setUploadFile]       = useState<File|null>(null);
  const [customVoices, setCustomVoices]   = useState<{id:string;name:string;status:string}[]>([]);

  const lastScrollY   = useRef(0);
  const contentRef    = useRef<HTMLDivElement>(null);
  const scrollTimeout = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data?.user) return;
      setUserId(data.user.id);
      supabase.from("profiles").select("full_name").eq("id", data.user.id).single()
        .then(({ data: p }) => { if (p?.full_name) setStudentName(p.full_name); });
      // Load custom voices (from a hypothetical table)
      supabase.from("hifdh_custom_voices" as any)
        .select("id,name,status").eq("user_id", data.user.id)
        .then(({ data: v }) => { if (v) setCustomVoices(v as any[]); });
    });
  }, []);

  // Auto-hide header on scroll
  const handleScroll = useCallback(() => {
    if (headerPinned) return;
    const el = contentRef.current;
    if (!el) return;
    const y = el.scrollTop;
    if (y > lastScrollY.current + 8) {
      setHeaderVisible(false);
    } else if (y < lastScrollY.current - 8 || y < 60) {
      setHeaderVisible(true);
    }
    lastScrollY.current = y;
    // Show header briefly when near top
    if (y < 10) setHeaderVisible(true);
  }, [headerPinned]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  // Reset scroll when tab changes
  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
    setHeaderVisible(true);
  }, [tab]);

  const uploadCustomVoice = async () => {
    if (!uploadFile || !uploadName.trim() || !userId) return;
    setUploadStatus("uploading");
    try {
      // Store metadata in DB; audio file itself stored in Supabase Storage
      const filePath = `custom-voices/${userId}/${Date.now()}_${uploadFile.name}`;
      await supabase.storage.from("hifdh-voices").upload(filePath, uploadFile);
      await supabase.from("hifdh_custom_voices" as any).insert({
        user_id: userId, name: uploadName.trim(),
        file_path: filePath, status: "pending"
      });
      setUploadStatus("pending");
      setCustomVoices(v => [...v, { id: Date.now().toString(), name: uploadName.trim(), status: "pending" }]);
    } catch { setUploadStatus("idle"); alert("Upload failed — try again."); }
  };

  const HEADER_H = 120; // px approx height of header

  return (
    <div style={{ fontFamily: "'Cairo',sans-serif", background: "#f8fafb", height: "100dvh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Amiri+Quran&family=Amiri:wght@400;700&family=Cairo:wght@300;400;600;700;900&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        @keyframes pulse{0%,100%{opacity:.6}50%{opacity:1}}
        @keyframes slideDown{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:none}}
        button{font-family:'Cairo',sans-serif;cursor:pointer}
        input,select,textarea{font-family:'Cairo',sans-serif;outline:none}
        ::-webkit-scrollbar{width:3px;height:3px}
        ::-webkit-scrollbar-thumb{background:#d4e8d4;border-radius:2px}
        .hifdh-header{
          transition: transform .3s ease, opacity .3s ease;
        }
        .hifdh-header.hidden{
          transform: translateY(-100%);
          opacity: 0;
          pointer-events: none;
        }
        .hifdh-header.visible{
          transform: translateY(0);
          opacity: 1;
        }
      `}</style>

      {/* ── Sticky Header ── */}
      <div
        className={`hifdh-header ${headerVisible ? "visible" : "hidden"}`}
        style={{ background: `linear-gradient(135deg,${G},#276749)`, color: "#fff",
          position: "sticky", top: 0, zIndex: 50, flexShrink: 0 }}>
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "10px 14px 0" }}>
          {/* Title row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(255,255,255,.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🕌</div>
              <div>
                <h1 style={{ fontFamily: "'Amiri',serif", fontSize: 20, fontWeight: 700, lineHeight: 1 }}>Al-Hifdh Centre</h1>
                <p style={{ fontFamily: "'Amiri',serif", fontSize: 11, color: "rgba(255,255,255,.65)", marginTop: 1 }}>مركز الحفظ الذكي</p>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {/* Pin/hide toggle */}
              <button onClick={() => setHeaderPinned(v => !v)}
                title={headerPinned ? "Auto-hide header" : "Pin header"}
                style={{ background: "rgba(255,255,255,.15)", border: "none", borderRadius: 8, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 14 }}>
                {headerPinned ? "📌" : "👁"}
              </button>
              {/* Reciter */}
              <button onClick={() => setShowReciter(v => !v)}
                style={{ background: "rgba(255,255,255,.15)", border: "none", borderRadius: 8, padding: "4px 8px", color: "#fff", fontSize: 10, fontWeight: 700 }}>
                🎙 {RECITERS.find(r => r.id === reciter)?.label.split(" ")[0] || "Reciter"}
              </button>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,.55)" }}>Welcome</div>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{studentName.split(" ")[0]}</div>
              </div>
            </div>
          </div>

          {/* Reciter dropdown */}
          {showReciter && (
            <div style={{ background: "rgba(0,0,0,.55)", backdropFilter: "blur(8px)", borderRadius: 12, padding: 10, marginBottom: 8, animation: "slideDown .2s ease" }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,.6)", fontWeight: 700, letterSpacing: .5, marginBottom: 6 }}>
                SELECT RECITER · اختر القارئ
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {RECITERS.map(r => (
                  <button key={r.id} onClick={() => { setReciter(r.id); setShowReciter(false); }}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "7px 10px", borderRadius: 8, border: "none",
                      background: reciter === r.id ? "rgba(255,255,255,.25)" : "rgba(255,255,255,.08)",
                      color: "#fff", fontSize: 12, fontWeight: reciter === r.id ? 700 : 400, cursor: "pointer" }}>
                    <span>{r.label}</span>
                    <span style={{ fontFamily: "'Amiri',serif", fontSize: 13, color: reciter === r.id ? GOLD : "rgba(255,255,255,.55)" }}>{r.labelAr}</span>
                  </button>
                ))}
                {/* Custom voices */}
                {customVoices.filter(v => v.status === "approved").map(v => (
                  <button key={v.id} onClick={() => { setReciter(`custom_${v.id}`); setShowReciter(false); }}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "7px 10px", borderRadius: 8, border: "1px solid rgba(183,121,31,.4)",
                      background: reciter === `custom_${v.id}` ? "rgba(183,121,31,.25)" : "rgba(183,121,31,.08)",
                      color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    <span>⭐ {v.name} (Your Voice)</span>
                    <span style={{ fontSize: 10, color: "#86efac" }}>Approved</span>
                  </button>
                ))}
                {customVoices.filter(v => v.status === "pending").map(v => (
                  <div key={v.id}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "7px 10px", borderRadius: 8, background: "rgba(255,255,255,.05)",
                      color: "rgba(255,255,255,.4)", fontSize: 11 }}>
                    <span>⏳ {v.name}</span>
                    <span style={{ fontSize: 10, color: GOLD }}>Pending Admin Approval</span>
                  </div>
                ))}
                {/* Upload custom voice */}
                <button onClick={() => { setShowVoiceUpload(v => !v); }}
                  style={{ padding: "7px 10px", borderRadius: 8, border: "1px dashed rgba(255,255,255,.3)",
                    background: "none", color: "rgba(255,255,255,.65)", fontSize: 11, cursor: "pointer", textAlign: "left" }}>
                  ➕ Submit your own recitation voice
                </button>
              </div>

              {/* Upload form */}
              {showVoiceUpload && (
                <div style={{ marginTop: 8, padding: "10px", background: "rgba(255,255,255,.08)", borderRadius: 10 }}>
                  {uploadStatus === "pending" ? (
                    <div style={{ fontSize: 12, color: "#86efac", textAlign: "center", padding: "8px 0" }}>
                      ✅ Submitted! Your voice is pending admin review.<br/>
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,.5)" }}>You'll be notified when approved.</span>
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,.55)", marginBottom: 6 }}>
                        Upload a clear MP3/WAV sample of your recitation. Admin will review before enabling.
                      </div>
                      <input value={uploadName} onChange={e => setUploadName(e.target.value)}
                        placeholder="Your name / voice label"
                        style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,.2)",
                          background: "rgba(255,255,255,.1)", color: "#fff", fontSize: 12, marginBottom: 6 }} />
                      <input type="file" accept="audio/*" onChange={e => setUploadFile(e.target.files?.[0] || null)}
                        style={{ width: "100%", fontSize: 11, color: "rgba(255,255,255,.6)", marginBottom: 8 }} />
                      <button onClick={uploadCustomVoice}
                        disabled={!uploadFile || !uploadName.trim() || uploadStatus === "uploading"}
                        style={{ width: "100%", padding: "8px", borderRadius: 8, border: "none",
                          background: uploadFile && uploadName ? GOLD : "rgba(255,255,255,.2)",
                          color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                        {uploadStatus === "uploading" ? "Uploading…" : "Submit for Review"}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Tab bar */}
          <div style={{ display: "flex", gap: 0, overflowX: "auto" }}>
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                style={{ flex: "0 0 auto", minWidth: 60, padding: "7px 4px 11px", border: "none", background: "none",
                  color: tab === t.key ? "#fff" : "rgba(255,255,255,.5)",
                  borderBottom: tab === t.key ? `2.5px solid ${GOLD}` : "2.5px solid transparent",
                  fontWeight: tab === t.key ? 700 : 400, transition: "all .2s" }}>
                <div style={{ fontSize: 17, marginBottom: 1 }}>{t.icon}</div>
                <div style={{ fontSize: 9.5, fontWeight: 700 }}>{t.en}</div>
                <div style={{ fontSize: 8.5, color: tab === t.key ? "rgba(255,220,100,.9)" : "rgba(255,255,255,.35)", marginTop: 1 }}>{t.ar}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Floating "show header" pill — visible when header is hidden */}
      {!headerVisible && !headerPinned && (
        <button onClick={() => { setHeaderVisible(true); if (contentRef.current) contentRef.current.scrollTop = 0; }}
          style={{ position: "fixed", top: 10, left: "50%", transform: "translateX(-50%)", zIndex: 60,
            background: G, color: "#fff", border: "none", borderRadius: 20, padding: "5px 14px",
            fontSize: 11, fontWeight: 700, boxShadow: "0 4px 16px rgba(0,0,0,.25)", cursor: "pointer" }}>
          ↑ Al-Hifdh Centre
        </button>
      )}

      {/* ── Content ── */}
      <div ref={contentRef}
        style={{ flex: 1, overflowY: "auto", maxWidth: 720, margin: "0 auto", width: "100%", paddingBottom: 32 }}>
        <div key={tab} style={{ animation: "fadeUp .25s ease" }}>
          {tab === "overview"     && <HifdhDashboard userId={userId} studentName={studentName} onNavigate={t => setTab(t === "recitation" ? "recitation" : t === "review" ? "test" : "overview")} />}
          {tab === "recitation"   && <HifdhRecitation reciter={reciter} />}
          {tab === "memorization" && <HifdhMemorization reciter={reciter} />}
          {tab === "exercise"     && <HifdhExercise reciter={reciter} />}
          {tab === "test"         && <HifdhTest reciter={reciter} />}
        </div>
      </div>
    </div>
  );
}
