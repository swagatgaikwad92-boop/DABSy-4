// Runs backend/vision-worker.js UNCHANGED over local HTTP on :8797. Only the Gemini hostname is redirected to the local stand-in (:8798).
import { createServer } from "node:http"; import { copyFileSync } from "node:fs"; import { fileURLToPath } from "node:url"; import { dirname, join } from "node:path"; import { tmpdir } from "node:os";
const here = dirname(fileURLToPath(import.meta.url)); const tmp = join(tmpdir(), "vision-worker-e2e.mjs"); copyFileSync(join(here, "../backend/vision-worker.js"), tmp);
const worker = (await import(tmp)).default; const real = globalThis.fetch;
globalThis.fetch = (u, i) => real(String(u).replace("https://generativelanguage.googleapis.com", "http://127.0.0.1:8798"), i);
createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c); const body = Buffer.concat(chunks);
  const r = await worker.fetch(new Request("http://127.0.0.1:8797" + req.url, { method: req.method, headers: req.headers, body: ["GET", "HEAD", "OPTIONS"].includes(req.method) ? undefined : body }), { GEMINI_API_KEY: "test-key" });
  res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
}).listen(8797, "127.0.0.1", () => console.log("ready"));
