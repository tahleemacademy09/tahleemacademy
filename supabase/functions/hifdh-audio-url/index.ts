// hifdh-audio-url — presigned Cloudflare R2 URLs for Hifdh daily-revision recordings.
//
// POST body: { path, action: "upload" | "sign", contentType?, expiresIn? }
//   path must look like  hifdh-daily/<student-uid>/<file>
//   - "upload": only the student whose uid is in the path may upload.
//               Returns a presigned PUT URL (audio goes browser -> R2 directly).
//   - "delete": staff only (admin / teacher). Removes the recording from R2 once it has been reviewed.
//   - "sign":   returns a short-lived presigned GET URL. Allowed for the owning
//               student, and for teachers/admins. Nobody else.
//
// Uses the same R2_* secrets as the exam-audio-url function. Stored in the DB is
// only the path; a fresh link is requested every time someone plays the audio,
// so links never go stale and the bucket stays private.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// hifdh-daily/<uuid>/<filename>  — no slashes or dots-only segments in the filename
const PATH_RE = /^hifdh-daily\/([0-9a-fA-F-]{36})\/[A-Za-z0-9._-]+$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Not authenticated" }, 401);

    const { path, action, contentType, expiresIn } = await req.json();
    if (!path || !action) return json({ error: "path and action are required" }, 400);
    if (action !== "upload" && action !== "sign" && action !== "delete") {
      return json({ error: "action must be 'upload', 'sign' or 'delete'" }, 400);
    }
    const m = typeof path === "string" ? PATH_RE.exec(path) : null;
    if (!m || path.includes("..")) return json({ error: "Invalid path" }, 400);
    const ownerId = m[1].toLowerCase();

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: "Invalid session" }, 401);

    const isOwner = user.id.toLowerCase() === ownerId;

    if (action === "upload") {
      if (!isOwner) return json({ error: "Not authorized for this path" }, 403);
    } else if (action === "delete" || !isOwner) {
      const [{ data: isAdmin }, { data: isTeacher }] = await Promise.all([
        userClient.rpc("has_role", { _user_id: user.id, _role: "admin" }),
        userClient.rpc("has_role", { _user_id: user.id, _role: "teacher" }),
      ]);
      if (!isAdmin && !isTeacher) return json({ error: "Not authorized" }, 403);
    }

    const client = new AwsClient({
      accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID")!,
      secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY")!,
      service: "s3",
      region: "auto",
    });
    const endpoint = `https://${Deno.env.get("R2_ACCOUNT_ID")!}.r2.cloudflarestorage.com`;
    const objectUrl = `${endpoint}/${Deno.env.get("R2_BUCKET_NAME")!}/${encodeURI(path)}`;

    if (action === "delete") {
      const del = await client.fetch(objectUrl, { method: "DELETE" });
      // 204 = deleted, 404 = already gone — both mean "no recording left"
      if (!del.ok && del.status !== 404) return json({ error: `R2 delete failed (${del.status})` }, 502);
      return json({ ok: true });
    }

    // Upload links: 15 minutes. Playback links: default 1 hour, max 7 days.
    const ttl = action === "upload"
      ? 900
      : Math.min(Math.max(Number(expiresIn) || 3600, 60), 604800);

    const signed = await client.sign(
      new Request(`${objectUrl}?X-Amz-Expires=${ttl}`, {
        method: action === "upload" ? "PUT" : "GET",
        headers: action === "upload" && contentType ? { "Content-Type": contentType } : undefined,
      }),
      { aws: { signQuery: true } },
    );
    return json({ url: signed.url });
  } catch (err: any) {
    console.error("[hifdh-audio-url] error:", err);
    return json({ error: err.message }, 500);
  }
});
