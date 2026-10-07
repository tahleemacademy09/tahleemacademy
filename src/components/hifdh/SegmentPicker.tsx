// src/components/hifdh/SegmentPicker.tsx
// Pick any mix of juz', hizb, surahs and page ranges for ONE Murajaah assignment.
// Students who memorised random parts get exactly those parts, served in Mushaf order.
import { useMemo, useState } from "react";
import { SURAHS } from "./surahData";
import {
  Segment, segmentLabel, segmentRange, segmentsToPages, segmentsSummary,
} from "@/lib/hifdhSegments";

type Kind = "juz" | "hizb" | "surah" | "pages";
const G = "#1a5c38", BRD = "#e2e8e0", WARM = "#f7f5ef", GOLD = "#b8860b";

const same = (a: Segment, b: Segment) =>
  a.t === b.t &&
  (a.t === "pages"
    ? b.t === "pages" && a.from === b.from && a.to === b.to
    : (a as any).n === (b as any).n);

interface Props {
  value: Segment[];
  onChange: (next: Segment[]) => void;
}

export default function SegmentPicker({ value, onChange }: Props) {
  const [kind, setKind] = useState<Kind>("juz");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");

  const pages = useMemo(() => segmentsToPages(value), [value]);
  const has = (s: Segment) => value.some(v => same(v, s));
  const toggle = (s: Segment) =>
    onChange(has(s) ? value.filter(v => !same(v, s)) : [...value, s]);

  const addPages = () => {
    const a = parseInt(from, 10);
    const b = parseInt(to || from, 10);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return;
    if (a < 1 || b < 1 || a > 604 || b > 604) return;
    const seg: Segment = { t: "pages", from: Math.min(a, b), to: Math.max(a, b) };
    if (!has(seg)) onChange([...value, seg]);
    setFrom(""); setTo("");
  };

  const chip = (active: boolean): React.CSSProperties => ({
    padding: "6px 0", borderRadius: 8, fontSize: 11, fontWeight: 800, cursor: "pointer",
    border: `2px solid ${active ? G : BRD}`, background: active ? G : WARM,
    color: active ? "#fff" : "#374151",
  });
  const input: React.CSSProperties = {
    flex: 1, minWidth: 0, padding: "8px 10px", borderRadius: 8, border: `1px solid ${BRD}`,
    fontSize: 12, background: "#fff",
  };

  const surahs = SURAHS.filter(s => {
    const t = q.trim().toLowerCase();
    return !t || s.name.toLowerCase().includes(t) || (s.nameAr || "").includes(t) || String(s.num) === t;
  });

  return (
    <div style={{ marginBottom: 12 }}>
      {/* What's selected */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8, minHeight: 28 }}>
        {value.length === 0 && (
          <span style={{ fontSize: 11, color: "#9aab94" }}>Nothing selected yet — add juz', hizb, surahs or pages below</span>
        )}
        {value.map((s, i) => (
          <button key={i} type="button" onClick={() => toggle(s)}
            style={{ padding: "4px 9px", borderRadius: 999, border: `1px solid ${GOLD}`, background: "#fffbeb",
              color: "#7c5a00", fontSize: 11, fontWeight: 800, cursor: "pointer" }}>
            {segmentLabel(s)} ✕
          </button>
        ))}
      </div>
      {value.length > 0 && (
        <div style={{ fontSize: 10.5, color: "#6b7a66", marginBottom: 10 }}>
          {pages.length} page{pages.length !== 1 ? "s" : ""} in Mushaf order · {segmentsSummary(value)}
        </div>
      )}

      {/* Kind tabs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 10 }}>
        {(["juz", "hizb", "surah", "pages"] as Kind[]).map(k => (
          <button key={k} type="button" onClick={() => setKind(k)} style={{ ...chip(kind === k), padding: "7px 4px", fontSize: 12 }}>
            {k === "juz" ? "Juz" : k === "hizb" ? "Hizb" : k === "surah" ? "Surah" : "Pages"}
          </button>
        ))}
      </div>

      {kind === "juz" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 5 }}>
          {Array.from({ length: 30 }, (_, i) => i + 1).map(n => (
            <button key={n} type="button" onClick={() => toggle({ t: "juz", n })} style={chip(has({ t: "juz", n }))}>{n}</button>
          ))}
        </div>
      )}

      {kind === "hizb" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 5 }}>
          {Array.from({ length: 60 }, (_, i) => i + 1).map(n => (
            <button key={n} type="button" onClick={() => toggle({ t: "hizb", n })} style={chip(has({ t: "hizb", n }))}>{n}</button>
          ))}
        </div>
      )}

      {kind === "surah" && (
        <div>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search surah (name or number)…"
            style={{ ...input, width: "100%", boxSizing: "border-box", marginBottom: 6 }} />
          <div style={{ maxHeight: 190, overflowY: "auto", border: `1px solid ${BRD}`, borderRadius: 8, background: "#fff" }}>
            {surahs.map(s => {
              const seg: Segment = { t: "surah", n: s.num };
              const on = has(seg);
              return (
                <button key={s.num} type="button" onClick={() => toggle(seg)}
                  style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center",
                    padding: "8px 10px", border: "none", borderBottom: `1px solid ${BRD}`, cursor: "pointer",
                    background: on ? "#ecfdf3" : "#fff", fontSize: 12, color: "#1f2937" }}>
                  <span>{s.num}. {s.name}</span>
                  <span style={{ fontFamily: "serif", fontSize: 14 }}>{on ? "✓ " : ""}{s.nameAr}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {kind === "pages" && (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="number" inputMode="numeric" min={1} max={604} value={from} placeholder="From page"
            onChange={e => setFrom(e.target.value)} style={input} />
          <span style={{ fontSize: 12, color: "#6b7a66" }}>–</span>
          <input type="number" inputMode="numeric" min={1} max={604} value={to} placeholder="To (optional)"
            onChange={e => setTo(e.target.value)} style={input} />
          <button type="button" onClick={addPages}
            style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: G, color: "#fff",
              fontWeight: 800, fontSize: 12, cursor: "pointer" }}>Add</button>
        </div>
      )}
    </div>
  );
}

export { segmentRange };
