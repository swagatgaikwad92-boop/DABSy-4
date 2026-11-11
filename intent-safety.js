/* ============================================================
   D.A.B.S.y — intent-safety.js : "is this actually a request to DO something?" (v11.3, step 1)

   Classifies what the user SAID before anything is allowed to become an
   action. Deterministic rules, no AI: the AI may suggest a plan, but it is
   this gate that decides whether the user's own words authorise one.

     question     "Should I turn on Bluetooth?"          never an action
     chat         "thanks", "I opened YouTube earlier"   never an action
     suggestion   "maybe we could open YouTube"          never an action
     intention    "I want to set a timer"                never an action (offer, don't act)
     command      "Open Bluetooth settings."             actionable
     multi_step   "Open YouTube, then set a 10 min timer" actionable, each clause on its own words
     ambiguous    "Can you open YouTube?" / "set a timer" -> ask first; never guess

   Rules that hold everywhere:
     - A leading frame (question / suggestion / intention / negation / "if…") governs the
       WHOLE sentence: "Should I turn on Bluetooth and open YouTube?" runs nothing.
     - Each clause is authorised only by its own words. Nothing is inferred from context.
     - A command missing a required detail is ambiguous, not guessed.
     - A command that maps to something DABSy deliberately can't do is reported as that
       (never silently swapped for a different action).
   ============================================================ */
(function(){
  const D = window.DABSy = window.DABSy || {};
  const KINDS = Object.freeze({ question: "question", chat: "chat", suggestion: "suggestion", intention: "intention", command: "command", multi_step: "multi_step", ambiguous: "ambiguous" });

  const VERBS = "open|launch|start|begin|set|create|add|make|schedule|remind|find|navigate|show|take|share|send|text|message|email|whatsapp|call|phone|dial|ring|select|pick|choose|browse|turn|switch|enable|disable|toggle|play|search|book|go|head|get|put|run|visit|attach|upload|fire up|cancel";
  const CMD_START = new RegExp("^(?:(?:please|just|now|okay|ok|hey|then|also|and|kindly)\\s+)*(?:(?:go ahead and|i want you to|i need you to|i'd like you to|i would like you to|i'll need you to)\\s+)?(?:let me\\s+)?(?:" + VERBS + ")\\b", "i");

  /* ---------------- text hygiene ---------------- */
  function normalize(text){
    let t = String(text == null ? "" : text).replace(/\s+/g, " ").trim();
    t = t.replace(/\b([ap])\.\s?m\.?/gi, "$1m");                                        // "5 p.m." must not look like a sentence end
    t = t.replace(/^(?:(?:hey|hi|ok|okay|yo)\s+)?(?:d\.?a\.?b\.?s\.?y|dabby)\b[\s,:!.\-–—]*/i, "");  // wake word
    return t;
  }
  const sentences = t => t.split(/(?<=[.!?])\s+(?=\S)/).map(s => s.trim()).filter(Boolean);

  /* ---------------- the frame of one sentence ---------------- */
  const NEG = /^(?:(?:please|just|hey|okay|ok)\s+)*(?:do not|don'?t|dont|never|no need to|not now|stop trying to)\b/i;
  const POLITE = /^(?:(?:hey|ok|okay|please)\s+)*(?:can|could|would|will)\s+(?:you|u)\s+(?:please\s+|kindly\s+)?(.+?)[?.!]*$/i;
  const COND = /^(?:if|when|whenever|once|unless|in case|as soon as)\b/i;
  const SUGG = /^(?:maybe|perhaps|how about|what about|what if|we could|you could|i could|you might|i might|might be|why don'?t (?:we|i|you)|let'?s|lets|let us|we should|you should|it would be (?:nice|good|great)|would it be)\b/i;
  const INTENT = /^(?:i(?:'m| am)?\s*(?:going to|gonna|planning to|plan to|want to|wanna|need to|have to|had to|intend to|would like to|'d like to|must|should|ought to|gotta|will|'ll)\b|i\s+(?:want|need|have|gotta|should|must)\b|we need to|remember to)/i;
  const QSTART = /^(?:who|what|whats|what's|when|where|why|how|which|whose|is|are|was|were|am|do|does|did|can|could|would|will|should|shall|may|might|has|have|had|isn'?t|aren'?t|doesn'?t|won'?t|wouldn'?t|shouldn'?t|couldn'?t|can'?t)\b/i;

  function frame(sentence){
    const s = sentence.trim();
    const bare = s.replace(/[?.!]+$/, "").trim();
    if(!bare) return { kind: KINDS.chat, flags: ["empty"] };
    if(NEG.test(bare)) return { kind: KINDS.chat, flags: ["negated"], reason: "A prohibition, not a request." };
    const directed = /^(?:i want you to|i need you to|i'd like you to|i would like you to|i'll need you to)\b/i.test(bare);
    const pol = bare.match(POLITE);
    if(pol && !directed && CMD_START.test(pol[1])) return { kind: KINDS.ambiguous, flags: ["polite_request"], rest: pol[1], reason: "Phrased as a question about whether I can/will, so I'll check before acting." };
    if(COND.test(bare)) return { kind: KINDS.intention, flags: ["conditional"], reason: "Conditional: not a request to act right now." };
    if(SUGG.test(bare)) return { kind: KINDS.suggestion, flags: [], reason: "A suggestion, not an instruction." };
    if(INTENT.test(bare) && !directed) return { kind: KINDS.intention, flags: [], reason: "States what the user wants or plans, not an instruction to me." };
    const qmark = /\?\s*$/.test(s);
    if(qmark && CMD_START.test(bare)) return { kind: KINDS.ambiguous, flags: ["question_mark"], rest: bare, reason: "Worded as a question, so I'll check before acting." };
    if(qmark || QSTART.test(bare)) return { kind: KINDS.question, flags: [], reason: "A question: I answer it, I don't act on it." };
    if(CMD_START.test(bare)) return { kind: KINDS.command, flags: [], rest: bare };
    return { kind: KINDS.chat, flags: [], reason: "No instruction in it." };
  }

  /* ---------------- clause splitting (inside a command sentence only) ---------------- */
  const SPLIT = new RegExp("\\s*(?:(,?\\s*(?:and then|then|after that|afterwards|and after that|followed by)\\b,?)|(;|,\\s*and|,|\\band))\\s+(?=(?:please\\s+|also\\s+|then\\s+)?(?:" + VERBS + ")\\b)", "ig");
  function splitClauses(text){
    const out = []; let last = 0, m, conn = "start";
    SPLIT.lastIndex = 0;
    while((m = SPLIT.exec(text))){
      out.push({ text: text.slice(last, m.index).trim(), connector: conn });
      conn = m[1] ? "sequence" : "parallel";
      last = SPLIT.lastIndex;
    }
    out.push({ text: text.slice(last).trim(), connector: conn });
    return out.filter(c => c.text);
  }

  /* ---------------- slot helpers (reuse the AI engine's existing parsers) ---------------- */
  const ai = () => D.ai || {};
  const pad = n => String(n).padStart(2, "0");
  function localISO(d){
    const off = -d.getTimezoneOffset(), sg = off >= 0 ? "+" : "-", a = Math.abs(off);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":00" + sg + pad(Math.floor(a / 60)) + ":" + pad(a % 60);
  }
  // compound durations ("1 hour 30 minutes", "90 seconds") — falls back to the AI engine's parseDuration ("an hour", "half an hour")
  function durationMinutes(t){
    let total = 0, hit = false, m;
    const re = /(\d+(?:\.\d+)?)\s*-?\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\b/gi;
    while((m = re.exec(t))){ const n = parseFloat(m[1]), u = m[2].toLowerCase(); hit = true; total += /^h/.test(u) ? n * 60 : /^s/.test(u) ? n / 60 : n; }
    if(hit) return total;
    if(/\bhalf an hour\b/i.test(t)) return 30;
    if(/\b(?:an|one) hour\b/i.test(t)) return 60;
    if(/\bquarter of an hour\b/i.test(t)) return 15;
    const p = ai().parseDuration ? ai().parseDuration(t) : null;
    return p || null;
  }
  function dayOffset(t){
    if(ai().parseDayOffset) return ai().parseDayOffset(t);
    return /\bday after tomorrow\b/i.test(t) ? 2 : /\btomorrow\b/i.test(t) ? 1 : 0;
  }
  function timeOfDay(t){ return ai().parseTimeOfDay ? ai().parseTimeOfDay(t) : null; }
  function whenFrom(t, now){
    now = now || new Date();
    const rel = t.match(/\bin\s+(\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?)\b/i);
    if(rel){ const n = parseFloat(rel[1]), mins = /^h/i.test(rel[2]) ? n * 60 : n; return new Date(now.getTime() + mins * 60000); }
    const tm = timeOfDay(t); if(!tm) return null;
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset(t), tm.hour, tm.minute, 0, 0);
    return d;
  }
  const stripTimeWords = s => s.replace(/\b(?:today|tonight|tomorrow|day after tomorrow|this (?:morning|afternoon|evening)|next|on (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, " ")
    .replace(/\b(?:at|by|@|for)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/gi, " ").replace(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi, " ").replace(/\b\d{1,2}:\d{2}\b/g, " ")
    .replace(/\bin\s+\d+(?:\.\d+)?\s*(?:hours?|hrs?|minutes?|mins?)\b/gi, " ").replace(/\s+/g, " ").replace(/^[\s,.\-]+|[\s,.\-?!]+$/g, "");

  const APPS = {
    youtube: ["youtube", "yt", "you tube"], chrome: ["chrome", "google chrome", "browser", "the browser"], maps: ["maps", "google maps", "map"], calendar: ["calendar", "google calendar"],
    gmail: ["gmail", "mail", "email app"], camera: ["camera"], clock: ["clock", "alarm clock"], settings: ["settings", "phone settings"], photos: ["photos", "gallery"], whatsapp: ["whatsapp"],
    spotify: ["spotify"], files: ["files", "file manager"], study_space: ["study space", "studyspace"], ghibli_calendar: ["ghibli calendar"], solvecount: ["solvecount", "solve count"],
  };
  const ALIAS = {}; Object.entries(APPS).forEach(([id, names]) => names.forEach(n => { ALIAS[n] = id; }));
  const PRONOUN = /^(?:it|this|that|something|one|them|those|these|anything|stuff)$/i;
  const prettyApp = id => ({ study_space: "Study Space", ghibli_calendar: "Ghibli Calendar", youtube: "YouTube", whatsapp: "WhatsApp", solvecount: "SolveCount" }[id]) || id.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  const miss = (arg, question) => ({ arg, question });

  /* ---------------- one clause -> a capability + arguments (or what's missing) ---------------- */
  function interpretClause(raw, now){
    const text = raw.replace(/^(?:(?:please|just|now|okay|ok|hey|then|also|and|kindly)\s+)+/i, "").replace(/^(?:go ahead and|i want you to|i need you to|i'd like you to|i would like you to|i'll need you to)\s+/i, "").replace(/^let me\s+/i, "").replace(/[.!?]+$/, "").trim();
    const l = text.toLowerCase();
    const out = (cap, args, title, missing) => ({ text: raw, capability: cap, args: args || {}, title, missing: missing || [], reason: null });

    // --- policy-unsupported intents first, so they are reported as what they are (never swapped for something else)
    let m;
    if(/^(?:send|text|message|email|whatsapp|dm)\b/.test(l) && !/^(?:message|email)s?\s+app\b/.test(l)) return out("message.send", { raw: text }, "Send a message");
    if(/^(?:call|phone|dial|ring)\b/.test(l)) return out("call.place", { raw: text }, "Place a call");
    if(/\b(?:turn|switch|toggle|enable|disable)\b/.test(l) && /\bbluetooth\b/.test(l)) return out("bluetooth.toggle", { raw: text }, "Switch Bluetooth");
    if(/\b(?:turn|switch|toggle|enable|disable)\b/.test(l) && /\bwi-?fi\b/.test(l)) return out("wifi.toggle", { raw: text }, "Switch Wi-Fi");

    // --- timer
    if(/\b(?:timer|count ?down)\b/.test(l) && /^(?:set|start|create|begin|run|make|put|get)\b/.test(l)){
      const mins = durationMinutes(l);
      if(!mins) return out("timer.set", {}, "Set a timer", [miss("minutes", "How long should the timer be?")]);
      let label = (l.match(/\b([a-z]+)\s+timer\b/) || [])[1];
      if(label && /^(?:a|an|the|my|minute|hour|second|min|mins|new|countdown|quick)$/.test(label)) label = null;
      const lf = l.match(/\btimer\s+for\s+(?!\d|an? hour|half)([a-z][a-z ]{1,40})$/); if(!label && lf) label = lf[1].trim();
      const nice = mins < 1 ? Math.round(mins * 60) + "-second" : (Math.abs(mins - Math.round(mins)) < 1e-9 ? Math.round(mins) : Math.round(mins * 10) / 10) + "-minute";
      return out("timer.set", Object.assign({ minutes: Math.round(mins * 1000) / 1000 }, label ? { label: label.charAt(0).toUpperCase() + label.slice(1) } : {}), "Set a " + nice + (label ? " " + label : "") + " timer");
    }

    // --- bluetooth settings (explicit) / bare "open bluetooth" (ambiguous)
    if(/\bbluetooth\b/.test(l)){
      if(/\bsettings?\b/.test(l)) return out("bluetooth.settings", {}, "Open Bluetooth settings");
      return out("bluetooth.settings", {}, "Open Bluetooth settings", [miss("confirm_scope", "Do you want me to open Bluetooth settings? I can't switch Bluetooth on or off myself.")]);
    }

    // --- calendar event
    if(/\b(?:calendar|event|appointment|meeting)\b/.test(l) && /^(?:create|add|schedule|set up|put|make|book|set)\b/.test(l)){
      const when = whenFrom(l, now);
      let title = (text.match(/\b(?:called|named|titled)\s+["“]?(.+?)["”]?(?=\s+(?:for|on|at|tomorrow|today|tonight)\b|$)/i) || [])[1];
      if(!title){ const mm = text.match(/^(?:add|put)\s+(.+?)\s+(?:to|on|in|into)\s+(?:my\s+)?(?:calendar|schedule)\b/i); if(mm) title = stripTimeWords(mm[1]); }
      if(title) title = title.trim();
      if(!when) return out("calendar.insert", title ? { title } : {}, "Create a calendar event", [miss("start", "What day and time should the event be?")]);
      const dur = durationMinutes(l.replace(/^[^]*?\b(?:for)\s+(?=\d)/, "for ")) ;
      const mins = (/\bfor\s+\d/.test(l) && dur) ? dur : 60;
      const args = { start: localISO(when), end: localISO(new Date(when.getTime() + mins * 60000)) }; if(title) args.title = title;
      return out("calendar.insert", args, "Create a calendar event" + (title ? ": " + title : ""));
    }

    // --- reminder
    if((m = text.match(/^(?:remind me|set (?:a |an )?reminder|create (?:a |an )?reminder|add (?:a |an )?reminder)\s*(?:to|about|that|for)?\s*(.*)$/i))){
      const when = whenFrom(l, now);
      let what = stripTimeWords(m[1] || "").replace(/^(?:to|about|that)\s+/i, "");
      const missing = [];
      if(!what) missing.push(miss("text", "What should I remind you about?"));
      if(!when) missing.push(miss("at", "When should I remind you?"));
      return out("reminder.schedule", Object.assign({}, what ? { text: what.charAt(0).toUpperCase() + what.slice(1) } : {}, when ? { at: localISO(when) } : {}), "Remind you" + (what ? ": " + what : ""), missing);
    }

    // --- task (DABSy's own list)
    if((m = text.match(/^(?:add|create|make|put)\s+(?:a\s+|an\s+)?(?:new\s+)?(?:task|to-?do|todo)\b[:\s]*(?:to\s+|called\s+|named\s+|for\s+)?(.*)$/i)) || (m = text.match(/^add\s+(.+?)\s+to\s+(?:my\s+)?(?:tasks?|to-?do(?:\s+list)?|list)$/i))){
      let title = stripTimeWords((m[1] || "").replace(/\b(?:for\s+)?\d+\s*(?:hours?|hrs?|minutes?|mins?)\b/ig, " ")).trim();
      if(!title) return out("task.add", {}, "Add a task", [miss("title", "What's the task?")]);
      const d = durationMinutes(l); const args = { title: title.charAt(0).toUpperCase() + title.slice(1) }; if(d && Number.isInteger(Math.round(d)) && d >= 5 && d <= 600) args.durationMin = Math.round(d);
      return out("task.add", args, "Add task: " + args.title);
    }

    // --- sharing (needs real content; never invents what "this" is)
    if(/^share\b/.test(l)){
      const url = (text.match(/https?:\/\/[^\s]+/i) || [])[0]; const quoted = (text.match(/["“](.+?)["”]/) || [])[1];
      const content = quoted || url;
      if(!content) return out("share.text", {}, "Share", [miss("text", "What text or link should I share?")]);
      return out("share.text", { text: content }, "Share " + (quoted ? "your text" : "a link"));
    }

    // --- files
    if(/^(?:let me\s+)?(?:select|pick|choose|browse|attach|upload)\b/.test(l) || (/^(?:open|find)\b/.test(l) && /\b(?:file|document|doc|pdf)\b/.test(l))){
      if(/\b(?:file|document|doc|pdf|notes?|worksheet|paper|slides?)\b/.test(l)){
        const mime = /\bpdf\b/.test(l) ? "application/pdf" : null;
        const hint = (l.match(/\b(chemistry|physics|maths?|biology|english|history|geography|economics|accountancy)\b/) || [])[1];
        return out("file.pick", Object.assign({}, mime ? { mime } : {}, hint ? { hint } : {}), "Choose a file" + (hint ? " (" + hint + ")" : ""));
      }
    }

    // --- navigation
    if((m = text.match(/\b(?:navigate|directions?|route|take me|way|head|go|drive|walk)\b.*?\b(?:to|towards|toward)\s+(.+)$/i))){
      const dest = m[1].replace(/\b(?:please|now)\b/ig, "").trim();
      if(PRONOUN.test(dest)) return out("nav.route", {}, "Find a route", [miss("destination", "Where do you want to go?")]);
      return out("nav.route", { destination: dest }, "Find a route to " + dest);
    }

    // --- web link
    if(/^(?:open|visit|go to|launch|browse)\b/.test(l)){
      const um = text.match(/\b((?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|org|net|edu|io|in|co|app|dev|ai|gov|uk)(?:\/[^\s]*)?)/i);
      if(um){ const u = /^https?:\/\//i.test(um[1]) ? um[1] : "https://" + um[1]; return out("web.open", { url: u }, "Open " + um[1]); }
      if(/\b(?:website|site|link|page|url|web ?page)\b/.test(l)) return out("web.open", {}, "Open a website", [miss("url", "Which website should I open?")]);
    }

    // --- app launch
    if((m = text.match(/^(?:open|launch|start|run|go to|switch to|fire up)\s+(?:the\s+|my\s+)?(.+?)(?:\s+app)?$/i))){
      const name = m[1].trim().toLowerCase();
      if(!name || PRONOUN.test(name)) return out("app.launch", {}, "Open an app", [miss("app", "Which app should I open?")]);
      const id = ALIAS[name];
      if(id) return out("app.launch", { app: id }, "Open " + prettyApp(id));
      if(/^(?:a|an|some|another|new)\b/.test(name) || /^[a-z]+ing\b/.test(name) || name.split(" ").length > 3 || /\d/.test(name)) return { text: raw, capability: null, args: {}, title: null, missing: [], reason: "no_matching_capability" };
      const slug = name.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      return out("app.launch", { app: slug }, "Open " + prettyApp(slug));
    }
    return { text: raw, capability: null, args: {}, title: null, missing: [], reason: "no_matching_capability" };
  }

  /* ---------------- the public verdict ---------------- */
  const PRIORITY = [KINDS.ambiguous, KINDS.question, KINDS.suggestion, KINDS.intention, KINDS.chat];
  function interpret(text, opts){
    opts = opts || {};
    const norm = normalize(text);
    const res = { text: String(text == null ? "" : text), normalized: norm, kind: KINDS.chat, actionable: false, clauses: [], sentences: [], clarification: null, unhandled: [], reasons: [] };
    if(!norm){ res.reasons.push("Empty request."); return res; }

    const cmdClauses = [];           // resolved clauses across all command sentences
    const frames = sentences(norm).map(s => ({ s, f: frame(s) }));
    for(const { s, f } of frames){
      res.sentences.push({ text: s, kind: f.kind, flags: f.flags || [] });
      if(f.reason) res.reasons.push(f.kind + ": " + f.reason);
      if(f.kind === KINDS.ambiguous && f.rest && !res.clarification){
        const c = interpretClause(f.rest, opts.now);
        const label = c.title ? c.title.charAt(0).toLowerCase() + c.title.slice(1) : f.rest.replace(/[?.!]+$/, "");
        res.clarification = { question: "Do you want me to " + label + "?", reason: f.flags[0], candidate: { capability: c.capability, args: c.args, missing: c.missing } };
      }
      if(f.kind !== KINDS.command) continue;
      for(const c of splitClauses(f.rest)){
        const ic = interpretClause(c.text, opts.now);
        ic.connector = c.connector; ic.sentence = s;
        res.clauses.push(ic);
      }
    }

    const actionable = res.clauses.filter(c => c.capability || c.reason);
    if(!res.clauses.length){
      const seen = res.sentences.map(x => x.kind);
      res.kind = PRIORITY.find(k => seen.includes(k)) || KINDS.chat;
      return res;
    }
    // missing details anywhere -> ask, run nothing
    const withMissing = res.clauses.find(c => c.missing && c.missing.length);
    if(withMissing){
      res.kind = KINDS.ambiguous;
      res.clarification = { question: withMissing.missing[0].question, reason: "missing:" + withMissing.missing[0].arg, candidate: { capability: withMissing.capability, args: withMissing.args } };
      res.reasons.push("ambiguous: " + withMissing.title + " needs '" + withMissing.missing[0].arg + "'.");
      return res;
    }
    const usable = res.clauses.filter(c => c.capability);
    res.unhandled = res.clauses.filter(c => !c.capability).map(c => ({ text: c.text, reason: c.reason }));
    if(!usable.length){ res.kind = KINDS.command; res.actionable = false; res.reasons.push("command: no capability matches."); return res; }
    res.kind = usable.length > 1 ? KINDS.multi_step : KINDS.command;
    res.actionable = true;
    return res;
  }

  const classify = t => { const r = interpret(t); return { kind: r.kind, actionable: r.actionable, reasons: r.reasons, clarification: r.clarification }; };

  D.intentSafety = { KINDS, normalize, classify, interpret, interpretClause, splitClauses, frame, durationMinutes };
})();
