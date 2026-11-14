/* ============================================================
   D.A.B.S.y — chatbox-engine.js (v12)
   Adaptive-height message box.
   - The <textarea> grows with its content up to five lines, then scrolls inside itself (CSS max-height).
   - Where the browser supports `field-sizing: content` (Chrome/Android 123+) CSS does all of it; elsewhere a tiny
     fallback sets the height once per input event (no layout reads while the keyboard is animating).
   - The Send button appears when there is something to send and stays at the bottom-right of the dock.
   - --dock-h (the dock's real height) lets the reply card sit above a taller dock without a jump.
   ============================================================ */
(function(){
  "use strict";
  const ta = document.getElementById("text-input"), send = document.getElementById("send-btn"), dock = document.getElementById("input-dock");
  if(!ta || !dock) return;
  const native = !!(window.CSS && CSS.supports && CSS.supports("field-sizing", "content"));
  let raf = 0, lastH = 0;
  function fit(){
    raf = 0;
    if(!native){
      ta.style.height = "auto";
      const max = parseFloat(getComputedStyle(ta).maxHeight) || 120;
      ta.style.height = Math.min(ta.scrollHeight, max) + "px";
    }
    if(send) send.hidden = !ta.value.trim();
    const h = Math.round(dock.offsetHeight);
    if(h && h !== lastH){ lastH = h; document.documentElement.style.setProperty("--dock-h", h + "px"); }
  }
  const schedule = () => { if(!raf) raf = requestAnimationFrame(fit); };
  ta.addEventListener("input", schedule);
  new ResizeObserver(schedule).observe(dock);
  window.addEventListener("resize", schedule, { passive: true });
  fit();
  window.DABSy = window.DABSy || {};
  window.DABSy.chatbox = { refresh: fit, el: ta };
})();
