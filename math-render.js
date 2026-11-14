/* ============================================================
   D.A.B.S.y — math-render.js (v12)
   Proper mathematics for Study Mode.
     D.math.ready()                  -> Promise: loads KaTeX (+ mhchem for \ce{}) once, from ./vendor/katex (also cached by the service worker)
     D.math.rich(text)               -> Promise<DocumentFragment>: headings, step labels, lists, **bold**, `code`, and $..$ $$..$$ \(..\) \[..\] maths
     D.math.renderInto(el, text)     -> same, and puts the result in el
     D.math.hasMath(text)            -> does the text contain maths delimiters?
     D.math.speakable(text)          -> the text with every formula turned into words, for speech ("v squared equals u squared plus 2 a s")
     D.math.repair(text)             -> repairs control characters left by JSON escaping ("\f" in \frac, "\t" in \times ...)
   Safety: model text is only ever inserted as text nodes. KaTeX output is created by KaTeX with trust:false. A formula KaTeX cannot parse is shown
   as its own source in a code chip, never as garbled symbols.
   ============================================================ */
(function(){
  "use strict";
  const D = window.DABSy = window.DABSy || {};
  const BASE = (() => { try{ const s = document.currentScript && document.currentScript.src; return s ? s.replace(/[^/]*$/, "") : "./"; }catch(e){ return "./"; } })();
  let loading = null;

  function loadScript(src){ return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.async = true; s.onload = res; s.onerror = () => rej(new Error("load " + src)); document.head.append(s); }); }
  function loadCss(href){ return new Promise(res => { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; l.onload = res; l.onerror = res; document.head.append(l); }); }
  function ready(){
    if(loading) return loading;                 // one load for everyone: KaTeX AND the chemistry extension, never half-ready
    if(window.katex && window.__dabsyMhchem) return Promise.resolve(true);
    loading = Promise.all([loadCss(BASE + "vendor/katex/katex.min.css"), loadCss(BASE + "math.css"), loadScript(BASE + "vendor/katex/katex.min.js")])
      .then(() => loadScript(BASE + "vendor/katex/mhchem.min.js").catch(() => {}))
      .then(() => { window.__dabsyMhchem = true; return true; })
      .catch(e => { loading = null; console.warn("KaTeX could not be loaded:", e); return false; });
    return loading;
  }

  /* ---------- escapes damaged by JSON ---------- */
  function repair(t){
    return String(t == null ? "" : t)
      .replace(/\u000c/g, "\\f").replace(/\u0008/g, "\\b").replace(/\u0007/g, "\\a").replace(/\u000b/g, "\\v")
      .replace(/\t(?=[A-Za-z])/g, "\\t").replace(/\r(?=[A-Za-z])/g, "\\r");
  }

  /* ---------- splitting text into plain / math parts ---------- */
  const PAT = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$(?!\s)((?:\\\$|[^$\n])+?)(?<![\s\\])\$(?!\d)/g;
  function split(text){
    const out = []; let last = 0, m; PAT.lastIndex = 0;
    while((m = PAT.exec(text))){
      if(m.index > last) out.push({ t: "text", v: text.slice(last, m.index) });
      const display = m[1] != null || m[2] != null;
      out.push({ t: "math", v: (m[1] != null ? m[1] : m[2] != null ? m[2] : m[3] != null ? m[3] : m[4]).trim(), display });
      last = m.index + m[0].length;
    }
    if(last < text.length) out.push({ t: "text", v: text.slice(last) });
    return out;
  }
  const hasMath = t => { PAT.lastIndex = 0; const r = PAT.test(String(t || "")); PAT.lastIndex = 0; return r; };

  function mathNode(tex, display){
    const holder = document.createElement(display ? "div" : "span");
    holder.className = display ? "mx-display" : "mx-inline";
    try{
      if(!window.katex) throw new Error("no katex");
      window.katex.render(tex, holder, { displayMode: !!display, throwOnError: true, strict: "ignore", trust: false, maxExpand: 1000, output: "htmlAndMathml" });
      holder.setAttribute("data-tex", tex);
    }catch(e){
      holder.className = "mx-raw"; holder.textContent = tex; holder.title = "I couldn't draw this formula, so here is how it is written.";
    }
    return holder;
  }

  /* ---------- inline markdown-lite (bold, code) around math ---------- */
  function inline(parent, text){
    const parts = split(text);
    parts.forEach(p => {
      if(p.t === "math"){ parent.append(mathNode(p.v, false)); return; }
      let s = p.v; const re = /\*\*([^*]+?)\*\*|`([^`]+?)`/g; let last = 0, m;
      while((m = re.exec(s))){
        if(m.index > last) parent.append(document.createTextNode(s.slice(last, m.index)));
        if(m[1] != null){ const b = document.createElement("strong"); b.textContent = m[1]; parent.append(b); }
        else { const c = document.createElement("code"); c.textContent = m[2]; parent.append(c); }
        last = m.index + m[0].length;
      }
      if(last < s.length) parent.append(document.createTextNode(s.slice(last)));
    });
  }

  const LABELS = /^\s*(?:\*\*)?(given|find|to find|required|concept|idea|why (?:this|it) (?:formula )?applies|formula|substitut(?:e|ion)|solve|solution|working|check|verify|verification|sanity check|units|dimensions?|dimension check|answer|final answer|takeaway|note|example)(?:\*\*)?\s*[:：]\s*(?:\*\*)?/i;

  async function rich(text){
    text = repair(text);
    if(hasMath(text) || /\\ce\{/.test(text)) await ready();
    const frag = document.createDocumentFragment();
    // 1. display maths that sits on its own lines becomes its own block, even across several lines
    const lines = text.replace(/\r\n?/g, "\n").split("\n");
    let para = [], list = null;
    const flushPara = () => { if(!para.length) return; const p = document.createElement("p"); p.className = "mx-p"; inline(p, para.join(" ")); frag.append(p); para = []; };
    const flushList = () => { if(list){ frag.append(list); list = null; } };
    let i = 0;
    while(i < lines.length){
      let line = lines[i];
      // multi-line $$ ... $$ or \[ ... \]
      const open = line.match(/^\s*(\$\$|\\\[)(.*)$/);
      if(open && !(open[1] === "$$" && /\$\$\s*$/.test(open[2])) && !(open[1] === "\\[" && /\\\]\s*$/.test(open[2]))){
        const close = open[1] === "$$" ? "$$" : "\\]"; let buf = [open[2]]; i++;
        while(i < lines.length && lines[i].indexOf(close) < 0){ buf.push(lines[i]); i++; }
        if(i < lines.length){ buf.push(lines[i].slice(0, lines[i].indexOf(close))); i++; }
        flushPara(); flushList(); frag.append(mathNode(buf.join("\n").trim(), true)); continue;
      }
      if(!line.trim()){ flushPara(); flushList(); i++; continue; }
      const only = line.match(/^\s*(?:\$\$([\s\S]+)\$\$|\\\[([\s\S]+)\\\])\s*$/);
      if(only){ flushPara(); flushList(); frag.append(mathNode((only[1] || only[2]).trim(), true)); i++; continue; }
      const h = line.match(/^\s{0,3}#{1,4}\s+(.*)$/);
      if(h){ flushPara(); flushList(); const e = document.createElement("h4"); e.className = "mx-h"; inline(e, h[1]); frag.append(e); i++; continue; }
      const lab = line.match(LABELS);
      if(lab){
        flushPara(); flushList();
        const row = document.createElement("div"); row.className = "mx-step"; row.dataset.kind = lab[1].toLowerCase().replace(/\s+/g, "-");
        const tag = document.createElement("span"); tag.className = "mx-tag"; tag.textContent = lab[1].replace(/^./, c => c.toUpperCase());
        const body = document.createElement("div"); body.className = "mx-sb"; inline(body, line.slice(lab[0].length));
        row.append(tag, body); frag.append(row); i++; continue;
      }
      const b = line.match(/^\s*(?:[-*•])\s+(.*)$/), n = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
      if(b || n){
        flushPara();
        const tag = n ? "OL" : "UL";
        if(!list || list.tagName !== tag){ flushList(); list = document.createElement(tag.toLowerCase()); list.className = "mx-list"; }
        const li = document.createElement("li"); inline(li, (b || n)[b ? 1 : 2]); list.append(li); i++; continue;
      }
      flushList(); para.push(line.trim()); i++;
    }
    flushPara(); flushList();
    return frag;
  }
  async function renderInto(el, text){ const f = await rich(text); el.textContent = ""; el.append(f); return el; }

  /* ---------- speech: formulas as words ---------- */
  const GREEK = { alpha: "alpha", beta: "beta", gamma: "gamma", delta: "delta", epsilon: "epsilon", varepsilon: "epsilon", zeta: "zeta", eta: "eta", theta: "theta", vartheta: "theta", iota: "iota", kappa: "kappa", lambda: "lambda", mu: "mu", nu: "nu", xi: "xi", pi: "pi", rho: "rho", sigma: "sigma", tau: "tau", upsilon: "upsilon", phi: "phi", varphi: "phi", chi: "chi", psi: "psi", omega: "omega", Gamma: "capital gamma", Delta: "delta", Theta: "capital theta", Lambda: "capital lambda", Xi: "capital xi", Pi: "capital pi", Sigma: "capital sigma", Phi: "capital phi", Psi: "capital psi", Omega: "omega" };
  const WORDS = { times: "times", cdot: "times", div: "divided by", pm: "plus or minus", mp: "minus or plus", approx: "approximately equals", neq: "is not equal to", ne: "is not equal to", leq: "is less than or equal to", le: "is less than or equal to", geq: "is greater than or equal to", ge: "is greater than or equal to", propto: "is proportional to", infty: "infinity", to: "goes to", rightarrow: "gives", Rightarrow: "implies", leftrightarrow: "is equivalent to", int: "integral of", oint: "closed integral of", sum: "sum of", prod: "product of", partial: "partial", nabla: "nabla", sin: "sine", cos: "cosine", tan: "tangent", cot: "cotangent", sec: "secant", csc: "cosecant", log: "log", ln: "natural log of", exp: "e to the", lim: "limit", degree: "degrees", circ: "degrees", hbar: "h bar", ell: "l", cdots: "and so on", ldots: "and so on", dots: "and so on", sim: "is about", equiv: "is identical to", parallel: "parallel to", perp: "perpendicular to", angle: "angle", therefore: "therefore", because: "because", Omega: "ohm" };
  function grab(s, i){            // returns [content, nextIndex] for a {group} or single token at s[i]
    while(s[i] === " ") i++;
    if(s[i] === "{"){ let d = 1, j = i + 1; while(j < s.length && d){ if(s[j] === "{") d++; else if(s[j] === "}") d--; j++; } return [s.slice(i + 1, j - 1), j]; }
    if(s[i] === "\\"){ const m = s.slice(i).match(/^\\[A-Za-z]+|^\\./); return [m ? m[0] : "", i + (m ? m[0].length : 1)]; }
    return [s[i] || "", i + 1];
  }
  function tex2speech(tex){
    let s = String(tex).replace(/\\(?:left|right|big|Big|bigg|Bigg)\b/g, "").replace(/\\[,;:! ]/g, " ").replace(/\\(?:quad|qquad)/g, " ");
    let out = "", i = 0;
    const sp = x => { out += (out && !/\s$/.test(out) && !/^[\s,.]/.test(x) ? " " : "") + x; };
    while(i < s.length){
      const c = s[i];
      if(c === "\\"){
        const m = s.slice(i).match(/^\\([A-Za-z]+)/);
        if(!m){ i += 2; continue; }
        const cmd = m[1]; i += m[0].length;
        if(cmd === "frac" || cmd === "dfrac" || cmd === "tfrac"){ const [a, j] = grab(s, i), [b, k] = grab(s, j); i = k; sp(tex2speech(a) + " over " + tex2speech(b)); continue; }
        if(cmd === "sqrt"){ let idx = ""; if(s[i] === "["){ const e = s.indexOf("]", i); idx = s.slice(i + 1, e); i = e + 1; } const [a, j] = grab(s, i); i = j; sp((idx === "3" ? "cube root of " : idx && idx !== "2" ? idx + "th root of " : "square root of ") + tex2speech(a)); continue; }
        if(cmd === "vec" || cmd === "overrightarrow"){ const [a, j] = grab(s, i); i = j; sp("vector " + tex2speech(a)); continue; }
        if(cmd === "hat"){ const [a, j] = grab(s, i); i = j; sp(tex2speech(a) + " hat"); continue; }
        if(cmd === "bar" || cmd === "overline"){ const [a, j] = grab(s, i); i = j; sp(tex2speech(a) + " bar"); continue; }
        if(cmd === "dot"){ const [a, j] = grab(s, i); i = j; sp("rate of change of " + tex2speech(a)); continue; }
        if(cmd === "ce"){ const [a, j] = grab(s, i); i = j; sp(a.replace(/\^\{?([0-9]*[+-])\}?/g, " charge $1 ").replace(/<=>|<->/g, " is in equilibrium with ").replace(/->/g, " gives ").replace(/\s\+\s/g, " plus ").replace(/(\d)([A-Z])/g, "$1 $2").replace(/([A-Za-z)])(\d+)/g, "$1 $2").replace(/[{}]/g, "").replace(/\s+/g, " ")); continue; }
        if(cmd === "text" || cmd === "mathrm" || cmd === "textbf" || cmd === "mathbf" || cmd === "mathit" || cmd === "operatorname" || cmd === "boldsymbol"){ const [a, j] = grab(s, i); i = j; sp(tex2speech(a)); continue; }
        if(cmd === "Delta" ){ sp("change in"); continue; }
        if(GREEK[cmd]){ sp(GREEK[cmd]); continue; }
        if(WORDS[cmd]){ sp(WORDS[cmd]); continue; }
        continue;
      }
      if(c === "^"){
        const [a, j] = grab(s, i + 1); i = j; const t = tex2speech(a).trim();
        if(t === "2") sp("squared"); else if(t === "3") sp("cubed"); else if(/^(circ|degree|°)$/.test(a) || t === "degrees") sp("degrees"); else if(/^-/.test(t)) sp("to the power minus " + t.slice(1).trim()); else sp("to the power " + t);
        continue;
      }
      if(c === "_"){ const [a, j] = grab(s, i + 1); i = j; sp("sub " + tex2speech(a)); continue; }
      if(c === "{" || c === "}"){ i++; continue; }
      if(c === "="){ sp("equals"); i++; continue; }
      if(c === "+"){ sp("plus"); i++; continue; }
      if(c === "-" || c === "−"){ const prev = out.trim(); sp(prev && !/(equals|plus|minus|times|over|to the power|\()$/.test(prev) ? "minus" : "negative"); i++; continue; }
      if(c === "*"){ sp("times"); i++; continue; }
      if(c === "/"){ sp("over"); i++; continue; }
      if(c === "<"){ sp("is less than"); i++; continue; }
      if(c === ">"){ sp("is greater than"); i++; continue; }
      if(c === "%"){ out += " percent"; i++; continue; }
      if(c === "°"){ out += " degrees"; i++; continue; }
      if(/[0-9.]/.test(c)){ const m = s.slice(i).match(/^[0-9]*\.?[0-9]+(?:[eE][+-]?\d+)?|^[0-9]+/); const num = m ? m[0] : c; i += num.length; sp(num); continue; }
      if(/[A-Za-z]/.test(c)){ sp(c); i++; continue; }
      if(c === "," || c === "."){ out += c; i++; continue; }
      if(c === "(" || c === ")" || c === "[" || c === "]" || c === "|" || c === "'"){ i++; continue; }
      i++;
    }
    return out.replace(/\s+/g, " ").trim();
  }
  function speakable(text){
    const parts = split(repair(text));
    return parts.map(p => p.t === "math" ? " " + tex2speech(p.v) + " " : p.v).join("")
      .replace(/\*\*|`|^#{1,4}\s*/gm, "").replace(/\s+/g, " ").trim();
  }

  D.math = { ready, rich, renderInto, hasMath, speakable, repair, tex2speech, split };
})();
