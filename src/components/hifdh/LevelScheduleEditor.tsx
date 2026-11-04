// src/components/hifdh/LevelScheduleEditor.tsx
// Pick the days a level has its memorization (read-along) class, and a time for each day.
// Used by the ustadh Settings tab and the admin Settings tab. Saves through `onSave` (one call per change).

import { useState } from "react";
import { HF_DAYS_SHORT, levelSlots, type HifdhSlot } from "@/lib/hifdhSchedule";

const G = "#064E3B", MUTED = "#6b7a72", LINE = "#e3e9e5", INK = "#1a1a2e";

export default function LevelScheduleEditor({ level, disabled, onSave }: { level: any; disabled?: boolean; onSave: (slots: HifdhSlot[]) => void }) {
  const [rows, setRows] = useState<HifdhSlot[]>(() => levelSlots(level));
  const has = (d: number) => rows.some((r) => r.day === d);

  const commit = (next: HifdhSlot[]) => { const sorted = next.slice().sort((a, b) => a.day - b.day); setRows(sorted); onSave(sorted); };
  const toggle = (d: number) => commit(has(d) ? rows.filter((r) => r.day !== d) : [...rows, { day: d, time: rows[rows.length - 1]?.time || "16:00" }]);

  return (
    <div>
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 6 }}>Class days — tap to add or remove</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {HF_DAYS_SHORT.map((d, i) => {
          const on = has(i + 1);
          return (
            <button key={d} disabled={disabled} onClick={() => toggle(i + 1)} aria-pressed={on} style={{
              minWidth: 44, padding: "8px 10px", borderRadius: 99, fontSize: 12.5, fontWeight: 800, cursor: disabled ? "default" : "pointer",
              border: `1px solid ${on ? G : LINE}`, background: on ? G : "#fff", color: on ? "#fff" : INK, opacity: disabled ? 0.6 : 1,
            }}>{d}</button>
          );
        })}
      </div>
      {rows.length === 0 && <div style={{ fontSize: 12, color: MUTED, marginTop: 8 }}>No class days set.</div>}
      {rows.length > 0 && (
        <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
          {rows.map((r) => (
            <div key={r.day} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 54, fontSize: 13, fontWeight: 800, color: G }}>{HF_DAYS_SHORT[r.day - 1]}</div>
              <input type="time" disabled={disabled} value={r.time}
                onChange={(e) => setRows(rows.map((x) => (x.day === r.day ? { ...x, time: e.target.value } : x)))}
                onBlur={(e) => e.target.value && onSave(rows.map((x) => (x.day === r.day ? { ...x, time: e.target.value } : x)))}
                style={{ flex: 1, boxSizing: "border-box", border: `1px solid ${LINE}`, borderRadius: 8, padding: "8px 8px", fontSize: 14 }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
