// Shown instead of the whole app while VITE_MAINTENANCE=true.
// Renders with no providers, so nothing talks to the backend.
const G = "#064E3B";
const GOLD = "#C9973A";

const Maintenance = () => {
  const ar = typeof localStorage !== "undefined" && localStorage.getItem("tahleem-lang") === "ar";

  return (
    <div
      dir={ar ? "rtl" : "ltr"}
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "24px",
        background: "#FDFCF9",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
      }}
    >
      <img src="/brand-logo.png" alt="Tahleem Academy" style={{ width: 88, height: 88, objectFit: "contain", marginBottom: 20 }} />
      <h1 style={{ color: G, fontSize: 28, margin: "0 0 8px", fontWeight: 700 }}>
        {ar ? "نحن نقوم بتحديث النظام" : "We're upgrading Tahleem Academy"}
      </h1>
      <p style={{ color: GOLD, fontSize: 22, margin: "0 0 16px" }}>{ar ? "سنعود قريباً بإذن الله" : "سنعود قريباً بإذن الله"}</p>
      <p style={{ color: "#4B5563", fontSize: 16, maxWidth: 420, lineHeight: 1.6, margin: "0 0 28px" }}>
        {ar
          ? "نعمل على تحسين المنصة لتكون أسرع وأفضل. يرجى المحاولة بعد قليل. جزاكم الله خيراً على صبركم."
          : "We're making the platform faster and better. Please check back in a little while. Jazakumullah khayran for your patience."}
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          background: G,
          color: "#fff",
          border: "none",
          borderRadius: 12,
          padding: "12px 28px",
          fontSize: 16,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {ar ? "حاول مرة أخرى" : "Try again"}
      </button>
    </div>
  );
};

export default Maintenance;
