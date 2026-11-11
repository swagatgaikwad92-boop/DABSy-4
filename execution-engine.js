/* ============================================================
   D.A.B.S.y — execution-engine.js : the execution orchestrator (v11.3, step 1)

     DABSy.execution.createPlan(textOrSpec, opts) -> ActionPlan   (never throws; may be "not_actionable")
     DABSy.execution.validatePlan(plan, opts)     -> { valid, executable, resolvable, errors, issues, confirmations }
     DABSy.execution.run(plan|id, opts)           -> { ok, status, plan, report }
     DABSy.execution.cancel(plan|id, reason)      -> { ok, effective, plan }
     DABSy.execution.undo(plan|id, stepId?)       -> { ok, results }
     DABSy.execution.report(plan)                 -> { headline, lines[], counts }
     DABSy.execution.get(id) / list() / history()

   The AI decides WHAT (it may propose a plan). This module decides WHETHER it
   is allowed and in what order; the capability's adapter decides HOW; the
   verification step decides whether it actually HAPPENED.

   Per step, in this order:
     dependencies satisfied? -> capability available (fresh check)? -> arguments valid? ->
     user confirmation (if the risk or the capability demands it) ->
     just-in-time permission request -> adapter.execute -> adapter.verify.
   A step reaches "verified" only through verify(). An adapter returning ok is "executed" at best,
   and a hand-off to the OS (calendar editor, share sheet) is "attempted" and stays there.

   No Android execution is wired in this step: native capabilities report honestly as
   unsupported/unavailable until the native bridge attaches adapters.
   ============================================================ */
(function(){
  const D = window.DABSy = window.DABSy || {};
  const A = D.actions, C = D.capabilities, I = D.intentSafety;
  const PS = A.PLAN_STATUS, SS = A.STEP_STATUS;
  const HISTORY_KEY = "exec_history_v1";
  const MAX_STEPS = 12, MAX_PLANS = 60;
  const CANCEL = { cancelled: true };
  const plans = new Map();
  const runs = new Map();

  const emit = (n, d) => { try{ if(D.bus) D.bus.emit(n, d); }catch(e){} };
  const now = () => Date.now();
  const FINISHED = new Set([PS.completed, PS.partial, PS.failed, PS.cancelled]);
  const REFUSED = new Set([PS.not_actionable, PS.invalid]);
  const stepById = (plan, id) => plan.steps.find(s => s.id === id) || null;
  const err = (code, message, extra) => Object.assign({ code, message, at: now() }, extra || {});
  const getPath = (o, path) => path.split(".").reduce((a, k) => (a != null && typeof a === "object" ? a[k] : undefined), o);

  /* ---------------- risk & confirmation policy ---------------- */
  function needsConfirmation(cap, risk){
    if(!cap) return true;
    if(cap.confirm === "always") return true;
    if(A.riskRank(risk) >= A.RISK.high) return true;                        // a high-risk step always asks, whatever the capability says
    return cap.confirm === "auto" && A.riskRank(risk) >= A.RISK.medium;
  }
  // Fill everything derived from the capability. Re-run whenever steps change.
  function enrich(plan){
    const reasons = [], perms = new Set(), capsNeeded = new Set(), risks = [];
    plan.steps.forEach(step => {
      const cap = C.get(step.capability);
      capsNeeded.add(step.capability);
      if(!cap){ step.risk = "high"; step.verification.method = null; step.verification.ceiling = null; risks.push("high"); return; }
      let risk = cap.risk;
      if(cap.escalate){ try{ const r = cap.escalate(step.args); if(r && A.riskRank(r) > A.riskRank(risk)) risk = r; }catch(e){ risk = "high"; } }
      step.risk = risk; risks.push(risk);
      step.requires = { capabilities: [cap.name], permissions: cap.permissions.slice() };
      cap.permissions.forEach(p => perms.add(p));
      step.verification.method = cap.verification.method;
      step.verification.ceiling = cap.verification.ceiling;
      step.verification.required = true;                                      // every executable action has a verification story; "none" states its ceiling
      step.undo.supported = cap.undo.supported;
      if(step.confirmation.state !== "granted"){
        const need = needsConfirmation(cap, risk);
        step.confirmation.required = need;
        step.confirmation.reason = need ? (cap.confirm === "always" ? "This hands content to another app, so I need your OK first: " : "This is a " + risk + "-risk action, so I need your OK first: ") + step.title : "";
        if(need) reasons.push(step.confirmation.reason);
      }
    });
    plan.requiredCapabilities = Array.from(capsNeeded); plan.requiredPermissions = Array.from(perms);
    plan.risk = A.maxRisk(risks.length ? risks : ["safe"]);
    plan.confirmation.required = plan.steps.some(s => s.confirmation.required && s.confirmation.state !== "granted");
    plan.confirmation.reasons = reasons;
  }

  const summarizeVerdict = v => ({ kind: v.kind, actionable: v.actionable, reasons: v.reasons.slice(0, 6), sentences: v.sentences });
  function remember(plan){
    plans.set(plan.id, plan);
    if(plans.size > MAX_PLANS){ for(const [id, p] of plans){ if(!runs.has(id) && (FINISHED.has(p.status) || REFUSED.has(p.status))){ plans.delete(id); if(plans.size <= MAX_PLANS) break; } } }
    return plan;
  }
  function refuse(plan, status, code, message){ plan.status = status; plan.error = err(code, message); plan.steps = status === PS.invalid ? plan.steps : []; plan.updatedAt = now(); return plan; }

  /* ---------------- createPlan ---------------- */
  function createPlan(input, opts){
    opts = opts || {};
    try{
      if(typeof input === "string") return remember(fromText(input, opts));
      if(input && typeof input === "object") return remember(fromSpec(input, opts));
      return remember(refuse(A.newPlan({ request: "" }), PS.not_actionable, "empty_request", "Nothing was asked."));
    }catch(e){
      return remember(refuse(A.newPlan({ request: String(input && input.request || input || "") }), PS.invalid, "plan_error", "I couldn't turn that into a plan."));
    }
  }

  function fromText(text, opts){
    const verdict = I.interpret(text, { now: opts.now });
    const plan = A.newPlan({ origin: "text", request: { text }, intent: summarizeVerdict(verdict) });
    plan.intent.userApproved = !!opts.userApproved;

    // A polite/question-shaped command ("Can you open YouTube?") only runs after the user says yes
    let clauses = verdict.clauses.filter(c => c.capability);
    let unhandled = verdict.unhandled;
    const cand = verdict.clarification && verdict.clarification.candidate;
    if(opts.userApproved && verdict.kind === "ambiguous" && cand && cand.capability && !(cand.missing && cand.missing.length) && /polite_request|question_mark/.test(verdict.clarification.reason || "")){
      clauses = [{ capability: cand.capability, args: cand.args, title: verdict.clarification.question.replace(/^Do you want me to /, "").replace(/\?$/, ""), connector: "start" }];
      unhandled = []; plan.intent.actionable = true;
    } else if(!verdict.actionable){
      plan.status = PS.not_actionable;
      plan.clarification = verdict.clarification;
      const code = verdict.kind === "ambiguous" ? "needs_clarification" : verdict.kind === "command" ? "no_capability" : "not_a_command";
      plan.error = err(code, verdict.clarification ? verdict.clarification.question : verdict.kind === "command" ? "I don't have a way to do that yet." : "That wasn't a request for me to do something (" + verdict.kind + ").");
      plan.unhandled = unhandled;
      return plan;
    }
    let prev = null;
    clauses.forEach((c, i) => {
      const id = "s" + (i + 1);
      plan.steps.push(A.newStep({ id, title: c.title, capability: c.capability, args: c.args, dependsOn: c.connector === "sequence" && prev ? [prev] : [],
        alternatives: (C.get(c.capability) && C.get(c.capability).alternatives) || [] }, i));
      prev = id;
    });
    plan.outcome = plan.steps.map(s => s.title).join("; ");
    plan.unhandled = unhandled;
    plan.status = PS.draft;
    enrich(plan);
    return plan;
  }

  // Plans proposed by the AI (or any code): the user's OWN words must still authorise them.
  function fromSpec(spec, opts){
    const origin = spec.origin === "ui" ? "ui" : (spec.origin === "text" ? "text" : "ai");
    const plan = A.newPlan(Object.assign({}, spec, { origin, id: undefined, status: PS.draft }));
    if(plan.steps.length > MAX_STEPS) return refuse(plan, PS.invalid, "too_many_steps", "That plan has too many steps.");
    if(origin !== "ui"){
      const verdict = I.interpret(plan.request.text);
      plan.intent = Object.assign(summarizeVerdict(verdict), { userApproved: !!opts.userApproved });
      const ok = verdict.actionable || (opts.userApproved && plan.request.text);
      if(!ok){ plan.clarification = verdict.clarification; const p = refuse(plan, PS.not_actionable, "request_not_a_command", "The user's request wasn't an instruction to do this (" + verdict.kind + "), so none of the proposed steps may run."); p.proposed = spec.steps; return p; }
    } else plan.intent = { kind: "ui", actionable: true, userApproved: true, reasons: ["Triggered by an explicit user gesture."] };
    enrich(plan);
    return plan;
  }

  /* ---------------- validatePlan ---------------- */
  function hasCycle(plan){
    const indeg = {}, adj = {};
    plan.steps.forEach(s => { indeg[s.id] = 0; adj[s.id] = []; });
    plan.steps.forEach(s => s.dependsOn.forEach(d => { if(adj[d]){ adj[d].push(s.id); indeg[s.id]++; } }));
    const q = Object.keys(indeg).filter(k => indeg[k] === 0); let n = 0;
    while(q.length){ const k = q.shift(); n++; adj[k].forEach(x => { if(--indeg[x] === 0) q.push(x); }); }
    return n !== plan.steps.length;
  }
  function ancestors(plan, step, acc){ acc = acc || new Set(); step.dependsOn.forEach(d => { if(!acc.has(d)){ acc.add(d); const s = stepById(plan, d); if(s) ancestors(plan, s, acc); } }); return acc; }

  function lookup(ref){
    if(!ref) return null;
    if(typeof ref === "string") return plans.get(ref) || null;
    if(ref.id && plans.get(ref.id) === ref) return ref;
    return null;
  }

  async function validatePlan(ref, opts){
    opts = opts || {};
    let plan = lookup(ref);
    if(!plan){ plan = (ref && typeof ref === "object") ? createPlan(ref, opts) : null; }       // anything not created here goes through the same gates
    if(!plan) return { valid: false, executable: false, resolvable: false, errors: [err("unknown_plan", "No such plan.")], issues: [], confirmations: [], plan: null };
    const errors = [], issues = [], confirmations = [];
    if(REFUSED.has(plan.status)){
      return { valid: false, executable: false, resolvable: false, errors: [plan.error || err(plan.status, "This plan can't run.")], issues, confirmations, plan };
    }
    if(!plan.steps.length) errors.push(err("no_steps", "The plan has no steps."));
    if(plan.steps.length > MAX_STEPS) errors.push(err("too_many_steps", "Too many steps."));
    const ids = new Set();
    plan.steps.forEach(s => {
      if(!A.ID_RE.test(s.id)) errors.push(err("bad_step_id", "Invalid step id.", { stepId: s.id }));
      if(ids.has(s.id)) errors.push(err("duplicate_step_id", "Duplicate step id '" + s.id + "'.", { stepId: s.id })); ids.add(s.id);
    });
    if(!errors.length){
      plan.steps.forEach(s => s.dependsOn.forEach(d => {
        if(d === s.id) errors.push(err("self_dependency", "A step can't depend on itself.", { stepId: s.id }));
        else if(!ids.has(d)) errors.push(err("unknown_dependency", "'" + s.id + "' depends on missing step '" + d + "'.", { stepId: s.id }));
      }));
      if(!errors.length && hasCycle(plan)) errors.push(err("dependency_cycle", "The steps depend on each other in a loop."));
    }
    // authorisation: the user's own words must justify each action (never infer permission for unrelated actions)
    if(plan.origin !== "ui"){
      if(!(plan.intent && (plan.intent.actionable || plan.intent.userApproved))) errors.push(err("not_authorised", "The user's request doesn't authorise actions."));
      else plan.steps.forEach(s => {
        const cap = C.get(s.capability); if(!cap) return;
        if(C.justified(s.capability, plan.request.text)) return;
        const supportsJustified = cap.supporting && plan.steps.some(o => o.dependsOn.includes(s.id) && C.justified(o.capability, plan.request.text));
        if(!supportsJustified) errors.push(err("unrelated_action", "The request doesn't ask for '" + s.capability + "'.", { stepId: s.id }));
      });
    }
    // per-step: capability exists, arguments valid, references sane
    for(const s of plan.steps){
      const cap = C.get(s.capability);
      if(!cap){ errors.push(err("unknown_capability", "I have no capability called '" + s.capability + "'.", { stepId: s.id })); continue; }
      if(!cap.policyUnsupported){
        const v = C.validateArgs(cap.args, s.args, { allowRefs: true });
        v.errors.forEach(e => errors.push(Object.assign(err(e.code, e.message, { stepId: s.id }), { arg: e.arg })));
        Object.entries(s.args).forEach(([k, val]) => {
          if(!C.isRef(val)) return;
          const m = val.$ref.match(/^(.+?)\.result(?:\.(.+))?$/);
          if(!m || !ancestors(plan, s).has(m[1])) errors.push(err("bad_reference", "'" + k + "' refers to a step it doesn't depend on.", { stepId: s.id }));
        });
      }
    }
    // capability state (fresh). Not an error: the plan is well-formed, it just may not be runnable now.
    const states = {};
    if(!errors.length) for(const s of plan.steps){
      const st = await C.status(s.capability);
      states[s.id] = st.state;
      if(st.state !== C.STATES.available) issues.push({ stepId: s.id, capability: s.capability, code: "capability_" + st.state, state: st.state, reason: st.reason, missing: st.missing || [], alternatives: st.alternatives || [] });
      if(s.confirmation.required && s.confirmation.state !== "granted") confirmations.push({ stepId: s.id, reason: s.confirmation.reason, risk: s.risk });
    }
    const valid = errors.length === 0;
    const executable = valid && issues.length === 0;
    const resolvable = valid && issues.every(i => i.state === C.STATES.permission_required);
    if(!valid && !FINISHED.has(plan.status) && plan.status !== PS.running){ plan.status = PS.invalid; plan.error = errors[0]; }
    else if(valid && plan.status === PS.draft) plan.status = PS.ready;
    plan.updatedAt = now();
    return { valid, executable, resolvable, errors, issues, confirmations, states, plan };
  }

  /* ---------------- run ---------------- */
  const withTimeout = (p, ms) => new Promise((res, rej) => {
    const t = setTimeout(() => rej(Object.assign(new Error("Timed out after " + ms + " ms"), { code: "timeout" })), ms);
    Promise.resolve(p).then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); });
  });

  function mark(plan, step, status, extra){
    step.status = status; if(extra) Object.assign(step, extra);
    if(["failed", "blocked", "skipped", "cancelled", "verified", "executed", "attempted"].includes(status)) step.finishedAt = now();
    plan.updatedAt = now();
    emit("execution:step", { planId: plan.id, stepId: step.id, status, capability: step.capability, error: step.error });
  }
  const fail = (plan, step, code, message, extra) => { step.error = err(code, message, extra); mark(plan, step, SS.failed); };
  const block = (plan, step, code, message, extra) => { step.error = err(code, message, extra); mark(plan, step, SS.blocked); };
  const skip = (plan, step, code, message) => { step.error = err(code, message); mark(plan, step, SS.skipped); };

  function resolveArgs(plan, step){
    const out = {};
    for(const [k, v] of Object.entries(step.args)){
      if(!C.isRef(v)){ out[k] = v; continue; }
      const m = v.$ref.match(/^(.+?)\.result(?:\.(.+))?$/); const src = m && stepById(plan, m[1]);
      if(!src || !A.isSatisfied(src)) return { error: "'" + k + "' needs the result of step '" + (m ? m[1] : "?") + "', which isn't available." };
      const val = m[2] ? getPath(src.result, m[2]) : src.result;
      if(val === undefined || val === null) return { error: "Step '" + src.id + "' didn't produce '" + (m[2] || "result") + "'." };
      out[k] = val;
    }
    return { args: out };
  }

  async function decideConfirmation(plan, step, ctl, opts){
    const ok = opts.confirmed === "all" || (Array.isArray(opts.confirmed) && opts.confirmed.includes(step.id));
    if(ok) return "granted";
    if(typeof opts.confirm !== "function") return "pending";
    step.confirmation.state = "pending"; emit("execution:confirm", { planId: plan.id, stepId: step.id, reason: step.confirmation.reason });
    let r;
    try{ r = await Promise.race([Promise.resolve(opts.confirm({ planId: plan.id, stepId: step.id, capability: step.capability, title: step.title, args: step.args, risk: step.risk, reason: step.confirmation.reason })), ctl.cancelPromise]); }
    catch(e){ return "denied"; }
    if(r === CANCEL) return "cancelled";
    return (r === true || (r && r.approved === true)) ? "granted" : "denied";
  }

  async function runStep(plan, step, ctl, opts, asked){
    const cap = C.get(step.capability);
    // 1. dependencies
    for(const dId of step.dependsOn){
      const dep = stepById(plan, dId);
      if(A.isSatisfied(dep) || (dep.status === SS.executed && step.continueOnUnverified)) continue;
      const unverified = dep.status === SS.executed || dep.status === SS.attempted;
      return skip(plan, step, unverified ? "dependency_unverified" : "dependency_failed", unverified ? "'" + dep.title + "' ran but I couldn't confirm it, so I didn't continue." : "'" + dep.title + "' didn't complete (" + dep.status + "), so I skipped this.");
    }
    // 2. capability state, checked fresh
    let st = await C.status(step.capability);
    if([C.STATES.unsupported, C.STATES.unavailable, C.STATES.temporarily_unavailable].includes(st.state))
      return block(plan, step, "capability_" + st.state, st.reason, { retryable: st.state === C.STATES.temporarily_unavailable, alternatives: st.alternatives || [] });
    // 3. arguments (references resolved from earlier results)
    const r = resolveArgs(plan, step);
    if(r.error) return fail(plan, step, "unresolved_reference", r.error);
    const va = C.validateArgs(cap.args, r.args);
    if(!va.ok) return block(plan, step, "invalid_arguments", va.errors.map(e => e.message).join("; "));
    // 4. confirmation
    if(step.confirmation.required && step.confirmation.state !== "granted"){
      const d = await decideConfirmation(plan, step, ctl, opts);
      if(d === "pending"){ step.confirmation.state = "pending"; return mark(plan, step, SS.awaiting_confirmation); }
      if(d === "denied"){ step.confirmation.state = "denied"; step.error = err("user_declined", "You said no, so I didn't do it."); return mark(plan, step, SS.cancelled); }
      if(d === "cancelled"){ step.error = err("plan_cancelled", "Cancelled before it ran."); return mark(plan, step, SS.cancelled); }
      step.confirmation.state = "granted";
    }
    if(ctl.cancelled){ step.error = err("plan_cancelled", "Cancelled before it ran."); return mark(plan, step, SS.cancelled); }
    // 5. just-in-time permission (only now: explained and requested at the moment it's needed)
    if(st.state === C.STATES.permission_required){
      for(const m of st.missing){
        if(asked.has(m.name)) continue; asked.add(m.name);
        if(opts.requestPermissions === false) break;
        try{ await C.requestPermission(m.name, { reason: opts.permissionReason ? opts.permissionReason(m.name, step) : "I need this to " + step.title.charAt(0).toLowerCase() + step.title.slice(1) + "." }); }catch(e){}
      }
      st = await C.status(step.capability);
      if(st.state !== C.STATES.available) return block(plan, step, "permission_required", st.reason || "A permission is missing.", { missing: st.missing || [] });
    }
    // 6. execute
    const ad = C.adapterOf(step.capability);
    step.resolvedArgs = va.clean; step.attempts++; step.startedAt = now();
    mark(plan, step, SS.attempted);                                   // from here on it's at least "attempted": something may have happened
    let out;
    try{ out = await withTimeout(ad.execute(va.clean, { plan, step, signal: ctl.abort.signal, env: C.env() }), opts.stepTimeoutMs || 15000); }
    catch(e){ return fail(plan, step, e && e.code === "timeout" ? "timeout" : "adapter_exception", (e && e.message) || "The action threw an error.", { uncertain: true }); }
    if(!out || out.ok !== true) return fail(plan, step, (out && out.code) || "adapter_failed", (out && out.error) || "It didn't work.");
    step.result = out.result == null ? {} : out.result; plan.results[step.id] = step.result;
    step.undo.supported = cap.undo.supported && typeof ad.undo === "function";
    // 7. what can honestly be claimed — never above the capability's declared ceiling, never above what the adapter claims
    if(out.handedOff || cap.verification.ceiling === "attempted"){
      step.verification.state = "unverifiable"; step.verification.evidence = cap.verification.description;
      return mark(plan, step, SS.attempted);
    }
    if(cap.verification.method === "none"){
      step.verification.state = "unverifiable"; step.verification.evidence = cap.verification.description;
      return mark(plan, step, SS.executed);
    }
    mark(plan, step, SS.executed);
    let v = null;
    if(typeof ad.verify === "function"){ try{ v = await withTimeout(ad.verify(step, { plan, env: C.env() }), opts.verifyTimeoutMs || 8000); }catch(e){ v = { state: "inconclusive", evidence: "The check itself failed: " + (e && e.message) }; } }
    else v = { state: "inconclusive", evidence: "No verifier is installed for this capability." };
    step.verification.evidence = v && v.evidence || null; step.verification.checkedAt = now();
    if(v && v.state === "verified"){ step.verification.state = "verified"; return mark(plan, step, SS.verified); }
    if(v && v.state === "failed"){ step.verification.state = "failed"; return fail(plan, step, "verification_failed", "It ran, but the result wasn't there when I checked.", { uncertain: true, evidence: v.evidence }); }
    step.verification.state = "inconclusive";                         // stays "executed": we do NOT upgrade on a shrug
    plan.updatedAt = now();
  }

  function nextRunnable(plan, seen){
    for(const s of plan.steps){
      if(seen.has(s.id) || (s.status !== SS.requested && s.status !== SS.awaiting_confirmation)) continue;
      if(s.dependsOn.every(d => A.isSettled(stepById(plan, d)) && stepById(plan, d).status !== SS.awaiting_confirmation)) return s;
    }
    return null;
  }

  function finalize(plan, ctl){
    const open = plan.steps.filter(s => s.status === SS.requested || s.status === SS.awaiting_confirmation);
    if(ctl.cancelled){
      open.forEach(s => { s.error = err("plan_cancelled", "Cancelled before it ran."); mark(plan, s, SS.cancelled); });
      plan.status = PS.cancelled;
    } else if(open.length){
      plan.status = PS.awaiting_confirmation;
    } else {
      const ok = plan.steps.filter(A.isSatisfied).length;
      const progressed = plan.steps.filter(x => x.status === SS.attempted || x.status === SS.executed || x.status === SS.verified).length;   // ran, even if unconfirmed
      const declinedOnly = progressed === 0 && plan.steps.some(x => x.status === SS.cancelled) && !plan.steps.some(x => x.status === SS.failed || x.status === SS.blocked);
      plan.status = ok === plan.steps.length ? PS.completed : progressed > 0 ? PS.partial : declinedOnly ? PS.cancelled : PS.failed;
    }
    if(plan.status !== PS.awaiting_confirmation) plan.finishedAt = now();
    plan.partial = plan.status === PS.partial || (plan.status === PS.cancelled && plan.steps.some(s => ["attempted", "executed", "verified"].includes(s.status)));
    plan.updatedAt = now();
  }

  async function run(ref, opts){
    opts = opts || {};
    let plan = lookup(ref);
    if(!plan && ref && typeof ref === "object") plan = createPlan(ref, opts);
    if(!plan) return { ok: false, status: "unknown_plan", code: "unknown_plan", message: "No such plan.", plan: null };
    if(REFUSED.has(plan.status)) return result(plan, false, plan.error && plan.error.code, plan.error && plan.error.message);
    if(runs.has(plan.id)) return result(plan, false, "already_running", "That plan is already running.");
    if(opts.retryBlocked) plan.steps.forEach(s => { if(s.status === SS.blocked || s.status === SS.skipped){ s.status = SS.requested; s.error = null; s.finishedAt = null; } });
    if(FINISHED.has(plan.status) && !plan.steps.some(s => s.status === SS.requested || s.status === SS.awaiting_confirmation)) return result(plan, false, "already_finished", "That plan already finished.");

    const v = await validatePlan(plan, opts);
    if(!v.valid) return result(plan, false, v.errors[0].code, v.errors[0].message, v);

    const ctl = { cancelled: false, reason: null, abort: new AbortController() };
    ctl.cancelPromise = new Promise(res => { ctl.cancel = () => res(CANCEL); });
    runs.set(plan.id, ctl);
    plan.status = PS.running; plan.startedAt = plan.startedAt || now(); plan.finishedAt = null;
    emit("execution:start", { planId: plan.id });
    const seen = new Set(), asked = new Set();
    try{
      for(;;){
        if(ctl.cancelled) break;
        const step = nextRunnable(plan, seen);
        if(!step) break;
        seen.add(step.id);
        try{ await runStep(plan, step, ctl, opts, asked); }
        catch(e){ fail(plan, step, "engine_error", (e && e.message) || "Unexpected error."); }
        if(plan.onFailure === "stop" && [SS.failed, SS.blocked, SS.cancelled].includes(step.status)){
          plan.steps.forEach(s => { if(s.status === SS.requested || s.status === SS.awaiting_confirmation) skip(plan, s, "stopped_after_failure", "Stopped after '" + step.title + "' didn't complete."); });
          break;
        }
      }
    } finally { runs.delete(plan.id); }
    finalize(plan, ctl);
    persist(plan);
    emit("execution:done", { planId: plan.id, status: plan.status });
    return result(plan, plan.status === PS.completed, null, null);
  }

  function result(plan, ok, code, message, validation){
    return { ok, status: plan.status, code: code || null, message: message || null, plan, report: report(plan), validation: validation || null };
  }

  /* ---------------- cancel / undo ---------------- */
  function cancel(ref, reason){
    const plan = lookup(ref);
    if(!plan) return { ok: false, code: "unknown_plan", effective: null, plan: null };
    if(FINISHED.has(plan.status) || REFUSED.has(plan.status)) return { ok: false, code: "already_finished", effective: null, plan };
    const ctl = runs.get(plan.id);
    if(ctl){
      ctl.cancelled = true; ctl.reason = reason || "user"; try{ ctl.abort.abort(); }catch(e){} ctl.cancel();
      // the step that is executing right now can't be recalled: it keeps its real outcome; everything not yet started is cancelled
      return { ok: true, effective: "after_current_step", plan };
    }
    finalize(plan, { cancelled: true });
    persist(plan); emit("execution:done", { planId: plan.id, status: plan.status });
    return { ok: true, effective: "immediate", plan };
  }

  async function undo(ref, stepId){
    const plan = lookup(ref);
    if(!plan) return { ok: false, code: "unknown_plan", results: [] };
    const targets = (stepId ? [stepById(plan, stepId)] : plan.steps.slice().reverse()).filter(s => s && s.undo.supported && !s.undo.done && (s.status === SS.verified || s.status === SS.executed));
    const results = [];
    for(const s of targets){
      const ad = C.adapterOf(s.capability);
      let r; try{ r = await withTimeout(ad.undo(s, { plan }), 8000); }catch(e){ r = { ok: false, error: e && e.message }; }
      if(r && r.ok){ s.undo.done = true; }
      results.push({ stepId: s.id, ok: !!(r && r.ok), error: r && r.ok ? null : ((r && r.error) || "Couldn't undo it.") });
    }
    plan.updatedAt = now(); persist(plan);
    return { ok: results.length > 0 && results.every(r => r.ok), results, nothingToUndo: results.length === 0 };
  }

  /* ---------------- honest reporting ---------------- */
  function lineFor(s){
    const t = s.title;
    switch(s.status){
      case SS.verified: return { stepId: s.id, status: s.status, text: t + " — done, and I confirmed it" + (s.verification.evidence ? " (" + s.verification.evidence + ")" : "") + "." };
      case SS.attempted: return { stepId: s.id, status: s.status, text: t + " — handed over to Android. I can't see what happens next, so it's up to you to finish it." };
      case SS.executed: return { stepId: s.id, status: s.status, text: s.verification.state === "inconclusive" ? t + " — it ran, but I couldn't confirm the result." : t + " — done, though Android doesn't let me confirm the result." };
      case SS.failed: return { stepId: s.id, status: s.status, text: t + " — didn't work: " + ((s.error && s.error.message) || "unknown error") + (s.error && s.error.uncertain ? " (it may have partly happened)" : "") };
      case SS.blocked: return { stepId: s.id, status: s.status, text: t + " — I couldn't do this: " + ((s.error && s.error.message) || "blocked") };
      case SS.skipped: return { stepId: s.id, status: s.status, text: t + " — skipped. " + ((s.error && s.error.message) || "") };
      case SS.cancelled: return { stepId: s.id, status: s.status, text: t + " — not done (" + ((s.error && s.error.message) || "cancelled") + ")" };
      case SS.awaiting_confirmation: return { stepId: s.id, status: s.status, text: t + " — waiting for your OK." };
      default: return { stepId: s.id, status: s.status, text: t + " — not started." };
    }
  }
  function report(plan){
    const counts = { total: plan.steps.length, verified: 0, handed_off: 0, executed_unconfirmed: 0, failed: 0, blocked: 0, skipped: 0, cancelled: 0, waiting: 0, not_started: 0 };
    plan.steps.forEach(s => {
      if(s.status === SS.verified) counts.verified++;
      else if(s.status === SS.attempted) counts.handed_off++;
      else if(s.status === SS.executed) counts.executed_unconfirmed++;
      else if(s.status === SS.failed) counts.failed++;
      else if(s.status === SS.blocked) counts.blocked++;
      else if(s.status === SS.skipped) counts.skipped++;
      else if(s.status === SS.cancelled) counts.cancelled++;
      else if(s.status === SS.awaiting_confirmation) counts.waiting++;
      else counts.not_started++;
    });
    let headline;
    switch(plan.status){
      case PS.not_actionable: headline = (plan.error && plan.error.message) || "Nothing for me to do."; break;
      case PS.invalid: headline = "I won't run that: " + ((plan.error && plan.error.message) || "it isn't a valid plan") ; break;
      case PS.awaiting_confirmation: headline = "I need your OK before I continue."; break;
      case PS.running: headline = "Working on it."; break;
      case PS.completed: headline = counts.verified === counts.total ? "Done, and I confirmed it." : counts.verified ? "Done as far as Android lets me tell: " + counts.verified + " confirmed, the rest I can't confirm." : counts.handed_off && !counts.executed_unconfirmed ? "I've handed this over to Android. It isn't finished until you finish it." : "Done, but I can't confirm the result."; break;
      case PS.partial: headline = (counts.failed + counts.blocked + counts.skipped + counts.cancelled) ? "Only part of that worked." : "It ran, but I couldn't confirm the result."; break;
      case PS.failed: headline = "That didn't work."; break;
      case PS.cancelled: headline = plan.partial ? "Cancelled. Some of it had already happened; the rest was not done." : "Cancelled. Nothing was done."; break;
      default: headline = "Not started.";
    }
    return { headline, lines: plan.steps.map(lineFor), counts, status: plan.status, confirmedAll: counts.total > 0 && counts.verified === counts.total };
  }

  /* ---------------- history (reuses DABSy.memory; separate key, never the chat history) ---------------- */
  function persist(plan){
    try{
      if(!D.memory || !D.memory.read) return;
      const list = D.memory.read(HISTORY_KEY, []);
      const rec = { id: plan.id, at: now(), request: plan.request.text.slice(0, 200), status: plan.status, steps: plan.steps.map(s => ({ id: s.id, capability: s.capability, status: s.status, code: s.error && s.error.code || null })) };
      const i = list.findIndex(r => r.id === plan.id); if(i >= 0) list[i] = rec; else list.push(rec);
      D.memory.write(HISTORY_KEY, list.slice(-50));
    }catch(e){}
  }

  D.execution = {
    createPlan, validatePlan, run, cancel, undo, report,
    get: id => plans.get(id) || null,
    list: () => Array.from(plans.values()),
    history: () => (D.memory && D.memory.read ? D.memory.read(HISTORY_KEY, []) : []),
    isRunning: id => runs.has(id),
    _reset(){ plans.clear(); runs.clear(); },
  };
})();
