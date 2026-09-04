/*
  supabase/functions/link-preview/index.ts — Tahleem Academy
  ──────────────────────────────────────────────────────────────────
  Fetches a URL server-side (avoids browser CORS) and extracts
  OpenGraph/meta tags so Al-Majlis can render a WhatsApp-style link
  preview card under a text message. Client should cache results by
  URL — this does no caching itself.

  Body: { url: string }
*/

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function extractMeta(html: string, prop: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${prop}["']`, "i"),
    new RegExp(`<meta[^>]+name=["']${prop}["'][^>]+content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${prop}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "url required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let parsed: URL;
    try { parsed = new URL(url); } catch {
      return new Response(JSON.stringify({ error: "Invalid URL" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return new Response(JSON.stringify({ error: "Unsupported protocol" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    let html = "";
    try {
      const res = await fetch(parsed.toString(), {
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; TahleemAcademyBot/1.0; +https://tahleemacademy.com)" },
      });
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("text/html")) {
        return new Response(JSON.stringify({ url: parsed.toString(), title: parsed.hostname, description: null, image: null, site_name: parsed.hostname }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const buf = await res.arrayBuffer();
      html = new TextDecoder("utf-8").decode(buf).slice(0, 300_000);
    } finally {
      clearTimeout(timeout);
    }

    let image = extractMeta(html, "og:image") || extractMeta(html, "twitter:image");
    if (image && !image.startsWith("http")) {
      try { image = new URL(image, parsed.origin).toString(); } catch { image = null; }
    }

    const titleTagMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const preview = {
      url: parsed.toString(),
      title: extractMeta(html, "og:title") || extractMeta(html, "twitter:title") || titleTagMatch?.[1]?.trim() || parsed.hostname,
      description: extractMeta(html, "og:description") || extractMeta(html, "twitter:description") || extractMeta(html, "description"),
      image,
      site_name: extractMeta(html, "og:site_name") || parsed.hostname,
    };

    return new Response(JSON.stringify(preview), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
