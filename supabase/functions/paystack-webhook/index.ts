// supabase/functions/paystack-webhook/index.ts

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "https://tahleemacademy.vercel.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function verifySignature(body: string, signature: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret),
    { name: "HMAC", hash: "SHA-512" }, false, ["sign"]
  );
  const sig  = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const hash = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
  return hash === signature;
}

// ─── Core: apply a confirmed payment to all relevant DB tables ────────────────
async function applySuccessfulPayment(
  supabase: any,
  studentId: string,
  planId: string | null,
  reference: string,
  transactionId: string,
  amountKobo: number,
  currency: string,
  channel: string,
) {
  const amountMain = amountKobo / 100;
  const now        = new Date().toISOString();

  // 1. Upsert the payments row (insert if missing, update if pending)
  const { data: existingPay } = await supabase
    .from("payments")
    .select("id, status")
    .eq("paystack_reference", reference)
    .maybeSingle();

  if (existingPay) {
    if (existingPay.status !== "success") {
      await supabase.from("payments").update({
        status:                  "success",
        paystack_transaction_id: transactionId,
        payment_method:          channel || "paystack",
        paid_at:                 now,
      }).eq("id", existingPay.id);
    }
  } else {
    // No row at all — insert fresh (webhook fired before/without frontend callback)
    const { error: insertErr } = await supabase.from("payments").insert({
      student_id:              studentId,
      plan_id:                 planId,
      amount:                  amountMain,
      currency,
      status:                  "success",
      type:                    "subscription",
      paystack_reference:      reference,
      paystack_transaction_id: transactionId,
      payment_method:          channel || "paystack",
      paid_at:                 now,
    });
    if (insertErr) console.error("[webhook] payments insert error:", insertErr.message);
  }

  // 2. Resolve plan duration
  let durationMonths = 1;
  if (planId) {
    const { data: plan } = await supabase
      .from("payment_plans")
      .select("duration_months")
      .eq("id", planId)
      .maybeSingle();
    durationMonths = plan?.duration_months || 1;
  }

  // 3. Update profiles.payment_status and subscription_end_date
  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("subscription_end_date, payment_status")
    .eq("user_id", studentId)
    .maybeSingle();

  const baseDate =
    currentProfile?.subscription_end_date &&
    currentProfile.payment_status === "paid" &&
    new Date(currentProfile.subscription_end_date) > new Date()
      ? new Date(currentProfile.subscription_end_date)
      : new Date();

  const subEnd = new Date(baseDate);
  subEnd.setMonth(subEnd.getMonth() + durationMonths);
  const subEndStr = subEnd.toISOString().split("T")[0];

  const { error: profErr } = await supabase
    .from("profiles")
    .update({
      payment_status:        "paid",
      subscription_end_date: subEndStr,
    })
    .eq("user_id", studentId);
  if (profErr) console.error("[webhook] profiles update error:", profErr.message);
  else console.log(`[webhook] ✅ profiles updated for student=${studentId} until ${subEndStr}`);

  // 4. Upsert enrollments → active
  await supabase
    .from("enrollments")
    .update({ status: "active", paid_at: now })
    .eq("user_id", studentId);

  // 5. Upsert student_subscriptions
  const { data: existingSub } = await supabase
    .from("student_subscriptions")
    .select("id, end_date, status")
    .eq("student_id", studentId)
    .eq("status", "active")
    .maybeSingle();

  if (existingSub) {
    const extBase = existingSub.end_date && new Date(existingSub.end_date) > new Date()
      ? new Date(existingSub.end_date) : new Date();
    const extEnd = new Date(extBase);
    extEnd.setMonth(extEnd.getMonth() + durationMonths);
    await supabase.from("student_subscriptions")
      .update({ end_date: extEnd.toISOString().split("T")[0], status: "active" })
      .eq("id", existingSub.id);
  } else {
    await supabase.from("student_subscriptions").insert({
      student_id: studentId,
      plan_id:    planId,
      status:     "active",
      start_date: now.split("T")[0],
      end_date:   subEndStr,
    });
  }

  // 6. Upsert payment_history
  const { data: existingHist } = await supabase
    .from("payment_history")
    .select("id")
    .eq("payment_ref", reference)
    .maybeSingle();
  if (existingHist) {
    await supabase.from("payment_history").update({ status: "success" }).eq("payment_ref", reference);
  } else {
    await supabase.from("payment_history").insert({
      user_id:      studentId,
      amount:       Math.round(amountMain),
      status:       "success",
      payment_type: "subscription",
      payment_ref:  reference,
      receipt_id:   `RCPT-${reference}`,
      paid_at:      now,
    });
  }

  // 7. Advance tasjeel step
  await advanceTasjeel(supabase, studentId, reference, amountMain, currency);
}

// ─── Tasjeel step advancement ─────────────────────────────────────────────────
async function advanceTasjeel(
  supabase: any, userId: string,
  ref: string, amount: number, currency: string,
) {
  const { data: tj } = await supabase
    .from("tasjeel_progress")
    .select("current_step, payment_status")
    .eq("user_id", userId)
    .maybeSingle();

  const advanceable = ["payment", "enrollment"].includes(tj?.current_step ?? "");
  if (!advanceable || tj?.payment_status === "paid") return;

  const { data: settings } = await supabase
    .from("academy_settings").select("key, value")
    .in("key", ["onboarding_required", "entrance_exam_required"]);
  const sm: Record<string, string> = {};
  (settings ?? []).forEach((r: any) => { sm[r.key] = r.value; });

  let nextStep = "onboarding";
  if (sm["onboarding_required"] === "false") {
    nextStep = sm["entrance_exam_required"] !== "false" ? "exam" : "completed";
  }
  const now = new Date().toISOString();
  await supabase.from("tasjeel_progress").upsert({
    user_id: userId, current_step: nextStep,
    payment_ref: ref, payment_status: "paid",
    payment_amount: amount, payment_currency: currency,
    payment_paid_at: now, updated_at: now,
    ...(nextStep === "completed" ? { completed_at: now } : {}),
  }, { onConflict: "user_id" });
}

// ─── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // GET → return public key for frontend
  if (req.method === "GET") {
    const publicKey = Deno.env.get("PAYSTACK_PUBLIC_KEY") || "";
    return new Response(JSON.stringify({ publicKey }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body      = await req.text();
    const signature = req.headers.get("x-paystack-signature") || "";
    const secret    = Deno.env.get("PAYSTACK_SECRET_KEY") || "";

    // Signature verification
    if (secret && signature) {
      const valid = await verifySignature(body, signature, secret);
      if (!valid) {
        console.error("[webhook] Invalid signature");
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else if (!secret) {
      console.warn("[webhook] PAYSTACK_SECRET_KEY not set — skipping signature check");
    }

    const event     = JSON.parse(body);
    const eventType = event.event;
    const data      = event.data;

    console.log(`[webhook] received event=${eventType} ref=${data?.reference}`);

    if (eventType === "charge.success") {
      const reference     = data.reference;
      const transactionId = String(data.id);
      const customerEmail = data.customer?.email?.toLowerCase() || "";
      const amountKobo    = data.amount || 0;
      const currency      = data.currency || "NGN";
      const channel       = data.channel || "paystack";

      // ── Resolve student_id ───────────────────────────────────────────────
      // Priority: metadata.user_id → metadata.custom_fields → existing payments row → email lookup
      const meta       = data.metadata || {};
      let studentId: string | null =
        meta.user_id ||
        meta.custom_fields?.find((f: any) => f.variable_name === "user_id")?.value ||
        null;

      // Plan from metadata
      let planId: string | null =
        meta.plan_id ||
        meta.custom_fields?.find((f: any) => f.variable_name === "plan_id")?.value ||
        null;

      // If metadata didn't have user_id, try the payments table
      if (!studentId) {
        const { data: existingPay } = await supabase
          .from("payments")
          .select("student_id, plan_id")
          .eq("paystack_reference", reference)
          .maybeSingle();
        if (existingPay?.student_id) {
          studentId = existingPay.student_id;
          if (!planId) planId = existingPay.plan_id;
        }
      }

      // Last resort: look up by email
      if (!studentId && customerEmail) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("user_id")
          .eq("email", customerEmail)
          .maybeSingle();
        if (prof?.user_id) studentId = prof.user_id;
      }

      // If plan still unknown, try matching by amount
      if (!planId) {
        const { data: matchPlan } = await supabase
          .from("payment_plans")
          .select("id")
          .eq("amount", Math.round(amountKobo / 100))
          .eq("is_active", true)
          .maybeSingle();
        if (matchPlan?.id) planId = matchPlan.id;
      }

      if (!studentId) {
        console.error(`[webhook] Cannot resolve student for ref=${reference} email=${customerEmail}`);
        // Still return 200 so Paystack doesn't keep retrying
        return new Response(JSON.stringify({ received: true, warning: "student not found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`[webhook] Processing ref=${reference} student=${studentId} plan=${planId}`);

      await applySuccessfulPayment(
        supabase, studentId, planId,
        reference, transactionId, amountKobo, currency, channel,
      );

      console.log(`[webhook] ✅ Done ref=${reference}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[webhook] Fatal error:", err?.message);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
