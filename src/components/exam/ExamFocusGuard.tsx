/*  src/components/exam/ExamFocusGuard.tsx
    🔒 Hard lockdown for exam windows.

    Independent of webcam proctoring — this covers the whole screen the
    moment the tab is hidden or the window loses focus (alt-tab, another
    app, split screen, opening a new window/tab). The cover stays up even
    after the student returns; they must tap "Resume Exam" to continue,
    so switching away always costs a deliberate extra step and is always
    recorded. Combined with the native privacy-screen guard (screenshot/
    screen-recording block on the mobile app) and the existing proctoring
    violation log for exams that have webcam proctoring turned on.
*/
import { useEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";

interface Props {
  active: boolean;
  onViolation?: (awaySeconds: number) => void;
  language?: "en" | "ar";
}

const ExamFocusGuard = ({ active, onViolation, language = "en" }: Props) => {
  const [locked, setLocked] = useState(false);
  const hiddenAt = useRef<number | null>(null);
  const isAr = language === "ar";

  useEffect(() => {
    if (!active) { setLocked(false); hiddenAt.current = null; return; }

    const trigger = () => {
      if (document.hidden || !document.hasFocus()) {
        if (!hiddenAt.current) hiddenAt.current = Date.now();
        setLocked(true);
      }
    };

    document.addEventListener("visibilitychange", trigger);
    window.addEventListener("blur", trigger);
    // Catch it immediately if the guard mounts while already hidden/blurred
    trigger();

    return () => {
      document.removeEventListener("visibilitychange", trigger);
      window.removeEventListener("blur", trigger);
    };
  }, [active]);

  const resume = () => {
    if (hiddenAt.current) {
      const away = Math.round((Date.now() - hiddenAt.current) / 1000);
      hiddenAt.current = null;
      onViolation?.(away);
    }
    setLocked(false);
  };

  if (!active || !locked) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 99999, background: "#000",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 14, padding: 24, fontFamily: "'Cairo',sans-serif", textAlign: "center",
    }}>
      <Lock style={{ width: 52, height: 52, color: "#c9a84c" }} />
      <div style={{ fontSize: 20, fontWeight: 900, color: "#fff" }}>
        {isAr ? "الامتحان مقفل" : "Exam Locked"}
      </div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,.6)", maxWidth: 320, lineHeight: 1.5 }}>
        {isAr
          ? "غادرت نافذة الامتحان. تم تسجيل ذلك. اضغط أدناه للمتابعة."
          : "You left the exam window. This has been recorded. Tap below to continue."}
      </div>
      <button onClick={resume} style={{
        marginTop: 8, padding: "13px 30px", borderRadius: 12, background: "#c9a84c",
        border: "none", color: "#0f2d1f", fontWeight: 800, fontSize: 14, cursor: "pointer",
      }}>
        {isAr ? "استئناف الامتحان" : "Resume Exam"}
      </button>
    </div>
  );
};

export default ExamFocusGuard;
