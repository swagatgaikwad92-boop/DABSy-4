/* ============================================================
   D.A.B.S.y — doodle-math.js  (v12.1 · Doodle Space · MATHS computation engine)
   The "computation" third of Maths Mode. It never guesses and never calls the network:
     handwriting recognition (vision AI)  ->  THIS FILE computes + verifies  ->  AI explains (told the verified result).
   Exact where it can be: rationals (BigInt), plus one square-root term  a + b·√r  (so 3x² − 2√6x + 2 = 0 stays exact).
   When something is not exact it says so (≈). It does not invent: unknown letters stay variables, unsupported input is refused.
   Supports: + − × ÷ / ^, powers, √ and \sqrt, \frac, brackets, implicit multiplication (2x, as), π, sin cos tan ln log,
             =, <, >, ≤, ≥, ≠, Greek letters as variables, polynomial equations up to degree 4 (exact solve to degree 2).
   Not supported (said plainly): integrals/derivatives (recognised, shown, not computed), systems, matrices, complex output beyond "no real roots".
   Exposes window.DABSy.doodleMath (also module.exports for the node tests).
   ============================================================ */
(function(root){
  "use strict";
  /* ---------------- exact numbers ---------------- */
  const big = BigInt;
  const gcd = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while(b){ [a, b] = [b, a % b]; } return a; };
  const Q = (n, d) => { n = big(n); d = d === undefined ? 1n : big(d); if(d === 0n) throw new MathErr("Division by zero."); if(d < 0n){ n = -n; d = -d; } const g = gcd(n, d) || 1n; return [n / g, d / g]; };
  const qadd = (x, y) => Q(x[0] * y[1] + y[0] * x[1], x[1] * y[1]);
  const qmul = (x, y) => Q(x[0] * y[0], x[1] * y[1]);
  const qneg = x => [-x[0], x[1]];
  const qinv = x => Q(x[1], x[0]);
  const qzero = x => x[0] === 0n;
  const qeq = (x, y) => x[0] === y[0] && x[1] === y[1];
  const qf = x => Number(x[0]) / Number(x[1]);
  function MathErr(msg){ this.message = msg; this.isMathErr = true; }
  MathErr.prototype = Object.create(Error.prototype);

  function sqrtSplit(n){                       // n >= 0 BigInt -> [s, m] with n = s²·m, m squarefree
    if(n === 0n) return [0n, 1n];
    let s = 1n, m = n;
    for(let p = 2n; p * p <= m && p < 100000n; p += (p === 2n ? 1n : 2n)){ while(m % (p * p) === 0n){ m /= p * p; s *= p; } }
    return [s, m];
  }
  // Surd = a + b·√r  (a,b rational pairs; r squarefree BigInt > 1, or 1 when b = 0)
  const S = (a, b, r) => (qzero(b) || r === 1n) ? { a, b: [0n, 1n], r: 1n } : { a, b, r };
  const sInt = n => S(Q(n), [0n, 1n], 1n);
  function sAdd(x, y){ if(x.r === y.r || qzero(y.b)) return S(qadd(x.a, y.a), qadd(x.b, y.b), x.r); if(qzero(x.b)) return S(qadd(x.a, y.a), y.b, y.r); return null; }
  function sMul(x, y){
    if(qzero(x.b) && qzero(y.b)) return S(qmul(x.a, y.a), [0n, 1n], 1n);
    if(qzero(x.b)) return S(qmul(x.a, y.a), qmul(x.a, y.b), y.r);
    if(qzero(y.b)) return S(qmul(x.a, y.a), qmul(x.b, y.a), x.r);
    if(x.r !== y.r) return null;
    const rr = [x.r, 1n];
    return S(qadd(qmul(x.a, y.a), qmul(qmul(x.b, y.b), rr)), qadd(qmul(x.a, y.b), qmul(y.a, x.b)), x.r);
  }
  function sInv(x){
    if(qzero(x.b)){ if(qzero(x.a)) throw new MathErr("Division by zero."); return S(qinv(x.a), [0n, 1n], 1n); }
    const den = qadd(qmul(x.a, x.a), qneg(qmul(qmul(x.b, x.b), [x.r, 1n])));
    if(qzero(den)) throw new MathErr("Division by zero.");
    const k = qinv(den); return S(qmul(x.a, k), qmul(qneg(x.b), k), x.r);
  }
  const sNeg = x => S(qneg(x.a), qneg(x.b), x.r);
  const sF = x => qf(x.a) + (qzero(x.b) ? 0 : qf(x.b) * Math.sqrt(Number(x.r)));
  function sSqrt(x){                            // exact only for non-negative rationals
    if(!qzero(x.b)) return null;
    if(x.a[0] < 0n) return null;
    const [s, m] = sqrtSplit(x.a[0] * x.a[1]);       // √(n/d) = √(n·d)/d
    return m === 1n ? S(Q(s, x.a[1]), [0n, 1n], 1n) : S([0n, 1n], Q(s, x.a[1]), m);
  }
  /* Val: { s: Surd|null (exact), f: float }.  s === null means "only a float is known" */
  const V = s => ({ s, f: sF(s) });
  const Vf = f => ({ s: null, f });
  const vint = n => V(sInt(n));
  function vadd(x, y){ const s = x.s && y.s ? sAdd(x.s, y.s) : null; return s ? V(s) : Vf(x.f + y.f); }
  function vmul(x, y){ const s = x.s && y.s ? sMul(x.s, y.s) : null; return s ? V(s) : Vf(x.f * y.f); }
  const vneg = x => x.s ? V(sNeg(x.s)) : Vf(-x.f);
  function vinv(x){ if(x.s) return V(sInv(x.s)); if(x.f === 0) throw new MathErr("Division by zero."); return Vf(1 / x.f); }
  const vsub = (x, y) => vadd(x, vneg(y));
  const vdiv = (x, y) => vmul(x, vinv(y));
  function vpow(x, y){
    if(y.s && qzero(y.s.b) && y.s.a[1] === 1n && x.s){
      let n = y.s.a[0]; if(n > 64n || n < -64n) return Vf(Math.pow(x.f, Number(n)));
      let base = x.s, neg = n < 0n; if(neg) n = -n;
      let r = sInt(1n);
      for(let i = 0n; i < n; i++){ r = sMul(r, base); if(!r) return Vf(Math.pow(x.f, Number(y.f))); }
      return neg ? V(sInv(r)) : V(r);
    }
    if(y.s && qeq(y.s.a, [1n, 2n]) && qzero(y.s.b) && x.s){ const q = sSqrt(x.s); if(q) return V(q); }
    if(x.f < 0 && !Number.isInteger(y.f)) throw new MathErr("A negative number raised to a fractional power isn't a real number.");
    return Vf(Math.pow(x.f, y.f));
  }
  function vsqrt(x){ if(x.s){ const q = sSqrt(x.s); if(q) return V(q); } if(x.f < 0) throw new MathErr("Square root of a negative number isn't real."); return Vf(Math.sqrt(x.f)); }
  const vzero = x => x.s ? qzero(x.s.a) && qzero(x.s.b) : Math.abs(x.f) < 1e-12;
  const vexact = x => !!x.s;
  const vf = x => x.f;

  /* ---------------- formatting ---------------- */
  const qtex = (q, signed) => { const neg = q[0] < 0n, n = neg ? -q[0] : q[0]; const body = q[1] === 1n ? String(n) : `\\frac{${n}}{${q[1]}}`; return neg ? "-" + body : (signed ? "+" + body : body); };
  const qtxt = q => q[1] === 1n ? String(q[0]) : `${q[0]}/${q[1]}`;
  function stex(x){
    if(qzero(x.b)) return qtex(x.a);
    const neg = x.b[0] < 0n, bb = neg ? qneg(x.b) : x.b;
    const rad = `\\sqrt{${x.r}}`;
    const term = bb[1] === 1n ? (qeq(bb, [1n, 1n]) ? "" : String(bb[0])) + rad : `\\frac{${qeq([bb[0], 1n], [1n, 1n]) ? "" : bb[0]}${rad}}{${bb[1]}}`;
    if(qzero(x.a)) return (neg ? "-" : "") + term;
    return qtex(x.a) + (neg ? "-" : "+") + term;
  }
  function stxt(x){
    if(qzero(x.b)) return qtxt(x.a);
    const neg = x.b[0] < 0n, bb = neg ? qneg(x.b) : x.b;
    const term = bb[1] === 1n ? (qeq(bb, [1n, 1n]) ? "" : String(bb[0])) + "√" + x.r : `${bb[0] === 1n ? "" : bb[0]}√${x.r}/${bb[1]}`;
    if(qzero(x.a)) return (neg ? "-" : "") + term;
    return qtxt(x.a) + (neg ? " - " : " + ") + term;
  }
  const round = f => { const r = Math.round(f * 1e9) / 1e9; return Object.is(r, -0) ? 0 : r; };
  const vtex = x => x.s ? stex(x.s) : String(round(x.f));
  const vtxt = x => x.s ? stxt(x.s) : String(round(x.f));
  const vdec = x => { const f = round(x.f); return Number.isFinite(f) ? String(f) : "undefined"; };

  /* ---------------- normalising what the recogniser / user gives us ---------------- */
  const SUP = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-", "⁺": "+" };
  const GREEK = { α: "alpha", β: "beta", γ: "gamma", δ: "delta", ε: "epsilon", θ: "theta", λ: "lambda", μ: "mu", ν: "nu", ρ: "rho", σ: "sigma", τ: "tau", φ: "phi", ω: "omega", Δ: "Delta", Σ: "Sigma", Ω: "Omega", η: "eta", κ: "kappa", ψ: "psi", ξ: "xi", ζ: "zeta" };
  const GREEK_WORDS = Object.values(GREEK);
  const FUNCS = ["sqrt", "root", "sin", "cos", "tan", "ln", "log", "abs"];
  function braceArg(s, i){                      // s[i] === "{" -> [content, indexAfter]
    let d = 0; for(let j = i; j < s.length; j++){ if(s[j] === "{") d++; else if(s[j] === "}"){ d--; if(!d) return [s.slice(i + 1, j), j + 1]; } }
    throw new MathErr("Unbalanced braces in the expression.");
  }
  function fromLatex(s){
    s = s.replace(/\\left|\\right/g, "").replace(/\\,|\\;|\\!|\\ /g, " ").replace(/\\cdot|\\times/g, "*").replace(/\\div/g, "/").replace(/\\leq?\b/g, "≤").replace(/\\geq?\b/g, "≥").replace(/\\neq?\b/g, "≠").replace(/\\pi\b/g, "π").replace(/\\infty/g, "inf");
    let guard = 0;
    while(/\\frac/.test(s) && guard++ < 50){
      const i = s.indexOf("\\frac"); let j = i + 5; while(s[j] === " ") j++;
      const [a, k] = braceArg(s, j); let m = k; while(s[m] === " ") m++; const [b, e] = braceArg(s, m);
      s = s.slice(0, i) + `((${a})/(${b}))` + s.slice(e);
    }
    guard = 0;
    while(/\\sqrt/.test(s) && guard++ < 50){
      const i = s.indexOf("\\sqrt"); let j = i + 5, n = null;
      if(s[j] === "["){ const e = s.indexOf("]", j); n = s.slice(j + 1, e); j = e + 1; }
      const [a, e] = braceArg(s, j);
      s = s.slice(0, i) + (n ? `root(${n},${a})` : `sqrt(${a})`) + s.slice(e);
    }
    s = s.replace(/\^\{([^{}]*)\}/g, "^($1)").replace(/_\{[^{}]*\}/g, "").replace(/\\([a-zA-Z]+)/g, (m, w) => (GREEK_WORDS.includes(w) || w === "pi") ? w : (FUNCS.includes(w) ? w : m));
    return s;
  }
  function normalize(input){
    let s = String(input == null ? "" : input).trim();
    if(/\\[a-zA-Z]/.test(s) || /[{}]/.test(s)) s = fromLatex(s);
    s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]+/g, m => "^(" + [...m].map(c => SUP[c]).join("") + ")");
    s = s.replace(/[−–—]/g, "-").replace(/[×·∙⋅]/g, "*").replace(/÷/g, "/").replace(/√/g, "sqrt").replace(/π/g, "pi").replace(/∞/g, "inf")
      .replace(/[αβγδεθλμνρστφωΔΣΩηκψξζ]/g, c => " " + GREEK[c] + " ").replace(/≤|<=/g, "≤").replace(/≥|>=/g, "≥").replace(/≠|!=/g, "≠").replace(/==/g, "=");
    s = s.replace(/\s+/g, " ").trim();
    return s;
  }
  /* things a handwriting recogniser commonly gets wrong or that a human would have to decide */
  function ambiguities(raw){
    const out = [], s = String(raw || ""); const t = s.replace(/\s+/g, "");
    if(/[0-9]x[0-9]/.test(t) && !/[a-wyz]/i.test(t.replace(/x/g, ""))) out.push({ kind: "x-or-times", text: "Is that “x” a variable or a multiplication sign (×)?" });
    if(/√\s*[0-9]+[a-zA-Z]/.test(s) || /\\sqrt\s*[0-9]+[a-zA-Z]/.test(s)) out.push({ kind: "root-extent", text: "How far does the square-root sign reach — only the number, or the letter after it too?" });
    if(/(^|[^a-zA-Z])l(?![a-zA-Z])/.test(t) && /[0-9]/.test(t)) out.push({ kind: "one-or-l", text: "Is that a 1 or the letter l?" });
    if(/(^|[^a-zA-Z0-9])O(?![a-zA-Z])|[0-9]O|O[0-9]/.test(t)) out.push({ kind: "zero-or-O", text: "Is that a zero or the letter O?" });
    if(/[0-9]\/[0-9a-zA-Z]+[a-zA-Z(]/.test(t) && !/\)/.test(t)) out.push({ kind: "fraction-extent", text: "In 1/2x, is x on top of the fraction or below it?" });
    return out;
  }

  /* ---------------- tokenizer + parser ---------------- */
  function tokenize(s){
    const toks = []; let i = 0;
    while(i < s.length){
      const c = s[i];
      if(c === " "){ i++; continue; }
      if(/[0-9.]/.test(c)){ let j = i; while(j < s.length && /[0-9.]/.test(s[j])) j++; const t = s.slice(i, j); if((t.match(/\./g) || []).length > 1) throw new MathErr("“" + t + "” isn't a valid number."); toks.push({ t: "num", v: t }); i = j; continue; }
      if(/[a-zA-Z]/.test(c)){
        let j = i; while(j < s.length && /[a-zA-Z]/.test(s[j])) j++;
        let run = s.slice(i, j);
        while(run){                                    // longest known word first, else ONE letter (so "as" is a·s)
          const w = [...FUNCS, "pi", "inf", ...GREEK_WORDS].filter(f => run.startsWith(f)).sort((a, b) => b.length - a.length)[0];
          if(w){ toks.push({ t: FUNCS.includes(w) ? "fn" : (w === "pi" || w === "inf" ? "const" : "id"), v: w }); run = run.slice(w.length); }
          else { toks.push({ t: "id", v: run[0] }); run = run.slice(1); }
        }
        i = j; continue;
      }
      if("+-*/^()=<>≤≥≠,|".includes(c)){ toks.push({ t: "op", v: c }); i++; continue; }
      throw new MathErr("I don't know how to read “" + c + "”.");
    }
    return toks;
  }
  function parse(src){
    const toks = tokenize(normalize(src)); let p = 0;
    const peek = () => toks[p], next = () => toks[p++];
    const isOp = (...o) => peek() && peek().t === "op" && o.includes(peek().v);
    const startsFactor = () => { const k = peek(); return k && (k.t === "num" || k.t === "id" || k.t === "const" || k.t === "fn" || (k.t === "op" && k.v === "(")); };
    function relation(){
      const l = addsub();
      if(isOp("=", "<", ">", "≤", "≥", "≠")){ const op = next().v; const r = addsub(); return { k: "rel", op, l, r }; }
      return l;
    }
    function addsub(){
      let n = term();
      while(isOp("+", "-")){ const op = next().v; n = { k: "bin", op, l: n, r: term() }; }
      return n;
    }
    function term(){
      let n = unary();
      for(;;){
        if(isOp("*", "/")){ const op = next().v; n = { k: "bin", op, l: n, r: unary() }; }
        else if(startsFactor()){
          const prev = toks[p - 1], k = peek();
          if(prev.t === "num" && k.t === "num") throw new MathErr("Two numbers next to each other (" + prev.v + " " + k.v + ") — is something missing between them?");
          n = { k: "bin", op: "*", l: n, r: powerExpr() };
        } else break;
      }
      return n;
    }
    function unary(){
      if(isOp("-")){ next(); return { k: "neg", v: unary() }; }
      if(isOp("+")){ next(); return unary(); }
      return powerExpr();
    }
    function powerExpr(){
      const b = atom();
      if(isOp("^")){ next(); const e = isOp("-") ? (next(), { k: "neg", v: powArg() }) : powArg(); return { k: "pow", b, e }; }
      return b;
    }
    function powArg(){ return atom(); }
    function atom(){
      const k = next(); if(!k) throw new MathErr("The expression ends too early.");
      if(k.t === "num") return { k: "num", v: k.v };
      if(k.t === "id") return { k: "var", v: k.v };
      if(k.t === "const") return { k: "const", v: k.v };
      if(k.t === "fn"){
        if(!isOp("(")){ if(k.v === "sqrt"){ const a = atom(); return { k: "fn", f: "sqrt", a: [a] }; } throw new MathErr(k.v + " needs brackets, like " + k.v + "(x)."); }
        next(); const args = [addsub()]; while(isOp(",")){ next(); args.push(addsub()); }
        if(!isOp(")")) throw new MathErr("A bracket isn't closed."); next();
        return { k: "fn", f: k.v, a: args };
      }
      if(k.t === "op" && k.v === "("){ const e = relation(); if(!isOp(")")) throw new MathErr("A bracket isn't closed."); next(); return { k: "paren", v: e }; }
      if(k.t === "op" && k.v === "|"){ const e = addsub(); if(!isOp("|")) throw new MathErr("A | isn't closed."); next(); return { k: "fn", f: "abs", a: [e] }; }
      throw new MathErr("Unexpected “" + k.v + "”.");
    }
    if(!toks.length) throw new MathErr("There is nothing to read yet.");
    const ast = relation();
    if(p < toks.length) throw new MathErr("I couldn't read everything: stopped at “" + toks[p].v + "”.");
    return ast;
  }

  /* ---------------- evaluation ---------------- */
  function ev(n, env){
    switch(n.k){
      case "num": { const m = /^(\d*)\.?(\d*)$/.exec(n.v); if(!m) throw new MathErr("Bad number " + n.v); const frac = m[2] || ""; return V(S(Q(big((m[1] || "0") + frac), 10n ** big(frac.length)), [0n, 1n], 1n)); }
      case "var": { if(env && n.v in env) return typeof env[n.v] === "number" ? Vf(env[n.v]) : env[n.v]; throw new MathErr("“" + n.v + "” has no value yet."); }
      case "const": if(n.v === "pi") return Vf(Math.PI); throw new MathErr("∞ can't be used in a calculation here.");
      case "paren": return ev(n.v, env);
      case "neg": return vneg(ev(n.v, env));
      case "bin": { const a = ev(n.l, env), b = ev(n.r, env); return n.op === "+" ? vadd(a, b) : n.op === "-" ? vsub(a, b) : n.op === "*" ? vmul(a, b) : vdiv(a, b); }
      case "pow": return vpow(ev(n.b, env), ev(n.e, env));
      case "fn": {
        const a = n.a.map(x => ev(x, env));
        switch(n.f){
          case "sqrt": return vsqrt(a[0]);
          case "root": { if(a.length < 2) throw new MathErr("root needs an index and a value."); return vpow(a[1], vinv(a[0])); }
          case "sin": return Vf(Math.sin(a[0].f)); case "cos": return Vf(Math.cos(a[0].f)); case "tan": return Vf(Math.tan(a[0].f));
          case "ln": if(a[0].f <= 0) throw new MathErr("ln needs a positive number."); return Vf(Math.log(a[0].f));
          case "log": if(a[0].f <= 0) throw new MathErr("log needs a positive number."); return Vf(Math.log10(a[0].f));
          case "abs": return a[0].s ? (a[0].f < 0 ? vneg(a[0]) : a[0]) : Vf(Math.abs(a[0].f));
        }
      }
    }
    throw new MathErr("Can't evaluate that.");
  }
  function vars(n, set){ set = set || new Set(); if(!n || typeof n !== "object") return set; if(n.k === "var") set.add(n.v); for(const k of ["l", "r", "v", "b", "e"]) if(n[k]) vars(n[k], set); if(n.a) n.a.forEach(x => vars(x, set)); return set; }
  const hasCalculus = s => /∫|\\int|\bd\/dx\b|\\frac\{d\}\{dx\}|\blim\b|\\lim|∑|\\sum|∂/.test(String(s));

  /* ---------------- polynomial extraction (single variable) ---------------- */
  const PZ = vint(0);
  const padd = (a, b) => { const n = Math.max(a.length, b.length), r = []; for(let i = 0; i < n; i++) r.push(vadd(a[i] || PZ, b[i] || PZ)); return r; };
  const pneg = a => a.map(vneg);
  function pmul(a, b){ const r = Array(a.length + b.length - 1).fill(null).map(() => PZ); a.forEach((x, i) => b.forEach((y, j) => { r[i + j] = vadd(r[i + j], vmul(x, y)); })); return r; }
  function toPoly(n, v){
    switch(n.k){
      case "num": case "const": return [ev(n, {})];
      case "var": if(n.v === v) return [PZ, vint(1)]; throw new MathErr("two_vars");
      case "paren": return toPoly(n.v, v);
      case "neg": return pneg(toPoly(n.v, v));
      case "bin": {
        if(n.op === "+") return padd(toPoly(n.l, v), toPoly(n.r, v));
        if(n.op === "-") return padd(toPoly(n.l, v), pneg(toPoly(n.r, v)));
        if(n.op === "*") return pmul(toPoly(n.l, v), toPoly(n.r, v));
        const d = toPoly(n.r, v); if(d.length !== 1) throw new MathErr("not_poly"); const inv = vinv(d[0]); return toPoly(n.l, v).map(c => vmul(c, inv));
      }
      case "pow": { const e = ev(n.e, {}); const k = Math.round(e.f); if(!(Math.abs(e.f - k) < 1e-12) || k < 0 || k > 4) throw new MathErr("not_poly"); let r = [vint(1)]; const b = toPoly(n.b, v); for(let i = 0; i < k; i++) r = pmul(r, b); return r; }
      case "fn": if(n.f === "sqrt" || n.f === "root" || n.f === "abs" || true){ const vs = vars(n); if(vs.size === 0) return [ev(n, {})]; } throw new MathErr("not_poly");
    }
    throw new MathErr("not_poly");
  }
  const trim = p => { p = p.slice(); while(p.length > 1 && vzero(p[p.length - 1])) p.pop(); return p; };

  /* ---------------- solving ---------------- */
  const TEXPOW = (v, k) => k === 0 ? "" : k === 1 ? v : `${v}^{${k}}`;
  function polyTex(p, v){
    let out = "";
    for(let k = p.length - 1; k >= 0; k--){
      const c = p[k]; if(vzero(c) && p.length > 1) continue;
      let t = vtex(c), neg = false;
      if(c.s ? (qzero(c.s.b) ? c.s.a[0] < 0n : (qzero(c.s.a) ? c.s.b[0] < 0n : false)) : c.f < 0){ neg = true; t = vtex(vneg(c)); }
      const compound = c.s && !qzero(c.s.b) && !qzero(c.s.a);
      if(compound) t = "(" + (neg ? vtex(vneg(c)) : t) + ")";
      const body = k === 0 ? t : ((t === "1" ? "" : t) + TEXPOW(v, k));
      out += (out ? (neg ? " - " : " + ") : (neg ? "-" : "")) + body;
    }
    return out || "0";
  }
  function solveEquation(src){
    const ast = typeof src === "string" ? parse(src) : src;
    if(ast.k !== "rel" || ast.op !== "=") throw new MathErr("That isn't an equation (it needs a single “=”).");
    const vs = [...vars(ast)];
    if(vs.length === 0){ const a = ev(ast.l, {}), b = ev(ast.r, {}); return { type: "identity", true: vzero(vsub(a, b)) }; }
    if(vs.length > 1) return { type: "multi", vars: vs, note: "This has several unknowns (" + vs.join(", ") + "), so there isn't one numerical answer. I can solve for one letter in terms of the others — I haven't built that yet; ask me to explain it instead." };
    const v = vs[0];
    let p; try{ p = trim(padd(toPoly(ast.l, v), pneg(toPoly(ast.r, v)))); }catch(e){ if(e.isMathErr && (e.message === "not_poly" || e.message === "two_vars")) return { type: "unsupported", v, note: "I can solve polynomial equations up to degree 2 exactly (and check higher ones numerically). This one has powers, roots or functions of " + v + " I can't handle locally." }; throw e; }
    const deg = p.length - 1;
    if(deg === 0) return { type: "const", v, true: vzero(p[0]) };
    if(deg > 4) return { type: "unsupported", v, note: "Degree above 4 isn't supported." };
    const base = { v, deg, poly: p, std: polyTex(p, v) + " = 0" };
    if(deg === 1){ const x = vneg(vdiv(p[0], p[1])); return Object.assign(base, { type: "linear", roots: [x], a: p[1], b: p[0] }); }
    if(deg === 2){
      const [c, b, a] = p; const D = vsub(vmul(b, b), vmul(vint(4), vmul(a, c)));
      const info = Object.assign(base, { type: "quadratic", a, b, c, D });
      const twoA = vmul(vint(2), a), nb = vneg(b);
      if(D.f < -1e-12 && !(D.s && false)){ return Object.assign(info, { roots: [], disc: "negative", note: "The discriminant is negative, so there are no real roots." }); }
      if(vzero(D)){ const x = vdiv(nb, twoA); return Object.assign(info, { roots: [x], disc: "zero", repeated: true }); }
      const sq = vsqrt(D); const x1 = vdiv(vadd(nb, sq), twoA), x2 = vdiv(vsub(nb, sq), twoA);
      const roots = x1.f <= x2.f ? [x1, x2] : [x2, x1];
      return Object.assign(info, { roots, disc: "positive", sqrtD: sq });
    }
    return Object.assign(base, { type: "numeric", roots: numericRoots(p).map(Vf), note: "Degree " + deg + ": roots found numerically (decimals, not exact forms)." });
  }
  function numericRoots(p){                      // real roots by sign changes + bisection on a wide scan (honest: may miss double roots)
    const f = x => p.reduce((acc, c, i) => acc + c.f * Math.pow(x, i), 0), out = []; let prev = -1000, fp = f(prev);
    for(let x = -999.9; x <= 1000; x += 0.1){ const fx = f(x); if(fp === 0) out.push(prev); else if(fp * fx < 0){ let lo = prev, hi = x; for(let i = 0; i < 80; i++){ const m = (lo + hi) / 2; if(f(lo) * f(m) <= 0) hi = m; else lo = m; } out.push((lo + hi) / 2); } prev = x; fp = fx; }
    return [...new Set(out.map(r => round(r)))];
  }
  function verifyRoots(src, sol){
    const ast = typeof src === "string" ? parse(src) : src; const v = sol.v; const res = [];
    (sol.roots || []).forEach(r => {
      let l, rr; try{ l = ev(ast.l, { [v]: r }); rr = ev(ast.r, { [v]: r }); }catch(e){ res.push({ ok: false, mode: "error" }); return; }
      const d = vsub(l, rr);
      if(d.s) res.push({ ok: vzero(d), mode: "exact" }); else res.push({ ok: Math.abs(d.f) < 1e-7 * Math.max(1, Math.abs(l.f), Math.abs(rr.f)), mode: "numeric" });
    });
    return res;
  }
  function answerTex(sol, ver){
    if(sol.type === "quadratic" || sol.type === "linear"){
      if(!sol.roots.length) return `\\text{no real roots}`;
      const approx = sol.roots.some(r => !vexact(r));
      return sol.roots.map(r => `${sol.v} ${vexact(r) ? "=" : "\\approx"} ${vtex(r)}`).join(",\\;\\; ") + (sol.repeated ? "\\;\\text{(repeated root)}" : "") + (approx ? "" : "");
    }
    if(sol.type === "numeric") return sol.roots.length ? sol.roots.map(r => `${sol.v} \\approx ${vtex(r)}`).join(",\\;\\; ") : `\\text{no real roots found in the range checked}`;
    return "";
  }
  /* deterministic, checkable step lists (used with no network; the AI is only asked to EXPLAIN them) */
  function quadraticSteps(sol, src){
    const v = sol.v, { a, b, c, D } = sol, st = [];
    st.push({ say: "Bring everything to one side, in the form a" + v + "² + b" + v + " + c = 0:", tex: sol.std });
    st.push({ say: "Read off the coefficients (keep every sign):", tex: `a=${vtex(a)},\\quad b=${vtex(b)},\\quad c=${vtex(c)}` });
    st.push({ say: "Discriminant D = b² − 4ac:", tex: `D=(${vtex(b)})^2-4(${vtex(a)})(${vtex(c)})=${vtex(D)}` });
    if(sol.disc === "negative") st.push({ say: "D is negative, so the equation has no real roots.", tex: "" });
    else if(sol.disc === "zero") st.push({ say: "D = 0, so there is exactly one (repeated) root: " + v + " = −b / 2a.", tex: `${v}=\\frac{-b}{2a}=\\frac{${vtex(vneg(b))}}{${vtex(vmul(vint(2), a))}}=${vtex(sol.roots[0])}` });
    else st.push({ say: "D > 0, so there are two real roots: " + v + " = (−b ± √D) / 2a.", tex: `${v}=\\frac{-b\\pm\\sqrt{D}}{2a}=\\frac{${vtex(vneg(b))}\\pm\\sqrt{${vtex(D)}}}{${vtex(vmul(vint(2), a))}}` });
    return st;
  }
  function hintFor(sol, level){
    const v = sol.v || "x";
    if(sol.type === "quadratic"){
      const H = [`This is a quadratic: the highest power of ${v} is 2. Which standard form does that suggest, and what are a, b and c here (with their signs)?`,
        `With a = ${vtxt(sol.a)}, b = ${vtxt(sol.b)}, c = ${vtxt(sol.c)}: work out the discriminant b² − 4ac first. Its value tells you how many real roots to expect.`,
        sol.disc === "zero" ? "The discriminant comes out to 0 — so what does that say about the number of roots, and what is the single formula left to use?" : sol.disc === "negative" ? "The discriminant is negative. What does that mean for real roots?" : "The discriminant is positive, so use x = (−b ± √D) / 2a and compute both roots carefully."];
      return H[Math.min(level, H.length - 1)];
    }
    if(sol.type === "linear") return ["Collect all the " + v + " terms on one side and the plain numbers on the other.", "Then divide both sides by the coefficient of " + v + " (watch its sign)."][Math.min(level, 1)];
    return "Tell me what you've tried so far, or ask me to explain the concept.";
  }

  /* ---------------- evaluate whatever was recognised ---------------- */
  function analyse(src){
    let raw = String(src || "").trim(); const out = { raw, ambiguities: ambiguities(raw) };
    // "1 + 2 =" (nothing after the "=") means "what is it?" — compute it. Only when this is the single "=" in the line.
    if(/=\s*\??\s*$/.test(raw) && (raw.match(/=/g) || []).length === 1 && !/[<>≤≥≠]/.test(raw)){ raw = raw.replace(/\s*=\s*\??\s*$/, ""); out.asked = true; }
    if(hasCalculus(raw)){ out.kind = "calculus"; out.note = "That's calculus notation. I can show it clearly and explain it, but I can't compute it on this device — I won't pretend to."; return out; }
    let ast; try{ ast = parse(raw); }catch(e){ if(e.isMathErr){ out.kind = "error"; out.error = e.message; return out; } throw e; }
    out.ast = ast; out.vars = [...vars(ast)];
    try{
      if(ast.k === "rel"){
        const vs = out.vars;
        if(ast.op !== "="){ out.kind = "inequality"; if(vs.length === 0){ const a = ev(ast.l, {}), b = ev(ast.r, {}); out.truth = ({ "<": a.f < b.f, ">": a.f > b.f, "≤": a.f <= b.f, "≥": a.f >= b.f, "≠": Math.abs(a.f - b.f) > 1e-12 })[ast.op]; } else out.note = "Inequalities with unknowns: I can read and show them; solving them isn't built yet."; return out; }
        const emptyRhs = ast.r && ast.r.k === "paren" && false;
        if(vs.length === 0){ const a = ev(ast.l, {}), b = ev(ast.r, {}); out.kind = "identity"; out.lhs = a; out.rhs = b; out.truth = vzero(vsub(a, b)); return out; }
        out.kind = "equation"; out.formula = looksLikeFormula(ast, vs); out.sol = solveEquation(ast); if(out.sol.roots) out.ver = verifyRoots(ast, out.sol); return out;
      }
      if(out.vars.length === 0){ const v = ev(ast, {}); out.kind = "arithmetic"; out.value = v; return out; }
      out.kind = "expression"; return out;
    }catch(e){ if(e.isMathErr){ out.kind = "error"; out.error = e.message; return out; } throw e; }
  }
  function looksLikeFormula(ast, vs){ return vs.length >= 3 || (vs.length >= 2); }
  /* The usual meaning of letters in school formulas — offered only as "usually", never as fact about THIS page */
  const GLOSSARY = {
    kinematics: { match: s => /v.*=.*u.*\+.*a.*(t|s)|s.*=.*u.*t|v\^?2/.test(s), vars: { v: "final velocity", u: "initial velocity", a: "acceleration (constant)", s: "displacement", t: "time" }, note: "These are the usual meanings in constant-acceleration (SUVAT) motion." },
  };
  function glossaryFor(raw){ const s = normalize(raw).replace(/\s+/g, ""); for(const k of Object.keys(GLOSSARY)){ if(GLOSSARY[k].match(s)) return GLOSSARY[k]; } return null; }

  /* ---------------- checking a student's working ---------------- */
  function samplePoints(v, n){ const pts = []; const base = [0.7, 1.9, -1.3, 2.6, -0.4, 3.1, -2.2, 1.1]; for(let i = 0; i < n; i++) pts.push(base[i % base.length] + i * 0.013); return pts; }
  function residual(ast, env){ return vsub(ev(ast.l, env), ev(ast.r, env)).f; }
  function equivalent(a, b){                      // do two lines of working say the same thing?
    const A = typeof a === "string" ? parse(a) : a, B = typeof b === "string" ? parse(b) : b;
    if(A.k === "rel" && B.k === "rel" && A.op === "=" && B.op === "="){
      const vs = [...new Set([...vars(A), ...vars(B)])];
      if(vs.length === 0) return { same: vzero(vsub(ev(A.l, {}), ev(A.r, {}))) === vzero(vsub(ev(B.l, {}), ev(B.r, {}))), why: "numbers" };
      if(vs.length === 1){
        const v = vs[0]; const pts = samplePoints(v, 8); const ra = pts.map(x => residual(A, { [v]: x })), rb = pts.map(x => residual(B, { [v]: x }));
        if(ra.every(x => Math.abs(x) < 1e-9) && rb.every(x => Math.abs(x) < 1e-9)) return { same: true, why: "identities" };
        let ratio = null, ok = true; for(let i = 0; i < pts.length; i++){ if(Math.abs(rb[i]) < 1e-12 && Math.abs(ra[i]) < 1e-12) continue; if(Math.abs(rb[i]) < 1e-12 || Math.abs(ra[i]) < 1e-12){ ok = false; break; } const q = ra[i] / rb[i]; if(ratio === null) ratio = q; else if(Math.abs(q - ratio) > 1e-7 * Math.max(1, Math.abs(ratio))){ ok = false; break; } }
        if(ok) return { same: true, why: "proportional" };
        // a legitimate last step like "x = 2" can have the same SOLUTIONS even when not proportional
        try{ const sa = solveEquation(A), sb = solveEquation(B); if(sa.roots && sb.roots && sa.roots.length === sb.roots.length && sa.roots.every((r, i) => Math.abs(r.f - sb.roots[i].f) < 1e-9)) return { same: true, why: "same-solutions" }; }catch(_){}
        return { same: false, why: "different" };
      }
      return { same: null, why: "several-unknowns" };
    }
    if(A.k !== "rel" && B.k !== "rel"){
      const vs = [...new Set([...vars(A), ...vars(B)])];
      if(vs.length > 1) return { same: null, why: "several-unknowns" };
      const pts = vs.length ? samplePoints(vs[0], 8) : [0];
      const same = pts.every(x => { const env = vs.length ? { [vs[0]]: x } : {}; return Math.abs(ev(A, env).f - ev(B, env).f) < 1e-9 * Math.max(1, Math.abs(ev(A, env).f)); });
      return { same, why: vs.length ? "values" : "numbers" };
    }
    return { same: null, why: "mixed" };
  }
  /* Is each written line consistent with the one before? Never claims what it cannot check. */
  function checkWorking(lines){
    const out = [];
    for(let i = 0; i < lines.length; i++){
      const L = { line: i + 1, text: lines[i], status: "unchecked", detail: "" };
      let ast = null; try{ ast = parse(lines[i]); }catch(e){ L.status = "unreadable"; L.detail = e.isMathErr ? e.message : "I couldn't read this line."; out.push(L); continue; }
      if(ast.k === "rel" && ast.op === "=" && vars(ast).size === 0){ const a = ev(ast.l, {}), b = ev(ast.r, {}); const ok = vzero(vsub(a, b)); L.status = ok ? "ok" : "wrong"; L.detail = ok ? "The arithmetic on this line is right." : `The two sides aren't equal: the left is ${vtxt(a)} and the right is ${vtxt(b)}.`; }
      if(i === 0 && L.status === "unchecked"){ L.status = "start"; L.detail = "Starting point — nothing above it to compare with."; }
      if(i > 0){
        let prev = null; try{ prev = parse(lines[i - 1]); }catch(_){}
        if(prev){ const r = equivalent(prev, ast); if(r.same === true && L.status !== "wrong"){ L.status = "ok"; L.detail = L.detail || "Follows from the line above."; } else if(r.same === false){ L.status = "wrong"; L.detail = "This doesn't follow from the line above. Recheck the step between them (a sign, a term moved across “=”, or a calculation)."; } else if(L.status === "unchecked") L.detail = "I couldn't check this step automatically (several unknowns or a different kind of line)."; }
      }
      out.push(L);
    }
    return out;
  }

  const api = { normalize, ambiguities, parse, analyse, solveEquation, verifyRoots, answerTex, quadraticSteps, hintFor, equivalent, checkWorking, glossaryFor, hasCalculus, vtex, vtxt, vdec, polyTex, evaluate: (s, env) => ev(parse(s), env || {}), isMathErr: e => !!(e && e.isMathErr) };
  root.DABSy = root.DABSy || {}; root.DABSy.doodleMath = api;
  if(typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
