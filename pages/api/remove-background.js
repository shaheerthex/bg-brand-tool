const REMOVE_BG_URL = "https://api.remove.bg/v1.0/removebg";
const PRODUCT_PATH = /^\/(?:collections\/[^/]+\/)?products\/[^/]+\/?$/;

async function resolveImageUrl(url) {
  const page = new URL(url);
  if (page.hostname !== "relinkonline.com" || !PRODUCT_PATH.test(page.pathname)) {
    return url;
  }

  const response = await fetch(page.toString(), {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; BgBrandTool/1.0)",
      Accept: "text/html",
    },
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    throw new Error(`Could not open the reLink product page (${response.status}). Try a direct image URL.`);
  }

  const html = await response.text();
  const imageTag = html.match(/<meta\b[^>]*>/gi)?.find((tag) => /\bproperty\s*=\s*["']og:image["']/i.test(tag));
  const imageValue = imageTag?.match(/\bcontent\s*=\s*(["'])(.*?)\1/i)?.[2];
  if (!imageValue) {
    throw new Error("No product image was found on that reLink page. Try a direct image URL.");
  }

  const image = new URL(imageValue.replace(/&amp;/g, "&"), page);
  if (!["http:", "https:"].includes(image.protocol)) {
    throw new Error("The reLink product image URL is invalid.");
  }
  return image.toString();
}

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

  try {
    const resolvedUrl = await resolveImageUrl(imageUrl);
    const form = new FormData();
    form.append("image_url", resolvedUrl);
    form.append("size", "auto");
    form.append("format", "png");

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
  } catch (error) {
    const message = error.message?.includes("reLink") || error.message?.includes("product image")
      ? error.message
      : "Could not reach remove.bg. Please retry.";
    return res.status(502).json({ error: message });
  }
}
