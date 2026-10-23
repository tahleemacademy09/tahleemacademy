/*
  supabase/functions/send-class-reminder/index.ts
  ─────────────────────────────────────────────────
  Triggered by useTimetableNotifications (client-side) OR by a
  scheduled cron job (server-side).

  1. Looks up the student's push subscription → sends Web Push
     (works even when the phone browser is closed / in background)
  2. Checks student_preferences → if whatsapp_notifications = true
     AND a WhatsApp number is saved in profiles → sends via Twilio

  Required Supabase secrets (set in Dashboard → Settings → Edge Functions):
    VAPID_PRIVATE_KEY   — your VAPID private key  (base64url)
    VAPID_PUBLIC_KEY    — your VAPID public key   (base64url)
    VAPID_SUBJECT       — mailto:your@email.com
    TWILIO_ACCOUNT_SID  — from Twilio console
    TWILIO_AUTH_TOKEN   — from Twilio console
    TWILIO_WHATSAPP_FROM — e.g. whatsapp:+14155238886 (Twilio sandbox or approved number)
*/

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Web-Push helper (no npm dependency — raw HTTP to push endpoint) ──────────
async function sendWebPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload:      { title: string; message: string; url: string; tag: string; minutes_left: number }
): Promise<void> {
  const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");
  const VAPID_PUBLIC_KEY  = Deno.env.get("VAPID_PUBLIC_KEY");
  const VAPID_SUBJECT     = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@tahleemacademy.com";

  if (!VAPID_PRIVATE_KEY || !VAPID_PUBLIC_KEY) {
    console.warn("[send-class-reminder] VAPID keys not configured — skipping web push");
    return;
  }

  // Use the web-push library via esm.sh (Deno-compatible)
  const webpush = await import("https://esm.sh/web-push@3.6.7");
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  await webpush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth:   subscription.auth,
      },
    },
    JSON.stringify(payload),
    { TTL: 60 * 20 } // expire after 20 min if phone is offline
  );
}

// ── Twilio WhatsApp helper ────────────────────────────────────────────────────
async function sendWhatsApp(to: string, body: string): Promise<void> {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken  = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from       = Deno.env.get("TWILIO_WHATSAPP_FROM");

  if (!accountSid || !authToken || !from) {
    console.warn("[send-class-reminder] Twilio not configured — skipping WhatsApp");
    return;
  }

  // Normalise number: strip spaces, ensure + prefix
  const normalized = to.replace(/\s+/g, "").replace(/^00/, "+");
  const whatsappTo = normalized.startsWith("whatsapp:") ? normalized : `whatsapp:${normalized}`;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type":  "application/x-www-form-urlencoded",
      "Authorization": "Basic " + btoa(`${accountSid}:${authToken}`),
    },
    body: new URLSearchParams({ From: from, To: whatsappTo, Body: body }).toString(),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Twilio error ${res.status}: ${txt}`);
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      user_id,
      subject_title,
      start_time,
      minutes_left,
      join_url,
    } = await req.json();

    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const title   = minutes_left <= 5
      ? `📚 Class starts in 5 min — join now!`
      : `📚 Class starting in ${minutes_left} min`;
    const message = `${subject_title ?? "Your class"} starts at ${start_time}. ${minutes_left <= 5 ? "Tap to join!" : "Get ready!"}`;

    const results: Record<string, string> = {};

    // ── 1. Web Push ──────────────────────────────────────────────────────────
    const { data: subRow } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", user_id)
      .maybeSingle();

    if (subRow) {
      try {
        await sendWebPush(subRow, {
          title,
          message,
          url:          join_url ?? "/student/timetable",
          tag:          `reminder-${user_id}-${minutes_left}`,
          minutes_left: minutes_left ?? 15,
        });
        results.web_push = "sent";
      } catch (e: any) {
        console.warn("[send-class-reminder] web push failed:", e.message);
        results.web_push = `failed: ${e.message}`;
      }
    } else {
      results.web_push = "no_subscription";
    }

    // ── 2. WhatsApp via Twilio ───────────────────────────────────────────────
    // Check preferences first
    const { data: prefRow } = await supabase
      .from("student_preferences")
      .select("notifications")
      .eq("user_id", user_id)
      .maybeSingle();

    const notifPrefs = (prefRow?.notifications as any) ?? {};
    const wantWhatsApp = notifPrefs.whatsapp_notifications === true;

    if (wantWhatsApp) {
      // Get the student's WhatsApp number from profiles
      const { data: profile } = await supabase
        .from("profiles")
        .select("whatsapp, phone, full_name")
        .eq("user_id", user_id)
        .maybeSingle();

      const number = profile?.whatsapp || profile?.phone;

      if (number) {
        const waBody =
          `🕌 *Tahleem Academy* — Class Reminder\n\n` +
          `As-salamu alaykum ${profile?.full_name ?? ""}!\n\n` +
          `📚 *${subject_title ?? "Your class"}* starts at *${start_time}*\n` +
          `⏰ ${minutes_left} minute${minutes_left !== 1 ? "s" : ""} to go\n\n` +
          (join_url ? `🔗 Join: ${join_url}\n\n` : "") +
          `_Tahleem Academy — بارك الله فيكم_`;

        try {
          await sendWhatsApp(number, waBody);
          results.whatsapp = "sent";
        } catch (e: any) {
          console.warn("[send-class-reminder] WhatsApp failed:", e.message);
          results.whatsapp = `failed: ${e.message}`;
        }
      } else {
        results.whatsapp = "no_number_on_profile";
      }
    } else {
      results.whatsapp = "disabled_by_student";
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("[send-class-reminder] error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
