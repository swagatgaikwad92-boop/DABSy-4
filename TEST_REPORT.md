# DABSy v11.3 — Step 1 test report (Action Intelligence Foundation)

Run: `node tests/exec/run-tests.js` · 2026-11-11T06:47:49.694Z · Node v22.23.4

**112 / 112 passed**

| Group | Passed | Total |
|---|---|---|
| 1. Intent safety — questions, chat, suggestions, intentions must never become actions | 26 | 26 |
| 1b. Intent safety — polite / question-shaped commands are ASKED, not assumed | 4 | 4 |
| 2. Simple single-action requests → the right capability and arguments | 17 | 17 |
| 3. Multi-step requests and dependency ordering | 8 | 8 |
| 4. Ambiguous requests are asked about, never guessed | 11 | 11 |
| 5. Capability registry — registered is not available | 9 | 9 |
| 6. Execution — verification contract (requested / attempted / executed / verified / failed / cancelled) | 8 | 8 |
| 7. Missing capabilities and permissions | 7 | 7 |
| 8. Confirmation | 5 | 5 |
| 9. Failed steps and partial completion | 6 | 6 |
| 10. Cancellation | 5 | 5 |
| 11. AI cannot bypass the gate | 6 | 6 |

## 1. Intent safety — questions, chat, suggestions, intentions must never become actions

- PASS — "Should I turn on Bluetooth?" → question, no plan, nothing runs
- PASS — "What time is it?" → question, no plan, nothing runs
- PASS — "How do I set a timer?" → question, no plan, nothing runs
- PASS — "Is YouTube open?" → question, no plan, nothing runs
- PASS — "Do I need to open the calendar?" → question, no plan, nothing runs
- PASS — "Why is Bluetooth off?" → question, no plan, nothing runs
- PASS — "Should I turn on Bluetooth and open YouTube?" → question, no plan, nothing runs
- PASS — "Can you explain photosynthesis?" → question, no plan, nothing runs
- PASS — "Which app should I open for notes?" → question, no plan, nothing runs
- PASS — "Thanks DABSy" → chat, no plan, nothing runs
- PASS — "Good morning" → chat, no plan, nothing runs
- PASS — "I opened YouTube earlier" → chat, no plan, nothing runs
- PASS — "That timer was great" → chat, no plan, nothing runs
- PASS — "Don't open YouTube" → chat, no plan, nothing runs
- PASS — "Do not set a timer" → chat, no plan, nothing runs
- PASS — "Maybe we could open YouTube" → suggestion, no plan, nothing runs
- PASS — "How about a 25 minute timer" → suggestion, no plan, nothing runs
- PASS — "Let's open the calendar" → suggestion, no plan, nothing runs
- PASS — "You should open my notes" → suggestion, no plan, nothing runs
- PASS — "I want to set a 25 minute timer" → intention, no plan, nothing runs
- PASS — "I'm going to open YouTube later" → intention, no plan, nothing runs
- PASS — "I need to share this link" → intention, no plan, nothing runs
- PASS — "When I get home, open YouTube" → intention, no plan, nothing runs
- PASS — "If it's raining, open the map" → intention, no plan, nothing runs
- PASS — with an adapter attached to EVERY capability, zero adapter calls across all non-command texts
- PASS — 'Should I turn on Bluetooth?' never touches Bluetooth settings or toggle

## 1b. Intent safety — polite / question-shaped commands are ASKED, not assumed

- PASS — 'Can you open YouTube?' → ambiguous + clarification, runs nothing
- PASS — 'Open YouTube?' (question mark) → ambiguous
- PASS — after the user says yes (userApproved) the same request becomes a real plan
- PASS — userApproved does NOT rescue a plain question

## 2. Simple single-action requests → the right capability and arguments

- PASS — "DABSy, open YouTube." → app.launch
- PASS — "Open Study Space" → app.launch
- PASS — "open my calendar" → app.launch
- PASS — "Set a 25-minute timer" → timer.set
- PASS — "Start a 45-minute study timer" → timer.set
- PASS — "set a timer for 1 hour 30 minutes" → timer.set
- PASS — "Open Bluetooth settings." → bluetooth.settings
- PASS — "Find a route to the library" → nav.route
- PASS — "Open https://example.com/notes" → web.open
- PASS — "visit www.wikipedia.org" → web.open
- PASS — "Let me select my chemistry PDF" → file.pick
- PASS — "Share https://example.com/study-plan" → share.text
- PASS — "Add a task to revise chapter 4" → task.add
- PASS — "Remind me to submit the lab report at 6 pm" → reminder.schedule
- PASS — calendar: 'tomorrow at 5 PM' → 12 Nov 2026 17:00 local, editor-only capability
- PASS — reminder: 'in 20 minutes' → now+20m
- PASS — plan carries the contract fields

## 3. Multi-step requests and dependency ordering

- PASS — 'then' creates a dependency, 'and' does not
- PASS — three clauses: parallel then sequential
- PASS — 'and' inside a single request is not split (no verb after it)
- PASS — question sentence + command sentence: only the command runs
- PASS — a leading question frame governs every clause
- PASS — run order follows dependencies even when steps are listed out of order
- PASS — cycles, unknown dependencies, duplicate ids and unknown capabilities are rejected
- PASS — step references ($ref) resolve from an earlier result and only from ancestors

## 4. Ambiguous requests are asked about, never guessed

- PASS — "set a timer" → asks: How long should the timer be?
- PASS — "Open it" → asks: Which app should I open?
- PASS — "open this website" → asks: Which website should I open?
- PASS — "Share this" → asks: What text or link should I share?
- PASS — "Create a calendar event" → asks: What day and time should the event be?
- PASS — "Remind me at 6 pm" → asks: What should I remind you about?
- PASS — "Remind me to call the dentist" → asks: When should I remind you?
- PASS — "Open Bluetooth" → asks: Do you want me to open Bluetooth settings?
- PASS — "Navigate to it" → asks: Where do you want to go?
- PASS — one ambiguous clause holds back the whole multi-step plan
- PASS — an unrecognised command is reported as unsupported, not mapped to something else

## 5. Capability registry — registered is not available

- PASS — in a web page every Android capability is 'unsupported'; only the in-app one is available
- PASS — inside the Android app but with NO adapter attached → 'unavailable' (registered ≠ available)
- PASS — adapter present, probe says not now → temporarily_unavailable
- PASS — probe says device can't → unsupported
- PASS — missing permission → permission_required; granted → available; unknown permission never assumed granted
- PASS — policy-forbidden capabilities stay unsupported even with an adapter, and offer alternatives
- PASS — registration enforces the verification contract
- PASS — every built-in capability declares name, description, platform, permissions, verification and undo
- PASS — argument validation: strict allowlist, bounds, safe URLs only

## 6. Execution — verification contract (requested / attempted / executed / verified / failed / cancelled)

- PASS — adapter ok + readback matches → VERIFIED; plan completed; report says confirmed
- PASS — adapter ok but readback finds nothing → FAILED (never reported as success)
- PASS — verification inconclusive → stays EXECUTED, never upgraded; headline says it can't confirm
- PASS — adapter with no verifier on a verifiable capability → executed/inconclusive, not verified
- PASS — adapter lying (claims verified:true) is ignored: unobservable capabilities stop at 'executed'
- PASS — calendar hand-off stops at 'attempted' and is never described as saved/created
- PASS — a hand-off dependency (attempted at ceiling) lets the next step proceed; an unconfirmed verifiable one does not
- PASS — step lifecycle is observable on the bus: attempted → executed → verified

## 7. Missing capabilities and permissions

- PASS — capability missing in this environment: plan is well-formed but NOT executable; run blocks, adapter never called
- PASS — 'Turn on Bluetooth' is reported unsupported with the honest alternative; Bluetooth settings is NOT opened instead
- PASS — 'Send a message to Mom' is refused by policy, never silently routed to the share sheet
- PASS — permission: not requested at plan time or validation; requested just-in-time at run, once; granted → runs
- PASS — permission denied → step BLOCKED (permission_required), adapter never called, honest report
- PASS — requestPermissions:false never prompts
- PASS — confirmation comes BEFORE the permission prompt (no permission asked for something the user then declines)

## 8. Confirmation

- PASS — a medium-risk hand-off (share) waits for confirmation; nothing runs; plan = awaiting_confirmation
- PASS — callback approves → runs; callback declines → step cancelled (user_declined), plan cancelled, adapter untouched
- PASS — confirmation is per step: low-risk steps in the same plan are not held back
- PASS — a high-risk step always asks, even if its capability said confirm:'never'
- PASS — unknown/forged risk is treated as HIGH

## 9. Failed steps and partial completion

- PASS — failure skips dependents, runs independents, keeps partial results; plan = partial
- PASS — successful steps keep their results when a later step fails (results map + history persisted)
- PASS — onFailure:'stop' skips everything after the first failure
- PASS — adapter exception → failed (uncertain), not a crash; engine keeps going with independents
- PASS — a step that hangs times out as failed/uncertain
- PASS — invalid arguments at run time (bad URL) block the step before any adapter call

## 10. Cancellation

- PASS — cancel before run: nothing executes, plan cancelled immediately
- PASS — cancel mid-run: current step keeps its REAL outcome, later steps are cancelled, partial results preserved
- PASS — cancel while waiting on a confirmation dialog: step cancelled, run resolves, adapter untouched
- PASS — cancelling a finished plan, an unknown plan, or a refused plan is reported honestly
- PASS — running the same plan twice at once is refused; running a finished plan again is refused

## 11. AI cannot bypass the gate

- PASS — an AI-proposed plan for a QUESTION is refused, steps discarded
- PASS — an AI plan with an action the user never asked for is INVALID (no inferred permission for unrelated actions)
- PASS — an AI plan that matches the user's own words is accepted (and still subject to every later check)
- PASS — a plan object forged outside createPlan is re-gated, not trusted
- PASS — unlisted capability names (shell, intents, filesystem) cannot be invoked at all
- PASS — undo: a reversible verified step can be undone through its adapter

