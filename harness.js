// Loads the REAL DABSy source files into an isolated sandbox (no browser needed).
// ai-engine.js is loaded for real so the intent layer is tested against DABSy's actual time/duration parsers.
const vm = require("vm"), fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "../..");

function makeDabsy(opts){
  opts = opts || {};
  const store = {};
  const listeners = {};
  const events = [];
  const sandbox = { console, setTimeout, clearTimeout, setInterval, clearInterval, AbortController, Promise, Date, JSON, Math, Map, Set, Number, String, Object, Array, RegExp, Error };
  sandbox.window = sandbox;
  sandbox.navigator = { onLine: true };
  sandbox.addEventListener = () => {};
  sandbox.DABSy = {
    bus: { on(n, f){ (listeners[n] = listeners[n] || []).push(f); }, off(){}, emit(n, d){ events.push({ n, d }); (listeners[n] || []).forEach(f => f(d)); } },
    memory: {
      read: (k, fb) => (("dabsy_" + k) in store ? JSON.parse(store["dabsy_" + k]) : fb),
      write: (k, v) => { store["dabsy_" + k] = JSON.stringify(v); return true; },
      getSettings: () => ({}), getSession: () => [], getPreferences: () => [],
    },
    ui: { uid: p => (p || "id") + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) },
    config: { ai: { proxyUrl: "", mode: "message" } },
  };
  vm.createContext(sandbox);
  const load = f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sandbox, { filename: f });
  load("ai-engine.js");                      // real parsers (parseDuration, parseTimeOfDay, parseDayOffset)
  if(opts.tasks !== false){                   // minimal in-memory stand-in for task-engine's add/get/remove (same signatures)
    const tasks = [];
    sandbox.DABSy.tasks = {
      add: p => { const t = Object.assign({ id: "t" + (tasks.length + 1) }, p); tasks.push(t); return t; },
      get: id => tasks.find(t => t.id === id) || null,
      remove: id => { const i = tasks.findIndex(t => t.id === id); if(i >= 0) tasks.splice(i, 1); },
      list: () => tasks.slice(),
    };
  }
  ["action-contract.js", "capability-registry.js", "intent-safety.js", "execution-engine.js"].forEach(load);
  const D = sandbox.DABSy;
  return { D, sandbox, events, store, A: D.actions, C: D.capabilities, I: D.intentSafety, X: D.execution };
}

// Attach a spying adapter to every Android capability so a test can prove NOTHING executed.
function spyAll(env){
  const calls = [];
  env.C.setEnvironment({ platform: "android", native: true });
  env.C.list().forEach(c => {
    if(c.policyUnsupported || c.name === "task.add") return;
    env.C.attachAdapter(c.name, { execute: async (args) => { calls.push({ cap: c.name, args }); return { ok: true, result: { uri: "content://x/1" } }; }, verify: async () => ({ state: "verified", evidence: "spy" }) });
    env.C.setPermissionProvider; // (permissions stay "prompt" unless a test grants them)
  });
  return calls;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
module.exports = { makeDabsy, spyAll, sleep };
