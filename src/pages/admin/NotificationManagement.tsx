/*
  src/pages/admin/NotificationManagement.tsx — Tahleem Academy
  ────────────────────────────────────────────────────────────────────────────
  Rebuilt as the "core" notification composer. Dropped from the previous
  version (AI Compose, Auto Events, Moderation, Reach diagnostics) — all of
  that was Lovable-AI-specific scope beyond the notification system itself.
  This is the plain, essential admin tool: write a notification, pick who
  gets it, send it. Everything else can be layered back on top later.

  Sending inserts one row per recipient into `public.notifications` — the
  DB trigger (trg_dispatch_notification) takes care of push delivery.
*/
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Bell, Send, Loader2, Search, Users, GraduationCap, User, History } from "lucide-react";

const G = "#064E3B";
const G2 = "#075E54";
const GOLD = "#c9a84c";

const inp: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 10,
  border: "1.5px solid #E5E7EB", fontSize: 13, outline: "none",
  background: "#FAFAFA", boxSizing: "border-box" as const, fontFamily: "inherit",
};

const AUDIENCES = [
  { value: "all", label: "Everyone", icon: Users },
  { value: "student", label: "All Students", icon: GraduationCap },
  { value: "teacher", label: "All Teachers", icon: User },
] as const;

const TYPES = [
  { value: "general", label: "General" },
  { value: "announcement", label: "Announcement" },
  { value: "exam", label: "Exam" },
  { value: "result", label: "Result" },
  { value: "payment", label: "Payment" },
  { value: "warning", label: "Warning" },
];

type UserRow = { user_id: string; full_name: string | null; role: string };

function Spin({ size = 16 }: { size?: number }) {
  return <Loader2 size={size} style={{ animation: "spin .8s linear infinite" }} />;
}

// ── Recipient picker: preset audiences + individual user search ────────────
function RecipientPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<UserRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<UserRow | null>(null);

  useEffect(() => {
    if (search.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    const handle = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .ilike("full_name", `%${search.trim()}%`)
        .limit(8);
      const { data: roleRows } = await supabase.from("user_roles").select("user_id, role");
      const roleMap = new Map((roleRows ?? []).map((r: any) => [r.user_id, r.role]));
      setResults((data ?? []).map((u: any) => ({ user_id: u.user_id, full_name: u.full_name, role: roleMap.get(u.user_id) ?? "student" })));
      setSearching(false);
    }, 300);
    return () => clearTimeout(handle);
  }, [search]);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        {AUDIENCES.map((a) => (
          <button
            key={a.value}
            onClick={() => { onChange(a.value); setPicked(null); }}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 20,
              fontSize: 12.5, fontWeight: 700, cursor: "pointer",
              background: value === a.value ? G : "#f2f2f2",
              color: value === a.value ? "#fff" : "#555", border: "none",
            }}
          >
            <a.icon size={13} /> {a.label}
          </button>
        ))}
      </div>

      <div style={{ position: "relative" }}>
        <Search size={14} style={{ position: "absolute", left: 10, top: 11, color: "#999" }} />
        <input
          value={picked ? picked.full_name ?? "Unnamed user" : search}
          onChange={(e) => { setPicked(null); setSearch(e.target.value); onChange(""); }}
          placeholder="Or search a specific person by name…"
          style={{ ...inp, paddingLeft: 32 }}
        />
        {searching && <div style={{ position: "absolute", right: 10, top: 10 }}><Spin size={14} /></div>}
      </div>

      {!picked && results.length > 0 && (
        <div style={{ marginTop: 6, border: "1px solid #eee", borderRadius: 10, overflow: "hidden" }}>
          {results.map((u) => (
            <div
              key={u.user_id}
              onClick={() => { setPicked(u); onChange(`user:${u.user_id}`); setSearch(""); }}
              style={{ padding: "9px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontSize: 13, borderBottom: "1px solid #f5f5f5" }}
            >
              <span>{u.role === "teacher" ? "👨‍🏫" : u.role === "admin" ? "🛡️" : "🎓"}</span>
              <span style={{ flex: 1 }}>{u.full_name ?? "Unnamed"}</span>
              <span style={{ fontSize: 10, color: "#999", textTransform: "capitalize" }}>{u.role}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Recent sends ─────────────────────────────────────────────────────────────
function RecentSends() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    // Group-ish view: just the most recent unique (title, created_at) sends.
    const { data } = await supabase
      .from("notifications")
      .select("id, title, message, type, created_at, is_read")
      .order("created_at", { ascending: false })
      .limit(50);
    setRows(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ padding: 30, textAlign: "center" }}><Spin size={20} /></div>;
  if (rows.length === 0) return <p style={{ fontSize: 13, color: "#999", textAlign: "center", padding: 24 }}>No notifications sent yet.</p>;

  // Collapse by identical title+message+created-minute so a broadcast to 200
  // students shows as one row instead of 200.
  const collapsed = new Map<string, { title: string; message: string; type: string; created_at: string; count: number }>();
  for (const r of rows) {
    const key = `${r.title}|${r.message}|${r.created_at.slice(0, 16)}`;
    const existing = collapsed.get(key);
    if (existing) existing.count++;
    else collapsed.set(key, { title: r.title, message: r.message, type: r.type, created_at: r.created_at, count: 1 });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {[...collapsed.values()].map((r, i) => (
        <div key={i} style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 12, padding: "12px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>{r.title}</p>
            <span style={{ fontSize: 10, color: "#999", flexShrink: 0 }}>{new Date(r.created_at).toLocaleString()}</span>
          </div>
          <p style={{ margin: "3px 0 0", fontSize: 12, color: "#666" }}>{r.message}</p>
          <div style={{ marginTop: 6, display: "flex", gap: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: GOLD, background: `${GOLD}18`, padding: "2px 8px", borderRadius: 20 }}>{r.type}</span>
            <span style={{ fontSize: 10, color: "#999" }}>{r.count} recipient{r.count > 1 ? "s" : ""}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function NotificationManagement() {
  const { toast } = useToast();
  const [tab, setTab] = useState<"compose" | "history">("compose");

  const [audience, setAudience] = useState("all");
  const [title, setTitle] = useState("");
  const [titleAr, setTitleAr] = useState("");
  const [message, setMessage] = useState("");
  const [messageAr, setMessageAr] = useState("");
  const [type, setType] = useState("announcement");
  const [priority, setPriority] = useState("normal");
  const [link, setLink] = useState("");
  const [sending, setSending] = useState(false);

  const resetForm = () => {
    setTitle(""); setTitleAr(""); setMessage(""); setMessageAr(""); setLink("");
  };

  const handleSend = async () => {
    if (!title.trim() || !message.trim()) {
      toast({ title: "Missing fields", description: "Title and message are required.", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      let userIds: string[] = [];

      if (audience.startsWith("user:")) {
        userIds = [audience.replace("user:", "")];
      } else if (audience === "all") {
        const { data } = await supabase.from("profiles").select("user_id");
        userIds = (data ?? []).map((u: any) => u.user_id);
      } else {
        const role = audience as "admin" | "student" | "teacher";
        const { data } = await supabase.from("user_roles").select("user_id").eq("role", role);
        userIds = (data ?? []).map((u: any) => u.user_id);
      }

      if (userIds.length === 0) {
        toast({ title: "No recipients found", variant: "destructive" });
        setSending(false);
        return;
      }

      const rows = userIds.map((user_id) => ({
        user_id,
        type,
        priority,
        title: title.trim(),
        title_ar: titleAr.trim() || null,
        message: message.trim(),
        message_ar: messageAr.trim() || null,
        link: link.trim() || null,
      }));

      const { error } = await supabase.from("notifications").insert(rows);
      if (error) throw error;

      toast({ title: "Sent", description: `Delivered to ${userIds.length} recipient${userIds.length > 1 ? "s" : ""}.` });
      resetForm();
    } catch (e: any) {
      toast({ title: "Send failed", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "20px 16px 60px", fontFamily: "'Cairo',system-ui,sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <div style={{ width: 38, height: 38, borderRadius: 11, background: `${G}12`, border: `1.5px solid ${G}25`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Bell style={{ width: 17, height: 17, color: G }} />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#1a1a1a" }}>Notifications</h1>
          <p style={{ margin: 0, fontSize: 11, color: GOLD, fontFamily: "serif" }}>الإشعارات</p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        <button onClick={() => setTab("compose")} style={{ padding: "7px 16px", borderRadius: 20, fontSize: 12.5, fontWeight: 700, cursor: "pointer", background: tab === "compose" ? G : "#f2f2f2", color: tab === "compose" ? "#fff" : "#555", border: "none", display: "flex", alignItems: "center", gap: 6 }}>
          <Send size={13} /> Compose
        </button>
        <button onClick={() => setTab("history")} style={{ padding: "7px 16px", borderRadius: 20, fontSize: 12.5, fontWeight: 700, cursor: "pointer", background: tab === "history" ? G : "#f2f2f2", color: tab === "history" ? "#fff" : "#555", border: "none", display: "flex", alignItems: "center", gap: 6 }}>
          <History size={13} /> History
        </button>
      </div>

      {tab === "compose" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#555", marginBottom: 6, display: "block" }}>Recipients</label>
            <RecipientPicker value={audience} onChange={setAudience} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#555", marginBottom: 6, display: "block" }}>Type</label>
              <select value={type} onChange={(e) => setType(e.target.value)} style={inp}>
                {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#555", marginBottom: 6, display: "block" }}>Priority</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value)} style={inp}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent (bypasses quiet hours)</option>
              </select>
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#555", marginBottom: 6, display: "block" }}>Title (English)</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. New exam results are out" style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#555", marginBottom: 6, display: "block" }}>Title (Arabic — optional)</label>
            <input value={titleAr} onChange={(e) => setTitleAr(e.target.value)} dir="rtl" style={{ ...inp, fontFamily: "'Amiri','Scheherazade New',serif" }} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#555", marginBottom: 6, display: "block" }}>Message (English)</label>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} style={{ ...inp, resize: "vertical" as const }} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#555", marginBottom: 6, display: "block" }}>Message (Arabic — optional)</label>
            <textarea value={messageAr} onChange={(e) => setMessageAr(e.target.value)} dir="rtl" rows={3} style={{ ...inp, resize: "vertical" as const, fontFamily: "'Amiri','Scheherazade New',serif" }} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#555", marginBottom: 6, display: "block" }}>Link (optional — e.g. /student/exams)</label>
            <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="/student/exams" style={inp} />
          </div>

          <button
            onClick={handleSend}
            disabled={sending}
            style={{
              padding: "12px", borderRadius: 12, border: "none",
              background: sending ? "#9CA3AF" : `linear-gradient(135deg, ${G}, ${G2})`,
              color: "#fff", fontSize: 14, fontWeight: 800, cursor: sending ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            {sending ? <><Spin size={16} /> Sending…</> : <><Send size={15} /> Send Notification</>}
          </button>
        </div>
      ) : (
        <RecentSends />
      )}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
