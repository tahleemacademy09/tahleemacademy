/*
  supabase/functions/admin-notification-diagnostics/index.ts
  ══════════════════════════════════════════════════════════════════════
  Admin-only. Uses the service role to read push_subscriptions (which
  regular users have no RLS visibility into, by design — those rows hold
  push auth secrets) and cross-references it against profiles, so admins
  can see, at a glance, who can actually be reached in the background
  (push and/or Telegram) versus who has never enabled it.

  POST body:
    { action: "stats" }
      → per-role summary + full per-user breakdown

    { action: "send_test", user_id: string }
      → inserts a real notification row for that user (type
        "admin_test_push"), which flows through the normal
        dispatch-notification trigger exactly like any other
        notification — the fastest way to confirm end-to-end delivery
        without waiting for a real class/content event.
══════════════════════════════════════════════════════════════════════
*/

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function classifySubscription(sub: { endpoint: string; p256dh: string | null; auth: string | null }): string {
  if (sub.endpoint?.startsWith("native:android:")) return "native-android";
  if (sub.endpoint?.startsWith("native:ios:"))     return "native-ios";
  if (sub.p256dh && sub.auth)                      return "web-push";
  if (sub.endpoint?.startsWith("https://fcm.googleapis.com/fcm/send/")) return "legacy-fcm-web";
  return "unknown";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer /, "");
    if (!jwt) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Verify caller is an authenticated admin ──────────────────────────────
    const { data: userData, error: userErr } = await sb.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerId = userData.user.id;

    const { data: roleRow } = await sb
      .from("user_roles").select("role").eq("user_id", callerId).eq("role", "admin").maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Admins only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const action = body?.action ?? "stats";

    // ── Send a real test notification through the normal pipeline ───────────
    if (action === "send_test") {
      const targetUserId = body?.user_id ?? callerId;
      const { error: insertErr } = await sb.from("notifications").insert({
        user_id: targetUserId,
        title:   "🔔 Test Notification",
        message: "If you're seeing this on your phone/desktop with the app closed, background push is working correctly.",
        type:    "admin_test_push",
        link:    "/",
        is_read: false,
      });
      if (insertErr) {
        return new Response(JSON.stringify({ error: insertErr.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Stats ─────────────────────────────────────────────────────────────────
    const [{ data: profiles }, { data: subs }] = await Promise.all([
      sb.from("profiles").select("user_id, full_name, email, role, level, telegram_chat_id"),
      sb.from("push_subscriptions").select("user_id, endpoint, p256dh, auth, updated_at"),
    ]);

    const subsByUser = new Map<string, any[]>();
    for (const s of subs ?? []) {
      const list = subsByUser.get(s.user_id) ?? [];
      list.push(s);
      subsByUser.set(s.user_id, list);
    }

    const users = (profiles ?? []).map((p: any) => {
      const mySubs = subsByUser.get(p.user_id) ?? [];
      const deviceTypes = [...new Set(mySubs.map(classifySubscription))];
      const lastUpdated = mySubs.reduce<string | null>((latest, s) => {
        if (!s.updated_at) return latest;
        return !latest || s.updated_at > latest ? s.updated_at : latest;
      }, null);

      return {
        user_id:         p.user_id,
        name:            p.full_name ?? p.email ?? "Unnamed",
        role:            p.role,
        level:           p.level ?? null,
        push_subscribed: mySubs.length > 0,
        device_count:    mySubs.length,
        device_types:    deviceTypes,
        telegram_linked: !!p.telegram_chat_id,
        last_updated:    lastUpdated,
      };
    });

    const byRole = (role: string) => users.filter(u => u.role === role);
    const summarize = (list: typeof users) => ({
      total:            list.length,
      push_subscribed:  list.filter(u => u.push_subscribed).length,
      telegram_linked:  list.filter(u => u.telegram_linked).length,
      reachable_either: list.filter(u => u.push_subscribed || u.telegram_linked).length,
      unreachable:      list.filter(u => !u.push_subscribed && !u.telegram_linked).length,
    });

    const summary = {
      students: summarize(byRole("student")),
      teachers: summarize(byRole("teacher")),
      admins:   summarize(byRole("admin")),
      overall:  summarize(users),
    };

    return new Response(JSON.stringify({ ok: true, summary, users }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("[admin-notification-diagnostics] fatal:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
