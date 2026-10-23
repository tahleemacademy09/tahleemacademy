// supabase/functions/paystack-sync/index.ts  v2
// ═══════════════════════════════════════════════════════════════════════════
// Two-pass sync:
//   Pass 1 — verify existing payments table rows that are NOT "success"
//   Pass 2 — fetch recent Paystack transactions and backfill any that are
//             missing from the payments table entirely (callback never fired)
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://tahleemacademy.vercel.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PAYSTACK_BASE = "https://api.paystack.co";

// ── Paystack helpers ──────────────────────────────────────────────────────────

async function paystackGet(path: string, secretKey: string): Promise<any> {
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.status ? json.data : null;
}

async function verifyReference(ref: string, secretKey: string): Promise<any | null> {
  const data = await paystackGet(`/transaction/verify/${encodeURIComponent(ref)}`, secretKey);
  return data?.status === "success" ? data : null;
}

// Fetch all successful transactions from Paystack (paginated, last 500)
async function fetchRecentSuccessful(secretKey: string): Promise<any[]> {
  const results: any[] = [];
  let page = 1;
  while (page <= 5) { // max 5 pages × 100 = 500 transactions
    const data = await paystackGet(
      `/transaction?status=success&perPage=100&page=${page}`,
      secretKey
    );
    if (!data || !Array.isArray(data) || data.length === 0) break;
    results.push(...data);
    if (data.length < 100) break;
    page++;
  }
  return results;
}

// ── Apply confirmed payment to DB ─────────────────────────────────────────────

async function applyPayment(
  supabase: any,
  studentId: string,
  planId: string | null,
  psData: any,
  currency: string
): Promise<void> {
  const transactionId      = String(psData.id);
  const ref                = psData.reference;
  const amountKobo         = psData.amount || 0;
  const amountMain         = amountKobo / 100;
  const paidAt             = psData.paid_at || new Date().toISOString();

  // 1. Upsert into payments table (insert if missing, update if pending)
  const { data: existing } = await supabase
    .from("payments")
    .select("id, status")
    .eq("paystack_reference", ref)
    .maybeSingle();

  if (existing) {
    if (existing.status !== "success") {
      await supabase.from("payments").update({
        status: "success",
        paystack_transaction_id: transactionId,
        payment_method: psData.channel || "paystack",
        paid_at: paidAt,
      }).eq("id", existing.id);
    }
    // Already success — skip rest (idempotent)
    if (existing.status === "success") return;
  } else {
    // No row at all — insert fresh
    await supabase.from("payments").insert({
      student_id: studentId,
      plan_id:    planId,
      amount:     amountMain,
      status:     "success",
      type:       "subscription",
      paystack_reference:      ref,
      paystack_transaction_id: transactionId,
      payment_method: psData.channel || "paystack",
      paid_at:    paidAt,
      currency,
    });
  }

  // 2. Activate enrollment
  await supabase
    .from("enrollments")
    .update({ status: "active", paid_at: paidAt })
    .eq("user_id", studentId);

  // 3. Update profiles
  const { data: plan } = planId
    ? await supabase.from("payment_plans").select("duration_months").eq("id", planId).maybeSingle()
    : { data: null };
  const durationMonths = plan?.duration_months || 1;

  const { data: prof } = await supabase
    .from("profiles")
    .select("subscription_end_date, payment_status")
    .eq("user_id", studentId)
    .single();

  const baseDate =
    prof?.subscription_end_date &&
    prof.payment_status === "paid" &&
    new Date(prof.subscription_end_date) > new Date()
      ? new Date(prof.subscription_end_date)
      : new Date();

  const subEnd = new Date(baseDate);
  subEnd.setMonth(subEnd.getMonth() + durationMonths);

  await supabase.from("profiles").update({
    payment_status:        "paid",
    subscription_end_date: subEnd.toISOString().split("T")[0],
  }).eq("user_id", studentId);

  // 4. Upsert student_subscriptions
  const { data: existingSub } = await supabase
    .from("student_subscriptions")
    .select("id, end_date, status")
    .eq("student_id", studentId)
    .eq("status", "active")
    .maybeSingle();

  if (existingSub) {
    const extendBase =
      existingSub.end_date && new Date(existingSub.end_date) > new Date()
        ? new Date(existingSub.end_date)
        : new Date();
    const extendEnd = new Date(extendBase);
    extendEnd.setMonth(extendEnd.getMonth() + durationMonths);
    await supabase.from("student_subscriptions")
      .update({ end_date: extendEnd.toISOString().split("T")[0], status: "active" })
      .eq("id", existingSub.id);
  } else {
    await supabase.from("student_subscriptions").insert({
      student_id: studentId,
      plan_id:    planId,
      status:     "active",
      start_date: new Date().toISOString().split("T")[0],
      end_date:   subEnd.toISOString().split("T")[0],
    });
  }

  // 5. Upsert payment_history
  const { data: existingHist } = await supabase
    .from("payment_history")
    .select("id")
    .eq("payment_ref", ref)
    .maybeSingle();

  if (!existingHist) {
    await supabase.from("payment_history").insert({
      user_id:      studentId,
      amount:       Math.round(amountMain),
      status:       "success",
      payment_type: "subscription",
      payment_ref:  ref,
      receipt_id:   `RCPT-${ref}`,
      paid_at:      paidAt,
    });
  }

  // 6. Advance tasjeel
  const { data: tj } = await supabase
    .from("tasjeel_progress")
    .select("current_step, payment_status")
    .eq("user_id", studentId)
    .maybeSingle();

  if (["payment", "enrollment"].includes(tj?.current_step ?? "") && tj?.payment_status !== "paid") {
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
      user_id: studentId, current_step: nextStep,
      payment_ref: ref, payment_status: "paid",
      payment_amount: amountMain, payment_currency: currency,
      payment_paid_at: now, updated_at: now,
      ...(nextStep === "completed" ? { completed_at: now } : {}),
    }, { onConflict: "user_id" });
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const secretKey = Deno.env.get("PAYSTACK_SECRET_KEY") || "";
  if (!secretKey) {
    return new Response(JSON.stringify({ error: "PAYSTACK_SECRET_KEY not set" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Admin-only gate
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (token) {
    const { data: { user } } = await supabase.auth.getUser(token);
    const { data: profile } = await supabase.from("profiles")
      .select("role").eq("user_id", user?.id ?? "").maybeSingle();
    if (profile?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const stats = { pass1_verified: 0, pass2_backfilled: 0, skipped: 0, errors: 0, details: [] as any[] };

  try {
    // ── PASS 1: verify existing pending rows ─────────────────────────────────
    const { data: pendingRows } = await supabase
      .from("payments")
      .select("*, payment_plans(*)")
      .not("status", "eq", "success")
      .not("paystack_reference", "is", null)
      .not("paystack_reference", "like", "TAH-MANUAL-%");

    for (const row of (pendingRows ?? []) as any[]) {
      const psData = await verifyReference(row.paystack_reference, secretKey);
      if (psData) {
        const currency = row.payment_plans?.currency || psData.currency || "NGN";
        await applyPayment(supabase, row.student_id, row.plan_id, psData, currency);
        stats.pass1_verified++;
        stats.details.push({ pass: 1, ref: row.paystack_reference, student: row.student_id, result: "synced" });
      } else {
        stats.skipped++;
      }
      await new Promise(r => setTimeout(r, 120));
    }

    // ── PASS 2: pull all Paystack transactions, backfill missing ones ─────────
    const psTxns = await fetchRecentSuccessful(secretKey);
    console.log(`[paystack-sync] pass2: ${psTxns.length} successful txns from Paystack`);

    // Load all student profiles (email → user_id map)
    const { data: allProfiles } = await supabase
      .from("profiles")
      .select("user_id, email, role")
      .eq("role", "student");

    const emailToUserId: Record<string, string> = {};
    for (const p of (allProfiles ?? []) as any[]) {
      if (p.email) emailToUserId[p.email.toLowerCase()] = p.user_id;
    }

    // Load existing successful references to skip them
    const { data: existingSuccess } = await supabase
      .from("payments")
      .select("paystack_reference")
      .eq("status", "success");
    const successRefs = new Set((existingSuccess ?? []).map((r: any) => r.paystack_reference));

    // Load payment plans for amount→plan matching
    const { data: allPlans } = await supabase.from("payment_plans").select("*");

    for (const tx of psTxns) {
      const ref = tx.reference;
      if (!ref || successRefs.has(ref)) continue;          // already synced
      if (!ref.startsWith("TAH-")) continue;               // only our refs

      // Resolve student from metadata.user_id or customer email
      const metaUserId = tx.metadata?.user_id || tx.metadata?.custom_fields?.find((f: any) => f.variable_name === "user_id")?.value;
      const email = tx.customer?.email?.toLowerCase();

      let studentId: string | null = metaUserId || null;
      if (!studentId && email) studentId = emailToUserId[email] || null;
      if (!studentId) {
        stats.skipped++;
        stats.details.push({ pass: 2, ref, result: "no_student_match", email });
        continue;
      }

      // Match plan by metadata or amount
      const metaPlanId = tx.metadata?.plan_id;
      let planId: string | null = null;
      if (metaPlanId) {
        planId = metaPlanId;
      } else {
        // Match by amount (kobo)
        const matchPlan = (allPlans ?? []).find((p: any) => p.amount * 100 === tx.amount);
        planId = matchPlan?.id || null;
      }

      const currency = tx.currency || "NGN";
      try {
        await applyPayment(supabase, studentId, planId, tx, currency);
        stats.pass2_backfilled++;
        stats.details.push({ pass: 2, ref, student: studentId, result: "backfilled" });
        console.log(`[paystack-sync] ✅ backfilled ref=${ref} student=${studentId}`);
      } catch (e: any) {
        stats.errors++;
        stats.details.push({ pass: 2, ref, student: studentId, result: "error", error: e.message });
        console.error(`[paystack-sync] ❌ backfill error ref=${ref}:`, e.message);
      }
      await new Promise(r => setTimeout(r, 120));
    }

    const total = stats.pass1_verified + stats.pass2_backfilled;
    console.log("[paystack-sync] done", stats);
    return new Response(JSON.stringify({ ok: true, synced: total, ...stats }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[paystack-sync] fatal:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
