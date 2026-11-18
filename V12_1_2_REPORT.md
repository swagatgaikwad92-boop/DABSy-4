# DABSy v12.1.2 — Doodle Space: Visual Intelligence + Full Customisation
Base: v12.1.0 (v12.0.0 original ZIP untouched; v12.1.0 ZIP kept as a backup).

## 5. Does real visual intelligence work? — **Not confirmed. I could not test it, and I will not claim it.**
The sandbox has no internet and your deployed Worker's source is not in the project, so **no real vision model was ever called**. What is verified and what is not:
* VERIFIED (automated): a drawing is captured, encoded as a valid PNG/JPEG, sent over HTTP to `backend/vision-worker.js` (run unchanged), which forwards the bytes **unchanged** as Gemini `inline_data`; a pixel-reading *stand-in* confirmed the pictures arrived and were decodable. I viewed the received pictures (cat, house+tree, sentence, geometry, vector diagram, maths expressions): all legible.
* NOT VERIFIED: that Google Gemini (or any model) recognises a cat, reads handwriting, or parses your maths. The stand-in reads pixels only.
* **You can run the real end-to-end test in ~10 seconds** once the Worker is deployed: Doodle Space -> ⋯ -> *Vision setup* -> *Connect and test*. It sends a freshly generated picture (random colour + digit) and passes only if the service reads it back correctly; a service that ignores images or makes up answers is caught.

## 4. Exact explanation of the previous vision failure
1. **No vision path existed.** The deployed `dabsy-brain` Worker's contract is `{message} -> {reply}` (text only); nothing in this project shows it forwards images. (Inferred: its source isn't included and I can't reach it.)
2. **The client never tried.** In v12.1, `ai.vision()` in "message" mode returned `no-image` immediately unless `imageInMessage` was true (default false), so no picture left the phone; the UI then showed the message you quoted.
3. **Nothing verified the far end.** Even with the flag on, a Worker that silently drops the picture would answer from text alone; there was no read-back test.
4. **A second bug I found while testing now:** the canvas export drew strokes with a transform that overwrote the crop offset, so any region/cropped image came out clipped/mostly blank. Even a working Worker would have received wrong pictures. **Fixed**, and confirmed by viewing the received images.

## What changed
* **Vision:** new `backend/vision-worker.js` (separate, free, does not touch `dabsy-brain`; key stays in a Cloudflare secret), `ai.vision()` routing (`visionUrl` -> main proxy only if proven -> `/v1/generate`), `ai.checkVision()` probe, in-app *Vision setup* (URL stored only on the device), follow-up questions re-send the picture, honest error reasons. `backend/VISION_SETUP.md` = phone steps.
* **Pen:** panel with 5 presets, colour + custom colour, thickness, opacity, smoothing/stabilisation, live preview; remembered per notebook.
* **Eraser:** Small/Medium/Large, custom size, Rub-out or Whole-stroke, Clear page, Undo/Redo, size ring; remembered.
* **Pages:** 9 papers + custom colour; sizes standard / larger / extended-maths / long; rename, duplicate, reorder, delete-with-confirm (+undo); per-page or "apply to all"; auto ink follows paper darkness; all persisted.
* Maths reading prompt now covers vectors (`\vec`), inequalities, Greek letters; the local engine parses them (vectors are read and shown; vector algebra is **not** computed).

## 2. Files
Added: `backend/vision-worker.js backend/VISION_SETUP.md tests/t_doodle_custom.py tests/t_vision_pipeline.py tests/t_vision_worker.mjs tests/stub_gemini.py tests/vision_e2e_server.mjs tests/drawings.py V12_1_2_REPORT.md`
Modified: `ai-engine.js dabsy-config.js doodle-canvas.js doodle-store.js doodle-space.js doodle-math.js doodle.css sw.js docs/DOODLE_SPACE.md CHANGELOG.md tests/t_doodle.py tests/t_doodle_maths.py tests/t_all.sh`

## 3. Testing report (headless Chromium 390x800, touch-emulated)
**Automated, real (no AI):** chatbox 18, study 17, prefs 15, schedule 25, livetalk 18, livetalk2 14, widgets 20, timer 16, fallback 3, sweep 4, doodle 31, doodle-maths 28, **doodle-custom 41** (pen colour/thickness/opacity/smoothing, eraser sizes+modes, 10 backgrounds, graph paper, page sizes, rename/duplicate/reorder, multi-page, close+reopen persistence), engine unit tests 50 (node). All passed.
**Automated, vision worker code (stubbed Gemini, 13 checks):** exact image-byte preservation, multimodal request shape, model fallback, validation, CORS, key never in URL/body.
**Pipeline test with a PIXEL-FACTS STAND-IN, not a model (16 checks):** default state sends nothing and says why; a lying text-only service is caught; probe passes through browser -> Worker -> provider shape; one picture per Ask for cat / house+tree / sentence / geometry diagram / vector diagram; follow-up re-sends; maths regions sent as PNG for 1+2=, quadratic, fraction, square root.
**Mocked:** speech recognition (Live Talk); recognition JSON for Maths flows (t_doodle_maths); tutor explanations.
**NOT run — need real services:** real Gemini on any drawing/handwriting (cat, house, sentence, geometry, **vector diagram**, **1+2=**, **3x²-2√6x+2=0**, fraction, root).
**NOT run — need a real Android device:** finger/stylus feel, performance on mid-range phones, real speech recognition, PWA install/update.

## 6. Remaining limitations
* Vision is **off until you deploy the Worker and add your Gemini key** (steps below). I cannot do that for you.
* Handwriting accuracy = the model's; every reading is shown and confirmed before maths is computed.
* No infinite canvas (bounded pages keep phones smooth; taller pages and more pages instead). Whole-stroke eraser removes entire strokes. Undo history is per session.
* Local maths: no calculus, systems, inequality solving or vector algebra; mixed radicals fall back to decimals.
* Drawings sent for analysis go to Google via your Worker (free tier limits apply); only when you tap Ask / Read / Check.

## 7. Deploy from your phone
1. **Site:** upload/replace the contents of the `dabsy/` folder in your GitHub Pages repo (GitHub app/web -> Add file -> Upload files), commit. Reopen DABSy twice (cache v12.1.2).
2. **Vision:** follow `backend/VISION_SETUP.md` (Cloudflare dashboard in the phone browser, ~5 minutes), then Doodle Space -> ⋯ -> Vision setup -> paste URL -> Connect and test.
Nothing is deployed automatically.
