/*
  src/pages/NotificationsPage.tsx — Tahleem Academy
  ────────────────────────────────────────────────────────────────────────────
  Full notification history. Role-agnostic — mount the same component at
  /student/notifications, /teacher/notifications, /admin/notifications (each
  inside its own layout, so it inherits that role's sidebar/header):

    <Route path="/student/notifications" element={<NotificationsPage />} />
    <Route path="/teacher/notifications" element={<NotificationsPage />} />
    <Route path="/admin/notifications"   element={<NotificationsPage />} />
*/
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Check, Trash2 } from "lucide-react";
import { useNotifications, type AppNotification } from "@/hooks/useNotifications";

const GREEN = "#0f2d1f";
const GOLD = "#c9a84c";

function iconFor(type: string): string {
  if (type.includes("exam") || type.includes("result")) return "📋";
  if (type.includes("class") || type.includes("live")) return "📚";
  if (type.includes("payment")) return "💳";
  if (type.includes("hifdh") || type.includes("revision")) return "📖";
  if (type.includes("majlis") || type.includes("message") || type.includes("chat")) return "💬";
  if (type.includes("musabaqah") || type.includes("competition")) return "🏆";
  if (type.includes("warning") || type.includes("alert")) return "⚠️";
  return "🔔";
}

function accentFor(priority: string): string {
  if (priority === "urgent") return "#c0392b";
  if (priority === "high") return "#c9922a";
  return GREEN;
}

function formatDateGroup(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function resolvePath(link: string | null): string | null {
  if (!link) return null;
  if (link.startsWith("/")) return link;
  if (link.startsWith("http")) {
    try { const u = new URL(link); return u.pathname + u.search; } catch { return null; }
  }
  return null;
}

const FILTERS = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
] as const;

export default function NotificationsPage() {
  const { items, unreadCount, loading, hasMore, loadMore, markRead, markAllRead, deleteOne, deleteAll } = useNotifications();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const navigate = useNavigate();

  const filtered = filter === "unread" ? items.filter((n) => !n.is_read) : items;

  const groups = filtered.reduce<Record<string, AppNotification[]>>((acc, n) => {
    const key = formatDateGroup(n.created_at);
    (acc[key] ??= []).push(n);
    return acc;
  }, {});

  const handleClick = (n: AppNotification) => {
    if (!n.is_read) markRead(n.id);
    const path = resolvePath(n.link);
    if (path) navigate(path);
  };

  const handleDeleteAll = () => {
    if (items.length === 0) return;
    if (window.confirm("Delete all notifications? This can't be undone.")) deleteAll();
  };

  const handleDeleteOne = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteOne(id);
  };

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "20px 16px 60px", fontFamily: "'Cairo',system-ui,sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 11, background: `${GREEN}12`,
            border: `1.5px solid ${GREEN}25`, display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Bell style={{ width: 17, height: 17, color: GREEN }} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#1a1a1a", letterSpacing: "-0.3px" }}>Notifications</h1>
            <p style={{ margin: 0, fontSize: 11, color: GOLD, fontFamily: "serif" }}>الإشعارات</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {unreadCount > 0 && (
            <button onClick={markAllRead} style={{
              display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700,
              padding: "8px 14px", borderRadius: 20, background: `${GOLD}18`, color: "#8a6d1f",
              border: `1px solid ${GOLD}40`, cursor: "pointer",
            }}>
              <Check size={13} /> Mark all read
            </button>
          )}
          {items.length > 0 && (
            <button onClick={handleDeleteAll} style={{
              display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700,
              padding: "8px 14px", borderRadius: 20, background: "#f2f2f2", color: "#a33",
              border: "1px solid #e5c5c5", cursor: "pointer",
            }}>
              <Trash2 size={13} /> Delete all
            </button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              padding: "7px 16px", borderRadius: 20, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
              background: filter === f.key ? GREEN : "#f2f2f2",
              color: filter === f.key ? "#fff" : "#555",
              border: "none",
            }}
          >
            {f.label}{f.key === "unread" && unreadCount > 0 ? ` (${unreadCount})` : ""}
          </button>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 && !loading ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "#aaa" }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🔔</div>
          <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>
            {filter === "unread" ? "You're all caught up" : "No notifications yet"}
          </p>
          <p style={{ fontSize: 12, color: "#bbb", margin: "4px 0 0", fontFamily: "serif" }}>
            {filter === "unread" ? "لا توجد إشعارات غير مقروءة" : "لا توجد إشعارات"}
          </p>
        </div>
      ) : (
        Object.entries(groups).map(([label, group]) => (
          <div key={label} style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 11.5, fontWeight: 800, color: "#999", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 8px 4px" }}>
              {label}
            </p>
            <div style={{ background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
              {group.map((n, idx) => {
                const accent = accentFor(n.priority);
                return (
                  <div
                    key={n.id}
                    onClick={() => handleClick(n)}
                    style={{
                      background: n.is_read ? "#fff" : `${accent}06`,
                      borderBottom: idx < group.length - 1 ? "1px solid #f2f2f2" : "none",
                      padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 12,
                    }}
                  >
                    <div style={{
                      width: 40, height: 40, borderRadius: 12,
                      background: n.is_read ? "#f4f4f4" : `${accent}18`,
                      border: `1.5px solid ${n.is_read ? "#e8e8e8" : accent + "30"}`,
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 18,
                    }}>
                      {iconFor(n.type)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <p style={{ margin: 0, fontSize: 13.5, fontWeight: n.is_read ? 600 : 800, color: "#1a1a1a", flex: 1 }}>
                          {n.title}
                        </p>
                        {!n.is_read && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#c0392b", flexShrink: 0 }} />}
                      </div>
                      {n.title_ar && (
                        <p style={{ margin: "1px 0 0", fontSize: 11.5, color: GOLD, fontFamily: "serif" }}>{n.title_ar}</p>
                      )}
                      <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "#555", lineHeight: 1.5 }}>{n.message}</p>
                      <p style={{ margin: "6px 0 0", fontSize: 10.5, color: "#aaa" }}>{formatTime(n.created_at)}</p>
                    </div>
                    <button
                      onClick={(e) => handleDeleteOne(e, n.id)}
                      aria-label="Delete notification"
                      style={{
                        flexShrink: 0, width: 28, height: 28, borderRadius: 8, border: "none",
                        background: "transparent", color: "#bbb", cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      {hasMore && filtered.length > 0 && (
        <button
          onClick={loadMore}
          disabled={loading}
          style={{
            display: "block", margin: "8px auto 0", padding: "10px 22px", borderRadius: 20,
            background: "#f2f2f2", color: "#555", fontSize: 12.5, fontWeight: 700, border: "none", cursor: "pointer",
          }}
        >
          {loading ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
