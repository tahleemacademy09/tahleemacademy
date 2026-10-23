// supabase/functions/paystack-verify/index.ts
//
// Called by the frontend right after Paystack's inline checkout fires its
// `callback`. Verifies the transaction against Paystack's server using the
// secret key, then applies it through the same idempotent path as the webhook.
//
// Two kinds of payment:
//   - registration fee (metadata.type === "registration" or ref TAH-REG-*):
//       records payment + moves tasjeel_progress forward. No subscription.
//   - subscription/enrollment plans: original behaviour, unchanged.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { applyRegistrationPayment, getRegistrationFeeKobo, isRegistrationPayment } from "./registration.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "https://tahleemacademy.vercel.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const PAYSTACK_BASE = "https://api.paystack.co";

// ─── Subscription payments (unchanged from the previously deployed version) ───
async function applySuccessfulPayment(
  supabase: any, studentId: string, planId: string | null, reference: string,
  transactionId: string, amountKobo: number, currency: string, channel: string,
): Promise<{ alreadyProcessed: boolean }> {
  const amountMain = amountKobo / 100;
  const now = new Date().toISOString();

  const { data: existingPay } = await supabase
    .from("payments").select("id, status").eq("paystack_reference", reference).maybeSingle();

  if (existingPay) {
    if (existingPay.status === "success") return { alreadyProcessed: true };
    await supabase.from("payments").update({
      status: "success", paystack_transaction_id: transactionId,
      payment_method: channel || "paystack", paid_at: now,
    }).eq("id", existingPay.id);
  } else {
    const { error: insertErr } = await supabase.from("payments").insert({
      student_id: studentId, plan_id: planId, amount: amountMain, currency, status: "success",
      type: "subscription", paystack_reference: reference, paystack_transaction_id: transactionId,
      payment_method: channel || "paystack", paid_at: now,
    });
    if (insertErr) throw new Error(`payments insert failed: ${insertErr.message}`);
  }

  let durationMonths = 1;
  if (planId) {
    const { data: plan } = await supabase
      .from("payment_plans").select("duration_months").eq("id", planId).maybeSingle();
    durationMonths = plan?.duration_months || 1;
  }

  const { data: currentProfile } = await supabase
    .from("profiles").select("subscription_end_date, payment_status").eq("user_id", studentId).maybeSingle();

  const baseDate =
    currentProfile?.subscription_end_date &&
    currentProfile.payment_status === "paid" &&
    new Date(currentProfile.subscription_end_date) > new Date()
      ? new Date(currentProfile.subscription_end_date) : new Date();

  const subEnd = new Date(baseDate);
  subEnd.setMonth(subEnd.getMonth() + durationMonths);
  const subEndStr = subEnd.toISOString().split("T")[0];

  await supabase.from("profiles").update({
    payment_status: "paid", subscription_end_date: subEndStr,
  }).eq("user_id", studentId);

  await supabase.from("enrollments").update({ status: "active", paid_at: now }).eq("user_id", studentId);

  const { data: existingSub } = await supabase
    .from("student_subscriptions").select("id, end_date, status")
    .eq("student_id", studentId).eq("status", "active").maybeSingle();

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
      student_id: studentId, plan_id: planId, status: "active",
      start_date: now.split("T")[0], end_date: subEndStr,
    });
  }

  const { data: existingHist } = await supabase
    .from("payment_history").select("id").eq("payment_ref", reference).maybeSingle();
  if (existingHist) {
    await supabase.from("payment_history").update({ status: "success" }).eq("payment_ref", reference);
  } else {
    await supabase.from("payment_history").insert({
      user_id: studentId, amount: Math.round(amountMain), status: "success",
      payment_type: "subscription", payment_ref: reference,
      receipt_id: `RCPT-${reference}`, paid_at: now,
    });
  }

  await advanceTasjeel(supabase, studentId, reference, amountMain, currency);
  return { alreadyProcessed: false };
}

async function advanceTasjeel(supabase: any, userId: string, ref: string, amount: number, currency: string) {
  const { data: tj } = await supabase
    .from("tasjeel_progress").select("current_step, payment_status").eq("user_id", userId).maybeSingle();

  const advanceable = ["payment", "enrollment"].includes(tj?.current_step ?? "");
  if (!advanceable || tj?.payment_status === "paid") return;

  const { data: settings } = await supabase
    .from("academy_settings").select("key, value").in("key", ["onboarding_required", "entrance_exam_required"]);
  const sm: Record<string, string> = {};
  (settings ?? []).forEach((r: any) => { sm[r.key] = r.value; });

  let nextStep = "onboarding";
  if (sm["onboarding_required"] === "false") {
    nextStep = sm["entrance_exam_required"] !== "false" ? "exam" : "completed";
  }
  const now = new Date().toISOString();
  await supabase.from("tasjeel_progress").upsert({
    user_id: userId, current_step: nextStep, payment_ref: ref, payment_status: "paid",
    payment_amount: amount, payment_currency: currency, payment_paid_at: now, updated_at: now,
    ...(nextStep === "completed" ? { completed_at: now } : {}),
  }, { onConflict: "user_id" });
}

// ─── Main handler ───────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const secretKey = Deno.env.get("PAYSTACK_SECRET_KEY") || "";
  if (!secretKey) return json({ error: "PAYSTACK_SECRET_KEY not set" }, 500);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return json({ error: "Not authenticated" }, 401);

  try {
    const { reference } = await req.json();
    if (!reference || typeof reference !== "string") return json({ error: "reference is required" }, 400);

    // Ask Paystack — never trust client-supplied status/amount.
    const verifyRes = await fetch(
      `${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${secretKey}` } },
    );
    const verifyJson = await verifyRes.json();

    if (!verifyRes.ok || !verifyJson?.status || verifyJson?.data?.status !== "success") {
      console.warn(`[verify] ref=${reference} not successful per Paystack:`, verifyJson?.data?.status);
      return json({
        ok: false, error: "Payment not confirmed by Paystack",
        paystack_status: verifyJson?.data?.status ?? "unknown",
      }, 402);
    }

    const txn = verifyJson.data;
    const meta = txn.metadata || {};
    const metaUserId: string | null =
      meta.user_id ||
      meta.custom_fields?.find((f: any) => f.variable_name === "user_id")?.value || null;

    // Registration payments: the paying email must match the caller if no user_id in metadata.
    if (metaUserId && metaUserId !== user.id) {
      console.error(`[verify] ref=${reference} metadata user=${metaUserId} does not match caller=${user.id}`);
      return json({ error: "Reference does not belong to this account" }, 403);
    }
    const customerEmail = String(txn.customer?.email || "").toLowerCase();
    if (isRegistrationPayment(reference, meta) && !metaUserId && customerEmail && user.email
        && customerEmail !== user.email.toLowerCase()) {
      console.error(`[verify] ref=${reference} email ${customerEmail} does not match caller`);
      return json({ error: "Reference does not belong to this account" }, 403);
    }

    const studentId = metaUserId || user.id;
    const amountKobo = txn.amount || 0;
    const currency = txn.currency || "NGN";
    const channel = txn.channel || "paystack";

    if (isRegistrationPayment(reference, meta)) {
      const feeKobo = await getRegistrationFeeKobo(supabase);
      if (feeKobo && amountKobo < feeKobo) {
        console.error(`[verify] Registration ref=${reference} underpaid: ${amountKobo} < ${feeKobo}`);
        return json({ ok: false, error: "Amount paid is less than the registration fee" }, 402);
      }
      const r = await applyRegistrationPayment(
        supabase, studentId, reference, String(txn.id), amountKobo, currency, channel);
      return json({
        ok: true, kind: "registration", already_processed: r.alreadyProcessed,
        reference, amount: amountKobo / 100, next_step: r.nextStep,
      });
    }

    const planId: string | null =
      meta.plan_id || meta.custom_fields?.find((f: any) => f.variable_name === "plan_id")?.value || null;

    const result = await applySuccessfulPayment(
      supabase, studentId, planId, reference, String(txn.id), amountKobo, currency, channel);

    const { data: profile } = await supabase
      .from("profiles").select("payment_status, subscription_end_date").eq("user_id", studentId).maybeSingle();

    return json({
      ok: true, already_processed: result.alreadyProcessed, reference,
      amount: amountKobo / 100, subscription_end_date: profile?.subscription_end_date ?? null,
    });
  } catch (err: any) {
    console.error("[verify] Fatal error:", err?.message);
    return json({ error: err?.message || "Internal server error" }, 500);
  }
});
