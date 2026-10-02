/**
 * MobileChatSheet.tsx — Tahleem Academy
 * Bottom sheet that holds the Chat / Polls panels on phones.
 *  • sits ABOVE the call-control bar (it used to be hidden behind it)
 *  • has a fixed height, so the message list fills the middle and the
 *    input stays pinned to the bottom like a normal chat app
 *  • follows the on-screen keyboard so the input is never covered
 */
import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";

interface Props {
  tabs: [string, string, string][];      // [key, icon, label]
  active: string;
  onTab: (key: string) => void;
  onClose: () => void;
  accent?: string;
  children: ReactNode;
}

export default function MobileChatSheet({ tabs, active, onTab, onClose, accent = "#0a7c68", children }: Props) {
  const [vp, setVp] = useState({ height: typeof window !== "undefined" ? window.innerHeight : 700, inset: 0 });

  useEffect(() => {
    const v = window.visualViewport;
    const update = () => {
      const height = v ? v.height : window.innerHeight;
      const inset = v ? Math.max(0, window.innerHeight - v.height - v.offsetTop) : 0;
      setVp({ height, inset });
    };
    update();
    v?.addEventListener("resize", update);
    v?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      v?.removeEventListener("resize", update);
      v?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const keyboardOpen = vp.inset > 80;
  // 72% of the screen normally; when the keyboard is up, use all the room left above it
  const height = keyboardOpen ? vp.height - 8 : Math.min(Math.max(vp.height * 0.72, 380), vp.height - 8);

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", zIndex: 70 }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: "absolute", left: 0, right: 0, bottom: vp.inset, height,
          background: "#13181f", borderRadius: "22px 22px 0 0",
          display: "flex", flexDirection: "column", overflow: "hidden",
          animation: "slide-up .22s ease",
          paddingBottom: keyboardOpen ? 0 : "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", padding: "10px 12px 0 16px", flexShrink: 0 }}>
          <div style={{ flex: 1, display: "flex" }}>
            {tabs.map(([k, ic, lb]) => (
              <button
                key={k}
                onClick={() => onTab(k)}
                style={{
                  flex: 1, padding: "10px 6px", background: "none", border: "none", cursor: "pointer",
                  color: active === k ? "#fff" : "rgba(255,255,255,.35)",
                  fontSize: 13, fontWeight: active === k ? 700 : 400,
                  borderBottom: active === k ? `2px solid ${accent}` : "2px solid transparent",
                }}
              >
                {ic} {lb}
              </button>
            ))}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ width: 36, height: 36, marginLeft: 8, borderRadius: "50%", background: "rgba(255,255,255,.1)", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
          >
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
