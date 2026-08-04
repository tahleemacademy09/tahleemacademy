/*
  src/pages/admin/SiteAnalytics.tsx — Tahleem Academy
  "Who visited, when, and what did they view" — split into two tabs:
    - Public Visitors: anonymous traffic on the public marketing site
      (page_views rows where user_id IS NULL)
    - Logged-in Activity: student/teacher/admin activity inside the app
      (page_views rows where user_id IS NOT NULL), joined to profiles
      for names.
  Data source: public.page_views (see supabase/migrations/…_create_page_views.sql),
  populated client-side by src/hooks/usePageViewTracking.ts on every route change.
*/
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { Eye, Users, Monitor, Smartphone, Tablet, Globe } from "lucide-react";

const G      = "#064E3B";
const TEAL   = "#0a7c68";
const BORDER = "#E5E7EB";
const RANGES = [
  { label: "7d",  days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

type PageViewRow = {
  id: string; created_at: string; path: string; referrer: string | null;
  visitor_id: string; session_id: string; user_id: string | null;
  device_type: string | null; user_agent: string | null;
};

const fmtDT = (d: string) => new Date(d).toLocaleString("en-NG", {
  day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
});

const deviceIcon = (d: string | null) => {
  if (d === "mobile") return <Smartphone size={13} />;
  if (d === "tablet")  return <Tablet size={13} />;
  return <Monitor size={13} />;
};

// ── Small stat card ──────────────────────────────────────────────────────
const StatCard = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) => (
  <div style={{ flex: 1, minWidth: 110, background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "12px 14px" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 6, color: TEAL, marginBottom: 4 }}>
      {icon}<span style={{ fontSize: 11, fontWeight: 700, color: "#6B7280" }}>{label}</span>
    </div>
    <div style={{ fontSize: 22, fontWeight: 900, color: G }}>{value}</div>
  </div>
);

const SiteAnalytics = () => {
  const [tab, setTab]   = useState<"public" | "loggedin">("public");
  const [range, setRange] = useState(7);

  const since = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - range);
    return d.toISOString();
  }, [range]);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin-page-views", range],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("page_views" as any)
        .select("*")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return (data || []) as unknown as PageViewRow[];
    },
  });

  const publicRows   = useMemo(() => rows.filter(r => !r.user_id), [rows]);
  const loggedInRows = useMemo(() => rows.filter(r => r.user_id), [rows]);

  // Names for logged-in visitors — page_views.user_id has no direct FK to
  // profiles (both point at auth.users independently), so join client-side.
  const loggedInUserIds = useMemo(
    () => Array.from(new Set(loggedInRows.map(r => r.user_id))).filter(Boolean) as string[],
    [loggedInRows]
  );
  const { data: profileMap = {} } = useQuery({
    queryKey: ["admin-page-views-profiles", loggedInUserIds],
    enabled: loggedInUserIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", loggedInUserIds);
      const map: Record<string, string> = {};
      (data || []).forEach((p: any) => { map[p.user_id] = p.full_name || "Unnamed"; });
      return map;
    },
  });

  // ── Aggregates for the active tab ───────────────────────────────────
  const activeRows = tab === "public" ? publicRows : loggedInRows;

  const uniqueVisitors = useMemo(() => {
    const key = tab === "public" ? "visitor_id" : "user_id";
    return new Set(activeRows.map(r => (r as any)[key])).size;
  }, [activeRows, tab]);

  const topPages = useMemo(() => {
    const counts: Record<string, number> = {};
    activeRows.forEach(r => { counts[r.path] = (counts[r.path] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([path, count]) => ({ path, count }));
  }, [activeRows]);

  const viewsByDay = useMemo(() => {
    const counts: Record<string, number> = {};
    activeRows.forEach(r => {
      const day = new Date(r.created_at).toLocaleDateString("en-NG", { month: "short", day: "2-digit" });
      counts[day] = (counts[day] || 0) + 1;
    });
    return Object.entries(counts).map(([name, views]) => ({ name, views })).reverse();
  }, [activeRows]);

  const recent = activeRows.slice(0, 40);

  return (
    <div style={{ padding: 16, fontFamily: "'Cairo', sans-serif", maxWidth: 960, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        <h1 style={{ fontSize: 18, fontWeight: 900, color: G, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <Eye size={18} /> Site Analytics
        </h1>
        <div style={{ display: "flex", gap: 6 }}>
          {RANGES.map(r => (
            <button key={r.days} onClick={() => setRange(r.days)} style={{
              padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: "pointer",
              border: `1.5px solid ${range === r.days ? TEAL : BORDER}`,
              background: range === r.days ? TEAL : "#fff",
              color: range === r.days ? "#fff" : "#6B7280",
            }}>{r.label}</button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, borderBottom: `1px solid ${BORDER}` }}>
        {([
          { key: "public",   label: "Public Visitors",    icon: <Globe size={14} /> },
          { key: "loggedin", label: "Logged-in Activity", icon: <Users size={14} /> },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer",
            padding: "8px 4px", marginBottom: -1,
            borderBottom: `2.5px solid ${tab === t.key ? TEAL : "transparent"}`,
            color: tab === t.key ? G : "#9CA3AF", fontWeight: 800, fontSize: 13,
          }}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p style={{ color: "#9CA3AF", fontSize: 13 }}>Loading…</p>
      ) : (
        <>
          {/* Stat cards */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
            <StatCard icon={<Eye size={14} />} label="Total views" value={activeRows.length} />
            <StatCard icon={<Users size={14} />} label={tab === "public" ? "Unique visitors" : "Unique users"} value={uniqueVisitors} />
            <StatCard icon={<Globe size={14} />} label="Pages viewed" value={topPages.length} />
          </div>

          {/* Views over time */}
          <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "14px 10px 4px", marginBottom: 16 }}>
            <p style={{ fontSize: 12, fontWeight: 800, color: G, margin: "0 8px 8px" }}>Views over time</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={viewsByDay}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="views" fill={TEAL} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Top pages */}
          <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, marginBottom: 16 }}>
            <p style={{ fontSize: 12, fontWeight: 800, color: G, margin: "0 0 10px" }}>Top pages</p>
            {topPages.length === 0 && <p style={{ fontSize: 12, color: "#9CA3AF" }}>No views in this range.</p>}
            {topPages.map(p => (
              <div key={p.path} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${BORDER}`, fontSize: 12 }}>
                <span style={{ color: "#111", fontFamily: "monospace" }}>{p.path}</span>
                <span style={{ color: TEAL, fontWeight: 800 }}>{p.count}</span>
              </div>
            ))}
          </div>

          {/* Recent visits */}
          <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14 }}>
            <p style={{ fontSize: 12, fontWeight: 800, color: G, margin: "0 0 10px" }}>
              Recent {tab === "public" ? "visits" : "activity"}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 420, overflowY: "auto" }}>
              {recent.length === 0 && <p style={{ fontSize: 12, color: "#9CA3AF" }}>Nothing yet.</p>}
              {recent.map(r => (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "6px 0", borderBottom: `1px solid ${BORDER}` }}>
                  <span style={{ color: "#9CA3AF" }}>{deviceIcon(r.device_type)}</span>
                  <span style={{ fontFamily: "monospace", color: "#111", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.path}
                  </span>
                  {tab === "loggedin" && r.user_id && (
                    <span style={{ color: G, fontWeight: 700, fontSize: 11 }}>{profileMap[r.user_id] || "…"}</span>
                  )}
                  <span style={{ color: "#9CA3AF", fontSize: 11, whiteSpace: "nowrap" }}>{fmtDT(r.created_at)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default SiteAnalytics;
