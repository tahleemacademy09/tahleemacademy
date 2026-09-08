// recording-url — replaces the direct Supabase-storage getSignedUrl/remove
// calls for the "recordings" bucket now that recordings live in Cloudflare
// R2 instead. Materials/other buckets are untouched — they keep using
// Supabase storage directly in storageClient.ts.
//
// Uses aws4fetch (https://github.com/mhart/aws4fetch) to sign requests
// against R2's S3-compatible API — it's fetch-based with no Node deps, so
// it runs fine in a Deno edge function. Double-check the exact presign
// option names against whatever aws4fetch version esm.sh resolves at
// deploy time (README: https://github.com/mhart/aws4fetch#readme) — the
// library's presign API has shifted across versions and I couldn't hit the
// network to pin an exact version while writing this.
//
// POST body: { path: "sessions/<id>/<id>.mp4", action?: "sign" | "delete", expiresIn?: number }
// Auth: same bearer-token pattern as your other edge functions — any
// logged-in user gets a signed URL. Tighten with a role/ownership check
// below if recordings should be gated further (e.g. only students
// enrolled in that subject).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { path, action, expiresIn } = await req.json();
    if (!path) {
      return new Response(JSON.stringify({ error: "path is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Confirm the caller has a valid Supabase session before handing out a
    // signed R2 URL or allowing a delete — mirrors the auth check the old
    // Supabase-storage path got for free from RLS.
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only admins/teachers may delete recordings.
    if (action === "delete") {
      const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
      const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
      const isPrivileged = (roles || []).some((r: any) => r.role === "admin" || r.role === "teacher");
      if (!isPrivileged) {
        return new Response(JSON.stringify({ error: "Not authorized to delete recordings" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const R2_ENDPOINT   = Deno.env.get("R2_ENDPOINT")!;   // https://<account_id>.r2.cloudflarestorage.com
    const R2_ACCESS_KEY = Deno.env.get("R2_ACCESS_KEY")!;
    const R2_SECRET_KEY = Deno.env.get("R2_SECRET_KEY")!;
    const R2_BUCKET      = Deno.env.get("R2_BUCKET") || "tahleem-recordings";

    const client = new AwsClient({
      accessKeyId: R2_ACCESS_KEY,
      secretAccessKey: R2_SECRET_KEY,
      service: "s3",
      region: "auto",
    });

    const objectUrl = `${R2_ENDPOINT}/${R2_BUCKET}/${encodeURI(path)}`;

    if (action === "delete") {
      const res = await client.fetch(objectUrl, { method: "DELETE" });
      if (!res.ok && res.status !== 404) {
        throw new Error(`R2 delete failed: ${res.status} ${await res.text()}`);
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Default action: presign a GET URL for playback.
    const ttl = Math.min(Math.max(Number(expiresIn) || 7200, 60), 604800); // clamp 1min–7days
    const signed = await client.sign(
      new Request(`${objectUrl}?X-Amz-Expires=${ttl}`),
      { aws: { signQuery: true } },
    );

    return new Response(JSON.stringify({ url: signed.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[recording-url] error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/* ── Setup notes ────────────────────────────────────────────────────────
1. Deploy: supabase functions deploy recording-url

2. Set secrets (same R2 credentials used in start-recording, plus these
   read-oriented ones — reuse the same R2 API token if it has read+write+delete):
     supabase secrets set \
       R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com \
       R2_ACCESS_KEY=<key> \
       R2_SECRET_KEY=<secret> \
       R2_BUCKET=tahleem-recordings

3. Verify aws4fetch's presign call shape against the README before relying
   on this in production — pin an explicit version in the esm.sh import
   (e.g. aws4fetch@1.0.20) rather than trusting @latest, since presign
   options have changed across versions.
──────────────────────────────────────────────────────────────────────── */
