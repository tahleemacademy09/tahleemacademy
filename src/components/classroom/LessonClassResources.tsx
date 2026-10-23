import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { usePrivateStudent } from "@/hooks/usePrivateStudent";
import { useRecordingPlayer } from "@/contexts/RecordingPlayerContext";
import MaterialsViewer from "./MaterialsViewer";
import { Play, Pause, Video, Paperclip, X, ChevronUp, Clock } from "lucide-react";

const G = "#0f2d1f";
const GOLD = "#c9a84c";

/**
 * Shows, inside a lesson, the recording(s) of the live class that taught it and
 * any materials linked to it. Renders nothing at all when the lesson has neither,
 * so lessons without a linked class look exactly as before.
 */
const LessonClassResources = ({ lessonId }: { lessonId: string }) => {
  const { t } = useLanguage();
  const { hasRole } = useAuth();
  const { isPrivateStudent } = usePrivateStudent();
  const player = useRecordingPlayer();
  const isStaff = hasRole("admin") || hasRole("teacher");
  const [open, setOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["lesson-class-resources", lessonId, isPrivateStudent, isStaff],
    enabled: !!lessonId,
    staleTime: 30_000,
    queryFn: async () => {
      // Classes taught for this lesson
      const { data: sessions } = await supabase
        .from("live_sessions").select("id").eq("lesson_id", lessonId);
      const sessionIds = (sessions || []).map((s: any) => s.id);

      // Recordings of those classes
      let recordings: any[] = [];
      if (sessionIds.length) {
        const { data: recs } = await supabase
          .from("session_recordings").select("*")
          .in("session_id", sessionIds)
          .order("created_at", { ascending: true });
        recordings = (recs || []).filter((r: any) => {
          if (!r.file_url) return false;
          if (r.status && r.status !== "completed") return isStaff; // hide unfinished from students
          if (isStaff) return true;
          if (r.visibility === "private") return isPrivateStudent;
          if (r.visibility === "general") return !isPrivateStudent;
          return true;
        });
      }

      // Materials linked straight to the lesson, or to one of its classes.
      // (Row-level security still hides everything while a subject's materials are locked.)
      const orParts = [`lesson_id.eq.${lessonId}`];
      if (sessionIds.length) orParts.push(`session_id.in.(${sessionIds.join(",")})`);
      const { data: mats } = await supabase
        .from("subject_materials").select("*")
        .or(orParts.join(","))
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });

      return { recordings, materials: mats || [] };
    },
  });

  const recordings = data?.recordings || [];
  const materials = data?.materials || [];
  if (!recordings.length && !materials.length) return null;

  const fmtDur = (s: number) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m} min`;
  };

  return (
    <>
      {/* Bar above "Mark as Complete" */}
      <button
        onClick={() => setOpen(true)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "11px 20px",
          background: "#fffbeb", border: "none", borderTop: "1px solid #fde68a", cursor: "pointer",
          fontFamily: "inherit", flexShrink: 0,
        }}
      >
        {recordings.length > 0 && <Video size={16} color="#b45309" />}
        {materials.length > 0 && <Paperclip size={16} color="#b45309" />}
        <span style={{ flex: 1, textAlign: "start", fontSize: 13, fontWeight: 800, color: "#92400e" }}>
          {recordings.length > 0 && t(`Class recording${recordings.length > 1 ? "s" : ""} (${recordings.length})`, `تسجيل الحصة (${recordings.length})`)}
          {recordings.length > 0 && materials.length > 0 && " · "}
          {materials.length > 0 && t(`Materials (${materials.length})`, `المواد (${materials.length})`)}
        </span>
        <ChevronUp size={16} color="#b45309" />
      </button>

      {/* Bottom sheet */}
      {open && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 1001, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
          onClick={() => setOpen(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 720, maxHeight: "78vh", overflowY: "auto", background: "#fff", borderRadius: "20px 20px 0 0", padding: "16px 16px 24px", fontFamily: "'Cairo',sans-serif" }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: G }}>{t("This lesson's class", "حصة هذا الدرس")}</div>
              <button onClick={() => setOpen(false)} style={{ border: "none", background: "#f3f4f6", borderRadius: "50%", width: 30, height: 30, cursor: "pointer" }}>
                <X size={15} />
              </button>
            </div>

            {recordings.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: materials.length ? 18 : 0 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#7a9e88", letterSpacing: ".06em" }}>
                  {t("RECORDING", "التسجيل")}
                </div>
                {recordings.map((r: any, i: number) => {
                  const isActive = player.isActiveId(r.id);
                  const isPlaying = isActive && player.state.playing;
                  const dateStr = new Date(r.created_at).toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" });
                  return (
                    <button
                      key={r.id}
                      onClick={() => {
                        if (isActive) player.togglePlay();
                        else player.playRecording({ id: r.id, fileUrl: r.file_url, title: dateStr, duration: r.duration_seconds || 0 });
                      }}
                      style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, borderRadius: 14, cursor: "pointer", textAlign: "start", fontFamily: "inherit", background: "#fff", border: `1.5px solid ${isActive ? GOLD : "rgba(15,45,31,0.12)"}` }}
                    >
                      <div style={{ width: 44, height: 44, borderRadius: 12, background: `linear-gradient(135deg,${G},#1a4a30)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {isPlaying ? <Pause size={20} color="#fff" /> : <Play size={20} color="#fff" style={{ marginLeft: 2 }} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: G }}>
                          {recordings.length > 1 ? t(`Part ${i + 1}`, `الجزء ${i + 1}`) + " · " : ""}{dateStr}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "#7a9e88", marginTop: 2 }}>
                          {r.teacher_name && <span>{r.teacher_name}</span>}
                          {r.duration_seconds > 0 && (
                            <span style={{ display: "flex", alignItems: "center", gap: 3 }}><Clock size={11} />{fmtDur(r.duration_seconds)}</span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {materials.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#7a9e88", letterSpacing: ".06em", marginBottom: 8 }}>
                  {t("MATERIALS", "المواد")}
                </div>
                <MaterialsViewer materials={materials} />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default LessonClassResources;
