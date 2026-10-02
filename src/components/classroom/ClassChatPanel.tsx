/**
 * ClassChatPanel.tsx — Tahleem Academy
 * Upgraded: image/file sharing, voice messages, image paste, file preview
 */
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Pin, Trash2, Smile, Send, Paperclip, Mic, Square, Image as ImageIcon, X, Lock, Plus } from "lucide-react";
import { useMaybeRoomContext } from "@livekit/components-react";
import { toast } from "@/hooks/use-toast";
import { usePrivateChat, chatStore, sendPrivateMessage, PrivatePicker } from "./privateChatStore";

interface ClassChatPanelProps {
  sessionId: string;
  sessionStartedAt?: string;
  guestName?: string;
  onEditName?: () => void;
  enablePrivate?: boolean;
}

const EMOJI_LIST = ["👏", "🤲", "❤️", "😂", "🌟", "👍", "🙏", "🔥"];
const UPLOAD_BUCKET = "chat-attachments";

const ClassChatPanel = ({ sessionId, sessionStartedAt, guestName, onEditName, enablePrivate }: ClassChatPanelProps) => {
  const { user, hasRole } = useAuth();
  const { t } = useLanguage();
  const isPrivileged = hasRole("admin") || hasRole("teacher");
  const [messages, setMessages]   = useState<any[]>([]);
  const [input, setInput]         = useState("");
  const [profiles, setProfiles]   = useState<Record<string, { name: string; role: string }>>({});
  const [showEmoji, setShowEmoji] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox]   = useState<string | null>(null);
  // Voice recording
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const mrRef       = useRef<MediaRecorder | null>(null);
  const recChunks   = useRef<Blob[]>([]);
  const recTimer    = useRef<any>(null);
  const scrollRef   = useRef<HTMLDivElement>(null);
  const listRef     = useRef<HTMLDivElement>(null);
  const inputRef    = useRef<HTMLInputElement>(null);
  const fileRef     = useRef<HTMLInputElement>(null);
  const fetchingIds   = useRef(new Set<string>());
  const optimisticIds = useRef(new Set<string>());
  const room = useMaybeRoomContext();
  const priv = usePrivateChat();
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const inPrivate = !!enablePrivate && !!target;
  const privThread = target ? priv.threads[target.id] : undefined;

  useEffect(() => {
    if (!enablePrivate) return;
    chatStore.setChatVisible(true);
    return () => {
      chatStore.setChatVisible(false);
      chatStore.setActivePeer(null);
    };
  }, [enablePrivate]);

  useEffect(() => {
    if (enablePrivate) chatStore.setActivePeer(target?.id || null);
  }, [enablePrivate, target?.id]);

  useEffect(() => {
    if (enablePrivate && priv.requested) {
      setTarget(priv.requested);
      setPickerOpen(false);
      chatStore.requestOpen(null);
    }
  }, [enablePrivate, priv.requested]);

  /* ── profile cache ── */
  const loadProfiles = async (userIds: string[]) => {
    const missing = userIds.filter(id => id && !profiles[id] && !fetchingIds.current.has(id));
    if (!missing.length) return;
    missing.forEach(id => fetchingIds.current.add(id));
    try {
      const { data } = await supabase.from("profiles").select("user_id, full_name").in("user_id", missing);
      const { data: roles } = await supabase.from("user_roles").select("user_id, role").in("user_id", missing);
      const np: Record<string, { name: string; role: string }> = {};
      (data || []).forEach(p => {
        const r = (roles || []).find(r => r.user_id === p.user_id);
        np[p.user_id] = { name: p.full_name || "Student", role: r?.role || "student" };
      });
      setProfiles(prev => ({ ...prev, ...np }));
    } finally {
      missing.forEach(id => fetchingIds.current.delete(id));
    }
  };

  useEffect(() => { setMessages([]); setProfiles({}); fetchingIds.current.clear(); }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    const load = async () => {
      let q = supabase.from("class_chat_messages").select("*").eq("session_id", sessionId).order("created_at");
      if (sessionStartedAt) q = q.gte("created_at", sessionStartedAt);
      const { data } = await q;
      setMessages(data || []);
      loadProfiles([...new Set((data || []).map((m: any) => m.sender_id).filter(Boolean))]);
    };
    load();
    const ch = supabase.channel(`class-chat-${sessionId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "class_chat_messages", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          if (sessionStartedAt && payload.new.created_at < sessionStartedAt) return;
          // Skip if we already added this row optimistically (sendMessage replaces temp with real row)
          if (optimisticIds.current.has(payload.new.id)) return;
          // Also skip if it's already in state (duplicate Realtime delivery)
          setMessages(prev => {
            if (prev.some(m => m.id === payload.new.id)) return prev;
            return [...prev, payload.new];
          });
          if (payload.new.sender_id) loadProfiles([payload.new.sender_id]);
        })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "class_chat_messages", filter: `session_id=eq.${sessionId}` },
        (payload) => setMessages(prev => prev.filter(m => m.id !== payload.old.id)))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [sessionId, sessionStartedAt]);

  // Scroll only the message list (scrollIntoView could also scroll the whole page)
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, target?.id, privThread?.messages.length]);

  /* ── send text — optimistic UI so messages appear instantly ── */
  const sendMessage = async (text?: string, type = "text", attachmentUrl?: string, attachmentName?: string) => {
    const msg = (text || input).trim();
    if (!msg && !attachmentUrl) return false;
    if (!user) {
      toast({ title: t("Please sign in again to chat", "يرجى تسجيل الدخول مجددًا للمحادثة"), variant: "destructive" });
      return false;
    }
    if (!sessionId) {
      toast({ title: t("Class chat isn't ready yet — try again in a moment", "المحادثة غير جاهزة بعد، حاول بعد لحظات"), variant: "destructive" });
      return false;
    }
    const typed = !text && !attachmentUrl;      // came from the text box

    // Clear the box straight away so sending feels instant
    if (typed) setInput("");
    setShowEmoji(false);

    // Show message locally right away with a temp id
    const tempId = `optimistic-${Date.now()}-${Math.random()}`;
    const optimisticMsg: any = {
      id: tempId,
      session_id: sessionId,
      sender_id: user.id,
      message: msg || attachmentName || "📎 File",
      type,
      created_at: new Date().toISOString(),
      is_pinned: false,
      ...(attachmentUrl ? { attachment_url: attachmentUrl, attachment_name: attachmentName || "" } : {}),
    };
    optimisticIds.current.add(tempId);
    setMessages(prev => [...prev, optimisticMsg]);

    // Persist to DB in background
    const { data, error } = await supabase.from("class_chat_messages").insert({
      session_id: sessionId,
      sender_id: user.id,
      message: msg || attachmentName || "📎 File",
      type,
      ...(attachmentUrl ? { attachment_url: attachmentUrl, attachment_name: attachmentName || "" } : {}),
    }).select().single();

    if (error) {
      // Rollback, give the text back to the sender, and say why it failed
      optimisticIds.current.delete(tempId);
      setMessages(prev => prev.filter(m => m.id !== tempId));
      if (typed) setInput(msg);
      toast({ title: t("Message not sent", "لم تُرسل الرسالة"), description: error.message, variant: "destructive" });
      return false;
    } else if (data) {
      // Swap temp message for the real DB row (has correct id & created_at)
      optimisticIds.current.delete(tempId);
      setMessages(prev => prev.map(m => m.id === tempId ? data : m));
    }
    return true;
  };

  /* ── image paste ── */
  const handlePaste = async (e: React.ClipboardEvent) => {
    if (inPrivate) return;
    const file = Array.from(e.clipboardData.items)
      .find(i => i.type.startsWith("image/"))?.getAsFile();
    if (file) { e.preventDefault(); await uploadFile(file); }
  };

  /* ── file / image upload ── */
  const MAX_UPLOAD_MB = 25;
  const uploadErrorText = (err: any) => {
    const msg = String(err?.message || err || "");
    if (/bucket not found/i.test(msg)) return t("Chat uploads aren't set up on the server yet.", "رفع الملفات غير مفعّل على الخادم بعد.");
    if (/row-level security|not authorized|unauthorized/i.test(msg)) return t("You don't have permission to upload here.", "لا تملك صلاحية الرفع هنا.");
    return msg || t("Upload failed", "فشل الرفع");
  };

  const uploadFile = async (file: File) => {
    if (!user || !sessionId) {
      toast({ title: t("Class chat isn't ready yet", "المحادثة غير جاهزة بعد"), variant: "destructive" });
      return;
    }
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      toast({ title: t(`File is too large (max ${MAX_UPLOAD_MB} MB)`, `الملف كبير جدًا (الحد ${MAX_UPLOAD_MB} ميجابايت)`), variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const ext  = (file.name.split(".").pop() || "bin").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || "bin";
      const path = `chat/${sessionId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
      const { error: upErr } = await supabase.storage.from(UPLOAD_BUCKET).upload(path, file, { upsert: false, contentType: file.type || undefined });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from(UPLOAD_BUCKET).getPublicUrl(path);
      const type = file.type.startsWith("image/") ? "image" : "file";
      await sendMessage(file.name, type, pub.publicUrl, file.name);
    } catch (err) {
      toast({ title: t("Upload failed", "فشل الرفع"), description: uploadErrorText(err), variant: "destructive" });
    } finally { setUploading(false); }
  };

  const onFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = "";
    if (f) await uploadFile(f);
  };

  /* ── voice recording ── */
  const recMime = () => {
    const MR: any = (window as any).MediaRecorder;
    if (!MR?.isTypeSupported) return "";
    return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(m => MR.isTypeSupported(m)) || "";
  };

  const startRecording = async () => {
    if (!(window as any).MediaRecorder || !navigator.mediaDevices?.getUserMedia) {
      toast({ title: t("Voice messages aren't supported on this browser", "الرسائل الصوتية غير مدعومة في هذا المتصفح"), variant: "destructive" });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = recMime();
      const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recChunks.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) recChunks.current.push(e.data); };
      mr.start(500);
      mrRef.current = mr;
      setRecording(true);
      setRecSeconds(0);
      recTimer.current = setInterval(() => setRecSeconds(s => s + 1), 1000);
    } catch {
      toast({ title: t("Microphone access is blocked", "الوصول إلى الميكروفون محظور"), description: t("Allow the microphone in your browser's site settings.", "اسمح بالميكروفون من إعدادات الموقع في المتصفح."), variant: "destructive" });
    }
  };

  const stopRecording = async () => {
    clearInterval(recTimer.current);
    setRecording(false);
    setRecSeconds(0);
    const mr = mrRef.current; if (!mr) return;
    const stopped = new Promise<void>(res => { mr.onstop = () => res(); });
    if (mr.state !== "inactive") mr.stop();
    await stopped;
    mr.stream.getTracks().forEach(tr => tr.stop());           // release the mic
    const mimeType = mr.mimeType || "audio/webm";
    const blob = new Blob(recChunks.current, { type: mimeType });
    if (blob.size < 500 || !user || !sessionId) return;
    const ext = mimeType.includes("mp4") ? "m4a" : "webm";
    setUploading(true);
    try {
      const path = `chat/${sessionId}/voice-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from(UPLOAD_BUCKET).upload(path, blob, { upsert: false, contentType: mimeType });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from(UPLOAD_BUCKET).getPublicUrl(path);
      await sendMessage("🎤 Voice message", "voice", pub.publicUrl, `voice.${ext}`);
    } catch (err) {
      toast({ title: t("Voice message failed", "فشلت الرسالة الصوتية"), description: uploadErrorText(err), variant: "destructive" });
    } finally { setUploading(false); }
  };

  const deleteMessage = async (id: string) => {
    await supabase.from("class_chat_messages").delete().eq("id", id);
  };
  const pinMessage = async (id: string, pinned: boolean) => {
    await supabase.from("class_chat_messages").update({ is_pinned: !pinned }).eq("id", id);
    setMessages(prev => prev.map(m => m.id === id ? { ...m, is_pinned: !pinned } : m));
  };

  const T = {
    bg: "#13181f", surface: "#1e2535", border: "rgba(255,255,255,.08)",
    text: "#e8eaf0", muted: "rgba(255,255,255,.45)",
    mine: "rgba(10,124,104,.35)", theirs: "rgba(255,255,255,.07)",
    system: "rgba(255,255,255,.12)", teal: "#0a7c68", gold: "#c9a84c",
  };

  const submit = async (text?: string) => {
    if (inPrivate && target) {
      const msg = (text || input).trim();
      if (!msg) return;
      if (!text) setInput("");
      setShowEmoji(false);
      const ok = await sendPrivateMessage(room, target.id, target.name, msg);
      if (!ok) {
        if (!text) setInput(msg);
        toast({ title: `${target.name} isn't in the class right now`, variant: "destructive" });
      }
      return;
    }
    return sendMessage(text);
  };

  const chip = (active: boolean): React.CSSProperties => ({
    flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px",
    borderRadius: 14, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
    background: active ? "#0a7c68" : "rgba(255,255,255,.07)",
    color: active ? "#fff" : "rgba(255,255,255,.7)",
  });

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div style={{ position: "relative", display: "flex", flexDirection: "column", flex: 1, minHeight: 0, height: "100%", width: "100%", background: T.bg, fontFamily: "system-ui,sans-serif" }}>

      {/* Lightbox */}
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, zIndex: 99999, background: "rgba(0,0,0,.92)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <button onClick={() => setLightbox(null)} style={{ position: "absolute", top: 16, right: 16, background: "rgba(255,255,255,.15)", border: "none", color: "#fff", borderRadius: "50%", width: 36, height: 36, cursor: "pointer", fontSize: 18 }}>✕</button>
          <img src={lightbox} alt="preview" style={{ maxWidth: "95vw", maxHeight: "92vh", objectFit: "contain", borderRadius: 8 }} />
        </div>
      )}

      {/* Guest name banner */}
      {guestName && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 12px", background: "rgba(201,168,76,.09)", borderBottom: `1px solid rgba(201,168,76,.18)`, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: T.gold, fontWeight: 600 }}>💬 Chatting as <strong>{guestName}</strong></span>
          {onEditName && <button onClick={onEditName} style={{ fontSize: 10, color: "rgba(201,168,76,.7)", background: "rgba(201,168,76,.12)", border: "1px solid rgba(201,168,76,.25)", borderRadius: 10, padding: "2px 8px", cursor: "pointer" }}>Edit Name</button>}
        </div>
      )}

      {enablePrivate && (
        <div style={{ display: "flex", gap: 6, padding: "8px 10px", overflowX: "auto", borderBottom: `1px solid ${T.border}`, flexShrink: 0, scrollbarWidth: "none", alignItems: "center" }}>
          <button onClick={() => setTarget(null)} style={chip(!target)}>{t("Everyone", "الجميع")}</button>
          {(() => {
            const entries = Object.entries(priv.threads).map(([id, th]) => ({ id, name: th.peerName, unread: th.unread }));
            if (target && !priv.threads[target.id]) entries.push({ id: target.id, name: target.name, unread: 0 });
            return entries.map(e => (
              <button key={e.id} onClick={() => setTarget({ id: e.id, name: e.name })} style={chip(target?.id === e.id)}>
                <Lock style={{ width: 10, height: 10 }} />
                <span style={{ maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</span>
                {e.unread > 0 && (
                  <span style={{ minWidth: 16, height: 16, padding: "0 4px", borderRadius: 8, background: "#ea4335", color: "#fff", fontSize: 10, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{e.unread}</span>
                )}
              </button>
            ));
          })()}
          <button onClick={() => setPickerOpen(true)} style={{ ...chip(false), background: "transparent", border: "1px dashed rgba(255,255,255,.28)" }}>
            <Plus style={{ width: 12, height: 12 }} /> {t("Private", "خاص")}
          </button>
        </div>
      )}
      {enablePrivate && pickerOpen && (
        <PrivatePicker onClose={() => setPickerOpen(false)} onPick={p => { setTarget(p); setPickerOpen(false); }} />
      )}

      {/* Pinned */}
      {!inPrivate && messages.filter(m => m.is_pinned).slice(-1).map(m => (
        <div key={`pin-${m.id}`} style={{ background: "rgba(201,168,76,.12)", borderBottom: `1px solid ${T.border}`, padding: "6px 12px", display: "flex", alignItems: "center", gap: 6 }}>
          <Pin style={{ width: 10, height: 10, color: T.gold, flexShrink: 0 }} />
          <p style={{ fontSize: 11, color: T.gold, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0 }}>{m.message}</p>
        </div>
      ))}

      {/* Messages */}
      <div ref={listRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
        {!inPrivate && messages.length === 0 && (
          <div style={{ margin: "auto", textAlign: "center", color: T.muted, fontSize: 13, padding: 24 }}>
            <div style={{ fontSize: 30, marginBottom: 6 }}>💬</div>
            {t("No messages yet — say salaam!", "لا رسائل بعد — ابدأ بالسلام!")}
          </div>
        )}
        {inPrivate && target ? (
          <>
            <div style={{ textAlign: "center", margin: "2px 0 6px" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, color: "#e6c877", background: "rgba(201,168,76,.12)", border: "1px solid rgba(201,168,76,.22)", padding: "3px 10px", borderRadius: 20 }}>
                <Lock style={{ width: 10, height: 10 }} /> Only you and {target.name} can see this
              </span>
            </div>
            {(privThread?.messages || []).map(pm => (
              <div key={pm.id} style={{ display: "flex", justifyContent: pm.mine ? "flex-end" : "flex-start" }}>
                <div style={{ maxWidth: "80%", padding: "8px 12px", borderRadius: pm.mine ? "14px 14px 4px 14px" : "14px 14px 14px 4px", background: pm.mine ? T.mine : T.theirs }}>
                  <p style={{ fontSize: 13, color: T.text, margin: 0, wordBreak: "break-word", lineHeight: 1.45 }}>{pm.text}</p>
                  <span style={{ fontSize: 9, color: T.muted, display: "block", marginTop: 4 }}>{new Date(pm.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              </div>
            ))}
          </>
        ) : messages.map(m => {
          const isMe    = m.sender_id === user?.id;
          const prof    = profiles[m.sender_id];
          const name    = isMe ? (guestName || t("You", "أنت")) : (prof?.name || "Student");
          const isTeach = !isMe && (prof?.role === "teacher" || prof?.role === "admin");
          const display = isTeach ? `** ${name}` : name;

          if (m.type === "system") return (
            <div key={m.id} style={{ textAlign: "center", margin: "4px 0" }}>
              <span style={{ fontSize: 10, color: T.muted, background: T.system, padding: "2px 10px", borderRadius: 20 }}>{m.message}</span>
            </div>
          );

          if (m.type === "emoji" || m.type === "reaction" || (EMOJI_LIST.includes(m.message) && m.message.length <= 4)) return (
            <div key={m.id} style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start" }}>
              <div style={{ textAlign: "center" }}>
                <span style={{ fontSize: 26 }}>{m.message}</span>
                <p style={{ fontSize: 9, color: T.muted, margin: "2px 0 0" }}>{display}</p>
              </div>
            </div>
          );

          /* image */
          if (m.type === "image" && m.attachment_url) return (
            <div key={m.id} style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start" }}>
              <div style={{ maxWidth: "72%" }}>
                <p style={{ fontSize: 10, color: isTeach ? T.gold : T.muted, fontWeight: isTeach ? 700 : 400, margin: "0 0 4px" }}>{display}</p>
                <img
                  src={m.attachment_url}
                  alt={m.message}
                  onClick={() => setLightbox(m.attachment_url)}
                  style={{ maxWidth: "100%", borderRadius: 10, cursor: "pointer", display: "block", border: `1px solid ${T.border}` }}
                />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 3 }}>
                  <span style={{ fontSize: 9, color: T.muted }}>{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  {isPrivileged && (
                    <button onClick={() => deleteMessage(m.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "#ef4444" }}><Trash2 style={{ width: 10, height: 10 }} /></button>
                  )}
                </div>
              </div>
            </div>
          );

          /* voice */
          if (m.type === "voice" && m.attachment_url) return (
            <div key={m.id} style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start" }}>
              <div style={{ background: isMe ? T.mine : T.theirs, borderRadius: 14, padding: "10px 14px", maxWidth: "80%" }}>
                <p style={{ fontSize: 10, color: T.muted, margin: "0 0 6px" }}>{display}</p>
                <audio src={m.attachment_url} controls style={{ height: 32, width: "100%", minWidth: 180 }} />
                <span style={{ fontSize: 9, color: T.muted, display: "block", marginTop: 4 }}>{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            </div>
          );

          /* file */
          if (m.type === "file" && m.attachment_url) return (
            <div key={m.id} style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start" }}>
              <div style={{ background: isMe ? T.mine : T.theirs, borderRadius: 14, padding: "10px 14px", maxWidth: "80%" }}>
                <p style={{ fontSize: 10, color: T.muted, margin: "0 0 4px" }}>{display}</p>
                <a href={m.attachment_url} target="_blank" rel="noopener noreferrer"
                  style={{ display: "flex", alignItems: "center", gap: 8, color: "#8ab4f8", textDecoration: "none", fontSize: 13 }}>
                  <Paperclip style={{ width: 14, height: 14, flexShrink: 0 }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>{m.attachment_name || m.message}</span>
                  <span style={{ fontSize: 10, color: T.muted }}>↗</span>
                </a>
                <span style={{ fontSize: 9, color: T.muted, display: "block", marginTop: 4 }}>{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            </div>
          );

          /* text */
          return (
            <div key={m.id} style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start" }}>
              <div style={{ maxWidth: "80%", padding: "8px 12px", borderRadius: isMe ? "14px 14px 4px 14px" : "14px 14px 14px 4px", background: isMe ? T.mine : T.theirs, borderLeft: isTeach ? `3px solid ${T.gold}` : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
                  <span style={{ fontSize: 10, color: isMe ? "rgba(255,255,255,.38)" : isTeach ? T.gold : T.muted, fontWeight: isMe ? 400 : 700 }}>{display}</span>
                  {isTeach && <span style={{ fontSize: 9, background: "rgba(201,168,76,.18)", color: T.gold, borderRadius: 8, padding: "1px 5px", fontWeight: 700 }}>{t("Teacher", "معلم")}</span>}
                </div>
                <p style={{ fontSize: 13, color: T.text, margin: 0, wordBreak: "break-word", lineHeight: 1.45 }}>{m.message}</p>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4, gap: 8 }}>
                  <span style={{ fontSize: 9, color: T.muted }}>{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  {isPrivileged && (
                    <div style={{ display: "flex", gap: 2 }}>
                      <button onClick={() => pinMessage(m.id, m.is_pinned)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: T.muted }}><Pin style={{ width: 10, height: 10 }} /></button>
                      <button onClick={() => deleteMessage(m.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "#ef4444" }}><Trash2 style={{ width: 10, height: 10 }} /></button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={scrollRef} />
      </div>

      {/* Emoji bar */}
      {showEmoji && (
        <div style={{ borderTop: `1px solid ${T.border}`, padding: "6px 8px", display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "center", background: T.surface, flexShrink: 0 }}>
          {EMOJI_LIST.map(e => (
            <button key={e} onMouseDown={ev => ev.preventDefault()} onClick={() => submit(e)}
              style={{ width: 44, height: 44, fontSize: 24, background: "none", border: "none", borderRadius: 12, cursor: "pointer" }}>{e}</button>
          ))}
        </div>
      )}

      {/* Recording indicator */}
      {recording && (
        <div style={{ padding: "6px 12px", background: "rgba(239,68,68,.12)", borderTop: `1px solid rgba(239,68,68,.2)`, display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444", animation: "rec-pulse 1s ease-in-out infinite" }} />
          <span style={{ fontSize: 12, color: "#ef4444", fontWeight: 700 }}>Recording {fmt(recSeconds)}</span>
          <button onClick={stopRecording} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, background: "#ef4444", border: "none", borderRadius: 8, padding: "4px 10px", color: "#fff", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
            <Square style={{ width: 10, height: 10 }} /> Send
          </button>
          <button onClick={() => { mrRef.current?.stop(); mrRef.current?.stream?.getTracks().forEach(t => t.stop()); clearInterval(recTimer.current); setRecording(false); setRecSeconds(0); }}
            style={{ background: "rgba(255,255,255,.1)", border: "none", borderRadius: 8, padding: "4px 10px", color: "rgba(255,255,255,.6)", cursor: "pointer", fontSize: 11 }}>
            <X style={{ width: 10, height: 10 }} />
          </button>
        </div>
      )}

      {/* Input row — pinned to the bottom of the panel */}
      {!recording && (() => {
        const hasText = !!input.trim();
        const round = (bg: string, color: string): React.CSSProperties => ({
          width: 40, height: 40, borderRadius: "50%", background: bg, border: "none", color,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer",
        });
        const soft = round("rgba(255,255,255,.08)", T.muted);
        const keepFocus = (e: React.MouseEvent) => e.preventDefault();   // don't drop the keyboard
        return (
          <div style={{ padding: "8px 10px calc(8px + env(safe-area-inset-bottom, 0px))", borderTop: `1px solid ${T.border}`, display: "flex", gap: 6, alignItems: "center", background: T.surface, flexShrink: 0 }}>
            <input ref={fileRef} type="file" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx" style={{ display: "none" }} onChange={onFilePick} />

            <button type="button" aria-label="Emoji" onMouseDown={keepFocus} onClick={() => setShowEmoji(v => !v)}
              style={{ ...soft, background: showEmoji ? "rgba(10,124,104,.35)" : "rgba(255,255,255,.08)" }}>
              <Smile style={{ width: 19, height: 19 }} />
            </button>

            {!inPrivate && (
              <button type="button" aria-label="Attach file" onClick={() => fileRef.current?.click()} disabled={uploading} style={{ ...soft, opacity: uploading ? 0.5 : 1 }}>
                <Paperclip style={{ width: 19, height: 19 }} />
              </button>
            )}

            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onPaste={handlePaste}
              enterKeyHint="send"
              autoComplete="off"
              placeholder={inPrivate ? `Private message to ${target?.name}...` : uploading ? t("Uploading…", "جارٍ الرفع…") : t("Message the class...", "اكتب رسالة للصف...")}
              style={{ flex: 1, minWidth: 0, background: "rgba(255,255,255,.06)", border: `1px solid ${T.border}`, borderRadius: 22, padding: "10px 14px", fontSize: 16, color: T.text, outline: "none", fontFamily: "inherit" }}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !(e.nativeEvent as any).isComposing) { e.preventDefault(); submit(); } }}
            />

            {hasText || inPrivate ? (
              <button type="button" aria-label="Send" onMouseDown={keepFocus} onClick={() => submit()} disabled={!hasText || uploading}
                style={{ ...round(hasText ? "#0a7c68" : "rgba(255,255,255,.06)", "#fff"), cursor: hasText ? "pointer" : "default" }}>
                <Send style={{ width: 18, height: 18 }} />
              </button>
            ) : (
              <button type="button" aria-label="Record voice message" onClick={startRecording} disabled={uploading} style={{ ...round("#0a7c68", "#fff"), opacity: uploading ? 0.5 : 1 }}>
                <Mic style={{ width: 18, height: 18 }} />
              </button>
            )}
          </div>
        );
      })()}
    </div>
  );
};

export default ClassChatPanel;
