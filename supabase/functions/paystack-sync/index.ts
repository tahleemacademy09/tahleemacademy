// supabase/functions/paystack-sync/index.ts
// ═══════════════════════════════════════════════════════════════════════════
// Admin-triggered backfill: verifies every pending/unmatched payment against
// the Paystack API and applies the same logic as the webhook handler.
//
// Called by the admin via: POST /functions/v1/paystack-sync
// Secured by: Supabase anon key + admin role check via JWT
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://tahleemacademy.vercel.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Verify a single Paystack reference ───────────────────────────────────────

async function verifyPaystackReference(
  reference: string,
  secretKey: string
): Promise<{ verified: boolean; data?: any }> {
  try {
    const res = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${secretKey}` } }
    );
    if (!res.ok) return { verified: false };
    const json = await res.json();
    if (!json.status || json.data?.status !== "success") return { verified: false };
    return { verified: true, data: json.data };
  } catch {
    return { verified: false };
  }
}

// ── Apply confirmed payment to DB (mirrors paystack-webhook logic) ────────────

async function applyConfirmedPayment(
  supabase: any,
  paymentRow: any,
  paystackData: any
): Promise<void> {
  const transactionId = String(paystackData.id);
  const amountKobo    = paystackData.amount || 0;
  const currency      = paystackData.currency || "NGN";

  // 1. Mark payment as success
  await supabase
    .from("payments")
    .update({
      status:                  "success",
      paystack_transaction_id: transactionId,
      payment_method:          paystackData.channel || "paystack",
      paid_at:                 paystackData.paid_at || new Date().toISOString(),
    })
    .eq("id", paymentRow.id);

  // 2. Activate enrollment
  await supabase
    .from("enrollments")
    .update({ status: "active", paid_at: new Date().toISOString() })
    .eq("user_id", paymentRow.student_id);

  // 3. Update profiles.payment_status + subscription_end_date
  const planDurationMonths = paymentRow.payment_plans?.duration_months || 1;

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("subscription_end_date, payment_status")
    .eq("user_id", paymentRow.student_id)
    .single();

  const baseDate =
    currentProfile?.subscription_end_date &&
    currentProfile.payment_status === "paid" &&
    new Date(currentProfile.subscription_end_date) > new Date()
      ? new Date(currentProfile.subscription_end_date)
      : new Date();

  const subEnd = new Date(baseDate);
  subEnd.setMonth(subEnd.getMonth() + planDurationMonths);

  await supabase
    .from("profiles")
    .update({
      payment_status:        "paid",
      subscription_end_date: subEnd.toISOString().split("T")[0],
    })
    .eq("user_id", paymentRow.student_id);

  // 4. Upsert student_subscriptions
  const { data: existingSub } = await supabase
    .from("student_subscriptions")
    .select("id, end_date, status")
    .eq("student_id", paymentRow.student_id)
    .eq("status", "active")
    .maybeSingle();

  if (existingSub) {
    const extendBase =
      existingSub.end_date && new Date(existingSub.end_date) > new Date()
        ? new Date(existingSub.end_date)
        : new Date();
    const extendEnd = new Date(extendBase);
    extendEnd.setMonth(extendEnd.getMonth() + planDurationMonths);
    await supabase
      .from("student_subscriptions")
      .update({ end_date: extendEnd.toISOString().split("T")[0], status: "active" })
      .eq("id", existingSub.id);
  } else {
    await supabase.from("student_subscriptions").insert({
      student_id: paymentRow.student_id,
      plan_id:    paymentRow.plan_id,
      status:     "active",
      start_date: new Date().toISOString().split("T")[0],
      end_date:   subEnd.toISOString().split("T")[0],
    });
  }

  // 5. Advance tasjeel step if stuck on payment/enrollment
  const { data: tasjeelRow } = await supabase
    .from("tasjeel_progress")
    .select("current_step, payment_status")
    .eq("user_id", paymentRow.student_id)
    .maybeSingle();

  const advanceable = ["payment", "enrollment"].includes(tasjeelRow?.current_step ?? "");
  const alreadyPaid = tasjeelRow?.payment_status === "paid";

  if (advanceable && !alreadyPaid) {
    const { data: settings } = await supabase
      .from("academy_settings")
      .select("key, value")
      .in("key", ["onboarding_required", "entrance_exam_required"]);

    const sm: Record<string, string> = {};
    (settings ?? []).forEach((r: any) => { sm[r.key] = r.value; });

    let nextStep = "onboarding";
    if (sm["onboarding_required"] === "false") {
      nextStep = sm["entrance_exam_required"] !== "false" ? "exam" : "completed";
    }

    const now = new Date().toISOString();
    await supabase.from("tasjeel_progress").upsert(
      {
        user_id:          paymentRow.student_id,
        current_step:     nextStep,
        payment_ref:      paymentRow.paystack_reference,
        payment_status:   "paid",
        payment_amount:   amountKobo / 100,
        payment_currency: currency,
        payment_paid_at:  now,
        updated_at:       now,
        ...(nextStep === "completed" ? { completed_at: now } : {}),
      },
      { onConflict: "user_id" }
    );
  }

  // 6. Upsert payment_history
  const { data: existingHist } = await supabase
    .from("payment_history")
    .select("id")
    .eq("payment_ref", paymentRow.paystack_reference)
    .maybeSingle();

  if (existingHist) {
    await supabase
      .from("payment_history")
      .update({ status: "success" })
      .eq("payment_ref", paymentRow.paystack_reference);
  } else {
    await supabase.from("payment_history").insert({
      user_id:      paymentRow.student_id,
      amount:       Math.round(amountKobo / 100),
      status:       "success",
      payment_type: "subscription",
      payment_ref:  paymentRow.paystack_reference,
      receipt_id:   `RCPT-${paymentRow.paystack_reference}`,
      paid_at:      new Date().toISOString(),
    });
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const secretKey = Deno.env.get("PAYSTACK_SECRET_KEY") || "";
  if (!secretKey) {
    return new Response(JSON.stringify({ error: "PAYSTACK_SECRET_KEY not set" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Admin-only: use service role for full DB access
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Verify caller is an admin via their JWT
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace("Bearer ", "");
  if (token) {
    const { data: { user } } = await supabase.auth.getUser(token);
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", user?.id ?? "")
      .maybeSingle();
    if (profile?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  try {
    // Fetch all non-success payments that have a Paystack reference
    const { data: pendingPayments, error } = await supabase
      .from("payments")
      .select("*, payment_plans(*)")
      .not("status", "eq", "success")
      .not("paystack_reference", "is", null)
      .not("paystack_reference", "like", "TAH-MANUAL-%"); // skip manual entries

    if (error) throw error;

    const results = {
      total:    (pendingPayments ?? []).length,
      synced:   0,
      failed:   0,
      skipped:  0,
      details:  [] as any[],
    };

    for (const payment of (pendingPayments ?? []) as any[]) {
      const ref = payment.paystack_reference;
      if (!ref) { results.skipped++; continue; }

      const { verified, data: psData } = await verifyPaystackReference(ref, secretKey);

      if (verified && psData) {
        await applyConfirmedPayment(supabase, payment, psData);
        results.synced++;
        results.details.push({ ref, student_id: payment.student_id, status: "synced" });
        console.log(`[paystack-sync] ✅ synced ref=${ref} student=${payment.student_id}`);
      } else {
        results.failed++;
        results.details.push({ ref, student_id: payment.student_id, status: "not_confirmed_by_paystack" });
        console.log(`[paystack-sync] ⚠️ not confirmed ref=${ref}`);
      }

      // Small delay to avoid Paystack rate limits
      await new Promise(r => setTimeout(r, 150));
    }

    console.log("[paystack-sync] done", results);
    return new Response(JSON.stringify({ ok: true, ...results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[paystack-sync] fatal:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
