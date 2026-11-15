# DABSy v12.1.0 — Doodle Space + Live Talk fixes
Base: v12.0.0 (untouched original zip). No rewrite; 6 new files + docs/tests, 9 edited files.

## File modification report
New: `doodle-math.js doodle-store.js doodle-canvas.js doodle-space.js doodle.css docs/DOODLE_SPACE.md tests/t_doodle.py tests/t_doodle_maths.py tests/t_doodle_math.js tests/t_livetalk2.py V12_1_REPORT.md`
Edited: `dabsy-config.js` (version, lazy `doodle` module, bubble entry, `ai.imageInMessage`), `ecosystem-engine.js` (opens Doodle from its bubble), `ai-engine.js` (new `vision()`, image-capable `postMessage`), `sw.js` (cache v12.1.0 + new files), `app.js` (no keypad refocus after spoken replies), `voice-engine.js` (live listening mode), `live-talk.js`, `livetalk.css`, `tests/t_livetalk.py`, `tests/t_all.sh`, `CHANGELOG.md`.

## Live Talk (your three points)
1. **DABSy image removed** from the Live Talk card; the real DABSy (eyes + bow tie) stays visible above it; a small voice-bars indicator shows listening/thinking/speaking. (If you meant the opposite — you WANT an image there — tell me and it's a quick change.)
2. **Flow**: listening is now continuous with interim results; it sends only after ~1.7 s of silence, so it no longer starts "thinking" mid-sentence. If the browser ends the session right after you speak, the text heard is still sent. A start watchdog retries if the mic fails to start after DABSy speaks.
3. **Keypad after reply**: cause was `handleUserUtterance` re-focusing the text box after every message. Now it re-focuses only after a *typed* message; spoken / Live Talk replies never raise the keyboard, and starting Live Talk closes the chat dock.

## Testing report (headless Chromium, 390×800 touch-emulated)
Executed: all suites, **all passing** — chatbox 18, study 17, prefs 15, schedule 25, livetalk 18, livetalk2 14 (new), widgets 20, timer 16, fallback 3, sweep 4, doodle 31 (new), doodle-maths 27 (new), engine unit tests 50 (node, new).
* **REAL:** drawing events, canvas painting, undo/redo, eraser, colours/thickness, two-finger zoom, IndexedDB save/restore across reload, delete confirm + undo, page break/snap, near-full chip, storage-failure path (IndexedDB removed), 400×120-point redraw < 400 ms (desktop Chromium), local maths engine, offline behaviour.
* **MOCKED:** speech recognition (Live Talk), `D.ai.vision` (handwriting + doodle interpretation), `D.ai.study` / `generate` (explanations). **No real AI call was made.**
* **NOT tested:** real Android phone/finger/stylus feel, real Android speech-recognition behaviour (continuous mode quirks), any real vision model's reading accuracy, Live Talk on a real device, Live Talk in other browsers.

## Known limitations
* **Vision is not live until you update the Worker** (docs/DOODLE_SPACE.md). Until then Ask DABSy and Read/Check say so; Maths works via typed input.
* Handwriting accuracy depends entirely on the vision model; that's why readings are shown and confirmed.
* Local engine: exact for rationals and one √ term; mixed different radicals fall back to decimals (marked ≈). No calculus, systems, or inequality solving. `e` is a variable, not 2.718…
* "Check my work" tests step equivalence numerically; it can't judge steps like squaring both sides, and says "couldn't check" instead of guessing.
* Undo/redo history is per session (page content itself is saved). Page-break moves whole strokes (never splits one). Android hardware Back closes Doodle Space.
* Live Talk 1.7 s pause is a fixed constant (`SILENCE_MS` in live-talk.js).

## Deployment
Same as before: push the `dabsy/` folder contents to the GitHub Pages repo root. Bumped `CACHE_VERSION` to v12.1.0, so installed copies update on next open (may need one reload). Backend/private config untouched.
