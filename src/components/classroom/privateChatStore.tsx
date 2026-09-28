import { useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useRoomContext, useParticipants, useLocalParticipant } from "@livekit/components-react";
import { RoomEvent } from "livekit-client";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Lock, X } from "lucide-react";

export type PrivateMessage = {
  id: string;
  peerId: string;
  peerName: string;
  mine: boolean;
  text: string;
  ts: number;
};

export type ChatPopup = {
  id: string;
  kind: "public" | "private";
  senderName: string;
  text: string;
  peerId?: string;
};

type Thread = { peerName: string; messages: PrivateMessage[]; unread: number };

type StoreState = {
  threads: Record<string, Thread>;
  popups: ChatPopup[];
  activePeer: string | null;
  chatVisible: boolean;
  requested: { id: string; name: string } | null;
};

const initialState: StoreState = {
  threads: {},
  popups: [],
  activePeer: null,
  chatVisible: false,
  requested: null,
};

let state: StoreState = initialState;
const listeners = new Set<() => void>();

const commit = (next: StoreState) => {
  state = next;
  listeners.forEach(l => l());
};

export const chatStore = {
  get: () => state,
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  reset: () => commit(initialState),
  setChatVisible: (v: boolean) => {
    if (state.chatVisible === v) return;
    commit({ ...state, chatVisible: v });
  },
  setActivePeer: (id: string | null) => {
    const threads = { ...state.threads };
    if (id && threads[id] && threads[id].unread > 0) {
      threads[id] = { ...threads[id], unread: 0 };
    }
    commit({ ...state, activePeer: id, threads });
  },
  requestOpen: (target: { id: string; name: string } | null) => commit({ ...state, requested: target }),
  addPrivate: (msg: PrivateMessage) => {
    const existing = state.threads[msg.peerId];
    if (existing && existing.messages.some(m => m.id === msg.id)) return;
    const viewing = state.chatVisible && state.activePeer === msg.peerId;
    const base: Thread = existing || { peerName: msg.peerName, messages: [], unread: 0 };
    const thread: Thread = {
      peerName: msg.mine ? base.peerName : msg.peerName,
      messages: [...base.messages, msg],
      unread: msg.mine || viewing ? base.unread : base.unread + 1,
    };
    commit({ ...state, threads: { ...state.threads, [msg.peerId]: thread } });
  },
  pushPopup: (p: ChatPopup) => {
    const popups = [...state.popups.filter(x => x.id !== p.id), p].slice(-3);
    commit({ ...state, popups });
    setTimeout(() => chatStore.dismissPopup(p.id), 6500);
  },
  dismissPopup: (id: string) => {
    if (!state.popups.some(p => p.id === id)) return;
    commit({ ...state, popups: state.popups.filter(p => p.id !== id) });
  },
};

export const usePrivateChat = (): StoreState => useSyncExternalStore(chatStore.subscribe, chatStore.get, chatStore.get);

export const totalPrivateUnread = (s: StoreState) =>
  Object.values(s.threads).reduce((n, t) => n + t.unread, 0);

export const sendPrivateMessage = async (room: any, peerId: string, peerName: string, text: string) => {
  const clean = text.trim().slice(0, 1000);
  if (!clean || !room?.localParticipant) return false;
  if (!room.remoteParticipants?.has?.(peerId)) return false;
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const ts = Date.now();
  try {
    await room.localParticipant.publishData(
      new TextEncoder().encode(
        JSON.stringify({
          type: "private_chat",
          id,
          text: clean,
          fromName: room.localParticipant.name || "",
          ts,
        })
      ),
      { reliable: true, destinationIdentities: [peerId] }
    );
    chatStore.addPrivate({ id, peerId, peerName, mine: true, text: clean, ts });
    return true;
  } catch {
    return false;
  }
};

export const PrivateChatListener = () => {
  const room = useRoomContext();
  useEffect(() => {
    const handler = (payload: Uint8Array, participant?: any) => {
      try {
        const msg = JSON.parse(new TextDecoder().decode(payload));
        if (msg?.type !== "private_chat" || !participant?.identity) return;
        const text = String(msg.text || "").slice(0, 1000);
        if (!text) return;
        const peerId = participant.identity as string;
        const peerName = participant.name || msg.fromName || "Participant";
        const s = chatStore.get();
        const viewing = s.chatVisible && s.activePeer === peerId;
        const id = String(msg.id || `${Date.now()}`);
        chatStore.addPrivate({ id, peerId, peerName, mine: false, text, ts: msg.ts || Date.now() });
        if (!viewing) {
          chatStore.pushPopup({ id: `pm-${id}`, kind: "private", senderName: peerName, text, peerId });
        }
      } catch {}
    };
    room.on(RoomEvent.DataReceived, handler);
    return () => {
      room.off(RoomEvent.DataReceived, handler);
    };
  }, [room]);
  return null;
};

export const ChatPopupLayer = ({
  sessionId,
  onOpen,
}: {
  sessionId: string;
  onOpen: (peer?: { id: string; name: string }) => void;
}) => {
  const { user } = useAuth();
  const { popups } = usePrivateChat();
  const names = useRef(new Map<string, string>());

  useEffect(() => {
    if (!sessionId) return;
    const channel = supabase
      .channel(`chat-popup-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "class_chat_messages", filter: `session_id=eq.${sessionId}` },
        async (payload: any) => {
          const m = payload.new;
          if (!m || m.sender_id === user?.id) return;
          if (m.type === "system" || m.type === "emoji" || m.type === "reaction") return;
          if (chatStore.get().chatVisible) return;
          let name = names.current.get(m.sender_id);
          if (!name) {
            const { data } = await supabase
              .from("profiles")
              .select("full_name")
              .eq("user_id", m.sender_id)
              .maybeSingle();
            name = data?.full_name || "Participant";
            names.current.set(m.sender_id, name);
          }
          const text =
            m.type === "image"
              ? "Sent a photo"
              : m.type === "voice"
              ? "Sent a voice message"
              : m.type === "file"
              ? `Sent a file${m.attachment_name ? `: ${m.attachment_name}` : ""}`
              : String(m.message || "");
          chatStore.pushPopup({ id: `pub-${m.id}`, kind: "public", senderName: name, text });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, user?.id]);

  if (!popups.length) return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        top: "calc(env(safe-area-inset-top, 0px) + 62px)",
        left: 0,
        right: 0,
        zIndex: 9400,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        pointerEvents: "none",
      }}
    >
      <style>{`@keyframes cx-pop-in{from{opacity:0;transform:translateY(-14px) scale(.97)}to{opacity:1;transform:none}}`}</style>
      {popups.map(p => {
        const isPrivate = p.kind === "private";
        return (
          <div
            key={p.id}
            onClick={() => {
              chatStore.dismissPopup(p.id);
              onOpen(isPrivate && p.peerId ? { id: p.peerId, name: p.senderName } : undefined);
            }}
            style={{
              pointerEvents: "auto",
              width: "min(92vw, 380px)",
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 10px 10px 12px",
              borderRadius: 16,
              background: "rgba(38,40,44,.97)",
              border: isPrivate ? "1px solid rgba(201,168,76,.55)" : "1px solid rgba(255,255,255,.12)",
              boxShadow: "0 10px 30px rgba(0,0,0,.5)",
              cursor: "pointer",
              animation: "cx-pop-in .22s ease",
              fontFamily: "system-ui,sans-serif",
            }}
          >
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 12,
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: isPrivate ? "rgba(201,168,76,.2)" : "rgba(10,124,104,.35)",
                color: isPrivate ? "#e6c877" : "#7ee0c9",
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              {(p.senderName || "?").trim().charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "#fff",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {p.senderName}
                </span>
                {isPrivate && (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 3,
                      fontSize: 9,
                      fontWeight: 700,
                      color: "#e6c877",
                      background: "rgba(201,168,76,.16)",
                      borderRadius: 8,
                      padding: "1px 6px",
                      flexShrink: 0,
                    }}
                  >
                    <Lock style={{ width: 9, height: 9 }} /> Private
                  </span>
                )}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "rgba(255,255,255,.78)",
                  marginTop: 2,
                  lineHeight: 1.35,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  wordBreak: "break-word",
                }}
              >
                {p.text}
              </div>
            </div>
            <button
              onClick={e => {
                e.stopPropagation();
                chatStore.dismissPopup(p.id);
              }}
              style={{
                width: 26,
                height: 26,
                borderRadius: 9,
                border: "none",
                background: "rgba(255,255,255,.08)",
                color: "rgba(255,255,255,.6)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <X style={{ width: 13, height: 13 }} />
            </button>
          </div>
        );
      })}
    </div>,
    document.body
  );
};

export const PrivatePicker = ({
  onPick,
  onClose,
}: {
  onPick: (p: { id: string; name: string }) => void;
  onClose: () => void;
}) => {
  const { localParticipant } = useLocalParticipant();
  const all = useParticipants();
  const others = all.filter(p => p.identity !== localParticipant?.identity);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 6,
        background: "#13181f",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "12px 14px",
          borderBottom: "1px solid rgba(255,255,255,.08)",
          flexShrink: 0,
        }}
      >
        <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: "#e8eaf0", display: "flex", alignItems: "center", gap: 7 }}>
          <Lock style={{ width: 14, height: 14, color: "#e6c877" }} /> Message privately
        </span>
        <button
          onClick={onClose}
          style={{
            width: 30,
            height: 30,
            borderRadius: 10,
            border: "none",
            background: "rgba(255,255,255,.08)",
            color: "#fff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <X style={{ width: 14, height: 14 }} />
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
        {others.length === 0 && (
          <p style={{ textAlign: "center", fontSize: 12, color: "rgba(255,255,255,.4)", padding: "28px 12px" }}>
            No one else is in the class yet
          </p>
        )}
        {others.map(p => {
          const name = p.name || p.identity;
          return (
            <button
              key={p.identity}
              onClick={() => onPick({ id: p.identity, name })}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 10px",
                marginBottom: 4,
                borderRadius: 12,
                border: "none",
                background: "rgba(255,255,255,.05)",
                color: "#e8eaf0",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <span
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 12,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(10,124,104,.3)",
                  color: "#7ee0c9",
                  fontWeight: 700,
                  fontSize: 14,
                }}
              >
                {name.trim().charAt(0).toUpperCase()}
              </span>
              <span
                style={{
                  flex: 1,
                  fontSize: 14,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
