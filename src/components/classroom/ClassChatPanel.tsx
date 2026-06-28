/**
 * ClassChatPanel.tsx — Tahleem Academy
 * Upgraded: image/file sharing, voice messages, image paste, file preview
 */
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Pin, Trash2, Smile, Send, Paperclip, Mic, Square, Image as ImageIcon, X } from "lucide-react";

interface ClassChatPanelProps {
  sessionId: string;
  sessionStartedAt?: string;
  guestName?: string;
  onEditName?: () => void;
}

const EMOJI_LIST = ["👏", "🤲", "❤️", "😂", "🌟", "👍", "🙏", "🔥"];
const UPLOAD_BUCKET = "chat-attachments";

const ClassChatPanel = ({ sessionId, sessionStartedAt, guestName, onEditName }: ClassChatPanelProps) => {
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
  const fileRef     = useRef<HTMLInputElement>(null);
  const fetchingIds   = useRef(new Set<string>());
  const optimisticIds = useRef(new Set<string>());

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

  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  /* ── send text — optimistic UI so messages appear instantly ── */
  const sendMessage = async (text?: string, type = "text", attachmentUrl?: string, attachmentName?: string) => {
    const msg = text || input.trim();
    if ((!msg && !attachmentUrl) || !user || !sessionId) return;

    // Clear input immediately — feels instant
    if (!text && !attachmentUrl) setInput("");
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
      // Rollback on failure
      optimisticIds.current.delete(tempId);
      setMessages(prev => prev.filter(m => m.id !== tempId));
    } else if (data) {
      // Swap temp message for the real DB row (has correct id & created_at)
      optimisticIds.current.delete(tempId);
      setMessages(prev => prev.map(m => m.id === tempId ? data : m));
    }
  };

  /* ── image paste ── */
  const handlePaste = async (e: React.ClipboardEvent) => {
    const file = Array.from(e.clipboardData.items)
      .find(i => i.type.startsWith("image/"))?.getAsFile();
    if (file) { e.preventDefault(); await uploadFile(file); }
  };

  /* ── file / image upload ── */
  const uploadFile = async (file: File) => {
    if (!user || !sessionId) return;
    setUploading(true);
    try {
      const ext  = file.name.split(".").pop() || "bin";
      const path = `chat/${sessionId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
      const { error: upErr } = await supabase.storage.from(UPLOAD_BUCKET).upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from(UPLOAD_BUCKET).getPublicUrl(path);
      const url = pub.publicUrl;
      const type = file.type.startsWith("image/") ? "image" : "file";
      await sendMessage(file.name, type, url, file.name);
    } catch { /* silent */ } finally { setUploading(false); }
  };

  const onFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = "";
    if (f) await uploadFile(f);
  };

  /* ── voice recording ── */
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      recChunks.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) recChunks.current.push(e.data); };
      mr.start(500);
      mrRef.current = mr;
      setRecording(true);
      setRecSeconds(0);
      recTimer.current = setInterval(() => setRecSeconds(s => s + 1), 1000);
    } catch { /* mic denied */ }
  };

  const stopRecording = async () => {
    clearInterval(recTimer.current);
    setRecording(false);
    setRecSeconds(0);
    const mr = mrRef.current; if (!mr) return;
    mr.stop();
    await new Promise<void>(res => { mr.onstop = () => res(); });
    const blob = new Blob(recChunks.current, { type: "audio/webm" });
    if (blob.size < 500) return;
    if (!user || !sessionId) return;
    setUploading(true);
    try {
      const path = `chat/${sessionId}/voice-${Date.now()}.webm`;
      const { error: upErr } = await supabase.storage.from(UPLOAD_BUCKET).upload(path, blob, { upsert: false, contentType: "audio/webm" });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from(UPLOAD_BUCKET).getPublicUrl(path);
      await sendMessage("🎤 Voice message", "voice", pub.publicUrl, "voice.webm");
    } catch { /* silent */ } finally { setUploading(false); }
    mrRef.current?.stream?.getTracks().forEach(t => t.stop());
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

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: T.bg, fontFamily: "system-ui,sans-serif" }}>

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

      {/* Pinned */}
      {messages.filter(m => m.is_pinned).map(m => (
        <div key={`pin-${m.id}`} style={{ background: "rgba(201,168,76,.12)", borderBottom: `1px solid ${T.border}`, padding: "6px 12px", display: "flex", alignItems: "center", gap: 6 }}>
          <Pin style={{ width: 10, height: 10, color: T.gold, flexShrink: 0 }} />
          <p style={{ fontSize: 11, color: T.gold, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0 }}>{m.message}</p>
        </div>
      ))}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
        {messages.map(m => {
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
        <div style={{ borderTop: `1px solid ${T.border}`, padding: "8px 12px", display: "flex", gap: 8, justifyContent: "center", background: T.surface }}>
          {EMOJI_LIST.map(e => (
            <button key={e} onClick={() => sendMessage(e)} style={{ fontSize: 22, background: "none", border: "none", cursor: "pointer" }}>{e}</button>
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

      {/* Input row */}
      {!recording && (
        <div style={{ padding: "8px 10px", borderTop: `1px solid ${T.border}`, display: "flex", gap: 6, alignItems: "center", background: T.surface, flexShrink: 0 }}>
          <input ref={fileRef} type="file" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx" style={{ display: "none" }} onChange={onFilePick} />

          <button onClick={() => setShowEmoji(!showEmoji)} style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,.08)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: T.muted, flexShrink: 0 }}>
            <Smile style={{ width: 15, height: 15 }} />
          </button>

          <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,.08)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: T.muted, flexShrink: 0 }}>
            <Paperclip style={{ width: 15, height: 15 }} />
          </button>

          <button onClick={startRecording} disabled={uploading} style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,.08)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: T.muted, flexShrink: 0 }}>
            <Mic style={{ width: 15, height: 15 }} />
          </button>

          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onPaste={handlePaste}
            placeholder={uploading ? "Uploading…" : t("Message the class...", "أرسل رسالة...")}
            style={{ flex: 1, background: "rgba(255,255,255,.06)", border: `1px solid ${T.border}`, borderRadius: 20, padding: "7px 14px", fontSize: 13, color: T.text, outline: "none", fontFamily: "inherit" }}
            onKeyDown={e => e.key === "Enter" && sendMessage()}
          />

          <button onClick={() => sendMessage()} disabled={!input.trim() || uploading} style={{ width: 32, height: 32, borderRadius: "50%", background: input.trim() ? "#0a7c68" : "rgba(255,255,255,.06)", border: "none", cursor: input.trim() ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", flexShrink: 0 }}>
            <Send style={{ width: 14, height: 14 }} />
          </button>
        </div>
      )}
    </div>
  );
};

export default ClassChatPanel;
