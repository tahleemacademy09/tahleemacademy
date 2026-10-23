import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { storageSupabase } from "../../integrations/supabase/storageClient";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Megaphone, Plus, Pin, Trash2, FileText, MessageCircle, Send, Heart, ThumbsUp, BookOpen } from "lucide-react";

const REACTIONS = ["👍", "❤️", "🤲", "📖", "⭐"];

const SubjectAnnouncements = ({ subjectId }: { subjectId: string }) => {
  const { t } = useLanguage();
  const { user, hasRole, profile } = useAuth();
  const qc = useQueryClient();
  const isPrivileged = hasRole("admin") || hasRole("teacher");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", content: "", is_pinned: false });
  const [file, setFile] = useState<File | null>(null);
  const [replyInputs, setReplyInputs] = useState<Record<string, string>>({});
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  // Local reactions state (stored in memory since no DB table for this yet)
  const [reactions, setReactions] = useState<Record<string, Record<string, string[]>>>({});

  const { data: announcements, isLoading } = useQuery({
    queryKey: ["announcements", subjectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("subject_announcements")
        .select("*").eq("subject_id", subjectId).order("is_pinned", { ascending: false }).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Use session_chat table with a special prefix for announcement comments
  const { data: comments } = useQuery({
    queryKey: ["announcement-comments", subjectId],
    queryFn: async () => {
      const { data } = await supabase.from("session_chat")
        .select("*").like("session_id", `ann-${subjectId}%`).order("created_at", { ascending: true });
      // Load profiles
      const userIds = [...new Set((data || []).map(m => m.user_id))];
      if (userIds.length) {
        const { data: profs } = await supabase.from("profiles").select("user_id, full_name").in("user_id", userIds);
        return { messages: data || [], profiles: Object.fromEntries((profs || []).map(p => [p.user_id, p.full_name || "Student"])) };
      }
      return { messages: data || [], profiles: {} };
    },
  });

  const postMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      let fileUrl = null;
      if (file) {
        const path = `announcements/${subjectId}/${crypto.randomUUID()}-${file.name}`;
        const { error } = await storageSupabase.storage.from("subject-files").upload(path, file);
        if (error) throw error;
        fileUrl = path;
      }
      const { error } = await supabase.from("subject_announcements").insert({
        subject_id: subjectId, title: form.title, content: form.content,
        file_url: fileUrl, is_pinned: form.is_pinned, created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["announcements", subjectId] });
      setOpen(false);
      setForm({ title: "", content: "", is_pinned: false });
      setFile(null);
      toast({ title: t("Announcement posted", "تم نشر الإعلان") });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("subject_announcements").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["announcements", subjectId] });
      toast({ title: t("Deleted", "تم الحذف") });
    },
  });

  const sendComment = async (announcementId: string) => {
    const text = replyInputs[announcementId]?.trim();
    if (!text || !user) return;
    // Use session_chat with session_id = "ann-{subjectId}-{announcementId}"
    await supabase.from("session_chat").insert({
      session_id: `ann-${subjectId}-${announcementId}`,
      user_id: user.id,
      message: text,
    });
    setReplyInputs(prev => ({ ...prev, [announcementId]: "" }));
    qc.invalidateQueries({ queryKey: ["announcement-comments", subjectId] });
  };

  const toggleReaction = (announcementId: string, emoji: string) => {
    if (!user) return;
    setReactions(prev => {
      const annReactions = { ...(prev[announcementId] || {}) };
      const users = annReactions[emoji] || [];
      if (users.includes(user.id)) {
        annReactions[emoji] = users.filter(u => u !== user.id);
      } else {
        annReactions[emoji] = [...users, user.id];
      }
      return { ...prev, [announcementId]: annReactions };
    });
  };

  const getComments = (announcementId: string) => {
    return (comments?.messages || []).filter(m => m.session_id === `ann-${subjectId}-${announcementId}`);
  };

  if (isLoading) return <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />)}</div>;

  return (
    <div className="space-y-4">
      {isPrivileged && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1"><Plus className="h-3 w-3" />{t("Post Announcement", "نشر إعلان")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("New Announcement", "إعلان جديد")}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>{t("Title", "العنوان")}</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
              <div><Label>{t("Content", "المحتوى")}</Label><Textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={4} /></div>
              <div><Label>{t("Attachment (optional)", "مرفق (اختياري)")}</Label><Input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} /></div>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={form.is_pinned} onChange={(e) => setForm({ ...form, is_pinned: e.target.checked })} className="rounded" />
                <Label>{t("Pin this announcement", "تثبيت الإعلان")}</Label>
              </div>
              <Button className="w-full" onClick={() => postMutation.mutate()} disabled={!form.title || !form.content || postMutation.isPending}>
                {t("Post", "نشر")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {!announcements?.length ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">
          <Megaphone className="h-10 w-10 mx-auto mb-2 opacity-50" />
          {t("No announcements yet", "لا توجد إعلانات بعد")}
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => {
            const annComments = getComments(a.id);
            const annReactions = reactions[a.id] || {};
            const isExpanded = expandedComments.has(a.id);

            return (
              <Card key={a.id} className={a.is_pinned ? "border-primary/30" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {a.is_pinned && <Pin className="h-3 w-3 text-primary" />}
                        <p className="font-semibold text-sm">{a.title}</p>
                      </div>
                      <p className="text-sm text-muted-foreground whitespace-pre-line">{a.content}</p>
                      {a.file_url && (
                        <Badge variant="outline" className="mt-2 gap-1 text-xs cursor-pointer">
                          <FileText className="h-3 w-3" />{t("Attachment", "مرفق")}
                        </Badge>
                      )}
                      <p className="text-xs text-muted-foreground mt-2">{new Date(a.created_at).toLocaleString()}</p>

                      {/* Reactions */}
                      <div className="flex items-center gap-1 mt-2 flex-wrap">
                        {REACTIONS.map(emoji => {
                          const count = (annReactions[emoji] || []).length;
                          const isReacted = user && (annReactions[emoji] || []).includes(user.id);
                          return (
                            <button
                              key={emoji}
                              onClick={() => toggleReaction(a.id, emoji)}
                              className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs border transition-colors ${isReacted ? "bg-primary/10 border-primary/30" : "hover:bg-muted border-transparent"}`}
                            >
                              <span>{emoji}</span>
                              {count > 0 && <span className="text-[10px] text-muted-foreground">{count}</span>}
                            </button>
                          );
                        })}
                      </div>

                      {/* Comments */}
                      <div className="mt-3">
                        <button
                          onClick={() => setExpandedComments(prev => {
                            const next = new Set(prev);
                            next.has(a.id) ? next.delete(a.id) : next.add(a.id);
                            return next;
                          })}
                          className="text-xs text-primary hover:underline flex items-center gap-1"
                        >
                          <MessageCircle className="h-3 w-3" />
                          {annComments.length > 0
                            ? `${annComments.length} ${t("comments", "تعليقات")}`
                            : t("Add comment", "إضافة تعليق")}
                        </button>

                        {isExpanded && (
                          <div className="mt-2 space-y-2 ps-3 border-s-2 border-muted">
                            {annComments.map(c => (
                              <div key={c.id} className="text-xs">
                                <span className="font-medium text-foreground">{comments?.profiles[c.user_id] || "Student"}</span>
                                <span className="text-muted-foreground ms-2">{c.message}</span>
                                <span className="text-muted-foreground ms-2">{new Date(c.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                              </div>
                            ))}
                            <div className="flex gap-1.5 mt-1">
                              <Input
                                value={replyInputs[a.id] || ""}
                                onChange={(e) => setReplyInputs(prev => ({ ...prev, [a.id]: e.target.value }))}
                                placeholder={t("Write a comment...", "اكتب تعليق...")}
                                className="h-7 text-xs"
                                onKeyDown={(e) => e.key === "Enter" && sendComment(a.id)}
                              />
                              <Button size="icon" className="h-7 w-7 shrink-0" onClick={() => sendComment(a.id)} disabled={!replyInputs[a.id]?.trim()}>
                                <Send className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    {isPrivileged && (
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive shrink-0" onClick={() => deleteMutation.mutate(a.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SubjectAnnouncements;
