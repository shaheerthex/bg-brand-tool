const REMOVE_BG_URL = "https://api.remove.bg/v1.0/removebg";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST to remove a background." });
  }

  const apiKey = process.env.REMOVE_BG_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: "remove.bg is not configured. Set REMOVE_BG_API_KEY on the server." });
  }

  const imageUrl = req.body?.imageUrl;
  if (typeof imageUrl !== "string" || imageUrl.length > 2048) {
    return res.status(400).json({ error: "Enter a valid image URL." });
  }

  try {
    const parsed = new URL(imageUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return res.status(400).json({ error: "Image URL must use http or https." });
    }
  } catch {
    return res.status(400).json({ error: "Enter a valid image URL." });
  }

  const form = new FormData();
  form.append("image_url", imageUrl);
  form.append("size", "auto");
  form.append("format", "png");

  try {
    const upstream = await fetch(REMOVE_BG_URL, {
      method: "POST",
      headers: { "X-Api-Key": apiKey },
      body: form,
    });

    if (!upstream.ok) {
      const body = await upstream.json().catch(() => ({}));
      const message = body.errors?.[0]?.title || `remove.bg returned ${upstream.status}.`;
      const status = [400, 402, 403, 429].includes(upstream.status) ? upstream.status : 502;
      return res.status(status).json({ error: message });
    }

    const image = Buffer.from(await upstream.arrayBuffer());
    res.setHeader("Content-Type", "image/png");
    return res.status(200).send(image);
  } catch {
    return res.status(502).json({ error: "Could not reach remove.bg. Please retry." });
  }
}
