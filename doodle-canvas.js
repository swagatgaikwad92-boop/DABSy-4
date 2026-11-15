/* ============================================================
   D.A.B.S.y — doodle-canvas.js  (v12.1 · Doodle Space drawing engine)
   One fixed-size PAGE (not an endless canvas) drawn as vector strokes on a <canvas>.
   - Pointer Events: finger, touch, mouse, stylus (pressure-aware); a pen in use ignores resting palms.
   - One finger/pen/mouse draws; TWO fingers pan + pinch-zoom (the stroke in progress is discarded, not left as a dot); mouse wheel / ctrl+wheel pan / zoom.
   - Strokes are kept as small point arrays, so saving is tiny, undo is exact and the page re-renders sharply at any zoom.
   - Live ink is drawn on a light overlay canvas once per animation frame; the finished stroke is committed to the page canvas.
   - No network, no globals except window.DABSy.doodlePad.
   ============================================================ */
(function(){
  "use strict";
  const PAGE_W = 800, PAGE_H = 1131;                         // A4 proportions in page units
  const MAX_PIXELS = 9e6;                                     // backing-store budget (about 3000×3000): keeps mid-range phones smooth
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function create(view, opts){
    opts = opts || {};
    const sheet = document.createElement("div"); sheet.className = "dd-sheet";
    sheet.style.width = PAGE_W + "px"; sheet.style.height = PAGE_H + "px";
    const cv = document.createElement("canvas"), live = document.createElement("canvas");
    cv.className = "dd-ink"; live.className = "dd-live";
    sheet.append(cv, live); view.append(sheet);
    const ctx = cv.getContext("2d"), lctx = live.getContext("2d");
    let page = { strokes: [], blocks: [] }, undoS = [], redoS = [];
    let tool = { t: "p", c: "#2c303f", w: 3.5 };
    let v = { s: 1, tx: 0, ty: 0 }, k = 1, fitS = 1, resizeT = 0, drawing = null, raf = 0, destroyed = false;
    const ptrs = new Map(); let gest = null, penSeen = 0, panning = null, picker = null;
    view.style.touchAction = "none";

    /* ---------- view transform ---------- */
    function apply(){
      sheet.style.transform = `translate(${v.tx}px,${v.ty}px) scale(${v.s})`;
      clearTimeout(resizeT); resizeT = setTimeout(resizeBacking, 200);
      opts.onView && opts.onView(v);
    }
    function limit(){
      const vw = view.clientWidth, vh = view.clientHeight, sw = PAGE_W * v.s, sh = PAGE_H * v.s, m = 90;
      v.tx = clamp(v.tx, m - sw, vw - m); v.ty = clamp(v.ty, m - sh, vh - m);
      if(sw <= vw - 8) v.tx = (vw - sw) / 2;                    // narrower than the screen: stay centred
    }
    function fit(){
      const vw = view.clientWidth || 360, vh = view.clientHeight || 640;
      fitS = Math.min((vw - 16) / PAGE_W, (vh - 16) / PAGE_H);
      if(vw / vh < 0.9) fitS = (vw - 16) / PAGE_W;              // portrait phones: fit the width, scroll down the page
      v.s = fitS; v.tx = (vw - PAGE_W * v.s) / 2; v.ty = 8; limit(); apply();
    }
    function zoomAt(f, cx, cy){
      const ns = clamp(v.s * f, fitS * 0.6, Math.max(fitS * 6, 3));
      const r = view.getBoundingClientRect(); const px = cx - r.left, py = cy - r.top;
      v.tx = px - (px - v.tx) * (ns / v.s); v.ty = py - (py - v.ty) * (ns / v.s); v.s = ns; limit(); apply();
    }
    function zoomBy(f){ const r = view.getBoundingClientRect(); zoomAt(f, r.left + r.width / 2, r.top + r.height / 2); }
    const toLogical = (cx, cy) => { const r = sheet.getBoundingClientRect(); return [(cx - r.left) * (PAGE_W / r.width), (cy - r.top) * (PAGE_H / r.height)]; };
    const toScreen = (x, y) => { const r = view.getBoundingClientRect(); return [r.left + v.tx + x * v.s, r.top + v.ty + y * v.s]; };

    /* ---------- drawing ---------- */
    function resizeBacking(){
      if(destroyed) return;
      const dpr = window.devicePixelRatio || 1;
      let nk = clamp(dpr * v.s, 1, 3); nk = Math.min(nk, Math.sqrt(MAX_PIXELS / (PAGE_W * PAGE_H)));
      if(Math.abs(nk - k) / k < 0.2 && cv.width) return;
      k = nk; for(const c of [cv, live]){ c.width = Math.round(PAGE_W * k); c.height = Math.round(PAGE_H * k); c.style.width = PAGE_W + "px"; c.style.height = PAGE_H + "px"; }
      redraw();
    }
    function path(c, p){
      c.beginPath(); c.moveTo(p[0], p[1]);
      if(p.length === 4){ c.lineTo(p[2], p[3]); return; }
      let i = 2;
      for(; i < p.length - 2; i += 2){ c.quadraticCurveTo(p[i], p[i + 1], (p[i] + p[i + 2]) / 2, (p[i + 1] + p[i + 3]) / 2); }
      c.lineTo(p[p.length - 2], p[p.length - 1]);
    }
    function paint(c, s){
      const p = s.p; if(!p || p.length < 2) return;
      c.save(); c.setTransform(k, 0, 0, k, 0, 0); c.lineCap = c.lineJoin = "round";
      if(s.t === "e"){ c.globalCompositeOperation = "destination-out"; c.strokeStyle = c.fillStyle = "#000"; c.lineWidth = s.w; }
      else { c.strokeStyle = c.fillStyle = s.c === "auto" ? (opts.autoInk ? opts.autoInk() : "#2c303f") : s.c; c.globalAlpha = s.t === "c" ? 0.74 : 1; c.lineWidth = s.t === "c" ? s.w * 0.85 : s.w; }
      if(p.length < 4){ c.beginPath(); c.arc(p[0], p[1], c.lineWidth / 2, 0, 6.2832); c.fill(); }
      else {
        path(c, p); c.stroke();
        if(s.t === "c"){ c.globalAlpha = 0.28; c.lineWidth = s.w * 0.45; c.translate(0.45, 0.4); path(c, p); c.stroke(); }   // pencil grain
      }
      c.restore();
    }
    function redraw(){ ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); page.strokes.forEach(s => paint(ctx, s)); }
    function liveFrame(){
      raf = 0; if(!drawing) return;
      if(drawing.s.t === "e"){ const p = drawing.s.p; if(p.length >= 4){ const n = p.length, q = p.slice(Math.max(0, n - 8)); paint(ctx, { t: "e", w: drawing.s.w, p: q }); } return; }
      lctx.setTransform(1, 0, 0, 1, 0, 0); lctx.clearRect(0, 0, live.width, live.height); paint(lctx, drawing.s);
    }
    const kick = () => { if(!raf) raf = requestAnimationFrame(liveFrame); };

    /* ---------- pointer input ---------- */
    function down(e){
      if(picker){ picker.down(e); return; }
      if(e.pointerType === "pen") penSeen = Date.now();
      if(e.pointerType === "touch" && Date.now() - penSeen < 1500) return;       // palm rejection while a stylus is in use
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
      try{ view.setPointerCapture(e.pointerId); }catch(_){}
      if(e.pointerType === "mouse" && (e.button === 1 || e.button === 2)){ panning = { id: e.pointerId, x: e.clientX, y: e.clientY, tx: v.tx, ty: v.ty }; return; }
      if(e.pointerType === "mouse" && e.button !== 0) return;
      if(ptrs.size === 2){ cancelStroke(); startGesture(); return; }
      if(ptrs.size > 2) return;
      const [x, y] = toLogical(e.clientX, e.clientY);
      const pr = e.pointerType === "pen" && e.pressure > 0 ? e.pressure : 0.5;
      const w = tool.t === "e" ? tool.w * 3.2 : (e.pointerType === "pen" ? tool.w * (0.6 + pr * 0.8) : tool.w);
      drawing = { id: e.pointerId, s: { t: tool.t, c: tool.c, w: +w.toFixed(2), p: [r1(x), r1(y)] }, last: [x, y] };
      if(tool.t === "e") paint(ctx, { t: "e", w: drawing.s.w, p: [r1(x), r1(y)] }); else kick();
      e.preventDefault();
    }
    const r1 = n => Math.round(n * 10) / 10;
    function move(e){
      if(picker){ picker.move(e); return; }
      const pt = ptrs.get(e.pointerId); if(!pt) return;
      if(panning && panning.id === e.pointerId){ v.tx = panning.tx + e.clientX - panning.x; v.ty = panning.ty + e.clientY - panning.y; limit(); apply(); return; }
      pt.x = e.clientX; pt.y = e.clientY;
      if(gest && ptrs.size >= 2){ doGesture(); return; }
      if(!drawing || drawing.id !== e.pointerId) return;
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e]; const minD = 0.9 / v.s;
      for(const ev of (evs.length ? evs : [e])){
        const [x, y] = toLogical(ev.clientX, ev.clientY);
        if(Math.hypot(x - drawing.last[0], y - drawing.last[1]) < minD) continue;
        drawing.s.p.push(r1(x), r1(y)); drawing.last = [x, y];
      }
      kick(); e.preventDefault();
    }
    function up(e){
      if(picker){ picker.up(e); return; }
      const had = ptrs.delete(e.pointerId);
      if(panning && panning.id === e.pointerId){ panning = null; return; }
      if(gest && ptrs.size < 2){ gest = null; }
      if(!had || !drawing || drawing.id !== e.pointerId) return;
      const s = drawing.s; drawing = null; lctx.clearRect(0, 0, live.width, live.height);
      if(s.t !== "e"){ paint(ctx, s); }
      else if(s.p.length >= 4){ /* eraser already painted live */ }
      commit({ k: "add", s });
    }
    function cancelStroke(){ if(!drawing) return; drawing = null; lctx.clearRect(0, 0, live.width, live.height); if(tool.t === "e") redraw(); }
    function startGesture(){
      const [a, b] = [...ptrs.values()]; gest = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
    }
    function doGesture(){
      const [a, b] = [...ptrs.values()]; if(!a || !b) return;
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1, cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      v.tx += cx - gest.cx; v.ty += cy - gest.cy; zoomAt(d / gest.d, cx, cy);
      gest.d = d; gest.cx = cx; gest.cy = cy;
    }
    function wheel(e){
      e.preventDefault();
      if(e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.0022), e.clientX, e.clientY);
      else { v.tx -= e.deltaX; v.ty -= e.deltaY; limit(); apply(); }
    }
    view.addEventListener("pointerdown", down); view.addEventListener("pointermove", move);
    view.addEventListener("pointerup", up); view.addEventListener("pointercancel", up);
    view.addEventListener("wheel", wheel, { passive: false });
    view.addEventListener("contextmenu", e => e.preventDefault());
    const ro = window.ResizeObserver ? new ResizeObserver(() => { if(view.clientWidth) limit(); apply(); }) : null; ro && ro.observe(view);

    /* ---------- history ---------- */
    function commit(a){
      if(a.k === "add") page.strokes.push(a.s);
      undoS.push(a); if(undoS.length > 250) undoS.shift(); redoS.length = 0;
      opts.onChange && opts.onChange(a);
    }
    function undo(){
      const a = undoS.pop(); if(!a) return false;
      if(a.k === "add"){ const i = page.strokes.lastIndexOf(a.s); if(i >= 0) page.strokes.splice(i, 1); redraw(); }
      else if(a.k === "clear"){ page.strokes = a.s.slice(); page.blocks = a.b.slice(); redraw(); }
      else if(a.k === "block+"){ page.blocks = page.blocks.filter(b => b.id !== a.b.id); }
      else if(a.k === "block-"){ page.blocks.push(a.b); }
      redoS.push(a); opts.onChange && opts.onChange({ k: "undo", a }); return true;
    }
    function redo(){
      const a = redoS.pop(); if(!a) return false;
      if(a.k === "add"){ page.strokes.push(a.s); paint(ctx, a.s); }
      else if(a.k === "clear"){ page.strokes = []; page.blocks = []; redraw(); }
      else if(a.k === "block+"){ page.blocks.push(a.b); }
      else if(a.k === "block-"){ page.blocks = page.blocks.filter(b => b.id !== a.b.id); }
      undoS.push(a); opts.onChange && opts.onChange({ k: "redo", a }); return true;
    }
    function clear(){ if(!page.strokes.length && !page.blocks.length) return; const a = { k: "clear", s: page.strokes.slice(), b: page.blocks.slice() }; page.strokes = []; page.blocks = []; redraw(); undoS.push(a); redoS.length = 0; opts.onChange && opts.onChange(a); }
    function addBlock(b){ page.blocks.push(b); undoS.push({ k: "block+", b }); redoS.length = 0; opts.onChange && opts.onChange({ k: "block+", b }); }
    function removeBlock(id){ const b = page.blocks.find(x => x.id === id); if(!b) return; page.blocks = page.blocks.filter(x => x.id !== id); undoS.push({ k: "block-", b }); redoS.length = 0; opts.onChange && opts.onChange({ k: "block-", b }); }
    function setPage(p){ page = p; page.strokes = page.strokes || []; page.blocks = page.blocks || []; undoS = []; redoS = []; drawing = null; k = 0; resizeBacking(); if(!cv.width) resizeBacking(); redraw(); }

    /* ---------- measuring / exporting ---------- */
    function bboxOf(s){ let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; const p = s.p, pad = s.w / 2; for(let i = 0; i < p.length; i += 2){ if(p[i] < x0) x0 = p[i]; if(p[i] > x1) x1 = p[i]; if(p[i + 1] < y0) y0 = p[i + 1]; if(p[i + 1] > y1) y1 = p[i + 1]; } return [x0 - pad, y0 - pad, x1 + pad, y1 + pad]; }
    function ink(region){                                  // strokes (not erasers) whose centre lies in region [x0,y0,x1,y1], or all
      return page.strokes.filter(s => { if(s.t === "e") return false; if(!region) return true; const b = bboxOf(s), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2; return cx >= region[0] && cx <= region[2] && cy >= region[1] && cy <= region[3]; });
    }
    function bounds(region){ const L = ink(region); if(!L.length) return null; let b = [1e9, 1e9, -1e9, -1e9]; L.forEach(s => { const q = bboxOf(s); b = [Math.min(b[0], q[0]), Math.min(b[1], q[1]), Math.max(b[2], q[2]), Math.max(b[3], q[3])]; }); return b; }
    function inkBottom(){ let m = 0; page.strokes.forEach(s => { if(s.t !== "e") m = Math.max(m, bboxOf(s)[3]); }); return m; }
    /* Render ink to an image. mode "plain": dark ink on white (best for handwriting recognition). mode "paper": as seen, on opts.bg. */
    function snapshot(o){
      o = o || {}; const region = o.region || null; let b = bounds(region);
      if(!b && !o.allowEmpty) return null;
      b = b || [0, 0, PAGE_W, PAGE_H]; const m = o.margin == null ? 24 : o.margin;
      let x0 = Math.max(0, b[0] - m), y0 = Math.max(0, b[1] - m), x1 = Math.min(PAGE_W, b[2] + m), y1 = Math.min(PAGE_H, b[3] + m);
      if(o.whole){ x0 = 0; y0 = 0; x1 = PAGE_W; y1 = PAGE_H; }
      const w = x1 - x0, h = y1 - y0, sc = Math.min(1, (o.max || 1024) / Math.max(w, h)) * (o.scale || 1);
      const c = document.createElement("canvas"); c.width = Math.max(8, Math.round(w * sc)); c.height = Math.max(8, Math.round(h * sc));
      const x = c.getContext("2d"); x.fillStyle = o.bg || "#ffffff"; x.fillRect(0, 0, c.width, c.height);
      const kk = k; k = sc;                                // paint() draws with the module-level k
      x.save(); x.translate(-x0 * sc, -y0 * sc);
      const strokes = o.mode === "plain" ? page.strokes.map(s => (s.t === "e" ? s : Object.assign({}, s, { c: "#000000", t: s.t === "c" ? "p" : s.t }))) : page.strokes;
      const layer = document.createElement("canvas"); layer.width = c.width; layer.height = c.height; const lx = layer.getContext("2d");
      lx.translate(-x0 * sc, -y0 * sc); strokes.forEach(s => { if(!region || s.t === "e" || inRegion(s, region)) paint(lx, s); });
      k = kk; x.restore(); x.drawImage(layer, 0, 0);
      return { canvas: c, rect: [x0, y0, x1, y1], dataUrl: c.toDataURL(o.type || "image/jpeg", o.q || 0.85) };
    }
    function inRegion(s, r){ const b = bboxOf(s), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2; return cx >= r[0] && cx <= r[2] && cy >= r[1] && cy <= r[3]; }

    /* ---------- on-page pickers (region / break line) ---------- */
    function pick(kind, cb, cancelCb){
      const ov = document.createElement("div"); ov.className = "dd-pick " + kind; view.append(ov);
      const rect = document.createElement("i"); rect.className = "dd-pickrect"; ov.append(rect); let a = null;
      const finish = (res) => { picker = null; ov.remove(); res ? cb(res) : cancelCb && cancelCb(); };
      picker = {
        down(e){ a = [e.clientX, e.clientY]; try{ view.setPointerCapture(e.pointerId); }catch(_){} ov.classList.add("on"); picker.move(e); e.preventDefault(); },
        move(e){
          if(!a) return; const r = view.getBoundingClientRect();
          if(kind === "line"){ rect.style.cssText = `left:0;right:0;top:${e.clientY - r.top}px;height:0`; a[1] = e.clientY; return; }
          const x0 = Math.min(a[0], e.clientX), y0 = Math.min(a[1], e.clientY), x1 = Math.max(a[0], e.clientX), y1 = Math.max(a[1], e.clientY);
          rect.style.cssText = `left:${x0 - r.left}px;top:${y0 - r.top}px;width:${x1 - x0}px;height:${y1 - y0}px`; a[2] = e.clientX; a[3] = e.clientY;
        },
        up(e){
          if(!a) return;
          if(kind === "line"){ const y = toLogical(0, e.clientY)[1]; finish({ y }); return; }
          const p1 = toLogical(Math.min(a[0], e.clientX), Math.min(a[1], e.clientY)), p2 = toLogical(Math.max(a[0], e.clientX), Math.max(a[1], e.clientY));
          if(p2[0] - p1[0] < 14 || p2[1] - p1[1] < 14){ a = null; rect.style.cssText = ""; return; }   // a tap, not a drag: keep waiting
          finish({ region: [p1[0], p1[1], p2[0], p2[1]] });
        },
        cancel(){ finish(null); },
      };
      return picker;
    }
    function cancelPick(){ if(picker) picker.cancel(); }

    /* ---------- ink gaps (so a page break never cuts through writing) ---------- */
    function gapNear(y){
      const iv = page.strokes.filter(s => s.t !== "e").map(s => { const b = bboxOf(s); return [b[1], b[3]]; }).sort((p, q) => p[0] - q[0]); const gaps = []; let end = 0;
      iv.forEach(([a, b]) => { if(a - end >= 10) gaps.push((a + end) / 2); end = Math.max(end, b); });
      if(PAGE_H - end >= 10) gaps.push((end + PAGE_H) / 2);
      if(!gaps.length) return null; return gaps.reduce((best, g) => Math.abs(g - y) < Math.abs(best - y) ? g : best, gaps[0]);
    }
    function destroy(){ destroyed = true; ro && ro.disconnect(); view.removeEventListener("pointerdown", down); view.removeEventListener("pointermove", move); view.removeEventListener("pointerup", up); view.removeEventListener("pointercancel", up); view.removeEventListener("wheel", wheel); sheet.remove(); }

    return { sheet, fit, zoomBy, setTool: t => { tool = Object.assign(tool, t); }, getTool: () => tool, setPage, getPage: () => page, undo, redo, clear, addBlock, removeBlock,
      canUndo: () => undoS.length > 0, canRedo: () => redoS.length > 0, snapshot, bounds, inkBottom, ink, pick, cancelPick, gapNear, toLogical, toScreen, getView: () => v, redraw, destroy, PAGE_W, PAGE_H, bboxOf, _undoDepth: () => undoS.length };
  }
  window.DABSy = window.DABSy || {};
  window.DABSy.doodlePad = { create, PAGE_W, PAGE_H };
})();
