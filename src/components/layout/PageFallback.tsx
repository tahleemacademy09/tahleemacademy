/* Shown INSIDE a layout while a page's code loads, so the sidebar/header stay
   on screen and only the content area shows a light skeleton (instead of the
   whole app being replaced by a full-screen spinner on every navigation). */
export default function PageFallback() {
  const bar = (w: string, h = 14, mb = 12): React.CSSProperties => ({
    width: w, height: h, marginBottom: mb, borderRadius: 8,
    background: "linear-gradient(90deg, rgba(120,120,120,.10) 25%, rgba(120,120,120,.20) 37%, rgba(120,120,120,.10) 63%)",
    backgroundSize: "400% 100%", animation: "ta-shimmer 1.2s ease infinite",
  });
  return (
    <div aria-busy="true" aria-label="Loading" style={{ padding: 20, maxWidth: 900, margin: "0 auto" }}>
      <style>{`@keyframes ta-shimmer{0%{background-position:100% 50%}100%{background-position:0 50%}}`}</style>
      <div style={bar("40%", 22, 18)} />
      <div style={bar("100%", 90, 14)} />
      <div style={bar("100%", 90, 14)} />
      <div style={bar("70%", 14, 10)} />
      <div style={bar("85%", 14, 10)} />
    </div>
  );
}
