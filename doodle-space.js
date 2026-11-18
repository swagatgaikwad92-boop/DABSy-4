/* ============================================================
   D.A.B.S.y — doodle-space.js  (v12.1 · DABSy DOODLE SPACE: "Think it. Draw it. Solve it.")
   Two notebooks in one place:  FUN (free drawing + "Ask DABSy")  and  MATHS (handwriting -> confirmed reading -> exact local maths).
   Three separate responsibilities in Maths mode:
     1. READING the handwriting   -> a vision-capable AI, only when you tap Recognise / Check (never automatically), and always CONFIRMED by you when unsure.
     2. COMPUTING and VERIFYING   -> doodle-math.js, on this device, exact, offline.
     3. EXPLAINING and teaching   -> the existing Study tutor (D.ai.study), told the verified result so it can't change the numbers.
   Pages: a real multi-page notebook (no endless canvas); Fun and Maths keep separate notebooks, saved in IndexedDB (doodle-store.js).
   Entry: double-tap DABSy -> app bubbles -> Doodle Space.   Public: D.doodle.open(mode?), close(), state().
   ============================================================ */
(function(){
  "use strict";
  const D = window.DABSy, ui = D.ui, bus = D.bus, el = ui.el, store = D.doodleStore, M = D.doodleMath, Pad = D.doodlePad;
  const $ = (s, r) => (r || document).querySelector(s);

  /* ---------- tiny icon set (stroke icons, same style as ui-kit) ---------- */
  const IC = {
    pen: '<path d="M4 20l1.2-4.2L16 5a2.1 2.1 0 0 1 3 3L8.2 18.8 4 20Z"/><path d="M14 7l3 3"/>',
    pencil: '<path d="M5 19l1-4L16.5 4.5a2 2 0 0 1 3 3L9 18l-4 1Z"/><path d="M5 19l2.2-.6M13 8l3 3" opacity=".6"/>',
    eraser: '<path d="M7 20h11"/><path d="M5.5 14.5 14 6a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L11 19H8.2a2 2 0 0 1-1.4-.6l-1.3-1.3a2 2 0 0 1 0-2.6Z"/>',
    undo: '<path d="M9 7 4 12l5 5"/><path d="M4 12h10a5 5 0 0 1 0 10h-3"/>',
    redo: '<path d="m15 7 5 5-5 5"/><path d="M20 12H10a5 5 0 0 0 0 10h3"/>',
    ask: '<path d="M12 3.5l1.7 4.6 4.8 1.7-4.8 1.7L12 16.1l-1.7-4.6-4.8-1.7 4.8-1.7L12 3.5Z"/><path d="M18.5 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2Z"/>',
    scan: '<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><path d="M8 12h8"/>',
    check: '<path d="m5 12.5 4.2 4.2L19 7"/>',
    hint: '<path d="M9.5 18h5M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z"/>',
    solve: '<path d="M18 6H7l5.5 6L7 18h11"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', back: '<path d="m15 5-7 7 7 7"/>', more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
    prev: '<path d="m14 6-6 6 6 6"/>', next: '<path d="m10 6 6 6-6 6"/>', close: '<path d="M6 6l12 12M18 6 6 18"/>', size: '<circle cx="6" cy="12" r="1.6"/><circle cx="13" cy="12" r="3"/><circle cx="20" cy="12" r="0.001"/>',
  };
  const svg = (n, s) => `<svg viewBox="0 0 24 24" width="${s || 20}" height="${s || 20}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n] || ""}</svg>`;
  const btn = (cls, icon, label, on, txt) => { const b = el("button", { class: cls, type: "button", "aria-label": label, title: label, html: svg(icon) + (txt ? `<span>${txt}</span>` : "") }); b.addEventListener("click", on); return b; };

  /* ---------- state ---------- */
  const PRESETS = {
    fine:   { name: "Fine liner",   t: "p", w: 1.6, a: 1,    sm: 0.35 },
    normal: { name: "Normal pen",   t: "p", w: 3.5, a: 1,    sm: 0.3 },
    marker: { name: "Thick marker", t: "p", w: 10,  a: 0.92, sm: 0.4 },
    pencil: { name: "Pencil",       t: "c", w: 3,   a: 1,    sm: 0.15 },
    hi:     { name: "Highlighter",  t: "h", w: 22,  a: 0.35, sm: 0.5 },
  };
  const S = { open: false, mode: null, meta: null, idx: 0, pad: null, page: null, saveT: 0, saved: true, tool: "p", pen: { preset: "normal", t: "p", c: "auto", w: 3.5, a: 1, sm: 0.3 }, er: { size: 22, em: "p" }, hints: {}, sel: null, threads: {}, lastDeleted: null, lastWarn: 0, nearDismissed: {}, paper: null };
  const PEN_COLORS = ["auto", "#4f62c4", "#2b8a8a", "#3f8f5f", "#c9792b", "#c4455f", "#8a5bd0", "#9aa0b8", "#111111", "#ffffff"];
  let root, views = {}, head, pageLbl, saveDot, viewEl, tagsEl, toolbar, popLayer, cardEl, nearChip, prevBtn, nextBtn, menuEl, bubbleEl;
  /* Remembered per notebook (Fun and Maths each keep their own pen and eraser) in this device's local storage. */
  const allPrefs = () => { try{ return (D.memory.read("doodle_prefs2", {}) || {}); }catch(_){ return {}; } };
  const savePrefs = () => { try{ const a = allPrefs(); a[S.mode] = { tool: S.tool, pen: S.pen, er: S.er }; D.memory.write("doodle_prefs2", a); }catch(_){} };
  function loadPrefs(mode){
    const p = allPrefs()[mode]; S.tool = "p"; S.pen = Object.assign({ preset: "normal", c: "auto" }, PRESETS.normal); S.er = { size: 22, em: "p" };
    if(p){ if(p.pen && typeof p.pen.w === "number") S.pen = Object.assign(S.pen, p.pen); if(p.er && typeof p.er.size === "number") S.er = Object.assign(S.er, p.er); if(p.tool === "e" || p.tool === "p") S.tool = p.tool; }
    if(mode === "maths" && S.pen.t === "c") S.pen = Object.assign({}, S.pen, PRESETS.normal, { preset: "normal" });
  }
  const theme = () => document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  const paperNow = () => S.paper || Pad.paperOf({ k: "plain" });
  const autoInk = () => paperNow().dark ? "#e9e7f6" : "#2c303f";        // automatic ink follows the PAPER (dark paper -> light ink), not the app theme
  const paperBg = () => paperNow().bg;
  const offline = () => !navigator.onLine;
  const say = (text, o) => ui.toast(Object.assign({ text, timeout: 4500 }, o || {}));

  /* ============================================================ BUILD ============================================================ */
  function build(){
    if(root) return;
    root = el("section", { id: "doodle", role: "dialog", "aria-label": "Doodle Space", hidden: true, "data-view": "modes" });
    /* --- mode chooser --- */
    const modes = el("div", { class: "dd-modes" },
      el("button", { class: "dd-x icon-btn glass", type: "button", "aria-label": "Close Doodle Space", html: svg("close", 18), onclick: close }),
      el("div", { class: "dd-hello" }, el("h1", {}, "Doodle Space"), el("p", {}, "Think it. Draw it. Solve it.")),
      el("div", { class: "dd-modelist" },
        modeCard("fun", "🎨", "Fun", "Free drawing, creativity and conversations."),
        modeCard("maths", "📐", "Maths", "Handwriting, equations and problem-solving.")),
      el("p", { class: "dd-fine" }, "Your pages are saved on this device. A drawing is only sent anywhere when you tap Ask DABSy, Recognise or Check."));
    views.modes = modes;
    /* --- workspace --- */
    saveDot = el("i", { class: "dd-save", title: "Saved", "aria-label": "Saved" });
    pageLbl = el("button", { class: "dd-pagelbl", type: "button", "aria-label": "Page list", onclick: pageList }, "Page 1 / 1");
    prevBtn = btn("dd-ib", "prev", "Previous page", () => go(S.idx - 1)); nextBtn = btn("dd-ib", "next", "Next page", () => go(S.idx + 1));
    head = el("header", { class: "dd-head glass-surface" },
      btn("dd-ib", "back", "Back to modes", () => modeScreen()), el("div", { class: "dd-pager" }, prevBtn, pageLbl, nextBtn),
      btn("dd-ib", "plus", "New page", () => newPage()), btn("dd-ib", "more", "Page and notebook options", e => menu(e)), saveDot);
    viewEl = el("div", { class: "dd-view", tabindex: "-1" });
    tagsEl = el("div", { class: "dd-tags" });
    nearChip = el("div", { class: "dd-near", hidden: true }, el("span", {}, "This page is nearly full."), el("button", { class: "btn sm primary", type: "button", onclick: () => newPage() }, "New page"), el("button", { class: "dd-ib sm", type: "button", "aria-label": "Dismiss", html: svg("close", 14), onclick: () => { nearChip.hidden = true; S.nearDismissed[S.page.id] = true; } }));
    toolbar = el("div", { class: "dd-bar glass-surface", role: "toolbar", "aria-label": "Drawing tools" });
    popLayer = el("div", { class: "dd-pop", hidden: true });
    cardEl = el("div", { class: "dd-card glass-surface", hidden: true });
    bubbleEl = el("div", { class: "dd-bubble glass-surface", hidden: true });
    menuEl = el("div", { class: "dd-menu glass-surface", hidden: true });
    views.work = el("div", { class: "dd-work" }, head, viewEl, tagsEl, nearChip, bubbleEl, cardEl, popLayer, toolbar, menuEl);
    root.append(views.modes, views.work);
    document.body.append(root);
    root.addEventListener("keydown", onKey);
    new MutationObserver(() => S.pad && S.pad.redraw()).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    store.onStatus(st => { if(!st.persistent && S.open) say("I can't save on this device right now (private mode or storage is full). Your pages stay until you close the app — use Save drawing to keep a copy.", { timeout: 9000 }); updateSaveDot(); });
    window.addEventListener("online", () => S.open && updateSaveDot());
    document.addEventListener("visibilitychange", () => { if(document.hidden && S.open) flush(); });
    window.addEventListener("pagehide", () => { if(S.open) flush(); });
    window.addEventListener("popstate", () => { if(S.open && !S.popping) close(true); });
  }
  function modeCard(mode, emoji, title, text){
    const sub = el("small", { "data-sub": mode }, "");
    const b = el("button", { class: "dd-mode", type: "button", "data-mode": mode, onclick: () => openMode(mode) }, el("span", { class: "dd-emoji", "aria-hidden": "true" }, emoji), el("b", {}, title + " mode"), el("span", {}, text), sub);
    return b;
  }
  async function fillModeSubs(){
    for(const m of ["fun", "maths"]){
      let t = "A fresh notebook"; try{ const meta = await store.loadNotebook(m); const n = meta.pages.length; const cur = await store.loadPage(m, meta.current); t = (cur.strokes.length || n > 1) ? `Continue · ${n} page${n > 1 ? "s" : ""}` : "A fresh notebook"; }catch(_){}
      const s = $(`[data-sub="${m}"]`, root); if(s) s.textContent = t;
    }
  }

  /* ============================================================ OPEN / CLOSE ============================================================ */
    async function open(mode){
    build(); if(S.open && !mode) return;
    if(D.liveTalk && D.liveTalk.isOn && D.liveTalk.isOn()) D.liveTalk.stop();      // the microphone is not left on under a notebook
    if(D.app && D.app.closeCommand) D.app.closeCommand();
    root.hidden = false; S.open = true; document.body.classList.add("doodle-open");
    try{ history.pushState({ dd: 1 }, ""); }catch(_){}
    if(mode) await openMode(mode); else { modeScreen(); }
    root.classList.add("on"); setTimeout(() => ($(".dd-mode", root) || root).focus && ($(".dd-mode", root) || root).focus({ preventScroll: true }), 60);
    bus.emit("doodle:opened");
  }
  function modeScreen(){ flush(); root.dataset.view = "modes"; if(S.pad){ S.pad.destroy(); S.pad = null; } hideAll(); fillModeSubs(); }
  function close(fromPop){
    if(!S.open) return; flush(); S.open = false;
    root.classList.remove("on"); document.body.classList.remove("doodle-open");
    setTimeout(() => { if(!S.open){ root.hidden = true; if(S.pad){ S.pad.destroy(); S.pad = null; } } }, 250);
    hideAll(); if(!fromPop){ try{ if(history.state && history.state.dd){ S.popping = true; history.back(); setTimeout(() => S.popping = false, 300); } }catch(_){} }
    bus.emit("doodle:closed");
  }
  function hideAll(){ [popLayer, cardEl, bubbleEl, menuEl, nearChip].forEach(n => n && (n.hidden = true)); if(S.pad) S.pad.cancelPick(); }
  function onKey(e){
    if(e.key === "Escape"){ if(!popLayer.hidden || !menuEl.hidden || !cardEl.hidden){ hideAll(); } else close(); return; }
    if(root.dataset.view !== "work" || /INPUT|TEXTAREA/.test(document.activeElement && document.activeElement.tagName)) return;
    if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z"){ e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); }
    else if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y"){ e.preventDefault(); doRedo(); }
  }

  /* ============================================================ NOTEBOOK ============================================================ */
  async function openMode(mode){
    flush(); S.mode = mode; S.sel = null; hideAll(); loadPrefs(mode);
    S.meta = await store.loadNotebook(mode); S.idx = Math.max(0, S.meta.pages.indexOf(S.meta.current));
    root.dataset.view = "work"; root.dataset.mode = mode;
    if(S.pad){ S.pad.destroy(); S.pad = null; }
    S.pad = Pad.create(viewEl, { autoInk, onChange: onPadChange, onView: placeTags });
    await showPage(S.idx, true); buildToolbar(); updateSaveDot();
    requestAnimationFrame(() => { S.pad.fit(); placeTags(); });
    store.requestPersist();
  }
  const pageBg = p => (p && p.bg) || S.meta.bg || { k: "plain" };
  const pageSize = p => Pad.SIZES[(p && p.size) || S.meta.size] || Pad.SIZES.std;
  function applyPaper(){
    S.paper = Pad.paperOf(pageBg(S.page)); const css = Pad.paperCss(pageBg(S.page)); Object.assign(S.pad.sheet.style, css);
    viewEl.dataset.dark = S.paper.dark ? "1" : "0"; if(S.pad) S.pad.redraw();
  }
  function applySize(){ const sz = pageSize(S.page); const [w, h] = S.pad.size(); if(w !== sz.w || h !== sz.h) S.pad.setSize(sz.w, sz.h); }
  async function showPage(i, first){
    i = Math.max(0, Math.min(S.meta.pages.length - 1, i)); if(!first) await flushNow();
    S.idx = i; S.meta.current = S.meta.pages[i]; store.saveMeta(S.mode, S.meta);
    S.page = await store.loadPage(S.mode, S.meta.pages[i]); applySize(); S.pad.setPage(S.page); applyPaper();
    S.sel = null; renderBlocks(); updateHead(); checkNear(); cardEl.hidden = true; bubbleEl.hidden = true;
    if(!first) requestAnimationFrame(() => S.pad.fit());
  }
  const go = i => { if(i >= 0 && i < S.meta.pages.length) showPage(i); };
  const pageName = id => (S.meta.names && S.meta.names[id]) || "";
  function updateHead(){
    const n = S.meta.pages.length, nm = pageName(S.page.id);
    pageLbl.textContent = nm ? `${nm.length > 14 ? nm.slice(0, 13) + "…" : nm} · ${S.idx + 1}/${n}` : `Page ${S.idx + 1} / ${n}`; prevBtn.disabled = S.idx === 0; nextBtn.disabled = S.idx === n - 1;
  }
  async function insertPage(p, idx){
    await flushNow(); S.meta.pages.splice(idx, 0, p.id); await store.savePage(S.mode, p); await store.saveMeta(S.mode, S.meta); await showPage(idx, false); return p;
  }
  async function newPage(at){
    const base = S.page || {}; const p = store.mk(null, { bg: base.bg || null, size: base.size || null });    // a new page starts with the same paper and size as the one you are on
    return insertPage(p, (at == null ? S.idx : at) + 1);
  }
  async function duplicatePage(){
    await flushNow(); const copy = JSON.parse(JSON.stringify(S.page)); copy.id = store.mk().id; copy.updated = Date.now();
    (copy.blocks || []).forEach(b => { b.id = "b" + Math.random().toString(36).slice(2, 8); });
    const nm = pageName(S.page.id); if(nm) S.meta.names[copy.id] = nm + " (copy)";
    await insertPage(copy, S.idx + 1); say("Page duplicated.");
  }
  async function renamePage(name){ name = String(name || "").trim().slice(0, 40); if(name) S.meta.names[S.page.id] = name; else delete S.meta.names[S.page.id]; await store.saveMeta(S.mode, S.meta); updateHead(); }
  async function movePage(from, to){
    if(to < 0 || to >= S.meta.pages.length || from === to) return; const cur = S.meta.pages[S.idx];
    const [id] = S.meta.pages.splice(from, 1); S.meta.pages.splice(to, 0, id); S.idx = S.meta.pages.indexOf(cur); S.meta.current = cur;
    await store.saveMeta(S.mode, S.meta); updateHead();
  }
  /* paper / size: for this page, or (applyAll) the whole notebook and every new page */
  async function setPaper(bg, applyAll){
    S.page.bg = bg; S.saved = false; applyPaper(); scheduleSave();
    if(applyAll){ S.meta.bg = bg; await applyToAll(p => { p.bg = bg; }); }
    store.saveMeta(S.mode, S.meta);
  }
  async function setSize(key, applyAll){
    S.page.size = key; S.saved = false; applySize(); S.pad.fit(); scheduleSave(); checkNear();
    if(applyAll){ S.meta.size = key; await applyToAll(p => { p.size = key; }); }
    store.saveMeta(S.mode, S.meta);
  }
  async function applyToAll(fn){ for(const id of S.meta.pages){ if(id === S.page.id) continue; const p = await store.loadPage(S.mode, id); fn(p); await store.savePage(S.mode, p); } }

  async function deletePage(){
    const ok = await ui.popup({ title: "Delete this page?", text: S.meta.pages.length === 1 ? "This is the only page, so it will be emptied rather than removed." : `Page ${S.idx + 1} and everything on it will be removed.`, actions: [{ label: "Keep it", value: false, kind: "ghost" }, { label: "Delete", value: true, kind: "primary" }], dismissValue: false });
    if(!ok) return;
    const gone = JSON.parse(JSON.stringify(S.page)), at = S.idx, wasSingle = S.meta.pages.length === 1;
    if(S.meta.pages.length === 1){ S.pad.clear(); S.pad.undo(); S.page.strokes = []; S.page.blocks = []; S.pad.setPage(S.page); renderBlocks(); scheduleSave(); }
    else { S.meta.pages.splice(at, 1); await store.deletePage(S.mode, gone.id); await showPage(Math.min(at, S.meta.pages.length - 1), true); await store.saveMeta(S.mode, S.meta); }
    S.lastDeleted = { page: gone, at, mode: S.mode, single: wasSingle };
    ui.toast({ text: "Page deleted.", timeout: 9000, actions: [{ label: "Undo", onClick: undoDelete }] });
  }
  async function undoDelete(){
    const d = S.lastDeleted; if(!d || d.mode !== S.mode) return; S.lastDeleted = null;
    if(d.single){ S.page.strokes = d.page.strokes; S.page.blocks = d.page.blocks; await store.savePage(S.mode, S.page); await showPage(0, true); say("Page restored."); return; }
    if(!S.meta.pages.includes(d.page.id)) S.meta.pages.splice(Math.min(d.at, S.meta.pages.length), 0, d.page.id);
    await store.savePage(S.mode, d.page); await store.saveMeta(S.mode, S.meta); await showPage(S.meta.pages.indexOf(d.page.id), true); say("Page restored.");
  }
  async function pageBreak(){
    hideAll(); say("Drag to the line where the new page should start.", { timeout: 3500 });
    S.pad.pick("line", async ({ y }) => {
      const gy = S.pad.gapNear(y);
      if(gy == null){ say("There's no clear gap on this page to break at. Add some space between lines first."); return; }
      const mv = [], keep = [], mvB = [], keepB = [];
      S.page.strokes.forEach(s => (S.pad.bboxOf(s)[1] >= gy ? mv : keep).push(s)); S.page.blocks.forEach(b => (b.bbox[1] >= gy ? mvB : keepB).push(b));
      if(!mv.length && !mvB.length){ say("Nothing is below that line, so there's nothing to move. Use New page instead."); return; }
      const dy = gy - 56, shift = a => { for(let i = 1; i < a.length; i += 2) a[i] = Math.round((a[i] - dy) * 10) / 10; };
      mv.forEach(s => shift(s.p)); mvB.forEach(b => { b.bbox[1] -= dy; });
      const before = { strokes: S.page.strokes.slice(), blocks: S.page.blocks.slice() };
      S.page.strokes = keep; S.page.blocks = keepB; S.pad.setPage(S.page); renderBlocks(); await store.savePage(S.mode, S.page);
      const p = store.mk(null, { bg: S.page.bg, size: S.page.size }); p.strokes = mv; p.blocks = mvB; const at = S.idx; S.meta.pages.splice(at + 1, 0, p.id); await store.savePage(S.mode, p); await store.saveMeta(S.mode, S.meta);
      ui.toast({ text: `Page break added. Everything below the line moved to page ${at + 2}.`, timeout: 9000, actions: [{ label: "Undo", onClick: async () => {
        mv.forEach(s => { for(let i = 1; i < s.p.length; i += 2) s.p[i] = Math.round((s.p[i] + dy) * 10) / 10; }); mvB.forEach(b => { b.bbox[1] += dy; });
        const i = S.meta.pages.indexOf(p.id); if(i >= 0){ S.meta.pages.splice(i, 1); await store.deletePage(S.mode, p.id); }
        S.page.strokes = before.strokes; S.page.blocks = before.blocks; S.pad.setPage(S.page); renderBlocks(); await store.savePage(S.mode, S.page); await store.saveMeta(S.mode, S.meta); updateHead(); } }] });
      updateHead(); checkNear();
    });
  }
  function checkNear(){
    if(!S.pad || !S.page) return; const bot = S.pad.inkBottom(); const near = bot > S.pad.PAGE_H * 0.86;
    nearChip.hidden = !near || !!S.nearDismissed[S.page.id] || S.idx !== S.meta.pages.indexOf(S.page.id);
    if(near && !nearChip.hidden){ const last = S.idx === S.meta.pages.length - 1; nearChip.firstChild.textContent = last ? "This page is nearly full." : "This page is nearly full. The next page is ready."; }
  }
  function pageList(){
    const wrap = el("div", { class: "dd-plist" });
    S.meta.pages.forEach((id, i) => {
      const nm = pageName(id) || ("Page " + (i + 1));
      wrap.append(el("div", { class: "dd-prow" + (i === S.idx ? " on" : "") },
        el("button", { class: "dd-pname", type: "button", onclick: () => { popLayer.hidden = true; go(i); } }, el("b", {}, String(i + 1)), el("span", {}, nm)),
        el("button", { class: "dd-ib sm", type: "button", "aria-label": "Move page up", disabled: i === 0, html: svg("prev", 14).replace("<svg", '<svg style="transform:rotate(90deg)"'), onclick: async () => { await movePage(i, i - 1); pageList(); } }),
        el("button", { class: "dd-ib sm", type: "button", "aria-label": "Move page down", disabled: i === S.meta.pages.length - 1, html: svg("prev", 14).replace("<svg", '<svg style="transform:rotate(-90deg)"'), onclick: async () => { await movePage(i, i + 1); pageList(); } })));
    });
    showPop(wrap, pageLbl);
  }

  /* ---------- saving ---------- */
  function onPadChange(a){
    S.saved = false; scheduleSave(); updateSaveDot(); updateTools();
    if(a && (a.k === "add" || a.k === "undo" || a.k === "redo" || a.k === "clear")) checkNear();
    if(a && (a.k === "block+" || a.k === "block-" || a.k === "undo" || a.k === "redo" || a.k === "clear")) renderBlocks();
  }
  function scheduleSave(){ clearTimeout(S.saveT); S.saveT = setTimeout(flushNow, 600); }
  async function flushNow(){
    clearTimeout(S.saveT); if(!S.page || !S.mode || S.saved) return;
    const mode = S.mode, page = S.page; S.saved = true; const ok = await store.savePage(mode, page); if(!ok) S.saved = false; updateSaveDot();
  }
  function flush(){ flushNow(); }
  function updateSaveDot(){
    if(!saveDot) return; const st = store.status(); const state = !st.persistent ? "warn" : S.saved ? "ok" : "busy";
    saveDot.dataset.s = state; const t = state === "ok" ? "Saved on this device" : state === "busy" ? "Saving…" : "Not saved on this device"; saveDot.title = t; saveDot.setAttribute("aria-label", t);
  }

  /* ============================================================ TOOLBARS + CUSTOMISATION ============================================================ */
  let toolBtns = {};
  const penActive = () => S.tool === "p" && S.pen.t !== "c", pencilActive = () => S.tool === "p" && S.pen.t === "c";
  function applyTool(){
    if(!S.pad) return;
    S.pad.setTool(S.tool === "e" ? { t: "e", w: S.er.size, em: S.er.em } : { t: S.pen.t, c: S.pen.c, w: S.pen.w, a: S.pen.a, sm: S.pen.sm });
  }
  function buildToolbar(){
    toolbar.textContent = ""; toolBtns = {}; const fun = S.mode === "fun";
    const tb = (id, icon, label, fn, txt) => { const b = btn("dd-t", icon, label, fn, txt); toolBtns[id] = b; toolbar.append(b); return b; };
    const sep = () => toolbar.append(el("i", { class: "dd-sep" }));
    tb("p", "pen", "Pen", e => { if(penActive()) penPanel(toolBtns.p); else { if(S.pen.t === "c") useSettings(Object.assign({}, S.pen, PRESETS.normal, { preset: "normal" })); S.tool = "p"; commitTool(); } });
    if(fun) tb("c", "pencil", "Pencil", () => { if(pencilActive()) penPanel(toolBtns.c); else { useSettings(Object.assign({}, S.pen, PRESETS.pencil, { preset: "pencil" })); S.tool = "p"; commitTool(); } });
    tb("e", "eraser", "Eraser", () => { if(S.tool === "e") eraserPanel(toolBtns.e); else { S.tool = "e"; commitTool(); } }); sep();
    if(fun){
      tb("size", "size", "Pen settings", () => penPanel(toolBtns.size));
      const col = tb("color", "pen", "Colour", () => colorPop(col)); col.classList.add("dd-colbtn"); sep();
    }
    tb("undo", "undo", "Undo", doUndo); tb("redo", "redo", "Redo", doRedo); sep();
    if(fun) tb("ask", "ask", "Ask DABSy", askDabsy, "Ask");
    else { [["rec", "scan", "Recognise what I wrote", recognise, "Read"], ["chk", "check", "Check my work", checkWork, "Check"], ["hint", "hint", "Hint", hint, "Hint"], ["solve", "solve", "Solve step by step", solve, "Solve"]].forEach(a => { tb(...a).dataset.x = "1"; }); }
    applyTool(); updateTools();
  }
  const swatchCss = c => c === "auto" ? "linear-gradient(135deg,#2c303f 50%,#e9e7f6 50%)" : c;
  const useSettings = o => { S.pen = Object.assign(S.pen, o); };
  function commitTool(){ applyTool(); savePrefs(); updateTools(); popLayer.hidden = true; }
  function updateTools(){
    if(!S.pad) return;
    if(toolBtns.p) toolBtns.p.classList.toggle("on", penActive()); if(toolBtns.c) toolBtns.c.classList.toggle("on", pencilActive()); if(toolBtns.e) toolBtns.e.classList.toggle("on", S.tool === "e");
    if(toolBtns.color) toolBtns.color.innerHTML = `<i class="dd-swatch" style="background:${swatchCss(S.pen.c)}"></i>`;
    if(toolBtns.undo) toolBtns.undo.disabled = !S.pad.canUndo(); if(toolBtns.redo) toolBtns.redo.disabled = !S.pad.canRedo();
  }
  const doUndo = () => { S.pad && S.pad.undo(); updateTools(); }, doRedo = () => { S.pad && S.pad.redo(); updateTools(); };
  function showPop(content, anchor){
    popLayer.textContent = ""; popLayer.append(content); popLayer.hidden = false;
    const r = (anchor && typeof anchor === "object" ? anchor : toolbar).getBoundingClientRect(), pr = root.getBoundingClientRect();
    popLayer.style.left = Math.max(8, Math.min(pr.width - 8 - popLayer.offsetWidth, r.left - pr.left + r.width / 2 - popLayer.offsetWidth / 2)) + "px";
    if(anchor === pageLbl || anchor === "top"){ popLayer.style.top = (pageLbl.getBoundingClientRect().bottom - pr.top + 8) + "px"; popLayer.style.bottom = "auto"; } else { popLayer.style.bottom = (pr.bottom - toolbar.getBoundingClientRect().top + 10) + "px"; popLayer.style.top = "auto"; }
    const off = e => { if(!popLayer.contains(e.target) && !(anchor && anchor.contains && anchor.contains(e.target)) && !(e.target.closest && e.target.closest(".dd-pop"))){ popLayer.hidden = true; document.removeEventListener("pointerdown", off, true); } }; setTimeout(() => document.addEventListener("pointerdown", off, true), 0);
  }
  const row = (label, ...kids) => el("div", { class: "dd-prow2" }, el("label", {}, label), ...kids);
  function slider(min, max, step, val, on, aria){ const r = el("input", { type: "range", min: String(min), max: String(max), step: String(step), value: String(val), "aria-label": aria }); r.addEventListener("input", () => on(+r.value)); return r; }
  function chip(txt, on, active){ const b = el("button", { type: "button", class: "dd-cchip" + (active ? " on" : ""), onclick: on }, txt); return b; }

  /* ---- PEN panel: presets, live preview, colour (+custom), thickness, opacity, smoothness ---- */
  function penPanel(anchor){
    const box = el("div", { class: "dd-panel" });
    const pv = el("canvas", { class: "dd-pv", width: 560, height: 120, "aria-label": "Pen preview" }); box.append(pv);
    const drawPv = () => {
      const c = pv.getContext("2d"), P = paperNow(); c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = P.bg; c.fillRect(0, 0, 560, 120);
      const sc = Math.max(0.55, S.pad ? S.pad.getView().s : 0.5) * 2;                  // preview thickness = what you will see on screen (×2 for the preview's pixel density)
      c.lineCap = S.pen.t === "h" ? "butt" : "round"; c.lineJoin = "round"; c.strokeStyle = S.pen.c === "auto" ? autoInk() : S.pen.c; c.lineWidth = Math.max(1, S.pen.w * (S.pen.t === "c" ? 0.85 : 1) * sc / 2 * 1.0);
      c.globalAlpha = S.pen.t === "c" ? 0.74 * S.pen.a : S.pen.a; c.beginPath(); c.moveTo(24, 70);
      for(let x = 24; x <= 536; x += 8) c.lineTo(x, 60 + Math.sin(x / 38) * 26 + Math.sin(x / 11) * 4);
      c.stroke(); c.globalAlpha = 1;
    };
    const presets = el("div", { class: "dd-cchips" }), colors = el("div", { class: "dd-colors2" });
    const refresh = () => { presets.textContent = ""; Object.entries(PRESETS).forEach(([k, v]) => { if(S.mode === "maths" && k === "pencil") return; presets.append(chip(v.name, () => { useSettings(Object.assign({}, v, { preset: k })); S.tool = "p"; commitToolKeep(); fill(); refresh(); }, S.pen.preset === k)); }); drawPv(); };
    const commitToolKeep = () => { applyTool(); savePrefs(); updateTools(); };
    const custom = () => { S.pen.preset = "custom"; commitToolKeep(); refresh(); };
    const sw = el("div", { class: "dd-sws" });
    const mkSw = () => { sw.textContent = ""; PEN_COLORS.forEach(c => sw.append(el("button", { class: "dd-sw sm" + (S.pen.c === c ? " on" : ""), type: "button", "aria-label": c === "auto" ? "Automatic ink (follows the paper)" : "Colour " + c, style: "background:" + swatchCss(c), onclick: () => { S.pen.c = c; S.tool = "p"; custom(); mkSw(); } })));
      const ci = el("input", { type: "color", class: "dd-cin", "aria-label": "Custom colour", value: /^#[0-9a-f]{6}$/i.test(S.pen.c) ? S.pen.c : "#4f62c4" }); ci.addEventListener("input", () => { S.pen.c = ci.value; S.tool = "p"; custom(); sw.querySelectorAll(".dd-sw").forEach(x => x.classList.remove("on")); }); sw.append(el("label", { class: "dd-custom" }, "Custom", ci)); };
    const sThick = slider(0.8, 36, 0.2, S.pen.w, v => { S.pen.w = v; custom(); }, "Pen thickness"), sOp = slider(10, 100, 1, Math.round(S.pen.a * 100), v => { S.pen.a = v / 100; custom(); }, "Pen opacity"), sSm = slider(0, 100, 1, Math.round(S.pen.sm * 100), v => { S.pen.sm = v / 100; custom(); }, "Smoothing");
    const fill = () => { sThick.value = S.pen.w; sOp.value = Math.round(S.pen.a * 100); sSm.value = Math.round(S.pen.sm * 100); mkSw(); };
    box.append(presets, sw, row("Thickness", sThick), row("Opacity", sOp), row("Smoothing", sSm), el("p", { class: "dd-hintp" }, "Smoothing steadies shaky lines (higher = steadier, with a little lag). Your pen is remembered."));
    refresh(); mkSw(); showPop(box, anchor);
  }
  function colorPop(anchor){
    const w = el("div", { class: "dd-panel slim" }); const sws = el("div", { class: "dd-sws" });
    PEN_COLORS.forEach(c => sws.append(el("button", { class: "dd-sw sm" + (S.pen.c === c ? " on" : ""), type: "button", "aria-label": c === "auto" ? "Automatic ink (follows the paper)" : "Colour " + c, style: "background:" + swatchCss(c), onclick: () => { S.pen.c = c; S.pen.preset = "custom"; if(S.tool === "e") S.tool = "p"; commitTool(); } })));
    const ci = el("input", { type: "color", class: "dd-cin", "aria-label": "Custom colour", value: /^#[0-9a-f]{6}$/i.test(S.pen.c) ? S.pen.c : "#4f62c4" }); ci.addEventListener("change", () => { S.pen.c = ci.value; S.pen.preset = "custom"; if(S.tool === "e") S.tool = "p"; commitTool(); });
    sws.append(el("label", { class: "dd-custom" }, "Custom", ci)); w.append(sws); showPop(w, anchor);
  }
  /* ---- ERASER panel: size presets, custom size, behaviour, clear page, undo/redo ---- */
  function eraserPanel(anchor){
    const box = el("div", { class: "dd-panel" }); const ring = el("div", { class: "dd-erprev" }, el("i", {})); const dot = ring.firstChild;
    const upd = () => { const d = Math.max(8, Math.min(70, S.er.size * Math.max(0.55, S.pad.getView().s))); dot.style.width = dot.style.height = d + "px"; };
    const sizes = el("div", { class: "dd-cchips" }); const rs = slider(4, 90, 1, S.er.size, v => { S.er.size = v; applyTool(); savePrefs(); upd(); drawSizes(); }, "Eraser size");
    const drawSizes = () => { sizes.textContent = ""; [["Small", 10], ["Medium", 24], ["Large", 52]].forEach(([n, v]) => sizes.append(chip(n, () => { S.er.size = v; rs.value = v; applyTool(); savePrefs(); upd(); drawSizes(); }, S.er.size === v))); };
    const modes = el("div", { class: "dd-cchips" }); const drawModes = () => { modes.textContent = ""; modes.append(chip("Rub out", () => { S.er.em = "p"; applyTool(); savePrefs(); drawModes(); }, S.er.em === "p"), chip("Whole stroke", () => { S.er.em = "s"; applyTool(); savePrefs(); drawModes(); }, S.er.em === "s")); };
    const acts = el("div", { class: "dd-opts" }, el("button", { class: "btn sm", type: "button", onclick: () => { doUndo(); } }, "Undo"), el("button", { class: "btn sm", type: "button", onclick: () => { doRedo(); } }, "Redo"), el("button", { class: "btn sm", type: "button", onclick: () => { popLayer.hidden = true; clearPage(); } }, "Clear page"));
    drawSizes(); drawModes(); upd(); box.append(ring, sizes, row("Size", rs), modes, el("p", { class: "dd-hintp" }, "“Rub out” erases like a rubber. “Whole stroke” removes a whole line you touch."), acts); showPop(box, anchor);
  }
  async function clearPage(){
    if(!S.page.strokes.length && !S.page.blocks.length) return;
    const ok = await ui.popup({ title: "Clear this page?", text: "You can undo it right after.", actions: [{ label: "Keep it", value: false, kind: "ghost" }, { label: "Clear", value: true, kind: "primary" }], dismissValue: false });
    if(ok){ S.pad.clear(); updateTools(); }
  }
  /* ---- PAGE panel: background, size, name, duplicate, delete, move ---- */
  const PAPER_ORDER = ["plain", "warm", "dark", "cream", "grid", "dgrid", "ruled", "dots", "graph"];
  function pagePanel(){
    const box = el("div", { class: "dd-panel wide" }); let all = false;
    const nm = el("input", { type: "text", class: "dd-binp", maxlength: "40", placeholder: "Page name", "aria-label": "Page name", value: pageName(S.page.id) }); nm.addEventListener("change", () => renamePage(nm.value));
    const grid = el("div", { class: "dd-papers" }); const cur = pageBg(S.page);
    const drawG = () => { grid.textContent = ""; const now = pageBg(S.page);
      PAPER_ORDER.forEach(k => { const css = Pad.paperCss({ k }); const b = el("button", { type: "button", class: "dd-paper" + (now.k === k ? " on" : ""), "aria-label": Pad.PAPERS[k].name, onclick: async () => { await setPaper({ k }, all); drawG(); } }, el("i", { style: Object.entries(css).map(([a, v]) => a.replace(/[A-Z]/g, m => "-" + m.toLowerCase()) + ":" + v).join(";") + ";background-size:" + (css.backgroundSize.replace(/(\d+)px/g, (m, n) => Math.max(5, Math.round(n / 4)) + "px")) }), el("span", {}, Pad.PAPERS[k].name)); grid.append(b); });
      const cc = el("input", { type: "color", class: "dd-cin", "aria-label": "Custom background colour", value: now.k === "custom" ? (now.c || "#ffffff") : "#ffffff" }); cc.addEventListener("input", async () => { await setPaper({ k: "custom", c: cc.value, pat: (pageBg(S.page).pat) || null }, all); grid.querySelectorAll(".dd-paper").forEach(x => x.classList.remove("on")); });
      grid.append(el("label", { class: "dd-paper custom" + (now.k === "custom" ? " on" : "") }, el("i", { style: "background:conic-gradient(#d95,#6c9,#59d,#c6d,#d95)" }), el("span", {}, "Custom colour"), cc)); };
    const sizes = el("div", { class: "dd-cchips" }); const drawS = () => { sizes.textContent = ""; Object.entries(Pad.SIZES).forEach(([k, v]) => sizes.append(chip(v.name, async () => { await setSize(k, all); drawS(); }, (S.page.size || S.meta.size) === k))); };
    const allBtn = chip("Apply to every page", () => { all = !all; allBtn.classList.toggle("on", all); }, false);
    box.append(row("Name", nm), el("h4", {}, "Background"), grid, el("h4", {}, "Page size"), sizes, el("p", { class: "dd-hintp" }, "Pages stay a fixed size; use a taller page for long solutions. (No infinite canvas — it would slow phones down.)"), el("div", { class: "dd-cchips" }, allBtn),
      el("div", { class: "dd-opts" }, el("button", { class: "btn sm", type: "button", onclick: () => { popLayer.hidden = true; duplicatePage(); } }, "Duplicate page"), el("button", { class: "btn sm", type: "button", onclick: () => { popLayer.hidden = true; deletePage(); } }, "Delete page")));
    drawG(); drawS(); showPop(box, "top");
  }
  function menu(e){
    const fun = S.mode === "fun", items = [];
    items.push(["Page settings…", pagePanel], ["New page", () => newPage()], ["Duplicate page", duplicatePage], ["Page break…", pageBreak], ["Delete page", deletePage], ["Clear this page", clearPage]);
    if(fun) items.push(["Save drawing", saveDrawing]);
    items.push(["Vision setup", () => visionSetup(null, { manual: true })]);
    items.push(["Zoom to fit", () => S.pad.fit()], ["Zoom in", () => S.pad.zoomBy(1.4)], ["Zoom out", () => S.pad.zoomBy(1 / 1.4)]);
    items.push(["Switch to " + (fun ? "Maths" : "Fun") + " mode", () => openMode(fun ? "maths" : "fun")]);
    menuEl.textContent = ""; items.forEach(([t, fn]) => menuEl.append(el("button", { type: "button", class: "dd-mi", onclick: () => { menuEl.hidden = true; fn(); } }, t))); menuEl.hidden = false;
    const off = ev => { if(!menuEl.contains(ev.target)){ menuEl.hidden = true; document.removeEventListener("pointerdown", off, true); } }; setTimeout(() => document.addEventListener("pointerdown", off, true), 0);
  }

  /* ============================================================ FUN MODE ============================================================ */
  async function saveDrawing(){
    const snap = S.pad.snapshot({ whole: true, mode: "paper", bg: paperBg(), paper: pageBg(S.page), max: 1800, type: "image/png", allowEmpty: true });
    if(!snap){ say("Nothing to save yet."); return; }
    snap.canvas.toBlob(async blob => {
      if(!blob){ say("I couldn't make the image."); return; }
      const name = `dabsy-doodle-${new Date().toISOString().slice(0, 10)}-p${S.idx + 1}.png`;
      try{ const file = new File([blob], name, { type: "image/png" }); if(navigator.canShare && navigator.canShare({ files: [file] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)){ await navigator.share({ files: [file], title: "My doodle" }); return; } }catch(e){ if(e && e.name === "AbortError") return; }
      const a = el("a", { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); say("Saved as " + name + ".");
    }, "image/png");
  }
  /* ---------------- VISION: the picture only leaves this device if a vision service is connected AND proven to see ---------------- */
  const VISION_WHY = {
    "no-service": "No vision service is connected yet. A test picture sent to your main DABSy Worker was not read back, so it can't see pictures (it handles text only, or it refused).",
    "offline": "You're offline, so I can't look at this right now. Drawing, saving and the maths on this device still work.",
    "unreachable": "I couldn't reach the vision service.",
    "ignores-images": "The service answered, but without actually seeing the test picture — it is ignoring images.",
  };
  function visionError(r){
    if(r.error === "no-vision" || r.error === "no-image") return "I can't see pictures yet — a vision service isn't connected. Open Vision setup from the ⋯ menu.";
    return D.ai && D.ai.errorLine ? D.ai.errorLine(r.error) : "I couldn't reach my thinking service.";
  }
  let probing = null;
  /* true only when a test picture has really been read back correctly (see ai.checkVision) */
  async function seeReady(onFail){
    const st = D.ai.visionStatus(); if(st.ok === true) return true;
    if(probing) return probing;
    probing = (async () => {
      showCard(el("div", { class: "dd-busy" }, "Checking that I can see pictures… (sends a tiny test picture, not your drawing)"));
      const r = await D.ai.checkVision(false); probing = null;
      if(r.ok){ cardEl.hidden = true; return true; }
      visionSetup(r, { onFail }); return false;
    })();
    return probing;
  }
  function visionSetup(r, o){
    o = o || {}; const st = D.ai.visionStatus(); const box = el("div", { class: "dd-vsetup" });
    const ok = st.ok === true;
    box.append(el("h3", {}, ok ? "I can see pictures ✓" : "Connecting my eyes"));
    if(ok) box.append(el("p", { class: "dd-note" }, "A test picture was read back correctly" + (st.via === "vision-url" ? " through your vision service." : " through your main service.") + " Pictures are sent only when you tap Ask, Read or Check."));
    else if(r) box.append(el("p", { class: "dd-note" }, (VISION_WHY[r.why] || "Something went wrong.") + (r.detail && r.why !== "offline" ? " (" + String(r.detail).slice(0, 120) + ")" : "")));
    else box.append(el("p", { class: "dd-note" }, "Pictures are not read yet. Connect a vision service below; DABSy tests it with a tiny generated picture before trusting it."));
    if(!ok && r && r.why !== "offline"){
      box.append(el("p", { class: "dd-note" }, "Fix: deploy backend/vision-worker.js as its own free Cloudflare Worker (about 5 minutes, steps in backend/VISION_SETUP.md), then paste its address here."));
    }
    const inp = el("input", { type: "url", class: "dd-ta one", placeholder: "https://dabsy-vision.YOURNAME.workers.dev", "aria-label": "Vision service address", value: D.ai.visionUrl() || "", autocapitalize: "off", spellcheck: "false" });
    const status = el("p", { class: "dd-note", role: "status" });
    const test = async () => {
      const u = inp.value.trim(); if(u && !/^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)[:\/])/i.test(u)){ status.textContent = "The address must start with https://"; return; }
      D.ai.setVisionUrl(u); status.textContent = "Testing with a picture…"; const rr = await D.ai.checkVision(true);
      if(rr.ok){ status.textContent = ""; visionSetup(rr, {}); say("Vision works — I can see pictures now."); } else { status.textContent = (VISION_WHY[rr.why] || "Failed.") + (rr.detail ? " (" + String(rr.detail).slice(0, 100) + ")" : ""); }
    };
    box.append(inp, el("div", { class: "dd-opts" }, el("button", { class: "btn sm primary", type: "button", onclick: test }, ok ? "Test again" : "Connect and test"),
      (!ok && o.onFail) ? el("button", { class: "btn sm", type: "button", onclick: () => { cardEl.hidden = true; o.onFail(); } }, "Type it instead") : null, ok ? el("button", { class: "btn sm", type: "button", onclick: () => { cardEl.hidden = true; } }, "Close") : null), status);
    showCard(box);
  }
  function funContext(){
    try{ const s = D.memory.getSession(4).map(m => (m.role === "user" ? "Student: " : "DABSy: ") + String(m.text).slice(0, 160)).join("\n"); return s; }catch(_){ return ""; }
  }
  const FUN_SYSTEM = "You are D.A.B.S.y, a curious, warm, gently funny desk-pet looking at a doodle someone just drew. Say what you actually see, tentatively: objects, characters, scenes, shapes, diagrams and how the parts relate. If there is handwriting, read it out. Never claim certainty; if it's unclear, say what you can see and ask ONE short, friendly question. Do not judge the drawing quality, do not lecture, no lists, 1 to 3 short sentences. If a conversation snippet is given, only use it if it clearly relates; otherwise ignore it. If you cannot see an image attached to this message, reply with exactly: NO_IMAGE";
  const FUN_FOLLOW = "You are D.A.B.S.y chatting playfully with the person who drew the attached doodle. Answer their question using what is actually visible in the picture, in 1 or 2 short warm sentences, in character. If they tell you what something is, accept it graciously — they know best. If you cannot see an image attached to this message, reply with exactly: NO_IMAGE";
  async function askDabsy(){
    const snap = S.pad.snapshot({ mode: "paper", bg: paperBg(), paper: pageBg(S.page), max: 1024, q: 0.85, margin: 40 });
    if(!snap){ showBubble("Draw something first, then tap Ask and I'll tell you what I see.", { plain: true }); return; }
    if(!(await seeReady())) return;
    const key = S.page.id; const th = S.threads[key] = { msgs: [], img: snap.dataUrl.split(",")[1] };
    showBubble("Looking at your drawing… (it's sent to your vision service for this)", { busy: true });
    const ctx = funContext();
    const r = await D.ai.vision({ bare: false, system: FUN_SYSTEM, prompt: (ctx ? "Recent chat (may be unrelated):\n" + ctx + "\n\n" : "") + "Here is the doodle. What do you see?", image: th.img, mime: "image/jpeg" });
    if(!r.ok){ showBubble(visionError(r), { plain: true }); return; }
    if(/^\s*NO_IMAGE\b/.test(r.text)){ D.ai.setVisionUrl(D.ai.visionUrl()); visionSetup({ ok: false, why: "ignores-images" }); return; }
    th.msgs.push({ who: "dabsy", text: r.text.trim() }); showBubble(r.text.trim(), { thread: key });
  }
  async function replyToDabsy(key, text){
    const th = S.threads[key]; th.msgs.push({ who: "you", text }); showBubble(text, { thread: key, busy: true });
    const hist = th.msgs.map(m => (m.who === "you" ? "Student: " : "DABSy: ") + m.text).join("\n");
    const r = await D.ai.vision({ bare: false, system: FUN_FOLLOW, prompt: hist + "\nDABSy:", image: th.img, mime: "image/jpeg" });   // the same picture is re-sent with each follow-up you type
    const reply = r.ok ? r.text.trim().replace(/^DABSy:\s*/i, "") : visionError(r);
    th.msgs.push({ who: "dabsy", text: reply }); showBubble(reply, { thread: key });
  }
  function showBubble(text, o){
    o = o || {}; bubbleEl.textContent = ""; bubbleEl.hidden = false; bubbleEl.classList.toggle("busy", !!o.busy);
    const body = el("div", { class: "dd-btext", role: "status" }, text); bubbleEl.append(body);
    const row = el("div", { class: "dd-brow" });
    if(o.thread && !o.busy){
      const inp = el("input", { type: "text", class: "dd-binp", placeholder: "Tell DABSy…", "aria-label": "Reply to DABSy", maxlength: "200", enterkeyhint: "send" });
      const send = () => { const v = inp.value.trim(); if(v) replyToDabsy(o.thread, v); };
      inp.addEventListener("keydown", e => { if(e.key === "Enter"){ e.preventDefault(); send(); } });
      row.append(inp, el("button", { class: "btn sm primary", type: "button", onclick: send }, "Send"));
    }
    row.append(el("button", { class: "dd-ib sm", type: "button", "aria-label": "Close", html: svg("close", 14), onclick: () => { bubbleEl.hidden = true; } }));
    bubbleEl.append(row);
  }

  /* ============================================================ MATHS MODE ============================================================ */
  const RECOG_SYSTEM = "You are a careful reader of handwritten mathematics. You transcribe; you never solve, simplify, correct or complete. If you cannot see an image attached to this message, reply with exactly: NO_IMAGE";
  const RECOG_PROMPT = 'Transcribe the handwritten maths in the image into LaTeX, one entry per written line, top to bottom. Copy every sign, coefficient, exponent and bracket EXACTLY as written, even if it looks wrong. Do not add "=0", do not simplify, do not solve. A multiplication sign (×) is different from the letter x; a fraction bar is different from a minus; a square-root sign is different from a tick; 1 vs l and 0 vs O depend on context. Reply with ONLY JSON, no markdown: {"lines":[{"latex":"...","confidence":0.0}],"unclear":["short note for each symbol you are unsure about"]}. confidence is 0 to 1 for that line. Use "\\frac{a}{b}", "\\sqrt{...}", "x^{2}", "\\vec{a}" for vectors (arrow or bar over a letter), "\\le", "\\ge", "<", ">" for inequalities, "\\theta" etc. for Greek letters. If the picture is a diagram rather than an expression, transcribe only labelled quantities and put a one-line description in "unclear". If nothing mathematical is visible reply {"lines":[],"unclear":["nothing readable"]}.';
  function parseRecog(text){
    const m = String(text || "").match(/\{[\s\S]*\}/); if(!m) return null;
    try{
      const o = JSON.parse(m[0]); const fix = s => (D.math && D.math.repair ? D.math.repair(String(s)) : String(s));
      const lines = (o.lines || []).map(l => ({ latex: fix(l.latex || "").trim(), conf: typeof l.confidence === "number" ? l.confidence : 0.5 })).filter(l => l.latex);
      return { lines, unclear: (o.unclear || []).map(String).filter(Boolean) };
    }catch(_){ return null; }
  }
  /* 1) READ: pick a region, send ONLY that region, then always show what was read */
  function recognise(){
    if(S.pad.ink().length === 0){ say("Write something first, then tap Read."); return; }
    pickRegion("Drag a box around the maths you want me to read.", region => readRegion(region, "problem"));
  }
  function pickRegion(msg, cb){
    hideAll(); const bar = el("div", { class: "dd-pickbar glass-surface" }, el("span", {}, msg), el("button", { class: "btn sm", type: "button", onclick: () => { S.pad.cancelPick(); bar.remove(); cb(null, true); } }, "Whole page"), el("button", { class: "dd-ib sm", type: "button", "aria-label": "Cancel", html: svg("close", 14), onclick: () => { S.pad.cancelPick(); bar.remove(); } }));
    views.work.append(bar);
    S.pad.pick("rect", ({ region }) => { bar.remove(); cb(region); }, () => bar.remove());
  }
  async function readRegion(region, purpose, ctx){
    const snap = S.pad.snapshot({ region, mode: "plain", bg: "#ffffff", max: 1400, type: "image/png", margin: 30 });
    if(!snap){ say("I can't see any writing in that box."); return; }
    const bb = S.pad.bounds(region);
    const typed = () => confirmReading(null, "", { bbox: bb, purpose, ctx });
    if(!(await seeReady(typed))) return;
    showCard(el("div", { class: "dd-busy" }, "Reading your handwriting… (this region is sent to your vision service)"));
    const r = await D.ai.vision({ bare: true, system: RECOG_SYSTEM, prompt: RECOG_PROMPT, image: snap.dataUrl.split(",")[1], mime: "image/png", json: true });
    let rec = null, why = "";
    if(!r.ok) why = visionError(r); else if(/^\s*NO_IMAGE\b/.test(r.text)) why = "The service didn't receive the picture."; else { rec = parseRecog(r.text); if(!rec || !rec.lines.length) why = "I couldn't read anything mathematical there."; }
    confirmReading(rec, why, { bbox: bb, purpose, ctx });
  }
  /* 2) CONFIRM: low confidence / ambiguity / no recogniser -> you decide what it says. Never silently solved. */
  function confirmReading(rec, why, o){
    const lines = rec ? rec.lines.map(l => l.latex) : [""]; const amb = [];
    lines.forEach(l => M.ambiguities(l).forEach(a => amb.push(a.text)));
    const low = rec ? rec.lines.some(l => l.conf < 0.85) : true; const unclear = rec ? rec.unclear : [];
    const needAsk = !rec || low || unclear.length || amb.length || o.purpose === "working" || o.purpose === "edit";
    if(!needAsk){ accept(lines, o); return; }
    const box = el("div", { class: "dd-confirm" });
    box.append(el("h3", {}, rec ? "Is this what you wrote?" : "I need your help reading this"));
    if(why) box.append(el("p", { class: "dd-note" }, why + (offline() || /setup|service|offline/i.test(why) ? " You can type what you wrote below, and I'll still compute and check it here on your device." : "")));
    const prev = el("div", { class: "dd-prevtex" }); box.append(prev);
    const ta = el("textarea", { rows: String(Math.min(5, Math.max(2, lines.length))), class: "dd-ta", "aria-label": "What you wrote, one line per row", spellcheck: "false", autocapitalize: "off", autocomplete: "off" }); ta.value = lines.join("\n");
    const renderPrev = () => { const t = ta.value.split("\n").map(s => s.trim()).filter(Boolean).map(s => `$$${toTex(s)}$$`).join("\n"); D.math ? D.math.renderInto(prev, t || " ").catch(() => { prev.textContent = ta.value; }) : (prev.textContent = ta.value); };
    ta.addEventListener("input", renderPrev); renderPrev();
    [...new Set([...unclear, ...amb])].slice(0, 4).forEach(t => box.append(el("p", { class: "dd-q" }, "• " + t)));
    box.append(ta);
    const chips = el("div", { class: "dd-chips" }); ["√", "²", "^", "÷", "×", "π", "(", ")", "≤", "≥"].forEach(c => chips.append(el("button", { type: "button", class: "dd-chip", onclick: () => { const s = ta.selectionStart || ta.value.length; ta.setRangeText(c, s, ta.selectionEnd || s, "end"); ta.dispatchEvent(new Event("input")); ta.focus(); } }, c))); box.append(chips);
    box.append(el("div", { class: "dd-actions" }, el("button", { class: "btn primary", type: "button", onclick: () => { const L = ta.value.split("\n").map(s => s.trim()).filter(Boolean); if(!L.length){ say("Type or fix what you wrote first."); return; } cardEl.hidden = true; accept(L, o); } }, "Yes, that's it"), el("button", { class: "btn ghost", type: "button", onclick: () => { cardEl.hidden = true; } }, "Cancel")));
    showCard(box);
  }
  const toTex = s => { const n = M.normalize(s); return /\\/.test(s) ? s : n.replace(/sqrt\(([^()]*)\)/g, "\\sqrt{$1}").replace(/\^\(([^()]*)\)/g, "^{$1}").replace(/\*/g, "\\cdot ").replace(/\bpi\b/g, "\\pi ").replace(/≤/g, "\\le ").replace(/≥/g, "\\ge ").replace(/≠/g, "\\ne "); };
  function accept(lines, o){
    if(o.purpose === "working"){ finishCheck(lines, o); return; }
    if(o.purpose === "edit"){ const eb = (S.page.blocks || []).find(x => x.id === o.editId); if(eb){ eb.lines = lines; eb.cur = 0; S.saved = false; scheduleSave(); renderBlocks(); select(eb.id); } return; }
    const bb = o.bbox || [60, 60, 400, 120]; const id = "b" + Date.now().toString(36);
    const block = { id, bbox: [Math.round(bb[0] - 8), Math.round(bb[1] - 8), Math.round(bb[2] - bb[0] + 16), Math.round(bb[3] - bb[1] + 16)], lines, cur: 0 };
    S.pad.addBlock(block); renderBlocks(); select(id);
  }
  /* ---------- blocks (recognised regions) ---------- */
  const analysis = {};
  const analyse = (b, i) => { const k = b.id + ":" + (i == null ? b.cur : i) + ":" + b.lines[i == null ? b.cur : i]; return analysis[k] || (analysis[k] = M.analyse(b.lines[i == null ? b.cur : i])); };
  function renderBlocks(){
    S.pad.sheet.querySelectorAll(".dd-block").forEach(n => n.remove()); tagsEl.textContent = "";
    (S.page.blocks || []).forEach(b => {
      const [x, y, w, h] = b.bbox; const a = analyse(b); const n = el("div", { class: "dd-block" + (S.sel === b.id ? " sel" : ""), "data-id": b.id, style: `left:${x}px;top:${y}px;width:${w}px;height:${h}px` });
      const res = resultOf(a); if(res){ const r = el("div", { class: "dd-res " + (res.cls || ""), style: `left:${w + 10}px;font-size:${Math.max(30, Math.min(64, h * 0.72))}px` }); r.textContent = res.short; n.append(r); }
      S.pad.sheet.append(n);
      const tag = el("button", { class: "dd-tag" + (S.sel === b.id ? " sel" : ""), type: "button", "data-id": b.id, "aria-label": "Recognised maths: " + b.lines.join("; ") + ". Tap for options.", onclick: () => select(b.id) }, "✓ " + (a.kind === "arithmetic" ? "sum" : a.kind === "equation" ? "equation" : a.kind === "error" ? "?" : "maths")); tagsEl.append(tag);
    });
    placeTags();
  }
  function placeTags(){
    if(!S.pad || !S.page) return; const vr = viewEl.getBoundingClientRect();
    tagsEl.querySelectorAll(".dd-tag").forEach(t => { const b = (S.page.blocks || []).find(x => x.id === t.dataset.id); if(!b) return; const [sx, sy] = S.pad.toScreen(b.bbox[0] + b.bbox[2], b.bbox[1]); const hostR = tagsEl.getBoundingClientRect(); t.style.left = Math.max(4, Math.min(hostR.width - 78, sx - hostR.left - 66)) + "px"; t.style.top = Math.max(4, sy - hostR.top - 24) + "px"; t.hidden = (sy < vr.top - 10 || sy > vr.bottom); });
  }
  function resultOf(a){
    if(a.kind === "arithmetic"){ const dec = M.vdec(a.value), ex = M.vtxt(a.value); return { short: "= " + ex + (ex !== dec && !/[√]/.test(ex) && ex.includes("/") ? "  ≈ " + dec : (/√/.test(ex) ? "  ≈ " + dec : "")), cls: "ok" }; }
    if(a.kind === "identity" || (a.kind === "inequality" && a.truth != null)) return { short: a.truth ? "✓ true" : "✗ not true", cls: a.truth ? "ok" : "bad" };
    return null;
  }
  function select(id){
    S.sel = id; S.pad.sheet.querySelectorAll(".dd-block").forEach(n => n.classList.toggle("sel", n.dataset.id === id)); tagsEl.querySelectorAll(".dd-tag").forEach(n => n.classList.toggle("sel", n.dataset.id === id));
    const b = (S.page.blocks || []).find(x => x.id === id); if(b) problemCard(b);
  }
  const cur = () => (S.page.blocks || []).find(b => b.id === S.sel) || null;
  function needBlock(){ const b = cur() || (S.page.blocks || [])[S.page.blocks.length - 1]; if(!b){ say("Tap Read first so I know which problem you mean."); return null; } if(S.sel !== b.id) select(b.id); return b; }
  function showCard(node){ cardEl.textContent = ""; cardEl.append(el("button", { class: "dd-ib sm dd-cx", type: "button", "aria-label": "Close", html: svg("close", 14), onclick: () => { cardEl.hidden = true; } }), node); cardEl.hidden = false; cardEl.scrollTop = 0; }
  const rich = (target, text) => (D.math ? D.math.renderInto(target, text).catch(() => { target.textContent = text; }) : (target.textContent = text));

  /* ---------- the problem card: "What would you like to do?" ---------- */
  function problemCard(b){
    const a = analyse(b), box = el("div", { class: "dd-problem" });
    if(b.lines.length > 1){ const sel = el("div", { class: "dd-lines" }); b.lines.forEach((l, i) => sel.append(el("button", { type: "button", class: "dd-line" + (i === b.cur ? " on" : ""), onclick: () => { b.cur = i; scheduleSave(); renderBlocks(); problemCard(b); } }, el("span", { class: "tx" }, l)))); box.append(sel); }
    const tex = el("div", { class: "dd-readtex" }); rich(tex, "$$" + toTex(b.lines[b.cur]) + "$$"); box.append(tex);
    const res = resultOf(a);
    const actions = el("div", { class: "dd-opts" }), opt = (t, fn, p) => actions.append(el("button", { class: "btn sm" + (p ? " primary" : ""), type: "button", onclick: fn }, t));
    if(a.kind === "error"){ box.append(el("p", { class: "dd-note" }, "I couldn't make sense of this: " + a.error)); opt("Fix what it says", () => editBlock(b), true); }
    else if(a.kind === "calculus"){ box.append(el("p", { class: "dd-note" }, a.note)); opt("Explain the concept", () => explain(b, "concept"), true); }
    else if(a.kind === "arithmetic"){ box.append(el("p", { class: "dd-resline" }, res.short)); if(a.ambiguities.length) box.append(el("p", { class: "dd-note" }, a.ambiguities[0].text + " Tap “Fix what it says” if it isn't right.")); opt("Show the steps", () => explain(b, "arith")); opt("Fix what it says", () => editBlock(b)); }
    else if(a.kind === "identity" || a.kind === "inequality"){ box.append(el("p", { class: "dd-resline " + (a.truth ? "ok" : "bad") }, a.truth == null ? (a.note || "") : (a.truth ? "That's true." : `That's not true: the left side is ${M.vtxt(a.lhs || a.value || {s:null,f:NaN})}${a.rhs ? ", the right side is " + M.vtxt(a.rhs) : ""}.`)));
      opt("Explain the concept", () => explain(b, "concept")); opt("Fix what it says", () => editBlock(b)); }
    else if(a.kind === "equation" && a.sol && a.sol.type === "multi"){ box.append(el("p", { class: "dd-note" }, "This has several letters (" + a.vars.join(", ") + "), so it's a formula or relation rather than one equation to solve for a number.")); opt("What do the letters mean?", () => letters(b), true); opt("Explain the concept", () => explain(b, "concept")); opt("Fix what it says", () => editBlock(b)); }
    else if(a.kind === "equation" && a.sol && ["quadratic", "linear", "numeric"].includes(a.sol.type)){
      box.append(el("h3", {}, "What would you like to do?"));
      if(a.ambiguities.length) box.append(el("p", { class: "dd-note" }, a.ambiguities[0].text + " If it isn't what you meant, fix it before solving."));
      opt("Solve step by step", () => solve(), true); opt("Give me a hint", hint); opt("Let me solve it", () => mine(b)); opt("Explain the concept", () => explain(b, "concept")); opt("Fix what it says", () => editBlock(b));
    } else { box.append(el("p", { class: "dd-note" }, (a.sol && a.sol.note) || a.note || "I can show this clearly and explain it, but I can't compute it on this device.")); opt("Explain the concept", () => explain(b, "concept"), true); opt("Fix what it says", () => editBlock(b)); }
    box.append(actions);
    box.append(el("button", { class: "dd-link", type: "button", onclick: async () => { const ok = await ui.popup({ title: "Remove this reading?", text: "Your handwriting stays. Only DABSy's reading of it is removed.", actions: [{ label: "Keep", value: false, kind: "ghost" }, { label: "Remove", value: true, kind: "primary" }], dismissValue: false }); if(ok){ S.pad.removeBlock(b.id); S.sel = null; cardEl.hidden = true; renderBlocks(); } } }, "Remove this reading"));
    showCard(box);
  }
  function editBlock(b){
    confirmReading({ lines: b.lines.map(l => ({ latex: l, conf: 1 })), unclear: [] }, "Fix anything I misread, then confirm.", { bbox: [b.bbox[0] + 8, b.bbox[1] + 8, b.bbox[0] + b.bbox[2] - 8, b.bbox[1] + b.bbox[3] - 8], purpose: "edit", editId: b.id });
  }

  /* ---------- Solve / Hint / Explain ---------- */
  function problemOf(b){ const a = analyse(b); return a && a.kind === "equation" && a.sol && a.sol.roots ? a : null; }
  function solve(){
    const b = needBlock(); if(!b) return; const a = analyse(b);
    if(a.kind === "arithmetic"){ explain(b, "arith"); return; }
    if(!problemOf(b)){ say("I can only solve single-letter equations here. Tap the tag for what I can do with this one."); problemCard(b); return; }
    const sol = a.sol, box = el("div", { class: "dd-solution" }); box.append(el("h3", {}, "Step by step"));
    const body = el("div", { class: "dd-steps" }); box.append(body);
    let tex = "";
    if(sol.type === "quadratic") M.quadraticSteps(sol).forEach((st, i) => { tex += `**${i + 1}.** ${st.say}\n` + (st.tex ? `$$${st.tex}$$\n` : "") + "\n"; });
    if(sol.type === "linear") tex = `**1.** Bring everything to one side:\n$$${sol.std}$$\n\n**2.** Isolate ${sol.v}:\n$$${sol.v}=\\frac{-(${M.vtex(sol.b)})}{${M.vtex(sol.a)}}=${M.vtex(sol.roots[0])}$$\n`;
    if(sol.type === "numeric") tex = `This is a degree ${sol.deg} equation. I found its real roots numerically (decimals, not exact forms).\n`;
    tex += `**Answer**\n$$${M.answerTex(sol)}$$`;
    rich(body, tex);
    const ver = a.ver || []; const allOk = ver.length ? ver.every(v => v.ok) : sol.roots.length === 0;
    const vline = !sol.roots.length ? "No real roots, so there is nothing to substitute back." : allOk ? (ver.every(v => v.mode === "exact") ? "Checked: substituting each root back gives exactly 0 on both sides (exact arithmetic on this device)." : "Checked numerically: each root satisfies the equation to within rounding (decimal check, not an exact proof).") : "⚠ I could not verify one of these roots by substitution, so don't trust it yet.";
    box.append(el("p", { class: "dd-verify " + (allOk ? "ok" : "bad") }, vline));
    const act = el("div", { class: "dd-opts" });
    act.append(el("button", { class: "btn sm", type: "button", onclick: () => explain(b, "steps") }, "Explain it to me"), el("button", { class: "btn sm", type: "button", onclick: () => problemCard(b) }, "Back"));
    box.append(act); showCard(box);
  }
  function hint(){
    const b = needBlock(); if(!b) return; const a = analyse(b);
    if(!problemOf(b)){ explain(b, "concept"); return; }
    const key = b.id + ":" + b.cur, lvl = S.hints[key] = (S.hints[key] == null ? 0 : S.hints[key] + 1);
    const t = M.hintFor(a.sol, lvl);
    const box = el("div", { class: "dd-hintcard" }, el("h3", {}, "Hint " + (Math.min(lvl, 2) + 1)), el("p", {}, t));
    const act = el("div", { class: "dd-opts" }, el("button", { class: "btn sm", type: "button", onclick: hint }, "Another hint"), el("button", { class: "btn sm", type: "button", onclick: () => solve() }, "Solve completely"), el("button", { class: "btn sm", type: "button", onclick: () => problemCard(b) }, "Back"));
    box.append(act); showCard(box);
  }
  function mine(b){
    b.mode = "mine"; scheduleSave(); S.saved = false;
    showCard(el("div", { class: "dd-mine" }, el("h3", {}, "Your turn"), el("p", {}, "Write your working below the problem. When you're ready, tap Check — I'll check each step and explain any slip without giving the whole answer away."), el("div", { class: "dd-opts" }, el("button", { class: "btn sm primary", type: "button", onclick: () => { cardEl.hidden = true; } }, "Start writing"), el("button", { class: "btn sm", type: "button", onclick: hint }, "Hint"))));
  }
  function letters(b){
    const g = M.glossaryFor(b.lines[b.cur]); const box = el("div", { class: "dd-letters" }, el("h3", {}, "What the letters usually mean"));
    if(g){ const ul = el("ul"); Object.entries(g.vars).forEach(([k, t]) => ul.append(el("li", {}, el("b", {}, k), " — " + t))); box.append(ul, el("p", { class: "dd-note" }, g.note + " If your problem uses them differently, tell me and I'll explain with your meaning.")); }
    else box.append(el("p", { class: "dd-note" }, "I don't have a stored meaning for these letters, and I won't guess. Tell me what each one stands for, or ask me to explain the concept."));
    box.append(el("div", { class: "dd-opts" }, el("button", { class: "btn sm primary", type: "button", onclick: () => explain(b, "concept") }, "Explain the concept"), el("button", { class: "btn sm", type: "button", onclick: () => problemCard(b) }, "Back")));
    showCard(box);
  }
  /* 3) EXPLAIN: the existing Study tutor, told the verified facts. Needs the internet; says so. */
  async function explain(b, kind, extra){
    const a = analyse(b), line = b.lines[b.cur];
    const box = el("div", { class: "dd-explain" }, el("h3", {}, "Explanation")); const body = el("div", { class: "dd-steps" }, "Thinking…"); box.append(body, el("div", { class: "dd-opts" }, el("button", { class: "btn sm", type: "button", onclick: () => problemCard(b) }, "Back"), el("button", { class: "btn sm", type: "button", onclick: () => toStudy(line) }, "Continue in Study mode"))); showCard(box);
    if(offline()){ body.textContent = "Explanations need the internet. You're offline — but Solve, Hint and Check still work on this device."; return; }
    if(!D.ai || !D.ai.study){ body.textContent = "My explaining service isn't available right now."; return; }
    const facts = []; if(a.kind === "arithmetic") facts.push("Exact value (computed on the student's device): " + M.vtxt(a.value));
    if(a.sol && a.sol.roots) facts.push("Verified solution (computed and checked on the device — do NOT change these numbers): " + (a.sol.roots.length ? a.sol.roots.map(r => a.sol.v + (r.s ? " = " : " ≈ ") + M.vtxt(r)).join(", ") : "no real roots") + (a.sol.disc ? "; discriminant case: " + a.sol.disc : ""));
    if(a.sol && a.sol.type === "multi") facts.push("This relation has several unknowns (" + a.vars.join(", ") + "); do not assign meanings to the letters unless they are standard (e.g. SUVAT) and say so when you assume.");
    const task = { concept: "Explain the concept behind this, and which method applies and why.", steps: "Explain the verified solution step by step, teaching why each step is done.", arith: "Show how to evaluate this step by step, respecting the order of operations.", step: "Explain why this step is wrong and what to check, WITHOUT giving the full solution." }[kind] || "Explain.";
    const q = `[Doodle Space · handwritten problem, confirmed by the student]\nProblem: $${toTex(line)}$\n${facts.join("\n")}\nTask: ${task}${extra ? "\n" + extra : ""}`;
    const r = await D.ai.study(q, {});
    if(!r.ok){ body.textContent = r.text || "I couldn't reach my explaining service."; return; }
    rich(body, r.text);
  }
  function toStudy(line){ close(); setTimeout(() => D.app && D.app.handleUserUtterance && D.app.handleUserUtterance("Explain how to solve " + line), 350); }

  /* ---------- Check my work ---------- */
  function checkWork(){
    const b = needBlock(); if(!b) return; const a = analyse(b);
    if(!(a.kind === "equation" || a.kind === "arithmetic" || a.kind === "expression")){ say("Pick a problem I can check first (tap Read, then the tag)."); return; }
    pickRegion("Drag a box around your working (below the problem).", (region, whole) => {
      const r = region || [0, b.bbox[1] + b.bbox[3], S.pad.PAGE_W, S.pad.PAGE_H];
      readRegion(r, "working", { block: b });
    });
  }
  function finishCheck(lines, o){
    const b = o.ctx && o.ctx.block || cur(); const res = M.checkWorking([b.lines[b.cur], ...lines]); const a = analyse(b);
    const box = el("div", { class: "dd-checkcard" }, el("h3", {}, "Checking your working"));
    const list = el("div", { class: "dd-checklist" });
    res.slice(1).forEach(l => { const row = el("div", { class: "dd-crow " + l.status }); const mark = { ok: "✓", wrong: "✗", unchecked: "•", unreadable: "?", start: "•" }[l.status]; row.append(el("b", { class: "mk" }, mark)); const t = el("div", { class: "ct" }); const tx = el("div", { class: "tx" }); rich(tx, "$" + toTex(l.text) + "$"); t.append(tx, el("div", { class: "dt" }, l.detail)); row.append(t); list.append(row); });
    box.append(list);
    const wrongAt = res.slice(1).find(l => l.status === "wrong");
    let verdict = "";
    const last = lines[lines.length - 1]; let fin = null;
    if(problemOf(b)){ try{ const la = M.parse(last); if(la.k === "rel" && la.op === "=" && la.l.k === "var" && a.sol.roots.length){ const val = M.evaluate(M.normalize(last).split("=")[1].trim()).f; const hit = a.sol.roots.some(r => Math.abs(r.f - val) < 1e-7); fin = hit ? "ok" : "no"; } }catch(_){} }
    if(wrongAt) verdict = `Line ${wrongAt.line - 0} is where it goes wrong. Everything before it follows.`; else if(fin === "ok") verdict = "Your final answer matches the verified solution. ✓"; else if(fin === "no") verdict = "Each step I could check follows, but the final value doesn't match the verified solution — look again at the last line."; else verdict = "Every step I could check follows from the one before. Some steps I couldn't check automatically are marked •.";
    box.append(el("p", { class: "dd-verify " + (wrongAt || fin === "no" ? "bad" : "ok") }, verdict));
    const act = el("div", { class: "dd-opts" });
    if(wrongAt) act.append(el("button", { class: "btn sm primary", type: "button", onclick: () => explain(b, "step", `The student's working:\n${[b.lines[b.cur], ...lines].join("\n")}\nThe step that does not follow from the line above it: ${wrongAt.text}`) }, "Explain this step"));
    act.append(el("button", { class: "btn sm", type: "button", onclick: hint }, "Hint"), el("button", { class: "btn sm", type: "button", onclick: () => solve() }, "Solve completely"), el("button", { class: "btn sm", type: "button", onclick: () => problemCard(b) }, "Back"));
    box.append(act); showCard(box);
  }

  /* ============================================================ public ============================================================ */
  D.doodle = { open, close, state: () => ({ open: S.open, mode: S.mode, page: S.idx + 1, pages: S.meta ? S.meta.pages.length : 0 }), _S: S, _api: { parseRecog, confirmReading, accept, newPage, deletePage, pageBreak, askDabsy, checkWork, solve, hint, go, flushNow } };
})();
