/*  src/components/InstallPWAPrompt.tsx
    ═══════════════════════════════════════════════════════════════════════
    WhatsApp-style "Add to Home Screen" bottom sheet.

    - Android/Desktop Chrome: captures the beforeinstallprompt event and
      shows a native install dialog when user taps "Install".
    - iOS Safari: shows step-by-step Share → Add to Home Screen instructions
      because iOS doesn't support beforeinstallprompt.
    - Already installed (standalone mode): shows nothing.
    - User dismissed: hides for 7 days, then offers again.

    Mount once in your root layout (e.g. App.tsx or student layout):
      import InstallPWAPrompt from "@/components/InstallPWAPrompt";
      <InstallPWAPrompt />
    ═══════════════════════════════════════════════════════════════════════
*/
import { useEffect, useState, useRef } from "react";
import { X, Share, Plus, Smartphone, Download } from "lucide-react";

const DISMISS_KEY = "tahleem_install_dismissed_until";
const IP_G    = "#064E3B";
const IP_GM   = "#075E54";
const IP_GOLD = "#C9A84C";

type Platform = "android" | "ios" | "desktop" | "installed" | "unsupported";

function detectPlatform(): Platform {
  // Already running as installed PWA
  if (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  ) return "installed";

  const ua = navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isAndroid = /android/.test(ua);
  const isSafari = /safari/.test(ua) && !/chrome/.test(ua);

  if (isIOS && isSafari) return "ios";
  if (isAndroid) return "android";
  if (!isIOS && !isAndroid) return "desktop";
  return "unsupported";
}

function isDismissed(): boolean {
  const until = localStorage.getItem(DISMISS_KEY);
  if (!until) return false;
  return Date.now() < parseInt(until, 10);
}

function dismiss7Days() {
  localStorage.setItem(DISMISS_KEY, String(Date.now() + 7 * 24 * 60 * 60 * 1000));
}

export default function InstallPWAPrompt() {
  const [platform,     setPlatform]     = useState<Platform>("unsupported");
  const [visible,      setVisible]      = useState(false);
  const [leaving,      setLeaving]      = useState(false);
  const [iosStep,      setIosStep]      = useState(0);    // 0 = not started
  const deferredPrompt = useRef<any>(null);

  useEffect(() => {
    const p = detectPlatform();
    setPlatform(p);
    if (p === "installed" || p === "unsupported") return;
    if (isDismissed()) return;

    // Android/Desktop: wait for browser to say app is installable
    const onPrompt = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e;
      // Wait 20s before showing — let user experience the app first
      setTimeout(() => setVisible(true), 20_000);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);

    // iOS: beforeinstallprompt never fires, show after 25s automatically
    if (p === "ios") {
      const t = setTimeout(() => setVisible(true), 25_000);
      return () => { clearTimeout(t); window.removeEventListener("beforeinstallprompt", onPrompt); };
    }

    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!visible || platform === "installed" || platform === "unsupported") return null;

  const hide = (permanent = false) => {
    setLeaving(true);
    if (permanent) dismiss7Days();
    setTimeout(() => setVisible(false), 350);
  };

  const handleInstall = async () => {
    if (platform === "ios") {
      setIosStep(1); // show step-by-step
      return;
    }
    if (deferredPrompt.current) {
      deferredPrompt.current.prompt();
      const { outcome } = await deferredPrompt.current.userChoice;
      deferredPrompt.current = null;
      if (outcome === "accepted") { dismiss7Days(); setVisible(false); }
      else hide(false);
    }
  };

  return (
    <>
      <style>{`
        @keyframes pwaSlideUp   { from { transform:translateY(100%);opacity:0 } to { transform:translateY(0);opacity:1 } }
        @keyframes pwaSlideDown { from { transform:translateY(0);opacity:1 } to { transform:translateY(100%);opacity:0 } }
        @keyframes pwaFadeIn    { from { opacity:0 } to { opacity:1 } }
        @keyframes pwaFadeOut   { from { opacity:1 } to { opacity:0 } }
        @keyframes pwaPulse     { 0%,100%{transform:scale(1)}50%{transform:scale(1.04)} }
        @keyframes iosBounce    { 0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)} }
      `}</style>

      {/* Backdrop */}
      <div
        onClick={() => hide(false)}
        style={{
          position: "fixed", inset: 0, zIndex: 8888,
          background: "rgba(0,0,0,.5)", backdropFilter: "blur(4px)",
          animation: leaving ? "pwaFadeOut .35s ease forwards" : "pwaFadeIn .3s ease forwards",
        }}
      />

      {/* Bottom sheet */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 8889,
        background: "#fff", borderRadius: "24px 24px 0 0",
        padding: "0 0 env(safe-area-inset-bottom,16px)",
        boxShadow: "0 -8px 48px rgba(0,0,0,.2)",
        fontFamily: "'Cairo',system-ui,sans-serif",
        animation: leaving ? "pwaSlideDown .35s ease forwards" : "pwaSlideUp .35s ease forwards",
        maxHeight: "90vh", overflowY: "auto",
      }}>
        {/* Drag handle */}
        <div style={{ display:"flex", justifyContent:"center", padding:"12px 0 4px" }}>
          <div style={{ width:40, height:4, borderRadius:2, background:"#E5E7EB" }} />
        </div>

        {/* Close button */}
        <button
          onClick={() => hide(true)}
          style={{ position:"absolute", top:16, right:16, background:"#F3F4F6", border:"none", borderRadius:"50%", width:32, height:32, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}
        >
          <X size={16} color="#6B7280" />
        </button>

        <div style={{ padding:"8px 24px 28px" }}>
          {/* Header */}
          <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:20 }}>
            <img src="/icons/icon-96x96.png" alt="Tahleem" style={{ width:56, height:56, borderRadius:16, boxShadow:"0 4px 16px rgba(6,78,59,.2)" }} />
            <div>
              <div style={{ fontSize:18, fontWeight:900, color:"#111", marginBottom:2 }}>Tahleem Academy</div>
              <div style={{ fontSize:13, color:"#6B7280" }}>tahleemacademy.vercel.app</div>
            </div>
          </div>

          {/* Benefits */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:24 }}>
            {[
              { emoji:"⚡", title:"Instant open",   desc:"No browser loading" },
              { emoji:"🔔", title:"Class alerts",    desc:"Even when closed"  },
              { emoji:"📶", title:"Works offline",   desc:"Poor connection OK" },
              { emoji:"📞", title:"Ring on call",    desc:"Like WhatsApp"     },
            ].map((b,i) => (
              <div key={i} style={{ background:"#F9FAFB", borderRadius:12, padding:"12px", border:"1px solid #F0F0F0" }}>
                <div style={{ fontSize:22, marginBottom:4 }}>{b.emoji}</div>
                <div style={{ fontSize:12, fontWeight:800, color:"#111" }}>{b.title}</div>
                <div style={{ fontSize:11, color:"#9CA3AF" }}>{b.desc}</div>
              </div>
            ))}
          </div>

          {/* iOS step-by-step instructions */}
          {platform === "ios" && iosStep > 0 && (
            <div style={{ background:"#F0FDF4", borderRadius:16, padding:"16px", border:"1px solid #86EFAC", marginBottom:20 }}>
              <div style={{ fontSize:13, fontWeight:800, color:IP_G, marginBottom:14 }}>Follow these steps:</div>
              {[
                { icon: <Share size={18} color={IP_G}/>, text: <>Tap the <strong>Share</strong> button at the bottom of Safari</>, active: iosStep === 1 },
                { icon: <Plus size={18} color={IP_G}/>,  text: <>Scroll down and tap <strong>"Add to Home Screen"</strong></>,         active: iosStep === 2 },
                { icon: <Smartphone size={18} color={IP_G}/>, text: <>Tap <strong>Add</strong> in the top right corner</>,             active: iosStep === 3 },
              ].map((step, i) => (
                <div
                  key={i}
                  onClick={() => setIosStep(Math.min(i+2, 4))}
                  style={{
                    display: "flex", alignItems: "center", gap: 12, marginBottom: i<2?12:0,
                    padding: "10px 12px", borderRadius: 12, cursor:"pointer",
                    background: step.active ? `${IP_G}12` : "transparent",
                    border: `1.5px solid ${step.active ? IP_G+"40" : "transparent"}`,
                    animation: step.active ? "iosBounce 1.2s ease infinite" : "none",
                  }}
                >
                  <div style={{ width:32, height:32, borderRadius:"50%", background: step.active ? `${IP_G}20` : "#E5E7EB", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    {step.icon}
                  </div>
                  <div style={{ fontSize:13, color:"#374151", lineHeight:1.5 }}>{step.text}</div>
                  {!step.active && <div style={{ marginLeft:"auto", fontSize:16 }}>✅</div>}
                </div>
              ))}
              {iosStep >= 4 && (
                <div style={{ marginTop:12, textAlign:"center", fontSize:14, fontWeight:700, color:IP_G }}>
                  🎉 Open from your home screen to enjoy the app!
                </div>
              )}
            </div>
          )}

          {/* Install / Done button */}
          {iosStep === 0 || platform !== "ios" ? (
            <button
              onClick={handleInstall}
              style={{
                width:"100%", padding:"16px", borderRadius:16, border:"none",
                background:`linear-gradient(135deg,${IP_G},${IP_GM})`,
                color:"#fff", fontSize:15, fontWeight:800, cursor:"pointer",
                display:"flex", alignItems:"center", justifyContent:"center", gap:10,
                boxShadow:`0 8px 32px ${IP_G}40`,
                animation:"pwaPulse 2s ease-in-out infinite",
              }}
            >
              {platform === "ios"
                ? <><Share size={18}/> Show me how to install</>
                : <><Download size={18}/> Install App — Free</>}
            </button>
          ) : iosStep < 4 ? (
            <button
              onClick={() => setIosStep(s => Math.min(s+1, 4))}
              style={{ width:"100%", padding:"16px", borderRadius:16, border:`2px solid ${IP_G}`, background:"#fff", color:IP_G, fontSize:14, fontWeight:700, cursor:"pointer" }}
            >
              Next Step →
            </button>
          ) : (
            <button
              onClick={() => hide(true)}
              style={{ width:"100%", padding:"16px", borderRadius:16, border:"none", background:`linear-gradient(135deg,${IP_G},${IP_GM})`, color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer" }}
            >
              ✅ Done — enjoy the app!
            </button>
          )}

          {/* Dismiss */}
          {iosStep === 0 && (
            <button
              onClick={() => hide(true)}
              style={{ width:"100%", padding:"12px", marginTop:10, borderRadius:12, border:"none", background:"none", color:"#9CA3AF", fontSize:13, cursor:"pointer" }}
            >
              Not now (remind me in 7 days)
            </button>
          )}
        </div>
      </div>
    </>
  );
}
