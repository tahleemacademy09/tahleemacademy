// supabase/functions/verify-bank-account/index.ts
// Verifies a Nigerian bank account via Paystack's resolve endpoint.
// Keeps PAYSTACK_SECRET_KEY server-side.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { account_number, bank_code } = await req.json();

    if (!account_number || !bank_code) {
      return new Response(
        JSON.stringify({ error: "account_number and bank_code are required" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    const PAYSTACK_KEY = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!PAYSTACK_KEY) {
      return new Response(
        JSON.stringify({ error: "PAYSTACK_SECRET_KEY not configured" }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    const url = `https://api.paystack.co/bank/resolve?account_number=${encodeURIComponent(account_number)}&bank_code=${encodeURIComponent(bank_code)}`;
    const res  = await fetch(url, {
      headers: { Authorization: `Bearer ${PAYSTACK_KEY}` },
    });
    const data = await res.json();

    if (!res.ok || !data.status) {
      return new Response(
        JSON.stringify({ error: data.message || "Verification failed" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    // Return just what the client needs
    return new Response(
      JSON.stringify({
        account_name:   data.data.account_name,
        account_number: data.data.account_number,
      }),
      { headers: { ...CORS, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});