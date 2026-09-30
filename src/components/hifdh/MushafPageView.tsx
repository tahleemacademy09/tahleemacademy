// src/components/hifdh/MushafPageView.tsx
// Read-only Quran page in the same parchment/mushaf style as the Daily Hifdh Revision screen.
// Usage: <MushafPageView page={50} />

import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { SURAHS } from "@/components/hifdh/surahData";

const MV_GOLD = "#C9A84C";

interface MvWord { t: string; line: number; }
interface MvAyah {
  numberInSurah: number;
  text: string;
  surahNum: number;
  words: MvWord[];
}

// Simple in-memory cache so flipping between pages is instant.
const MV_CACHE = new Map<number, Promise<MvAyah[]>>();

async function mvFetchPage(page: number): Promise<MvAyah[]> {
  try {
    const r = await fetch(
      `https://api.qurancdn.com/api/qdc/verses/by_page/${page}?words=true&per_page=50&fields=text_uthmani`,
    );
    if (r.ok) {
      const j = await r.json();
      const verses: any[] = j?.verses ?? [];
      if (verses.length) {
        return verses.map((v) => {
          const apiWords: any[] = (v.words || []).filter((w: any) => w.char_type_name !== "end");
          const text: string = v.text_uthmani ?? apiWords.map((w: any) => w.text_uthmani ?? w.text).join(" ");
          const split = text.split(/\s+/).filter(Boolean);
          let prev = 0;
          const words = split.map((t, i) => {
            const ln = apiWords[i]?.line_number ?? prev;
            prev = ln;
            return { t, line: ln };
          });
          return {
            numberInSurah: v.verse_number ?? 0,
            surahNum: v.chapter_id ?? Number(String(v.verse_key || "0:0").split(":")[0]),
            text, words,
          };
        });
      }
    }
  } catch { /* fall through to fallback */ }
  const r = await fetch(`https://api.alquran.cloud/v1/page/${page}/quran-uthmani`);
  if (!r.ok) return [];
  const j = await r.json();
  return (j?.data?.ayahs ?? []).map((a: any) => ({
    numberInSurah: a.numberInSurah, text: a.text, surahNum: a.surah?.number ?? 0,
    words: String(a.text).split(/\s+/).filter(Boolean).map((t: string) => ({ t, line: 0 })),
  }));
}
const mvLoad = (page: number) => {
  if (!MV_CACHE.has(page)) {
    const p = mvFetchPage(page).catch(() => { MV_CACHE.delete(page); return [] as MvAyah[]; });
    MV_CACHE.set(page, p);
  }
  return MV_CACHE.get(page)!;
};

const mvSurah = (n: number) => SURAHS.find((s: any) => s.num === n || s.id === n);

/** halves = [startHalf, endHalf] (0 = first half, 1 = second half). Words outside are dimmed. */
export default function MushafPageView({ page, fontSize = 26, halves }: { page: number; fontSize?: number; halves?: [number, number] }) {
  const [ayahs, setAyahs] = useState<MvAyah[] | null>(null);

  useEffect(() => {
    let alive = true;
    setAyahs(null);
    mvLoad(page).then((a) => { if (alive) setAyahs(a); });
    return () => { alive = false; };
  }, [page]);

  if (ayahs === null) {
    return <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><Loader2 className="animate-spin" color={MV_GOLD} /></div>;
  }
  if (!ayahs.length) {
    return <div style={{ padding: 24, textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>Could not load this page — check your internet connection.</div>;
  }

  // ── which half does each word belong to? (by real mushaf line when known, otherwise by word count)
  const flat = ayahs.flatMap((a) => a.words);
  const maxLine = Math.max(0, ...flat.map((w) => w.line));
  const splitLine = Math.ceil(maxLine / 2);
  const halfOfWord = (w: MvWord, idx: number) =>
    maxLine > 0 ? (w.line <= splitLine ? 0 : 1) : (idx < flat.length / 2 ? 0 : 1);
  const partial = !!halves && !(halves[0] === 0 && halves[1] === 1);
  const inPortion = (h: number) => !partial || (h >= halves![0] && h <= halves![1]);
  let running = 0;

  const first = mvSurah(ayahs[0].surahNum) as any;
  const last = mvSurah(ayahs[ayahs.length - 1].surahNum) as any;

  const renderAyah = (a: MvAyah, i: number) => {
    let lastHalf = 0;
    return (
      <React.Fragment key={i}>
        {a.words.map((w, wi) => {
          const h = halfOfWord(w, running++);
          lastHalf = h;
          return (
            <React.Fragment key={wi}>
              <span style={{ display: "inline-block", margin: "0 1px", color: "#000", opacity: inPortion(h) ? 1 : 0.2, transition: "opacity .2s" }}>{w.t}</span>{" "}
            </React.Fragment>
          );
        })}
        <span style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: "50%",
          border: `1.5px solid ${MV_GOLD}`, background: "#fffdf6", fontSize: 10, color: MV_GOLD, fontFamily: "'Amiri',serif",
          margin: "0 4px", verticalAlign: "middle", lineHeight: 1, opacity: inPortion(lastHalf) ? 1 : 0.2, WebkitTextStroke: "0",
        }}>{a.numberInSurah}</span>{" "}
      </React.Fragment>
    );
  };

  return (
    <div style={{
      background: "#fdf8ee", borderRadius: 4, border: `3px solid ${MV_GOLD}cc`, position: "relative", overflow: "hidden",
      boxShadow: `0 0 0 6px #fdf8ee, 0 0 0 7px ${MV_GOLD}66, 0 6px 28px rgba(0,0,0,.18)`,
      fontFamily: "'Amiri Quran','Amiri',serif", margin: "8px 7px",
    }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Amiri+Quran&family=Amiri:wght@400;700&display=swap');`}</style>

      {["top-left", "top-right", "bottom-left", "bottom-right"].map((c) => (
        <div key={c} style={{
          position: "absolute", width: 18, height: 18, background: MV_GOLD, zIndex: 2,
          top: c.startsWith("top") ? -1 : undefined, bottom: c.startsWith("bottom") ? -1 : undefined,
          left: c.endsWith("left") ? -1 : undefined, right: c.endsWith("right") ? -1 : undefined,
          clipPath: "polygon(50% 0%,100% 50%,50% 100%,0% 50%)",
        }} />
      ))}

      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "8px 0 4px",
        background: `linear-gradient(to bottom,${MV_GOLD}28,${MV_GOLD}08)`, borderBottom: `1px solid ${MV_GOLD}55`,
      }}>
        <span style={{ color: `${MV_GOLD}99`, fontSize: 14 }}>❧</span>
        <span style={{ fontFamily: "'Amiri',serif", fontSize: 12, fontWeight: 700, color: MV_GOLD, letterSpacing: 2 }}>{page}</span>
        <span style={{ color: `${MV_GOLD}99`, fontSize: 14 }}>❧</span>
      </div>

      {first && (
        <div style={{
          textAlign: "center", padding: "3px 10px", fontSize: 12, fontWeight: 700, color: `${MV_GOLD}dd`,
          background: `linear-gradient(to right,transparent,${MV_GOLD}10,transparent)`, fontFamily: "'Amiri',serif",
        }}>
          {first.arabicName || first.nameAr}
          {last && last.num !== first.num ? ` — ${last.arabicName || last.nameAr}` : ""}
        </div>
      )}

      {partial && (
        <div style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: "#78350F", background: "#fbf3da", padding: "4px 0", fontFamily: "'Cairo',sans-serif" }}>
          Your portion: {halves![0] === halves![1] ? (halves![0] === 0 ? "first half of the page" : "second half of the page") : "whole page"}
        </div>
      )}
      <div style={{ height: 1, background: `linear-gradient(to right,transparent,${MV_GOLD}88,transparent)`, margin: "0 14px" }} />

      <div style={{ padding: "14px 16px 10px" }}>
        <div style={{ direction: "rtl", textAlign: "justify", lineHeight: 2.6, fontSize, letterSpacing: 0, wordBreak: "normal", overflowWrap: "normal", color: "#000", WebkitTextStroke: "0.6px #000", textRendering: "optimizeLegibility" as any }}>
          {ayahs.map(renderAyah)}
        </div>
      </div>

      <div style={{ height: 1, background: `linear-gradient(to right,transparent,${MV_GOLD}88,transparent)`, margin: "0 14px" }} />
      <div style={{ padding: "5px 0", textAlign: "center", color: `${MV_GOLD}99`, fontSize: 12, letterSpacing: 6 }}>❦</div>
    </div>
  );
}
