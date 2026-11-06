export default {
  async fetch(req, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges, ETag",
    };
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    if (req.method !== "GET" && req.method !== "HEAD")
      return new Response("Method not allowed", { status: 405, headers: cors });

    const key = decodeURIComponent(new URL(req.url).pathname.slice(1));
    if (!/^ota\/[A-Za-z0-9._-]+$/.test(key))
      return new Response("Not found", { status: 404, headers: cors });

    const h = new Headers(cors);
    h.set("Accept-Ranges", "bytes");
    h.set("Cache-Control", key === "ota/manifest.json" ? "no-cache" : "public, max-age=31536000, immutable");

    if (req.method === "HEAD") {
      const head = await env.BUCKET.head(key);
      if (!head) return new Response("Not found", { status: 404, headers: cors });
      head.writeHttpMetadata(h);
      h.set("etag", head.httpEtag);
      h.set("Content-Length", String(head.size));
      return new Response(null, { headers: h });
    }

    // Honour Range (the phone's updater resumes partial downloads with it;
    // answering 200 to a Range request makes the download fail).
    const rangeHeader = req.headers.get("range");
    const obj = await env.BUCKET.get(key, rangeHeader ? { range: req.headers } : undefined);
    if (!obj) return new Response("Not found", { status: 404, headers: cors });

    obj.writeHttpMetadata(h);
    h.set("etag", obj.httpEtag);

    if (rangeHeader && obj.range) {
      let start, end;
      if ("suffix" in obj.range) {
        start = obj.size - obj.range.suffix;
        end = obj.size - 1;
      } else {
        start = obj.range.offset ?? 0;
        end = obj.range.length !== undefined ? start + obj.range.length - 1 : obj.size - 1;
      }
      h.set("Content-Range", `bytes ${start}-${end}/${obj.size}`);
      h.set("Content-Length", String(end - start + 1));
      return new Response(obj.body, { status: 206, headers: h });
    }

    h.set("Content-Length", String(obj.size));
    return new Response(obj.body, { headers: h });
  },
};
