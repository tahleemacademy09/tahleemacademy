/*
  src/components/notifications/NotificationBell.tsx — Tahleem Academy
  ────────────────────────────────────────────────────────────────────────────
  Self-contained bell icon + dropdown panel ("quick glance"). Needs no props —
  pulls everything from useNotifications(). Drop this into any header:

    <NotificationBell />

  Replaces the inline notification state/panel that used to live duplicated
  in both DashboardLayout.tsx and TeacherLayout.tsx.

  "View all" links to /notifications (the full history page) — wire that
  route inside each layout's route group (student/teacher/admin all render
  the same <NotificationsPage />).
*/
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { useNotifications, type AppNotification } from "@/hooks/useNotifications";

const GREEN = "#0f2d1f";
const GREEN_2 = "#1a4a2e";
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

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString();
}

// Notifications page is mounted once per role area (/student/notifications,
// /teacher/notifications, /admin/notifications) so it inherits that role's
// layout/sidebar. Derive the right prefix from wherever the user currently is.
function notificationsHomePath(): string {
  const seg = window.location.pathname.split("/")[1];
  if (seg === "student" || seg === "teacher" || seg === "admin") return `/${seg}/notifications`;
  return "/student/notifications";
}

function resolvePath(link: string | null): string | null {
  if (!link) return null;
  if (link.startsWith("/")) return link;
  if (link.startsWith("http")) {
    try {
      const u = new URL(link);
      return u.pathname + u.search;
    } catch { return null; }
  }
  return null;
}

export default function NotificationBell() {
  const { items, unreadCount, markRead, markAllRead, deleteAll } = useNotifications();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const handleDeleteAll = () => {
    if (items.length === 0) return;
    if (window.confirm("Delete all notifications? This can't be undone.")) deleteAll();
  };

  const handleClick = (n: AppNotification) => {
    if (!n.is_read) markRead(n.id);
    const path = resolvePath(n.link);
    if (path) {
      setOpen(false);
      navigate(path);
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        style={{
          width: 32, height: 32, borderRadius: 10, background: "transparent",
          border: "none", cursor: "pointer", display: "flex", alignItems: "center",
          justifyContent: "center", position: "relative",
        }}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span style={{
            position: "absolute", top: 2, right: 2, minWidth: 15, height: 15,
            padding: "0 3px", borderRadius: 999, background: "#c0392b", color: "#fff",
            fontSize: 9, fontWeight: 800, display: "flex", alignItems: "center",
            justifyContent: "center", border: "1.5px solid #fff",
          }}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(3px)" }}
          />
          <div style={{
            position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 51,
            width: 360, maxWidth: "92vw", maxHeight: "75vh", background: "#fff",
            borderRadius: 20, boxShadow: "0 20px 50px rgba(0,0,0,0.22)",
            display: "flex", flexDirection: "column", overflow: "hidden",
          }}>
            {/* Header */}
            <div style={{
              background: `linear-gradient(135deg, ${GREEN}, ${GREEN_2})`, padding: "16px 18px",
              display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 9, background: "rgba(201,168,76,0.18)",
                  border: `1.5px solid rgba(201,168,76,0.4)`, display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Bell style={{ width: 14, height: 14, color: GOLD }} />
                </div>
                <div>
                  <p style={{ margin: 0, fontWeight: 800, fontSize: 14, color: "#fff", letterSpacing: "-0.3px" }}>Notifications</p>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: 10, color: "rgba(201,168,76,0.85)", fontFamily: "serif" }}>الإشعارات</p>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {unreadCount > 0 && (
                  <button onClick={markAllRead} style={{
                    fontSize: 10.5, fontWeight: 700, padding: "5px 10px", borderRadius: 20,
                    background: "rgba(201,168,76,0.15)", color: GOLD, border: "1px solid rgba(201,168,76,0.3)", cursor: "pointer",
                  }}>
                    Mark all read
                  </button>
                )}
                {items.length > 0 && (
                  <button onClick={handleDeleteAll} style={{
                    fontSize: 10.5, fontWeight: 700, padding: "5px 10px", borderRadius: 20,
                    background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.75)",
                    border: "1px solid rgba(255,255,255,0.18)", cursor: "pointer",
                  }}>
                    Delete all
                  </button>
                )}
              </div>
            </div>

            {/* List */}
            <div style={{ overflowY: "auto", flex: 1 }}>
              {items.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 20px", color: "#aaa" }}>
                  <div style={{ fontSize: 28, marginBottom: 6 }}>🔔</div>
                  <p style={{ fontSize: 12.5, fontWeight: 600, margin: 0 }}>No notifications yet</p>
                  <p style={{ fontSize: 10.5, color: "#bbb", margin: "3px 0 0", fontFamily: "serif" }}>لا توجد إشعارات</p>
                </div>
              ) : (
                items.slice(0, 20).map((n) => {
                  const accent = accentFor(n.priority);
                  return (
                    <div
                      key={n.id}
                      onClick={() => handleClick(n)}
                      style={{
                        background: n.is_read ? "#fff" : `${accent}08`,
                        borderBottom: "1px solid #f2f2f2", padding: "12px 16px", cursor: "pointer",
                        display: "flex", alignItems: "flex-start", gap: 10,
                      }}
                    >
                      <div style={{
                        width: 34, height: 34, borderRadius: 10,
                        background: n.is_read ? "#f4f4f4" : `${accent}18`,
                        border: `1.5px solid ${n.is_read ? "#e8e8e8" : accent + "30"}`,
                        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 15,
                      }}>
                        {iconFor(n.type)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <p style={{
                            margin: 0, fontSize: 12.5, fontWeight: n.is_read ? 600 : 800, color: "#1a1a1a",
                            flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            {n.title}
                          </p>
                          {!n.is_read && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#c0392b", flexShrink: 0 }} />}
                        </div>
                        <p style={{
                          margin: "2px 0 0", fontSize: 11, color: "#666", lineHeight: 1.4,
                          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                        }}>
                          {n.message}
                        </p>
                        <p style={{ margin: "3px 0 0", fontSize: 10, color: "#aaa" }}>{timeAgo(n.created_at)}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <button
              onClick={() => { setOpen(false); navigate(notificationsHomePath()); }}
              style={{
                flexShrink: 0, padding: "12px", textAlign: "center", fontSize: 12, fontWeight: 700,
                color: GREEN, background: "#fafafa", border: "none", borderTop: "1px solid #f0f0f0", cursor: "pointer",
              }}
            >
              View all notifications
            </button>
          </div>
        </>
      )}
    </div>
  );
}
