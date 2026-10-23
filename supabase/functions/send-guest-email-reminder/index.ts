/*
  supabase/functions/send-guest-email-reminder/index.ts
  ──────────────────────────────────────────────────────
  Sends reminder emails to pre-registered guests of a public class.
  Can target a single class or ALL contacts who have email addresses.

  Required Supabase secrets (Dashboard → Settings → Edge Functions):
    RESEND_API_KEY  — from https://resend.com (free tier: 3,000 emails/month)
    FROM_EMAIL      — verified sender e.g.  reminders@tahleemacademy.com
    FROM_NAME       — display name e.g.     Tahleem Academy

  Request body (JSON):
    {
      subject:      string,           // email subject line
      body_text:    string,           // plain-text body (newlines preserved)
      class_id?:    string,           // target one class's registrants
      all_contacts?: true             // OR send to all contacts with emails
    }

  Response:
    { ok: true, sent: number, failed: number, skipped: number }
*/

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Resend email helper ────────────────────────────────────────────────────────

async function sendViaResend(payload: {
  from: string;
  to:   string;
  subject: string;
  text: string;
  html: string;
}): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) throw new Error("RESEND_API_KEY not configured in Edge Function secrets");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend API error ${res.status}: ${err}`);
  }
}

// ── Plain-text → HTML converter (basic) ──────────────────────────────────────

function textToHtml(text: string, classTitle?: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const paragraphs = escaped
    .split(/\n\n+/)
    .map(block => {
      // Bold *text*
      const withBold = block.replace(/\*([^*]+)\*/g, "<strong>$1</strong>");
      // Line breaks within paragraphs
      const withBr   = withBold.replace(/\n/g, "<br>");
      // Detect URLs and linkify
      const withLinks = withBr.replace(
        /(https?:\/\/[^\s<]+)/g,
        '<a href="$1" style="color:#C9A84C;font-weight:600;">$1</a>'
      );
      return `<p style="margin:0 0 16px;line-height:1.7;">${withLinks}</p>`;
    })
    .join("");

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
</head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:32px 0;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">

        <!-- Header -->
        <tr>
          <td style="background:#0f2d1f;padding:28px 32px;text-align:center;">
            <p style="margin:0 0 4px;font-family:Georgia,serif;font-size:11px;color:rgba(255,255,255,.5);letter-spacing:2px;text-transform:uppercase;">بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ</p>
            <p style="margin:0;font-size:22px;font-weight:700;color:#C9A84C;letter-spacing:0.5px;">Tahleem Academy</p>
            ${classTitle ? `<p style="margin:8px 0 0;font-size:13px;color:rgba(255,255,255,.7);">${classTitle}</p>` : ""}
          </td>
        </tr>

        <!-- Divider -->
        <tr><td style="height:3px;background:linear-gradient(90deg,#C9A84C,#0f2d1f,#C9A84C);"></td></tr>

        <!-- Body -->
        <tr>
          <td style="padding:28px 32px;color:#374151;font-size:15px;">
            ${paragraphs}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#F9FAFB;padding:20px 32px;text-align:center;border-top:1px solid #E5E7EB;">
            <p style="margin:0;font-size:12px;color:#9CA3AF;">
              You received this because you pre-registered for a Tahleem Academy class.<br>
              <span style="font-family:Georgia,serif;">— بارك الله فيكم —</span>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { subject, body_text, class_id, all_contacts } = body;

    if (!subject?.trim())    throw new Error("subject is required");
    if (!body_text?.trim())  throw new Error("body_text is required");
    if (!class_id && !all_contacts) throw new Error("class_id or all_contacts:true is required");

    const fromEmail = Deno.env.get("FROM_EMAIL") || "reminders@tahleemacademy.com";
    const fromName  = Deno.env.get("FROM_NAME")  || "Tahleem Academy";
    const from      = `${fromName} <${fromEmail}>`;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Fetch registrants ──
    let query = supabase
      .from("public_class_registrations")
      .select("id, name, email, class_id, public_classes(title)")
      .not("email", "is", null)
      .neq("email", "");

    if (class_id) {
      query = query.eq("class_id", class_id);
    }

    const { data: rows, error: fetchError } = await query;
    if (fetchError) throw new Error(`DB fetch error: ${fetchError.message}`);

    const registrants = (rows || []) as Array<{
      id: string;
      name: string;
      email: string;
      class_id: string | null;
      public_classes: { title: string } | null;
    }>;

    if (registrants.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, sent: 0, failed: 0, skipped: 0, note: "No registrants with email addresses found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Deduplicate by email (in case someone registered for multiple classes) ──
    const seen    = new Set<string>();
    const targets = all_contacts
      ? registrants.filter(r => { if (seen.has(r.email)) return false; seen.add(r.email); return true; })
      : registrants;

    const classTitle = class_id
      ? (targets[0]?.public_classes?.title ?? undefined)
      : undefined;

    const htmlBody = textToHtml(body_text, classTitle);

    // ── Send in batches of 10 (Resend rate limit: 10/sec on free tier) ──
    let sent    = 0;
    let failed  = 0;
    let skipped = 0;

    const BATCH_SIZE = 10;

    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
      const batch = targets.slice(i, i + BATCH_SIZE);

      await Promise.allSettled(
        batch.map(async (r) => {
          // Basic email validation
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) {
            skipped++;
            console.warn(`[send-guest-email-reminder] Skipping invalid email: ${r.email}`);
            return;
          }

          // Personalise greeting if body starts with "Assalamu Alaikum"
          const personalised = body_text.replace(
            /^(Assalamu Alaikum[,!]?)/i,
            `Assalamu Alaikum, ${r.name}!`
          );
          const personalisedHtml = textToHtml(personalised, classTitle);

          try {
            await sendViaResend({
              from,
              to:      r.email,
              subject,
              text:    personalised,
              html:    personalisedHtml,
            });
            sent++;

            // Log to a reminder_logs table if it exists (best-effort)
            await supabase.from("email_reminder_logs").insert({
              registration_id: r.id,
              class_id:        r.class_id,
              email:           r.email,
              subject,
              sent_at:         new Date().toISOString(),
            }).then(() => {}).catch(() => {}); // ignore if table doesn't exist

          } catch (e: any) {
            failed++;
            console.error(`[send-guest-email-reminder] Failed for ${r.email}:`, e.message);
          }
        })
      );

      // Small delay between batches to respect rate limits
      if (i + BATCH_SIZE < targets.length) {
        await new Promise(res => setTimeout(res, 1100));
      }
    }

    console.log(`[send-guest-email-reminder] Done — sent:${sent} failed:${failed} skipped:${skipped}`);

    return new Response(
      JSON.stringify({ ok: true, sent, failed, skipped, total: targets.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    console.error("[send-guest-email-reminder] Error:", err.message);
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
