# BG Remove + Brand Tool

Paste image URLs or reLink Online product links (one per line, batch supported) → remove.bg removes each
background → the cutout is placed on a white canvas with `public/watermark.png`
overlaid → resize per image → download individually or as a ZIP.

## Set up remove.bg

1. Get an API key from [remove.bg](https://www.remove.bg/api).
2. Copy `.env.example` to `.env.local` and replace the placeholder with your key.
3. For a Vercel deployment, add `REMOVE_BG_API_KEY` in the project's
   environment variables and redeploy.

The key is read only by `pages/api/remove-background.js`; it is never sent to
the browser. Do not prefix the variable with `NEXT_PUBLIC_`. Each processed
image uses remove.bg API credits. The tool requests `size=auto` and PNG output.

## Batch processing

- Paste any number of URLs into the textarea, one per line, and hit
  "Generate All".
- For reLink Online product pages, the server extracts the main photo from
  the page's `og:image` metadata before calling remove.bg. Other sites should
  be provided as direct image URLs.
- Images are processed sequentially to avoid bursting through the remove.bg
  rate limit. For large batches, consider chunking the list.
- Each item gets its own status (queued / removing background / done / error)
  and its own size slider — resizing one image
  doesn't touch the others.
- Failed items show the error inline with a **Retry** button so one bad
  URL doesn't block the rest of the batch.
- "Download All as ZIP" bundles every finished image (at its current
  slider size) into a single `branded-images.zip`, named after each
  source URL's filename.

The API route sends the image URL to remove.bg and returns the resulting PNG
to the browser. On a public deployment, access to that route should be
restricted to trusted users because calls consume your credits.

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

Or import the GitHub repo in Vercel, set `REMOVE_BG_API_KEY` in project
environment variables, and deploy.

## Customizing the branding overlay

- Replace `public/watermark.png` with your own file (same 1000×1000 canvas
  works best, transparent in the middle, logo/URL opaque).
- If you change its size or the logo's position, adjust `CONTENT_BOX` in
  `pages/index.js` — that's the box the product photo is centered/scaled
  into so it doesn't collide with your logo or footer text.

## Notes / limits

- Source image URLs must be reachable by remove.bg. Inaccessible or invalid
  images show an error on the corresponding item.
- remove.bg enforces image size, resolution, credit, and rate limits; its
  error is shown on the corresponding item.
