// Returns the VAPID public key so the browser can subscribe to web push.
// Public endpoint — the public key is, by design, public.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const raw = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
  // Defensive cleanup: strip surrounding quotes / commas / colons / whitespace
  // that get pasted in by accident when copying from a JSON blob.
  const key = raw
    .replace(/^[\s":,]+/, "")
    .replace(/[\s":,]+$/, "")
    .trim();
  return new Response(JSON.stringify({ publicKey: key }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});