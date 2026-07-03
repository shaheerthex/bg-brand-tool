# BG Remove + Brand Tool

Paste image URLs (one per line, batch supported) → each background is
removed **entirely in the browser** (no paid API, no server GPU) → the
cutout is composited on a white canvas with your `public/watermark.png`
branding overlaid on top → resize per image with a slider → download
individually or as a ZIP of everything.

## Batch processing

- Paste any number of URLs into the textarea, one per line, and hit
  "Generate All".
- Images are processed **sequentially** (not in parallel) — the
  segmentation model is heavy WASM work, and running many at once can
  stall or crash a low-end browser tab. For a few dozen images this is
  fine; for hundreds, consider chunking the list.
- Each item gets its own status (queued / fetching / removing background
  with a % / done / error) and its own size slider — resizing one image
  doesn't touch the others.
- Failed items show the error inline with a **Retry** button so one bad
  URL doesn't block the rest of the batch.
- "Download All as ZIP" bundles every finished image (at its current
  slider size) into a single `branded-images.zip`, named after each
  source URL's filename.

## Why this approach (no API cost)

- Background removal uses [`@imgly/background-removal`](https://github.com/imgly/background-removal-js),
  which runs a segmentation model client-side via WASM/ONNX in the user's
  own browser. The model (~15-20MB) is fetched from a CDN the first time
  and cached — there is no per-request cost to you, and no API key.
- The only server-side code is `pages/api/proxy.js`, a tiny pass-through
  fetch that lets the browser load an arbitrary image URL into a
  `<canvas>` without CORS errors. It's a normal Vercel serverless
  function (free tier covers this easily).
- The Android repo you found (`auto-background-remover`) is a **Kotlin/
  Android library** — not usable in a Vercel web app. `@imgly/background-removal`
  is the web equivalent of that "offline, no API" idea.

## Local dev

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Deploy to Vercel

```bash
npm install -g vercel   # if you don't have it
vercel
```

Or just push this folder to a GitHub repo and import it in the Vercel
dashboard (vercel.com/new) — zero config needed, it's a stock Next.js app.

## Customizing the branding overlay

- Replace `public/watermark.png` with your own file (same 1000×1000 canvas
  works best, transparent in the middle, logo/URL opaque).
- If you change its size or the logo's position, adjust `CONTENT_BOX` in
  `pages/index.js` — that's the box the product photo is centered/scaled
  into so it doesn't collide with your logo or footer text.

## Notes / limits

- First background-removal call in a fresh browser is slower (downloading
  the model). Subsequent ones are fast since it's cached.
- Very large source images will slow down the in-browser model — you can
  downscale the fetched image before calling `removeBackground` if needed.
- If a pasted URL 404s, isn't an image, or blocks hotlinking, the proxy
  will surface an error instead of a blank canvas.
