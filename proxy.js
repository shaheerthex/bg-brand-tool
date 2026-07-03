// Simple image proxy so the browser can load any pasted image URL into a
// <canvas> without hitting CORS / tainted-canvas errors. This is just a
// pass-through fetch on Vercel's free serverless functions — no paid API.

export default async function handler(req, res) {
  const { url } = req.query;

  if (!url || typeof url !== "string") {
    res.status(400).json({ error: "Missing ?url=" });
    return;
  }

  let target;
  try {
    target = new URL(url);
  } catch {
    res.status(400).json({ error: "Invalid URL" });
    return;
  }

  if (target.protocol !== "http:" && target.protocol !== "https:") {
    res.status(400).json({ error: "Only http/https URLs are allowed" });
    return;
  }

  try {
    const upstream = await fetch(target.toString(), {
      headers: {
        // Some CDNs block requests with no UA / referer.
        "User-Agent": "Mozilla/5.0 (compatible; BgBrandTool/1.0)",
      },
    });

    if (!upstream.ok) {
      res.status(upstream.status).json({ error: `Upstream returned ${upstream.status}` });
      return;
    }

    const contentType = upstream.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      res.status(415).json({ error: "URL did not return an image" });
      return;
    }

    const arrayBuffer = await upstream.arrayBuffer();
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).send(Buffer.from(arrayBuffer));
  } catch (err) {
    res.status(502).json({ error: "Failed to fetch image", details: String(err) });
  }
}
