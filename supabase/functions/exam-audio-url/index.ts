// exam-audio-url — issues presigned Cloudflare R2 URLs for student exam-answer
// audio recordings (the ones recorded in ExamTaking.tsx / EntranceExamTaking.tsx
// for "audio"/"dictation" questions).
//
// Replaces uploading directly to the Supabase "exam-media" bucket. Old
// recordings stay in Supabase's exam-media bucket untouched and keep playing
// exactly as before — only NEW recordings go through this function to R2.
//
// POST body: { path, action: "upload" | "sign", contentType?, expiresIn? }
//   - "upload": returns a presigned PUT URL. The browser uploads the recorded
//               blob DIRECTLY to R2 with this URL — the audio bytes never
//               pass through this function or through Supabase.
//               `path` must be under the caller's own
//               student-answers/<own-uid>/... or entrance-exam/<own-uid>/...
//               prefix — one student can never write into another's path.
//   - "sign":   returns a presigned GET URL for playback. Called right after
//               a successful upload so the app can store a working URL, same
//               as the old 7-day Supabase signed URL it replaces.
//
// Uses aws4fetch (https://github.com/mhart/aws4fetch) to sign requests
// against R2's S3-compatible API — fetch-based, no Node deps, runs fine in
// a Deno edge function.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// The two path conventions already used by ExamTaking.tsx and
// EntranceExamTaking.tsx for student-recorded audio answers.
const ALLOWED_PREFIXES = ["student-answers/", "entrance-exam/"];

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

    const { path, action, contentType, expiresIn } = await req.json();
    if (!path || !action) {
      return new Response(JSON.stringify({ error: "path and action are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (action !== "upload" && action !== "sign") {
      return new Response(JSON.stringify({ error: "action must be 'upload' or 'sign'" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!ALLOWED_PREFIXES.some((p) => path.startsWith(p))) {
      return new Response(JSON.stringify({ error: "Invalid path prefix" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Confirm the caller has a valid Supabase session — same auth pattern as
    // the app's other signed-URL functions.
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

    // Uploads must target the caller's OWN prefix — student-answers/<uid>/...
    // or entrance-exam/<uid>/... — so one student can never overwrite or
    // pre-empt another's in-progress recording via this endpoint. Grading
    // playback ("sign") reads a path that was already written to the
    // student's own answer row, not something typed in by the caller, so it
    // doesn't need this extra check.
    if (action === "upload") {
      const ownPrefix = ALLOWED_PREFIXES.some((p) => path.startsWith(`${p}${user.id}/`));
      if (!ownPrefix) {
        return new Response(JSON.stringify({ error: "Not authorized for this path" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const R2_ACCOUNT_ID = Deno.env.get("R2_ACCOUNT_ID")!;
    const R2_ACCESS_KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID")!;
    const R2_SECRET_ACCESS_KEY = Deno.env.get("R2_SECRET_ACCESS_KEY")!;
    const R2_BUCKET_NAME = Deno.env.get("R2_BUCKET_NAME")!;
    const R2_ENDPOINT = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

    const client = new AwsClient({
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
      service: "s3",
      region: "auto",
    });

    const objectUrl = `${R2_ENDPOINT}/${R2_BUCKET_NAME}/${encodeURI(path)}`;
    // 7 days matches the TTL the old Supabase signed URL used for these
    // recordings (createSignedUrl(path, 604800)) — grading pages just play
    // whatever URL is stored on the answer row, so this keeps that
    // behaviour identical.
    const ttl = Math.min(Math.max(Number(expiresIn) || 604800, 60), 604800);

    if (action === "upload") {
      const signed = await client.sign(
        new Request(`${objectUrl}?X-Amz-Expires=${ttl}`, {
          method: "PUT",
          headers: contentType ? { "Content-Type": contentType } : undefined,
        }),
        { aws: { signQuery: true } },
      );
      return new Response(JSON.stringify({ url: signed.url }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // action === "sign" (playback)
    const signed = await client.sign(
      new Request(`${objectUrl}?X-Amz-Expires=${ttl}`),
      { aws: { signQuery: true } },
    );
    return new Response(JSON.stringify({ url: signed.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[exam-audio-url] error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
