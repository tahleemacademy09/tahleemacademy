import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { removeStorageFile, getSignedUrl } from "@/integrations/supabase/storageClient";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { usePrivateStudent } from "@/hooks/usePrivateStudent";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Video, Play, Search, Clock, User, CheckCircle, Trash2, Edit, Save, Pause } from "lucide-react";
import { useState } from "react";
import { toast } from "@/hooks/use-toast";
import { useRecordingPlayer } from "@/contexts/RecordingPlayerContext";

const G      = "#0f2d1f";
const GM     = "#1a4731";
const GOLD   = "#c9a84c";
const BORDER = "rgba(15,45,31,0.1)";

const SubjectRecordings = ({ subjectId }: { subjectId: string }) => {
  const { t }             = useLanguage();
  const { user, hasRole } = useAuth();
  const qc                = useQueryClient();
  const player            = useRecordingPlayer();

  const [search, setSearch]       = useState("");
  const [resolvedUrls, setResolvedUrls] = useState<Record<string, string>>({});

  // Pre-resolve storage paths to signed/public URLs when recordings load
  const resolveUrls = async (recs: any[]) => {
    const toResolve = recs.filter(r => r.file_url && !r.file_url.startsWith("http"));
    if (!toResolve.length) return;
    const resolved: Record<string, string> = {};
    await Promise.all(toResolve.map(async r => {
      const url = await getSignedUrl(r.file_url, 7200).catch(() => null);
      if (url) resolved[r.id] = url;
    }));
    setResolvedUrls(prev => ({ ...prev, ...resolved }));
  };
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm]   = useState({ teacher_name: "", duration_seconds: 0 });
  const [deleteId, setDeleteId]   = useState<string | null>(null);

  const isPrivileged = hasRole("admin") || hasRole("teacher");
  const { isPrivateStudent } = usePrivateStudent();

  const { data: recordings, isLoading } = useQuery({
    queryKey: ["recordings", subjectId],
    queryFn: async () => {
      // Primary query: by subject_id (covers normally-saved recordings)
      const { data: bySubject, error: e1 } = await supabase
        .from("session_recordings").select("*").eq("subject_id", subjectId)
        .order("created_at", { ascending: false });
      if (e1) throw e1;

      // Secondary query: find sessions for this subject, then get recordings by session_id
      // This catches recordings where subject_id was null at save time (emergency saves)
      const { data: sessions } = await supabase
        .from("live_sessions").select("id").eq("subject_id", subjectId);
      const sessionIds = (sessions || []).map((s: any) => s.id);

      let bySession: any[] = [];
      if (sessionIds.length > 0) {
        const { data: sr } = await supabase
          .from("session_recordings").select("*")
          .in("session_id", sessionIds)
          .is("subject_id", null)          // only orphaned rows (subject_id not set)
          .order("created_at", { ascending: false });
        bySession = sr || [];
      }

      // Merge + deduplicate by id, sort newest first
      const all = [...(bySubject || []), ...bySession];
      const seen = new Set<string>();
      const merged = all.filter((r: any) => {
        if (seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      }).sort((a: any, b: any) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      // Filter by visibility for students (admins/teachers see everything)
      if (isPrivileged) return merged;
      return merged.filter((r: any) => {
        if (r.visibility === "private") return isPrivateStudent;
        if (r.visibility === "general") return !isPrivateStudent;
        return true; // "all" or null
      });
    },
  });

  // Resolve URLs whenever recordings change
  const prevRecIdsRef = { current: "" };
  if (recordings) {
    const key = (recordings || []).map((r: any) => r.id).join(",");
    if (key !== prevRecIdsRef.current) {
      prevRecIdsRef.current = key;
      resolveUrls(recordings || []);
    }
  }

  const { data: progressMap } = useQuery({
    queryKey: ["recording-progress", subjectId, user?.id],
    enabled: !!user && !!recordings?.length,
    queryFn: async () => {
      const ids = recordings?.map(r => r.id) || [];
      if (!ids.length) return {};
      const { data } = await supabase
        .from("recording_watch_progress" as any).select("*")
        .eq("student_id", user!.id).in("recording_id", ids);
      const map: Record<string, any> = {};
      (data || []).forEach((p: any) => { map[p.recording_id] = p; });
      return map;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, teacher_name, duration_seconds }: any) => {
      const { error } = await supabase.from("session_recordings")
        .update({ teacher_name, duration_seconds }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recordings", subjectId] });
      setEditingId(null);
      toast({ title: t("Updated", "تم التحديث") });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const rec = recordings?.find(r => r.id === id);
      if (rec?.file_url) await removeStorageFile(rec.file_url).catch(() => {});
      const { error } = await supabase.from("session_recordings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recordings", subjectId] });
      setDeleteId(null);
      toast({ title: t("Deleted", "تم الحذف") });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const filtered = recordings?.filter(r =>
    (r.teacher_name || "").toLowerCase().includes(search.toLowerCase()) ||
    new Date(r.created_at!).toLocaleDateString().includes(search)
  );

  const fmtDur = (s: number) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m} min`;
  };

  if (isLoading) return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "16px" }}>
      {[1, 2].map(i => <div key={i} style={{ height: 100, borderRadius: 14, background: "#f0f4f0", animation: "pulse 1.5s infinite" }} />)}
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
    </div>
  );

  return (
    <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 14, fontFamily: "'Cairo',sans-serif" }}>

      {/* Search */}
      <div style={{ position: "relative" }}>
        <Search style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 15, height: 15, color: "#7a9e88" }} />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder={t("Search recordings\u2026", "\u0628\u062d\u062b \u0641\u064a \u0627\u0644\u062a\u0633\u062c\u064a\u0644\u0627\u062a\u2026")}
          style={{ width: "100%", paddingLeft: 36, paddingRight: 14, paddingTop: 10, paddingBottom: 10, borderRadius: 12, border: `1px solid ${BORDER}`, background: "#fff", fontSize: 13, outline: "none", color: G, fontFamily: "'Cairo',sans-serif", boxSizing: "border-box" }} />
      </div>

      {!filtered?.length && (
        <div style={{ textAlign: "center", padding: "40px 20px", background: "#fff", borderRadius: 16, border: `1px solid ${BORDER}` }}>
          <Video style={{ width: 40, height: 40, color: "#cbd5e0", margin: "0 auto 12px" }} />
          <div style={{ fontSize: 15, fontWeight: 700, color: G, marginBottom: 4 }}>{t("No recordings yet", "\u0644\u0627 \u062a\u0648\u062c\u062f \u062a\u0633\u062c\u064a\u0644\u0627\u062a \u0628\u0639\u062f")}</div>
          <div style={{ fontSize: 12, color: "#7a9e88" }}>{t("Recordings will appear here after class", "\u0633\u062a\u0638\u0647\u0631 \u0627\u0644\u062a\u0633\u062c\u064a\u0644\u0627\u062a \u0647\u0646\u0627 \u0628\u0639\u062f \u0627\u0644\u062d\u0635\u0629")}</div>
        </div>
      )}

      {filtered?.map(r => {
        const prog      = progressMap?.[r.id];
        const pct       = prog && r.duration_seconds ? Math.min(100, Math.round((prog.progress_seconds / r.duration_seconds) * 100)) : 0;
        const completed = prog?.completed;
        const started   = prog && prog.progress_seconds > 0;
        const isActive  = player.isActiveId(r.id);
        const isPlaying = isActive && player.state.playing;
        const isLoadingRec = isActive && player.state.loading;
        const savedPos  = parseInt(localStorage.getItem(`tahleem-rec-pos-${r.id}`) || "0") || 0;
        const hasSaved  = savedPos > 5;
        const dateStr   = new Date(r.created_at!).toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" });

        return (
          <div key={r.id} style={{ background: "#fff", borderRadius: 16, border: `1.5px solid ${isActive ? GOLD : BORDER}`, overflow: "hidden", boxShadow: isActive ? `0 4px 16px rgba(201,168,76,.2)` : "0 2px 8px rgba(0,0,0,.06)", transition: "border-color .2s" }}>

            {/* Active indicator */}
            {isActive && <div style={{ height: 3, background: `linear-gradient(90deg,${GOLD},#f59e0b)` }} />}

            <div style={{ display: "flex", gap: 14, padding: "14px", alignItems: "flex-start" }}>

              {/* Thumbnail */}
              <div style={{ width: 72, height: 56, borderRadius: 10, background: isActive ? `linear-gradient(135deg,#b8850a,${GOLD})` : `linear-gradient(135deg,${G},${GM})`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, position: "relative", cursor: "pointer" }}
                onClick={() => { const url = resolvedUrls[r.id] || r.file_url; if (url) player.playRecording({ id: r.id, fileUrl: url, title: dateStr, duration: r.duration_seconds || 0 }); }}>
                {r.thumbnail_url
                  ? <img src={r.thumbnail_url} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 10 }} alt="" />
                  : isLoadingRec
                    ? <div style={{ width: 22, height: 22, borderRadius: "50%", border: "2.5px solid rgba(255,255,255,.8)", borderTopColor: "transparent", animation: "spin .7s linear infinite" }} />
                    : isPlaying
                      ? <Pause style={{ width: 22, height: 22, color: "#fff" }} />
                      : <Play  style={{ width: 22, height: 22, color: "rgba(255,255,255,.9)", marginLeft: 2 }} />}
                {started && (
                  <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, background: "rgba(255,255,255,.2)", borderRadius: "0 0 10px 10px" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: completed ? "#22c55e" : GOLD, borderRadius: 3 }} />
                  </div>
                )}
                {completed && (
                  <div style={{ position: "absolute", top: 4, right: 4, width: 18, height: 18, borderRadius: "50%", background: "#22c55e", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <CheckCircle style={{ width: 12, height: 12, color: "#fff" }} />
                  </div>
                )}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: G, marginBottom: 5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{dateStr}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#7a9e88" }}>
                    <User style={{ width: 12, height: 12 }} />{r.teacher_name || "Teacher"}
                  </span>
                  {r.duration_seconds != null && r.duration_seconds > 0 && (
                    <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#7a9e88" }}>
                      <Clock style={{ width: 12, height: 12 }} />{fmtDur(r.duration_seconds)}
                    </span>
                  )}
                  {hasSaved && !completed && <span style={{ fontSize: 10, color: GOLD, fontWeight: 700 }}>&crarr; {Math.floor(savedPos / 60)}m saved</span>}
                  {started && !completed && <span style={{ fontSize: 11, fontWeight: 700, color: GOLD }}>{pct}% watched</span>}
                  {completed && <span style={{ fontSize: 11, fontWeight: 700, color: "#22c55e" }}>&check; Completed</span>}
                  {isActive && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: GOLD, display: "flex", alignItems: "center", gap: 3 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: isPlaying ? "#22c55e" : GOLD, display: "inline-block" }} />
                      {isPlaying ? "Playing" : "Paused"}
                    </span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                <button
                  onClick={() => {
                    const url = resolvedUrls[r.id] || r.file_url;
                    if (!url) return;
                    if (isActive) player.togglePlay();
                    else player.playRecording({ id: r.id, fileUrl: url, title: dateStr, duration: r.duration_seconds || 0 });
                  }}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, background: isActive ? GOLD : G, border: "none", color: isActive ? G : "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Cairo',sans-serif", minWidth: 90, justifyContent: "center" }}>
                  {isLoadingRec
                    ? <div style={{ width: 13, height: 13, borderRadius: "50%", border: "2px solid currentColor", borderTopColor: "transparent", animation: "spin .7s linear infinite" }} />
                    : isPlaying ? <Pause style={{ width: 13, height: 13 }} /> : <Play style={{ width: 13, height: 13 }} />}
                  {isLoadingRec ? "Loading\u2026" : isPlaying ? "Pause" : completed ? t("Rewatch", "\u0625\u0639\u0627\u062f\u0629") : hasSaved ? t("Continue", "\u0645\u062a\u0627\u0628\u0639\u0629") : t("Play", "\u062a\u0634\u063a\u064a\u0644")}
                </button>

                {isPrivileged && (
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => { setEditForm({ teacher_name: r.teacher_name || "", duration_seconds: r.duration_seconds || 0 }); setEditingId(r.id); }}
                      style={{ flex: 1, padding: "6px 0", borderRadius: 8, background: "#f8fafb", border: `1px solid ${BORDER}`, color: "#7a9e88", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Edit style={{ width: 13, height: 13 }} />
                    </button>
                    <button onClick={() => setDeleteId(r.id)}
                      style={{ flex: 1, padding: "6px 0", borderRadius: 8, background: "#fff5f5", border: "1px solid #fca5a5", color: "#EF4444", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Trash2 style={{ width: 13, height: 13 }} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* Edit Dialog */}
      <Dialog open={!!editingId} onOpenChange={v => !v && setEditingId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("Edit Recording", "\u062a\u0639\u062f\u064a\u0644 \u0627\u0644\u062a\u0633\u062c\u064a\u0644")}</DialogTitle></DialogHeader>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: G, display: "block", marginBottom: 4 }}>{t("Teacher Name", "\u0627\u0633\u0645 \u0627\u0644\u0645\u0639\u0644\u0645")}</label>
              <input value={editForm.teacher_name} onChange={e => setEditForm({ ...editForm, teacher_name: e.target.value })}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: `1px solid ${BORDER}`, outline: "none", fontSize: 14, color: G, boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: G, display: "block", marginBottom: 4 }}>{t("Duration (seconds)", "\u0627\u0644\u0645\u062f\u0629 (\u062b\u0648\u0627\u0646\u064a)")}</label>
              <input type="number" value={editForm.duration_seconds} onChange={e => setEditForm({ ...editForm, duration_seconds: parseInt(e.target.value) || 0 })}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: `1px solid ${BORDER}`, outline: "none", fontSize: 14, color: G, boxSizing: "border-box" }} />
            </div>
            <button onClick={() => editingId && updateMutation.mutate({ id: editingId, ...editForm })} disabled={updateMutation.isPending}
              style={{ width: "100%", padding: "11px 0", borderRadius: 12, background: G, border: "none", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <Save style={{ width: 15, height: 15 }} />
              {updateMutation.isPending ? "Saving\u2026" : t("Save Changes", "\u062d\u0641\u0638 \u0627\u0644\u062a\u063a\u064a\u064a\u0631\u0627\u062a")}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Delete Recording?", "\u062d\u0630\u0641 \u0627\u0644\u062a\u0633\u062c\u064a\u0644\u061f")}</AlertDialogTitle>
            <AlertDialogDescription>{t("This cannot be undone.", "\u0644\u0627 \u064a\u0645\u043a\u043d \u0627\u0644\u062a\u0631\u0627\u062c\u0639 \u0639\u0646 \u0647\u0630\u0627.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancel", "\u0625\u0644\u063a\u0627\u0621")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)} className="bg-destructive text-destructive-foreground">
              {deleteMutation.isPending ? "Deleting\u2026" : t("Delete", "\u062d\u0630\u0641")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}} @keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
};

export default SubjectRecordings;
