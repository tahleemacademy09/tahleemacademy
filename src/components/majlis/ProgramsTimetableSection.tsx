/*
  src/components/majlis/ProgramsTimetableSection.tsx — Tahleem Academy
  ──────────────────────────────────────────────────────────────────
  "Programs" section of the timetable (Halqah, Halqatu Nisaa, Lecture Program…).

  A program slot is NOT a subject class. Its Join button opens Al-Majlis Live
  (the dedicated is_majlis_live subject / classroom room). When a host starts a
  program slot, the live_sessions row is stamped with program_id; a DB trigger
  copies that onto session_recordings, so Majlis recordings are grouped by program.

  • Students: can join once the room is live (button opens 15 min before the slot)
  • Admin/teacher: Join also STARTS the room for that program if nobody has yet
*/
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Video, Radio, Lock, Users, Play, Layers } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useLiveClass } from "@/contexts/LiveClassContext";
import { useViewingTermId } from "@/hooks/useCurrentTermId";
import { toast } from "@/hooks/use-toast";

const G = "#0f2d1f", GM = "#1a4731", GOLD = "#c9a84c";

export interface MajlisProgram {
  id: string; slug: string; name: string; name_ar: string | null;
  description: string | null; audience: string; color: string;
  sort_order: number; is_active: boolean;
}
export interface ProgramSlot {
  id: string; program_id: string; title: string | null; day_of_week: number;
  start_time: string; end_time: string; host_ids: string[] | null;
  levels: string[] | null; notes: string | null; term_id: string | null; is_active: boolean;
}

const DAYS = [
  { en: "Sun", ar: "أحد" }, { en: "Mon", ar: "إثنين" }, { en: "Tue", ar: "ثلاثاء" },
  { en: "Wed", ar: "أربعاء" }, { en: "Thu", ar: "خميس" }, { en: "Fri", ar: "جمعة" }, { en: "Sat", ar: "سبت" },
];

const to12 = (s: string) => {
  if (!s) return "";
  const [h, m] = s.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};
const minsUntil = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  const d = new Date(); d.setHours(h, m, 0, 0);
  return (d.getTime() - Date.now()) / 60000;
};

export function useMajlisPrograms() {
  return useQuery({
    queryKey: ["majlis-programs"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("majlis_programs").select("*")
        .eq("is_active", true).order("sort_order").order("name");
      return (data || []) as MajlisProgram[];
    },
  });
}

/** Starts (staff) or joins the Majlis room, tagging the session with the program. */
export function useJoinProgram(isStaff: boolean) {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const { joinClass } = useLiveClass();
  const [busy, setBusy] = useState<string | null>(null);

  const join = async (program: MajlisProgram, slot: ProgramSlot) => {
    if (!user) return;
    setBusy(slot.id);
    try {
      const { data: subj } = await (supabase as any).from("subjects").select("*")
        .eq("is_majlis_live", true).limit(1).maybeSingle();
      if (!subj) {
        toast({ title: t("Majlis isn't set up yet", "المجلس غير مهيأ بعد"), variant: "destructive" });
        return;
      }
      const { data: live } = await supabase.from("live_sessions").select("id")
        .eq("subject_id", subj.id).eq("status", "live").maybeSingle();
      if (live) { joinClass(subj); return; }

      if (!isStaff) {
        toast({
          title: t("Not started yet", "لم تبدأ بعد"),
          description: t("The host hasn't opened the majlis. Try again in a moment.", "لم يفتح المضيف المجلس بعد. حاول بعد قليل."),
        });
        return;
      }

      const nowIso = new Date().toISOString();
      const title = (slot.title || program.name).trim();
      const hostName = (profile as any)?.full_name || user.email || "Host";
      const { data: s, error: se } = await supabase.from("live_sessions").insert({
        subject_id: subj.id, host_id: user.id, status: "live", topic: title,
        scheduled_at: nowIso, started_at: nowIso, actual_start_time: nowIso, program_id: program.id,
      } as any).select("id").single();
      if (se) throw se;
      await (supabase as any).from("majlis_meetings").insert({
        title, kind: "lecture", audience: program.audience || "all", status: "live",
        started_at: nowIso, host_id: user.id, host_name: hostName, session_id: s!.id, program_id: program.id,
      });
      joinClass(subj);
    } catch (e: any) {
      toast({ title: t("Couldn't join", "تعذر الانضمام"), description: e?.message, variant: "destructive" });
    } finally { setBusy(null); }
  };
  return { join, busy };
}

export default function ProgramsTimetableSection({ isStaff = false }: { isStaff?: boolean }) {
  const { profile } = useAuth();
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const viewingTermId = useViewingTermId(profile);
  const studentLevel = (profile as any)?.level || (profile as any)?.course_level || "";
  const { data: programs = [] } = useMajlisPrograms();
  const { join, busy } = useJoinProgram(isStaff);
  const [filter, setFilter] = useState<string>("all");
  const todayIdx = new Date().getDay();

  const { data: slots = [], isLoading } = useQuery({
    queryKey: ["program-timetable", viewingTermId],
    queryFn: async () => {
      const { data } = await (supabase as any).from("program_timetable").select("*")
        .eq("is_active", true).order("day_of_week").order("start_time");
      return ((data || []) as ProgramSlot[]).filter(s => !s.term_id || !viewingTermId || s.term_id === viewingTermId);
    },
  });

  const { data: liveProgramId } = useQuery({
    queryKey: ["majlis-live-program"],
    refetchInterval: 20000,
    queryFn: async () => {
      const { data: subj } = await (supabase as any).from("subjects").select("id").eq("is_majlis_live", true).limit(1).maybeSingle();
      if (!subj) return null;
      const { data } = await supabase.from("live_sessions").select("id, program_id").eq("subject_id", subj.id).eq("status", "live").maybeSingle();
      return data ? ((data as any).program_id || "__none__") : null;
    },
  });

  const progById = useMemo(() => Object.fromEntries(programs.map(p => [p.id, p])), [programs]);

  const visible = slots.filter(s => {
    const p = progById[s.program_id]; if (!p) return false;
    if (filter !== "all" && s.program_id !== filter) return false;
    if (isStaff) return true;
    const lv = s.levels || [];
    return lv.length === 0 || lv.includes(studentLevel) || lv.includes("all");
  });

  if (!isLoading && programs.length > 0 && slots.length === 0 && !isStaff) return null;
  if (!programs.length) return null;

  // Week view starting from today so "what's next" is always on top.
  const order = Array.from({ length: 7 }, (_, i) => (todayIdx + i) % 7);
  const pName = (p: MajlisProgram) => (language === "ar" ? p.name_ar || p.name : p.name);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <Layers style={{ width: 18, height: 18, color: GOLD }} />
        <h2 style={{ fontSize: 16, fontWeight: 900, color: G, margin: 0 }}>{t("Programs", "البرامج")}</h2>
        {liveProgramId && (
          <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 9, background: "#FEF2F2", color: "#DC2626", display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Radio style={{ width: 10, height: 10 }} /> {t("LIVE", "مباشر")}
          </span>
        )}
      </div>

      <div style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", marginBottom: 12 }}>
        {[{ id: "all", label: t("All", "الكل"), color: GM }, ...programs.map(p => ({ id: p.id, label: pName(p), color: p.color }))].map(c => {
          const sel = filter === c.id;
          return (
            <button key={c.id} onClick={() => setFilter(c.id)}
              style={{ flexShrink: 0, padding: "6px 13px", borderRadius: 20, fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
                border: `1.5px solid ${sel ? c.color : "#e5e7eb"}`, background: sel ? c.color : "#fff", color: sel ? "#fff" : "#4b5563" }}>
              {c.label}
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 16, padding: "28px 16px", textAlign: "center", border: "1px solid #e5e7eb", color: "#9ca3af", fontSize: 13 }}>
          {t("No program sessions scheduled", "لا توجد جلسات برامج مجدولة")}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {order.map(d => {
            const daySlots = visible.filter(s => s.day_of_week === d);
            if (!daySlots.length) return null;
            return (
              <div key={d}>
                <p style={{ fontSize: 11, fontWeight: 800, color: d === todayIdx ? GOLD : "#6b7280", margin: "4px 2px 6px" }}>
                  {d === todayIdx ? t("Today", "اليوم") : language === "ar" ? DAYS[d].ar : DAYS[d].en}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {daySlots.map(slot => {
                    const p = progById[slot.program_id];
                    const isToday = d === todayIdx;
                    const ml = minsUntil(slot.start_time), me = minsUntil(slot.end_time);
                    const inWindow = isToday && ml <= 15 && me > 0;
                    const isPast = isToday && me <= 0;
                    const roomLiveForThis = liveProgramId === slot.program_id;
                    const canJoin = inWindow || roomLiveForThis;
                    return (
                      <div key={slot.id} style={{ background: "#fff", borderRadius: 16, border: `1.5px solid ${roomLiveForThis ? p.color : "#e5e7eb"}`, padding: 14, display: "flex", gap: 12, alignItems: "flex-start", opacity: isPast && !roomLiveForThis ? 0.5 : 1, boxShadow: roomLiveForThis ? `0 0 0 3px ${p.color}22` : "0 1px 4px rgba(0,0,0,.04)" }}>
                        <div style={{ textAlign: "center", flexShrink: 0, minWidth: 64 }}>
                          <div style={{ fontSize: 14, fontWeight: 900, color: G }}>{to12(slot.start_time)}</div>
                          <div style={{ fontSize: 10, color: "#d1d5db", margin: "1px 0" }}>—</div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af" }}>{to12(slot.end_time)}</div>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 9, background: `${p.color}18`, color: p.color, border: `1px solid ${p.color}40` }}>{pName(p)}</span>
                          {slot.title && <p style={{ fontSize: 14, fontWeight: 800, color: G, margin: "6px 0 0" }}>{slot.title}</p>}
                          {slot.notes && <p style={{ fontSize: 11, color: "#9ca3af", margin: "4px 0 0", lineHeight: 1.5 }}>{slot.notes}</p>}
                          <button onClick={() => navigate(`/${isStaff ? "teacher" : "student"}/majlis?live=1&tab=recordings&program=${p.id}`)}
                            style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 4, padding: 0, border: "none", background: "none", color: "#6b7280", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                            <Play style={{ width: 10, height: 10 }} /> {t("Recordings", "التسجيلات")}
                          </button>
                        </div>
                        {canJoin ? (
                          <button disabled={busy === slot.id} onClick={() => join(p, slot)}
                            style={{ display: "flex", alignItems: "center", gap: 5, padding: "9px 14px", borderRadius: 11, border: "none", background: roomLiveForThis ? p.color : GOLD, color: roomLiveForThis ? "#fff" : G, fontSize: 11, fontWeight: 800, cursor: "pointer", flexShrink: 0 }}>
                            <Video style={{ width: 12, height: 12 }} /> {t("Join", "انضمام")}
                          </button>
                        ) : isPast ? (
                          <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 700, padding: "9px 10px", flexShrink: 0 }}>{t("Ended", "انتهت")}</span>
                        ) : (
                          <div style={{ flexShrink: 0, opacity: 0.45 }}><Lock style={{ width: 14, height: 14, color: "#9ca3af", display: "block" }} /></div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
