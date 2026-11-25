import { useRef, useState } from "react";

// Canvas / layout constants. Tweak these to match your watermark.png
// (currently sized for a 1000x1000 template with logo top / URL bottom).
const CANVAS_SIZE = 1000;
const CONTENT_BOX = { x: 120, y: 180, w: 760, h: 640 }; // default box the product photo fits into at scale = 1
const MIN_SCALE = 0.3;
const MAX_SCALE = 2.5;

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function parseUrls(text) {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function filenameFromUrl(url, idx, used) {
  let base = `image-${idx + 1}`;
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop();
    if (last) base = last.replace(/\.[a-zA-Z0-9]+$/, "");
  } catch {
    // ignore, fall back to base
  }
  let name = `${base}.png`;
  let n = 1;
  while (used.has(name)) {
    name = `${base}-${n}.png`;
    n += 1;
  }
  used.add(name);
  return name;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Pure canvas compositor — no DOM refs needed, safe to call concurrently
// for different items since each call gets its own offscreen canvas.
function compositeImages(cutoutImg, watermarkImg, scale) {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  const baseScale = Math.min(
    CONTENT_BOX.w / cutoutImg.width,
    CONTENT_BOX.h / cutoutImg.height
  );
  const finalScale = baseScale * scale;
  const drawW = cutoutImg.width * finalScale;
  const drawH = cutoutImg.height * finalScale;
  const centerX = CONTENT_BOX.x + CONTENT_BOX.w / 2;
  const centerY = CONTENT_BOX.y + CONTENT_BOX.h / 2;
  ctx.drawImage(cutoutImg, centerX - drawW / 2, centerY - drawH / 2, drawW, drawH);

  ctx.drawImage(watermarkImg, 0, 0, CANVAS_SIZE, CANVAS_SIZE);

  return canvas.toDataURL("image/png");
}

export default function Home() {
  const [urlsText, setUrlsText] = useState("");
  const [items, setItems] = useState([]); // { id, url, status, error, cutoutImg, resultUrl, scale }
  const [busy, setBusy] = useState(false);
  const watermarkImgRef = useRef(null);

  function patchItem(id, patch) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  async function ensureWatermark() {
    if (!watermarkImgRef.current) {
      watermarkImgRef.current = await loadImage("/watermark.png");
    }
    return watermarkImgRef.current;
  }

  async function processOne(item) {
    patchItem(item.id, { status: "removing-bg", error: null });
    try {
      const response = await fetch("/api/remove-background", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: item.url }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || `Background removal failed (${response.status})`);
      }
      const cutoutBlob = await response.blob();
      const cutoutUrl = URL.createObjectURL(cutoutBlob);
      let cutoutImg;
      try {
        cutoutImg = await loadImage(cutoutUrl);
      } finally {
        URL.revokeObjectURL(cutoutUrl);
      }

      const watermarkImg = await ensureWatermark();
      const resultUrl = compositeImages(cutoutImg, watermarkImg, 1);

      patchItem(item.id, {
        status: "done",
        cutoutImg,
        resultUrl,
        scale: 1,
      });
    } catch (err) {
      console.error(err);
      patchItem(item.id, { status: "error", error: err.message || String(err) });
    }
  }

  async function handleGenerateAll() {
    const urls = parseUrls(urlsText);
    if (!urls.length) return;

    const newItems = urls.map((url) => ({
      id: makeId(),
      url,
      status: "pending",
      scale: 1,
      resultUrl: null,
      cutoutImg: null,
      error: null,
    }));
    setItems(newItems);
    setBusy(true);

    // Process sequentially to keep the batch within remove.bg rate limits.
    for (const item of newItems) {
      // eslint-disable-next-line no-await-in-loop
      await processOne(item);
    }
    setBusy(false);
  }

  async function handleRetry(item) {
    await processOne(item);
  }

  function handleRemove(id) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  function handleScaleChange(id, newScale) {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id || !it.cutoutImg || !watermarkImgRef.current) return it;
        const resultUrl = compositeImages(it.cutoutImg, watermarkImgRef.current, newScale);
        return { ...it, scale: newScale, resultUrl };
      })
    );
  }

  async function handleDownloadAll() {
    const doneItems = items.filter((it) => it.status === "done" && it.resultUrl);
    if (!doneItems.length) return;

    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    const used = new Set();
    doneItems.forEach((it, idx) => {
      const base64 = it.resultUrl.split(",")[1];
      const filename = filenameFromUrl(it.url, idx, used);
      zip.file(filename, base64, { base64: true });
    });

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "branded-images.zip";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const doneCount = items.filter((it) => it.status === "done").length;
  const errorCount = items.filter((it) => it.status === "error").length;
  const totalCount = items.length;
  const processedCount = items.filter((it) => it.status === "done" || it.status === "error").length;

  return (
    <main style={styles.main}>
      <div style={styles.card}>
        <h1 style={styles.h1}>Batch Background Remover + Branding</h1>
        <p style={styles.sub}>
          Paste one image URL per line. remove.bg removes each background,
          then the image is placed on white and branded with your watermark.
          Adjust size per image, then
          download everything as a ZIP.
        </p>

        <textarea
          style={styles.textarea}
          placeholder={"https://example.com/product-1.jpg\nhttps://example.com/product-2.jpg\nhttps://example.com/product-3.jpg"}
          value={urlsText}
          onChange={(e) => setUrlsText(e.target.value)}
          disabled={busy}
          rows={5}
        />

        <div style={styles.actionsRow}>
          <button
            style={styles.button}
            onClick={handleGenerateAll}
            disabled={busy || !parseUrls(urlsText).length}
          >
            {busy ? `Processing ${processedCount}/${totalCount}…` : "Generate All"}
          </button>
          <button
            style={{ ...styles.button, ...styles.secondaryButton }}
            onClick={handleDownloadAll}
            disabled={!doneCount}
          >
            Download All ({doneCount}) as ZIP
          </button>
        </div>

        {totalCount > 0 && (
          <p style={styles.status}>
            {processedCount}/{totalCount} processed
            {errorCount ? ` · ${errorCount} failed` : ""}
          </p>
        )}

        {items.length > 0 && (
          <div style={styles.grid}>
            {items.map((it) => (
              <div key={it.id} style={styles.itemCard}>
                <div style={styles.itemHeader}>
                  <span style={styles.itemUrl} title={it.url}>
                    {it.url}
                  </span>
                  <button style={styles.removeBtn} onClick={() => handleRemove(it.id)} title="Remove">
                    ×
                  </button>
                </div>

                <div style={styles.itemBody}>
                  {(it.status === "pending" || it.status === "fetching" || it.status === "removing-bg") && (
                    <div style={styles.placeholder}>
                      {it.status === "pending" && "Queued…"}
                      {it.status === "removing-bg" && "Removing background…"}
                    </div>
                  )}

                  {it.status === "error" && (
                    <div style={styles.errorBox}>
                      <p style={{ margin: 0, fontSize: 12 }}>{it.error}</p>
                      <button style={styles.retryBtn} onClick={() => handleRetry(it)}>
                        Retry
                      </button>
                    </div>
                  )}

                  {it.status === "done" && (
                    <>
                      <img src={it.resultUrl} alt="" style={styles.itemImg} />
                      <div style={styles.sliderRow}>
                        <input
                          type="range"
                          min={MIN_SCALE}
                          max={MAX_SCALE}
                          step={0.01}
                          value={it.scale}
                          onChange={(e) => handleScaleChange(it.id, parseFloat(e.target.value))}
                          style={styles.slider}
                        />
                        <span style={styles.sliderPct}>{Math.round(it.scale * 100)}%</span>
                      </div>
                      <a href={it.resultUrl} download={filenameFromUrl(it.url, 0, new Set())} style={styles.downloadBtnSmall}>
                        Download
                      </a>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

const styles = {
  main: {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    background: "#f4f6f8",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    padding: 24,
  },
  card: {
    background: "#fff",
    borderRadius: 12,
    padding: 32,
    maxWidth: 1000,
    width: "100%",
    boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
    height: "fit-content",
  },
  h1: { margin: 0, fontSize: 22, color: "#0b2135" },
  sub: { color: "#5a6b7a", fontSize: 14, lineHeight: 1.5 },
  textarea: {
    width: "100%",
    marginTop: 16,
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid #d7dde3",
    fontSize: 13,
    fontFamily: "monospace",
    resize: "vertical",
    boxSizing: "border-box",
  },
  actionsRow: { display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" },
  button: {
    padding: "10px 18px",
    borderRadius: 8,
    border: "none",
    background: "#0b2135",
    color: "#fff",
    fontSize: 14,
    cursor: "pointer",
  },
  secondaryButton: {
    background: "#3a7bd5",
  },
  status: { fontSize: 13, color: "#3a7bd5", marginTop: 12 },
  grid: {
    marginTop: 20,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    gap: 16,
  },
  itemCard: {
    border: "1px solid #eee",
    borderRadius: 10,
    overflow: "hidden",
    background: "#fafbfc",
  },
  itemHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "6px 8px",
    background: "#f0f2f4",
    fontSize: 11,
    color: "#5a6b7a",
  },
  itemUrl: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    flex: 1,
  },
  removeBtn: {
    border: "none",
    background: "transparent",
    color: "#5a6b7a",
    fontSize: 16,
    cursor: "pointer",
    lineHeight: 1,
    padding: "0 4px",
  },
  itemBody: { padding: 10 },
  placeholder: {
    height: 160,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    color: "#8a97a3",
    textAlign: "center",
    padding: 8,
  },
  errorBox: {
    height: 160,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    color: "#b3261e",
    textAlign: "center",
    padding: 8,
  },
  retryBtn: {
    padding: "4px 10px",
    borderRadius: 6,
    border: "1px solid #b3261e",
    background: "#fff",
    color: "#b3261e",
    fontSize: 12,
    cursor: "pointer",
  },
  itemImg: {
    width: "100%",
    borderRadius: 6,
    border: "1px solid #eee",
    display: "block",
  },
  sliderRow: { display: "flex", alignItems: "center", gap: 6, marginTop: 8 },
  slider: { flex: 1 },
  sliderPct: { fontSize: 11, color: "#5a6b7a", minWidth: 32, textAlign: "right" },
  downloadBtnSmall: {
    display: "block",
    marginTop: 8,
    textAlign: "center",
    padding: "6px 10px",
    borderRadius: 6,
    background: "#3a7bd5",
    color: "#fff",
    textDecoration: "none",
    fontSize: 12,
  },
};
