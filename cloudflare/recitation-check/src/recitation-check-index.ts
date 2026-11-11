// cloudflare/recitation-check/src/index.ts
// POST audio (16 kHz mono WAV) with a Supabase user JWT. Any signed-in user is served (Ramadan checker + Hifdh daily revision).
// Returns { text, words: [{word,start,end}], avgLogprob }. Comparison against the expected ayah happens in the app.

interface Env {
  AI: { run(model: string, input: unknown): Promise<any> };
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  MAX_AUDIO_BYTES?: string;
}

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function userIdFor(env: Env, token: string): Promise<string | null> {
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  const u: any = await r.json();
  return typeof u?.id === "string" ? u.id : null;
}

async function isAdmin(env: Env, token: string, uid: string): Promise<boolean> {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/user_roles?select=role&user_id=eq.${encodeURIComponent(uid)}`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return false;
  const rows: any[] = await r.json();
  return Array.isArray(rows) && rows.some((x) => x?.role === "admin");
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (req.method === "GET") return json({ ok: true });
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "unauthorized" }, 401);
    const uid = await userIdFor(env, token);
    if (!uid) return json({ error: "unauthorized" }, 401);
    // Any signed-in user is served (Hifdh daily revision uses this for students). Which screens may call it is decided in the app.

    const buf = await req.arrayBuffer();
    if (buf.byteLength < 2000) return json({ error: "audio_too_short" }, 400);
    // No length cap by default. Set MAX_AUDIO_BYTES to a positive number in wrangler.toml to bring one back.
    const max = Number(env.MAX_AUDIO_BYTES || 0);
    if (max > 0 && buf.byteLength > max) return json({ error: "audio_too_large" }, 413);

    try {
      // No initial_prompt on purpose: priming with the expected verse makes the model "autocorrect"
      // a wrong recitation toward the right words and hides the very mistakes we want to catch.
      const out = await env.AI.run("@cf/openai/whisper-large-v3-turbo", {
        audio: toBase64(buf),
        task: "transcribe",
        language: "ar",
        vad_filter: true,
        condition_on_previous_text: false,
        beam_size: 5,
      });
      const segments: any[] = Array.isArray(out?.segments) ? out.segments : out?.segments ? [out.segments] : [];
      const words = segments.flatMap((s) =>
        (Array.isArray(s?.words) ? s.words : []).map((w: any) => ({
          word: String(w.word ?? "").trim(),
          start: typeof w.start === "number" ? w.start : null,
          end: typeof w.end === "number" ? w.end : null,
        })),
      ).filter((w) => w.word);
      const lp = segments.map((s) => s?.avg_logprob).filter((x) => typeof x === "number");
      const avgLogprob = lp.length ? lp.reduce((a, b) => a + b, 0) / lp.length : null;
      return json({ text: out?.text ?? "", words, avgLogprob });
    } catch (e) {
      return json({ error: "transcription_failed", detail: String((e as Error)?.message || e) }, 502);
    }
  },
};
