import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import handler from "../pages/api/remove-background.js";

const originalFetch = globalThis.fetch;
const originalKey = process.env.REMOVE_BG_API_KEY;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.REMOVE_BG_API_KEY;
  else process.env.REMOVE_BG_API_KEY = originalKey;
});

function response() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    send(value) { this.body = value; return this; },
  };
}

test("requires a server-side API key", async () => {
  delete process.env.REMOVE_BG_API_KEY;
  const res = response();
  await handler({ method: "POST", body: { imageUrl: "https://example.com/a.jpg" } }, res);
  assert.equal(res.statusCode, 503);
  assert.match(res.body.error, /REMOVE_BG_API_KEY/);
});

test("rejects invalid image URLs before calling remove.bg", async () => {
  process.env.REMOVE_BG_API_KEY = "test-key";
  globalThis.fetch = () => { throw new Error("fetch should not run"); };
  const res = response();
  await handler({ method: "POST", body: { imageUrl: "file:///secret" } }, res);
  assert.equal(res.statusCode, 400);
});

test("sends the URL and secret to remove.bg and returns its PNG", async () => {
  process.env.REMOVE_BG_API_KEY = "test-key";
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://api.remove.bg/v1.0/removebg");
    assert.equal(options.headers["X-Api-Key"], "test-key");
    assert.equal(options.body.get("image_url"), "https://example.com/a.jpg");
    assert.equal(options.body.get("size"), "auto");
    assert.equal(options.body.get("format"), "png");
    return { ok: true, arrayBuffer: async () => Uint8Array.from([137, 80, 78, 71]).buffer };
  };
  const res = response();
  await handler({ method: "POST", body: { imageUrl: "https://example.com/a.jpg" } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Content-Type"], "image/png");
  assert.deepEqual(res.body, Buffer.from([137, 80, 78, 71]));
});

test("shows remove.bg credit errors without exposing the API key", async () => {
  process.env.REMOVE_BG_API_KEY = "test-key";
  globalThis.fetch = async () => ({
    ok: false,
    status: 402,
    json: async () => ({ errors: [{ title: "Insufficient credits" }] }),
  });
  const res = response();
  await handler({ method: "POST", body: { imageUrl: "https://example.com/a.jpg" } }, res);
  assert.equal(res.statusCode, 402);
  assert.equal(res.body.error, "Insufficient credits");
  assert.doesNotMatch(JSON.stringify(res.body), /test-key/);
});
