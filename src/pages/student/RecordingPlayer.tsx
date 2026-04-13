import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  ArrowLeft, Clock, Eye, Download, User, Calendar, Trash2, Pencil,
  Bookmark, StickyNote, Info, FileText, Loader2
} from "lucide-react";
import VideoPlayer from "@/components/recording/VideoPlayer";

const formatTime = (s: number) => {
  if (!s || isNaN(s)) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

const RecordingPlayer = () => {
  const { recordingId } = useParams<{ recordingId: string }>();
  const navigate = useNavigate();
  const { user, hasRole } = useAuth();
  const { toast } = useToast();
  const { t } = useLanguage();

  const [recording, setRecording] = useState<any>(null);
  const [subject, setSubject] = useState<any>(null);
  const [session, setSession] = useState<any>(null);
  const [playUrl, setPlayUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState<any>(null);
  const [bookmarks, setBookmarks] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [siblings, setSiblings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Bookmark/note input states
  const [bookmarkDialog, setBookmarkDialog] = useState(false);
  const [bookmarkTime, setBookmarkTime] = useState(0);
  const [bookmarkLabel, setBookmarkLabel] = useState("");
  const [noteDialog, setNoteDialog] = useState(false);
  const [noteTime, setNoteTime] = useState(0);
  const [noteText, setNoteText] = useState("");
  const [editingNote, setEditingNote] = useState<any>(null);
  const [editingBookmark, setEditingBookmark] = useState<any>(null);

  const isAdmin = hasRole("admin");
  const isTeacher = hasRole("teacher");

  useEffect(() => {
    if (recordingId && user) loadRecording();
  }, [recordingId, user]);

  const loadRecording = async () => {
    setLoading(true);
    try {
      // Load recording
      const { data: rec, error: recErr } = await supabase
        .from("session_recordings")
        .select("*")
        .eq("id", recordingId)
        .single();
      if (recErr || !rec) { setError("Recording not found"); setLoading(false); return; }
      setRecording(rec);

      // Load subject, session, progress, bookmarks, notes, siblings in parallel
      const [subRes, sessRes, progRes, bmRes, noteRes, sibRes] = await Promise.all([
        supabase.from("subjects" as any).select("*").eq("id", rec.subject_id).single(),
        supabase.from("live_sessions").select("*").eq("id", rec.session_id).single(),
        supabase.from("recording_watch_progress" as any).select("*")
          .eq("recording_id", recordingId).eq("student_id", user!.id).maybeSingle(),
        supabase.from("recording_bookmarks" as any).select("*")
          .eq("recording_id", recordingId).eq("student_id", user!.id).order("timestamp_seconds"),
        supabase.from("recording_notes" as any).select("*")
          .eq("recording_id", recordingId).eq("student_id", user!.id).order("timestamp_seconds"),
        supabase.from("session_recordings").select("id, created_at")
          .eq("subject_id", rec.subject_id).order("created_at"),
      ]);

      setSubject(subRes.data);
      setSession(sessRes.data);
      setProgress(progRes.data);
      setBookmarks((bmRes.data || []) as any[]);
      setNotes((noteRes.data || []) as any[]);
      setSiblings((sibRes.data || []) as any[]);

      // Generate play URL
      const fileUrl = rec.file_url;
      if (!fileUrl) { setError("Recording file not available yet."); setLoading(false); return; }

      if (fileUrl.startsWith("http")) {
        setPlayUrl(fileUrl);
      } else {
        // Try "recordings" bucket first (new), then "subject-files" (legacy fallback)
        const { data: d1 } = await supabase.storage.from("recordings").createSignedUrl(fileUrl, 3600);
        if (d1?.signedUrl) { setPlayUrl(d1.signedUrl); }
        else {
          const { data: d2 } = await supabase.storage.from("subject-files").createSignedUrl(fileUrl, 3600);
          setPlayUrl(d2?.signedUrl || null);
        }
      }

      // Increment view count
      await supabase.from("session_recordings")
        .update({ view_count: ((rec as any).view_count || 0) + 1, last_watched_at: new Date().toISOString() } as any)
        .eq("id", recordingId);

    } catch (err) {
      setError("Failed to load recording");
    }
    setLoading(false);
  };

  const saveProgress = useCallback(async (time: number) => {
    if (!recordingId || !user) return;
    const dur = recording?.duration_seconds || 0;
    const completed = dur > 0 ? time > dur * 0.9 : false;
    await supabase.from("recording_watch_progress" as any).upsert({
      recording_id: recordingId,
      student_id: user.id,
      progress_seconds: Math.floor(time),
      completed,
      last_watched_at: new Date().toISOString(),
      watch_count: (progress?.watch_count || 0) + (completed && !progress?.completed ? 1 : 0),
    } as any, { onConflict: "recording_id,student_id" });
  }, [recordingId, user, recording, progress]);

  const handleEnded = async () => {
    if (!recordingId || !user) return;
    await supabase.from("recording_watch_progress" as any).upsert({
      recording_id: recordingId,
      student_id: user.id,
      progress_seconds: recording?.duration_seconds || 0,
      completed: true,
      last_watched_at: new Date().toISOString(),
      watch_count: (progress?.watch_count || 0) + 1,
    } as any, { onConflict: "recording_id,student_id" });
  };

  // Navigation
  const currentIdx = siblings.findIndex(s => s.id === recordingId);
  const prevId = currentIdx > 0 ? siblings[currentIdx - 1]?.id : null;
  const nextId = currentIdx < siblings.length - 1 ? siblings[currentIdx + 1]?.id : null;

  // Bookmark CRUD
  const addBookmark = async () => {
    await supabase.from("recording_bookmarks" as any).insert({
      recording_id: recordingId, student_id: user!.id,
      timestamp_seconds: Math.floor(bookmarkTime), label: bookmarkLabel || null,
    } as any);
    toast({ title: `✅ Bookmark added at ${formatTime(bookmarkTime)}` });
    setBookmarkDialog(false);
    setBookmarkLabel("");
    const { data } = await supabase.from("recording_bookmarks" as any).select("*")
      .eq("recording_id", recordingId).eq("student_id", user!.id).order("timestamp_seconds");
    setBookmarks((data || []) as any[]);
  };

  const deleteBookmark = async (id: string) => {
    await supabase.from("recording_bookmarks" as any).delete().eq("id", id);
    setBookmarks(bm => bm.filter(b => b.id !== id));
  };

  const updateBookmark = async (id: string, label: string) => {
    await supabase.from("recording_bookmarks" as any).update({ label } as any).eq("id", id);
    setBookmarks(bm => bm.map(b => b.id === id ? { ...b, label } : b));
    setEditingBookmark(null);
  };

  // Note CRUD
  const addNote = async () => {
    if (!noteText.trim()) return;
    await supabase.from("recording_notes" as any).insert({
      recording_id: recordingId, student_id: user!.id,
      timestamp_seconds: Math.floor(noteTime), note_text: noteText,
    } as any);
    toast({ title: `✅ Note added at ${formatTime(noteTime)}` });
    setNoteDialog(false);
    setNoteText("");
    const { data } = await supabase.from("recording_notes" as any).select("*")
      .eq("recording_id", recordingId).eq("student_id", user!.id).order("timestamp_seconds");
    setNotes((data || []) as any[]);
  };

  const deleteNote = async (id: string) => {
    await supabase.from("recording_notes" as any).delete().eq("id", id);
    setNotes(n => n.filter(x => x.id !== id));
  };

  const updateNote = async (id: string, text: string) => {
    await supabase.from("recording_notes" as any).update({ note_text: text, updated_at: new Date().toISOString() } as any).eq("id", id);
    setNotes(n => n.map(x => x.id === id ? { ...x, note_text: text } : x));
    setEditingNote(null);
  };

  const downloadRecording = async () => {
    if (!recording?.file_url) return;
    if (recording.file_url.startsWith("http")) { window.open(recording.file_url, "_blank"); return; }
    const { data } = await supabase.storage.from("subject-files").createSignedUrl(recording.file_url, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0f3122" }}>
        <Loader2 className="h-10 w-10 animate-spin" style={{ color: "#c9973a" }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#0f3122" }}>
        <Card className="max-w-md w-full"><CardContent className="p-8 text-center space-y-4">
          <p className="text-lg font-semibold">{error}</p>
          <p className="text-sm text-muted-foreground">The recording may still be processing. Please check back later.</p>
          <div className="flex gap-3 justify-center">
            <Button onClick={() => navigate(-1)} variant="outline">Go Back</Button>
            <Button onClick={loadRecording} style={{ background: "#c9973a", color: "#fff" }}>Refresh</Button>
          </div>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "#faf9f6" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&family=Amiri:wght@400;700&display=swap');`}</style>

      {/* Top info bar */}
      <div className="sticky top-0 z-40 px-4 py-3 flex items-center gap-3 border-b"
        style={{ background: "rgba(15,49,34,0.97)", backdropFilter: "blur(8px)", borderColor: "rgba(201,151,58,0.3)" }}>
        <Button size="icon" variant="ghost" onClick={() => navigate(-1)} className="text-white hover:bg-white/10 shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-semibold truncate" style={{ fontFamily: "'Cairo', sans-serif" }}>
            {(subject as any)?.title || "Recording"}{session?.topic ? ` — ${session.topic}` : ""}
          </p>
          <div className="flex items-center gap-3 text-xs" style={{ color: "rgba(201,151,58,0.8)" }}>
            {recording?.teacher_name && <span className="flex items-center gap-1"><User className="h-3 w-3" />{recording.teacher_name}</span>}
            <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(recording.created_at).toLocaleDateString()}</span>
            {recording?.duration_seconds > 0 && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{Math.ceil(recording.duration_seconds / 60)} min</span>}
            <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{recording.view_count || 0}</span>
          </div>
        </div>
        {(isAdmin || isTeacher) && (
          <Button size="sm" variant="ghost" onClick={downloadRecording} className="text-white hover:bg-white/10 shrink-0">
            <Download className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Video Player */}
      <div className="max-w-5xl mx-auto px-2 sm:px-4 py-4">
        {playUrl ? (
          <VideoPlayer
            src={playUrl}
            duration={recording?.duration_seconds}
            bookmarks={bookmarks}
            initialProgress={progress?.progress_seconds || 0}
            onTimeUpdate={saveProgress}
            onPause={saveProgress}
            onEnded={handleEnded}
            onAddBookmark={(time) => { setBookmarkTime(time); setBookmarkDialog(true); }}
            onAddNote={(time) => { setNoteTime(time); setNoteDialog(true); }}
            onPrevRecording={prevId ? () => navigate(`/recordings/${prevId}`, { replace: true }) : undefined}
            onNextRecording={nextId ? () => navigate(`/recordings/${nextId}`, { replace: true }) : undefined}
            hasPrev={!!prevId}
            hasNext={!!nextId}
            isAdmin={isAdmin || isTeacher}
          />
        ) : (
          <div className="aspect-video bg-black rounded-xl flex items-center justify-center">
            <p className="text-white/60 text-sm">Recording not available</p>
          </div>
        )}

        {/* Tabs */}
        <Tabs defaultValue="bookmarks" className="mt-4">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="bookmarks" className="gap-1.5"><Bookmark className="h-3.5 w-3.5" /> {t("Bookmarks", "العلامات")} ({bookmarks.length})</TabsTrigger>
            <TabsTrigger value="notes" className="gap-1.5"><StickyNote className="h-3.5 w-3.5" /> {t("Notes", "الملاحظات")} ({notes.length})</TabsTrigger>
            <TabsTrigger value="info" className="gap-1.5"><Info className="h-3.5 w-3.5" /> {t("Info", "معلومات")}</TabsTrigger>
          </TabsList>

          {/* Bookmarks Tab */}
          <TabsContent value="bookmarks">
            <Card><CardContent className="p-4 space-y-2">
              {bookmarks.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-sm">
                  <Bookmark className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p>{t("No bookmarks yet.", "لا توجد علامات بعد.")}</p>
                  <p className="text-xs mt-1">{t("Tap 🔖 while watching to bookmark important moments.", "اضغط 🔖 أثناء المشاهدة لحفظ اللحظات المهمة.")}</p>
                </div>
              ) : bookmarks.map(b => (
                <div key={b.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 group">
                  <Badge className="shrink-0 cursor-pointer tabular-nums" style={{ background: "#c9973a", color: "#fff" }}
                    onClick={() => { /* would seek via ref - simplified */ }}>
                    {formatTime(b.timestamp_seconds)}
                  </Badge>
                  {editingBookmark?.id === b.id ? (
                    <Input value={editingBookmark.label || ""} autoFocus
                      onChange={e => setEditingBookmark({ ...editingBookmark, label: e.target.value })}
                      onBlur={() => updateBookmark(b.id, editingBookmark.label || "")}
                      onKeyDown={e => e.key === "Enter" && updateBookmark(b.id, editingBookmark.label || "")}
                      className="h-7 text-sm flex-1" />
                  ) : (
                    <span className="text-sm flex-1">{b.label || t("Bookmark", "علامة")}</span>
                  )}
                  <Button size="icon" variant="ghost" className="h-7 w-7 opacity-0 group-hover:opacity-100"
                    onClick={() => setEditingBookmark({ id: b.id, label: b.label || "" })}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 opacity-0 group-hover:opacity-100 text-destructive"
                    onClick={() => deleteBookmark(b.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </CardContent></Card>
          </TabsContent>

          {/* Notes Tab */}
          <TabsContent value="notes">
            <Card><CardContent className="p-4 space-y-2">
              {notes.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-sm">
                  <StickyNote className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p>{t("No notes yet.", "لا توجد ملاحظات بعد.")}</p>
                  <p className="text-xs mt-1">{t("Tap 📝 while watching to add notes.", "اضغط 📝 أثناء المشاهدة لإضافة ملاحظات.")}</p>
                </div>
              ) : notes.map(n => (
                <div key={n.id} className="p-3 rounded-lg border group hover:bg-muted/30">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-xs tabular-nums cursor-pointer" style={{ borderColor: "#c9973a", color: "#c9973a" }}>
                      {formatTime(n.timestamp_seconds)}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">{new Date(n.created_at).toLocaleDateString()}</span>
                    <div className="flex-1" />
                    <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover:opacity-100"
                      onClick={() => setEditingNote({ id: n.id, text: n.note_text })}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive"
                      onClick={() => deleteNote(n.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  {editingNote?.id === n.id ? (
                    <div className="space-y-2">
                      <Textarea value={editingNote.text} onChange={e => setEditingNote({ ...editingNote, text: e.target.value })} rows={2} />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => updateNote(n.id, editingNote.text)} style={{ background: "#c9973a", color: "#fff" }}>Save</Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingNote(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{n.note_text}</p>
                  )}
                </div>
              ))}
            </CardContent></Card>
          </TabsContent>

          {/* Info Tab */}
          <TabsContent value="info">
            <Card><CardContent className="p-4 space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-muted-foreground">{t("Subject", "المادة")}</span>
                  <p className="font-medium">{(subject as any)?.title || "—"}</p>
                  {(subject as any)?.title_ar && <p className="text-xs" style={{ fontFamily: "'Amiri', serif", color: "#c9973a" }} dir="rtl">{(subject as any).title_ar}</p>}
                </div>
                <div><span className="text-muted-foreground">{t("Teacher", "المعلم")}</span>
                  <p className="font-medium">{recording?.teacher_name || "—"}</p>
                </div>
                <div><span className="text-muted-foreground">{t("Date", "التاريخ")}</span>
                  <p className="font-medium">{new Date(recording.created_at).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
                </div>
                <div><span className="text-muted-foreground">{t("Duration", "المدة")}</span>
                  <p className="font-medium">{recording.duration_seconds ? `${Math.ceil(recording.duration_seconds / 60)} minutes` : "—"}</p>
                </div>
                <div><span className="text-muted-foreground">{t("Views", "المشاهدات")}</span>
                  <p className="font-medium">{recording.view_count || 0}</p>
                </div>
                <div><span className="text-muted-foreground">{t("Your Progress", "تقدمك")}</span>
                  <p className="font-medium">{progress?.completed ? "✅ Completed" : progress ? `${Math.round((progress.progress_seconds / (recording.duration_seconds || 1)) * 100)}%` : "Not started"}</p>
                </div>
              </div>
              {session?.topic && (
                <div><span className="text-muted-foreground">{t("Topic", "الموضوع")}</span>
                  <p className="font-medium">{session.topic}</p>
                  {session.topic_ar && <p className="text-xs" dir="rtl" style={{ fontFamily: "'Amiri', serif", color: "#c9973a" }}>{session.topic_ar}</p>}
                </div>
              )}
              {session?.homework && (
                <div><span className="text-muted-foreground">{t("Homework", "الواجب")}</span>
                  <p className="font-medium">{session.homework}</p>
                </div>
              )}
            </CardContent></Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Bookmark Dialog */}
      <Dialog open={bookmarkDialog} onOpenChange={setBookmarkDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bookmark className="h-4 w-4" style={{ color: "#c9973a" }} />
              {t("Add Bookmark", "إضافة علامة")} — {formatTime(bookmarkTime)}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder={t("Label (optional)", "وصف (اختياري)")} value={bookmarkLabel}
              onChange={e => setBookmarkLabel(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addBookmark()} autoFocus />
            <div className="flex gap-2">
              <Button onClick={addBookmark} className="flex-1" style={{ background: "#c9973a", color: "#fff" }}>
                {t("Add Bookmark", "إضافة")}
              </Button>
              <Button variant="outline" onClick={() => setBookmarkDialog(false)}>{t("Cancel", "إلغاء")}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Note Dialog */}
      <Dialog open={noteDialog} onOpenChange={setNoteDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <StickyNote className="h-4 w-4" style={{ color: "#c9973a" }} />
              {t("Add Note", "إضافة ملاحظة")} — {formatTime(noteTime)}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea placeholder={t("Write your note...", "اكتب ملاحظتك...")} value={noteText}
              onChange={e => setNoteText(e.target.value)} rows={4} autoFocus />
            <div className="flex gap-2">
              <Button onClick={addNote} className="flex-1" style={{ background: "#c9973a", color: "#fff" }} disabled={!noteText.trim()}>
                {t("Save Note", "حفظ")}
              </Button>
              <Button variant="outline" onClick={() => { setNoteDialog(false); setNoteText(""); }}>{t("Cancel", "إلغاء")}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RecordingPlayer;
