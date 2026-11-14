/* ============================================================
   D.A.B.S.y — live-talk.js : hands-free conversation mode
   An honest request-response loop, not a streaming/realtime model:
     listen -> (your browser's speech recognition) -> DABSy replies -> reply is spoken -> listen again.
   States: listening | thinking | speaking.   Only exists where the browser has speech recognition.
   Limits (shown in the panel): recognition may need internet; you can't talk over DABSy
   (tap Stop / the panel to interrupt, it then listens at once); it ends itself after 3 quiet turns,
   when the app is hidden, or when you tap End. The microphone is only on while the panel says Listening.
   ============================================================ */
(function(){
  const D = window.DABSy, bus = D.bus, voice = D.voice, ui = D.ui;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const LABEL = { listening: "Listening", thinking: "Thinking", speaking: "Speaking" };
  let mic, sizeBtn, stage, char, log, micOn = false;
  let on = false, state = "", lastUser = "", fallbackT = 0, quiet = 0, relistenT = 0, safetyT = 0, wake = null, panel, status, said, stopBtn;

  /* ---------- the character ----------
     1) assets/live/dabsy-character.(png|webp) when you supply one (transparent background), 2) the existing layered DABSy artwork.
     Never a replacement drawing. */
  const G = { bodyW: 279, bodyH: 251, eyeL: [74, 91.6, 61.8, 91.2], eyeR: [164, 91, 59.4, 90], bow: [117, 190, 67.5, 36.2], pad: 26 };
  const asset = f => (D.worldAssets && D.worldAssets[f]) || ("./assets/magic/" + f);
  const pct = (v, t) => (v / t * 100).toFixed(2) + "%";
  function layered(){
    const W = G.bodyW + G.pad * 2, H = G.bodyH + G.pad * 2, o = G.pad;
    const img = (cls, f, [x, y, w, h]) => { const i = ui.el("img", { class: cls, src: asset(f), alt: "", draggable: "false", decoding: "async" }); i.style.cssText = `left:${pct(x + o, W)};top:${pct(y + o, H)};width:${pct(w, W)};height:${pct(h, H)}`; return i; };
    const wrap = ui.el("div", { class: "lt-layers", style: `aspect-ratio:${W}/${H}` });
    const halo = ui.el("img", { class: "lt-halo", src: asset("dabsy-halo.webp"), alt: "", draggable: "false" });
    const body = img("lt-body", "dabsy-body.webp", [0, 0, G.bodyW, G.bodyH]);
    wrap.append(halo, body, img("lt-eye l", "dabsy-eye-l.webp", G.eyeL), img("lt-eye r", "dabsy-eye-r.webp", G.eyeR), img("lt-bow", "dabsy-bow.webp", G.bow));
    return wrap;
  }
  function buildCharacter(host){
    host.textContent = ""; host.append(layered());
    const tryOne = ext => new Promise(res => { const i = new Image(); i.onload = () => res(i.naturalWidth ? i : null); i.onerror = () => res(null); i.src = "./assets/live/dabsy-character." + ext; });
    Promise.all([tryOne("webp"), tryOne("png")]).then(r => {
      const hit = r.find(Boolean); if(!hit) return;
      hit.className = "lt-single"; hit.alt = ""; hit.draggable = false; host.textContent = ""; host.append(hit); host.dataset.mode = "single";
    });
  }

  function build(){
    panel = ui.el("section", { id: "live-talk", "aria-label": "Live talk", hidden: true, "data-size": "compact", "data-mic": "off" },
      ui.el("div", { class: "lt-top" },
        mic = ui.el("span", { class: "lt-mic", "aria-live": "polite" }, ui.el("i", { "aria-hidden": "true" }), ui.el("b", {}, "Mic off")),
        sizeBtn = ui.el("button", { class: "lt-icon", type: "button", "aria-label": "Expand", "aria-expanded": "false", onclick: toggleSize }, "")),
      stage = ui.el("div", { class: "lt-stage" },
        ui.el("div", { class: "lt-ripples", "aria-hidden": "true" }, ui.el("i", {}), ui.el("i", {}), ui.el("i", {})),
        char = ui.el("button", { class: "lt-char", type: "button", "aria-label": "DABSy. Tap while I'm speaking to interrupt.", onclick: () => { if(state === "speaking") interrupt(); } }),
        ui.el("div", { class: "lt-thinkdots", "aria-hidden": "true" }, ui.el("i", {}), ui.el("i", {}), ui.el("i", {}))),
      status = ui.el("div", { class: "lt-state", role: "status", "aria-live": "polite" }, ""),
      said = ui.el("div", { class: "lt-said" }, ""),
      log = ui.el("div", { class: "lt-log", role: "log", "aria-label": "Conversation" }),
      ui.el("div", { class: "lt-actions" },
        stopBtn = ui.el("button", { class: "btn glass", type: "button", onclick: interrupt }, "Stop talking"),
        ui.el("button", { class: "btn glass primary", type: "button", onclick: () => stop() }, "End")),
      ui.el("p", { class: "lt-note" }, "Uses your browser's speech recognition, which may need internet. I reply once I've finished thinking, so this isn't a streaming call. Tap me while I speak to interrupt."));
    sizeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>';
    buildCharacter(char);
    document.getElementById("stage").append(panel);
    const btn = ui.el("button", { id: "live-btn", type: "button", "aria-label": "Start live talk (hands-free conversation)", onclick: toggle }, "");
    btn.innerHTML = ui.icon("sparkle", 20);
    document.getElementById("mic-btn").after(btn);
  }
  function toggleSize(){
    const full = panel.dataset.size !== "full"; panel.dataset.size = full ? "full" : "compact";
    document.body.classList.toggle("live-talk-full", full);
    sizeBtn.setAttribute("aria-label", full ? "Collapse" : "Expand"); sizeBtn.setAttribute("aria-expanded", String(full));
    sizeBtn.classList.toggle("on", full); log.scrollTop = log.scrollHeight;
  }
  function addLine(who, text){
    text = String(text || "").trim(); if(!text) return;
    const last = log.lastElementChild; if(last && last.dataset.who === who && last.textContent === text) return;
    const d = ui.el("div", { class: "lt-line " + who, "data-who": who }, text);
    log.append(d); while(log.children.length > 24) log.firstChild.remove();
    log.scrollTop = log.scrollHeight;
  }
  /* The "Mic on" badge and the ripples follow the REAL recognition events, not our intentions:
     they are on only between voice:listening:start and voice:listening:end. Thinking and speaking always show "Mic off". */
  function setMic(v){ micOn = !!v; if(!panel) return; panel.dataset.mic = micOn ? "on" : "off"; mic.querySelector("b").textContent = micOn ? "Mic on" : "Mic off"; refreshStatus(); }
  function refreshStatus(){
    if(!status) return;
    status.textContent = state === "listening" ? (micOn ? "Listening" : "Getting ready…") : (LABEL[state] || "");
  }
  function set(s, text){
    state = s; panel.dataset.state = s;
    if(s !== "listening") setMic(false);
    refreshStatus();
    stopBtn.hidden = s !== "speaking";
    if(text !== undefined) said.textContent = text;
  }
  function listen(delay){
    clearTimeout(relistenT);
    relistenT = setTimeout(() => { if(!on) return; set("listening"); voice.startListening(); }, delay || 0);
  }
  async function start(){
    if(on) return;
    if(!SR){ bus.emit("dabsy:say", { text: "This browser can't do speech recognition, so live talk isn't available. Typing still works." }); return; }
    const r = await D.permissions.ensure("microphone", { reason: "Live talk needs the microphone. It only listens while the panel says Listening." });
    if(!r.granted){ if(r.declined) bus.emit("dabsy:say", { text: "No problem. You can type to me instead." }); return; }
    on = true; quiet = 0; panel.hidden = false; document.body.classList.add("live-talk");
    try{ if(navigator.wakeLock) wake = await navigator.wakeLock.request("screen"); }catch(_){}   // keep the screen on while talking
    listen(0);
    if(D.ai && D.ai.status() === "limited") said.textContent = "AI isn't connected, so I can only help with tasks and reminders.";
  }
  function stop(msg){
    if(!on) return;
    on = false; clearTimeout(relistenT); clearTimeout(safetyT); clearTimeout(fallbackT);
    voice.stopListening(); voice.stopSpeaking();
    setMic(false); panel.hidden = true; document.body.classList.remove("live-talk", "live-talk-full"); panel.dataset.size = "compact"; log.textContent = ""; sizeBtn.setAttribute("aria-expanded", "false");
    try{ wake && wake.release(); }catch(_){} wake = null;
    if(msg) bus.emit("dabsy:say", { text: msg });
  }
  const toggle = () => on ? stop() : start();
  function interrupt(){ voice.stopSpeaking(); listen(200); }

  bus.on("voice:heard", ({ text }) => {
    if(!on) return;
    quiet = 0; lastUser = text; set("thinking", "“" + text + "”"); addLine("you", text);
    clearTimeout(safetyT);                                   // if no reply is ever spoken (muted / error), don't hang
    safetyT = setTimeout(() => { if(on && state === "thinking") listen(0); }, 20000);
  });
  bus.on("voice:listening:end", () => {
    if(!on || state !== "listening") return;                 // a result moves us to "thinking" first
    if(++quiet >= 3) stop("I stopped listening because it was quiet. Tap the sparkle to start again.");
    else listen(300);
  });
  bus.on("voice:error", ({ error }) => {
    if(!on) return;
    if(error === "not-allowed" || error === "service-not-allowed") stop("The microphone is blocked. You can allow it in your browser settings, or type to me.");
    else if(error === "network") stop("Speech recognition needs an internet connection and can't reach it right now.");
    else if(error === "audio-capture") stop("I can't find a working microphone.");
    // "no-speech" / "aborted" are normal: handled by the quiet counter above
  });
  /* Mirror DABSy's written reply into the panel (the normal subtitle is hidden in this mode) and make sure it is
     actually spoken — including the "I couldn't reach my thinking service" message when the AI is offline. */
  new MutationObserver(() => {
    const t = (document.getElementById("subtitle").textContent || "").trim();
    if(!on || state !== "thinking" || !t || t === lastUser || t === "Listening…") return;
    said.textContent = D.math ? D.math.speakable(t) : t; addLine("dabsy", said.textContent); clearTimeout(fallbackT);
    fallbackT = setTimeout(() => {
      if(!on || state !== "thinking") return;
      if(D.memory.getSettings().speakReplies === false) listen(1500);   // text-only: show it, then carry on listening
      else { voice.speak(t); safetyT = setTimeout(() => { if(on && state === "thinking") listen(0); }, 5000); }   // speech never started (no voice installed?): carry on
    }, 1200);
  }).observe(document.getElementById("subtitle"), { childList: true, characterData: true, subtree: true });
  bus.on("voice:listening:start", () => { if(on && state === "listening") setMic(true); });
  bus.on("voice:listening:end", () => { setMic(false); });
  let beatT = 0;
  bus.on("voice:boundary", () => { if(!on || state !== "speaking" || !char) return; char.classList.add("beat"); clearTimeout(beatT); beatT = setTimeout(() => char.classList.remove("beat"), 150); });
  bus.on("voice:speaking:start", () => { if(on){ clearTimeout(safetyT); clearTimeout(fallbackT); voice.stopListening(); set("speaking"); } });
  bus.on("voice:speaking:end", () => { if(on && state === "speaking") listen(500); });   // short gap so DABSy doesn't hear its own voice
  document.addEventListener("visibilitychange", () => { if(document.hidden && on) stop(); });
  document.addEventListener("keydown", e => { if(e.key === "Escape" && on) stop(); });

  if(SR){ build(); } 
  D.liveTalk = { start, stop, toggle, supported: !!SR, isOn: () => on };
})();
