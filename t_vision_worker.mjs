// Runs backend/vision-worker.js in node with a STUBBED Gemini (no network, no key). Proves the Worker code preserves the image bytes and
// builds a valid Gemini multimodal request. It does NOT prove anything about the real Gemini service or your deployed Worker.
import { copyFileSync } from "node:fs"; import { fileURLToPath } from "node:url"; import { dirname, join } from "node:path"; import { tmpdir } from "node:os";
const here = dirname(fileURLToPath(import.meta.url)); const tmp = join(tmpdir(), "vision-worker-test.mjs"); copyFileSync(join(here, "../backend/vision-worker.js"), tmp);   // .js is CommonJS to node; Cloudflare reads it as a module
const worker = (await import(tmp)).default;
let pass = 0, fail = 0; const t = (n, c, d) => { c ? pass++ : (fail++, console.log("FAIL", n, d ?? "")); };
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const b64 = png.toString("base64"); let seen = null; const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => { seen = { url: String(url), init, body: JSON.parse(init.body) };
  if(String(url).includes("gemini-2.5-flash")) return new Response("{\"error\":{\"message\":\"model not found\"}}", { status: 404 });
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "It's a cat." }] } }] }), { status: 200 }); };
const env = { GEMINI_API_KEY: "test-key" };
const req = (b, h = {}) => new Request("https://w.example/", { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, h), body: JSON.stringify(b) });
let r = await worker.fetch(req({ message: "What is this?", image: { mimeType: "image/png", data: b64 } }), env); let j = await r.json();
t("returns {reply}", r.status === 200 && j.reply === "It's a cat.", JSON.stringify(j));
t("falls through retired model (2.5 -> 2.0)", seen.url.includes("gemini-2.0-flash") && j.model === "gemini-2.0-flash", seen.url);
const parts = seen.body.contents[0].parts;
t("instruction first, image second", parts[0].text === "What is this?" && !!parts[1].inline_data);
t("image bytes preserved exactly", Buffer.from(parts[1].inline_data.data, "base64").equals(png));
t("mime preserved", parts[1].inline_data.mime_type === "image/png");
t("API key sent as header, not URL/body", seen.init.headers["x-goog-api-key"] === "test-key" && !seen.url.includes("test-key") && !JSON.stringify(seen.body).includes("test-key"));
r = await worker.fetch(req({ message: "hi" }), env); j = await r.json(); t("text-only chat still works", r.status === 200 && seen.body.contents[0].parts.length === 1);
r = await worker.fetch(req({ message: "x", image: { mimeType: "image/gif", data: b64 } }), env); t("rejects unsupported mime", r.status === 400);
r = await worker.fetch(req({ message: "x", image: { mimeType: "image/png", data: "A".repeat(6_000_000) } }), env); t("rejects oversize image", r.status === 413);
r = await worker.fetch(req({ message: "x" }), {}); t("missing key -> server-not-configured", r.status === 500);
r = await worker.fetch(req({ message: "x" }, { Origin: "https://evil.example" }), { GEMINI_API_KEY: "k", ALLOWED_ORIGIN: "https://me.github.io" }); t("origin allow-list blocks others", r.status === 403);
r = await worker.fetch(new Request("https://w.example/", { method: "OPTIONS" }), env); t("CORS preflight ok", r.status === 204 && r.headers.get("Access-Control-Allow-Origin") === "*");
r = await worker.fetch(req({ message: "x", system: "be brief", json: true, image: { mimeType: "image/png", data: b64 } }), env); t("system + json mode forwarded", seen.body.systemInstruction && seen.body.generationConfig.responseMimeType === "application/json");
globalThis.fetch = realFetch; console.log(`${pass} pass ${fail} fail`); process.exit(fail ? 1 : 0);
