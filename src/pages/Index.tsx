// supabase/functions/paystack-webhook/index.ts
// ═══════════════════════════════════════════════════════════════════════════
// C-4 FIX APPLIED — Webhook signature check is now MANDATORY.
//
// VULNERABILITY THAT WAS HERE:
//   if (signature) {          ← if header is absent, entire check was skipped
//     verifySignature(...)    ← attacker sends no header → free payment bypass
//   }
//
// FIX:
//   Signature header is now REQUIRED. A missing or invalid signature returns
//   HTTP 401 immediately — the webhook body is never processed.
//
// All existing payment + Tasjeel logic below is UNCHANGED.
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── HMAC-SHA512 signature verification (Paystack standard) ────────────────
async function verifySignature(
  body: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"]
  );
  const sig  = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const hash = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hash === signature;
}

Deno.serve(async (req) => {
  // ── CORS preflight ────────────────────────────────────────────────────────
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // ── GET — return Paystack public key to frontend ──────────────────────────
  if (req.method === "GET") {
    const publicKey = Deno.env.get("PAYSTACK_PUBLIC_KEY") || "";
    return new Response(JSON.stringify({ publicKey }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── All non-POST methods rejected ─────────────────────────────────────────
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── Read body FIRST (can only be read once) ───────────────────────────────
  const body   = await req.text();
  const secret = Deno.env.get("PAYSTACK_SECRET_KEY") || "";

  // ── C-4 FIX: Signature is now MANDATORY ───────────────────────────────────
  // Previously: `if (signature) { verify() }` — no header = no check = bypass.
  // Now: missing header → 401. Invalid signature → 401. No exceptions.
  const signature = req.headers.get("x-paystack-signature");

  if (!signature) {
    console.warn("[paystack-webhook] Request rejected: missing x-paystack-signature header");
    return new Response(
      JSON.stringify({ error: "Missing signature header" }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  const valid = await verifySignature(body, signature, secret);
  if (!valid) {
    console.warn("[paystack-webhook] Request rejected: signature mismatch");
    return new Response(
      JSON.stringify({ error: "Invalid signature" }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // ── Signature verified — safe to process ─────────────────────────────────
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const event     = JSON.parse(body);
    const eventType = event.event;
    const data      = event.data;

    if (eventType === "charge.success") {
      const reference     = data.reference;
      const transactionId = String(data.id);
      const customerEmail = data.customer?.email || "";
      const amountKobo    = data.amount || 0;   // Paystack always sends in kobo/pesewas
      const currency      = data.currency || "NGN";

      // ── 1. Update payments table ─────────────────────────────────────────
      await supabase
        .from("payments")
        .update({
          status:                  "success",
          paystack_transaction_id: transactionId,
          payment_method:          data.channel || "paystack",
          paid_at:                 new Date().toISOString(),
        })
        .eq("paystack_reference", reference);

      // ── 2. Fetch payment record ───────────────────────────────────────────
      const { data: payment } = await supabase
        .from("payments")
        .select("*, payment_plans(*)")
        .eq("paystack_reference", reference)
        .single();

      if (payment) {
        // ── 3. Update enrollment status ──────────────────────────────────────
        await supabase
          .from("enrollments")
          .update({
            status:  "active",
            paid_at: new Date().toISOString(),
          })
          .eq("user_id", payment.user_id);

        // ── 4. Advance Tasjeel step ───────────────────────────────────────────
        // Idempotent — only advances if user is on 'payment' or 'enrollment' step
        // and payment has not already been recorded. Safe for webhook replays.
        await advanceTasjeelAfterPayment(supabase, payment.user_id, {
          payment_ref:      reference,
          payment_amount:   amountKobo / 100,
          payment_currency: currency,
        });

        // ── 5. Mark payment_history row as success ────────────────────────────
        await supabase
          .from("payment_history" as any)
          .update({ status: "success" })
          .eq("payment_ref", reference);

      } else {
        // ── Fallback: no payments row found — resolve user by email ───────────
        // This handles cases where the frontend didn't pre-create a payments row.
        console.warn(
          `[paystack-webhook] No payments row for reference=${reference}, falling back to email lookup`
        );

        const { data: profile } = await supabase
          .from("profiles")
          .select("user_id")
          .eq("email", customerEmail)
          .maybeSingle();

        if (profile?.user_id) {
          await advanceTasjeelAfterPayment(supabase, profile.user_id, {
            payment_ref:      reference,
            payment_amount:   amountKobo / 100,
            payment_currency: currency,
          });
        } else {
          console.error(
            `[paystack-webhook] Could not resolve user for reference=${reference}, email=${customerEmail}`
          );
        }
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[paystack-webhook] Processing error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Advance Tasjeel pipeline from 'payment'/'enrollment' → next step
//
// Idempotency guarantees:
//   • Only advances if current_step is 'payment' or 'enrollment'
//   • Only advances if payment_status is NOT already 'paid'
//   • Uses upsert with onConflict so replaying the webhook is safe
// ─────────────────────────────────────────────────────────────────────────────
async function advanceTasjeelAfterPayment(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  paymentMeta: {
    payment_ref:      string;
    payment_amount:   number;
    payment_currency: string;
  }
) {
  // Read current state
  const { data: currentProgress } = await supabase
    .from("tasjeel_progress")
    .select("current_step, payment_status")
    .eq("user_id", userId)
    .single();

  // Only process if user is at the payment/enrollment step
  const advanceable = ["payment", "enrollment"].includes(
    currentProgress?.current_step ?? ""
  );

  // Skip if payment already recorded (duplicate webhook protection)
  const alreadyPaid = currentProgress?.payment_status === "paid";

  if (!advanceable || alreadyPaid) {
    console.info(
      `[Tasjeel] Skipping advance for user=${userId} — ` +
      `step=${currentProgress?.current_step}, alreadyPaid=${alreadyPaid}`
    );
    return;
  }

  // Read admin settings to determine which step comes after payment
  const { data: settings } = await supabase
    .from("academy_settings")
    .select("key, value")
    .in("key", ["onboarding_required", "entrance_exam_required"]);

  const settingsMap: Record<string, string> = {};
  (settings ?? []).forEach((r: any) => { settingsMap[r.key] = r.value; });

  // Determine next step
  let nextStep = "onboarding";
  if (settingsMap["onboarding_required"] === "false") {
    nextStep = settingsMap["entrance_exam_required"] !== "false" ? "exam" : "completed";
  }

  const now = new Date().toISOString();

  const { error } = await supabase
    .from("tasjeel_progress")
    .upsert(
      {
        user_id:          userId,
        current_step:     nextStep,
        payment_ref:      paymentMeta.payment_ref,
        payment_status:   "paid",
        payment_amount:   paymentMeta.payment_amount,
        payment_currency: paymentMeta.payment_currency,
        payment_paid_at:  now,
        updated_at:       now,
        ...(nextStep === "completed" ? { completed_at: now } : {}),
      },
      { onConflict: "user_id" }
    );

  if (error) {
    console.error("[Tasjeel] advanceTasjeelAfterPayment error:", error);
  } else {
    console.info(
      `[Tasjeel] User ${userId} advanced to step="${nextStep}" ` +
      `after payment ref=${paymentMeta.payment_ref}`
    );
  }
}
