// app-release-url — presigned Cloudflare R2 URLs for the Android app (APK).
//
// POST body: { path, action: "upload" | "sign" | "delete", downloadName? }
//   path must look like  app-releases/<file>.apk
//   - "upload": admin only. Returns a presigned PUT URL (APK goes browser -> R2).
//   - "sign":   anyone (no login needed), but ONLY for a file that belongs to
//               a published release. Returns a presigned GET URL that saves the
//               file as an .apk download.
//   - "delete": admin only. Removes the file from R2.
//
// Uses the same R2_* secrets as hifdh-audio-url / exam-audio-url.

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

const PATH_RE = /^app-releases\/[A-Za-z0-9._-]+\.apk$/;
const APK_TYPE = "application/vnd.android.package-archive";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";

    const { path, action, downloadName } = await req.json();
    if (!path || !action) return json({ error: "path and action are required" }, 400);
    if (!["upload", "sign", "delete"].includes(action)) {
      return json({ error: "action must be 'upload', 'sign' or 'delete'" }, 400);
    }
    if (typeof path !== "string" || !PATH_RE.test(path) || path.includes("..")) {
      return json({ error: "Invalid path" }, 400);
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    if (action === "upload" || action === "delete") {
      const { data: { user }, error: authError } = await userClient.auth.getUser();
      if (authError || !user) return json({ error: "Invalid session" }, 401);
      const { data: isAdmin } = await userClient.rpc("has_role", { _user_id: user.id, _role: "admin" });
      if (!isAdmin) return json({ error: "Admins only" }, 403);
    } else {
      // RLS only shows published releases to non-admins (and to logged-out
      // visitors), so a hit here means this file is a live, published release.
      const { data: release } = await userClient
        .from("app_releases").select("id").eq("file_path", path).maybeSingle();
      if (!release) return json({ error: "Release not available" }, 404);
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
      if (!del.ok && del.status !== 404) return json({ error: `R2 delete failed (${del.status})` }, 502);
      return json({ ok: true });
    }

    if (action === "upload") {
      // 1 hour — a ~60 MB APK on a slow connection needs time.
      const signed = await client.sign(
        new Request(`${objectUrl}?X-Amz-Expires=3600`, {
          method: "PUT",
          headers: { "Content-Type": APK_TYPE },
        }),
        { aws: { signQuery: true } },
      );
      return json({ url: signed.url });
    }

    // sign (download): 2 hours, saved as an .apk file
    const safeName = String(downloadName || path.split("/").pop()).replace(/[^A-Za-z0-9._-]/g, "_");
    const params = new URLSearchParams({
      "X-Amz-Expires": "7200",
      "response-content-disposition": `attachment; filename="${safeName}"`,
      "response-content-type": APK_TYPE,
    });
    const signed = await client.sign(
      new Request(`${objectUrl}?${params.toString()}`, { method: "GET" }),
      { aws: { signQuery: true } },
    );
    return json({ url: signed.url });
  } catch (err: any) {
    console.error("[app-release-url] error:", err);
    return json({ error: err.message }, 500);
  }
});
