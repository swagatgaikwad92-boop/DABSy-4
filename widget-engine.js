/* ============================================================
   D.A.B.S.y — widget-engine.js   (v11.1: classic floating glass widgets, with optional customisation)
   DABSy.widgets = { edit(), done(), isEditing(), add(id), remove(id), list(), available(), enable(bool), enabled(), refresh() }

   Widgets (all show REAL data; none is ever invented):
     clock     local time
     date      local weekday + date
     tasks     today's tasks from DABSy.tasks (+ how many still need a time)
     weather   Open-Meteo (free, no key) for the coordinates you allow; shows "unavailable" when it can't be reached
     calendar  Ghibli Calendar events when connected; otherwise a "Connect" prompt (no fake events)

   Behaviour
     - They float around DABSy in the upper part of the screen (never over her face) and appear one by one after she wakes.
     - They hide while you chat / type, open a panel, study (Study Mode stays distraction-free) or talk live.
     - Customise: press and hold any widget (or Settings → Widgets, or say "customise widgets") -> drag to another slot,
       ✕ to remove, tap a name in the bar to add one back. Resizing is deliberately not offered.
     - Arrangement persists in localStorage via memory ("widgets_v1"). Location (weather) stays on this device.
   ============================================================ */
(function(){
  "use strict";
  const D = window.DABSy, bus = D.bus, ui = D.ui, memory = D.memory, el = ui.el;
  const KEY = "widgets_v1", KEY3 = "widgets_v3", WKEY = "weather_cache_v1";
  const stage = document.getElementById("stage");
  const DEFS = {
    clock:    { name: "Clock",    ico: "🕐" },
    date:     { name: "Date",     ico: "📅" },
    tasks:    { name: "Tasks",    ico: "✅" },
    weather:  { name: "Weather",  ico: "⛅" },
    calendar: { name: "Calendar", ico: "🗓️" },
  };
  const ORDER = ["clock", "date", "tasks", "weather", "calendar"];
  /* v12 colour presets: every one is defined for day AND night in widgets2.css (data-tone). "glass" follows the theme. */
  const TONES = [
    { id: "glass", name: "Glass", sw: ["#cfd6e6", "#27304f"] }, { id: "mist", name: "Mist", sw: ["#cdd9e4", "#6f8aa3"] },
    { id: "sage", name: "Sage", sw: ["#d3dccd", "#7d9783"] }, { id: "lavender", name: "Lavender", sw: ["#dcd6ea", "#9187b5"] },
    { id: "sand", name: "Sand", sw: ["#ece3d3", "#b49e7c"] }, { id: "rose", name: "Rose", sw: ["#ecd7d6", "#b98488"] },
    { id: "midnight", name: "Midnight", sw: ["#2b3560", "#141a38"] },
  ];
  const SMIN = 0.75, SMAX = 1.6;
  const connected = () => { try{ const c = window.DABSyCore && window.DABSyCore.getConnections().calendar; return !!(c && c.enabled); }catch(e){ return false; } };

  /* ---------------- persisted state ----------------
     v3: every widget has its own free position (x, y = fraction of the screen), a size (s) and a colour (c: a preset id or #rrggbb).
     A v2 arrangement (slots) is converted once, keeping which widgets were on. */
  const SLOT_XY = [[.045, .115], [.54, .115], [.045, .255], [.54, .255], [.045, .395], [.54, .395]];
  let st = memory.read(KEY3, null);
  if(!st || st.v !== 3 || !Array.isArray(st.items)){
    const old = memory.read(KEY, null);
    st = { v: 3, on: old && typeof old.on === "boolean" ? old.on : true, items: [] };
    if(old && old.loc) st.loc = old.loc;
    if(old && Array.isArray(old.items)) old.items.filter(i => DEFS[i.id] && Number.isInteger(i.slot) && i.slot >= 0 && i.slot < SLOT_XY.length)
      .forEach(i => st.items.push({ id: i.id, x: SLOT_XY[i.slot][0], y: SLOT_XY[i.slot][1], s: 1, c: "glass" }));
    try{ memory.write(KEY3, st); }catch(e){}
  }
  st.items = st.items.filter(i => DEFS[i.id]).map(i => ({ id: i.id, x: isFinite(i.x) ? i.x : .05, y: isFinite(i.y) ? i.y : .12, s: Math.max(SMIN, Math.min(SMAX, +i.s || 1)), c: i.c || "glass" }));
  const save = () => { try{ memory.write(KEY3, st); }catch(e){} };

  /* ---------------- DOM ---------------- */
  const root = el("div", { id: "widgets", "aria-label": "Widgets", role: "group" });
  const bar = el("div", { id: "wg-bar", hidden: "", role: "toolbar", "aria-label": "Customise widgets" });
  const btn = el("button", { id: "wg-btn", type: "button", class: "icon-btn glass", "aria-label": "Widgets: choose what floats around DABSy", "aria-expanded": "false", html: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><path d="M17 14v6M14 17h6"/></svg>' });
  const panel = el("div", { id: "wg-panel", hidden: "", role: "dialog", "aria-label": "Choose widgets" });
  stage.append(root, bar, btn, panel);
  const cards = {};                                          // id -> { item, card, body }
  let editing = false, introduced = false;

  /* ---------------- renderers (pure: they read real data) ---------------- */
  const t12 = d => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const clean = s => String(s || "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
  function dk(d){ return ui.dateKey(d); }
  const R = {
    clock(b){ const n = new Date(); const p = n.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).replace(/\s?(am|pm)$/i, m => "\u0000" + m.trim()); const [t, ap] = p.split("\u0000"); b.textContent = ""; b.append(el("div", { class: "wg-big" }, t, ap ? el("small", { text: ap.toUpperCase() }) : null)); },
    date(b){ const n = new Date(); b.textContent = ""; b.append(el("div", { class: "wg-mid", text: n.toLocaleDateString([], { weekday: "long" }) }), el("div", { class: "wg-sub", text: n.toLocaleDateString([], { day: "numeric", month: "long" }) })); },
    tasks(b){
      const now = new Date(), inst = D.tasks.instancesForDate(dk(now)).filter(i => i.status === "pending" || i.status === "active");
      const un = D.tasks.unscheduled().length; b.textContent = "";
      b.append(el("div", { class: "wg-head", text: inst.length ? `${inst.length} left today` : un ? "Today" : "All clear" }));
      inst.slice(0, 3).forEach(i => b.append(el("div", { class: "wg-line" + (i.end < now ? " late" : "") }, el("span", { class: "wg-t", text: t12(i.start) }), el("span", { class: "wg-x", text: clean(i.title) }))));
      if(inst.length > 3) b.append(el("div", { class: "wg-sub", text: `+${inst.length - 3} more` }));
      if(un) b.append(el("div", { class: "wg-sub", text: `${un} need${un === 1 ? "s" : ""} a time` }));
      if(!inst.length && !un) b.append(el("div", { class: "wg-sub", text: "Nothing planned" }));
    },
    calendar(b){
      b.textContent = "";
      if(!connected()){ b.append(el("div", { class: "wg-head", text: "Calendar" }), el("div", { class: "wg-sub", text: "Tap to connect Ghibli Calendar" })); return; }
      const C = window.DABSyCore, now = new Date(), today = dk(now);
      let ev = []; try{ ev = C.getEventsForDate(today).slice().sort((a, c) => String(a.startTime || "").localeCompare(String(c.startTime || ""))); }catch(e){}
      b.append(el("div", { class: "wg-head", text: ev.length ? "Today" : "Calendar" }));
      if(ev.length){ ev.slice(0, 3).forEach(e => b.append(el("div", { class: "wg-line" }, el("span", { class: "wg-t", text: e.startTime || "all day" }), el("span", { class: "wg-x", text: clean(e.title) })))); if(ev.length > 3) b.append(el("div", { class: "wg-sub", text: `+${ev.length - 3} more` })); return; }
      let next = null; try{ next = C.getCalendarEvents().filter(e => e.date > today).sort((a, c) => (a.date + (a.startTime || "")).localeCompare(c.date + (c.startTime || "")))[0]; }catch(e){}
      b.append(el("div", { class: "wg-sub", text: next ? `Next: ${clean(next.title)}, ${ui.dayLabel(new Date(next.date + "T00:00:00")).toLowerCase()}` : "No events today" }));
    },
    weather(b){
      b.textContent = "";
      const w = weather;
      if(w.state === "noloc"){ b.append(el("div", { class: "wg-head", text: "Weather" }), el("div", { class: "wg-sub", text: "Tap to use my location" })); return; }
      if(w.state === "loading" && !w.data){ b.append(el("div", { class: "wg-head", text: "Weather" }), el("div", { class: "wg-sub", text: "Checking the sky…" })); return; }
      if(w.state === "denied"){ b.append(el("div", { class: "wg-head", text: "Weather" }), el("div", { class: "wg-sub", text: "Location is blocked. Allow it in the browser's site settings, then tap." })); return; }
      if(!w.data){ b.append(el("div", { class: "wg-head", text: "Weather" }), el("div", { class: "wg-sub", text: "Unavailable right now" })); return; }
      const d = w.data, info = wxInfo(d.code, d.isDay);
      b.append(el("div", { class: "wg-wx" }, el("span", { class: "wg-ic", html: info.svg }), el("div", {}, el("div", { class: "wg-big", text: Math.round(d.temp) + "°" }), el("div", { class: "wg-sub", text: info.label }))));
      if(d.max != null) b.append(el("div", { class: "wg-sub", text: `H ${Math.round(d.max)}° · L ${Math.round(d.min)}°${w.stale ? " · offline" : ""}` }));
    },
  };

  /* ---------------- weather (real data only) ---------------- */
  const weather = { state: "noloc", data: null, stale: false, at: 0 };
  function wxInfo(code, isDay){
    const sun = '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6"/></svg>';
    const moon = '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z"/></svg>';
    const cloud = '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18.5h9.5a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.4A3.3 3.3 0 0 0 7 18.5Z"/></svg>';
    const rain = '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 15h9.5a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.4A3.3 3.3 0 0 0 7 15Z"/><path d="M8 18l-1 2.5M12 18l-1 2.5M16 18l-1 2.5"/></svg>';
    const snow = '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9"/></svg>';
    const bolt = '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 14.5h-.2A3.8 3.8 0 0 1 7 7a5.5 5.5 0 0 1 10.4 1.5A3.5 3.5 0 0 1 17 14.5"/><path d="M12.5 11l-2.5 4h3.5L11.5 20"/></svg>';
    const fog = '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 9h16M3 13h18M5 17h14"/></svg>';
    if(code === 0) return { label: isDay ? "Clear" : "Clear night", svg: isDay ? sun : moon };
    if(code <= 2) return { label: "Partly cloudy", svg: isDay ? sun : moon };
    if(code === 3) return { label: "Cloudy", svg: cloud };
    if(code === 45 || code === 48) return { label: "Foggy", svg: fog };
    if(code >= 51 && code <= 57) return { label: "Drizzle", svg: rain };
    if(code >= 61 && code <= 67) return { label: "Rain", svg: rain };
    if(code >= 71 && code <= 77 || code === 85 || code === 86) return { label: "Snow", svg: snow };
    if(code >= 80 && code <= 82) return { label: "Showers", svg: rain };
    if(code >= 95) return { label: "Thunderstorm", svg: bolt };
    return { label: "Weather", svg: cloud };
  }
  const loc = () => (st.loc && isFinite(st.loc.lat) && isFinite(st.loc.lon)) ? st.loc : null;
  async function fetchWeather(force){
    const l = loc(); if(!l){ weather.state = "noloc"; return; }
    const cached = memory.read(WKEY, null);
    if(cached && cached.data && !weather.data) { weather.data = cached.data; weather.at = cached.at; }
    if(!force && weather.data && Date.now() - weather.at < 30 * 60000){ weather.state = "ok"; return; }
    if(!navigator.onLine){ weather.stale = !!weather.data; weather.state = weather.data ? "ok" : "fail"; return; }
    weather.state = "loading";
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 9000);
    try{
      const u = `https://api.open-meteo.com/v1/forecast?latitude=${l.lat}&longitude=${l.lon}&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`;
      const r = await fetch(u, { signal: ctl.signal }); if(!r.ok) throw new Error("http " + r.status);
      const j = await r.json(), c = j.current;
      if(!c || typeof c.temperature_2m !== "number") throw new Error("bad data");
      weather.data = { temp: c.temperature_2m, code: c.weather_code, isDay: c.is_day === 1, max: j.daily && j.daily.temperature_2m_max ? j.daily.temperature_2m_max[0] : null, min: j.daily && j.daily.temperature_2m_min ? j.daily.temperature_2m_min[0] : null };
      weather.at = Date.now(); weather.stale = false; weather.state = "ok"; memory.write(WKEY, { data: weather.data, at: weather.at });
    }catch(e){ weather.stale = !!weather.data; weather.state = weather.data ? "ok" : "fail"; }
    finally{ clearTimeout(t); }
  }
  function askLocation(){
    if(!navigator.geolocation){ weather.state = "fail"; paint("weather"); return; }
    weather.state = "loading"; paint("weather");
    navigator.geolocation.getCurrentPosition(async pos => {
      st.loc = { lat: +pos.coords.latitude.toFixed(2), lon: +pos.coords.longitude.toFixed(2) }; save();      // 2 decimals (~1 km): enough for weather, kept on this device
      await fetchWeather(true); paint("weather");
    }, err => { weather.state = err && err.code === 1 ? "denied" : "fail"; paint("weather"); }, { timeout: 10000, maximumAge: 600000 });
  }

  /* ---------------- build / paint ---------------- */
  function ensureCard(id){
    if(cards[id]) return cards[id];
    const body = el("div", { class: "wg-body" });
    const x = el("button", { type: "button", class: "wg-x-btn", "aria-label": "Remove " + DEFS[id].name + " widget", text: "✕", onclick: ev => { ev.stopPropagation(); remove(id); } });
    const grow = el("div", { class: "wg-grow", role: "slider", "aria-label": DEFS[id].name + " size", "aria-valuemin": "75", "aria-valuemax": "160", tabindex: "-1" });
    const card = el("div", { class: "wg-card wg-" + id, "data-id": id }, x, body);
    const item = el("div", { class: "wg-item", "data-id": id, tabindex: "-1" }, card, grow);
    item.addEventListener("click", ev => { if(ev.target.closest(".wg-x-btn,.wg-grow")) return; onTap(id); });
    wireDrag(item, card, id); wireResize(grow, item, id);
    root.append(item);
    cards[id] = { item, card, body, grow };
    return cards[id];
  }
  function paint(id){
    const c = cards[id]; if(!c) return;
    try{ R[id](c.body); }catch(e){ c.body.textContent = ""; c.body.append(el("div", { class: "wg-sub", text: "Unavailable" })); }
  }
  function onTap(id){
    if(editing || dragMoved) return;
    if(id === "tasks") D.require("notifcenter").then(c => c.openTasks()).catch(() => {});
    else if(id === "weather"){ if(!loc() || weather.state === "denied" || weather.state === "fail") askLocation(); else fetchWeather(true).then(() => paint("weather")); }
    else if(id === "calendar"){ if(!connected()) D.ecosystem && D.ecosystem.open(); }
  }
  /* ---- geometry: positions are fractions of the screen; sizes are a scale applied from the card's top-left corner ---- */
  const MARGIN = 8;
  let safeT = null;
  function safeTop(){ if(safeT == null){ const p = el("div", { style: "position:absolute;visibility:hidden;padding-top:env(safe-area-inset-top,0px)" }); stage.append(p); safeT = parseFloat(getComputedStyle(p).paddingTop) || 0; p.remove(); } return safeT; }
  function box(item, scale){ return { w: item.offsetWidth * scale, h: item.offsetHeight * scale }; }
  function clampXY(item, x, y, scale){
    const R = root.getBoundingClientRect(), b = box(item, scale), top = safeTop() + 62;
    const maxX = Math.max(MARGIN, R.width - b.w - MARGIN), maxY = Math.max(top, R.height - b.h - MARGIN - 70);
    return { x: Math.max(MARGIN, Math.min(maxX, x)), y: Math.max(top, Math.min(maxY, y)) };
  }
  function applyItem(it, c, animate){
    const R = root.getBoundingClientRect(); if(!R.width) return;
    const p = clampXY(c.item, it.x * R.width, it.y * R.height, it.s);
    it.x = p.x / R.width; it.y = p.y / R.height;
    c.item.style.left = (it.x * 100).toFixed(3) + "%"; c.item.style.top = (it.y * 100).toFixed(3) + "%";
    c.item.style.setProperty("--s", String(it.s));
    c.card.dataset.tone = /^#/.test(it.c) ? "custom" : it.c; tintCustom(c.card, it.c);
    c.grow.setAttribute("aria-valuenow", String(Math.round(it.s * 100)));
  }
  function hexToRgb(h){ const m = /^#?([0-9a-f]{6})$/i.exec(h || ""); if(!m) return null; const n = parseInt(m[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function tintCustom(card, c){
    ["--wg-bg", "--wg-ink", "--wg-dim", "--wg-edge", "--wg-glow"].forEach(k => card.style.removeProperty(k));
    const rgb = /^#/.test(c) ? hexToRgb(c) : null; if(!rgb) return;
    const L = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255, dark = L < .52, [r, g, b] = rgb;
    card.style.setProperty("--wg-bg", `rgba(${r},${g},${b},${dark ? .62 : .58})`);
    card.style.setProperty("--wg-ink", dark ? "#f3f5ff" : "#232736"); card.style.setProperty("--wg-dim", dark ? "rgba(235,240,255,.76)" : "rgba(35,39,54,.72)");
    card.style.setProperty("--wg-edge", dark ? "rgba(255,255,255,.22)" : "rgba(255,255,255,.6)"); card.style.setProperty("--wg-glow", `rgba(${r},${g},${b},.28)`);
  }
  function layout(){
    const ids = new Set(st.items.map(i => i.id));
    Object.keys(cards).forEach(id => { if(!ids.has(id)){ cards[id].item.remove(); delete cards[id]; } });
    st.items.forEach(i => { const c = ensureCard(i.id); paint(i.id); applyItem(i, c); });
    root.dataset.count = String(st.items.length);
    if(introduced) Object.keys(cards).forEach(id => cards[id].card.classList.add("in"));
    if(editing) paintBar();
  }
  let rzT = 0; window.addEventListener("resize", () => { clearTimeout(rzT); rzT = setTimeout(() => { if(st.on) st.items.forEach(i => cards[i.id] && applyItem(i, cards[i.id])); }, 120); }, { passive: true });
  function refresh(){ if(!st.on) return; Object.keys(cards).forEach(paint); }

  /* ---------------- gradual introduction ---------------- */
  function introduce(){
    if(introduced || !st.on) return; introduced = true;
    const ids = st.items.map(i => i.id), reduce = ui.reducedMotion();
    ids.forEach((id, n) => setTimeout(() => { const c = cards[id]; if(c) c.card.classList.add("in"); }, reduce ? 0 : 500 + n * 650));
  }

  /* ---------------- customise mode ---------------- */
  function paintBar(){
    bar.textContent = "";
    const hidden = ORDER.filter(id => !st.items.some(i => i.id === id));
    bar.append(el("div", { class: "wg-bar-t", text: "Drag a widget anywhere · pull its corner to resize · tap the dot for colour" }));
    const row = el("div", { class: "wg-bar-row" });
    hidden.forEach(id => row.append(el("button", { type: "button", class: "wg-chip", "aria-label": "Add " + DEFS[id].name + " widget", onclick: () => add(id) }, "＋ " + DEFS[id].name)));
    if(!hidden.length) row.append(el("span", { class: "wg-bar-s", text: "All widgets are on screen" }));
    bar.append(row, el("button", { type: "button", class: "wg-done", text: "Done", onclick: done }));
  }
  function edit(){
    closeTools();
    if(!st.on){ st.on = true; save(); applyOn(); }
    if(editing) return; editing = true;
    root.classList.add("editing"); document.body.classList.add("wg-editing");
    bar.hidden = false; introduced = true; Object.keys(cards).forEach(id => cards[id].card.classList.add("in")); paintBar();
    ui.vibrate(12); ui.announce("Widget customisation on. Drag a widget to move it, or use the buttons below.");
  }
  function done(){
    if(!editing) return; editing = false;
    root.classList.remove("editing"); document.body.classList.remove("wg-editing"); bar.hidden = true; save();
    ui.announce("Widgets saved.");
  }
  function freeSpot(){                                          // the first of a few tidy positions that doesn't sit on another widget
    const R = root.getBoundingClientRect(), W = R.width || 390, H = R.height || 800;
    const cand = [[.045, .115], [.54, .115], [.045, .255], [.54, .255], [.045, .395], [.54, .395], [.3, .52]];
    const rects = st.items.map(i => { const c = cards[i.id]; return c ? { x: i.x * W, y: i.y * H, w: c.item.offsetWidth * i.s, h: c.item.offsetHeight * i.s } : { x: i.x * W, y: i.y * H, w: 172, h: 96 }; });
    for(const [cx, cy] of cand){ const x = cx * W, y = cy * H; if(!rects.some(r => x < r.x + r.w + 6 && x + 172 > r.x - 6 && y < r.y + r.h + 6 && y + 96 > r.y - 6)) return { x: cx, y: cy }; }
    return { x: .3, y: .5 };
  }
  function add(id){
    if(!DEFS[id] || st.items.some(i => i.id === id)) return false;
    const p = freeSpot(); st.items.push({ id, x: p.x, y: p.y, s: 1, c: "glass" }); save(); layout();
    if(introduced) setTimeout(() => cards[id] && cards[id].card.classList.add("in"), 30);
    return true;
  }
  function remove(id){
    const i = st.items.findIndex(x => x.id === id); if(i < 0) return false;
    closeTools(); st.items.splice(i, 1); save(); layout(); return true;
  }

  /* ---------------- dragging (anywhere), momentum, settle ----------------
     Press and drag any widget: it follows the finger, keeps a little momentum when released and settles with a small spring.
     A short tap still does what the widget does; a press-and-hold opens its colour/size tools. Nothing here changes what a widget shows. */
  let dragMoved = false;
  const noMotion = () => ui.reducedMotion && ui.reducedMotion();
  function wireDrag(item, card, id){
    let sx = 0, sy = 0, ox = 0, oy = 0, down = false, dragging = false, pressT = 0, pid = null, samples = [], raf = 0, tx = 0, ty = 0;
    const it = () => st.items.find(i => i.id === id);
    item.addEventListener("pointerdown", e => {
      if(e.target.closest(".wg-x-btn,.wg-grow,.wg-tools")) return;
      const m = it(); if(!m) return;
      try{ item.setPointerCapture(e.pointerId); }catch(_){}                      // a mouse (or a fast finger) must not lose the card when it leaves it
      cancelAnimationFrame(raf); down = true; dragging = false; dragMoved = false; sx = e.clientX; sy = e.clientY; pid = e.pointerId; samples = [{ t: performance.now(), x: e.clientX, y: e.clientY }];
      const R = root.getBoundingClientRect(); ox = m.x * R.width; oy = m.y * R.height; tx = ty = 0;
      clearTimeout(pressT); pressT = setTimeout(() => { if(down && !dragging){ dragMoved = true; ui.vibrate && ui.vibrate(12); openTools(id); } }, 620);
      item.classList.add("pressed");
    });
    item.addEventListener("pointermove", e => {
      if(!down || e.pointerId !== pid) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if(!dragging){ if(Math.hypot(dx, dy) < 8) return; dragging = true; dragMoved = true; clearTimeout(pressT); closeTools(); try{ item.setPointerCapture(pid); }catch(_){} item.classList.add("dragging"); }
      const m = it(), p = clampXY(item, ox + dx, oy + dy, m.s); tx = p.x - ox; ty = p.y - oy;
      item.style.transform = `translate3d(${tx}px,${ty}px,0) scale(${m.s * 1.045})`;
      const now = performance.now(); samples.push({ t: now, x: e.clientX, y: e.clientY }); while(samples.length > 2 && now - samples[0].t > 110) samples.shift();
      e.preventDefault();
    }, { passive: false });
    function commitAt(px, py){
      const m = it(), R = root.getBoundingClientRect(), p = clampXY(item, px, py, m.s);
      m.x = p.x / R.width; m.y = p.y / R.height; save();
      item.style.transition = "none"; item.style.transform = ""; item.style.left = (m.x * 100).toFixed(3) + "%"; item.style.top = (m.y * 100).toFixed(3) + "%"; void item.offsetWidth; item.style.transition = "";
    }
    function settle(){
      item.classList.remove("dragging", "pressed");
      if(noMotion()) return;
      try{ item.animate([{ scale: "1.045" }, { scale: ".992", offset: .55 }, { scale: "1" }], { duration: 420, easing: "cubic-bezier(.25,.9,.3,1)" }); }catch(_){}
    }
    const end = e => {
      if(e && e.pointerId !== pid) return;
      clearTimeout(pressT); item.classList.remove("pressed");
      if(down && dragging){
        const m = it(), n = performance.now(), a = samples[0], z = samples[samples.length - 1];
        let vx = 0, vy = 0;                                      // px per ms, from the last 100 ms only: holding still before letting go means no fling
        const recent = samples.filter(q => n - q.t <= 100);
        if(recent.length >= 2){ const f = recent[0], l = recent[recent.length - 1]; if(l.t - f.t > 8){ vx = (l.x - f.x) / (l.t - f.t); vy = (l.y - f.y) / (l.t - f.t); } }
        const sp = Math.hypot(vx, vy);
        if(noMotion() || sp < .15){ commitAt(ox + tx, oy + ty); settle(); }
        else{                                                    // a short glide that eases to a stop, stopping at the edges
          let x = ox + tx, y = oy + ty, last = n, v = [Math.min(2.2, Math.max(-2.2, vx)), Math.min(2.2, Math.max(-2.2, vy))];
          const step = t => {
            const dt = Math.min(32, t - last); last = t;
            x += v[0] * dt; y += v[1] * dt; const c = clampXY(item, x, y, m.s);
            if(c.x !== x){ v[0] = 0; x = c.x; } if(c.y !== y){ v[1] = 0; y = c.y; }
            const f = Math.pow(.0016, dt / 1000);                // ~ 0.0016 of the speed left after a second: a quick, soft stop
            v[0] *= f; v[1] *= f;
            item.style.transform = `translate3d(${x - ox}px,${y - oy}px,0) scale(${m.s * 1.03})`;
            if(Math.hypot(v[0], v[1]) > .02 && t - n < 520) raf = requestAnimationFrame(step); else { commitAt(x, y); settle(); }
          };
          raf = requestAnimationFrame(step);
        }
      }else if(down){ item.classList.remove("dragging"); }
      down = false; dragging = false; pid = null;
      setTimeout(() => { dragMoved = false; }, 60);
    };
    item.addEventListener("pointerup", end); item.addEventListener("pointercancel", end);
    item.addEventListener("contextmenu", e => e.preventDefault());
  }
  function wireResize(handle, item, id){
    let down = false, sx = 0, s0 = 1, w0 = 1, pid = null;
    handle.addEventListener("pointerdown", e => { const m = st.items.find(i => i.id === id); if(!m) return; down = true; pid = e.pointerId; sx = e.clientX; s0 = m.s; w0 = Math.max(60, item.offsetWidth); try{ handle.setPointerCapture(pid); }catch(_){} e.stopPropagation(); e.preventDefault(); item.classList.add("resizing"); });
    handle.addEventListener("pointermove", e => { if(!down || e.pointerId !== pid) return; const m = st.items.find(i => i.id === id); setScale(m, s0 + (e.clientX - sx) / w0); e.preventDefault(); });
    const end = e => { if(!down) return; down = false; item.classList.remove("resizing"); save(); };
    handle.addEventListener("pointerup", end); handle.addEventListener("pointercancel", end);
    handle.addEventListener("keydown", e => { const m = st.items.find(i => i.id === id); if(e.key === "ArrowRight" || e.key === "ArrowUp"){ setScale(m, m.s + .05); save(); e.preventDefault(); } if(e.key === "ArrowLeft" || e.key === "ArrowDown"){ setScale(m, m.s - .05); save(); e.preventDefault(); } });
  }
  function setScale(m, v){ m.s = Math.max(SMIN, Math.min(SMAX, Math.round(v * 100) / 100)); const c = cards[m.id]; if(c) applyItem(m, c); }

  /* ---------------- per-widget tools: colour + size + remove (opened by press-and-hold) ---------------- */
  let toolsEl = null, toolsFor = null;
  function closeTools(){ if(toolsEl){ toolsEl.remove(); toolsEl = null; toolsFor = null; } }
  function openTools(id){
    closeTools(); const m = st.items.find(i => i.id === id), c = cards[id]; if(!m || !c) return;
    toolsFor = id;
    const sw = TONES.map(t => el("button", { type: "button", class: "wg-sw" + (m.c === t.id ? " on" : ""), "data-tone": t.id, "aria-label": t.name + " colour", title: t.name, style: `--a:${t.sw[0]};--b:${t.sw[1]}`, onclick: () => { m.c = t.id; save(); applyItem(m, c); openTools(id); } }));
    const pick = el("input", { type: "color", class: "wg-pick", "aria-label": "Custom colour", value: /^#/.test(m.c) ? m.c : "#8aa3c4" });
    pick.addEventListener("input", () => { m.c = pick.value; applyItem(m, c); }); pick.addEventListener("change", () => { save(); openTools(id); });
    const custom = el("label", { class: "wg-sw custom" + (/^#/.test(m.c) ? " on" : ""), title: "Custom colour" }, pick, el("i", { "aria-hidden": "true", text: "+" }));
    toolsEl = el("div", { class: "wg-tools glass-live", role: "dialog", "aria-label": DEFS[id].name + " widget options" },
      el("div", { class: "wg-tools-t", text: DEFS[id].name }), el("div", { class: "wg-tools-row" }, sw, custom),
      el("div", { class: "wg-tools-row" },
        el("button", { type: "button", class: "wg-tb", "aria-label": "Smaller", text: "−", onclick: () => { setScale(m, m.s - .1); save(); } }),
        el("span", { class: "wg-tl", text: "Size" }),
        el("button", { type: "button", class: "wg-tb", "aria-label": "Larger", text: "+", onclick: () => { setScale(m, m.s + .1); save(); } }),
        el("button", { type: "button", class: "wg-tb rm", "aria-label": "Remove widget", text: "Remove", onclick: () => remove(id) })));
    root.append(toolsEl);
    const R = root.getBoundingClientRect(), r = c.item.getBoundingClientRect(), tw = toolsEl.offsetWidth, th = toolsEl.offsetHeight;
    let left = r.left - R.left + r.width / 2 - tw / 2, top = r.bottom - R.top + 10;
    if(top + th > R.height - 8) top = r.top - R.top - th - 10;
    toolsEl.style.left = Math.max(8, Math.min(R.width - tw - 8, left)) + "px"; toolsEl.style.top = Math.max(8, top) + "px";
    requestAnimationFrame(() => toolsEl && toolsEl.classList.add("in"));
  }
  document.addEventListener("pointerdown", e => { if(toolsEl && !toolsEl.contains(e.target) && !(cards[toolsFor] && cards[toolsFor].item.contains(e.target))) closeTools(); }, true);

  /* ---------------- on/off + lifecycle ---------------- */
  function applyOn(){ root.hidden = !st.on; if(st.on){ layout(); if(introduced) refresh(); else if(!document.body.classList.contains("booting")) setTimeout(introduce, 1200); } }
  function enable(v){ st.on = !!v; save(); if(!st.on && editing) done(); applyOn(); bus.emit("widgets:changed", { on: st.on }); return st.on; }

  let tickT = 0;
  function tick(){
    clearTimeout(tickT);
    if(!document.hidden && st.on){ paint("clock"); paint("date"); paint("tasks"); if(cards.calendar) paint("calendar"); }
    const n = new Date(); tickT = setTimeout(tick, 60000 - (n.getSeconds() * 1000 + n.getMilliseconds()) + 50);   // wake exactly at the next minute
  }
  document.addEventListener("visibilitychange", () => { if(!document.hidden){ tick(); if(loc()) fetchWeather(false).then(() => paint("weather")); } });
  bus.on("tasks:changed", () => { if(st.on && cards.tasks) paint("tasks"); });
  bus.on("settings:changed", () => { try{ D.theme && D.theme.refresh(); }catch(e){} });
  window.matchMedia("(min-height: 720px)").addEventListener && window.matchMedia("(min-height: 720px)").addEventListener("change", () => layout());

  /* ---------------- the chooser (top-left button) ---------------- */
  function paintPanel(){
    panel.textContent = "";
    panel.append(el("div", { class: "wg-pt", text: "Widgets" }), el("div", { class: "wg-ps", text: st.items.length ? "Choose what floats around DABSy." : "Nothing is on screen. Turn on what you'd like." }));
    ORDER.forEach(id => {
      const on = st.items.some(i => i.id === id), input = el("input", { type: "checkbox", "aria-label": DEFS[id].name });
      input.checked = on;
      input.addEventListener("change", () => { if(input.checked){ if(!add(id)){ input.checked = false; } } else remove(id); paintPanel(); });
      panel.append(el("label", { class: "wg-prow" }, el("span", { class: "wg-pi", text: DEFS[id].ico }), el("span", { class: "wg-pn", text: DEFS[id].name }), el("span", { class: "switch" }, input, el("i"))));
    });
    panel.append(el("div", { class: "wg-pa" }, el("button", { type: "button", class: "wg-chip", disabled: st.items.length ? null : "", text: "Rearrange", onclick: () => { closePanel(); edit(); } }), el("button", { type: "button", class: "wg-chip", text: "Done", onclick: closePanel })));
  }
  function openPanel(){ if(!st.on){ st.on = true; save(); applyOn(); } paintPanel(); panel.hidden = false; btn.setAttribute("aria-expanded", "true"); introduced = true; Object.keys(cards).forEach(id => cards[id].card.classList.add("in")); }
  function closePanel(){ panel.hidden = true; btn.setAttribute("aria-expanded", "false"); }
  btn.addEventListener("click", ev => { ev.stopPropagation(); panel.hidden ? openPanel() : closePanel(); });
  document.addEventListener("pointerdown", ev => { if(!panel.hidden && !panel.contains(ev.target) && !btn.contains(ev.target)) closePanel(); }, true);

  applyOn(); tick();
  if(loc()) fetchWeather(false).then(() => paint("weather"));
  // appear one by one after the wake-up animation and the greeting (boot.js removes body.booting ~300 ms after load)
  window.addEventListener("load", () => setTimeout(introduce, 4200));

  D.widgets = {
    openChooser: openPanel, edit, done, isEditing: () => editing, add, remove, enable, enabled: () => st.on, refresh, askLocation,
    list: () => st.items.map((i, n) => ({ id: i.id, slot: n, x: i.x, y: i.y, size: i.s, color: i.c })), setColor: (id, c) => { const m = st.items.find(i => i.id === id); if(!m) return false; m.c = c; save(); layout(); return true; }, setSize: (id, v) => { const m = st.items.find(i => i.id === id); if(!m) return false; setScale(m, v); save(); return true; }, moveTo: (id, x, y) => { const m = st.items.find(i => i.id === id); if(!m) return false; m.x = x; m.y = y; save(); layout(); return true; }, tones: () => TONES.map(t => t.id), available: () => ORDER.filter(id => !st.items.some(i => i.id === id)), names: () => Object.assign({}, ...ORDER.map(id => ({ [id]: DEFS[id].name }))),
    reset(){ st = { v: 3, on: true, items: [], loc: st.loc }; save(); layout(); },
  };
})();
