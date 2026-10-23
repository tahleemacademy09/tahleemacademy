export default {
  async fetch(req, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    };
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    if (req.method !== "GET" && req.method !== "HEAD")
      return new Response("Method not allowed", { status: 405, headers: cors });

    const key = decodeURIComponent(new URL(req.url).pathname.slice(1));
    if (!/^ota\/[A-Za-z0-9._-]+$/.test(key))
      return new Response("Not found", { status: 404, headers: cors });

    const obj = await env.BUCKET.get(key);
    if (!obj) return new Response("Not found", { status: 404, headers: cors });

    const h = new Headers(cors);
    obj.writeHttpMetadata(h);
    h.set("etag", obj.httpEtag);
    h.set("Cache-Control", key === "ota/manifest.json" ? "no-cache" : "public, max-age=31536000, immutable");
    return new Response(req.method === "HEAD" ? null : obj.body, { headers: h });
  },
};
