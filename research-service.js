/* ============================================================
   D.A.B.S.y — research-service.js : finding REAL study material
   Pipeline (every step is a real call; nothing is invented):
     1. understand  : topic words + time budget from the goal
     2. discover    : search providers run in parallel
          - "worker"  your search Worker (config.search.url, backend/worker.js):
                      YouTube + PDF discovery, server-side verification
          - "piped"   public Piped API instances (videos, browser-direct)
          - "wiki"    Wikipedia API (articles, browser-direct, CORS-open)
          - "archive" Internet Archive (open-licence PDFs, browser-direct)
     3. inspect     : URL validity, YouTube id, host, duration, title/snippet
                      overlap with the topic, source quality, fit to the time
     4. rank        : local score; if the AI is reachable it also judges
                      relevance by INDEX only (it never supplies URLs)
     5. explain     : each result gets a short "why this" + plan role
   If nothing real is found the result is EMPTY with an honest reason.
   Search-engine link cards are never returned as recommendations.
   Result: { resources, mode: "web"|"partial"|"none", note, providers, ranked: "ai"|"local" }
   ============================================================ */
(function(){
  const D = window.DABSy;
  const ai = D.ai, memory = D.memory, learning = D.learning;
  const LKEY = "library_v1";
  const cfg = () => (D.config.search || {});

  /* ---------- small helpers ---------- */
  const isHttp = u => { try{ const x = new URL(u); return x.protocol === "https:" || x.protocol === "http:"; }catch(e){ return false; } };
  const hostOf = u => { try{ return new URL(u).hostname.replace(/^www\./, ""); }catch(e){ return ""; } };
  const ytId = u => {
    try{
      const x = new URL(u), h = x.hostname.replace(/^(www\.|m\.|music\.)/, "");
      let id = null;
      if(h === "youtu.be") id = x.pathname.slice(1).split("/")[0];
      else if(h === "youtube.com" || h === "youtube-nocookie.com") id = x.pathname === "/watch" ? x.searchParams.get("v") : (x.pathname.match(/^\/(embed|shorts|live)\/([\w-]{11})/) || [])[2];
      return id && /^[\w-]{11}$/.test(id) ? id : null;
    }catch(e){ return null; }
  };
  const STOP = new Set("a an the and or of to in on for with about me my i is are be understand learn study explain help want need get how what why this that it its into from at by as lesson lessons video videos pdf notes tutorial introduction basic basics class grade chapter minutes minute min mins hour hours".split(" "));
  function tokens(s){
    return String(s || "").toLowerCase().replace(/[’']s\b/g, "").replace(/[^a-z0-9\u0900-\u097f\s]/g, " ").split(/\s+/)
      .filter(w => w && !STOP.has(w) && (w.length > 2 || /\d/.test(w))).map(w => w.replace(/(ies)$/, "y").replace(/(es|s)$/, m => w.length > 4 ? "" : m));
  }
  const withTimeout = (p, ms) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error("timeout")), ms); p.then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); }); });
  async function getJSON(url, ms, opts){
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms || 8000);
    try{ const r = await fetch(url, Object.assign({ signal: ctl.signal }, opts || {})); if(!r.ok) throw new Error("http-" + r.status); return await r.json(); }
    finally{ clearTimeout(t); }
  }


  /* ---------- v12: the student's own words about what they prefer ----------
     "I want visual explanations, animated videos and beginner-friendly explanations. Avoid lengthy PDFs."
     parsePrefs() reads that locally (no network, always works); applyPrefs() re-ranks / filters real candidates with it.
     Nothing is ever added that a provider did not return. */
  const TYPE_WORDS = { video: /\b(videos?|youtube|lectures?|animations?|animated|clips?)\b/i, pdf: /\b(pdfs?|notes|textbooks?|books?|handouts?|worksheets?|documents?)\b/i, article: /\b(articles?|wikipedia|blogs?|web ?pages?|text|reading)\b/i };
  function parsePrefs(text){
    const raw = String(text || "").trim(); if(!raw) return null;
    const P = { raw, want: {}, avoid: {}, flags: [], maxMin: null };
    raw.split(/(?<=[.;!?])\s+|[\n,;]+|\bbut\b|\bhowever\b/i).forEach(seg => {
      if(!seg.trim()) return;
      const neg = /\b(avoid|no|not|without|skip|don'?t want|do not want|not interested in|except|rather than|instead of)\b/i.test(seg);
      const into = neg ? P.avoid : P.want;
      Object.keys(TYPE_WORDS).forEach(t => { if(TYPE_WORDS[t].test(seg)) into[t] = true; });
      if(neg){ if(/\b(long|lengthy|big|heavy|huge|large|thick|detailed|dense|boring)\b/i.test(seg)) P.avoid.long = true; if(/\b(advanced|hard|difficult|complex|technical|jargon)\b/i.test(seg)) P.avoid.advanced = true; return; }
      if(/\b(visual|diagrams?|animat\w*|illustrat\w*|pictures?|graphics?|simulat\w*|interactive|see it|show me)\b/i.test(seg)) P.flags.push("visual");
      if(/\b(beginner|basics?|basic|simple|simply|easy|easier|intro\w*|from scratch|first time|newbie|layman|eli5|friendly)\b/i.test(seg)) P.flags.push("beginner");
      if(/\b(advanced|jee|in[- ]depth|deep dive|rigorous|challenging|olympiad)\b/i.test(seg)) P.flags.push("advanced");
      if(/\b(short|quick|brief|concise|crisp|few minutes|bite[- ]sized)\b/i.test(seg)) P.flags.push("short");
      if(/\b(practice|problems?|questions?|numericals?|mcq|quiz|exercises?|worked examples?)\b/i.test(seg)) P.flags.push("practice");
      const m = seg.match(/\b(?:under|within|less than|below|max(?:imum)?|up to)\s*(\d{1,3})\s*(?:min|minutes|mins)\b/i); if(m) P.maxMin = +m[1];
    });
    if(P.avoid.long) P.flags.push("short");
    P.flags = Array.from(new Set(P.flags));
    return P;
  }
  const prefSummary = P => P ? [].concat(
    Object.keys(P.want).map(t => t === "video" ? "videos" : t === "pdf" ? "PDF notes" : "articles"),
    P.flags.map(f => ({ visual: "visual", beginner: "beginner-friendly", advanced: "in-depth", short: "short", practice: "practice" }[f])),
    P.maxMin ? ["under " + P.maxMin + " min"] : [],
    Object.keys(P.avoid).map(t => "no " + ({ video: "videos", pdf: "PDFs", article: "articles", long: "long material", advanced: "heavy jargon" }[t]))).filter(Boolean).join(", ") : "";
  function applyPrefs(list, P){
    if(!P) return list;
    const txt = r => ((r.title || "") + " " + (r.description || "")).toLowerCase();
    const out = [];
    list.forEach(r => {
      const t = txt(r), why = [];
      if(P.avoid[r.type]) return;                                                    // explicitly not wanted
      if(P.avoid.long){
        if(r.type === "pdf" && ((r.pages && r.pages > 15) || (r.sizeBytes && r.sizeBytes > 1.5e6))) return;
        if(r.type === "video" && r.durationMin && r.durationMin > 25) return;
      }
      if(P.maxMin && r.type === "video" && r.durationMin && r.durationMin > P.maxMin) return;
      let d = 0;
      if(P.want[r.type]){ d += 0.22; why.push("a " + (r.type === "pdf" ? "PDF" : r.type) + ", as you asked"); }
      if(P.flags.includes("visual")){
        if(/\b(animat\w*|visual\w*|diagram|simulat\w*|illustrat\w*|interactive|explained|intuition|3d)\b/.test(t)){ d += 0.2; why.push("visual or animated"); }
        else if(r.type === "video"){ d += 0.08; }
      }
      if(P.flags.includes("beginner")){
        if(/\b(beginner\w*|basics?|introduction|intro|simple|simply|easy|easily|from scratch|for kids|made easy|explained)\b/.test(t)){ d += 0.2; why.push("beginner-friendly"); }
        if(/\b(advanced|jee|olympiad|graduate|derivation|rigorous|proof)\b/.test(t)) d -= 0.15;
      }
      if(P.flags.includes("advanced")){
        if(/\b(advanced|jee|olympiad|in[- ]depth|derivation|rigorous|problems)\b/.test(t)){ d += 0.2; why.push("in-depth"); }
        if(/\b(for kids|beginner\w*|basic)\b/.test(t)) d -= 0.1;
      }
      if(P.flags.includes("short")){
        if(r.type === "video" && r.durationMin){ if(r.durationMin <= 12){ d += 0.18; why.push("short"); } else if(r.durationMin > 20) d -= 0.18; }
        if(r.type === "pdf") d -= 0.12;
      }
      if(P.flags.includes("practice") && /\b(practice|problems?|questions?|exercise\w*|numericals?|mcq|quiz|worksheet)\b/.test(t)){ d += 0.2; why.push("practice material"); }
      if(P.avoid.advanced && /\b(advanced|jee|olympiad|graduate|rigorous)\b/.test(t)) d -= 0.2;
      const c = Object.assign({}, r, { relevance: Math.max(0, Math.min(1, r.relevance + d)), _rank: (r._rank != null ? r._rank : r.relevance) + d });
      if(why.length) c.prefWhy = why;
      out.push(c);
    });
    return out.sort((a, b) => (b._rank != null ? b._rank : b.relevance) - (a._rank != null ? a._rank : a.relevance));
  }
  // extra search words so the providers themselves are asked for the right KIND of thing
  function prefQuery(P){
    if(!P) return "";
    const w = [];
    if(P.flags.includes("visual")) w.push("animation visual explanation");
    if(P.flags.includes("beginner")) w.push("basics for beginners");
    if(P.flags.includes("advanced")) w.push("advanced");
    if(P.flags.includes("practice")) w.push("practice problems");
    if(P.want.pdf && !P.want.video) w.push("pdf notes");
    return w.join(" ");
  }

  /* ---------- goal -> query ---------- */
  function topicWords(goal){ return [goal.topic, goal.subject].filter(Boolean).join(" ").trim() || goal.raw || ""; }
  function queryFor(goal){
    const core = [goal.level, goal.subject !== goal.topic ? goal.subject : "", goal.topic].filter(Boolean).join(" ").trim() || goal.raw || "study";
    return core;
  }
  const wantsPractice = g => g.mode === "practice" || /\b(practice|questions|problems|mcq|quiz|worksheet)\b/i.test(g.raw || "");
  const wantsPdf = g => /\b(pdf|notes|textbook|book|handout|worksheet)\b/i.test(g.raw || "") || (g.formats || []).includes("pdf");

  /* ---------- providers (each returns raw candidates) ---------- */
  async function pWorker(goal, q){
    const base = String(cfg().url || "").replace(/\/+$/, "");
    if(!base) throw new Error("not-configured");
    const r = await getJSON(base + "/v1/research", cfg().timeoutMs || 12000, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q, subject: goal.subject, level: goal.level, maxResults: 12, maxMinutes: Math.max(10, Math.round((goal.minutes || 30) * 1.6)), wantPdf: wantsPdf(goal) }) });
    if(r.ok === false) throw new Error(r.error || "search-failed");
    return (r.results || []).map(x => Object.assign({ provider: "worker" }, x));
  }
  async function pPiped(goal, q){
    const list = cfg().piped || [];
    let lastErr = new Error("no-instances");
    for(const inst of list){
      try{
        const d = await getJSON(inst.replace(/\/+$/, "") + "/search?q=" + encodeURIComponent(q + " explained") + "&filter=videos", 7000);
        const items = (d.items || []).filter(i => i && i.url && /watch\?v=/.test(i.url) && !i.isShort);
        if(!items.length) throw new Error("empty");
        return items.slice(0, 12).map(i => ({ provider: "piped", title: i.title, url: "https://www.youtube.com/watch?v=" + new URL(i.url, "https://x.invalid").searchParams.get("v"),
          source: i.uploaderName || "youtube.com", type: "video", durationMin: i.duration > 0 ? Math.max(1, Math.round(i.duration / 60)) : null,
          description: i.shortDescription || "", views: i.views || 0, channelVerified: !!i.uploaderVerified }));
      }catch(e){ lastErr = e; }
    }
    throw lastErr;
  }
  async function pWiki(goal, q){
    const d = await getJSON("https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=" + encodeURIComponent(q) + "&srlimit=4&format=json&origin=*", 7000);
    return ((d.query && d.query.search) || []).map(x => ({ provider: "wiki", title: x.title + " (Wikipedia)", url: "https://en.wikipedia.org/wiki/" + encodeURIComponent(x.title.replace(/ /g, "_")), source: "wikipedia.org", type: "article",
      durationMin: null, description: String(x.snippet || "").replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&") }));
  }
  async function pArchive(goal, q){
    const url = "https://archive.org/advancedsearch.php?q=" + encodeURIComponent("(" + q + ") AND mediatype:texts AND format:(Text PDF)") + "&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=description&rows=4&output=json";
    const d = await getJSON(url, 8000);
    const docs = (d.response && d.response.docs) || [];
    const out = [];
    for(const x of docs){
      try{
        const m = await getJSON("https://archive.org/metadata/" + encodeURIComponent(x.identifier), 6000);
        const f = (m.files || []).find(f => /pdf/i.test(f.format || "") && /\.pdf$/i.test(f.name || ""));
        if(!f) continue;
        out.push({ provider: "archive", title: String(x.title || x.identifier).slice(0, 140), url: "https://archive.org/download/" + encodeURIComponent(x.identifier) + "/" + encodeURIComponent(f.name), source: "archive.org", type: "pdf",
          durationMin: null, sizeBytes: Number(f.size) || null, pages: Number(m.metadata && m.metadata.imagecount) || null, description: String(Array.isArray(x.description) ? x.description[0] : x.description || "").replace(/<[^>]+>/g, "").slice(0, 200) });
      }catch(e){}
    }
    return out;
  }

  /* ---------- inspection + scoring ---------- */
  const GOOD_HOSTS = /(khanacademy|openstax|ncert|nptel|ocw\.mit|physicsclassroom|chem\.libretexts|libretexts|byjus|toppr|vedantu|britannica|nasa\.gov|hyperphysics|phet\.colorado|ck12|hmhco|wikipedia|archive\.org)/i;
  const GOOD_CHANNELS = /(khan academy|crashcourse|crash course|ted-?ed|mit opencourseware|the organic chemistry tutor|professor dave|physics wallah|physicswallah|vedantu|byju|3blue1brown|veritasium|minutephysics|amoeba sisters|the physics classroom|nptel|unacademy|study ?iq|learnoholic|fuse school|freesciencelessons|ncert)/i;
  const BAD_TITLE = /(#shorts|\bshorts\b|reaction|prank|meme|asmr|trailer|compilation|full movie|clickbait|live stream|podcast|song|lyrics|remix)/i;

  function inspect(c, goal, budget){
    if(!c || !c.url || !isHttp(c.url)) return null;
    const type = c.type === "video" || ytId(c.url) ? "video" : (c.type || (/\.pdf(\?|$)/i.test(c.url) ? "pdf" : "article"));
    let url = c.url, id = null;
    if(type === "video"){ id = ytId(c.url); if(!id) return null; url = "https://www.youtube.com/watch?v=" + id; }
    if(BAD_TITLE.test(c.title || "")) return null;
    const topic = tokens(topicWords(goal));
    const hay = new Set(tokens((c.title || "") + " " + (c.description || "")));
    const inTitle = new Set(tokens(c.title || ""));
    const hit = topic.filter(w => hay.has(w)), hitT = topic.filter(w => inTitle.has(w));
    const overlap = topic.length ? hit.length / topic.length : 0.5;
    if(topic.length && overlap < 0.5 && c.provider !== "worker") return null;       // not about this topic
    if(topic.length && hitT.length === 0 && overlap < 0.67) return null;
    const dur = c.durationMin || null;
    let fit = 0.6;
    if(type === "video" && dur){
      if(dur < 3) return null;                                                      // too thin to teach anything
      if(dur <= budget) fit = dur >= 6 ? 1 : 0.75; else if(dur <= budget * 1.6) fit = 0.45; else return null;
    }
    const quality = (GOOD_HOSTS.test(hostOf(url)) || GOOD_CHANNELS.test(c.source || "") ? 1 : 0.6) * (learning ? learning.sourceWeight(hostOf(url)) : 1);
    const typePref = (learning ? learning.typeWeight(type) : 1) * (type === "pdf" && !wantsPdf(goal) ? 0.8 : 1);
    const score = 0.5 * (0.35 + 0.65 * overlap) + 0.2 * fit + 0.15 * Math.min(1, quality) + 0.15 * Math.min(1, typePref);
    return {
      id: "r-" + Math.random().toString(36).slice(2, 8), title: String(c.title || hostOf(url)).replace(/\s+/g, " ").slice(0, 140), url, source: c.source || hostOf(url), host: hostOf(url),
      type, durationMin: dur, partial: !!(type === "video" && dur && dur > budget), description: String(c.description || "").replace(/\s+/g, " ").slice(0, 220), provider: c.provider,
      videoId: id, relevance: Math.max(0, Math.min(1, score)), matched: hit.slice(0, 4), verified: !!(c.verified || c.embeddable === true || c.pdfVerified === true), sizeBytes: c.sizeBytes || null, pages: c.pages || null, origin: "search",
    };
  }
  function dedupe(list){
    const seen = new Set(), out = [];
    list.sort((a, b) => b.relevance - a.relevance).forEach(r => { const k = r.videoId || r.url.replace(/[#?].*$/, "").replace(/\/$/, ""); if(!seen.has(k)){ seen.add(k); out.push(r); } });
    return out;
  }

  /* ---------- optional AI judgement (index-only) ---------- */
  async function aiJudge(goal, list, P){
    if(!ai || ai.status() === "limited" || !list.length) return null;
    const lines = list.map((r, i) => `${i}. [${r.type}] ${r.title} | ${r.source} | ${r.durationMin ? r.durationMin + " min" : "length unknown"} | ${r.description.slice(0, 110)}`).join("\n");
    const o = await ai.askJSON({ task: "rank", prompt: [
      `A student wants: "${goal.raw || topicWords(goal)}"${goal.level ? " (" + goal.level + ")" : ""}, with ${goal.minutes || 30} minutes available.`,
      P ? "The student also said what they prefer: \"" + P.raw.slice(0, 300) + "\". Prefer matching items, and mark items that clearly go against it relevant:false." : "",
      "Judge ONLY the candidates below. Never add or invent items or links.", lines,
      'Reply ONLY with JSON: {"items":[{"i":<index>,"relevant":true|false,"why":"<=90 chars, why it helps THIS topic","role":"explain|practice|reference"}]}. Mark spam, off-topic, wrong level or misleading items relevant:false.',
    ].join("\n") });
    return o && Array.isArray(o.items) ? o.items.filter(x => Number.isInteger(x.i) && list[x.i]) : null;
  }

  function whyLine(r, goal, aiWhy, role){
    const bits = [];
    bits.push(aiWhy || (r.matched.length ? `Covers ${r.matched.join(", ")}.` : "Matches your topic."));
    if(r.partial) bits.push(`Longer than your time, so use the first ${Math.max(5, Math.round((goal.minutes || 25) * 0.6))} min.`);
    if(role === "practice") bits.push("Good for practice.");
    return bits.join(" ");
  }

  /* ---------- main ---------- */
  async function find(goal, opts){
    opts = opts || {};
    const P = parsePrefs(opts.prefs), pq = prefQuery(P);
    const q = (queryFor(goal) + (pq ? " " + pq : "")).trim(), total = goal.minutes || 30, budget = Math.max(8, total - 5);
    const lib = P ? applyPrefs(library(goal), P) : library(goal);
    const providers = [["worker", pWorker], ["piped", pPiped], ["wiki", pWiki]];
    if(!(P && P.avoid.pdf) && (wantsPdf(goal) || total >= 30 || (P && P.want.pdf))) providers.push(["archive", pArchive]);
    const results = await Promise.allSettled(providers.map(([n, fn]) => withTimeout(fn(goal, q), (cfg().timeoutMs || 12000) + 3000)));
    const status = {}; let raw = [];
    results.forEach((r, i) => { const n = providers[i][0]; if(r.status === "fulfilled"){ status[n] = "ok:" + r.value.length; raw = raw.concat(r.value); } else status[n] = String(r.reason && r.reason.message || r.reason); });
    // the worker already covers videos; only fall back to Piped results if the worker gave none
    let list = dedupe(raw.map(c => inspect(c, goal, budget)).filter(Boolean));
    let ranked = "local";
    if(P) list = applyPrefs(list, P);
    const judged = await withTimeout(aiJudge(goal, list.slice(0, 14), P), 9000).catch(() => null);   // AI is optional: never let it hold the results hostage
    if(judged && judged.length){
      const keep = [];
      judged.forEach(j => { const r = list[j.i]; if(!r) return; if(j.relevant === false) return; r.aiWhy = String(j.why || "").slice(0, 120); r.role = j.role; r.relevance = Math.min(1, r.relevance + 0.08); keep.push(r); });
      if(keep.length){ list = keep; ranked = "ai"; }
    }
    list.sort((a, b) => (b._rank != null ? b._rank : b.relevance) - (a._rank != null ? a._rank : a.relevance));
    list = list.slice(0, 8);
    list.forEach(r => { r.why = whyLine(r, goal, r.aiWhy, r.role) + (r.prefWhy ? " Matches your preference: " + r.prefWhy.join(", ") + "." : ""); r.sendable = r.type === "video" || r.type === "pdf"; });
    const tried = Object.keys(status);
    const failed = tried.filter(n => !status[n].startsWith("ok"));
    if(!list.length){
      const allDown = tried.every(n => !status[n].startsWith("ok"));
      const sm = prefSummary(P);
      return { resources: lib, mode: "none", providers: status, ranked, prefs: sm,
        note: allDown ? "I couldn't reach any search service just now, so I have nothing real to recommend."
          : P ? `I searched again, but nothing I'd trust matched "${sm || P.raw.slice(0, 60)}" for ${topicWords(goal) || "this topic"}. Try loosening one thing, for example allowing PDFs or longer videos.`
          : `I searched but found nothing I'd trust for "${topicWords(goal) || q}" in ${total} minutes.` };
    }
    const hasVideo = list.some(r => r.type === "video");
    const note = [ranked === "local" && ai && ai.status() !== "limited" ? "I ranked these myself because the AI didn't answer." : "",
      !hasVideo ? "I couldn't find a video that fits." : "", failed.length ? "Some sources were unavailable (" + failed.join(", ") + ")." : "",
      list.some(r => r.type === "video" && !r.verified) ? "Embedding wasn't pre-checked for videos; Study Space will tell you if one can't play." : ""].filter(Boolean).join(" ");
    return { resources: list.concat(lib.filter(l => !list.some(r => r.url === l.url))), mode: failed.length || !hasVideo ? "partial" : "web", providers: status, ranked, note, prefs: prefSummary(P) };
  }

  function library(goal){
    const lib = memory.read(LKEY, []);
    const s = (goal.subject || "").toLowerCase();
    return lib.filter(x => s && x.subject === s && x.r && x.r.url && (x.r.type === "video" || x.r.type === "pdf")).slice(-2)
      .map(x => Object.assign({}, x.r, { id: "lib-" + x.r.id, origin: "library", relevance: 0.5, why: "You used this before.", sendable: true, matched: [], videoId: ytId(x.r.url) }));
  }
  function remember(chosen, goal){
    const lib = memory.read(LKEY, []);
    chosen.filter(r => r.origin === "search").forEach(r => {
      if(lib.some(x => x.r.url === r.url)) return;
      lib.push({ subject: (goal.subject || "").toLowerCase(), at: Date.now(), r: { id: r.id.replace(/^lib-/, ""), title: r.title, url: r.url, source: r.source, type: r.type, durationMin: r.durationMin, description: r.description } });
    });
    memory.write(LKEY, lib.slice(-30));
  }
  // honest manual options when nothing was found: these are SEARCHES the student runs themselves, never presented as picks
  function searchLinks(goal){
    const q = encodeURIComponent(queryFor(goal));
    return [{ label: "Search YouTube yourself", url: "https://www.youtube.com/results?search_query=" + q }, { label: "Search the web yourself", url: "https://www.google.com/search?q=" + q + "+notes" }];
  }

  window.DABSy.research = { find, remember, queryFor, searchLinks, inspect, ytId, tokens, parsePrefs, applyPrefs, prefSummary };
})();
