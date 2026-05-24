import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Pin, Trash2, Smile, Send } from "lucide-react";

interface ClassChatPanelProps {
  sessionId: string;
  /** ISO timestamp of when this session started — used to filter out
      messages from any previous run of the same session row.          */
  sessionStartedAt?: string;
  /** Guest's display name (used for public class guests) */
  guestName?: string;
  /** Callback to open name-edit (for public class guests) */
  onEditName?: () => void;
}

const EMOJI_LIST = ["👏", "🤲", "❤️", "😂", "🌟", "👍"];

const ClassChatPanel = ({ sessionId, sessionStartedAt, guestName, onEditName }: ClassChatPanelProps) => {
  const { user, hasRole } = useAuth();
  const { t } = useLanguage();
  const isPrivileged = hasRole("admin") || hasRole("teacher");
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [profiles, setProfiles] = useState<Record<string, { name: string; role: string }>>({});
  const [showEmoji, setShowEmoji] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // FIX BUG 11: Use a ref to track in-flight profile fetches, preventing duplicate
  // requests when multiple messages arrive rapidly with the same sender IDs.
  const fetchingIds = useRef(new Set<string>());

  // Profiles cache
  const loadProfiles = async (userIds: string[]) => {
    // FIX BUG 11: Filter out IDs already cached OR currently being fetched
    const missing = userIds.filter(id => !profiles[id] && !fetchingIds.current.has(id));
    if (missing.length === 0) return;
    missing.forEach(id => fetchingIds.current.add(id));
    try {
      const { data } = await supabase.from("profiles").select("user_id, full_name").in("user_id", missing);
      const { data: roles } = await supabase.from("user_roles").select("user_id, role").in("user_id", missing);
      const newProfiles: Record<string, { name: string; role: string }> = {};
      (data || []).forEach(p => {
        const userRole = (roles || []).find(r => r.user_id === p.user_id);
        newProfiles[p.user_id] = { name: p.full_name || "Student", role: userRole?.role || "student" };
      });
      setProfiles(prev => ({ ...prev, ...newProfiles }));
    } finally {
      missing.forEach(id => fetchingIds.current.delete(id));
    }
  };

  // Clear messages whenever we switch sessions
  useEffect(() => { setMessages([]); setProfiles({}); fetchingIds.current.clear(); }, [sessionId]);

  useEffect(() => {
    // FIX BUG 12: Guard — do not subscribe or load if sessionId is empty string.
    // This prevents orphaned DB queries and false subscriptions during the brief
    // join window before the session row is resolved.
    if (!sessionId) return;

    const load = async () => {
      let q = supabase
        .from("class_chat_messages")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at");
      // Only show messages from this session run — prevents stale messages
      // from a previous end-and-restart of the same session row.
      if (sessionStartedAt) q = q.gte("created_at", sessionStartedAt);
      const { data } = await q;
      setMessages(data || []);
      const ids = [...new Set((data || []).map((m: any) => m.sender_id))];
      loadProfiles(ids);
    };
    load();

    const channel = supabase.channel(`class-chat-${sessionId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "class_chat_messages", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          // FIX BUG 4 (partial): If sessionStartedAt is set, only show messages at or after it
          if (sessionStartedAt && payload.new.created_at < sessionStartedAt) return;
          setMessages(prev => [...prev, payload.new]);
          loadProfiles([payload.new.sender_id]);
        })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "class_chat_messages", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          setMessages(prev => {
            const next = prev.filter(m => m.id !== payload.old.id);
            // If ALL messages were wiped (teacher ended class + 4s timer fired),
            // clear the list entirely so nothing lingers in the UI.
            return next;
          });
        })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [sessionId, sessionStartedAt]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const sendMessage = async (text?: string) => {
    const msg = text || input.trim();
    // FIX BUG 12: Also guard here — never send to an empty sessionId
    if (!msg || !user || !sessionId) return;
    await supabase.from("class_chat_messages").insert({
      session_id: sessionId,
      sender_id: user.id,
      message: msg,
      type: "text",
    });
    if (!text) setInput("");
    setShowEmoji(false);
  };

  const deleteMessage = async (id: string) => {
    await supabase.from("class_chat_messages").delete().eq("id", id);
  };

  const pinMessage = async (id: string, pinned: boolean) => {
    await supabase.from("class_chat_messages").update({ is_pinned: !pinned }).eq("id", id);
    setMessages(prev => prev.map(m => m.id === id ? { ...m, is_pinned: !pinned } : m));
  };

  /* ── Dark-theme colour tokens ── */
  const T = {
    bg:      "#13181f",
    surface: "#1e2535",
    border:  "rgba(255,255,255,.08)",
    text:    "#e8eaf0",
    muted:   "rgba(255,255,255,.45)",
    mine:    "rgba(10,124,104,.35)",
    theirs:  "rgba(255,255,255,.07)",
    system:  "rgba(255,255,255,.12)",
    teal:    "#0a7c68",
    gold:    "#c9a84c",
  };

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",background:T.bg,fontFamily:"system-ui,sans-serif"}}>

      {/* Guest name banner — shown only for public-class guests */}
      {guestName && (
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 12px",background:"rgba(201,168,76,.09)",borderBottom:`1px solid rgba(201,168,76,.18)`,flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:11,color:T.gold}}>💬</span>
            <span style={{fontSize:11,color:T.gold,fontWeight:600}}>Chatting as <strong>{guestName}</strong></span>
          </div>
          {onEditName && (
            <button
              onClick={onEditName}
              style={{fontSize:10,color:"rgba(201,168,76,.7)",background:"rgba(201,168,76,.12)",border:"1px solid rgba(201,168,76,.25)",borderRadius:10,padding:"2px 8px",cursor:"pointer",fontFamily:"inherit"}}
            >
              Edit Name
            </button>
          )}
        </div>
      )}

      {/* Pinned messages */}
      {messages.filter(m => m.is_pinned).map(m => (
        <div key={`pin-${m.id}`} style={{background:"rgba(201,168,76,.12)",borderBottom:`1px solid ${T.border}`,padding:"6px 12px",display:"flex",alignItems:"center",gap:6}}>
          <Pin style={{width:10,height:10,color:T.gold,flexShrink:0}}/>
          <p style={{fontSize:11,color:T.gold,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",margin:0}}>{m.message}</p>
        </div>
      ))}

      {/* Messages */}
      <div style={{flex:1,overflowY:"auto",padding:"10px 12px",display:"flex",flexDirection:"column",gap:8}}>
        {messages.map(m => {
          const isMe = m.sender_id === user?.id;
          const prof = profiles[m.sender_id];
          // For own messages: use guestName if provided (public class guest), else "You"
          const name = isMe
            ? (guestName ? guestName : t("You", "أنت"))
            : (prof?.name || "Student");
          const isTeacher = !isMe && (prof?.role === "teacher" || prof?.role === "admin");
          // ** prefix marks admin/teacher to prevent impersonation
          const displayName = isTeacher ? `** ${name}` : name;

          if (m.type === "system") {
            return (
              <div key={m.id} style={{textAlign:"center",margin:"4px 0"}}>
                <span style={{fontSize:10,color:T.muted,background:T.system,padding:"2px 10px",borderRadius:20}}>{m.message}</span>
              </div>
            );
          }

          if (m.type === "emoji" || m.type === "reaction" || (EMOJI_LIST.includes(m.message) && m.message.length <= 4)) {
            return (
              <div key={m.id} style={{display:"flex",justifyContent:isMe?"flex-end":"flex-start"}}>
                <div style={{textAlign:"center"}}>
                  <span style={{fontSize:26}}>{m.message}</span>
                  <p style={{fontSize:9,color:T.muted,margin:"2px 0 0"}}>{displayName}</p>
                </div>
              </div>
            );
          }

          return (
            <div key={m.id} style={{display:"flex",justifyContent:isMe?"flex-end":"flex-start"}}>
              <div style={{
                maxWidth:"80%",padding:"8px 12px",borderRadius:isMe?"14px 14px 4px 14px":"14px 14px 14px 4px",
                background:isMe?T.mine:T.theirs,
                borderLeft:isTeacher?`3px solid ${T.gold}`:"none",
              }}>
                {/* Show name for ALL messages — own messages show guestName or "You" */}
                <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:3}}>
                  <span style={{
                    fontSize:10,
                    color: isMe ? "rgba(255,255,255,.38)" : isTeacher ? T.gold : T.muted,
                    fontWeight: isMe ? 400 : 700,
                  }}>{displayName}</span>
                  {isTeacher && (
                    <span style={{fontSize:9,background:"rgba(201,168,76,.18)",color:T.gold,borderRadius:8,padding:"1px 5px",fontWeight:700}}>
                      {t("Teacher","معلم")}
                    </span>
                  )}
                </div>
                <p style={{fontSize:13,color:T.text,margin:0,wordBreak:"break-word",lineHeight:1.45}}>{m.message}</p>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:4,gap:8}}>
                  <span style={{fontSize:9,color:T.muted}}>
                    {new Date(m.created_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}
                  </span>
                  {isPrivileged && (
                    <div style={{display:"flex",gap:2}}>
                      <button onClick={()=>pinMessage(m.id,m.is_pinned)} title="Pin" style={{background:"none",border:"none",cursor:"pointer",padding:2,color:T.muted,display:"flex"}}>
                        <Pin style={{width:10,height:10}}/>
                      </button>
                      <button onClick={()=>deleteMessage(m.id)} title="Delete" style={{background:"none",border:"none",cursor:"pointer",padding:2,color:"#ef4444",display:"flex"}}>
                        <Trash2 style={{width:10,height:10}}/>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={scrollRef}/>
      </div>

      {/* Emoji bar */}
      {showEmoji && (
        <div style={{borderTop:`1px solid ${T.border}`,padding:"8px 12px",display:"flex",gap:8,justifyContent:"center",background:T.surface}}>
          {EMOJI_LIST.map(e => (
            <button key={e} onClick={()=>sendMessage(e)} style={{fontSize:22,background:"none",border:"none",cursor:"pointer",transition:"transform .12s"}}
              onMouseEnter={ev=>(ev.currentTarget.style.transform="scale(1.3)")} onMouseLeave={ev=>(ev.currentTarget.style.transform="scale(1)")}>{e}</button>
          ))}
        </div>
      )}

      {/* Input row */}
      <div style={{padding:"8px 10px",borderTop:`1px solid ${T.border}`,display:"flex",gap:8,alignItems:"center",background:T.surface,flexShrink:0}}>
        <button onClick={()=>setShowEmoji(!showEmoji)} style={{width:34,height:34,borderRadius:"50%",background:"rgba(255,255,255,.08)",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:T.muted,flexShrink:0}}>
          <Smile style={{width:16,height:16}}/>
        </button>
        <input
          value={input}
          onChange={e=>setInput(e.target.value)}
          placeholder={t("Message the class...","أرسل رسالة...")}
          style={{flex:1,background:"rgba(255,255,255,.06)",border:`1px solid ${T.border}`,borderRadius:20,padding:"7px 14px",fontSize:13,color:T.text,outline:"none",fontFamily:"inherit"}}
          onKeyDown={e=>e.key==="Enter"&&sendMessage()}
        />
        <button onClick={()=>sendMessage()} disabled={!input.trim()} style={{width:34,height:34,borderRadius:"50%",background:input.trim()?"#0a7c68":"rgba(255,255,255,.06)",border:"none",cursor:input.trim()?"pointer":"default",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",flexShrink:0,transition:"background .15s"}}>
          <Send style={{width:14,height:14}}/>
        </button>
      </div>
    </div>
  );
};

export default ClassChatPanel;
