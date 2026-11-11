// DABSy v11.3 step 1 — Action Intelligence Foundation tests.   Run:  node tests/exec/run-tests.js
// Writes tests/exec/TEST_REPORT.md. Exit code 1 on any failure.
const assert = require("assert"), fs = require("fs"), path = require("path");
const { makeDabsy, spyAll, sleep } = require("./harness");

const results = [];
let group = "";
const G = name => { group = name; };
async function T(name, fn){
  const t0 = Date.now();
  try{ await fn(); results.push({ group, name, ok: true, ms: Date.now() - t0 }); }
  catch(e){ results.push({ group, name, ok: false, ms: Date.now() - t0, error: (e && e.message || String(e)).split("\n").slice(0, 4).join(" | ") }); }
}
const NOW = new Date(2026, 10, 11, 10, 0, 0, 0);            // Wed 11 Nov 2026 10:00 local (fixed so date maths is deterministic)
const adapter = (log, name, extra) => Object.assign({ execute: async (args) => { log.push(name); return { ok: true, result: { ok: 1 } }; } }, extra || {});
const android = env => env.C.setEnvironment({ platform: "android", native: true });
const eq = (a, b, m) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b, m);   // sandbox arrays have a different prototype
const stepsOf = p => p.steps.map(s => s.capability);

(async function main(){

/* =================================================================== 1. INTENT SAFETY */
G("1. Intent safety — questions, chat, suggestions, intentions must never become actions");
const NOT_ACTIONS = [
  ["question", "Should I turn on Bluetooth?"], ["question", "What time is it?"], ["question", "How do I set a timer?"],
  ["question", "Is YouTube open?"], ["question", "Do I need to open the calendar?"], ["question", "Why is Bluetooth off?"],
  ["question", "Should I turn on Bluetooth and open YouTube?"], ["question", "Can you explain photosynthesis?"], ["question", "Which app should I open for notes?"],
  ["chat", "Thanks DABSy"], ["chat", "Good morning"], ["chat", "I opened YouTube earlier"], ["chat", "That timer was great"], ["chat", "Don't open YouTube"], ["chat", "Do not set a timer"],
  ["suggestion", "Maybe we could open YouTube"], ["suggestion", "How about a 25 minute timer"], ["suggestion", "Let's open the calendar"], ["suggestion", "You should open my notes"],
  ["intention", "I want to set a 25 minute timer"], ["intention", "I'm going to open YouTube later"], ["intention", "I need to share this link"], ["intention", "When I get home, open YouTube"], ["intention", "If it's raining, open the map"],
];
{
  const env = makeDabsy(); const calls = spyAll(env);
  for(const [kind, text] of NOT_ACTIONS){
    await T(`"${text}" → ${kind}, no plan, nothing runs`, async () => {
      const v = env.I.interpret(text, { now: NOW });
      assert.strictEqual(v.kind, kind, "classified as " + v.kind);
      assert.strictEqual(v.actionable, false);
      const plan = env.X.createPlan(text, { now: NOW });
      assert.strictEqual(plan.status, "not_actionable"); assert.strictEqual(plan.steps.length, 0);
      const r = await env.X.run(plan); assert.strictEqual(r.ok, false);
    });
  }
  await T("with an adapter attached to EVERY capability, zero adapter calls across all non-command texts", () => assert.strictEqual(calls.length, 0, JSON.stringify(calls)));
  await T("'Should I turn on Bluetooth?' never touches Bluetooth settings or toggle", async () => {
    const c = spyAll(makeDabsy()); assert.strictEqual(c.length, 0);
    const e2 = makeDabsy(); const calls2 = spyAll(e2);
    const p = e2.X.createPlan("Should I turn on Bluetooth?"); await e2.X.run(p);
    assert.strictEqual(calls2.length, 0); assert.strictEqual(p.status, "not_actionable");
  });
}

G("1b. Intent safety — polite / question-shaped commands are ASKED, not assumed");
{
  const env = makeDabsy(); const calls = spyAll(env);
  await T("'Can you open YouTube?' → ambiguous + clarification, runs nothing", async () => {
    const p = env.X.createPlan("Can you open YouTube?", { now: NOW });
    assert.strictEqual(p.status, "not_actionable"); assert.strictEqual(p.error.code, "needs_clarification");
    assert.strictEqual(p.clarification.question, "Do you want me to open YouTube?");
    await env.X.run(p); assert.strictEqual(calls.length, 0);
  });
  await T("'Open YouTube?' (question mark) → ambiguous", () => assert.strictEqual(env.I.interpret("Open YouTube?").kind, "ambiguous"));
  await T("after the user says yes (userApproved) the same request becomes a real plan", async () => {
    const p = env.X.createPlan("Could you set a 10 minute timer please?", { userApproved: true, now: NOW });
    assert.strictEqual(p.status, "draft", p.status + " " + JSON.stringify(p.error)); assert.strictEqual((await env.X.validatePlan(p)).valid, true); assert.strictEqual(p.status, "ready"); eq(stepsOf(p), ["timer.set"]); assert.strictEqual(p.steps[0].args.minutes, 10);
  });
  await T("userApproved does NOT rescue a plain question", () => assert.strictEqual(env.X.createPlan("Should I turn on Bluetooth?", { userApproved: true }).status, "not_actionable"));
}

G("2. Simple single-action requests → the right capability and arguments");
{
  const env = makeDabsy();
  const cases = [
    ["DABSy, open YouTube.", "app.launch", { app: "youtube" }],
    ["Open Study Space", "app.launch", { app: "study_space" }],
    ["open my calendar", "app.launch", { app: "calendar" }],
    ["Set a 25-minute timer", "timer.set", { minutes: 25 }],
    ["Start a 45-minute study timer", "timer.set", { minutes: 45, label: "Study" }],
    ["set a timer for 1 hour 30 minutes", "timer.set", { minutes: 90 }],
    ["Open Bluetooth settings.", "bluetooth.settings", {}],
    ["Find a route to the library", "nav.route", { destination: "the library" }],
    ["Open https://example.com/notes", "web.open", { url: "https://example.com/notes" }],
    ["visit www.wikipedia.org", "web.open", { url: "https://www.wikipedia.org" }],
    ["Let me select my chemistry PDF", "file.pick", { mime: "application/pdf", hint: "chemistry" }],
    ["Share https://example.com/study-plan", "share.text", { text: "https://example.com/study-plan" }],
    ["Add a task to revise chapter 4", "task.add", { title: "Revise chapter 4" }],
    ["Remind me to submit the lab report at 6 pm", "reminder.schedule", { text: "Submit the lab report" }],
  ];
  for(const [text, cap, args] of cases){
    await T(`"${text}" → ${cap}`, async () => {
      const p = env.X.createPlan(text, { now: NOW });
      assert.strictEqual(p.status, "draft", `${p.status} ${JSON.stringify(p.error)}`);
      const v = await env.X.validatePlan(p); assert.strictEqual(v.valid, true, JSON.stringify(v.errors)); assert.strictEqual(p.status, "ready");
      assert.strictEqual(p.steps.length, 1); assert.strictEqual(p.steps[0].capability, cap);
      for(const [k, v] of Object.entries(args)) assert.strictEqual(p.steps[0].args[k], v, k + " = " + p.steps[0].args[k]);
    });
  }
  await T("calendar: 'tomorrow at 5 PM' → 12 Nov 2026 17:00 local, editor-only capability", () => {
    const p = env.X.createPlan("Create a calendar event for tomorrow at 5 PM", { now: NOW });
    assert.strictEqual(p.steps[0].capability, "calendar.insert");
    const d = new Date(p.steps[0].args.start); eq([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()], [2026, 10, 12, 17, 0]);
    assert.strictEqual(p.steps[0].verification.ceiling, "attempted");
  });
  await T("reminder: 'in 20 minutes' → now+20m", () => {
    const p = env.X.createPlan("Remind me in 20 minutes to stretch", { now: NOW });
    assert.strictEqual(new Date(p.steps[0].args.at).getTime(), NOW.getTime() + 20 * 60000); assert.strictEqual(p.steps[0].args.text, "Stretch");
  });
  await T("plan carries the contract fields", () => {
    const p = env.X.createPlan("Share https://example.com", { now: NOW });
    ["id", "request", "outcome", "steps", "risk", "confirmation", "requiredCapabilities", "requiredPermissions", "status", "error", "results", "intent"].forEach(k => assert.ok(k in p, "plan." + k));
    const s = p.steps[0]; ["id", "title", "capability", "args", "dependsOn", "risk", "confirmation", "requires", "status", "verification", "error", "undo"].forEach(k => assert.ok(k in s, "step." + k));
    assert.strictEqual(p.request.text, "Share https://example.com"); assert.ok(p.id && p.id.length > 4);
    assert.strictEqual(p.risk, "medium"); assert.strictEqual(p.confirmation.required, true); assert.strictEqual(s.verification.method, "none");
  });
}

G("3. Multi-step requests and dependency ordering");
{
  const env = makeDabsy();
  await T("'then' creates a dependency, 'and' does not", () => {
    const a = env.X.createPlan("Open YouTube and then set a 10 minute timer", { now: NOW });
    eq(stepsOf(a), ["app.launch", "timer.set"]); eq(a.steps[1].dependsOn, ["s1"]);
    const b = env.X.createPlan("Set a 25 minute timer and open Study Space", { now: NOW });
    eq(stepsOf(b), ["timer.set", "app.launch"]); eq(b.steps[1].dependsOn, []);
  });
  await T("three clauses: parallel then sequential", () => {
    const p = env.X.createPlan("Open YouTube, set a 15 minute timer, then open my calendar", { now: NOW });
    eq(stepsOf(p), ["app.launch", "timer.set", "app.launch"]);
    eq(p.steps.map(s => s.dependsOn), [[], [], ["s2"]]);
  });
  await T("'and' inside a single request is not split (no verb after it)", () => {
    const p = env.X.createPlan("Find a route to the library and the cafe", { now: NOW });
    assert.strictEqual(p.steps.length, 1); assert.strictEqual(p.steps[0].args.destination, "the library and the cafe");
  });
  await T("question sentence + command sentence: only the command runs", () => {
    const p = env.X.createPlan("Is it late? Open YouTube.", { now: NOW });
    eq(stepsOf(p), ["app.launch"]);
  });
  await T("a leading question frame governs every clause", () => assert.strictEqual(env.X.createPlan("Should I open YouTube and set a timer for 10 minutes?", { now: NOW }).status, "not_actionable"));
  await T("run order follows dependencies even when steps are listed out of order", async () => {
    const e = makeDabsy(); android(e); const log = [];
    ["app.launch", "timer.set"].forEach(n => e.C.attachAdapter(n, adapter(log, n)));
    const plan = e.X.createPlan({ origin: "ui", request: "x", steps: [
      { id: "b", capability: "timer.set", args: { minutes: 5 }, dependsOn: ["a"], title: "timer" }, { id: "a", capability: "app.launch", args: { app: "youtube" }, title: "open" }] });
    const r = await e.X.run(plan); eq(log, ["app.launch", "timer.set"]); assert.strictEqual(r.status, "completed");
  });
  await T("cycles, unknown dependencies, duplicate ids and unknown capabilities are rejected", async () => {
    const mk = steps => env.X.createPlan({ origin: "ui", request: "x", steps });
    const base = { capability: "app.launch", args: { app: "youtube" } };
    for(const [label, steps, code] of [
      ["cycle", [Object.assign({ id: "a", dependsOn: ["b"] }, base), Object.assign({ id: "b", dependsOn: ["a"] }, base)], "dependency_cycle"],
      ["unknown dep", [Object.assign({ id: "a", dependsOn: ["zz"] }, base)], "unknown_dependency"],
      ["self", [Object.assign({ id: "a", dependsOn: ["a"] }, base)], "self_dependency"],
      ["dup", [Object.assign({ id: "a" }, base), Object.assign({ id: "a" }, base)], "duplicate_step_id"],
      ["unknown cap", [{ id: "a", capability: "shell.exec", args: { cmd: "rm -rf /" } }], "unknown_capability"],
      ["no steps", [], "no_steps"],
    ]){
      const v = await env.X.validatePlan(mk(steps)); assert.strictEqual(v.valid, false, label); assert.ok(v.errors.some(e => e.code === code), label + " → " + JSON.stringify(v.errors.map(e => e.code)));
    }
  });
  await T("step references ($ref) resolve from an earlier result and only from ancestors", async () => {
    const e = makeDabsy(); android(e); const seen = [];
    e.C.attachAdapter("file.pick", { execute: async () => ({ ok: true, result: { uri: "content://docs/chem.pdf" } }), verify: async () => ({ state: "verified", evidence: "uri returned" }) });
    e.C.attachAdapter("share.text", { execute: async (a) => { seen.push(a.text); return { ok: true, handedOff: true }; } });
    const plan = e.X.createPlan({ origin: "ui", request: "x", steps: [
      { id: "p", capability: "file.pick", args: { mime: "application/pdf" } }, { id: "s", capability: "share.text", args: { text: { $ref: "p.result.uri" } }, dependsOn: ["p"] }] });
    const r = await e.X.run(plan, { confirmed: ["s"] }); eq(seen, ["content://docs/chem.pdf"]); assert.strictEqual(r.status, "completed");
    const bad = e.X.createPlan({ origin: "ui", request: "x", steps: [{ id: "p", capability: "file.pick", args: {} }, { id: "s", capability: "share.text", args: { text: { $ref: "p.result.uri" } } }] });
    assert.ok((await e.X.validatePlan(bad)).errors.some(x => x.code === "bad_reference"));
  });
}

G("4. Ambiguous requests are asked about, never guessed");
{
  const env = makeDabsy(); const calls = spyAll(env);
  const AMB = [["set a timer", "How long should the timer be?"], ["Open it", "Which app should I open?"], ["open this website", "Which website should I open?"],
    ["Share this", "What text or link should I share?"], ["Create a calendar event", "What day and time should the event be?"], ["Remind me at 6 pm", "What should I remind you about?"],
    ["Remind me to call the dentist", "When should I remind you?"], ["Open Bluetooth", "Do you want me to open Bluetooth settings?"], ["Navigate to it", "Where do you want to go?"]];
  for(const [text, q] of AMB){
    await T(`"${text}" → asks: ${q}`, async () => {
      const p = env.X.createPlan(text, { now: NOW });
      assert.strictEqual(p.status, "not_actionable"); assert.strictEqual(p.steps.length, 0); assert.ok(p.clarification && p.clarification.question.startsWith(q.slice(0, 20)), JSON.stringify(p.clarification));
    });
  }
  await T("one ambiguous clause holds back the whole multi-step plan", async () => {
    const p = env.X.createPlan("Open YouTube and set a timer", { now: NOW }); assert.strictEqual(p.status, "not_actionable"); assert.strictEqual(p.steps.length, 0);
    await env.X.run(p); assert.strictEqual(calls.length, 0);
  });
  await T("an unrecognised command is reported as unsupported, not mapped to something else", () => {
    const p = env.X.createPlan("Make me a sandwich", { now: NOW }); assert.strictEqual(p.status, "not_actionable"); assert.strictEqual(p.error.code, "no_capability");
    assert.strictEqual(env.X.createPlan("Start studying chemistry", { now: NOW }).error.code, "no_capability");
  });
}

G("5. Capability registry — registered is not available");
{
  const env = makeDabsy(), C = env.C;
  await T("in a web page every Android capability is 'unsupported'; only the in-app one is available", async () => {
    const all = await C.statusAll();
    ["app.launch", "web.open", "nav.route", "timer.set", "calendar.insert", "reminder.schedule", "file.pick", "share.text", "bluetooth.settings"].forEach(n => assert.strictEqual(all[n].state, "unsupported", n));
    assert.strictEqual(all["task.add"].state, "available");
  });
  await T("inside the Android app but with NO adapter attached → 'unavailable' (registered ≠ available)", async () => {
    C.setEnvironment({ platform: "android", native: true });
    assert.strictEqual((await C.status("timer.set")).state, "unavailable");
  });
  await T("adapter present, probe says not now → temporarily_unavailable", async () => {
    C.attachAdapter("timer.set", { execute: async () => ({ ok: true }), probe: () => ({ temporary: true, reason: "Clock app is updating" }) });
    const s = await C.status("timer.set"); assert.strictEqual(s.state, "temporarily_unavailable"); assert.match(s.reason, /updating/);
  });
  await T("probe says device can't → unsupported", async () => {
    C.attachAdapter("nav.route", { execute: async () => ({ ok: true }), probe: () => ({ supported: false, reason: "No maps app" }) });
    assert.strictEqual((await C.status("nav.route")).state, "unsupported");
  });
  await T("missing permission → permission_required; granted → available; unknown permission never assumed granted", async () => {
    let perm = "prompt";
    C.setPermissionProvider("notifications", { status: async () => perm });
    C.attachAdapter("reminder.schedule", { execute: async () => ({ ok: true }) });
    let s = await C.status("reminder.schedule"); assert.strictEqual(s.state, "permission_required"); assert.strictEqual(s.missing[0].name, "notifications");
    perm = "granted"; assert.strictEqual((await C.status("reminder.schedule")).state, "available");
    assert.strictEqual(await C.permissionState("some_unknown_permission"), "prompt");
  });
  await T("policy-forbidden capabilities stay unsupported even with an adapter, and offer alternatives", async () => {
    const s = await C.status("bluetooth.toggle"); assert.strictEqual(s.state, "unsupported"); eq(s.alternatives, ["bluetooth.settings"]);
    assert.strictEqual((await C.status("message.send")).state, "unsupported"); assert.strictEqual((await C.status("not.a.thing")).state, "unsupported");
  });
  await T("registration enforces the verification contract", () => {
    assert.throws(() => C.register({ name: "x.one", args: {} }), /verification/);
    assert.throws(() => C.register({ name: "x.two", args: {}, verification: { method: "none" } }), /ceiling/);
    assert.throws(() => C.register({ name: "x.three", args: {}, verification: { method: "none", ceiling: "verified" } }), /ceiling/);
    assert.throws(() => C.register({ name: "app.launch", args: {}, verification: { method: "none", ceiling: "executed" } }), /already/);
    C.register({ name: "x.ok", args: {}, verification: { method: "readback" } });
  });
  await T("every built-in capability declares name, description, platform, permissions, verification and undo", () => {
    C.list().forEach(c => { assert.ok(c.name && c.description !== undefined && c.platform && Array.isArray(c.permissions) && c.verification && c.verification.method && c.undo && "supported" in c.undo, c.name); });
  });
  await T("argument validation: strict allowlist, bounds, safe URLs only", () => {
    const v = (cap, a) => C.validateArgs(C.get(cap).args, a);
    assert.strictEqual(v("web.open", { url: "javascript:alert(1)" }).ok, false); assert.strictEqual(v("web.open", { url: "file:///sdcard/x" }).ok, false);
    assert.strictEqual(v("web.open", { url: "intent://x#Intent;end" }).ok, false); assert.strictEqual(v("web.open", { url: "https://ok.example" }).ok, true);
    assert.strictEqual(v("timer.set", { minutes: 0 }).ok, false); assert.strictEqual(v("timer.set", { minutes: 5000 }).ok, false); assert.strictEqual(v("timer.set", { minutes: "ten" }).ok, false);
    assert.strictEqual(v("timer.set", { minutes: 5, shell: "rm -rf" }).ok, false); assert.strictEqual(v("app.launch", {}).ok, false);
  });
}

G("6. Execution — verification contract (requested / attempted / executed / verified / failed / cancelled)");
{
  await T("adapter ok + readback matches → VERIFIED; plan completed; report says confirmed", async () => {
    const env = makeDabsy(); const p = env.X.createPlan("Add a task to revise chapter 4", { now: NOW });
    assert.strictEqual(p.steps[0].status, "requested");
    const r = await env.X.run(p); const s = r.plan.steps[0];
    assert.strictEqual(s.status, "verified"); assert.strictEqual(r.status, "completed"); assert.strictEqual(r.report.confirmedAll, true); assert.match(r.report.headline, /confirmed/);
    assert.strictEqual(env.D.tasks.list().length, 1);
  });
  await T("adapter ok but readback finds nothing → FAILED (never reported as success)", async () => {
    const env = makeDabsy(); env.C.attachAdapter("task.add", { execute: async () => ({ ok: true, result: { taskId: "ghost" } }), verify: async () => ({ state: "failed", evidence: "not found" }) });
    const r = await env.X.run(env.X.createPlan("Add a task to revise chapter 4"));
    assert.strictEqual(r.plan.steps[0].status, "failed"); assert.strictEqual(r.plan.steps[0].error.code, "verification_failed"); assert.strictEqual(r.plan.steps[0].error.uncertain, true); assert.strictEqual(r.ok, false);
  });
  await T("verification inconclusive → stays EXECUTED, never upgraded; headline says it can't confirm", async () => {
    const env = makeDabsy(); env.C.attachAdapter("task.add", { execute: async () => ({ ok: true, result: { taskId: "t1" } }), verify: async () => ({ state: "inconclusive", evidence: "store busy" }) });
    const r = await env.X.run(env.X.createPlan("Add a task to revise chapter 4"));
    assert.strictEqual(r.plan.steps[0].status, "executed"); assert.strictEqual(r.plan.steps[0].verification.state, "inconclusive"); assert.match(r.report.headline, /couldn't confirm/i); assert.strictEqual(r.report.confirmedAll, false);
  });
  await T("adapter with no verifier on a verifiable capability → executed/inconclusive, not verified", async () => {
    const env = makeDabsy(); env.C.attachAdapter("task.add", { execute: async () => ({ ok: true, result: { taskId: "t1" } }) });
    assert.strictEqual((await env.X.run(env.X.createPlan("Add a task to revise chapter 4"))).plan.steps[0].status, "executed");
  });
  await T("adapter lying (claims verified:true) is ignored: unobservable capabilities stop at 'executed'", async () => {
    const env = makeDabsy(); android(env); env.C.attachAdapter("timer.set", { execute: async () => ({ ok: true, verified: true, status: "verified" }) });
    const r = await env.X.run(env.X.createPlan("Set a 25 minute timer", { now: NOW }));
    assert.strictEqual(r.plan.steps[0].status, "executed"); assert.strictEqual(r.plan.steps[0].verification.state, "unverifiable"); assert.match(r.report.lines[0].text, /doesn't let me confirm/);
  });
  await T("calendar hand-off stops at 'attempted' and is never described as saved/created", async () => {
    const env = makeDabsy(); android(env); env.C.attachAdapter("calendar.insert", { execute: async () => ({ ok: true }) });
    const r = await env.X.run(env.X.createPlan("Create a calendar event for tomorrow at 5 PM", { now: NOW }));
    assert.strictEqual(r.plan.steps[0].status, "attempted"); assert.strictEqual(r.status, "completed");
    const text = r.report.headline + " " + r.report.lines.map(l => l.text).join(" ");
    assert.doesNotMatch(text, /saved|created|added|scheduled/i); assert.match(text, /up to you/i);
  });
  await T("a hand-off dependency (attempted at ceiling) lets the next step proceed; an unconfirmed verifiable one does not", async () => {
    const env = makeDabsy(); android(env); const log = [];
    env.C.attachAdapter("calendar.insert", adapter(log, "cal")); env.C.attachAdapter("app.launch", adapter(log, "app"));
    const r = await env.X.run(env.X.createPlan("Create a calendar event for tomorrow at 5 PM and then open my calendar", { now: NOW })); eq(log, ["cal", "app"]);
    const e2 = makeDabsy(); e2.C.attachAdapter("task.add", { execute: async () => ({ ok: true, result: { taskId: "t" } }), verify: async () => ({ state: "inconclusive" }) });
    const p = e2.X.createPlan("Add a task to revise chapter 4 and then add a task to read chapter 5");
    const r2 = await e2.X.run(p); assert.strictEqual(p.steps[1].status, "skipped"); assert.strictEqual(p.steps[1].error.code, "dependency_unverified"); assert.strictEqual(r2.status, "partial");
  });
  await T("step lifecycle is observable on the bus: attempted → executed → verified", async () => {
    const env = makeDabsy(); await env.X.run(env.X.createPlan("Add a task to revise chapter 4"));
    const seq = env.events.filter(e => e.n === "execution:step").map(e => e.d.status); eq(seq, ["attempted", "executed", "verified"]);
  });
}

G("7. Missing capabilities and permissions");
{
  await T("capability missing in this environment: plan is well-formed but NOT executable; run blocks, adapter never called", async () => {
    const env = makeDabsy(); const p = env.X.createPlan("Set a 25 minute timer", { now: NOW });
    const v = await env.X.validatePlan(p); assert.strictEqual(v.valid, true); assert.strictEqual(v.executable, false); assert.strictEqual(v.issues[0].code, "capability_unsupported");
    const r = await env.X.run(p); assert.strictEqual(r.plan.steps[0].status, "blocked"); assert.strictEqual(r.status, "failed"); assert.match(r.report.lines[0].text, /Android app/);
  });
  await T("'Turn on Bluetooth' is reported unsupported with the honest alternative; Bluetooth settings is NOT opened instead", async () => {
    const env = makeDabsy(); const calls = spyAll(env);
    const p = env.X.createPlan("Turn on Bluetooth", { now: NOW }); eq(stepsOf(p), ["bluetooth.toggle"]);
    const r = await env.X.run(p); assert.strictEqual(r.plan.steps[0].status, "blocked"); assert.strictEqual(r.plan.steps[0].error.code, "capability_unsupported"); eq(r.plan.steps[0].error.alternatives, ["bluetooth.settings"]); assert.strictEqual(calls.length, 0);
  });
  await T("'Send a message to Mom' is refused by policy, never silently routed to the share sheet", async () => {
    const env = makeDabsy(); const calls = spyAll(env); const r = await env.X.run(env.X.createPlan("Send a message to Mom saying I'm late"));
    assert.strictEqual(r.plan.steps[0].capability, "message.send"); assert.strictEqual(r.plan.steps[0].status, "blocked"); assert.strictEqual(calls.length, 0); assert.match(r.report.lines[0].text, /never send/i);
  });
  await T("permission: not requested at plan time or validation; requested just-in-time at run, once; granted → runs", async () => {
    const env = makeDabsy(); android(env); const log = []; let perm = "prompt", asked = 0;
    env.C.setPermissionProvider("notifications", { status: async () => perm, request: async (o) => { asked++; log.push("ask:" + o.reason); perm = "granted"; return { granted: true, state: "granted" }; } });
    env.C.attachAdapter("reminder.schedule", { execute: async () => { log.push("exec"); return { ok: true, result: { id: "r1" } }; }, verify: async () => ({ state: "verified", evidence: "pending reminder r1 found" }) });
    const p = env.X.createPlan("Remind me to submit the lab report at 6 pm", { now: NOW }); const v = await env.X.validatePlan(p);
    assert.strictEqual(asked, 0); assert.strictEqual(v.resolvable, true); assert.strictEqual(v.executable, false); assert.strictEqual(v.issues[0].state, "permission_required");
    const r = await env.X.run(p); assert.strictEqual(asked, 1); assert.strictEqual(log[1], "exec"); assert.match(log[0], /^ask:I need this to remind you/); assert.strictEqual(r.plan.steps[0].status, "verified");
  });
  await T("permission denied → step BLOCKED (permission_required), adapter never called, honest report", async () => {
    const env = makeDabsy(); android(env); let called = 0;
    env.C.setPermissionProvider("notifications", { status: async () => "denied", request: async () => ({ granted: false, state: "denied" }) });
    env.C.attachAdapter("reminder.schedule", { execute: async () => { called++; return { ok: true }; } });
    const r = await env.X.run(env.X.createPlan("Remind me to submit the lab report at 6 pm", { now: NOW }));
    assert.strictEqual(called, 0); assert.strictEqual(r.plan.steps[0].status, "blocked"); assert.strictEqual(r.plan.steps[0].error.code, "permission_required"); assert.strictEqual(r.status, "failed");
  });
  await T("requestPermissions:false never prompts", async () => {
    const env = makeDabsy(); android(env); let asked = 0;
    env.C.setPermissionProvider("notifications", { status: async () => "prompt", request: async () => { asked++; return { granted: true }; } });
    env.C.attachAdapter("reminder.schedule", { execute: async () => ({ ok: true }) });
    await env.X.run(env.X.createPlan("Remind me to submit the lab report at 6 pm", { now: NOW }), { requestPermissions: false }); assert.strictEqual(asked, 0);
  });
  await T("confirmation comes BEFORE the permission prompt (no permission asked for something the user then declines)", async () => {
    const env = makeDabsy(); android(env); const log = [];
    env.C.register({ name: "test.sensitive", description: "t", platform: "android", permissions: ["testperm"], risk: "high", args: {}, verification: { method: "none", ceiling: "executed" }, triggers: [/sensitive/i] });
    env.C.setPermissionProvider("testperm", { status: async () => "prompt", request: async () => { log.push("perm"); return { granted: false }; } });
    env.C.attachAdapter("test.sensitive", { execute: async () => ({ ok: true }) });
    const plan = env.X.createPlan({ origin: "ui", request: "x", steps: [{ capability: "test.sensitive", args: {} }] });
    assert.strictEqual(plan.steps[0].confirmation.required, true);
    await env.X.run(plan, { confirm: async () => { log.push("confirm"); return false; } }); eq(log, ["confirm"]);
  });
}

G("8. Confirmation");
{
  await T("a medium-risk hand-off (share) waits for confirmation; nothing runs; plan = awaiting_confirmation", async () => {
    const env = makeDabsy(); android(env); const log = []; env.C.attachAdapter("share.text", adapter(log, "share"));
    const p = env.X.createPlan("Share https://example.com/study-plan"); const r = await env.X.run(p);
    assert.strictEqual(r.status, "awaiting_confirmation"); assert.strictEqual(p.steps[0].status, "awaiting_confirmation"); assert.strictEqual(log.length, 0);
    assert.strictEqual(r.plan.confirmation.required, true);
    const r2 = await env.X.run(p, { confirmed: ["s1"] }); eq(log, ["share"]); assert.strictEqual(r2.plan.steps[0].status, "attempted"); assert.strictEqual(r2.status, "completed");
  });
  await T("callback approves → runs; callback declines → step cancelled (user_declined), plan cancelled, adapter untouched", async () => {
    const env = makeDabsy(); android(env); const log = []; env.C.attachAdapter("share.text", adapter(log, "share"));
    let req = null; const yes = await env.X.run(env.X.createPlan("Share https://a.example"), { confirm: async r => { req = r; return true; } });
    assert.strictEqual(yes.plan.steps[0].status, "attempted"); assert.strictEqual(req.capability, "share.text"); assert.strictEqual(req.risk, "medium");
    log.length = 0; const no = await env.X.run(env.X.createPlan("Share https://b.example"), { confirm: async () => false });
    assert.strictEqual(no.plan.steps[0].status, "cancelled"); assert.strictEqual(no.plan.steps[0].error.code, "user_declined"); assert.strictEqual(no.status, "cancelled"); assert.strictEqual(log.length, 0);
  });
  await T("confirmation is per step: low-risk steps in the same plan are not held back", async () => {
    const env = makeDabsy(); android(env); const log = []; ["app.launch", "share.text"].forEach(n => env.C.attachAdapter(n, adapter(log, n)));
    const p = env.X.createPlan("Open YouTube and share https://a.example"); const r = await env.X.run(p);
    eq(log, ["app.launch"]); assert.strictEqual(r.status, "awaiting_confirmation");
  });
  await T("a high-risk step always asks, even if its capability said confirm:'never'", async () => {
    const env = makeDabsy(); env.C.register({ name: "test.danger", description: "t", platform: "any", risk: "high", confirm: "never", args: {}, verification: { method: "none", ceiling: "executed" } });
    const p = env.X.createPlan({ origin: "ui", request: "x", steps: [{ capability: "test.danger" }] }); assert.strictEqual(p.steps[0].confirmation.required, true);
  });
  await T("unknown/forged risk is treated as HIGH", async () => { const A = makeDabsy().A; assert.strictEqual(A.riskRank("whatever"), A.RISK.high); });
}

G("9. Failed steps and partial completion");
{
  await T("failure skips dependents, runs independents, keeps partial results; plan = partial", async () => {
    const env = makeDabsy(); android(env); const log = [];
    env.C.attachAdapter("app.launch", { execute: async () => { log.push("app"); return { ok: false, code: "not_installed", error: "YouTube isn't installed" }; } });
    env.C.attachAdapter("timer.set", { execute: async () => { log.push("timer"); return { ok: true, result: { seconds: 600 } }; } });
    env.C.attachAdapter("bluetooth.settings", { execute: async () => { log.push("bt"); return { ok: true, handedOff: true }; } });
    const p = env.X.createPlan({ origin: "ui", request: "x", steps: [
      { id: "a", capability: "app.launch", args: { app: "youtube" }, title: "Open YouTube" },
      { id: "b", capability: "timer.set", args: { minutes: 10 }, dependsOn: ["a"], title: "Timer" },
      { id: "c", capability: "bluetooth.settings", args: {}, title: "BT settings" }] });
    const r = await env.X.run(p);
    eq(log, ["app", "bt"]); assert.strictEqual(p.steps[0].status, "failed"); assert.strictEqual(p.steps[0].error.code, "not_installed");
    assert.strictEqual(p.steps[1].status, "skipped"); assert.strictEqual(p.steps[1].error.code, "dependency_failed"); assert.strictEqual(p.steps[2].status, "attempted");
    assert.strictEqual(r.status, "partial"); assert.strictEqual(r.ok, false); assert.match(r.report.headline, /part/i); assert.strictEqual(r.report.counts.failed, 1); assert.strictEqual(r.report.counts.skipped, 1);
    assert.match(r.report.lines[0].text, /isn't installed/);
  });
  await T("successful steps keep their results when a later step fails (results map + history persisted)", async () => {
    const env = makeDabsy(); android(env);
    env.C.attachAdapter("file.pick", { execute: async () => ({ ok: true, result: { uri: "content://d/1" } }), verify: async () => ({ state: "verified", evidence: "uri" }) });
    env.C.attachAdapter("nav.route", { execute: async () => ({ ok: false, error: "No maps app" }) });
    const p = env.X.createPlan({ origin: "ui", request: "pick then route", steps: [{ id: "a", capability: "file.pick", args: {} }, { id: "b", capability: "nav.route", args: { destination: "library" }, dependsOn: ["a"] }] });
    const r = await env.X.run(p); eq(p.results.a, { uri: "content://d/1" }); assert.strictEqual(r.status, "partial");
    const h = env.X.history(); assert.strictEqual(h.length, 1); assert.strictEqual(h[0].status, "partial"); eq(h[0].steps.map(s => s.status), ["verified", "failed"]);
  });
  await T("onFailure:'stop' skips everything after the first failure", async () => {
    const env = makeDabsy(); android(env); const log = [];
    env.C.attachAdapter("app.launch", { execute: async () => { log.push("a"); return { ok: false, error: "nope" }; } }); env.C.attachAdapter("bluetooth.settings", adapter(log, "bt"));
    const p = env.X.createPlan({ origin: "ui", request: "x", onFailure: "stop", steps: [{ id: "a", capability: "app.launch", args: { app: "x" } }, { id: "b", capability: "bluetooth.settings", args: {} }] });
    const r = await env.X.run(p); eq(log, ["a"]); assert.strictEqual(p.steps[1].error.code, "stopped_after_failure"); assert.strictEqual(r.status, "failed");
  });
  await T("adapter exception → failed (uncertain), not a crash; engine keeps going with independents", async () => {
    const env = makeDabsy(); android(env); const log = [];
    env.C.attachAdapter("app.launch", { execute: async () => { throw new Error("SecurityException"); } }); env.C.attachAdapter("bluetooth.settings", adapter(log, "bt"));
    const p = env.X.createPlan({ origin: "ui", request: "x", steps: [{ capability: "app.launch", args: { app: "x" } }, { capability: "bluetooth.settings", args: {} }] });
    const r = await env.X.run(p); assert.strictEqual(p.steps[0].error.code, "adapter_exception"); assert.strictEqual(p.steps[0].error.uncertain, true); eq(log, ["bt"]); assert.strictEqual(r.status, "partial");
  });
  await T("a step that hangs times out as failed/uncertain", async () => {
    const env = makeDabsy(); android(env); env.C.attachAdapter("app.launch", { execute: () => new Promise(() => {}) });
    const r = await env.X.run(env.X.createPlan("Open YouTube"), { stepTimeoutMs: 40 }); assert.strictEqual(r.plan.steps[0].error.code, "timeout"); assert.strictEqual(r.plan.steps[0].error.uncertain, true);
  });
  await T("invalid arguments at run time (bad URL) block the step before any adapter call", async () => {
    const env = makeDabsy(); android(env); let called = 0; env.C.attachAdapter("web.open", { execute: async () => { called++; return { ok: true }; } });
    const p = env.X.createPlan({ origin: "ui", request: "x", steps: [{ capability: "web.open", args: { url: "javascript:alert(1)" } }] });
    const r = await env.X.run(p); assert.strictEqual(called, 0); assert.strictEqual(r.status, "invalid"); assert.ok(r.validation.errors.some(e => e.code === "invalid_argument"));
  });
}

G("10. Cancellation");
{
  await T("cancel before run: nothing executes, plan cancelled immediately", async () => {
    const env = makeDabsy(); android(env); const log = []; env.C.attachAdapter("app.launch", adapter(log, "a"));
    const p = env.X.createPlan("Open YouTube"); const c = env.X.cancel(p); assert.strictEqual(c.ok, true); assert.strictEqual(c.effective, "immediate"); assert.strictEqual(p.status, "cancelled");
    const r = await env.X.run(p); assert.strictEqual(r.ok, false); assert.strictEqual(log.length, 0);
  });
  await T("cancel mid-run: current step keeps its REAL outcome, later steps are cancelled, partial results preserved", async () => {
    const env = makeDabsy(); android(env); const log = []; let release;
    const gate = new Promise(r => { release = r; });
    env.C.attachAdapter("app.launch", { execute: async () => { log.push("a-start"); await gate; log.push("a-end"); return { ok: true, result: { pkg: "yt" } }; } });
    env.C.attachAdapter("timer.set", adapter(log, "timer")); env.C.attachAdapter("bluetooth.settings", adapter(log, "bt"));
    const p = env.X.createPlan({ origin: "ui", request: "x", steps: [{ id: "a", capability: "app.launch", args: { app: "youtube" } }, { id: "b", capability: "timer.set", args: { minutes: 5 }, dependsOn: ["a"] }, { id: "c", capability: "bluetooth.settings", args: {} }] });
    const running = env.X.run(p); await sleep(20);
    assert.strictEqual(p.status, "running"); const c = env.X.cancel(p, "user"); assert.strictEqual(c.effective, "after_current_step"); release();
    const r = await running;
    eq(log, ["a-start", "a-end"]); assert.strictEqual(p.steps[0].status, "executed"); assert.strictEqual(p.steps[1].status, "cancelled"); assert.strictEqual(p.steps[2].status, "cancelled");
    assert.strictEqual(r.status, "cancelled"); assert.strictEqual(p.partial, true); eq(p.results.a, { pkg: "yt" }); assert.match(r.report.headline, /Some of it had already happened/);
  });
  await T("cancel while waiting on a confirmation dialog: step cancelled, run resolves, adapter untouched", async () => {
    const env = makeDabsy(); android(env); const log = []; env.C.attachAdapter("share.text", adapter(log, "share"));
    const p = env.X.createPlan("Share https://a.example"); const running = env.X.run(p, { confirm: () => new Promise(() => {}) }); await sleep(20);
    env.X.cancel(p); const r = await running; assert.strictEqual(r.status, "cancelled"); assert.strictEqual(p.steps[0].status, "cancelled"); assert.strictEqual(log.length, 0); assert.strictEqual(p.partial, false);
  });
  await T("cancelling a finished plan, an unknown plan, or a refused plan is reported honestly", async () => {
    const env = makeDabsy(); const r = await env.X.run(env.X.createPlan("Add a task to revise chapter 4"));
    assert.strictEqual(env.X.cancel(r.plan).ok, false); assert.strictEqual(env.X.cancel("nope").code, "unknown_plan"); assert.strictEqual(env.X.cancel(env.X.createPlan("What time is it?")).ok, false);
  });
  await T("running the same plan twice at once is refused; running a finished plan again is refused", async () => {
    const env = makeDabsy(); android(env); let release; const gate = new Promise(r => { release = r; });
    env.C.attachAdapter("app.launch", { execute: async () => { await gate; return { ok: true }; } });
    const p = env.X.createPlan("Open YouTube"); const first = env.X.run(p); await sleep(10);
    assert.strictEqual((await env.X.run(p)).code, "already_running"); release(); await first; assert.strictEqual((await env.X.run(p)).code, "already_finished");
  });
}

G("11. AI cannot bypass the gate");
{
  const env = makeDabsy(); const calls = spyAll(env);
  await T("an AI-proposed plan for a QUESTION is refused, steps discarded", async () => {
    const p = env.X.createPlan({ origin: "ai", request: "Should I turn on Bluetooth?", steps: [{ capability: "bluetooth.settings", args: {} }] });
    assert.strictEqual(p.status, "not_actionable"); assert.strictEqual(p.steps.length, 0); assert.strictEqual(p.error.code, "request_not_a_command");
    const r = await env.X.run(p); assert.strictEqual(r.ok, false);
  });
  await T("an AI plan with an action the user never asked for is INVALID (no inferred permission for unrelated actions)", async () => {
    const p = env.X.createPlan({ origin: "ai", request: "Open YouTube", steps: [{ id: "a", capability: "app.launch", args: { app: "youtube" } }, { id: "b", capability: "share.text", args: { text: "my contacts" } }] });
    const v = await env.X.validatePlan(p); assert.strictEqual(v.valid, false); assert.ok(v.errors.some(e => e.code === "unrelated_action" && e.stepId === "b"));
    const r = await env.X.run(p); assert.strictEqual(r.ok, false); assert.strictEqual(calls.length, 0);
  });
  await T("an AI plan that matches the user's own words is accepted (and still subject to every later check)", async () => {
    const p = env.X.createPlan({ origin: "ai", request: "Open YouTube", steps: [{ capability: "app.launch", args: { app: "youtube" } }] }); assert.strictEqual(p.status, "draft"); assert.strictEqual((await env.X.validatePlan(p)).valid, true); assert.strictEqual(p.status, "ready");
  });
  await T("a plan object forged outside createPlan is re-gated, not trusted", async () => {
    const forged = { id: "p_forged", version: 1, origin: "text", request: { text: "What's the weather?" }, status: "ready", steps: [{ id: "s1", capability: "app.launch", args: { app: "youtube" }, dependsOn: [], status: "requested" }] };
    const r = await env.X.run(forged); assert.strictEqual(r.ok, false); assert.strictEqual(calls.length, 0);
  });
  await T("unlisted capability names (shell, intents, filesystem) cannot be invoked at all", async () => {
    for(const cap of ["shell.exec", "intent.raw", "fs.read", "system.settings.write"]){
      const p = env.X.createPlan({ origin: "ui", request: "x", steps: [{ capability: cap, args: {} }] }); const r = await env.X.run(p); assert.strictEqual(r.ok, false, cap); assert.strictEqual(p.status, "invalid");
    }
    assert.strictEqual(calls.length, 0);
  });
  await T("undo: a reversible verified step can be undone through its adapter", async () => {
    const e = makeDabsy(); const r = await e.X.run(e.X.createPlan("Add a task to revise chapter 4")); assert.strictEqual(e.D.tasks.list().length, 1);
    const u = await e.X.undo(r.plan); assert.strictEqual(u.ok, true); assert.strictEqual(e.D.tasks.list().length, 0);
    assert.strictEqual((await e.X.undo(r.plan)).nothingToUndo, true);
  });
}

/* =================================================================== REPORT */
const failed = results.filter(r => !r.ok), passed = results.length - failed.length;
const groups = [...new Set(results.map(r => r.group))];
let md = `# DABSy v11.3 — Step 1 test report (Action Intelligence Foundation)\n\n`;
md += `Run: \`node tests/exec/run-tests.js\` · ${new Date().toISOString()} · Node ${process.version}\n\n`;
md += `**${passed} / ${results.length} passed${failed.length ? ", " + failed.length + " FAILED" : ""}**\n\n| Group | Passed | Total |\n|---|---|---|\n`;
groups.forEach(g => { const rs = results.filter(r => r.group === g); md += `| ${g} | ${rs.filter(r => r.ok).length} | ${rs.length} |\n`; });
md += `\n`;
groups.forEach(g => { md += `## ${g}\n\n`; results.filter(r => r.group === g).forEach(r => { md += `- ${r.ok ? "PASS" : "**FAIL**"} — ${r.name}${r.ok ? "" : "\n  - " + r.error}\n`; }); md += `\n`; });
fs.writeFileSync(path.join(__dirname, "TEST_REPORT.md"), md);
results.forEach(r => { if(!r.ok) console.log("FAIL [" + r.group.split(" ")[0] + "] " + r.name + "\n     " + r.error); });
console.log(`\n${passed}/${results.length} passed` + (failed.length ? `, ${failed.length} FAILED` : ""));
process.exit(failed.length ? 1 : 0);
})();
