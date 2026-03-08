import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function verifySignature(body: string, signature: string, secret: string): Promise<boolean> {
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

    // Verify webhook signature
    if (signature) {
      const valid = await verifySignature(body, signature, secret);
      if (!valid) {
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const event = JSON.parse(body);
    const eventType = event.event;
    const data = event.data;

    if (eventType === "charge.success") {
      const reference = data.reference;
      const transactionId = String(data.id);

      // Update payment
      await supabase
        .from("payments")
        .update({
          status: "success",
          paystack_transaction_id: transactionId,
          payment_method: data.channel || "paystack",
          paid_at: new Date().toISOString(),
        })
        .eq("paystack_reference", reference);

      // Get payment record
      const { data: payment } = await supabase
        .from("payments")
        .select("*, payment_plans(*)")
        .eq("paystack_reference", reference)
        .single();

      if (payment) {
        const plan = (payment as any).payment_plans;
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + (plan?.duration_months || 3));

        // Update profile
        await supabase
          .from("profiles")
          .update({
            payment_status: "paid",
            subscription_end_date: endDate.toISOString().split("T")[0],
          })
          .eq("user_id", payment.student_id);

        // Create subscription
        await supabase.from("student_subscriptions").insert({
          student_id: payment.student_id,
          plan_id: payment.plan_id,
          payment_id: payment.id,
          status: "active",
          start_date: new Date().toISOString().split("T")[0],
          end_date: endDate.toISOString().split("T")[0],
        });

        // Send notification
        await supabase.from("notifications").insert({
          user_id: payment.student_id,
          title: "Payment Successful ✅",
          message: `Your payment of ₦${payment.amount?.toLocaleString()} has been confirmed. الحمد لله`,
          type: "payment",
        });
      }
    } else if (eventType === "charge.failed") {
      const reference = data.reference;
      await supabase
        .from("payments")
        .update({ status: "failed" })
        .eq("paystack_reference", reference);
    } else if (eventType === "refund.processed") {
      const reference = data.transaction?.reference;
      if (reference) {
        const { data: payment } = await supabase
          .from("payments")
          .select("student_id")
          .eq("paystack_reference", reference)
          .single();

        await supabase
          .from("payments")
          .update({ status: "refunded" })
          .eq("paystack_reference", reference);

        if (payment) {
          await supabase
            .from("profiles")
            .update({ payment_status: "unpaid" })
            .eq("user_id", payment.student_id);

          await supabase
            .from("student_subscriptions")
            .update({ status: "suspended" })
            .eq("student_id", payment.student_id)
            .eq("status", "active");
        }
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Webhook processing failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
