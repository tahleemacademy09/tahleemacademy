/*
  src/hooks/useNotifications.ts — Tahleem Academy
  ────────────────────────────────────────────────────────────────────────────
  Single source of truth for in-app notification data: fetch, realtime
  updates, unread count, mark-read/mark-all-read. Previously this state
  (fetch + realtime subscription + markRead) was duplicated independently
  inside DashboardLayout.tsx AND TeacherLayout.tsx. Now both the bell
  dropdown and the full notifications page share this one hook.
*/
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type AppNotification = {
  id: string;
  user_id: string;
  type: string;
  priority: "low" | "normal" | "high" | "urgent";
  title: string;
  title_ar: string | null;
  message: string;
  message_ar: string | null;
  link: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
};

const PAGE_SIZE = 30;

export function useNotifications() {
  const { user } = useAuth();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchUnreadCount = useCallback(async () => {
    if (!user) return;
    const { count } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_read", false);
    setUnreadCount(count ?? 0);
  }, [user]);

  const load = useCallback(async (opts?: { reset?: boolean }) => {
    if (!user) return;
    const reset = opts?.reset ?? true;
    setLoading(true);
    const from = reset ? 0 : items.length;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    const rows = (data as AppNotification[]) ?? [];
    setItems((prev) => (reset ? rows : [...prev, ...rows]));
    setHasMore(rows.length === PAGE_SIZE);
    setLoading(false);
  }, [user, items.length]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore) load({ reset: false });
  }, [load, loading, hasMore]);

  useEffect(() => {
    if (!user) return;
    load({ reset: true });
    fetchUnreadCount();

    channelRef.current = supabase
      .channel(`notifications:${user.id}`)
      .on(
        "postgres_changes" as any,
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload: any) => {
          setItems((prev) => [payload.new as AppNotification, ...prev]);
          setUnreadCount((c) => c + 1);
        },
      )
      .on(
        "postgres_changes" as any,
        { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload: any) => {
          setItems((prev) => prev.map((n) => (n.id === payload.new.id ? payload.new : n)));
          if (payload.old?.is_read === false && payload.new?.is_read === true) {
            setUnreadCount((c) => Math.max(0, c - 1));
          }
        },
      )
      .subscribe();

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const markRead = useCallback(async (id: string) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
    await supabase.from("notifications").update({ is_read: true, read_at: new Date().toISOString() }).eq("id", id);
  }, []);

  const markAllRead = useCallback(async () => {
    if (!user) return;
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
    await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("is_read", false);
  }, [user]);

  return { items, unreadCount, loading, hasMore, loadMore, markRead, markAllRead, refresh: () => load({ reset: true }) };
}
