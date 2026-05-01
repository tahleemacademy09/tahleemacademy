// supabase/functions/paystack-webhook/index.ts
// ═══════════════════════════════════════════════════════════════════════════
// MODIFIED: Added Tasjeel step advancement on charge.success
// Existing payment logic is PRESERVED unchanged.
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  // Paystack's server-side webhook calls come with no browser Origin header,
  // so this header is only evaluated by browsers (for admin UIs calling the endpoint).
  // We restrict it to our production domain for safety.
  "Access-Control-Allow-Origin": "https://tahleemacademy.vercel.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const hash = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hash === signature;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // GET request returns public key for frontend
  if (req.method === "GET") {
    const publicKey = Deno.env.get("PAYSTACK_PUBLIC_KEY") || "";
    return new Response(JSON.stringify({ publicKey }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.text();
    const signature = req.headers.get("x-paystack-signature") || "";
    const secret = Deno.env.get("PAYSTACK_SECRET_KEY") || "";

    // Verify webhook signature — REQUIRED, never optional
    if (!signature) {
      return new Response(JSON.stringify({ error: "Missing x-paystack-signature header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const valid = await verifySignature(body, signature, secret);
    if (!valid) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const event     = JSON.parse(body);
    const eventType = event.event;
    const data      = event.data;

    if (eventType === "charge.success") {
      const reference     = data.reference;
      const transactionId = String(data.id);
      const customerEmail = data.customer?.email || "";
      const amountKobo    = data.amount || 0;     // Paystack sends in kobo/pesewas
      const currency      = data.currency || "NGN";

      // ── 1. Update payments table (EXISTING LOGIC — UNCHANGED) ──────────
      await supabase
        .from("payments")
        .update({
          status:                  "success",
          paystack_transaction_id: transactionId,
          payment_method:          data.channel || "paystack",
          paid_at:                 new Date().toISOString(),
        })
        .eq("paystack_reference", reference);

      // Get payment record (EXISTING LOGIC — UNCHANGED)
      const { data: payment } = await supabase
        .from("payments")
        .select("*, payment_plans(*)")
        .eq("paystack_reference", reference)
        .single();

      if (payment) {
        // Update enrollment status (EXISTING LOGIC — UNCHANGED)
        await supabase
          .from("enrollments")
          .update({
            status:   "active",
            paid_at:  new Date().toISOString(),
          })
          .eq("user_id", payment.user_id);

        // ── 1b. Update profiles.payment_status + subscription_end_date ────
        // Authoritative server-side update so usePaymentAccess always reflects
        // payment even if the browser tab was closed before the client callback.
        const subEnd = new Date();
        subEnd.setFullYear(subEnd.getFullYear() + 1); // 1-year subscription
        await supabase
          .from("profiles")
          .update({
            payment_status:        "paid",
            subscription_end_date: subEnd.toISOString().split("T")[0],
          })
          .eq("user_id", payment.user_id);

        // ── 2. Advance Tasjeel step (NEW — TASJEEL INTEGRATION) ──────────
        //
        // Idempotent: only advance if currently on 'payment' step.
        // This prevents double-processing from duplicate webhook calls.
        //
        await advanceTasjeelAfterPayment(supabase, payment.user_id, {
          payment_ref:      reference,
          payment_amount:   amountKobo / 100,   // convert to main currency unit
          payment_currency: currency,
        });
      } else {
        // ── Fallback: resolve user by email, still advance Tasjeel ────────
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
        }
      }

      // ── 3. Update payment_history table (EXISTING LOGIC — UNCHANGED) ───
      if (payment?.user_id) {
        await supabase
          .from("payment_history" as any)
          .update({ status: "success" })
          .eq("payment_ref", reference);
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[paystack-webhook] Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────
// TASJEEL: Advance from 'payment' → 'onboarding' after successful payment
// ─────────────────────────────────────────────────────────────────────────
async function advanceTasjeelAfterPayment(
  supabase: any,
  userId: string,
  paymentMeta: {
    payment_ref: string;
    payment_amount: number;
    payment_currency: string;
  }
) {
  // Fetch current step first to ensure idempotency
  const { data: currentProgress } = await supabase
    .from("tasjeel_progress")
    .select("current_step, payment_status")
    .eq("user_id", userId)
    .single();

  // Only advance if user is on the payment step (or enrollment — in case
  // webhook fires before frontend sets step to 'payment')
  const advanceable = ["payment", "enrollment"].includes(
    currentProgress?.current_step ?? ""
  );

  // Also skip if payment was already recorded (duplicate webhook protection)
  const alreadyPaid = currentProgress?.payment_status === "paid";

  if (!advanceable || alreadyPaid) {
    console.info(
      `[Tasjeel] Skipping step advance for user=${userId}, ` +
        `step=${currentProgress?.current_step}, paid=${alreadyPaid}`
    );
    return;
  }

  // Read registration settings to determine next step
  const { data: settings } = await supabase
    .from("academy_settings")
    .select("key, value")
    .in("key", ["onboarding_required", "entrance_exam_required"]);

  const settingsMap: Record<string, string> = {};
  (settings ?? []).forEach((r: any) => { settingsMap[r.key] = r.value; });

  // Determine next step based on admin config
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
      `[Tasjeel] User ${userId} advanced to step="${nextStep}" after payment ref=${paymentMeta.payment_ref}`
    );
  }
}
