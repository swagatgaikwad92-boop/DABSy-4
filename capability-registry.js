/* ============================================================
   D.A.B.S.y — capability-registry.js : what DABSy can ACTUALLY do (v11.3, step 1)

   A capability is a declaration: name, platform, permissions, argument
   schema, risk, how its result is verified, whether it can be undone.
   Registering one does NOT make it available. Availability is computed
   fresh, every time, from the real situation:

     unsupported            this device/platform can never do it (or policy forbids it)
     unavailable            it could exist here, but nothing is installed to do it (no adapter)
     temporarily_unavailable an adapter exists but its probe says "not right now"
     permission_required    everything is in place except a permission the user hasn't granted
     available              adapter present, probe ok, permissions granted

   The EXECUTION ADAPTER is attached separately (attachAdapter): in this
   step only in-app adapters exist; the Android bridge attaches its own later.
     adapter = { execute(args, ctx) -> {ok, result?, handedOff?, error?},
                 verify(step, ctx)  -> {state:"verified"|"failed"|"inconclusive", evidence},
                 undo(step, ctx)    -> {ok},
                 probe(ctx)         -> {supported?, temporary?, reason?} }
   ============================================================ */
(function(){
  const D = window.DABSy = window.DABSy || {};
  const A = D.actions;

  const STATES = Object.freeze({ available: "available", unavailable: "unavailable", permission_required: "permission_required", unsupported: "unsupported", temporarily_unavailable: "temporarily_unavailable" });
  const caps = new Map();
  const adapters = new Map();
  const permProviders = new Map();
  let envOverride = null;

  /* ---------------- environment ---------------- */
  function env(){
    if(envOverride) return Object.assign({}, envOverride);
    const native = !!(typeof window.DABSyNative !== "undefined" && window.DABSyNative);
    return { platform: native ? "android" : "web", native, online: typeof navigator !== "undefined" ? navigator.onLine !== false : true };
  }
  function setEnvironment(e){ envOverride = e ? Object.assign({ platform: "web", native: false, online: true }, e) : null; }

  /* ---------------- registration ---------------- */
  function register(def){
    if(!def || !/^[a-z][a-z0-9]*(\.[a-z][a-z0-9_]*)+$/.test(def.name || "")) throw new Error("capability needs a dotted lowercase name");
    if(caps.has(def.name)) throw new Error("capability already registered: " + def.name);
    const policyBlocked = !!def.policyUnsupported;
    // THE VERIFICATION CONTRACT: no executable capability may be registered without saying how (or whether) it is verified.
    const v = def.verification;
    if(!policyBlocked){
      if(!v || !A.VERIFY_METHOD[v.method]) throw new Error(def.name + ": verification.method is required (readback | result_callback | none)");
      if(v.method === "none" && !(v.ceiling === "attempted" || v.ceiling === "executed")) throw new Error(def.name + ": an unverifiable capability must declare its ceiling (attempted | executed)");
      if(v.method !== "none" && v.ceiling && v.ceiling !== "verified") throw new Error(def.name + ": a verifiable capability's ceiling is 'verified'");
    }
    const c = {
      name: def.name,
      description: String(def.description || ""),
      platform: ["android", "web", "any"].includes(def.platform) ? def.platform : "any",
      permissions: Array.isArray(def.permissions) ? def.permissions.slice() : [],
      args: def.args || {},
      risk: def.risk || "low",
      confirm: ["never", "auto", "always"].includes(def.confirm) ? def.confirm : "auto",   // auto = confirm when risk >= medium
      verification: policyBlocked ? { method: "none", ceiling: "attempted", description: "n/a" } : { method: v.method, ceiling: v.method === "none" ? v.ceiling : "verified", description: v.description || "" },
      undo: { supported: !!(def.undo && def.undo.supported), description: (def.undo && def.undo.description) || "" },
      triggers: Array.isArray(def.triggers) ? def.triggers.slice() : [],       // RegExps: words in the USER's request that justify this capability
      supporting: !!def.supporting,                                             // may appear only as a prerequisite of another matched step
      policyUnsupported: policyBlocked ? String(def.policyUnsupported) : "",
      alternatives: def.alternatives || [],
      escalate: typeof def.escalate === "function" ? def.escalate : null,       // (args) -> risk, may raise risk for specific arguments
    };
    caps.set(c.name, c);
    if(def.adapter) adapters.set(c.name, def.adapter);
    return c;
  }
  const get = name => caps.get(name) || null;
  const list = () => Array.from(caps.values());
  function attachAdapter(name, adapter){ if(!caps.has(name)) throw new Error("unknown capability: " + name); if(!adapter || typeof adapter.execute !== "function") throw new Error("adapter needs execute()"); adapters.set(name, adapter); }
  function detachAdapter(name){ adapters.delete(name); }
  const adapterOf = name => adapters.get(name) || null;

  /* ---------------- permissions (reuses DABSy.permissions where it knows the name) ---------------- */
  function setPermissionProvider(name, p){ permProviders.set(name, p); }
  async function permissionState(name){
    const p = permProviders.get(name);
    if(p && p.status) { try{ return await p.status(); }catch(e){ return "prompt"; } }
    if(D.permissions && D.permissions.REGISTRY && D.permissions.REGISTRY[name]) return D.permissions.status(name);
    return "prompt";            // unknown permission: never assume it is granted
  }
  async function requestPermission(name, opts){
    const p = permProviders.get(name);
    if(p && p.request) return p.request(opts || {});
    if(D.permissions && D.permissions.REGISTRY && D.permissions.REGISTRY[name]) return D.permissions.ensure(name, opts || {});
    return { granted: false, state: "prompt", unavailable: true };
  }

  /* ---------------- argument validation (strict allowlist) ---------------- */
  const SAFE_URL = /^https?:\/\/[^\s<>"']+$/i;
  const isRef = v => v && typeof v === "object" && !Array.isArray(v) && typeof v.$ref === "string" && Object.keys(v).length === 1;
  function validateArgs(schema, args, opts){
    opts = opts || {};
    const errors = [], clean = {};
    args = args || {};
    for(const k of Object.keys(args)) if(!(k in schema)) errors.push({ code: "unknown_argument", arg: k, message: "Unexpected argument '" + k + "'" });
    for(const [k, s] of Object.entries(schema)){
      let v = args[k];
      if(v === undefined || v === null || v === ""){ if(s.required) errors.push({ code: "missing_argument", arg: k, message: "Missing '" + k + "'" }); continue; }
      if(isRef(v)){ if(opts.allowRefs) { clean[k] = v; continue; } errors.push({ code: "unresolved_ref", arg: k, message: "Reference not resolved for '" + k + "'" }); continue; }
      const bad = m => errors.push({ code: "invalid_argument", arg: k, message: m });
      switch(s.type){
        case "string": { if(typeof v !== "string"){ bad("'" + k + "' must be text"); break; } v = A.clip(v, s.max || 500).trim(); if(s.required && !v){ bad("'" + k + "' is empty"); break; } clean[k] = v; break; }
        case "enum": { if(!s.values.includes(v)) bad("'" + k + "' must be one of " + s.values.join(", ")); else clean[k] = v; break; }
        case "integer": case "number": {
          const n = typeof v === "number" ? v : NaN;
          if(!Number.isFinite(n) || (s.type === "integer" && !Number.isInteger(n))){ bad("'" + k + "' must be a " + (s.type === "integer" ? "whole " : "") + "number"); break; }
          if(s.min != null && n < s.min){ bad("'" + k + "' must be at least " + s.min); break; }
          if(s.max != null && n > s.max){ bad("'" + k + "' must be at most " + s.max); break; }
          clean[k] = n; break; }
        case "url": { if(typeof v !== "string" || !SAFE_URL.test(v.trim()) || v.length > 2000) bad("'" + k + "' must be an http(s) link"); else clean[k] = v.trim(); break; }   // no javascript:, file:, intent:, content:
        case "iso": { if(typeof v !== "string" || Number.isNaN(Date.parse(v))) bad("'" + k + "' must be a date-time"); else clean[k] = v; break; }
        default: bad("unsupported argument type for '" + k + "'");
      }
    }
    return { ok: errors.length === 0, errors, clean };
  }

  /* ---------------- availability ---------------- */
  // Computed, never stored. Order matters: the first thing that rules the capability out is what we report.
  async function status(name, ctx){
    const c = caps.get(name);
    if(!c) return { name, state: STATES.unsupported, reason: "I don't have a capability called '" + name + "'.", missing: [] };
    if(c.policyUnsupported) return { name, state: STATES.unsupported, reason: c.policyUnsupported, missing: [], alternatives: c.alternatives };
    const e = (ctx && ctx.env) || env();
    if(c.platform === "android" && e.platform !== "android") return { name, state: STATES.unsupported, reason: "This needs the DABSy Android app; it can't be done from a web page.", missing: [] };
    const ad = adapters.get(name);
    if(!ad) return { name, state: STATES.unavailable, reason: "Nothing is installed here yet that can carry this out.", missing: [] };
    if(typeof ad.probe === "function"){
      let p = null; try{ p = await ad.probe(Object.assign({ env: e }, ctx || {})); }catch(err){ p = { temporary: true, reason: "Its readiness check failed." }; }
      if(p && p.supported === false) return { name, state: STATES.unsupported, reason: p.reason || "This device doesn't support it.", missing: [] };
      if(p && (p.temporary || p.ok === false)) return { name, state: STATES.temporarily_unavailable, reason: p.reason || "Not available right now.", missing: [] };
    }
    const missing = [];
    for(const perm of c.permissions){ const s = await permissionState(perm); if(s !== "granted") missing.push({ name: perm, state: s }); }
    if(missing.length) return { name, state: STATES.permission_required, reason: "Needs permission: " + missing.map(m => m.name).join(", ") + ".", missing };
    return { name, state: STATES.available, reason: "", missing: [] };
  }
  async function statusAll(ctx){ const out = {}; for(const c of list()) out[c.name] = await status(c.name, ctx); return out; }

  /* ---------------- trigger check: does the USER's request justify this capability? ---------------- */
  function justified(name, requestText){
    const c = caps.get(name); if(!c) return false;
    if(!c.triggers.length) return false;                // a capability with no triggers can never be invoked by text-derived plans on its own
    return c.triggers.some(re => re.test(String(requestText || "")));
  }

  /* ---------------- built-in declarations ---------------- */
  const T = (...a) => a;
  // ---- Android hand-offs and APIs. Declared now; NO adapter yet -> reported "unsupported" off-device, "unavailable" on-device until the native layer attaches one.
  register({ name: "app.launch", description: "Open an installed app (package intent, with a store/web fallback).", platform: "android", risk: "low", confirm: "never",
    args: { app: { type: "string", required: true, max: 60 } },
    verification: { method: "none", ceiling: "executed", description: "Android reports the intent resolved; it cannot prove the app finished loading." },
    triggers: [/\b(open|launch|start|go to|switch to|run)\b/i] });
  register({ name: "web.open", description: "Open a web link in the browser.", platform: "android", risk: "low", confirm: "never",
    args: { url: { type: "url", required: true } },
    verification: { method: "none", ceiling: "executed", description: "ACTION_VIEW resolved; the page load itself is not observable." },
    triggers: [/\b(open|visit|go to|launch|browse|website|site|link|url|https?:\/\/|www\.)/i] });
  register({ name: "nav.route", description: "Open a map/navigation app for a destination.", platform: "android", risk: "low", confirm: "never",
    args: { destination: { type: "string", required: true, max: 200 } },
    verification: { method: "none", ceiling: "executed", description: "The geo/navigation intent resolved." },
    triggers: [/\b(route|navigate|navigation|directions?|take me|way to|map)\b/i] });
  register({ name: "timer.set", description: "Start a countdown timer in the clock app.", platform: "android", risk: "low", confirm: "never",
    args: { minutes: { type: "number", required: true, min: 1 / 6, max: 1440 }, label: { type: "string", max: 60 } },
    verification: { method: "none", ceiling: "executed", description: "ACTION_SET_TIMER was accepted; the clock app's running timer is not readable by DABSy." },
    undo: { supported: false }, triggers: [/\btimer\b/i, /\bcount ?down\b/i] });
  register({ name: "calendar.insert", description: "Open the calendar's new-event editor, prefilled. The USER saves it.", platform: "android", risk: "low", confirm: "never",
    args: { title: { type: "string", max: 120 }, start: { type: "iso", required: true }, end: { type: "iso" }, notes: { type: "string", max: 500 } },
    verification: { method: "none", ceiling: "attempted", description: "Only the editor opens. Whether the user saved the event is not observable, so this never reaches 'executed'." },
    triggers: [/\b(calendar|event|appointment|meeting)\b/i] });
  register({ name: "reminder.schedule", description: "Schedule a local reminder notification on the device.", platform: "android", risk: "low", confirm: "never", permissions: ["notifications"],
    args: { text: { type: "string", required: true, max: 200 }, at: { type: "iso", required: true } },
    verification: { method: "readback", description: "Ask the scheduler whether a pending reminder with this id exists." },
    undo: { supported: true, description: "Cancel the scheduled reminder." }, triggers: [/\bremind(er)?s?\b/i] });
  register({ name: "notification.show", description: "Show a DABSy notification now.", platform: "android", risk: "low", confirm: "never", permissions: ["notifications"],
    args: { title: { type: "string", required: true, max: 80 }, text: { type: "string", max: 300 } },
    verification: { method: "readback", description: "Check the notification is in the active list." }, triggers: [/\bnotif(y|ication)s?\b/i] });
  register({ name: "file.pick", description: "Open the system document picker so the user can choose a file.", platform: "android", risk: "low", confirm: "never",
    args: { mime: { type: "string", max: 80 }, hint: { type: "string", max: 80 } },
    verification: { method: "result_callback", description: "The picker returns the chosen document URI (or cancellation)." },
    triggers: [/\b(select|pick|choose|browse|open)\b[^.]*\b(file|document|doc|pdf|notes?)\b/i, /\b(file|document|pdf)\b/i] });
  register({ name: "share.text", description: "Open the Android share sheet with prepared text. The user picks the recipient and sends.", platform: "android", risk: "medium", confirm: "always",
    args: { text: { type: "string", required: true, max: 2000 }, subject: { type: "string", max: 120 } },
    verification: { method: "none", ceiling: "attempted", description: "The share sheet opens; whether anything was sent is not observable." },
    triggers: [/\bshare\b/i] });
  register({ name: "bluetooth.settings", description: "Open Bluetooth settings. Does not change Bluetooth.", platform: "android", risk: "low", confirm: "never",
    args: {},
    verification: { method: "none", ceiling: "attempted", description: "The settings screen opens; what the user does there is not observable." },
    triggers: [/\bbluetooth\b[^.]*\bsettings?\b/i, /\bsettings?\b[^.]*\bbluetooth\b/i] });

  // ---- in-app capability with a REAL adapter, reusing the existing task engine (no second task store)
  register({ name: "task.add", description: "Add a task to DABSy's own task list.", platform: "any", risk: "low", confirm: "never",
    args: { title: { type: "string", required: true, max: 120 }, durationMin: { type: "integer", min: 5, max: 600 }, dueAt: { type: "iso" } },
    verification: { method: "readback", description: "Read the task back from the task engine by id." },
    undo: { supported: true, description: "Remove the task." },
    triggers: [/\b(add|create|make|put)\b[^.]*\b(task|to-?do|todo|list)\b/i, /\bnote to self\b/i],
    adapter: {
      probe(){ return D.tasks && D.tasks.add ? { ok: true } : { ok: false, reason: "The task engine isn't loaded." }; },
      async execute(args){ const t = D.tasks.add({ title: args.title, durationMin: args.durationMin, dueAt: args.dueAt || null, source: "execution" }); return { ok: true, result: { taskId: t && t.id } }; },
      async verify(step){ const id = step.result && step.result.taskId; const t = id && D.tasks.get(id); return t && t.title === step.args.title ? { state: "verified", evidence: "task " + id + " found with the expected title" } : { state: "failed", evidence: "the task was not found after adding it" }; },
      async undo(step){ const id = step.result && step.result.taskId; if(!id) return { ok: false }; D.tasks.remove(id); return { ok: !D.tasks.get(id) }; },
    } });

  // ---- deliberately UNSUPPORTED by policy. Registered so DABSy can answer honestly ("I can't do that, here's what I can do") instead of guessing.
  const POLICY = (name, description, why, alternatives, triggers) => register({ name, description, policyUnsupported: why, alternatives, triggers: triggers || [], platform: "android" });
  POLICY("message.send", "Send a message or email on the user's behalf.", "I never send messages for you. I can prepare the text and open the share sheet so you send it yourself.", ["share.text"], [/\b(send|text|message|email|whatsapp|dm)\b/i]);
  POLICY("call.place", "Place a phone call.", "I don't place calls on my own.", [], [/\b(call|phone|dial|ring)\b/i]);
  POLICY("bluetooth.toggle", "Switch Bluetooth on or off.", "Android doesn't let apps switch Bluetooth on and off silently. I can open Bluetooth settings for you.", ["bluetooth.settings"], [/\b(turn|switch|toggle|enable|disable)\b[^.]*\bbluetooth\b/i]);
  POLICY("wifi.toggle", "Switch Wi-Fi on or off.", "Android doesn't let apps switch Wi-Fi silently.", [], [/\b(turn|switch|toggle|enable|disable)\b[^.]*\bwi-?fi\b/i]);

  D.capabilities = { STATES, register, get, list, status, statusAll, attachAdapter, detachAdapter, adapterOf, setPermissionProvider, requestPermission, permissionState, validateArgs, justified, env, setEnvironment, isRef };
})();
