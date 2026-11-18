/* ============================================================
   DABSy vision Worker  (v12.1.2)  —  a SEPARATE, small Cloudflare Worker. It does not replace or touch `dabsy-brain`.
   Contract (same shape DABSy already uses):
       POST /   { message: string, image?: { mimeType, data (base64, no "data:" prefix) }, system?: string, json?: boolean }
            ->  { reply: string }                     (errors: { error: "..." } with a non-200 status)
       GET  /health -> { ok: true, vision: true }
   It forwards the picture to Google Gemini (free tier, the SAME kind of key your dabsy-brain already uses) as `inline_data`.
   Secrets / vars (Cloudflare dashboard -> Worker -> Settings -> Variables):
       GEMINI_API_KEY   (secret, required)         your Gemini API key — never put it in the app or in this file
       GEMINI_MODEL     (optional)                 tried first; falls back through gemini-2.5-flash, gemini-2.0-flash, gemini-flash-latest
       ALLOWED_ORIGIN   (optional)                 e.g. https://yourname.github.io  (blocks other websites from using your key)
       MAX_TOKENS       (optional, default 800)
   Nothing is logged or stored; images exist only in memory for the duration of the request.
   ============================================================ */
const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest"];
const MAX_B64 = 5_500_000;                       // ~4 MB of image
const OK_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export default {
  async fetch(request, env, ctx){
    const origin = request.headers.get("Origin") || "";
    const allow = env.ALLOWED_ORIGIN ? (origin === env.ALLOWED_ORIGIN ? origin : "") : "*";
    const cors = { "Access-Control-Allow-Origin": allow || "null", "Access-Control-Allow-Methods": "POST, GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400", "Vary": "Origin" };
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: Object.assign({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, cors) });
    if(request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if(env.ALLOWED_ORIGIN && origin && origin !== env.ALLOWED_ORIGIN) return json({ error: "origin-not-allowed" }, 403);
    const url = new URL(request.url);
    if(request.method === "GET") return json({ ok: true, vision: true, keyConfigured: !!env.GEMINI_API_KEY });
    if(request.method !== "POST") return json({ error: "method-not-allowed" }, 405);
    if(!env.GEMINI_API_KEY) return json({ error: "server-not-configured" }, 500);

    let body; try{ body = await request.json(); }catch(_){ return json({ error: "bad-json" }, 400); }
    const message = typeof body.message === "string" ? body.message : "";
    if(!message.trim() || message.length > 12000) return json({ error: "bad-message" }, 400);
    const parts = [{ text: message }];
    if(body.image){
      const img = body.image, mime = String(img.mimeType || "image/jpeg").toLowerCase();
      if(!OK_MIME.has(mime) || typeof img.data !== "string" || !/^[A-Za-z0-9+/=\s]+$/.test(img.data.slice(0, 2000))) return json({ error: "bad-image" }, 400);
      if(img.data.length > MAX_B64) return json({ error: "image-too-large" }, 413);
      parts.push({ inline_data: { mime_type: mime, data: img.data.replace(/\s+/g, "") } });    // the picture goes AFTER the instruction, byte-for-byte
    }
    const payload = {
      contents: [{ role: "user", parts }],
      generationConfig: { maxOutputTokens: Math.min(parseInt(env.MAX_TOKENS || "800", 10) || 800, 2048), temperature: body.json ? 0.1 : 0.5 },
    };
    if(body.system && typeof body.system === "string") payload.systemInstruction = { parts: [{ text: body.system.slice(0, 6000) }] };
    if(body.json) payload.generationConfig.responseMimeType = "application/json";

    const chain = [env.GEMINI_MODEL, ...MODELS].filter((m, i, a) => m && a.indexOf(m) === i);
    let last = { status: 502, error: "provider" };
    for(const model of chain){
      let res;
      try{
        res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY }, body: JSON.stringify(payload) });
      }catch(_){ last = { status: 502, error: "provider-unreachable" }; continue; }
      if(res.status === 404 || res.status === 400){                                   // unknown/retired model name -> try the next one
        let t = ""; try{ t = await res.text(); }catch(_){}
        if(res.status === 400 && !/model|not found|unsupported/i.test(t)) return json({ error: "provider-rejected" }, 502);
        last = { status: 502, error: "model-unavailable" }; continue;
      }
      if(res.status === 429) return json({ error: "rate-limited" }, 429);
      if(!res.ok){ last = { status: 502, error: "provider" }; continue; }
      let data; try{ data = await res.json(); }catch(_){ last = { status: 502, error: "bad-provider-reply" }; continue; }
      const cand = data && data.candidates && data.candidates[0];
      const text = cand && cand.content && Array.isArray(cand.content.parts) ? cand.content.parts.map(p => p.text || "").join("").trim() : "";
      if(!text){ last = { status: 502, error: cand && cand.finishReason === "SAFETY" ? "blocked" : "empty" }; continue; }
      return json({ reply: text, model });
    }
    return json({ error: last.error }, last.status);
  },
};
