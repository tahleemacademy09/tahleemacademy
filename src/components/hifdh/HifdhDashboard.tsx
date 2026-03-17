/*
  src/components/hifdh/HifdhDashboard.tsx
  ─────────────────────────────────────────
  Dashboard section: stats, juz map, revision schedule, recent sessions
*/

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  userId: string | null;
  studentName: string;
}

interface RevisionEntry {
  surah_num: number;
  surah_name: string;
  last_reviewed: string;
  best_accuracy: number;
  times_reviewed: number;
}

interface SessionEntry {
  id: string;
  surah_name: string;
  ayah_start: number;
  accuracy_score: number;
  created_at: string;
  duration: number;
}

const JUZ_NAMES = [
  "الم","سَيَقُول","تِلْكَ","لَن","وَالْمُحْصَنَات","لَا يُحِبُّ","وَإِذَا",
  "وَلَوْ","قَالَ الْمَلَأُ","وَاعْلَمُوا","يَعْتَذِرُون","وَمَا مِن دَابَّة",
  "وَمَا أُبَرِّئُ","رُبَمَا","سُبْحَانَ","قَالَ أَلَمْ","اقْتَرَبَ","قَدْ أَفْلَحَ",
  "وَقَالَ الَّذِينَ","أَمَّنْ خَلَقَ","اتْلُ مَا أُوحِيَ","وَمَن يَقْنُتْ",
  "وَمَا لِيَ","فَمَن أَظْلَمُ","إِلَيْهِ يُرَدُّ","حم","قَالَ فَمَا خَطْبُكُمْ",
  "قَدْ سَمِعَ","تَبَارَكَ","عَمَّ",
];

const daysSince = (iso: string) =>
  Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

const urgencyColor = (d: number) =>
  d >= 10 ? "#c0392b" : d >= 5 ? "#b7791f" : "#276749";

const urgencyBg = (d: number) =>
  d >= 10 ? "#fff5f5" : d >= 5 ? "#fffbeb" : "#f0fff4";

const urgencyLabel = (d: number) =>
  d >= 10 ? "Urgent" : d >= 5 ? "Soon" : "Good";

export default function HifdhDashboard({ userId, studentName }: Props) {
  const [revision, setRevision]   = useState<RevisionEntry[]>([]);
  const [sessions, setSessions]   = useState<SessionEntry[]>([]);
  const [juzDone, setJuzDone]     = useState<number[]>([]);
  const [juzPartial, setJuzPartial] = useState<number[]>([]);
  const [stats, setStats]         = useState({ streak: 0, avgAccuracy: 0, totalMins: 0, juzCount: 0 });
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);

    Promise.all([
      supabase.from("hifdh_progress")
        .select("surah_num,surah_name,last_reviewed,best_accuracy,times_reviewed")
        .eq("user_id", userId)
        .order("last_reviewed", { ascending: true })
        .limit(8),

      supabase.from("hifdh_sessions")
        .select("id,surah_name,ayah_start,accuracy_score,created_at,duration")
        .eq("student_id", userId)
        .order("created_at", { ascending: false })
        .limit(6),
    ]).then(([prog, sess]) => {
      if (prog.data) {
        setRevision(prog.data as RevisionEntry[]);
        // Build juz map from surah progress
        const done: number[] = [];
        const partial: number[] = [];
        prog.data.forEach((p: RevisionEntry) => {
          // rough mapping surah → juz (simplified)
          const juzIdx = Math.ceil(p.surah_num / 4.27);
          if (p.best_accuracy >= 80) {
            if (!done.includes(juzIdx)) done.push(juzIdx);
          } else {
            if (!partial.includes(juzIdx) && !done.includes(juzIdx)) partial.push(juzIdx);
          }
        });
        setJuzDone(done);
        setJuzPartial(partial);

        // Stats
        const scores = prog.data.map((p: RevisionEntry) => p.best_accuracy).filter(Boolean);
        const avg = scores.length ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length) : 0;
        setStats((s) => ({ ...s, avgAccuracy: avg, juzCount: done.length }));
      }

      if (sess.data) {
        setSessions(sess.data as SessionEntry[]);
        // Streak: count consecutive days
        const dates = [...new Set(sess.data.map((s: SessionEntry) => new Date(s.created_at).toDateString()))];
        let streak = 0;
        const today = new Date();
        for (let i = 0; i < dates.length; i++) {
          const d = new Date(today);
          d.setDate(d.getDate() - i);
          if (dates.includes(d.toDateString())) streak++;
          else break;
        }
        const totalMins = Math.round(
          sess.data.reduce((a: number, s: SessionEntry) => a + (s.duration || 0), 0) / 60
        );
        setStats((prev) => ({ ...prev, streak, totalMins }));
      }
      setLoading(false);
    });
  }, [userId]);

  const card = (extra?: React.CSSProperties): React.CSSProperties => ({
    background: "#fff", border: "1px solid #e8f0eb", borderRadius: 16,
    padding: "18px 16px", boxShadow: "0 1px 6px rgba(0,0,0,.05)", ...extra,
  });

  if (loading) return (
    <div style={{ textAlign: "center", padding: "60px 20px" }}>
      <div style={{ fontSize: 12, color: "#7a9e88", animation: "pulse 1s infinite" }}>Loading your progress…</div>
    </div>
  );

  return (
    <div style={{ padding: "20px 16px", display: "flex", flexDirection: "column", gap: 18 }}>

      {/* Greeting */}
      <div style={{ ...card({ background: "linear-gradient(135deg,#1a3d24,#276749)", border: "none", padding: "22px 20px" }) }}>
        <div style={{ fontFamily: "'Amiri',serif", fontSize: 20, color: "#fff", fontWeight: 700 }}>
          Assalamu Alaikum, {studentName} 👋
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,.7)", marginTop: 4 }}>
          السَّلَامُ عَلَيْكُمْ — Keep striving, every ayah counts
        </div>
      </div>

      {/* Stats Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {[
          { icon: "📖", val: stats.juzCount || "0", label: "Juz Memorized", ar: "أجزاء محفوظة", color: "#1a3d24" },
          { icon: "📊", val: `${stats.avgAccuracy}%`, label: "Avg Accuracy", ar: "متوسط الدقة", color: "#276749" },
          { icon: "🔥", val: stats.streak, label: "Day Streak", ar: "سلسلة الأيام", color: "#b7791f" },
          { icon: "⏱️", val: `${stats.totalMins}m`, label: "Total Time", ar: "إجمالي الوقت", color: "#2b6cb0" },
        ].map((s, i) => (
          <div key={i} style={card({ textAlign: "center", padding: "16px 12px" })}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>{s.icon}</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.val}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#1a3d24", marginTop: 5 }}>{s.label}</div>
            <div style={{ fontSize: 10, color: "#7a9e88" }}>{s.ar}</div>
          </div>
        ))}
      </div>

      {/* Juz Progress Map */}
      <div style={card()}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontFamily: "'Amiri',serif", fontSize: 17, fontWeight: 700, color: "#1a3d24" }}>
            Juz Progress Map
          </div>
          <div style={{ fontSize: 11, color: "#b7791f", fontStyle: "italic" }}>خريطة الأجزاء الثلاثين</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 6 }}>
          {Array.from({ length: 30 }, (_, i) => {
            const juz = i + 1;
            const done = juzDone.includes(juz);
            const partial = juzPartial.includes(juz);
            return (
              <div key={juz} title={`Juz ${juz} — ${JUZ_NAMES[i]}`}
                style={{ aspectRatio: "1", borderRadius: 10, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "transform .15s",
                  background: done ? "#1a3d24" : partial ? "#f0fdf4" : "#f8fafb",
                  border: done ? "none" : partial ? "1.5px solid #9ae6b4" : "1px solid #e8f0eb",
                }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: done ? "#fff" : partial ? "#276749" : "#7a9e88" }}>{juz}</div>
                {done    && <div style={{ fontSize: 7, color: "#b7791f", marginTop: 1 }}>✓</div>}
                {partial && !done && <div style={{ fontSize: 7, color: "#276749", marginTop: 1 }}>~</div>}
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 14, marginTop: 12, flexWrap: "wrap" as const }}>
          {[["#1a3d24","Memorized · محفوظ"],["#9ae6b4","In Progress · جارٍ"],["#e8f0eb","Not Started · لم يبدأ"]].map(([col,label],i)=>(
            <div key={i} style={{ display:"flex", alignItems:"center", gap:5, fontSize:10, color:"#7a9e88" }}>
              <div style={{ width:10, height:10, borderRadius:3, background: col as string, border:`1px solid ${col}` }} />{label}
            </div>
          ))}
        </div>
      </div>

      {/* Revision Schedule */}
      <div style={card()}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontFamily: "'Amiri',serif", fontSize: 17, fontWeight: 700, color: "#1a3d24" }}>
            📅 Revision Schedule
          </div>
          <div style={{ fontSize: 11, color: "#b7791f", fontStyle: "italic" }}>جدول المراجعة — based on your last reviewed dates</div>
        </div>
        {revision.length === 0 ? (
          <div style={{ textAlign: "center", padding: "20px 0", color: "#7a9e88", fontSize: 13 }}>
            Start reciting to build your revision schedule!<br />
            <span style={{ fontSize: 11 }}>ابدأ التلاوة لبناء جدول مراجعتك</span>
          </div>
        ) : revision.map((r, i) => {
          const days = daysSince(r.last_reviewed);
          const col = urgencyColor(days);
          const bg = urgencyBg(days);
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 10, background: bg, marginBottom: 6, border: `1px solid ${col}22` }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: col, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1a3d24" }}>{r.surah_name}</div>
                <div style={{ fontSize: 11, color: "#7a9e88" }}>
                  {days === 0 ? "Today" : `${days}d ago`} · Reviewed {r.times_reviewed}× · Best: <b style={{ color: "#b7791f" }}>{r.best_accuracy}%</b>
                </div>
              </div>
              <div style={{ fontSize: 10, padding: "3px 10px", borderRadius: 20, fontWeight: 700, background: "#fff", color: col, border: `1px solid ${col}55`, whiteSpace: "nowrap" as const }}>
                {urgencyLabel(days)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent Sessions */}
      {sessions.length > 0 && (
        <div style={card()}>
          <div style={{ fontFamily: "'Amiri',serif", fontSize: 17, fontWeight: 700, color: "#1a3d24", marginBottom: 14 }}>
            Recent Sessions · الجلسات الأخيرة
          </div>
          {sessions.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i < sessions.length - 1 ? "1px solid #f0f4f0" : "none" }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: s.accuracy_score >= 80 ? "#f0fff4" : s.accuracy_score >= 60 ? "#fffbeb" : "#fff5f5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900, color: s.accuracy_score >= 80 ? "#276749" : s.accuracy_score >= 60 ? "#b7791f" : "#c0392b", border: `1px solid ${s.accuracy_score >= 80 ? "#9ae6b4" : s.accuracy_score >= 60 ? "#f6d860" : "#fca5a5"}`, flexShrink: 0 }}>
                {s.accuracy_score}%
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{s.surah_name}</div>
                <div style={{ fontSize: 11, color: "#7a9e88" }}>
                  Ayah {s.ayah_start} · {Math.round((s.duration || 0) / 60)}m · {new Date(s.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
