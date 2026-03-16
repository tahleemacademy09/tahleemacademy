// src/pages/MajlisChat.tsx
"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

// ----------------- Supabase Setup -----------------
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ----------------- Master Component -----------------
const MajlisChat = () => {
  // ---- MOCK USER ----
  // Replace with real auth if you want
  const user = { id: "123", role: "admin", name: "Admin" };
  const hasRole = (role: string) => role === user.role;

  // ---- STATES ----
  const [channels, setChannels] = useState<any[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isAdmin = hasRole("admin");

  // ---- Fetch Channels ----
  useEffect(() => {
    const fetchChannels = async () => {
      const { data: memberData } = await supabase
        .from("chat_members")
        .select("channel_id")
        .eq("user_id", user.id);

      const memberIds = (memberData || []).map((m: any) => m.channel_id);
      const { data: channels } = await supabase
        .from("chat_channels")
        .select("*")
        .in("id", memberIds.length ? memberIds : [""]);

      setChannels(channels || []);
      if (!activeChannelId && channels?.length) setActiveChannelId(channels[0].id);
    };
    fetchChannels();
  }, []);

  // ---- Fetch Messages + Realtime ----
  useEffect(() => {
    if (!activeChannelId) return;

    const fetchMessages = async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("channel_id", activeChannelId)
        .order("created_at", { ascending: true });
      setMessages(data || []);
    };
    fetchMessages();

    const channel = supabase
      .channel(`room-${activeChannelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `channel_id=eq.${activeChannelId}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new]);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "chat_messages",
          filter: `channel_id=eq.${activeChannelId}`,
        },
        (payload) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === payload.new.id ? payload.new : m))
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_typing",
          filter: `channel_id=eq.${activeChannelId}`,
        },
        (payload) => {
          if (payload.eventType === "UPDATE" && payload.new.user_id !== user.id) {
            if (payload.new.is_typing) {
              setTypingUsers((prev) => [...new Set([...prev, payload.new.user_id])]);
            } else {
              setTypingUsers((prev) =>
                prev.filter((id) => id !== payload.new.user_id)
              );
            }
          }
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [activeChannelId]);

  // ---- Auto-scroll ----
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // ---- Send Message ----
  const handleSend = async () => {
    if (!input.trim() && !file) return;

    let content = input;
    let content_type = "text";

    if (file) {
      const { data, error } = await supabase.storage
        .from("chat_files")
        .upload(`${Date.now()}-${file.name}`, file);
      if (error) return alert(error.message);
      content = supabase.storage.from("chat_files").getPublicUrl(data.path).publicUrl;
      content_type = file.type.startsWith("audio/") ? "voice" : "file";
      setFile(null);
    }

    await supabase.from("chat_messages").insert({
      channel_id: activeChannelId,
      user_id: user.id,
      content,
      content_type,
    });

    setInput("");
    await supabase
      .from("chat_typing")
      .upsert({ channel_id: activeChannelId, user_id: user.id, is_typing: false });
  };

  const handleTyping = async (value: string) => {
    setInput(value);
    await supabase
      .from("chat_typing")
      .upsert({ channel_id: activeChannelId, user_id: user.id, is_typing: !!value });
  };

  const deleteMessage = async (msgId: string) =>
    await supabase.from("chat_messages").delete().eq("id", msgId);

  const editMessage = async (msgId: string, content: string) =>
    await supabase
      .from("chat_messages")
      .update({ content, updated_at: new Date() })
      .eq("id", msgId);

  // ---- Active Channel ----
  const activeChannel = channels.find((c) => c.id === activeChannelId);

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "sans-serif" }}>
      {/* Sidebar */}
      <div style={{ width: 250, borderRight: "1px solid #ccc", padding: 10 }}>
        <h2>Channels</h2>
        {channels.map((c) => (
          <div
            key={c.id}
            onClick={() => setActiveChannelId(c.id)}
            style={{
              padding: 5,
              cursor: "pointer",
              background: activeChannelId === c.id ? "#eee" : undefined,
            }}
          >
            {c.name}
          </div>
        ))}
      </div>

      {/* Chat Area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div
          style={{
            padding: 10,
            borderBottom: "1px solid #ccc",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <div>
            <strong>{activeChannel?.name || "Select a channel"}</strong>
            {typingUsers.length > 0 && (
              <span style={{ marginLeft: 10, color: "gray", fontSize: 12 }}>
                Someone is typing...
              </span>
            )}
          </div>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 10,
            background: "#f5f5f5",
          }}
        >
          {messages.map((msg) => {
            const isMe = msg.user_id === user.id;
            return (
              <div
                key={msg.id}
                style={{
                  display: "flex",
                  justifyContent: isMe ? "flex-end" : "flex-start",
                  marginBottom: 5,
                }}
              >
                <div
                  style={{
                    padding: 8,
                    borderRadius: 8,
                    maxWidth: "70%",
                    background: isMe ? "#dcf8c6" : "#fff",
                    position: "relative",
                  }}
                >
                  {msg.content_type === "text" && msg.content}
                  {msg.content_type === "file" && (
                    <a href={msg.content} target="_blank" rel="noreferrer">
                      Download File
                    </a>
                  )}
                  {msg.content_type === "voice" && <audio controls src={msg.content} />}
                  <div
                    style={{
                      fontSize: 10,
                      color: "gray",
                      marginTop: 2,
                      display: "flex",
                      justifyContent: "flex-end",
                      gap: 5,
                    }}
                  >
                    {new Date(msg.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {isMe && <span>✓</span>}
                    {isMe && (
                      <button onClick={() => deleteMessage(msg.id)}>🗑</button>
                    )}
                    {isMe && (
                      <button
                        onClick={() =>
                          editMessage(msg.id, prompt("Edit message", msg.content) || msg.content)
                        }
                      >
                        ✏️
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Input */}
        <div
          style={{
            padding: 10,
            borderTop: "1px solid #ccc",
            display: "flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          <input type="file" onChange={(e) => e.target.files && setFile(e.target.files[0])} />
          <input
            value={input}
            onChange={(e) => handleTyping(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            style={{ flex: 1, padding: 5 }}
            placeholder="Type a message..."
          />
          <button onClick={handleSend}>Send</button>
        </div>
      </div>
    </div>
  );
};

export default MajlisChat;
