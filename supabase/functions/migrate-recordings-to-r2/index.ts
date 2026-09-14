// migrate-recordings-to-r2 — ONE-TIME utility. Copies recordings that were
// saved to the old Supabase "recordings" storage bucket over to Cloudflare
// R2, at the exact same path (e.g. "sessions/<id>/<id>.mp4"), so that:
//
//   1. storageClient.ts's normal R2 lookup (getR2SignedUrl) starts finding
//      them immediately — no code change needed there.
//   2. They stop counting against Supabase Storage egress once playback
//      moves to the R2 signed URL.
//
// This does NOT delete anything from Supabase Storage — it only copies.
// Verify playback works from R2 before deleting the old files yourself.
//
// Admin-only. Call it once (optionally in batches via `limit`/`offset`)
// after setting the R2 secrets below.
//
// Setup:
//   supabase functions deploy migrate-recordings-to-r2
//   supabase secrets set \
//     R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com \
//     R2_ACCESS_KEY=<key> \
//     R2_SECRET_KEY=<secret> \
//     R2_BUCKET=tahleem-recordings
//   (reuse the same secrets already set for recording-url / start-recording)
//
// Invoke (as a logged-in admin), e.g. from the browser console or a REST
// client — body is optional:
//   POST /functions/v1/migrate-recordings-to-r2
//   { "limit": 20, "dryRun": false }
//
// Run it a few times (or loop with increasing offset) until "remaining": 0.

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

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const limit = Math.min(Number(body.limit) || 10, 50); // small batches — this streams whole files
    const offset = Number(body.offset) || 0;
    const dryRun = !!body.dryRun;

    const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY    = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Admin-only — this touches every recording in the database.
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    const isAdmin = (roles || []).some((r: any) => r.role === "admin");
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const R2_ENDPOINT   = Deno.env.get("R2_ENDPOINT")!;
    const R2_ACCESS_KEY = Deno.env.get("R2_ACCESS_KEY")!;
    const R2_SECRET_KEY = Deno.env.get("R2_SECRET_KEY")!;
    const R2_BUCKET      = Deno.env.get("R2_BUCKET") || "tahleem-recordings";

    const r2 = new AwsClient({
      accessKeyId: R2_ACCESS_KEY,
      secretAccessKey: R2_SECRET_KEY,
      service: "s3",
      region: "auto",
    });

    // Pull a batch of completed recordings, oldest first so a partial run
    // still makes forward progress predictably.
    const { data: allRecs, error: recErr } = await admin
      .from("session_recordings")
      .select("id, file_url, status")
      .eq("status", "completed")
      .not("file_url", "is", null)
      .order("created_at", { ascending: true });
    if (recErr) throw recErr;

    const candidates = (allRecs || []).filter(
      (r: any) => r.file_url && !r.file_url.startsWith("http")
    );
    const batch = candidates.slice(offset, offset + limit);

    const results: any[] = [];

    for (const rec of batch) {
      const path = rec.file_url as string;
      try {
        // Skip if it already exists in R2 (HEAD check) — makes re-running safe.
        const objectUrl = `${R2_ENDPOINT}/${R2_BUCKET}/${encodeURI(path)}`;
        const head = await r2.fetch(objectUrl, { method: "HEAD" });
        if (head.ok) {
          results.push({ id: rec.id, path, status: "already_in_r2" });
          continue;
        }

        if (dryRun) {
          results.push({ id: rec.id, path, status: "would_migrate" });
          continue;
        }

        // Download from the legacy Supabase "recordings" bucket, then
        // stream it straight into R2 via a signed PUT.
        const { data: fileBlob, error: dlErr } = await admin.storage
          .from("recordings")
          .download(path);
        if (dlErr || !fileBlob) {
          results.push({ id: rec.id, path, status: "source_missing", error: dlErr?.message });
          continue;
        }

        const putRes = await r2.fetch(objectUrl, {
          method: "PUT",
          headers: { "Content-Type": "video/mp4" },
          body: fileBlob,
        });
        if (!putRes.ok) {
          results.push({ id: rec.id, path, status: "upload_failed", error: `${putRes.status} ${await putRes.text()}` });
          continue;
        }

        results.push({ id: rec.id, path, status: "migrated" });
      } catch (e: any) {
        results.push({ id: rec.id, path, status: "error", error: e.message });
      }
    }

    return new Response(
      JSON.stringify({
        processed: batch.length,
        remaining: Math.max(candidates.length - (offset + batch.length), 0),
        totalCandidates: candidates.length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[migrate-recordings-to-r2] error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
