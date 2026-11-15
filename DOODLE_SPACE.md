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

## What needs a vision-capable AI (and what does not)
* **Needs it:** *Ask DABSy* (Fun) and *Read / Check* (Maths: reading handwriting). Only the chosen drawing/region is sent, only when you tap.
* **Does not:** drawing, saving, pages, page breaks, and in Maths: *Solve*, *Hint*, verification, typed-in expressions, the working checker (once a reading is confirmed or typed).
* **The deployed `dabsy-brain` Worker takes `{message}` only**, so by default `ai.imageInMessage` is `false` and DABSy says plainly: "I can't look at pictures through the current setup yet." Without a vision-capable service, Maths still works via the **type-it** fallback in the confirmation card.

### Turning vision on (you must do this part; it is untested here)
1. Extend your Worker to accept `{ message, image: { mimeType, data } }` (base64, no data-URL prefix) and forward the image to a vision model. Sketch for Gemini (adapt to your Worker):
```js
const { message, image } = await request.json();
const parts = [{ text: message }];
if (image && image.data) parts.push({ inline_data: { mime_type: image.mimeType || "image/jpeg", data: image.data } });
// POST { contents: [{ role: "user", parts }] } to your Gemini generateContent URL, return { reply: <text> }
```
2. In `dabsy-config.js` set `ai.imageInMessage: true`. Prompts tell the model to answer `NO_IMAGE` if it cannot see a picture; DABSy then reports that instead of inventing a reading.
3. If you use the original `backend/worker.js` (`mode: "proxy"`), images already go through `/v1/generate`.

## Safety rules implemented
* A reading is **always shown**; if confidence < 0.85, the model flags doubt, a visually-confusable pattern is detected (x/×, 1/l, 0/O, √ reach, 1/2x), or you are checking working, you must confirm or edit it first. Nothing is solved from an unconfirmed reading.
* The tutor (`D.ai.study`) is told the locally verified result and not to change it. If a result can't be verified exactly it is marked approximate.
* Unsupported (said in the UI, not faked): integrals/derivatives/limits (shown and explained, not computed), several-unknown solving, inequalities with unknowns, systems.
