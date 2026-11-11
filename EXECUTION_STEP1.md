# DABSy v11.3 — Step 1: Action Intelligence Foundation

New files (all lazy-loaded via `DABSy.require("execution")`, nothing runs at startup):
- `action-contract.js`   → `DABSy.actions`      plan/step format, status ladder, risk
- `capability-registry.js` → `DABSy.capabilities` capability declarations + live availability
- `intent-safety.js`     → `DABSy.intentSafety`  question/chat/suggestion/intention/command/multi_step/ambiguous gate
- `execution-engine.js`  → `DABSy.execution`     createPlan / validatePlan / run / cancel / undo / report

Edits to existing files (3, all additive): `dabsy-config.js` (lazy entry), `ai-engine.js` (exports `parseDayOffset`), `sw.js` (precache + cache v11.2.1).
Reused, not duplicated: `ai` parsers, `permissions` (permission state/requests), `tasks` (task.add adapter + readback), `memory` (history key `exec_history_v1`), `bus`, `ui.uid`.

Tests: `node tests/exec/run-tests.js` (112 tests, writes `tests/exec/TEST_REPORT.md`) and `python3 tests/t15.py` (16 checks in real Chromium; needs a server on :8090).

Known limits (deliberate or honest):
- NOT wired into app.js routing yet; existing chat/butler/planner flows are unchanged.
- No Android adapters exist. Native capabilities report `unsupported` in a browser and `unavailable` in the Android shell until the bridge attaches adapters.
- Intent rules are English-only; other languages fall through to "not actionable" (the safe default).
- `origin:"ui"` plans skip the intent gate (for real tap handlers). It is an in-page convention, not a security boundary; the Android layer must re-validate.
- `calendar.insert` / `share.text` / `bluetooth.settings` are hand-offs: ceiling is "attempted", never "saved/sent".
