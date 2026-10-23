// supabase/functions/verify-bank-account/index.ts
// Verifies a Nigerian bank account via Paystack's /bank/resolve endpoint.
// Uses Deno.serve (required by current Supabase Edge Runtime).

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const { account_number, bank_code } = body as Record<string, string>;

    if (!account_number || !bank_code) {
      return json({ error: "account_number and bank_code are required" }, 400);
    }

    const PAYSTACK_SECRET = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!PAYSTACK_SECRET) {
      console.error("[verify-bank-account] PAYSTACK_SECRET_KEY env var is not set");
      return json({ error: "Payment service not configured — contact admin" }, 503);
    }

    const url = `https://api.paystack.co/bank/resolve?account_number=${encodeURIComponent(account_number)}&bank_code=${encodeURIComponent(bank_code)}`;

    console.log(`[verify-bank-account] Resolving account=${account_number} bank=${bank_code}`);

    const psRes = await fetch(url, {
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        "Content-Type": "application/json",
      },
    });

    const psData = await psRes.json();

    console.log(`[verify-bank-account] Paystack response status=${psRes.status}`, JSON.stringify(psData));

    if (!psRes.ok || !psData.status) {
      // Pass Paystack's actual error message back so teachers know what's wrong
      const msg = psData?.message || "Account verification failed";
      return json({ error: msg }, 400);
    }

    return json({
      account_name:   psData.data.account_name,
      account_number: psData.data.account_number,
      bank_code,
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[verify-bank-account] Unexpected error:", msg);
    return json({ error: msg }, 500);
  }
});
