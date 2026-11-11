/* ============================================================
   D.A.B.S.y — action-contract.js : the universal action format (v11.3, step 1)

   One shape for "something DABSy is asked to DO", whether it came from
   typed text, the AI, or a button. Nothing in here executes anything.

   ActionPlan {
     id, version, origin: "text"|"ai"|"ui",
     request     : { text, at }                 the user's ORIGINAL words
     outcome     : what the user is trying to get done (plain sentence)
     status      : see PLAN_STATUS
     risk        : highest step risk
     confirmation: { required, reasons[], }
     requiredCapabilities[], requiredPermissions[]
     intent      : the intent-safety verdict that allowed (or refused) this plan
     steps[]     : ActionStep
     results     : { [stepId]: partial result }   (kept even if the plan fails)
     error, createdAt, updatedAt, startedAt, finishedAt
   }

   ActionStep {
     id, title, capability, args, dependsOn[],
     risk, confirmation: { required, reason, state },
     requires: { capabilities[], permissions[] },
     status      : see STEP_STATUS
     verification: { required, method, ceiling, state, evidence }
     result, error: { code, message, at } | null, undo: { supported, done }
   }

   THE VERIFICATION LADDER (the honesty rule)
     requested -> attempted -> executed -> verified      (or failed / cancelled)
       requested  : planned, nothing has happened
       attempted  : an adapter was invoked / the request was handed to the OS
                    (e.g. the calendar editor opened) — the OUTCOME is unknown
       executed   : the platform API reported it completed, but nothing has
                    read the effect back
       verified   : something independent READ THE EFFECT BACK and it matched
   Each capability declares a CEILING — the highest rung it can honestly
   reach. A hand-off like "open the calendar editor" has ceiling "attempted"
   and can therefore NEVER be reported as saved. Only "verified" means done
   and confirmed. Success is never inferred from "the call returned".
   ============================================================ */
(function(){
  const D = window.DABSy = window.DABSy || {};

  const PLAN_STATUS = Object.freeze({
    not_actionable: "not_actionable",   // the request was a question / chat / suggestion / unclear: nothing to run
    invalid: "invalid",                 // malformed or unsafe plan: refused
    draft: "draft",
    ready: "ready",
    awaiting_confirmation: "awaiting_confirmation",
    running: "running",
    completed: "completed",             // every step reached its honest ceiling (see verification summary for how far)
    partial: "partial",                 // some steps done, some failed / blocked / skipped
    failed: "failed",                   // nothing completed
    cancelled: "cancelled",
  });

  const STEP_STATUS = Object.freeze({
    requested: "requested",
    blocked: "blocked",                 // capability/permission/args problem: not run
    awaiting_confirmation: "awaiting_confirmation",
    attempted: "attempted",
    executed: "executed",
    verified: "verified",
    failed: "failed",
    cancelled: "cancelled",
    skipped: "skipped",                 // a dependency did not complete
  });

  const RISK = Object.freeze({ safe: 0, low: 1, medium: 2, high: 3 });
  const riskRank = r => (r in RISK ? RISK[r] : RISK.high);   // unknown risk is treated as HIGH, never as safe
  const maxRisk = list => list.reduce((m, r) => (riskRank(r) > riskRank(m) ? r : m), "safe");

  const VERIFY_METHOD = Object.freeze({
    readback: "readback",               // read the effect back from the store/OS that should now hold it
    result_callback: "result_callback", // the OS handed a result back (e.g. a picked document URI)
    none: "none",                       // genuinely unobservable; the ceiling is below "verified"
  });
  const LADDER = ["requested", "attempted", "executed", "verified"];
  const rung = s => LADDER.indexOf(s);

  const uid = p => (D.ui && D.ui.uid) ? D.ui.uid(p) : p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  const ID_RE = /^[A-Za-z0-9_.-]{1,64}$/;
  const clip = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, n);

  function newStep(spec, index){
    spec = spec || {};
    return {
      id: spec.id || ("s" + (index + 1)),
      title: clip(spec.title || spec.capability || "Step", 200),
      capability: clip(spec.capability, 80),
      args: spec.args && typeof spec.args === "object" && !Array.isArray(spec.args) ? JSON.parse(JSON.stringify(spec.args)) : {},
      dependsOn: Array.isArray(spec.dependsOn) ? spec.dependsOn.map(String) : [],
      risk: spec.risk || null,                                   // filled from the capability by the engine
      confirmation: { required: false, reason: "", state: "none" },   // none | pending | granted | denied
      requires: { capabilities: spec.capability ? [spec.capability] : [], permissions: [] },
      status: STEP_STATUS.requested,
      attempts: 0,
      verification: { required: true, method: null, ceiling: null, state: "pending", evidence: null },
      result: null,
      error: null,
      undo: { supported: false, done: false },
      alternatives: Array.isArray(spec.alternatives) ? spec.alternatives.slice(0, 3) : [],
      continueOnUnverified: !!spec.continueOnUnverified,
      startedAt: null, finishedAt: null,
    };
  }

  function newPlan(spec){
    spec = spec || {};
    const now = Date.now();
    const text = clip(spec.request && spec.request.text != null ? spec.request.text : spec.request, 2000);
    return {
      id: spec.id || uid("p"),
      version: 1,
      origin: ["text", "ai", "ui"].includes(spec.origin) ? spec.origin : "text",
      request: { text, at: (spec.request && spec.request.at) || now },
      outcome: clip(spec.outcome || "", 300),
      status: spec.status || PLAN_STATUS.draft,
      risk: "safe",
      confirmation: { required: false, reasons: [] },
      requiredCapabilities: [], requiredPermissions: [],
      intent: spec.intent || null,
      onFailure: spec.onFailure === "stop" ? "stop" : "continue_independent",
      steps: (Array.isArray(spec.steps) ? spec.steps : []).map(newStep),
      results: {},
      clarification: spec.clarification || null,
      error: spec.error || null,
      createdAt: now, updatedAt: now, startedAt: null, finishedAt: null,
    };
  }

  const isSettledBad = s => s === "failed" || s === "cancelled" || s === "skipped" || s === "blocked";

  // A step has "reached its ceiling" when it got as far as it honestly can.
  function reachedCeiling(step){
    const c = step.verification && step.verification.ceiling;
    return !!c && step.status === c;
  }
  // A dependency is SATISFIED only by real progress: verified, or at an honest ceiling below "verified"
  // (a hand-off the OS took over). Executed-but-unconfirmed on a verifiable capability is NOT satisfied.
  function isSatisfied(step){
    if(step.status === "verified") return true;
    return reachedCeiling(step) && step.verification.ceiling !== "verified";
  }
  // Settled = no further work will happen on this step in this run.
  function isSettled(step){
    return isSettledBad(step.status) || step.status === "verified" || step.status === "attempted" || step.status === "executed";
  }

  D.actions = { PLAN_STATUS, STEP_STATUS, RISK, riskRank, maxRisk, VERIFY_METHOD, LADDER, rung, ID_RE, newPlan, newStep, isSatisfied, isSettled, reachedCeiling, clip, uid };
})();
