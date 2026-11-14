/* ============================================================
   D.A.B.S.y — glass-engine.js (v12)
   Makes glass surfaces answer touch. It only sets two CSS variables and one class:
     --gx / --gy  where the finger is on the surface (the sheen and edge light follow it)      --ga  the angle of the edge light
     .lg-press    while pressed (CSS sinks the surface a little, then lets it settle with a spring when released)
   One delegated, passive listener set on the document: no per-element wiring, nothing is prevented or stopped, so scrolling,
   taps, drags and every existing handler behave exactly as before. Switched off in low-power mode and for reduced motion.
   ============================================================ */
(function(){
  "use strict";
  const SEL = ".rcard,.rc-list .rc-row,.nc-item,.plan-b,.popup-card,.toast,#session-dock,.btn,.icon-btn,.wg-chip,.rc-pchip,.st-actions button,.tp-chip,.wg-card,.tp-panel,.wg-tools,#live-talk,#input-dock,#subtitle";
  let cur = null, raf = 0, last = null;
  const off = () => document.body.classList.contains("lite-gfx") || document.body.classList.contains("reduce-motion") || (window.matchMedia && window.matchMedia("(prefers-reduced-motion:reduce)").matches);
  function aim(el, x, y){
    const r = el.getBoundingClientRect(); if(!r.width || !r.height) return;
    const px = Math.max(0, Math.min(1, (x - r.left) / r.width)), py = Math.max(0, Math.min(1, (y - r.top) / r.height));
    el.style.setProperty("--gx", (px * 100).toFixed(1) + "%"); el.style.setProperty("--gy", (py * 100).toFixed(1) + "%");
    el.style.setProperty("--ga", (Math.atan2(py - .5, px - .5) * 180 / Math.PI + 90).toFixed(0) + "deg");
  }
  document.addEventListener("pointerdown", e => {
    if(off() || e.button > 0) return;
    const el = e.target.closest && e.target.closest(SEL); if(!el || el.matches(":disabled,[disabled]")) return;
    cur = el; last = e; el.classList.add("lg-press"); aim(el, e.clientX, e.clientY);
  }, { passive: true, capture: true });
  document.addEventListener("pointermove", e => {
    if(!cur) return; last = e;
    if(!raf) raf = requestAnimationFrame(() => { raf = 0; if(cur && last) aim(cur, last.clientX, last.clientY); });
  }, { passive: true });
  const release = () => { if(!cur) return; const el = cur; cur = null; el.classList.remove("lg-press"); };
  document.addEventListener("pointerup", release, { passive: true, capture: true });
  document.addEventListener("pointercancel", release, { passive: true, capture: true });
  document.addEventListener("scroll", () => { if(cur) release(); }, { passive: true, capture: true });   // a scroll is not a press
  window.DABSy = window.DABSy || {}; window.DABSy.glass = { aim };
})();
