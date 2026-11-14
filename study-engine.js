/* ============================================================
   D.A.B.S.y — study-engine.js (v12: the tutor surface)
   Turns a question into a worked, correctly-typeset explanation in the projection surface.
   - The reply is plain text with LaTeX (see ai.study); math-render.js draws it (fractions, powers, roots, vectors, Greek, units).
   - It is read aloud block by block with formulas spoken as words ("v squared equals u squared plus 2 a s"). The block being read is lit.
   - Follow-up questions stay on the same surface (history is sent so "explain step 3" or "I don't get it" work).
   - Every answer can be Rechecked: the model re-solves independently and either verifies or corrects.
   - Study Space stays one tap away (find material on this topic / open Study Space) and anything that is not a study question
     (reminders, planning, small talk, apps) is handed back to the normal DABSy pipeline instead of being forced into an explanation.
   Public API (unchanged): D.study.startStudy(topic), D.study.stopStudy()   New: classify(text), followUp(text), recheck()
   ============================================================ */
(function(){
  "use strict";
  const D = window.DABSy, bus = D.bus, ai = D.ai, voice = D.voice, memory = D.memory;
  const content = document.getElementById("projection-content"), surface = document.getElementById("projection-surface"), pointer = document.getElementById("projection-pointer");
  let cancelled = false, busy = false, turns = [], reading = 0, follow = null, lastQ = "", lastA = "";

  /* ---------- is this a study question? ---------- */
  const ACTION = /\b(remind(?:er)?s?|schedul(?:e|ing)|add (?:a |an )?(?:task|event|reminder)|plan (?:my|the) (?:day|week)|my (?:day|tasks?|week|calendar|schedule)|alarm|timer|calendar|to-?do|what'?s next|what should i do|free time|(?:open|show|go to) (?:my )?(?:apps?|settings|study space|notifications?|widgets?|wardrobe)|customi[sz]e|wallpaper|theme|move my|delete (?:my|the|this)|i wake up|i go to bed|remember that|call me)\b/i;
  const CHIT = /^\s*(hi|hello|hey|yo|thanks?|thank you|ok(?:ay)?|cool|nice|bye|good (?:morning|afternoon|evening|night)|how are you\b.*|who are you\b.*|what'?s your name\b.*|what can you do\b.*|help)\s*[.!?]*\s*$/i;
  const SUBJECT = /\b(physics|chemistry|chem|maths?|mathematics|algebra|geometry|calculus|trigonometry|force|forces|velocity|speed|acceleration|momentum|impulse|energy|work|power|torque|friction|gravity|gravitation|newton|projectile|kinematics|dynamics|thermodynamics|heat|temperature|entropy|wave|waves|oscillation|shm|pendulum|sound|light|optics|lens|mirror|refraction|reflection|electric|electrostatic|charge|current|voltage|resistance|resistor|capacitor|inductor|magnetic|magnet|circuit|fluid|pressure|viscosity|surface tension|elasticity|rotational|inertia|vector|scalar|dimension(?:al)?|unit|mole|atom|atomic|molecule|molecular|ion|ionic|bond|bonding|orbital|periodic|element|compound|reaction|equilibrium|acid|base|ph|buffer|oxidation|reduction|redox|enthalpy|entropy|gibbs|kinetics|hydrocarbon|alkane|alkene|alkyne|benzene|organic|isomer|stoichiometry|molarity|normality|equation|equations|derivative|differentiat\w*|integral|integrat\w*|limit|function|domain|range|sin|cos|tan|cot|sec|cosec|log|logarithm|exponent\w*|matrix|matrices|determinant|sequence|series|progression|quadratic|polynomial|root|roots|set|sets|relation|permutation|combination|binomial|probability|statistics|mean|variance|complex number|conic|parabola|ellipse|hyperbola|circle|straight line|slope|angle|triangle)\b/i;
  const ASKING = /^\s*(what|why|how|when|which|who|explain|define|derive|prove|show that|find|calculate|compute|solve|simplify|evaluate|determine|state|give|write|describe|differentiate|integrate|balance|convert|verify|check|recheck|numerical|can you (?:explain|solve|show|derive)|tell me (?:about|why|how)|kya|kaise|kyu|kyun|kay|kasa|क्या|क्यों|कैसे|काय|कसे)\b/i;
  const MATHY = /[=^√∫∑π]|\d\s*(?:m\/s|m s|kg|km|cm|mm|nm|g|mol|N|J|W|Pa|V|A|Ω|K|Hz|s)\b|\\\(|\\\[|\$[^$]+\$|\b\d+\s*[x×*/+\-]\s*\d+/;
  function classify(text){
    const t = String(text || "").trim();
    if(!t) return "other";
    if(CHIT.test(t)) return "other";
    if(ACTION.test(t) && !MATHY.test(t)) return "other";
    if(SUBJECT.test(t) || MATHY.test(t)) return "study";
    if(ASKING.test(t) || /\?\s*$/.test(t)) return "study";       // the Study Block is on: a real question is a study question
    return "other";
  }

  /* ---------- reading aloud ---------- */
  function nodeSpeech(n){
    if(n.nodeType === 3) return n.nodeValue;
    if(n.nodeType !== 1) return "";
    if(n.dataset && n.dataset.tex) return " " + D.math.tex2speech(n.dataset.tex) + " ";
    if(n.classList.contains("mx-raw")) return " " + D.math.tex2speech(n.textContent) + " ";
    if(n.classList.contains("mx-tag")) return " " + n.textContent + ". ";
    let s = ""; n.childNodes.forEach(c => { s += nodeSpeech(c); }); return s;
  }
  function stopReading(){ reading++; voice.stopSpeaking(); pointer.style.opacity = "0"; surface.querySelectorAll(".reading").forEach(e => e.classList.remove("reading")); }
  async function readAloud(body){
    if(memory.getSettings().speakReplies === false) return;
    const my = ++reading;
    const blocks = Array.from(body.children).filter(b => !b.classList.contains("mx-display") || false);
    const all = Array.from(body.children);
    for(let i = 0; i < all.length; i++){
      if(my !== reading || cancelled) return;
      const b = all[i];
      let text = nodeSpeech(b).replace(/\s+/g, " ").trim();
      // a display equation is read together with the step before it, so it is heard as part of that step
      if(!text) continue;
      all.forEach(x => x.classList.remove("reading")); b.classList.add("reading");
      try{ b.scrollIntoView({ block: "center", behavior: "smooth" }); }catch(e){}
      await voice.speakWithTracking(text);
      if(my !== reading || cancelled) return;
      await new Promise(r => setTimeout(r, 220));
    }
    if(my === reading) all.forEach(x => x.classList.remove("reading"));
  }

  /* ---------- the surface ---------- */
  function ensureFollow(){
    if(follow && follow.isConnected) return;
    follow = document.createElement("form"); follow.id = "st-follow"; follow.autocomplete = "off";
    follow.innerHTML = '<textarea rows="1" placeholder="Ask a follow-up…" aria-label="Ask a follow-up question" enterkeyhint="send"></textarea><button type="submit" aria-label="Send">↑</button>';
    const ta = follow.querySelector("textarea");
    ta.addEventListener("input", () => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 110) + "px"; });
    ta.addEventListener("keydown", e => { if(e.key === "Enter" && !e.shiftKey && !window.matchMedia("(pointer:coarse)").matches){ e.preventDefault(); follow.requestSubmit(); } });
    follow.addEventListener("submit", e => { e.preventDefault(); const v = ta.value.trim(); if(!v) return; ta.value = ""; ta.style.height = "auto"; followUp(v); });
    surface.insertBefore(follow, document.getElementById("projection-close"));
  }
  function el(tag, cls, text){ const e = document.createElement(tag); if(cls) e.className = cls; if(text != null) e.textContent = text; return e; }
  function history(){ return turns.slice(-3).map(t => "Student: " + t.q.slice(0, 400) + "\nD.A.B.S.y: " + t.a.slice(0, 900)).join("\n"); }

  async function ask(question, o){
    o = o || {};
    if(busy) return;
    busy = true; cancelled = false; stopReading();
    ensureFollow();
    const g = el("section", "st-group"); g.append(el("div", "st-q", question));
    const out = el("div", "st-a"); g.append(out);
    const think = el("div", "st-think"); think.innerHTML = '<i></i><i></i><i></i><span>Working through it carefully…</span>'; out.append(think);
    content.append(g); try{ g.scrollIntoView({ block: "start", behavior: "smooth" }); }catch(e){}
    bus.emit("study:thinking");
    let r;
    try{ r = await ai.study(question, { history: history(), confused: !!o.confused, recheck: o.recheck }); }
    catch(e){ r = { ok: false, text: "Something went wrong while I was working that out." }; }
    think.remove(); busy = false;
    if(cancelled) return;
    if(!r.ok){
      out.append(el("p", "mx-p st-err", r.text));
      const row = el("div", "st-actions"); const b = el("button", "", "Try again"); b.type = "button";
      b.onclick = () => { g.remove(); ask(question, o); }; row.append(b); out.append(row); return;
    }
    const body = el("div", "st-body"); out.append(body);
    await D.math.renderInto(body, r.text);
    if(!o.recheck){ turns.push({ q: question, a: r.text }); lastQ = question; lastA = r.text; }
    else { turns.push({ q: "(recheck) " + question, a: r.text }); lastA = r.text; }
    out.append(actionsFor(question, r.text, body));
    try{ memory.addHistory({ type: "study", user: question, reply: r.text.slice(0, 200) }); }catch(e){}
    readAloud(body);
  }
  function actionsFor(question, answer, body){
    const row = el("div", "st-actions");
    const mk = (label, fn) => { const b = el("button", "", label); b.type = "button"; b.onclick = fn; row.append(b); return b; };
    mk("Recheck", () => { stopReading(); ask(question, { recheck: answer }); });
    mk("Explain differently", () => { stopReading(); ask("Please explain this again in a different way, with a simpler example: " + question, { confused: true }); });
    const rd = mk("Stop reading", () => { if(reading && voice.isSpeaking && voice.isSpeaking()){ stopReading(); rd.textContent = "Read aloud"; } else { rd.textContent = "Stop reading"; readAloud(body); } });
    mk("Find study material", () => findMaterial(question));
    return row;
  }
  async function findMaterial(q){
    try{
      const goal = Object.assign({}, ai.parseGoal("study " + q.replace(/^please .*?:\s*/i, "")));
      bus.emit("projection:close");
      const agent = await D.require("agent"); agent.start(goal);
    }catch(e){ D.ui.toast({ text: "I couldn't open the study planner just now." }); }
  }

  async function startStudy(topic){
    if(!topic || !String(topic).trim()) return;
    bus.emit("projection:open");
    if(!content.querySelector(".st-group")) content.textContent = "";
    pointer.style.opacity = "0";
    if(D.math) D.math.ready();                         // warm the maths renderer while the answer is being written
    await ask(String(topic).trim(), { confused: ai.isConfused(topic) });
  }
  function followUp(text){
    if(classify(text) === "other"){                    // not a study question: Study Mode must not trap it
      bus.emit("projection:close");
      setTimeout(() => D.app.handleUserUtterance(text), 120);
      return;
    }
    ask(text, { confused: ai.isConfused(text) });
  }
  function recheck(){ if(lastQ && lastA) ask(lastQ, { recheck: lastA }); }
  function stopStudy(){ cancelled = true; busy = false; stopReading(); }
  function reset(){ turns = []; lastQ = lastA = ""; content.textContent = ""; }

  bus.on("study:launch", ({ topic }) => startStudy(topic));
  bus.on("projection:close", () => { stopStudy(); });
  bus.on("study:end", () => { stopStudy(); setTimeout(() => { if(!document.getElementById("projection").classList.contains("open")) reset(); }, 400); });

  window.DABSy.study = { startStudy, stopStudy, classify, followUp, recheck, turns: () => turns.slice() };
})();
