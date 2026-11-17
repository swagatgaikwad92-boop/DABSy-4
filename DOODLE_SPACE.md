# Doodle Space (v12.1.0)

Open: double-tap DABSy -> app bubbles -> **Doodle Space**. Modes: **Fun** and **Maths** (separate notebooks, saved in IndexedDB on the device).

## Files (all new; loaded only when the bubble is tapped, via `DABSy.require("doodle")`)
| File | Role |
|---|---|
| `doodle-math.js` | Local maths engine: parser, exact arithmetic (rationals + one square-root term), polynomial solve (exact to degree 2, numeric to 4), substitution verification, step-by-step, hints, working checker. No network. |
| `doodle-store.js` | IndexedDB persistence (one record per page, vector strokes), in-memory fallback, honest "not saved" status. |
| `doodle-canvas.js` | Page/canvas engine: Pointer Events, pinch/pan zoom, undo/redo, region picker, export. |
| `doodle-space.js` | UI and flows (modes, pages, toolbars, Ask DABSy, Read/Check/Hint/Solve). |
| `doodle.css` | Styles (Morning Paper / Midnight Study, existing glass tokens). |

## Vision (v12.1.2)
Pictures are only read by a **vision service you connect** (see `backend/VISION_SETUP.md`). DABSy proves it works with a generated test picture (random colour + digit) before it says it can see, and tells you exactly why if it can't. Drawing, saving, pages, customisation, and on-device maths (Solve, Hint, working checker, typed input) never need it.

## Customisation (v12.1.2)
* **Pen:** 5 presets (Fine liner, Normal pen, Thick marker, Pencil, Highlighter), colour + custom colour, thickness, opacity, smoothing (stabilisation), live preview. Tap the active Pen, or "Pen settings".
* **Eraser:** Small/Medium/Large + custom size; "Rub out" or "Whole stroke"; Clear page; Undo/Redo. Tap the active Eraser.
* **Pages:** 9 papers + custom colour (plain, warm, dark, cream notebook, light/dark grid, ruled, dotted, graph); sizes: standard, larger, extended-maths (2x tall), long (3x tall); rename, duplicate, reorder, delete with confirmation. Per page, or "apply to every page".
* Everything is remembered: pen and eraser per notebook (Fun and Maths separately), paper/size/name per page, in this device's storage.
* No infinite canvas: pages are bounded so phones stay smooth. Use a taller page or more pages.

## Safety rules implemented
* A reading is **always shown**; if confidence < 0.85, the model flags doubt, a visually-confusable pattern is detected (x/×, 1/l, 0/O, √ reach, 1/2x), or you are checking working, you must confirm or edit it first. Nothing is solved from an unconfirmed reading.
* The tutor (`D.ai.study`) is told the locally verified result and not to change it. If a result can't be verified exactly it is marked approximate.
* Unsupported (said in the UI, not faked): integrals/derivatives/limits (shown and explained, not computed), several-unknown solving, inequalities with unknowns, systems.
