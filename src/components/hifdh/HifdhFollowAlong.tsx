// src/components/hifdh/HifdhFollowAlong.tsx
// STUDENT side of the Hifdh read-along class: shows the Quran page the ustadh is showing right now (his "Sync"),
// so students can follow along with what he reads. Minimize it any time to reach the class controls.
// Nothing is stored — the page arrives over a realtime broadcast and disappears when the ustadh stops syncing.

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import MushafPageView from "@/components/hifdh/MushafPageView";
import { useElementHeight } from "@/hooks/useElementHeight";
import { hpPagesOf, hpPortionLabel } from "@/lib/hifdhPortion";
import { BookOpen, Minimize2, Maximize2, Radio } from "lucide-react";

const db = supabase as any;
const G = "#064E3B", GOLD = "#C9A84C", INK = "#1a1a2e", MUTED = "#6b7a72", LINE = "#e3e9e5";

interface Shown { portion: any; cur: number; name: string }

export default function HifdhFollowAlong({ subject }: { subject: any }) {
  const [isMemClass, setIsMemClass] = useState(false);
  const [shown, setShown] = useState<Shown | null>(null);
  const [mini, setMini] = useState(false);
  const [size, setSize] = useState(26);
  const [boxRef, boxH] = useElementHeight();
  const [footerH, setFooterH] = useState(0);   // height of the class control bar at the bottom of the screen

  // only the Hifdh read-along subject
  useEffect(() => {
    let live = true;
    db.from("hifdh_settings").select("readalong_subject_id").eq("id", true).maybeSingle()
      .then(({ data }: any) => { if (live) setIsMemClass(!!data?.readalong_subject_id && data.readalong_subject_id === subject?.id); });
    return () => { live = false; };
  }, [subject?.id]);

  useEffect(() => {
    if (!isMemClass || !subject?.id) return;
    const ch = supabase.channel(`hifdh-follow-${subject.id}`)
      .on("broadcast", { event: "follow" }, ({ payload }: any) => {
        if (payload?.on && payload.portion && payload.cur) {
          setShown((prev) => {
            if (!prev) setMini(false);                       // first time it appears → open
            const name = String(payload.name || "");
            const same = prev && prev.cur === payload.cur && prev.name === name && JSON.stringify(prev.portion) === JSON.stringify(payload.portion);
            return same ? prev : { portion: payload.portion, cur: Number(payload.cur), name };
          });
        } else setShown(null);
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [isMemClass, subject?.id]);

  const pages = useMemo(() => (shown ? hpPagesOf(shown.portion) : []), [shown]);

  // ── minimized pip: drag it anywhere on screen (a short tap still opens the page) ──
  const PIP_W = 150, PIP_H = 40;
  const [pip, setPip] = useState<{ x: number; y: number } | null>(null);   // null = default spot (top right)
  const drag = useRef<{ id: number; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const clampPip = (x: number, y: number) => ({
    x: Math.min(Math.max(4, x), Math.max(4, window.innerWidth - PIP_W - 4)),
    y: Math.min(Math.max(4, y), Math.max(4, window.innerHeight - PIP_H - 4)),
  });
  useEffect(() => {
    if (!mini || !pip) return;
    const on = () => setPip((p) => (p ? clampPip(p.x, p.y) : p));
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, [mini, !!pip]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the panel exactly above the class control bar (any screen, rotation, safe-area, bar hidden/shown).
  // Measured from the real bar (.cv-bar) instead of a fixed % of the screen, so the page can use ALL the space above it.
  const open = isMemClass && !!shown && !mini;
  useEffect(() => {
    if (!open) return;
    const read = () => {
      const el = document.querySelector(".cv-bar") as HTMLElement | null;
      const vh = window.visualViewport?.height ?? window.innerHeight;
      const r = el?.getBoundingClientRect();
      const h = r && r.height > 0 ? Math.max(0, Math.round(vh - r.top)) : 0;
      setFooterH((prev) => (prev === h ? prev : h));
    };
    read();
    const bar = document.querySelector(".cv-bar");
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(read) : null;
    if (bar && ro) ro.observe(bar);
    window.addEventListener("resize", read);
    window.visualViewport?.addEventListener("resize", read);
    const iv = window.setInterval(read, 800);            // catches the bar sliding away / coming back
    return () => { ro?.disconnect(); window.removeEventListener("resize", read); window.visualViewport?.removeEventListener("resize", read); window.clearInterval(iv); };
  }, [open]);

  if (!isMemClass || !shown) return null;

  const btn = { width: 38, height: 38, flexShrink: 0, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 10, border: "none", cursor: "pointer", lineHeight: 0, background: "#eef3f0", color: INK } as const;

  if (mini) {
    const pos = pip ?? { x: Math.max(4, window.innerWidth - PIP_W - 10), y: 70 };
    return (
      <button
        aria-label="Open the page (drag to move)"
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y, moved: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current; if (!d || d.id !== e.pointerId) return;
          const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
          if (!d.moved && Math.hypot(dx, dy) < 6) return;
          d.moved = true;
          setPip(clampPip(d.ox + dx, d.oy + dy));
        }}
        onPointerUp={(e) => {
          const d = drag.current; drag.current = null;
          try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
          if (d && !d.moved) setMini(false);                 // tap → open
        }}
        onPointerCancel={() => { drag.current = null; }}
        style={{
          position: "fixed", left: pos.x, top: pos.y, zIndex: 5001, display: "flex", alignItems: "center", gap: 7, whiteSpace: "nowrap",
          padding: "9px 13px", borderRadius: 99, border: `1px solid ${GOLD}`, background: G, color: "#fff", fontWeight: 800, fontSize: 13, cursor: "grab",
          boxShadow: "0 4px 14px rgba(0,0,0,.3)", touchAction: "none", userSelect: "none", WebkitUserSelect: "none",
        }}>
        <BookOpen size={16} color={GOLD} /> Page {shown.cur} <Maximize2 size={14} color={GOLD} />
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", left: 0, right: 0, top: 0, bottom: footerH, zIndex: 5001, display: "flex", justifyContent: "center", pointerEvents: "none",
    }}>
      <div style={{
        pointerEvents: "auto", width: "100%", maxWidth: 640, height: "100%", background: "#fdf8ee", display: "flex", flexDirection: "column", overflow: "hidden",
        borderRadius: 0, boxShadow: "0 0 24px rgba(0,0,0,.35)", fontFamily: "system-ui, sans-serif", color: INK, overscrollBehavior: "contain",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "calc(8px + env(safe-area-inset-top, 0px)) 10px 8px", background: "#fff", borderBottom: `1px solid ${LINE}` }}>
          <Radio size={17} color="#16A34A" strokeWidth={2.6} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>Follow along · Page {shown.cur}</div>
            <div style={{ fontSize: 11.5, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{hpPortionLabel(shown.portion)}</div>
          </div>
          <button onClick={() => setSize(Math.max(18, size - 2))} aria-label="Smaller" style={{ ...btn, width: "auto", padding: "0 11px", fontWeight: 800 }}>A−</button>
          <button onClick={() => setSize(Math.min(40, size + 2))} aria-label="Larger" style={{ ...btn, width: "auto", padding: "0 11px", fontWeight: 800 }}>A+</button>
          <button onClick={() => setMini(true)} aria-label="Minimize" style={btn}><Minimize2 size={19} strokeWidth={2.4} /></button>
        </div>
        {shown.name && (
          <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "7px 12px", background: "#fbf3da", borderBottom: `1px solid ${GOLD}66` }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: "#78350F", opacity: .8 }}>Reading now</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: G, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{shown.name}</span>
          </div>
        )}
        <div ref={boxRef} style={{ flex: 1, minHeight: 0, overflowY: size > 26 ? "auto" : "hidden", overscrollBehavior: "contain", padding: "2px 4px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <MushafPageView key={shown.cur} page={shown.cur} fontSize={size} seamless availableHeight={Math.max(0, boxH - 4)} maxStretch={1.15} hidePortionChip />
        </div>
      </div>
    </div>
  );
}
