/* ============================================================
   D.A.B.S.y — time-picker.js (v12)
   A touch-first clock dial, styled as part of DABSy (not a browser dialog).
     D.timePicker.open({ minutes, title, subtitle, step, minMinutes, allowAuto }) -> Promise<number | "auto" | null>
        minutes  start value, minutes after midnight        step   rounding for the dial (default 5)
        minMinutes  earliest allowed time (earlier values can't be confirmed)     allowAuto  shows "Let DABSy choose"
   Interaction: tap or drag on the dial to set the hour, it then moves on to the minutes by itself. Tap the big HH or MM to go back.
   -5 / +5 / +15 chips for quick nudges, AM/PM switch, Set / Cancel. Arrow keys adjust the focused dial. Esc cancels.
   ============================================================ */
(function(){
  "use strict";
  const D = window.DABSy = window.DABSy || {};
  const NS = "http://www.w3.org/2000/svg";
  const pad = n => String(n).padStart(2, "0");
  function el(tag, props, ...kids){
    const e = document.createElement(tag);
    Object.keys(props || {}).forEach(k => { if(k === "class") e.className = props[k]; else if(k === "text") e.textContent = props[k]; else if(k.startsWith("on")) e.addEventListener(k.slice(2), props[k]); else if(props[k] != null) e.setAttribute(k, props[k]); });
    kids.flat().forEach(c => c != null && e.append(c.nodeType ? c : document.createTextNode(c)));
    return e;
  }
  const svg = (tag, attrs) => { const e = document.createElementNS(NS, tag); Object.keys(attrs || {}).forEach(k => e.setAttribute(k, attrs[k])); return e; };
  let openNow = null;

  function open(o){
    o = o || {};
    if(openNow) openNow.cancel();
    return new Promise(resolve => {
      let total = Math.max(0, Math.min(1439, Math.round((o.minutes == null ? 9 * 60 : o.minutes))));
      const step = o.step || 5;
      let h24 = Math.floor(total / 60), mm = total % 60, mode = "h";
      const prevFocus = document.activeElement;
      const layer = el("div", { class: "tp-layer", role: "dialog", "aria-modal": "true", "aria-label": o.title || "Choose a time" });
      const backdrop = el("div", { class: "tp-backdrop" });
      const panel = el("div", { class: "tp-panel glass-live" });
      const hhB = el("button", { class: "tp-seg on", type: "button", "aria-label": "Hours", onclick: () => setMode("h") });
      const mmB = el("button", { class: "tp-seg", type: "button", "aria-label": "Minutes", onclick: () => setMode("m") });
      const amB = el("button", { class: "tp-ap", type: "button", text: "AM", "aria-pressed": "false", onclick: () => { if(h24 >= 12){ h24 -= 12; render(); } } });
      const pmB = el("button", { class: "tp-ap", type: "button", text: "PM", "aria-pressed": "false", onclick: () => { if(h24 < 12){ h24 += 12; render(); } } });
      const disp = el("div", { class: "tp-disp" }, hhB, el("span", { class: "tp-colon", text: ":" }), mmB, el("div", { class: "tp-aps" }, amB, pmB));
      const dial = svg("svg", { viewBox: "0 0 240 240", class: "tp-dial", role: "slider", tabindex: "0", "aria-label": "Clock dial" });
      const face = svg("circle", { cx: 120, cy: 120, r: 112, class: "tp-face" });
      const hand = svg("line", { x1: 120, y1: 120, x2: 120, y2: 40, class: "tp-hand" });
      const knob = svg("circle", { cx: 120, cy: 40, r: 19, class: "tp-knob" });
      const hub = svg("circle", { cx: 120, cy: 120, r: 4.5, class: "tp-hub" });
      const labels = svg("g", { class: "tp-labels" });
      dial.append(face, hand, knob, hub, labels);
      const nudges = el("div", { class: "tp-nudges" }, [-15, -5, 5, 15].map(d => el("button", { class: "tp-chip", type: "button", text: (d > 0 ? "+" : "−") + Math.abs(d) + " min", onclick: () => nudge(d) })));
      const msg = el("div", { class: "tp-msg", role: "status", "aria-live": "polite" });
      const actions = el("div", { class: "tp-actions" },
        o.allowAuto ? el("button", { class: "tp-ghost", type: "button", text: "Let DABSy choose", onclick: () => close("auto") }) : null,
        el("button", { class: "tp-ghost", type: "button", text: "Cancel", onclick: () => close(null) }),
        el("button", { class: "tp-set", type: "button", text: "Set time", onclick: confirm }));
      panel.append(el("div", { class: "tp-t", text: o.title || "Set time" }), o.subtitle ? el("div", { class: "tp-s", text: o.subtitle }) : null, disp, dial, nudges, msg, actions);
      layer.append(backdrop, panel); document.body.append(layer);

      const hour12 = () => (h24 % 12) || 12;
      const cur = () => h24 * 60 + mm;
      function setMode(m){ mode = m; render(); }
      function polar(i, n, r){ const a = (i / n) * Math.PI * 2 - Math.PI / 2; return [120 + Math.cos(a) * r, 120 + Math.sin(a) * r]; }
      function drawLabels(){
        labels.textContent = "";
        if(mode === "h") for(let i = 1; i <= 12; i++){ const [x, y] = polar(i % 12, 12, 82); labels.append(txt(x, y, String(i), (i % 12) === (hour12() % 12))); }
        else for(let i = 0; i < 60; i += 5){ const [x, y] = polar(i, 60, 82); labels.append(txt(x, y, pad(i), i === mm)); }
      }
      function txt(x, y, s, on){ const t = svg("text", { x, y, class: "tp-n" + (on ? " on" : ""), "text-anchor": "middle", "dominant-baseline": "central" }); t.textContent = s; return t; }
      function render(){
        hhB.textContent = pad(hour12()); mmB.textContent = pad(mm);
        hhB.classList.toggle("on", mode === "h"); mmB.classList.toggle("on", mode === "m");
        amB.setAttribute("aria-pressed", String(h24 < 12)); pmB.setAttribute("aria-pressed", String(h24 >= 12));
        amB.classList.toggle("on", h24 < 12); pmB.classList.toggle("on", h24 >= 12);
        const frac = mode === "h" ? (hour12() % 12) / 12 : mm / 60, a = frac * Math.PI * 2 - Math.PI / 2;
        const x = 120 + Math.cos(a) * 82, y = 120 + Math.sin(a) * 82;
        hand.setAttribute("x2", x.toFixed(1)); hand.setAttribute("y2", y.toFixed(1)); knob.setAttribute("cx", x.toFixed(1)); knob.setAttribute("cy", y.toFixed(1));
        knob.classList.toggle("fine", mode === "m" && mm % 5 !== 0);
        drawLabels();
        dial.setAttribute("aria-valuetext", fmt(cur()));
        const bad = o.minMinutes != null && cur() < o.minMinutes;
        msg.textContent = bad ? "That time has already passed." : "";
        panel.querySelector(".tp-set").disabled = !!bad;
      }
      const fmt = m => { const h = Math.floor(m / 60), r = m % 60; return ((h % 12) || 12) + ":" + pad(r) + (h < 12 ? " AM" : " PM"); };
      function nudge(d){ let t = (cur() + d + 1440) % 1440; h24 = Math.floor(t / 60); mm = t % 60; render(); }
      function fromPoint(e){
        const r = dial.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        let a = Math.atan2(e.clientY - cy, e.clientX - cx) + Math.PI / 2; if(a < 0) a += Math.PI * 2;
        const f = a / (Math.PI * 2);
        if(mode === "h"){ const n = Math.round(f * 12) % 12, pm = h24 >= 12; h24 = n + (pm ? 12 : 0); }
        else { mm = Math.round(f * 60 / step) * step % 60; }
        render();
      }
      let drag = false;
      dial.addEventListener("pointerdown", e => { drag = true; try{ dial.setPointerCapture(e.pointerId); }catch(_){} fromPoint(e); e.preventDefault(); });
      dial.addEventListener("pointermove", e => { if(drag){ fromPoint(e); e.preventDefault(); } });
      const up = () => { if(!drag) return; drag = false; if(mode === "h"){ setTimeout(() => setMode("m"), 140); } };
      dial.addEventListener("pointerup", up); dial.addEventListener("pointercancel", up);
      dial.addEventListener("keydown", e => {
        const d = (e.key === "ArrowUp" || e.key === "ArrowRight") ? 1 : (e.key === "ArrowDown" || e.key === "ArrowLeft") ? -1 : 0;
        if(d){ e.preventDefault(); if(mode === "h"){ h24 = (h24 + d + 24) % 24; } else { mm = (mm + d * step + 60) % 60; } render(); }
        if(e.key === "Enter"){ e.preventDefault(); if(mode === "h") setMode("m"); else confirm(); }
      });
      layer.addEventListener("keydown", e => { if(e.key === "Escape"){ e.stopPropagation(); close(null); } });
      backdrop.addEventListener("click", () => close(null));
      let done = false;
      function close(v){
        if(done) return; done = true; openNow = null;
        layer.classList.remove("on"); setTimeout(() => layer.remove(), 240);
        try{ prevFocus && prevFocus.focus && prevFocus.focus({ preventScroll: true }); }catch(e){}
        resolve(v);
      }
      function confirm(){ if(o.minMinutes != null && cur() < o.minMinutes) return; close(cur()); }
      openNow = { cancel: () => close(null) };
      render();
      requestAnimationFrame(() => { layer.classList.add("on"); try{ dial.focus({ preventScroll: true }); }catch(e){} });
    });
  }
  D.timePicker = { open };
})();
